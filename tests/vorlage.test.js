/* Vorlagen: Einordnung der Layouts durch die KI, Tabellenflächen und Tabellenstil aus der Vorlage */
import { test, assert, gleich, env } from './harness.js';
import { loadPackage, fnSource } from '../praesentation/registry.js';
import { tabellenFlaeche, inhaltsPlatzhalter, validateSpec, kuerzeSpec, hatSymbole } from '../praesentation/spec.js';
import { SYMBOL_IDS } from '../praesentation/icons.js';
import { buildSlides } from '../praesentation/layout.js';
import { slideHTML } from '../praesentation/render-html.js';
import { exportPptx } from '../praesentation/render-pptx.js';
import { waehleLayouts, eignung } from '../praesentation/analyse.js';
import { bewerteLayouts, wendeBewertungAn, steckbrief } from '../praesentation/layout-ki.js';
import * as P from '../praesentation/pipeline.js';

const system = async id => (await loadPackage(fnSource({ readText: p => env.readText(`design-systems/${id}/${p}`) }), id)).system;
const prompts = () => P.ladePrompts(env.readText);
const imBrowser = typeof document !== 'undefined';
/* Designsystem mit geänderten Layouts, ohne das geladene zu verändern */
const mit = (sys, aendern) => {
  const layouts = sys.layouts.map(l => JSON.parse(JSON.stringify(l)));
  aendern(layouts);
  return { ...sys, layouts, layout: id => layouts.find(l => l.id === id) || null, layoutForTyp: t => layouts.find(l => l.typ === t) || layouts.find(l => l.id === t) || layouts[0] };
};

/* ---------- Einordnung durch die KI ---------- */
test('Vorlage: Einordnung der KI zählt bei der Layoutwahl, „nicht verwenden“ hält ein Layout fern', async () => {
  const sys = await system('demo-corporate');
  const st = sys.layouts.find(l => l.typ === 'statement'), vorher = eignung(st, sys, 'kapitel');
  const k = mit(sys, ls => { ls.find(l => l.id === st.id).ki = { zweck: 'Kapiteltrenner der Marke', formen: ['kapitel', 'kernsatz'], meiden: false }; });
  assert(eignung(k.layout(st.id), k, 'kapitel') > vorher, `Kapitel auf „${st.id}“: ${vorher} → ${eignung(k.layout(st.id), k, 'kapitel')}`);
  assert(eignung(k.layout(st.id), k, 'zahl') < eignung(st, sys, 'zahl'), 'nicht genannte Wirkung zählt weniger');
  /* Kapitel bleiben ab sechs Folien erhalten; ein gemiedenes Kapitel-Layout wird nicht genommen */
  const folien = ['titel', 'kapitel', 'liste', 'kapitel', 'liste', 'kernsatz', 'abschluss'].map(form => ({ form }));
  const wahl = waehleLayouts(folien, sys);
  gleich(wahl[1].form, 'kapitel', 'sieben Folien: Kapitel bleibt Kapitel');
  const sek = sys.layouts.find(l => l.typ === 'section');
  gleich(sys.layout(wahl[1].layoutId).typ, 'section');
  const ohne = mit(sys, ls => { ls.find(l => l.id === sek.id).ki = { zweck: '', formen: [], meiden: true }; });
  assert(waehleLayouts(folien, ohne)[1].layoutId !== sek.id, 'gemiedenes Layout wird nicht gewählt');
  gleich(waehleLayouts(folien.slice(0, 5), sys)[1].form, 'kernsatz', 'fünf Folien: kein Kapiteltrenner');
});

test('Vorlage: KI ordnet alle Layouts in Teilen ein, unbekannte Wirkungen fallen weg, fehlende werden nachgefragt', async () => {
  const sys = await system('demo-corporate'), p = await prompts();
  let erster = true;
  const ki = { anfragen: [], frage: async a => {
    ki.anfragen.push(a);
    const ids = a.schema.properties.layouts.items.properties.id.enum;
    const liste = ids.map(id => ({ id, zweck: `Zweck ${id}`, formen: id === 'statement' ? ['kapitel', 'kernsatz', 'unsinn'] : ['liste'], meiden: id === 'quote' }));
    if (erster) { erster = false; return { layouts: liste.slice(1) }; } /* einer fehlt: wird nachgefragt */
    return { layouts: liste };
  } };
  const b = await bewerteLayouts(ki, p, sys, { vorlage: 'Demo' });
  gleich(Object.keys(b).length, sys.layouts.filter(l => inhaltsPlatzhalter(l).length).length, 'jedes Layout mit Inhaltsflächen');
  gleich(b.statement.formen, ['kapitel', 'kernsatz']);
  gleich([b.quote.meiden, b.statement.meiden], [true, false]);
  gleich(ki.anfragen.length, Math.ceil(Object.keys(b).length / 10) + 1, 'Teile zu je zehn, dazu eine Nachfrage');
  assert(ki.anfragen[1].prompt.includes('korrektur') || ki.anfragen[1].prompt.includes('Es fehlen Einträge'), 'Nachfrage nennt das fehlende Layout');
  assert(ki.anfragen[0].prompt.includes('WIRKUNGEN') && ki.anfragen[0].prompt.includes('title:'), 'Steckbriefe und Wirkungen im Prompt');
  const m = { layouts: sys.layouts.map(l => ({ id: l.id })) };
  gleich(wendeBewertungAn(m, b), Object.keys(b).length);
  gleich(m.layouts.find(l => l.id === 'statement').ki.formen, ['kapitel', 'kernsatz']);
});

test('Vorlage: Steckbrief zeigt Flächen, Schriftgrößen und den Text der Beispielfolie', async () => {
  const sys = await system('demo-corporate'), l = JSON.parse(JSON.stringify(sys.layout('content-bullets')));
  l.placeholders.find(p => p.id === 'title').beispiel = 'Unsere drei Standorte im Überblick';
  const s = steckbrief(l, sys);
  assert(s.includes('content-bullets') && s.includes('Beispiel: „Unsere drei Standorte im Überblick“') && /bullets: Liste, bis \d+ Punkte/.test(s), s);
  /* der Beispieltext geht auch in die Feldbeschreibung beim Schreiben der Folie */
  const k = mit(sys, ls => { ls.find(x => x.id === 'content-bullets').placeholders.find(p => p.id === 'title').beispiel = 'Unsere drei Standorte im Überblick'; });
  let prompt = '';
  const ki = { frage: async a => { prompt = a.prompt; return { inhalt: { title: 'Drei Standorte tragen das Wachstum', bullets: ['Mehr Gäste am Markt'] }, notizen: '' }; } };
  await P.erstelleFolie(ki, await prompts(), { briefing: { art: 'bericht', thema: 'Standorte' }, outline: { titel: 'T', folien: [{ layoutId: 'content-bullets', form: 'liste', kernaussage: 'Drei Standorte' }] }, index: 0, system: k });
  assert(prompt.includes('So füllt die Vorlage dieses Feld') && prompt.includes('Unsere drei Standorte im Überblick'), 'Beispiel im Folien-Prompt');
});

/* ---------- Symbole auf Karten ---------- */
test('Symbole: Karten tragen je Eintrag ein Symbol in der Akzentfarbe; unbekannte werden gemeldet, Kennzahlen bekommen keine', async () => {
  const sys = await system('demo-corporate'), karten = sys.layouts.find(l => l.typ === 'cards'), kpi = sys.layouts.find(l => l.typ === 'kpi-grid');
  const ph = karten.placeholders.find(p => p.typ === 'items');
  assert(hatSymbole(ph), 'Karten können Symbole tragen');
  assert(!hatSymbole(kpi.placeholders.find(p => p.typ === 'items')), 'Kennzahlen nicht');
  const schema = P.folienSchema(karten, sys);
  gleich(schema.properties.inhalt.properties[ph.id].items.properties.icon.enum, SYMBOL_IDS);
  const titel = karten.placeholders.find(p => p.id === 'title') ? { title: 'Drei Gründe für das Portal' } : {};
  const eintraege = [{ icon: 'zeit', [ph.felder[0].id]: 'Schneller' }, { icon: 'sicherheit', [ph.felder[0].id]: 'Sicher' }, { [ph.felder[0].id]: 'Einfach' }];
  const spec = { titel: 'T', folien: [{ layoutId: karten.id, inhalt: { ...titel, [ph.id]: eintraege } }] };
  gleich(validateSpec(spec, sys).errors.filter(e => e.includes('Symbol') || e.includes('icon')), []);
  const bilder = buildSlides(spec, sys)[0].elemente.filter(e => e.symbol);
  gleich(bilder.map(b => b.symbol), ['zeit', 'sicherheit'], 'nur Einträge mit Symbol');
  assert(bilder[0].src.startsWith('data:image/svg+xml') && decodeURIComponent(bilder[0].src).includes('stroke="#'), 'SVG in einer Farbe');
  const falsch = { titel: 'T', folien: [{ layoutId: karten.id, inhalt: { ...titel, [ph.id]: [{ icon: 'einhorn', [ph.felder[0].id]: 'X' }, ...eintraege.slice(1)] } }] };
  assert(validateSpec(falsch, sys).errors.some(e => e.includes('Symbol „einhorn“')), 'unbekanntes Symbol wird gemeldet');
  const k = kuerzeSpec(falsch, sys).spec.folien[0].inhalt[ph.id];
  gleich([k[0].icon, k[1].icon], [undefined, 'sicherheit'], 'Kürzen behält gültige Symbole, entfernt ungültige');
});

/* ---------- Tabellen aus der Vorlage ---------- */
const TAB = { kopf: ['Standort', 'Gäste', 'Umsatz'], zeilen: [['Markt', '12.400', '1,2 Mio. €'], ['Bahnhof', '8.100', '0,8 Mio. €'], ['Hafen', '5.300', '0,5 Mio. €']] };
test('Vorlage: Tabellenfläche des Layouts und Tabellenstil (Kopfzeile, Streifen) in Vorschau und Export', async () => {
  const sys = await system('demo-corporate');
  const k = mit(sys, ls => ls.push({ id: 'tabelle-vorlage', typ: 'table', name: 'Tabelle', beschreibung: 'Tabelle', background: 'background', deko: [], placeholders: [
    { id: 'title', typ: 'text', beschreibung: 'Überschrift', pflicht: true, x: 6, y: 8, w: 88, h: 12, maxChars: 70, style: { font: 'heading', size: 'h1', color: 'text' } },
    { id: 'table', typ: 'table', beschreibung: 'Tabelle', x: 10, y: 30, w: 80, h: 55 }] }));
  const l = k.layout('tabelle-vorlage');
  gleich(tabellenFlaeche(l), { x: 10, y: 30, w: 80, h: 55, ids: ['table'] }, 'genau die Fläche der Vorlage');
  gleich(inhaltsPlatzhalter(l).map(p => p.id), ['title'], 'die Tabellenfläche füllt die App, nicht die KI');
  assert(eignung(l, k, 'tabelle') > eignung(k.layout('content-bullets'), k, 'tabelle'), 'Tabellen-Layout schlägt Inhaltslayout');
  gleich(waehleLayouts([{ form: 'titel' }, { form: 'tabelle' }, { form: 'abschluss' }], k)[1].layoutId, 'tabelle-vorlage');
  /* Stil aus der Vorlage */
  const gestylt = { ...k, tokens: { ...k.tokens, tabelle: { kopfFlaeche: 'primary', kopfText: '#FFFFFF', streifen: '#F3F1EC', flaeche: 'background' } } };
  const f = buildSlides({ titel: 'T', folien: [{ layoutId: 'tabelle-vorlage', inhalt: { title: 'Der Markt trägt das Wachstum' }, tabelle: TAB }] }, gestylt)[0];
  const t = f.elemente.find(e => e.art === 'tabelle');
  gleich([t.x, t.y, t.kopfFlaeche, t.kopfText, t.streifen, t.flaeche], [10, 30, gestylt.tokens.colors.primary, '#FFFFFF', '#F3F1EC', gestylt.tokens.colors.background]);
  const html = slideHTML(f);
  assert(html.includes(`background:${gestylt.tokens.colors.primary};color:#FFFFFF`) && html.includes('background:#F3F1EC'), 'Kopfzeile und Streifen in der Vorschau');
  /* ohne Stil wie bisher: Linien, keine Flächen */
  const schlicht = buildSlides({ titel: 'T', folien: [{ layoutId: 'tabelle-vorlage', inhalt: { title: 'X' }, tabelle: TAB }] }, k)[0].elemente.find(e => e.art === 'tabelle');
  assert(!schlicht.kopfFlaeche && !schlicht.streifen, 'ohne Tabellenstil keine Füllungen');
  if (imBrowser && window.PptxGenJS) {
    const pptx = await exportPptx([f], { PptxGenJS: window.PptxGenJS, ladeBild: async () => null, titel: 'T' });
    const zip = await window.JSZip.loadAsync(await pptx.write({ outputType: 'blob' }));
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    const primary = gestylt.tokens.colors.primary.slice(1).toUpperCase();
    assert(xml.includes(`<a:srgbClr val="${primary}"/>`) && xml.includes('F3F1EC'), 'Füllungen im PowerPoint-Export');
  }
});
