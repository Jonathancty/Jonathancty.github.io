// Stamps a version onto every script and stylesheet address in erica/index.html, so a
// phone never mixes saved old code with new code. Run before each push:
//   node scripts/erica/stamp.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../erica');
const read = (f) => readFileSync(resolve(dir, f), 'utf8').replace(/\r\n/g, '\n');
const modules = readdirSync(resolve(dir, 'js')).filter((f) => f.endsWith('.js')).sort();
const hash = createHash('sha256');
for (const f of [...modules.map((m) => `js/${m}`), 'style.css']) hash.update(f).update(read(f));
const v = hash.digest('hex').slice(0, 10);

const imports = Object.fromEntries(modules.filter((m) => m !== 'main.js').map((m) => [`./js/${m}`, `./js/${m}?v=${v}`]));
const map = `<script type="importmap">${JSON.stringify({ imports })}</script>`;
let html = read('index.html')
  .replace(/href="style\.css[^"]*"/, `href="style.css?v=${v}"`)
  .replace(/<script type="importmap">.*?<\/script>\n/, '')
  .replace(/<script type="module" src="js\/main\.js[^"]*">/, `${map}\n<script type="module" src="js/main.js?v=${v}">`);
if (html.split(`?v=${v}`).length !== modules.length + 2) { console.error('Stopped: index.html was not stamped correctly.'); process.exit(1); }
writeFileSync(resolve(dir, 'index.html'), html);
console.log(`Stamped version ${v}.`);
