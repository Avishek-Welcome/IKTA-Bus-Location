// IKTA Bus — passenger sign-in. The passenger pages need a signed-in passenger (Google or an
// email link), so IKTA Coins, favourites and settings follow the email to every phone.
// No new anonymous users are made; an old anonymous session on this device is carried over
// (linked) until the Anonymous provider is switched off (30 Nov 2026).
import {
  $, esc, store, toast, modal, confirmBox, promptBox, hydrateIcons, friendlyError, GOOGLE_G,
  googleSignIn, inAppView as embedded, canGoogleSignIn as canGoogle,
} from './common.js';
import { clearLocalFavs } from './favs.js';

const EMAIL_KEY = 'ikta_signin_email'; // the address an email link was sent to, needed to finish it
const NOLINK_KEY = 'ikta_signin_nolink'; // a link attempt used up the email link: next time just sign in
const DELETE_KEY = 'ikta_delete_after_signin';

/** Resolves with the signed-in passenger, showing the sign-in screen first if needed. */
export async function requirePassenger(api) {
  await api.auth.ready();
  if (api.auth.isEmailLink(location.href)) await finishEmailLink(api);
  let user = api.auth.user();
  if (!user || user.isAnonymous) user = await showGate(api);
  addProfileButton(api, user);
  if (store.get(DELETE_KEY)) { store.del(DELETE_KEY); deleteAccount(api, user); }
  return user;
}

async function signedIn(api, { user, switched }, wasAnon) {
  // Keep the email on the profile (rules check it matches the verified sign-in email)
  try {
    const created = await api.get(`passengers/${user.uid}/createdAt`);
    await api.update(`passengers/${user.uid}`, { email: user.email, ...(created ? {} : { createdAt: api.TS }) });
  } catch (e) { console.warn('profile', e.message); }
  if (switched && wasAnon) toast('Signed in. Coins earned on this phone before signing in stay with the old guest profile.', '', 6000);
  else toast(`Signed in as ${user.email}`, 'ok');
  return user;
}

async function finishEmailLink(api) {
  const href = location.href;
  history.replaceState(null, '', location.pathname); // the link works once; don't keep it in the address bar
  let email = store.get(EMAIL_KEY);
  // Opened on another phone or browser: ask which address the link was sent to
  if (!email) email = (await promptBox('Confirm your email', 'The email address the sign-in link was sent to', '', 'you@gmail.com'))?.trim();
  if (!email) return;
  const wasAnon = !!api.auth.user()?.isAnonymous;
  const link = wasAnon && !store.get(NOLINK_KEY);
  try {
    const res = await api.auth.finishEmailLink(email, href, link);
    store.del(EMAIL_KEY); store.del(NOLINK_KEY);
    await signedIn(api, res, wasAnon);
  } catch (e) {
    if (link) store.set(NOLINK_KEY, true);
    toast(friendlyError(e), 'bad', 6000);
  }
}

function showGate(api) {
  return new Promise((resolve) => {
    const wasAnon = !!api.auth.user()?.isAnonymous;
    const g = document.createElement('div');
    g.className = 'auth-gate';
    g.innerHTML = `<main class="auth-wrap"><div class="auth-card">
      <div class="auth-head"><div class="logo"><i data-icon="user"></i></div>
        <h1>Sign in to IKTA Bus</h1>
        <p>Your IKTA Coins, favourites and settings are saved to your email and come back on any phone.</p></div>
      <div class="card stack">
        ${canGoogle ? `<button class="btn btn-primary btn-block" id="gGoogle" type="button">${GOOGLE_G} Continue with Google</button>
        <div class="or-line"><span>or</span></div>` : ''}
        <form id="gEmail" class="stack" novalidate>
          <label class="field"><span>${canGoogle ? 'Use another email' : 'Your email (Gmail or any other)'}</span>
            <input class="input" type="email" name="email" autocomplete="email" autocapitalize="none" spellcheck="false" required placeholder="you@gmail.com" value="${esc(store.get(EMAIL_KEY) || '')}"></label>
          <button class="btn ${canGoogle ? 'btn-ghost' : 'btn-primary'} btn-block">Email me a sign-in link</button>
        </form>
        <div class="error-text" id="gErr"></div>
        <p class="hint center hidden" id="gSent"></p>
      </div>
      ${wasAnon ? '<p class="hint center">The IKTA Coins and favourites already on this phone are kept.</p>' : ''}
      <p class="hint center">Driver or bus owner? Use <a href="driver.html">Driver</a> or <a href="owner.html">Owner</a> sign-in.</p>
    </div></main>`;
    document.body.append(g);
    document.body.classList.add('gated');
    hydrateIcons(g);
    const err = $('#gErr', g);
    const busy = (on) => g.querySelectorAll('button,input').forEach((el) => { el.disabled = on; });
    const done = async (res) => {
      const user = await signedIn(api, res, wasAnon);
      g.remove(); document.body.classList.remove('gated');
      resolve(user);
    };

    $('#gGoogle', g)?.addEventListener('click', async () => {
      err.textContent = ''; busy(true);
      try { await done(await googleSignIn(api)); }
      catch (e) { err.textContent = friendlyError(e); } finally { busy(false); }
    });
    $('#gEmail', g).addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = e.currentTarget.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Enter your email address, e.g. name@gmail.com'; return; }
      err.textContent = ''; busy(true);
      try {
        const res = await api.auth.sendEmailLink(email, `${location.origin}${location.pathname}`);
        if (res?.instant) { await done({ user: api.auth.user(), switched: false }); return; } // demo mode
        store.set(EMAIL_KEY, email);
        const sent = $('#gSent', g);
        sent.innerHTML = `📧 We sent a sign-in link to <b>${esc(email)}</b>. Open it on this phone to finish. Not there? Check Spam.`;
        sent.classList.remove('hidden');
        // In the phone app the emailed link may open in the browser instead of the app:
        // let the passenger copy the link and paste it here
        if (embedded && !$('#gPaste', g)) {
          sent.insertAdjacentHTML('afterend', `<form id="gPaste" class="stack">
            <label class="field"><span>Link opened in the browser? Long-press the link in the email, copy it and paste it here</span>
              <input class="input" name="link" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://…"></label>
            <button class="btn btn-ghost btn-block">Finish sign-in</button></form>`);
          $('#gPaste', g).addEventListener('submit', async (e3) => {
            e3.preventDefault();
            const href = e3.currentTarget.link.value.trim();
            if (!api.auth.isEmailLink(href)) { err.textContent = 'That is not the sign-in link from the email. Copy the whole link and try again.'; return; }
            err.textContent = ''; busy(true);
            const link = wasAnon && !store.get(NOLINK_KEY);
            try {
              const res = await api.auth.finishEmailLink(email, href, link);
              store.del(EMAIL_KEY); store.del(NOLINK_KEY);
              await done(res);
            } catch (e4) { if (link) store.set(NOLINK_KEY, true); err.textContent = friendlyError(e4); } finally { busy(false); }
          });
        }
      } catch (e2) { err.textContent = friendlyError(e2); } finally { busy(false); }
    });
  });
}


function addProfileButton(api, user) {
  if ($('#profileBtn')) return;
  const b = document.createElement('button');
  b.className = 'icon-btn profile-btn'; b.id = 'profileBtn';
  b.setAttribute('aria-label', 'Your profile'); b.title = user.email || 'Your profile';
  b.textContent = (user.email || '?')[0].toUpperCase();
  const theme = $('#themeBtn');
  theme ? theme.before(b) : $('.topbar')?.append(b);
  b.addEventListener('click', () => openProfile(api, user));
}

async function openProfile(api, user) {
  const coins = await api.get(`passengers/${user.uid}/coins`).catch(() => 0) || 0;
  modal({
    title: 'Your profile',
    html: `<p style="margin-top:0"><b>${esc(user.email)}</b><br><span class="muted small">IKTA Coins: ${coins} 🪙</span></p>
      <div class="stack">
        <button class="btn btn-ghost btn-block" type="button" data-p="out">Sign out</button>
        <button class="btn btn-danger btn-block" type="button" data-p="del">Delete my account</button>
      </div>`,
    okText: 'Close', cancelText: '',
    onOpen: (box, close) => box.addEventListener('click', (e) => {
      const act = e.target.closest('[data-p]')?.dataset.p;
      if (act === 'out') { close(null); signOut(api); }
      if (act === 'del') { close(null); deleteAccount(api, user); }
    }),
  });
}

async function signOut(api) {
  await api.auth.signOut();
  clearLocalFavs();
  location.reload();
}

async function deleteAccount(api, user) {
  const ok = await confirmBox('Delete my account',
    `This deletes your IKTA Bus profile (${user.email}): IKTA Coins, coin history and favourites. It cannot be undone.`,
    'Delete account', true);
  if (!ok) return;
  try {
    await api.remove(`passengers/${user.uid}`);
    await api.auth.deleteSelf();
    clearLocalFavs();
    toast('Your account was deleted.', 'ok');
    setTimeout(() => location.reload(), 1200);
  } catch (e) {
    if (e.code === 'auth/requires-recent-login') {
      // Firebase wants a fresh sign-in before deleting: sign in again, then this asks once more
      store.set(DELETE_KEY, true);
      toast('For your safety, please sign in again to finish deleting your account.', '', 6000);
      setTimeout(() => signOut(api), 2500);
    } else toast(friendlyError(e), 'bad');
  }
}

