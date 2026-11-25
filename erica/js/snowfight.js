// Pictures for the snowball fight. Units match girl.js: feet at (0, 0), about 100 tall.

const oval = (c, x, y, rx, ry, fill, rot = 0) => { c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, 7); c.fill(); };

export function drawBall(c, r) {
  oval(c, 0, 0, r, r, '#ffffff'); oval(c, r * .2, r * .25, r * .7, r * .62, '#e3ebfa'); oval(c, -r * .2, -r * .2, r * .55, r * .5, '#ffffff');
}

// Snow stuck to her after each hit. amount: 0 clean to 1 nearly buried.
const SPLATS = [[-14, -32, 11], [12, -24, 12], [-18, -80, 12], [16, -50, 10], [0, -12, 17], [18, -84, 13], [-20, -54, 11], [4, -96, 15], [-6, -40, 13], [20, -12, 12], [-20, -10, 12]];
export function drawSnowOn(c, amount) {
  const n = Math.round(amount * SPLATS.length);
  for (let i = 0; i < n; i++) { const [x, y, r] = SPLATS[i]; oval(c, x, y + 2, r, r * .75, '#dce6f7'); oval(c, x, y, r, r * .72, '#fff'); }
}

// Erica the snowman, with only her eyes and smile showing.
export function drawSnowErica(c, t) {
  oval(c, 0, 0, 36, 9, 'rgba(38,42,86,.28)');
  oval(c, 3, -27, 37, 30, '#dce6f7'); oval(c, 0, -28, 36, 29, '#fff');
  oval(c, 3, -74, 29, 27, '#dce6f7'); oval(c, 0, -75, 28, 26, '#fff');
  // Stick arms
  c.strokeStyle = '#6b4530'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-33, -34); c.lineTo(-50, -46); c.moveTo(-45, -43); c.lineTo(-50, -38); c.moveTo(33, -34); c.lineTo(50, -46); c.moveTo(45, -43); c.lineTo(50, -38); c.stroke();
  // Scarf and buttons
  c.fillStyle = '#2f7d68'; c.beginPath(); c.roundRect(-25, -58, 50, 10, 5); c.fill();
  c.fillStyle = '#225d4e'; c.beginPath(); c.roundRect(6, -54, 10, 22, 5); c.fill();
  oval(c, 0, -34, 2.8, 2.8, '#b5323f'); oval(c, 0, -22, 2.8, 2.8, '#b5323f');
  // Her face peeping out
  oval(c, 0, -73, 20, 15, '#fbdcc2');
  const blink = t % 1.6 < .14;
  for (const x of [-9, 9]) {
    c.strokeStyle = '#5c4743'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x - 5, -82 + (x < 0 ? -1 : 1)); c.quadraticCurveTo(x, -85, x + 5, -82 + (x < 0 ? 1 : -1)); c.stroke();
    if (blink) { c.fillStyle = '#2a1c1e'; c.fillRect(x - 4, -75, 8, 2); } else { oval(c, x, -75, 4, 5, '#2a1c1e'); oval(c, x + 1.3, -77, 1.5, 1.8, '#fff'); }
  }
  oval(c, -14, -68, 4, 2.4, '#f2a08f'); oval(c, 14, -68, 4, 2.4, '#f2a08f');
  oval(c, 0, -65, 3.4, 3.6 + Math.sin(t * 5) * .6, '#b4515a'); // a surprised little "oh!"
  // Her Santa hat
  c.save(); c.translate(10, -97); c.rotate(.25); c.scale(.8, .8);
  c.fillStyle = '#d23b47'; c.beginPath(); c.moveTo(-21, 0); c.quadraticCurveTo(-17, -27, 0, -28); c.quadraticCurveTo(19, -27, 21, 0); c.fill();
  c.fillStyle = '#a62a38'; c.beginPath(); c.moveTo(-3, -28); c.quadraticCurveTo(22, -32, 31, -10); c.quadraticCurveTo(22, -18, 14, -17); c.fill();
  oval(c, 31, -7, 7, 7, '#fff8f0'); c.fillStyle = '#fff8f0'; c.beginPath(); c.roundRect(-24, -6, 48, 11, 5.5); c.fill();
  c.restore();
}

// A wobbling speech bubble with its tail at (0, 0).
export function drawBubble(c, words, t) {
  c.save(); c.rotate(Math.sin(t * 14) * .04); c.font = '600 22px Fredoka, sans-serif';
  const w = c.measureText(words).width + 28;
  c.fillStyle = '#fffdf8'; c.beginPath(); c.roundRect(-w / 2, -50, w, 40, 18); c.fill();
  c.beginPath(); c.moveTo(-9, -14); c.lineTo(0, 2); c.lineTo(9, -14); c.fill();
  c.fillStyle = '#b5323f'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(words, 0, -29);
  c.restore();
}
