/* ============================================================
   Präsentationsgenerator – Import aus PowerPoint (nur Browser)
   Macht aus einer .pptx oder .potx ein Designsystem, das so aussieht
   wie die Vorlage:
   - jedes Folienlayout und jede Beispielfolie wird gelesen, mit allen
     Formen, Linien, Freiformen, Bildern, Hintergründen und Textstilen
   - die Platzhalter werden nach Zweck eingeordnet (Titel, große Aussage,
     Kennzahlen, Karten, Vergleich, Bild mit Text …) und bekommen die
     Standard-IDs, damit Inhalte zwischen Designsystemen wandern können
   - Folientypen, die die Vorlage nicht hat, werden aus den eigenen
     Layouts der Vorlage abgeleitet (gleicher Hintergrund, gleiche Deko,
     gleiche Schriften), nicht aus einem fremden Designsystem
   Verläufe, Bildfüllungen und zugeschnittene Bilder werden einmal in
   ein Bild umgerechnet, damit Vorschau und Export gleich aussehen.
   ============================================================ */
import { leseTheme, leseFlaeche, leseRels, leseClrMap, leseTabellenstile, xml } from './pptx-lesen.js';
import { kontrast } from './validate.js';
import { blobAlsDataUrl, freieId } from './pakete.js';
import { schlageAssetVor, analysiereBild } from './assets.js';
import { profil, beschreibe, typName } from './analyse.js';

const r2 = v => Math.round(v * 100) / 100;
const grenze = (v, min, max) => Math.max(min, Math.min(max, Math.round(v)));
const kopie = o => JSON.parse(JSON.stringify(o));
function mische(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif', webp: 'image/webp' };
const relsPfad = p => p.replace(/([^/]+)$/, '_rels/$1.rels');
const nummer = n => +(/(\d+)\.xml$/.exec(n) || [0, 0])[1];

/* ============================================================
   1. Datei lesen
   ============================================================ */
export async function lesePptx(datei, JSZip) {
  let zip;
  try { zip = await JSZip.loadAsync(datei); } catch { throw new Error('Die Datei ist keine lesbare PowerPoint-Datei.'); }
  const lies = async p => zip.file(p) ? zip.file(p).async('string') : null;
  const pres = await lies('ppt/presentation.xml');
  if (!pres) throw new Error('Das ist keine PowerPoint-Datei (.pptx oder .potx): ppt/presentation.xml fehlt.');
  const pd = xml(pres), sz = pd.getElementsByTagName('p:sldSz')[0];
  const W = +(sz && sz.getAttribute('cx')) || 12192000, H = +(sz && sz.getAttribute('cy')) || 6858000;
  const presRels = leseRels(await lies('ppt/_rels/presentation.xml.rels'), 'ppt/presentation.xml');
  const dateien = re => Object.keys(zip.files).filter(n => re.test(n)).sort((a, b) => nummer(a) - nummer(b));

  /* Master mit Theme und Farbzuordnung */
  const masterPfade = [...pd.getElementsByTagName('p:sldMasterId')].map(e => presRels[e.getAttribute('r:id')]).filter(p => p && zip.file(p));
  if (!masterPfade.length) masterPfade.push(...dateien(/^ppt\/slideMasters\/slideMaster\d+\.xml$/));
  const masters = {};
  for (const mp of masterPfade) {
    const text = await lies(mp), rels = leseRels(await lies(relsPfad(mp)), mp);
    const themePfad = Object.values(rels).find(p => /theme\/theme\d+\.xml$/.test(p)) || dateien(/^ppt\/theme\/theme\d+\.xml$/)[0];
    const themeText = themePfad && await lies(themePfad);
    if (!text || !themeText) continue;
    const theme = leseTheme(themeText), ctx = { theme: theme.farben, clrMap: leseClrMap(text) };
    masters[mp] = { ...leseFlaeche(text, ctx, rels), ctx, theme, pfad: mp };
  }
  if (!Object.keys(masters).length) throw new Error('In der Datei fehlen Theme oder Folienmaster.');
  const ersterMaster = Object.values(masters)[0];

  const layouts = {};
  for (const lp of dateien(/^ppt\/slideLayouts\/slideLayout\d+\.xml$/)) {
    const rels = leseRels(await lies(relsPfad(lp)), lp), M = masters[Object.values(rels).find(p => masters[p])] || ersterMaster;
    layouts[lp] = { ...leseFlaeche(await lies(lp), M.ctx, rels), master: M.pfad, pfad: lp, quelle: 'layout' };
  }
  const folienPfade = [...pd.getElementsByTagName('p:sldId')].map(e => presRels[e.getAttribute('r:id')]).filter(p => p && zip.file(p));
  const folien = [];
  for (const [i, sp] of folienPfade.entries()) {
    const rels = leseRels(await lies(relsPfad(sp)), sp), lp = Object.values(rels).find(p => layouts[p]);
    const L = layouts[lp], M = masters[L ? L.master : ''] || ersterMaster;
    folien.push({ ...leseFlaeche(await lies(sp), M.ctx, rels), master: M.pfad, layout: lp || null, pfad: sp, nr: i + 1, quelle: 'folie' });
  }
  const tabellenstile = leseTabellenstile(await lies('ppt/tableStyles.xml'), ersterMaster.ctx);
  return { zip, W, H, masters, layouts: Object.values(layouts), folien, theme: ersterMaster.theme, tabellenstile };
}

/* ============================================================
   2. Vererbung: Master → Layout → Folie
   ============================================================ */
const GRUPPE = t => t === 'ctrTitle' || t === 'title' ? 'title' : ['subTitle', 'body', 'obj'].includes(t) ? 'body' : t;
function findePh(elemente, ph) {
  const mit = elemente.filter(e => e.ph);
  return (ph.idx !== '0' && mit.find(e => e.ph.idx === ph.idx && GRUPPE(e.ph.typ) === GRUPPE(ph.typ)))
    || mit.find(e => e.ph.typ === ph.typ) || mit.find(e => GRUPPE(e.ph.typ) === GRUPPE(ph.typ)) || null;
}
function erbe(e, eltern, M) {
  const g = GRUPPE(e.ph.typ), stile = M.textstile || {};
  const quelle = [e, ...eltern];
  const box = quelle.map(x => x.box).find(Boolean) || null;
  const text = e.text || { absaetze: [], ebenen: {}, anker: '', raender: null };
  return {
    ...e, box,
    text: { ...text, anker: quelle.map(x => x.text && x.text.anker).find(Boolean) || '', raender: (quelle.find(x => x.text && x.text.raender) || {}).text?.raender || { l: 91440, r: 91440, t: 45720, b: 45720 } },
    kette: [text.ebenen, ...eltern.map(x => x.text && x.text.ebenen), g === 'title' ? stile.title : g === 'body' ? stile.body : stile.other].filter(Boolean),
    schriftFarbe: e.schriftFarbe || eltern.map(x => x.schriftFarbe).find(Boolean),
    fuellung: e.fuellung || eltern.map(x => x.fuellung).find(Boolean) || null,
    linie: e.linie || eltern.map(x => x.linie).find(Boolean) || null
  };
}
export function setzeZusammen(fl, M, L) {
  const ohnePh = (liste, herkunft) => liste.filter(e => !e.ph).map(e => ({ ...e, herkunft, kette: [e.text && e.text.ebenen, (M.textstile || {}).other].filter(Boolean) }));
  const elemente = [];
  if (fl.zeigeMaster && (!L || L.zeigeMaster)) elemente.push(...ohnePh(M.elemente, 'master'));
  if (L && fl.zeigeMaster) elemente.push(...ohnePh(L.elemente, 'layout'));
  fl.elemente.forEach(e => {
    if (!e.ph) { elemente.push(...ohnePh([e], 'eigen')); return; }
    const eltern = [L && findePh(L.elemente, e.ph), findePh(M.elemente, e.ph)].filter(Boolean);
    elemente.push({ ...erbe(e, eltern, M), herkunft: 'eigen' });
  });
  return { name: fl.name, layoutName: L ? L.name : '', typ: fl.typ || (L && L.typ) || '', quelle: fl.quelle, nr: fl.nr, hintergrund: fl.hintergrund || (L && L.hintergrund) || M.hintergrund || null, elemente, M };
}

/* ============================================================
   3. Texte, Farben, Bilder in Designsystem-Werte übersetzen
   ============================================================ */
function textStil(e, env) {
  const t = e.text || { absaetze: [] }, a = t.absaetze.find(p => p.text.trim()) || t.absaetze[0] || { lvl: 1, run: {} };
  const lvl = a.lvl || 1, kette = e.kette || [];
  const nimm = k => [a.run && a.run[k], a[k], ...kette.map(x => x && x[lvl] && x[lvl][k])].find(v => v !== undefined);
  const font = nimm('font') || '', g = e.ph ? GRUPPE(e.ph.typ) : 'other';
  const kopf = font === '+mj-lt' || (font && font === env.theme.major) || (!font && g === 'title') || (!!font && font !== '+mn-lt' && font !== env.theme.minor && font === env.theme.major);
  const farbeRoh = (a.run && a.run.farbe) || a.farbe || (kette[0] && kette[0][lvl] && kette[0][lvl].farbe) || e.schriftFarbe || kette.slice(1).map(x => x && x[lvl] && x[lvl].farbe).find(Boolean) || { hex: env.theme.farben.dk1 || '#000000', alpha: 1 };
  return {
    sz: (nimm('sz') || 18) * (t.skala || 1) * env.k,
    b: nimm('b'), i: nimm('i'), caps: nimm('caps'), farbe: farbeRoh, kopf, algn: nimm('algn') || 'l', anker: t.anker || (g === 'title' ? 'ctr' : 't'),
    bullet: nimm('bullet'), text: t.absaetze.map(p => p.text).join('\n').trim(), absaetze: t.absaetze.filter(p => p.text.trim()).length
  };
}

/* Bilddaten aus der Datei, einmal geladen */
async function medium(env, pfad) {
  if (!env.medien.has(pfad)) env.medien.set(pfad, (async () => {
    const f = env.zip.file(pfad), ext = pfad.split('.').pop().toLowerCase();
    if (!f || !MIME[ext]) return null;
    const url = await blobAlsDataUrl(new Blob([await f.async('arraybuffer')], { type: MIME[ext] }));
    return { url, ext, ...(await analysiereBild(url)) };
  })());
  return env.medien.get(pfad);
}
function ladeImg(url) { return new Promise((ok, f) => { const i = new Image(); i.onload = () => ok(i); i.onerror = f; i.src = url; }); }

/* Zeichenweg einer Form auf einer Zeichenfläche (für Verläufe und Bildfüllungen) */
function umriss(g, e, w, h) {
  g.beginPath();
  if (e.geo === 'ellipse') g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (e.geo === 'roundRect') { const r = Math.min(w, h) * (e.adj !== undefined ? e.adj : 16667) / 100000; g.roundRect ? g.roundRect(0, 0, w, h, r) : g.rect(0, 0, w, h); }
  else if (e.geo === 'pfad' && e.pfad) e.pfad.forEach(c => { const [b, ...v] = c, p = v.map((z, i) => z * (i % 2 ? h : w)); if (b === 'M') g.moveTo(...p); else if (b === 'L') g.lineTo(...p); else if (b === 'C') g.bezierCurveTo(...p); else if (b === 'Q') g.quadraticCurveTo(...p); else g.closePath(); });
  else g.rect(0, 0, w, h);
}
/* Fläche als PNG: Verlauf oder Bildfüllung, beschnitten auf die Form */
async function raster(env, e, box, fuell) {
  const w = Math.max(8, Math.min(1920, Math.round(box.w * 19.2))), h = Math.max(8, Math.min(1080, Math.round(box.h * 10.8)));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  umriss(g, e, w, h); g.save(); g.clip();
  if (fuell.verlauf) {
    const v = fuell.verlauf, a = (v.winkel || 0) * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), l = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
    const grad = v.radial ? g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2) : g.createLinearGradient(w / 2 - dx * l, h / 2 - dy * l, w / 2 + dx * l, h / 2 + dy * l);
    v.stops.forEach(s => grad.addColorStop(Math.max(0, Math.min(1, s.pos)), s.alpha < 1 ? `rgba(${[1, 3, 5].map(i => parseInt(s.hex.slice(i, i + 2), 16)).join(',')},${s.alpha})` : s.hex));
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  } else if (fuell.bild) {
    const m = await medium(env, fuell.bild.media);
    if (!m) return null;
    const img = await ladeImg(m.url), cr = fuell.bild.crop || { l: 0, t: 0, r: 0, b: 0 };
    const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1, sx = iw * cr.l, sy = ih * cr.t, sw = iw * (1 - cr.l - cr.r), sh = ih * (1 - cr.t - cr.b);
    if (fuell.bild.alpha !== undefined) g.globalAlpha = fuell.bild.alpha;
    g.drawImage(img, sx, sy, Math.max(1, sw), Math.max(1, sh), 0, 0, w, h);
  }
  g.restore();
  return c.toDataURL('image/png');
}

/* Asset anlegen und ID liefern. art: 'logo' | 'foto' | 'deko' */
async function asset(env, { url, name, info, art }) {
  if (env.assetNachUrl.has(url)) return env.assetNachUrl.get(url);
  const ext = (/^data:image\/(png|jpeg|svg\+xml|gif|webp)/.exec(url) || [0, 'png'])[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const datei = `assets/vorlage/${name}.${ext}`.replace(/[^a-z0-9/._-]/gi, '-');
  let pfadName = datei; for (let i = 2; env.dateien[pfadName]; i++) pfadName = datei.replace(/(\.[a-z]+)$/, `-${i}$1`);
  env.dateien[pfadName] = url;
  const v = schlageAssetVor({ pfad: pfadName, breite: info.breite, hoehe: info.hoehe, transparent: info.transparent, hell: info.hell }, env.assets.map(a => a.id));
  const { grund, ...a } = v;
  if (art === 'deko') { a.role = 'deko'; a.id = freieId('deko-' + name, env.assets.map(x => x.id)); a.tags = ['deko']; a.beschreibung = 'Gestaltungselement aus der Vorlage'; a.verwendung = []; }
  else if (art === 'logo' && !a.role.startsWith('logo')) { a.role = info.hell ? 'logo-negative' : 'logo-primary'; a.id = freieId(a.role, env.assets.map(x => x.id)); a.tags = ['logo']; a.beschreibung = 'Logo aus der Vorlage'; }
  else if (art === 'foto' && a.role.startsWith('logo')) { a.role = info.breite >= info.hoehe * 1.25 ? 'hero-image' : info.hoehe > info.breite * 1.15 ? 'portrait-image' : 'square-image'; a.id = freieId('bild-' + name, env.assets.map(x => x.id)); a.tags = ['vorlage']; a.beschreibung = 'Bild aus der Vorlage'; }
  env.assets.push(a); env.assetNachUrl.set(url, a.id);
  return a.id;
}

/* Bild-Element → Asset (Zuschnitt und runde Formen werden eingerechnet) */
async function bildAsset(env, e, box, art) {
  if (!e.bild) return null;
  const m = await medium(env, e.bild.media);
  if (!m) { env.hinweise.add(`Bild „${e.bild.media.split('/').pop()}“ hat ein Format, das Browser nicht anzeigen (zum Beispiel EMF oder WMF), und wurde weggelassen.`); return null; }
  const name = e.bild.media.split('/').pop().replace(/\.[a-z0-9]+$/i, '');
  if (!e.bild.crop && (!e.geo || e.geo === 'rect') && e.bild.alpha === undefined) return asset(env, { url: m.url, name, info: m, art });
  const url = await raster(env, e, box, { bild: e.bild });
  return url ? asset(env, { url, name: name + '-zugeschnitten', info: { ...(await analysiereBild(url)) }, art }) : null;
}

/* ============================================================
   4. Eine zusammengesetzte Fläche → Layout im Designsystem
   ============================================================ */
const ANKER = { t: 'top', ctr: 'middle', b: 'bottom' }, AUSRICHTUNG = { l: 'left', ctr: 'center', r: 'right', just: 'left', dist: 'left' };
const NAMEN_TYP = [
  [/titel ?folie|title ?slide|deckblatt|cover|titelseite|^titel$/i, 'title'],
  [/tabelle|table|tabellarisch/i, 'table'],
  [/kapitel|abschnitt|section|trenner|divider|zwischentitel|chapter/i, 'section'],
  [/danke|thank|kontakt|contact|abschluss|closing|schluss|ende\b|\bend\b|outro/i, 'closing'],
  [/zitat|quote|testimonial|stimme/i, 'quote'],
  [/kennzahl|kpi|zahlen|fakten|facts|numbers|statistik/i, 'kpi-grid'],
  [/zeitstrahl|timeline|roadmap|ablauf|prozess|process|meilenstein|milestone|phasen/i, 'timeline'],
  [/vergleich|comparison|gegenüber|vorher|before/i, 'two-column'],
  [/aussage|statement|claim|botschaft|highlight|hervorhebung|hervorgehoben|kernaussage|merksatz|fazit|takeaway|key ?message|big ?text|kernsatz/i, 'statement'],
  [/\bzahl\b|big ?number/i, 'big-number'],
  [/karten|cards|kacheln|tiles|säulen|pillars/i, 'cards']
];
const ZAHLIG = /^\s*[-+–−]?\s*[\d.,]+\s*(%|x|×|k|mio\.?|mrd\.?|€|\$|min\.?|h|std\.?|tage?|jahre?|t)?\s*$/i;
const BESCHR = {
  title: 'Überschrift als Aussage', subtitle: 'Untertitel: worum es geht, in einem Satz', meta: 'Anlass, Datum oder Name, kurz', number: 'Kapitelnummer, zum Beispiel 01',
  statement: 'Die eine starke Aussage', subline: 'Ein erklärender Satz', bullets: 'Stichpunkte, jeder ein vollständiger Gedanke', body: 'Kurzer Text',
  leftTitle: 'Überschrift links', rightTitle: 'Überschrift rechts', leftBullets: 'Stichpunkte links', rightBullets: 'Stichpunkte rechts',
  caption: 'Kurze Aussage zum Bild', value: 'Die Zahl mit Einheit, nur aus dem Briefing', label: 'Was die Zahl bedeutet', note: 'Quelle oder Einordnung',
  quote: 'Das Zitat', author: 'Wer das gesagt hat', contact: 'Kontakt, nur aus dem Briefing'
};
const LISTEN = new Set(['bullets', 'leftBullets', 'rightBullets']);
const PFLICHT = new Set(['title', 'statement', 'value', 'quote', 'bullets', 'leftBullets', 'rightBullets']);
const FELDER = {
  kpis: { value: ['Zahl mit Einheit, nur aus dem Briefing', 9], label: ['Was die Zahl bedeutet', 48], note: ['Einordnung', 40] },
  cards: { label: ['Kurzes Stichwort', 16], title: ['Kurzer Titel', 30], text: ['Ein, zwei Sätze', 100] },
  steps: { label: ['Zeitpunkt oder Phase', 12], title: ['Schritt', 28], text: ['Kurz erklärt', 70] }
};

/* Wie viel Text passt in eine Fläche? Vorsichtig geschätzt. */
const fassung = (box, pt, lh = 1.2) => ({ proZeile: (box.w / 100 * 960) / (0.52 * pt), zeilen: Math.max(1, Math.floor((box.h / 100 * 540) / (pt * lh))) });

async function baueLayout(fl, env) {
  const { W, H } = env, pct = b => ({ x: r2(b.x / W * 100), y: r2(b.y / H * 100), w: r2(b.w / W * 100), h: r2(b.h / H * 100) });
  const deko = [], slots = [], autos = [], uebrig = [];
  /* Gestaltung, die vor dem ersten Bild-Platzhalter liegt, gehört hinter die Bilder */
  let bildSlotGesehen = false;
  const legeAb = d => deko.push(bildSlotGesehen || d.shape === 'text' || d.hinten ? d : { ...d, hinten: true });
  const farbe = f => env.farbName(f.hex);
  const sichtbar = b => b.w > 0.05 && b.h >= 0 && b.x < 100 && b.y < 100 && b.x + b.w > 0 && b.y + b.h > 0;

  /* Hintergrund */
  let background = 'background';
  const hg = fl.hintergrund;
  if (hg && hg.hex && !hg.verlauf) background = farbe(hg);
  else if (hg && (hg.verlauf || hg.bild)) {
    if (hg.hex) background = farbe(hg);
    const url = await raster(env, { geo: 'rect' }, { x: 0, y: 0, w: 100, h: 100 }, hg);
    if (url) deko.push({ shape: 'image', x: 0, y: 0, w: 100, h: 100, asset: await asset(env, { url, name: 'hintergrund', info: await analysiereBild(url), art: 'deko' }), fit: 'cover', hinten: true });
  }

  const dekoForm = async (e, box) => {
    const f = e.fuellung, l = e.linie, extra = { ...(e.rot ? { rot: r2(e.rot) } : {}), ...(e.flipH ? { flipH: true } : {}), ...(e.flipV ? { flipV: true } : {}) };
    if (!f && !l) return;
    if (f && (f.verlauf || f.bild)) {
      const url = await raster(env, e, box, f);
      if (url) legeAb({ shape: 'image', ...box, asset: await asset(env, { url, name: f.bild ? 'bildflaeche' : 'verlauf', info: await analysiereBild(url), art: f.bild ? 'foto' : 'deko' }), fit: 'cover', ...extra });
      if (!l) return;
    }
    const d = { ...box, ...extra };
    if (e.geo === 'line' || /connector|^line$/i.test(e.geo)) { if (!l) return; Object.assign(d, { shape: 'line' }); }
    else if (e.geo === 'ellipse') d.shape = 'ellipse';
    else if (e.geo === 'rect' || !e.geo) d.shape = 'rect';
    else if (e.geo === 'roundRect') { d.shape = 'rect'; d.radius = r2(Math.min(box.w / 100 * 960, box.h / 100 * 540) * (e.adj !== undefined ? e.adj : 16667) / 100000); }
    else if (e.geo === 'pfad' && e.pfad) { d.shape = 'pfad'; d.pfad = e.pfad; }
    else { d.shape = 'preset'; d.prst = e.geo; }
    if (f && !f.verlauf && !f.bild) { d.fill = farbe(f); if (f.alpha < 1) d.opacity = f.alpha; }
    if (l) { d.stroke = farbe(l); d.strokeWidth = r2(l.pt * env.k); if (l.alpha < 1) d.strokeOpacity = l.alpha; }
    legeAb(d);
  };
  const dekoText = (e, box, st) => {
    const innen = ohneRand(e, box);
    legeAb({ shape: 'text', ...innen, text: st.text, style: stilVon(st, env) });
  };
  const ohneRand = (e, box) => {
    const r = e.text && e.text.raender || { l: 91440, r: 91440, t: 45720, b: 45720 };
    const l = r.l / W * 100, rr = r.r / W * 100, t = r.t / H * 100, b = r.b / H * 100;
    return { x: r2(box.x + l), y: r2(box.y + t), w: r2(Math.max(1, box.w - l - rr)), h: r2(Math.max(1, box.h - t - b)) };
  };

  for (const e of fl.elemente) {
    if (!e.box) continue;
    if (e.art === 'rahmen') {
      /* Tabelle (Platzhalter im Layout oder echte Tabelle auf einer Beispielfolie): ihre Fläche wird zur Tabellenfläche */
      const b = pct(e.box);
      if ((e.tabelle || (e.ph && e.ph.typ === 'tbl')) && sichtbar(b)) slots.push({ art: 'tabelle', box: b, flaeche: b.w * b.h / 10000, e });
      else if (fl.quelle === 'folie') env.hinweise.add('Diagramme aus Beispielfolien werden noch nicht übernommen.');
      continue;
    }
    const box = pct(e.box);
    if (!sichtbar(box)) continue;
    const flaeche = box.w * box.h / 10000;
    if (e.ph) {
      const t = e.ph.typ;
      if (['dt', 'sldNum', 'ftr', 'hdr'].includes(t)) {
        const st = textStil(e, env), innen = ohneRand(e, box);
        if (t === 'ftr' && st.text && fl.quelle === 'layout') dekoText(e, box, st);
        else if (t === 'ftr' && st.text && fl.quelle === 'folie') dekoText(e, box, st);
        else if (t !== 'hdr' && (fl.quelle === 'layout' || st.text)) autos.push({ auto: t === 'sldNum' ? 'pageNumber' : t === 'dt' ? 'date' : 'presentationTitle', box: innen, stil: st });
        continue;
      }
      if (t === 'tbl') { slots.push({ art: 'tabelle', box, flaeche, e }); continue; }
      if (['chart', 'dgm', 'media', 'clipArt'].includes(t)) continue;
      /* Auf Beispielfolien zeigt PowerPoint leere Platzhalter nicht an: sie sind keine Inhaltsflächen */
      if (fl.quelle === 'folie' && ((e.art === 'bild' && !e.bild) || (e.art === 'form' && t !== 'pic' && !(e.text && e.text.absaetze.some(a => a.text.trim()))))) { if (e.art === 'form' && (e.fuellung || e.linie)) await dekoForm(e, box); continue; }
      if (e.art === 'form') await dekoForm(e, box);
      if (t === 'pic' || e.art === 'bild') { bildSlotGesehen = true; slots.push({ art: 'bild', box, flaeche, e, standard: e.art === 'bild' ? await bildAsset(env, e, box, 'foto') : null }); continue; }
      slots.push({ art: 'text', box, innen: ohneRand(e, box), flaeche, phTyp: t, stil: textStil(e, env), e });
      continue;
    }
    if (e.art === 'bild') {
      const m = e.bild && await medium(env, e.bild.media);
      const logo = !!m && flaeche < 0.06 && (m.transparent || m.ext === 'svg' || /logo|marke|brand|signet/i.test(e.name + ' ' + e.bild.media));
      if (fl.quelle === 'folie' && !logo && flaeche >= 0.08 && e.herkunft === 'eigen') { bildSlotGesehen = true; slots.push({ art: 'bild', box, flaeche, e, standard: await bildAsset(env, e, box, 'foto') }); continue; }
      const id = await bildAsset(env, e, box, logo ? 'logo' : flaeche >= 0.08 ? 'foto' : 'deko');
      if (id) legeAb({ shape: 'image', ...box, asset: id, fit: logo ? 'contain' : 'cover', ...(e.rot ? { rot: r2(e.rot) } : {}), ...(logo ? { logo: true } : {}) });
      continue;
    }
    /* Form ohne Platzhalter */
    await dekoForm(e, box);
    const st = e.text ? textStil(e, env) : null;
    if (!st || !st.text) continue;
    if (fl.quelle === 'folie' && e.herkunft === 'eigen' && st.sz >= 9 && !(box.y > 88 && st.sz < 12)) slots.push({ art: 'text', box, innen: ohneRand(e, box), flaeche, phTyp: '', stil: st, e });
    else dekoText(e, box, st);
  }

  const z = ordneZu(fl, slots, env);
  if (!z) return null;
  const placeholders = [];
  for (const [slot, id] of z.felder) {
    if (slot.art === 'bild') {
      const a = slot.standard || env.standardFoto(slot.box);
      placeholders.push({ id, typ: 'image', beschreibung: 'Bild', x: slot.box.x, y: slot.box.y, w: slot.box.w, h: slot.box.h, fit: 'cover', ...(a ? { asset: a } : {}) });
    } else if (id === 'table') {
      /* Der Rahmen einer Tabelle ist nur so hoch wie ihre Zeilen: die Fläche reicht bis zum nächsten Element darunter oder bis zum Fußbereich */
      const b = slot.innen || slot.box, unten = Math.min(88, ...slots.filter(s => s !== slot && s.box.y >= b.y + b.h - 0.5 && s.box.x < b.x + b.w && b.x < s.box.x + s.box.w).map(s => s.box.y - 2));
      placeholders.push({ id, typ: 'table', beschreibung: 'Tabelle', x: b.x, y: b.y, w: b.w, h: r2(Math.max(b.h, unten - b.y)) });
    } else {
      const ph = textPh(id, slot, env, z.typ);
      /* Text der Beispielfolie: zeigt der KI, wie lang und in welchem Ton die Vorlage dieses Feld füllt */
      if (fl.quelle === 'folie' && slot.stil && slot.stil.text && !/^(click|klicken|text|titel|title)\b/i.test(slot.stil.text)) ph.beispiel = slot.stil.text.replace(/\s+/g, ' ').trim().slice(0, 160);
      placeholders.push(ph);
    }
  }
  if (z.items) placeholders.push(z.items);
  const AUTO_ID = { pageNumber: 'page', date: 'datum', presentationTitle: 'footer' };
  autos.forEach(a => { let id = AUTO_ID[a.auto]; for (let i = 2; placeholders.some(p => p.id === id); i++) id = AUTO_ID[a.auto] + i; placeholders.push({ id, typ: 'text', auto: a.auto, ...a.box, style: stilVon(a.stil, env) }); });
  /* kurze feste Texte aus Beispielfolien (zum Beispiel „01“) bleiben als Gestaltung erhalten */
  slots.filter(s => s.art === 'text' && !z.felder.has(s) && !z.genutzt.has(s)).forEach(s => { if (fl.quelle === 'folie' && [...s.stil.text].length <= 4) legeAb({ shape: 'text', ...s.innen, text: s.stil.text, style: stilVon(s.stil, env) }); else uebrig.push(s); });

  sichereKontrast(placeholders, deko, background, env);
  return { typ: z.typ, name: fl.name || (fl.quelle === 'folie' ? `Folie ${fl.nr}` : 'Layout'), quelle: fl.quelle, nr: fl.nr, background, deko, placeholders, uebrig: uebrig.length };
}

/* Lesbarkeit sichern: Liegt Text auf einer Fläche, von der er sich kaum abhebt (zum Beispiel weil die Farbe
   in der Vorlage über das Farbschema eines anderen Hintergrunds kam), wird er hell oder dunkel gesetzt. */
function sichereKontrast(placeholders, deko, background, env) {
  const hex = f => env.colors[f] || (/^#[0-9A-F]{6}$/i.test(f || '') ? f : null);
  const unter = b => {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const d = [...deko].reverse().find(d => d.shape !== 'text' && d.shape !== 'line' && cx >= d.x && cx <= d.x + d.w && cy >= d.y && cy <= d.y + d.h && (d.fill !== undefined || d.shape === 'image'));
    if (d && d.shape === 'image') return null;
    if (d && (d.opacity === undefined || d.opacity > 0.6)) return hex(d.fill);
    return hex(background);
  };
  const pruefe = (stil, b, ph) => {
    const fg = hex(stil.color), bg = unter(b);
    if (ph && bg && bg !== hex(background)) ph.on = env.farbName(bg);
    if (!fg || !bg || kontrast(fg, bg) >= 2.2) return;
    stil.color = env.farbName(kontrast('#FFFFFF', bg) >= kontrast(env.textHex, bg) ? '#FFFFFF' : env.textHex, 'text');
  };
  placeholders.forEach(p => {
    if (p.style && (p.typ === 'text' || p.typ === 'bullets')) pruefe(p.style, p, p);
    if (p.zellen) p.felder.forEach(f => f.style && p.zellen[0] && p.zellen[0][f.id] && pruefe(f.style, p.zellen[0][f.id]));
  });
  deko.filter(d => d.shape === 'text' && d.style).forEach(d => pruefe(d.style, d));
}

function stilVon(st, env) {
  return {
    font: st.kopf ? 'heading' : 'body', size: Math.max(6, Math.round(st.sz * 2) / 2), color: env.farbName(st.farbe.hex, 'text'),
    ...(st.b !== undefined ? { bold: !!st.b } : {}), ...(st.i ? { italic: true } : {}), ...(st.caps ? { uppercase: true } : {}),
    align: AUSRICHTUNG[st.algn] || 'left', valign: ANKER[st.anker] || 'top'
  };
}
function textPh(id, slot, env, typ) {
  const st = slot.stil, box = slot.innen, liste = LISTEN.has(id), kopf = /title|statement|value|quote|number/i.test(id);
  const style = stilVon(st, env);
  if (liste) style.bullet = st.bullet === false ? 'none' : 'dot';
  const f = fassung(box, style.size, env.zeilenhoehe);
  const ph = { id, typ: liste ? 'bullets' : 'text', beschreibung: typ === 'title' && id === 'title' ? 'Titel der Präsentation' : BESCHR[id] || 'Text', ...(PFLICHT.has(id) ? { pflicht: true } : {}), x: box.x, y: box.y, w: box.w, h: box.h, style };
  if (liste) Object.assign(ph, { maxItems: grenze(f.zeilen / 1.7, 2, 7), maxCharsPerItem: grenze(f.proZeile * 1.6, 25, 160) });
  else ph.maxChars = grenze(f.proZeile * Math.min(f.zeilen, kopf ? 3 : 8) * 0.85, id === 'value' || id === 'number' ? 3 : 10, id === 'value' ? 12 : 420);
  return ph;
}

/* Reihe gleich großer Textflächen nebeneinander (Karten, Kennzahlen, Zeitstrahl) */
function findeReihe(slots) {
  const gleich = (a, b) => Math.abs(a.box.y - b.box.y) < 3 && Math.abs(a.box.h - b.box.h) < Math.max(2, a.box.h * 0.3) && Math.abs(a.box.w - b.box.w) < Math.max(2, a.box.w * 0.3);
  const reihen = [];
  slots.forEach(s => { const r = reihen.find(r => gleich(r[0], s) && r.every(x => x.box.x + x.box.w <= s.box.x + 0.5 || s.box.x + s.box.w <= x.box.x + 0.5)); if (r) r.push(s); else reihen.push([s]); });
  const mehr = reihen.filter(r => r.length >= 2).map(r => r.sort((a, b) => a.box.x - b.box.x));
  if (!mehr.length) return null;
  /* übereinanderliegende Reihen mit gleicher Spaltenzahl zu Kacheln mit mehreren Feldern stapeln */
  mehr.sort((a, b) => a[0].box.y - b[0].box.y);
  let best = null;
  mehr.forEach((basis, i) => {
    const stapel = [basis];
    mehr.slice(i + 1).forEach(r => { const unten = stapel[stapel.length - 1]; if (r.length === basis.length && r[0].box.y > unten[0].box.y && r[0].box.y - (unten[0].box.y + unten[0].box.h) < 20 && r.every((s, j) => Math.abs(s.box.x + s.box.w / 2 - (basis[j].box.x + basis[j].box.w / 2)) < 6)) stapel.push(r); });
    const wert = basis.length * 10 + stapel.length;
    if (!best || wert > best.wert) best = { wert, n: basis.length, items: basis.map((_, j) => stapel.map(r => r[j])) };
  });
  return best;
}

function ordneZu(fl, slots, env) {
  const T = slots.filter(s => s.art === 'text'), B = slots.filter(s => s.art === 'bild'), body = env.bodyPt;
  const nachName = n => (NAMEN_TYP.find(([re]) => re.test(n || '')) || [])[1];
  const hint = nachName(fl.name) || nachName(fl.layoutName) || (fl.typ === 'title' ? 'title' : fl.typ === 'secHead' ? 'section' : '');
  const zahlig = s => ZAHLIG.test(s.stil.text || '');
  const felder = new Map(), genutzt = new Set(), gib = (s, id) => { if (s) { felder.set(s, id); genutzt.add(s); } };
  const nachY = l => [...l].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x), nachFlaeche = l => [...l].sort((a, b) => b.flaeche - a.flaeche);
  const gross = s => s.stil.sz >= body * 1.6;
  let titel = T.find(s => /^(title|ctrTitle)$/.test(s.phTyp));
  if (!titel && fl.quelle === 'folie') titel = T.filter(s => s.box.y < 40 && s.stil.sz >= body * 1.2 && !zahlig(s)).sort((a, b) => b.stil.sz - a.stil.sz || a.box.y - b.box.y)[0];
  const rest = () => T.filter(s => !genutzt.has(s));
  const fertig = typ => ({ typ, felder, genutzt, items: null });

  /* Tabellenfolie: Tabelle (oder bei einem Layout namens „Tabelle“ die größte Textfläche) unter der Überschrift */
  const tab = nachFlaeche(slots.filter(s => s.art === 'tabelle'))[0] || (hint === 'table' ? nachFlaeche(T.filter(s => s !== titel))[0] : null);
  if (tab && tab.box.w >= 35 && tab.box.y + tab.box.h < 95 && hint !== 'title') {
    gib(tab, 'table');
    gib(titel || nachY(rest()).find(s => s.box.y < tab.box.y), 'title');
    return fertig('table');
  }

  /* Titelfolie */
  if (hint === 'title' || T.some(s => s.phTyp === 'ctrTitle')) {
    gib(titel || nachFlaeche(T)[0], 'title');
    const r = nachY(rest()); gib(r[0], 'subtitle'); gib(r[1], 'meta');
    if (B[0]) gib(B[0], 'image');
    return felder.size ? fertig('title') : null;
  }
  if (hint === 'section') {
    const nr = rest().find(s => s !== titel && zahlig(s)); if (nr) gib(nr, 'number');
    gib(titel || nachFlaeche(rest())[0], 'title'); gib(nachY(rest())[0], 'subtitle');
    return genutzt.size ? fertig('section') : null;
  }
  if (hint === 'closing') {
    gib(titel || nachFlaeche(rest())[0], 'title');
    const r = nachFlaeche(rest()); gib(r[0], 'body'); gib(nachY(rest())[0], 'contact');
    return genutzt.size ? fertig('closing') : null;
  }
  /* Bilder */
  const vollbild = B.find(b => b.flaeche >= 0.55), teilbild = nachFlaeche(B.filter(b => b.flaeche >= 0.08))[0];
  if (vollbild && T.length) {
    gib(vollbild, 'image'); gib(titel || nachFlaeche(rest()).sort((a, b) => b.stil.sz - a.stil.sz)[0], 'title'); gib(nachY(rest())[0], 'caption');
    return fertig('image-full');
  }
  if (teilbild && T.length) {
    gib(teilbild, 'image');
    gib(titel || nachY(rest())[0], 'title');
    const k = nachFlaeche(rest())[0];
    if (k) gib(k, fassung(k.innen, k.stil.sz).zeilen >= 3 ? 'bullets' : 'caption');
    return fertig(teilbild.box.x + teilbild.box.w / 2 < 50 ? 'image-left' : 'image-right');
  }
  /* Kacheln */
  const reihe = findeReihe(T.filter(s => s !== titel));
  if (reihe && (reihe.n >= 3 || (reihe.n >= 2 && (hint === 'kpi-grid' || hint === 'cards' || reihe.items.every(it => zahlig(it[0])))))) {
    const erste = reihe.items.map(it => it[0]);
    const zahlen = hint === 'kpi-grid' || erste.every(zahlig) || (fl.quelle === 'layout' && erste[0].stil.sz >= body * 1.8);
    const zeit = hint === 'timeline' || erste.every(s => /\b(19|20)\d\d\b|\bQ[1-4]\b|phase|schritt|step|stufe|\d{1,2}\.\d{1,2}\./i.test(s.stil.text || ''));
    const typ = zahlen ? 'kpi-grid' : zeit ? 'timeline' : 'cards', id = zahlen ? 'kpis' : zeit ? 'steps' : 'cards';
    const k = Math.min(3, reihe.items[0].length);
    const ids = zahlen ? ['value', 'label', 'note'] : k === 1 ? ['title'] : k === 2 ? (zeit ? ['label', 'title'] : ['title', 'text']) : ['label', 'title', 'text'];
    const zellen = reihe.items.map(it => Object.fromEntries(it.slice(0, k).map((s, j) => [ids[j], s.innen])));
    reihe.items.forEach(it => it.slice(0, k).forEach(s => genutzt.add(s)));
    const felderPh = ids.slice(0, k).map((fid, j) => {
      const s = reihe.items[0][j], st = stilVon(s.stil, env), min = Math.min(...reihe.items.map(it => fassung(it[j].innen, st.size, env.zeilenhoehe)).map(f => f.proZeile * Math.min(f.zeilen, fid === 'text' ? 5 : 2)));
      const [beschreibung, max] = FELDER[id][fid] || ['Text', 60];
      return { id: fid, beschreibung, maxChars: grenze(Math.min(min * 0.85, max * 1.5), fid === 'value' ? 3 : 8, max * 1.5), style: st };
    });
    const alle = reihe.items.flat().map(s => s.innen), x = Math.min(...alle.map(b => b.x)), y = Math.min(...alle.map(b => b.y));
    const items = { id, typ: 'items', beschreibung: typ === 'kpi-grid' ? 'Kennzahlen, nur mit Zahlen aus dem Briefing' : typ === 'timeline' ? 'Schritte in zeitlicher Reihenfolge' : 'Gleichwertige Punkte', pflicht: true,
      x: r2(x), y: r2(y), w: r2(Math.max(...alle.map(b => b.x + b.w)) - x), h: r2(Math.max(...alle.map(b => b.y + b.h)) - y),
      maxItems: reihe.n, minItems: reihe.n, variante: 'frei', felder: felderPh, zellen };
    gib(titel, 'title');
    return { ...fertig(typ), items };
  }
  /* Zwei Spalten */
  const koerper = rest().filter(s => s !== titel && s.box.w < 58 && fassung(s.innen, s.stil.sz).zeilen >= 2);
  const paar = koerper.flatMap((a, i) => koerper.slice(i + 1).map(b => [a, b])).filter(([a, b]) => Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y) > Math.min(a.box.h, b.box.h) * 0.5 && (a.box.x + a.box.w <= b.box.x + 1 || b.box.x + b.box.w <= a.box.x + 1))
    .sort((p, q) => (q[0].flaeche + q[1].flaeche) - (p[0].flaeche + p[1].flaeche))[0];
  if (paar) {
    const [links, rechts] = paar.sort((a, b) => a.box.x - b.box.x);
    gib(titel, 'title'); gib(links, 'leftBullets'); gib(rechts, 'rightBullets');
    const kopfUeber = sp => rest().filter(s => s !== titel && Math.abs(s.box.x - sp.box.x) < 6 && s.box.y < sp.box.y && sp.box.y - (s.box.y + s.box.h) < 12 && fassung(s.innen, s.stil.sz).zeilen <= 2).sort((a, b) => b.box.y - a.box.y)[0];
    gib(kopfUeber(links), 'leftTitle'); gib(kopfUeber(rechts), 'rightTitle');
    return fertig('two-column');
  }
  /* Eine große Aussage oder Zahl */
  if (hint === 'quote') { const r = nachFlaeche(rest()).sort((a, b) => b.stil.sz - a.stil.sz); gib(r[0], 'quote'); gib(nachY(rest())[0], 'author'); return genutzt.size ? fertig('quote') : null; }
  const andere = rest().filter(s => s !== titel);
  const gr = andere.filter(gross).sort((a, b) => b.stil.sz - a.stil.sz)[0] || (!andere.length && titel && (titel.box.h >= 18 || titel.box.y > 22) ? titel : null);
  if (gr && (!titel || gr === titel || hint === 'statement' || hint === 'big-number' || zahlig(gr) || !andere.some(s => !gross(s) && fassung(s.innen, s.stil.sz).zeilen >= 4))) {
    if (hint === 'big-number' || zahlig(gr)) { gib(gr, 'value'); const r = rest().sort((a, b) => b.stil.sz - a.stil.sz); gib(r[0], 'label'); gib(nachY(rest())[0], 'note'); return fertig('big-number'); }
    gib(gr, 'statement'); gib(nachY(rest()).find(s => s !== titel), 'subline');
    return fertig('statement');
  }
  /* Titel und Text */
  if (titel && andere.length) {
    gib(titel, 'title');
    const k = nachFlaeche(andere)[0];
    gib(k, 'bullets');
    return fertig('content-bullets');
  }
  return null;
}

/* ============================================================
   5. Fehlende Folientypen aus den eigenen Layouts ableiten
   ============================================================ */
function leiteAb(vorhandene, env) {
  const hat = t => vorhandene.some(l => l.typ === t) || neu.some(l => l.typ === t), erstes = t => vorhandene.find(l => l.typ === t);
  const ph = (l, id) => l && l.placeholders.find(p => p.id === id);
  const inhalt = erstes('content-bullets') || erstes('image-left') || erstes('image-right') || erstes('two-column');
  const betont = erstes('statement') || erstes('section') || erstes('title') || inhalt;
  const titelL = erstes('title') || betont;
  const neu = [], fest = l => ({ ...kopie(l), placeholders: kopie(l.placeholders.filter(p => p.auto || p.typ === 'logo')) });
  const body = env.bodyPt;
  const flaecheVon = l => {
    /* Inhaltsbereich unter der Überschrift */
    const t = ph(l, 'title'), koerper = l.placeholders.filter(p => !p.auto && p.id !== 'title' && p.typ !== 'image');
    if (koerper.length) { const x = Math.min(...koerper.map(p => p.x)), y = Math.min(...koerper.map(p => p.y)); return { x, y, w: Math.max(...koerper.map(p => p.x + p.w)) - x, h: Math.max(...koerper.map(p => p.y + p.h)) - y }; }
    const y = t ? t.y + t.h + 3 : 22; return { x: t ? t.x : 6, y, w: t ? t.w : 88, h: Math.max(20, 88 - y) };
  };
  const kurz = n => String(n || '').replace(/\s*\((abgeleitet|gespiegelt)[^]*$/, '');
  const herkunft = l => l.abgeleitet ? (l.basisName || kurz(l.name)) : kurz(l.name);
  const mit = (basis, typ, name, phs) => { const l = fest(basis); Object.assign(l, { typ, name: `${typName(typ)} (abgeleitet aus „${herkunft(basis)}“)`, abgeleitet: true, basisName: herkunft(basis) }); l.placeholders = [...kopie(phs), ...l.placeholders]; neu.push(l); };
  const titelPh = (l, extra = {}) => { const t = ph(l, 'title'); return t ? { ...kopie(t), ...extra } : null; };
  const stil = (p, extra) => ({ ...(p ? kopie(p.style) : { font: 'heading', size: 30, color: 'text' }), ...extra });

  if (inhalt && !hat('content-bullets')) {
    const f = flaecheVon(inhalt), t = titelPh(inhalt);
    mit(inhalt, 'content-bullets', '', [t, textPh('bullets', { innen: f, stil: { sz: body, farbe: { hex: env.textHex }, algn: 'l', anker: 't', kopf: false } }, env)].filter(Boolean));
  }
  const inhaltsL = erstes('content-bullets') || neu.find(l => l.typ === 'content-bullets');
  const liste = inhaltsL && ph(inhaltsL, 'bullets');
  if (inhaltsL && liste) {
    const f = { x: liste.x, y: liste.y, w: liste.w, h: liste.h }, t = titelPh(inhaltsL), gap = 4;
    if (!hat('two-column')) {
      const halb = (f.w - gap) / 2;
      mit(inhaltsL, 'two-column', '', [t, { ...kopie(liste), id: 'leftTitle', typ: 'text', beschreibung: BESCHR.leftTitle, pflicht: true, x: f.x, y: f.y, w: r2(halb), h: 8, maxChars: 30, style: { ...stil(liste), font: 'heading', bold: true, size: Math.round(liste.style.size * 1.15) } },
        { ...kopie(liste), id: 'leftBullets', beschreibung: BESCHR.leftBullets, x: f.x, y: r2(f.y + 10), w: r2(halb), h: r2(f.h - 10), maxCharsPerItem: Math.round(liste.maxCharsPerItem * 0.55) },
        { ...kopie(liste), id: 'rightTitle', typ: 'text', beschreibung: BESCHR.rightTitle, pflicht: true, x: r2(f.x + halb + gap), y: f.y, w: r2(halb), h: 8, maxChars: 30, style: { ...stil(liste), font: 'heading', bold: true, size: Math.round(liste.style.size * 1.15) } },
        { ...kopie(liste), id: 'rightBullets', beschreibung: BESCHR.rightBullets, x: r2(f.x + halb + gap), y: r2(f.y + 10), w: r2(halb), h: r2(f.h - 10), maxCharsPerItem: Math.round(liste.maxCharsPerItem * 0.55) }].filter(Boolean).map(p => { if (p.typ === 'text') { delete p.maxItems; delete p.maxCharsPerItem; delete p.style.bullet; } return p; }));
    }
    const karten = (id, typ, felder, variante, n) => mit(inhaltsL, typ, '', [t, { id, typ: 'items', beschreibung: typ === 'kpi-grid' ? 'Kennzahlen, nur mit Zahlen aus dem Briefing' : typ === 'timeline' ? 'Schritte in zeitlicher Reihenfolge' : 'Gleichwertige Punkte', pflicht: true, x: f.x, y: r2(f.y + 2), w: f.w, h: r2(Math.min(f.h - 2, typ === 'timeline' ? 40 : 46)), maxItems: n, minItems: Math.min(2, n), variante, ...(variante === 'karten' ? { on: 'surface' } : {}), felder }].filter(Boolean));
    const textFarbe = liste.style.color;
    if (!hat('cards')) karten('cards', 'cards', [{ id: 'title', beschreibung: FELDER.cards.title[0], maxChars: 26, anteil: 2, style: { font: 'heading', size: Math.round(body * 1.2), color: textFarbe, bold: true } }, { id: 'text', beschreibung: FELDER.cards.text[0], maxChars: 90, anteil: 3, style: { size: Math.round(body * 0.85), color: textFarbe } }], 'karten', 3);
    if (!hat('kpi-grid')) karten('kpis', 'kpi-grid', [{ id: 'value', beschreibung: FELDER.kpis.value[0], maxChars: 9, anteil: 2, style: { font: 'heading', size: Math.round(body * 2.4), color: env.akzentName, bold: true } }, { id: 'label', beschreibung: FELDER.kpis.label[0], maxChars: 48, anteil: 2, style: { size: Math.round(body * 0.85), color: textFarbe } }], 'karten', 4);
    if (!hat('timeline')) karten('steps', 'timeline', [{ id: 'label', beschreibung: FELDER.steps.label[0], maxChars: 12, style: { font: 'heading', size: Math.round(body * 1.1), color: env.akzentName, bold: true } }, { id: 'title', beschreibung: FELDER.steps.title[0], maxChars: 28, style: { size: body, color: textFarbe, bold: true } }, { id: 'text', beschreibung: FELDER.steps.text[0], maxChars: 70, style: { size: Math.round(body * 0.8), color: textFarbe } }], 'zeitstrahl', 5);
    for (const [typ, links] of [['image-left', true], ['image-right', false]]) {
      if (hat(typ)) continue;
      const anders = erstes(links ? 'image-right' : 'image-left');
      if (anders) { const l = kopie(anders); l.placeholders.forEach(p => { if (!p.auto) p.x = r2(100 - p.x - p.w); }); (l.deko || []).forEach(d => { if (!d.logo && d.shape !== 'text') d.x = r2(100 - d.x - d.w); }); Object.assign(l, { typ, name: `${typName(typ)} (gespiegelt aus „${herkunft(anders)}“)`, abgeleitet: true, basisName: herkunft(anders) }); neu.push(l); continue; }
      const bw = r2(f.w * 0.42);
      mit(inhaltsL, typ, '', [{ id: 'image', typ: 'image', beschreibung: 'Bild', x: links ? f.x : r2(f.x + f.w - bw), y: f.y, w: bw, h: f.h, fit: 'cover', ...(env.standardFoto(f) ? { asset: env.standardFoto(f) } : {}) }, t, { ...kopie(liste), x: links ? r2(f.x + bw + 4) : f.x, w: r2(f.w - bw - 4), maxCharsPerItem: Math.round(liste.maxCharsPerItem * 0.55), maxItems: Math.min(liste.maxItems, 4) }].filter(Boolean));
    }
  }
  /* Betonte Layouts aus Kapitel- oder Titelfolie */
  if (betont) {
    const t = ph(betont, 'title') || ph(betont, 'statement'), u = ph(betont, 'subtitle') || ph(betont, 'subline');
    const flaeche = t ? { x: t.x, y: r2(Math.max(6, t.y - (t.h < 20 ? 6 : 0))), w: t.w, h: r2(Math.max(t.h, 26)) } : { x: 8, y: 26, w: 84, h: 30 };
    const gross = t ? t.style.size : 40;
    if (!hat('statement')) mit(betont, 'statement', '', [{ id: 'statement', typ: 'text', beschreibung: BESCHR.statement, pflicht: true, ...flaeche, maxChars: 90, style: stil(t, { size: Math.max(gross, Math.round(body * 2)) }) }, ...(u ? [{ ...kopie(u), id: 'subline', beschreibung: BESCHR.subline, pflicht: false }] : [])]);
    if (!hat('big-number')) mit(betont, 'big-number', '', [{ id: 'value', typ: 'text', beschreibung: BESCHR.value, pflicht: true, ...flaeche, maxChars: 8, style: stil(t, { size: Math.round(Math.max(gross * 1.9, body * 4.5)), bold: true }) }, { id: 'label', typ: 'text', beschreibung: BESCHR.label, pflicht: true, x: flaeche.x, y: r2(Math.min(84, flaeche.y + flaeche.h + 2)), w: flaeche.w, h: 10, maxChars: 70, style: u ? kopie(u.style) : stil(t, { size: Math.round(body * 1.2), bold: false }) }]);
    if (!hat('quote')) mit(betont, 'quote', '', [{ id: 'quote', typ: 'text', beschreibung: BESCHR.quote, pflicht: true, ...flaeche, maxChars: 140, style: stil(t, { size: Math.round(Math.max(body * 1.5, gross * 0.7)), italic: true, bold: false }) }, { id: 'author', typ: 'text', beschreibung: BESCHR.author, x: flaeche.x, y: r2(Math.min(86, flaeche.y + flaeche.h + 2)), w: flaeche.w, h: 7, maxChars: 50, style: u ? kopie(u.style) : stil(t, { size: body, bold: false, italic: false }) }]);
    if (!hat('section')) mit(betont, 'section', '', [{ id: 'title', typ: 'text', beschreibung: 'Kapiteltitel', pflicht: true, ...flaeche, maxChars: 50, style: stil(t) }, ...(u ? [{ ...kopie(u), id: 'subtitle', beschreibung: BESCHR.subtitle, pflicht: false }] : [])]);
  }
  if (titelL && !hat('closing')) {
    const t = ph(titelL, 'title'), u = ph(titelL, 'subtitle') || ph(titelL, 'subline'), m = ph(titelL, 'meta');
    mit(titelL, 'closing', '', [t && { ...kopie(t), beschreibung: 'Die Bitte oder der Schlussgedanke als kurze Aussage, kein bloßes „Vielen Dank“', pflicht: true }, u && { ...kopie(u), id: 'body', beschreibung: 'Die Bitte oder Handlungsaufforderung', pflicht: false }, m && { ...kopie(m), id: 'contact', beschreibung: BESCHR.contact, pflicht: false }].filter(Boolean));
  }
  if (titelL && !hat('image-full')) {
    const t = ph(titelL, 'title');
    const l = { ...fest(titelL), deko: [{ shape: 'rect', x: 0, y: 0, w: 100, h: 100, fill: '#000000', opacity: 0.38 }, ...(titelL.deko || []).filter(d => d.logo)], background: titelL.background, typ: 'image-full', name: `${typName('image-full')} (abgeleitet aus „${herkunft(titelL)}“)`, abgeleitet: true };
    l.placeholders = [{ id: 'image', typ: 'image', beschreibung: 'Bild', x: 0, y: 0, w: 100, h: 100, fit: 'cover', ...(env.standardFoto({ w: 100, h: 100 }) ? { asset: env.standardFoto({ w: 100, h: 100 }) } : {}) },
      { id: 'title', typ: 'text', beschreibung: 'Kurze Aussage zum Bild', pflicht: true, x: 7, y: 56, w: 70, h: 22, maxChars: 70, style: stil(t, { color: '#FFFFFF', valign: 'bottom', size: Math.round(Math.max(body * 1.8, (t ? t.style.size : 36) * 0.85)) }) },
      { id: 'caption', typ: 'text', beschreibung: BESCHR.caption, x: 7, y: 80, w: 70, h: 8, maxChars: 90, style: { font: 'body', size: Math.round(body * 1.05), color: '#FFFFFF', align: t && t.style.align || 'left' } }, ...l.placeholders];
    neu.push(l);
  }
  return neu;
}

/* ============================================================
   6. Alles zusammen: Datei → Designsystem-Paket
   ============================================================ */
/* opts: { name, vergebeneIds, basis, folien: true (Beispielfolien mitnehmen), maxLayouts } */
export async function importPptx(datei, JSZip, opts = {}) {
  const roh = await lesePptx(datei, JSZip), bericht = [], th = roh.theme, F = th.farben;
  const hinweise = new Set();

  /* Farben */
  const dunkel = F.dk1 || '#1A1A1A', hell = F.lt1 || '#FFFFFF';
  const primary = F.dk2 && kontrast(F.dk2, hell) >= 3 && F.dk2 !== dunkel ? F.dk2 : (F.accent1 || dunkel);
  const flaeche = F.lt2 && F.lt2 !== hell && kontrast(dunkel, F.lt2) >= 7 ? F.lt2 : mische(hell, dunkel, 0.05);
  let muted = mische(dunkel, hell, 0.4); for (let t = 0.35; (kontrast(muted, hell) < 4.6 || kontrast(muted, flaeche) < 4.6) && t >= 0; t -= 0.05) muted = mische(dunkel, hell, t);
  const palette = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(k => F[k]).filter(Boolean);
  const colors = {
    primary, secondary: F.accent1 && F.accent1 !== primary ? F.accent1 : (F.accent2 || primary), accent: F.accent2 && F.accent2 !== primary ? F.accent2 : (F.accent3 || F.accent1 || primary),
    background: hell, surface: flaeche, text: dunkel, textMuted: muted,
    success: '#1E8E5A', warning: '#B26A00', error: '#C0392B', onDark: '#FFFFFF', onDarkMuted: mische('#FFFFFF', primary, 0.25), border: mische(hell, dunkel, 0.16),
    chartPalette: palette.length >= 3 ? palette : [primary, '#17B3A3', '#2E5E8C', '#F2A541', '#7A5AF8', '#E4572E']
  };
  bericht.push(`Farben aus dem Theme „${th.name || 'ohne Namen'}“ übernommen: ${Object.keys(F).length} Theme-Farben gefunden.`);
  /* Farbwert → Name aus den Tokens (Text bevorzugt Textfarben, Flächen die Flächenfarben), sonst der Wert selbst */
  const REIHE = { text: ['text', 'textMuted', 'onDark', 'onDarkMuted', 'primary', 'secondary', 'accent'], flaeche: ['primary', 'secondary', 'accent', 'background', 'surface', 'border'] };
  const farbName = (hex, art = 'flaeche') => [...REIHE[art], ...Object.keys(colors)].find(k => k !== 'chartPalette' && colors[k] === hex) || hex;

  /* Grundgrößen aus dem Master: Text der ersten Ebene */
  const k = 960 / (roh.W / 914400 * 72);
  const M0 = Object.values(roh.masters)[0], ts = M0.textstile || {};
  const bodyPt = grenze(((ts.body && ts.body[1] && ts.body[1].sz) || 18) * k, 10, 40);

  const env = {
    zip: roh.zip, W: roh.W, H: roh.H, k, theme: { ...th, farben: F }, farbName, colors, bodyPt, zeilenhoehe: 1.2, hinweise,
    medien: new Map(), dateien: {}, assets: [], assetNachUrl: new Map(), akzentName: 'accent', textHex: dunkel,
    standardFoto: box => { const quer = !box.h || box.w / box.h >= 1.2; const a = env.assets.find(x => x.role === (quer ? 'hero-image' : 'portrait-image')) || env.assets.find(x => /image$/.test(x.role)); return a ? a.id : null; }
  };

  /* Layouts und Beispielfolien in Designsystem-Layouts übersetzen */
  const quellen = [...roh.layouts.map(L => setzeZusammen(L, roh.masters[L.master] || M0, null)),
    ...(opts.folien === false ? [] : roh.folien.map(S => setzeZusammen(S, roh.masters[S.master] || M0, roh.layouts.find(L => L.pfad === S.layout) || null)))];
  const kandidaten = [];
  for (const q of quellen) { const l = await baueLayout(q, env); if (l) kandidaten.push(l); else if (q.quelle === 'layout' && q.elemente.some(e => e.ph && !['dt', 'sldNum', 'ftr', 'hdr'].includes(e.ph.typ))) hinweise.add(`Layout „${q.name}“ hat keine nutzbare Inhaltsfläche (nur Titel oder leer) und wurde nicht übernommen.`); }

  /* Doppelte aussortieren: gleicher Typ, gleiche Flächen, gleiche Gestaltung */
  const sig = l => [l.typ, l.background, l.placeholders.filter(p => !p.auto).map(p => `${p.id}:${Math.round(p.x / 3)},${Math.round(p.y / 3)},${Math.round(p.w / 3)},${Math.round(p.h / 3)}`).sort().join('|'), l.deko.length].join('#');
  const gesehen = new Set(), jeTyp = {}, max = opts.maxLayouts || 36, eigene = [];
  for (const l of kandidaten) {
    const s = sig(l); if (gesehen.has(s)) continue; gesehen.add(s);
    jeTyp[l.typ] = (jeTyp[l.typ] || 0) + 1;
    if (jeTyp[l.typ] > 4 || eigene.length >= max) continue;
    eigene.push(l);
  }
  /* Kartenfarbe aus der Vorlage: die häufigste helle, nicht weiße Fläche */
  const hell2 = {};
  eigene.forEach(l => l.deko.forEach(d => { const h = colors[d.fill] || d.fill; if (d.shape === 'rect' && /^#[0-9A-F]{6}$/i.test(h || '') && h !== colors.background && kontrast(h, '#000000') > 14 && kontrast(colors.text, h) >= 7) hell2[h] = (hell2[h] || 0) + 1; }));
  const kartenFarbe = Object.entries(hell2).sort((a, b) => b[1] - a[1])[0];
  if (kartenFarbe) { colors.surface = kartenFarbe[0]; bericht.push(`Flächenfarbe für Karten aus der Vorlage: ${kartenFarbe[0]}.`); }
  const zuWenig = !eigene.some(l => ['content-bullets', 'image-left', 'image-right', 'two-column', 'cards', 'kpi-grid', 'timeline'].includes(l.typ)) && !eigene.some(l => ['title', 'section', 'statement'].includes(l.typ));

  /* Tabellenstil der Vorlage: zuerst eine echte Tabelle auf einer Beispielfolie, sonst der Standardstil für neue Tabellen */
  const tabelle = tabellenStil(roh, farbName);
  if (tabelle) bericht.push(`Tabellenstil übernommen${tabelle.quelle ? ` (${tabelle.quelle})` : ''}: ${tabelle.kopfFlaeche ? 'farbige Kopfzeile' : 'Kopfzeile mit Linie'}${tabelle.streifen ? ', Zeilen im Wechsel hinterlegt' : ''}.`);

  /* Größenstufen aus der Vorlage */
  const pt = (typ, id) => { const l = eigene.find(x => x.typ === typ), p = l && l.placeholders.find(x => x.id === id); return p && p.style ? p.style.size : null; };
  const sizes = { title: pt('title', 'title') || 40, h1: pt('content-bullets', 'title') || pt('two-column', 'title') || 28, h2: pt('title', 'subtitle') || Math.round(bodyPt * 1.2), body: pt('content-bullets', 'bullets') || bodyPt };
  Object.assign(sizes, { display: Math.round(sizes.title * 1.5), statement: pt('statement', 'statement') || Math.round(sizes.title * 0.95), kpi: Math.round(sizes.h1 * 1.5), bignumber: Math.round(sizes.title * 2.4), quote: Math.round(sizes.h1 * 1.05), small: Math.max(10, Math.round(sizes.body * 0.8)), caption: Math.max(9, Math.round(sizes.body * 0.65)) });
  Object.keys(sizes).forEach(s => { sizes[s] = Math.max(8, Math.min(200, sizes[s])); });
  /* Wer eine Vorlage importiert, hat ihre Schriften installiert: sie stehen deshalb vorn in der Ersatzliste und gelten auch im Export */
  const mitVorlage = f => [...new Set([f, 'Arial', 'Helvetica'].filter(x => x && !/^\+m[jn]-/.test(x)))].concat('sans-serif');
  const typography = { headingFont: th.major || 'Arial', bodyFont: th.minor || 'Arial', headingFallback: mitVorlage(th.major), bodyFallback: mitVorlage(th.minor), googleFonts: false, sizes, lineHeight: env.zeilenhoehe, headingBold: true };
  bericht.push(`Schriften: Überschriften „${typography.headingFont}“, Text „${typography.bodyFont}“.`);

  /* IDs: das erste Layout je Typ heißt wie der Typ, weitere bekommen eine Nummer */
  const ids = new Set(), mitId = l => { let id = l.typ; for (let i = 2; ids.has(id); i++) id = `${l.typ}-${i}`; ids.add(id); return id; };
  let layouts = eigene.map(l => ({ id: mitId(l), typ: l.typ, name: l.name, beschreibung: '', background: l.background, deko: l.deko, placeholders: l.placeholders, herkunft: l.quelle === 'folie' ? `Folie ${l.nr}` : 'Layout' }));

  /* Fehlende Typen aus den eigenen Layouts ableiten, sonst (falls gar nichts brauchbar ist) aus dem Grundlagen-System */
  let masters = {};
  const abgeleitet = zuWenig ? [] : leiteAb(layouts, env).map(l => ({ id: mitId(l), typ: l.typ, name: l.name, beschreibung: '', background: l.background, deko: l.deko || [], placeholders: l.placeholders, herkunft: 'abgeleitet' }));
  layouts.push(...abgeleitet);
  if (!layouts.length || zuWenig) {
    if (!opts.basis) throw new Error('Aus der Datei ließ sich kein Layout lesen, und es ist kein Designsystem als Grundlage geladen.');
    const b = kopie(opts.basis.manifest);
    masters = b.masters || {};
    Object.keys(b.tokens.colors).forEach(k => { if (!(k in colors)) colors[k] = b.tokens.colors[k]; });
    layouts = [...layouts, ...b.layouts.filter(l => !layouts.some(x => x.typ === (l.typ || l.id))).map(l => ({ ...l, herkunft: 'grundlage' }))];
    Object.keys(b.tokens.typography.sizes).forEach(s => { if (!(s in sizes)) sizes[s] = b.tokens.typography.sizes[s]; });
    bericht.push(`Die Vorlage hat kaum nutzbare Layouts. Ergänzt aus „${opts.basis.meta.name}“, in deinen Farben.`);
  }

  const id = freieId(opts.name || String(datei.name || '').replace(/\.(pptx|potx)$/i, '').replace(/[_-]+/g, ' ').trim() || th.name || 'import', opts.vergebeneIds || []);
  const name = opts.name || String(datei.name || '').replace(/\.(pptx|potx)$/i, '').replace(/[_-]+/g, ' ').trim() || th.name || 'Importiertes Design';
  const manifest = {
    schemaVersion: '1.0',
    meta: { id, name, beschreibung: 'Importiert aus einer PowerPoint-Vorlage: Layouts, Formen, Bilder, Farben und Schriften stammen aus der Datei.', version: '0.1.0', autor: '', tags: ['importiert', 'marke'] },
    tokens: { colors, typography, spacing: { marginX: 6, marginY: 8, gap: 3, grid: { columns: 12, gutter: 2 } }, shapes: { radius: 4, lineWidth: 1, shadow: 'none' }, ...(tabelle ? { tabelle: (({ quelle, ...t }) => t)(tabelle) } : {}) },
    masters, layouts: layouts.map(({ herkunft, ...l }) => l), assets: env.assets, rules: { logoAuf: [], maxBullets: 6, bildstil: '', hinweise: [] }
  };

  /* Beschreibung je Layout aus der Analyse, damit Mensch und KI wissen, wofür es taugt */
  const sysLike = { tokens: manifest.tokens };
  manifest.layouts.forEach((l, i) => {
    const b = beschreibe({ ...l, typ: l.typ || l.id, placeholders: l.placeholders }, sysLike);
    l.beschreibung = b.text;
    l.name = l.name || typName(l.typ);
    const h = layouts[i].herkunft;
    l.name = h === 'Layout' || h === 'abgeleitet' || h === 'grundlage' ? l.name : `${l.name} (${h})`;
  });
  const zaehle = h => layouts.filter(l => l.herkunft === h || (h === 'Folie' && /^Folie/.test(l.herkunft))).length;
  bericht.push(`Übernommen: ${zaehle('Layout')} Folienlayouts${zaehle('Folie') ? ` und ${zaehle('Folie')} Beispielfolien` : ''}, jeweils mit Hintergrund, Formen, Bildern und Textstilen.`);
  const typen = [...new Set(manifest.layouts.filter((_, i) => !['abgeleitet', 'grundlage'].includes(layouts[i].herkunft)).map(l => l.typ))];
  bericht.push(`Erkannte Zwecke: ${typen.map(t => `${typName(t)} (${manifest.layouts.filter((l, i) => l.typ === t && !['abgeleitet', 'grundlage'].includes(layouts[i].herkunft)).length})`).join(', ') || 'keine'}.`);
  if (abgeleitet.length) bericht.push(`Aus deinen Layouts abgeleitet, weil die Vorlage sie nicht hat: ${abgeleitet.map(l => typName(l.typ)).join(', ')}.`);
  if (Math.abs(roh.W / roh.H - 16 / 9) > 0.02) bericht.push('Die Vorlage ist nicht im Format 16:9. Die Folien wurden auf 16:9 umgerechnet und können leicht verzogen sein.');
  const logos = env.assets.filter(a => a.role.startsWith('logo'));
  if (logos.length) bericht.push(`Logos erkannt: ${logos.length}. Sie bleiben an ihrer Stelle auf den Folien.`);
  bericht.push(...hinweise);

  const paket = { id, manifest, voice: VOICE, readme: '', dateien: env.dateien, herkunft: 'hochgeladen' };
  paket.readme = `# ${manifest.meta.name}\n\nImportiert aus „${datei.name || 'einer PowerPoint-Datei'}“.\n\n## Was übernommen wurde\n\n${bericht.map(b => '- ' + b).join('\n')}\n\n## Was du prüfen solltest\n\n- den Zweck jedes Layouts (im Editor umstellbar)\n- Zeichenlimits der Platzhalter (\`maxChars\`), sie sind aus der Größe der Flächen geschätzt\n- Rollen der Bilder unter \`assets\`\n- \`voice.md\` mit euren Formulierungsrichtlinien\n`;
  return { paket, bericht, vorschlaege: [] };
}

/* Tabellenstil → tokens.tabelle { kopfFlaeche, kopfText, kopfFett, streifen, flaeche, linie } (Farbnamen oder Hex) */
export function tabellenStil(roh, farbName = h => h) {
  const ts = roh.tabellenstile || { def: '', stile: {} };
  const hex = f => f && f !== 'keine' && f.hex && f.alpha > 0.15 ? f.hex : null;
  const beispiel = roh.folien.flatMap(f => f.elemente.filter(e => e.tabelle && e.tabelle.zeilen.length)).map(e => e.tabelle)[0];
  const stil = ts.stile[(beispiel && beispiel.stil) || ts.def] || null;
  const z = beispiel ? beispiel.zeilen : [], k = z[0] && z[0][0], r1 = z[1] && z[1][0], r2 = z[2] && z[2][0];
  const kopfAn = beispiel ? beispiel.kopf : true, streifenAn = beispiel ? beispiel.streifen : true;
  const t = {};
  const kopfFlaeche = hex(k && k.fill) || (kopfAn && stil && stil.kopf ? hex(stil.kopf.fill) : null);
  if (kopfFlaeche) t.kopfFlaeche = farbName(kopfFlaeche);
  const kopfText = hex(k && k.farbe) || (kopfAn && stil && stil.kopf ? hex(stil.kopf.farbe) : null);
  if (kopfText) t.kopfText = farbName(kopfText, 'text');
  if (k && k.b !== undefined) t.kopfFett = !!k.b; else if (stil && stil.kopf && stil.kopf.b) t.kopfFett = true;
  /* Streifen: zwei Datenzeilen mit verschiedener Füllung, sonst der Streifen des Stils */
  const f1 = hex(r1 && r1.fill), f2 = hex(r2 && r2.fill);
  if (f1 && f2 && f1 !== f2) { t.streifen = farbName(f1); t.flaeche = farbName(f2); }
  else if (f1) t.flaeche = farbName(f1);
  else if (streifenAn && stil) { if (hex(stil.streifen)) t.streifen = farbName(hex(stil.streifen)); if (hex(stil.ganz)) t.flaeche = farbName(hex(stil.ganz)); }
  const linie = hex(r1 && r1.linie) || hex(k && k.linie) || (stil ? hex(stil.linie) : null);
  if (linie) t.linie = farbName(linie);
  const textFarbe = hex(r1 && r1.farbe) || (stil && stil.text ? hex(stil.text.farbe) : null);
  if (textFarbe) t.text = farbName(textFarbe, 'text');
  if (!Object.keys(t).length) return null;
  t.quelle = beispiel ? 'aus einer Beispielfolie' : stil ? `Standardstil „${stil.name || 'ohne Namen'}“` : '';
  return t;
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

const VOICE = `# Formulierungsrichtlinien

Diese Datei wird beim Schreiben der Folien an die KI übergeben. Passe sie an eure Organisation an.

## Tonalität

- Sachlich, klar und freundlich.
- Aussagen statt Themen als Überschrift.

## Anrede

- Noch nicht festgelegt. Trage hier Du oder Sie ein oder lade im Editor eure Formulierungsrichtlinien hoch.

## Satzlänge

- Überschriften: höchstens 10 Wörter.
- Stichpunkte: höchstens 15 Wörter, ein Gedanke pro Punkt.

## Nicht erlaubt

- Zahlen, Namen oder Termine, die nicht im Briefing stehen
`;
