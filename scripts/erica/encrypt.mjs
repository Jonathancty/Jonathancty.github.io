// Encrypts _erica_private/content.json into erica/content.enc.json.
// Usage: node scripts/erica/encrypt.mjs
// Only the hint stays readable. Everything else needs the secret word.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveKey, normalise, unlock } from '../../erica/js/vault.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const privateDir = resolve(root, '_erica_private');
const source = resolve(privateDir, 'content.json');
const target = resolve(root, 'erica/content.enc.json');
const ITERATIONS = 600_000;
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

const fail = (msg) => { console.error(`Stopped: ${msg}`); process.exit(1); };

if (!existsSync(source)) {
  mkdirSync(privateDir, { recursive: true });
  copyFileSync(resolve(here, 'content.example.json'), source);
  console.log('Created _erica_private/content.json from the example.');
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(source, 'utf8').replace(/^﻿/, ''));
} catch (e) {
  fail(`content.json is not valid JSON (${e.message})`);
}
const { secretWord, hint, ...content } = parsed;
if (typeof secretWord !== 'string' || !normalise(secretWord)) fail('secretWord is empty.');
if (typeof hint !== 'string') fail('hint must be text.');
if (normalise(hint).includes(normalise(secretWord))) fail('the public hint contains the secret word.');
if (normalise(secretWord) === 'snowflake') console.warn('Note: still using the sample secret word "snowflake".');
else if (normalise(secretWord).length < 8) console.warn('Note: a short word is easier to guess. 8+ characters is safer.');

const filled = (s) => typeof s === 'string' && s.trim() !== '';
for (const k of ['title', 'text', 'button']) if (!filled(content.welcome?.[k])) fail(`welcome.${k} is empty.`);
if (!Array.isArray(content.questions) || content.questions.length !== 3) fail('there must be exactly 3 questions.');
content.questions.forEach((q, i) => {
  const n = `question ${i + 1}`;
  if (!filled(q?.question)) fail(`${n} has no text.`);
  if (!Array.isArray(q.answers) || q.answers.length < 2 || q.answers.length > 4) fail(`${n} needs 2 to 4 answers.`);
  if (!q.answers.every((a) => filled(a?.text) && filled(a?.reply))) fail(`${n}: every answer needs "text" and "reply".`);
});

if (!Array.isArray(content.boxes) || content.boxes.length !== 6 || !content.boxes.every(filled)) fail('there must be exactly 6 box names.');
if (!filled(content.gift?.name)) fail('gift.name is empty.');
for (const k of ['title', 'text']) if (!filled(content.ending?.[k])) fail(`ending.${k} is empty.`);
if (/goes here|A short line about/.test(JSON.stringify([content.gift, content.ending]))) console.warn('Note: the gift or ending still has sample text.');

if (!Array.isArray(content.memories) || content.memories.length > 8) fail('memories must be a list of 0 to 8.');
// Photos are shown without captions, so nothing else is published.
content.memories = content.memories.map((m) => ({ image: m?.image ?? '' }));

// Any "image" value naming a file in _erica_private is embedded, so pictures are encrypted too.
function embed(node) {
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'image' && typeof v === 'string' && v) {
      const file = resolve(privateDir, v);
      const type = TYPES[extname(v).toLowerCase()];
      if (!type) fail(`${v}: use jpg, png, webp or svg.`);
      if (!existsSync(file)) fail(`picture not found: ${v}`);
      const buf = readFileSync(file);
      if (buf.length > 500_000) console.warn(`Note: ${v} is ${Math.round(buf.length / 1000)} KB. Under 500 KB loads faster.`);
      node[k] = `data:${type};base64,${buf.toString('base64')}`;
    } else embed(v);
  }
}
embed(content);

const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const key = await deriveKey(secretWord, salt, ITERATIONS);
const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(content)));
const b64 = (b) => Buffer.from(b).toString('base64');
const box = { v: 1, hint, iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) };

if (!(await unlock(secretWord, box)) || (await unlock(`${secretWord}x`, box))) fail('self-check failed, nothing written.');
writeFileSync(target, JSON.stringify(box));
console.log(`Wrote erica/content.enc.json (${Math.ceil(JSON.stringify(box).length / 1024)} KB).`);
