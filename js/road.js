// IKTA Bus — place search hints and road routes (free services, no API key).
// Place hints: Photon (photon.komoot.io), an OpenStreetMap search built for type-ahead.
// Road routes: OSRM (routing.openstreetmap.de by FOSSGIS, with the OSRM demo server as backup).
// A driver measures the route once when it changes; the result is saved with the route,
// so passengers never call the router themselves.
import { haversine, buildPath, getMapLang } from './common.js';

// ---------- Place hints ----------
const INDIA_BBOX = '68,6,98,36'; // lon,lat,lon,lat
const TYPE_LABEL = {
  bus_stop: 'Bus stop', bus_station: 'Bus station', station: 'Station', halt: 'Station', platform: 'Platform',
  city: 'City', town: 'Town', village: 'Village', hamlet: 'Village', suburb: 'Area', neighbourhood: 'Area', locality: 'Area', quarter: 'Area',
  hospital: 'Hospital', school: 'School', college: 'College', university: 'University', marketplace: 'Market', place_of_worship: 'Temple / mosque / church',
};
const iconFor = (v) => (/bus/.test(v) ? '🚏' : /station|halt|platform/.test(v) ? '🚉' : /city|town|village|hamlet|suburb|neighbourhood|locality|quarter/.test(v) ? '🏘️' : '📍');
let placeCtl = null;
/** Type-ahead place hints near `near` ({lat,lng}), limited to India. Cancels the previous call. */
export async function searchPlaces(q, near) {
  placeCtl?.abort();
  const ctl = placeCtl = new AbortController();
  // Photon has English and local (OSM "name") names; other map languages fall back to the local name
  const p = new URLSearchParams({ q, limit: '8', bbox: INDIA_BBOX, lang: getMapLang() === 'en' ? 'en' : 'default' });
  if (near) { p.set('lat', near.lat.toFixed(4)); p.set('lon', near.lng.toFixed(4)); p.set('location_bias_scale', '0.4'); }
  const res = await fetch(`https://photon.komoot.io/api/?${p}`, { signal: ctl.signal });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const seen = new Set();
  return (await res.json()).features.map((f) => {
    const pr = f.properties || {};
    const [lng, lat] = f.geometry.coordinates;
    const name = pr.name || [pr.housenumber, pr.street].filter(Boolean).join(' ');
    // Most specific first: road, locality, town, district, state
    const area = [pr.street, pr.locality, pr.city, pr.district, pr.county, pr.state].filter((x, i, a) => x && x !== name && a.indexOf(x) === i);
    return { name, lat, lng, type: TYPE_LABEL[pr.osm_value] || '', icon: iconFor(pr.osm_value || ''), detail: [...area.slice(0, 4), pr.postcode].filter(Boolean).join(', ') };
  }).filter((r) => {
    const k = `${r.name}|${r.detail}`;
    if (!r.name || seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// ---------- Encoded polylines (Google format, precision 5) ----------
export function decodePolyline(str) {
  const out = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let b, shift = 0, v = 0;
      do { b = str.charCodeAt(i++) - 63; v |= (b & 31) << shift; shift += 5; } while (b >= 32);
      const d = v & 1 ? ~(v >> 1) : v >> 1;
      if (k) lng += d; else lat += d;
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

// ---------- Road routing ----------
const ROUTERS = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
  'https://router.project-osrm.org/route/v1/driving/',
];
/** Signature of a stop list: a saved road route is valid only for exactly these stops in this order */
export const stopsSig = (ids) => ids.join('>');

/**
 * Measure the road route through ordered stops ([{lat,lng}]).
 * Returns { poly, km, legs: [metres per leg], idx: [geometry vertex index of each stop] }.
 */
export async function measureRoad(points) {
  if (points.length < 2) return null;
  const coords = points.map((s) => `${(+s.lng).toFixed(6)},${(+s.lat).toFixed(6)}`).join(';');
  let lastErr;
  for (const base of ROUTERS) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(`${base}${coords}?overview=full&geometries=polyline&steps=false&continue_straight=true`, { signal: ctl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`Router error ${res.status}`);
      const j = await res.json();
      if (j.code !== 'Ok' || !j.routes?.[0]) throw new Error(j.message || 'No road route found');
      const r = j.routes[0];
      const pts = decodePolyline(r.geometry);
      const idx = [];
      let from = 0;
      for (const w of j.waypoints) {
        const at = { lat: w.location[1], lng: w.location[0] };
        let best = from, bd = Infinity;
        for (let i = from; i < pts.length; i++) { const d = haversine(pts[i], at); if (d < bd) { bd = d; best = i; } if (bd < 1) break; }
        idx.push(best); from = best;
      }
      return { poly: r.geometry, km: +(r.distance / 1000).toFixed(2), legs: r.legs.map((l) => Math.round(l.distance)), idx };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const decoded = new Map();
/**
 * Path for a saved route: the road geometry when the route has a road measurement for its
 * current stops, otherwise straight lines between stops. `stopAlong[i]` = metres from the
 * source to stop i along the path; `idx[i]` = vertex index of stop i in `points`.
 */
export function routePath(route, stops) {
  const ids = (route?.stops || []).filter((id) => stops[id]);
  const rd = route?.road;
  if (rd?.poly && rd.sig === stopsSig(ids) && rd.idx?.length === ids.length) {
    let pts = decoded.get(rd.poly);
    if (!pts) { pts = decodePolyline(rd.poly); decoded.set(rd.poly, pts); }
    const path = buildPath(pts);
    return { ...path, ids, road: true, km: rd.km, idx: rd.idx, stopAlong: rd.idx.map((i) => path.cum[i]) };
  }
  const path = buildPath(ids.map((id) => stops[id]));
  return { ...path, ids, road: false, km: path.length / 1000, idx: ids.map((_, i) => i), stopAlong: path.cum };
}
