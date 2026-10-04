// IKTA Bus — Driver console: sign in, live GPS broadcast, route & bus-stop editor.
import {
  $, $$, esc, boot, store, toast, icon, haversine, createMap, userMovingMap, blockPageZoom, setupRotation, mapLangPicker, sheetSwipe, busIcon, stopIcon, glide, speedo, colorFor, CROWD, timeAgo,
  idToEmail, friendlyError, setBusy, promptBox, confirmBox, wirePasswordToggles, fmtDist, debounce,
} from './common.js';
import { connect, isDemo, demoBanner } from './api.js';
import { searchPlaces, measureRoad, stopsSig, decodePolyline } from './road.js';

boot();
demoBanner();
wirePasswordToggles();

const SAVED_KEY = 'ikta_driver_saved';
let api, user, profile = null, map, busMarker, accCircle;
let stops = {}, route = null, routeIds = [], dirty = false;
let watchId = null, wakeLock = null, sending = false, lastSent = 0, lastSentPos = null, lastSentHeading = null, lastSentSpeed = null, sentCount = 0, heartbeat = null;
let follow = true, headingUp = store.get('ikta_heading_up', true), lastFix = null, dir = store.get('ikta_driver_dir', 'fwd'), tapMode = false;
const routeLayerRefs = { line: null, markers: [] };
let otherStopLayer, routeLayer;

// ---------- Saved logins ("remember me") ----------
const enc = (s) => btoa(unescape(encodeURIComponent(s)));
const dec = (s) => { try { return decodeURIComponent(escape(atob(s))); } catch { return ''; } };
function savedLogins() { return store.get(SAVED_KEY, []) || []; }
function paintSaved() {
  const list = savedLogins();
  $('#savedLogins').innerHTML = list.length ? `<div class="small muted" style="margin-left:2px">Saved on this device — tap to sign in</div>` + list.map((s, i) =>
    `<button class="saved-login" data-saved="${i}"><span class="av">${esc(s.userId[0].toUpperCase())}</span><span><b>${esc(s.userId)}</b><br><span class="small muted">${esc(s.bus || 'Driver')}</span></span><span class="spacer"></span>${icon('arrow')}</button>`).join('') : '';
  $$('.saved-login svg').forEach((s) => { s.style.width = '18px'; });
}
$('#savedLogins').addEventListener('click', (e) => {
  const b = e.target.closest('[data-saved]');
  if (!b) return;
  const s = savedLogins()[+b.dataset.saved];
  $('#userId').value = s.userId; $('#password').value = dec(s.pw);
  $('#loginForm').requestSubmit();
});

// ---------- Auth ----------
function showLogin() {
  stopBroadcast(false);
  document.body.classList.remove('map-page');
  $('#appView').classList.add('hidden');
  $('#authView').classList.remove('hidden');
  paintSaved();
  if (isDemo) $('#demoHint').innerHTML = 'Demo driver: <b>driver_dn12</b> / <b>Drive@1234</b>';
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const userId = $('#userId').value.trim().toLowerCase(), pw = $('#password').value;
  const btn = $('#loginBtn');
  $('#loginErr').textContent = '';
  setBusy(btn, true, 'Signing in…');
  try {
    api = api || await connect('driver');
    const u = await api.auth.signIn(idToEmail(userId, 'driver'), pw);
    const prof = await api.get(`drivers/${u.uid}`);
    if (!prof) { await api.auth.signOut(); throw new Error('This account is not linked to any bus. Contact your bus owner.'); }
    if ($('#remember').checked) {
      const list = savedLogins().filter((s) => s.userId !== userId);
      list.unshift({ userId, pw: enc(pw), bus: `${prof.busName} · ${prof.regNo}` });
      store.set(SAVED_KEY, list.slice(0, 5));
      if ('PasswordCredential' in window) {
        try { await navigator.credentials.store(new window.PasswordCredential({ id: userId, password: pw, name: prof.name })); } catch { /* optional */ }
      }
    }
  } catch (err) {
    $('#loginErr').textContent = friendlyError(err);
  } finally { setBusy(btn, false); }
});

async function enter(u) {
  user = u;
  profile = await api.get(`drivers/${u.uid}`);
  if (!profile) { await api.auth.signOut(); return; }
  $('#authView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  document.body.classList.add('map-page');
  await waitForLeaflet();
  if (!map) initMap();
  const color = colorFor(profile.busKey);
  $('#busAvatar').textContent = profile.busName; $('#busAvatar').style.setProperty('--c', color);
  $('#busTitle').textContent = `${profile.busName} · ${profile.name || profile.userId}`;
  $('#busReg').textContent = profile.regNo;
  $('#routeBusName').textContent = profile.busName;
  $('#acctTable').innerHTML = [
    ['Driver', profile.name], ['User ID', profile.userId], ['Phone', profile.phone || '—'],
    ['Bus name', profile.busName], ['Registration', profile.regNo],
  ].map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  api.listen(`crowd/${profile.regKey}`, (c) => {
    const el = $('#crowdNow');
    if (!c || !CROWD[c.level] || Date.now() - c.ts > 45 * 60000) { el.className = 'badge'; el.textContent = '👥 No crowd report'; return; }
    const C = CROWD[c.level]; el.className = `badge ${C.cls}`; el.textContent = `${C.emoji} Passengers say: ${C.label} (${timeAgo(c.ts)})`;
  });
  api.listen('stops', (v) => { stops = v || {}; if (!dirty) loadRouteIds(); drawRoute(); });
  api.listen(`routes/${profile.busKey}`, (v) => { route = v; if (!dirty) loadRouteIds(); drawRoute(); });
  if (!isDemo) api.listen('.info/connected', (c) => setNet(!!c)); else setNet(navigator.onLine);
  addEventListener('online', () => setNet(true)); addEventListener('offline', () => setNet(false));
  paintDir();
  startGeo(); // show own position immediately (sharing starts only when the driver taps the button)
}
function setNet(ok) { const b = $('#netBadge'); b.className = `badge ${ok ? 'ok' : 'bad'}`; b.textContent = ok ? '● Connected' : '● Offline – will resend'; }
const waitForLeaflet = () => new Promise((r) => { const t = () => (window.L ? r() : setTimeout(t, 30)); t(); });

// ---------- Map ----------
function initMap() {
  map = createMap('map');
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  otherStopLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  blockPageZoom();
  setupRotation(map, $('#compassBtn'));
  mapLangPicker($('#langBtn'));
  // Dragging the map stops auto-follow until the center button is tapped
  map.on('dragstart', () => { follow = false; });
  // A two-finger twist or the compass button means the driver wants to look around: north-up
  map.on('userrotate', () => setHeadingUp(false));
  $('#compassBtn').addEventListener('click', () => setHeadingUp(false));
  if (headingUp) startCompass();
  requestAnimationFrame(navLoop);
  setTimeout(() => map.invalidateSize(), 50);
  map.on('click', async (e) => {
    if (!tapMode) return;
    setTapMode(false);
    await createStopAt(e.latlng.lat, e.latlng.lng);
  });
  map.on('popupopen', (e) => {
    e.popup.getElement().querySelector('[data-addstop]')?.addEventListener('click', (ev) => { addToRoute(ev.target.dataset.addstop); map.closePopup(); });
  });
}
// ---------- Heading-up navigation ----------
// The bus's head is the top edge of the driver's phone: mount it upright in portrait
// (screen facing the driver, top edge toward the windscreen) or lying flat with the top
// edge pointing forward. The map turns so that direction is at the top of the screen, and
// the same direction is sent to passengers and owners. GPS course is only the fallback
// when the phone has no compass, or when the phone clearly isn't pointing along the road.
let gpsCourse = null, gpsCourseAt = 0, compassHeading = null, compassAt = 0, navHeading = null, compassOn = false;
const angDiff = (a, b) => ((b - a + 540) % 360) - 180;
const norm = (a) => ((a % 360) + 360) % 360;
const rad = Math.PI / 180;
// Direction the phone's top edge points, for any tilt from flat to upright: the top edge
// and the back of the phone are both projected onto the ground and added, so the result
// stays steady when the phone stands vertically (top edge to the sky, back to the road).
function phoneHeading(alpha, beta, gamma) {
  const sA = Math.sin(alpha * rad), cA = Math.cos(alpha * rad), sB = Math.sin(beta * rad), cB = Math.cos(beta * rad);
  const sG = Math.sin(gamma * rad), cG = Math.cos(gamma * rad);
  const east = -cB * sA - (cG * sA * sB + cA * sG), north = cA * cB + (cA * cG * sB - sA * sG);
  if (Math.hypot(east, north) < 0.2) return null; // lying face down or rolled on its side
  return norm(Math.atan2(east, north) / rad);
}
// Safety check while driving straight: if the phone's top edge keeps pointing well away
// from the GPS course (held in a hand, lying sideways), use GPS until it lines up again.
const check = [];
let phoneAligned = true;
function checkMount(course, speed) {
  if (compassHeading == null || Date.now() - compassAt > 1500 || speed < 4) return;
  check.push(angDiff(compassHeading, course));
  if (check.length > 12) check.shift();
  if (check.length < 6) return;
  const off = check.filter((d) => Math.abs(d) > 50).length;
  phoneAligned = off < check.length / 2;
}
const phoneCompass = () => (phoneAligned && compassHeading != null && Date.now() - compassAt < 1500 ? compassHeading : null);
// Direction sent to passengers/owners: the phone's top edge, else GPS course.
function busHeading() {
  return phoneCompass() ?? lastFix?.heading ?? null;
}
function startCompass() {
  if (compassOn) return;
  let iosOffset = null; // iOS gives alpha relative to an arbitrary start; this turns it into true north
  const onOrient = (e) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    let alpha = null;
    if (e.webkitCompassHeading != null && !isNaN(e.webkitCompassHeading)) {
      // webkitCompassHeading is exact while the phone is not standing up; learn the offset then
      if (Math.abs(e.beta) < 55 && Math.abs(e.gamma) < 40) {
        const o = norm(360 - e.webkitCompassHeading - e.alpha);
        iosOffset = iosOffset == null ? o : norm(iosOffset + angDiff(iosOffset, o) * 0.2);
      }
      alpha = iosOffset != null ? norm(e.alpha + iosOffset) : null;
      if (alpha == null) { compassHeading = norm(e.webkitCompassHeading); compassAt = Date.now(); return; }
    } else if (e.absolute) alpha = e.alpha;
    if (alpha == null) return;
    let h = phoneHeading(alpha, e.beta, e.gamma);
    if (h == null) return;
    h = norm(h + (screen.orientation?.angle || 0));
    // light smoothing: compass readings jitter a few degrees
    compassHeading = compassHeading == null ? h : norm(compassHeading + angDiff(compassHeading, h) * 0.35);
    compassAt = Date.now();
  };
  const listen = () => {
    compassOn = true;
    if ('ondeviceorientationabsolute' in window) addEventListener('deviceorientationabsolute', onOrient);
    else addEventListener('deviceorientation', onOrient);
  };
  // iOS asks for permission, and only from a tap
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then((r) => { if (r === 'granted') listen(); }).catch(() => {});
  } else listen();
}
function currentHeading() {
  const pc = phoneCompass();
  if (pc != null) return pc;
  if (gpsCourse != null && Date.now() - gpsCourseAt < 6000) return gpsCourse;
  return gpsCourse ?? compassHeading;
}
// The bus sits in the middle of the map's width, 60% of the way down the part of the
// map that the panel doesn't cover.
// Measured at most every 8 frames: reading the panel's position forces a layout, and
// the panel only moves when the driver swipes it.
let anchor = null, anchorAge = 0;
function busAnchor() {
  if (anchor && anchorAge++ < 8) return anchor;
  const sz = map.getSize(), top = map.getContainer().getBoundingClientRect().top;
  const sheetTop = $('#sheet').getBoundingClientRect().top - top;
  const visible = Math.max(sz.y * 0.35, Math.min(sz.y, sheetTop));
  anchorAge = 0;
  return (anchor = L.point(sz.x / 2, visible * 0.6));
}
let arrowEl = null, arrowH = '';
function navLoop() {
  const target = currentHeading();
  if (target != null) {
    navHeading = navHeading == null ? target : (navHeading + angDiff(navHeading, target) * 0.2 + 360) % 360;
    if (headingUp && map.setBearing && !userMovingMap(map)) {
      const want = (360 - navHeading) % 360;
      if (Math.abs(angDiff(map.getBearing(), want)) > 0.2) map.setBearing(want);
    }
    // the arrow element is replaced whenever the marker's icon is rebuilt
    if (!arrowEl?.isConnected) { arrowEl = busMarker?.getElement()?.querySelector('.arrow') || null; arrowH = ''; }
    const h = `${navHeading.toFixed(1)}deg`;
    if (arrowEl && h !== arrowH) { arrowH = h; arrowEl.style.setProperty('--h', h); }
  }
  // Camera rides with the gliding bus, keeping it at its spot on the screen
  if (follow && busMarker && !userMovingMap(map) && !map._animatingZoom) {
    const off = map.latLngToContainerPoint(busMarker.getLatLng()).subtract(busAnchor());
    if (Math.abs(off.x) + Math.abs(off.y) > 1) map.panBy(off, { animate: false });
  }
  requestAnimationFrame(navLoop);
}
function setHeadingUp(on) {
  headingUp = on;
  store.set('ikta_heading_up', on);
  $('#navBtn').classList.toggle('on', on);
  $('#navBtn').setAttribute('aria-pressed', on);
  if (on) {
    startCompass();
    follow = true;
    if (currentHeading() == null) toast('Direction shows once the bus starts moving');
  }
}
$('#navBtn').addEventListener('click', () => {
  setHeadingUp(!headingUp);
  if (!headingUp) $('#compassBtn').click(); // turn back to north
  toast(headingUp ? '🧭 Travel direction at the top' : 'North at the top');
});
$('#navBtn').classList.toggle('on', headingUp);

// Following brings the bus back to its spot (navLoop pans there); just zoom to street level
$('#centerBtn').addEventListener('click', () => { follow = true; if (lastFix) { if (map.getZoom() < 15) map.setZoom(16); } else toast('Waiting for GPS…'); });

// ---------- Sheet + tabs ----------
const sheet = $('#sheet');
sheetSwipe(sheet);
sheet.style.setProperty('--peek', '190px');
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  $$('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
  $$('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== b.dataset.tab));
  if (b.dataset.tab === 'route') fitRoute();
}));

// ---------- GPS + broadcasting ----------
function startGeo() {
  if (watchId != null) return;
  if (!('geolocation' in navigator)) { toast('GPS is not available on this device', 'bad'); return; }
  watchId = navigator.geolocation.watchPosition(onFix, (e) => {
    $('#bcStatus').textContent = e.code === 1 ? 'Location permission denied. Allow location access in your phone or browser settings.' : `GPS error: ${e.message}`;
    if (e.code === 1) toast('Location permission is required to share the bus position', 'bad', 5000);
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}
function onFix(p) {
  const c = p.coords;
  let speed = c.speed;
  let heading = c.heading;
  if (lastFix && (speed == null || isNaN(speed))) {
    const dt = (p.timestamp - lastFix.t) / 1000;
    speed = dt > 0 ? haversine(lastFix, { lat: c.latitude, lng: c.longitude }) / dt : 0;
  }
  if ((heading == null || isNaN(heading)) && lastFix && haversine(lastFix, { lat: c.latitude, lng: c.longitude }) > 3) {
    const y = Math.sin((c.longitude - lastFix.lng) * Math.PI / 180) * Math.cos(c.latitude * Math.PI / 180);
    const x = Math.cos(lastFix.lat * Math.PI / 180) * Math.sin(c.latitude * Math.PI / 180) - Math.sin(lastFix.lat * Math.PI / 180) * Math.cos(c.latitude * Math.PI / 180) * Math.cos((c.longitude - lastFix.lng) * Math.PI / 180);
    heading = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  // GPS course is noise below walking pace: keep the last good one while slow or stopped
  if (heading != null && !isNaN(heading) && (speed || 0) >= 1.4) { gpsCourse = heading; gpsCourseAt = Date.now(); checkMount(heading, speed); } else heading = null;
  // Smooth GPS speed a little (single fixes jump by several km/h) but let a stop show quickly
  speed = Math.max(0, speed || 0);
  if (lastFix && speed > 0.5) speed = lastFix.speed + (speed - lastFix.speed) * 0.6;
  lastFix = { lat: c.latitude, lng: c.longitude, acc: c.accuracy, speed, heading: heading ?? lastFix?.heading ?? null, t: p.timestamp };
  $('#stSpeed').textContent = Math.round(lastFix.speed * 3.6);
  driverSpeedo.set(lastFix.speed);
  $('#stAcc').textContent = Math.round(c.accuracy);
  const ll = [lastFix.lat, lastFix.lng];
  if (!busMarker) {
    busMarker = L.marker(ll, { icon: myBusIcon(), zIndexOffset: 1000 }).addTo(map);
    accCircle = L.circle(ll, { radius: c.accuracy, weight: 1, color: '#2f5bff', fillOpacity: 0.08, interactive: false }).addTo(map);
    map.setView(ll, 16);
  } else {
    glide(busMarker, lastFix);
    if ((busMarker.getElement()?.querySelector('.arrow') == null) !== (currentHeading() == null)) busMarker.setIcon(myBusIcon());
    accCircle.setLatLng(ll).setRadius(c.accuracy);
  }
  if (sending) maybeSend();
}
const driverSpeedo = speedo(document.getElementById('appView'));
driverSpeedo.empty(); // shows -- km/h until the first GPS fix
// The driver's own bus: bold arrow turned every frame by navLoop (no CSS lag)
function myBusIcon() {
  const ic = busIcon(profile.busName, colorFor(profile.busKey), { heading: currentHeading() ?? (navHeading ?? null) });
  ic.options.html = ic.options.html.replace('class="bus-marker', 'class="bus-marker live me');
  return ic;
}
/** Throttle: send when moved ≥5 m (≤ every 1.5 s), turned ≥8° or speed changed ≥4 km/h (≤ every 0.9 s), or every 20 s (heartbeat) */
// The bus's name, number and driver go out once per sharing session (and again if they
// change); each later update carries only the moving parts, so every passenger's phone
// downloads a few dozen bytes per update instead of the whole record.
let sentInfo = null;
function maybeSend(force = false) {
  if (!lastFix || !sending) return;
  const now = Date.now(), heading = busHeading();
  const moved = lastSentPos ? haversine(lastSentPos, lastFix) : Infinity;
  // A turn of 8° or more goes out straight away (at most ~1 per second) so passengers see it
  const turned = heading != null && (lastSentHeading == null || Math.abs(angDiff(lastSentHeading, heading)) >= 8);
  // A speed change of 4 km/h or more (including stopping) also goes out promptly
  const sped = Math.abs((lastSentSpeed ?? -9) - lastFix.speed) * 3.6 >= 4;
  const due = (moved >= 5 && now - lastSent >= 1500) || ((turned || sped) && now - lastSent >= 900) || now - lastSent >= 20000;
  if (!force && !due) return;
  lastSent = now; lastSentPos = { ...lastFix }; lastSentHeading = heading; lastSentSpeed = lastFix.speed;
  const pos = {
    lat: +lastFix.lat.toFixed(6), lng: +lastFix.lng.toFixed(6), speed: +lastFix.speed.toFixed(1),
    heading: heading != null ? Math.round(heading) : null, acc: Math.round(lastFix.acc), ts: now, online: true,
  };
  const info = { dir, busName: profile.busName, busKey: profile.busKey, regNo: profile.regNo, driverUid: user.uid, driver: profile.name || profile.userId };
  const sig = JSON.stringify(info), full = sig !== sentInfo;
  (full ? api.set(`live/${profile.regKey}`, { ...pos, ...info }) : api.update(`live/${profile.regKey}`, pos))
    .then(() => { if (full) sentInfo = sig; sentCount++; $('#stSent').textContent = sentCount; })
    .catch((e) => { sentInfo = null; toast(friendlyError(e), 'bad'); });
}
async function startBroadcast() {
  startGeo();
  startCompass(); // this tap lets iOS ask for compass access (the phone's top edge is the bus's head)
  toast('📱 Keep the phone upright in its holder, top edge toward the front of the bus', '', 5000);
  sending = true; sentCount = 0; sentInfo = null;
  window.IKTAApp?.setSharing(true); // Android app: keep GPS going with the screen off
  $('#bcBtn').classList.add('on'); $('#bcLabel').innerHTML = 'STOP<br>SHARING';
  $('#bcStatus').textContent = 'Live! Passengers and your owner can see this bus.';
  $('#liveBadge').className = 'badge live'; $('#liveBadge').textContent = 'LIVE';
  api.onDisconnectUpdate(`live/${profile.regKey}`, { online: false }).catch(() => {});
  maybeSend(true);
  heartbeat = setInterval(() => { maybeSend(); $('#stLast').textContent = lastSent ? `${Math.round((Date.now() - lastSent) / 1000)}s` : '—'; }, 500);
  await requestWake();
  toast('📡 Location sharing started', 'ok');
}
function stopBroadcast(notify = true) {
  if (!sending) return;
  sending = false;
  window.IKTAApp?.setSharing(false);
  clearInterval(heartbeat);
  $('#bcBtn').classList.remove('on'); $('#bcLabel').innerHTML = 'START<br>SHARING';
  $('#bcStatus').textContent = 'Your location is not being shared.';
  $('#liveBadge').className = 'badge'; $('#liveBadge').textContent = 'Offline';
  api?.update(`live/${profile.regKey}`, { online: false, ts: Date.now() }).catch(() => {});
  api?.onDisconnectCancel(`live/${profile.regKey}`).catch(() => {});
  wakeLock?.release().catch(() => {}); wakeLock = null; paintWake();
  if (notify) toast('Location sharing stopped');
}
$('#bcBtn').addEventListener('click', () => (sending ? stopBroadcast() : startBroadcast()));

async function requestWake() {
  try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', paintWake); } } catch { wakeLock = null; }
  paintWake();
}
function paintWake() {
  const b = $('#wakeBadge');
  const on = wakeLock && !wakeLock.released;
  b.className = `badge ${on ? 'ok' : ''}`; b.textContent = on ? '🔆 Screen kept awake' : 'Screen lock: default';
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sending) { requestWake(); maybeSend(true); } });

function paintDir() {
  const src = stops[routeIds[0]]?.name, dst = stops[routeIds.at(-1)]?.name;
  $('#dirFwd').textContent = `→ ${dst || 'Destination'}`;
  $('#dirRev').textContent = `← ${src || 'Source'}`;
  $$('#dirTabs [data-dir]').forEach((b) => b.classList.toggle('active', b.dataset.dir === dir));
}
$('#dirTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dir]'); if (!b) return;
  dir = b.dataset.dir; store.set('ikta_driver_dir', dir); paintDir(); maybeSend(true);
});

// ---------- Route editor ----------
function loadRouteIds() { routeIds = (route?.stops || []).filter((id) => stops[id]); paintDir(); renderStopList(); }

// ---------- Road distance ----------
// The route is measured along the roads through every stop in order (never straight lines).
// The measurement is saved with the route, so passengers' phones don't have to repeat it.
const roads = new Map(); // stop signature → { status: 'busy' | 'ok' | 'fail', road }
function roadNow() {
  const sig = stopsSig(routeIds);
  if (route?.road?.sig === sig && route.road.poly) return { status: 'ok', road: route.road };
  return roads.get(sig) || null;
}
const measureSoon = (() => { let t; return () => { clearTimeout(t); t = setTimeout(measureNow, 600); }; })();
function measureNow() {
  if (routeIds.length < 2) return Promise.resolve(null);
  const have = roadNow();
  if (have?.status === 'busy') return have.p;
  if (have?.status === 'ok') return Promise.resolve(have);
  const ids = [...routeIds], sig = stopsSig(ids);
  const p = measure(ids, sig);
  roads.set(sig, { status: 'busy', p }); paintRoad();
  return p;
}
async function measure(ids, sig) {
  try {
    const r = await measureRoad(ids.map((id) => stops[id]));
    roads.set(sig, { status: 'ok', road: { ...r, sig } });
    // An already-saved route without a road measurement gets one now (e.g. routes made before this)
    if (!dirty && route && stopsSig((route.stops || []).filter((id) => stops[id])) === sig && route.road?.sig !== sig) {
      api.set(`routes/${profile.busKey}/road`, { ...r, sig }).catch(() => {});
    }
  } catch (e) {
    console.warn('road route', e);
    roads.set(sig, { status: 'fail' });
  }
  if (stopsSig(routeIds) === sig) { renderStopList(); drawRoute(); }
  return roads.get(sig);
}
function paintRoad() {
  const el = $('#roadInfo'); if (!el) return;
  const r = routeIds.length >= 2 ? roadNow() : null;
  if (routeIds.length < 2) el.innerHTML = '';
  else if (!r || r.status === 'busy') el.innerHTML = '<span class="badge">⏳ Measuring road distance…</span>';
  else if (r.status === 'ok') el.innerHTML = `<span class="badge ok">🛣️ ${r.road.km.toFixed(1)} km by road</span> <span class="small muted">${routeIds.length - 2} stop${routeIds.length === 3 ? '' : 's'} in between</span>`;
  else el.innerHTML = '<span class="badge warn">Road distance unavailable (no internet?)</span> <button class="btn btn-sm btn-ghost" id="roadRetry">Retry</button>';
}
$('#roadInfo').addEventListener('click', (e) => { if (e.target.id === 'roadRetry') { roads.delete(stopsSig(routeIds)); measureNow(); } });
function setDirty(v) { dirty = v; const b = $('#routeDirty'); b.className = `badge ${v ? 'warn' : 'ok'}`; b.textContent = v ? 'Unsaved changes' : (route ? 'Saved' : 'Not created yet'); }
function autoArrange() {
  if (routeIds.length < 3) return;
  const src = stops[routeIds[0]], dstId = routeIds.at(-1);
  const mid = routeIds.slice(1, -1).sort((a, b) => haversine(src, stops[a]) - haversine(src, stops[b]));
  // keep destination last only if it is the farthest; otherwise still keep it last (it is the route end)
  routeIds = [routeIds[0], ...mid, dstId];
}
function addToRoute(id) {
  if (routeIds.includes(id)) return toast('Stop is already on this route');
  if (routeIds.length < 2) routeIds.push(id);
  else { routeIds.splice(routeIds.length - 1, 0, id); autoArrange(); }
  setDirty(true); renderStopList(); drawRoute();
  toast(`Added “${stops[id]?.name}” — remember to save`, 'ok');
}
async function createStopAt(lat, lng, suggest = '') {
  const near = Object.entries(stops).map(([id, s]) => ({ id, s, d: haversine({ lat, lng }, s) })).sort((a, b) => a.d - b.d)[0];
  if (near && near.d < 40) {
    const use = await confirmBox('Stop already exists', `“${near.s.name}” is ${Math.round(near.d)} m away. Add that stop instead of creating a duplicate?`, 'Use existing');
    if (use) return addToRoute(near.id);
  }
  const name = await promptBox('New bus stop', 'Bus stop name', suggest, 'e.g. Hridaypur More');
  if (!name) return;
  try {
    const id = await api.push('stops', { name: name.trim(), lat: +lat.toFixed(6), lng: +lng.toFixed(6), createdBy: user.uid, busKey: profile.busKey, createdAt: api.TS });
    stops[id] = { name, lat, lng };
    addToRoute(id);
  } catch (e) { toast(friendlyError(e), 'bad'); }
}
$('#addHereBtn').addEventListener('click', () => {
  if (!lastFix) return toast('Waiting for GPS fix…');
  if (lastFix.acc > 60) toast(`GPS accuracy is ±${Math.round(lastFix.acc)} m — stop position may be rough`);
  createStopAt(lastFix.lat, lastFix.lng);
});
function setTapMode(on) {
  tapMode = on;
  $('#tapBanner').classList.toggle('hidden', !on);
  map.getContainer().style.cursor = on ? 'crosshair' : '';
  if (on && innerWidth < 900) { sheet.classList.add('collapsed'); sheet.classList.remove('half'); }
}
$('#addTapBtn').addEventListener('click', () => setTapMode(true));
$('#tapCancel').addEventListener('click', () => setTapMode(false));
$('#sortBtn').addEventListener('click', () => { autoArrange(); setDirty(true); renderStopList(); drawRoute(); toast('Stops arranged by distance from source'); });
$('#saveRouteBtn').addEventListener('click', async (e) => {
  if (routeIds.length < 2) return toast('A route needs at least a source and a destination stop', 'bad');
  const btn = e.currentTarget; setBusy(btn, true, 'Measuring road…');
  try {
    if (roadNow()?.status === 'fail') roads.delete(stopsSig(routeIds)); // try once more
    const r = await measureNow();
    setBusy(btn, false); setBusy(btn, true, 'Saving…');
    const road = r?.status === 'ok' ? r.road : null;
    await api.set(`routes/${profile.busKey}`, {
      busName: profile.busName, stops: routeIds, source: routeIds[0], destination: routeIds.at(-1), updatedAt: api.TS, updatedBy: user.uid,
      ...(road ? { road } : {}),
    });
    setDirty(false);
    toast(road ? `✅ Route saved · ${road.km.toFixed(1)} km by road` : '✅ Route saved. Road distance will be added when the internet is back.', 'ok', 4500);
  } catch (err) { toast(friendlyError(err), 'bad'); } finally { setBusy(btn, false); }
});
$('#stopList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const i = +b.dataset.i, id = routeIds[i];
  const act = b.dataset.act;
  if (act === 'up' && i > 0) [routeIds[i - 1], routeIds[i]] = [routeIds[i], routeIds[i - 1]];
  if (act === 'down' && i < routeIds.length - 1) [routeIds[i + 1], routeIds[i]] = [routeIds[i], routeIds[i + 1]];
  if (act === 'src') { routeIds.splice(i, 1); routeIds.unshift(id); autoArrange(); }
  if (act === 'dst') { routeIds.splice(i, 1); routeIds.push(id); autoArrange(); }
  if (act === 'del') routeIds.splice(i, 1);
  setDirty(true); renderStopList(); drawRoute();
});
function renderStopList() {
  const ul = $('#stopList');
  if (!ul) return;
  if (!routeIds.length) {
    ul.innerHTML = '<li style="justify-content:center;border:0" class="muted small">No stops yet. Add the source stop first, then the destination, then stops in between.</li>';
  } else {
    const rd = roadNow();
    const legs = rd?.status === 'ok' ? rd.road.legs : null;
    let cum = 0;
    ul.innerHTML = routeIds.map((id, i) => {
      if (i) cum += legs ? legs[i - 1] : haversine(stops[routeIds[i - 1]], stops[id]);
      const cls = i === 0 ? 'src' : i === routeIds.length - 1 && routeIds.length > 1 ? 'dst' : '';
      return `<li class="${cls}"><div style="min-width:0"><div class="name">${esc(stops[id].name)}</div>
        <div class="small muted">${i === 0 ? 'Source' : `${cls === 'dst' ? 'Destination · ' : ''}${legs ? '' : '≈ '}${fmtDist(cum)}${legs ? ' by road' : ''}`}</div></div>
        <div class="acts">
          ${i ? `<button class="mini-btn" data-act="up" data-i="${i}" aria-label="Move up">${icon('up')}</button>` : ''}
          ${i < routeIds.length - 1 ? `<button class="mini-btn" data-act="down" data-i="${i}" aria-label="Move down">${icon('down')}</button>` : ''}
          ${i ? `<button class="mini-btn" data-act="src" data-i="${i}" title="Make source">S</button>` : ''}
          ${i !== routeIds.length - 1 ? `<button class="mini-btn" data-act="dst" data-i="${i}" title="Make destination">D</button>` : ''}
          <button class="mini-btn" data-act="del" data-i="${i}" aria-label="Remove" style="color:var(--bad)">${icon('trash')}</button>
        </div></li>`;
    }).join('');
  }
  $('#routeTitle').textContent = routeIds.length >= 2 ? `${stops[routeIds[0]].name} → ${stops[routeIds.at(-1)].name}` : 'New route';
  setDirty(dirty);
  paintDir();
  paintRoad();
  if (routeIds.length >= 2 && !roadNow()) measureSoon();
}
function drawRoute() {
  if (!map) return;
  routeLayer.clearLayers(); otherStopLayer.clearLayers();
  const col = colorFor(profile.busKey);
  const rd = roadNow();
  if (rd?.status === 'ok') L.polyline(decodePolyline(rd.road.poly), { color: col, weight: 6, opacity: 0.85 }).addTo(routeLayer);
  else if (routeIds.length > 1) L.polyline(routeIds.map((id) => [stops[id].lat, stops[id].lng]), { color: col, weight: 4, opacity: 0.6, dashArray: '6 8' }).addTo(routeLayer);
  routeIds.forEach((id, i) => {
    const kind = i === 0 ? 'src' : i === routeIds.length - 1 ? 'dst' : '';
    L.marker([stops[id].lat, stops[id].lng], { icon: stopIcon(kind, kind ? stops[id].name : '') }).bindPopup(`<b>${i + 1}. ${esc(stops[id].name)}</b>`).addTo(routeLayer);
  });
  for (const [id, s] of Object.entries(stops)) {
    if (routeIds.includes(id)) continue;
    L.marker([s.lat, s.lng], { icon: stopIcon('small') })
      .bindPopup(`<b>🚏 ${esc(s.name)}</b><br><button class="btn btn-sm btn-primary" style="margin-top:8px" data-addstop="${id}">Add to route</button>`).addTo(otherStopLayer);
  }
}
function fitRoute() {
  const rd = roadNow();
  const pts = rd?.status === 'ok' ? decodePolyline(rd.road.poly).map((p) => [p.lat, p.lng]) : routeIds.map((id) => [stops[id].lat, stops[id].lng]);
  if (map && routeIds.length > 1) map.fitBounds(pts, { padding: [40, 40], paddingBottomRight: [40, innerWidth < 900 ? innerHeight * 0.5 : 40], paddingTopLeft: [innerWidth >= 900 ? 440 : 30, 80] });
}
// Stop search: existing bus stops first, then place hints (locality, district) from OpenStreetMap
(() => {
  const input = $('#stopSearch'); let list, items = [], seq = 0;
  const close = () => { list?.remove(); list = null; };
  const placeholder = () => { input.placeholder = routeIds.length === 0 ? 'Source: type a place or bus stop…' : routeIds.length === 1 ? 'Destination: type a place or bus stop…' : 'Stop in between: type a place or bus stop…'; };
  new MutationObserver(placeholder).observe($('#stopList'), { childList: true });
  placeholder();
  const paint = (q, places, state) => {
    if (!list) { list = document.createElement('div'); list.className = 'ac-list'; list.style.left = '0'; input.parentElement.appendChild(list); }
    const ref = lastFix || map?.getCenter();
    const own = Object.entries(stops).filter(([id, s]) => !routeIds.includes(id) && s.name.toLowerCase().includes(q.toLowerCase()))
      .map(([id, s]) => ({ id, s, d: ref ? haversine(ref, s) : 0 })).sort((a, b) => a.d - b.d).slice(0, 5);
    // Places with a bus stop already within 40 m are shown as that stop instead
    const extra = (places || []).filter((p) => !own.some((o) => haversine(o.s, p) < 40)).slice(0, 8);
    items = [...own.map((o) => ({ stop: o.id })), ...extra.map((p) => ({ place: p }))];
    list.innerHTML = own.map((r, i) => `<div class="ac-item" data-i="${i}"><span class="ico">🚏</span><span class="ac-txt"><b>${esc(r.s.name)}</b><span class="sub">Saved bus stop</span></span><span class="meta">${fmtDist(r.d)}</span></div>`).join('')
      + extra.map((p, j) => `<div class="ac-item" data-i="${own.length + j}"><span class="ico">${p.icon}</span><span class="ac-txt"><b>${esc(p.name)}</b><span class="sub">${esc([p.type, p.detail].filter(Boolean).join(' · '))}</span></span><span class="meta">${ref ? fmtDist(haversine(ref, p)) : ''}</span></div>`).join('')
      + (state === 'busy' ? '<div class="ac-empty">Searching places…</div>'
        : state === 'fail' ? '<div class="ac-empty">Place search is unavailable right now. Use “At my location” or “Tap on map”.</div>'
          : items.length ? '' : '<div class="ac-empty">No match. Try another spelling, or use “At my location” / “Tap on map”.</div>');
  };
  const lookup = debounce(async (q) => {
    const my = ++seq;
    try {
      const places = await searchPlaces(q, lastFix || map?.getCenter());
      if (my === seq && input.value.trim() === q) paint(q, places, 'ok');
    } catch (e) { if (e.name !== 'AbortError' && my === seq) paint(q, [], 'fail'); }
  }, 350);
  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) { seq++; return close(); }
    paint(q, null, q.length >= 3 ? 'busy' : 'ok');
    if (q.length >= 3) lookup(q);
  });
  input.addEventListener('blur', () => setTimeout(close, 180));
  input.parentElement.addEventListener('mousedown', (e) => {
    const it = items[+e.target.closest('[data-i]')?.dataset.i]; if (!it) return;
    e.preventDefault(); input.value = ''; close(); seq++;
    if (it.stop) addToRoute(it.stop);
    else { map?.flyTo([it.place.lat, it.place.lng], 16, { duration: 0.6 }); createStopAt(it.place.lat, it.place.lng, it.place.name); }
  });
})();

// ---------- Account ----------
$('#forgetBtn').addEventListener('click', () => {
  store.set(SAVED_KEY, savedLogins().filter((s) => s.userId !== profile.userId));
  navigator.credentials?.preventSilentAccess?.().catch(() => {});
  toast('Saved login removed from this device');
});
$('#logoutBtn').addEventListener('click', async () => {
  if (!(await confirmBox('Sign out?', 'Location sharing will stop and passengers will no longer see this bus.', 'Sign out', true))) return;
  stopBroadcast(false);
  if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  await api.auth.signOut();
  location.reload();
});
addEventListener('beforeunload', (e) => { if (sending) { e.preventDefault(); e.returnValue = ''; } });

// ---------- Start ----------
(async () => {
  try {
    api = await connect('driver');
    await api.auth.ready();
    let entered = false;
    api.auth.onChange((u) => {
      if (u && !entered) { entered = true; enter(u).catch((e) => { toast(friendlyError(e), 'bad'); showLogin(); }); }
      else if (!u) { entered = false; showLogin(); }
    });
  } catch (e) {
    showLogin();
    $('#loginErr').textContent = `Could not connect: ${friendlyError(e)}`;
  }
})();
