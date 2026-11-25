// The six wrapped presents.
import { star } from './art.js';

export const BOXES = [
  { wrap: '#d23b47', dark: '#a62a38', ribbon: '#fff6ee', pattern: 'stripes', slice: '#f7c9c4' },
  { wrap: '#5b8fe0', dark: '#3f6fbd', ribbon: '#eef4ff', pattern: 'stars', slice: '#cfdff7' },
  { wrap: '#b9784a', dark: '#935b34', ribbon: '#fff1cf', pattern: 'dots', slice: '#f3dcbf' },
  { wrap: '#2f7d68', dark: '#225d4e', ribbon: '#e0505a', pattern: 'dots', slice: '#c8e3d3' },
  { wrap: '#7a5bb5', dark: '#5d4294', ribbon: '#ffcf70', pattern: 'stars', slice: '#dfd3f3' },
  { wrap: '#f2b544', dark: '#cf9326', ribbon: '#b5323f', pattern: 'stripes', slice: '#fbe7b6' },
];

function pattern(c, b, x, y, w, h) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.globalAlpha = .28; c.fillStyle = '#fff';
  if (b.pattern === 'stripes') for (let i = -h; i < w; i += 18) { c.beginPath(); c.moveTo(x + i, y + h); c.lineTo(x + i + h, y); c.lineTo(x + i + h + 8, y); c.lineTo(x + i + 8, y + h); c.fill(); }
  else for (let r = 0, py = y + 9; py < y + h; py += 16, r++) for (let px = x + 9 + (r % 2) * 10; px < x + w; px += 20) {
    if (b.pattern === 'stars') star(c, px, py, 5, '#fff'); else { c.beginPath(); c.arc(px, py, 3.2, 0, 7); c.fill(); }
  }
  c.restore();
}

// Stands on (0, 0), 100 wide and about 110 tall. lid: 0 shut to 1 flown off.
export function drawBox(c, index, { lid = 0 } = {}) {
  const b = BOXES[index];
  c.fillStyle = b.wrap; c.beginPath(); c.roundRect(-45, -66, 90, 66, 6); c.fill();
  pattern(c, b, -45, -66, 90, 66);
  c.fillStyle = 'rgba(40,16,30,.14)'; c.fillRect(-45, -66, 90, 9);
  c.fillStyle = b.ribbon; c.fillRect(-9, -66, 18, 66);
  if (lid >= 1) return;
  c.save();
  c.globalAlpha = Math.min(1, (1 - lid) * 2.5);
  c.translate(lid * 60, -lid * 190); c.rotate(lid * 1.1);
  c.fillStyle = b.dark; c.beginPath(); c.roundRect(-50, -84, 100, 22, 6); c.fill();
  pattern(c, b, -50, -84, 100, 22);
  c.fillStyle = b.ribbon; c.fillRect(-9, -84, 18, 22);
  // Bow
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(0, -84); c.bezierCurveTo(s * 12, -116, s * 46, -112, s * 34, -92); c.quadraticCurveTo(s * 24, -82, 0, -84); c.fill(); }
  c.fillStyle = 'rgba(40,16,30,.16)';
  for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 22, -96, 8, 5, s * -.4, 0, 7); c.fill(); }
  c.fillStyle = b.ribbon; c.beginPath(); c.arc(0, -86, 8, 0, 7); c.fill();
  c.restore();
}
