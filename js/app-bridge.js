// IKTA Bus — inside the Android app (android/), use the phone's own GPS, notifications and
// screen-on through window.IKTAApp. The app's GPS keeps running while a driver shares with
// the screen off, which the WebView's built-in geolocation can't promise.
// In a normal browser window.IKTAApp doesn't exist and this file does nothing.
const app = window.IKTAApp;

if (app) {
  // ---------- navigator.geolocation ----------
  const watchers = new Map();
  let nextId = 1, last = null;
  const toPos = (f) => ({
    coords: { latitude: f.lat, longitude: f.lng, accuracy: f.acc, altitude: f.alt, altitudeAccuracy: null, heading: f.heading, speed: f.speed },
    timestamp: f.ts,
  });
  const posError = (code, message) => ({ code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  const sync = () => (watchers.size ? app.startLocation() : app.stopLocation());
  const drop = (w) => { clearTimeout(w.timer); watchers.delete(w.id); };
  const call = (fn, arg) => { try { fn?.(arg); } catch (e) { console.error(e); } };

  window.IKTAApp_onFix = (f) => {
    last = f;
    const pos = toPos(f);
    for (const w of [...watchers.values()]) { if (w.once) drop(w); call(w.ok, pos); }
    if (!watchers.size) sync();
  };
  window.IKTAApp_onGeoError = (code, message) => {
    // A refused permission ends every request, as in a browser; "location off" ends only one-off ones
    for (const w of [...watchers.values()]) { if (w.once || code === 1) drop(w); call(w.err, posError(code, message)); }
    if (!watchers.size) sync();
  };

  const add = (ok, err, opts = {}, once = false) => {
    const w = { id: nextId++, ok, err, once };
    watchers.set(w.id, w);
    if (once && opts.timeout != null && opts.timeout !== Infinity) {
      w.timer = setTimeout(() => { if (watchers.has(w.id)) { drop(w); sync(); call(err, posError(3, 'Timeout expired')); } }, opts.timeout);
    }
    sync();
    return w.id;
  };
  const geo = {
    getCurrentPosition(ok, err, opts = {}) {
      if (last && Date.now() - last.ts <= (opts.maximumAge || 0)) { setTimeout(() => call(ok, toPos(last))); return; }
      add(ok, err, opts, true);
    },
    watchPosition: (ok, err, opts) => add(ok, err, opts),
    clearWatch(id) { const w = watchers.get(id); if (w) { drop(w); sync(); } },
  };
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });

  // ---------- Notifications (the WebView has none of its own) ----------
  const waiting = [];
  function AppNotification(title, opts = {}) { app.notify(String(title), String(opts.body || ''), String(opts.tag || '')); }
  Object.defineProperty(AppNotification, 'permission', { get: () => app.notificationPermission() });
  AppNotification.requestPermission = () => new Promise((resolve) => { waiting.push(resolve); app.requestNotificationPermission(); });
  window.IKTAApp_onNotifyPermission = (state) => waiting.splice(0).forEach((r) => r(state));
  window.Notification = AppNotification;
  if (window.ServiceWorkerRegistration) {
    ServiceWorkerRegistration.prototype.showNotification = (title, opts) => { AppNotification(title, opts); return Promise.resolve(); };
  }

  // ---------- Screen wake lock → keep the screen on ----------
  let current = null;
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      async request() {
        const listeners = [];
        const lock = {
          type: 'screen', released: false,
          addEventListener: (type, fn) => { if (type === 'release') listeners.push(fn); },
          removeEventListener() {},
          async release() {
            if (lock.released) return;
            lock.released = true;
            if (current === lock) { current = null; app.keepScreenOn(false); }
            listeners.forEach((fn) => call(fn, { type: 'release' }));
          },
        };
        current = lock;
        app.keepScreenOn(true);
        return lock;
      },
    },
  });
}
