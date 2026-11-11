/* ============================================================
   Präsentationsgenerator – Designsystem-Registry
   Findet Pakete, prüft sie und hält sie bereit. Woher ein Paket
   kommt (Ordner auf dem Webserver, ZIP, Browser-Speicher), steckt
   in einer „Quelle“ mit drei Funktionen:
     readText(pfad) → Text oder null
     exists(pfad)   → true/false
     url(pfad)      → Adresse für <img> und den Export
   ============================================================ */
import { validateDesignSystem, findAsset, resolveLayout } from './validate.js';

export const MANIFEST = 'design-system.json';

/* Quelle: Ordner auf einem Webserver */
export function httpSource(basis, fetchFn = (...a) => fetch(...a)) {
  const b = basis.replace(/\/?$/, '/');
  return {
    art: 'ordner',
    async readText(p) { try { const r = await fetchFn(b + p, { cache: 'no-cache' }); return r.ok ? await r.text() : null; } catch { return null; } },
    async exists(p) { try { const r = await fetchFn(b + p, { method: 'HEAD', cache: 'no-cache' }); return r.ok; } catch { return false; } },
    url: p => b + p
  };
}

/* Quelle: beliebige Funktionen (Tests, ZIP, Browser-Speicher) */
export function fnSource({ readText, exists, url, art = 'speicher' }) {
  return { art, readText, exists: exists || (async p => (await readText(p)) !== null), url: url || (p => p) };
}

/* Ein Paket laden und prüfen. Liefert immer ein Ergebnis mit verständlichen Meldungen. */
export async function loadPackage(source, ordner) {
  const res = { id: ordner || '', ordner: ordner || '', ok: false, errors: [], warnings: [], system: null };
  const raw = await source.readText(MANIFEST);
  if (raw === null) { res.errors.push(`Die Datei ${MANIFEST} fehlt. Jedes Designsystem braucht sie im obersten Ordner des Pakets.`); return res; }
  let manifest;
  try { manifest = JSON.parse(raw); }
  catch (e) { res.errors.push(`${MANIFEST} ist kein gültiges JSON: ${e.message}`); return res; }
  if (manifest && manifest.meta && manifest.meta.id) res.id = manifest.meta.id;

  const v = validateDesignSystem(manifest, { ordner });
  res.errors.push(...v.errors); res.warnings.push(...v.warnings);
  if (!v.ok) return res;

  /* Sind alle eingetragenen Dateien da? */
  const fehlt = (await Promise.all(manifest.assets.map(async a => (await source.exists(a.file)) ? null : a))).filter(Boolean);
  fehlt.forEach(a => res.errors.push(`Asset „${a.id}“: Die Datei „${a.file}“ fehlt im Paket.`));
  if (res.errors.length) return res;

  const voice = await source.readText('voice.md');
  if (voice === null) res.warnings.push('voice.md fehlt. Die Präsentation wird ohne eigene Formulierungsrichtlinien geschrieben.');

  res.ok = true;
  res.system = makeSystem(manifest, source, voice || '', res.warnings);
  return res;
}

function makeSystem(manifest, source, voice, warnings) {
  const layouts = manifest.layouts.map(l => resolveLayout(manifest, l));
  return {
    id: manifest.meta.id, meta: manifest.meta, manifest, tokens: manifest.tokens, rules: manifest.rules || {},
    layouts, voice, warnings, source,
    layout: id => layouts.find(l => l.id === id) || null,
    /* Layout für einen Typ; fehlt er, das Standard-Inhaltslayout */
    layoutForTyp: typ => layouts.find(l => l.typ === typ) || layouts.find(l => l.typ === 'content-bullets') || layouts[0],
    asset: ref => findAsset(manifest, ref),
    assetUrl: ref => { const a = findAsset(manifest, ref); return a ? source.url(a.file) : null; }
  };
}

/* Welche Ordner liegen unter design-systems/?
   1. index.json (für GitHub Pages; erzeugt von scripts/build-index.mjs)
   2. Verzeichnisliste des Webservers (python3 -m http.server, nginx autoindex) */
export async function discoverFolders(wurzel = 'design-systems/', fetchFn = (...a) => fetch(...a)) {
  const w = wurzel.replace(/\/?$/, '/'), namen = new Set();
  try {
    const r = await fetchFn(w + 'index.json', { cache: 'no-cache' });
    if (r.ok) ((await r.json()).systems || []).forEach(n => namen.add(String(n)));
  } catch {}
  try {
    const r = await fetchFn(w, { cache: 'no-cache' });
    if (r.ok) parseListing(await r.text()).forEach(n => namen.add(n));
  } catch {}
  return [...namen].filter(n => /^[a-z0-9][a-z0-9-]*$/.test(n)).sort();
}

/* Ordnernamen aus einer Verzeichnisliste lesen (JSON von nginx oder HTML mit Links) */
export function parseListing(text) {
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) return j.filter(e => e && e.type === 'directory').map(e => e.name);
  } catch {}
  const out = [];
  for (const m of text.matchAll(/href="([^"?#]+)\/"/g)) {
    const n = decodeURIComponent(m[1]);
    if (!n.includes('/') && !n.startsWith('.')) out.push(n);
  }
  return out;
}

/* Die Registry selbst */
export function createRegistry() {
  const systems = new Map(), probleme = new Map();
  const reg = {
    /* Ergebnis von loadPackage eintragen */
    add(res) {
      const key = res.id || res.ordner;
      if (res.ok) { systems.set(res.system.id, res.system); probleme.delete(key); }
      else { probleme.set(key, res); systems.delete(key); }
      return res;
    },
    remove(id) { systems.delete(id); probleme.delete(id); },
    get: id => systems.get(id) || null,
    list: () => [...systems.values()],
    problems: () => [...probleme.values()],
    /* Alle Ordner unter design-systems/ einlesen */
    async discover(wurzel = 'design-systems/', fetchFn) {
      const w = wurzel.replace(/\/?$/, '/'), ordner = await discoverFolders(w, fetchFn);
      const ergebnisse = await Promise.all(ordner.map(o => loadPackage(httpSource(w + o + '/', fetchFn), o)));
      ergebnisse.forEach(r => reg.add(r));
      return ergebnisse;
    }
  };
  return reg;
}
