// Draws the chibi partner, in the same style and size as girl.js. Change LOOK to restyle.
import { drawGirl } from './girl.js';

const LOOK = {
  hair: '#3a2b2a', hairLight: '#594341', skin: '#f5cfa6', blush: '#eda487', eye: '#231a1a', brow: '#33282a', lip: '#b8675a', glasses: '#4a4f58',
  coat: '#26262b', coatDark: '#17171b', hood: '#34343b', shirt: '#fbfaf7', shirtShade: '#e3e1dd', pin: '#f4e04a',
  jeans: '#44618a', jeansDark: '#33496b', shoe: '#1d1d21', sole: '#ffffff',
};

function ellipse(c, x, y, rx, ry, fill, rot = 0) { c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, 7); c.fill(); }
function box(c, x, y, w, h, r, fill) { c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }
function shape(c, fill, draw) { c.fillStyle = fill; c.beginPath(); draw(); c.closePath(); c.fill(); }

export function drawPartner(c, { dir, walk, moving, t }) {
  const swing = moving ? Math.sin(walk) : 0;
  const bob = moving ? Math.abs(Math.cos(walk)) * 3 : Math.sin(t * 2 + 1) * .8;
  const side = dir === 'left' || dir === 'right';
  c.save();
  ellipse(c, 0, 0, 22, 7, 'rgba(38,42,86,.28)');
  if (dir === 'left') c.scale(-1, 1);
  // Jeans and sneakers
  for (const s of [-1, 1]) {
    const x = side ? s * swing * 9 - 8 : s < 0 ? -14 : 1, lift = Math.max(0, s * swing) * 5;
    box(c, x, -27 - lift, 13, 22, 3, side && s < 0 ? LOOK.jeansDark : LOOK.jeans);
    box(c, x - 1, -11 - lift, side ? 18 : 14, 10, 5, LOOK.shoe);
    box(c, x - 1, -4 - lift, side ? 18 : 14, 4, 2, LOOK.sole);
    if (dir === 'down') { c.strokeStyle = LOOK.sole; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + 4, -9 - lift); c.lineTo(x + 8, -9 - lift); c.moveTo(x + 4, -6.5 - lift); c.lineTo(x + 8, -6.5 - lift); c.stroke(); }
  }
  c.translate(0, -bob);
  // Arms, hoodie and T-shirt
  const arm = swing * 6;
  if (!side) { ellipse(c, -20, -36 + arm, 7, 14, LOOK.coatDark, .25); ellipse(c, 20, -36 - arm, 7, 14, LOOK.coatDark, -.25); }
  if (dir === 'down') {
    box(c, -15, -53, 30, 33, 6, LOOK.shirt);
    c.fillStyle = LOOK.shirtShade; c.beginPath(); c.arc(0, -53, 7, 0, Math.PI); c.fill();
    shape(c, LOOK.coat, () => { c.moveTo(-18, -50); c.quadraticCurveTo(-12, -55, -8, -54); c.lineTo(-5, -20); c.quadraticCurveTo(-5, -17, -8, -17); c.lineTo(-16, -17); c.quadraticCurveTo(-20, -17, -20, -22); });
    shape(c, LOOK.coat, () => { c.moveTo(18, -50); c.quadraticCurveTo(12, -55, 8, -54); c.lineTo(5, -20); c.quadraticCurveTo(5, -17, 8, -17); c.lineTo(16, -17); c.quadraticCurveTo(20, -17, 20, -22); });
    c.strokeStyle = LOOK.hood; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-8, -52); c.lineTo(-5.4, -19); c.moveTo(8, -52); c.lineTo(5.4, -19); c.stroke();
    // Yellow heart pin
    c.strokeStyle = LOOK.pin; c.lineWidth = 1.3; c.beginPath(); c.arc(12, -42, 3.6, Math.PI * .8, Math.PI * .2); c.lineTo(12, -36); c.closePath(); c.stroke();
    ellipse(c, 11.2, -42.6, 1.1, 1.1, LOOK.pin); ellipse(c, 12.8, -42.6, 1.1, 1.1, LOOK.pin); ellipse(c, 12, -41.6, 1, 1, LOOK.pin);
  } else if (dir === 'up') {
    box(c, -19, -54, 38, 37, 8, LOOK.coat);
    box(c, -19, -21, 38, 4, 2, LOOK.coatDark);
  } else {
    box(c, -15, -53, 31, 35, 8, LOOK.coat);
    shape(c, LOOK.shirt, () => { c.moveTo(9, -53); c.lineTo(16, -50); c.lineTo(17, -20); c.lineTo(13, -18); });
    ellipse(c, 0 - swing * 8, -36, 7, 14, LOOK.coatDark, swing * .5); ellipse(c, 0 - swing * 13, -23, 5, 4.5, LOOK.skin);
  }
  if (!side) { ellipse(c, -23, -24 + arm, 5, 4.5, LOOK.skin); ellipse(c, 23, -24 - arm, 5, 4.5, LOOK.skin); }
  // Hood resting on the shoulders
  if (dir === 'down') { ellipse(c, -13, -53, 8, 5.5, LOOK.hood, -.5); ellipse(c, 13, -53, 8, 5.5, LOOK.hood, .5); }
  else if (side) ellipse(c, -10, -51, 11, 8, LOOK.hood, .3);

  // Head
  c.translate(0, -8);
  if (dir === 'up') {
    ellipse(c, -26, -60, 4, 5.5, LOOK.skin); ellipse(c, 26, -60, 4, 5.5, LOOK.skin);
    ellipse(c, 0, -68, 28, 25, LOOK.hair);
    shape(c, LOOK.hair, () => { c.moveTo(-27, -70); c.quadraticCurveTo(-29, -56, -23, -50); c.lineTo(-17, -53); c.lineTo(-11, -46); c.lineTo(-3, -51); c.lineTo(5, -45); c.lineTo(12, -52); c.lineTo(20, -48); c.quadraticCurveTo(29, -56, 27, -70); });
    tufts(c);
    wave(c, -10, -86, -18, -76, -14, -62); wave(c, 8, -88, 17, -78, 13, -64);
    ellipse(c, 0, -45, 17, 9, LOOK.hood); ellipse(c, 0, -43, 12, 5.5, LOOK.coatDark);
  } else if (side) {
    ellipse(c, 2, -66, 25, 24, LOOK.skin);
    tufts(c);
    // Tousled fringe over the forehead, shorter at the back
    shape(c, LOOK.hair, () => { c.moveTo(27, -78); c.quadraticCurveTo(27, -70, 21, -66); c.quadraticCurveTo(20, -74, 15, -78); c.quadraticCurveTo(13, -69, 5, -66); c.quadraticCurveTo(6, -60, 1, -62); c.quadraticCurveTo(0, -54, -7, -51); c.lineTo(-10, -45); c.lineTo(-16, -50); c.quadraticCurveTo(-25, -50, -26, -62); c.quadraticCurveTo(-31, -80, -12, -92); c.quadraticCurveTo(22, -102, 27, -78); });
    ellipse(c, -2, -60, 4.5, 6, LOOK.skin);
    wave(c, 6, -88, -10, -86, -15, -70); wave(c, 12, -87, 20, -84, 23, -75);
    face(c, t, [15], 19);
    c.strokeStyle = LOOK.glasses; c.lineWidth = 2.4; c.lineJoin = 'round';
    c.beginPath(); c.roundRect(9, -69.5, 14, 14, 6); c.moveTo(9, -64); c.lineTo(-2, -63); c.moveTo(23, -65); c.lineTo(26, -65); c.stroke();
  } else {
    ellipse(c, -26, -61, 4.5, 6, LOOK.skin); ellipse(c, 26, -61, 4.5, 6, LOOK.skin);
    ellipse(c, 0, -66, 26, 24, LOOK.skin);
    tufts(c);
    // Wavy curtains parted over the forehead
    shape(c, LOOK.hair, () => { c.moveTo(4, -94); c.quadraticCurveTo(-32, -100, -29, -66); c.lineTo(-25, -57); c.quadraticCurveTo(-24, -64, -20, -67); c.quadraticCurveTo(-15, -67, -11, -72); c.quadraticCurveTo(-11, -68, -8, -67); c.quadraticCurveTo(-1, -74, 3, -84); });
    shape(c, LOOK.hair, () => { c.moveTo(-2, -93); c.quadraticCurveTo(33, -100, 29, -66); c.lineTo(25, -57); c.quadraticCurveTo(25, -64, 21, -67); c.quadraticCurveTo(17, -70, 16, -75); c.quadraticCurveTo(14, -71, 11, -71); c.quadraticCurveTo(7, -77, 3, -84); });
    wave(c, 0, -89, -15, -89, -20, -74); wave(c, 8, -89, 19, -88, 23, -75);
    face(c, t, [-10.5, 10.5], 1);
    // Round grey glasses
    c.strokeStyle = LOOK.glasses; c.lineWidth = 2.4; c.lineJoin = 'round';
    c.beginPath(); c.roundRect(-19, -69.5, 16.5, 14.5, 6.5); c.roundRect(2.5, -69.5, 16.5, 14.5, 6.5);
    c.moveTo(-2.5, -64); c.quadraticCurveTo(0, -66, 2.5, -64); c.moveTo(-19, -66); c.lineTo(-25, -67); c.moveTo(19, -66); c.lineTo(25, -67); c.stroke();
  }
  c.restore();
}

// Messy tufts on top
function tufts(c) {
  for (const [x, y, r] of [[-21, -81, 9], [-8, -88, 12], [10, -88, 12], [22, -80, 9]]) ellipse(c, x, y, r, r * .62, LOOK.hair, x * .03);
}
function wave(c, x1, y1, cx, cy, x2, y2) {
  c.strokeStyle = LOOK.hairLight; c.lineWidth = 2.2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(cx, cy, x2, y2); c.stroke();
}

function face(c, t, eyes, mouthX) {
  const front = eyes.length > 1, wide = front ? 5 : 3.2, blink = (t + 1.3) % 3.8 < .13;
  c.lineCap = 'round';
  for (const x of eyes) {
    c.strokeStyle = LOOK.brow; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(x - 4.5, -72.5); c.quadraticCurveTo(x, -74.5, x + 4.5, -72.5); c.stroke();
    if (blink) box(c, x - 4, -63, 8, 2, 1, LOOK.eye);
    else { ellipse(c, x, -62.2, 3.7, 4.6, LOOK.eye); ellipse(c, x + 1.2, -64, 1.5, 1.8, '#fff'); }
  }
  for (const x of front ? [-18, 18] : [9]) ellipse(c, x, -51.5, 4.2, 2.4, LOOK.blush);
  c.strokeStyle = '#d8a27a'; c.lineWidth = 1.6; c.beginPath(); c.arc(front ? 0 : 24, -56, 1.7, .3, Math.PI - .3); c.stroke();
  // A slightly lopsided smile
  c.strokeStyle = LOOK.lip; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(mouthX - wide, -50); c.quadraticCurveTo(mouthX, -46, mouthX + wide, -51.5); c.stroke();
}

// Both of them, hand in hand. She stands at (-gap/2, 0) and the partner at (gap/2, 0).
export function drawCouple(c, { dir, walk, moving, t, gap = 62, hold = 1 }) {
  const side = dir === 'left' || dir === 'right';
  const lift = moving ? Math.abs(Math.cos(walk)) * 3 : 0;
  const hands = () => {
    if (!hold) return;
    const y = -24 - lift, from = gap / 2 - (side ? 10 : 18);
    c.globalAlpha = hold; c.lineCap = 'round'; c.lineWidth = 10;
    c.strokeStyle = '#a62a38'; c.beginPath(); c.moveTo(-from, y - 9); c.quadraticCurveTo(-8, y + 4, -3, y + 2); c.stroke();
    c.strokeStyle = LOOK.coatDark; c.beginPath(); c.moveTo(from, y - 11); c.quadraticCurveTo(8, y + 4, 3, y + 2); c.stroke();
    ellipse(c, -2, y + 3, 6, 5.5, '#fff8f0'); ellipse(c, 3, y + 3, 5, 4.5, LOOK.skin);
    c.globalAlpha = 1;
  };
  if (side) hands();
  c.save(); c.translate(-gap / 2, 0); drawGirl(c, { dir, walk, moving, t }); c.restore();
  c.save(); c.translate(gap / 2, 0); drawPartner(c, { dir, walk: walk + .6, moving, t }); c.restore();
  if (!side) hands();
}
