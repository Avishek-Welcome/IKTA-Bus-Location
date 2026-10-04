// IKTA Bus — Passenger (home) page: live map, route search, ETA, alerts, crowd feedback.
import {
  $, $$, esc, boot, store, toast, icon, haversine, buildPath, projectOnPath, fmtDist, fmtEta, timeAgo,
  createMap, busIcon, meIcon, stopIcon, glide, colorFor, CROWD, LIVE_FRESH_MS, unlockAudio, playAlertTone,
  isDark, TILE_DARK, TILE_LIGHT, friendlyError, debounce,
} from './common.js';
import { connect, isDemo, demoBanner } from './api.js';
import { addFav, removeFav, isFav, attachFavSync } from './favs.js';

boot();
demoBanner();

// ---------- Map (already created by map-boot.js for instant first paint) ----------
const map = window.__ikta?.map || createMap('map');
if (window.__ikta?.tiles) document.addEventListener('themechange', () => window.__ikta.tiles.setUrl(isDark() ? TILE_DARK : TILE_LIGHT));
L.control.zoom({ position: 'bottomright' }).addTo(map);
const stopLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const busLayer = L.layerGroup().addTo(map);

// ---------- State ----------
const AVG_SPEED = 5.5;          // m/s (~20 km/h) fallback for city buses
const ALERT_SEC = 10 * 60;      // alert when bus is ≤ 10 minutes away
let api = null;
let stops = store.get('ikta_cache_stops', {}) || {};
let routes = store.get('ikta_cache_routes', {}) || {};
let buses = {}, live = {}, crowd = {};
let userPos = null, meMarker = null, accCircle = null, firstFix = true;
let sel = { from: { type: 'gps' }, to: null };
let matches = [];               // active route matches for the current search
let busFilter = null;           // busKey chip filter
let focusReg = null;            // bus being followed
const markers = {};             // reg → Leaflet marker
const lastAlong = {};           // reg → {along, key} for direction inference
const alerted = new Set();
let alertsOn = store.get('ikta_alerts', true);

// ---------- Bottom sheet behaviour (mobile) ----------
const sheet = $('#sheet');
const setPeek = () => sheet.style.setProperty('--peek', `${$('#searchForm').offsetHeight + 96}px`);
setPeek();
// three snap states: collapsed (peek) → half (default) → full
const sheetState = (st) => { sheet.classList.toggle('collapsed', st === 'collapsed'); sheet.classList.toggle('half', st === 'half'); };
const curState = () => (sheet.classList.contains('collapsed') ? 'collapsed' : sheet.classList.contains('half') ? 'half' : 'full');
$('#sheetHandle').addEventListener('click', () => sheetState({ collapsed: 'half', half: 'full', full: 'collapsed' }[curState()]));
(() => {
  let y0 = null;
  const h = $('#sheetHandle');
  h.addEventListener('pointerdown', (e) => { y0 = e.clientY; h.setPointerCapture(e.pointerId); });
  h.addEventListener('pointerup', (e) => {
    if (y0 == null) return;
    const dy = e.clientY - y0; y0 = null;
    const order = ['collapsed', 'half', 'full'], i = order.indexOf(curState());
    if (dy > 40) sheetState(order[Math.max(0, i - 1)]); else if (dy < -40) sheetState(order[Math.min(2, i + 1)]);
  });
})();
map.on('dragstart', () => { focusReg = null; if (innerWidth < 900) sheetState('collapsed'); });

// ---------- Geolocation ----------
function onPos(p) {
  userPos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
  const ll = [userPos.lat, userPos.lng];
  if (!meMarker) {
    meMarker = L.marker(ll, { icon: meIcon(), zIndexOffset: 1000, interactive: false }).addTo(map);
    accCircle = L.circle(ll, { radius: userPos.acc, color: '#2f5bff', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
  } else { glide(meMarker, { lat: userPos.lat, lng: userPos.lng }); accCircle.setLatLng(ll).setRadius(userPos.acc); }
  if (firstFix) {
    firstFix = false;
    if (!sel.to) map.setView(ll, Math.max(map.getZoom(), 14), { animate: true });
    if (sel.to && sel.from.type === 'gps') runSearch(false);
  }
  scheduleRender();
}
function startGeo() {
  if (!('geolocation' in navigator)) return toast('Location is not supported on this device', 'bad');
  navigator.geolocation.watchPosition(onPos, (e) => {
    if (e.code === 1) toast('Location permission denied — pick a source bus stop instead.', 'bad', 4500);
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
}
startGeo();
$('#locateBtn').addEventListener('click', () => {
  if (userPos) map.flyTo([userPos.lat, userPos.lng], 16, { duration: 0.8 });
  else { toast('Finding your location…'); startGeo(); }
});

// ---------- Alerts ----------
function paintAlertBtn() {
  const b = $('#alertBtn');
  b.classList.toggle('on', alertsOn);
  b.innerHTML = icon(alertsOn ? 'bell' : 'bellOff');
  b.title = alertsOn ? '10-minute alert ON' : '10-minute alert OFF';
}
paintAlertBtn();
$('#alertBtn').addEventListener('click', async () => {
  alertsOn = !alertsOn; store.set('ikta_alerts', alertsOn); paintAlertBtn(); unlockAudio();
  if (alertsOn) {
    toast('🔔 You will hear a tone when a bus is 10 minutes away', 'ok');
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  } else toast('Arrival alerts turned off');
});
document.addEventListener('pointerdown', unlockAudio, { once: true }); // iOS needs a gesture before audio

async function fireAlert(b, ev) {
  if (!alertsOn) return;
  playAlertTone();
  const msg = `${b.busName} (${b.regNo}) is ~${fmtEta(ev.eta)} min away — ${fmtDist(ev.remaining)} from ${ev.stopName}`;
  toast(`🔔 ${msg}`, 'ok', 7000);
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const opts = { body: msg, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: `bus-${ev.reg}`, vibrate: [300, 100, 300] };
      if (reg) reg.showNotification('Your bus is coming! 🚌', opts); else new Notification('Your bus is coming! 🚌', opts);
    } catch { /* ignore */ }
  }
}

// ---------- Autocomplete for bus stops ----------
function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function highlight(name, q) {
  if (!q) return esc(name);
  const i = norm(name).indexOf(norm(q));
  if (i < 0) return esc(name);
  return `${esc(name.slice(0, i))}<mark>${esc(name.slice(i, i + q.length))}</mark>${esc(name.slice(i + q.length))}`;
}
function autocomplete(input, { allowGps, onPick }) {
  let list = null, items = [], hl = -1;
  const close = () => { list?.remove(); list = null; hl = -1; };
  const render = () => {
    const raw = input.value.trim();
    const q = raw === GPS_LABEL ? '' : raw;
    const ref = userPos || map.getCenter();
    const qn = norm(q);
    let res = Object.entries(stops).map(([id, s]) => ({ id, ...s, d: haversine(ref, s), pos: qn ? norm(s.name).indexOf(qn) : 0 }))
      .filter((s) => s.pos >= 0);
    // names starting with the query first, then nearest to the user
    res.sort((a, b) => (qn ? (b.pos === 0) - (a.pos === 0) : 0) || a.d - b.d);
    res = res.slice(0, 8);
    items = [];
    if (allowGps) items.push({ gps: true });
    items.push(...res);
    if (!list) { list = document.createElement('div'); list.className = 'ac-list'; list.setAttribute('role', 'listbox'); input.parentElement.appendChild(list); }
    list.innerHTML = items.map((it, i) => it.gps
      ? `<div class="ac-item" data-i="${i}" role="option"><span class="ico">📍</span><b>Use my current location</b>${userPos ? '' : '<span class="meta">GPS</span>'}</div>`
      : `<div class="ac-item ${i === hl ? 'hl' : ''}" data-i="${i}" role="option"><span class="ico">🚏</span><span>${highlight(it.name, q)}</span><span class="meta">${fmtDist(it.d)}</span></div>`).join('')
      + (res.length ? '' : `<div class="ac-empty">${Object.keys(stops).length ? 'No bus stop matches “' + esc(q) + '”' : 'Loading bus stops…'}</div>`);
  };
  input.addEventListener('focus', () => { sheetState('full'); input.select(); render(); });
  input.addEventListener('input', render);
  input.addEventListener('blur', () => setTimeout(close, 180));
  input.addEventListener('keydown', (e) => {
    if (!list) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      hl = (hl + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      $$('.ac-item', list).forEach((el, i) => el.classList.toggle('hl', i === hl));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = items[hl >= 0 ? hl : (allowGps && input.value.trim() && items.length > 1 ? 1 : 0)];
      if (it) { pick(it); }
    } else if (e.key === 'Escape') close();
  });
  const pick = (it) => { close(); onPick(it); };
  input.parentElement.addEventListener('mousedown', (e) => {
    const el = e.target.closest('.ac-item');
    if (el) { e.preventDefault(); pick(items[+el.dataset.i]); }
  });
}
const GPS_LABEL = '📍 My current location';
const fromInput = $('#fromInput'), toInput = $('#toInput');
function paintInputs() {
  fromInput.value = sel.from.type === 'gps' ? GPS_LABEL : (stops[sel.from.id]?.name || '');
  toInput.value = sel.to ? (stops[sel.to]?.name || '') : '';
  $('#favRouteBtn').innerHTML = icon(sel.to && isFav(routeFavItem()) ? 'starFill' : 'star');
  $('#favRouteBtn').classList.toggle('on', !!(sel.to && isFav(routeFavItem())));
  $('#favRouteBtn').style.color = sel.to && isFav(routeFavItem()) ? 'var(--coin)' : '';
}
autocomplete(fromInput, {
  allowGps: true,
  onPick: (it) => { sel.from = it.gps ? { type: 'gps' } : { type: 'stop', id: it.id }; paintInputs(); if (sel.to) runSearch(); else toInput.focus(); },
});
autocomplete(toInput, {
  allowGps: false,
  onPick: (it) => { sel.to = it.id; paintInputs(); toInput.blur(); runSearch(); },
});
$('#swapBtn').addEventListener('click', () => {
  if (!sel.to) return;
  const oldTo = sel.to;
  if (sel.from.type === 'stop') { sel.to = sel.from.id; sel.from = { type: 'stop', id: oldTo }; }
  else { // GPS → use nearest stop as the new destination
    const near = nearestStop(userPos);
    if (!near) return toast('Waiting for your location…');
    sel.to = near.id; sel.from = { type: 'stop', id: oldTo };
  }
  paintInputs(); runSearch();
});
$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); runSearch(); });
$('#searchBtn').addEventListener('click', () => runSearch());
$('#clearBtn').addEventListener('click', clearSearch);

function nearestStop(p, ids = Object.keys(stops)) {
  if (!p) return null;
  let best = null;
  for (const id of ids) { const s = stops[id]; if (!s) continue; const d = haversine(p, s); if (!best || d < best.d) best = { id, d }; }
  return best;
}

// ---------- Favourites ----------
function routeFavItem() {
  const fromName = sel.from.type === 'gps' ? 'My location' : stops[sel.from.id]?.name;
  return {
    type: 'route', from: sel.from.type === 'gps' ? 'gps' : sel.from.id, to: sel.to, fromName, toName: stops[sel.to]?.name,
    busKey: busFilter || '', busName: busFilter ? (routes[busFilter]?.busName || '') : '',
    title: `${fromName} → ${stops[sel.to]?.name}${busFilter ? ` · ${routes[busFilter]?.busName}` : ''}`,
  };
}
$('#favRouteBtn').addEventListener('click', async () => {
  if (!sel.to) return toast('Choose a destination first');
  const item = routeFavItem();
  if (isFav(item)) { removeFav(item); toast('Removed from favourites'); } else await addFav(item);
  paintInputs();
});
document.addEventListener('favschange', () => { paintInputs(); scheduleRender(); });

// ---------- Search ----------
function clearSearch() {
  sel = { from: { type: 'gps' }, to: null }; matches = []; busFilter = null; alerted.clear();
  routeLayer.clearLayers();
  history.replaceState(null, '', location.pathname);
  paintInputs(); renderAll();
}
function runSearch(fit = true) {
  if (!sel.to) { toast('Choose your destination bus stop'); toInput.focus(); return; }
  if (sel.from.type === 'gps' && !userPos) { toast('Waiting for GPS… or choose a source bus stop'); }
  matches = [];
  for (const [key, r] of Object.entries(routes)) {
    const ids = (r.stops || []).filter((id) => stops[id]);
    const j = ids.indexOf(sel.to);
    if (j < 0 || ids.length < 2) continue;
    let i, walk = 0;
    if (sel.from.type === 'stop') { i = ids.indexOf(sel.from.id); if (i < 0 || i === j) continue; }
    else {
      const cand = ids.filter((_, idx) => idx !== j);
      const near = nearestStop(userPos, cand);
      if (!near || near.d > 5000) continue;
      i = ids.indexOf(near.id); walk = near.d;
    }
    const path = buildPath(ids.map((id) => stops[id]));
    matches.push({ key, busName: r.busName || key, ids, i, j, dir: i < j ? 1 : -1, path, refAlong: path.cum[i], stopId: ids[i], walk });
  }
  alerted.clear();
  if (innerWidth < 900) sheetState('half');
  const p = new URLSearchParams({ from: sel.from.type === 'gps' ? 'gps' : sel.from.id, to: sel.to });
  if (busFilter) p.set('bus', busFilter);
  history.replaceState(null, '', `?${p}`);
  drawRoutes(fit);
  renderAll();
}
function drawRoutes(fit) {
  routeLayer.clearLayers();
  const bounds = [];
  for (const m of matches) {
    if (busFilter && m.key !== busFilter) continue;
    const col = colorFor(m.key);
    const all = m.ids.map((id) => [stops[id].lat, stops[id].lng]);
    L.polyline(all, { color: col, weight: 4, opacity: 0.25 }).addTo(routeLayer);
    const [a, b] = [Math.min(m.i, m.j), Math.max(m.i, m.j)];
    const seg = all.slice(a, b + 1);
    L.polyline(seg, { color: col, weight: 7, opacity: 0.9, lineCap: 'round' }).addTo(routeLayer);
    m.ids.forEach((id, idx) => {
      const s = stops[id];
      const kind = idx === m.i ? 'src' : idx === m.j ? 'dst' : (idx > a && idx < b ? '' : 'small');
      const label = idx === m.i || idx === m.j ? s.name : '';
      L.marker([s.lat, s.lng], { icon: stopIcon(kind, label), zIndexOffset: kind ? 500 : 0 })
        .bindPopup(`<b>🚏 ${esc(s.name)}</b><br><span class="muted">${esc(m.busName)} route · stop ${idx + 1}/${m.ids.length}</span>`).addTo(routeLayer);
    });
    bounds.push(...seg);
  }
  if (fit && bounds.length) {
    if (userPos && sel.from.type === 'gps') bounds.push([userPos.lat, userPos.lng]);
    const pad = innerWidth >= 900 ? { paddingTopLeft: [440, 80], paddingBottomRight: [60, 60] } : { paddingTopLeft: [30, 90], paddingBottomRight: [30, Math.min(innerHeight * 0.45, 380)] };
    map.fitBounds(bounds, { ...pad, maxZoom: 15 });
  }
}

/** Evaluate one live bus against one route match → ETA to the passenger's boarding stop */
function evaluate(m, reg, lv) {
  const p = projectOnPath(m.path, lv);
  const prev = lastAlong[reg];
  let dir = lv.dir === 'fwd' ? 1 : lv.dir === 'rev' ? -1 : 0;
  if (!dir && prev && prev.key === m.key && Math.abs(p.along - prev.along) > 15) dir = Math.sign(p.along - prev.along);
  if (!dir) dir = prev?.dir || m.dir;
  lastAlong[reg] = { along: p.along, key: m.key, dir };
  if (dir !== m.dir) return { opposite: true };
  const remaining = (m.refAlong - p.along) * m.dir;
  const passed = remaining < -60;
  const speed = Math.min(22, lv.speed > 1.5 ? lv.speed : AVG_SPEED);
  const eta = passed ? null : Math.max(0, remaining) / speed;
  const span = m.dir > 0 ? m.refAlong : m.path.length - m.refAlong;
  const progress = passed ? 1 : Math.max(0.03, Math.min(1, 1 - remaining / Math.max(span, 1)));
  return { reg, remaining, passed, eta, progress, offRoute: p.offset > 700, stopName: stops[m.stopId]?.name || 'your stop', live: lv.speed > 1.5 };
}

// ---------- Rendering ----------
const fresh = (lv) => lv && lv.online !== false && Date.now() - (lv.ts || 0) < LIVE_FRESH_MS;
let renderQueued = false;
function scheduleRender() { if (!renderQueued) { renderQueued = true; requestAnimationFrame(() => { renderQueued = false; renderAll(); }); } }

function crowdBadge(reg) {
  const c = crowd[reg];
  if (!c || Date.now() - c.ts > 45 * 60000) return '<span class="badge">👥 No crowd report</span>';
  const C = CROWD[c.level] || CROWD.moderate;
  return `<span class="badge ${C.cls}" title="${c.count || 1} report(s)">${C.emoji} ${C.label} · ${timeAgo(c.ts)}</span>`;
}
function feedbackRow(reg) {
  return `<div class="feedback-row" data-fb="${esc(reg)}">${Object.entries(CROWD).map(([k, c]) =>
    `<button class="fb-btn" data-level="${k}" aria-label="Report ${c.label}"><i>${c.emoji}</i>${c.label}</button>`).join('')}</div>`;
}
function busCard(b, reg, ev, extra = '') {
  const color = colorFor(b.busKey || b.busName);
  const lv = live[reg];
  const favItem = { type: 'bus', busKey: b.busKey, busName: b.busName, title: `Bus ${b.busName}` };
  const fav = isFav(favItem);
  const soon = ev && !ev.passed && ev.eta <= ALERT_SEC;
  const right = ev
    ? (ev.passed ? '<div class="eta"><b style="font-size:15px">Passed</b><span>your stop</span></div>'
      : `<div class="eta ${soon ? 'soon' : ''}"><b>${fmtEta(ev.eta)}</b><span>min · ${fmtDist(Math.max(0, ev.remaining))}</span></div>`)
    : `<div class="eta"><b style="font-size:17px">${fmtDist(userPos ? haversine(userPos, lv) : null)}</b><span>from you</span></div>`;
  return `<article class="bus-card ${ev?.passed ? 'passed' : ''} ${focusReg === reg ? 'focus' : ''} ${extra}" data-reg="${esc(reg)}">
    <div class="bus-top">
      <div class="bus-avatar" style="--c:${color}">${esc(b.busName)}</div>
      <div style="min-width:0">
        <div class="bus-name">${esc(b.busName)} <button class="star-btn ${fav ? 'on' : ''}" data-favbus="${esc(reg)}" aria-label="Favourite bus ${esc(b.busName)}">${icon(fav ? 'starFill' : 'star')}</button></div>
        <div class="bus-reg mono">${esc(b.regNo || reg)}</div>
      </div>
      ${right}
    </div>
    ${ev && !ev.passed ? `<div class="progress" title="Progress towards ${esc(ev.stopName)}"><i style="width:${(ev.progress * 100).toFixed(0)}%"></i></div>` : ''}
    <div class="bus-meta">
      <span class="badge live">Live · ${timeAgo(lv.ts)}</span>
      ${crowdBadge(reg)}
      ${lv.speed > 0.5 ? `<span class="badge">⚡ ${Math.round(lv.speed * 3.6)} km/h</span>` : ''}
      ${ev?.offRoute ? '<span class="badge warn">Off route</span>' : ''}
    </div>
    ${ev?.passed ? '' : feedbackRow(reg)}
  </article>`;
}

function renderAll() {
  renderMarkers();
  const list = $('#busList');
  $('#clearBtn').classList.toggle('hidden', !sel.to);
  $('#routeInfo').classList.toggle('hidden', !sel.to);
  $('#nearHead').classList.toggle('hidden', !!sel.to);
  if (!api && !Object.keys(live).length) return; // still loading → keep skeletons

  if (sel.to) {
    const toName = stops[sel.to]?.name || 'destination';
    if (!matches.length) {
      $('#summary').innerHTML = `<span>No route found to <strong>${esc(toName)}</strong></span>`;
      $('#busChips').innerHTML = '';
      list.innerHTML = `<div class="empty"><span class="big">🧭</span>No bus route in our database connects ${sel.from.type === 'gps' ? 'your location' : esc(stops[sel.from.id]?.name)} with ${esc(toName)}.<br><span class="small">Try a nearby stop as source.</span></div>`;
      return;
    }
    // chips: every bus name on matched routes
    const names = [...new Map(matches.map((m) => [m.key, m.busName])).entries()];
    const results = [];
    for (const [reg, lv] of Object.entries(live)) {
      if (!fresh(lv)) continue;
      const b = buses[reg] || { busName: lv.busName, busKey: lv.busKey, regNo: lv.regNo };
      const key = b.busKey || lv.busKey;
      const m = matches.find((x) => x.key === key);
      if (!m) continue;
      const ev = evaluate(m, reg, lv);
      if (ev.opposite) continue;
      results.push({ reg, b, ev, m });
    }
    const counts = {};
    results.forEach((r) => { if (!r.ev.passed) counts[r.m.key] = (counts[r.m.key] || 0) + 1; });
    $('#busChips').innerHTML = `<button class="chip ${!busFilter ? 'active' : ''}" data-chip="">All buses</button>` +
      names.map(([k, n]) => `<button class="chip ${busFilter === k ? 'active' : ''}" data-chip="${esc(k)}" style="${busFilter === k ? '' : `border-color:${colorFor(k)}55`}">🚌 ${esc(n)}${counts[k] ? ` · ${counts[k]}` : ''}</button>`).join('');
    const shown = results.filter((r) => !busFilter || r.m.key === busFilter);
    shown.sort((a, b) => (a.ev.passed - b.ev.passed) || (a.ev.eta ?? 1e9) - (b.ev.eta ?? 1e9));
    const incoming = shown.filter((r) => !r.ev.passed);
    const m0 = matches.find((m) => !busFilter || m.key === busFilter) || matches[0];
    const boardName = stops[m0.stopId]?.name;
    $('#summary').innerHTML = `<span><strong>${incoming.length}</strong> incoming bus${incoming.length === 1 ? '' : 'es'} · board at <strong>${esc(boardName)}</strong>${m0.walk ? ` <span class="muted">(${fmtDist(m0.walk)} walk)</span>` : ''}</span>`;
    // 10-minute alert (only for incoming buses; never once a bus has passed)
    for (const r of incoming) {
      if (r.ev.eta <= ALERT_SEC && !alerted.has(r.reg)) { alerted.add(r.reg); fireAlert(r.b, { ...r.ev, reg: r.reg }); }
    }
    list.innerHTML = shown.length
      ? shown.map((r, i) => busCard(r.b, r.reg, r.ev, i === 0 && !r.ev.passed ? 'best' : '')).join('')
      : `<div class="empty"><span class="big">🚌</span>No ${busFilter ? esc(routes[busFilter]?.busName) + ' ' : ''}bus is live on this route right now.<br><span class="small">Buses appear here as soon as their driver starts sharing location.</span></div>`;
    return;
  }

  // No search → live buses near the user / map centre
  const ref = userPos || map.getCenter();
  const near = Object.entries(live).filter(([, lv]) => fresh(lv))
    .map(([reg, lv]) => ({ reg, lv, d: haversine(ref, lv), b: buses[reg] || { busName: lv.busName, busKey: lv.busKey, regNo: lv.regNo } }))
    .filter((x) => !busFilter || x.b.busKey === busFilter)
    .sort((a, b) => a.d - b.d).slice(0, 20);
  $('#nearHead').innerHTML = `<span><strong>${near.length}</strong> live bus${near.length === 1 ? '' : 'es'} ${userPos ? 'near you' : 'on the map'}${busFilter ? ` · ${esc(routes[busFilter]?.busName || busFilter)} <a href="#" data-chip="">show all</a>` : ''}</span>`;
  list.innerHTML = near.length ? near.map((x) => busCard(x.b, x.reg, null)).join('')
    : '<div class="empty"><span class="big">🛰️</span>No buses are sharing location right now.<br><span class="small">Enter your destination to see routes and bus numbers.</span></div>';
}

function renderMarkers() {
  const active = new Set();
  for (const [reg, lv] of Object.entries(live)) {
    if (!lv || !fresh(lv)) continue;
    const b = buses[reg] || { busName: lv.busName, busKey: lv.busKey };
    const key = b.busKey || lv.busKey;
    let dim = false;
    if (sel.to && matches.length) {
      const m = matches.find((x) => x.key === key);
      dim = !m || (busFilter && key !== busFilter) || (lastAlong[reg]?.key === key && lastAlong[reg].dir !== m.dir);
    } else if (busFilter) dim = key !== busFilter;
    active.add(reg);
    const ic = busIcon(b.busName || reg, colorFor(key || b.busName), { dim, heading: lv.heading });
    let mk = markers[reg];
    if (!mk) {
      mk = markers[reg] = L.marker([lv.lat, lv.lng], { icon: ic, zIndexOffset: 800 }).addTo(busLayer);
      mk.on('click', () => focusBus(reg));
    } else {
      const sig = `${dim}|${lv.heading}|${b.busName}`;
      if (mk._sig !== sig) mk.setIcon(ic);
      mk._sig = sig;
      glide(mk, { lat: lv.lat, lng: lv.lng });
    }
    mk.bindPopup(`<b>🚌 ${esc(b.busName)}</b><br><span class="mono">${esc(b.regNo || reg)}</span><br>${userPos ? `${fmtDist(haversine(userPos, lv))} from you · ` : ''}${timeAgo(lv.ts)}`);
  }
  for (const reg of Object.keys(markers)) if (!active.has(reg)) { busLayer.removeLayer(markers[reg]); delete markers[reg]; }
  if (focusReg && live[focusReg] && markers[focusReg]) map.panTo([live[focusReg].lat, live[focusReg].lng], { animate: true });
}
function focusBus(reg) {
  focusReg = reg;
  const lv = live[reg];
  if (lv) map.flyTo([lv.lat, lv.lng], Math.max(map.getZoom(), 15), { duration: 0.7 });
  markers[reg]?.openPopup();
  $$('.bus-card').forEach((c) => c.classList.toggle('focus', c.dataset.reg === reg));
  $(`.bus-card[data-reg="${CSS.escape(reg)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderStops() {
  stopLayer.clearLayers();
  if (map.getZoom() < 13) return;
  const b = map.getBounds().pad(0.2);
  for (const [id, s] of Object.entries(stops)) {
    if (!b.contains([s.lat, s.lng])) continue;
    L.marker([s.lat, s.lng], { icon: stopIcon('small'), zIndexOffset: -100 })
      .bindPopup(`<b>🚏 ${esc(s.name)}</b><div class="row" style="margin-top:8px;gap:6px">
        <button class="btn btn-sm btn-ghost" data-setfrom="${id}">From here</button><button class="btn btn-sm btn-primary" data-setto="${id}">Go here</button></div>`)
      .addTo(stopLayer);
  }
}
map.on('zoomend moveend', debounce(renderStops, 150));
map.on('popupopen', (e) => {
  const el = e.popup.getElement();
  el.querySelector('[data-setfrom]')?.addEventListener('click', (ev) => { sel.from = { type: 'stop', id: ev.target.dataset.setfrom }; paintInputs(); map.closePopup(); if (sel.to) runSearch(); });
  el.querySelector('[data-setto]')?.addEventListener('click', (ev) => { sel.to = ev.target.dataset.setto; paintInputs(); map.closePopup(); runSearch(); });
});

// ---------- List interactions ----------
$('#sheetBody').addEventListener('click', async (e) => {
  const chip = e.target.closest('[data-chip]');
  if (chip) {
    e.preventDefault();
    busFilter = chip.dataset.chip || null;
    if (sel.to) runSearch(true); else renderAll();
    return;
  }
  const favBtn = e.target.closest('[data-favbus]');
  if (favBtn) {
    const reg = favBtn.dataset.favbus;
    const b = buses[reg] || live[reg];
    const item = { type: 'bus', busKey: b.busKey, busName: b.busName, title: `Bus ${b.busName}` };
    if (isFav(item)) { removeFav(item); toast('Removed from favourites'); } else await addFav(item);
    return;
  }
  const fb = e.target.closest('.fb-btn');
  if (fb) { sendFeedback(fb.closest('[data-fb]').dataset.fb, fb.dataset.level, fb); return; }
  const card = e.target.closest('.bus-card');
  if (card) focusBus(card.dataset.reg);
});

async function sendFeedback(reg, level, btn) {
  if (!api) return toast('Still connecting…');
  const last = store.get('ikta_last_fb', 0);
  const wait = 120000 - (Date.now() - last);
  if (wait > 0) return toast(`Thanks! You can send another report in ${Math.ceil(wait / 1000)}s`);
  try {
    btn.disabled = true;
    const user = await api.auth.anon();
    const coins = (await api.get(`passengers/${user.uid}/coins`)) || 0;
    const b = buses[reg] || live[reg] || {};
    const prev = crowd[reg];
    const count = (prev && Date.now() - prev.ts < 45 * 60000 ? prev.count || 0 : 0) + 1;
    await api.update('', {
      [`feedback/${reg}/${api.newKey(`feedback/${reg}`)}`]: { level, by: user.uid, ts: api.TS },
      [`crowd/${reg}`]: { level, ts: api.TS, count },
      [`passengers/${user.uid}/coins`]: coins + 5,
      [`passengers/${user.uid}/lastFeedbackAt`]: api.TS,
      [`passengers/${user.uid}/history/${api.newKey(`passengers/${user.uid}/history`)}`]: { reg, regNo: b.regNo || reg, busName: b.busName || '', level, coins: 5, ts: api.TS },
    });
    store.set('ikta_last_fb', Date.now());
    coinBurst(btn);
    toast(`+5 IKTA Coins 🪙  Thanks for reporting ${CROWD[level].label.toLowerCase()}!`, 'coin');
  } catch (e) {
    toast(friendlyError(e), 'bad');
  } finally { btn.disabled = false; }
}
function coinBurst(from) {
  const r = from.getBoundingClientRect();
  const target = $('.bottom-nav a[href="coins.html"]')?.getBoundingClientRect();
  for (let i = 0; i < 5; i++) {
    const c = document.createElement('div');
    c.className = 'coin-fly'; c.textContent = '🪙';
    c.style.left = `${r.left + r.width / 2 - 13}px`; c.style.top = `${r.top}px`;
    c.style.setProperty('--dx', `${(target ? target.left + target.width / 2 - r.left - r.width / 2 : 0) + (i - 2) * 6}px`);
    c.style.setProperty('--dy', `${target ? target.top - r.top : -200}px`);
    c.style.animationDelay = `${i * 70}ms`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 1400);
  }
}

// ---------- URL params (from favourites / shared links) ----------
(() => {
  const q = new URLSearchParams(location.search);
  if (q.get('bus')) busFilter = q.get('bus');
  if (q.get('to')) sel.to = q.get('to');
  if (q.get('from') && q.get('from') !== 'gps') sel.from = { type: 'stop', id: q.get('from') };
})();
paintInputs();
renderStops();

// ---------- Data connection (loaded after the map is already visible) ----------
(async () => {
  try {
    api = await connect('passenger');
    api.listen('stops', (v) => {
      stops = v || {}; store.set('ikta_cache_stops', stops); renderStops(); paintInputs();
      if (sel.to && !matches.length) runSearch(!matches.length); else if (sel.to) runSearch(false);
    });
    api.listen('routes', (v) => { routes = v || {}; store.set('ikta_cache_routes', routes); if (sel.to) runSearch(false); });
    api.listen('buses', (v) => { buses = v || {}; scheduleRender(); });
    api.listen('crowd', (v) => { crowd = v || {}; scheduleRender(); });
    api.listen('live', (v) => { live = v || {}; scheduleRender(); });
    setInterval(scheduleRender, 5000); // refresh "x s ago" and drop stale buses
    attachFavSync(api);
    if (isDemo) (await import('./demo-seed.js')).startSimulation(api);
  } catch (e) {
    console.error(e);
    $('#busList').innerHTML = `<div class="empty"><span class="big">⚠️</span>Could not connect to live data.<br><span class="small">${esc(friendlyError(e))}</span></div>`;
  }
})();
addEventListener('resize', debounce(setPeek, 200));
