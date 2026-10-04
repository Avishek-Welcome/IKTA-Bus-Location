// IKTA Bus — shared UI helpers, geo math and constants (no external deps)

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Icons (inline SVG, stroke = currentColor) ----------
const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONS = {
  bus: P('<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 21v-3M16 21v-3"/><circle cx="8" cy="14.5" r="1"/><circle cx="16" cy="14.5" r="1"/>'),
  user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  wheel: P('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v6.5M4.2 15.5l5.6-2.3M19.8 15.5l-5.6-2.3"/>'),
  briefcase: P('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>'),
  map: P('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'),
  star: P('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  starFill: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  coin: P('<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.5-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.5-2.5-1.5M12 6.5V8M12 16v1.5"/>'),
  locate: P('<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/>'),
  bell: P('<path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16z"/><path d="M10 21a2 2 0 0 0 4 0"/>'),
  bellOff: P('<path d="M18 16v-5a6 6 0 0 0-9.5-4.9M6 9.5V16l-2 2h14"/><path d="M10 21a2 2 0 0 0 4 0M3 3l18 18"/>'),
  swap: P('<path d="M7 4v16M7 4 3 8M7 4l4 4M17 20V4M17 20l-4-4M17 20l4-4"/>'),
  search: P('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  moon: P('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  eye: P('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: P('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  trash: P('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>'),
  edit: P('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  key: P('<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14.5 8.5l2 2"/>'),
  logout: P('<path d="M15 4h4v16h-4M10 17l5-5-5-5M15 12H3"/>'),
  up: P('<path d="m6 15 6-6 6 6"/>'),
  down: P('<path d="m6 9 6 6 6-6"/>'),
  pin: P('<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>'),
  route: P('<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5"/>'),
  radio: P('<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>'),
  stop: P('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  share: P('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
  copy: P('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
  shield: P('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  list: P('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  arrow: P('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  close: P('<path d="M6 6l12 12M18 6 6 18"/>'),
  crowd: P('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.8-3.5 3.2-5 6-5s5.2 1.5 6 5M15 15.2c2.5-.4 4.8.9 6 4.8"/>'),
  sparkle: P('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
};
export const icon = (name) => ICONS[name] || '';
export function hydrateIcons(root = document) {
  $$('[data-icon]', root).forEach((el) => { if (!el.firstElementChild) el.innerHTML = icon(el.dataset.icon); });
}

// ---------- Safe storage ----------
export const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota / private mode */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

// ---------- Theme ----------
export function initTheme() {
  const saved = store.get('ikta_theme');
  if (saved) document.documentElement.dataset.theme = saved;
  const btn = $('#themeBtn');
  const paint = () => { if (btn) btn.innerHTML = icon(isDark() ? 'sun' : 'moon'); };
  paint();
  btn?.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('ikta_theme', next);
    paint();
    document.dispatchEvent(new CustomEvent('themechange', { detail: next }));
  });
}
export function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

// ---------- Toasts ----------
let toastHost;
export function toast(msg, type = '', ms = 3200) {
  if (!toastHost) { toastHost = document.createElement('div'); toastHost.className = 'toast-host'; toastHost.setAttribute('aria-live', 'polite'); document.body.appendChild(toastHost); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  toastHost.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
}

// ---------- Modal (returns a promise) ----------
export function modal({ title, html = '', okText = 'OK', cancelText = 'Cancel', danger = false, onOpen, validate } = {}) {
  return new Promise((resolve) => {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h3>${esc(title)}</h3><div class="modal-body">${html}</div>
      <div class="error-text" data-err></div>
      <div class="actions">${cancelText ? `<button class="btn btn-ghost" data-act="cancel">${esc(cancelText)}</button>` : ''}
      ${okText ? `<button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(okText)}</button>` : ''}</div></div>`;
    const close = (val) => { bd.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
    const ok = async () => {
      const box = bd.querySelector('.modal');
      if (validate) {
        try {
          const res = await validate(box);
          if (res === false) return;
          close(res === undefined ? true : res);
        } catch (e) { bd.querySelector('[data-err]').textContent = e.message || String(e); }
      } else close(true);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    bd.addEventListener('click', (e) => {
      if (e.target === bd) close(null);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel') close(null);
      if (act === 'ok') ok();
    });
    bd.addEventListener('submit', (e) => { e.preventDefault(); ok(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(bd);
    hydrateIcons(bd);
    onOpen?.(bd.querySelector('.modal'), close);
    bd.querySelector('input,select,textarea')?.focus();
  });
}
export const confirmBox = (title, text, okText = 'Confirm', danger = false) =>
  modal({ title, html: `<p class="muted">${esc(text)}</p>`, okText, danger });
export function promptBox(title, label, value = '', placeholder = '') {
  return modal({
    title,
    html: `<form><label class="field"><span>${esc(label)}</span><input class="input" name="v" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></label></form>`,
    okText: 'Save',
    validate: (box) => {
      const v = box.querySelector('[name=v]').value.trim();
      if (!v) throw new Error('Please enter a value');
      return v;
    },
  });
}

export function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.innerHTML; btn.innerHTML = `<span class="spin"></span>${label ? esc(label) : ''}`; btn.disabled = true; }
  else { btn.innerHTML = btn.dataset.label || btn.innerHTML; btn.disabled = false; }
}

// ---------- Geo ----------
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function bearing(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
/** Build a measurable path from ordered points [{lat,lng}] */
export function buildPath(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + haversine(points[i - 1], points[i]));
  return { points, cum, length: cum[cum.length - 1] || 0 };
}
/** Project a point onto a path → { along: metres from path start, offset: metres off the path, seg } */
export function projectOnPath(path, p) {
  let best = { along: 0, offset: Infinity, seg: 0 };
  const pts = path.points;
  if (pts.length === 1) return { along: 0, offset: haversine(pts[0], p), seg: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    // local equirectangular metres around a
    const kx = Math.cos(rad(a.lat)) * R * Math.PI / 180, ky = R * Math.PI / 180;
    const bx = (b.lng - a.lng) * kx, by = (b.lat - a.lat) * ky;
    const px = (p.lng - a.lng) * kx, py = (p.lat - a.lat) * ky;
    const len2 = bx * bx + by * by;
    const t = len2 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
    const dx = px - t * bx, dy = py - t * by;
    const off = Math.sqrt(dx * dx + dy * dy);
    if (off < best.offset) best = { along: path.cum[i] + t * Math.sqrt(len2), offset: off, seg: i };
  }
  return best;
}
export function fmtDist(m) {
  if (m == null || !isFinite(m)) return '—';
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
export function fmtEta(sec) {
  if (sec == null || !isFinite(sec)) return '—';
  if (sec < 60) return '<1';
  const m = Math.round(sec / 60);
  return m < 60 ? `${m}` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}
export function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

// ---------- Domain helpers ----------
/** Firebase-safe, normalised key for bus names and registration numbers ("WB 23A-4567" → "WB23A4567") */
export const keyOf = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const ROLE_DOMAIN = { owner: 'owner.ikta-bus.app', driver: 'driver.ikta-bus.app', admin: 'admin.ikta-bus.app' };
export function idToEmail(userId, role) {
  const id = String(userId).trim().toLowerCase();
  return id.includes('@') ? id : `${id}@${ROLE_DOMAIN[role]}`;
}
export const USER_ID_RE = /^[a-z0-9][a-z0-9_-]{3,19}$/; // no '.', which Firebase keys forbid
export function passwordChecks(pw) {
  return {
    len: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /\d/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
}
export const passwordOk = (pw) => Object.values(passwordChecks(pw)).every(Boolean);
export function generatePassword(len = 12) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#%&*!?'];
  const all = sets.join('');
  const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const out = sets.map((s) => s[rnd(s.length)]);
  while (out.length < len) out.push(all[rnd(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}
/** Wire a password input to a strength bar + requirement list */
export function attachStrength(input, bar, list) {
  const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981'];
  const upd = () => {
    const c = passwordChecks(input.value);
    const n = Object.values(c).filter(Boolean).length;
    if (bar) { bar.style.width = `${(n / 5) * 100}%`; bar.style.background = colors[Math.max(0, n - 1)]; }
    if (list) Object.entries(c).forEach(([k, v]) => list.querySelector(`[data-req=${k}]`)?.classList.toggle('ok', v));
  };
  input.addEventListener('input', upd);
  upd();
}
export function wirePasswordToggles(root = document) {
  $$('[data-toggle-pw]', root).forEach((b) => {
    b.innerHTML = icon('eye');
    b.addEventListener('click', () => {
      const inp = b.parentElement.querySelector('input');
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      b.innerHTML = icon(show ? 'eyeOff' : 'eye');
    });
  });
}

export const CROWD = {
  empty: { label: 'Seats free', emoji: '🟢', cls: 'ok' },
  moderate: { label: 'Standing', emoji: '🟡', cls: 'warn' },
  crowded: { label: 'Crowded', emoji: '🔴', cls: 'bad' },
  packed: { label: 'Packed', emoji: '⛔', cls: 'dark' },
};
export const BUS_COLORS = ['#2f5bff', '#10b981', '#8b5cf6', '#f97316', '#ec4899', '#0ea5e9', '#eab308', '#ef4444', '#14b8a6', '#6366f1'];
export function colorFor(key) {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BUS_COLORS[h % BUS_COLORS.length];
}
export const LIVE_FRESH_MS = 3 * 60 * 1000;

export function friendlyError(e) {
  const code = e?.code || '';
  const map = {
    'auth/invalid-credential': 'Wrong user ID or password.',
    'auth/wrong-password': 'Wrong user ID or password.',
    'auth/user-not-found': 'No account found with this user ID.',
    'auth/email-already-in-use': 'This user ID is already taken.',
    'auth/too-many-requests': 'Too many attempts. Please wait a minute and try again.',
    'auth/network-request-failed': 'Network error. Check your internet connection.',
    'auth/weak-password': 'Password is too weak.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Authentication.',
    'auth/admin-restricted-operation': 'Anonymous sign-in is disabled in Firebase Authentication.',
    PERMISSION_DENIED: 'Permission denied by database security rules.',
  };
  if (map[code]) return map[code];
  if (/permission[_ ]denied/i.test(e?.message || '')) return map.PERMISSION_DENIED;
  return e?.message || String(e);
}

// ---------- Alert tone (Web Audio — no audio file download needed) ----------
let audioCtx;
export function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* unsupported */ }
}
export function playAlertTone() {
  unlockAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  [0, 0.28, 0.56, 1.1, 1.38, 1.66].forEach((t, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = i % 3 === 2 ? 1175 : 880;
    g.gain.setValueAtTime(0.0001, now + t);
    g.gain.exponentialRampToValueAtTime(0.35, now + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.24);
    o.connect(g).connect(audioCtx.destination);
    o.start(now + t);
    o.stop(now + t + 0.26);
  });
  navigator.vibrate?.([300, 120, 300, 120, 600]);
}

// ---------- Leaflet helpers ----------
export const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
export const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
export const DEFAULT_VIEW = { lat: 22.6757, lng: 88.4512, zoom: 12 }; // North Kolkata

export function createMap(el, { view, zoomControl = false } = {}) {
  const v = view || store.get('ikta_last_view') || DEFAULT_VIEW;
  const map = L.map(el, { zoomControl, attributionControl: true, preferCanvas: true, zoomSnap: 0.5, tap: true })
    .setView([v.lat, v.lng], v.zoom);
  let layer = L.tileLayer(isDark() ? TILE_DARK : TILE_LIGHT, {
    attribution: TILE_ATTR, subdomains: 'abcd', maxZoom: 20, detectRetina: false, updateWhenIdle: false, keepBuffer: 3,
  }).addTo(map);
  document.addEventListener('themechange', () => { layer.setUrl(isDark() ? TILE_DARK : TILE_LIGHT); });
  map.on('moveend', () => {
    const c = map.getCenter();
    store.set('ikta_last_view', { lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: map.getZoom() });
  });
  return map;
}
export function busIcon(name, color, { stale = false, dim = false, heading = null } = {}) {
  return L.divIcon({
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -18],
    html: `<div class="bus-marker ${stale ? 'stale' : ''} ${dim ? 'dim' : ''}" style="--c:${color}">
      ${heading != null ? `<div class="arrow" style="transform:rotate(${Math.round(heading)}deg)"></div>` : ''}
      <div class="pin">${ICONS.bus}</div><div class="label">${esc(name)}</div></div>`,
  });
}
export function meIcon() { return L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: '<div class="me-marker"></div>' }); }
export function stopIcon(kind = '', label = '') {
  return L.divIcon({
    className: '', iconSize: [20, 20], iconAnchor: [10, 10],
    html: `<div style="position:relative;display:grid;place-items:center;width:20px;height:20px"><div class="stop-marker ${kind}"></div>${label ? `<span class="stop-label" style="position:absolute;left:4px;top:50%">${esc(label)}</span>` : ''}</div>`,
  });
}
/** Smoothly glide a Leaflet marker to a new position (keeps motion fluid between 2s GPS updates) */
export function glide(marker, to, ms = 900) {
  const from = marker.getLatLng();
  if (!from || (from.lat === to.lat && from.lng === to.lng)) return marker.setLatLng(to);
  if (haversine(from, to) > 2000 || document.hidden) return marker.setLatLng(to);
  cancelAnimationFrame(marker._glide);
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
    marker.setLatLng([from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e]);
    if (k < 1) marker._glide = requestAnimationFrame(step);
  };
  marker._glide = requestAnimationFrame(step);
}

// ---------- Boot ----------
export function registerSW() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}
export function boot() {
  hydrateIcons();
  initTheme();
  registerSW();
}
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
