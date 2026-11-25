// Draws the room behind a door: wall, floor, furniture and the wish machine.
// Objects are drawn in units where Erica is about 100 tall, standing at (0, 0).
import { star } from './art.js';

export const OPTION_COLOURS = ['#e0505a', '#f2b544', '#5b8fe0', '#58a673'];

const THEMES = [
  { wall: '#f5cfc2', pattern: '#efbfb1', skirt: '#fff6ee', rug: '#b5323f', rugIn: '#f3c7b4', prop: tree },
  { wall: '#f8e4b8', pattern: '#f1d69c', skirt: '#fff6ee', rug: '#2c6658', rugIn: '#d9e6c8', prop: cookies },
  { wall: '#cbdcf4', pattern: '#b9cdec', skirt: '#fff6ee', rug: '#46589a', rugIn: '#dfe4f7', prop: snowman },
];

function oval(c, x, y, rx, ry, fill) { c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill(); }
function box(c, x, y, w, h, r, fill) { c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }

// Wall, floor and rug. floorY is where the wall meets the floor; the room is centred on mid
// and the furniture fills a width of area.
export function drawRoom(c, theme, { w, h, floorY, k, mid, area }) {
  const T = THEMES[theme];
  c.fillStyle = T.wall; c.fillRect(0, 0, w, floorY);
  c.fillStyle = T.pattern;
  if (theme === 0) for (let x = (w / 2) % 44 - 44; x < w; x += 44) c.fillRect(x, 0, 18, floorY);
  else for (let y = 20, row = 0; y < floorY - 20; y += 40, row++) {
    for (let x = (w / 2) % 44 - 44 + (row % 2) * 22; x < w + 22; x += 44) {
      if (theme === 1) oval(c, x, y, 6, 6, T.pattern); else star(c, x, y, 8, T.pattern);
    }
  }
  // Floorboards
  c.fillStyle = '#b8835f'; c.fillRect(0, floorY, w, h - floorY);
  c.strokeStyle = '#a3714f'; c.lineWidth = 2; c.beginPath();
  for (let i = -8; i <= 8; i++) { c.moveTo(mid + i * w * .13, floorY); c.lineTo(mid + i * w * .24, h); }
  c.stroke();
  c.fillStyle = 'rgba(70,36,30,.16)'; c.fillRect(0, floorY, w, 12 * k);
  box(c, -4, floorY - 14 * k, w + 8, 14 * k, 0, T.skirt);
  c.fillStyle = '#e4d3c6'; c.fillRect(0, floorY - 3 * k, w, 3 * k);
  // Rug
  const ry = Math.min(34 * k, (h - floorY) * .34), cy = floorY + (h - floorY) * .56;
  oval(c, mid, cy, Math.min(area * .44, 150 * k), ry, T.rug);
  oval(c, mid, cy, Math.min(area * .39, 135 * k), ry * .8, T.rugIn);
  oval(c, mid, cy, Math.min(area * .35, 122 * k), ry * .67, T.rug);
}

export const drawProp = (c, theme, t) => THEMES[theme].prop(c, t);

function tree(c, t) {
  box(c, -7, -16, 14, 16, 3, '#6d4538');
  for (const [top, half, fill] of [[-46, 38, '#2b6359'], [-70, 31, '#337063'], [-94, 23, '#3c7d6e']]) {
    c.fillStyle = fill; c.beginPath(); c.moveTo(0, top); c.lineTo(half, top + 36); c.quadraticCurveTo(0, top + 46, -half, top + 36); c.fill();
  }
  [[-18, -20], [14, -24], [-8, -38], [16, -46], [-12, -60], [6, -70]].forEach(([x, y], i) => {
    c.globalAlpha = .65 + Math.sin(t * 3 + i * 2) * .35; oval(c, x, y, 3.6, 3.6, OPTION_COLOURS[i % 3 === 2 ? 1 : i % 2 * 2]);
  });
  c.globalAlpha = 1;
  star(c, 0, -96, 10, '#ffcf70');
  box(c, 20, -20, 22, 20, 3, '#d23b47'); box(c, 29, -20, 4, 20, 0, '#fff6ee');
}

function cookies(c, t) {
  box(c, -36, -34, 6, 34, 2, '#8b5a43'); box(c, 30, -34, 6, 34, 2, '#8b5a43');
  box(c, -44, -42, 88, 10, 5, '#a76e52'); box(c, -38, -44, 76, 14, 4, '#fff6ee');
  for (let i = 0; i < 6; i++) oval(c, -32 + i * 13, -30, 6, 5, '#fff6ee');
  oval(c, -14, -45, 20, 5, '#dfe4f7');
  for (const [x, y] of [[-24, -49], [-12, -50], [-3, -49], [-18, -56], [-8, -57]]) {
    oval(c, x, y, 8, 5.5, '#c98d55'); oval(c, x - 2, y - 1, 1.5, 1.2, '#5c3a2a'); oval(c, x + 3, y + 1, 1.5, 1.2, '#5c3a2a');
  }
  box(c, 14, -66, 16, 22, 4, '#eef4ff'); box(c, 16, -60, 12, 15, 3, '#fff');
  c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2.5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-14, -66); c.quadraticCurveTo(-18 + Math.sin(t * 2) * 4, -74, -14, -82); c.stroke();
}

export function snowman(c, t) {
  oval(c, 0, -22, 27, 24, '#fff'); oval(c, 0, -60, 20, 19, '#fff');
  oval(c, 10, -16, 14, 16, '#eaf0fc');
  box(c, -19, -49, 38, 8, 4, '#d23b47'); box(c, 6, -46, 8, 18, 4, '#a62a38');
  oval(c, -7, -64, 2.6, 3, '#2a1c1e'); oval(c, 7, -64, 2.6, 3, '#2a1c1e');
  c.fillStyle = '#ee8c45'; c.beginPath(); c.moveTo(0, -60); c.lineTo(15, -56 + Math.sin(t * 2)); c.lineTo(0, -54); c.fill();
  oval(c, 0, -30, 2.6, 2.6, '#2a1c1e'); oval(c, 0, -20, 2.6, 2.6, '#2a1c1e');
  box(c, -24, -80, 48, 6, 3, '#3a3350'); box(c, -15, -98, 30, 20, 4, '#3a3350'); box(c, -15, -84, 30, 5, 0, '#d23b47');
}

// Where button i sits on the machine, left or right of its middle.
export const buttonX = (i, options) => (i - (options - 1) / 2) * (72 / options);

// The wish machine. options: how many buttons. pressed: button index or -1.
// power: 0 (resting) to 1 (whirring at full speed).
export function drawMachine(c, { options, pressed, power, t }) {
  c.save();
  oval(c, 0, 0, 56, 9, 'rgba(60,30,40,.25)');
  c.translate(Math.sin(t * 62) * 2.2 * power, 0);
  c.rotate(Math.sin(t * 47) * .018 * power);
  // Snow globe on top
  const globe = c.createRadialGradient(-10, -122, 4, 0, -112, 38);
  globe.addColorStop(0, '#ffffff'); globe.addColorStop(1, power > .1 ? '#ffe49a' : '#bcd6f5');
  oval(c, 0, -112, 34, 34, globe);
  c.save(); c.beginPath(); c.arc(0, -112, 32, 0, 7); c.clip();
  oval(c, 0, -84, 30, 12, '#fff');
  c.fillStyle = '#337063'; c.beginPath(); c.moveTo(0, -126); c.lineTo(13, -92); c.lineTo(-13, -92); c.fill();
  star(c, 0, -127, 5, '#f2b544');
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4 + t * (.5 + power * 9), r = 8 + (i * 37 % 22);
    oval(c, Math.cos(a) * r, -112 + Math.sin(a * 1.3) * r, 1.8, 1.8, '#fff');
  }
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.arc(0, -112, 26, Math.PI * 1.1, Math.PI * 1.4); c.stroke();
  // Cabinet
  box(c, -30, -86, 60, 12, 6, '#f2b544');
  box(c, -50, -78, 100, 78, 14, '#2f7d68');
  box(c, -50, -78, 100, 12, 6, '#3f9680');
  box(c, -50, -10, 100, 10, 5, '#225d4e');
  // Chasing lights
  for (let i = 0; i < 7; i++) {
    const on = power > .1 ? Math.floor(t * 12) % 7 === i : (Math.floor(t * 1.5) + i) % 2 === 0;
    oval(c, -39 + i * 13, -71, 3, 3, on ? '#fff3b0' : '#1e5548');
  }
  // Buttons, in the same colours as the pictures on the wall
  box(c, -42, -62, 84, 24, 10, '#fff6ee');
  for (let i = 0; i < options; i++) {
    const x = buttonX(i, options), down = pressed === i;
    oval(c, x, -48, 8.5, 8.5, '#d8c4ba');
    if (down) { c.save(); c.shadowColor = OPTION_COLOURS[i]; c.shadowBlur = 22; }
    oval(c, x, down ? -48 : -51, 8, 8, OPTION_COLOURS[i]);
    if (down) c.restore();
    oval(c, x - 2.5, (down ? -48 : -51) - 3, 2.4, 1.8, 'rgba(255,255,255,.7)');
  }
  // Chute
  box(c, -22, -32, 44, 24, 10, '#f2b544');
  box(c, -17, -28, 34, 18, 8, power > .1 ? '#7a3b22' : '#16332d');
  // Lever
  c.strokeStyle = '#d8c4ba'; c.lineWidth = 5;
  const pull = pressed >= 0 ? .9 : -.5;
  c.beginPath(); c.moveTo(50, -44); c.lineTo(62, -44 + pull * 20); c.stroke();
  oval(c, 62, -44 + pull * 20, 6, 6, '#d23b47');
  c.restore();
}

// The surprise ball that pops out of the chute.
export function drawCapsule(c, colour, spin) {
  c.save(); c.rotate(spin);
  oval(c, 0, 0, 13, 13, '#fff6ee');
  c.fillStyle = colour; c.beginPath(); c.arc(0, 0, 13, Math.PI, 0); c.fill();
  box(c, -13, -2, 26, 4, 2, '#d8c4ba'); oval(c, 0, 0, 3.5, 3.5, '#fff');
  c.restore();
}
