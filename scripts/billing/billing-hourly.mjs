// IKTA Bus — hourly owner data balance job (GitHub Actions: .github/workflows/billing-hourly.yml).
// For each finished UTC hour not done yet (up to 6 back): reads the project's real Firebase use
// from Cloud Monitoring, splits it between owners by their buses' live writes (usageCounts),
// charges their balance and sets billingStatus; at Rs 0 the owner's buses are set offline.
// Env: BILLING_SERVICE_ACCOUNT = the service account JSON. DRY_RUN=1 = read and print only.
// No npm packages: the service account signs its own token with Node's crypto.
import { createSign } from 'node:crypto';
import { withDefaults, DEFAULT_SETTINGS, priceHour, splitByUpdates, applyCharge, hourKey, hourStart, round4 } from './lib.mjs';

const PROJECT = 'ikta-bus';
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

// ---------- Cloud Monitoring ----------
async function metric(type, startMs, endMs, aligner, period = 3600) {
  const q = new URLSearchParams({
    filter: `metric.type = "${type}"`,
    'interval.startTime': new Date(startMs).toISOString(), 'interval.endTime': new Date(endMs).toISOString(),
    'aggregation.alignmentPeriod': `${period}s`, 'aggregation.perSeriesAligner': aligner, 'aggregation.crossSeriesReducer': 'REDUCE_SUM',
  });
  const r = await fetch(`https://monitoring.googleapis.com/v3/projects/${PROJECT}/timeSeries?${q}`, { headers: auth() });
  if (!r.ok) throw new Error(`monitoring ${type}: ${r.status} ${await r.text()}`);
  const pts = ((await r.json()).timeSeries || []).flatMap((s) => s.points || []);
  // Newest point first in the API's answer
  const v = (p) => Number(p.value.int64Value ?? p.value.doubleValue ?? 0);
  return { sum: pts.reduce((a, p) => a + v(p), 0), latest: pts.length ? v(pts[0]) : 0 };
}
async function usageOfHour(start, end) {
  const [sent, hosting, stored] = await Promise.all([
    metric('firebasedatabase.googleapis.com/network/sent_bytes_count', start, end, 'ALIGN_SUM'),
    metric('firebasehosting.googleapis.com/network/sent_bytes_count', start, end, 'ALIGN_SUM'),
    // Storage is measured now and then: use the latest reading of the last 2 days
    metric('firebasedatabase.googleapis.com/storage/total_bytes', end - 2 * 86400000, end, 'ALIGN_MEAN'),
  ]);
  return { rtdbSentBytes: sent.sum, hostingSentBytes: hosting.sum, rtdbStoredBytes: stored.latest };
}

// ---------- One hour ----------
async function runHour(key, settings, buses, ownerUids) {
  const start = hourStart(key), end = start + 3600000;
  const use = await usageOfHour(start, end);
  const price = priceHour(use, settings);

  // Live writes per owner from usageCounts/{regKey}/{key}
  const updatesByOwner = {};
  for (const [reg, b] of Object.entries(buses)) {
    if (!b?.ownerUid) continue;
    const n = Number(await dbGet(`usageCounts/${reg}/${key}`)) || 0;
    if (n) updatesByOwner[b.ownerUid] = (updatesByOwner[b.ownerUid] || 0) + n;
  }
  const split = splitByUpdates(updatesByOwner, price);
  console.log(`${key}: rtdb ${use.rtdbSentBytes} B sent, ${use.rtdbStoredBytes} B stored, hosting ${use.hostingSentBytes} B; `
    + `raw Rs ${price.rawInr.toFixed(4)}, charge Rs ${price.chargeInr.toFixed(4)}; owners with writes: ${Object.keys(split).length}`);

  let chargedInr = 0;
  for (const uid of ownerUids) {
    const part = split[uid];
    const had = await dbGet(`billing/${uid}`);
    if (!part && had) continue; // nothing to charge and already set up
    let result;
    const next = await dbUpdateWithEtag(`billing/${uid}`, (cur) => {
      result = applyCharge(cur, part ? part.chargeInr : 0, key, settings);
      return { ...result.billing, updatedAt: Date.now() };
    });
    if (!had) console.log(`  ${uid}: new balance with free credit Rs ${next.freeCreditInr}`);
    await dbWrite('PUT', `billingStatus/${uid}`, { status: result.status, pctLeft: result.pctLeft, updatedAt: Date.now() });
    if (part) {
      chargedInr += part.chargeInr;
      await dbWrite('PUT', `usage/${uid}/${key}`, { updates: part.updates, share: part.share, costInr: round4(part.chargeInr), balanceAfterInr: next.balanceInr });
      await dbWrite('PUT', `usageAdmin/${uid}/${key}`, { rawCostInr: round4(part.rawInr), markupInr: round4(part.markupInr), costInr: round4(part.chargeInr) });
      console.log(`  ${uid}: ${part.updates} writes, Rs ${part.chargeInr.toFixed(4)} → balance Rs ${next.balanceInr} (${result.status})`);
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
    at: Date.now(), ...use, rawInr: round4(price.rawInr), chargeInr: round4(price.chargeInr),
    chargedInr: round4(chargedInr), owners: Object.keys(split).length,
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
