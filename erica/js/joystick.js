// Touch joystick. It rests near the bottom and jumps to wherever the thumb lands,
// so it works for either hand. Arrow keys / WASD also work on a computer.
const RADIUS = 52, DEAD = .16;
const KEYS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
};

export function makeJoystick(surface, base, knob) {
  let finger = null, cx = 0, cy = 0, x = 0, y = 0;
  const held = new Set();

  function aim(e) {
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) { dx *= RADIUS / len; dy *= RADIUS / len; }
    x = dx / RADIUS; y = dy / RADIUS;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function release() {
    finger = null; x = y = 0;
    knob.style.transform = base.style.left = base.style.top = base.style.bottom = '';
    base.classList.remove('held');
  }
  surface.addEventListener('pointerdown', (e) => {
    if (finger !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    finger = e.pointerId;
    try { surface.setPointerCapture(finger); } catch { /* pointer already gone */ }
    const rect = surface.getBoundingClientRect();
    // Keep the whole stick on screen.
    cx = Math.min(Math.max(e.clientX, rect.left + 70), rect.right - 70);
    cy = Math.min(Math.max(e.clientY, rect.top + 70), rect.bottom - 70);
    base.style.left = `${cx - rect.left}px`; base.style.top = `${cy - rect.top}px`; base.style.bottom = 'auto';
    base.classList.add('held');
    aim(e);
  });
  surface.addEventListener('pointermove', (e) => { if (e.pointerId === finger) aim(e); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    surface.addEventListener(type, (e) => { if (e.pointerId === finger) release(); });
  }
  const keyOf = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
  addEventListener('keydown', (e) => {
    if (!KEYS[keyOf(e)] || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    held.add(keyOf(e));
    if (!surface.hidden && surface.offsetParent !== null) e.preventDefault();
  });
  addEventListener('keyup', (e) => held.delete(keyOf(e)));
  const reset = () => { held.clear(); release(); };
  addEventListener('blur', reset);
  document.addEventListener('visibilitychange', reset);

  return {
    reset,
    // Direction and strength: a vector no longer than 1.
    read() {
      let vx = x, vy = y;
      for (const k of held) { vx += KEYS[k][0]; vy += KEYS[k][1]; }
      const len = Math.hypot(vx, vy);
      if (len < DEAD) return { x: 0, y: 0 };
      const power = Math.min(1, (len - DEAD) / (.75 - DEAD));
      return { x: vx / len * power, y: vy / len * power };
    },
  };
}
