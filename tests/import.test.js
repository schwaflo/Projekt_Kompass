import { test, assert, gleich, meldet, env } from './harness.js';
import { loadPackage, fnSource } from '../praesentation/registry.js';
import { schlageAssetVor } from '../praesentation/assets.js';
import { ladePaket, paketAusZip, zipAusSystem, kopiereSystem, fuegeDateiHinzu, freieId } from '../praesentation/pakete.js';
import { parseTheme, parseFlaeche, entwurfAus, importPptx } from '../praesentation/import-pptx.js';
import { validateSpec } from '../praesentation/spec.js';
import { buildSlides } from '../praesentation/layout.js';

const imBrowser = typeof document !== 'undefined';
const nurBrowser = name => name + (imBrowser ? '' : ' (übersprungen, nur im Browser)');
/* Im Browser liegen die Dateien eine Ebene über tests/ */
const system = async id => (await loadPackage(fnSource({ readText: p => env.readText(`design-systems/${id}/${p}`), url: p => `../design-systems/${id}/${p}` }), id)).system;

/* ---------- Asset-Erkennung ---------- */
test('Assets: Rolle aus Dateiname, Format, Seitenverhältnis und Transparenz', () => {
  const r = (pfad, breite, hoehe, extra = {}) => schlageAssetVor({ pfad, breite, hoehe, ...extra }).role;
  gleich(r('assets/firma-logo.png', 600, 160), 'logo-primary');
  gleich(r('assets/Logo_weiss.svg', 600, 160), 'logo-negative');
  gleich(r('assets/logo-negativ.png', 600, 160), 'logo-negative');
  gleich(r('assets/signet.svg', 256, 256), 'logo-icon');
  gleich(r('assets/marke.png', 400, 110, { transparent: true }), 'logo-primary', 'kleines transparentes PNG ohne Hinweis im Namen');
  gleich(r('assets/marke.png', 400, 110, { transparent: true, hell: true }), 'logo-negative', 'helles Motiv');
  gleich(r('assets/team-werkstatt.jpg', 1920, 1080), 'hero-image');
  gleich(r('assets/mitarbeiterin.jpg', 1200, 1800), 'portrait-image');
  gleich(r('assets/produkt.png', 1200, 1150), 'square-image');
  gleich(r('assets/foto-freigestellt.png', 2400, 1600, { transparent: true }), 'hero-image', 'großes transparentes Foto ist kein Logo');
});

test('Assets: ID, Tags und Beschreibung aus dem Dateinamen, IDs bleiben eindeutig', () => {
  const a = schlageAssetVor({ pfad: 'assets/images/Team_Werkstatt-final.JPG', breite: 1920, hoehe: 1080 }, ['team-werkstatt']);
  gleich([a.id, a.beschreibung, a.verwendung], ['team-werkstatt-2', 'Team werkstatt', ['image-full']]);
  assert(a.tags.includes('querformat') && a.tags.includes('team') && a.tags.includes('werkstatt') && !a.tags.includes('final'));
  assert(a.grund.includes('Querformat'));
  gleich(schlageAssetVor({ pfad: 'x/logo.svg', breite: 600, hoehe: 160 }).id, 'logo-primary', 'Logos bekommen die Rolle als ID');
  gleich(freieId('Mein Büro-Design!', ['mein-buero-design']), 'mein-buero-design-2');
});

/* ---------- ZIP ---------- */
test(nurBrowser('ZIP: Export und erneuter Import ergeben dasselbe Designsystem'), async () => {
  if (!imBrowser) return;
  const sys = await system('demo-hell'), blob = await zipAusSystem(sys, window.JSZip);
  const r = await paketAusZip(blob, window.JSZip);
  gleich(r.errors, []); gleich(r.vorschlaege, []);
  const neu = await ladePaket(r.paket);
  gleich(neu.errors, []); gleich(neu.warnings, []);
  gleich(neu.system.layouts.map(l => l.id), sys.layouts.map(l => l.id));
  assert(neu.system.voice === sys.voice && neu.system.assetUrl('logo-primary').startsWith('data:image/svg+xml'));
  gleich(buildSlides({ titel: 'T', folien: [{ layoutId: 'title', inhalt: { title: 'Hallo' } }] }, neu.system)[0].elemente.find(e => e.logo).assetId, 'logo-primary');
});

test(nurBrowser('ZIP: Bild ohne Eintrag im Manifest bekommt einen Vorschlag; neuer Ordner ist ohne Codeänderung nutzbar'), async () => {
  if (!imBrowser) return;
  const sys = await system('demo-hell'), zip = await window.JSZip.loadAsync(await zipAusSystem(sys, window.JSZip));
  const m = JSON.parse(await zip.file('demo-hell/design-system.json').async('string')); m.meta.id = 'kanzlei'; m.meta.name = 'Kanzlei';
  zip.file('demo-hell/design-system.json', JSON.stringify(m));
  zip.file('demo-hell/assets/images/besprechung-team.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#888"/></svg>');
  const r = await paketAusZip(await zip.generateAsync({ type: 'blob' }), window.JSZip);
  gleich(r.vorschlaege.map(v => [v.id, v.role]), [['besprechung-team', 'hero-image']]);
  const neu = await ladePaket(r.paket);
  gleich(neu.errors, []); gleich(neu.system.id, 'kanzlei');
  gleich(validateSpec({ titel: 'T', folien: [{ layoutId: 'image-full', inhalt: { title: 'Bild', image: 'besprechung-team' } }] }, neu.system).errors, [], 'das neue Bild ist sofort wählbar');
});

test(nurBrowser('ZIP: verständliche Fehler bei kaputten Paketen'), async () => {
  if (!imBrowser) return;
  meldet((await paketAusZip(new Blob(['kein zip']), window.JSZip)).errors, 'kein lesbares ZIP-Archiv');
  const leer = new window.JSZip(); leer.file('readme.txt', 'x');
  meldet((await paketAusZip(await leer.generateAsync({ type: 'blob' }), window.JSZip)).errors, 'fehlt die Datei design-system.json');
  const halb = new window.JSZip(); halb.file('x/design-system.json', JSON.stringify({ schemaVersion: '1.0', meta: { id: 'x', name: 'X', beschreibung: '', version: '1', tags: [] } }));
  const r = await ladePaket((await paketAusZip(await halb.generateAsync({ type: 'blob' }), window.JSZip)).paket);
  assert(!r.ok); meldet(r.errors, 'tokens: fehlt');
});

test(nurBrowser('Editor: Kopie anlegen, Logo per Rolle ersetzen, weiteres Bild ergänzen'), async () => {
  if (!imBrowser) return;
  const p = await kopiereSystem(await system('demo-corporate'), 'meine-firma', 'Meine Firma');
  gleich((await ladePaket(p)).errors, []);
  const svg = (w, h) => new File([`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/></svg>`], 'Unser Logo weiß.svg', { type: 'image/svg+xml' });
  const alt = p.manifest.assets.find(a => a.id === 'logo-negative').file;
  const r = await fuegeDateiHinzu(p, svg(600, 160), 'logo-negative');
  assert(r.ersetzt && r.asset.id === 'logo-negative' && r.asset.file === 'assets/logos/unser-logo-wei-.svg' || r.asset.file.startsWith('assets/logos/unser-logo'), r.asset.file);
  assert(!(alt in p.dateien), 'alte Datei wird entfernt');
  gleich(p.manifest.assets.length, 6);
  const foto = await fuegeDateiHinzu(p, new File(['<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1400"><rect width="900" height="1400" fill="#456"/></svg>'], 'werkbank.svg', { type: 'image/svg+xml' }));
  assert(!foto.ersetzt && p.manifest.assets.length === 7);
  const neu = await ladePaket(p);
  gleich(neu.errors, []); gleich(neu.system.id, 'meine-firma');
  let fehler = ''; try { await fuegeDateiHinzu(p, new File(['x'], 'notiz.txt')); } catch (e) { fehler = e.message; }
  assert(fehler.includes('ist kein Bild'));
});

/* ---------- Import aus PowerPoint ---------- */
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const THEME = `<a:theme ${NS} name="Kanzlei"><a:themeElements><a:clrScheme name="Kanzlei Farben">
  <a:dk1><a:sysClr val="windowText" lastClr="111111"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
  <a:dk2><a:srgbClr val="1F3A2E"/></a:dk2><a:lt2><a:srgbClr val="F3F1EC"/></a:lt2>
  <a:accent1><a:srgbClr val="2E7D5B"/></a:accent1><a:accent2><a:srgbClr val="C8963E"/></a:accent2><a:accent3><a:srgbClr val="7A8F99"/></a:accent3>
  <a:accent4><a:srgbClr val="A3432B"/></a:accent4><a:accent5><a:srgbClr val="4C6FA5"/></a:accent5><a:accent6><a:srgbClr val="8B6FB3"/></a:accent6>
  </a:clrScheme><a:fontScheme name="Kanzlei"><a:majorFont><a:latin typeface="Cambria"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;
const sp = (typ, idx, x, y, cx, cy) => `<p:sp><p:nvSpPr><p:cNvPr id="${idx + 2}" name="${typ}"/><p:cNvSpPr/><p:nvPr><p:ph type="${typ}" idx="${idx}"/></p:nvPr></p:nvSpPr><p:spPr>${cx ? `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` : ''}</p:spPr></p:sp>`;
const flaeche = (tag, typ, name, inhalt, extra = '') => `<p:${tag} ${NS}${typ ? ` type="${typ}"` : ''}><p:cSld name="${name}">${extra}<p:spTree>${inhalt}</p:spTree></p:cSld>${tag === 'sldMaster' ? '<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4000"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle></p:txStyles>' : ''}</p:${tag}>`;
const W = 12192000, H = 6858000;
const MASTER = flaeche('sldMaster', '', 'Master', sp('title', 0, 838200, 365125, 10515600, 1325563) + sp('body', 1, 838200, 1825625, 10515600, 4351338));
const L_TITEL = flaeche('sldLayout', 'title', 'Titelfolie', sp('ctrTitle', 0, 1524000, 1122363, 9144000, 2387600) + sp('subTitle', 1, 1524000, 3602038, 9144000, 1655762), '<p:bg><p:bgPr><a:solidFill><a:schemeClr val="tx2"/></a:solidFill></p:bgPr></p:bg>');
const L_INHALT = flaeche('sldLayout', 'obj', 'Titel und Inhalt', sp('title', 0) + sp('body', 1));
const L_ZWEI = flaeche('sldLayout', 'twoObj', 'Zwei Inhalte', sp('title', 0) + sp('body', 1, 838200, 1825625, 5181600, 4351338) + sp('body', 2, 6172200, 1825625, 5181600, 4351338));
const L_LEER = flaeche('sldLayout', 'blank', 'Leer', '');

test(nurBrowser('PowerPoint-Import: Theme-Farben und Schriften'), () => {
  if (!imBrowser) return;
  const t = parseTheme(THEME);
  gleich([t.farben.dk1, t.farben.lt1, t.farben.dk2, t.farben.accent2, t.ueberschrift, t.text], ['#111111', '#FFFFFF', '#1F3A2E', '#C8963E', 'Cambria', 'Calibri']);
  const m = parseFlaeche(MASTER, { cx: W, cy: H });
  gleich([m.titelPt, m.textPt, m.platzhalter.length], [40, 28, 2]);
  gleich(parseFlaeche(L_ZWEI, { cx: W, cy: H }).platzhalter[1], { typ: 'body', idx: '1', x: 6.9, y: 26.6, w: 42.5, h: 63.4 });
});

test(nurBrowser('PowerPoint-Import: Datei → gültiger Entwurf mit Layouts aus der Vorlage und ergänzten Layouts'), async () => {
  if (!imBrowser) return;
  const zip = new window.JSZip();
  zip.file('ppt/presentation.xml', `<p:presentation ${NS}><p:sldSz cx="${W}" cy="${H}"/></p:presentation>`);
  zip.file('ppt/theme/theme1.xml', THEME); zip.file('ppt/slideMasters/slideMaster1.xml', MASTER);
  [L_TITEL, L_INHALT, L_ZWEI, L_LEER].forEach((l, i) => zip.file(`ppt/slideLayouts/slideLayout${i + 1}.xml`, l));
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', '<Relationships><Relationship Id="rId9" Type="image" Target="../media/image1.svg"/></Relationships>');
  zip.file('ppt/media/image1.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120"><text y="80" font-size="60">Kanzlei</text></svg>');
  const datei = new File([await zip.generateAsync({ type: 'blob' })], 'Kanzlei_Vorlage.potx');
  const basis = await system('demo-hell');
  const r = await importPptx(datei, window.JSZip, { basis, vergebeneIds: ['kanzlei-vorlage'] });
  const m = r.paket.manifest, C = m.tokens.colors;
  gleich([m.meta.id, m.meta.name], ['kanzlei-vorlage-2', 'Kanzlei Vorlage']);
  gleich([C.primary, C.secondary, C.accent, C.background, C.surface, C.text], ['#1F3A2E', '#2E7D5B', '#C8963E', '#FFFFFF', '#F3F1EC', '#111111']);
  gleich(C.chartPalette.length, 6);
  gleich([m.tokens.typography.headingFont, m.tokens.typography.bodyFont, m.tokens.typography.sizes.title], ['Cambria', 'Calibri', 40]);
  const titel = m.layouts.find(l => l.id === 'title');
  gleich([titel.background, titel.placeholders[0].style.color, titel.placeholders.map(p => p.id)], ['primary', 'onDark', ['title', 'subtitle']], 'dunkler Hintergrund aus dem Layout, heller Text');
  gleich(titel.placeholders[0].x, 12.5);
  gleich(m.layouts.find(l => l.id === 'two-column').placeholders.map(p => p.id), ['title', 'leftBullets', 'rightBullets']);
  gleich(m.layouts.find(l => l.id === 'content-bullets').placeholders[1].x, 6.9, 'Position aus dem Master geerbt');
  ['kpi-grid', 'timeline', 'quote', 'closing', 'image-full'].forEach(id => assert(m.layouts.some(l => l.id === id), `${id} wurde nicht ergänzt`));
  gleich(m.assets.map(a => [a.id, a.role]), [['logo-primary', 'logo-primary']], 'Logo aus dem Folienmaster');
  meldet(r.bericht, 'Aus der Vorlage übernommene Layouts: title, content-bullets, two-column');
  meldet(r.bericht, 'aus „Demo Hell“ ergänzt');
  const geladen = await ladePaket(r.paket);
  gleich(geladen.errors, []);
  /* dieselbe Beispielpräsentation lässt sich im importierten System rendern */
  const spec = JSON.parse(await env.readText('examples/demo.slides.json'));
  const folien = buildSlides(spec, geladen.system);
  gleich(folien.length, 10); assert(folien[0].background === '#1F3A2E' && folien[0].elemente.some(e => e.ph === 'title' && e.schrift === 'Arial'));
});

test(nurBrowser('PowerPoint-Import: verständliche Fehler'), async () => {
  if (!imBrowser) return;
  const versuch = async blob => { try { await importPptx(new File([blob], 'x.pptx'), window.JSZip, {}); return ''; } catch (e) { return e.message; } };
  assert((await versuch(new Blob(['x']))).includes('keine lesbare PowerPoint-Datei'));
  const z = new window.JSZip(); z.file('a.txt', 'x');
  assert((await versuch(await z.generateAsync({ type: 'blob' }))).includes('ppt/presentation.xml fehlt'));
  let fehler = ''; try { entwurfAus({ theme: parseTheme(THEME), master: parseFlaeche(MASTER, { cx: W, cy: H }), layouts: [parseFlaeche(L_LEER, { cx: W, cy: H })] }, {}); } catch (e) { fehler = e.message; }
  assert(fehler.includes('kein Layout'), fehler);
});
