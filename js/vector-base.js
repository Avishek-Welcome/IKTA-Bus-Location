// IKTA Bus — vector base map with place names in the reader's language.
// OpenFreeMap (free, no API key) vector tiles drawn by MapLibre GL inside the Leaflet map.
// Leaflet keeps all gestures, markers and routes; MapLibre only paints the base map,
// following Leaflet's center/zoom/bearing every frame. Labels stay upright when the map
// is rotated. If WebGL or the tiles are unavailable the OpenStreetMap raster map stays.
import { Map as GLMap, addProtocol } from '../lib/maplibre-gl/maplibre-gl.mjs';

// Indian scripts (and Arabic for Urdu) are drawn with the phone's own fonts, which shape
// conjuncts and vowel signs correctly; the style's font server may lack those letters.
// Glyph ranges 0x600 and 0x900–0xDFF are routed to a protocol that always fails, which
// makes MapLibre draw those letters locally.
const LOCAL_GLYPH_RANGES = /\/(1536|2304|2560|2816|3072|3328)-\d+\.pbf$/;
addProtocol('ikta-local', () => Promise.reject(new Error('drawn with device fonts')));
const transformRequest = (url, type) => (type === 'Glyphs' && LOCAL_GLYPH_RANGES.test(url) ? { url: 'ikta-local://glyphs' } : { url });

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const ATTR = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const PAD = 0.1; // extra canvas around the screen so edges never show while dragging

// Label text for a language: that language's name, else the name as mapped locally, else English.
function labelExpr(lang) {
  if (lang === 'en') return ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
  return ['coalesce', ['get', `name:${lang}`], ['get', 'name'], ['get', 'name:en']];
}
const isNameLabel = (tf) => tf && /name/.test(JSON.stringify(tf));

// Landmarks people navigate by: shown from street level (Leaflet zoom ~13.5) with their
// icon and name, and preferred over other labels when space is tight. Other shops and
// places appear one zoom level earlier than the style's default.
const LANDMARKS = ['place_of_worship', 'hospital', 'railway', 'school', 'college', 'town_hall', 'police', 'stadium',
  'park', 'attraction', 'monument', 'museum', 'cinema', 'theatre', 'post', 'library', 'ferry_terminal', 'castle',
  'fire_station', 'zoo'];
const RANK = ['match', ['get', 'class'], 'hospital', 0, 'railway', 1, 'place_of_worship', 3, 'college', 4,
  'school', 5, 'police', 6, 'town_hall', 7, 'stadium', 8, 'park', 9, 'attraction', 10, 'monument', 10, 'museum', 10, 20];
function addLandmarks(gl) {
  const layers = gl.getStyle().layers, base = layers.find((l) => l.id === 'poi_r1');
  if (!base || gl.getLayer('ikta_landmarks')) return;
  const isLandmark = ['match', ['get', 'class'], LANDMARKS, true, false];
  for (const [id, min] of [['poi_r1', 14], ['poi_r7', 15], ['poi_r20', 16]]) {
    const l = layers.find((x) => x.id === id);
    if (!l) continue;
    gl.setFilter(id, ['all', l.filter || true, ['!', isLandmark]]);
    gl.setLayerZoomRange(id, min, 24);
  }
  gl.addLayer({
    ...base, id: 'ikta_landmarks', minzoom: 12.5, maxzoom: 24,
    filter: ['all', ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false], ['has', 'name'], isLandmark],
    layout: { ...base.layout, 'symbol-sort-key': RANK, 'icon-size': 1.15, 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11.5, 16, 13.5] },
  }, (() => {
    // just above the style's own POI layers, below area and city names
    let last = -1;
    layers.forEach((l, i) => { if (l.id.startsWith('poi_')) last = i; });
    return layers[last + 1]?.id;
  })());
}

function cssOnce() {
  if (document.getElementById('maplibre-css')) return;
  const l = document.createElement('link');
  l.id = 'maplibre-css'; l.rel = 'stylesheet';
  l.href = new URL('../lib/maplibre-gl/maplibre-gl.css', import.meta.url).href;
  document.head.appendChild(l);
}

export function addVectorBase(map, { raster, lang }) {
  cssOnce();
  const el = L.DomUtil.create('div', 'ikta-gl-base');
  map.getPane('tilePane').appendChild(el);
  let gl;
  try {
    gl = new GLMap({
      container: el, style: STYLE_URL, transformRequest, interactive: false, attributionControl: false,
      pixelRatio: Math.min(devicePixelRatio || 1, 2), fadeDuration: 0, maxZoom: 19,
      center: [map.getCenter().lng, map.getCenter().lat], zoom: map.getZoom() - 1,
    });
  } catch (e) {
    el.remove(); // no WebGL: keep the raster map
    return null;
  }
  const bearing = () => (map.getBearing ? map.getBearing() : 0);

  // Place the canvas centered on the screen, axis-aligned on screen even when the
  // Leaflet panes are rotated, and point MapLibre at the same view.
  let w = 0, h = 0;
  const resize = () => {
    const s = map.getSize();
    w = Math.round(s.x * (1 + 2 * PAD)); h = Math.round(s.y * (1 + 2 * PAD));
    el.style.width = `${w}px`; el.style.height = `${h}px`;
    gl.resize();
  };
  const sync = (center = map.getCenter(), zoom = map.getZoom()) => {
    const s = map.getSize(), b = bearing();
    const c = map.containerPointToLayerPoint([s.x / 2, s.y / 2]);
    el.style.transform = `translate3d(${Math.round(c.x - w / 2)}px, ${Math.round(c.y - h / 2)}px, 0) rotate(${-b}deg)`;
    gl.jumpTo({ center: [center.lng, center.lat], zoom: zoom - 1, bearing: -b });
  };
  resize(); sync();

  // Animated zooms (buttons, double-tap) scale Leaflet layers with CSS; ease MapLibre alongside.
  const onZoomAnim = (e) => {
    gl.easeTo({ center: [e.center.lng, e.center.lat], zoom: e.zoom - 1, bearing: -bearing(), duration: 250, easing: (t) => 1 - (1 - t) ** 3 });
  };
  let animating = false;
  map.on('zoomanim', (e) => { animating = true; onZoomAnim(e); });
  map.on('zoomend', () => { animating = false; sync(); });
  // One frame can fire several of these (the driver's map turns and pans together);
  // follow them once, still before the frame is painted.
  let queued = false;
  const syncSoon = () => {
    if (animating || queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; if (!animating) sync(); });
  };
  map.on('move rotate viewreset', syncSoon);
  map.on('resize', () => { resize(); sync(); });

  const layer = {
    gl, el, lang: null,
    setLanguage(l) {
      this.lang = l;
      if (!styleReady) return; // isStyleLoaded() is still false while sources load
      for (const ly of gl.getStyle().layers) {
        if (ly.type !== 'symbol') continue;
        if (isNameLabel(gl.getLayoutProperty(ly.id, 'text-field'))) gl.setLayoutProperty(ly.id, 'text-field', labelExpr(l));
      }
    },
  };
  let styleReady = false;
  gl.on('style.load', () => { styleReady = true; addLandmarks(gl); layer.setLanguage(layer.lang); });
  layer.setLanguage(lang);
  // Swap the raster map out once the vector map has actually drawn tiles
  // (if the tile server can't be reached, the raster map simply stays).
  let tiles = 0;
  gl.on('data', (e) => { if (e.dataType === 'source' && e.tile) tiles++; });
  const swap = () => {
    if (!tiles) return;
    gl.off('idle', swap);
    el.classList.add('ready');
    if (raster && map.hasLayer(raster)) setTimeout(() => map.removeLayer(raster), 350);
    map.attributionControl?.addAttribution(ATTR);
  };
  gl.on('idle', swap);
  return layer;
}
