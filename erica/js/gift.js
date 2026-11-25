// Opening the present, and the closing message.
import { makeStage } from './stage.js';
import { sfx } from './audio.js';
import { drawBox } from './box.js';
import { drawCouple } from './partner.js';

// On a sideways phone the card is on the left, so the picture moves to the right.
const middle = (w, h) => (h < 500 && w > h * 1.2 ? w * .75 : w / 2);

const TAPS = ['Something is moving in there!', 'One more tap!'];

export function makeGift(root) {
  const head = root.querySelector('.ask'), title = head.querySelector('h1'), text = head.querySelector('.lead');
  const tap = root.querySelector('.tap'), card = root.querySelector('.pop');
  const pic = card.querySelector('img'), emoji = card.querySelector('.gift-emoji');
  const name = card.querySelector('h2'), note = card.querySelector('.note'), go = card.querySelector('.go');
  const stage = makeStage(root, draw);
  let box = 0, taps = 0, shake = 0, lid = 0, glow = 0, next = null;

  function draw(ctx, { w, h, t }) {
    const k = Math.min(w / 375, h / 600) * 2, x = middle(w, h), y = h * .72;
    if (glow > 0) {
      ctx.save(); ctx.translate(x, y - 70 * k); ctx.rotate(t * .35); ctx.globalAlpha = glow;
      for (let i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6); ctx.fillStyle = 'rgba(255,224,140,.3)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-h * .16, -h); ctx.lineTo(h * .04, -h); ctx.fill();
      }
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(40,36,86,.28)'; ctx.beginPath(); ctx.ellipse(x, y, 58 * k, 10 * k, 0, 0, 7); ctx.fill();
    const breathe = lid > 0 ? 0 : Math.sin(t * 2.4) * .015;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 45) * .07 * shake); ctx.scale(k * (1 - breathe), k * (1 + breathe));
    drawBox(ctx, box, { lid }); ctx.restore();
  }

  function reveal(gift) {
    head.hidden = tap.hidden = true; card.hidden = false;
    name.textContent = gift.name;
    note.textContent = gift.text ?? ''; note.hidden = !gift.text;
    pic.hidden = !gift.image; emoji.hidden = !!gift.image;
    if (gift.image) { pic.src = gift.image; pic.alt = gift.name; }
    name.focus({ preventScroll: true });
    return new Promise((resolve) => { next = resolve; });
  }

  let busy = false, opened = null;
  tap.addEventListener('click', async () => {
    if (busy || !opened) return;
    busy = true;
    taps++; sfx('rattle');
    if (taps < 3) {
      text.textContent = TAPS[taps - 1];
      await stage.tween(.45, (p) => { shake = (1 - p) * taps; });
      stage.burst(middle(stage.w, stage.h), stage.h * .55, 10 * taps, 220);
      busy = false;
      return;
    }
    tap.disabled = true;
    await stage.tween(.9, (p) => { shake = p * 3; glow = p * .6; });
    shake = 0; sfx('fanfare');
    stage.burst(middle(stage.w, stage.h), stage.h * .55, 130, 620);
    await stage.tween(.8, (p) => { lid = p; glow = .6 + p * .4; });
    opened();
  });
  go.addEventListener('click', () => { const n = next; next = null; if (n) { stage.stop(); n(); } });

  return {
    // Resolves when she taps on to the message. already: show it unwrapped straight away.
    async show(which, boxName, gift, already, onOpen) {
      box = which; taps = 0; shake = 0; busy = false; next = null; opened = null;
      lid = already ? 1 : 0; glow = already ? 1 : 0;
      title.textContent = boxName; text.textContent = 'Tap the present to open it';
      head.hidden = tap.hidden = false; tap.disabled = false; card.hidden = true;
      stage.start();
      if (!already) {
        await new Promise((resolve) => { opened = resolve; });
        opened = null;
        onOpen();
      }
      return reveal(gift);
    },
  };
}

export function makeEnding(root) {
  const title = root.querySelector('h1'), text = root.querySelector('.lead');
  const stage = makeStage(root, draw);
  let box = 0;

  function draw(ctx, { w, h, t }) {
    const k = Math.min(w / 375, h / 700) * 1.35, x = middle(w, h), y = h * .95;
    stage.place(x - 92 * k, y, k * .8, () => drawBox(ctx, box, { lid: 1 }));
    stage.place(x + 36 * k, y - Math.abs(Math.sin(t * 4)) * 6 * k, k, () => drawCouple(ctx, { dir: 'down', walk: 0, moving: false, t }));
  }

  return {
    show(which, ending) {
      box = which;
      title.textContent = ending.title; text.textContent = ending.text;
      stage.start();
      (async () => {
        for (let i = 0; i < 5; i++) {
          stage.burst(stage.w * (.2 + Math.random() * .6), stage.h * (.15 + Math.random() * .3), 45, 380);
          await stage.pause(.9);
        }
      })();
    },
    stop: () => stage.stop(),
  };
}
