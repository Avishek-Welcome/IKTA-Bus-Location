// IKTA Bus — hourly owner data balance job (GitHub Actions: .github/workflows/billing-hourly.yml).
// For each finished UTC hour not done yet (up to 6 back): estimates each owner's Firebase use
// from their buses' live writes (usageCounts) and the admin's factors (Google gives real usage
// figures only to projects with a billing account), prices it, charges the balance and sets
// billingStatus; at Rs 0 the owner's buses are set offline.
// Env: BILLING_SERVICE_ACCOUNT = the service account JSON. DRY_RUN=1 = read and print only.
// No npm packages: the service account signs its own token with Node's crypto.
import { createSign } from 'node:crypto';
import { withDefaults, DEFAULT_SETTINGS, priceHour, estimateUse, applyCharge, hourKey, hourStart, round4 } from './lib.mjs';

const DB = 'https://ikta-bus-default-rtdb.firebaseio.com';
const MAX_HOURS_BACK = 6;
const DRY = process.env.DRY_RUN === '1';

// ---------- Auth: service account → OAuth access token ----------
async function accessToken() {
  // Local test: a token from `gcloud auth print-access-token` (with DRY_RUN=1)
  if (process.env.ACCESS_TOKEN) return process.env.ACCESS_TOKEN;
  const sa = JSON.parse(process.env.BILLING_SERVICE_ACCOUNT || '{}');
  if (!sa.client_email || !sa.private_key) throw new Error('BILLING_SERVICE_ACCOUNT is missing or not a service account JSON');
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database',
  })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`token: ${JSON.stringify(j)}`);
  return j.access_token;
}

let TOKEN;
const auth = () => ({ Authorization: `Bearer ${TOKEN}` });

// ---------- Realtime Database (REST; the service account is an admin, rules don't apply) ----------
async function dbGet(path, query = '') {
  const r = await fetch(`${DB}/${path}.json${query}`, { headers: auth() });
  if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
async function dbWrite(method, path, body, headers = {}) {
  if (DRY) { console.log(`  [dry] ${method} ${path}`, JSON.stringify(body).slice(0, 160)); return { ok: true, status: 200 }; }
  const r = await fetch(`${DB}/${path}.json`, { method, headers: { ...auth(), ...headers }, body: JSON.stringify(body) });
  if (!r.ok && r.status !== 412) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r;
}
/** Read-modify-write with the server's ETag, so a recharge confirmed at the same moment is not lost. */
async function dbUpdateWithEtag(path, fn) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${DB}/${path}.json`, { headers: { ...auth(), 'X-Firebase-ETag': 'true' } });
    if (!r.ok) throw new Error(`GET ${path}: ${r.status}`);
    const etag = r.headers.get('etag');
    const next = fn(await r.json());
    const w = await dbWrite('PUT', path, next, { 'if-match': etag });
    if (w.status !== 412) return next;
  }
  throw new Error(`${path}: changed too often, try the next run`);
}

// ---------- One hour ----------
async function runHour(key, settings, buses, ownerUids) {
  // Live writes per owner from usageCounts/{regKey}/{key}
  const updatesByOwner = {};
  for (const [reg, b] of Object.entries(buses)) {
    if (!b?.ownerUid) continue;
    const n = Number(await dbGet(`usageCounts/${reg}/${key}`)) || 0;
    if (n) updatesByOwner[b.ownerUid] = (updatesByOwner[b.ownerUid] || 0) + n;
  }
  const totalUpdates = Object.values(updatesByOwner).reduce((a, n) => a + n, 0);
  console.log(`${key}: ${totalUpdates} live writes from ${Object.keys(updatesByOwner).length} owner(s)`);

  let rawInr = 0, chargedInr = 0;
  for (const uid of ownerUids) {
    const updates = updatesByOwner[uid] || 0;
    const had = await dbGet(`billing/${uid}`);
    if (!updates && had) continue; // nothing to charge and already set up
    const use = estimateUse(updates, settings);
    const price = priceHour(use, settings);
    let result;
    const next = await dbUpdateWithEtag(`billing/${uid}`, (cur) => {
      result = applyCharge(cur, price.chargeInr, key, settings);
      return { ...result.billing, updatedAt: Date.now() };
    });
    if (!had) console.log(`  ${uid}: new balance with free credit Rs ${next.freeCreditInr}`);
    await dbWrite('PUT', `billingStatus/${uid}`, { status: result.status, pctLeft: result.pctLeft, updatedAt: Date.now() });
    if (updates) {
      rawInr += price.rawInr; chargedInr += price.chargeInr;
      const mb = (b) => round4(b / 1e6);
      await dbWrite('PUT', `usage/${uid}/${key}`, {
        updates, databaseMB: mb(use.rtdbSentBytes), websiteMB: mb(use.hostingSentBytes),
        costInr: round4(price.chargeInr), balanceAfterInr: next.balanceInr,
      });
      await dbWrite('PUT', `usageAdmin/${uid}/${key}`, {
        rawCostInr: round4(price.rawInr), markupInr: round4(price.chargeInr - price.rawInr), costInr: round4(price.chargeInr),
      });
      console.log(`  ${uid}: ${updates} writes, Rs ${price.chargeInr.toFixed(4)} -> balance Rs ${next.balanceInr} (${result.status})`);
    }
    // Balance used up: this owner's buses go offline (the rules already refuse new positions)
    if (result.status === 'empty') {
      for (const [reg, b] of Object.entries(buses)) {
        if (b?.ownerUid !== uid) continue;
        const live = await dbGet(`live/${reg}`);
        if (live && live.online !== false) {
          await dbWrite('PATCH', `live/${reg}`, { online: false, ts: Date.now() });
          console.log(`  ${uid}: bus ${reg} set offline (balance empty)`);
        }
      }
    }
  }
  await dbWrite('PUT', `billingRuns/${key}`, {
    at: Date.now(), updates: totalUpdates, owners: Object.keys(updatesByOwner).length,
    rawInr: round4(rawInr), chargedInr: round4(chargedInr),
  });
}
// ---------- Main ----------
TOKEN = await accessToken();
let settings = await dbGet('settings/billing');
if (!settings) {
  settings = DEFAULT_SETTINGS;
  await dbWrite('PUT', 'settings/billing', settings);
  console.log('settings/billing created with defaults');
}
if (!settings.est) await dbWrite('PUT', 'settings/billing/est', DEFAULT_SETTINGS.est); // added after the first version
settings = withDefaults(settings);
const buses = (await dbGet('buses')) || {};
const ownerUids = Object.keys((await dbGet('owners', '?shallow=true')) || {});
const lastDone = hourStart(hourKey(Date.now())) - 3600000; // the last finished hour
for (let i = MAX_HOURS_BACK - 1; i >= 0; i--) {
  const key = hourKey(lastDone - i * 3600000);
  if (await dbGet(`billingRuns/${key}`, '?shallow=true')) continue; // done already
  await runHour(key, settings, buses, ownerUids);
}
console.log('done');
