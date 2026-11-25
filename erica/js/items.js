// Things to find and bump into in the maze: where they go, and how they look.
import { W, H, rng } from './maze.js';
import { snowman } from './room.js';

const COUNT = { reindeer: 2, snowman: 2, ice: 4 };
const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export const LINES = {
  snowman: ['Halt! What is the password? …Just kidding ⛄', 'Ooh, that tickles! Hee hee!', 'Okay okay, I am rolling away!'],
  reindeer: ['Zzz… five more minutes… 🦌', 'Huh? Is it Christmas already? Sorry, coming through!'],
};

// The same maze always gives the same layout, so a saved game matches.
export function placeItems(maze, memoryCount) {
  const { walls, start, exits, seed } = maze;
  const open = (x, y) => walls[y]?.[x] === false;
  const far = (a, b, n) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) >= n;
  const straight = [], ends = [], rest = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const spot = { x, y };
    if (!open(x, y) || !far(spot, start, 4) || !exits.every((e) => far(spot, e, 3))) continue;
    const ways = STEPS.filter(([dx, dy]) => open(x + dx, y + dy));
    if (ways.length === 1) ends.push(spot);
    else if (ways.length === 2 && ways[0][0] === -ways[1][0] && ways[0][1] === -ways[1][1]) straight.push({ ...spot, dx: Math.abs(ways[0][0]), dy: Math.abs(ways[0][1]) });
    else rest.push(spot);
  }
  const items = [];
  const taken = (s, n) => items.some((o) => !far(s, o, n));
  const pick = (list, rand, gap) => {
    const free = list.filter((s) => !taken(s, gap));
    return free[Math.floor(rand() * free.length)];
  };
  const rand = rng(seed + 11);
  for (const type of ['reindeer', 'snowman']) for (let i = 0; i < COUNT[type]; i++) {
    const s = pick(straight, rand, 5);
    if (s) items.push({ id: `${type}${i}`, type, x: s.x, y: s.y });
  }
  for (let i = 0; i < COUNT.ice; i++) {
    const s = pick(straight, rand, 4);
    if (!s) continue;
    items.push({ id: `ice${i}`, type: 'ice', x: s.x, y: s.y });
    const more = straight.find((o) => o.x === s.x + s.dx && o.y === s.y + s.dy && o.dx === s.dx);
    if (more && !items.some((o) => o.type !== 'ice' && !far(o, more, 2))) items.push({ id: `ice${i}b`, type: 'ice', x: more.x, y: more.y });
  }
  // Memories like dead ends, so a wrong turn still finds something.
  const mem = rng(seed + 29);
  for (let i = 0; i < memoryCount; i++) {
    const s = pick(ends, mem, 4) ?? pick(straight, mem, 3) ?? pick(rest, mem, 2);
    if (s) items.push({ id: `memory${i}`, type: 'memory', memory: i, x: s.x, y: s.y });
  }
  for (const it of items) Object.assign(it, { gone: false, leaving: 0, bumps: 0, wait: 0, wobble: 0 });
  return items;
}

const oval = (c, x, y, rx, ry, fill, rot = 0) => { c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, 7); c.fill(); };

// Drawn on the floor of a tile 100 units wide, from its top-left corner.
export function drawIce(c, t) {
  c.fillStyle = '#bfe3f7'; c.beginPath(); c.roundRect(2, 2, 96, 96, 22); c.fill();
  c.fillStyle = '#d9f1fd'; c.beginPath(); c.roundRect(10, 12, 74, 70, 20); c.fill();
  c.strokeStyle = '#fff'; c.lineWidth = 5; c.lineCap = 'round'; c.globalAlpha = .7 + Math.sin(t * 2) * .25;
  c.beginPath(); c.moveTo(26, 52); c.lineTo(48, 28); c.moveTo(44, 64); c.lineTo(70, 36); c.stroke();
  c.globalAlpha = 1;
}

// Drawn standing on (0, 0), about 100 units tall.
export function drawItem(c, it, t) {
  if (it.type === 'memory') { polaroid(c, t + it.memory); return; }
  c.save();
  if (it.leaving) { c.globalAlpha = 1 - it.leaving ** 2; c.translate(0, -Math.sin(it.leaving * 2) * 150); }
  if (it.wobble > 0) c.rotate(Math.sin(t * 30) * .12 * it.wobble);
  oval(c, 0, 0, 30, 8, 'rgba(38,42,86,.25)');
  if (it.type === 'snowman') { if (it.leaving) { c.translate(0, -45); c.rotate(it.leaving * 9); c.translate(0, 45); } snowman(c, t); } else reindeer(c, it, t);
  c.restore();
}

function reindeer(c, it, t) {
  const awake = it.bumps > 0, breathe = awake ? 0 : Math.sin(t * 2) * 1.5;
  oval(c, 4, -18, 36, 19 + breathe, '#a9764f');
  oval(c, 10, -10, 22, 10, '#c79a6f');
  oval(c, 38, -26, 7, 5, '#fff6ee');
  c.fillStyle = '#7d5238';
  for (const x of [-16, 22]) { c.beginPath(); c.roundRect(x, -8, 18, 9, 4.5); c.fill(); }
  // Head resting on its legs, or lifted when awake
  c.translate(-24, awake ? -40 : -18);
  c.strokeStyle = '#6b4530'; c.lineWidth = 4.5; c.lineCap = 'round';
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 8, -14); c.lineTo(s * 14, -32); c.lineTo(s * 24, -40); c.moveTo(s * 12, -26); c.lineTo(s * 4, -36); c.stroke(); }
  for (const s of [-1, 1]) oval(c, s * 20, -12, 9, 5, '#8f6141', s * -.4);
  oval(c, 0, -4, 19, 17, '#b58259'); oval(c, 0, 6, 13, 9, '#dcb58d');
  if (awake) { oval(c, -7, -7, 3, 4, '#2a1c1e'); oval(c, 7, -7, 3, 4, '#2a1c1e'); } else {
    c.strokeStyle = '#2a1c1e'; c.lineWidth = 2.2;
    for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 7, -8, 4, .2, Math.PI - .2); c.stroke(); }
    c.fillStyle = '#5b6bb0'; c.font = '600 18px Fredoka, sans-serif';
    for (let i = 0; i < 3; i++) { const p = (t * .5 + i / 3) % 1; c.globalAlpha = 1 - p; c.fillText('z', 18 + p * 20, -22 - p * 40); }
    c.globalAlpha = 1;
  }
  oval(c, 0, 3, 5.5, 4.5, '#e0505a');
}

function polaroid(c, t) {
  oval(c, 0, 0, 17, 5, 'rgba(38,42,86,.22)');
  c.save(); c.translate(0, -44 + Math.sin(t * 2.6) * 5); c.rotate(Math.sin(t * 1.7) * .12);
  const g = c.createRadialGradient(0, 0, 8, 0, 0, 58);
  g.addColorStop(0, 'rgba(255,214,110,.75)'); g.addColorStop(1, 'rgba(255,214,110,0)');
  c.fillStyle = g; c.fillRect(-58, -58, 116, 116);
  c.fillStyle = '#fffdf8'; c.beginPath(); c.roundRect(-24, -28, 48, 58, 4); c.fill();
  c.fillStyle = '#9cc4ea'; c.fillRect(-19, -23, 38, 36);
  c.fillStyle = '#e0505a'; c.beginPath(); c.moveTo(0, 8); c.bezierCurveTo(-22, -6, -12, -22, 0, -11); c.bezierCurveTo(12, -22, 22, -6, 0, 8); c.fill();
  c.restore();
}
