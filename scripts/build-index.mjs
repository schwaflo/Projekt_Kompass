/* Schreibt design-systems/index.json mit allen Ordnern, die eine design-system.json enthalten.
   Nötig für GitHub Pages, weil ein statischer Server keine Ordner auflisten kann.
   Start: node scripts/build-index.mjs */
import { readdir, access, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ordner = fileURLToPath(new URL('../design-systems/', import.meta.url));
const systems = [];
for (const e of await readdir(ordner, { withFileTypes: true })) {
  if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_')) continue;
  try { await access(`${ordner}${e.name}/design-system.json`); systems.push(e.name); } catch {}
}
systems.sort();
const inhalt = { hinweis: 'Liste der Ordner in design-systems/. Wird von scripts/build-index.mjs erzeugt, lässt sich aber auch von Hand pflegen.', systems };
await writeFile(ordner + 'index.json', JSON.stringify(inhalt, null, 2).replace(/\[\n\s+([^\]]*?)\n\s+\]/s, (_, l) => '[' + l.replace(/\n\s+/g, ' ') + ']') + '\n');
console.log(`index.json: ${systems.length} Designsysteme (${systems.join(', ')})`);
