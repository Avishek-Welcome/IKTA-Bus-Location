// IKTA Bus — critical-path map bootstrap (classic script, runs right after Leaflet).
// Creates the map and starts tile downloads immediately from the last viewed
// position, before any app module, Firebase SDK or GPS fix is available.
(function () {
  var el = document.getElementById('map');
  if (!window.L || !el) return;
  var v = null;
  try { v = JSON.parse(localStorage.getItem('ikta_last_view')); } catch (e) { /* ignore */ }
  v = v || { lat: 22.6757, lng: 88.4512, zoom: 12 };
  var map = L.map(el, { zoomControl: false, preferCanvas: true, zoomSnap: 0.5 }).setView([v.lat, v.lng], v.zoom);
  // OpenStreetMap standard tiles (no API key needed); dark mode = CSS filter in app.css
  var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, keepBuffer: 3,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  map.on('moveend', function () {
    var c = map.getCenter();
    try { localStorage.setItem('ikta_last_view', JSON.stringify({ lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: map.getZoom() })); } catch (e) { /* ignore */ }
  });
  window.__ikta = { map: map, tiles: tiles, t0: performance.now() };
})();
