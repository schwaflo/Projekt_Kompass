/* ============================================================
   Bildanalyse – Stil-Baukasten
   Was über die reine Platzierung hinausgeht und sich an- und
   abwählen lässt:
   - Farbflächen, die das Bild überlagern (Band, Sockel,
     Diagonale, Farbton),
   - Schmuckelemente (Linien, Rahmen, Eckmarken, Akzente am
     Textblock),
   - Zahlen wie ein Datum, in Blöcke geteilt und gestapelt,
   - die Farbwelt (Schrift, Akzent, Fläche).
   Die Presets stehen in FLAECHEN und SCHMUCK. Alles ohne
   Browser lauffähig.
   ============================================================ */
import { istHex, hexNorm, hexZuRgb, mische } from './kern.js';

const runde = (n, st = 2) => { const f = 10 ** st; return Math.round(n * f) / f; };
const klemme = (n, a, b) => Math.max(a, Math.min(b, n));
const hex = (h, ersatz = '') => (istHex(h) ? hexNorm(h) : ersatz);
const zahl = (n, [a, b, vorgabe]) => (typeof n === 'number' && isFinite(n) ? klemme(n, a, b) : vorgabe);

/* ---------- Presets ---------- */
/* groesse: [kleinster, größter, Vorgabe] in Prozent des Bildes */
export const FLAECHEN = {
  keine: { name: 'Keine', info: 'Das Bild bleibt frei.' },
  band: { name: 'Band', info: 'Farbstreifen am Rand. Trägt zum Beispiel das Datum.', seiten: { rechts: 'rechts', links: 'links' }, groesse: [8, 60, 18], deckkraft: 1 },
  sockel: { name: 'Sockel', info: 'Farbfläche unten oder oben. Trägt den Textblock.', seiten: { unten: 'unten', oben: 'oben' }, groesse: [15, 70, 38], deckkraft: 1 },
  diagonale: { name: 'Diagonale', info: 'Schräg geschnittene Farbfläche aus einer Ecke.', seiten: { ul: 'unten links', ur: 'unten rechts', ol: 'oben links', or: 'oben rechts' }, groesse: [30, 170, 100], deckkraft: 1 },
  ton: { name: 'Farbton', info: 'Farbe liegt halb durchsichtig über dem ganzen Bild.', deckkraft: 0.45 }
};
/* ort: „bild“ liegt über dem Foto, „block“ hängt am Textblock und wandert mit ihm */
export const SCHMUCK = {
  diagonale: { name: 'Diagonale Linie', ort: 'bild', info: 'Feine Linie quer über das Bild.', richtung: { steigend: 'steigend', fallend: 'fallend', kreuz: 'gekreuzt' }, lage: [10, 90, 56] },
  rahmen: { name: 'Rahmen', ort: 'bild', info: 'Linie mit Abstand zum Bildrand.', abstand: [1, 12, 3.5] },
  ecken: { name: 'Eckmarken', ort: 'bild', info: 'Kurze Winkel in den vier Ecken.', abstand: [1, 12, 3.5] },
  akzentlinie: { name: 'Akzentlinie', ort: 'block', info: 'Kurze Linie über der Headline.' },
  balken: { name: 'Balken', ort: 'block', info: 'Senkrechte Linie an der Kante des Textblocks.' }
};
const STAERKE = [0.5, 6, 1.5];
const DECK = [0.1, 1, 1];

/* Eingaben der Person prüfen und mit den Vorgaben der Presets füllen */
export function stilVoll(stil = {}) {
  const f = stil.farben || {}, fl = stil.flaeche || {}, art = FLAECHEN[fl.art] ? fl.art : 'keine', P = FLAECHEN[art];
  const schmuck = {};
  for (const [id, S] of Object.entries(SCHMUCK)) {
    const e = (stil.schmuck || {})[id] || {};
    schmuck[id] = { an: !!e.an, farbe: hex(e.farbe), staerke: zahl(e.staerke, STAERKE) };
    if (S.richtung) schmuck[id].richtung = S.richtung[e.richtung] ? e.richtung : 'steigend';
    if (S.lage) schmuck[id].lage = zahl(e.lage, S.lage);
    if (S.abstand) schmuck[id].abstand = zahl(e.abstand, S.abstand);
  }
  return {
    farben: { schrift: hex(f.schrift), akzent: hex(f.akzent), flaeche: hex(f.flaeche) },
    flaeche: { art, seite: P.seiten ? (P.seiten[fl.seite] ? fl.seite : Object.keys(P.seiten)[0]) : '', groesse: P.groesse ? zahl(fl.groesse, P.groesse) : 100, farbe: hex(fl.farbe), deckkraft: art === 'keine' ? 0 : zahl(fl.deckkraft, [DECK[0], DECK[1], P.deckkraft]) },
    schmuck,
    /* Schriftbehandlung und Form des Aufrufs: als Textzeile mit Pfeil (Druck) oder als Knopf (digital) */
    typo: { versal: !!(stil.typo || {}).versal, gewicht: [500, 600, 700].includes(+(stil.typo || {}).gewicht) ? +(stil.typo || {}).gewicht : 700, cta: (stil.typo || {}).cta === 'knopf' ? 'knopf' : 'zeile' },
    datum: String(stil.datum || '').trim()
  };
}

/* ---------- Farbflächen ---------- */
/* Eckpunkte der Fläche in Prozent des Bildes; null, wenn keine Fläche gewählt ist */
export function flaechePolygon(fl) {
  const g = fl.groesse;
  switch (fl.art) {
    case 'band': return fl.seite === 'links' ? [[0, 0], [g, 0], [g, 100], [0, 100]] : [[100 - g, 0], [100, 0], [100, 100], [100 - g, 100]];
    case 'sockel': return fl.seite === 'oben' ? [[0, 0], [100, 0], [100, g], [0, g]] : [[0, 100 - g], [100, 100 - g], [100, 100], [0, 100]];
    case 'diagonale': return { ul: [[0, 100 - g], [g, 100], [0, 100]], ur: [[100, 100 - g], [100, 100], [100 - g, 100]], ol: [[0, 0], [g, 0], [0, g]], or: [[100 - g, 0], [100, 0], [100, g]] }[fl.seite];
    case 'ton': return [[0, 0], [100, 0], [100, 100], [0, 100]];
    default: return null;
  }
}
export function imPolygon(p, x, y) {
  let drin = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) drin = !drin;
  }
  return drin;
}
/* Die Freiraum-Karte so, wie sie mit der Farbfläche aussieht: Zellen ganz unter einer deckenden
   Fläche sind ruhig und haben deren Farbe; Zellen auf der Kante der Fläche sind unruhig, damit
   kein Text über die Kante läuft. karte.cover sagt je Zelle, wie viel die Fläche bedeckt. */
export function wendeFlaecheAn(karte, fl, farbe) {
  const p = flaechePolygon(fl);
  if (!p || !fl.deckkraft) return karte;
  const { cols: C, rows: R } = karte, out = { cols: C, rows: R, free: [], score: [], color: [], cover: [] };
  const deckt = fl.deckkraft >= 0.8;
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
    /* 5 × 5 Messpunkte je Zelle, die Ränder eingeschlossen: so fällt auch eine Kante auf, die die Zelle nur streift */
    let n = 0;
    for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) if (imPolygon(p, (x + 0.01 + a * 0.245) * 100 / C, (y + 0.01 + b * 0.245) * 100 / R)) n++;
    const c = n / 25, i = y * C + x;
    out.cover.push(c);
    out.color.push(c ? mische(farbe, karte.color[i], fl.deckkraft * c) : karte.color[i]);
    if (c === 1 && deckt) { out.free.push(1); out.score.push(1); }
    else if (c > 0 && deckt) { out.free.push(0); out.score.push(0); }
    else { out.free.push(karte.free[i]); out.score.push(karte.score[i]); }
  }
  /* Liegt die Kante genau zwischen zwei Zellen, trennt die erste Bildzelle daneben Fläche und Foto */
  if (deckt) for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
    const i = y * C + x;
    if (out.cover[i] !== 0) continue;
    if ([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([a, b]) => a >= 0 && b >= 0 && a < C && b < R && out.cover[b * C + a] === 1)) { out.free[i] = 0; out.score[i] = 0; }
  }
  return out;
}
export function flaecheHTML(g) {
  const p = g && g.flaeche && g.flaeche.polygon;
  if (!p) return '';
  return `<div class="bd-flaeche" style="clip-path:polygon(${p.map(([x, y]) => `${runde(x)}% ${runde(y)}%`).join(',')});background:rgba(${hexZuRgb(g.flaeche.color).join(',')},${g.flaeche.opacity})"></div>`;
}

/* ---------- Zahlen in Blöcken ---------- */
/* „30.03.19“ → ['30', '03', '19']. Getrennt wird an Punkt, Strich, Schrägstrich und Leerzeichen. */
export const teileDatum = text => String(text || '').trim().split(/[\s.\-–/|]+/).filter(Boolean).slice(0, 5);
export function datumHTML(d) {
  if (!d) return '';
  return `<div class="bd-datum" style="left:${d.x}%;top:${d.y}%;width:${d.width}%;font-size:${d.size}cqw;color:${d.color}">${d.parts.map((t, i) => `${i ? '<i></i>' : ''}<b>${String(t).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)}</b>`).join('')}</div>`;
}

/* ---------- Schmuck ---------- */
/* Schmuck über dem Bild als SVG. farbe: Vorgabe, wenn das Element keine eigene Farbe hat. */
export function schmuckBildSVG(g, analyse, farbe) {
  const W = analyse.image.width, H = analyse.image.height, kurz = Math.min(W, H), s = g.schmuck, teile = [];
  const strich = e => `stroke="${e.farbe || farbe}" stroke-width="${runde(e.staerke * kurz / 700, 1)}" fill="none"`;
  if (s.diagonale.an) {
    const e = s.diagonale, m = H * e.lage / 100, d = W * 0.21;
    const auf = `M0 ${runde(m + d, 1)}L${W} ${runde(m - d, 1)}`, ab = `M0 ${runde(m - d, 1)}L${W} ${runde(m + d, 1)}`;
    teile.push(`<path data-schmuck="diagonale" d="${e.richtung === 'steigend' ? auf : e.richtung === 'fallend' ? ab : auf + ab}" ${strich(e)}/>`);
  }
  if (s.rahmen.an) { const e = s.rahmen, a = runde(kurz * e.abstand / 100, 1); teile.push(`<rect data-schmuck="rahmen" x="${a}" y="${a}" width="${runde(W - 2 * a, 1)}" height="${runde(H - 2 * a, 1)}" ${strich(e)}/>`); }
  if (s.ecken.an) {
    const e = s.ecken, a = kurz * e.abstand / 100, l = kurz * 0.07, r = n => runde(n, 1);
    const winkel = (x, y, dx, dy) => `M${r(x + dx * l)} ${r(y)}L${r(x)} ${r(y)}L${r(x)} ${r(y + dy * l)}`;
    teile.push(`<path data-schmuck="ecken" d="${winkel(a, a, 1, 1)}${winkel(W - a, a, -1, 1)}${winkel(a, H - a, 1, -1)}${winkel(W - a, H - a, -1, -1)}" ${strich(e)}/>`);
  }
  return teile.length ? `<svg class="bd-schmuck" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${teile.join('')}</svg>` : '';
}
/* Schmuck, der am Textblock hängt */
export function schmuckBlockHTML(g, v, farbe) {
  const s = g.schmuck, teile = [];
  if (s.akzentlinie.an) { const e = s.akzentlinie; teile.push(`<i class="bd-akzent${v.align === 'mitte' ? ' mitte' : ''}" data-schmuck="akzentlinie" style="width:${runde(v.sizes.headline * 1.5)}cqw;height:${runde(e.staerke * 0.16)}cqw;bottom:calc(100% + ${runde(v.sizes.headline * 0.3)}cqw);background:${e.farbe || farbe}"></i>`); }
  if (s.balken.an) { const e = s.balken; teile.push(`<i class="bd-balken" data-schmuck="balken" style="width:${runde(e.staerke * 0.16)}cqw;left:-${runde(v.sizes.headline * 0.32)}cqw;background:${e.farbe || farbe}"></i>`); }
  return teile.join('');
}
export const STIL_CSS = `.bd-flaeche,.bd-schmuck{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.bd-akzent{position:absolute;left:0}.bd-akzent.mitte{left:50%;transform:translateX(-50%)}
.bd-balken{position:absolute;top:.4cqw;bottom:.4cqw}
.bd-datum{position:absolute;display:flex;flex-direction:column;align-items:center;font-weight:700;line-height:1.05;font-variant-numeric:tabular-nums}
.bd-datum b{display:block}.bd-datum i{display:block;width:.5em;height:.09em;margin:.42em 0;background:currentColor}`;
