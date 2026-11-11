/* ============================================================
   Präsentationsgenerator – Pakete
   Ein Designsystem, das nicht als Ordner auf dem Webserver liegt,
   wird als „Paket“ im Browser gehalten:
     { id, manifest, voice, readme, dateien: { pfad: dataURL }, herkunft }
   Dieses Modul liest Pakete aus ZIP-Dateien, schreibt sie als ZIP,
   kopiert vorhandene Systeme und ergänzt Bilddateien.
   ============================================================ */
import { fnSource, loadPackage, MANIFEST } from './registry.js';
import { schlageAssetVor, analysiereBild } from './assets.js';

const BILD = /\.(svg|png|jpe?g|webp|gif)$/i;
const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const mime = p => MIME[String(p).split('.').pop().toLowerCase()] || 'application/octet-stream';
const kopie = o => JSON.parse(JSON.stringify(o));

/* Paket als Quelle für die Registry */
export function paketQuelle(paket) {
  const text = { [MANIFEST]: JSON.stringify(paket.manifest), ...(paket.voice ? { 'voice.md': paket.voice } : {}), ...(paket.readme ? { 'README.md': paket.readme } : {}) };
  return fnSource({ art: paket.herkunft || 'hochgeladen', readText: async p => text[p] ?? null, exists: async p => p in text || p in paket.dateien, url: p => paket.dateien[p] || '' });
}
export const ladePaket = paket => loadPackage(paketQuelle(paket), paket.manifest && paket.manifest.meta ? paket.manifest.meta.id : paket.id).then(r => { if (r.system) { r.system.paket = paket; r.system.herkunft = paket.herkunft || 'hochgeladen'; } return r; });

export function blobAlsDataUrl(blob) {
  return new Promise((ok, fehler) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => fehler(r.error); r.readAsDataURL(blob); });
}

/* ---------- ZIP lesen ---------- */
/* Liefert { paket, vorschlaege, errors }. Liegt alles in einem Unterordner, wird er übersprungen.
   Bilder unter assets/, die im Manifest fehlen, werden mit vorgeschlagener Rolle ergänzt. */
export async function paketAusZip(datei, JSZip) {
  let zip;
  try { zip = await JSZip.loadAsync(datei); } catch { return { paket: null, vorschlaege: [], errors: ['Die Datei ist kein lesbares ZIP-Archiv.'] }; }
  const namen = Object.keys(zip.files).filter(n => !zip.files[n].dir && !/(^|\/)(__MACOSX|\.DS_Store)/.test(n));
  const m = namen.filter(n => n.split('/').pop() === MANIFEST).sort((a, b) => a.length - b.length)[0];
  if (!m) return { paket: null, vorschlaege: [], errors: [`Im ZIP fehlt die Datei ${MANIFEST}. Sie muss im obersten Ordner des Pakets liegen.`] };
  const wurzel = m.slice(0, -MANIFEST.length), rel = n => n.slice(wurzel.length);
  let manifest;
  try { manifest = JSON.parse(await zip.file(m).async('string')); } catch (e) { return { paket: null, vorschlaege: [], errors: [`${MANIFEST} ist kein gültiges JSON: ${e.message}`] }; }
  const lies = async p => zip.file(wurzel + p) ? zip.file(wurzel + p).async('string') : '';
  const dateien = {};
  for (const n of namen.filter(n => n.startsWith(wurzel) && BILD.test(n))) dateien[rel(n)] = await blobAlsDataUrl(new Blob([await zip.file(n).async('arraybuffer')], { type: mime(n) }));
  const paket = { id: manifest && manifest.meta ? manifest.meta.id : '', manifest, voice: await lies('voice.md'), readme: await lies('README.md'), dateien, herkunft: 'hochgeladen' };
  const vorschlaege = await ergaenzeAssets(paket);
  return { paket, vorschlaege, errors: [] };
}

/* Bilder im Paket, die das Manifest nicht kennt, mit Vorschlag eintragen */
export async function ergaenzeAssets(paket) {
  const m = paket.manifest; if (!m || typeof m !== 'object') return [];
  if (!Array.isArray(m.assets)) m.assets = [];
  const bekannt = new Set(m.assets.map(a => a.file)), neu = [];
  for (const pfad of Object.keys(paket.dateien).filter(p => /^assets\//.test(p) && !bekannt.has(p)).sort()) {
    const v = schlageAssetVor({ pfad, ...(await analysiereBild(paket.dateien[pfad])) }, m.assets.map(a => a.id));
    const { grund, ...asset } = v;
    m.assets.push(asset); neu.push(v);
  }
  return neu;
}

/* Eine Bilddatei ins Paket legen. rolle: gewünschte Rolle oder leer für den Vorschlag.
   Gibt es schon ein Asset mit dieser Rolle (bei Logos: dieser ID), wird dessen Datei ersetzt. */
export async function fuegeDateiHinzu(paket, file, rolle = '') {
  if (!BILD.test(file.name)) throw new Error(`„${file.name}“ ist kein Bild (SVG, PNG, JPG, WebP).`);
  const url = await blobAlsDataUrl(file), info = await analysiereBild(url), m = paket.manifest;
  const name = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+(?=\.)/g, '');
  const v = schlageAssetVor({ pfad: 'x/' + name, ...info }, []);
  const role = rolle || v.role, ordner = role.startsWith('logo') ? 'assets/logos/' : 'assets/images/';
  let pfad = ordner + name; for (let i = 2; paket.dateien[pfad]; i++) pfad = ordner + name.replace(/(\.[a-z0-9]+)$/, `-${i}$1`);
  paket.dateien[pfad] = url;
  const ersetzt = rolle ? m.assets.find(a => a.role === role) : (role.startsWith('logo') ? m.assets.find(a => a.id === role) : null);
  if (ersetzt) {
    const alt = ersetzt.file;
    Object.assign(ersetzt, { file: pfad, ...(info.breite ? { w: info.breite, h: info.hoehe } : {}) });
    if (!m.assets.some(a => a.file === alt)) delete paket.dateien[alt];
    return { asset: ersetzt, ersetzt: true, grund: v.grund };
  }
  const neu = schlageAssetVor({ pfad, ...info }, m.assets.map(a => a.id)), { grund, ...asset } = neu;
  if (rolle) { asset.role = rolle; if (rolle.startsWith('logo') && !m.assets.some(a => a.id === rolle)) asset.id = rolle; }
  m.assets.push(asset);
  return { asset, ersetzt: false, grund };
}

/* ---------- Kopie eines vorhandenen Systems als bearbeitbares Paket ---------- */
export async function kopiereSystem(system, neueId, neuerName, fetchFn = (...a) => fetch(...a)) {
  const manifest = kopie(system.manifest), dateien = {};
  manifest.meta.id = neueId; manifest.meta.name = neuerName;
  for (const a of manifest.assets) if (!dateien[a.file]) dateien[a.file] = system.paket ? system.paket.dateien[a.file] : await blobAlsDataUrl(await (await fetchFn(system.source.url(a.file))).blob());
  return { id: neueId, manifest, voice: system.voice, readme: (await system.source.readText('README.md')) || '', dateien, herkunft: 'hochgeladen' };
}

/* Freie ID auf Basis eines Namens */
export function freieId(name, vergeben) {
  let basis = String(name).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'designsystem', id = basis;
  for (let i = 2; vergeben.includes(id); i++) id = `${basis}-${i}`;
  return id;
}

/* ---------- ZIP schreiben ---------- */
export async function zipAusSystem(system, JSZip, fetchFn = (...a) => fetch(...a)) {
  const zip = new JSZip(), o = zip.folder(system.id);
  o.file(MANIFEST, JSON.stringify(system.manifest, null, 2) + '\n');
  if (system.voice) o.file('voice.md', system.voice);
  const readme = await system.source.readText('README.md'); if (readme) o.file('README.md', readme);
  for (const pfad of new Set(system.manifest.assets.map(a => a.file))) o.file(pfad, await (await fetchFn(system.source.url(pfad))).blob());
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
