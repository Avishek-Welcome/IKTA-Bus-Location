// IKTA Bus — DEMO backend. A tiny Realtime-Database look-alike stored in
// localStorage and synced across tabs with BroadcastChannel, so a driver page
// in one tab moves the bus on the passenger map in another tab instantly.
import { seedDemo } from './demo-seed.js';

const KEY = 'ikta_demo_db_v1';
const SV = '.sv';
let tree = null;
const listeners = new Set();
let chan;

const split = (p) => String(p || '').split('/').filter(Boolean);
const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

function load() {
  try { tree = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { tree = {}; }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(tree)); } catch { /* quota */ }
  chan?.postMessage('changed');
  fire();
}
function read(path) {
  let node = tree;
  for (const k of split(path)) { if (node == null || typeof node !== 'object') return null; node = node[k]; }
  return node === undefined ? null : node;
}
function resolveTS(v) {
  if (v && typeof v === 'object') {
    if (v[SV] === 'timestamp') return Date.now();
    for (const k of Object.keys(v)) v[k] = resolveTS(v[k]);
  }
  return v;
}
function prune(v) {
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) { v[k] = prune(v[k]); if (v[k] == null) delete v[k]; }
    if (!Object.keys(v).length) return null;
  }
  return v;
}
function write(path, value) {
  const keys = split(path);
  value = prune(resolveTS(clone(value)));
  if (!keys.length) { tree = value || {}; return; }
  let node = tree;
  for (let i = 0; i < keys.length - 1; i++) {
    if (node[keys[i]] == null || typeof node[keys[i]] !== 'object') node[keys[i]] = {};
    node = node[keys[i]];
  }
  if (value == null) delete node[keys.at(-1)]; else node[keys.at(-1)] = value;
  tree = prune(tree) || {};
}
function fire() {
  for (const l of listeners) {
    const v = read(l.path);
    const s = JSON.stringify(v);
    if (s !== l.last) { l.last = s; try { l.cb(clone(v)); } catch (e) { console.error(e); } }
  }
}
const pushId = () => {
  const t = Date.now().toString(36).padStart(9, '0');
  return `-${t}${Math.random().toString(36).slice(2, 10)}`;
};
async function sha(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ikta:${s}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const authKey = (email) => email.toLowerCase().replace(/[.#$[\]/]/g, '_');
const err = (code, message) => Object.assign(new Error(message), { code });

let initialised = false;
async function init() {
  if (initialised) return;
  initialised = true;
  load();
  if (!tree.stops) { await seedDemo({ write, sha, authKey }); persist(); }
  if ('BroadcastChannel' in window) {
    chan = new BroadcastChannel('ikta_demo');
    chan.onmessage = () => { load(); fire(); };
  } else {
    addEventListener('storage', (e) => { if (e.key === KEY) { load(); fire(); } });
  }
}

export async function create(_config, role) {
  await init();
  const sessKey = `ikta_demo_auth_${role}`;
  let current = null;
  try { current = JSON.parse(localStorage.getItem(sessKey)); } catch { /* none */ }
  const authCbs = new Set();
  const setUser = (u) => {
    current = u;
    try { u ? localStorage.setItem(sessKey, JSON.stringify(u)) : localStorage.removeItem(sessKey); } catch { /* ignore */ }
    authCbs.forEach((cb) => cb(u));
  };
  const lag = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 180));

  async function createAccount(email, pw) {
    const k = authKey(email);
    if (read(`_auth/${k}`)) throw err('auth/email-already-in-use', 'Already in use');
    const uid = `demo_${Math.random().toString(36).slice(2, 12)}`;
    write(`_auth/${k}`, { uid, pw: await sha(pw), email });
    persist();
    return uid;
  }
  async function verify(email, pw) {
    const rec = read(`_auth/${authKey(email)}`);
    if (!rec || rec.pw !== (await sha(pw))) throw err('auth/invalid-credential', 'Wrong user ID or password');
    return rec;
  }

  return {
    mode: 'demo',
    TS: { [SV]: 'timestamp' },
    listen(path, cb) {
      const l = { path, cb, last: undefined };
      listeners.add(l);
      queueMicrotask(() => { const v = read(path); l.last = JSON.stringify(v); cb(clone(v)); });
      return () => listeners.delete(l);
    },
    async get(path) { return clone(read(path)); },
    async set(path, v) { write(path, v); persist(); },
    async update(path, obj) {
      for (const [k, v] of Object.entries(obj)) write(`${path || ''}/${k}`, v);
      persist();
    },
    async remove(path) { write(path, null); persist(); },
    newKey: () => pushId(),
    async push(path, v) { const k = pushId(); write(`${path}/${k}`, v); persist(); return k; },
    async transaction(path, fn) {
      const cur = clone(read(path));
      const next = fn(cur);
      if (next === undefined) return { committed: false, value: cur };
      write(path, next); persist();
      return { committed: true, value: clone(read(path)) };
    },
    onDisconnectUpdate(path, v) {
      addEventListener('pagehide', () => { for (const [k, val] of Object.entries(v)) write(`${path}/${k}`, val); persist(); });
      return Promise.resolve();
    },
    onDisconnectCancel: () => Promise.resolve(),
    auth: {
      ready: () => Promise.resolve(),
      user: () => current,
      onChange(cb) { authCbs.add(cb); queueMicrotask(() => cb(current)); return () => authCbs.delete(cb); },
      async signIn(email, pw) { await lag(); const rec = await verify(email, pw); setUser({ uid: rec.uid, email }); return current; },
      async create(email, pw) { await lag(); const uid = await createAccount(email, pw); setUser({ uid, email }); return current; },
      // Demo passenger sign-in: no real Google or email; an anonymous demo user keeps its uid
      async google() { await lag(); setUser({ uid: current?.isAnonymous ? current.uid : 'demo_google', email: 'demo.passenger@gmail.com' }); return { user: current, switched: false }; },
      async googleIdToken() { return this.google(); },
      async sendEmailLink(email) { await lag(); setUser({ uid: current?.isAnonymous ? current.uid : `demo_${authKey(email)}`, email }); return { instant: true }; },
      isEmailLink: () => false,
      async finishEmailLink() { return { user: current, switched: false }; },
      async signOut() { setUser(null); },
      async deleteSelf() {
        if (current?.email) { write(`_auth/${authKey(current.email)}`, null); persist(); }
        setUser(null);
      },
    },
    async provisionUser(email, pw) { await lag(); return createAccount(email, pw); },
    async changeUserPassword(email, oldPw, newPw) {
      await lag();
      const rec = await verify(email, oldPw);
      write(`_auth/${authKey(email)}`, { ...rec, pw: await sha(newPw) }); persist();
    },
    async deleteUserAccount(email, pw) { await verify(email, pw); write(`_auth/${authKey(email)}`, null); persist(); },
  };
}
