/* Tests in Node starten: node tests/run.mjs (ab Node 18, keine Installation nötig) */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { env, runAll } from './harness.js';
import './designsystem.test.js';
import './praesentation.test.js';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
env.readText = async p => { try { return await readFile(wurzel + p, 'utf8'); } catch { return null; } };

const res = await runAll();
res.forEach(r => console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : '\n    ' + r.fehler}`));
const fehl = res.filter(r => !r.ok).length;
console.log(fehl ? `\n${fehl} von ${res.length} Tests fehlgeschlagen` : `\nAlle ${res.length} Tests bestanden`);
process.exit(fehl ? 1 : 0);
