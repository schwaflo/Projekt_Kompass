/* ============================================================
   Bildanalyse – vom Analyse-JSON zum Design-Vorschlag
   Die Gestaltung rechnet dieses Modul selbst, ohne KI:
   1. zusammenhängende ruhige Flächen in der Freiraum-Karte finden,
   2. Headline, Subline und CTA als EINEN Block mit fester
      Hierarchie hineinsetzen (Größen aus Fläche und Format),
   3. Ränder, Abstand zum Motiv und Kontrast prüfen.
   Heraus kommen wenige geprüfte Varianten. Die KI wählt nur
   zwischen ihnen und begründet die Wahl.
   Dazu die Ausgaben: HTML/CSS-Ansicht und Debug-Vorschau (SVG).
   Alles ohne Browser lauffähig.
   ============================================================ */
import { STANDARD, konfig, alleKacheln, istHex, hexNorm, hexZuRgb, kontrast, luminanz, mische } from './kern.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const runde = (n, st = 2) => { const f = 10 ** st; return Math.round(n * f) / f; };
const klemme = (n, a, b) => Math.max(a, Math.min(b, n));

/* ---------- Fragen an das Vision-Modell ---------- */
export const VISION_SYSTEM = 'Du beschreibst Bilder sachlich, genau und knapp auf Deutsch. Du beschreibst nur, was wirklich zu sehen ist, und erfindest nichts. Antworte ausschließlich mit JSON.';
const S = { type: 'string' };
export const GESAMT_SCHEMA = {
  type: 'object',
  properties: { main_subject: S, composition: S, mood: S, style: S, lighting: S },
  required: ['main_subject', 'composition', 'mood', 'style', 'lighting']
};
export const GESAMT_PROMPT = `Sieh dir das ganze Bild an und beschreibe es für eine Gestalterin, die Text darauf setzen will. Je Feld ein kurzer Satz oder wenige Stichworte.
- main_subject: das Hauptmotiv
- composition: der Bildaufbau (wo liegt das Motiv, wo ist ruhige Fläche, Linien, Tiefe, wohin weisen Blick oder Geste)
- mood: die Stimmung
- style: der Stil (z. B. Fotografie, Illustration, Farbigkeit, Anmutung)
- lighting: die Lichtsituation`;
export const KACHEL_SCHEMA = { type: 'object', properties: { description: S }, required: ['description'] };
export const kachelPrompt = k => `Das ist ein Ausschnitt eines größeren Bildes (Lage im Bild: ${k.label}). Beschreibe in höchstens 2 kurzen Sätzen, was in diesem Ausschnitt zu sehen ist.`;
/* Höchstens zwei Sätze, auch wenn das Modell mehr schreibt */
export function kuerzeBeschreibung(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const saetze = t.match(/[^.!?]+[.!?]+(?=\s|$)/g);
  return saetze && saetze.length > 2 ? saetze.slice(0, 2).join('').trim() : t;
}

/* ---------- Textbreite ---------- */
/* Schätzung in Geviert (em) für eine Grotesk. Im Browser übergibt die Oberfläche stattdessen
   eine Messung mit der echten Schrift. */
export function breiteEm(text, fett = false) {
  let s = 0;
  for (const z of String(text)) s += /[mwMW@%—]/.test(z) ? 0.88 : /[iIljtfr.,:;!'|()\-·\s]/.test(z) ? 0.32 : /[A-ZÄÖÜ0-9]/.test(z) ? 0.66 : 0.56;
  return s * (fett ? 1.04 : 1);
}
/* Headline in n Zeilen brechen, so dass die längste Zeile möglichst kurz ist.
   Getrennt wird an Leerzeichen und nach Bindestrichen. */
export function umbruch(text, n, messe = breiteEm) {
  const teile = [];
  for (const wort of String(text).trim().split(/\s+/).filter(Boolean)) wort.split(/(?<=[-–/])(?=.)/).forEach((t, i) => teile.push({ t, leer: i === 0 && teile.length > 0 }));
  if (!teile.length || n > teile.length) return null;
  const zeile = (a, b) => teile.slice(a, b).map((x, i) => (i && x.leer ? ' ' : '') + x.t).join('');
  let beste = null;
  const such = (ab, rest, bisher) => {
    if (rest === 1) {
      const zeilen = [...bisher, zeile(ab, teile.length)], em = Math.max(...zeilen.map(z => messe(z, true)));
      if (!beste || em < beste.em - 1e-6) beste = { lines: zeilen, em };
      return;
    }
    for (let i = ab + 1; i <= teile.length - rest + 1; i++) such(i, rest - 1, [...bisher, zeile(ab, i)]);
  };
  such(0, n, []);
  return beste;
}

/* ---------- Typografie: ein Block, feste Hierarchie ---------- */
/* Alle Maße in Prozent der Bildbreite (im CSS: cqw). verh = Höhe / Breite des Bildes.
   Die Headline wird so groß, wie Fläche und Format es zulassen; Subline und CTA folgen in
   festem Verhältnis. Passt der Block nicht mit einer Mindestgröße, gibt es kein Ergebnis. */
export const headlineMax = verh => klemme(7.6 * Math.sqrt(verh), 5, 10);
export function setzeTypo(texte, maxB, maxH, verh, messe = breiteEm, locker = false) {
  const Tmax = headlineMax(verh), Tmin = Tmax * (locker ? 0.3 : 0.5), k = klemme(Math.sqrt(verh) / 0.8, 1, 1.8);
  const sub = String(texte.subline || '').trim(), cta = String(texte.cta || '').trim();
  let beste = null;
  for (let n = 1; n <= 4; n++) {
    const u = umbruch(texte.headline, n, messe);
    if (!u) break;
    const bau = h => {
      const s = Math.min(klemme(h * 0.36, 1.75 * k, 3.2 * k), h * 0.62), c = s * 0.92;
      const subMax = Math.min(maxB, Math.max(h * u.em, s * 22)), subB = messe(sub, false) * s * 1.05;
      const subZeilen = sub ? Math.max(1, Math.ceil(subB / subMax)) : 0;
      const ctaB = cta ? (messe(cta, true) + 3) * c : 0;
      const gap1 = h * 0.4, gap2 = s * 1.5;
      return {
        headline: h, subline: s, cta: c, lines: u.lines, sub_max: subMax, gap1, gap2,
        width: Math.max(h * u.em, sub ? (subZeilen > 1 ? subMax : subB) : 0, ctaB),
        height: h * 1.06 * n + (sub ? gap1 + s * 1.36 * subZeilen : 0) + (cta ? gap2 + c * 2.7 : 0)
      };
    };
    let h = Math.min(Tmax, maxB / u.em), L = bau(h);
    for (let i = 0; i < 4 && L.height > maxH; i++) { h *= Math.min(0.97, maxH / L.height); L = bau(h); }
    if (h < Tmin || L.height > maxH || L.width > maxB + 0.01) continue;
    /* größer ist besser; ruhiger Zeilenfall und weniger Zeilen zählen mit */
    const laengen = u.lines.map(z => messe(z, true)), fall = Math.min(...laengen) / Math.max(...laengen);
    const wert = h * (0.75 + 0.25 * fall) - (n - 1) * 0.3;
    if (!beste || wert > beste.wert) beste = { ...L, wert, max: Tmax };
  }
  return beste;
}

/* ---------- Ruhige Flächen ---------- */
/* Größte Rechtecke aus lauter freien Zellen der Freiraum-Karte. Zurück kommen höchstens drei,
   die sich deutlich unterscheiden, die beste zuerst. */
export function flaechen(karte, verh) {
  const { cols: C, rows: R, free, score } = karte;
  const I = new Float64Array((C + 1) * (R + 1)), Sc = new Float64Array((C + 1) * (R + 1));
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
    const i = (y + 1) * (C + 1) + x + 1;
    I[i] = free[y * C + x] + I[i - 1] + I[i - C - 1] - I[i - C - 2];
    Sc[i] = score[y * C + x] + Sc[i - 1] + Sc[i - C - 1] - Sc[i - C - 2];
  }
  const sum = (A, x0, y0, x1, y1) => A[y1 * (C + 1) + x1] - A[y0 * (C + 1) + x1] - A[y1 * (C + 1) + x0] + A[y0 * (C + 1) + x0];
  const voll = (x0, y0, x1, y1) => x0 >= 0 && y0 >= 0 && x1 <= C && y1 <= R && sum(I, x0, y0, x1, y1) === (x1 - x0) * (y1 - y0);
  const minB = Math.max(2, Math.ceil(C * (verh <= 1.05 ? 0.3 : 0.55))), minH = Math.max(2, Math.ceil(R * 0.2));
  const alle = [];
  for (let y0 = 0; y0 < R; y0++) for (let x0 = 0; x0 < C; x0++) {
    if (!free[y0 * C + x0]) continue;
    let grenze = C;
    for (let y1 = y0 + 1; y1 <= R; y1++) {
      let x1 = x0; while (x1 < grenze && free[(y1 - 1) * C + x1]) x1++;
      grenze = x1; if (grenze === x0) break;
      if (grenze - x0 < minB || y1 - y0 < minH) continue;
      /* nur Rechtecke, die sich in keine Richtung mehr vergrößern lassen */
      if (voll(x0 - 1, y0, grenze, y1) || voll(x0, y0 - 1, grenze, y1) || voll(x0, y0, grenze, y1 + 1)) continue;
      const zellen = (grenze - x0) * (y1 - y0);
      alle.push({ x0, y0, x1: grenze, y1, zellen, ruhe: sum(Sc, x0, y0, grenze, y1) / zellen });
    }
  }
  alle.sort((a, b) => b.zellen * b.ruhe - a.zellen * a.ruhe);
  const iou = (a, b) => { const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0), s = w > 0 && h > 0 ? w * h : 0; return s / (a.zellen + b.zellen - s); };
  const out = [];
  for (const r of alle) { if (out.length < 3 && !out.some(o => iou(o, r) > 0.5)) out.push(r); }
  return out;
}

/* ---------- Farben aus dem Bild ---------- */
const saettigung = hex => { const [r, g, b] = hexZuRgb(hex), mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
/* Schriftfarben im Ton des Bildes: die dunkelste und die hellste Bildfarbe, bis fast Schwarz
   bzw. fast Weiß gezogen. So bleibt die Schrift in der Farbwelt des Fotos. */
export function schriftToene(analyse, cfg = STANDARD) {
  const pal = (analyse.palette || []).map(c => c.hex).sort((a, b) => luminanz(a) - luminanz(b));
  if (!pal.length) return { dunkel: cfg.text_dunkel, hell: cfg.text_hell };
  let d = pal[0], h = pal[pal.length - 1];
  for (let i = 0; i < 30 && luminanz(d) > 0.022; i++) d = mische('#000000', d, 0.15);
  for (let i = 0; i < 30 && luminanz(h) < 0.87; i++) h = mische('#FFFFFF', h, 0.15);
  return { dunkel: d, hell: h };
}
const DECKKRAFT = 0.9;

/* ---------- Komposition ---------- */
const ANKER = { motiv: 'auf Höhe des Motivs', mitte: 'mittig', unten: 'unten', oben: 'oben' };
const ANKER_WERT = { motiv: 0.25, mitte: 0.16, unten: 0.12, oben: 0.04 };
/* Baut alle geprüften Varianten für ein Bild und seine Texte. texte: { headline, subline, cta }.
   opts.messe: Funktion (text, fett) → Breite in em. */
export function komponiere(analyse, texte = {}, opts = {}) {
  const cfg = konfig(analyse.config || {}), karte = analyse.free_map, messe = opts.messe || breiteEm;
  const W = analyse.image.width, H = analyse.image.height, verh = H / W, kurz = Math.min(W, H);
  const t = { headline: String(texte.headline || '').trim() || 'Headline', subline: String(texte.subline || '').trim(), cta: String(texte.cta || '').trim() };
  const { cols: C, rows: R } = karte, zb = 100 / C, zh = 100 / R;
  const randX = 6 * kurz / W, randY = 6 * kurz / H;   /* Rand zum Bildrand: 6 % der kurzen Seite */
  const toene = schriftToene(analyse, cfg);
  const frei = (x, y) => x >= 0 && y >= 0 && x < C && y < R && karte.free[y * C + x] === 1;

  const bau = (r, anker, notfall) => {
    const innen = {
      x: r.x0 * zb + (r.x0 === 0 ? randX : zb * 0.6), y: r.y0 * zh + (r.y0 === 0 ? randY : zh * 0.5),
      x1: r.x1 * zb - (r.x1 === C ? randX : zb * 0.6), y1: r.y1 * zh - (r.y1 === R ? randY : zh * 0.5)
    };
    const ib = innen.x1 - innen.x, ih = innen.y1 - innen.y;
    if (ib <= 0 || ih <= 0) return null;
    const typo = setzeTypo(t, Math.min(ib, verh <= 1.05 ? 46 : 88), ih * verh, verh, messe, notfall);
    if (!typo) return null;
    const bh = typo.height / verh;   /* Blockhöhe in Prozent der Bildhöhe */
    /* Motiv: unruhige Zellen direkt neben der Fläche. Ihre mittlere Höhe gibt dem Block Halt. */
    const neben = spalten => { let n = 0, s = 0; for (const x of spalten) for (let y = r.y0; y < r.y1; y++) if (x >= 0 && x < C && !frei(x, y)) { n++; s += (y + 0.5) * zh; } return n ? s / n : null; };
    const motivL = neben([r.x0 - 1, r.x0 - 2]), motivR = neben([r.x1, r.x1 + 1]);
    const breit = !notfall && (r.x1 - r.x0) / C >= 0.8 && motivL === null && motivR === null;
    const align = breit ? 'mitte' : 'links';
    const x = breit ? innen.x + (ib - typo.width) / 2 : motivL === null && motivR !== null ? innen.x1 - typo.width : innen.x;
    const motivY = motivL !== null ? motivL : motivR;
    if (anker === 'motiv' && motivY === null) return null;
    const y = anker === 'motiv' ? klemme(motivY - bh / 2, innen.y, innen.y1 - bh) : anker === 'mitte' ? innen.y + (ih - bh) * 0.45 : anker === 'unten' ? innen.y1 - bh : innen.y;
    /* Farben unter dem Block */
    const grund = [];
    for (let cy = Math.floor(y / zh); cy <= Math.min(R - 1, Math.floor((y + bh - 0.01) / zh)); cy++) for (let cx = Math.floor(x / zb); cx <= Math.min(C - 1, Math.floor((x + typo.width - 0.01) / zb)); cx++) grund.push(karte.color[cy * C + cx]);
    const mk = (farbe, lage) => Math.min(...grund.map(g => kontrast(farbe, lage && lage.opacity ? mische(lage.color, g, lage.opacity) : g)));
    /* Wie viel Schleier braucht eine Schriftfarbe, bis sie überall den Mindestkontrast erreicht?
       Ein Schleier ist ein weicher, kaum sichtbarer Farbschein hinter dem Block, kein Kasten. */
    const bedarf = (farbe, schein) => { for (let a = 0; a <= 0.44; a += 0.04) if (mk(farbe, { color: schein, opacity: a }) >= cfg.kontrast_min) return a; return null; };
    const aD = notfall ? null : bedarf(toene.dunkel, toene.hell), aH = notfall ? null : bedarf(toene.hell, toene.dunkel);
    let text, veil = null, panel = null;
    if (aD === null && aH === null) {
      /* Auch ein Schleier reicht nicht: der ganze Block bekommt eine Fläche, nie einzelne Zeilen */
      const hellerGrund = grund.reduce((sum, g) => sum + luminanz(g), 0) / grund.length > 0.2;
      panel = { color: hellerGrund ? toene.hell : toene.dunkel, opacity: DECKKRAFT };
      text = hellerGrund ? toene.dunkel : toene.hell;
    } else {
      const dunkel = aH === null || (aD !== null && (aD < aH || (aD === aH && mk(toene.dunkel, { color: toene.hell, opacity: aD }) >= mk(toene.hell, { color: toene.dunkel, opacity: aH }))));
      text = dunkel ? toene.dunkel : toene.hell;
      const a = dunkel ? aD : aH;
      if (a > 0) veil = { color: dunkel ? toene.hell : toene.dunkel, opacity: runde(a) };
    }
    const lage = panel || veil;
    const kText = mk(text, lage);
    /* Knopf: kräftigste Bildfarbe, die sich vom Grund abhebt; sonst die Schriftfarbe */
    const ab = hex => mk(hex, lage);
    const knopf = (analyse.palette || []).map(c => c.hex).filter(h => saettigung(h) > 0.25 && ab(h) >= cfg.kontrast_flaeche_min).sort((a, b) => saettigung(b) * ab(b) - saettigung(a) * ab(a))[0] || text;
    let knopfText = kontrast(toene.hell, knopf) >= kontrast(toene.dunkel, knopf) ? toene.hell : toene.dunkel;
    if (kontrast(knopfText, knopf) < cfg.kontrast_min) knopfText = kontrast('#FFFFFF', knopf) >= kontrast('#000000', knopf) ? '#FFFFFF' : '#000000';
    const cxm = (r.x0 + r.x1) / 2 / C, cym = (r.y0 + r.y1) / 2 / R, hoch = (r.y1 - r.y0) / R >= 0.7, weit = (r.x1 - r.x0) / C >= 0.7;
    const ort = [hoch ? '' : cym < 0.4 ? 'oben' : cym > 0.6 ? 'unten' : '', weit ? '' : cxm < 0.4 ? 'links' : cxm > 0.6 ? 'rechts' : 'Mitte'].filter(Boolean).join(' ') || 'Mitte';
    return {
      key: `${r.x0}.${r.y0}.${r.x1}.${r.y1}:${anker}`, anchor: anker, align,
      label: notfall ? 'Auf einer Fläche, unten links' : `${ort[0].toUpperCase()}${ort.slice(1)}, ${ANKER[anker]}`,
      beside_subject: motivY !== null,
      region: { x: runde(r.x0 * zb), y: runde(r.y0 * zh), width: runde((r.x1 - r.x0) * zb), height: runde((r.y1 - r.y0) * zh) },
      block: { x: runde(x), y: runde(y), width: runde(typo.width), height: runde(bh) },
      sizes: { headline: runde(typo.headline), subline: runde(typo.subline), cta: runde(typo.cta) },
      lines: typo.lines, sub_max: runde(typo.sub_max), gaps: { headline: runde(typo.gap1), cta: runde(typo.gap2) },
      ground: grund[Math.floor(grund.length / 2)],
      colors: { text, cta_background: knopf, cta_text: knopfText },
      contrast: { text: runde(kText), cta_text: runde(kontrast(knopfText, knopf)), cta_background: runde(ab(knopf)) },
      veil, panel,
      score: runde(typo.headline / typo.max * 0.4 + r.ruhe * 0.2 + ANKER_WERT[anker] + Math.min(0.5, r.zellen / (C * R)) * 0.3 - (panel ? 0.5 : veil ? veil.opacity * 0.3 : 0), 3)
    };
  };

  let varianten = [];
  for (const r of flaechen(karte, verh)) {
    const dieser = [];
    for (const anker of ['motiv', 'mitte', 'unten', 'oben']) {
      const v = bau(r, anker, false);
      /* Varianten, die fast an derselben Stelle landen, nicht doppelt anbieten */
      if (v && !dieser.some(o => Math.abs(o.block.y - v.block.y) < 7)) dieser.push(v);
    }
    varianten.push(...dieser);
  }
  varianten.sort((a, b) => b.score - a.score);
  varianten = varianten.slice(0, 4);
  let notfall = false;
  if (!varianten.length) {
    /* Keine ruhige Fläche, in die der Block passt: unten links auf einer Fläche */
    notfall = true;
    const v = bau({ x0: 0, y0: 0, x1: C, y1: R, zellen: C * R, ruhe: 0 }, 'unten', true);
    if (v) varianten = [v];
  }
  varianten.forEach((v, i) => { v.id = 'ABCD'[i]; });
  return { varianten, notfall, texte: t };
}

/* ---------- Die KI wählt und begründet ---------- */
export const DESIGN_SYSTEM = 'Du bist Art Director. Du wählst unter fertigen, bereits geprüften Kompositionen die beste aus und begründest die Wahl. Antworte ausschließlich mit JSON, Begründung auf Deutsch.';
export function designSchema(analyse, K) {
  const farben = (analyse.palette || []).map(c => c.hex), pal = farben.length ? { type: 'string', enum: farben } : S;
  return {
    type: 'object',
    properties: {
      variant: { type: 'string', enum: K.varianten.map(v => v.id) },
      palette: { type: 'object', properties: { background: pal, surface: pal, accent: pal }, required: ['background', 'surface', 'accent'] },
      reasoning: S
    },
    required: ['variant', 'palette', 'reasoning']
  };
}
/* Welche Kacheln des gröbsten Rasters liegen unter einem Rechteck (in Prozent)? */
function kachelnUnter(analyse, b) {
  const grob = Object.values(analyse.grids || {}).sort((a, c) => a.length - c.length)[0] || [];
  const W = analyse.image.width, H = analyse.image.height;
  return grob.filter(k => k.x / W * 100 < b.x + b.width && (k.x + k.width) / W * 100 > b.x && k.y / H * 100 < b.y + b.height && (k.y + k.height) / H * 100 > b.y);
}
export function designPrompt(analyse, texte, K) {
  const grob = Object.entries(analyse.grids || {}).sort((a, b) => a[1].length - b[1].length)[0];
  const bild = grob ? grob[1].map(k => `- ${k.label}: ${k.description || '(keine Beschreibung)'}`).join('\n') : '(keine)';
  const zahl = n => String(runde(n, 1)).replace('.', ',');
  const var_ = K.varianten.map(v => `${v.id}: Textblock ${v.label[0].toLowerCase()}${v.label.slice(1)}${v.beside_subject ? ', direkt neben dem Motiv' : ''}; ${v.align === 'mitte' ? 'zentriert' : 'linksbündig'}; Headline ${v.lines.length}-zeilig mit ${zahl(v.sizes.headline)} % der Bildbreite; Schrift ${v.colors.text} (Kontrast ${zahl(v.contrast.text)} : 1)${v.panel ? ', auf einer Fläche' : v.veil ? ', direkt auf dem Bild mit weichem Schleier' : ', direkt auf dem Bild'}; liegt über: ${kachelnUnter(analyse, v.block).map(k => k.label).join(', ') || 'Bildmitte'}.`).join('\n');
  return `BILD
${analyse.overall ? Object.entries({ Hauptmotiv: analyse.overall.main_subject, Bildaufbau: analyse.overall.composition, Stimmung: analyse.overall.mood, Stil: analyse.overall.style, Licht: analyse.overall.lighting }).map(([k, v]) => `${k}: ${v}`).join('\n') : '(keine Beschreibung)'}

BILDBEREICHE
${bild}

FARBEN DES BILDES (Hex, Anteil): ${(analyse.palette || []).map(c => `${c.hex} ${Math.round(c.percent)} %`).join(', ')}

TEXTE
Headline: ${K.texte.headline}
Subline: ${K.texte.subline || '(keine)'}
CTA: ${K.texte.cta || '(keiner)'}

KOMPOSITIONEN (alle sind geprüft: ruhige Fläche, Abstand zu Rand und Motiv, Kontrast, Hierarchie). Headline, Subline und CTA stehen immer als ein Block zusammen.
${var_}

AUFGABE
- variant: die Komposition, die am besten zum Bild passt. Achte darauf, dass der Block das Hauptmotiv nicht bedrängt, Blick oder Geste des Motivs aufnimmt und die Headline Gewicht hat.
- palette: wähle aus den Farben des Bildes background (prägende Grundfarbe), surface (ruhige Fläche für Kästen) und accent (Signalfarbe).
- reasoning: Begründung in 2–3 Sätzen: warum diese Stelle, wie sie sich zum Motiv verhält, warum diese Farben.`;
}

/* Wahl der KI (oder der Person) übernehmen und alles festschreiben. antwort.variant darf der
   Buchstabe oder der Schlüssel einer Variante sein; passt keine, gilt die beste der App. */
export function pruefeVorschlag(analyse, antwort = {}, texte = {}, opts = {}) {
  const cfg = konfig(analyse.config || {}), K = komponiere(analyse, texte, opts), korrekturen = [];
  if (K.notfall) korrekturen.push('Das Bild hat keine ruhige Fläche, in die der Textblock passt. Er steht deshalb unten links auf einer Fläche.');
  const wunsch = String(antwort.variant || '');
  let v = K.varianten.find(x => x.key === wunsch) || K.varianten.find(x => x.id === wunsch);
  if (!v) { v = K.varianten[0] || null; if (wunsch && !K.notfall) korrekturen.push('Die gewählte Komposition passt mit den aktuellen Texten oder Schwellwerten nicht mehr. Es gilt die beste der verbleibenden.'); }
  if (v && v.panel && !K.notfall) korrekturen.push(`Direkt auf dem Bild erreicht die Schrift hier nicht ${cfg.kontrast_min} : 1. Der ganze Block steht deshalb auf einer Fläche.`);
  const gemessen = (analyse.palette || []).map(c => c.hex), p = antwort.palette || {};
  const aus = (wert, ersatz) => (istHex(wert) && gemessen.includes(hexNorm(wert)) ? hexNorm(wert) : ersatz);
  const bunt = gemessen.slice().sort((a, b) => saettigung(b) - saettigung(a))[0];
  const background = aus(p.background, gemessen[0] || '#FFFFFF');
  const palette = {
    background,
    surface: aus(p.surface, gemessen.find(h => h !== background) || background),
    accent: aus(p.accent, bunt || background),
    text: kontrast(cfg.text_hell, background) >= kontrast(cfg.text_dunkel, background) ? cfg.text_hell : cfg.text_dunkel
  };
  return { variant: v, variants: K.varianten, texts: K.texte, palette, reasoning: String(antwort.reasoning || '').trim(), corrections: korrekturen, emergency: K.notfall, min_contrast: cfg.kontrast_min };
}

/* ---------- HTML/CSS-Ansicht ---------- */
export const ANSICHT_SCHRIFT = 'https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600;700&display=swap';
export const ANSICHT_CSS = `.bd-ansicht{position:relative;width:100%;container-type:inline-size;background-size:100% 100%;background-repeat:no-repeat;overflow:hidden;font-family:"Familjen Grotesk",ui-sans-serif,system-ui,sans-serif}
.bd-block{position:absolute;display:flex;flex-direction:column;box-sizing:border-box;isolation:isolate}
.bd-schleier{position:absolute;inset:-6cqw;z-index:-1;filter:blur(4cqw);pointer-events:none}
.bd-block.a-links{align-items:flex-start;text-align:left}
.bd-block.a-mitte{align-items:center;text-align:center}
.bd-block.flaeche{border-radius:.6cqw}
.bd-headline{margin:0;font-weight:700;line-height:1.06;letter-spacing:-.015em;white-space:nowrap}
.bd-headline span{display:block}
.bd-subline{margin:0;font-weight:500;line-height:1.36;text-wrap:balance}
.bd-cta{display:inline-block;font-weight:600;line-height:1;padding:.85em 1.5em;border-radius:99em;text-decoration:none;white-space:nowrap}`;
/* Bild als Hintergrund, der Textblock an der Stelle der Variante */
export function ansichtHTML(analyse, v, texte = {}, bildURL = '') {
  const kopf = `<div class="bd-ansicht" style="aspect-ratio:${analyse.image.width}/${analyse.image.height};${bildURL ? `background-image:url('${bildURL}')` : 'background-color:#888'}">`;
  if (!v) return kopf + '</div>';
  const sub = String(texte.subline || '').trim(), cta = String(texte.cta || '').trim(), b = v.block;
  /* Unten verankerte Blöcke hängen an ihrer Unterkante, mittige an ihrer Mitte: so stimmt die
     Stelle auch dann, wenn die Schrift minimal anders läuft als berechnet. */
  const lage = v.anchor === 'unten' ? `bottom:${runde(100 - b.y - b.height)}%` : v.anchor === 'oben' ? `top:${b.y}%` : `top:${runde(b.y + b.height / 2)}%;transform:translateY(-50%)`;
  const fl = v.panel ? `;background:rgba(${hexZuRgb(v.panel.color).join(',')},${v.panel.opacity});box-shadow:0 0 0 2.4cqw rgba(${hexZuRgb(v.panel.color).join(',')},${v.panel.opacity})` : '';
  return `${kopf}<div class="bd-block a-${v.align}${v.panel ? ' flaeche' : ''}" data-variante="${v.id}" style="left:${b.x}%;width:${b.width}%;${lage};color:${v.colors.text}${fl}">${v.veil ? `<div class="bd-schleier" style="background:rgba(${hexZuRgb(v.veil.color).join(',')},${v.veil.opacity})"></div>` : ''}
<h1 class="bd-headline" style="font-size:${v.sizes.headline}cqw">${v.lines.map(z => `<span>${esc(z)}</span>`).join('')}</h1>
${sub ? `<p class="bd-subline" style="font-size:${v.sizes.subline}cqw;margin-top:${v.gaps.headline}cqw;max-width:${v.sub_max}cqw">${esc(sub)}</p>` : ''}
${cta ? `<a class="bd-cta" style="font-size:${v.sizes.cta}cqw;margin-top:${v.gaps.cta}cqw;background:${v.colors.cta_background};color:${v.colors.cta_text}">${esc(cta)}</a>` : ''}
</div></div>`;
}
/* Eigenständige HTML-Datei zum Speichern */
export function ansichtDatei(analyse, vorschlag, bildURL) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(vorschlag.texts.headline || analyse.image.name || 'Design-Vorschlag')}</title>
<link rel="stylesheet" href="${ANSICHT_SCHRIFT}">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:${vorschlag.palette.background}}
main{width:min(100vw,calc(100vh * ${analyse.image.width} / ${analyse.image.height}))}
${ANSICHT_CSS}
</style>
</head>
<body>
<main>${ansichtHTML(analyse, vorschlag.variant, vorschlag.texts, bildURL)}</main>
</body>
</html>
`;
}

/* ---------- Debug-Vorschau ---------- */
const muster = sw => `<defs>
<pattern id="bd-rot" width="${sw * 7}" height="${sw * 7}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${sw * 7}" height="${sw * 7}" fill="#D7362B" fill-opacity=".38"/><rect width="${sw * 2.5}" height="${sw * 7}" fill="#D7362B" fill-opacity=".75"/></pattern>
<pattern id="bd-rot2" width="${sw * 7}" height="${sw * 7}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${sw * 7}" height="${sw * 7}" fill="#D7362B" fill-opacity=".14"/><rect width="${sw * 1.6}" height="${sw * 7}" fill="#D7362B" fill-opacity=".55"/></pattern>
</defs>`;
const svgKopf = (W, H, name, bildURL) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(name)}">
${bildURL ? `<image href="${bildURL}" width="${W}" height="${H}" preserveAspectRatio="none"/>` : `<rect width="${W}" height="${H}" fill="#888"/>`}`;
const beschrift = (x, y, fs, zeilen) => `<text x="${x}" y="${y}" font-size="${fs}" font-family="ui-monospace,Menlo,monospace" font-weight="600" fill="#fff" stroke="#000" stroke-opacity=".7" stroke-width="${fs / 5}" paint-order="stroke">${zeilen.map((z, i) => `<tspan x="${x}" dy="${i ? fs * 1.25 : 0}">${esc(z)}</tspan>`).join('')}</text>`;
/* Originalbild mit eingezeichnetem Raster: Freiraum für Text grün, unscharfe Bereiche rot.
   Kacheln mit zu wenig Struktur (z. B. Himmel) lassen kein Urteil über die Schärfe zu und
   bleiben deshalb ohne Rot. */
export function debugSVG(analyse, grid, bildURL = '') {
  const W = analyse.image.width, H = analyse.image.height, liste = analyse.grids[grid] || [];
  const fs = Math.max(10, Math.round(Math.min(W, H) / 38)), sw = Math.max(1.5, Math.min(W, H) / 400);
  const kachel = k => {
    const rot = k.sharpness.reliable && k.sharpness.label !== 'scharf';
    const teile = [];
    if (k.text_space) teile.push(`<rect x="${k.x}" y="${k.y}" width="${k.width}" height="${k.height}" fill="#1FA35B" fill-opacity=".42"/>`);
    if (rot) teile.push(`<rect x="${k.x}" y="${k.y}" width="${k.width}" height="${k.height}" fill="${k.sharpness.label === 'blurry' ? 'url(#bd-rot)' : 'url(#bd-rot2)'}"/>`);
    teile.push(beschrift(k.x + fs * 0.5, k.y + fs * 1.3, fs, [`r${k.row}c${k.col}`, k.text_space ? `Text ${String(k.text_space_score).replace('.', ',')}` : '', rot ? k.sharpness.label : ''].filter(Boolean)));
    return teile.join('');
  };
  const linien = liste.map(k => `<rect x="${k.x}" y="${k.y}" width="${k.width}" height="${k.height}" fill="none"/>`).join('');
  return `${svgKopf(W, H, `Debug-Vorschau Raster ${grid}`, bildURL)}
${muster(sw)}
${liste.map(kachel).join('\n')}
<g stroke="#000" stroke-opacity=".55" stroke-width="${sw * 2.2}">${linien}</g>
<g stroke="#fff" stroke-width="${sw}">${linien}</g>
</svg>`;
}
/* Freiraum-Karte mit den Textflächen: freie Zellen grün, die Fläche jeder Variante gestrichelt,
   der Textblock als Rahmen mit Buchstabe. */
export function flaechenSVG(analyse, varianten = [], bildURL = '', aktiv = '') {
  const W = analyse.image.width, H = analyse.image.height, m = analyse.free_map;
  const fs = Math.max(10, Math.round(Math.min(W, H) / 34)), sw = Math.max(1.5, Math.min(W, H) / 400), zb = W / m.cols, zh = H / m.rows;
  const zellen = m.free.map((f, i) => (f ? `<rect x="${runde(i % m.cols * zb, 1)}" y="${runde(Math.floor(i / m.cols) * zh, 1)}" width="${runde(zb, 1)}" height="${runde(zh, 1)}" fill="#1FA35B" fill-opacity=".34" stroke="#1FA35B" stroke-opacity=".5" stroke-width="${sw / 2}"/>` : '')).join('');
  const px = (r, f = 'none') => `x="${runde(r.x * W / 100, 1)}" y="${runde(r.y * H / 100, 1)}" width="${runde(r.width * W / 100, 1)}" height="${runde(r.height * H / 100, 1)}" fill="${f}"`;
  const regionen = [...new Map(varianten.map(v => [JSON.stringify(v.region), v.region])).values()];
  return `${svgKopf(W, H, 'Freiraum-Karte mit Textflächen', bildURL)}
${zellen}
${regionen.map(r => `<rect ${px(r)} stroke="#fff" stroke-width="${sw * 1.4}" stroke-dasharray="${sw * 6} ${sw * 4}"/>`).join('')}
${varianten.map(v => `<rect ${px(v.block, v.key === aktiv || v.id === aktiv ? 'rgba(255,255,255,.22)' : 'none')} stroke="#000" stroke-opacity=".6" stroke-width="${sw * 3}"/><rect ${px(v.block)} stroke="#fff" stroke-width="${sw * 1.5}"/>${beschrift(v.block.x * W / 100 + fs * 0.4, v.block.y * H / 100 + fs * 1.2, fs, [v.id])}`).join('\n')}
</svg>`;
}

/* Kurze Zusammenfassung für die Oberfläche */
export function zusammenfassung(analyse) {
  const alle = alleKacheln(analyse);
  return { kacheln: alle.length, frei: alle.filter(k => k.text_space).length, unscharf: alle.filter(k => k.sharpness.reliable && k.sharpness.label !== 'scharf').length, beschrieben: alle.filter(k => k.description).length };
}
export { STANDARD };
