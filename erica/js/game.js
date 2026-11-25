// The maze scene: movement, camera, mini-map and the frame loop.
import { makeMaze, W, H } from './maze.js';
import { makeArt, DOOR_COLOURS } from './art.js';
import { drawGirl } from './girl.js';
import { makeJoystick } from './joystick.js';
import { placeItems, drawIce, drawItem, LINES } from './items.js';
import { sfx } from './audio.js';

const SPEED = 3.3;   // tiles per second
const BODY = .27;    // half her width, in tiles
const SEE = 2;       // how far around her the mini-map is uncovered

export function makeGame(root, { onDoor, onKeys, onMemory, onMemories, onSay, memoryCount }) {
  const canvas = root.querySelector('canvas.world'), ctx = canvas.getContext('2d');
  const map = root.querySelector('canvas.map'), mctx = map.getContext('2d');
  const tip = root.querySelector('.tip');
  const stick = makeJoystick(root, root.querySelector('.stick'), root.querySelector('.knob'));
  const state = { running: false };
  let art, maze, girl, found, seen, items, atDoor, sliding, stepped, frame = 0, last = 0, t = 0;
  let vw = 0, vh = 0, tile = 60, dpr = 1, vignette;

  const blocks = (it) => !it.gone && !it.leaving && (it.type === 'reindeer' || it.type === 'snowman');
  const blocker = (x, y) => items.find((it) => it.x === x && it.y === y && blocks(it));
  const open = (x, y) => maze.walls[y]?.[x] === false && !blocker(x, y);
  const memories = () => items.filter((it) => it.type === 'memory');
  // True when her body, centred at (x, y), touches no wall.
  const fits = (x, y) => {
    for (const ox of [-BODY, BODY]) for (const oy of [-BODY, BODY]) {
      if (!open(Math.floor(x + ox), Math.floor(y + oy))) return false;
    }
    return true;
  };

  // Starts a new maze, or the saved one when given saved progress.
  function newMaze(saved) {
    maze = makeMaze(saved?.seed);
    items = placeItems(maze, memoryCount());
    for (const it of items) it.gone = Array.isArray(saved?.gone) && saved.gone.includes(it.id);
    sliding = null; stepped = 0;
    girl = { x: maze.start.x + .5, y: maze.start.y + .5, dir: 'down', walk: 0, moving: false };
    if (saved && saved.seed === maze.seed && fits(saved.x, saved.y)) { girl.x = saved.x; girl.y = saved.y; }
    found = saved ? [...saved.found] : [false, false, false]; atDoor = -1;
    seen = maze.walls.map((row, y) => row.map((_, x) => saved?.seen?.[y * W + x] === '1'));
    Object.assign(state, { maze, girl, found, items });
    t = 0; tip.hidden = false;
    uncover(); onKeys(found); tellMemories(); resize(true);
  }
  function tellMemories() {
    const all = memories();
    onMemories(all.filter((it) => it.gone).length, all.length);
  }

  // She walked into someone: they say something, and soon move out of the way.
  function bump(it) {
    if (it.wait > 0) return;
    const lines = LINES[it.type];
    onSay(lines[it.bumps]);
    it.bumps++; it.wait = 1.1; it.wobble = 1;
    sfx('boing');
    if (it.bumps === lines.length) { it.leaving = .001; sfx('whoosh'); }
  }

  // Her question is answered: keep the key and step back inside the maze.
  function finishDoor(i) {
    const e = maze.exits[i];
    found[i] = true;
    if (e.y === 0) Object.assign(girl, { x: e.x + .5, y: 1.5, dir: 'down' });
    else if (e.x === 0) Object.assign(girl, { x: 1.5, y: e.y + .5, dir: 'right' });
    else Object.assign(girl, { x: W - 1.5, y: e.y + .5, dir: 'left' });
    girl.moving = false; atDoor = -1; sliding = null;
    uncover(); onKeys(found);
  }

  // Move along one axis. If blocked, slide towards the middle of an opening so
  // corners don't need pixel-perfect thumbs.
  function move(axis, amount) {
    const other = axis === 'x' ? 'y' : 'x';
    const next = { x: girl.x, y: girl.y, [axis]: girl[axis] + amount };
    if (fits(next.x, next.y)) { girl[axis] = next[axis]; return; }
    const reach = Math.floor(girl[axis] + Math.sign(amount) * (BODY + .15)), row = Math.floor(girl[other]);
    const who = axis === 'x' ? blocker(reach, row) : blocker(row, reach);
    if (who) { bump(who); return; }
    const ahead = Math.floor(girl[axis]) + Math.sign(amount), lane = Math.floor(girl[other]);
    const isOpen = axis === 'x' ? open(ahead, lane) : open(lane, ahead);
    if (!isOpen) return;
    const gap = lane + .5 - girl[other];
    const nudge = Math.sign(gap) * Math.min(Math.abs(gap), Math.abs(amount));
    const slid = { x: girl.x, y: girl.y, [other]: girl[other] + nudge };
    if (fits(slid.x, slid.y)) girl[other] = slid[other];
  }

  function step(dt, input) {
    t += dt;
    for (const it of items) {
      it.wait = Math.max(0, it.wait - dt); it.wobble = Math.max(0, it.wobble - dt * 2);
      if (it.leaving) { it.leaving += dt / 1.1; if (it.leaving >= 1) { it.leaving = 0; it.gone = true; } }
    }
    const icy = items.some((it) => it.type === 'ice' && it.x === Math.floor(girl.x) && it.y === Math.floor(girl.y));
    if (!icy) sliding = null;
    else if (!sliding && Math.hypot(input.x, input.y) > .3) {
      const flat = Math.abs(input.x) > Math.abs(input.y);
      sliding = { x: flat ? Math.sign(input.x) : 0, y: flat ? 0 : Math.sign(input.y), on: true };
      sfx('slide');
    }
    if (sliding?.on) {
      // On ice she keeps going, spinning, until she is off it or hits something.
      const x = girl.x, y = girl.y, d = SPEED * 1.4 * dt;
      if (sliding.x) move('x', sliding.x * d); else move('y', sliding.y * d);
      girl.dir = ['down', 'right', 'up', 'left'][Math.floor(t * 9) % 4]; girl.moving = false;
      tip.hidden = true;
      if (Math.hypot(girl.x - x, girl.y - y) < d * .3) sliding.on = false;
      uncover();
      input = { x: 0, y: 0 };
    }
    const power = Math.hypot(input.x, input.y);
    girl.moving = power > 0;
    if (girl.moving) {
      if (Math.floor(girl.walk / Math.PI) !== stepped) { stepped = Math.floor(girl.walk / Math.PI); sfx('step'); }
      tip.hidden = true;
      girl.dir = Math.abs(input.x) > Math.abs(input.y) ? (input.x > 0 ? 'right' : 'left') : (input.y > 0 ? 'down' : 'up');
      girl.walk += dt * 11 * Math.max(.5, power);
      move('x', input.x * SPEED * dt);
      move('y', input.y * SPEED * dt);
      uncover();
    }
    const memory = items.find((it) => it.type === 'memory' && !it.gone && Math.hypot(it.x + .5 - girl.x, it.y + .5 - girl.y) < .55);
    if (memory) { memory.gone = true; tellMemories(); onMemory(memory.memory); return; }
    const tx = Math.floor(girl.x), ty = Math.floor(girl.y);
    const here = maze.exits.findIndex((e) => e.x === tx && e.y === ty);
    if (here !== atDoor) {
      atDoor = here;
      if (here >= 0 && !found[here]) onDoor(here);
    }
  }

  function uncover() {
    const cx = Math.floor(girl.x), cy = Math.floor(girl.y);
    for (let y = cy - SEE; y <= cy + SEE; y++) for (let x = cx - SEE; x <= cx + SEE; x++) {
      if (seen[y]?.[x] !== undefined) seen[y][x] = true;
    }
  }

  function resize(force) {
    const w = root.clientWidth, h = root.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    if (!maze || !w || (!force && w === vw && h === vh && ratio === dpr)) return;
    vw = w; vh = h; dpr = ratio;
    tile = Math.round(Math.min(84, Math.max(46, Math.min(vw / 6.2, vh / 8))));
    canvas.width = vw * dpr; canvas.height = vh * dpr;
    map.width = (W * 5 + 8) * dpr; map.height = (H * 5 + 8) * dpr; // 4px margin for the door dots
    map.style.width = `${W * 5 + 8}px`; map.style.height = `${H * 5 + 8}px`;
    art = makeArt(maze, tile, dpr);
    vignette = ctx.createRadialGradient(0, 0, tile * 1.6, 0, 0, Math.max(vw, vh) * .75);
    vignette.addColorStop(0, 'rgba(255,205,130,.10)');
    vignette.addColorStop(.35, 'rgba(26,32,84,.12)');
    vignette.addColorStop(1, 'rgba(16,22,62,.72)');
  }

  function camera() {
    // Follow her, but stop near the edges. Leave room for the mini-map and joystick.
    const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    return {
      x: clamp(girl.x * tile - vw / 2, -tile, W * tile - vw + tile),
      y: clamp(girl.y * tile - vh * .46, -tile * 2.2, H * tile - vh + tile * 2.6),
    };
  }

  function draw() {
    const cam = camera();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = art.forest; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Work in whole device pixels so tiles never show seams.
    const size = tile * dpr, ox = Math.round(cam.x * dpr), oy = Math.round(cam.y * dpr);
    const x0 = Math.floor(ox / size) - 1, x1 = Math.ceil((ox + canvas.width) / size) + 1;
    const y0 = Math.floor(oy / size) - 1, y1 = Math.ceil((oy + canvas.height) / size) + 2;
    const at = (x, y) => [x * size - ox, y * size - oy];

    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!art.isWall(x, y)) art.floor(ctx, x, y, ...at(x, y));
    }
    for (const it of items) {
      if (it.type !== 'ice') continue;
      const [ix, iy] = at(it.x, it.y);
      ctx.save(); ctx.translate(ix, iy); ctx.scale(size / 100, size / 100); drawIce(ctx, t); ctx.restore();
    }
    const girlRow = Math.floor(girl.y);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (art.outside(x, y)) art.pine(ctx, x, y, ...at(x, y));
        else if (art.isWall(x, y)) art.wall(ctx, x, y, ...at(x, y));
      }
      maze.exits.forEach((e, i) => { if (e.y === y) drawDoor(i, e, at); });
      for (const it of items) {
        if (it.y !== y || it.gone || it.type === 'ice') continue;
        const [ix, iy] = at(it.x + .5, it.y + .68);
        ctx.save(); ctx.translate(ix, iy); ctx.scale(size / 108, size / 108); drawItem(ctx, it, t); ctx.restore();
      }
      if (y === girlRow) {
        ctx.save();
        ctx.translate(girl.x * size - ox, (girl.y + .24) * size - oy);
        ctx.scale(size / 92, size / 92);
        drawGirl(ctx, { ...girl, t });
        ctx.restore();
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(girl.x * tile - cam.x, girl.y * tile - cam.y);
    ctx.fillStyle = vignette; ctx.fillRect(-vw * 2, -vh * 2, vw * 4, vh * 4);
    drawMap();
  }
  function drawDoor(i, e, at) {
    const [x, y] = at(e.x, e.y);
    ctx.save(); ctx.scale(dpr, dpr); art.door(ctx, i, found[i], x / dpr, y / dpr, t); ctx.restore();
  }

  function drawMap() {
    const s = 5 * dpr;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, map.width, map.height);
    mctx.translate(4 * dpr, 4 * dpr);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!seen[y][x]) continue;
      mctx.fillStyle = maze.walls[y][x] ? '#3a7d68' : '#f1f2ff';
      mctx.fillRect(x * s, y * s, s, s);
    }
    maze.exits.forEach((e, i) => {
      mctx.fillStyle = found[i] ? '#8d90ac' : DOOR_COLOURS[i];
      mctx.beginPath(); mctx.arc((e.x + .5) * s, (e.y + .5) * s, s * (found[i] ? .7 : 1 + Math.sin(t * 4) * .15), 0, 7); mctx.fill();
      mctx.lineWidth = dpr; mctx.strokeStyle = '#fff'; mctx.stroke();
    });
    for (const it of items) {
      if (it.type !== 'memory' || it.gone || !seen[it.y][it.x]) continue;
      mctx.fillStyle = '#ff8fb8'; mctx.beginPath(); mctx.arc((it.x + .5) * s, (it.y + .5) * s, s * .6, 0, 7); mctx.fill();
    }
    mctx.fillStyle = '#8e44d6'; mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5 * dpr;
    mctx.beginPath(); mctx.arc(girl.x * s, girl.y * s, s * .85, 0, 7); mctx.fill(); mctx.stroke();
  }

  function loop(now) {
    if (!state.running) return;
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    resize();
    step(dt, stick.read());
    if (state.running) draw();
    frame = requestAnimationFrame(loop);
  }

  return Object.assign(state, {
    newMaze, finishDoor, step, draw,
    save: () => ({ seed: maze.seed, found, x: girl.x, y: girl.y, seen: seen.flat().map(Number).join(''), gone: items.filter((it) => it.gone || it.leaving).map((it) => it.id) }),
    start() {
      if (state.running) return;
      state.running = true; stick.reset(); resize();
      last = performance.now(); frame = requestAnimationFrame(loop);
    },
    stop() { state.running = false; stick.reset(); cancelAnimationFrame(frame); },
  });
}
