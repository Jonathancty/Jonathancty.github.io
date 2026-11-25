// Falling snow on a full-screen canvas. Browsers pause it when the tab is hidden.
export function startSnow(canvas) {
  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w, h, flakes = [], last = 0;
  const make = () => ({ x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 2.6, p: Math.random() * 7 });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const nw = canvas.clientWidth, nh = canvas.clientHeight;
    if (nw === w && nh === h) return;
    w = nw; h = nh;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    flakes = Array.from({ length: Math.min(110, Math.round(w * h / 4500)) }, make);
    draw(0);
  }
  function draw(dt) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fffdf8';
    for (const f of flakes) {
      f.y += (12 + f.r * 17) * dt; f.p += dt;
      f.x += Math.sin(f.p) * 9 * dt;
      if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
      ctx.globalAlpha = Math.min(1, .35 + f.r / 6);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
    }
  }
  function tick(t) {
    draw(Math.min((t - last) / 1000, .05)); last = t;
    requestAnimationFrame(tick);
  }
  addEventListener('resize', resize);
  resize();
  if (!still) requestAnimationFrame(tick);
}
