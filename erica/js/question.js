// The room behind each door. Erica walks in, the choices hang on the wall, and when one
// is picked she walks to the wish machine and presses its button. The reply pops out.
import { drawDoor, DOOR_COLOURS } from './art.js';
import { drawGirl } from './girl.js';
import { makeStage } from './stage.js';
import { sfx } from './audio.js';
import { drawRoom, drawProp, drawMachine, drawCapsule, buttonX, OPTION_COLOURS } from './room.js';

const KEY_NAMES = ['red', 'gold', 'blue'];

export const keySvg = (door) => `<svg viewBox="0 0 48 48" aria-hidden="true" style="color:${DOOR_COLOURS[door]}">
  <g transform="rotate(45 24 24)" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="24" cy="12" r="8"/><path d="M24 20v23M24 34h8M24 43h9"/></g></svg>`;

// An answer's last emoji becomes the picture in its frame; the rest is the caption.
export function splitAnswer(text) {
  const parts = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter().segment(text.trim())].map((s) => s.segment) : [...text.trim()];
  const last = parts[parts.length - 1];
  if (!/\p{Extended_Pictographic}/u.test(last) || parts.length < 2) return { picture: '', caption: text.trim() };
  return { picture: last, caption: parts.slice(0, -1).join('').trim() };
}

export function makeQuestion(root) {
  const ask = root.querySelector('.ask'), title = ask.querySelector('h1'), step = ask.querySelector('.step');
  const wall = root.querySelector('.wall'), pop = root.querySelector('.pop');
  const words = pop.querySelector('.reply-text'), prize = pop.querySelector('.prize'), go = pop.querySelector('.go');
  const stage = makeStage(root, draw), { tween, pause, place } = stage;

  let door = 0, options = 3, next = null, entering = null;
  let k = 1;
  let girl, machine, capsule;

  // Where things stand, in pixels. Recalculated each frame so rotating the phone is fine.
  function layout() {
    const { w, h } = stage;
    // On a sideways phone the question sits on the left, so the room moves to the right.
    const sideways = h < 500 && w > h * 1.2;
    const left = sideways ? w * .5 : 0, area = w - left, mid = left + area / 2;
    k = Math.min(area / 375, h / (sideways ? 400 : 700), 1.25) * 1.36;
    const span = Math.min(area / 2, 240 * k);
    const floorY = h * .7;
    return { w, h, k, mid, area, popX: sideways ? w * .25 : w / 2, floorY, doorX: mid - span + 52 * k, machineX: mid + span - 72 * k, backY: floorY + 10 * k, feetY: floorY + (h - floorY) * .56 };
  }
  // girl.at: 0 = in the doorway, .5 = middle of the room, 1 = at the machine.
  function girlSpot(L) {
    const mix = (a, b, p) => a + (b - a) * p;
    const press = { x: L.machineX + (buttonX(Math.max(0, girl.target), options) - 34) * k, y: L.backY + 24 * k };
    return girl.at < .5
      ? { x: mix(L.doorX, L.mid, girl.at * 2), y: mix(L.backY, L.feetY, Math.min(1, girl.at * 4)) }
      : { x: mix(L.mid, press.x, girl.at * 2 - 1), y: mix(L.feetY, press.y, girl.at * 2 - 1) };
  }

  async function walkTo(at) {
    const from = girl.at, seconds = Math.abs(at - from) * 2.6;
    if (seconds < .05) return;
    girl.dir = at > from ? 'right' : 'left'; girl.moving = true;
    await tween(seconds, (p) => { girl.at = from + (at - from) * p; girl.walk = p * seconds * 11; });
    girl.moving = false;
  }

  function draw(ctx, { h, t }) {
    const L = layout();
    drawRoom(ctx, door, L);
    place(L.doorX, L.backY, k, () => drawDoor(ctx, door, false, t, 90));
    place(L.mid, L.backY, k, () => drawProp(ctx, door, t));
    place(L.machineX, L.backY + 6 * k, k, () => drawMachine(ctx, { options, t, ...machine }));
    const hop = girl.happy ? Math.abs(Math.sin(t * 6)) * 10 * k : 0;
    const spot = girlSpot(L);
    place(spot.x, spot.y - hop, k, () => drawGirl(ctx, { ...girl, t }));
    if (girl.reach > 0) {
      // Her arm stretching out to the button
      const bx = L.machineX + buttonX(girl.target, options) * k, by = L.backY - 44 * k;
      const ax = spot.x + 6 * k, ay = spot.y - 34 * k;
      const hx = ax + (bx - ax) * girl.reach, hy = ay + (by - ay) * girl.reach;
      ctx.lineCap = 'round'; ctx.strokeStyle = '#a62a38'; ctx.lineWidth = 11 * k;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.fillStyle = '#fff8f0'; ctx.beginPath(); ctx.arc(hx, hy, 6.5 * k, 0, 7); ctx.fill();
    }
    if (capsule) {
      // Out of the chute, over her head, and up to the middle of the wall
      const p = capsule.p, sx = L.machineX, sy = L.backY - 14 * k, ex = L.popX, ey = h * .3;
      const x = sx + (ex - sx) * p, y = sy + (ey - sy) * p - Math.sin(p * Math.PI) * 60 * k;
      place(x, y, k * (1 + p * .9), () => drawCapsule(ctx, capsule.colour, p * -9));
    }
  }

  go.addEventListener('click', () => {
    if (!next) return;
    const done = next;
    next = null; stage.stop();
    done();
  });

  return {
    // Resolves with the index of the picture she picked, as soon as it is picked.
    ask(whichDoor, item, number) {
      door = whichDoor; options = item.answers.length;
      girl = { at: 0, dir: 'down', walk: 0, moving: false, happy: false, reach: 0, target: -1 };
      machine = { pressed: -1, power: 0 }; capsule = null;
      step.textContent = `Question ${number} of 3`;
      title.textContent = item.question;
      ask.hidden = wall.hidden = false; pop.hidden = true;
      wall.className = `wall of-${options}`;
      stage.start();
      entering = (async () => {
        await pause(.35);
        await walkTo(.5);
        girl.dir = 'up'; // she looks up at the wall
      })();
      return new Promise((resolve) => {
        const frames = item.answers.map((a, i) => {
          const { picture, caption } = splitAnswer(a.text);
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'frame';
          b.style.setProperty('--c', OPTION_COLOURS[i]); b.style.setProperty('--i', i);
          const pic = document.createElement('span'), cap = document.createElement('span');
          pic.className = 'pic'; pic.textContent = picture || '★'; pic.setAttribute('aria-hidden', 'true');
          cap.className = 'cap'; cap.textContent = caption;
          b.append(pic, cap);
          b.addEventListener('click', () => {
            if (wall.classList.contains('done')) return;
            sfx('click');
            wall.classList.add('done'); b.classList.add('picked');
            frames.forEach((f) => { f.disabled = true; });
            resolve(i);
          });
          return b;
        });
        wall.replaceChildren(...frames);
      });
    },

    // She walks over, presses the button, and the reply pops out with her key.
    // Resolves when she taps to go on.
    async reward(pick, reply, total) {
      await entering;
      girl.target = pick;
      await pause(.45);
      await walkTo(1);
      girl.dir = 'right';
      await tween(.28, (p) => { girl.reach = p; });
      machine.pressed = pick; sfx('click');
      await pause(.2);
      await tween(.25, (p) => { girl.reach = 1 - p; });
      sfx('whirr');
      await tween(1.3, (p) => { machine.power = Math.min(1, p * 4); });
      machine.power = 0;
      sfx('pop');
      capsule = { p: 0, colour: OPTION_COLOURS[pick] };
      girl.dir = 'down'; girl.happy = true;
      await tween(.75, (p) => { capsule.p = 1 - (1 - p) ** 2; });
      capsule = null;
      sfx('key');
      stage.burst(layout().popX, stage.h * .3);

      ask.hidden = wall.hidden = true; pop.hidden = false;
      pop.style.setProperty('--c', OPTION_COLOURS[pick]);
      words.textContent = reply;
      prize.innerHTML = `${keySvg(door)}<p>You got the ${KEY_NAMES[door]} key!</p>`;
      go.textContent = total < 3 ? 'Back to the maze' : 'Use all three keys';
      words.focus({ preventScroll: true });
      return new Promise((resolve) => { next = resolve; });
    },
  };
}
