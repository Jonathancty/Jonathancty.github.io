// The present wheel: her three keys unlock it, then one spin picks a box.
import { makeStage } from './stage.js';
import { sfx } from './audio.js';
import { drawBox, BOXES } from './box.js';
import { drawGirl } from './girl.js';
import { star, DOOR_COLOURS } from './art.js';

const N = BOXES.length, SLICE = Math.PI * 2 / N;

function drawKey(c, colour) {
  c.strokeStyle = colour; c.lineWidth = 6; c.lineCap = c.lineJoin = 'round';
  c.beginPath(); c.arc(0, -14, 8, 0, 7); c.moveTo(0, -6); c.lineTo(0, 18); c.moveTo(0, 8); c.lineTo(8, 8); c.moveTo(0, 18); c.lineTo(9, 18); c.stroke();
}

export function makeWheel(root) {
  const title = root.querySelector('h1'), text = root.querySelector('.lead'), button = root.querySelector('button');
  const stage = makeStage(root, draw);
  let k = 1, rot = 0, keys = [], locked = 3, landed = -1, girl, flick = 0, press = null;

  function layout() {
    const { w, h } = stage, sideways = h < 500 && w > h * 1.2;
    const left = sideways ? w * .5 : 0, area = w - left;
    const r = sideways ? h * .36 : Math.min(area * .42, h * .25, 250);
    k = r / 157;
    return { x: left + area / 2, y: sideways ? h * .54 : Math.max(h * .45, r + 170), r, girlX: left + area * (sideways ? .1 : .2), girlY: h * (sideways ? .93 : .83) };
  }

  function draw(ctx, { t }) {
    const L = layout(), { x, y, r } = L, lit = locked === 0;
    // Stand
    ctx.strokeStyle = '#7b4a44'; ctx.lineWidth = 16 * k; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - r * .62, y + r * 1.32); ctx.moveTo(x, y); ctx.lineTo(x + r * .62, y + r * 1.32); ctx.stroke();
    // Rim
    ctx.fillStyle = '#84202d'; ctx.beginPath(); ctx.arc(x, y + 5 * k, r + 13 * k, 0, 7); ctx.fill();
    ctx.fillStyle = '#b5323f'; ctx.beginPath(); ctx.arc(x, y, r + 13 * k, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    for (let i = 0; i < N; i++) {
      const a = -Math.PI / 2 + i * SLICE;
      ctx.fillStyle = BOXES[i].slice;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a - SLICE / 2, a + SLICE / 2); ctx.fill();
      ctx.strokeStyle = '#fff6ee'; ctx.lineWidth = 3 * k; ctx.stroke();
      ctx.save(); ctx.rotate(i * SLICE); ctx.translate(0, -r * .48); ctx.scale(.62 * k, .62 * k);
      drawBox(ctx, i); ctx.restore();
    }
    if (landed >= 0) {
      ctx.globalAlpha = .25 + Math.sin(t * 8) * .15; ctx.fillStyle = '#fff';
      const a = -Math.PI / 2 + landed * SLICE;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a - SLICE / 2, a + SLICE / 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (!lit) { ctx.fillStyle = 'rgba(22,41,77,.5)'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    // Bulbs round the rim
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2, on = lit && (landed >= 0 ? Math.floor(t * 6) % 2 === i % 2 : Math.floor(t * 4 + i) % 3 === 0);
      ctx.fillStyle = on ? '#fff3b0' : '#e58a6b';
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * (r + 6.5 * k), y + Math.sin(a) * (r + 6.5 * k), 4 * k, 0, 7); ctx.fill();
    }
    // Hub, with a keyhole for each key
    ctx.fillStyle = '#cf9326'; ctx.beginPath(); ctx.arc(x, y + 3 * k, 33 * k, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffcf70'; ctx.beginPath(); ctx.arc(x, y, 33 * k, 0, 7); ctx.fill();
    if (lit) star(ctx, x, y, (18 + Math.sin(t * 4)) * k, '#fff6ee');
    else for (let i = 0; i < 3; i++) {
      const hx = x + (i - 1) * 19 * k;
      ctx.fillStyle = keys[i]?.in ? DOOR_COLOURS[i] : '#5c3a2a';
      ctx.beginPath(); ctx.arc(hx, y - 4 * k, 5.5 * k, 0, 7); ctx.fill(); ctx.fillRect(hx - 2.5 * k, y - 3 * k, 5 * k, 14 * k);
    }
    // Pointer, knocked sideways by each passing slice
    ctx.save(); ctx.translate(x, y - r - 16 * k); ctx.rotate(flick);
    ctx.fillStyle = '#fff6ee'; ctx.strokeStyle = '#84202d'; ctx.lineWidth = 3 * k; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-15 * k, -14 * k); ctx.lineTo(15 * k, -14 * k); ctx.lineTo(0, 26 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();

    const hop = girl.happy ? Math.abs(Math.sin(t * 6)) * 10 * k : 0;
    stage.place(L.girlX, L.girlY - hop, k * 1.15, () => drawGirl(ctx, { ...girl, t }));
    keys.forEach((key, i) => {
      if (key.in) return;
      const sx = L.girlX + (i - 1) * 26 * k, sy = L.girlY - 130 * k + Math.sin(t * 3 + i) * 3;
      const ex = x + (i - 1) * 19 * k, ey = y, p = key.p;
      stage.place(sx + (ex - sx) * p, sy + (ey - sy) * p - Math.sin(p * Math.PI) * 50 * k, k * .9, () => { ctx.rotate(p * Math.PI * 4); drawKey(ctx, DOOR_COLOURS[i]); });
    });
  }

  const pressed = () => new Promise((resolve) => { press = resolve; });
  const go = () => { const p = press; press = null; p?.(); };
  button.addEventListener('click', go);
  root.querySelector('canvas').addEventListener('click', (e) => {
    const L = layout(), box = root.getBoundingClientRect();
    if (landed < 0 && Math.hypot(e.clientX - box.left - L.x, e.clientY - box.top - L.y) < L.r) go();
  });

  return {
    // choose() returns the box to land on. Resolves with it once she taps to open.
    async play(names, choose) {
      rot = 0; locked = 3; landed = -1; flick = 0; press = null;
      keys = [0, 1, 2].map(() => ({ p: 0, in: false }));
      girl = { dir: 'right', walk: 0, moving: false, happy: false };
      title.textContent = 'The present wheel';
      text.textContent = 'Your three keys fit the lock…';
      button.hidden = true;
      stage.start();
      await stage.pause(.9);
      for (const key of keys) {
        await stage.tween(.7, (p) => { key.p = p * p * (3 - 2 * p); });
        key.in = true; sfx('click');
        await stage.pause(.15);
      }
      await stage.pause(.35);
      locked = 0; sfx('magic');
      let L = layout();
      stage.burst(L.x, L.y, 30, 260);
      text.textContent = 'Six presents, one spin. Make it count!';
      button.textContent = 'Spin the wheel!'; button.hidden = false;
      await pressed();

      button.hidden = true;
      text.textContent = 'Round and round…';
      girl.dir = 'up';
      const box = choose();
      const lean = (Math.random() - .5) * SLICE * .6; // never stops on a line
      const end = Math.PI * 2 * (stage.calm ? 1 : 7) - box * SLICE + lean;
      let passed = 0;
      await stage.tween(stage.calm ? 2 : 6.5, (p) => {
        rot = end * (1 - (1 - p) ** 3.4);
        const edge = Math.floor(rot / SLICE + .5);
        if (edge !== passed) { passed = edge; flick = -.35; sfx('tick'); }
        flick *= .86;
      });
      flick = 0; landed = box; sfx('fanfare');
      girl.dir = 'down'; girl.happy = true;
      L = layout();
      stage.burst(L.x, L.y - L.r * .6, 90, 460);
      title.textContent = names[box];
      text.textContent = 'This present chose you!';
      button.textContent = 'Open it'; button.hidden = false;
      title.focus({ preventScroll: true });
      await pressed();
      stage.stop();
      return box;
    },
  };
}
