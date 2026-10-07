// IKTA Bus — owner's data balance: balance, usage, history, recharge (UPI + WhatsApp receipt)
// and low / empty warnings. Balances are charged hourly by scripts/billing (GitHub Actions).
// Owners see only final prices: the markup and raw costs are admin-only (usageAdmin, settings/billing).
// Recharge steps are shown only in a normal browser, not inside the Android app (Google Play rules).
import { $, esc, toast, modal, inAppView } from './common.js';

const rs = (x) => `₹${(Math.round((x || 0) * 100) / 100).toFixed(2)}`;
const hourStart = (k) => Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8), +k.slice(8, 10));
const dd = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${dd(d.getDate())}-${dd(d.getMonth() + 1)}-${d.getFullYear()}`; };
const STATUS = {
  active: ['ok', 'Active'],
  low: ['warn', 'Low balance'],
  empty: ['bad', 'Recharge needed'],
};

export function initBilling(api, user, owner) {
  let billing = null, status = null, usage = {}, txs = {}, requests = {}, payment = null;
  const el = document.createElement('section');
  el.className = 'card'; el.id = 'balanceCard'; el.style.marginTop = '16px';
  $('#dashView .hero').after(el);
  const render = () => paint(el, { billing, status, usage, txs, requests, payment, owner });

  api.listen(`billing/${user.uid}`, (v) => { billing = v; render(); });
  api.listen(`billingStatus/${user.uid}`, (v) => { status = v; render(); warn(status, billing); });
  api.listen(`usage/${user.uid}`, (v) => { usage = v || {}; render(); });
  api.listen(`ownerTransactions/${user.uid}`, (v) => { txs = v || {}; render(); });
  api.listen(`rechargeRequests/${user.uid}`, (v) => { requests = v || {}; render(); });
  api.listen('settings/payment', (v) => { payment = v; render(); });

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-recharge]')) recharge(api, user, owner, payment);
  });
}

function paint(el, { billing, status, usage, txs, requests, payment, owner }) {
  if (!billing) {
    el.innerHTML = `<h2>Data balance</h2><p class="muted">Your free starting balance appears here within an hour.</p>`;
    return;
  }
  const [cls, label] = STATUS[status?.status] || STATUS.active;
  const pct = status?.pctLeft ?? 100;
  // Rough data left, from this owner's own past prices (no markup shown)
  const rows = Object.entries(usage).map(([k, u]) => ({ at: hourStart(k), ...u }));
  const mb = rows.reduce((a, u) => a + (u.databaseMB || 0) + (u.websiteMB || 0), 0);
  const cost = rows.reduce((a, u) => a + (u.costInr || 0), 0);
  const dataLeft = cost > 0 ? (billing.balanceInr || 0) * (mb / cost) : null;
  const now = Date.now();
  const sum = (since) => rows.filter((u) => u.at >= since).reduce((a, u) => ({ cost: a.cost + (u.costInr || 0), updates: a.updates + (u.updates || 0) }), { cost: 0, updates: 0 });
  const d1 = sum(now - 86400000), d30 = sum(now - 30 * 86400000);
  // Spend per day, last 14 days
  const days = [...Array(14)].map((_, i) => { const d = new Date(now - (13 - i) * 86400000); d.setHours(0, 0, 0, 0); return d.getTime(); });
  const perDay = days.map((d) => rows.filter((u) => u.at >= d && u.at < d + 86400000).reduce((a, u) => a + (u.costInr || 0), 0));
  const max = Math.max(...perDay, 0.0001);
  const history = [
    ...Object.values(txs).map((t) => ({ at: t.at, text: `Recharge ${rs(t.amountInr)} credited`, cls: 'ok', after: t.balanceAfterInr })),
    ...Object.values(requests).filter((r) => r.status !== 'confirmed').map((r) => ({
      at: r.createdAt, text: `Recharge ${rs(r.amountInr)} ${r.status === 'rejected' ? 'not accepted' : 'waiting (credited within 2 days)'}`,
      cls: r.status === 'rejected' ? 'bad' : 'warn', note: r.note,
    })),
  ].sort((a, b) => (b.at || 0) - (a.at || 0));

  el.innerHTML = `
    <div class="row" style="align-items:flex-start">
      <div><h2 style="margin:0">Data balance</h2>
        <div style="font-size:34px;font-weight:900;letter-spacing:-.03em;margin-top:4px">${rs(billing.balanceInr)}</div>
        <div class="small muted">${dataLeft != null ? `about ${dataLeft >= 1000 ? `${(dataLeft / 1000).toFixed(1)} GB` : `${Math.round(dataLeft)} MB`} of data left · ` : ''}used this month ${rs(billing.usedThisMonthInr)}</div></div>
      <span class="spacer"></span><span class="badge ${cls}">${label}</span>
    </div>
    <div class="progress"><i style="width:${Math.max(2, pct)}%;${status?.status === 'empty' ? 'background:#ef4444' : status?.status === 'low' ? 'background:#f59e0b' : ''}"></i></div>
    ${status?.status === 'empty' ? '<p class="error-text" style="margin:10px 0 0">Your buses are offline for passengers until you recharge.</p>' : ''}
    <div class="grid-2" style="margin-top:14px">
      <div><div class="small muted">Last 24 hours</div><b>${rs(d1.cost)}</b> <span class="small muted">· ${d1.updates} updates</span></div>
      <div><div class="small muted">Last 30 days</div><b>${rs(d30.cost)}</b> <span class="small muted">· ${d30.updates} updates</span></div>
    </div>
    <div style="display:flex;align-items:flex-end;gap:3px;height:54px;margin-top:10px" title="Spend per day, last 14 days">
      ${perDay.map((v, i) => `<i title="${new Date(days[i]).toLocaleDateString()}: ${rs(v)}" style="flex:1;border-radius:4px 4px 0 0;background:var(--brand);opacity:${v ? 0.85 : 0.15};height:${Math.max(3, Math.round((v / max) * 54))}px"></i>`).join('')}
    </div>
    <div class="small muted" style="margin-top:4px">Charged every hour for your buses' live location updates.</div>
    ${inAppView
      ? '<p class="hint" style="margin-top:14px">Recharges are made on the IKTA Bus website.</p>'
      : `<button class="btn btn-primary btn-block" data-recharge style="margin-top:14px" ${payment?.upiId ? '' : 'disabled'}>Recharge data balance</button>
         ${payment?.upiId ? '' : '<p class="hint">Recharge is not set up yet. Please contact IKTA Bus.</p>'}`}
    <h3 style="margin:18px 0 6px;font-size:15px">History</h3>
    ${history.length ? history.slice(0, 20).map((h) => `<div class="history-item"><div style="min-width:0">
        <div style="font-weight:700">${esc(h.text)}</div>
        <div class="small muted">${h.at ? new Date(h.at).toLocaleString() : ''}${h.after != null ? ` · balance after ${rs(h.after)}` : ''}${h.note ? ` · ${esc(h.note)}` : ''}</div></div>
        <span class="badge ${h.cls}" style="margin-left:auto">${h.cls === 'ok' ? 'Done' : h.cls === 'bad' ? 'Rejected' : 'Pending'}</span></div>`).join('')
      : `<p class="muted small">No recharges yet. You started with a free balance of ${rs(billing.freeCreditInr)}.</p>`}`;
}

// Pop-up once per visit when the balance is low or used up (also shown to drivers)
function warn(status) {
  if (!status || status.status === 'active') return;
  const key = `ikta_bal_warned_${status.status}`;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* private mode */ }
  modal({
    title: status.status === 'empty' ? 'Recharge needed' : 'Low data balance',
    html: `<p style="margin-top:0">${status.status === 'empty'
      ? 'Your data balance is used up, so your buses are offline for passengers. Recharge to bring them back.'
      : `Only ${status.pctLeft}% of your data balance is left. Recharge soon so your buses stay visible to passengers.`}</p>`,
    okText: 'OK', cancelText: '',
  });
}

function loadQr() {
  if (window.QRCode) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.append(s);
  });
}

async function recharge(api, user, owner, payment) {
  // 1. Amount: multiples of Rs 100, at least Rs 100
  const amount = await modal({
    title: 'Recharge data balance',
    html: `<form class="stack">
      <div class="chips">${[100, 200, 500, 1000].map((a) => `<button type="button" class="chip" data-amt="${a}">₹${a}</button>`).join('')}</div>
      <label class="field"><span>Amount (multiples of ₹100, minimum ₹100)</span>
        <input class="input" name="amt" type="number" inputmode="numeric" min="100" step="100" value="100"></label></form>`,
    okText: 'Next',
    onOpen: (box) => box.querySelectorAll('[data-amt]').forEach((b) => b.addEventListener('click', () => { box.querySelector('[name=amt]').value = b.dataset.amt; })),
    validate: (box) => {
      const v = Number(box.querySelector('[name=amt]').value);
      if (!Number.isInteger(v) || v < 100 || v % 100) throw new Error('Choose ₹100, ₹200, ₹300… (multiples of ₹100).');
      if (v > 100000) throw new Error('For more than ₹1,00,000 please contact IKTA Bus.');
      return v;
    },
  });
  if (!amount) return;

  // 2. Pay by UPI, send the receipt on WhatsApp, then confirm
  const note = `${owner.userId} - Rs ${amount} - ${today()}`;
  // The UPI ID stays as typed (some UPI apps don't read an encoded "@")
  const upi = `upi://pay?pa=${String(payment.upiId).trim()}&pn=${encodeURIComponent(payment.upiName || 'IKTA Bus')}&am=${amount}&cu=INR&tn=${encodeURIComponent(`IKTA Bus ${owner.userId}`)}`;
  const wa = payment.whatsapp ? `https://wa.me/${String(payment.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(note)}` : null;
  const done = await modal({
    title: `Pay ₹${amount}`,
    html: `<ol class="small" style="padding-left:18px;margin-top:0;line-height:1.7">
        <li>Pay <b>₹${amount}</b> by UPI to <b class="mono">${esc(payment.upiId)}</b>${payment.upiName ? ` (${esc(payment.upiName)})` : ''}: tap the button on your phone, or scan the code.</li>
        <li>Send the payment screenshot on WhatsApp with this text: <b class="mono">${esc(note)}</b></li>
        <li>Tap <b>I have paid</b>.</li></ol>
      <a class="btn btn-primary btn-block" href="${esc(upi)}">Pay ₹${amount} with a UPI app</a>
      <div data-qr style="display:grid;place-items:center;margin:12px 0"></div>
      ${wa ? `<a class="btn btn-ghost btn-block" href="${esc(wa)}" target="_blank" rel="noopener">Send receipt on WhatsApp</a>` : ''}`,
    okText: 'I have paid', cancelText: 'Cancel',
    onOpen: (box) => loadQr().then(() => new window.QRCode(box.querySelector('[data-qr]'), { text: upi, width: 180, height: 180 })).catch(() => {}),
  });
  if (!done) return;
  try {
    await api.push(`rechargeRequests/${user.uid}`, { amountInr: amount, createdAt: api.TS, status: 'pending', note });
    modal({
      title: 'Thank you',
      html: `<p style="margin-top:0">We will check your payment of <b>₹${amount}</b>. Your balance will be credited within <b>2 days</b>.</p>`,
      okText: 'OK', cancelText: '',
    });
  } catch (e) { toast(e.message || String(e), 'bad'); }
}
