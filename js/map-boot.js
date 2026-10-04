// IKTA Bus — critical-path map bootstrap (classic script, runs right after Leaflet).
// Creates the map and starts tile downloads immediately from the last viewed
// position, before any app module, Firebase SDK or GPS fix is available.
(function () {
  var el = document.getElementById('map');
  if (!window.L || !el) return;
  var v = null;
  try { v = JSON.parse(localStorage.getItem('ikta_last_view')); } catch (e) { /* ignore */ }
  v = v || { lat: 22.6757, lng: 88.4512, zoom: 12 };
  // Touch tuning: keep in sync with MAP_OPTS / TILE_OPTS in js/common.js
  var map = L.map(el, {
    rotate: true, touchRotate: true, rotateControl: false, bearing: 0,
    zoomControl: false, preferCanvas: true, zoomSnap: 0.25, zoomDelta: 1, bounceAtZoomLimits: false,
    inertia: true, inertiaDeceleration: 2200, inertiaMaxSpeed: 2000, easeLinearity: 0.2,
    tapTolerance: 20, wheelPxPerZoomLevel: 90
  }).setView([v.lat, v.lng], v.zoom);
  // OpenStreetMap standard tiles (no API key needed); dark mode = CSS filter in app.css
  var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, updateWhenIdle: false, updateWhenZooming: false, keepBuffer: 4,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  map.on('moveend', function () {
    var c = map.getCenter();
    try { localStorage.setItem('ikta_last_view', JSON.stringify({ lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: map.getZoom() })); } catch (e) { /* ignore */ }
  });
  // Flag fingers on the map so GPS recentering waits (see trackTouch in js/common.js)
  var off = function (e) { if (!e.touches || !e.touches.length) map._iktaTouching = false; };
  el.addEventListener('touchstart', function () { map._iktaTouching = true; }, { passive: true });
  el.addEventListener('touchend', off, { passive: true });
  el.addEventListener('touchcancel', off, { passive: true });
  // iOS Safari: stop a pinch on a floating button from zooming the whole page
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
  window.__ikta = { map: map, tiles: tiles, t0: performance.now() };
})();
