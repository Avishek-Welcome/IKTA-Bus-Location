// IKTA Bus — admin billing console: settings and payment details, owners' balances, confirming
// recharges (credit + WhatsApp / email confirmation), and reports (month, year, owner, top
// payers, inactive owners, profit). Balances are charged hourly by scripts/billing.
// Only admins can read settings/billing, usageAdmin and transactions (database.rules.json).
import { $, esc, toast, modal, confirmBox, promptBox, timeAgo, friendlyError } from './common.js';

const DEF = { markupPct: 50, inrPerUsd: 88, freeStartPct: 5, warnPct: 20, usd: { rtdbDownloadGB: 1, rtdbStorageGBMonth: 5, hostingGB: 0.15 }, est: { bytesPerUpdate: 200, watchers: 10, hostingBytesPerUpdate: 1000 } };
const rs = (x) => `₹${(Math.round((x || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (x) => Math.round(x * 100) / 100;
const dd = (n) => String(n).padStart(2, '0');
const dateStr = (ms) => { const d = new Date(ms); return `${dd(d.getDate())}-${dd(d.getMonth() + 1)}-${d.getFullYear()}`; };
const monthKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${dd(d.getMonth() + 1)}`; };
const monthName = (k) => new Date(`${k}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const STATUS = { active: ['ok', 'Active'], low: ['warn', 'Low'], empty: ['bad', 'Empty'] };

/** WhatsApp link to an Indian phone number ("+91 98300 00000", "9830000000"). */
function waLink(phone, text) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) d = `91${d}`;
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : null;
}
const mailLink = (email, text) => (email ? `mailto:${email}?subject=${encodeURIComponent('IKTA Bus data balance')}&body=${encodeURIComponent(text)}` : null);

export function startAdminBilling(api, admin) {
  const d = { owners: {}, billing: {}, status: {}, requests: {}, txs: {}, usageAdmin: {}, settings: null, payment: null, runs: {} };
  const view = $('#billingView');
  let q = false;
  const render = () => { if (q) return; q = true; requestAnimationFrame(() => { q = false; paint(view, d); }); };
  const offs = [
    ['owners', 'owners'], ['billing', 'billing'], ['status', 'billingStatus'], ['requests', 'rechargeRequests'],
    ['txs', 'transactions'], ['usageAdmin', 'usageAdmin'], ['settings', 'settings/billing'], ['payment', 'settings/payment'], ['runs', 'billingRuns'],
  ].map(([k, path]) => api.listen(path, (v) => { d[k] = v || (k === 'settings' || k === 'payment' ? null : {}); render(); }));

  view.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const { act, uid, rid } = b.dataset;
    try {
      if (act === 'confirm') await confirmRequest(api, admin, d, uid, rid);
      if (act === 'reject') await rejectRequest(api, d, uid, rid);
      if (act === 'credit') await manualCredit(api, admin, d, uid);
      if (act === 'msg') messageOwner(d, uid);
    } catch (ex) { toast(friendlyError(ex), 'bad'); }
  });
  view.addEventListener('submit', async (e) => {
    if (e.target.id !== 'billSettings') return;
    e.preventDefault();
    try { await saveSettings(api, e.target); toast('Settings saved', 'ok'); } catch (ex) { toast(ex.message || friendlyError(ex), 'bad'); }
  });
  return () => offs.forEach((off) => off?.());
}

// ---------- Rendering ----------
function paint(el, d) {
  const s = { ...DEF, ...(d.settings || {}), usd: { ...DEF.usd, ...(d.settings?.usd || {}) }, est: { ...DEF.est, ...(d.settings?.est || {}) } };
  const p = d.payment || {};
  const owners = Object.entries(d.owners).map(([uid, o]) => ({ uid, ...o, b: d.billing[uid], st: d.status[uid] }));
  const name = (uid) => d.owners[uid]?.name || uid;
  const txs = Object.entries(d.txs).map(([id, t]) => ({ id, ...t })).sort((a, b) => (b.at || 0) - (a.at || 0));
  const pending = Object.entries(d.requests).flatMap(([uid, rs2]) => Object.entries(rs2 || {}).map(([rid, r]) => ({ uid, rid, ...r })))
    .filter((r) => r.status === 'pending').sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const now = Date.now(), thisMonth = monthKey(now);
  const received = txs.reduce((a, t) => a + (t.amountInr || 0), 0);
  const receivedMonth = txs.filter((t) => monthKey(t.at) === thisMonth).reduce((a, t) => a + (t.amountInr || 0), 0);
  // Profit (markup) per month from the hourly admin rows
  const profit = {};
  for (const hours of Object.values(d.usageAdmin)) {
    for (const [k, u] of Object.entries(hours || {})) {
      const m = `${k.slice(0, 4)}-${k.slice(4, 6)}`;
      const x = (profit[m] ||= { raw: 0, markup: 0, charged: 0 });
      x.raw += u.rawCostInr || 0; x.markup += u.markupInr || 0; x.charged += u.costInr || 0;
    }
  }
  const byMonth = {}, byYear = {}, byOwner = {};
  for (const t of txs) {
    const m = monthKey(t.at), y = m.slice(0, 4);
    (byMonth[m] ||= { n: 0, sum: 0 }); byMonth[m].n++; byMonth[m].sum += t.amountInr || 0;
    (byYear[y] ||= { n: 0, sum: 0 }); byYear[y].n++; byYear[y].sum += t.amountInr || 0;
    (byOwner[t.ownerUid] ||= { n: 0, sum: 0, last: 0 }); byOwner[t.ownerUid].n++; byOwner[t.ownerUid].sum += t.amountInr || 0;
    byOwner[t.ownerUid].last = Math.max(byOwner[t.ownerUid].last, t.at || 0);
  }
  const inactive = owners.filter((o) => o.st?.status === 'empty');
  const lastRun = Math.max(0, ...Object.values(d.runs).map((r) => r.at || 0));
  const months = [...new Set([...Object.keys(byMonth), ...Object.keys(profit)])].sort().reverse();

  el.innerHTML = `
  <div class="kpis" style="margin:12px 0 0;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
    ${kpi(rs(receivedMonth), 'Received this month')}${kpi(rs(received), 'Received in total')}
    ${kpi(rs(profit[thisMonth]?.markup || 0), 'Your profit this month')}${kpi(pending.length, 'Recharges to check')}
    ${kpi(inactive.length, 'Owners offline (no balance)')}${kpi(lastRun ? timeAgo(lastRun) : 'never', 'Last hourly charge')}
  </div>
  ${!p.upiId ? '<div class="card" style="margin-top:12px;border-color:#f59e0b"><b>Set your UPI ID and WhatsApp number</b> in Settings below — until then owners can\'t recharge.</div>' : ''}

  <h2 class="section-title">⏳ Recharges to check</h2>
  <section class="card">${pending.length ? pending.map((r) => {
    const o = d.owners[r.uid] || {};
    return `<div class="history-item"><div style="min-width:0">
      <div style="font-weight:800">${rs(r.amountInr)} · ${esc(o.name || r.uid)} <span class="small muted">@${esc(o.userId || '')}</span></div>
      <div class="small muted">${r.createdAt ? `${new Date(r.createdAt).toLocaleString('en-IN')} (${timeAgo(r.createdAt)})` : ''}${r.note ? ` · “${esc(r.note)}”` : ''}</div>
      <div class="small muted">${esc(o.phone || '')}${o.email ? ` · ${esc(o.email)}` : ''}</div></div>
      <div class="row" style="margin-left:auto;gap:6px">
        <button class="btn btn-primary" data-act="confirm" data-uid="${esc(r.uid)}" data-rid="${esc(r.rid)}">Confirm</button>
        <button class="btn btn-ghost" data-act="reject" data-uid="${esc(r.uid)}" data-rid="${esc(r.rid)}">Reject</button></div></div>`;
  }).join('') : '<p class="muted small" style="margin:0">Nothing to check. When an owner taps “I have paid”, it appears here; check the UPI payment and their WhatsApp receipt, then confirm.</p>'}</section>

  <h2 class="section-title">🚌 Owners</h2>
  <section class="card table-wrap"><table class="table"><thead><tr><th>Owner</th><th>Contact</th><th>Balance</th><th>Status</th><th>This month</th><th>Last recharge</th><th></th></tr></thead><tbody>
    ${owners.sort((a, b) => (a.b?.balanceInr ?? 0) - (b.b?.balanceInr ?? 0)).map((o) => {
      const [cls, label] = STATUS[o.st?.status] || ['', '—'];
      return `<tr><td><b>${esc(o.name || '')}</b><div class="small muted">@${esc(o.userId || '')}</div></td>
        <td class="small">${esc(o.phone || '—')}<br>${esc(o.email || '—')}</td>
        <td><b>${o.b ? rs(o.b.balanceInr) : '—'}</b></td>
        <td>${o.st ? `<span class="badge ${cls}">${label}${o.st.status !== 'empty' ? ` ${o.st.pctLeft}%` : ''}</span>` : '—'}</td>
        <td>${o.b ? rs(o.b.month === thisMonth ? o.b.usedThisMonthInr : 0) : '—'}</td>
        <td class="small">${byOwner[o.uid]?.last ? dateStr(byOwner[o.uid].last) : '—'}</td>
        <td style="white-space:nowrap"><button class="mini-btn" data-act="credit" data-uid="${esc(o.uid)}">+ Credit</button> <button class="mini-btn" data-act="msg" data-uid="${esc(o.uid)}">Message</button></td></tr>`;
    }).join('') || '<tr><td colspan="7" class="center muted">No owners yet</td></tr>'}
  </tbody></table></section>

  <h2 class="section-title">📊 Reports</h2>
  <div class="dash-grid">
    <section class="card table-wrap"><h3 style="margin-top:0">Month by month</h3>
      <table class="table"><thead><tr><th>Month</th><th>Recharges</th><th>Received</th><th>Owners charged</th><th>Your profit</th></tr></thead><tbody>
      ${months.map((m) => `<tr><td>${esc(monthName(m))}</td><td>${byMonth[m]?.n || 0}</td><td>${rs(byMonth[m]?.sum)}</td><td>${rs(profit[m]?.charged)}</td><td><b>${rs(profit[m]?.markup)}</b></td></tr>`).join('') || '<tr><td colspan="5" class="center muted">No data yet</td></tr>'}
      </tbody></table>
      <h3>Year by year</h3>
      <table class="table"><thead><tr><th>Year</th><th>Recharges</th><th>Received</th><th>Your profit</th></tr></thead><tbody>
      ${[...new Set([...Object.keys(byYear), ...Object.keys(profit).map((m) => m.slice(0, 4))])].sort().reverse().map((y) => `<tr><td>${y}</td><td>${byYear[y]?.n || 0}</td><td>${rs(byYear[y]?.sum)}</td>
        <td><b>${rs(Object.entries(profit).filter(([m]) => m.startsWith(y)).reduce((a, [, x]) => a + x.markup, 0))}</b></td></tr>`).join('') || '<tr><td colspan="4" class="center muted">No data yet</td></tr>'}
      </tbody></table></section>
    <section class="card table-wrap"><h3 style="margin-top:0">Owners who paid the most</h3>
      <table class="table"><thead><tr><th>#</th><th>Owner</th><th>Recharges</th><th>Total paid</th></tr></thead><tbody>
      ${Object.entries(byOwner).sort((a, b) => b[1].sum - a[1].sum).map(([uid, x], i) => `<tr><td>${i + 1}</td><td>${esc(name(uid))}</td><td>${x.n}</td><td><b>${rs(x.sum)}</b></td></tr>`).join('') || '<tr><td colspan="4" class="center muted">No recharges yet</td></tr>'}
      </tbody></table>
      <h3>Inactive: no balance, buses offline</h3>
      ${inactive.map((o) => `<div class="history-item"><div><b>${esc(o.name || '')}</b> <span class="small muted">@${esc(o.userId || '')} · ${esc(o.phone || '')}</span></div>
        <button class="mini-btn" style="margin-left:auto" data-act="msg" data-uid="${esc(o.uid)}">Message</button></div>`).join('') || '<p class="muted small">None — every owner has balance.</p>'}
    </section>
  </div>

  <h2 class="section-title">🧾 All recharges</h2>
  <section class="card table-wrap"><table class="table"><thead><tr><th>Date</th><th>Owner</th><th>Amount</th><th>Balance after</th><th>How</th></tr></thead><tbody>
    ${txs.slice(0, 100).map((t) => `<tr><td class="small">${t.at ? new Date(t.at).toLocaleString('en-IN') : ''}</td><td>${esc(t.ownerName || name(t.ownerUid))}<div class="small muted">@${esc(t.ownerUserId || '')}</div></td>
      <td><b>${rs(t.amountInr)}</b></td><td>${rs(t.balanceAfterInr)}</td><td class="small">${esc(t.method || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="center muted">No recharges yet</td></tr>'}
  </tbody></table></section>

  <h2 class="section-title">⚙️ Settings (only you can see these)</h2>
  <section class="card"><form id="billSettings" class="stack">
    <div class="grid-2">
      ${field('markupPct', 'Your markup on Firebase prices (%)', s.markupPct)}${field('inrPerUsd', 'Rupees per US dollar', s.inrPerUsd)}
      ${field('freeStartPct', 'New owner free credit (% of free monthly limits)', s.freeStartPct)}${field('warnPct', 'Warn owners when this % is left', s.warnPct)}
    </div>
    <h3 style="margin:6px 0 0">Usage estimate per bus position update</h3>
    <p class="hint" style="margin:0">Compare now and then with Firebase console → Realtime Database → Usage and Hosting → Usage, and adjust.</p>
    <div class="grid-2">
      ${field('est.bytesPerUpdate', 'Bytes per update', s.est.bytesPerUpdate)}${field('est.watchers', 'Passengers watching each update', s.est.watchers)}
      ${field('est.hostingBytesPerUpdate', 'Website bytes per update', s.est.hostingBytesPerUpdate)}
    </div>
    <h3 style="margin:6px 0 0">Firebase list prices (USD)</h3>
    <div class="grid-2">
      ${field('usd.rtdbDownloadGB', 'Database download, per GB', s.usd.rtdbDownloadGB)}${field('usd.rtdbStorageGBMonth', 'Database storage, per GB-month', s.usd.rtdbStorageGBMonth)}
      ${field('usd.hostingGB', 'Website traffic, per GB', s.usd.hostingGB)}
    </div>
    <h3 style="margin:6px 0 0">Payment details shown to owners</h3>
    <div class="grid-2">
      ${field('upiId', 'UPI ID (e.g. 98300xxxxx@ybl)', p.upiId || '', 'text')}${field('upiName', 'Payee name', p.upiName || '', 'text')}
      ${field('whatsapp', 'WhatsApp number for receipts (with 91)', p.whatsapp || '', 'tel')}
    </div>
    <p class="small muted" style="margin:0">With these settings an owner pays ${rs(s.usd.rtdbDownloadGB * s.inrPerUsd * (1 + s.markupPct / 100))} per GB of database data; a bus moving for an hour (about 1000 updates) costs about ${rs(((1000 * s.est.bytesPerUpdate * s.est.watchers) / 1e9 * s.usd.rtdbDownloadGB + (1000 * s.est.hostingBytesPerUpdate) / 1e9 * s.usd.hostingGB) * s.inrPerUsd * (1 + s.markupPct / 100))}.</p>
    <button class="btn btn-primary">Save settings</button>
  </form></section>`;
}
const kpi = (v, label) => `<div class="kpi" style="background:var(--surface);border-color:var(--line);color:var(--ink)"><b>${v}</b><span>${label}</span></div>`;
const field = (name, label, value, type = 'number') => `<label class="field"><span>${label}</span><input class="input" name="${name}" type="${type}" ${type === 'number' ? 'step="any" min="0"' : ''} value="${esc(value)}"></label>`;

// ---------- Actions ----------
/** ₹ per GB of database data at the owner's price (to tell the owner what a recharge buys). */
function gbFor(amount, settings) {
  const s = { ...DEF, ...(settings || {}), usd: { ...DEF.usd, ...(settings?.usd || {}) } };
  const perGb = s.usd.rtdbDownloadGB * s.inrPerUsd * (1 + s.markupPct / 100);
  return perGb > 0 ? amount / perGb : 0;
}

/** Adds [amount] to the owner's balance (a transaction, safe against the hourly job) and records it. */
async function creditOwner(api, admin, d, uid, amount, method, requestId) {
  const res = await api.transaction(`billing/${uid}`, (cur) => {
    const b = cur || { freeCreditInr: 0, usedThisMonthInr: 0, month: monthKey(Date.now()) };
    return { ...b, balanceInr: r2((b.balanceInr || 0) + amount), lastTopUpInr: amount, updatedAt: Date.now() };
  });
  if (!res.committed) throw new Error('The balance changed at the same moment; please try again.');
  const balance = res.value.balanceInr;
  const pctLeft = Math.min(100, Math.round((balance / amount) * 100));
  const o = d.owners[uid] || {};
  const id = api.newKey('transactions');
  const tx = { ownerUid: uid, ownerUserId: o.userId || '', ownerName: o.name || '', amountInr: amount, balanceAfterInr: balance, at: api.TS, by: admin.uid, method, ...(requestId ? { requestId } : {}) };
  await api.update('', {
    [`billingStatus/${uid}`]: { status: 'active', pctLeft, updatedAt: Date.now() },
    [`transactions/${id}`]: tx,
    [`ownerTransactions/${uid}/${id}`]: tx,
    ...(requestId ? {
      [`rechargeRequests/${uid}/${requestId}/status`]: 'confirmed',
      [`rechargeRequests/${uid}/${requestId}/confirmedAt`]: api.TS,
      [`rechargeRequests/${uid}/${requestId}/txId`]: id,
    } : {}),
  });
  return balance;
}

async function confirmRequest(api, admin, d, uid, rid) {
  const r = d.requests[uid]?.[rid];
  const o = d.owners[uid] || {};
  if (!r) return;
  if (!(await confirmBox('Confirm recharge?', `Did you receive ${rs(r.amountInr)} from ${o.name || uid} (@${o.userId || ''})? Their balance goes up by ${rs(r.amountInr)}.`, 'Yes, credit it'))) return;
  const balance = await creditOwner(api, admin, d, uid, r.amountInr, 'UPI', rid);
  tellOwner(o, `IKTA Bus: ₹${r.amountInr} received for ${o.userId || ''} on ${dateStr(Date.now())}. Data balance credited: ₹${r.amountInr} (about ${gbFor(r.amountInr, d.settings).toFixed(2)} GB of data). New balance: ${rs(balance)}. Thank you!`, 'Recharge confirmed');
}

async function rejectRequest(api, d, uid, rid) {
  const r = d.requests[uid]?.[rid];
  const o = d.owners[uid] || {};
  if (!r) return;
  const why = await promptBox('Reject recharge', `Why? (the owner sees this) — ${rs(r.amountInr)} from ${o.name || uid}`, '', 'e.g. payment not received');
  if (!why) return;
  await api.update(`rechargeRequests/${uid}/${rid}`, { status: 'rejected', note: why, rejectedAt: api.TS });
  tellOwner(o, `IKTA Bus: we could not confirm your recharge of ₹${r.amountInr} (${why}). Please contact us.`, 'Recharge rejected');
}

/** A payment received another way (e.g. cash): credit it directly. */
async function manualCredit(api, admin, d, uid) {
  const o = d.owners[uid] || {};
  const v = await promptBox(`Add credit for ${o.name || uid}`, 'Amount received (₹)', '100', '100');
  if (!v) return;
  const amount = Number(v);
  if (!(amount > 0) || amount > 100000) { toast('Enter an amount between ₹1 and ₹1,00,000', 'bad'); return; }
  const balance = await creditOwner(api, admin, d, uid, amount, 'Manual', null);
  tellOwner(o, `IKTA Bus: ₹${amount} credited to ${o.userId || ''} on ${dateStr(Date.now())} (about ${gbFor(amount, d.settings).toFixed(2)} GB of data). New balance: ${rs(balance)}. Thank you!`, 'Credit added');
}

function messageOwner(d, uid) {
  const o = d.owners[uid] || {};
  const b = d.billing[uid];
  const st = d.status[uid]?.status;
  const text = st === 'empty'
    ? `IKTA Bus: your data balance (${o.userId || ''}) is used up, so your buses are offline for passengers. Please recharge at https://ikta-bus.web.app/owner.html (open in Chrome).`
    : `IKTA Bus: your data balance (${o.userId || ''}) is ${rs(b?.balanceInr)}. Recharge any time at https://ikta-bus.web.app/owner.html (open in Chrome).`;
  tellOwner(o, text, `Message ${o.name || ''}`);
}

/** Ready-made WhatsApp and email messages to the owner (opened by the admin, nothing sent automatically). */
function tellOwner(o, text, title) {
  const wa = waLink(o.phone, text), mail = mailLink(o.email, text);
  modal({
    title,
    html: `<p class="small" style="margin-top:0;white-space:pre-wrap">${esc(text)}</p>
      ${wa ? `<a class="btn btn-primary btn-block" href="${esc(wa)}" target="_blank" rel="noopener">Send on WhatsApp</a>` : '<p class="hint">No phone number for this owner.</p>'}
      ${mail ? `<a class="btn btn-ghost btn-block" style="margin-top:8px" href="${esc(mail)}">Send by email</a>` : '<p class="hint">No email for this owner.</p>'}
      <button type="button" class="btn btn-ghost btn-block" style="margin-top:8px" data-copytext>Copy text</button>`,
    okText: 'Done', cancelText: '',
    onOpen: (box) => box.querySelector('[data-copytext]').addEventListener('click', () => { navigator.clipboard?.writeText(text); toast('Copied', 'ok'); }),
  });
}

async function saveSettings(api, f) {
  const num = (n) => {
    const v = Number(f.elements[n].value);
    if (!Number.isFinite(v) || v < 0) throw new Error(`Check "${f.elements[n].closest('label').querySelector('span').textContent}"`);
    return v;
  };
  const warnPct = num('warnPct');
  if (warnPct > 100) throw new Error('The warning % must be between 0 and 100.');
  await api.update('settings/billing', {
    markupPct: num('markupPct'), inrPerUsd: num('inrPerUsd'), freeStartPct: num('freeStartPct'), warnPct,
    'est/bytesPerUpdate': num('est.bytesPerUpdate'), 'est/watchers': num('est.watchers'), 'est/hostingBytesPerUpdate': num('est.hostingBytesPerUpdate'),
    'usd/rtdbDownloadGB': num('usd.rtdbDownloadGB'), 'usd/rtdbStorageGBMonth': num('usd.rtdbStorageGBMonth'), 'usd/hostingGB': num('usd.hostingGB'),
  });
  const upiId = f.elements.upiId.value.trim(), whatsapp = f.elements.whatsapp.value.replace(/[^\d]/g, '');
  if (upiId && !/^[\w.-]+@[\w.-]+$/.test(upiId)) throw new Error('The UPI ID looks wrong (it should look like name@bank).');
  if (whatsapp && whatsapp.length < 10) throw new Error('Enter the WhatsApp number with country code, e.g. 919830012345.');
  await api.set('settings/payment', { upiId, upiName: f.elements.upiName.value.trim() || 'IKTA Bus', whatsapp });
}
