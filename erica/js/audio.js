// Music and sound effects, all made in code. The carols are traditional tunes in the
// public domain. Nothing plays until the first tap, which browsers require.
const MUTE = 'erica-mute';
let muted = false;
try { muted = localStorage.getItem(MUTE) === '1'; } catch { /* not available */ }

// Notes are "name:beats"; r is a rest. Chords are one per bar.
const TRACKS = {
  jingle: {
    tempo: 172, bar: 4,
    tune: `E5:1 E5:1 E5:2 E5:1 E5:1 E5:2 E5:1 G5:1 C5:1.5 D5:.5 E5:4
      F5:1 F5:1 F5:1.5 F5:.5 F5:1 E5:1 E5:1 E5:.5 E5:.5 E5:1 D5:1 D5:1 E5:1 D5:2 G5:2
      E5:1 E5:1 E5:2 E5:1 E5:1 E5:2 E5:1 G5:1 C5:1.5 D5:.5 E5:4
      F5:1 F5:1 F5:1.5 F5:.5 F5:1 E5:1 E5:1 E5:.5 E5:.5 G5:1 G5:1 F5:1 D5:1 C5:4`,
    chords: 'C C C C F C D G C C C C F C G C',
  },
  deck: {
    tempo: 132, bar: 4,
    tune: `G5:1.5 F5:.5 E5:1 D5:1 C5:1 D5:1 E5:1 C5:1 D5:.5 E5:.5 F5:.5 D5:.5 E5:1.5 D5:.5 C5:1 B4:1 C5:2
      G5:1.5 F5:.5 E5:1 D5:1 C5:1 D5:1 E5:1 C5:1 D5:.5 E5:.5 F5:.5 D5:.5 E5:1.5 D5:.5 C5:1 B4:1 C5:2
      D5:1.5 E5:.5 F5:1 D5:1 E5:1.5 F5:.5 G5:1 D5:1 E5:.5 F#5:.5 G5:1 A5:.5 B5:.5 C6:1 B5:1 A5:1 G5:2
      G5:1.5 F5:.5 E5:1 D5:1 C5:1 D5:1 E5:1 C5:1 A5:.5 A5:.5 A5:.5 A5:.5 G5:1.5 F5:.5 E5:1 D5:1 C5:2`,
    chords: 'C C G C C C G C G C G G C C F C',
  },
  wish: {
    tempo: 150, bar: 3,
    tune: `r:2 G4:1 C5:1 C5:.5 D5:.5 C5:.5 B4:.5 A4:1 A4:1 A4:1 D5:1 D5:.5 E5:.5 D5:.5 C5:.5 B4:1 G4:1 G4:1
      E5:1 E5:.5 F5:.5 E5:.5 D5:.5 C5:1 A4:1 G4:.5 G4:.5 A4:1 D5:1 B4:1 C5:3`,
    chords: 'C C F D G C F G C',
  },
  silent: {
    tempo: 92, bar: 3,
    tune: `G4:1.5 A4:.5 G4:1 E4:3 G4:1.5 A4:.5 G4:1 E4:3 D5:2 D5:1 B4:3 C5:2 C5:1 G4:3
      A4:2 A4:1 C5:1.5 B4:.5 A4:1 G4:1.5 A4:.5 G4:1 E4:3 A4:2 A4:1 C5:1.5 B4:.5 A4:1 G4:1.5 A4:.5 G4:1 E4:3
      D5:2 D5:1 F5:1.5 D5:.5 B4:1 C5:3 E5:3 C5:1 G4:1 E4:1 G4:1.5 F4:.5 D4:1 C4:3 r:3`,
    chords: 'C C C C G G C C F F C C F F C C G G C C C G C C',
  },
};
const CHORDS = { C: ['C3', 'E4', 'G4'], F: ['F3', 'A4', 'C4'], G: ['G3', 'B3', 'D4'], D: ['D3', 'F#4', 'A4'] };
const STEPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const hertz = (n) => 440 * 2 ** ((STEPS[n[0]] + (n[1] === '#' ? 1 : 0) + (Number(n.at(-1)) - 4) * 12 - 9) / 12);

// Every note of a track as { at, note, length, level }, with times in beats.
export function arrange(name) {
  const { tune, chords, bar } = TRACKS[name], notes = [];
  let at = 0;
  for (const part of tune.trim().split(/\s+/)) {
    const [note, beats] = part.split(':');
    if (note !== 'r') notes.push({ at, note, length: Number(beats), level: 1 });
    at += Number(beats);
  }
  const bars = chords.split(' ');
  bars.forEach((c, i) => {
    const [bass, a, b] = CHORDS[c];
    notes.push({ at: i * bar, note: bass, length: bar, level: .7 });
    for (let k = 1; k < bar; k++) for (const n of [a, b]) notes.push({ at: i * bar + k, note: n, length: .8, level: .22 });
  });
  return { notes: notes.sort((x, y) => x.at - y.at), beats: at, bars: bars.length * bar };
}

let ctx, master, musicBus, noise, track = null, song = null, songStart = 0, nextNote = 0;

function wake() {
  if (!ctx) {
    const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctx) return;
    ctx = new Ctx();
    master = ctx.createGain(); master.gain.value = muted ? 0 : .6; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = .3; musicBus.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    setInterval(schedule, 120);
    begin();
  }
  if (ctx.state !== 'running' && !document.hidden) ctx.resume().catch(() => {});
}
for (const type of ['pointerdown', 'pointerup', 'keydown', 'click']) addEventListener(type, wake, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  (document.hidden ? ctx.suspend() : ctx.resume()).catch(() => {});
});

// A music-box pluck.
function pluck(freq, when, length, level, out) {
  const g = ctx.createGain(), end = when + Math.max(.35, length * 1.3);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(level * .5, when + .008);
  g.gain.exponentialRampToValueAtTime(.0008, end);
  g.connect(out);
  for (const [type, mult, vol] of [['triangle', 1, 1], ['sine', 2, .35], ['sine', 4, .1]]) {
    const o = ctx.createOscillator(), v = ctx.createGain();
    o.type = type; o.frequency.value = freq * mult; v.gain.value = vol;
    o.connect(v).connect(g); o.start(when); o.stop(end + .02);
  }
}

function begin() {
  if (!ctx) return;
  // Let the old tune die away under the new one.
  const old = musicBus;
  old.gain.setTargetAtTime(0, ctx.currentTime, .12);
  setTimeout(() => old.disconnect(), 1500);
  musicBus = ctx.createGain(); musicBus.gain.value = .3; musicBus.connect(master);
  song = track ? arrange(track) : null;
  songStart = ctx.currentTime + .25; nextNote = 0;
}

function schedule() {
  if (!song || ctx.state !== 'running') return;
  const beat = 60 / TRACKS[track].tempo;
  for (;;) {
    const n = song.notes[nextNote], when = songStart + n.at * beat;
    if (when > ctx.currentTime + .4) return;
    if (when > ctx.currentTime - .1 && !muted) pluck(hertz(n.note), Math.max(when, ctx.currentTime), n.length * beat, n.level, musicBus);
    if (++nextNote === song.notes.length) { nextNote = 0; songStart += song.beats * beat; }
  }
}

export function music(name) {
  if (name === track) return;
  track = name;
  begin();
}

function tone(type, from, to, length, level, delay = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain(), at = ctx.currentTime + delay;
  o.type = type;
  o.frequency.setValueAtTime(from, at); o.frequency.exponentialRampToValueAtTime(to, at + length);
  g.gain.setValueAtTime(level, at); g.gain.exponentialRampToValueAtTime(.001, at + length);
  o.connect(g).connect(master); o.start(at); o.stop(at + length + .02);
}
function hiss(freq, length, level, delay = 0) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), at = ctx.currentTime + delay;
  s.buffer = noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = .8;
  g.gain.setValueAtTime(level, at); g.gain.exponentialRampToValueAtTime(.001, at + length);
  s.connect(f).connect(g).connect(master); s.start(at, Math.random() * .5, length + .05);
}
const chime = (notes, gap, level = .3) => notes.forEach((n, i) => pluck(hertz(n), ctx.currentTime + i * gap, .5, level, master));

const SOUNDS = {
  step: () => hiss(1500 + Math.random() * 700, .07, .07),
  slide: () => { hiss(3200, .55, .12); tone('sine', 900, 320, .5, .06); },
  boing: () => tone('triangle', 170, 420, .22, .25),
  whoosh: () => { hiss(900, .6, .22); tone('sine', 300, 900, .5, .1); },
  click: () => { tone('square', 620, 380, .06, .08); hiss(2500, .04, .12); },
  nope: () => { tone('triangle', 300, 240, .16, .2); tone('triangle', 230, 170, .24, .2, .16); },
  whirr: () => { for (let i = 0; i < 9; i++) tone('square', 180 + (i % 3) * 70, 230 + (i % 3) * 70, .12, .05, i * .14); },
  pop: () => { tone('sine', 240, 900, .12, .35); hiss(1800, .12, .2); },
  door: () => { tone('sawtooth', 120, 190, .4, .04); chime(['C5', 'G5'], .12, .2); },
  throw: () => { hiss(1200, .16, .16); tone('sine', 420, 700, .14, .06); },
  splat: () => { hiss(600, .18, .4); hiss(2600, .1, .15); },
  haha: () => { for (let i = 0; i < 6; i++) tone('triangle', 330 - i * 14, 220 - i * 10, .13, .2, i * .19); },
  tick: () => tone('square', 1100, 700, .03, .06),
  rattle: () => { for (let i = 0; i < 4; i++) hiss(700, .07, .25, i * .09); },
  key: () => chime(['E5', 'G5', 'C6', 'E6'], .08),
  sparkle: () => chime(['G5', 'B5', 'D6', 'G6'], .07, .25),
  magic: () => chime(['C5', 'E5', 'G5', 'C6', 'E6', 'G6'], .08),
  fanfare: () => { chime(['C5', 'C5', 'C5', 'E5', 'G5', 'C6'], .13, .4); chime(['C4', 'G4', 'C5'], .39, .35); hiss(5000, 1, .08, .6); },
};
export function sfx(name) {
  if (ctx && ctx.state === 'running' && !muted) SOUNDS[name]();
}

export const isMuted = () => muted;
export function setMuted(on) {
  muted = on;
  try { localStorage.setItem(MUTE, on ? '1' : '0'); } catch { /* not available */ }
  if (ctx) master.gain.setTargetAtTime(on ? 0 : .6, ctx.currentTime, .04);
}
