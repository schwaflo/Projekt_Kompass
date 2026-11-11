import { test, assert, gleich, meldet, env } from './harness.js';
import { loadPackage, fnSource } from '../praesentation/registry.js';
import { validateSpec, kuerzeSpec, remapSpec, kuerze, inhaltsPlatzhalter } from '../praesentation/spec.js';
import { buildSlides, modellText } from '../praesentation/layout.js';
import { einpassen, zeilen } from '../praesentation/text.js';
import { slideHTML, FOLIEN_CSS } from '../praesentation/render-html.js';
import { exportPptx } from '../praesentation/render-pptx.js';

const DEMOS = ['demo-corporate', 'demo-hell'];
const imBrowser = typeof document !== 'undefined';
const system = async id => (await loadPackage(fnSource({ readText: p => env.readText(`design-systems/${id}/${p}`), url: p => `design-systems/${id}/${p}` }), id)).system;
const demoSpec = async () => JSON.parse(await env.readText('examples/demo.slides.json'));
const kopie = o => JSON.parse(JSON.stringify(o));

/* ---------- Slide-Spec prüfen ---------- */
for (const id of DEMOS) {
  test(`Slide-Spec: Demo-Präsentation ist gültig für ${id}`, async () => {
    gleich(validateSpec(await demoSpec(), await system(id)).errors, []);
  });
}

test('Slide-Spec: unbekanntes Layout wird abgelehnt, Meldung nennt die erlaubten', async () => {
  const s = await demoSpec(); s.folien[2].layoutId = 'agenda';
  const v = validateSpec(s, await system('demo-corporate'));
  assert(!v.ok); meldet(v.errors, 'Folie 3: Das Layout „agenda“ gibt es nicht. Erlaubt: title, section');
});

test('Slide-Spec: unbekannter Platzhalter und fehlender Pflichtinhalt', async () => {
  const s = await demoSpec(); s.folien[2].inhalt.fazit = 'x'; delete s.folien[2].inhalt.title;
  const v = validateSpec(s, await system('demo-corporate'));
  meldet(v.errors, 'Den Platzhalter „fazit“ gibt es in diesem Layout nicht');
  meldet(v.errors, 'title: Pflichtinhalt fehlt');
});

test('Slide-Spec: Zeichen- und Stichpunktlimits', async () => {
  const s = await demoSpec();
  s.folien[0].inhalt.title = 'x'.repeat(61);
  s.folien[2].inhalt.bullets = ['a', 'b', 'c', 'd', 'e', 'f'];
  s.folien[3].inhalt.kpis = [{ value: '1' }];
  s.folien[8].inhalt.steps[0].label = 'Ein viel zu langes Etikett';
  const v = validateSpec(s, await system('demo-corporate'));
  meldet(v.errors, '61 Zeichen, erlaubt sind höchstens 60');
  meldet(v.errors, '6 Stichpunkte, erlaubt sind höchstens 5');
  meldet(v.errors, '1 Einträge, nötig sind mindestens 2');
  meldet(v.errors, 'Eintrag 1, label: 26 Zeichen');
});

test('Slide-Spec: nur Bilder aus dem Designsystem, keine freien Pfade', async () => {
  const sys = await system('demo-corporate');
  for (const bild of ['https://example.com/foto.jpg', '../geheim.png', 'gibtsnicht']) {
    const s = await demoSpec(); s.folien[5].inhalt.image = bild;
    meldet(validateSpec(s, sys).errors, 'ist kein Bild aus dem Designsystem. Erlaubte IDs: hero, portrait, square');
  }
  const s = await demoSpec(); s.folien[5].inhalt.image = 'quadrat';
  gleich(validateSpec(s, sys).errors, [], 'Auswahl per Tag');
});

test('Fallback-Kürzung: macht jede Slide-Spec gültig und sagt, was geändert wurde', async () => {
  const sys = await system('demo-hell'), s = await demoSpec();
  s.folien[0].inhalt.title = 'Ein sehr langer Titel, der weit über das hinausgeht, was auf eine Titelfolie passt, und deshalb gekürzt werden muss';
  s.folien[1].layoutId = 'kapitel-neu';
  s.folien[2].inhalt.bullets = Array.from({ length: 9 }, (_, i) => `Punkt ${i + 1} ` + 'mit sehr viel Text '.repeat(10));
  s.folien[2].inhalt.fazit = 'passt nirgends hin';
  s.folien[3].inhalt.kpis.push({ value: '5' }, { value: '6' });
  s.folien[5].inhalt.image = 'C:/bilder/foto.jpg';
  assert(!validateSpec(s, sys).ok);
  const k = kuerzeSpec(s, sys);
  gleich(validateSpec(k.spec, sys).errors, []);
  assert(k.spec.folien[0].inhalt.title.endsWith('…') && k.spec.folien[0].inhalt.title.length <= 60);
  gleich(k.spec.folien[2].inhalt.bullets.length, 5);
  gleich(k.spec.folien[3].inhalt.kpis.length, 4);
  assert(!('image' in k.spec.folien[5].inhalt));
  gleich(k.spec.folien[1].layoutId, 'section', 'unbekanntes Layout: das mit den passenden Feldern');
  meldet(k.aenderungen, 'Layout „kapitel-neu“ unbekannt'); meldet(k.aenderungen, 'Stichpunkte entfernt'); meldet(k.aenderungen, '„fazit“ passt in kein Feld');
  gleich(k.spec.folien.length, s.folien.length, 'keine Folie geht verloren');
});

test('Fallback-Kürzung: fehlende Pflichtinhalte werden als Lücke markiert', async () => {
  const sys = await system('demo-corporate');
  const k = kuerzeSpec({ titel: 'T', folien: [{ layoutId: 'content-bullets', inhalt: { title: 'Nur ein Titel' } }, { layoutId: 'kpi-grid', inhalt: { title: 'Zahlen', kpis: [{ value: '7' }] } }] }, sys);
  gleich(validateSpec(k.spec, sys).errors, []);
  gleich(k.spec.folien[0].inhalt.bullets, ['[…]']);
  gleich(k.spec.folien[1].inhalt.kpis.length, 2);
  meldet(k.aenderungen, 'Pflichtinhalt fehlt, Lücke markiert');
});

test('kuerze: schneidet an der Wortgrenze', () => {
  gleich(kuerze('Rechnungen einsehen und herunterladen', 24), 'Rechnungen einsehen und…');
  gleich(kuerze('kurz', 24), 'kurz');
});

test('Designsystem wechseln: Layouts über den Typ, Inhalt bleibt erhalten', async () => {
  const von = await system('demo-corporate'), m = JSON.parse(await env.readText('design-systems/demo-hell/design-system.json'));
  /* drittes System mit eigenen Layout-IDs und ohne Zeitstrahl */
  m.meta.id = 'eigenes'; m.layouts = m.layouts.filter(l => l.id !== 'timeline').map(l => ({ ...l, typ: l.id, id: 'mein-' + l.id }));
  m.rules.logoAuf = ['mein-title', 'mein-closing'];
  m.assets.find(a => a.id === 'portrait').id = 'hochkant';
  const r = await loadPackage(fnSource({ readText: async p => p === 'design-system.json' ? JSON.stringify(m) : 'x' }), 'eigenes');
  gleich(r.errors, []);
  const spec = await demoSpec(), neu = remapSpec(spec, von, r.system);
  gleich(neu.folien.map(f => f.layoutId), ['mein-title', 'mein-section', 'mein-content-bullets', 'mein-kpi-grid', 'mein-two-column', 'mein-image-left', 'mein-quote', 'mein-image-full', 'mein-content-bullets', 'mein-closing']);
  gleich(neu.folien[5].inhalt.image, 'hochkant', 'Bild wird über die Rolle zugeordnet');
  gleich(neu.folien[2].inhalt, spec.folien[2].inhalt);
  assert(neu.folien[8].inhalt.steps.length === 4, 'Inhalt ohne passendes Feld bleibt in der Spec');
  gleich(buildSlides(neu, r.system).length, 10);
});

/* ---------- Textanpassung ---------- */
test('Textanpassung: verkleinert zuerst, kürzt erst danach', () => {
  const stil = { pt: 30, font: 'Arial', bold: true, lineHeight: 1.25 };
  gleich(einpassen([{ text: 'Kurzer Titel' }], 800, 80, stil).pt, 30);
  const mittel = einpassen([{ text: 'Ein Titel, der in voller Größe drei Zeilen bräuchte und deshalb etwas kleiner gesetzt wird, als es das Designsystem eigentlich vorsieht' }], 800, 80, stil);
  assert(mittel.pt < 30 && mittel.pt >= 18 && !mittel.gekuerzt, `pt ${mittel.pt}`);
  const lang = einpassen([{ text: 'Wort '.repeat(400).trim() }], 800, 80, stil);
  assert(lang.gekuerzt && lang.pt === 18 && lang.absaetze[0].text.endsWith('…'));
});

test('Textanpassung: lange Wörter brechen nicht mitten im Wort', () => {
  const r = einpassen([{ text: 'Zufriedenheitsbefragung' }], 130, 200, { pt: 18, font: 'Arial', lineHeight: 1.25 });
  assert(r.pt < 18 && zeilen('Zufriedenheitsbefragung', 130, r.pt, { font: 'Arial' }) === 1, `pt ${r.pt}`);
});

/* ---------- Folienmodell ---------- */
const FUELL = 'Die Bearbeitungszeit sinkt deutlich, weil Kundinnen und Kunden ihre Anliegen künftig selbst erledigen und das Team mehr Zeit für Beratung gewinnt. ';
const fuell = n => (FUELL.repeat(Math.ceil(n / FUELL.length))).slice(0, n).trim();

for (const id of DEMOS) {
  for (const schrift of ['system', 'marke']) {
    test(`Folienmodell: Demo passt ohne Kürzung in ${id} (${schrift === 'marke' ? 'Wunschschrift' : 'Systemschrift'})`, async () => {
      const folien = buildSlides(await demoSpec(), await system(id), { schrift });
      gleich(folien.length, 10);
      folien.forEach(f => f.elemente.filter(e => e.art === 'text').forEach(e => {
        assert(!e.gekuerzt, `Folie ${f.nr} ${e.ph}: gekürzt`);
        assert(e.pt >= e.sollPt * 0.9, `Folie ${f.nr} ${e.ph}: ${e.sollPt} → ${e.pt} pt`);
      }));
    });
  }

  test(`Folienmodell: voll ausgeschöpfte Zeichenlimits laufen in ${id} nicht über`, async () => {
    const sys = await system(id);
    const spec = { titel: fuell(40), folien: sys.layouts.map(l => ({ layoutId: l.id, inhalt: Object.fromEntries(inhaltsPlatzhalter(l).filter(p => p.typ !== 'image').map(p => [p.id,
      p.typ === 'text' ? fuell(p.maxChars) : p.typ === 'bullets' ? Array.from({ length: p.maxItems }, () => fuell(p.maxCharsPerItem)) : Array.from({ length: p.maxItems }, () => Object.fromEntries(p.felder.map(f => [f.id, fuell(f.maxChars)])))])) })) };
    gleich(validateSpec(spec, sys).errors, []);
    const probleme = buildSlides(spec, sys).flatMap(f => f.elemente.filter(e => e.gekuerzt).map(e => `${f.layoutId}/${e.ph}${e.feld ? '.' + e.feld : ''}`));
    gleich(probleme, [], 'gekürzte Texte');
  });

  test(`Folienmodell: Snapshot ${id}`, async () => {
    const ist = modellText(buildSlides(await demoSpec(), await system(id)));
    const soll = await env.readText(`tests/snapshots/${id}.txt`);
    assert(soll !== null, `tests/snapshots/${id}.txt fehlt`);
    if (ist.trim() !== soll.trim()) {
      const a = ist.trim().split('\n'), b = soll.trim().split('\n'), i = a.findIndex((z, n) => z !== b[n]);
      throw new Error(`weicht ab in Zeile ${i + 1}:\n   ist:  ${a[i]}\n   soll: ${b[i]}`);
    }
  });
}

test('Folienmodell: Seitenzahl, Fußzeile, Logo und Notizen', async () => {
  const f = buildSlides(await demoSpec(), await system('demo-corporate'));
  const t = (n, ph) => f[n].elemente.find(e => e.ph === ph);
  gleich(t(2, 'page').absaetze[0].text, '3');
  gleich(t(2, 'footer').absaetze[0].text, 'Neues Kundenportal');
  gleich(t(0, 'logo').assetId, 'logo-negative');
  gleich(t(0, 'meta').absaetze[0].text, 'LENKUNGSKREIS · 14. MAI · BEISPIELPRÄSENTATION', 'Großschreibung');
  assert(f[0].notizen.startsWith('Begrüßung'));
  gleich(t(0, 'title').schrift, 'Arial');
  gleich(buildSlides(await demoSpec(), await system('demo-corporate'), { schrift: 'marke' })[0].elemente.find(e => e.ph === 'title').schrift, 'Manrope');
});

test('Derselbe Inhalt sieht in beiden Designsystemen anders aus', async () => {
  const spec = await demoSpec(), [a, b] = await Promise.all(DEMOS.map(async id => buildSlides(spec, await system(id))));
  const texte = f => f.flatMap(x => x.elemente.filter(e => e.art === 'text' && !e.auto).map(e => e.absaetze.map(p => p.text.toLowerCase()).join('|'))).sort();
  gleich(texte(a), texte(b), 'gleicher Inhalt');
  assert(a[0].background !== b[0].background && modellText(a) !== modellText(b));
});

/* ---------- Vorschau und Export (nur im Browser) ---------- */
test('Vorschau: kein Text läuft im Browser über seine Fläche' + (imBrowser ? '' : ' (übersprungen, nur im Browser)'), async () => {
  if (!imBrowser) return;
  const css = Object.assign(document.createElement('style'), { textContent: FOLIEN_CSS }), box = Object.assign(document.createElement('div'), { style: 'position:absolute;left:-9999px;top:0;width:960px' });
  document.head.appendChild(css); document.body.appendChild(box);
  try {
    for (const id of DEMOS) {
      box.innerHTML = buildSlides(await demoSpec(), await system(id)).map(slideHTML).join('').replaceAll('src="design-systems/', 'src="../design-systems/');
      const ueber = [...box.querySelectorAll('.pf-t')].filter(e => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1).map(e => `${id} ${e.closest('.pf').dataset.layout}/${e.dataset.ph}`);
      gleich(ueber, []);
      gleich(box.querySelectorAll('.pf').length, 10);
    }
  } finally { box.remove(); css.remove(); }
});

test('Export: PowerPoint-Datei mit zehn Folien und bearbeitbarem Text' + (imBrowser ? '' : ' (übersprungen, nur im Browser)'), async () => {
  if (!imBrowser) return;
  assert(window.PptxGenJS && window.JSZip, 'vendor/pptxgen.bundle.js ist nicht geladen');
  const folien = buildSlides(await demoSpec(), await system('demo-hell'));
  const pptx = await exportPptx(folien, { PptxGenJS: window.PptxGenJS, titel: 'Test' });
  const zip = await window.JSZip.loadAsync(await pptx.write({ outputType: 'arraybuffer' }));
  gleich(Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, 10);
  const xml = await zip.file('ppt/slides/slide3.xml').async('string');
  assert(xml.includes('Das Portal löst die drei häufigsten Anliegen ohne Anruf'), 'Text steht als Text in der Datei');
  assert(xml.includes('typeface="Georgia"') && xml.includes('lIns="0"') && xml.includes('<a:buChar'));
  assert(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror').length === 0, 'XML ist wohlgeformt');
  assert((await zip.file('ppt/notesSlides/notesSlide1.xml').async('string')).includes('Begrüßung'), 'Sprechernotizen fehlen');
});
