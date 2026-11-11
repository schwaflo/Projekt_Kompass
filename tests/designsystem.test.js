import { test, assert, gleich, meldet, env } from './harness.js';
import { checkSchema, validateDesignSystem, kontrast } from '../praesentation/validate.js';
import { loadPackage, fnSource, parseListing, createRegistry } from '../praesentation/registry.js';

const DEMOS = ['demo-corporate', 'demo-hell'];
const PFLICHT_LAYOUTS = ['title', 'section', 'content-bullets', 'two-column', 'image-left', 'image-full', 'kpi-grid', 'timeline', 'quote', 'closing'];

const quelle = id => fnSource({ readText: p => env.readText(`design-systems/${id}/${p}`) });
const manifest = async id => JSON.parse(await env.readText(`design-systems/${id}/design-system.json`));
/* Paket aus einem Manifest im Speicher; dateien = vorhandene Pfade */
const paket = (m, dateien) => fnSource({
  readText: async p => p === 'design-system.json' ? (typeof m === 'string' ? m : JSON.stringify(m)) : (dateien && !dateien.includes(p) ? null : 'x'),
});

for (const id of DEMOS) {
  test(`${id}: lädt ohne Fehler und ohne Warnungen`, async () => {
    const r = await loadPackage(quelle(id), id);
    gleich(r.errors, [], 'Fehler');
    gleich(r.warnings, [], 'Warnungen');
    assert(r.ok && r.system.id === id);
    assert(r.system.voice.length > 100, 'voice.md wurde nicht geladen');
  });

  test(`${id}: enthält alle zehn Pflicht-Layouts`, async () => {
    const r = await loadPackage(quelle(id), id);
    PFLICHT_LAYOUTS.forEach(l => assert(r.system.layout(l), `Layout ${l} fehlt`));
  });

  test(`${id}: Logo auf Titel- und Abschlussfolie`, async () => {
    const r = await loadPackage(quelle(id), id);
    ['title', 'closing'].forEach(l => assert(r.system.layout(l).placeholders.some(p => p.typ === 'logo' && r.system.assetUrl(p.asset)), `Logo fehlt auf ${l}`));
  });

  test(`${id}: Chart-Palette hat sechs Farben, Text erfüllt WCAG AA`, async () => {
    const c = (await manifest(id)).tokens.colors;
    gleich(c.chartPalette.length, 6);
    assert(kontrast(c.text, c.background) >= 4.5 && kontrast(c.textMuted, c.background) >= 4.5 && kontrast(c.textMuted, c.surface) >= 4.5);
  });
}

test('Beide Demo-Systeme haben dieselben Layouts und Inhalts-Platzhalter', async () => {
  const [a, b] = await Promise.all(DEMOS.map(async id => (await loadPackage(quelle(id), id)).system));
  const inhalt = s => Object.fromEntries(s.layouts.map(l => [l.id, l.placeholders.filter(p => !p.auto && p.typ !== 'logo').map(p => `${p.id}:${p.typ}`).sort()]));
  gleich(inhalt(a), inhalt(b));
});

test('Master: Layout erbt Fußzeile und Seitenzahl', async () => {
  const s = (await loadPackage(quelle('demo-corporate'), 'demo-corporate')).system;
  const ids = s.layout('content-bullets').placeholders.map(p => p.id);
  ['footer', 'page', 'logo', 'title', 'bullets'].forEach(i => assert(ids.includes(i), `${i} fehlt`));
  gleich(s.layout('content-bullets').background, 'background');
});

test('Fehler: design-system.json fehlt', async () => {
  const r = await loadPackage(fnSource({ readText: async () => null }), 'leer');
  assert(!r.ok); meldet(r.errors, 'design-system.json fehlt');
});

test('Fehler: kaputtes JSON', async () => {
  const r = await loadPackage(paket('{ "meta": '), 'kaputt');
  assert(!r.ok); meldet(r.errors, 'kein gültiges JSON');
});

test('Fehler: Pflichtfarbe fehlt, Meldung nennt den Pfad', async () => {
  const m = await manifest('demo-corporate'); delete m.tokens.colors.primary;
  const v = validateDesignSystem(m);
  assert(!v.ok); meldet(v.errors, 'tokens.colors.primary: fehlt');
});

test('Fehler: Farbe ist kein Hex-Wert', async () => {
  const m = await manifest('demo-corporate'); m.tokens.colors.accent = 'türkis';
  meldet(validateDesignSystem(m).errors, 'tokens.colors.accent');
});

test('Fehler: Layout verweist auf unbekannte Farbe und Größe', async () => {
  const m = await manifest('demo-hell');
  m.layouts[0].placeholders[1].style.color = 'neongelb';
  m.layouts[0].placeholders[1].style.size = 'riesig';
  const v = validateDesignSystem(m);
  meldet(v.errors, '„neongelb“ gibt es in tokens.colors nicht');
  meldet(v.errors, '„riesig“ gibt es in tokens.typography.sizes nicht');
});

test('Fehler: Textplatzhalter ohne Zeichenlimit', async () => {
  const m = await manifest('demo-corporate');
  delete m.layouts.find(l => l.id === 'quote').placeholders[0].maxChars;
  meldet(validateDesignSystem(m).errors, 'brauchen „maxChars“');
});

test('Fehler: Platzhalter ragt über die Folie', async () => {
  const m = await manifest('demo-corporate'); m.layouts[0].placeholders[1].w = 99;
  meldet(validateDesignSystem(m).errors, 'ragt über die Folie hinaus');
});

test('Fehler: Logo-Platzhalter ohne passendes Asset', async () => {
  const m = await manifest('demo-corporate'); m.assets = m.assets.filter(a => a.id !== 'logo-negative');
  meldet(validateDesignSystem(m).errors, 'kein Asset mit der ID oder Rolle „logo-negative“');
});

test('Fehler: doppelte Layout-ID und unbekannter Master', async () => {
  const m = await manifest('demo-corporate');
  m.layouts.push({ ...m.layouts[0] }); m.layouts[2].master = 'gibtsnicht';
  const v = validateDesignSystem(m);
  meldet(v.errors, 'Layout-ID „title“ kommt mehrfach vor');
  meldet(v.errors, 'Master „gibtsnicht“');
});

test('Fehler: Asset-Datei fehlt im Paket, Meldung nennt die Datei', async () => {
  const m = await manifest('demo-corporate');
  const da = m.assets.map(a => a.file).filter(f => !f.includes('hero'));
  const r = await loadPackage(paket(m, da), 'demo-corporate');
  assert(!r.ok); meldet(r.errors, 'assets/images/hero.svg');
});

test('Fehler: Asset-Pfad zeigt aus dem Paket heraus', async () => {
  const m = await manifest('demo-corporate'); m.assets[0].file = '../../geheim.svg';
  meldet(validateDesignSystem(m).errors, 'innerhalb des Pakets');
});

test('Fehler: Ordnername passt nicht zur ID', async () => {
  const r = await loadPackage(paket(await manifest('demo-hell')), 'anders');
  assert(!r.ok); meldet(r.errors, 'passt nicht zum Ordnernamen');
});

test('Warnung: schwacher Kontrast und fehlende voice.md', async () => {
  const m = await manifest('demo-hell'); m.tokens.colors.textMuted = '#C8C4BF';
  const r = await loadPackage(paket(m, [...m.assets.map(a => a.file)]), 'demo-hell');
  assert(r.ok, 'Warnungen dürfen das Laden nicht verhindern');
  meldet(r.warnings, 'Kontrast'); meldet(r.warnings, 'voice.md fehlt');
});

test('Warnung: eigener Layouttyp', async () => {
  const m = await manifest('demo-hell'); m.layouts.push({ ...m.layouts[2], id: 'agenda' });
  const v = validateDesignSystem(m);
  assert(v.ok); meldet(v.warnings, 'kein Standard-Layouttyp');
});

test('checkSchema: Typ, Auswahl, Pflicht und Listenlänge', () => {
  const s = { type: 'object', properties: { a: { type: 'string', enum: ['x', 'y'] }, b: { type: 'array', items: { type: 'integer' }, maxItems: 2 } }, required: ['a', 'c'] };
  const out = checkSchema({ a: 'z', b: [1, 2.5, 3] }, s);
  meldet(out, 'a: „z“ ist nicht erlaubt'); meldet(out, 'c: fehlt'); meldet(out, 'b[1]: erwartet ganze Zahl'); meldet(out, 'höchstens 2 Einträge');
  gleich(checkSchema({ a: 'x', c: 1 }, s), []);
});

test('Verzeichnisliste: python http.server und nginx', () => {
  const html = '<ul><li><a href="demo-corporate/">demo-corporate/</a></li><li><a href="index.json">index.json</a></li><li><a href=".git/">.git/</a></li><li><a href="mein%20system/">x</a></li></ul>';
  gleich(parseListing(html), ['demo-corporate', 'mein system']);
  gleich(parseListing('[{"name":"a","type":"directory"},{"name":"index.json","type":"file"}]'), ['a']);
});

test('Registry: findet Ordner ohne Codeänderung, meldet kaputte Pakete', async () => {
  const gut = await manifest('demo-hell');
  const neu = JSON.stringify({ ...gut, meta: { ...gut.meta, id: 'neu-dabei', name: 'Neu dabei' } });
  const antworten = {
    'ds/index.json': JSON.stringify({ systems: ['demo-hell'] }),
    'ds/': '<a href="demo-hell/">a</a><a href="neu-dabei/">b</a><a href="kaputt/">c</a>',
    'ds/demo-hell/design-system.json': JSON.stringify(gut),
    'ds/neu-dabei/design-system.json': neu,
    'ds/kaputt/design-system.json': '{"schemaVersion":"1.0"}'
  };
  const fetchFn = async (url, o = {}) => {
    const da = url in antworten || /\/assets\//.test(url);
    return { ok: da, text: async () => antworten[url] || '', json: async () => JSON.parse(antworten[url]) };
  };
  const reg = createRegistry();
  await reg.discover('ds', fetchFn);
  gleich(reg.list().map(s => s.id).sort(), ['demo-hell', 'neu-dabei']);
  gleich(reg.problems().map(p => p.ordner), ['kaputt']);
  meldet(reg.problems()[0].errors, 'meta: fehlt');
  gleich(reg.get('neu-dabei').assetUrl('logo-primary'), 'ds/neu-dabei/assets/logos/logo-primary.svg');
});
