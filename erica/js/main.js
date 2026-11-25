import { unlock, normalise } from './vault.js';
import { startSnow } from './snow.js';
import { makeLights } from './lights.js';
import { makeGame } from './game.js';
import { music, sfx, isMuted, setMuted } from './audio.js';
import { makeQuestion, keySvg } from './question.js';
import { makeWheel } from './wheel.js';
import { makeGift, makeEnding } from './gift.js';
import { makeTree } from './tree.js';
import { loadProgress, saveProgress, saveStage, myBox, myAlbum, addToAlbum, clearProgress, rememberWord, recallWord, forgetWord } from './progress.js';

// Older phones draw square corners instead of failing.
CanvasRenderingContext2D.prototype.roundRect ??= function (x, y, w, h) { this.rect(x, y, w, h); };

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const WRONG = [
  'Nope! The snowman shakes his head ⛄',
  'Hmm… the reindeer says that is not it 🦌',
  'So close? Or so far? 😏 Try again!',
  'Not quite! Santa is giggling 🎅',
  'Peek at the hint again, you can do it ❤️',
];

const TUNES = { gate: 'deck', welcome: 'deck', maze: 'jingle', question: 'wish', wheel: 'jingle', gift: 'wish', tree: 'silent', ending: 'silent' };

function show(name) {
  music(TUNES[name]);
  document.querySelectorAll('[data-screen]').forEach((s) => { s.hidden = s.dataset.screen !== name; });
  document.body.classList.toggle('in-maze', name === 'maze');
  document.body.classList.toggle('in-room', name === 'question');
  document.querySelector('main').scrollTop = 0;
  document.querySelector(`[data-screen="${name}"] h1[tabindex]`)?.focus({ preventScroll: true });
}

music(TUNES.gate);
const mute = $('mute');
function showMute() {
  mute.setAttribute('aria-pressed', String(isMuted()));
  mute.classList.toggle('off', isMuted());
}
mute.addEventListener('click', () => { setMuted(!isMuted()); showMute(); });
showMute();

startSnow($('snow'));
const lights = makeLights($('lights'));

let boxPromise;
function loadBox() {
  boxPromise ??= fetch('content.enc.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((box) => { $('hint').textContent = box.hint; return box; })
    .catch((e) => { boxPromise = undefined; throw e; });
  return boxPromise;
}
fetch('hint.json', { cache: 'no-cache' }).then((r) => r.json()).then((h) => { $('hint').textContent = h.hint; }).catch(() => {});
loadBox().catch(() => { $('reply').textContent = 'The connection is slow… Tap the button to try again.'; });

const word = $('word'), reply = $('reply'), button = $('open'), gate = $('gate');
const label = button.textContent;
let misses = 0, busy = false;

word.addEventListener('input', () => {
  lights.set([...normalise(word.value)].length);
  reply.textContent = '';
});

gate.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  if (!globalThis.crypto?.subtle) { reply.textContent = 'Please open this page with https:// 🔒'; return; }
  busy = true; button.disabled = true; button.textContent = 'Knock knock…';
  try {
    const box = await loadBox();
    if (!normalise(word.value)) { reply.textContent = 'Type the secret word first!'; word.focus(); return; }
    const unlocked = await unlock(word.value, box);
    if (!unlocked) {
      sfx('nope');
      reply.textContent = WRONG[misses++ % WRONG.length];
      gate.classList.remove('shake'); void gate.offsetWidth; gate.classList.add('shake');
      word.select();
      return;
    }
    rememberWord(word.value);
    await enter(unlocked);
  } catch {
    reply.textContent = 'The connection is slow… Check your connection and try again.';
  } finally {
    busy = false; button.disabled = false; button.textContent = label;
  }
});

let content = null;

async function enter(unlocked) {
  word.blur(); reply.textContent = '';
  lights.party(); sfx('magic');
  await wait(700);
  gate.classList.add('leave');
  await wait(600);
  word.value = '';
  welcome(unlocked);
}

function welcome(unlocked) {
  content = unlocked;
  const saved = loadProgress();
  $('welcome-title').textContent = content.welcome.title;
  $('welcome-text').textContent = saved ? 'Your adventure is saved. Shall we carry on?' : content.welcome.text;
  $('start').textContent = saved ? 'Carry on' : content.welcome.button;
  $('restart').hidden = !saved;
  show('welcome');
}

const mazeScreen = document.querySelector('[data-screen="maze"]');
const toast = mazeScreen.querySelector('.toast'), keys = mazeScreen.querySelector('.keys');
let toastTimer;
function say(text) {
  toast.textContent = text; toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('on'), 2600);
}

const question = makeQuestion(document.querySelector('[data-screen="question"]'));
let answers = [];
const keep = () => saveProgress({ ...game.save(), answers });

const memory = $('memory'), memoryPic = memory.querySelector('img'), album = mazeScreen.querySelector('.album');
let closePhoto = null;
function openPhoto(m, label, onClose) {
  memoryPic.hidden = !m.image; memory.querySelector('.blank').hidden = !!m.image;
  if (m.image) { memoryPic.src = m.image; memoryPic.alt = 'A photo of a memory'; }
  const behind = document.querySelector('[data-screen]:not([hidden])');
  $('memory-keep').textContent = label;
  memory.hidden = false; behind.inert = true;
  $('memory-keep').focus({ preventScroll: true });
  closePhoto = () => { memory.hidden = true; behind.inert = false; onClose?.(); };
}
$('memory-keep').addEventListener('click', () => { const close = closePhoto; closePhoto = null; close?.(); });

const game = makeGame(mazeScreen, {
  memoryCount: () => content.memories?.length ?? 0,
  onMemories(got, all) {
    album.hidden = !all;
    album.textContent = `📷 ${got}/${all}`;
    album.setAttribute('aria-label', `${got} of ${all} memories`);
  },
  onMemory(i) {
    game.stop();
    sfx('sparkle');
    addToAlbum(i);
    toast.classList.remove('on');
    openPhoto(content.memories[i], 'Keep this memory', () => game.start());
    keep();
  },
  onSay: (text) => say(text),
  onKeys(found) {
    const n = found.filter(Boolean).length;
    keys.innerHTML = found.map((f, i) => `<span class="${f ? 'got' : ''}">${keySvg(i)}</span>`).join('')
      + `<span class="sr">${n} of 3 keys</span>`;
  },
  async onDoor(door) {
    game.stop();
    sfx('door');
    // Whichever door comes first, the questions are asked in order.
    const n = game.found.filter(Boolean).length, item = content.questions[n];
    show('question');
    const pick = await question.ask(door, item, n + 1);
    answers[n] = pick;
    game.finishDoor(door);
    keep(); // the key is safe even if she leaves now
    await question.reward(pick, item.answers[pick].reply, n + 1);
    if (n + 1 === 3) { toWheel(); return; }
    show('maze');
    game.start();
    say(['Two more doors to find ✨', 'Just one door left ⭐'][n]);
  },
});

const screen = (name) => document.querySelector(`[data-screen="${name}"]`);
const wheel = makeWheel(screen('wheel')), gift = makeGift(screen('gift')), ending = makeEnding(screen('ending')), tree = makeTree(screen('tree'));

async function toWheel() {
  show('wheel');
  await wheel.play(content.boxes, () => {
    const box = myBox(() => Math.floor(Math.random() * 6));
    saveStage('box'); // a refresh during the spin still counts as her spin
    return box;
  });
  toGift(false);
}

async function toGift(already) {
  const box = myBox() ?? 0;
  show('gift');
  await gift.show(box, content.boxes[box], content.gift, already, () => saveStage('open'));
  toTree(false);
}

async function toTree(skipWalk) {
  const all = content.memories ?? [];
  show('tree');
  await tree.play(all, myAlbum().filter((i) => i < all.length), (m) => openPhoto(m, 'Back to the tree'), skipWalk);
  show('ending');
  ending.show(myBox() ?? 0, content.ending);
}

function playMaze(saved) {
  answers = Array.isArray(saved?.answers) ? saved.answers : [];
  if (saved?.found.every(Boolean)) {
    if (myBox() === null || !saved.stage) toWheel();
    else toGift(saved.stage === 'open');
    return;
  }
  show('maze'); // visible first, so the game can measure the screen
  toast.classList.remove('on');
  game.newMaze(saved);
  keep();
  game.start();
}
const fresh = () => { if (content) { clearProgress(); playMaze(null); } };
$('start').addEventListener('click', () => { if (content) playMaze(loadProgress()); });
$('restart').addEventListener('click', fresh);
$('again').addEventListener('click', () => { ending.stop(); fresh(); });
$('to-tree').addEventListener('click', () => { ending.stop(); toTree(true); });
$('peek').addEventListener('click', () => { ending.stop(); toGift(true); });

// Phones can close the page without warning, so save often and whenever it is hidden.
const keepIfPlaying = () => { if (game.running) keep(); };
addEventListener('pagehide', keepIfPlaying);
document.addEventListener('visibilitychange', () => { if (document.hidden) keepIfPlaying(); });
setInterval(keepIfPlaying, 3000);

// After a refresh in the same tab, skip the secret word.
(async () => {
  const known = recallWord();
  if (!known || !globalThis.crypto?.subtle) return;
  busy = true; button.disabled = true;
  try {
    const unlocked = await unlock(known, await loadBox());
    if (!unlocked) { forgetWord(); return; }
    lights.party();
    welcome(unlocked);
  } catch { /* offline: the secret word page still works */ } finally {
    busy = false; button.disabled = false;
  }
})();
