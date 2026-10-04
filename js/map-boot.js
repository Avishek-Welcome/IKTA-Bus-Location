// IKTA Bus — critical-path map bootstrap (classic script, runs right after Leaflet).
// Creates the map and starts tile downloads immediately from the last viewed
// position, before any app module, Firebase SDK or GPS fix is available.
(function () {
  var el = document.getElementById('map');
  if (!window.L || !el) return;
  var v = null, theme = null;
  try { v = JSON.parse(localStorage.getItem('ikta_last_view')); theme = JSON.parse(localStorage.getItem('ikta_theme')); } catch (e) { /* ignore */ }
  v = v || { lat: 22.6757, lng: 88.4512, zoom: 12 };
  var dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  var map = L.map(el, { zoomControl: false, preferCanvas: true, zoomSnap: 0.5 }).setView([v.lat, v.lng], v.zoom);
  var tiles = L.tileLayer(dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 20, keepBuffer: 3,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }).addTo(map);
  map.on('moveend', function () {
    var c = map.getCenter();
    try { localStorage.setItem('ikta_last_view', JSON.stringify({ lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: map.getZoom() })); } catch (e) { /* ignore */ }
  });
  window.__ikta = { map: map, tiles: tiles, t0: performance.now() };
})();
