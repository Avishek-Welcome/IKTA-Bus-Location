// IKTA Bus — Owner console: one-time-code registration, fleet & driver account management, live fleet map.
import {
  $, $$, esc, boot, toast, icon, modal, confirmBox, setBusy, idToEmail, USER_ID_RE, passwordOk, generatePassword,
  attachStrength, wirePasswordToggles, friendlyError, keyOf, colorFor, busIcon, setBusHeading, setBusSpeed, speedChip, speedo, createMap, glide, CROWD, timeAgo, LIVE_FRESH_MS,
} from './common.js';
import { connect, isDemo, demoBanner } from './api.js';

boot();
wirePasswordToggles();
attachStrength($('#regPw'), $('#regBar'), $('#regReq'));

let api, user, owner, map;
let busKeys = [], buses = {}, live = {}, creds = {}, crowd = {};
const unsubs = {};
const fleetMarkers = {};

// ---------- Auth tabs ----------
$$('[data-auth]').forEach((b) => b.addEventListener('click', () => {
  $$('[data-auth]').forEach((x) => x.classList.toggle('active', x === b));
  $('#loginForm').classList.toggle('hidden', b.dataset.auth !== 'login');
  $('#regForm').classList.toggle('hidden', b.dataset.auth !== 'register');
}));
if (isDemo) {
  $('#demoLoginHint').innerHTML = 'Demo owner: <b>demo_owner</b> / <b>Demo@1234</b>';
  import('./demo-seed.js').then((m) => { $('#demoCodeHint').innerHTML = `Demo one-time codes: ${m.DEMO_CODES.map((c) => `<code class="mono">${esc(c)}</code>`).join(', ')}`; });
}

// ---------- Secret code checks ----------
const FORBIDDEN = /[.#$[\]/\s]/;
function codeFormatError(code) {
  if (code.length !== 10) return 'Code must be exactly 10 characters.';
  if (FORBIDDEN.test(code)) return 'Code contains an invalid character.';
  if (new Set(code).size !== 10) return 'Invalid code (characters must not repeat).';
  if (!/[A-Za-z]/.test(code) || !/\d/.test(code) || !/[^A-Za-z0-9]/.test(code)) return 'Invalid code format.';
  return '';
}
async function checkCode(code) {
  const fmt = codeFormatError(code);
  if (fmt) throw new Error(fmt);
  const rec = await api.get(`secretCodes/${code}`);
  if (!rec) throw new Error('This secret code does not exist.');
  if (rec.used) throw new Error('This secret code has already been used.');
  return rec;
}
$('#checkCodeBtn').addEventListener('click', async () => {
  const code = $('#regForm [name=code]').value.trim();
  const hint = $('#codeHint');
  try { await ready(); await checkCode(code); hint.innerHTML = '<span style="color:var(--ok)">✔ Code is valid and unused.</span>'; }
  catch (e) { hint.innerHTML = `<span style="color:var(--bad)">✖ ${esc(e.message)}</span>`; }
});

// ---------- Register ----------
$('#regForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget, err = f.querySelector('[data-err]'), btn = f.querySelector('button.btn-primary');
  const v = Object.fromEntries(new FormData(f));
  const code = v.code.trim(), userId = v.userId.trim().toLowerCase(), name = v.name.trim(), phone = v.phone.trim();
  err.textContent = '';
  try {
    if (!name) throw new Error('Please enter your name.');
    if (!USER_ID_RE.test(userId)) throw new Error('User ID: 4–20 characters, lowercase letters, numbers, _ or -.');
    if (!/^\+?[0-9\s-]{8,16}$/.test(phone)) throw new Error('Please enter a valid phone number.');
    if (!passwordOk(v.password)) throw new Error('Password does not meet the requirements.');
    if (v.password !== v.password2) throw new Error('Passwords do not match.');
    setBusy(btn, true, 'Creating account…');
    await ready();
    await checkCode(code);
    if (await api.get(`usernames/${userId}`)) throw new Error('This user ID is already taken.');
    const u = await api.auth.create(idToEmail(userId, 'owner'), v.password);
    // Atomically burn the one-time code. If someone used it a moment earlier, roll back the new account.
    let res;
    try {
      res = await api.transaction(`secretCodes/${code}`, (cur) => {
        if (cur === null) return null;      // not loaded yet → server retries with real value
        if (cur.used) return undefined;     // abort: already used
        return { ...cur, used: true, usedBy: u.uid, usedByName: name, usedByUserId: userId, usedAt: api.TS };
      });
    } catch (txErr) { res = { committed: false, error: txErr }; }
    if (!res.committed || res.value?.usedBy !== u.uid) {
      await api.auth.deleteSelf().catch(() => {});
      throw new Error('This secret code has just been used by someone else.');
    }
    await api.update('', {
      [`owners/${u.uid}`]: { name, userId, phone, code, createdAt: api.TS },
      [`usernames/${userId}`]: { uid: u.uid, role: 'owner' },
    });
    toast('🎉 Welcome to IKTA Bus! Your owner account is ready.', 'ok');
  } catch (ex) {
    err.textContent = friendlyError(ex);
  } finally { setBusy(btn, false); }
});

// ---------- Sign in ----------
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget, err = f.querySelector('[data-err]'), btn = f.querySelector('button.btn-primary');
  const v = Object.fromEntries(new FormData(f));
  err.textContent = '';
  setBusy(btn, true, 'Signing in…');
  try {
    await ready();
    const u = await api.auth.signIn(idToEmail(v.userId, 'owner'), v.password);
    if (!(await api.get(`owners/${u.uid}`))) { await api.auth.signOut(); throw new Error('This is not an owner account.'); }
  } catch (ex) { err.textContent = friendlyError(ex); } finally { setBusy(btn, false); }
});

$('#logoutBtn').addEventListener('click', async () => {
  if (await confirmBox('Sign out?', 'You can sign in again any time with your user ID and password.', 'Sign out')) { await api.auth.signOut(); location.reload(); }
});

// ---------- Dashboard ----------
function showAuth() {
  $('#dashView').classList.add('hidden'); $('#authView').classList.remove('hidden');
  if (isDemo && !document.querySelector('.demo-banner')) demoBanner();
}
async function enterDash(u) {
  user = u;
  owner = await api.get(`owners/${u.uid}`);
  if (!owner) { // registration still finishing → wait for the profile to be written
    const off = api.listen(`owners/${u.uid}`, (o) => { if (o) { off(); enterDash(u); } });
    return;
  }
  $('#authView').classList.add('hidden'); $('#dashView').classList.remove('hidden');
  demoBanner();
  $('#ownerAvatar').textContent = owner.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  $('#ownerName').textContent = owner.name;
  $('#ownerMeta').textContent = `@${owner.userId} · ${owner.phone}`;
  api.listen(`owners/${u.uid}/buses`, (v) => { busKeys = Object.keys(v || {}); syncBusListeners(); render(); });
  api.listen(`ownerDrivers/${u.uid}`, (v) => { creds = v || {}; render(); });
  api.listen('routes', (r) => { $('#busNames').innerHTML = Object.values(r || {}).map((x) => `<option value="${esc(x.busName)}">`).join(''); });
  initFleetMap();
  setInterval(render, 15000);
}
function syncBusListeners() {
  for (const reg of busKeys) {
    if (unsubs[reg]) continue;
    unsubs[reg] = [
      api.listen(`buses/${reg}`, (b) => { if (b) buses[reg] = b; else delete buses[reg]; render(); }),
      api.listen(`live/${reg}`, (l) => { if (l) live[reg] = l; else delete live[reg]; render(); }),
      api.listen(`crowd/${reg}`, (c) => { crowd[reg] = c; render(); }),
    ];
  }
  for (const reg of Object.keys(unsubs)) {
    if (busKeys.includes(reg)) continue;
    unsubs[reg].forEach((off) => off()); delete unsubs[reg]; delete buses[reg]; delete live[reg];
  }
}
const isLive = (reg) => live[reg] && live[reg].online !== false && Date.now() - live[reg].ts < LIVE_FRESH_MS;

let renderQ = false;
function render() {
  if (renderQ) return; renderQ = true;
  requestAnimationFrame(() => { renderQ = false; doRender(); });
}
function doRender() {
  const regs = busKeys.filter((r) => buses[r]);
  $('#kBuses').textContent = regs.length;
  $('#kDrivers').textContent = regs.filter((r) => buses[r].driverUid).length;
  $('#kLive').textContent = regs.filter(isLive).length;
  const groups = {};
  regs.forEach((r) => { (groups[buses[r].busName] ||= []).push(r); });
  const el = $('#fleet');
  if (!regs.length) { el.innerHTML = '<div class="empty"><span class="big">🚌</span>No buses yet. Add your first bus above, then create a driver login for it.</div>'; updateFleetMap(); return; }
  el.innerHTML = Object.entries(groups).sort().map(([name, list]) => `
    <div class="fleet-group card">
      <h3><span class="bus-avatar" style="--c:${colorFor(keyOf(name))};width:38px;height:38px;border-radius:12px;font-size:11px">${esc(name)}</span> ${esc(name)} <span class="badge">${list.length} bus${list.length > 1 ? 'es' : ''}</span></h3>
      ${list.map((reg) => fleetItem(reg)).join('')}
    </div>`).join('');
  updateFleetMap();
}
function fleetItem(reg) {
  const b = buses[reg], l = live[reg], c = crowd[reg];
  const cr = creds[b.driverUid];
  const C = c && CROWD[c.level];
  const crowdB = C && Date.now() - c.ts < 45 * 60000 ? `<span class="badge ${C.cls}">${C.emoji} ${C.label}</span>` : '';
  return `<div class="fleet-item" data-reg="${esc(reg)}">
    <div class="row">
      <div style="min-width:0"><div class="mono" style="font-weight:800">${esc(b.regNo)}</div>
        <div class="small muted">${b.driverUid ? `Driver: <b>${esc(b.driverName || cr?.name || '—')}</b> · @${esc(cr?.userId || '')}` : 'No driver assigned'}</div></div>
      <span class="spacer"></span>
      ${isLive(reg) ? `<span class="badge live">Live · ${timeAgo(l.ts)}</span>` : `<span class="badge">${l ? `Offline · ${timeAgo(l.ts)}` : 'Never shared'}</span>`}
    </div>
    <div class="bus-meta">${crowdB}${isLive(reg) ? speedChip(l.speed) : ''}</div>
    <div class="acts">
      ${b.driverUid
        ? `<button class="btn btn-sm btn-ghost" data-act="pw">${icon('key')} Change password</button>
           <button class="btn btn-sm btn-ghost" data-act="share">${icon('share')} Share login</button>
           <button class="btn btn-sm btn-danger" data-act="deldriver">Remove driver</button>`
        : `<button class="btn btn-sm btn-primary" data-act="driver">${icon('plus')} Create driver login</button>`}
      ${isLive(reg) ? `<button class="btn btn-sm btn-ghost" data-act="locate">${icon('locate')} Locate</button>` : ''}
      <button class="btn btn-sm btn-danger" data-act="delbus" aria-label="Remove bus">${icon('trash')}</button>
    </div>
  </div>`;
}

// ---------- Add bus ----------
$('#busForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget, err = f.querySelector('[data-err]'), btn = f.querySelector('button.btn-primary');
  const busName = f.busName.value.trim().toUpperCase().replace(/\s+/g, ' ');
  const regNo = f.regNo.value.trim().toUpperCase().replace(/\s+/g, ' ');
  const reg = keyOf(regNo), busKey = keyOf(busName);
  err.textContent = '';
  if (!busKey) { err.textContent = 'Enter a bus name.'; return; }
  if (reg.length < 6) { err.textContent = 'Enter a valid registration number.'; return; }
  setBusy(btn, true, 'Adding…');
  try {
    if (await api.get(`buses/${reg}`)) throw new Error(`A bus with registration ${regNo} is already registered.`);
    await api.update('', {
      [`buses/${reg}`]: { regNo, busName, busKey, ownerUid: user.uid, ownerName: owner.name, createdAt: api.TS },
      [`owners/${user.uid}/buses/${reg}`]: true,
    });
    f.reset();
    toast(`🚌 ${busName} (${regNo}) added`, 'ok');
  } catch (ex) { err.textContent = friendlyError(ex); } finally { setBusy(btn, false); }
});

// ---------- Fleet actions ----------
$('#fleet').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const reg = b.closest('[data-reg]').dataset.reg, bus = buses[reg];
  const act = b.dataset.act;
  if (act === 'driver') return createDriver(reg);
  if (act === 'pw') return changePassword(reg);
  if (act === 'share') return shareCreds(bus, creds[bus.driverUid]);
  if (act === 'deldriver') {
    if (await confirmBox('Remove driver?', `The driver login for ${bus.regNo} will be deleted and can no longer share location.`, 'Remove', true)) await removeDriver(reg);
    return;
  }
  if (act === 'delbus') {
    if (!(await confirmBox('Remove bus?', `${bus.busName} (${bus.regNo}) and its driver login will be removed.`, 'Remove bus', true))) return;
    try {
      if (bus.driverUid) await removeDriver(reg, false);
      await api.update('', { [`buses/${reg}`]: null, [`owners/${user.uid}/buses/${reg}`]: null, [`live/${reg}`]: null });
      toast('Bus removed');
    } catch (ex) { toast(friendlyError(ex), 'bad'); }
    return;
  }
  if (act === 'locate' && map && live[reg]) { selectBus(reg); map.flyTo([live[reg].lat, live[reg].lng], 15); $('#fleetMap').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
});

const pwFields = (label = 'Password') => `
  <label class="field"><span>${label}</span><div class="input-wrap"><input class="input mono" name="pw" autocomplete="new-password"><button type="button" class="addon" data-gen aria-label="Generate password">${icon('sparkle')}</button></div>
    <div class="strength"><i data-bar></i></div>
    <ul class="req-list" data-req-list><li data-req="len">8+ characters</li><li data-req="upper">Uppercase</li><li data-req="lower">Lowercase</li><li data-req="digit">Number</li><li data-req="special">Special</li></ul></label>`;
function wirePw(box) {
  const inp = box.querySelector('[name=pw]');
  attachStrength(inp, box.querySelector('[data-bar]'), box.querySelector('[data-req-list]'));
  box.querySelector('[data-gen]').addEventListener('click', () => { inp.value = generatePassword(); inp.dispatchEvent(new Event('input')); });
}

async function createDriver(reg) {
  const bus = buses[reg];
  const res = await modal({
    title: `Driver login for ${bus.regNo}`,
    okText: 'Create login',
    html: `<form class="stack" autocomplete="off">
      <label class="field"><span>Driver name</span><input class="input" name="name" required></label>
      <label class="field"><span>Driver phone (optional)</span><input class="input" name="phone" type="tel" inputmode="tel"></label>
      <label class="field"><span>Driver user ID</span><input class="input" name="uid" autocapitalize="none" spellcheck="false" placeholder="e.g. ${esc(keyOf(bus.busName).toLowerCase())}_${esc(reg.slice(-4))}" value="${esc(keyOf(bus.busName).toLowerCase())}_${esc(reg.slice(-4).toLowerCase())}"></label>
      ${pwFields()}</form>`,
    onOpen: (box) => { wirePw(box); box.querySelector('[data-gen]').click(); },
    validate: async (box) => {
      const name = box.querySelector('[name=name]').value.trim();
      const phone = box.querySelector('[name=phone]').value.trim();
      const userId = box.querySelector('[name=uid]').value.trim().toLowerCase();
      const pw = box.querySelector('[name=pw]').value;
      if (!name) throw new Error('Enter the driver name.');
      if (!USER_ID_RE.test(userId)) throw new Error('User ID: 4–20 characters, lowercase letters, numbers, _ or -.');
      if (!passwordOk(pw)) throw new Error('Password does not meet the requirements.');
      const okBtn = box.querySelector('[data-act=ok]'); setBusy(okBtn, true);
      try {
        if (await api.get(`usernames/${userId}`)) throw new Error('This user ID is already taken.');
        const duid = await api.provisionUser(idToEmail(userId, 'driver'), pw);
        await api.update('', {
          [`drivers/${duid}`]: { name, phone, userId, ownerUid: user.uid, regKey: reg, regNo: bus.regNo, busName: bus.busName, busKey: bus.busKey, createdAt: api.TS },
          [`usernames/${userId}`]: { uid: duid, role: 'driver', ownerUid: user.uid },
          [`ownerDrivers/${user.uid}/${duid}`]: { userId, password: pw, name, regKey: reg },
          [`buses/${reg}/driverUid`]: duid,
          [`buses/${reg}/driverName`]: name,
        });
        return { userId, password: pw, name };
      } catch (ex) { throw new Error(friendlyError(ex)); } finally { setBusy(okBtn, false); }
    },
  });
  if (res) { toast('✅ Driver login created', 'ok'); showCreds(bus, res); }
}
async function changePassword(reg) {
  const bus = buses[reg], cr = creds[bus.driverUid];
  if (!cr) return toast('Driver credentials not found', 'bad');
  const res = await modal({
    title: `New password for @${cr.userId}`,
    okText: 'Change password',
    html: `<form>${pwFields('New password')}</form><p class="hint">The driver must sign in again with the new password.</p>`,
    onOpen: (box) => { wirePw(box); box.querySelector('[data-gen]').click(); },
    validate: async (box) => {
      const pw = box.querySelector('[name=pw]').value;
      if (!passwordOk(pw)) throw new Error('Password does not meet the requirements.');
      if (pw === cr.password) throw new Error('New password must be different.');
      const okBtn = box.querySelector('[data-act=ok]'); setBusy(okBtn, true);
      try {
        await api.changeUserPassword(idToEmail(cr.userId, 'driver'), cr.password, pw);
        await api.update(`ownerDrivers/${user.uid}/${bus.driverUid}`, { password: pw, changedAt: api.TS });
        return { ...cr, password: pw };
      } catch (ex) { throw new Error(friendlyError(ex)); } finally { setBusy(okBtn, false); }
    },
  });
  if (res) { toast('🔑 Driver password changed', 'ok'); showCreds(bus, res); }
}
async function removeDriver(reg, notify = true) {
  const bus = buses[reg], duid = bus.driverUid, cr = creds[duid];
  try {
    if (cr) await api.deleteUserAccount(idToEmail(cr.userId, 'driver'), cr.password).catch((e) => console.warn('auth delete', e.message));
    await api.update('', {
      [`drivers/${duid}`]: null, [`buses/${reg}/driverUid`]: null, [`buses/${reg}/driverName`]: null,
      [`ownerDrivers/${user.uid}/${duid}`]: null, ...(cr ? { [`usernames/${cr.userId}`]: null } : {}),
    });
    if (notify) toast('Driver removed');
  } catch (ex) { toast(friendlyError(ex), 'bad'); }
}
const credText = (bus, c) => `IKTA Bus driver login\nBus: ${bus.busName} (${bus.regNo})\nUser ID: ${c.userId}\nPassword: ${c.password}\nSign in: ${new URL('driver.html', location.href).href}`;
function showCreds(bus, c) {
  modal({
    title: 'Driver login details',
    okText: 'Done', cancelText: '',
    html: `<div class="cred-box"><div>Bus: <b>${esc(bus.busName)}</b> <span class="mono">${esc(bus.regNo)}</span></div>
      <div>User ID: <b class="mono">${esc(c.userId)}</b></div><div>Password: <b class="mono">${esc(c.password)}</b></div></div>
      <div class="row" style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-copy style="flex:1">${icon('copy')} Copy</button><button class="btn btn-ghost btn-sm" data-share style="flex:1">${icon('share')} Share</button></div>
      <p class="hint">Share these only with the driver. You can change the password at any time.</p>`,
    onOpen: (box) => {
      box.querySelector('[data-copy]').addEventListener('click', () => navigator.clipboard?.writeText(credText(bus, c)).then(() => toast('Copied', 'ok')));
      box.querySelector('[data-share]').addEventListener('click', () => shareCreds(bus, c));
    },
  });
}
async function shareCreds(bus, c) {
  if (!c) return toast('Credentials not available', 'bad');
  const text = credText(bus, c);
  if (navigator.share) { try { await navigator.share({ title: 'IKTA Bus driver login', text }); return; } catch { /* cancelled */ } }
  showCreds(bus, c);
}

// ---------- Fleet map ----------
function initFleetMap() {
  const go = () => {
    if (!window.L) return setTimeout(go, 40);
    map = createMap('fleetMap', { zoomControl: true });
    fleetSpeedo = speedo(map.getContainer(), 'in-map');
    L.DomEvent.disableClickPropagation(fleetSpeedo.el);
    map.on('click', () => { selReg = null; paintSpeedo(); });
    updateFleetMap(true);
  };
  go();
}
let fitted = false;
let fleetSpeedo = null, selReg = null; // bus picked on the fleet map: its speedometer shows over the map
function selectBus(reg) { selReg = reg; paintSpeedo(); }
function paintSpeedo() {
  if (!fleetSpeedo) return;
  const l = selReg && live[selReg];
  if (!l || !isLive(selReg)) { fleetSpeedo.hide(); return; }
  fleetSpeedo.set(l.speed, buses[selReg]?.busName || l.busName);
}
function updateFleetMap(forceFit = false) {
  if (!map) return;
  const pts = [];
  for (const reg of busKeys) {
    const l = live[reg], b = buses[reg];
    if (!b || !l || !isLive(reg)) { if (fleetMarkers[reg]) { map.removeLayer(fleetMarkers[reg]); delete fleetMarkers[reg]; } continue; }
    pts.push([l.lat, l.lng]);
    const ic = busIcon(b.busName, colorFor(b.busKey), { heading: l.heading, speed: l.speed });
    if (!fleetMarkers[reg]) { fleetMarkers[reg] = L.marker([l.lat, l.lng], { icon: ic }).addTo(map); fleetMarkers[reg].on('click', () => selectBus(reg)); }
    else {
      const mk = fleetMarkers[reg], sig = `${l.heading != null}|${b.busName}`;
      if (mk._sig !== sig) { mk.setIcon(ic); mk._h = null; }
      mk._sig = sig;
      setBusHeading(mk, l.heading);
      setBusSpeed(mk, l.speed);
      glide(mk, l);
    }
    fleetMarkers[reg].bindPopup(`<b>${esc(b.busName)}</b> <span class="mono">${esc(b.regNo)}</span><br>${esc(b.driverName || 'No driver')} ${speedChip(l.speed)}`);
  }
  paintSpeedo();
  if ((forceFit || !fitted) && pts.length) { map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 }); fitted = true; }
}

// ---------- Start ----------
let readyP;
function ready() { return (readyP ||= connect('owner').then((a) => { api = a; return a; })); }
(async () => {
  try {
    await ready();
    await api.auth.ready();
    let entered = false;
    api.auth.onChange((u) => {
      if (u && !entered) { entered = true; enterDash(u).catch((e) => toast(friendlyError(e), 'bad')); }
      else if (!u) { entered = false; showAuth(); }
    });
  } catch (e) { showAuth(); toast(`Could not connect: ${friendlyError(e)}`, 'bad'); }
})();
