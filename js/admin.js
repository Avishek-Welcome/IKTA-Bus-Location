// IKTA Bus — Admin: generate one-time owner registration codes and audit their use.
import { $, $$, esc, boot, toast, icon, setBusy, friendlyError, timeAgo, confirmBox, GOOGLE_G } from './common.js';
import { connect, isDemo, demoBanner } from './api.js';

boot();
let api, codes = {}, filter = 'all';

// 10 unique characters drawn from letters, digits and Firebase-key-safe specials (no . $ # [ ] /)
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@%&*+=?-_~^';
export function generateCode() {
  const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  for (;;) {
    const pool = [...new Set(LETTERS + DIGITS + SPECIAL)];
    for (let i = pool.length - 1; i > 0; i--) { const j = rnd(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const code = pool.slice(0, 10).join('');
    if (/[A-Za-z]/.test(code) && /\d/.test(code) && /[^A-Za-z0-9]/.test(code)) return code;
  }
}

// Admins sign in with Google; the account is an admin when admins/<its UID> is true in the database.
$('#googleBtn').insertAdjacentHTML('afterbegin', `${GOOGLE_G} `);
$('#googleBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget, err = $('#loginCard [data-err]');
  err.textContent = ''; setBusy(btn, true, 'Signing in…');
  try { await api.auth.google(); } catch (ex) { err.textContent = friendlyError(ex); } finally { setBusy(btn, false); }
});
$('#copyUid').innerHTML = icon('copy');
$('#copyUid').addEventListener('click', () => { navigator.clipboard?.writeText($('#naUid').textContent); toast('UID copied', 'ok'); });
$('#otherAcct').addEventListener('click', () => api.auth.signOut());
$('#logoutBtn').addEventListener('click', async () => { await api.auth.signOut(); location.reload(); });

$('#genForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget, btn = f.querySelector('button');
  const n = Math.min(100, Math.max(1, +f.n.value || 1));
  setBusy(btn, true, 'Generating…');
  try {
    const made = [];
    while (made.length < n) {
      const code = generateCode();
      // create only if the code does not exist yet (never overwrite / revive a used code)
      const res = await api.transaction(`secretCodes/${code}`, (cur) => (cur === null ? { used: false, createdAt: Date.now(), note: f.note.value.trim() || null } : undefined));
      if (res.committed) made.push(code);
    }
    toast(`✅ ${made.length} new code(s) generated`, 'ok');
    navigator.clipboard?.writeText(made.join('\n')).then(() => toast('Copied to clipboard')).catch(() => {});
  } catch (ex) { toast(friendlyError(ex), 'bad'); } finally { setBusy(btn, false); }
});

$$('[data-f]').forEach((c) => c.addEventListener('click', () => { filter = c.dataset.f; $$('[data-f]').forEach((x) => x.classList.toggle('active', x === c)); render(); }));
$('#codeRows').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy],[data-del]'); if (!b) return;
  if (b.dataset.copy) { navigator.clipboard?.writeText(b.dataset.copy); toast('Code copied', 'ok'); }
  if (b.dataset.del && await confirmBox('Delete unused code?', `${b.dataset.del} will no longer be usable.`, 'Delete', true)) await api.remove(`secretCodes/${b.dataset.del}`);
});
function render() {
  const all = Object.entries(codes || {}).sort((a, b) => (b[1].usedAt || b[1].createdAt || 0) - (a[1].usedAt || a[1].createdAt || 0));
  $('#kTotal').textContent = all.length;
  $('#kUsed').textContent = all.filter(([, c]) => c.used).length;
  $('#kFree').textContent = all.filter(([, c]) => !c.used).length;
  const rows = all.filter(([, c]) => filter === 'all' || (filter === 'used' ? c.used : !c.used));
  $('#codeRows').innerHTML = rows.map(([code, c]) => `<tr>
    <td><b class="mono">${esc(code)}</b>${c.note ? `<div class="small muted">${esc(c.note)}</div>` : ''}</td>
    <td>${c.used ? '<span class="badge bad">Used</span>' : '<span class="badge ok">Unused</span>'}</td>
    <td>${c.used ? `${esc(c.usedByName || '')}<div class="small muted">@${esc(c.usedByUserId || '')}</div>` : '—'}</td>
    <td class="small">${c.used ? timeAgo(c.usedAt) : `created ${timeAgo(c.createdAt)}`}</td>
    <td style="white-space:nowrap">${c.used ? '' : `<button class="mini-btn" data-copy="${esc(code)}" aria-label="Copy">${icon('copy')}</button> <button class="mini-btn" data-del="${esc(code)}" aria-label="Delete" style="color:var(--bad)">${icon('trash')}</button>`}</td></tr>`).join('')
    || '<tr><td colspan="5" class="center muted">No codes</td></tr>';
}

(async () => {
  api = await connect('admin');
  await api.auth.ready();
  if (isDemo) $('#demoHint').textContent = 'Demo mode: any Google sign-in opens the demo admin.';
  let off;
  api.auth.onChange(async (u) => {
    off?.();
    const isAdmin = u && (await api.get(`admins/${u.uid}`)) === true;
    $('#authView').classList.toggle('hidden', !!isAdmin);
    $('#dashView').classList.toggle('hidden', !isAdmin);
    // signed in but not listed under admins: show the account so its UID can be added
    $('#loginCard').classList.toggle('hidden', !!u && !isAdmin);
    $('#notAdminCard').classList.toggle('hidden', !u || !!isAdmin);
    if (u && !isAdmin) { $('#naEmail').textContent = u.email || '—'; $('#naUid').textContent = u.uid; }
    demoBanner();
    if (isAdmin) off = api.listen('secretCodes', (v) => { codes = v || {}; render(); });
  });
})();
