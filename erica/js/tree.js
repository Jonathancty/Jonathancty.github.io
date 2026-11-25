// Someone is waiting for her. After a snowball fight she cannot win, they walk hand in hand to the memory tree, where every
// photo she found hangs as an ornament.
import { makeStage } from './stage.js';
import { drawGirl } from './girl.js';
import { drawPartner, drawCouple } from './partner.js';
import { drawBall, drawSnowOn, drawSnowErica, drawBubble } from './snowfight.js';
import { star } from './art.js';
import { rng } from './maze.js';
import { sfx } from './audio.js';

// Where photos hang: across the tree (-.5 to .5) and down it (0 to 1).
const SLOTS = {
  5: [[0, .27], [-.13, .45], [.14, .49], [-.2, .67], [.2, .7]],
  8: [[0, .23], [-.1, .42], [.13, .46], [-.18, .62], [.07, .66], [-.27, .77], [.27, .77], [.02, .8]],
};
const GAP = 62, APART = 108, THROWS = 6;
const BULBS = ['#ff6b6b', '#ffcf70', '#8fc7ff', '#ff9fc6', '#fff3b0'];
const FAR = Array.from({ length: 40 }, (_, i) => { const r = rng(i + 400); return { x: r(), y: r(), s: r() }; });

export function makeTree(root) {
  const ask = root.querySelector('.ask'), title = ask.querySelector('h1'), text = ask.querySelector('.lead');
  const button = root.querySelector('.low'), hang = root.querySelector('.ornaments');
  const stage = makeStage(root, draw);
  let gx = 0, px = 0, coupleX = 0, hop = 0, snow = 0, frozen = false, laugh = 0, pull = 0, fighting = false, nextThrow = 0, hers = 0, his = 0, balls = [], puffs = [], before = 0;
  let k = 1, scroll = 1, together = false, walk = 0, moving = false, dir = 'down', hold = 0, lit = 0, shining = 0, heart = 0, waiting = 'left';
  let press = null, count = 5, size = 60;

  function layout() {
    const { w, h } = stage, sideways = h < 500 && w > h * 1.2;
    const left = sideways ? w * .5 : 0, area = w - left, mid = left + area / 2;
    k = Math.min(area / 375, h / (sideways ? 430 : 720), 1.3) * 1.05;
    const top = sideways ? 34 : h < 621 ? 156 : 226;
    const feet = h - (sideways ? 14 : h < 621 ? 84 : 102), base = feet - 34 * k;
    const treeH = base - top, treeW = Math.min(treeH * .66, area * .9);
    return { w, h, mid, area, top, base, feet, treeH, treeW, travel: w * 1.6 };
  }

  function draw(ctx, { w, h, t }) {
    const L = layout(), shift = scroll * L.travel;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0f1c40'); sky.addColorStop(.55, '#34427c'); sky.addColorStop(.85, '#a77b9c');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    for (const s of FAR) {
      ctx.globalAlpha = .35 + Math.sin(t * 2 + s.s * 30) * .3 + .2; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc((s.x * w * 1.2 + shift * .03) % (w * 1.2), s.y * h * .5, 1 + s.s * 1.4, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Hills and pines drift past at different speeds
    hill(ctx, w, h, L.base - 70 * k, 34 * k, 260 * k, shift * .25, '#6f78b4');
    pines(ctx, w, L.base - 34 * k, shift * .45, 150 * k, .75 * k, '#2f4f72');
    hill(ctx, w, h, L.base - 26 * k, 14 * k, 330 * k, shift * .6, '#b9bce0');
    pines(ctx, w, L.base - 6 * k, shift * .8, 310 * k, 1.15 * k, '#2c5f5c');
    hill(ctx, w, h, L.base - 4 * k, 5 * k, 420 * k, shift, '#f7f2f0');
    tree(ctx, L, L.mid + shift, t);

    // Footprints they leave in the snow
    ctx.fillStyle = 'rgba(120,128,180,.35)';
    if (together) for (let i = 1; i < 14; i++) {
      const step = 30 * k, phase = ((scroll * L.travel) % step + step) % step, x = L.mid - 70 * k - i * step + phase;
      if (scroll < 1 && x > L.mid - 70 * k - (1 - scroll) * L.travel) { ctx.beginPath(); ctx.ellipse(x, L.feet + (i % 2 ? 2 : -3) * k, 6 * k, 3 * k, 0, 0, 7); ctx.fill(); }
    }
    if (together) stage.place(L.mid + coupleX * k, L.feet, k, () => drawCouple(ctx, { dir, walk, moving, t, gap: GAP, hold }));
    else {
      // Each shakes a little when hit
      const sg = Math.sin(t * 40) * 4 * hers, sp = Math.sin(t * 40) * 4 * his;
      stage.place(L.mid + (gx + sg + Math.sin(pull * Math.PI * 6) * 5) * k, L.feet - hop * k, k, () => {
        if (frozen) { ctx.rotate(Math.sin(pull * Math.PI * 6) * .09); drawSnowErica(ctx, t); return; }
        drawGirl(ctx, { dir: 'right', walk, moving, t }); drawSnowOn(ctx, snow);
      });
      const giggle = laugh > 0 ? Math.abs(Math.sin(t * 13)) * 6 : 0;
      stage.place(L.mid + (px + sp + (pull > 0 ? Math.sin(pull * Math.PI * 6) * 5 + 4 : 0)) * k, L.feet - giggle * k, k, () => {
        if (pull > 0) { ctx.strokeStyle = '#17171b'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-8, -38); ctx.lineTo(gx + 40 - px, -38); ctx.stroke(); ctx.fillStyle = '#f5cfa6'; ctx.beginPath(); ctx.arc(gx + 40 - px, -38, 5.5, 0, 7); ctx.fill(); }
        drawPartner(ctx, { dir: waiting, walk, moving: moving && frozen, t });
      });
      if (laugh > 0) {
        const bx = Math.min(L.mid + px * k, L.w - 84 * k);
        stage.place(bx, L.feet - 122 * k, k * Math.min(1, laugh * 5), () => drawBubble(ctx, 'HAHAHA! 😂', t));
      }
    }
    snowballs(ctx, L, t);
    if (heart > 0) {
      ctx.globalAlpha = Math.min(1, (1 - heart) * 3);
      stage.place(L.mid, L.feet - (118 + heart * 46) * k, k * (.6 + Math.min(1, heart * 5) * .5), () => {
        ctx.fillStyle = '#e0505a'; ctx.beginPath(); ctx.moveTo(0, 16);
        ctx.bezierCurveTo(-40, -10, -22, -40, 0, -18); ctx.bezierCurveTo(22, -40, 40, -10, 0, 16); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    // Gentle snowfall
    ctx.fillStyle = '#fff';
    for (const s of FAR) {
      ctx.globalAlpha = .5 + s.s * .4; ctx.beginPath();
      ctx.arc(((s.x * w + shift * .9 + Math.sin(t + s.s * 9) * 14) % w + w) % w, (s.y * h * 3 + t * (26 + s.s * 40)) % h, 1.2 + s.s * 2, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Snowballs in the air, and the puffs where they land.
  function snowballs(ctx, L, t) {
    const dt = Math.min(.05, Math.max(0, t - before));
    before = t;
    hers = Math.max(0, hers - dt * 3); his = Math.max(0, his - dt * 3); nextThrow = Math.max(0, nextThrow - dt);
    for (const b of balls) {
      b.age += dt;
      const p = Math.min(1, b.age / b.time), a = b.mine ? gx + 22 : px - 22, z = b.mine ? px : gx;
      stage.place(L.mid + (a + (z - a) * p) * k, L.feet - (46 + Math.sin(p * Math.PI) * (b.big ? 110 : 62)) * k, k, () => { ctx.rotate(p * 5); drawBall(ctx, b.big ? 26 : 9); });
      if (p === 1) { b.done = true; b.land(); }
    }
    balls = balls.filter((b) => !b.done);
    ctx.fillStyle = '#fff';
    for (const f of puffs) {
      f.age += dt; f.vy += 260 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
      ctx.globalAlpha = Math.max(0, 1 - f.age / .9);
      ctx.beginPath(); ctx.arc(L.mid + f.x * k, L.feet + f.y * k, f.r * k, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    puffs = puffs.filter((f) => f.age < .9);
  }
  function puff(x, y, n, power) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.3, v = power * (.3 + Math.random() * .7);
      puffs.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, r: 2 + Math.random() * 5, age: 0 });
    }
  }
  function toss(mine, big = false) {
    sfx('throw');
    return new Promise((hit) => balls.push({
      mine, big, age: 0, time: big ? 1.1 : .55,
      land() {
        sfx('splat');
        if (mine) { his = 1; puff(px, -56, 16, 130); } else { hers = 1; puff(gx, -56, big ? 70 : 18, big ? 300 : 140); }
        hit();
      },
    }));
  }
  const throwBack = () => { if (fighting && nextThrow <= 0) { nextThrow = .4; toss(true); } };
  root.querySelector('canvas').addEventListener('pointerdown', throwBack);

  async function fight() {
    title.textContent = 'Snowball fight!'; text.textContent = 'Tap to throw!';
    waiting = 'right';
    await steps(1.1, (p) => { gx = -GAP / 2 - (APART - GAP / 2) * p; px = -gx; });
    waiting = 'left';
    button.textContent = 'Throw a snowball!'; button.hidden = false;
    fighting = true;
    const hits = [];
    for (let i = 1; i <= THROWS; i++) {
      await stage.pause(i === 1 ? .9 : 1.15);
      hits.push(toss(false).then(() => { snow = i / THROWS * .95; }));
    }
    await Promise.all(hits);
    fighting = false; button.hidden = true;
    title.textContent = 'Uh-oh…'; text.textContent = '';
    await stage.pause(.6);
    await toss(false, true);
    frozen = true; snow = 0;
    title.textContent = 'You are a snowman now!';
    await stage.pause(1);
    sfx('haha');
    stage.tween(2.4, (p) => { laugh = p < 1 ? p + .01 : 0; });
    await stage.pause(1.25);
    sfx('haha');
    await stage.pause(1.3);

    title.textContent = 'Okay, okay, I will get you out!';
    await steps(1.2, (p) => { px = APART + (gx + 74 - APART) * p; });
    // Three big tugs, and out she comes
    for (let i = 0; i < 3; i++) { sfx('boing'); await stage.tween(.5, (p) => { pull = p || .001; }); }
    pull = 0; frozen = false; snow = .25;
    sfx('pop');
    puff(gx, -50, 90, 320);
    const from = gx;
    await stage.tween(.6, (p) => { hop = Math.sin(p * Math.PI) * 46; gx = from + 12 * p; });
    hop = 0;
    waiting = 'right';
    await stage.pause(.25);
    snow = 0; puff(gx, -60, 24, 150); // she shakes it off
    coupleX = (gx + px) / 2;
    together = true; dir = 'right';
    await stage.tween(.4, (p) => { hold = p; });
    const start = coupleX;
    title.textContent = 'Come with me…';
    await steps(1.2, (p) => { coupleX = start * (1 - p); });
  }

  function hill(ctx, w, h, y, bump, wave, shift, fill) {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 12; x += 12) ctx.lineTo(x, y + Math.sin((x - shift) / wave * Math.PI * 2) * bump);
    ctx.lineTo(w + 12, h); ctx.fill();
  }
  function pines(ctx, w, y, shift, gap, s, fill) {
    const first = Math.floor(-shift / gap) - 1;
    for (let i = first; i * gap + shift < w + gap; i++) {
      const r = rng(i + 9000), scale = s * (.8 + r() * .5), x = i * gap + shift + r() * gap * .5;
      stage.place(x, y, scale, () => {
        ctx.fillStyle = fill;
        for (const [a, half] of [[0, 34], [-24, 27], [-48, 19]]) { ctx.beginPath(); ctx.moveTo(0, a - 46); ctx.lineTo(half, a); ctx.lineTo(-half, a); ctx.fill(); }
        ctx.fillStyle = '#fff6ee'; ctx.beginPath(); ctx.moveTo(0, -94); ctx.lineTo(9, -74); ctx.lineTo(0, -78); ctx.lineTo(-9, -74); ctx.fill();
      });
    }
  }

  function tree(ctx, L, x, t) {
    const { top, treeH: th, treeW: tw } = L;
    if (x - tw > L.w || x + tw < 0) return;
    ctx.save(); ctx.translate(x, top);
    const glow = ctx.createRadialGradient(0, th * .55, 10, 0, th * .55, th * .8);
    glow.addColorStop(0, `rgba(255,214,130,${.5 * lit})`); glow.addColorStop(1, 'rgba(255,214,130,0)');
    ctx.fillStyle = glow; ctx.fillRect(-th, -th * .3, th * 2, th * 1.6);
    ctx.fillStyle = 'rgba(60,66,120,.25)'; ctx.beginPath(); ctx.ellipse(0, th, tw * .5, th * .035, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#6d4538'; ctx.fillRect(-tw * .06, th * .88, tw * .12, th * .12);
    const tiers = [[.55, .95, .5], [.34, .75, .41], [.16, .54, .31], [.0, .34, .2]];
    tiers.forEach(([a, b, half], i) => {
      const hw = half * tw;
      ctx.fillStyle = ['#22584f', '#296459', '#317063', '#3b7d6e'][i];
      ctx.beginPath(); ctx.moveTo(0, a * th); ctx.quadraticCurveTo(hw * .45, (a + (b - a) * .65) * th, hw, b * th);
      for (let n = 0; n < 5; n++) { const x1 = hw - hw * 2 * (n + 1) / 5; ctx.quadraticCurveTo(x1 + hw * .2, (b + .035) * th, x1, b * th); }
      ctx.quadraticCurveTo(-hw * .45, (a + (b - a) * .65) * th, 0, a * th); ctx.fill();
      // Snow resting along the edge
      ctx.strokeStyle = 'rgba(255,250,245,.8)'; ctx.lineWidth = th * .009; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-hw * .92, (b - .012) * th); ctx.quadraticCurveTo(-hw * .55, (b + .022) * th, -hw * .3, (b + .005) * th); ctx.stroke();
      // Lights come on from the bottom up
      for (let n = 0; n < 8; n++) {
        const u = n / 7 * 2 - 1, ly = (b - .06 - (1 - u * u) * -.02) * th, on = lit * 4.2 > i + .2;
        const colour = BULBS[(n + i) % BULBS.length];
        ctx.globalAlpha = on ? .65 + Math.sin(t * 3 + n * 2 + i) * .35 : .3;
        if (on) { ctx.fillStyle = `${colour}55`; ctx.beginPath(); ctx.arc(u * hw * .76, ly, th * .017, 0, 7); ctx.fill(); }
        ctx.fillStyle = on ? colour : '#173d37'; ctx.beginPath(); ctx.arc(u * hw * .76, ly, th * .008, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
    if (shining > 0) {
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, th * .26);
      g.addColorStop(0, `rgba(255,236,160,${.9 * shining})`); g.addColorStop(1, 'rgba(255,236,160,0)');
      ctx.fillStyle = g; ctx.fillRect(-th * .3, -th * .3, th * .6, th * .6);
    }
    star(ctx, 0, 0, th * (.052 + shining * .012 * (1 + Math.sin(t * 4) * .3)), shining > 0 ? '#ffdf6b' : '#8f8a78');
    ctx.restore();
  }

  function placeOrnaments() {
    if (hang.hidden) return;
    const L = layout(), slots = SLOTS[count > 5 ? 8 : 5];
    size = Math.max(44, Math.min(count > 5 ? 60 : 76, L.treeW * (count > 5 ? .2 : .25)));
    [...hang.children].forEach((b, i) => {
      b.style.width = b.style.height = `${size}px`;
      b.style.left = `${L.mid + slots[i][0] * L.treeW - size / 2}px`;
      b.style.top = `${L.top + slots[i][1] * L.treeH - size / 2}px`;
    });
  }
  addEventListener('resize', () => { if (stage.w) requestAnimationFrame(placeOrnaments); });
  button.addEventListener('click', () => { throwBack(); const p = press; press = null; p?.(); });

  async function steps(seconds, fn) {
    moving = true;
    let heard = 0;
    await stage.tween(seconds, (p) => {
      fn(p); walk = p * seconds * 9;
      const n = Math.floor(walk / Math.PI);
      if (n !== heard) { heard = n; sfx('step'); }
    });
    moving = false;
  }

  return {
    // memories: all photos. found: which she has. Resolves when she goes on.
    async play(memories, found, openPhoto, skipWalk) {
      count = memories.length; press = null;
      const all = count > 0 && found.length === count;
      button.hidden = true; hang.replaceChildren(); hang.hidden = true;
      gx = -2000; px = GAP / 2; coupleX = 0; hop = 0; snow = 0; frozen = false; laugh = 0; pull = 0; fighting = false; nextThrow = 0; hers = 0; his = 0; balls = []; puffs = [];
      together = false; walk = 0; hold = 0; lit = 0; shining = 0; heart = 0; scroll = 1; dir = 'right'; waiting = 'left';
      stage.start();
      if (skipWalk) { together = true; hold = 1; scroll = 0; } else {
        title.textContent = 'Someone was waiting for you…'; text.textContent = '';
        await stage.pause(.5);
        const enter = -(layout().mid / k + 60);
        await steps(2, (p) => { gx = enter + (-GAP / 2 - enter) * p; });
        sfx('sparkle');
        await stage.tween(1.5, (p) => { heart = p; });
        heart = 0; waiting = 'right';
        await stage.pause(.2);
        await fight();
        // Ease in and out, so they set off and arrive gently
        await steps(7, (p) => { scroll = 1 - p * p * (3 - 2 * p); });
      }
      dir = 'up';
      await stage.pause(.4);
      title.textContent = 'Our memory tree'; text.textContent = '';
      sfx('magic');
      await stage.tween(1.8, (p) => { lit = p; });

      hang.hidden = false;
      for (let i = 0; i < count; i++) {
        const has = found.includes(i), m = memories[i], b = document.createElement('button');
        b.type = 'button'; b.className = `ornament${has ? '' : ' lost'}`;
        b.setAttribute('aria-label', has ? `Open memory ${i + 1}` : `Memory ${i + 1}, not found yet`);
        if (has && m.image) { const img = document.createElement('img'); img.src = m.image; img.alt = ''; b.append(img); } else b.textContent = has ? '📷' : '?';
        b.addEventListener('click', () => {
          if (has) openPhoto(m);
          else text.textContent = 'Still hiding in the maze! Play again to find it.';
        });
        hang.append(b);
        placeOrnaments();
        sfx(has ? 'key' : 'click');
        await stage.pause(.38);
      }
      if (all) {
        await stage.pause(.3);
        sfx('fanfare');
        const L = layout();
        stage.burst(L.mid, L.top, 100, 420);
        await stage.tween(.8, (p) => { shining = p; });
      }
      text.textContent = !count ? 'Merry Christmas from both of us'
        : all ? 'You found them all, so the star shines for you!' : `You found ${found.length} of ${count}. Tap one to see it!`;
      await stage.pause(.6);
      dir = 'down'; // they turn round and smile
      button.textContent = 'Read my note'; button.hidden = false;
      await new Promise((resolve) => { press = resolve; });
      stage.stop();
    },
  };
}
