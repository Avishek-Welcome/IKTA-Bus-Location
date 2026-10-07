// Run: node --test scripts/billing
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceHour, splitByUpdates, freeStartCredit, statusFor, applyCharge, hourKey, hourStart, monthOf, withDefaults, estimateUse } from './lib.mjs';

const S = withDefaults({}); // markup 50 %, Rs 88 per USD
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('hour keys are UTC and round-trip', () => {
  assert.equal(hourKey(1791381600000), '2026100714'); // 7 Oct 2026 14:00 UTC
  assert.equal(hourKey(1791381599999), '2026100713');
  assert.equal(hourStart('2026100714'), 1791381600000);
  assert.equal(monthOf('2026100714'), '2026-10');
});

test('price of one hour', () => {
  // 1 GB of database downloads = USD 1 = Rs 88; with 50 % = Rs 132
  let p = priceHour({ rtdbSentBytes: 1e9 }, S);
  near(p.rawInr, 88); near(p.chargeInr, 132);
  // 0.5 GB stored for one hour = 0.5 x 5 / 730 USD = Rs 0.30137
  p = priceHour({ rtdbStoredBytes: 0.5e9 }, S);
  near(p.rawInr, 0.5 * 5 / 730 * 88);
  // 2 GB of website traffic = 0.30 USD = Rs 26.40
  p = priceHour({ hostingSentBytes: 2e9 }, S);
  near(p.rawInr, 26.4); near(p.chargeInr, 39.6);
  // Markup set by the admin
  near(priceHour({ rtdbSentBytes: 1e9 }, { markupPct: 100 }).chargeInr, 176);
  near(priceHour({}, S).chargeInr, 0);
});

test('estimated use of live writes', () => {
  // 1000 writes x 200 B x 10 watchers = 2 MB database; 1000 x 1000 B = 1 MB website
  assert.deepEqual(estimateUse(1000, S), { rtdbSentBytes: 2e6, hostingSentBytes: 1e6, rtdbStoredBytes: 0 });
  // Rs: 0.002 GB x 1 USD + 0.001 GB x 0.15 USD = 0.00215 USD = Rs 0.1892; +50 % = Rs 0.2838
  const p = priceHour(estimateUse(1000, S), S);
  near(p.rawInr, 0.1892); near(p.chargeInr, 0.2838);
  // The admin's factors
  assert.equal(estimateUse(10, { est: { watchers: 50 } }).rtdbSentBytes, 10 * 200 * 50);
  assert.deepEqual(estimateUse(0, S), { rtdbSentBytes: 0, hostingSentBytes: 0, rtdbStoredBytes: 0 });
});

test('split by live writes', () => {
  const s = splitByUpdates({ a: 30, b: 10, c: 0 }, { rawInr: 88, chargeInr: 132 });
  near(s.a.rawInr, 66); near(s.a.chargeInr, 99); near(s.a.markupInr, 33); assert.equal(s.a.share, 0.75);
  near(s.b.rawInr, 22); near(s.b.chargeInr, 33); near(s.b.markupInr, 11);
  assert.equal(s.c, undefined); // no writes: pays nothing
  assert.deepEqual(splitByUpdates({ a: 0 }, { rawInr: 5, chargeInr: 7.5 }), {}); // nobody shared
});

test('free starting credit: 5 % of the free monthly limits at owner prices', () => {
  // (10 x 1 + 1 x 5 + 10.8 x 0.15) USD = 16.62 USD; 5 % = 0.831 USD = Rs 73.128; +50 % = Rs 109.692
  near(freeStartCredit(S), 109.692, 1e-4);
  near(freeStartCredit({ freeStartPct: 10 }), 219.384, 1e-4);
});

test('status', () => {
  assert.deepEqual(statusFor(0, 100, S), { status: 'empty', pctLeft: 0 });
  assert.deepEqual(statusFor(20, 100, S), { status: 'low', pctLeft: 20 });
  assert.deepEqual(statusFor(21, 100, S), { status: 'active', pctLeft: 21 });
  assert.deepEqual(statusFor(5, 0, S), { status: 'active', pctLeft: 100 });
});

test('charging a balance', () => {
  // New owner: gets the free credit, then the charge comes off
  let r = applyCharge(null, 1.5, '2026100714', S);
  near(r.billing.balanceInr, 108.192, 1e-4); near(r.billing.freeCreditInr, 109.692, 1e-4);
  assert.equal(r.status, 'active'); assert.equal(r.billing.month, '2026-10');
  // After a Rs 100 recharge, 15 left is "low"
  r = applyCharge({ balanceInr: 20, lastTopUpInr: 100, usedThisMonthInr: 80, month: '2026-10' }, 5, '2026103123', S);
  assert.equal(r.status, 'low'); assert.equal(r.pctLeft, 15); near(r.billing.usedThisMonthInr, 85);
  // Never below zero; empty
  r = applyCharge({ balanceInr: 3, lastTopUpInr: 100, month: '2026-10' }, 10, '2026103123', S);
  assert.equal(r.billing.balanceInr, 0); assert.equal(r.status, 'empty');
  // New month: monthly total starts again
  r = applyCharge({ balanceInr: 50, lastTopUpInr: 100, usedThisMonthInr: 40, month: '2026-10' }, 2, '2026110100', S);
  assert.equal(r.billing.month, '2026-11'); near(r.billing.usedThisMonthInr, 2);
});
