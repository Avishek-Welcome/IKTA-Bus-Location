// IKTA Bus — Firebase backend (Realtime Database + Authentication)
// Realtime Database is used for its persistent WebSocket: a driver's GPS write
// reaches every subscribed passenger typically within ~100–300 ms.

// Google Analytics is loaded once, when the browser is idle, so it never
// competes with the map, tiles or live bus data for bandwidth.
let analyticsStarted = false;
function startAnalytics(app, config, base) {
  if (analyticsStarted || !config.measurementId) return;
  analyticsStarted = true;
  const run = async () => {
    try {
      const { getAnalytics, isSupported } = await import(`${base}/firebase-analytics.js`);
      if (await isSupported()) getAnalytics(app); // records page_view automatically
    } catch (e) { console.warn('analytics disabled', e.message); }
  };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 8000 }); else setTimeout(run, 4000);
}

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
    updatePassword, deleteUser, initializeAuth, inMemoryPersistence,
    GoogleAuthProvider, EmailAuthProvider, signInWithPopup, linkWithPopup, linkWithCredential, signInWithCredential,
    sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  } = authMod;
  const {
    getDatabase, ref, onValue, get, set, update, push, remove, runTransaction, serverTimestamp, onDisconnect, increment,
  } = dbMod;

  const app = getApps().find((a) => a.name === role) || initializeApp(config, role);
  const auth = getAuth(app);
  const db = getDatabase(app);
  startAnalytics(app, config, base);
  const r = (p) => (p ? ref(db, p) : ref(db));

  // A throw-away app with in-memory auth lets an owner create / update driver
  // accounts without signing the owner out of their own session.
  async function withSecondary(fn) {
    const sec = initializeApp(config, `provision-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const secAuth = initializeAuth(sec, { persistence: inMemoryPersistence });
    try { return await fn(secAuth); } finally { await signOut(secAuth).catch(() => {}); await deleteApp(sec).catch(() => {}); }
  }

  // Passenger sign-in (Google or an email link). An old anonymous session on this device is
  // linked, so its uid keeps its coins and favourites; if the email already has an account,
  // that account is used instead and `switched` is true.
  async function upgrade(cred, popup) {
    const u = auth.currentUser;
    if (u?.isAnonymous) {
      try {
        const c = cred ? await linkWithCredential(u, cred) : await linkWithPopup(u, popup);
        return { user: c.user, switched: false };
      } catch (e) {
        if (!/credential-already-in-use|email-already-in-use/.test(e.code || '')) throw e;
        const again = cred || GoogleAuthProvider.credentialFromError(e);
        if (!again) throw e;
        return { user: (await signInWithCredential(auth, again)).user, switched: true };
      }
    }
    const c = cred ? await signInWithCredential(auth, cred) : await signInWithPopup(auth, popup);
    return { user: c.user, switched: !!u && u.uid !== c.user.uid };
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
    /** Adds n on the server (no read first), e.g. usage counters. */
    increment: (path, n) => set(r(path), increment(n)),
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
      signOut: () => signOut(auth),
      deleteSelf: () => deleteUser(auth.currentUser),
      google: () => upgrade(null, new GoogleAuthProvider()),
      googleIdToken: (idToken) => upgrade(GoogleAuthProvider.credential(idToken)),
      sendEmailLink: (email, url) => sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true }),
      isEmailLink: (href) => isSignInWithEmailLink(auth, href),
      // link = false signs in without linking (used after a link attempt used up the email link)
      finishEmailLink: (email, href, link = true) => (link
        ? upgrade(EmailAuthProvider.credentialWithLink(email, href))
        : signInWithEmailLink(auth, email, href).then((c) => ({ user: c.user, switched: true }))),
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
