/* Tests für das Material der Person im Präsentationsgenerator: Tabellen lesen, Material für die Prompts,
   jedes Material bekommt seine Folie, Tabellenfolien in Modell, Vorschau und PowerPoint, Briefing mit Material. */
import { test, assert, gleich, env } from './harness.js';
import { loadPackage, fnSource } from '../praesentation/registry.js';
import { validateSpec, kuerzeSpec, tabellenFlaeche } from '../praesentation/spec.js';
import { buildSlides } from '../praesentation/layout.js';
import { slideHTML } from '../praesentation/render-html.js';
import { exportPptx } from '../praesentation/render-pptx.js';
import { waehleLayouts, eignung } from '../praesentation/analyse.js';
import * as P from '../praesentation/pipeline.js';
import * as M from '../praesentation/material.js';

const system = async id => (await loadPackage(fnSource({ readText: p => env.readText(`design-systems/${id}/${p}`) }), id)).system;
const prompts = () => P.ladePrompts(env.readText);
function kiMit(antworten) {
  const ki = { anfragen: [], frage: async a => { ki.anfragen.push(a); const n = antworten.shift(); if (n === undefined) throw new Error('simulierte KI: keine Antwort mehr hinterlegt'); return typeof n === 'function' ? n(a) : n; } };
  return ki;
}

const TABELLE = { kopf: ['Jahr', 'Besucher', 'Umsatz'], zeilen: [['2022', '12.400', '1,2 Mio. €'], ['2023', '18.900', '1,8 Mio. €'], ['2024', '25.300', '2,4 Mio. €']] };
const MAT = [
  { id: 'M1', key: 'kfoto', art: 'bild', name: 'team.jpg', notiz: 'Unser Team im Café', w: 1600, h: 1000, bildart: 'foto', beschreibung: 'Vier Menschen an einem Tresen mit Kaffeetassen' },
  { id: 'M2', key: 'ktab', art: 'tabelle', name: 'Besucher.xlsx', notiz: 'Die Besucher haben sich verdoppelt', tabelle: TABELLE },
  { id: 'M3', key: 'ktext', art: 'text', name: 'Öffnungszeiten', notiz: '', text: 'Montag bis Freitag 8 bis 18 Uhr, Samstag 9 bis 14 Uhr. Neu: Frühstück ab 7:30 Uhr.' }
];
const BRIEFING = { schemaVersion: '2.0', art: 'bericht', art_name: 'Bericht', thema: 'Ein Jahr Café am Markt', stand: 'Das Café läuft seit drei Jahren', ergebnisse: 'Mehr Gäste', folienzahl: 5, annahmen: [] };

/* ---------- Zahlen und Tabellen lesen ---------- */
test('Material: Zahlen erkennen und lesbar schreiben', () => {
  ['12.400', '1,2 Mio. €', '-3 %', '€ 45,90', '2024', '0,5'].forEach(z => assert(M.istZahl(z), z));
  ['Umsatz', 'Q1 2024', '', 'ca. viele'].forEach(z => assert(!M.istZahl(z), z));
  gleich([M.zahlText(2024), M.zahlText(12400), M.zahlText(1234.567), M.zahlText(0.255, 'prozent'), M.zahlText(45292, 'datum')], ['2024', '12.400', '1234,57', '25,5 %', '01.01.2024']);
});
test('Material: Tabelle aus Excel (Tab), deutschem CSV (Semikolon) und CSV mit Anführungszeichen', () => {
  const tsv = M.leseTabelleText('Jahr\tBesucher\tUmsatz\n2022\t12.400\t1,2 Mio. €\n2023\t18.900\t1,8 Mio. €\n');
  gleich(tsv, { kopf: ['Jahr', 'Besucher', 'Umsatz'], zeilen: [['2022', '12.400', '1,2 Mio. €'], ['2023', '18.900', '1,8 Mio. €']] });
  const csv = M.leseTabelleText('﻿Produkt;Preis;Anteil\r\nEspresso;2,40;35 %\r\nCappuccino;3,20;41 %\r\n');
  gleich(csv.kopf, ['Produkt', 'Preis', 'Anteil']); gleich(csv.zeilen[1], ['Cappuccino', '3,20', '41 %']);
  const zitat = M.leseTabelleText('Name,Rolle\n"Müller, Anna",Leitung\n"Ben ""der Bäcker""",Küche');
  gleich(zitat.zeilen, [['Müller, Anna', 'Leitung'], ['Ben "der Bäcker"', 'Küche']]);
  gleich(M.leseTabelleText('Nur eine Zeile ohne Trennzeichen'), null, 'Text ist keine Tabelle');
  gleich(M.leseTabelleText('Eins\nZwei\nDrei'), null, 'eine Spalte ist keine Tabelle');
  const ohneKopf = M.leseTabelleText('2022\t100\n2023\t200');
  gleich([ohneKopf.kopf, ohneKopf.zeilen.length], [[], 2], 'Zahlen in der ersten Zeile: kein Kopf');
});
test('Material: Tabelle aus der Zwischenablage (HTML), leere Zeilen und Spalten fallen weg', () => {
  const t = M.leseTabelleHtml('<meta charset="utf-8"><table><tr><th>Monat</th><th></th><th>Gäste</th></tr><tr><td>Januar</td><td></td><td>1.200</td></tr><tr><td colspan="3"></td></tr><tr><td>Februar</td><td></td><td>1.450</td></tr></table>');
  gleich(t, { kopf: ['Monat', 'Gäste'], zeilen: [['Januar', '1.200'], ['Februar', '1.450']] });
  gleich(M.leseTabelleHtml('<p>kein Tisch</p>'), null);
});
test('Material: Excel-Datei mit Text, Zahl, Prozent, Datum und zwei Blättern', async () => {
  const JSZip = globalThis.JSZip; assert(JSZip, 'JSZip fehlt (vendor/pptxgen.bundle.js)');
  const z = new JSZip(), ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  z.file('xl/workbook.xml', `<workbook ${ns}><sheets><sheet name="Zahlen" sheetId="1" r:id="rId1"/><sheet name="Leer" sheetId="2" r:id="rId2"/></sheets></workbook>`);
  z.file('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>');
  z.file('xl/sharedStrings.xml', `<sst ${ns}><si><t>Jahr</t></si><si><t>Gäste</t></si><si><t>Anteil</t></si><si><t>Eröffnung</t></si></sst>`);
  z.file('xl/styles.xml', `<styleSheet ${ns}><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="9"/><xf numFmtId="14"/></cellXfs></styleSheet>`);
  z.file('xl/worksheets/sheet1.xml', `<worksheet ${ns}><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>
    <row r="2"><c r="A2"><v>2023</v></c><c r="B2"><v>18900</v></c><c r="C2" s="1"><v>0.415</v></c><c r="D2" s="2"><v>45292</v></c></row>
    <row r="3"><c r="A3"><v>2024</v></c><c r="B3"><f>B2*1.34</f><v>25326</v></c><c r="C3" s="1"><v>0.5</v></c></row></sheetData></worksheet>`);
  z.file('xl/worksheets/sheet2.xml', `<worksheet ${ns}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>allein</t></is></c></row></sheetData></worksheet>`);
  const datei = new File([await z.generateAsync({ type: 'blob' })], 'gaeste.xlsx');
  const b = await M.leseXlsx(datei, JSZip);
  gleich(b.length, 1, 'Blatt mit nur einer Zelle ist keine Tabelle');
  gleich(b[0], { name: 'Zahlen', kopf: ['Jahr', 'Gäste', 'Anteil', 'Eröffnung'], zeilen: [['2023', '18.900', '41,5 %', '01.01.2024'], ['2024', '25.326', '50 %', '']] });
});
test('Material: breite Tabellen werden begrenzt, lange gehen über mehrere Folien', () => {
  const breit = { kopf: Array.from({ length: 11 }, (_, i) => `S${i + 1}`), zeilen: [Array.from({ length: 11 }, (_, i) => String(i))] };
  const b = M.begrenzeTabelle(breit);
  gleich([b.tabelle.kopf.length, b.tabelle.zeilen[0].length], [M.MAX_SPALTEN, M.MAX_SPALTEN]);
  assert(b.hinweis.includes('11 Spalten') && b.hinweis.includes('3'), b.hinweis);
  gleich(M.begrenzeTabelle(TABELLE).hinweis, '');
  const lang = { kopf: ['A', 'B'], zeilen: Array.from({ length: 30 }, (_, i) => [`Z${i + 1}`, String(i)]) };
  gleich(M.tabellenTeile(lang), 3);
  gleich(M.tabellenTeil(lang, 3).zeilen.map(z => z[0]), ['Z25', 'Z26', 'Z27', 'Z28', 'Z29', 'Z30']);
  gleich(M.tabellenTeil(lang, 2).kopf, ['A', 'B'], 'Kopf auf jedem Teil');
});

/* ---------- Material für die Prompts ---------- */
test('Material: kurz für Briefing und Gliederung, vollständig für die Folie, Quelle für Fakten', () => {
  const l = M.materialListe(MAT);
  assert(l.includes('M1 (Foto „team.jpg“)') && l.includes('Vier Menschen') && l.includes('Unser Team im Café'), l);
  assert(l.includes('M2 (Tabelle „Besucher.xlsx“, 3 Spalten × 3 Zeilen; Spalten: Jahr, Besucher, Umsatz)') && l.includes('2022 | 12.400 | 1,2 Mio. €'), l);
  assert(l.includes('M3 (Text „Öffnungszeiten“)') && l.includes('Frühstück ab 7:30'), l);
  gleich(M.materialListe([]), '(keins)');
  const voll = M.materialVoll(MAT[1]);
  assert(voll.includes('TABELLE DER PERSON') && voll.includes('2024 | 25.300 | 2,4 Mio. €') && voll.includes('Die Besucher haben sich verdoppelt'), voll);
  assert(M.materialVoll(MAT[0]).includes('die App setzt es ein') && M.materialVoll(MAT[2]).includes('Montag bis Freitag'), 'Bild und Text');
  const q = M.materialQuelle(MAT);
  assert(q.includes('25.300') && q.includes('7:30') && q.includes('Unser Team'), q);
  const viel = Array.from({ length: 30 }, (_, i) => ({ ...MAT[2], id: `M${i + 1}`, text: 'x'.repeat(500) }));
  assert(M.materialListe(viel, 2000).length < 2600 && M.materialListe(viel, 2000).includes('weitere'), 'begrenzt');
  gleich([M.neueId([]), M.neueId(MAT)], ['M1', 'M4']);
});

/* ---------- Bilder der Person als Bilder des Designsystems ---------- */
test('Material: Bilder der Person werden Bilder des Designsystems, Grafiken werden ganz gezeigt', async () => {
  const sys = await system('demo-corporate'), mit = M.mitMaterial(sys, [MAT[0], { ...MAT[0], id: 'M9', key: 'kgraf', bildart: 'grafik', w: 800, h: 800 }], k => `data:image/png;base64,${k}`);
  assert(mit !== sys && sys.manifest.assets.every(a => !a.material), 'Original bleibt unverändert');
  gleich([mit.asset('material-kfoto').role, mit.asset('material-kgraf').role, mit.asset('material-kgraf').fit], ['hero-image', 'square-image', 'contain']);
  gleich(mit.assetUrl('material-kfoto'), 'data:image/png;base64,kfoto');
  gleich(mit.assetUrl('portrait'), sys.assetUrl('portrait'), 'eigene Bilder des Systems wie vorher');
  gleich(M.mitMaterial(sys, [MAT[1]], () => null), sys, 'ohne Bilder kein Umbau');
  const folie = { layoutId: 'image-left', inhalt: { title: 'Unser Team', bullets: ['Vier Menschen, ein Ziel'], image: 'material-kgraf' } };
  gleich(validateSpec({ titel: 'x', folien: [folie] }, mit).errors, []);
  const bild = buildSlides({ titel: 'x', folien: [folie] }, mit)[0].elemente.find(e => e.art === 'bild' && e.ph === 'image');
  gleich([bild.src, bild.fit], ['data:image/png;base64,kgraf', 'contain']);
  gleich(P.freieBilder(mit).map(a => a.id), P.freieBilder(sys).map(a => a.id), 'die KI wählt frei nur Bilder des Designsystems');
});

/* ---------- Jedes Material bekommt seine Folie ---------- */
const plan = (form, kernaussage, extra = {}) => ({ abschnitt: '', form, betont: false, kernaussage, inhalt: kernaussage, ...extra });
test('Material: fehlendes Material bekommt eine Folie an passender Stelle, doppelte Zuordnung fällt weg', () => {
  const folien = [plan('titel', 'Ein Jahr Café am Markt', { material: 'M1' }), plan('kernsatz', 'Die Besucher haben sich verdoppelt'), plan('liste', 'Unser Team und die Öffnungszeiten', { material: 'M3' }), plan('bild', 'Gemütliche Ecke', { material: 'M1' }), plan('bild', 'Noch ein Bild', { material: 'M1' }), plan('abschluss', 'Kommt vorbei')];
  const r = M.sichereMaterial(folien, MAT, { eigeneFotos: true });
  const mit = id => r.folien.map((f, i) => f.material === id ? i : -1).filter(i => i >= 0);
  const tab = mit('M2');
  gleich(tab, [2], 'Tabelle steht hinter der Folie, die von den Besuchern spricht');
  gleich(r.folien[2].form, 'tabelle');
  gleich(mit('M3'), [3]);
  gleich(mit('M1'), [4], 'Bild nur einmal, nicht auf dem Titel');
  gleich(r.folien[0].form, 'titel'); gleich(r.folien[r.folien.length - 1].form, 'abschluss');
  assert(r.aenderungen.some(a => a.includes('Besucher.xlsx') && a.includes('Position 3')), r.aenderungen.join(' | '));
  gleich([r.folien[5].form, r.folien[5].material, r.folien[5].bild], ['bild', undefined, true], 'Bildfolie ohne Material bleibt, wenn das Designsystem Fotos hat');
});
test('Material: eine Folie, die schon davon handelt, trägt das Material, statt dass eine zweite daneben entsteht', () => {
  const folien = [plan('titel', 'Ein Jahr Café'), plan('kennzahlen', 'Die Besucher haben sich verdoppelt', { inhalt: '12.400 Besucher 2022, 25.300 Besucher 2024' }), plan('bild', 'So sieht es bei uns aus'), plan('liste', 'Was wir vorhaben'), plan('abschluss', 'Kommt vorbei')];
  const r = M.sichereMaterial(folien, MAT.slice(0, 2), { eigeneFotos: true });
  gleich(r.folien.length, 5, 'keine zusätzliche Folie');
  gleich(r.folien.map(f => [f.form, f.material || '']), [['titel', ''], ['tabelle', 'M2'], ['bild', 'M1'], ['liste', ''], ['abschluss', '']]);
  gleich(r.folien[1].kernaussage, 'Die Besucher haben sich verdoppelt', 'die Aussage der KI bleibt');
  assert(r.aenderungen.every(a => a.includes('die schon davon handelt')), r.aenderungen.join(' | '));
  /* Nur eine Zahl gemeinsam: das reicht nicht, die Tabelle bekommt eine eigene Folie */
  const knapp = M.sichereMaterial([plan('titel', 'T'), plan('kennzahlen', 'Ein Jahr', { inhalt: '2022 war gut' }), plan('abschluss', 'A')], [MAT[1]], { eigeneFotos: true });
  gleich(knapp.folien.map(f => f.form), ['titel', 'kennzahlen', 'tabelle', 'abschluss']);
  /* Eingefügte Bildfolie: Aussage des Bildes statt reiner Beschreibung */
  const bild = M.sichereMaterial([plan('titel', 'T'), plan('abschluss', 'A')], [{ ...MAT[0], notiz: '', aussage: 'Hinter dem Tresen steht ein eingespieltes Team' }], { eigeneFotos: true });
  gleich(bild.folien[1].kernaussage, 'Hinter dem Tresen steht ein eingespieltes Team');
  gleich([M.formFuer(MAT[0]), M.formFuer(MAT[1]), M.formFuer(MAT[2]), M.formFuer({ art: 'text', text: '„Bester Kaffee am Markt“ – Google-Bewertung' })], ['bild', 'tabelle', 'liste', 'zitat']);
});
test('Material: Formen passen zum Material, ohne Fotos keine leere Bildfolie, lange Tabellen über mehrere Folien', () => {
  const lang = { ...MAT[1], tabelle: { kopf: ['A', 'B'], zeilen: Array.from({ length: 20 }, (_, i) => [`Z${i}`, String(i)]) } };
  const folien = [plan('titel', 'Titel'), plan('kernsatz', 'Hier ist das Bild', { material: 'M1' }), plan('tabelle', 'Erfundene Tabelle'), plan('liste', 'Die Zahlen', { material: 'M2' }), plan('bild', 'Bild ohne Bild'), plan('abschluss', 'Ende')];
  const r = M.sichereMaterial(folien, [MAT[0], lang], { eigeneFotos: false });
  gleich(r.folien.map(f => f.form), ['titel', 'bild', 'liste', 'tabelle', 'tabelle', 'kernsatz', 'abschluss']);
  gleich(r.folien.map(f => f.bild), [false, true, false, false, false, false, false], 'Bildlayouts nur für das Bild der Person');
  gleich([r.folien[3].teil, r.folien[3].teile, r.folien[4].teil, r.folien[4].material], [1, 2, 2, 'M2']);
  assert(r.folien[4].kernaussage.includes('Teil 2 von 2'), r.folien[4].kernaussage);
  const ohne = M.sichereMaterial([plan('titel', 'T'), plan('liste', 'L', { material: 'M77' }), plan('abschluss', 'A')], [], {});
  gleich([ohne.folien.length, ohne.folien[1].material], [3, undefined]);
  assert(ohne.aenderungen[0].includes('M77'), 'unbekanntes Material wird gemeldet');
});
test('Material: Wo steht welches Material?', () => {
  const spec = { folien: [{ layoutId: 'title', inhalt: {} }, { layoutId: 'image-left', inhalt: { image: 'material-kfoto' } }, { layoutId: 'content-bullets', inhalt: {}, material: 'M2', tabelle: TABELLE }, { layoutId: 'content-bullets', inhalt: {}, material: 'M2', tabelle: TABELLE }] };
  gleich(M.materialOrte(spec, MAT), { M1: [2], M2: [3, 4] });
});

/* ---------- Tabellenfolien ---------- */
test('Tabelle: Fläche des Layouts, Eignung und Layoutwahl', async () => {
  const sys = await system('demo-corporate'), l = id => sys.layout(id);
  gleich(tabellenFlaeche(l('content-bullets')), { x: 6, y: 29, w: 86, h: 57, ids: ['bullets'] });
  gleich(tabellenFlaeche(l('two-column')).ids, ['leftTitle', 'leftBullets', 'rightTitle', 'rightBullets']);
  gleich([tabellenFlaeche(l('statement')), tabellenFlaeche(l('quote'))], [null, null], 'keine große Inhaltsfläche');
  gleich(['content-bullets', 'image-left', 'quote', 'title', 'closing'].map(id => eignung(l(id), sys, 'tabelle')), [1, 0, 0, 0, 0], 'Eignung');
  const wahl = waehleLayouts([{ form: 'titel' }, { form: 'liste' }, { form: 'tabelle' }, { form: 'tabelle' }, { form: 'abschluss' }], sys);
  gleich(wahl.map(w => w.layoutId).slice(2, 4), ['content-bullets', 'content-bullets'], 'Fortsetzung behält das Layout');
});
test('Tabelle: Folie ist gültig, die Tabelle füllt die Inhaltsfläche, Zahlen rechtsbündig', async () => {
  const sys = await system('demo-corporate');
  const spec = { titel: 'x', folien: [{ layoutId: 'content-bullets', inhalt: { title: 'Die Besucher haben sich verdoppelt' }, tabelle: TABELLE }] };
  gleich(validateSpec(spec, sys).errors, [], 'Stichpunkte dürfen fehlen, die Tabelle belegt die Fläche');
  const el = buildSlides(spec, sys)[0].elemente, t = el.find(e => e.art === 'tabelle');
  assert(t && !el.some(e => e.ph === 'bullets'), 'Tabelle statt Stichpunkte');
  gleich([t.x, t.y, t.kopf, t.zellen.length, t.spalten.map(s => s.align)], [6, 29, true, 4, ['left', 'right', 'right']]);
  assert(t.x + t.w <= 92.01 && t.y + t.h <= 86.01, `in der Fläche: ${JSON.stringify([t.x, t.y, t.w, t.h])}`);
  assert(t.pt <= 18 && t.pt >= 9 && !t.gekuerzt, `Schrift ${t.pt}`);
  assert(Math.abs(t.spalten.reduce((s, x) => s + x.w, 0) - t.w) < 0.1, 'Spaltenbreiten ergeben die Tabellenbreite');
  const html = slideHTML(buildSlides(spec, sys)[0]);
  assert(html.includes('<table>') && html.includes('<th style="text-align:left;">Jahr</th>') && html.includes('<td style="text-align:right;">25.300</td>'), 'HTML-Tabelle');
  const fremd = validateSpec({ titel: 'x', folien: [{ layoutId: 'quote', inhalt: { quote: 'Zitat' }, tabelle: TABELLE }] }, sys).errors;
  assert(fremd.some(e => e.includes('keinen Platz für die Tabelle')), fremd.join(' | '));
  const k = kuerzeSpec({ titel: 'x', folien: [{ layoutId: 'content-bullets', inhalt: { title: 'T' }, tabelle: TABELLE, material: 'M2' }] }, sys);
  gleich([k.spec.folien[0].inhalt.bullets, k.spec.folien[0].tabelle, k.spec.folien[0].material], [undefined, TABELLE, 'M2'], 'keine Lücke über der Tabelle');
});
test('Tabelle: große Tabelle wird kleiner gesetzt, was nicht passt, wird markiert', async () => {
  const sys = await system('demo-hell');
  const viel = { kopf: ['Monat', 'Gäste', 'Umsatz', 'Bewertung'], zeilen: Array.from({ length: 12 }, (_, i) => [`Monat ${i + 1} mit einem längeren Namen`, String(1000 + i * 37), `${10 + i},50 €`, '4,5 von 5']) };
  const t = buildSlides({ titel: 'x', folien: [{ layoutId: 'content-bullets', inhalt: { title: 'Ein Jahr in Zahlen' }, tabelle: viel }] }, sys)[0].elemente.find(e => e.art === 'tabelle');
  assert(t.pt < 18 && t.zellen.length === 13 && !t.gekuerzt, `zwölf Zeilen passen verkleinert: ${t.pt} pt`);
  const riesig = { kopf: ['A'], zeilen: Array.from({ length: 60 }, (_, i) => [`Zeile ${i}`]) };
  const r = buildSlides({ titel: 'x', folien: [{ layoutId: 'content-bullets', inhalt: { title: 'Zu viel' }, tabelle: { kopf: ['A', 'B'], zeilen: riesig.zeilen.map(z => [z[0], '1']) } }] }, sys)[0].elemente.find(e => e.art === 'tabelle');
  assert(r.gekuerzt && r.zellen.length < 61 && r.pt === 9, 'abgeschnitten und markiert');
});
test('Tabelle: PowerPoint bekommt eine echte Tabelle mit Spaltenbreiten und Linien', async () => {
  const sys = await system('demo-corporate'), aufrufe = [];
  const folie = { addShape() {}, addImage() {}, addText() {}, addNotes() {}, addTable: (zeilen, o) => aufrufe.push({ zeilen, o }) };
  function FakePptx() { return { addSlide: () => folie, ShapeType: { rect: 'rect', ellipse: 'ellipse', line: 'line', roundRect: 'roundRect' } }; }
  await exportPptx(buildSlides({ titel: 'x', folien: [{ layoutId: 'content-bullets', inhalt: { title: 'T' }, tabelle: TABELLE }] }, sys), { PptxGenJS: FakePptx });
  gleich(aufrufe.length, 1);
  const { zeilen, o } = aufrufe[0];
  gleich([zeilen.length, zeilen[0][0].text, zeilen[0][0].options.bold, zeilen[1][1].options.align, o.colW.length, o.rowH.length], [4, 'Jahr', true, 'right', 3, 4]);
  assert(o.margin.every(v => v >= 1) && o.fontSize === buildSlides({ titel: 'x', folien: [{ layoutId: 'content-bullets', inhalt: { title: 'T' }, tabelle: TABELLE }] }, sys)[0].elemente.find(e => e.art === 'tabelle').pt, 'Abstände in Punkt, gleiche Schriftgröße wie die Vorschau');
  gleich(zeilen[0][0].options.border[2].pt, 1.5, 'Linie unter dem Kopf');
});

/* ---------- Pipeline mit Material ---------- */
test('Material in der Gliederung: Feld material, Form tabelle nur mit Tabelle, fehlende Folien ergänzt', async () => {
  const p = await prompts(), sys = M.mitMaterial(await system('demo-corporate'), MAT, () => 'data:,');
  const schema = P.outlineSchema(sys, 5, MAT), item = schema.properties.folien.items;
  gleich(item.properties.material.enum, ['', 'M1', 'M2', 'M3']);
  assert(item.properties.form.enum.includes('tabelle') && item.required.includes('material'), 'mit Tabelle');
  assert(!P.outlineSchema(sys, 5, [MAT[0]]).properties.folien.items.properties.form.enum.includes('tabelle'), 'ohne Tabelle keine Form tabelle');
  assert(!P.outlineSchema(sys, 5).properties.folien.items.properties.material, 'ohne Material kein Feld');
  const ki = kiMit([{ titel: 'Café am Markt', storyline: 'S', kernbotschaft: 'K', folien: [
    { abschnitt: 'A', form: 'titel', betont: false, kernaussage: 'Ein Jahr Café am Markt', inhalt: 'Titel', material: '' },
    { abschnitt: 'A', form: 'kernsatz', betont: true, kernaussage: 'Die Besucher haben sich verdoppelt', inhalt: '12.400 auf 25.300', material: '' },
    { abschnitt: 'A', form: 'liste', betont: false, kernaussage: 'So erreicht man uns', inhalt: 'Öffnungszeiten', material: 'M3' },
    { abschnitt: 'A', form: 'abschluss', betont: false, kernaussage: 'Kommt vorbei', inhalt: 'Einladung', material: '' }] }]);
  const o = await P.erstelleOutline(ki, p, BRIEFING, sys, { materialien: MAT });
  assert(ki.anfragen[0].prompt.includes('M2 (Tabelle „Besucher.xlsx“'), 'Material steht im Prompt');
  const bei = id => o.outline.folien.find(f => f.material === id);
  gleich([bei('M1').form, sys.layout(bei('M1').layoutId).typ.startsWith('image'), bei('M2').form, bei('M2').layoutId, bei('M3').form], ['bild', true, 'tabelle', 'content-bullets', 'liste']);
  assert(o.outline.folien.every(f => !('bild' in f)), 'Hilfsfeld bild bleibt intern');
  assert(o.aenderungen.filter(a => a.includes('keine Folie geplant')).length === 2, o.aenderungen.join(' | '));
});
test('Material auf der Folie: Tabelle und Bild setzt die App, Zahlen aus dem Material gelten als belegt', async () => {
  const p = await prompts(), sys = M.mitMaterial(await system('demo-corporate'), MAT, () => 'data:,');
  const outline = { titel: 'Café', folien: [
    { abschnitt: 'A', form: 'titel', layoutId: 'title', kernaussage: 'Titel', inhalt: '' },
    { abschnitt: 'A', form: 'tabelle', layoutId: 'content-bullets', kernaussage: 'Die Besucher haben sich verdoppelt', inhalt: '', material: 'M2' },
    { abschnitt: 'A', form: 'bild', layoutId: 'image-left', kernaussage: 'Unser Team', inhalt: '', material: 'M1' }] };
  const ki = kiMit([a => { assert(!a.schema.properties.inhalt.properties.bullets, 'keine Stichpunkte im Antwortformat'); return { inhalt: { title: 'Von 12.400 auf 25.300 Besucher in zwei Jahren' }, notizen: 'Zahlen aus der Tabelle.' }; }]);
  const r = await P.erstelleFolie(ki, p, { briefing: BRIEFING, outline, index: 1, system: sys, materialien: MAT });
  assert(ki.anfragen[0].prompt.includes('2024 | 25.300 | 2,4 Mio. €') && ki.anfragen[0].prompt.includes('Die Besucher haben sich verdoppelt'), 'Tabelle steht im Prompt');
  gleich([r.folie.tabelle, r.folie.material, r.versuche, r.pruefen], [TABELLE, 'M2', 1, []], 'gültig im ersten Versuch, Zahlen belegt');
  const ki2 = kiMit([a => { assert(!a.schema.properties.inhalt.properties.image, 'Bild nicht im Antwortformat'); assert(a.prompt.includes('Vier Menschen an einem Tresen'), 'Beschreibung im Prompt'); return { inhalt: { title: 'Vier Menschen, ein Tresen', bullets: ['Wir kennen unsere Gäste beim Namen'] }, notizen: 'Team vorstellen.' }; }]);
  const b = await P.erstelleFolie(ki2, p, { briefing: BRIEFING, outline, index: 2, system: sys, materialien: MAT });
  gleich([b.folie.inhalt.image, b.folie.material], ['material-kfoto', 'M1']);
  gleich(validateSpec({ titel: 'x', folien: [r.folie, b.folie] }, sys).errors, []);
});
test('Material im ganzen Lauf: jedes Stück steht auf einer Folie, das Protokoll sagt wo', async () => {
  const p = await prompts(), sys = M.mitMaterial(await system('demo-corporate'), MAT, () => 'data:,');
  const folie = a => { const ph = a.schema.properties.inhalt.properties, inhalt = {};
    Object.entries(ph).forEach(([k, v]) => { inhalt[k] = v.type === 'array' ? (v.items.type === 'object' ? [{ [Object.keys(v.items.properties)[0]]: 'Eintrag' }, { [Object.keys(v.items.properties)[0]]: 'Eintrag' }] : ['Ein Punkt']) : v.enum ? v.enum[0] : 'Kurzer Text'; });
    return { inhalt, notizen: 'N' }; };
  const ki = kiMit([{ titel: 'Café', storyline: 'S', kernbotschaft: 'K', folien: [
    { abschnitt: 'A', form: 'titel', betont: false, kernaussage: 'Titel', inhalt: 'T', material: '' },
    { abschnitt: 'A', form: 'liste', betont: false, kernaussage: 'Zeiten', inhalt: 'Z', material: 'M3' },
    { abschnitt: 'A', form: 'abschluss', betont: false, kernaussage: 'Ende', inhalt: 'E', material: '' }] }, ...Array(5).fill(folie)]);
  const r = await P.erstellePraesentation(ki, p, BRIEFING, sys, { materialien: MAT });
  gleich(r.errors, []);
  const orte = M.materialOrte(r.spec, MAT);
  assert(orte.M1 && orte.M2 && orte.M3, JSON.stringify(orte));
  MAT.forEach(m => assert(r.protokoll.some(t => t.includes(`„${m.name}“ steht auf Folie`)), m.name));
});
test('Briefing mit Material: belegte Punkte werden nicht gefragt, neues Material stellt die Frage neu', async () => {
  const p = await prompts(), B = P.neuesBriefing('Ich berichte dem Vorstand über ein Jahr Café am Markt.');
  const ki = kiMit([
    { art: 'bericht', thema: 'Ein Jahr Café' },
    a => { assert(a.prompt.includes('M2 (Tabelle'), 'Material im Startprompt'); return { vorbefuellt: [{ feld: 'zahlen', wert: 'Besucher: 2022 12.400, 2024 25.300', status: 'bestaetigt' }], schwerpunkte: ['ergebnisse'], unwichtig: [], erste_frage: { feld: 'stand', frage: 'Wie steht das Café heute da?', vorschlaege: [] } }; }
  ]);
  await P.briefingStart(ki, p, B, '', { material: M.materialListe(MAT) });
  const zahlen = B.felder.find(f => f.id === 'zahlen');
  gleich([zahlen.gefragt, zahlen.ausMaterial], [true, true], 'aus dem Material belegt, wird nicht gefragt');
  assert(!P.kandidaten(B).includes('zahlen'), 'kein Kandidat mehr');
  /* Neues Material mitten im Gespräch: die offene Frage wird neu gestellt und zählt nicht */
  const gefragt = B.gefragt, aktuell = B.aktuell.feld;
  const ki2 = kiMit([a => { assert(a.prompt.includes('NEUES MATERIAL') && a.prompt.includes('Öffnungszeiten'), a.prompt.slice(0, 200)); return { updates: [], naechste_frage: { feld: aktuell, frage: 'Seit Kurzem gibt es Frühstück ab 7:30 Uhr. Wie läuft es?', vorschlaege: ['Gut', 'Schleppend'] } }; }]);
  await P.briefingMaterial(ki2, p, B, M.materialListe([MAT[2]]), M.materialListe(MAT.slice(0, 2)));
  gleich([B.gefragt, B.aktuell.feld, B.aktuell.frage], [gefragt, aktuell, 'Seit Kurzem gibt es Frühstück ab 7:30 Uhr. Wie läuft es?']);
  /* Beantwortet das Material die offene Frage, kommt die nächste */
  const offen = B.aktuell.feld;
  P.wendeMaterialAn(B, { updates: [{ feld: offen, wert: 'Das Café läuft seit drei Jahren am Markt', status: 'bestaetigt' }], naechste_frage: { feld: 'probleme', frage: 'Was hakt noch?', vorschlaege: [] } }, 'Das Café läuft seit drei Jahren am Markt.');
  assert(B.aktuell.feld !== offen && B.felder.find(f => f.id === offen).gefragt, `nächste Frage: ${JSON.stringify(B.aktuell)}`);
  /* Nur vermutet (annahme) oder nicht im Material belegt: bleibt offen */
  const B2 = P.neuesBriefing('x'); P.setzeArt(B2, 'bericht', p.arten);
  P.wendeMaterialAn(B2, { updates: [{ feld: 'probleme', wert: 'Personal fehlt', status: 'bestaetigt' }], naechste_frage: {} }, 'Tabelle mit Besucherzahlen');
  assert(!B2.felder.find(f => f.id === 'probleme').gefragt, 'nicht im Material: wird noch bestätigt');
});
test('Briefing mit Material: Bestätigtes bleibt, Thema und Umfang sind tabu, aussortierte Punkte leben wieder auf', async () => {
  const p = await prompts(), B = P.neuesBriefing('x');
  P.setzeArt(B, 'entscheidung', p.arten);
  const f = id => B.felder.find(x => x.id === id);
  Object.assign(f('umfang'), { wert: '10 Minuten', status: 'bestaetigt' });
  Object.assign(f('entscheidung'), { wert: 'Frühstück ab Herbst', status: 'bestaetigt', vorbefuellt: true });
  Object.assign(f('daten'), { wert: '', status: 'uebersprungen', unwichtig: true });
  B.aktuell = { feld: 'entscheidung', frage: 'Was genau soll entschieden werden?', vorschlaege: [], art: 'neu' };
  const material = M.materialListe([{ id: 'M3', art: 'tabelle', name: 'Gäste', notiz: '', tabelle: { kopf: ['Monat', 'Gäste'], zeilen: [['Januar', '2.150'], ['Juni', '4.420']] } }]);
  P.wendeMaterialAn(B, { updates: [
    { feld: 'umfang', wert: 'Januar: 2.150 Gäste', status: 'bestaetigt' },
    { feld: 'entscheidung', wert: 'Mehr Gäste', status: 'bestaetigt' },
    { feld: 'daten', wert: 'Januar 2.150 Gäste, Juni 4.420 Gäste', status: 'bestaetigt' }
  ], naechste_frage: { feld: 'optionen', frage: 'Die Gästezahl hat sich verdoppelt. Welche Alternativen zum Frühstück gibt es?', vorschlaege: ['Nichts tun'] } }, material);
  gleich([f('umfang').wert, f('entscheidung').wert], ['10 Minuten', 'Frühstück ab Herbst'], 'nichts überschrieben');
  gleich([f('daten').status, f('daten').wert, f('daten').gefragt, f('daten').unwichtig], ['bestaetigt', 'Januar 2.150 Gäste, Juni 4.420 Gäste', true, false], 'Daten wieder im Briefing, aus dem Material belegt');
  gleich([B.aktuell.feld, B.aktuell.frage], ['optionen', 'Die Gästezahl hat sich verdoppelt. Welche Alternativen zum Frühstück gibt es?'], 'Frage mit Bezug auf das Material');
  assert(P.kandidaten(B).includes('entscheidung'), 'die zurückgestellte Kernfrage kommt später');
});
