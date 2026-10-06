// IKTA Bus — Favourites page: multiple named lists of routes and bus numbers.
import { $, $$, esc, boot, toast, icon, modal, promptBox, confirmBox, keyOf, colorFor, LIVE_FRESH_MS } from './common.js';
import { connect, demoBanner } from './api.js';
import { loadFavs, saveFavs, favLink, attachFavSync, newListId } from './favs.js';
import { requirePassenger } from './passenger-auth.js';

boot();
demoBanner();
let filter = 'all', live = {}, routes = {};

function liveCount(busKey) {
  return Object.values(live).filter((l) => l && l.busKey === busKey && l.online !== false && Date.now() - l.ts < LIVE_FRESH_MS).length;
}
function render() {
  const d = loadFavs();
  const all = d.lists.flatMap((l) => l.items);
  $('#kLists').textContent = d.lists.length;
  $('#kRoutes').textContent = all.filter((i) => i.type === 'route').length;
  $('#kBuses').textContent = all.filter((i) => i.type === 'bus').length;
  $('#lists').innerHTML = d.lists.map((l) => {
    const items = l.items.filter((i) => filter === 'all' || i.type === filter);
    return `<section class="card fav-list-card" data-list="${l.id}">
      <div class="row"><h2 style="margin:0">📁 ${esc(l.name)} <span class="badge">${l.items.length}</span></h2><span class="spacer"></span>
        <button class="mini-btn" data-act="rename" aria-label="Rename list">${icon('edit')}</button>
        ${d.lists.length > 1 ? `<button class="mini-btn" data-act="dellist" aria-label="Delete list" style="color:var(--bad)">${icon('trash')}</button>` : ''}</div>
      <div style="margin-top:6px">${items.length ? items.map((it) => item(it)).join('') : '<div class="empty" style="margin-top:8px">Nothing here yet.</div>'}</div>
    </section>`;
  }).join('');
}
function item(it) {
  const isBus = it.type === 'bus';
  const n = isBus ? liveCount(it.busKey) : 0;
  const sub = isBus
    ? (n ? `<span class="badge live">${n} live now</span>` : '<span class="badge">No bus live</span>')
    : `<span class="small muted">${esc(it.fromName || 'My location')} → ${esc(it.toName || '')}${it.busName ? ` · ${esc(it.busName)}` : ''}</span>`;
  return `<div class="fav-item" data-item="${it.id}">
    <div class="fav-ico" style="${isBus ? `background:${colorFor(it.busKey)};color:#fff;font-size:11px;font-weight:800` : ''}">${isBus ? esc(it.busName) : '🚏'}</div>
    <div style="min-width:0;flex:1"><div style="font-weight:700">${esc(isBus ? `Bus ${it.busName}` : it.toName || it.title)}</div>${sub}</div>
    <a class="btn btn-sm btn-primary" href="${favLink(it)}" aria-label="Track">${icon('map')}<span class="hide-sm">Track</span></a>
    <button class="mini-btn" data-act="move" aria-label="Move to another list">⇄</button>
    <button class="mini-btn" data-act="delitem" aria-label="Remove" style="color:var(--bad)">${icon('trash')}</button>
  </div>`;
}

$('#lists').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = loadFavs();
  const list = d.lists.find((l) => l.id === b.closest('[data-list]').dataset.list);
  const act = b.dataset.act;
  if (act === 'rename') {
    const name = await promptBox('Rename list', 'List name', list.name);
    if (name) { list.name = name; saveFavs(d); }
  } else if (act === 'dellist') {
    if (await confirmBox('Delete list?', `“${list.name}” and its ${list.items.length} item(s) will be removed.`, 'Delete', true)) {
      d.lists = d.lists.filter((l) => l !== list); saveFavs(d);
    }
  } else {
    const id = b.closest('[data-item]').dataset.item;
    const it = list.items.find((x) => x.id === id);
    if (act === 'delitem') { list.items = list.items.filter((x) => x !== it); saveFavs(d); toast('Removed'); }
    if (act === 'move') {
      const others = d.lists.filter((l) => l !== list);
      if (!others.length) return toast('Create another list first');
      const target = await modal({
        title: 'Move to list',
        html: `<form>${others.map((l, i) => `<label class="checkbox" style="padding:8px 0"><input type="radio" name="l" value="${l.id}" ${i ? '' : 'checked'}> ${esc(l.name)}</label>`).join('')}</form>`,
        okText: 'Move',
        validate: (box) => box.querySelector('[name=l]:checked').value,
      });
      if (target) {
        list.items = list.items.filter((x) => x !== it);
        d.lists.find((l) => l.id === target).items.unshift(it);
        saveFavs(d); toast('Moved', 'ok');
      }
    }
  }
});
$('#newListBtn').addEventListener('click', async () => {
  const name = await promptBox('New favourite list', 'List name', '', 'e.g. Office, College, Weekend');
  if (!name) return;
  const d = loadFavs(); d.lists.push({ id: newListId(), name, items: [] }); saveFavs(d); toast(`List “${name}” created`, 'ok');
});
$('#filterChips').addEventListener('click', (e) => {
  const c = e.target.closest('[data-filter]'); if (!c) return;
  filter = c.dataset.filter; $$('#filterChips .chip').forEach((x) => x.classList.toggle('active', x === c)); render();
});
$('#quickBus').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = e.currentTarget.bus.value.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!name) return;
  import('./favs.js').then(({ addFav }) => addFav({ type: 'bus', busKey: keyOf(name), busName: name, title: `Bus ${name}` }));
  e.currentTarget.reset();
});
document.addEventListener('favschange', render);
render();

(async () => {
  try {
    const api = await connect('passenger');
    attachFavSync(api, await requirePassenger(api));
    api.listen('live', (v) => { live = v || {}; render(); });
    api.listen('routes', (v) => { routes = v || {}; $('#busNameList').innerHTML = Object.values(routes).map((r) => `<option value="${esc(r.busName)}">`).join(''); });
  } catch (e) { console.warn(e); }
})();
