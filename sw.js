// IKTA Bus service worker — instant repeat loads + offline map shell.
const VERSION = 'ikta-v23';
const SHELL = [
  './', 'index.html', 'driver.html', 'owner.html', 'favorites.html', 'coins.html', 'admin.html',
  'css/app.css', 'js/map-boot.js', 'js/common.js', 'js/app-bridge.js', 'js/api.js', 'js/favs.js', 'js/passenger-auth.js', 'js/firebase-config.js',
  'js/passenger.js', 'js/driver.js', 'js/owner.js', 'js/favorites.js', 'js/coins.js', 'js/admin.js',
  'js/backend-firebase.js', 'js/backend-demo.js', 'js/demo-seed.js',
  'js/vector-base.js', 'js/road.js', 'lib/maplibre-gl/maplibre-gl.mjs', 'lib/maplibre-gl/maplibre-gl-shared.mjs',
  'lib/maplibre-gl/maplibre-gl-worker.mjs', 'lib/maplibre-gl/maplibre-gl.css',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
];
const TILE_CACHE = 'ikta-tiles-osm';
const MAX_TILES = 800;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== TILE_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Listing the whole tile cache is slow, so trim at most every 15 s rather than after every tile
let trimAt = 0;
async function trimTiles() {
  if (Date.now() - trimAt < 15000) return;
  trimAt = Date.now();
  const c = await caches.open(TILE_CACHE);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache realtime / auth traffic
  if (/firebaseio\.com|firebasedatabase\.app|googleapis\.com|identitytoolkit|securetoken/.test(url.host)) return;

  // Map tiles: cache-first (tiles rarely change) → instant map on repeat visits & offline
  // OpenFreeMap vector tiles (dated paths), fonts and sprites never change once published
  const ofmStatic = url.host === 'tiles.openfreemap.org' && /\.pbf$|\/sprites\/|\/fonts\//.test(url.pathname);
  if (url.host === 'tile.openstreetmap.org' || ofmStatic) {
    e.respondWith(caches.open(TILE_CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trimTiles(); }
      return res;
    }).catch(() => fetch(req)));
    return;
  }
  // App shell + CDN libraries (Leaflet, Firebase SDK, fonts): stale-while-revalidate
  if (url.origin === location.origin || /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|gstatic\.com|fonts\.googleapis\.com/.test(url.host)) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow('./index.html'))));
});
