// IKTA Bus — Firebase backend (Realtime Database + Authentication)
// Realtime Database is used for its persistent WebSocket: a driver's GPS write
// reaches every subscribed passenger typically within ~100–300 ms.

export async function create(config, role, ver) {
  const base = `https://www.gstatic.com/firebasejs/${ver}`;
  const [appMod, authMod, dbMod] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-database.js`),
  ]);
  const { initializeApp, deleteApp, getApps } = appMod;
  const {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
    signInAnonymously, updatePassword, deleteUser, initializeAuth, inMemoryPersistence,
  } = authMod;
  const {
    getDatabase, ref, onValue, get, set, update, push, remove, runTransaction, serverTimestamp, onDisconnect,
  } = dbMod;

  const app = getApps().find((a) => a.name === role) || initializeApp(config, role);
  const auth = getAuth(app);
  const db = getDatabase(app);
  const r = (p) => (p ? ref(db, p) : ref(db));

  // A throw-away app with in-memory auth lets an owner create / update driver
  // accounts without signing the owner out of their own session.
  async function withSecondary(fn) {
    const sec = initializeApp(config, `provision-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const secAuth = initializeAuth(sec, { persistence: inMemoryPersistence });
    try { return await fn(secAuth); } finally { await signOut(secAuth).catch(() => {}); await deleteApp(sec).catch(() => {}); }
  }

  let authReady;
  const ready = new Promise((res) => { authReady = res; });
  onAuthStateChanged(auth, () => authReady());

  return {
    mode: 'firebase',
    TS: serverTimestamp(),
    listen(path, cb) { return onValue(r(path), (s) => cb(s.val()), (e) => console.warn('listen', path, e.message)); },
    async get(path) { return (await get(r(path))).val(); },
    set: (path, v) => set(r(path), v),
    update: (path, v) => update(r(path), v),
    remove: (path) => remove(r(path)),
    newKey: (path) => push(r(path)).key,
    async push(path, v) { const k = push(r(path)); await set(k, v); return k.key; },
    async transaction(path, fn) {
      const res = await runTransaction(r(path), fn, { applyLocally: false });
      return { committed: res.committed, value: res.snapshot.val() };
    },
    onDisconnectUpdate: (path, v) => onDisconnect(r(path)).update(v),
    onDisconnectCancel: (path) => onDisconnect(r(path)).cancel(),
    auth: {
      ready: () => ready,
      user: () => auth.currentUser,
      onChange: (cb) => onAuthStateChanged(auth, cb),
      signIn: (email, pw) => signInWithEmailAndPassword(auth, email, pw).then((c) => c.user),
      create: (email, pw) => createUserWithEmailAndPassword(auth, email, pw).then((c) => c.user),
      anon: () => (auth.currentUser ? Promise.resolve(auth.currentUser) : signInAnonymously(auth).then((c) => c.user)),
      signOut: () => signOut(auth),
      deleteSelf: () => deleteUser(auth.currentUser),
    },
    provisionUser: (email, pw) => withSecondary(async (a) => (await createUserWithEmailAndPassword(a, email, pw)).user.uid),
    changeUserPassword: (email, oldPw, newPw) => withSecondary(async (a) => {
      const c = await signInWithEmailAndPassword(a, email, oldPw);
      await updatePassword(c.user, newPw);
    }),
    deleteUserAccount: (email, pw) => withSecondary(async (a) => {
      const c = await signInWithEmailAndPassword(a, email, pw);
      await deleteUser(c.user);
    }),
  };
}
