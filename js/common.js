// IKTA Bus — shared UI helpers, geo math and constants (no external deps)
import './app-bridge.js'; // first, so pages see the phone app's GPS before they ask for it

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
  navigate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 19.5 20 12 16.2 4.5 20z" fill="currentColor"/></svg>',
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
  compass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 15.5 12h-7z" fill="#ef4444"/><path d="M12 21.5 8.5 12h7z" fill="currentColor" opacity=".45"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>',
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
// OpenStreetMap standard tiles: free, no API key. Dark mode is a CSS filter on the tile pane (css/app.css).
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const DEFAULT_VIEW = { lat: 22.6757, lng: 88.4512, zoom: 12 }; // North Kolkata

// Touch-friendly tuning: smooth momentum after a flick, finer pinch-zoom steps,
// and tiles that keep loading while the finger is still moving.
// js/map-boot.js repeats these values (it is a classic script and cannot import).
// rotate/touchRotate are read by the leaflet-rotate plugin (two-finger rotation); without it they are ignored.
export const MAP_OPTS = {
  rotate: true, touchRotate: true, rotateControl: false, bearing: 0,
  preferCanvas: true, zoomSnap: 0.25, zoomDelta: 1, bounceAtZoomLimits: false,
  inertia: true, inertiaDeceleration: 2200, inertiaMaxSpeed: 2000, easeLinearity: 0.2,
  tapTolerance: 20, wheelPxPerZoomLevel: 90,
};
export const TILE_OPTS = { maxZoom: 19, updateWhenIdle: false, updateWhenZooming: false, keepBuffer: 4 };

// Sets map._iktaTouching while fingers are on the map, so code that recenters the
// map on GPS updates can wait instead of yanking it away mid-gesture.
export function trackTouch(map) {
  const el = map.getContainer();
  const on = () => { map._iktaTouching = true; };
  const off = (e) => { if (!e.touches || !e.touches.length) map._iktaTouching = false; };
  el.addEventListener('touchstart', on, { passive: true });
  el.addEventListener('touchend', off, { passive: true });
  el.addEventListener('touchcancel', off, { passive: true });
}
export const userMovingMap = (map) => !!(map._iktaTouching || map._animatingZoom);

// iOS Safari ignores user-scalable=no, so a pinch that starts on a floating button
// zooms the whole page; full-screen map pages block that page zoom.
export function blockPageZoom() {
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
}

// leaflet-rotate starts rotating on the first pixel of a pinch, so every zoom also
// tilts the map a little. Hold rotation back until the fingers have turned ~15°.
const ROTATE_THRESHOLD = 15;
function addRotateThreshold() {
  const TG = window.L?.Map?.TouchGestures;
  if (!TG || TG.prototype._iktaPatched) return;
  const proto = TG.prototype, start = proto._onTouchStart, move = proto._onTouchMove;
  const angle = (e) => { const a = e.touches[0], b = e.touches[1]; return Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180 / Math.PI; };
  proto._onTouchStart = function (e) {
    start.call(this, e);
    if (this._rotating) { this._iktaLocked = true; this._iktaAngle0 = angle(e); }
  };
  proto._onTouchMove = function (e) {
    if (this._iktaLocked && e.touches && e.touches.length === 2) {
      let d = Math.abs(angle(e) - this._iktaAngle0) % 360;
      if (d > 180) d = 360 - d;
      if (d < ROTATE_THRESHOLD) {
        this._rotating = false; move.call(this, e); this._rotating = true;
        return;
      }
      // Unlock: restart the rotation from here so the map doesn't jump by the threshold
      this._iktaLocked = false;
      this._map.fire('userrotate');
      const map = this._map, v = map.mouseEventToContainerPoint(e.touches[0]).subtract(map.mouseEventToContainerPoint(e.touches[1]));
      this._startTheta = Math.atan(v.x / v.y);
      this._startBearing = map.getBearing() + (v.y < 0 ? 180 : 0);
    }
    move.call(this, e);
  };
  proto._iktaPatched = true;
}

// Rotation support for a map: CSS var --map-bearing (keeps bus heading arrows pointing
// the right way while markers stay upright) and an optional compass button that shows
// north and turns the map back to north when tapped.
export function setupRotation(map, compassBtn) {
  if (!map.setBearing) { compassBtn?.classList.add('hidden'); return; }
  // The handler bound its touchstart listener when the map was created, so re-bind it
  // after patching for the threshold to apply to this map too.
  const tg = map.touchGestures, on = tg?.enabled();
  if (on) tg.disable();
  addRotateThreshold();
  if (on) tg.enable();
  const el = map.getContainer();
  const sync = () => {
    const b = map.getBearing();
    el.style.setProperty('--map-bearing', `${b}deg`);
    if (compassBtn) {
      compassBtn.style.setProperty('--needle', `${b}deg`);
      const off = Math.min(b, 360 - b) < 0.5;
      compassBtn.classList.toggle('north', off);
      compassBtn.setAttribute('aria-hidden', off);
      compassBtn.tabIndex = off ? -1 : 0;
    }
  };
  map.on('rotate', sync);
  sync();
  compassBtn?.addEventListener('click', () => {
    let from = map.getBearing(); if (from > 180) from -= 360;
    const t0 = performance.now(), ms = 350;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
      map.setBearing(from * (1 - e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// ---------- Bottom sheet swipe (phones) ----------
// Three snap states via classes: collapsed (peek) → half → full. The sheet follows the
// finger and snaps on release: swipe up to expand, down to minimise. A swipe that
// starts inside the list scrolls the list instead while it is expanded and not at the top.
const SHEET_ORDER = ['collapsed', 'half', 'full'];
export const sheetStateOf = (sheet) => (sheet.classList.contains('away') ? 'hidden' : sheet.classList.contains('collapsed') ? 'collapsed' : sheet.classList.contains('half') ? 'half' : 'full');
// 'hidden' tucks the panel fully away (pages that allow it show their own button to bring it back)
export function setSheetState(sheet, st) {
  sheet.classList.toggle('away', st === 'hidden');
  sheet.classList.toggle('collapsed', st === 'collapsed' || st === 'hidden');
  sheet.classList.toggle('half', st === 'half');
  sheet.dispatchEvent(new CustomEvent('sheetstate', { detail: st }));
}
export function sheetSwipe(sheet, { handle = sheet.querySelector('.sheet-handle'), body = sheet.querySelector('.sheet-body'), hideable = false } = {}) {
  const order = hideable ? ['hidden', ...SHEET_ORDER] : SHEET_ORDER;
  let g = null, swallowClick = false;
  const translateOf = () => { const m = getComputedStyle(sheet).transform; return m && m !== 'none' ? new DOMMatrixReadOnly(m).m42 : 0; };
  handle?.addEventListener('click', () => {
    if (swallowClick) return;
    setSheetState(sheet, { collapsed: 'half', half: 'full', full: 'collapsed' }[sheetStateOf(sheet)]);
  });
  handle?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handle.click(); } });
  sheet.addEventListener('touchstart', (e) => {
    if (innerWidth >= 900 || e.touches.length !== 1) { g = null; return; }
    const t = e.touches[0];
    g = { x0: t.clientX, y0: t.clientY, y: t.clientY, t: performance.now(), v: 0, on: false, fromHandle: !!handle?.contains(e.target),
      inBody: !!body?.contains(e.target), base: translateOf(), st: sheetStateOf(sheet) };
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (!g) return;
    const t = e.touches[0], dy = t.clientY - g.y0, dx = t.clientX - g.x0, now = performance.now();
    if (!g.on) {
      if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(dx)) return;
      const listScrolled = g.inBody && body.scrollTop > 0;
      const canScrollList = g.inBody && (dy < 0 ? g.st === 'full' : listScrolled);
      if (!g.fromHandle && canScrollList) { g = null; return; }
      g.on = true;
      sheet.style.transition = 'none';
      document.activeElement?.blur?.();
    }
    e.preventDefault();
    g.v = (t.clientY - g.y) / Math.max(1, now - g.t); g.y = t.clientY; g.t = now;
    // follow the finger downwards; upwards only a short rubber-band (height grows on snap)
    const off = dy > 0 ? dy : (g.base > 0 ? Math.max(-g.base, dy) : dy * 0.25);
    sheet.style.transform = `translateY(${g.base + off}px)`;
  }, { passive: false });
  const end = () => {
    if (!g) return;
    const { on, y, y0, v, st } = g; g = null;
    if (!on) return;
    sheet.style.transition = ''; sheet.style.transform = '';
    swallowClick = true; setTimeout(() => { swallowClick = false; }, 350);
    const dy = y - y0, i = order.indexOf(st);
    const fling = Math.abs(v) > 0.45, far = Math.abs(dy) > 260;
    let next = st;
    if (dy > 50 || (fling && v > 0)) next = order[Math.max(0, i - (far ? 2 : 1))];
    else if (dy < -40 || (fling && v < 0)) next = order[Math.min(order.length - 1, i + (far ? 2 : 1))];
    setSheetState(sheet, next);
  };
  sheet.addEventListener('touchend', end, { passive: true });
  sheet.addEventListener('touchcancel', end, { passive: true });
}

// ---------- Map language (place names) ----------
// Vector base map labels use OSM's name:<lang> tags; places without one show their local name.
export const MAP_LANGS = [
  ['bn', 'বাংলা', 'অ'], ['hi', 'हिन्दी', 'अ'], ['ta', 'தமிழ்', 'அ'], ['te', 'తెలుగు', 'అ'], ['kn', 'ಕನ್ನಡ', 'ಅ'],
  ['ml', 'മലയാളം', 'അ'], ['mr', 'मराठी', 'म'], ['gu', 'ગુજરાતી', 'અ'], ['pa', 'ਪੰਜਾਬੀ', 'ਅ'], ['or', 'ଓଡ଼ିଆ', 'ଅ'],
  ['ur', 'اردو', 'ا'], ['en', 'English', 'A'],
];
export function getMapLang() {
  const saved = store.get('ikta_map_lang');
  if (saved && MAP_LANGS.some(([c]) => c === saved)) return saved;
  // Phone set to an Indian language → use it; otherwise Bengali (IKTA runs in Kolkata)
  const dev = (navigator.languages || [navigator.language || '']).map((l) => String(l).slice(0, 2).toLowerCase());
  return dev.find((d) => d !== 'en' && MAP_LANGS.some(([c]) => c === d)) || 'bn';
}
const langListeners = new Set();
export function setMapLang(code) {
  store.set('ikta_map_lang', code);
  langListeners.forEach((fn) => fn(code));
}
// Switch a map from OSM raster tiles to the vector map with local-language names.
export function upgradeMap(map, raster = map._iktaTiles) {
  if (map._iktaVector) return;
  map._iktaVector = true;
  const go = () => import('./vector-base.js').then(({ addVectorBase }) => {
    const v = addVectorBase(map, { raster, lang: getMapLang() });
    if (v) langListeners.add((c) => v.setLanguage(c));
  }).catch(() => { /* keep raster map */ });
  if (document.readyState === 'complete') setTimeout(go, 0); else addEventListener('load', () => setTimeout(go, 0), { once: true });
}
// Language pickers: a <select> anywhere (map button or panel); all stay in sync.
// The choice is saved on this phone only, so each passenger keeps their own.
export function mapLangSelect(sel, onShow) {
  if (!sel) return;
  sel.innerHTML = MAP_LANGS.map(([c, n]) => `<option value="${c}">${n}</option>`).join('');
  const show = (c) => { sel.value = c; onShow?.(c); };
  show(getMapLang());
  langListeners.add(show);
  sel.addEventListener('change', () => { setMapLang(sel.value); toast(`Map names: ${sel.selectedOptions[0].textContent}`); });
}
// A map button with a native language picker inside it.
export function mapLangPicker(btn) {
  if (!btn) return;
  const glyph = btn.querySelector('.glyph');
  mapLangSelect(btn.querySelector('select'), (c) => { glyph.textContent = (MAP_LANGS.find(([x]) => x === c) || MAP_LANGS[0])[2]; });
}

export function createMap(el, { view, zoomControl = false } = {}) {
  const v = view || store.get('ikta_last_view') || DEFAULT_VIEW;
  const map = L.map(el, { ...MAP_OPTS, zoomControl, attributionControl: true })
    .setView([v.lat, v.lng], v.zoom);
  map._iktaTiles = L.tileLayer(TILE_URL, { ...TILE_OPTS, attribution: TILE_ATTR }).addTo(map);
  map.on('moveend', () => {
    const c = map.getCenter();
    store.set('ikta_last_view', { lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: map.getZoom() });
  });
  trackTouch(map);
  upgradeMap(map);
  return map;
}
// ---------- Live speed ----------
// km/h from m/s; under 2 km/h is GPS drift on a parked bus → "stopped"
export const kmh = (ms) => Math.round((ms || 0) * 3.6);
export const speedClass = (ms) => { const k = kmh(ms); return k < 2 ? 'stopped' : k < 15 ? 'slow' : 'moving'; };
// Speed pill for cards and popups: a small dial plus the number, coloured by stopped / slow / moving
export function speedChip(ms) {
  const k = kmh(ms), cls = speedClass(ms);
  const sweep = Math.min(1, k / 60); // dial fills up to 60 km/h
  return `<span class="speed-chip ${cls}" title="Live speed"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 14.5a7.5 7.5 0 1 1 13 0" class="trk"/><path d="M3.5 14.5a7.5 7.5 0 1 1 13 0" class="val" pathLength="1" style="stroke-dasharray:${sweep.toFixed(2)} 1"/></svg>${cls === 'stopped' ? 'Stopped' : `<b>${k}</b> km/h`}</span>`;
}
// Update a bus marker's speed badge in place
// Round speedometer over a map: the arc fills up to 80 km/h, green → amber (50) → red (65),
// grey at 0 km/h. Always on screen; shows "--" when there is no live speed. Optional caption
// under the dial (the bus's name).
const SPEEDO_MAX = 80;
export function speedo(host, extraClass = '') {
  const el = document.createElement('div');
  el.className = `speedo none ${extraClass}`;
  el.setAttribute('role', 'img');
  el.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="42" pathLength="1"/><circle class="val" cx="50" cy="50" r="42" pathLength="1"/></svg><div class="read"><b class="num">--</b><span>km/h</span></div><div class="cap hidden"></div>';
  host.appendChild(el);
  return {
    el,
    set(ms, label) {
      const k = kmh(ms), cls = k < 2 ? 'stopped' : k < 50 ? 'ok' : k < 65 ? 'fast' : 'over';
      el.className = `speedo ${cls} ${extraClass}`;
      el.querySelector('.val').style.strokeDasharray = `${Math.min(1, k / SPEEDO_MAX) * 0.75} 1`;
      el.querySelector('.num').textContent = k;
      const cap = el.querySelector('.cap');
      cap.classList.toggle('hidden', !label);
      if (label && cap.textContent !== label) cap.textContent = label;
      el.setAttribute('aria-label', `${label ? `${label}: ` : ''}${k} km/h`);
    },
    // no live bus / no GPS yet: an empty dial with "--"
    empty(label) {
      el.className = `speedo none ${extraClass}`;
      el.querySelector('.val').style.strokeDasharray = '0 1';
      el.querySelector('.num').textContent = '--';
      const cap = el.querySelector('.cap');
      cap.classList.toggle('hidden', !label);
      if (label) cap.textContent = label;
      el.setAttribute('aria-label', `${label ? `${label}: ` : ''}speed not available`);
    },
  };
}
export function setBusSpeed(marker, ms) {
  const el = marker.getElement()?.querySelector('.spd');
  if (!el) return;
  const cls = speedClass(ms), txt = cls === 'stopped' ? '■' : String(kmh(ms));
  if (el.textContent !== txt) el.textContent = txt;
  el.className = `spd ${cls}`;
}
export function busIcon(name, color, { stale = false, dim = false, heading = null, speed = null } = {}) {
  return L.divIcon({
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -18],
    html: `<div class="bus-marker ${stale ? 'stale' : ''} ${dim ? 'dim' : ''}" style="--c:${color}">
      ${heading != null ? `<div class="arrow" style="--h:${Math.round(heading)}deg"><svg viewBox="0 0 24 24"><path d="M12 1 21 19 12 14.5 3 19z"/></svg></div>` : ''}
      <div class="pin">${ICONS.bus}</div><div class="label">${esc(name)}</div>
      ${speed != null ? `<div class="spd ${speedClass(speed)}">${speedClass(speed) === 'stopped' ? '■' : kmh(speed)}</div>` : ''}</div>`,
  });
}
// Turn a bus marker's arrow to `heading` the short way round (CSS animates it) without
// rebuilding the marker. Returns false when the marker has no arrow yet (rebuild the icon).
export function setBusHeading(marker, heading) {
  const el = marker.getElement()?.querySelector('.arrow');
  if (heading == null || !el) return false;
  const prev = marker._h ?? heading;
  marker._h = prev + (((heading - prev + 540) % 360) - 180);
  el.style.setProperty('--h', `${marker._h}deg`);
  return true;
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
// iPhone/iPad browsers have no install button: say once how to add the app to the home screen
function iosInstallHint() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios || navigator.standalone || window.IKTAApp) return;
  try { if (localStorage.getItem('ikta_ios_hint')) return; localStorage.setItem('ikta_ios_hint', '1'); } catch { return; }
  setTimeout(() => toast('Install IKTA Bus: tap Share, then "Add to Home Screen".', '', 9000), 2500);
}
export function boot() {
  hydrateIcons();
  initTheme();
  registerSW();
  iosInstallHint();
}
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
