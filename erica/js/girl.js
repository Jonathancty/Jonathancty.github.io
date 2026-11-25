// Draws the chibi girl. Change LOOK to restyle her. Feet stand at (0, 0) and she is
// about 100 units tall, so callers scale to whatever size they need.
const LOOK = {
  hair: '#1f1a20', hairShine: '#453c48', hairTip: '#5a3a30', skin: '#fbdcc2', blush: '#f2a08f',
  eye: '#2a1c1e', brow: '#5c4743', lip: '#d4736f',
  coat: '#d23b47', coatDark: '#a62a38', trim: '#fff8f0', scarf: '#2f7d68', scarfDark: '#225d4e',
  boot: '#6d4538', hat: '#d23b47',
};

function ellipse(c, x, y, rx, ry, fill, rot = 0) {
  c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fill();
}
function box(c, x, y, w, h, r, fill) {
  c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
}
function shape(c, fill, draw) { c.fillStyle = fill; c.beginPath(); draw(c); c.closePath(); c.fill(); }

// dir: 'down' | 'up' | 'left' | 'right'. walk: step phase in radians. t: seconds, for blinking.
export function drawGirl(c, { dir, walk, moving, t }) {
  const swing = moving ? Math.sin(walk) : 0;
  const bob = moving ? Math.abs(Math.cos(walk)) * 3 : Math.sin(t * 2.2) * .8;
  const side = dir === 'left' || dir === 'right';
  c.save();
  ellipse(c, 0, 0, 22, 7, 'rgba(38,42,86,.28)');
  if (dir === 'left') c.scale(-1, 1);

  // Boots
  if (side) {
    box(c, -8 + swing * 9, -13 - Math.max(0, swing) * 4, 15, 13, 5, LOOK.boot);
    box(c, -8 - swing * 9, -13 - Math.max(0, -swing) * 4, 15, 13, 5, LOOK.boot);
  } else {
    box(c, -13, -13 - Math.max(0, swing) * 5, 12, 13, 5, LOOK.boot);
    box(c, 1, -13 - Math.max(0, -swing) * 5, 12, 13, 5, LOOK.boot);
  }

  c.translate(0, -bob);
  // Shoulder-length wavy hair behind her, with warm brown ends
  if (dir === 'down') {
    shape(c, LOOK.hairTip, () => { c.moveTo(-29, -56); c.quadraticCurveTo(-36, -36, -25, -27); c.lineTo(25, -27); c.quadraticCurveTo(37, -36, 29, -56); });
    shape(c, LOOK.hair, () => { c.moveTo(-28, -68); c.quadraticCurveTo(-36, -44, -27, -34); c.lineTo(27, -34); c.quadraticCurveTo(37, -44, 28, -68); });
  }
  if (side) {
    shape(c, LOOK.hairTip, () => { c.moveTo(-28, -56); c.quadraticCurveTo(-36, -36, -27, -27); c.quadraticCurveTo(-10, -24, -2, -42); });
    shape(c, LOOK.hair, () => { c.moveTo(2, -80); c.quadraticCurveTo(-30, -80, -29, -54); c.quadraticCurveTo(-34, -40, -26, -34); c.quadraticCurveTo(-8, -32, 2, -46); });
  }

  // Coat
  const arm = swing * 6;
  if (!side) { ellipse(c, -19, -28 + arm, 7, 11, LOOK.coatDark, .35); ellipse(c, 19, -28 - arm, 7, 11, LOOK.coatDark, -.35); }
  shape(c, LOOK.coat, () => { c.moveTo(-13, -44); c.lineTo(13, -44); c.quadraticCurveTo(19, -24, 21, -10); c.lineTo(-21, -10); c.quadraticCurveTo(-19, -24, -13, -44); });
  box(c, -22, -14, 44, 7, 3.5, LOOK.trim);
  if (dir === 'down') { ellipse(c, 0, -27, 2.2, 2.2, LOOK.trim); ellipse(c, 0, -19, 2.2, 2.2, LOOK.trim); }
  if (side) { ellipse(c, 1 - swing * 8, -27, 7, 11, LOOK.coatDark, swing * .5); ellipse(c, 1 - swing * 11, -18, 5, 4.5, LOOK.trim); }
  else { ellipse(c, -22, -19 + arm, 5, 4.5, LOOK.trim); ellipse(c, 22, -19 - arm, 5, 4.5, LOOK.trim); }

  // Scarf
  box(c, -17, -48, 34, 10, 5, LOOK.scarf);
  if (dir === 'down') box(c, 5, -43, 9, 18, 4, LOOK.scarfDark);
  if (side) box(c, -19, -43, 8, 15, 4, LOOK.scarfDark);

  // Head
  if (dir === 'up') {
    shape(c, LOOK.hairTip, () => { c.moveTo(-29, -56); c.quadraticCurveTo(-35, -34, -24, -27); c.quadraticCurveTo(-12, -21, 0, -26); c.quadraticCurveTo(12, -21, 24, -27); c.quadraticCurveTo(35, -34, 29, -56); });
    ellipse(c, 0, -67, 29, 26, LOOK.hair);
    shape(c, LOOK.hair, () => { c.moveTo(-28, -68); c.quadraticCurveTo(-35, -42, -26, -35); c.quadraticCurveTo(-13, -29, 0, -34); c.quadraticCurveTo(13, -29, 26, -35); c.quadraticCurveTo(35, -42, 28, -68); });
    c.strokeStyle = LOOK.hairShine; c.lineWidth = 2.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-9, -66); c.quadraticCurveTo(-14, -54, -9, -42); c.moveTo(10, -66); c.quadraticCurveTo(15, -54, 10, -42); c.stroke();
  } else if (side) {
    ellipse(c, 2, -66, 26, 25, LOOK.skin);
    // Swept back from her forehead, one wave falling past her cheek
    shape(c, LOOK.hair, () => { c.moveTo(23, -80); c.quadraticCurveTo(12, -82, 6, -74); c.quadraticCurveTo(-1, -64, 1, -54); c.quadraticCurveTo(-3, -46, 1, -38); c.quadraticCurveTo(-12, -32, -24, -42); c.quadraticCurveTo(-36, -70, -16, -90); c.quadraticCurveTo(12, -102, 23, -80); });
    shine(c, () => { c.moveTo(0, -84); c.quadraticCurveTo(-13, -76, -11, -62); });
    face(c, t, [14], 19);
  } else {
    // Soft round cheeks
    ellipse(c, 0, -67, 27, 25, LOOK.skin);
    ellipse(c, 0, -58, 25, 17, LOOK.skin);
    // Off-centre parting: a short sweep on one side, a long wave on the other
    shape(c, LOOK.hair, () => { c.moveTo(-4, -93); c.quadraticCurveTo(-31, -95, -31, -64); c.quadraticCurveTo(-34, -46, -27, -35); c.quadraticCurveTo(-23, -48, -25, -60); c.quadraticCurveTo(-23, -80, -4, -87); });
    shape(c, LOOK.hair, () => { c.moveTo(-6, -93); c.quadraticCurveTo(31, -98, 31, -64); c.quadraticCurveTo(36, -46, 28, -35); c.quadraticCurveTo(22, -44, 25, -54); c.quadraticCurveTo(17, -62, 13, -72); c.quadraticCurveTo(7, -83, -6, -87); });
    shine(c, () => { c.moveTo(7, -88); c.quadraticCurveTo(21, -82, 24, -67); });
    shine(c, () => { c.moveTo(-14, -86); c.quadraticCurveTo(-24, -80, -26, -68); });
    face(c, t, [-10.5, 10.5], 0);
  }

  // A small Santa hat, tilted so her parting shows
  c.save();
  if (dir === 'down') { c.translate(12, -88); c.rotate(.3); } else if (dir === 'up') { c.translate(-12, -86); c.rotate(-.3); } else { c.translate(-9, -87); c.rotate(-.3); }
  if (dir === 'up') c.scale(-1, 1);
  c.scale(.72, .72);
  shape(c, LOOK.hat, () => { c.moveTo(-21, 0); c.quadraticCurveTo(-17, -27, 0, -28); c.quadraticCurveTo(19, -27, 21, 0); });
  shape(c, LOOK.coatDark, () => { c.moveTo(-3, -28); c.quadraticCurveTo(22, -32, 31, -10); c.quadraticCurveTo(22, -18, 14, -17); });
  ellipse(c, 31, -7, 7, 7, LOOK.trim);
  box(c, -24, -6, 48, 11, 5.5, LOOK.trim);
  c.restore();
  c.restore();
}

function shine(c, draw) {
  c.strokeStyle = LOOK.hairShine; c.lineWidth = 2.2; c.lineCap = 'round';
  c.beginPath(); draw(); c.stroke();
}

function face(c, t, eyes, mouthX) {
  const blink = t % 3.4 < .13, front = eyes.length > 1, wide = front ? 5 : 3.2;
  c.lineCap = 'round';
  for (const x of eyes) {
    // Soft, gently arched brows
    c.strokeStyle = LOOK.brow; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(x - 5, -72.5); c.quadraticCurveTo(x, -75.5, x + 5, -72.5); c.stroke();
    if (blink) box(c, x - 4.5, -62, 9, 2, 1, LOOK.eye);
    else {
      ellipse(c, x, -61.5, 4.4, 5.4, LOOK.eye);
      ellipse(c, x + 1.4, -63.6, 1.7, 2, '#fff');
      ellipse(c, x - 1.4, -59.2, .9, .9, 'rgba(255,255,255,.7)');
      // Upper lid with a small outer flick
      const out = front ? Math.sign(x) : -1;
      c.strokeStyle = LOOK.eye; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x - out * 4.4, -64); c.quadraticCurveTo(x, -69.5, x + out * 6, -64.6); c.stroke();
    }
  }
  for (const x of front ? [-18, 18] : [9]) ellipse(c, x, -53.5, 4.8, 2.8, LOOK.blush);
  // A little nose and a gentle closed smile
  c.strokeStyle = '#e0ab90'; c.lineWidth = 1.6;
  c.beginPath(); c.arc(front ? 0 : 24, -56.5, 1.6, .3, Math.PI - .3); c.stroke();
  c.strokeStyle = LOOK.lip; c.lineWidth = 2;
  c.beginPath(); c.moveTo(mouthX - wide, -51.5); c.quadraticCurveTo(mouthX, -46.6, mouthX + wide, -51.5); c.stroke();
}
