// The fairy lights: one bulb lights up for each letter typed.
const COLOURS = ['#ff6b6b', '#ffcf70', '#7ddc9a', '#8fc7ff', '#ff9fc6'];
const COUNT = 12;

export function makeLights(el) {
  let bulbs = '', wire = '';
  const y = (x) => 8 + 30 * Math.sin((x % 200) / 200 * Math.PI);
  for (let x = -600; x <= 1000; x += 10) wire += `${x > -600 ? 'L' : 'M'}${x} ${Math.abs(y((x + 600) % 200)).toFixed(1)}`;
  for (let i = 0; i < COUNT; i++) {
    const x = (i + .5) * 400 / COUNT, c = COLOURS[i % COLOURS.length];
    bulbs += `<g class="bulb" style="color:${c};--i:${i}" transform="translate(${x} ${y(x)})"><rect x="-3" y="-1" width="6" height="6" rx="2" fill="#24443f"/><ellipse cy="12" rx="5.5" ry="8" fill="currentColor"/></g>`;
  }
  el.innerHTML = `<svg viewBox="0 0 400 76" preserveAspectRatio="xMidYMin meet"><path d="${wire}" fill="none" stroke="#24443f" stroke-width="2.5"/>${bulbs}</svg>`;
  const all = [...el.querySelectorAll('.bulb')];
  return {
    set: (n) => all.forEach((b, i) => b.classList.toggle('on', i < n)),
    party() { this.set(COUNT); el.classList.add('party'); },
  };
}
