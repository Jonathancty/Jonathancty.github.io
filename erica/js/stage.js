// A full-screen animated canvas: frame loop, tweens and confetti.
const CONFETTI = ['#e0505a', '#f2b544', '#5b8fe0', '#58a673', '#ff9fc6', '#fff6ee'];

// paint(ctx, { w, h, t }) draws one frame.
export function makeStage(root, paint) {
  const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let run = 0, last = 0, t = 0, w = 0, h = 0, tweens = [], bits = [];

  function measure() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = root.clientWidth; h = root.clientHeight;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function frame(id, now) {
    if (id !== run) return; // stopped, or restarted since
    const dt = Math.min(Math.max(0, now - last) / 1000, .05);
    last = now; t += dt;
    for (const tw of [...tweens]) {
      tw.age += dt;
      const p = Math.min(1, tw.age / tw.seconds);
      tw.fn(p);
      if (p === 1) { tweens = tweens.filter((o) => o !== tw); tw.done(); }
    }
    for (const b of bits) { b.age += dt; b.vy += 420 * dt; b.vx *= 1 - dt; b.x += b.vx * dt; b.y += b.vy * dt; b.spin += dt * 6; }
    bits = bits.filter((b) => b.age < 2.4);
    measure();
    ctx.clearRect(0, 0, w, h);
    paint(ctx, { w, h, t });
    for (const b of bits) {
      ctx.save(); ctx.globalAlpha = Math.min(1, 2.4 - b.age); ctx.translate(b.x, b.y); ctx.rotate(b.spin);
      ctx.fillStyle = b.colour; ctx.fillRect(-b.r, -b.r / 2, b.r * 2, b.r); ctx.restore();
    }
    requestAnimationFrame((n) => frame(id, n));
  }

  // Runs fn(0..1) over some seconds, driven by the frame loop.
  const tween = (seconds, fn) => new Promise((done) => tweens.push({ age: 0, seconds, fn, done }));

  return {
    calm, tween,
    pause: (seconds) => tween(seconds, () => {}),
    get w() { return w; },
    get h() { return h; },
    // Call once the screen is visible.
    start() {
      const id = ++run;
      tweens = []; bits = [];
      measure();
      last = performance.now();
      requestAnimationFrame((n) => frame(id, n));
    },
    stop() { run++; tweens = []; bits = []; },
    burst(x, y, count = 70, power = 400) {
      if (calm) return;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, v = power * (.2 + Math.random() * .8);
        bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, r: 3 + Math.random() * 4, spin: Math.random() * 7, age: 0, colour: CONFETTI[i % CONFETTI.length] });
      }
    },
    place(x, y, scale, draw) { ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); draw(); ctx.restore(); },
  };
}
