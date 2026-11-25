// Draws the maze scenery. Each distinct tile is painted once, then reused every frame.
import { W, H, rng } from './maze.js';

const C = {
  forest: '#1f4a4c', path: '#e3e4f5', pathDot: '#cfd2ec', shade: 'rgba(58,64,120,.22)',
  hedge: '#3a7d68', hedgeLight: '#4f9379', front: '#235249', snow: '#ffffff', snowShade: '#e2e8f7',
};
export const DOOR_COLOURS = ['#e0505a', '#f2b544', '#5b8fe0'];
const BULBS = ['#ff6b6b', '#ffcf70', '#8fc7ff', '#ff9fc6'];
const FRONT = .3; // height of a hedge's front face, in tiles

export function makeArt(maze, tile, dpr) {
  const { walls, seed } = maze;
  const isWall = (x, y) => walls[y]?.[x] ?? true;
  const outside = (x, y) => x < 0 || y < 0 || x >= W || y >= H;
  const cache = new Map();
  const px = Math.ceil(tile * dpr), pad = Math.ceil(px * .5);

  // Paint into a sprite with half a tile of spare room all round.
  function sprite(key, paint) {
    let s = cache.get(key);
    if (!s) {
      s = document.createElement('canvas');
      s.width = s.height = px + pad * 2;
      const c = s.getContext('2d');
      c.translate(pad, pad);
      c.scale(px / 100, px / 100); // 100 units = one tile
      paint(c);
      cache.set(key, s);
    }
    return s;
  }
  const put = (ctx, s, x, y) => ctx.drawImage(s, Math.round(x) - pad, Math.round(y) - pad);
  const dice = (x, y) => Math.floor(rng(seed + x * 7919 + y * 104729)() * 4);

  function floor(ctx, x, y, sx, sy) {
    const v = dice(x, y), above = isWall(x, y - 1);
    put(ctx, sprite(`f${v}${above}`, (c) => {
      c.fillStyle = C.path; c.fillRect(-1, -1, 102, 102);
      const r = rng(v + 5);
      c.fillStyle = C.pathDot;
      for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(12 + r() * 76, 30 + r() * 60, 4 + r() * 5, 2 + r() * 2, 0, 0, 7); c.fill(); }
      if (above) { c.fillStyle = C.shade; c.fillRect(-1, -1, 102, 24); }
    }), sx, sy);
  }

  function wall(ctx, x, y, sx, sy) {
    const n = isWall(x, y - 1), s = isWall(x, y + 1), w = isWall(x - 1, y), e = isWall(x + 1, y);
    const v = dice(x, y);
    put(ctx, sprite(`w${+n}${+s}${+w}${+e}${v}`, (c) => {
      const R = 30, lift = FRONT * 100;
      const corner = [n || w ? 0 : R, n || e ? 0 : R, s || e ? 0 : R, s || w ? 0 : R];
      // The front face shows only where there is path below.
      if (!s) {
        c.fillStyle = C.front;
        c.beginPath(); c.roundRect(-1.5, 40, 103, 60, [0, 0, e ? 0 : R, w ? 0 : R]); c.fill();
      }
      c.fillStyle = C.hedge;
      c.beginPath(); c.roundRect(-1.5, -lift, 103, s ? 102 + lift : 100, corner); c.fill();
      // Leafy texture and patches of snow
      const r = rng(v * 31 + 3);
      c.fillStyle = C.hedgeLight;
      for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(14 + r() * 72, -14 + r() * 66, 5 + r() * 6, 0, 7); c.fill(); }
      for (const [fill, dy] of [[C.snowShade, 4], [C.snow, 0]]) {
        c.fillStyle = fill; c.beginPath();
        c.ellipse(34 + v * 9, 8 + dy, 27, 15, 0, 0, 7); c.ellipse(60 - v * 5, 22 + dy, 20, 11, 0, 0, 7); c.fill();
      }
      // A couple of fairy-light bulbs on the front
      if (!s && v < 2) for (let i = 0; i < 2; i++) {
        const bx = 28 + i * 44, colour = BULBS[(v * 2 + i) % BULBS.length];
        c.save(); c.shadowColor = colour; c.shadowBlur = px * .12; c.fillStyle = colour;
        c.beginPath(); c.ellipse(bx, 84, 6, 8, 0, 0, 7); c.fill(); c.restore();
      }
    }), sx, sy);
  }

  // Snowy pines fill the world beyond the maze.
  function pine(ctx, x, y, sx, sy) {
    const v = dice(x, y);
    if (v === 3) return;
    put(ctx, sprite(`p${v}`, (c) => {
      const k = .85 + v * .12;
      c.translate(50, 92); c.scale(k, k);
      for (const [top, half, fill] of [[-60, 44, '#2b6359'], [-88, 36, '#337063'], [-116, 27, '#3c7d6e']]) {
        c.fillStyle = fill; c.beginPath(); c.moveTo(0, top - 14); c.quadraticCurveTo(half * .5, top + 30, half, top + 50);
        c.quadraticCurveTo(0, top + 62, -half, top + 50); c.quadraticCurveTo(-half * .5, top + 30, 0, top - 14); c.fill();
      }
      c.fillStyle = C.snow; c.beginPath(); c.moveTo(0, -130); c.quadraticCurveTo(9, -108, 17, -96);
      c.quadraticCurveTo(6, -101, 0, -95); c.quadraticCurveTo(-6, -101, -17, -96); c.quadraticCurveTo(-9, -108, 0, -130); c.fill();
    }), sx, sy);
  }

  function door(ctx, i, found, sx, sy, t) {
    ctx.save();
    ctx.translate(sx + tile / 2, sy + tile * .72); ctx.scale(tile / 100, tile / 100);
    drawDoor(ctx, i, found, t);
    ctx.restore();
  }

  return { isWall, outside, floor, wall, pine, door, forest: C.forest };
}

export function star(c, x, y, r, fill) {
  c.fillStyle = fill; c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r * .48 : r;
    c.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  c.closePath(); c.fill();
}

// A candy-cane arch with a glowing magic door. Found doors show a tick.
// 100 units = one tile, with the doorstep at (0, 0).
export function drawDoor(ctx, i, found, t, reach = 105) {
  const colour = DOOR_COLOURS[i];
  ctx.save();
  const glow = ctx.createRadialGradient(0, -55, 10, 0, -55, reach);
  glow.addColorStop(0, `${colour}${found ? '55' : 'cc'}`); glow.addColorStop(1, `${colour}00`);
  ctx.globalAlpha = found ? 1 : .75 + Math.sin(t * 3 + i) * .25;
  ctx.fillStyle = glow; ctx.fillRect(-105, -160, 210, 210);
  ctx.globalAlpha = 1;
  ctx.fillStyle = found ? '#8d90ac' : colour;
  ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-34, -66); ctx.arc(0, -66, 34, Math.PI, 0); ctx.lineTo(34, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-20, -62); ctx.arc(0, -62, 20, Math.PI, 0); ctx.lineTo(20, 0); ctx.closePath(); ctx.fill();
  const arch = () => { ctx.beginPath(); ctx.moveTo(-40, -2); ctx.lineTo(-40, -66); ctx.arc(0, -66, 40, Math.PI, 0); ctx.lineTo(40, -2); ctx.stroke(); };
  ctx.lineCap = 'round'; ctx.lineWidth = 15; ctx.strokeStyle = '#fff'; arch();
  ctx.lineCap = 'butt'; ctx.lineWidth = 15; ctx.strokeStyle = '#d23b47'; ctx.setLineDash([11, 13]); arch();
  ctx.setLineDash([]);
  if (found) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 9; ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-15, -50); ctx.lineTo(-4, -38); ctx.lineTo(17, -64); ctx.stroke();
  } else star(ctx, 0, -56 + Math.sin(t * 2.5 + i) * 3, 19, '#fff6d8');
  ctx.restore();
}
