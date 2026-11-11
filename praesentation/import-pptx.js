/* ============================================================
   Präsentationsgenerator – Import aus PowerPoint (nur Browser)
   Liest aus einer .pptx oder .potx die Theme-Farben, die Schriften
   und die Layouts des Folienmasters mit ihren Platzhaltern und
   legt daraus den Entwurf eines Designsystems an.

   Übernommen werden Werte, keine PowerPoint-Master: Der Export
   zeichnet die Folien später aus den Tokens neu. Layouts, die die
   Vorlage nicht hat (Kennzahlen, Zeitstrahl, Zitat …), kommen aus
   einem vorhandenen Designsystem als Grundlage.
   ============================================================ */
import { kontrast } from './validate.js';
import { blobAlsDataUrl, ergaenzeAssets, freieId } from './pakete.js';

const xml = text => new DOMParser().parseFromString(text, 'application/xml');
const kinder = (el, name) => el ? [...el.getElementsByTagName(name)] : [];
const erstes = (el, name) => kinder(el, name)[0] || null;
const hex = v => '#' + String(v).toUpperCase();
function mische(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/* ---------- Theme: Farben und Schriften ---------- */
export function parseTheme(text) {
  const d = xml(text), schema = erstes(d, 'a:clrScheme'), farben = {};
  ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].forEach(k => {
    const el = erstes(schema, 'a:' + k), s = erstes(el, 'a:srgbClr'), sys = erstes(el, 'a:sysClr');
    const v = s ? s.getAttribute('val') : sys ? sys.getAttribute('lastClr') : null;
    if (v && /^[0-9a-fA-F]{6}$/.test(v)) farben[k] = hex(v);
  });
  const schrift = art => { const el = erstes(erstes(d, 'a:' + art), 'a:latin'); return el ? el.getAttribute('typeface') || '' : ''; };
  return { name: schema ? schema.getAttribute('name') || '' : '', farben, ueberschrift: schrift('majorFont'), text: schrift('minorFont') };
}

/* ---------- Master und Layouts: Platzhalter mit Position ---------- */
/* groesse: { cx, cy } der Folie in EMU. Liefert { name, typ, hintergrund, platzhalter[] } */
export function parseFlaeche(text, groesse) {
  const d = xml(text), cSld = erstes(d, 'p:cSld'), wurzel = d.documentElement;
  const bg = erstes(erstes(cSld, 'p:bgPr'), 'a:srgbClr') || null, bgSchema = erstes(erstes(cSld, 'p:bgPr'), 'a:schemeClr') || erstes(erstes(cSld, 'p:bgRef'), 'a:schemeClr');
  const platzhalter = kinder(cSld, 'p:sp').map(sp => {
    const ph = erstes(sp, 'p:ph'); if (!ph) return null;
    const off = erstes(sp, 'a:off'), ext = erstes(sp, 'a:ext'), pr = v => Math.round(v * 1000) / 10;
    return {
      typ: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') || '0',
      ...(off && ext ? { x: pr(off.getAttribute('x') / groesse.cx), y: pr(off.getAttribute('y') / groesse.cy), w: pr(ext.getAttribute('cx') / groesse.cx), h: pr(ext.getAttribute('cy') / groesse.cy) } : {})
    };
  }).filter(Boolean);
  const sz = art => { const el = erstes(erstes(erstes(d, 'p:' + art), 'a:lvl1pPr'), 'a:defRPr'); return el && el.getAttribute('sz') ? el.getAttribute('sz') / 100 : 0; };
  return {
    name: cSld ? cSld.getAttribute('name') || '' : '', typ: wurzel.getAttribute('type') || '',
    hintergrund: bg ? hex(bg.getAttribute('val')) : null, hintergrundSchema: bgSchema ? bgSchema.getAttribute('val') : null,
    platzhalter, titelPt: sz('titleStyle'), textPt: sz('bodyStyle')
  };
}

const TYP_AUS_PPT = { title: 'title', secHead: 'section', obj: 'content-bullets', tx: 'content-bullets', twoObj: 'two-column', twoTxTwoObj: 'two-column', picTx: 'image-left' };
function typVon(l) {
  if (TYP_AUS_PPT[l.typ]) return TYP_AUS_PPT[l.typ];
  const t = l.platzhalter.map(p => p.typ), text = t.filter(x => x === 'body' || x === 'obj').length;
  if (t.includes('ctrTitle')) return 'title';
  if (t.includes('pic') && t.includes('title')) return 'image-left';
  if (t.includes('title') && text >= 2) return 'two-column';
  if (t.includes('title') && text === 1) return 'content-bullets';
  return null;
}

/* Wie viel Text passt in eine Fläche? Vorsichtige Schätzung für die Zeichenlimits. */
function fassung(ph, pt, zeilenhoehe) {
  const proZeile = (ph.w / 100 * 960) / (0.54 * pt * 1.14), zeilen = Math.max(1, Math.floor((ph.h / 100 * 540) / (pt * zeilenhoehe)));
  return { proZeile, zeilen };
}
const grenze = (v, min, max) => Math.max(min, Math.min(max, Math.round(v)));

/* ---------- Entwurf zusammenbauen ---------- */
/* teile: { theme, master, layouts[] } aus den Parsern oben
   opts: { name, vergebeneIds, basis } – basis ist ein geladenes Designsystem für fehlende Layouts */
export function entwurfAus(teile, opts = {}) {
  const { theme, master, layouts } = teile, F = theme.farben, bericht = [], basis = opts.basis ? JSON.parse(JSON.stringify(opts.basis.manifest)) : null;
  const dunkel = F.dk1 || '#1A1A1A', hell = F.lt1 || '#FFFFFF';
  const schema = { bg1: hell, tx1: dunkel, bg2: F.lt2, tx2: F.dk2, dk1: dunkel, lt1: hell, dk2: F.dk2, lt2: F.lt2, accent1: F.accent1, accent2: F.accent2, accent3: F.accent3, accent4: F.accent4, accent5: F.accent5, accent6: F.accent6 };
  const primary = F.dk2 && kontrast(F.dk2, hell) >= 3 && F.dk2 !== dunkel ? F.dk2 : (F.accent1 || dunkel);
  /* gedämpfte Textfarbe: so hell wie möglich, aber auf Hintergrund und Fläche noch gut lesbar */
  const flaeche = F.lt2 && F.lt2 !== hell && kontrast(dunkel, F.lt2) >= 7 ? F.lt2 : mische(hell, dunkel, 0.05);
  let muted = mische(dunkel, hell, 0.4); for (let t = 0.35; (kontrast(muted, hell) < 4.6 || kontrast(muted, flaeche) < 4.6) && t >= 0; t -= 0.05) muted = mische(dunkel, hell, t);
  const palette = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(k => F[k]).filter(Boolean);
  const colors = {
    primary, secondary: F.accent1 && F.accent1 !== primary ? F.accent1 : (F.accent2 || primary), accent: F.accent2 && F.accent2 !== primary ? F.accent2 : (F.accent3 || F.accent1 || primary),
    background: hell, surface: flaeche, text: dunkel, textMuted: muted,
    success: '#1E8E5A', warning: '#B26A00', error: '#C0392B', onDark: '#FFFFFF', onDarkMuted: mische('#FFFFFF', primary, 0.25), border: mische(hell, dunkel, 0.16),
    chartPalette: palette.length >= 3 ? palette : [primary, '#17B3A3', '#2E5E8C', '#F2A541', '#7A5AF8', '#E4572E']
  };
  bericht.push(`Farben aus dem Theme „${theme.name || 'ohne Namen'}“ übernommen: ${Object.keys(F).length} von 10 Farben gefunden.`);

  const basisTy = basis ? basis.tokens.typography : null;
  const sizes = { display: 72, title: 44, h1: 30, quote: 30, kpi: 46, h2: 20, body: 18, small: 14, caption: 12, ...(basisTy ? basisTy.sizes : {}) };
  if (master.titelPt) { sizes.title = grenze(master.titelPt, 36, 54); sizes.h1 = grenze(master.titelPt * 0.7, 24, 40); }
  if (master.textPt) sizes.body = grenze(master.textPt * 0.65, 16, 22);
  const typography = { headingFont: theme.ueberschrift || 'Arial', bodyFont: theme.text || 'Arial', headingFallback: ['Arial', 'Helvetica', 'sans-serif'], bodyFallback: ['Arial', 'Helvetica', 'sans-serif'], googleFonts: false, sizes, lineHeight: 1.25, headingBold: true };
  bericht.push(`Schriften: Überschriften „${typography.headingFont}“, Text „${typography.bodyFont}“.`);

  /* Layouts der Vorlage */
  const geo = (l, typen) => { for (const t of typen) { const p = l.platzhalter.find(x => x.typ === t && x.w) || (l.platzhalter.some(x => x.typ === t) && master.platzhalter.find(x => x.typ === (t === 'ctrTitle' ? 'title' : t === 'subTitle' ? 'body' : t) && x.w)); if (p) return p; } return null; };
  const inFolie = p => p && p.x >= 0 && p.y >= 0 && p.x + p.w <= 100 && p.y + p.h <= 100 && p.w > 3 && p.h > 2;
  const NAMEN = { title: 'Titelfolie', section: 'Kapiteltrenner', 'content-bullets': 'Inhalt mit Aufzählung', 'two-column': 'Zwei Spalten', 'image-left': 'Bild und Text' };
  const BESCHR = basis ? Object.fromEntries(basis.layouts.map(l => [l.typ || l.id, l.beschreibung])) : {};
  const eigene = [];
  /* Platzhalter ohne eigene Position erben sie vom gleichartigen Platzhalter des Masters */
  const ERBT = { ctrTitle: 'title', subTitle: 'body', obj: 'body' };
  layouts.forEach(roh => {
    const l = { ...roh, platzhalter: roh.platzhalter.map(p => { if (p.w) return p; const v = master.platzhalter.find(x => x.typ === (ERBT[p.typ] || p.typ) && x.w); return v ? { ...p, x: v.x, y: v.y, w: v.w, h: v.h } : p; }) };
    const typ = typVon(l);
    if (!typ || eigene.some(e => e.id === typ)) return;
    const bgHex = l.hintergrund || (l.hintergrundSchema && schema[l.hintergrundSchema]) || master.hintergrund || (master.hintergrundSchema && schema[master.hintergrundSchema]) || hell;
    let background = Object.keys(colors).find(k => k !== 'chartPalette' && colors[k] === bgHex);
    if (!background) { background = 'bg' + typ.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase()); colors[background] = bgHex; }
    const aufDunkel = kontrast('#FFFFFF', bgHex) > kontrast(dunkel, bgHex), fTitel = aufDunkel ? 'onDark' : (kontrast(primary, bgHex) >= 4.5 ? 'primary' : 'text'), fText = aufDunkel ? 'onDarkMuted' : 'text';
    const phs = [], text = (id, p, size, heading, beschreibung, pflicht, farbe) => {
      const f = fassung(p, sizes[size], typography.lineHeight);
      phs.push({ id, typ: 'text', beschreibung, ...(pflicht ? { pflicht: true } : {}), x: p.x, y: p.y, w: p.w, h: p.h, maxChars: grenze(f.proZeile * Math.min(f.zeilen, heading ? 2 : 4) * 0.8, 20, heading ? 90 : 220), style: { ...(heading ? { font: 'heading' } : {}), size, color: farbe, valign: heading ? 'middle' : 'top' } });
    };
    const liste = (id, p, beschreibung) => {
      const f = fassung(p, sizes.body, typography.lineHeight);
      phs.push({ id, typ: 'bullets', beschreibung, pflicht: true, x: p.x, y: p.y, w: p.w, h: p.h, maxItems: grenze(f.zeilen / 2.2, 3, 6), maxCharsPerItem: grenze(f.proZeile * 1.5, 40, 140), style: { size: 'body', color: fText, bullet: 'dot' } });
    };
    const titel = geo(l, ['ctrTitle', 'title']), koerper = l.platzhalter.filter(p => (p.typ === 'body' || p.typ === 'obj') && p.w).sort((a, b) => a.x - b.x), sub = geo(l, ['subTitle']) || koerper[0];
    if (!inFolie(titel)) return;
    if (typ === 'title') { text('title', titel, 'title', true, 'Titel der Präsentation', true, fTitel); if (inFolie(sub)) text('subtitle', sub, 'h2', false, 'Untertitel: worum es geht, in einem Satz', false, fText); }
    else if (typ === 'section') { text('title', titel, 'title', true, 'Kapiteltitel', true, fTitel); if (inFolie(sub)) text('subtitle', sub, 'h2', false, 'Ein Satz zum Inhalt des Kapitels', false, fText); }
    else if (typ === 'content-bullets') { if (!inFolie(koerper[0])) return; text('title', titel, 'h1', true, 'Überschrift als Aussage', true, fTitel); liste('bullets', koerper[0], 'Stichpunkte, jeder ein vollständiger Gedanke'); }
    else if (typ === 'two-column') { if (!inFolie(koerper[0]) || !inFolie(koerper[1])) return; text('title', titel, 'h1', true, 'Überschrift als Aussage', true, fTitel); liste('leftBullets', koerper[0], 'Stichpunkte links'); liste('rightBullets', koerper[koerper.length - 1], 'Stichpunkte rechts'); }
    else if (typ === 'image-left') { const bild = geo(l, ['pic']); if (!inFolie(bild) || !inFolie(koerper[0])) return; phs.push({ id: 'image', typ: 'image', beschreibung: 'Bild', asset: bild.w / bild.h * 16 / 9 >= 1.25 ? 'hero-image' : 'portrait-image', x: bild.x, y: bild.y, w: bild.w, h: bild.h, fit: 'cover' }); text('title', titel, 'h1', true, 'Überschrift als Aussage', true, fTitel); liste('bullets', koerper[0], 'Stichpunkte'); }
    eigene.push({ id: typ, name: `${NAMEN[typ]} (aus „${l.name || 'Vorlage'}“)`, beschreibung: BESCHR[typ] || NAMEN[typ], background, placeholders: phs });
  });
  bericht.push(eigene.length ? `Aus der Vorlage übernommene Layouts: ${eigene.map(e => e.id).join(', ')}.` : 'In der Vorlage wurde kein Layout mit erkennbaren Platzhaltern gefunden.');

  /* Fehlende Layouts aus dem Grundlagen-System */
  let masters = {}, ergaenzt = [];
  if (basis) {
    ergaenzt = basis.layouts.filter(l => !eigene.some(e => e.id === (l.typ || l.id)));
    masters = basis.masters || {};
    Object.keys(basis.tokens.colors).forEach(k => { if (!(k in colors)) colors[k] = basis.tokens.colors[k]; });
    if (ergaenzt.length) bericht.push(`Nicht in der Vorlage, deshalb aus „${basis.meta.name}“ ergänzt und in deinen Farben dargestellt: ${ergaenzt.map(l => l.id).join(', ')}.`);
  } else if (!eigene.length) throw new Error('Aus der Datei ließ sich kein Layout lesen, und es ist kein Designsystem als Grundlage geladen.');

  const id = freieId(opts.name || theme.name || 'import', opts.vergebeneIds || []);
  const manifest = {
    schemaVersion: '1.0',
    meta: { id, name: opts.name || theme.name || 'Importiertes Design', beschreibung: 'Entwurf, importiert aus einer PowerPoint-Vorlage. Farben, Schriften und Platzhalter stammen aus der Datei.', version: '0.1.0', autor: '', tags: ['importiert'] },
    tokens: { colors, typography, spacing: basis ? basis.tokens.spacing : { marginX: 6, marginY: 8, gap: 3, grid: { columns: 12, gutter: 2 } }, shapes: basis ? basis.tokens.shapes : { radius: 4, lineWidth: 1, shadow: 'none' } },
    masters, layouts: [...eigene, ...ergaenzt], assets: [],
    rules: { logoAuf: [], maxBullets: 5, bildstil: '', hinweise: [] }
  };
  return { manifest, bericht };
}

/* Logo-Platzhalter entfernen, für die es kein Asset gibt, und die Logo-Regel passend setzen */
export function bereinigeLogos(manifest) {
  const hat = ref => manifest.assets.some(a => a.id === ref || a.role === ref), entfernt = new Set();
  const putze = f => { if (f.placeholders) f.placeholders = f.placeholders.filter(p => { if (p.typ === 'logo' && !hat(p.asset)) { entfernt.add(p.asset); return false; } return true; }); };
  Object.values(manifest.masters || {}).forEach(putze); manifest.layouts.forEach(putze);
  const mitLogo = l => [...((manifest.masters || {})[l.master] || {}).placeholders || [], ...l.placeholders].some(p => p.typ === 'logo');
  manifest.rules.logoAuf = ['title', 'closing'].filter(id => { const l = manifest.layouts.find(x => x.id === id); return l && mitLogo(l); });
  return [...entfernt];
}

/* ---------- Datei lesen ---------- */
export async function importPptx(datei, JSZip, opts = {}) {
  let zip;
  try { zip = await JSZip.loadAsync(datei); } catch { throw new Error('Die Datei ist keine lesbare PowerPoint-Datei.'); }
  const lies = async p => zip.file(p) ? zip.file(p).async('string') : null;
  const pres = await lies('ppt/presentation.xml');
  if (!pres) throw new Error('Das ist keine PowerPoint-Datei (.pptx oder .potx): ppt/presentation.xml fehlt.');
  const sz = erstes(xml(pres), 'p:sldSz'), groesse = { cx: +(sz && sz.getAttribute('cx')) || 12192000, cy: +(sz && sz.getAttribute('cy')) || 6858000 };
  const nach = n => +(/(\d+)\.xml$/.exec(n) || [0, 0])[1], dateien = (re) => Object.keys(zip.files).filter(n => re.test(n)).sort((a, b) => nach(a) - nach(b));
  const themeDatei = dateien(/^ppt\/theme\/theme\d+\.xml$/)[0], masterDatei = dateien(/^ppt\/slideMasters\/slideMaster\d+\.xml$/)[0];
  if (!themeDatei || !masterDatei) throw new Error('In der Datei fehlen Theme oder Folienmaster.');
  const theme = parseTheme(await lies(themeDatei)), master = parseFlaeche(await lies(masterDatei), groesse);
  const layouts = []; for (const n of dateien(/^ppt\/slideLayouts\/slideLayout\d+\.xml$/)) layouts.push(parseFlaeche(await lies(n), groesse));

  const name = opts.name || String(datei.name || '').replace(/\.(pptx|potx)$/i, '').replace(/[_-]+/g, ' ').trim() || theme.name;
  const { manifest, bericht } = entwurfAus({ theme, master, layouts }, { ...opts, name });
  if (Math.abs(groesse.cx / groesse.cy - 16 / 9) > 0.02) bericht.push('Die Vorlage ist nicht im Format 16:9. Die Platzhalter wurden auf 16:9 umgerechnet und können leicht verzogen sein.');

  /* Bilder aus Master und Layouts (meist das Logo) */
  const paket = { id: manifest.meta.id, manifest, voice: VOICE, readme: '', dateien: {}, herkunft: 'hochgeladen' };
  const bilder = new Set();
  for (const rels of dateien(/^ppt\/(slideMasters|slideLayouts)\/_rels\/.*\.rels$/)) for (const m of (await lies(rels)).matchAll(/Target="\.\.\/media\/([^"]+\.(?:png|jpe?g|svg|gif))"/gi)) bilder.add(m[1]);
  for (const b of bilder) {
    const f = zip.file('ppt/media/' + b); if (!f) continue;
    const typ = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif' }[b.split('.').pop().toLowerCase()];
    paket.dateien['assets/vorlage/' + b.toLowerCase()] = await blobAlsDataUrl(new Blob([await f.async('arraybuffer')], { type: typ }));
  }
  const vorschlaege = await ergaenzeAssets(paket);
  if (vorschlaege.length) bericht.push(`Bilder aus dem Folienmaster übernommen: ${vorschlaege.map(v => `${v.file.split('/').pop()} als ${v.role}`).join(', ')}. Bitte die Rollen prüfen.`);
  const ohne = bereinigeLogos(manifest);
  if (ohne.length) bericht.push(`Kein passendes Logo gefunden (${ohne.join(', ')}). Die Logo-Flächen wurden entfernt. Füge ein Logo hinzu, wenn es auf den Folien erscheinen soll.`);
  paket.readme = `# ${manifest.meta.name}\n\nEntwurf, importiert aus „${datei.name || 'einer PowerPoint-Datei'}“.\n\n## Was übernommen wurde\n\n${bericht.map(b => '- ' + b).join('\n')}\n\n## Was du prüfen solltest\n\n- Farben und Schriften unter \`tokens\`\n- Zeichenlimits der Platzhalter (\`maxChars\`), sie sind aus der Größe der Flächen geschätzt\n- Rollen der Bilder unter \`assets\`\n- \`voice.md\` mit euren Formulierungsrichtlinien\n`;
  return { paket, bericht, vorschlaege };
}

const VOICE = `# Formulierungsrichtlinien

Diese Datei wird beim Schreiben der Folien an die KI übergeben. Passe sie an eure Organisation an.

## Tonalität

- Sachlich, klar und freundlich.
- Aussagen statt Themen als Überschrift.

## Anrede

- Das Publikum wird mit **Sie** angesprochen.

## Satzlänge

- Überschriften: höchstens 10 Wörter.
- Stichpunkte: höchstens 15 Wörter, ein Gedanke pro Punkt.

## Nicht erlaubt

- Zahlen, Namen oder Termine, die nicht im Briefing stehen
`;
