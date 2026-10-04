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
/** Hook favourites to the backend: newest copy wins on load, every save is mirrored. */
export async function attachFavSync(api) {
  try {
    const user = await api.auth.anon();
    const path = `passengers/${user.uid}/favorites`;
    const remote = await api.get(path);
    const local = loadFavs();
    if (remote?.lists && (remote.updatedAt || 0) > (local.updatedAt || 0)) {
      remote.lists.forEach((l) => { l.items = l.items || []; });
      saveFavs(remote, { sync: false });
    }
    syncFn = (d) => api.set(path, d).catch(() => {});
    if (!remote) syncFn(local);
  } catch (e) { console.warn('fav sync disabled', e.message); }
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
