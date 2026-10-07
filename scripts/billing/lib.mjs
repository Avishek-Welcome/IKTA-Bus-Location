// IKTA Bus — owner data balance: pricing, splitting and status (pure, no network).
// Used by billing-hourly.mjs; tested by lib.test.mjs (node --test scripts/billing).

const GB = 1e9; // Google bills decimal gigabytes
const HOURS_PER_MONTH = 730;

/** Defaults for settings/billing (the admin can change every value on the admin page). */
export const DEFAULT_SETTINGS = {
  markupPct: 50, // developer's share on top of Firebase list prices (admin only)
  inrPerUsd: 88, // set by the admin to the current rate
  freeStartPct: 5, // a new owner's one-time credit: this % of the free monthly limits
  warnPct: 20, // "low" when this % or less of the last recharge is left
  // Firebase pay-as-you-go list prices in USD (Blaze plan)
  usd: { rtdbDownloadGB: 1, rtdbStorageGBMonth: 5, hostingGB: 0.15 },
  // Firebase free (Spark) monthly limits: 10 GB database downloads, 1 GB stored, 360 MB/day hosting
  free: { rtdbDownloadGB: 10, rtdbStorageGB: 1, hostingGB: 10.8 },
};

/** Settings with defaults filled in, so a missing value never breaks a run. */
export function withDefaults(s = {}) {
  return {
    ...DEFAULT_SETTINGS, ...s,
    usd: { ...DEFAULT_SETTINGS.usd, ...(s.usd || {}) },
    free: { ...DEFAULT_SETTINGS.free, ...(s.free || {}) },
  };
}

export const round4 = (x) => Math.round(x * 1e4) / 1e4;

/** UTC hour key, e.g. "2026100714" (same as js/driver.js and the Android app). */
export const hourKey = (ts) => new Date(ts).toISOString().slice(0, 13).replace(/\D/g, '');
/** Start of the UTC hour [key] in ms. */
export function hourStart(key) {
  return Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8), +key.slice(8, 10));
}
/** "2026-10" for an hour key. */
export const monthOf = (key) => `${key.slice(0, 4)}-${key.slice(4, 6)}`;

/**
 * What one hour of the whole project costs: database downloads + database storage (a 730th of
 * the monthly price) + hosting downloads. raw = at list price; charge = with the markup.
 */
export function priceHour({ rtdbSentBytes = 0, rtdbStoredBytes = 0, hostingSentBytes = 0 }, settings) {
  const s = withDefaults(settings);
  const usd = (rtdbSentBytes / GB) * s.usd.rtdbDownloadGB
    + (rtdbStoredBytes / GB) * (s.usd.rtdbStorageGBMonth / HOURS_PER_MONTH)
    + (hostingSentBytes / GB) * s.usd.hostingGB;
  const rawInr = usd * s.inrPerUsd;
  return { rawInr, chargeInr: rawInr * (1 + s.markupPct / 100) };
}

/**
 * Splits an hour's cost between owners by their share of live writes. Owners with no writes pay
 * nothing; if nobody shared, nobody pays (the developer carries idle costs).
 * updatesByOwner: { ownerUid: number } → { ownerUid: { updates, share, rawInr, chargeInr, markupInr } }
 */
export function splitByUpdates(updatesByOwner, { rawInr, chargeInr }) {
  const total = Object.values(updatesByOwner).reduce((a, n) => a + n, 0);
  const out = {};
  if (!total) return out;
  for (const [uid, n] of Object.entries(updatesByOwner)) {
    if (!n) continue;
    const share = n / total;
    out[uid] = {
      updates: n, share: round4(share),
      rawInr: rawInr * share, chargeInr: chargeInr * share, markupInr: (chargeInr - rawInr) * share,
    };
  }
  return out;
}

/** A new owner's one-time credit: freeStartPct % of the free monthly limits at owner prices. */
export function freeStartCredit(settings) {
  const s = withDefaults(settings);
  const usd = s.free.rtdbDownloadGB * s.usd.rtdbDownloadGB + s.free.rtdbStorageGB * s.usd.rtdbStorageGBMonth
    + s.free.hostingGB * s.usd.hostingGB;
  return round4(usd * (s.freeStartPct / 100) * s.inrPerUsd * (1 + s.markupPct / 100));
}

/**
 * billingStatus for a balance: "empty" at Rs 0 or less, "low" at warnPct % or less of the base
 * (the last recharge, else the free credit), else "active". pctLeft is shown in the warnings.
 */
export function statusFor(balanceInr, baseInr, settings) {
  const s = withDefaults(settings);
  if (balanceInr <= 0) return { status: 'empty', pctLeft: 0 };
  const pctLeft = baseInr > 0 ? Math.min(100, Math.round((balanceInr / baseInr) * 100)) : 100;
  return { status: pctLeft <= s.warnPct ? 'low' : 'active', pctLeft };
}

/**
 * The owner's billing record after one hour's charge (or just initialised). Never below 0.
 * Keeps usedThisMonthInr per calendar month (UTC).
 */
export function applyCharge(billing, chargeInr, key, settings) {
  const s = withDefaults(settings);
  const b = billing ? { ...billing } : (() => {
    const credit = freeStartCredit(s);
    return { balanceInr: credit, freeCreditInr: credit, lastTopUpInr: 0, usedThisMonthInr: 0, month: monthOf(key) };
  })();
  if (b.month !== monthOf(key)) { b.month = monthOf(key); b.usedThisMonthInr = 0; }
  b.balanceInr = round4(Math.max(0, (b.balanceInr || 0) - chargeInr));
  b.usedThisMonthInr = round4((b.usedThisMonthInr || 0) + chargeInr);
  const base = b.lastTopUpInr > 0 ? b.lastTopUpInr : b.freeCreditInr || 0;
  return { billing: b, ...statusFor(b.balanceInr, base, s) };
}
