// Remembers where she got to on this phone. Private browsing may block storage,
// in which case the game simply starts fresh.
const SAVE = 'erica-progress', WORD = 'erica-word', BOX = 'erica-box';

const read = (store, key) => { try { return store().getItem(key); } catch { return null; } };
const write = (store, key, value) => { try { store().setItem(key, value); } catch { /* not available */ } };
const erase = (store, key) => { try { store().removeItem(key); } catch { /* not available */ } };
const local = () => localStorage, session = () => sessionStorage;

export function loadProgress() {
  try {
    const p = JSON.parse(read(local, SAVE));
    const ok = p?.v === 1 && Number.isInteger(p.seed) && Number.isFinite(p.x) && Number.isFinite(p.y)
      && Array.isArray(p.found) && p.found.length === 3;
    return ok ? { ...p, found: p.found.map(Boolean) } : null;
  } catch {
    return null;
  }
}
export const saveProgress = (p) => write(local, SAVE, JSON.stringify({ v: 1, ...p }));
export const clearProgress = () => erase(local, SAVE);

export const saveStage = (stage) => { const p = loadProgress(); if (p) saveProgress({ ...p, stage }); };

// Which box the wheel gave her. Kept even when she starts over.
let box = null;
export function myBox(choose) {
  const kept = Number.parseInt(read(local, BOX) ?? box, 10);
  box = kept >= 0 && kept < 6 ? kept : choose ? choose() : null;
  if (box !== null) write(local, BOX, String(box));
  return box;
}

// Photos she has found, added up over every game.
const ALBUM = 'erica-album';
let album = [];
export function myAlbum() {
  try { const a = JSON.parse(read(local, ALBUM)); if (Array.isArray(a)) album = [...new Set([...album, ...a])]; } catch { /* start empty */ }
  for (const id of loadProgress()?.gone ?? []) if (/^memory\d$/.test(id)) album = [...new Set([...album, Number(id.slice(6))])];
  return album;
}
export function addToAlbum(i) {
  album = [...new Set([...myAlbum(), i])];
  write(local, ALBUM, JSON.stringify(album));
}

// The word is kept only until this tab closes, so a refresh doesn't ask again.
export const rememberWord = (word) => write(session, WORD, word);
export const recallWord = () => read(session, WORD);
export const forgetWord = () => erase(session, WORD);
