/* ============================================================
   Präsentationsgenerator – Prüfung
   checkSchema: kleiner JSON-Schema-Prüfer mit deutschen Meldungen.
   validateDesignSystem: Schema plus inhaltliche Regeln. Jede
   Meldung nennt den Pfad und sagt, was fehlt oder falsch ist.
   ============================================================ */
import { DS_SCHEMA, LAYOUT_TYPEN, PFLICHT_GROESSEN } from './schema.js';

const typOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
const TYP_DE = { string: 'Text', number: 'Zahl', integer: 'ganze Zahl', boolean: 'wahr/falsch', array: 'Liste', object: 'Objekt', null: 'leer', undefined: 'nichts' };
const wo = p => p || 'Manifest';

/* Prüft v gegen das Schema s und sammelt Meldungen in out. */
export function checkSchema(v, s, path = '', out = []) {
  const t = typOf(v);
  if (s.type) {
    const types = [].concat(s.type);
    const ok = types.some(x => x === t || (x === 'integer' && t === 'number' && Number.isInteger(v)));
    if (!ok) { out.push(`${wo(path)}: erwartet ${types.map(x => TYP_DE[x] || x).join(' oder ')}, gefunden ${TYP_DE[t] || t}`); return out; }
  }
  if (s.enum && !s.enum.includes(v)) out.push(`${wo(path)}: „${v}“ ist nicht erlaubt. Möglich: ${s.enum.join(', ')}`);
  if (t === 'string') {
    if (s.minLength && v.length < s.minLength) out.push(`${wo(path)}: darf nicht leer sein`);
    if (s.maxLength && v.length > s.maxLength) out.push(`${wo(path)}: zu lang (${v.length} Zeichen, erlaubt ${s.maxLength})`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) out.push(`${wo(path)}: „${v}“ hat nicht das erwartete Format (${MUSTER_DE[s.pattern] || s.pattern})`);
  }
  if (t === 'number') {
    if (s.minimum !== undefined && v < s.minimum) out.push(`${wo(path)}: ${v} ist zu klein (mindestens ${s.minimum})`);
    if (s.maximum !== undefined && v > s.maximum) out.push(`${wo(path)}: ${v} ist zu groß (höchstens ${s.maximum})`);
  }
  if (t === 'array') {
    if (s.minItems && v.length < s.minItems) out.push(`${wo(path)}: braucht mindestens ${s.minItems} Einträge, hat ${v.length}`);
    if (s.maxItems !== undefined && v.length > s.maxItems) out.push(`${wo(path)}: höchstens ${s.maxItems} Einträge erlaubt, hat ${v.length}`);
    if (s.items) v.forEach((x, i) => checkSchema(x, s.items, `${path}[${i}]`, out));
  }
  if (t === 'object') {
    (s.required || []).forEach(k => { if (v[k] === undefined) out.push(`${path ? path + '.' : ''}${k}: fehlt (Pflichtangabe)`); });
    const props = s.properties || {};
    Object.keys(v).forEach(k => {
      const sub = props[k] || (typeof s.additionalProperties === 'object' ? s.additionalProperties : null);
      if (sub) checkSchema(v[k], sub, path ? `${path}.${k}` : k, out);
      else if (s.additionalProperties === false) out.push(`${path ? path + '.' : ''}${k}: unbekannte Angabe`);
    });
  }
  return out;
}
const MUSTER_DE = {
  '^#[0-9a-fA-F]{6}$': 'Farbe als #RRGGBB',
  '^[a-z0-9][a-z0-9-]*$': 'nur Kleinbuchstaben, Ziffern und Bindestriche',
  '^[a-zA-Z][a-zA-Z0-9]*$': 'Buchstaben und Ziffern, ohne Leerzeichen'
};

/* ---------- Farben ---------- */
export function luminanz(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function kontrast(a, b) { const [x, y] = [luminanz(a), luminanz(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); }

/* ---------- Layouts auflösen ---------- */
/* Master und Layout zusammenführen: Deko und Platzhalter des Masters kommen zuerst. */
export function resolveLayout(manifest, layout) {
  const m = (layout.master && manifest.masters && manifest.masters[layout.master]) || {};
  const eigene = new Set((layout.placeholders || []).map(p => p.id));
  return {
    ...layout,
    typ: layout.typ || layout.id,
    background: layout.background || m.background || 'background',
    deko: [...(m.deko || []), ...(layout.deko || [])],
    placeholders: [...(m.placeholders || []).filter(p => !eigene.has(p.id)), ...(layout.placeholders || [])]
  };
}

/* Asset für einen Verweis finden: zuerst ID, dann Rolle, dann Tag */
export function findAsset(manifest, ref) {
  const a = manifest.assets || [];
  return a.find(x => x.id === ref) || a.find(x => x.role === ref) || a.find(x => (x.tags || []).includes(ref)) || null;
}

const sizePt = (manifest, size) => typeof size === 'number' ? size : manifest.tokens.typography.sizes[size];

/* Vollständige Prüfung eines Designsystems.
   opts.files: Liste der Dateipfade im Paket (falls bekannt), damit fehlende Assets auffallen.
   opts.ordner: Ordnername, muss zur ID passen. */
export function validateDesignSystem(manifest, opts = {}) {
  const errors = checkSchema(manifest, DS_SCHEMA), warnings = [];
  if (errors.length) return { ok: false, errors, warnings };
  const m = manifest, C = m.tokens.colors, sizes = m.tokens.typography.sizes;
  const E = t => errors.push(t), W = t => warnings.push(t);

  if (opts.ordner && opts.ordner !== m.meta.id) E(`meta.id: „${m.meta.id}“ passt nicht zum Ordnernamen „${opts.ordner}“. Beide müssen gleich sein.`);
  if (C.chartPalette.length < 6) W(`tokens.colors.chartPalette: ${C.chartPalette.length} Farben. Für Diagramme mit vielen Reihen sind 6 empfohlen.`);
  [['text', 'background'], ['textMuted', 'background'], ['text', 'surface'], ['textMuted', 'surface']].forEach(([a, b]) => {
    const k = kontrast(C[a], C[b]);
    if (k < 4.5) W(`tokens.colors: ${a} auf ${b} hat Kontrast ${k.toFixed(1)}:1. Für gut lesbaren Text sind 4,5:1 nötig (WCAG AA).`);
  });

  /* Assets */
  const files = opts.files ? new Set(opts.files) : null, assetIds = new Set();
  m.assets.forEach((a, i) => {
    const p = `assets[${i}]`;
    if (assetIds.has(a.id)) E(`${p}.id: „${a.id}“ kommt mehrfach vor. Jede Asset-ID muss eindeutig sein.`);
    assetIds.add(a.id);
    if (/^([a-z]+:|\/)|(^|\/)\.\.(\/|$)/i.test(a.file)) E(`${p}.file: „${a.file}“ muss ein Pfad innerhalb des Pakets sein, zum Beispiel assets/logos/logo.svg.`);
    else if (files && !files.has(a.file)) E(`${p}.file: Die Datei „${a.file}“ fehlt im Paket.`);
    if (!/\.(svg|png|jpe?g|webp|gif)$/i.test(a.file)) W(`${p}.file: „${a.file}“ ist kein übliches Bildformat (SVG, PNG, JPG, WebP).`);
  });

  /* Master */
  Object.entries(m.masters || {}).forEach(([id, ma]) => pruefeFlaeche(ma, `masters.${id}`));

  /* Layouts */
  const layoutIds = new Set();
  m.layouts.forEach((l, i) => {
    const p = `layouts[${i}] (${l.id})`;
    if (layoutIds.has(l.id)) E(`${p}: Die Layout-ID „${l.id}“ kommt mehrfach vor.`);
    layoutIds.add(l.id);
    if (l.master && !(m.masters && m.masters[l.master])) E(`${p}.master: Der Master „${l.master}“ ist unter „masters“ nicht definiert.`);
    const typ = l.typ || l.id;
    if (!LAYOUT_TYPEN.includes(typ)) W(`${p}: „${typ}“ ist kein Standard-Layouttyp. Beim Wechsel in ein anderes Designsystem wird die Folie auf „content-bullets“ abgebildet.`);
    pruefeFlaeche(l, p);
    const r = resolveLayout(m, l), ids = new Set();
    r.placeholders.forEach(ph => { if (ids.has(ph.id)) E(`${p}: Die Platzhalter-ID „${ph.id}“ kommt mehrfach vor.`); ids.add(ph.id); });
    /* Lesbarkeit: Textfarbe gegen den Untergrund */
    r.placeholders.filter(ph => ['text', 'bullets'].includes(ph.typ)).forEach(ph => {
      const fg = C[(ph.style || {}).color || 'text'], bg = C[ph.on || r.background];
      if (!fg || !bg) return;
      const pt = sizePt(m, (ph.style || {}).size || 'body') || 18, k = kontrast(fg, bg), soll = pt >= 18 ? 3 : 4.5;
      if (k < soll) W(`${p}.${ph.id}: Textfarbe „${(ph.style || {}).color || 'text'}“ auf „${ph.on || r.background}“ hat Kontrast ${k.toFixed(1)}:1, empfohlen sind mindestens ${soll}:1.`);
    });
  });

  function pruefeFlaeche(f, p) {
    if (f.background && !C[f.background]) E(`${p}.background: Die Farbe „${f.background}“ gibt es in tokens.colors nicht.`);
    (f.deko || []).forEach((d, j) => { if (!C[d.fill]) E(`${p}.deko[${j}].fill: Die Farbe „${d.fill}“ gibt es in tokens.colors nicht.`); });
    (f.placeholders || []).forEach(ph => {
      const q = `${p}.${ph.id}`, st = ph.style || {};
      if (ph.x < 0 || ph.y < 0 || ph.x + ph.w > 100.01 || ph.y + ph.h > 100.01) E(`${q}: Der Platzhalter ragt über die Folie hinaus (x ${ph.x} + w ${ph.w}, y ${ph.y} + h ${ph.h}; alles in Prozent, höchstens 100).`);
      if (ph.w <= 0 || ph.h <= 0) E(`${q}: Breite und Höhe müssen größer als 0 sein.`);
      if (st.color && !C[st.color]) E(`${q}.style.color: Die Farbe „${st.color}“ gibt es in tokens.colors nicht.`);
      if (ph.on && !C[ph.on]) E(`${q}.on: Die Farbe „${ph.on}“ gibt es in tokens.colors nicht.`);
      if (typeof st.size === 'string' && sizes[st.size] === undefined) E(`${q}.style.size: Die Größe „${st.size}“ gibt es in tokens.typography.sizes nicht. Vorhanden: ${Object.keys(sizes).join(', ')}.`);
      if (ph.typ === 'text' && !ph.auto && !ph.maxChars) E(`${q}: Textplatzhalter brauchen „maxChars“, damit kein Text überläuft.`);
      if (ph.typ === 'bullets' && !(ph.maxItems && ph.maxCharsPerItem)) E(`${q}: Aufzählungen brauchen „maxItems“ und „maxCharsPerItem“.`);
      if (ph.typ === 'items') {
        if (!ph.felder) E(`${q}: Platzhalter vom Typ „items“ brauchen „felder“ (zum Beispiel value und label).`);
        if (!ph.maxItems) E(`${q}: Platzhalter vom Typ „items“ brauchen „maxItems“.`);
        (ph.felder || []).forEach(fd => {
          const fs = fd.style || {};
          if (fs.color && !C[fs.color]) E(`${q}.felder.${fd.id}.style.color: Die Farbe „${fs.color}“ gibt es in tokens.colors nicht.`);
          if (typeof fs.size === 'string' && sizes[fs.size] === undefined) E(`${q}.felder.${fd.id}.style.size: Die Größe „${fs.size}“ gibt es in tokens.typography.sizes nicht.`);
        });
      }
      if (ph.minItems && ph.maxItems && ph.minItems > ph.maxItems) E(`${q}: minItems (${ph.minItems}) ist größer als maxItems (${ph.maxItems}).`);
      if (ph.typ === 'logo') {
        if (!ph.asset) E(`${q}: Logo-Platzhalter brauchen „asset“ mit einer Asset-ID oder Rolle, zum Beispiel "logo-primary".`);
        else if (!findAsset(m, ph.asset)) E(`${q}.asset: Es gibt kein Asset mit der ID oder Rolle „${ph.asset}“. Trage es unter „assets“ ein.`);
      }
      if (ph.typ === 'image' && ph.asset && !findAsset(m, ph.asset)) W(`${q}.asset: Es gibt kein Asset mit der ID oder Rolle „${ph.asset}“. Die Folie zeigt dann eine leere Bildfläche.`);
    });
  }

  /* Regeln */
  ((m.rules || {}).logoAuf || []).forEach(id => {
    const l = m.layouts.find(x => x.id === id);
    if (!l) E(`rules.logoAuf: Das Layout „${id}“ gibt es nicht.`);
    else if (!resolveLayout(m, l).placeholders.some(ph => ph.typ === 'logo')) E(`rules.logoAuf: Das Layout „${id}“ soll ein Logo zeigen, hat aber keinen Logo-Platzhalter.`);
  });
  PFLICHT_GROESSEN.forEach(k => { if (sizes[k] < 8 || sizes[k] > 120) W(`tokens.typography.sizes.${k}: ${sizes[k]} pt ist ungewöhnlich. Üblich sind 10 bis 60 pt.`); });

  return { ok: !errors.length, errors, warnings };
}
