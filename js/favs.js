// IKTA Bus — favourites: multiple named lists of saved routes and bus numbers.
// Stored on the device instantly (works offline) and mirrored to Firebase
// under passengers/{uid}/favorites when a connection is available.
import { store, esc, modal, toast } from './common.js';

const KEY = 'ikta_favs_v1';
const uid = () => Math.random().toString(36).slice(2, 10);
let syncFn = null;

export function loadFavs() {
  const d = store.get(KEY);
  if (d?.lists?.length) return d;
  return { lists: [{ id: 'default', name: 'My Favourites', items: [] }], updatedAt: 0 };
}
export function saveFavs(d, { sync = true } = {}) {
  d.updatedAt = Date.now();
  store.set(KEY, d);
  if (sync) syncFn?.(d);
  document.dispatchEvent(new CustomEvent('favschange'));
}
const OWNER = 'ikta_favs_uid'; // which signed-in passenger the favourites on this device belong to
/**
 * Hook favourites to the signed-in passenger: newest copy wins on load, every save is mirrored.
 * The first time an account is used on this device, the device's lists are merged into it.
 */
export async function attachFavSync(api, user) {
  try {
    const path = `passengers/${user.uid}/favorites`;
    const remote = await api.get(path);
    remote?.lists?.forEach((l) => { l.items = l.items || []; });
    const local = loadFavs();
    syncFn = (d) => api.set(path, d).catch(() => {});
    if (remote?.lists && store.get(OWNER) !== user.uid) saveFavs(mergeFavs(remote, local));
    else if (remote?.lists && (remote.updatedAt || 0) > (local.updatedAt || 0)) saveFavs(remote, { sync: false });
    else if (!remote) syncFn(local);
    store.set(OWNER, user.uid);
  } catch (e) { console.warn('fav sync disabled', e.message); }
}
/** On sign-out or account deletion: the next person on this phone starts with empty lists. */
export function clearLocalFavs() { store.del(KEY); store.del(OWNER); }
function mergeFavs(a, b) {
  const lists = a.lists.map((l) => ({ ...l, items: [...l.items] }));
  for (const l of b.lists) {
    const same = lists.find((x) => x.id === l.id);
    if (!same) { lists.push({ ...l, items: [...(l.items || [])] }); continue; }
    for (const i of l.items || []) if (!same.items.some((j) => sameItem(i, j))) same.items.push(i);
  }
  return { lists };
}

const sameItem = (a, b) => a.type === b.type && (a.type === 'bus' ? a.busKey === b.busKey : a.from === b.from && a.to === b.to);
export function isFav(item) { return loadFavs().lists.some((l) => l.items.some((i) => sameItem(i, item))); }
export function removeFav(item) {
  const d = loadFavs();
  d.lists.forEach((l) => { l.items = l.items.filter((i) => !sameItem(i, item)); });
  saveFavs(d);
}
/** Add an item; asks which list when the user has more than one (or wants a new one). */
export async function addFav(item) {
  const d = loadFavs();
  let listId = d.lists[0].id;
  {
    const opts = d.lists.map((l, i) => `<label class="checkbox" style="padding:8px 0"><input type="radio" name="list" value="${l.id}" ${i === 0 ? 'checked' : ''}> ${esc(l.name)} <span class="muted small">(${l.items.length})</span></label>`).join('');
    const res = await modal({
      title: 'Save to favourites',
      html: `<p class="muted small" style="margin-top:0">${esc(item.title)}</p><form>${opts}
        <label class="checkbox" style="padding:8px 0"><input type="radio" name="list" value="__new"> New list…</label>
        <input class="input" name="newName" placeholder="List name e.g. Office, College" style="margin-top:6px"></form>`,
      okText: 'Save',
      validate: (box) => {
        const v = box.querySelector('[name=list]:checked')?.value;
        const name = box.querySelector('[name=newName]').value.trim();
        if (v === '__new') {
          if (!name) throw new Error('Enter a name for the new list');
          return { newName: name };
        }
        return { listId: v };
      },
      onOpen: (box) => box.querySelector('[name=newName]').addEventListener('focus', () => { box.querySelector('[value=__new]').checked = true; }),
    });
    if (!res) return false;
    if (res.newName) { listId = uid(); d.lists.push({ id: listId, name: res.newName, items: [] }); } else listId = res.listId;
  }
  const list = d.lists.find((l) => l.id === listId);
  if (!list.items.some((i) => sameItem(i, item))) list.items.unshift({ ...item, id: uid(), addedAt: Date.now() });
  saveFavs(d);
  toast(`⭐ Saved to “${list.name}”`, 'ok');
  return true;
}
export function favLink(item) {
  if (item.type === 'bus') return `index.html?bus=${encodeURIComponent(item.busKey)}`;
  const p = new URLSearchParams({ from: item.from, to: item.to });
  if (item.busKey) p.set('bus', item.busKey);
  return `index.html?${p}`;
}
export const newListId = uid;
