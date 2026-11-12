import { test, assert, gleich, meldet, env } from './harness.js';
import { loadPackage, fnSource } from '../praesentation/registry.js';
import { schlageAssetVor } from '../praesentation/assets.js';
import { ladePaket, paketAusZip, zipAusSystem, kopiereSystem, fuegeDateiHinzu, freieId } from '../praesentation/pakete.js';
import { importPptx } from '../praesentation/import-pptx.js';
import { leseTheme, farbe, xml } from '../praesentation/pptx-lesen.js';
import { waehleLayouts } from '../praesentation/analyse.js';
import { exportPptx } from '../praesentation/render-pptx.js';
import { kontrast } from '../praesentation/validate.js';
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
const sp = (typ, idx, x, y, cx, cy, extra = '') => `<p:sp><p:nvSpPr><p:cNvPr id="${idx + 2}" name="${typ}"/><p:cNvSpPr/><p:nvPr><p:ph type="${typ}" idx="${idx}"/></p:nvPr></p:nvSpPr><p:spPr>${cx ? `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` : ''}</p:spPr>${extra}</p:sp>`;
const form = (name, x, y, cx, cy, geo, fill, extra = '') => `<p:sp><p:nvSpPr><p:cNvPr id="90" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>${geo}${fill}</p:spPr>${extra}</p:sp>`;
const flaeche = (tag, typ, name, inhalt, extra = '') => `<p:${tag} ${NS}${typ ? ` type="${typ}"` : ''}><p:cSld name="${name}">${extra}<p:spTree>${inhalt}</p:spTree></p:cSld>${tag === 'sldMaster' ? '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4000"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:buChar char="•"/><a:defRPr sz="2000"/></a:lvl1pPr></p:bodyStyle></p:txStyles>' : ''}</p:${tag}>`;
const W = 12192000, H = 6858000;
const MASTER = flaeche('sldMaster', '', 'Master', sp('title', 0, 838200, 365125, 10515600, 1325563) + sp('body', 1, 838200, 1825625, 10515600, 4351338));
const L_TITEL = flaeche('sldLayout', 'title', 'Titelfolie', sp('ctrTitle', 0, 1524000, 1122363, 9144000, 2387600) + sp('subTitle', 1, 1524000, 3602038, 9144000, 1655762), '<p:bg><p:bgPr><a:solidFill><a:schemeClr val="tx2"/></a:solidFill></p:bgPr></p:bg>');
const L_INHALT = flaeche('sldLayout', 'obj', 'Titel und Inhalt', sp('title', 0) + sp('body', 1));
const L_ZWEI = flaeche('sldLayout', 'twoObj', 'Zwei Inhalte', sp('title', 0) + sp('body', 1, 838200, 1825625, 5181600, 4351338) + sp('body', 2, 6172200, 1825625, 5181600, 4351338));
/* Gestaltung: Gruppe mit skaliertem Kind, Freiform, Verlauf, Linie */
const GRUPPE = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="50" name="Gruppe"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${W / 2}" y="0"/><a:ext cx="${W / 2}" cy="${H / 2}"/><a:chOff x="0" y="0"/><a:chExt cx="${W}" cy="${H}"/></a:xfrm></p:grpSpPr>${form('Balken', 0, 0, W / 2, H, '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>', '<a:solidFill><a:schemeClr val="accent2"><a:alpha val="50000"/></a:schemeClr></a:solidFill>')}</p:grpSp>`;
const DREIECK = form('Welle', 0, H * 0.8, W, H * 0.2, '<a:custGeom><a:pathLst><a:path w="100" h="100"><a:moveTo><a:pt x="0" y="100"/></a:moveTo><a:lnTo><a:pt x="100" y="0"/></a:lnTo><a:lnTo><a:pt x="100" y="100"/></a:lnTo><a:close/></a:path></a:pathLst></a:custGeom>', '<a:solidFill><a:srgbClr val="2E7D5B"/></a:solidFill>');
const VERLAUF = form('Verlauf', W * 0.9, 0, W * 0.1, H, '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>', '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="1F3A2E"/></a:gs><a:gs pos="100000"><a:srgbClr val="2E7D5B"/></a:gs></a:gsLst><a:lin ang="5400000"/></a:gradFill>');
const LINIE = `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="60" name="Linie"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="838200" y="${H * 0.25}"/><a:ext cx="${W * 0.5}" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="25400"><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></a:ln></p:spPr></p:cxnSp>`;
const L_AUSSAGE = flaeche('sldLayout', '', 'Große Aussage', GRUPPE + DREIECK + VERLAUF + LINIE + sp('title', 0, 838200, H * 0.3, W * 0.7, H * 0.35, '<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="5400" b="1"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle><a:p><a:r><a:t>Titel</a:t></a:r></a:p></p:txBody>'));
const L_LEER = flaeche('sldLayout', 'blank', 'Leer', '');

async function vorlage(layouts, name = 'Kanzlei_Vorlage.potx') {
  const zip = new window.JSZip();
  zip.file('ppt/presentation.xml', `<p:presentation ${NS}><p:sldSz cx="${W}" cy="${H}"/></p:presentation>`);
  zip.file('ppt/theme/theme1.xml', THEME); zip.file('ppt/slideMasters/slideMaster1.xml', MASTER);
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', '<Relationships><Relationship Id="rId1" Type="theme" Target="../theme/theme1.xml"/></Relationships>');
  layouts.forEach((l, i) => { zip.file(`ppt/slideLayouts/slideLayout${i + 1}.xml`, l); zip.file(`ppt/slideLayouts/_rels/slideLayout${i + 1}.xml.rels`, '<Relationships><Relationship Id="rId1" Type="slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>'); });
  return new File([await zip.generateAsync({ type: 'blob' })], name);
}

test(nurBrowser('PowerPoint lesen: Theme, Farbschema und Farbvarianten'), () => {
  if (!imBrowser) return;
  const t = leseTheme(THEME), ctx = { theme: t.farben, clrMap: { bg1: 'lt1', tx2: 'dk2' } };
  gleich([t.farben.dk1, t.farben.lt1, t.farben.dk2, t.farben.accent2, t.major, t.minor], ['#111111', '#FFFFFF', '#1F3A2E', '#C8963E', 'Cambria', 'Calibri']);
  const f = s => farbe(xml(`<a:solidFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${s}</a:solidFill>`).documentElement, ctx);
  gleich(f('<a:schemeClr val="tx2"/>').hex, '#1F3A2E', 'tx2 über das Farbschema des Masters');
  gleich(f('<a:schemeClr val="bg1"/>').hex, '#FFFFFF');
  const dunkler = f('<a:schemeClr val="accent1"><a:lumMod val="50000"/></a:schemeClr>').hex;
  assert(kontrast(dunkler, '#FFFFFF') > kontrast('#2E7D5B', '#FFFFFF'), 'lumMod macht dunkler: ' + dunkler);
  gleich(f('<a:srgbClr val="FF0000"><a:alpha val="40000"/></a:srgbClr>'), { hex: '#FF0000', alpha: 0.4 });
});

test(nurBrowser('PowerPoint-Import: Layouts mit Positionen, Textstilen und Gestaltung; fehlende Typen aus den eigenen Layouts'), async () => {
  if (!imBrowser) return;
  const r = await importPptx(await vorlage([L_TITEL, L_INHALT, L_ZWEI, L_AUSSAGE, L_LEER]), window.JSZip, { vergebeneIds: ['kanzlei-vorlage'] });
  const m = r.paket.manifest, C = m.tokens.colors, L = id => m.layouts.find(l => l.id === id);
  gleich([m.meta.id, m.meta.name], ['kanzlei-vorlage-2', 'Kanzlei Vorlage']);
  gleich([C.primary, C.secondary, C.accent, C.background, C.surface, C.text], ['#1F3A2E', '#2E7D5B', '#C8963E', '#FFFFFF', '#F3F1EC', '#111111']);
  gleich([m.tokens.typography.headingFont, m.tokens.typography.bodyFont, m.tokens.typography.sizes.title], ['Cambria', 'Calibri', 40]);
  /* Titelfolie: dunkler Hintergrund aus dem Layout, Text wird lesbar hell */
  const titel = L('title');
  gleich([titel.background, titel.placeholders.map(p => p.id)], ['primary', ['title', 'subtitle']]);
  gleich(titel.placeholders[0].x, 13.25, 'Position aus der Vorlage, abzüglich Innenabstand');
  assert(kontrast(C[titel.placeholders[0].style.color] || titel.placeholders[0].style.color, '#1F3A2E') > 4.5, 'heller Text auf dunklem Grund');
  gleich(L('two-column').placeholders.filter(p => !p.auto).map(p => p.id), ['title', 'leftBullets', 'rightBullets']);
  const inhalt = L('content-bullets'), liste = inhalt.placeholders.find(p => p.id === 'bullets');
  gleich([liste.x, liste.style.size, liste.style.bullet], [7.63, 20, 'dot'], 'Position aus dem Master geerbt, Größe aus dem Textstil');
  /* Gestaltung der Aussage-Folie */
  const aussage = L('statement'), d = aussage.deko;
  gleich(aussage.placeholders.find(p => p.id === 'statement').style, { font: 'heading', size: 54, color: 'secondary', bold: true, align: 'center', valign: 'middle' });
  const balken = d.find(x => x.shape === 'rect' && x.fill === 'accent');
  gleich([balken.x, balken.y, balken.w, balken.h, balken.opacity], [50, 0, 25, 50, 0.5], 'Kind einer Gruppe richtig skaliert');
  const welle = d.find(x => x.shape === 'pfad');
  gleich([welle.fill, welle.pfad], ['secondary', [['M', 0, 1], ['L', 1, 0], ['L', 1, 1], ['Z']]]);
  assert(d.some(x => x.shape === 'image' && x.x === 90), 'Verlauf als Bild');
  const linie = d.find(x => x.shape === 'line');
  gleich([linie.stroke, linie.strokeWidth], ['accent', 2]);
  /* abgeleitet, nicht aus einem fremden System */
  ['cards', 'kpi-grid', 'timeline', 'quote', 'closing', 'image-full', 'big-number', 'section'].forEach(t => assert(m.layouts.some(l => l.typ === t), `${t} wurde nicht abgeleitet`));
  assert(m.layouts.find(l => l.typ === 'kpi-grid').name.includes('abgeleitet aus „Titel und Inhalt“'));
  meldet(r.bericht, 'Erkannte Zwecke:'); meldet(r.bericht, 'Aus deinen Layouts abgeleitet');
  const geladen = await ladePaket(r.paket);
  gleich(geladen.errors, []);
  const spec = JSON.parse(await env.readText('examples/demo.slides.json'));
  const folien = buildSlides(spec, geladen.system);
  gleich(folien.length, 10); assert(folien[0].background === '#1F3A2E' && folien[0].elemente.some(e => e.ph === 'title' && e.farbe === '#FFFFFF'));
});

/* Bild für Tests: ein transparentes Logo und ein Foto */
function leinwand(w, h, malen, typ = 'image/png') { const c = document.createElement('canvas'); c.width = w; c.height = h; malen(c.getContext('2d')); return c.toDataURL(typ, 0.85); }

test(nurBrowser('PowerPoint-Import: Markenvorlage mit Beispielfolien → Kennzahlen, Bild und Text, große Aussage'), async () => {
  if (!imBrowser) return;
  const logo = leinwand(400, 100, g => { g.fillStyle = '#0B3D2E'; g.font = 'bold 64px sans-serif'; g.fillText('Marke', 10, 75); });
  const foto = leinwand(1600, 1000, g => { const v = g.createLinearGradient(0, 0, 1600, 1000); v.addColorStop(0, '#7a8f99'); v.addColorStop(1, '#2e7d5b'); g.fillStyle = v; g.fillRect(0, 0, 1600, 1000); }, 'image/jpeg');
  const P = new window.PptxGenJS(); P.layout = 'LAYOUT_WIDE'; P.theme = { headFontFace: 'Georgia', bodyFontFace: 'Verdana' };
  P.defineSlideMaster({ title: 'MARKE_INHALT', background: { color: 'FFFFFF' }, objects: [
    { rect: { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: '0B3D2E' } } },
    { image: { x: 11.4, y: 0.35, w: 1.6, h: 0.4, data: logo } },
    { text: { text: 'Vertraulich', options: { x: 0.6, y: 7.0, w: 3, h: 0.3, fontSize: 10, color: '6B7B75' } } },
    { placeholder: { options: { name: 'titel', type: 'title', x: 0.8, y: 0.5, w: 10, h: 1.0, fontSize: 32, bold: true, color: '0B3D2E' }, text: '' } }
  ], slideNumber: { x: 12.3, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: '6B7B75' } });
  P.defineSlideMaster({ title: 'MARKE_AUSSAGE', background: { color: '0B3D2E' }, objects: [
    { rect: { x: 0.8, y: 2.4, w: 1.2, h: 0.12, fill: { color: 'C8963E' } } },
    { placeholder: { options: { name: 'titel', type: 'title', x: 0.8, y: 2.7, w: 11, h: 2.2, fontSize: 44, bold: true, color: 'FFFFFF' }, text: '' } }
  ] });
  const kz = P.addSlide({ masterName: 'MARKE_INHALT' });
  kz.addText('Was wir erreicht haben', { placeholder: 'titel' });
  [['72 %', 'Kunden zufrieden'], ['−31 %', 'weniger Anrufe'], ['4,5', 'Sterne im Schnitt']].forEach(([v, l], i) => {
    kz.addShape(P.ShapeType.rect, { x: 0.8 + i * 4, y: 2.0, w: 3.7, h: 2.8, fill: { color: 'F3F1EC' } });
    kz.addText(v, { x: 1.0 + i * 4, y: 2.2, w: 3.3, h: 1.2, fontSize: 54, bold: true, color: 'C8963E', fontFace: 'Georgia' });
    kz.addText(l, { x: 1.0 + i * 4, y: 3.5, w: 3.3, h: 0.9, fontSize: 16, color: '222222' });
  });
  const bt = P.addSlide({ masterName: 'MARKE_INHALT' });
  bt.addText('Das Team gewinnt Zeit', { placeholder: 'titel' });
  bt.addImage({ data: foto, x: 0.8, y: 1.8, w: 5.5, h: 4.8 });
  bt.addText('Weniger Routineanfragen\nMehr Zeit für Beratung\nZufriedenere Kundschaft', { x: 6.8, y: 1.8, w: 5.6, h: 4.5, fontSize: 18, color: '222222', valign: 'top' });
  P.addSlide({ masterName: 'MARKE_AUSSAGE' }).addText('Wir halbieren die Wartezeit', { placeholder: 'titel' });
  const datei = new File([await P.write({ outputType: 'blob' })], 'Marke.pptx');

  const r = await importPptx(datei, window.JSZip, {});
  const m = r.paket.manifest, typ = t => m.layouts.filter(l => l.typ === t);
  gleich([m.tokens.typography.headingFont, m.tokens.typography.bodyFont], ['Georgia', 'Verdana']);
  /* Kennzahlen aus der Beispielfolie: drei feste Zellen, Karten bleiben als Gestaltung */
  const kpi = typ('kpi-grid').find(l => l.placeholders.some(p => p.variante === 'frei'));
  assert(kpi, 'Kennzahlen-Folie erkannt: ' + m.layouts.map(l => l.typ + ':' + l.name).join(', '));
  const k = kpi.placeholders.find(p => p.id === 'kpis');
  gleich([k.zellen.length, k.felder.map(f => f.id), k.felder[0].style.size, k.felder[0].style.bold], [3, ['value', 'label'], 54, true]);
  gleich(kpi.deko.filter(x => x.shape === 'rect' && x.fill === '#F3F1EC').length, 3, 'Kartenflächen der Vorlage');
  assert(kpi.deko.some(x => x.shape === 'text' && x.text === 'Vertraulich') && kpi.deko.some(x => x.shape === 'image' && x.logo), 'Master-Gestaltung mit Logo und festem Text');
  assert(kpi.placeholders.some(p => p.auto === 'pageNumber'), 'Seitenzahl');
  /* Bild und Text */
  const bild = [...typ('image-left'), ...typ('image-right')].find(l => !l.name.includes('abgeleitet') && !l.name.includes('gespiegelt'));
  assert(bild, 'Bildfolie erkannt');
  const ph = bild.placeholders.find(p => p.typ === 'image');
  assert(ph.asset && m.assets.find(a => a.id === ph.asset).role.endsWith('image'), 'Foto der Beispielfolie wird Standardbild');
  gleich(bild.placeholders.find(p => p.id === 'bullets').typ, 'bullets');
  /* große Aussage */
  const st = typ('statement').find(l => l.background === '#0B3D2E' || m.tokens.colors[l.background] === '#0B3D2E');
  assert(st, 'Aussage-Layout');
  gleich(st.placeholders.find(p => p.id === 'statement').style.size, 44);
  /* Gültig, darstellbar, und die Layoutwahl nutzt die Markenlayouts */
  const geladen = await ladePaket(r.paket);
  gleich(geladen.errors, []);
  const sys = geladen.system, wahl = waehleLayouts([{ form: 'titel' }, { form: 'kennzahlen' }, { form: 'kernsatz', betont: true }, { form: 'bild' }, { form: 'abschluss' }], sys);
  gleich(wahl.slice(1, 4).map(w => sys.layout(w.layoutId).typ), ['kpi-grid', 'statement', bild.typ]);
  const spec = { titel: 'Test', folien: [
    { layoutId: kpi.id, inhalt: { title: 'Die Pilotphase hat überzeugt', kpis: [{ value: '72 %', label: 'nutzen das Portal' }, { value: '−31 %', label: 'weniger Anrufe' }, { value: '4,5', label: 'Sterne' }] } },
    { layoutId: bild.id, inhalt: { title: 'Das Team gewinnt Zeit', bullets: ['Weniger Routine'] } }
  ] };
  const folien = buildSlides(spec, sys);
  gleich(folien[0].elemente.filter(e => e.ph === 'kpis').length, 6);
  assert(folien.every(f => f.elemente.every(e => !e.gekuerzt)), 'nichts abgeschnitten');
  /* Export mit allen Formen funktioniert */
  const pptx = await exportPptx(buildSlides({ titel: 'x', folien: sys.layouts.map(l => ({ layoutId: l.id, inhalt: {} })) }, sys), { PptxGenJS: window.PptxGenJS, ladeBild: async () => null, titel: 'x' });
  assert((await pptx.write({ outputType: 'blob' })).size > 10000);
});

test(nurBrowser('PowerPoint-Import: verständliche Fehler'), async () => {
  if (!imBrowser) return;
  const versuch = async blob => { try { await importPptx(new File([blob], 'x.pptx'), window.JSZip, {}); return ''; } catch (e) { return e.message; } };
  assert((await versuch(new Blob(['x']))).includes('keine lesbare PowerPoint-Datei'));
  const z = new window.JSZip(); z.file('a.txt', 'x');
  assert((await versuch(await z.generateAsync({ type: 'blob' }))).includes('ppt/presentation.xml fehlt'));
  let fehler = ''; try { await importPptx(await vorlage([L_LEER]), window.JSZip, {}); } catch (e) { fehler = e.message; }
  assert(fehler.includes('kein Layout'), fehler);
});
