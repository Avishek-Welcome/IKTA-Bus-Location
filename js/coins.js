// IKTA Bus — IKTA Coins wallet: balance, history, levels and the live crowd board.
import { $, esc, boot, timeAgo, CROWD, colorFor, friendlyError } from './common.js';
import { connect, demoBanner } from './api.js';
import { requirePassenger } from './passenger-auth.js';

boot();
demoBanner();
const LEVELS = [[0, 'Rookie'], [50, 'Helper'], [150, 'Navigator'], [400, 'Road Guru'], [1000, 'IKTA Legend']];

function animateCount(el, to) {
  const from = +el.dataset.v || 0; el.dataset.v = to;
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / 700); el.textContent = Math.round(from + (to - from) * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function renderWallet(p) {
  const coins = p?.coins || 0;
  const hist = Object.values(p?.history || {}).sort((a, b) => b.ts - a.ts);
  animateCount($('#coinCount'), coins);
  $('#kReports').textContent = hist.length;
  const today = new Date().toDateString();
  $('#kToday').textContent = hist.filter((h) => new Date(h.ts).toDateString() === today).length;
  const lvl = [...LEVELS].reverse().find(([min]) => coins >= min);
  const next = LEVELS.find(([min]) => min > coins);
  $('#kLevel').textContent = lvl[1];
  $('#nextLevel').innerHTML = next
    ? `<div class="small muted">${next[0] - coins} coins to <b>${next[1]}</b></div><div class="progress"><i style="width:${Math.round(((coins - lvl[0]) / (next[0] - lvl[0])) * 100)}%"></i></div>`
    : '<div class="badge ok">🏆 Highest level reached!</div>';
  $('#history').innerHTML = hist.length ? hist.slice(0, 50).map((h) => {
    const C = CROWD[h.level] || CROWD.moderate;
    return `<div class="history-item"><div class="fav-ico">${C.emoji}</div>
      <div><div style="font-weight:700">${esc(h.busName || 'Bus')} <span class="mono small muted">${esc(h.regNo || '')}</span></div>
      <div class="small muted">Reported “${C.label}” · ${timeAgo(h.ts)}</div></div><span class="plus">+${h.coins || 5} 🪙</span></div>`;
  }).join('') : '<div class="empty"><span class="big">🪙</span>No coins yet — report how crowded your bus is on the <a href="index.html">live map</a>.</div>';
}
function renderBoard(crowd, buses) {
  const rows = Object.entries(crowd || {}).filter(([, c]) => c && CROWD[c.level] && Date.now() - c.ts < 45 * 60000).sort((a, b) => b[1].ts - a[1].ts).slice(0, 12);
  $('#board').innerHTML = rows.length ? rows.map(([reg, c]) => {
    const b = buses?.[reg] || {}; const C = CROWD[c.level];
    return `<div class="history-item"><div class="fav-ico" style="background:${colorFor(b.busKey || reg)};color:#fff;font-size:11px;font-weight:800">${esc(b.busName || '🚌')}</div>
      <div><div class="mono small" style="font-weight:700">${esc(b.regNo || reg)}</div><div class="small muted">${c.count || 1} report(s) · ${timeAgo(c.ts)}</div></div>
      <span class="badge ${C.cls}" style="margin-left:auto">${C.emoji} ${C.label}</span></div>`;
  }).join('') : '<div class="empty">No crowd reports in the last 45 minutes.</div>';
}

(async () => {
  try {
    const api = await connect('passenger');
    const user = await requirePassenger(api);
    api.listen(`passengers/${user.uid}`, renderWallet);
    let crowd = {}, buses = {};
    api.listen('crowd', (v) => { crowd = v; renderBoard(crowd, buses); });
    api.listen('buses', (v) => { buses = v; renderBoard(crowd, buses); });
  } catch (e) {
    $('#history').innerHTML = `<div class="empty">Could not load your wallet: ${esc(friendlyError(e))}</div>`;
  }
})();
