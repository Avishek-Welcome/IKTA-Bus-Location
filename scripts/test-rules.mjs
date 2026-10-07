// Run: firebase emulators:exec --only database --project demo-ikta "node scripts/test-rules.mjs"
// (needs Node, the Firebase CLI and Java; checks database.rules.json against the expected allow/deny list)
// Tests database.rules.json on the Realtime Database emulator (REST, mock auth tokens).
const PROJECT = 'demo-ikta';
const NS = 'demo-ikta-default-rtdb';
const BASE = 'http://127.0.0.1:9000';
const tok = (uid) => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b({ alg: 'none', typ: 'JWT' })}.${b({ sub: uid, user_id: uid, uid, iat: now, exp: now + 3600, aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, auth_time: now, firebase: { sign_in_provider: 'custom' } })}.`;
};
async function req(method, path, uid, body) {
  const auth = uid === 'ADMIN' ? 'access_token=owner' : uid ? `auth=${tok(uid)}` : '';
  const r = await fetch(`${BASE}/${path}.json?ns=${NS}&${auth}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return r.status;
}
let pass = 0, fail = 0;
async function expect(name, method, path, uid, body, ok) {
  const s = await req(method, path, uid, body);
  const good = ok ? s === 200 : s === 401 || s === 403;
  good ? pass++ : fail++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}  (${method} ${path} as ${uid ?? 'nobody'} -> ${s})`);
}

// Seed with admin rights (rules bypassed)
await req('PUT', '', 'ADMIN', {
  admins: { adm: true },
  secretCodes: { CODE000001: { used: true, usedBy: 'o1' } },
  owners: { o1: { name: 'Owner One', userId: 'owner1', phone: '9830000000', code: 'CODE000001' } },
  buses: { R1: { regNo: 'WB 1', busName: 'DN 1', busKey: 'DN1', ownerUid: 'o1', driverUid: 'd1' } },
  drivers: { d1: { ownerUid: 'o1', regKey: 'R1', busKey: 'DN1' } },
  billing: { o1: { balanceInr: 50 } },
  billingStatus: { o1: { status: 'active' } },
  settings: { billing: { markupPct: 50 }, payment: { upiId: 'x@upi' } },
  usage: { o1: { '2026100714': { costInr: 1 } } },
  usageAdmin: { o1: { '2026100714': { rawCostInr: 0.6 } } },
});

// Live position and the balance rule
await expect('driver sends position while active', 'PATCH', 'live/R1', 'd1', { ts: 1, lat: 22.6, lng: 88.4, online: true }, true);
await req('PUT', 'billingStatus/o1/status', 'ADMIN', 'empty');
await expect('driver position refused when balance empty', 'PATCH', 'live/R1', 'd1', { ts: 2, lat: 22.6, lng: 88.4, online: true }, false);
await expect('driver can still go offline when empty', 'PATCH', 'live/R1', 'd1', { online: false, ts: 3 }, true);
await req('PUT', 'billingStatus/o1/status', 'ADMIN', 'active');
await expect('stranger cannot write live', 'PATCH', 'live/R1', 'x', { ts: 4, online: true }, false);

// Usage counters
await expect('driver adds usage count', 'PUT', 'usageCounts/R1/2026100714', 'd1', 5, true);
await expect('driver count can only grow', 'PUT', 'usageCounts/R1/2026100714', 'd1', 3, false);
await expect('driver adds more', 'PUT', 'usageCounts/R1/2026100714', 'd1', 9, true);
await expect('bad hour key refused', 'PUT', 'usageCounts/R1/20261007', 'd1', 1, false);
await expect('other driver cannot count for R1', 'PUT', 'usageCounts/R1/2026100715', 'x', 1, false);
await expect('owner cannot read usage counts', 'GET', 'usageCounts', 'o1', undefined, false);
await expect('admin reads usage counts', 'GET', 'usageCounts', 'adm', undefined, true);

// Balances and status
await expect('owner reads own balance', 'GET', 'billing/o1', 'o1', undefined, true);
await expect('owner cannot change balance', 'PUT', 'billing/o1/balanceInr', 'o1', 9999, false);
await expect('driver cannot read balance', 'GET', 'billing/o1', 'd1', undefined, false);
await expect('driver reads owner status', 'GET', 'billingStatus/o1', 'd1', undefined, true);
await expect('stranger cannot read status', 'GET', 'billingStatus/o1', 'x', undefined, false);
await expect('admin sets balance', 'PUT', 'billing/o1/balanceInr', 'adm', 100, true);
await expect('status must be a known word', 'PUT', 'billingStatus/o1/status', 'adm', 'broke', false);

// Settings (markup hidden)
await expect('owner cannot read billing settings', 'GET', 'settings/billing', 'o1', undefined, false);
await expect('admin reads billing settings', 'GET', 'settings/billing', 'adm', undefined, true);
await expect('owner reads payment details', 'GET', 'settings/payment', 'o1', undefined, true);
await expect('owner cannot change payment details', 'PUT', 'settings/payment/upiId', 'o1', 'me@upi', false);
await expect('owner reads own usage', 'GET', 'usage/o1', 'o1', undefined, true);
await expect('owner cannot read admin usage (markup)', 'GET', 'usageAdmin/o1', 'o1', undefined, false);

// Recharge requests
const ts = { '.sv': 'timestamp' };
await expect('owner asks to recharge Rs 200', 'PUT', 'rechargeRequests/o1/r1', 'o1', { amountInr: 200, createdAt: ts, status: 'pending' }, true);
await expect('owner cannot confirm own request', 'PATCH', 'rechargeRequests/o1/r1', 'o1', { status: 'confirmed' }, false);
await expect('owner cannot ask for Rs 50', 'PUT', 'rechargeRequests/o1/r2', 'o1', { amountInr: 50, createdAt: ts, status: 'pending' }, false);
await expect('owner cannot create as confirmed', 'PUT', 'rechargeRequests/o1/r3', 'o1', { amountInr: 100, createdAt: ts, status: 'confirmed' }, false);
await expect('other owner cannot read requests', 'GET', 'rechargeRequests/o1', 'x', undefined, false);
await expect('admin confirms request', 'PATCH', 'rechargeRequests/o1/r1', 'adm', { status: 'confirmed' }, true);
await expect('owner cannot write transactions', 'PUT', 'ownerTransactions/o1/t1', 'o1', { amountInr: 100 }, false);
await expect('admin writes transaction', 'PUT', 'ownerTransactions/o1/t1', 'adm', { amountInr: 100 }, true);
await expect('owner reads own transactions', 'GET', 'ownerTransactions/o1', 'o1', undefined, true);

// Owner contact details
await expect('owner adds email', 'PATCH', 'owners/o1', 'o1', { email: 'owner1@gmail.com' }, true);
await expect('bad email refused', 'PATCH', 'owners/o1', 'o1', { email: 'not an email' }, false);
await expect('admin reads all owners', 'GET', 'owners', 'adm', undefined, true);
await expect('owner cannot read all owners', 'GET', 'owners', 'o1', undefined, false);

// IKTA Coins: 1 coin per crowd report (was 5 until Oct 2026)
const report = (uid, coins, hist) => ({ [`passengers/${uid}/coins`]: coins, [`passengers/${uid}/lastFeedbackAt`]: ts, [`passengers/${uid}/history/h1`]: { reg: 'R1', level: 'free', coins: hist, ts } });
await expect('passenger earns 1 coin', 'PATCH', '', 'p1', report('p1', 1, 1), true);
await expect('passenger cannot take 5 coins', 'PATCH', '', 'p2', report('p2', 5, 5), false);
await expect('history must say 1 coin', 'PATCH', '', 'p3', report('p3', 1, 5), false);
await expect('second report within 2 minutes refused', 'PATCH', '', 'p1', { 'passengers/p1/coins': 2, 'passengers/p1/lastFeedbackAt': ts }, false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
