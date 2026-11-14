/* Tests für die Bildanalyse im Design-Studio: die Messung (bildanalyse/kern.js) und die Regeln
   für den Design-Vorschlag (bildanalyse/design.js). Die Testbilder entstehen im Code. */
import { test, assert, gleich } from './harness.js';
import * as K from '../bildanalyse/kern.js';
import * as G from '../bildanalyse/design.js';
import * as St from '../bildanalyse/stil.js';
import * as Sk from '../bildanalyse/skizzen.js';
import * as F from '../bildanalyse/frei.js';

/* ---------- Testbilder ---------- */
function bild(w, h, farbe) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = farbe(x, y), p = (y * w + x) * 4; data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2]; data[p + 3] = 255; }
  return { data, width: w, height: h };
}
const schach = (x, y, n = 4) => ((Math.floor(x / n) + Math.floor(y / n)) % 2 ? [255, 255, 255] : [0, 0, 0]);
/* Weichzeichner: Mittelwert über ein Quadrat, mehrfach angewendet */
function weich(b, radius, mal = 1) {
  let q = b;
  for (let m = 0; m < mal; m++) {
    const z = new Uint8ClampedArray(q.data.length), { width: w, height: h } = q;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
      let s = 0, n = 0;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue; s += q.data[(yy * w + xx) * 4 + c]; n++; }
      z[(y * w + x) * 4 + c] = s / n; z[(y * w + x) * 4 + 3] = 255;
    }
    q = { data: z, width: w, height: h };
  }
  return q;
}
/* Links ruhiges Dunkelblau, rechts kleinteiliges Schwarz-Weiß-Muster */
const HALB = bild(640, 320, (x, y) => (x < 320 ? [20, 40, 90] : schach(x, y, 3)));

/* ---------- Raster ---------- */
test('Bild: Raster lesen, 4x2 heißt 4 Spalten und 2 Zeilen', () => {
  gleich(K.parseRaster('4x2'), { name: '4x2', spalten: 4, zeilen: 2 });
  gleich(K.parseRaster(' 3 × 3 '), { name: '3x3', spalten: 3, zeilen: 3 });
  gleich(K.parseRaster('0x2'), null); gleich(K.parseRaster('13x2'), null); gleich(K.parseRaster('quatsch'), null);
  gleich(K.parseRasterListe('2x2, 4x2,2x2;;abc').map(r => r.name), ['2x2', '4x2']);
});
test('Bild: Kacheln decken das Bild lückenlos und ohne Überlappung ab', () => {
  for (const [w, h, name] of [[1600, 900, '4x2'], [1001, 667, '4x4'], [333, 500, '3x3']]) {
    const ra = K.parseRaster(name), k = K.kachelRechtecke(w, h, ra);
    gleich(k.length, ra.spalten * ra.zeilen);
    gleich(k.reduce((s, x) => s + x.width * x.height, 0), w * h, `Fläche ${name}`);
    assert(k.every(x => x.width > 0 && x.height > 0 && x.x >= 0 && x.y >= 0 && x.x + x.width <= w && x.y + x.height <= h), 'Kachel liegt im Bild');
  }
  const k = K.kachelRechtecke(1600, 900, K.parseRaster('4x2'));
  gleich([k[0].id, k[0].x, k[0].y, k[0].width, k[0].height], ['4x2:r1c1', 0, 0, 400, 450]);
  gleich([k[7].id, k[7].row, k[7].col, k[7].x, k[7].y], ['4x2:r2c4', 2, 4, 1200, 450]);
});
test('Bild: Positions-Labels', () => {
  gleich(K.positionsLabel(1, 1, 2, 2), 'oben links');
  gleich(K.positionsLabel(2, 2, 2, 2), 'unten rechts');
  gleich(K.positionsLabel(2, 2, 3, 3), 'Mitte');
  gleich(K.positionsLabel(1, 2, 3, 3), 'oben Mitte');
  gleich(K.positionsLabel(2, 1, 3, 3), 'Mitte links');
  gleich(K.positionsLabel(1, 2, 2, 4), 'oben Mitte links');
  gleich(K.positionsLabel(2, 4, 2, 4), 'unten rechts');
  gleich(K.positionsLabel(2, 3, 4, 4), 'obere Mitte, Mitte rechts');
  gleich(K.positionsLabel(3, 1, 4, 4), 'untere Mitte links');
  gleich(K.positionsLabel(1, 2, 1, 2), 'rechts');
  gleich(K.positionsLabel(1, 1, 1, 1), 'ganzes Bild');
  gleich(K.positionsLabel(3, 5, 6, 6), 'Zeile 3, Spalte 5');
});

/* ---------- Farben ---------- */
test('Bild: WCAG-Kontrast', () => {
  gleich(Math.round(K.kontrast('#FFFFFF', '#000000')), 21);
  gleich(K.kontrast('#777', '#777777'), 1);
  assert(Math.abs(K.kontrast('#FFFFFF', '#767676') - 4.54) < 0.01, 'Grau 767676 liegt knapp über 4,5');
  gleich(K.hexNorm('abc'), '#AABBCC');
  gleich(K.mische('#000000', '#FFFFFF', 0.5), '#808080');
});
test('Bild: k-Means findet die Farben und ihre Anteile, immer gleich', () => {
  const b = bild(100, 100, (x, y) => (x < 60 ? [200, 30, 30] : y < 75 ? [30, 60, 200] : [240, 240, 240]));
  const f = K.dominanteFarben(b, { x: 0, y: 0, width: 100, height: 100 }, 3);
  gleich(f.map(c => c.hex), ['#C81E1E', '#1E3CC8', '#F0F0F0']);
  gleich(f.map(c => Math.round(c.percent)), [60, 30, 10]);
  gleich(K.dominanteFarben(b, { x: 0, y: 0, width: 100, height: 100 }, 3), f, 'zweiter Lauf');
});
test('Bild: einfarbige Fläche ergibt eine Farbe mit 100 %', () => {
  const f = K.dominanteFarben(bild(40, 40, () => [12, 34, 56]), { x: 0, y: 0, width: 40, height: 40 }, 3);
  gleich(f, [{ hex: '#0C2238', percent: 100 }]);
});

/* ---------- Messung je Kachel ---------- */
test('Bild: Helligkeit und Kontrast', () => {
  const A = K.analysiereBild(bild(80, 40, x => (x < 40 ? [0, 0, 0] : [255, 255, 255])), { raster: ['2x1', '1x1'] });
  gleich(A.grids['2x1'].map(k => [k.brightness, k.contrast]), [[0, 0], [255, 0]]);
  gleich([A.grids['1x1'][0].brightness, A.grids['1x1'][0].contrast], [127.5, 127.5]);
});
test('Bild: Schärfe sinkt mit dem Weichzeichnen, Einstufung über Schwellwerte', () => {
  const scharf = bild(96, 96, (x, y) => schach(x, y, 6));
  const v = b => K.analysiereBild(b, { raster: ['1x1'] }).grids['1x1'][0].sharpness;
  const a = v(scharf), b = v(weich(scharf, 1)), c = v(weich(scharf, 3, 3));
  assert(a.laplace_variance > b.laplace_variance && b.laplace_variance > c.laplace_variance, `Varianz fällt: ${a.laplace_variance} > ${b.laplace_variance} > ${c.laplace_variance}`);
  gleich(a.label, 'scharf'); gleich(c.label, 'blurry');
  gleich(K.schaerfeLabel(150), 'scharf'); gleich(K.schaerfeLabel(149.9), 'leicht unscharf'); gleich(K.schaerfeLabel(44.9), 'blurry');
  gleich(K.schaerfeLabel(60, K.konfig({ schaerfe: { scharf: 50 } })), 'scharf', 'eigener Schwellwert');
});
test('Bild: Fläche ohne Struktur bekommt kein verlässliches Schärfe-Urteil', () => {
  const s = K.analysiereBild(bild(64, 64, () => [120, 160, 220]), { raster: ['1x1'] }).grids['1x1'][0].sharpness;
  gleich([s.label, s.reliable], ['blurry', false]);
});
test('Bild: Freiraum für Text nur in der ruhigen Hälfte', () => {
  const [links, rechts] = K.analysiereBild(HALB, { raster: ['2x1'] }).grids['2x1'];
  gleich([links.text_space, rechts.text_space], [true, false]);
  assert(links.text_space_score > 0.9 && rechts.text_space_score < 0.2, `Scores ${links.text_space_score} / ${rechts.text_space_score}`);
  assert(links.edge_density < 0.04 && rechts.edge_density > 0.5, 'Kantendichte');
  gleich([links.text_color, links.text_tone], ['#FFFFFF', 'hell'], 'helle Schrift auf Dunkelblau');
  assert(links.text_contrast >= 4.5, 'Kontrast reicht');
});
test('Bild: Score und Grenze des Freiraums', () => {
  gleich(K.textFreiraum(0, 0), { text_space: true, text_space_score: 1 });
  gleich(K.textFreiraum(0.04, 24), { text_space: true, text_space_score: 0.5 });
  gleich(K.textFreiraum(0.041, 0).text_space, false);
  gleich(K.textFreiraum(0, 24.1).text_space, false);
  gleich(K.textFreiraum(1, 200).text_space_score, 0);
  gleich(K.textFreiraum(0.06, 10, K.konfig({ freiraum: { kantendichte_max: 0.1 } })).text_space, true, 'eigener Schwellwert');
});
test('Bild: Schriftfarbe nach WCAG, dunkel auf hell und hell auf dunkel', () => {
  gleich(K.textFarbe([{ hex: '#F4F1EA', percent: 100 }]).text_tone, 'dunkel');
  gleich(K.textFarbe([{ hex: '#10203A', percent: 100 }]).text_tone, 'hell');
  /* zweite Farbe mit großem Anteil zählt mit, eine mit 5 % nicht */
  const gemischt = K.textFarbe([{ hex: '#10203A', percent: 60 }, { hex: '#FFFFFF', percent: 40 }]);
  assert(gemischt.text_contrast < 1.5, 'Schwarz-Weiß-Fläche: keine Schriftfarbe reicht');
  assert(K.textFarbe([{ hex: '#10203A', percent: 95 }, { hex: '#FFFFFF', percent: 5 }]).text_contrast > 10, 'kleiner Fleck zählt nicht');
});
test('Bild: Konfiguration mischt eigene Werte und fängt Unsinn ab', () => {
  const c = K.konfig({ schaerfe: { scharf: '200,5', leicht: -3 }, kontrast_min: 'abc', text_hell: 'fff', unbekannt: 1 });
  gleich([c.schaerfe.scharf, c.schaerfe.leicht, c.kontrast_min, c.text_hell], [200.5, 45, 4.5, '#FFFFFF']);
  gleich(c.unbekannt, undefined);
  gleich(K.konfig(), K.STANDARD);
});
test('Bild: Analyse-JSON hat overall und grids, Koordinaten in Originalpixeln', () => {
  const A = K.analysiereBild(HALB, { raster: ['2x2', '4x2'], name: 'test.jpg', original: { width: 1600, height: 800 } });
  gleich(Object.keys(A.grids), ['2x2', '4x2']);
  gleich([A.grids['2x2'].length, A.grids['4x2'].length], [4, 8]);
  assert('overall' in A && A.image.name === 'test.jpg' && A.image.width === 1600, 'Kopf');
  const k = A.grids['4x2'][5];
  gleich([k.id, k.row, k.col, k.label, k.x, k.y, k.width, k.height], ['4x2:r2c2', 2, 2, 'unten Mitte links', 400, 400, 400, 400]);
  for (const f of ['colors', 'brightness', 'contrast', 'sharpness', 'edge_density', 'color_variance', 'text_space', 'text_space_score', 'text_color', 'text_contrast', 'description']) assert(f in k, `Feld ${f}`);
  assert(k.colors.length >= 1 && k.colors.length <= 3 && k.colors.every(c => /^#[0-9A-F]{6}$/.test(c.hex)), 'Farben als Hex');
  gleich(A.grids['4x2'].map(x => x.text_space), [true, true, false, false, true, true, false, false]);
});

/* ---------- Freiraum-Karte und Komposition ---------- */
const ANALYSE = K.analysiereBild(HALB, { raster: ['2x2', '4x2'], original: { width: 1600, height: 800 } });
const TEXTE = { headline: 'Straßenfest-Glaube-Leben', subline: 'sei bereit für Begegnungen mit Gott', cta: 'Mehr erfahren' };
const zelleFrei = (A, x, y) => { const m = A.free_map; return m.free[Math.min(m.rows - 1, Math.floor(y / 100 * m.rows)) * m.cols + Math.min(m.cols - 1, Math.floor(x / 100 * m.cols))] === 1; };
/* Liegt der ganze Textblock auf freien Zellen? */
function blockFrei(A, v) { const b = v.block; for (let x = b.x; x < b.x + b.width; x += 1) for (let y = b.y; y < b.y + b.height; y += 1) if (!zelleFrei(A, x, y)) return false; return true; }

test('Bild: Freiraum-Karte ist ein feines Raster mit annähernd quadratischen Zellen', () => {
  const m = ANALYSE.free_map;
  gleich([m.cols, m.rows, m.free.length, m.color.length], [16, 8, 128, 128]);
  for (let y = 0; y < 8; y++) { assert(m.free[y * 16 + 2] === 1, 'links ruhig'); assert(m.free[y * 16 + 12] === 0, 'rechts unruhig'); }
});
test('Design: Headline bricht ausgewogen, an Leerzeichen und nach Bindestrichen', () => {
  gleich(G.umbruch('Straßenfest-Glaube-Leben', 2).lines, ['Straßenfest-', 'Glaube-Leben']);
  gleich(G.umbruch('Tag der offenen Tür', 2).lines, ['Tag der', 'offenen Tür']);
  gleich(G.umbruch('Sommerfest', 1).lines, ['Sommerfest']);
  gleich(G.umbruch('Sommerfest', 2), null, 'ein Wort lässt sich nicht teilen');
});
test('Design: feste Hierarchie, Größen aus Fläche und Format', () => {
  const t = G.setzeTypo(TEXTE, 40, 40, 0.5);
  assert(t.headline >= 2.2 * t.subline && t.subline > t.cta, `Headline ${t.headline}, Subline ${t.subline}, CTA ${t.cta}`);
  assert(t.width <= 40 && t.height <= 40, 'Block passt in die Fläche');
  assert(t.headline <= G.headlineMax(0.5), 'Obergrenze aus dem Format');
  const klein = G.setzeTypo(TEXTE, 20, 40, 0.5);
  assert(klein.headline < t.headline, 'kleinere Fläche, kleinere Headline');
  gleich(G.setzeTypo(TEXTE, 8, 40, 0.5), null, 'zu schmal für eine Headline mit Gewicht');
  assert(G.headlineMax(1.25) > G.headlineMax(0.5), 'Hochformat erlaubt im Verhältnis zur Breite größere Schrift');
});
test('Design: ruhige Flächen sind Rechtecke aus lauter freien Zellen', () => {
  const m = ANALYSE.free_map, fl = G.flaechen(m, 0.5);
  assert(fl.length >= 1, 'mindestens eine Fläche');
  for (const r of fl) for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) assert(m.free[y * m.cols + x] === 1, 'Zelle frei');
  gleich([fl[0].x0, fl[0].y0, fl[0].y1], [0, 0, 8], 'größte Fläche: die linke Hälfte in voller Höhe');
});
test('Design: jede Variante ist ein Block auf ruhiger Fläche mit Rand und Kontrast', () => {
  const k = G.komponiere(ANALYSE, TEXTE);
  assert(k.varianten.length >= 2 && k.varianten.length <= 4 && !k.notfall, `${k.varianten.length} Varianten`);
  gleich(k.varianten.map(v => v.id), ['A', 'B', 'C', 'D'].slice(0, k.varianten.length));
  for (const v of k.varianten) {
    assert(blockFrei(ANALYSE, v), `${v.id}: Block liegt ganz auf freien Zellen`);
    assert(v.contrast.text >= 4.5 && v.contrast.cta_text >= 4.5 && v.contrast.cta_background >= 3, `${v.id}: Kontrast ${JSON.stringify(v.contrast)}`);
    assert(v.block.x >= 2.9 && v.block.y >= 5.9 && v.block.y + v.block.height <= 94.1, `${v.id}: Rand zum Bild (${JSON.stringify(v.block)})`);
    assert(v.sizes.headline >= 2.2 * v.sizes.subline, `${v.id}: Hierarchie`);
    assert(!v.panel, `${v.id}: kein Kasten, wenn die Fläche ruhig ist`);
  }
  assert(k.varianten.every((v, i) => !i || v.score <= k.varianten[i - 1].score), 'beste zuerst');
  const m = k.varianten.find(v => v.anchor === 'motiv');
  assert(m && m.beside_subject, 'eine Variante richtet sich am Motiv aus');
  assert(m.block.x + m.block.width > m.region.x + m.region.width - 5, 'der Block steht an der Kante zum Motiv, nicht am Bildrand');
});
test('Design: mittlerer Bildton bekommt einen weichen Schleier statt eines Kastens', () => {
  const A = K.analysiereBild(bild(480, 320, () => [165, 110, 88]), { raster: ['2x2'] });
  const v = G.komponiere(A, TEXTE).varianten[0];
  assert(v.veil && !v.panel, 'Schleier, kein Kasten');
  assert(v.veil.opacity > 0 && v.veil.opacity <= 0.44, `Deckkraft ${v.veil.opacity}`);
  assert(v.contrast.text >= 4.5, `Kontrast ${v.contrast.text}`);
  gleich(v.align, 'mitte', 'freies Bild ohne Motiv: zentriert');
  const dunkel = K.analysiereBild(bild(480, 320, () => [20, 30, 60]), { raster: ['2x2'] });
  const d = G.komponiere(dunkel, TEXTE).varianten[0];
  assert(!d.veil && !d.panel && K.luminanz(d.colors.text) > 0.8, 'dunkles Bild: helle Schrift ohne Hilfsmittel');
});
test('Design: Bild ohne ruhige Fläche bekommt einen Block auf einer Fläche', () => {
  const voll = K.analysiereBild(bild(240, 160, (x, y) => schach(x, y, 3)), { raster: ['2x2'] });
  const v = G.pruefeVorschlag(voll, {}, TEXTE);
  gleich([v.emergency, v.variants.length, v.variant.align], [true, 1, 'links']);
  assert(v.variant.panel && v.variant.contrast.text >= 4.5, `Fläche mit Kontrast ${v.variant.contrast.text}`);
  assert(v.corrections[0].includes('keine ruhige Fläche'), 'Hinweis');
});
/* Motiv links (kleinteilig), ruhige Fläche rechts: wie ein Porträt vor einer Wand */
const MOTIV = K.analysiereBild(bild(640, 400, (x, y) => (x < 240 ? schach(x, y, 3) : [30, 45, 80])), { raster: ['2x2'] });
test('Design: Rasterregeln legen die Kanten des Blocks auf die Linien und treffen kein Bildelement', () => {
  for (const [regel, linien] of [['drittel', [100 / 3, 200 / 3]], ['golden', [38.2, 61.8]], ['viertel', [25, 50, 75]]]) {
    const k = G.komponiere(MOTIV, TEXTE, { regel });
    assert(k.varianten.length >= 1 && k.varianten.length <= 4 && !k.hinweis, `${regel}: ${k.varianten.length} Varianten`);
    gleich(k.linien.map(f => Math.round(f * 1000)), linien.map(l => Math.round(l * 10)), `${regel}: Linien`);
    for (const v of k.varianten) {
      const b = v.block, nahe = w => linien.some(l => Math.abs(l - w) < 0.02);
      assert(nahe(b.x) || nahe(b.x + b.width), `${regel} ${v.id}: senkrechte Kante auf einer Linie (${b.x} / ${b.x + b.width})`);
      assert(nahe(b.y) || nahe(b.y + b.height), `${regel} ${v.id}: waagerechte Kante auf einer Linie (${b.y} / ${b.y + b.height})`);
      gleich(v.overlap, 0, `${regel} ${v.id}: trifft nichts`);
      assert(blockFrei(MOTIV, v) && v.contrast.text >= 4.5 && v.key.startsWith(regel + '|'), `${regel} ${v.id}: frei, lesbar, eigener Schlüssel`);
    }
  }
});
test('Design: Rasterregel ohne freie Stelle zeigt die am wenigsten störende und sagt es', () => {
  const voll = K.analysiereBild(bild(240, 160, (x, y) => schach(x, y, 3)), { raster: ['2x2'] });
  const k = G.komponiere(voll, TEXTE, { regel: 'drittel' });
  assert(k.varianten.length >= 1 && k.hinweis.includes('keine Stelle ganz frei'), k.hinweis);
});
test('Design: Regelbruch „Überlappen“ schiebt den Block über die Kante des Motivs', () => {
  const k = G.komponiere(MOTIV, TEXTE, { regel: 'ueberlappen' }), auto = G.komponiere(MOTIV, TEXTE);
  assert(k.varianten.length >= 1, 'Varianten');
  for (const v of k.varianten) { assert(v.overlap >= 0.22 && v.overlap <= 0.6, `${v.id}: ${v.overlap} über dem Motiv`); assert(!v.panel, 'kein Kasten'); }
  assert(k.varianten[0].sizes.headline > auto.varianten[0].sizes.headline, 'größere Headline als im regelkonformen Layout');
  gleich(auto.varianten.every(v => v.overlap === 0), true, 'automatisch trifft nichts');
});
test('Design: Regelbruch „Übergroß“ setzt die Headline in Plakatgröße über die Breite', () => {
  const k = G.komponiere(MOTIV, TEXTE, { regel: 'uebergross' });
  assert(k.varianten.length >= 2, 'mehrere Höhen');
  for (const v of k.varianten) { assert(v.sizes.headline > G.headlineMax(400 / 640), `${v.id}: ${v.sizes.headline} über der normalen Obergrenze`); assert(v.block.x < 4 && v.overlap > 0, 'beginnt am Rand, läuft über das Motiv'); }
});
test('Design: Regel wird durchgereicht, unbekannte Regel fällt auf Automatisch', () => {
  gleich(G.pruefeVorschlag(MOTIV, {}, TEXTE, { regel: 'golden' }).rule, 'golden');
  gleich(G.pruefeVorschlag(MOTIV, {}, TEXTE, { regel: 'quatsch' }).rule, 'auto');
  gleich(Object.keys(G.REGELN), ['auto', 'drittel', 'golden', 'viertel', 'ueberlappen', 'uebergross']);
  const p = G.designPrompt(MOTIV, TEXTE, G.komponiere(MOTIV, TEXTE, { regel: 'drittel' }));
  assert(p.includes('LAYOUT-REGEL: Drittel'), 'Prompt nennt die Regel');
});
/* ---------- Stil: Farbflächen, Schmuck, Datum, Farbwelt ---------- */
test('Stil: Eingaben werden geprüft und mit den Vorgaben der Presets gefüllt', () => {
  const s = St.stilVoll({ farben: { schrift: 'abc', akzent: 'quatsch' }, flaeche: { art: 'band', groesse: 500 }, schmuck: { rahmen: { an: 1, staerke: 99 }, gibtsnicht: { an: true } }, datum: ' 30.03.19 ' });
  gleich(s.farben, { schrift: '#AABBCC', akzent: '', flaeche: '' });
  gleich(s.flaeche, { art: 'band', seite: 'rechts', groesse: 60, farbe: '', deckkraft: 1 });
  gleich([s.schmuck.rahmen.an, s.schmuck.rahmen.staerke, s.schmuck.rahmen.abstand, s.schmuck.diagonale.an, s.schmuck.diagonale.richtung], [true, 6, 3.5, false, 'steigend']);
  gleich([Object.keys(s.schmuck).length, s.datum], [Object.keys(St.SCHMUCK).length, '30.03.19']);
  gleich(St.stilVoll().flaeche.art, 'keine');
  gleich(St.stilVoll({ flaeche: { art: 'ton' } }).flaeche.deckkraft, 0.45);
});
test('Stil: Zahlen werden in Blöcke geteilt', () => {
  gleich(St.teileDatum('30.03.19'), ['30', '03', '19']);
  gleich(St.teileDatum('12 – 14 / 06'), ['12', '14', '06']);
  gleich(St.teileDatum(''), []);
});
test('Stil: Farbfläche macht ihre Zellen ruhig und trennt sich vom Foto', () => {
  const voll = K.analysiereBild(bild(320, 200, (x, y) => schach(x, y, 3)), { raster: ['2x2'] }).free_map;
  gleich(voll.free.some(Boolean), false, 'ohne Fläche ist nichts frei');
  const m = St.wendeFlaecheAn(voll, St.stilVoll({ flaeche: { art: 'sockel', groesse: 50 } }).flaeche, '#FFFFFF');
  const zeile = y => m.free.slice(y * m.cols, (y + 1) * m.cols);
  assert(zeile(m.rows - 1).every(f => f === 1) && zeile(0).every(f => f === 0), 'unten frei, oben nicht');
  gleich(m.color[(m.rows - 1) * m.cols], '#FFFFFF', 'Zelle hat die Farbe der Fläche');
  gleich(St.wendeFlaecheAn(voll, St.stilVoll({ flaeche: { art: 'ton' } }).flaeche, '#FFFFFF').free.some(Boolean), false, 'halb durchsichtiger Farbton beruhigt nichts');
  /* Kante genau zwischen zwei Zellen: die Bildzelle daneben trennt */
  const ruhig = K.analysiereBild(bild(320, 200, () => [30, 45, 80]), { raster: ['2x2'] }).free_map;
  const b = St.wendeFlaecheAn(ruhig, St.stilVoll({ flaeche: { art: 'band', seite: 'links', groesse: 50 } }).flaeche, '#FFFFFF');
  gleich([b.free[7], b.free[8], b.free[9]], [1, 0, 1], 'Trennzelle neben der Kante');
});
test('Stil: der Text stellt sich auf die Farbfläche und nimmt dazu passende Farben', () => {
  const voll = K.analysiereBild(bild(320, 200, (x, y) => schach(x, y, 3)), { raster: ['2x2'] });
  const k = G.komponiere(voll, TEXTE, { stil: { flaeche: { art: 'sockel', groesse: 50, farbe: '#FFFFFF' } } }), v = k.varianten[0];
  assert(!k.notfall && v, 'mit Sockel gibt es eine ruhige Fläche');
  gleich([v.on_surface, v.overlap, v.panel, v.veil], [1, 0, null, null], 'ganz auf der Fläche, ohne Kasten und Schleier');
  assert(v.block.y >= 50 && K.luminanz(v.colors.text) < 0.1 && v.contrast.text >= 4.5, 'unten, dunkle Schrift auf Weiß');
  gleich(k.gestalt.flaeche.polygon, [[0, 50], [100, 50], [100, 100], [0, 100]]);
  const dunkel = G.komponiere(voll, TEXTE, { stil: { flaeche: { art: 'sockel', groesse: 50, farbe: '#101820' } } }).varianten[0];
  assert(K.luminanz(dunkel.colors.text) > 0.8, 'auf dunkler Fläche helle Schrift');
  const h = G.ansichtHTML(voll, v, k.texte, '', { stil: k.gestalt });
  assert(h.includes('class="bd-flaeche"') && h.includes('polygon(0% 50%,100% 50%,100% 100%,0% 100%)') && h.includes('rgba(255,255,255,1)'), 'Fläche in der Ansicht');
});
test('Stil: Datum steht gestapelt im Band und nie auf dem Textblock', () => {
  const k = G.komponiere(MOTIV, TEXTE, { stil: { flaeche: { art: 'band', seite: 'rechts', groesse: 16, farbe: '#FFFFFF' }, datum: '30.03.19' } });
  for (const v of k.varianten) {
    const d = v.date, b = v.block;
    gleich(d.parts, ['30', '03', '19']);
    assert(d.x >= 84 && d.x + d.width <= 100, `${v.id}: im Band (${d.x})`);
    assert(d.x >= b.x + b.width || d.x + d.width <= b.x || d.y >= b.y + b.height || d.y + d.height <= b.y, `${v.id}: nicht auf dem Block`);
    assert(d.contrast >= 4.5 && K.luminanz(d.color) < 0.1, `${v.id}: dunkel auf Weiß`);
    assert(b.x + b.width <= 84, `${v.id}: der Textblock läuft nicht ins Band`);
  }
  const ohne = G.komponiere(MOTIV, TEXTE, { stil: { datum: '30.03.19' } }).varianten[0];
  assert(ohne.date && G.ansichtHTML(MOTIV, ohne, TEXTE, '').includes('class="bd-datum"') && G.ansichtHTML(MOTIV, ohne, TEXTE, '').includes('<b>30</b><i></i><b>03</b>'), 'ohne Band in einer Ecke, als Stapel');
  gleich(G.komponiere(MOTIV, TEXTE).varianten[0].date, null, 'ohne Angabe kein Datum');
});
test('Stil: Farbwelt gilt, wo sie lesbar ist, sonst sagt die App warum nicht', () => {
  const gut = G.pruefeVorschlag(MOTIV, {}, TEXTE, { stil: { farben: { schrift: '#FFF4D6', akzent: '#FFB000' } } });
  gleich([gut.variant.colors.text, gut.variant.colors.cta_background, gut.corrections.length], ['#FFF4D6', '#FFB000', 0]);
  const schlecht = G.pruefeVorschlag(MOTIV, {}, TEXTE, { stil: { farben: { schrift: '#22335A', akzent: '#20304F' } } });
  assert(schlecht.variant.colors.text !== '#22335A' && schlecht.variant.contrast.text >= 4.5, 'dunkelblau auf dunkelblau wird nicht genommen');
  assert(schlecht.corrections.some(c => c.includes('#22335A')) && schlecht.corrections.some(c => c.includes('#20304F')), 'beide Abweichungen werden genannt');
  gleich(G.leseFarbwelt({ schrift: '#112233', akzent: 'rot', flaeche: 'fff', name: 'Meer' }), { schrift: '#112233', akzent: '', flaeche: '#FFFFFF', name: 'Meer' });
  assert(G.farbweltPrompt(MOTIV, 'frisch, Meer').includes('frisch, Meer'), 'Prompt nennt den Wunsch');
});
test('Stil: Schmuck über dem Bild und am Textblock', () => {
  const stil = { schmuck: { diagonale: { an: true, richtung: 'kreuz', farbe: '#FF0000' }, rahmen: { an: true }, ecken: { an: true }, akzentlinie: { an: true }, balken: { an: true, farbe: '#00FF00' } } };
  const v = G.pruefeVorschlag(MOTIV, {}, TEXTE, { stil }), h = G.ansichtHTML(MOTIV, v.variant, v.texts, '', { stil: v.style });
  for (const id of Object.keys(St.SCHMUCK)) assert(h.includes(`data-schmuck="${id}"`), id);
  assert(h.includes('stroke="#FF0000"') && h.includes('background:#00FF00'), 'eigene Farben');
  assert(h.includes(`stroke="${v.variant.colors.text}"`), 'ohne eigene Farbe: Schriftfarbe der Komposition');
  assert(/<path data-schmuck="diagonale" d="M0 [\d.]+L640 [\d.]+M0 [\d.]+L640 [\d.]+"/.test(h), 'gekreuzt: zwei Linien');
  assert(!G.ansichtHTML(MOTIV, v.variant, v.texts, '').includes('bd-schmuck'), 'ohne Stil kein Schmuck');
  assert(G.ansichtDatei(MOTIV, v, '').includes('data-schmuck="rahmen"') && G.ANSICHT_CSS.includes('.bd-datum'), 'auch in der gespeicherten Datei');
});
/* ---------- Aufruf, Schriftbehandlung, Skizzen ---------- */
test('Stil: Aufruf ist eine Textzeile mit Pfeil, der Knopf eine Option', () => {
  gleich(St.stilVoll().typo, { versal: false, gewicht: 700, cta: 'zeile' });
  const z = G.pruefeVorschlag(MOTIV, {}, TEXTE), hz = G.ansichtHTML(MOTIV, z.variant, z.texts, '', { stil: z.style });
  assert(hz.includes('class="bd-cta zeile"') && hz.includes('→') && !/class="bd-cta" /.test(hz), 'Vorgabe: Zeile');
  const k = G.pruefeVorschlag(MOTIV, {}, TEXTE, { stil: { typo: { cta: 'knopf' } } }), hk = G.ansichtHTML(MOTIV, k.variant, k.texts, '', { stil: k.style });
  assert(hk.includes(`background:${k.variant.colors.cta_background}`) && !hk.includes('bd-cta zeile'), 'Knopf mit Fläche');
});
test('Stil: Versalien werden als Großbuchstaben gesetzt und laufen breiter', () => {
  const v = G.komponiere(MOTIV, TEXTE, { regel: 'uebergross', stil: { typo: { versal: true } } }).varianten[0];
  gleich(v.lines.join(' '), v.lines.join(' ').toUpperCase());
  assert(v.lines.join('').includes('STRASSENFEST'), v.lines.join('|'));
  /* dieselbe Zeile misst in Versalien mit Sperrung breiter */
  const na = G.komponiere(MOTIV, { headline: 'Sommerfest' }).varianten[0], va = G.komponiere(MOTIV, { headline: 'Sommerfest' }, { stil: { typo: { versal: true } } }).varianten[0];
  assert(va.block.width / va.sizes.headline > na.block.width / na.sizes.headline, 'breiter im Verhältnis zur Schriftgröße');
  const h = G.ansichtHTML(MOTIV, v, TEXTE, '', { stil: St.stilVoll({ typo: { versal: true, gewicht: 500 } }) });
  assert(h.includes('font-weight:500') && h.includes('letter-spacing:.05em'), 'Schnitt und Sperrung');
});
test('Skizzen: Grundskizzen unterscheiden sich und lassen sich alle setzen', () => {
  gleich(Sk.motivSeite(MOTIV), 'links');
  const g = Sk.eigeneSkizzen(MOTIV);
  gleich(g.length, 6);
  gleich(new Set(g.map(s => JSON.stringify([s.regel, s.stil]))).size, 6, 'keine Kombination doppelt');
  gleich(g.find(s => s.name.startsWith('Band')).stil.flaeche.seite, 'links', 'Band liegt über dem Motiv');
  for (const s of g) { const v = G.pruefeVorschlag(MOTIV, {}, TEXTE, { regel: s.regel, stil: s.stil }); assert(v.variant && v.variant.contrast.text >= 4.5, `${s.name}: setzbar und lesbar`); }
});
test('Skizzen: Urteile werden begrenzt und sortiert', () => {
  gleich(Sk.leseBewertung({ lesbarkeit: 9, motiv: 'abc', spannung: 3.6, urteil: ' ok ', verbessern: '' }), { lesbarkeit: 5, motiv: 1, spannung: 4, urteil: 'ok', verbessern: '', summe: 10 });
  const w = (l, m, sp) => Sk.leseBewertung({ lesbarkeit: l, motiv: m, spannung: sp });
  const r = Sk.rangfolge([{ name: 'a', wertung: w(3, 3, 3) }, { name: 'b' }, { name: 'c', wertung: w(5, 4, 4) }, { name: 'd', wertung: w(4, 3, 2) }]);
  gleich(r.map(s => s.name), ['c', 'd', 'a', 'b'], 'Punkte, bei Gleichstand Lesbarkeit, ohne Urteil zuletzt');
  assert(Sk.bewertungPrompt({ idee: 'Hand weist nach rechts' }, TEXTE).includes('Hand weist nach rechts'), 'Prompt nennt die Idee');
});
/* ---------- Freies Layout ---------- */
const FREI = { skizzen: [{ name: 'Geste führt', idee: 'Die Hand zeigt auf das Wort.', formen: [{ art: 'rechteck', x: 60, y: 0, breite: 40, hoehe: 100, farbe: '#FFFFFF', deckkraft: 100, gefuellt: true, staerke: 2, drehung: 0 }, { art: 'linie', x: 0, y: 80, breite: 100, hoehe: -40, farbe: '112233', deckkraft: 100, gefuellt: false, staerke: 2, drehung: 0 }, { art: 'stern' }],
  texte: [{ text: 'Straßenfest\\nGlaube', x: 64, y: 20, groesse: 6, breite: 0, farbe: '#101820', gewicht: 'fett', versal: true, ausrichtung: 'links', drehung: 0 }, { text: 'Leben', x: 10, y: 90, groesse: 14, breite: 0, farbe: 'keinefarbe', gewicht: 'ultra', versal: false, ausrichtung: 'quer', drehung: -90 }, { text: '   ' }, { text: 'sei bereit für Begegnungen mit Gott', x: 64, y: 60, groesse: 2.2, breite: 30, farbe: '#101820', gewicht: 'normal', versal: false, ausrichtung: 'links', drehung: 0 }] }] };
test('Frei: Antwort der KI wird nur in eine zeichenbare Form gebracht, nicht umgestaltet', () => {
  const [s] = F.leseFrei(FREI), L = s.layout;
  gleich([s.name, s.frei, L.formen.length, L.texte.length], ['Geste führt', true, 2, 3], 'unbekannte Form und leerer Text fallen weg');
  gleich(L.texte[0], { text: 'Straßenfest\nGlaube', x: 64, y: 20, groesse: 6, breite: 0, farbe: '#101820', gewicht: 'fett', versal: true, ausrichtung: 'links', drehung: 0 }, 'Angaben der KI bleiben, wie sie sind');
  gleich([L.texte[1].farbe, L.texte[1].gewicht, L.texte[1].ausrichtung, L.texte[1].drehung, L.texte[1].groesse], ['#FFFFFF', 'fett', 'links', -90, 14], 'nur Ungültiges wird ersetzt');
  gleich(L.formen[1].farbe, '#112233');
  gleich(F.leseFrei({ name: 'Einzeln', idee: 'x', formen: [], texte: [{ text: 'A', x: 1, y: 1, groesse: 500 }] })[0].layout.texte[0].groesse, 40, 'einzelne Skizze, Größe begrenzt');
  gleich(F.leseFrei({ skizzen: [{ name: 'leer', texte: [] }] }), [], 'ohne Text keine Skizze');
});
test('Frei: Darstellung setzt jedes Element an seine Stelle, mit Drehung und Ausrichtung', () => {
  const L = F.leseFrei(FREI)[0].layout, h = F.freiHTML(MOTIV, L, 'bild.jpg');
  assert(h.includes("url('bild.jpg')") && h.includes('aspect-ratio:640/400'), 'Foto');
  assert(h.includes('left:60%;top:0%;width:40%;height:100%;background:rgba(255,255,255,1)'), 'Fläche');
  assert(/<line x1="0" y1="320" x2="640" y2="160" stroke="#112233"/.test(h), 'Linie in Bildpixeln');
  assert(h.includes('class="bf-text versal"') && h.includes('left:64%;top:20%;font-size:6cqw;font-weight:700;color:#101820'), 'Text');
  assert(h.includes('rotate(-90deg)') && h.includes('width:30cqw'), 'Drehung und Zeilenbreite');
  assert(!h.includes('data-bf='), 'ohne Bearbeiten keine Kennungen');
  const b = F.freiHTML(MOTIV, L, '', { bearbeiten: true, gewaehlt: 'texte.1' });
  assert(b.includes('data-bf="texte.1" data-an="1"') && b.includes('data-bf="formen.0"'), 'Kennungen und Auswahl');
  assert(F.freiHTML(MOTIV, { formen: [], texte: [{ ...L.texte[0], text: '<b>' }] }, '').includes('&lt;b&gt;'), 'maskiert');
});
test('Frei: die App misst nach und meldet, statt zu ändern', () => {
  const L = F.leseFrei(FREI)[0].layout, vorher = JSON.stringify(L), m = F.messeLayout(MOTIV, L);
  gleich(JSON.stringify(L), vorher, 'das Layout bleibt unangetastet');
  assert(m.texte[0].kontrast > 10 && m.texte[0].ueberMotiv === 0, `dunkel auf der weißen Fläche: ${JSON.stringify(m.texte[0])}`);
  assert(m.texte[1].ueberMotiv > 0.5, `gedrehtes Wort links liegt auf dem Motiv: ${JSON.stringify(m.texte[1])}`);
  const schwach = F.messeLayout(MOTIV, { formen: [], texte: [{ ...L.texte[0], x: 50, farbe: '#22335A' }, { ...L.texte[0], x: 52, y: 22, farbe: '#22335A' }, { ...L.texte[0], x: 95, y: 50 }] });
  assert(schwach.texte[0].kontrast < 2 && schwach.ueberlappungen.length === 1 && schwach.texte[2].ausserhalb > 0.5, 'schwacher Kontrast, Überdeckung, Anschnitt');
  const t = F.messungText(schwach);
  assert(t.includes('kaum lesbar') && t.includes('überdecken sich') && t.includes('ragen aus dem Bild'), t);
});
test('Frei: Zeilenumbruch und Umriss', () => {
  const t = { text: 'eins zwei drei vier fünf sechs', groesse: 4, breite: 20, gewicht: 'normal', versal: false, ausrichtung: 'mitte', x: 50, y: 10, drehung: 0 };
  const z = F.zeilen(t); assert(z.length >= 2 && z.join(' ') === t.text, z.join('|'));
  gleich(F.zeilen({ ...t, breite: 0, text: 'A\nB', versal: true }), ['A', 'B']);
  const u = F.umriss(t, 0.625); assert(u.x < 50 && u.x + u.b > 50 && u.b <= 20.5, `mittig um den Anker: ${JSON.stringify(u)}`);
  const d = F.umriss({ ...t, breite: 0, ausrichtung: 'links', drehung: -90 }, 0.625); assert(d.h > d.b && d.y < 10, 'gedreht: hoch statt breit, nach oben');
});
test('Frei: Prompts geben Freiheit, Inhalt und Rückmeldung mit', () => {
  const p = F.freiPrompt(MOTIV, { ...TEXTE, datum: '14.06.' }, 4);
  assert(p.includes('Straßenfest-Glaube-Leben') && p.includes('14.06.') && p.includes('keine Vorgaben zu Raster') && p.includes('4 Entwürfe'), 'Freiheit und Inhalt');
  gleich(F.kartenText(MOTIV).split('\n').length, MOTIV.free_map.rows);
  assert(/^#+\.+$/.test(F.kartenText(MOTIV).split('\n')[2]), 'Karte: Motiv links, ruhig rechts');
  const s = F.leseFrei(FREI)[0], w = Sk.leseBewertung({ lesbarkeit: 2, motiv: 4, spannung: 4, urteil: 'Spannend, aber schwer lesbar.', verbessern: 'Unterzeile größer.' });
  const u = F.ueberarbeitePrompt(MOTIV, TEXTE, s, { wertung: w, messung: F.messeLayout(MOTIV, s.layout), wunsch: 'Datum senkrecht' });
  assert(u.includes('Spannend, aber schwer lesbar.') && u.includes('MESSWERTE') && u.includes('Datum senkrecht') && u.includes('"groesse":14') && u.includes('entscheide selbst'), 'Kritik, Messwerte, Wunsch, bisheriges Layout');
  gleich(F.freiSchema(5).properties.skizzen.maxItems, 5);
});
test('Frei: Baukasten-Entwurf lässt sich in ein freies Layout verwandeln', () => {
  const v = G.pruefeVorschlag(MOTIV, {}, TEXTE, { stil: { flaeche: { art: 'sockel', farbe: '#FFFFFF' }, schmuck: { diagonale: { an: true, richtung: 'kreuz' }, rahmen: { an: true } }, datum: '30.03.19' } });
  const L = F.ausVorschlag(MOTIV, v);
  gleich(L.texte.map(t => t.text.split('\n')[0]), [v.variant.lines[0], TEXTE.subline, 'Mehr erfahren →', '30']);
  gleich([L.texte[0].x, L.texte[0].y, L.texte[0].groesse, L.texte[0].farbe], [Math.round((v.variant.align === 'mitte' ? v.variant.block.x + v.variant.block.width / 2 : v.variant.block.x) * 10) / 10, Math.round(v.variant.block.y * 10) / 10, v.variant.sizes.headline, v.variant.colors.text]);
  gleich(L.formen.map(f => f.art), ['rechteck', 'linie', 'linie', 'rechteck'], 'Sockel, zwei Diagonalen, Rahmen');
  assert(L.formen[0].gefuellt && !L.formen[3].gefuellt, 'Fläche gefüllt, Rahmen als Umriss');
  assert(F.freiDatei(MOTIV, { name: 'X', layout: L }, 'b.jpg', '', 'f.css').includes('<title>X</title>'), 'Datei');
});
test('Design: die KI wählt nur zwischen geprüften Varianten und gemessenen Farben', () => {
  const k = G.komponiere(ANALYSE, TEXTE), s = G.designSchema(ANALYSE, k);
  gleich(s.properties.variant.enum, k.varianten.map(v => v.id));
  gleich(s.properties.palette.properties.accent.enum, ANALYSE.palette.map(c => c.hex));
  const p = G.designPrompt(ANALYSE, TEXTE, k);
  assert(p.includes('Straßenfest-Glaube-Leben') && p.includes('A: Textblock') && p.includes('als ein Block'), 'Prompt nennt Texte und Varianten');
});
test('Design: Wahl übernehmen, Unsinn abfangen', () => {
  const b = G.pruefeVorschlag(ANALYSE, { variant: 'B', palette: { background: '#123456' }, reasoning: 'Weil.' }, TEXTE);
  gleich([b.variant.id, b.reasoning, b.corrections.length], ['B', 'Weil.', 0]);
  assert(ANALYSE.palette.some(c => c.hex === b.palette.background), 'fremde Palettenfarbe ersetzt');
  assert(K.kontrast(b.palette.text, b.palette.background) >= 4.5, 'Schrift der Palette lesbar');
  gleich(G.pruefeVorschlag(ANALYSE, { variant: b.variant.key }, TEXTE).variant.id, 'B', 'auch über den Schlüssel');
  const x = G.pruefeVorschlag(ANALYSE, { variant: 'Z' }, TEXTE);
  gleich([x.variant.id, x.corrections.length], ['A', 1]);
  gleich(G.pruefeVorschlag(ANALYSE, {}, TEXTE).variant.id, 'A', 'ohne KI gilt die beste der App');
});
test('Design: HTML-Ansicht setzt einen Block an die Stelle der Variante', () => {
  const v = G.pruefeVorschlag(ANALYSE, {}, { headline: 'Tag der <offenen> Tür', subline: 'Samstag', cta: 'Anmelden' });
  const h = G.ansichtHTML(ANALYSE, v.variant, v.texts, 'bild.jpg');
  assert(h.includes('aspect-ratio:1600/800') && h.includes("url('bild.jpg')"), 'Bild als Hintergrund');
  gleich((h.match(/class="bd-block/g) || []).length, 1, 'genau ein Block');
  assert(h.includes('&lt;offenen&gt;') && h.includes('Samstag') && h.includes('Anmelden'), 'Texte, maskiert');
  assert(h.includes(`left:${v.variant.block.x}%`) && h.includes(`font-size:${v.variant.sizes.headline}cqw`), 'Lage und Größe aus der Variante');
  assert(!G.ansichtHTML(ANALYSE, v.variant, { headline: 'Nur Titel' }, '').includes('bd-cta'), 'leere Elemente entfallen');
  const d = G.ansichtDatei(ANALYSE, v, 'bild.jpg');
  assert(d.startsWith('<!doctype html>') && d.includes('.bd-headline') && d.includes('<title>Tag der &lt;offenen&gt; Tür</title>'), 'eigenständige Datei');
});
test('Design: Textflächen-Vorschau zeigt freie Zellen und die Blöcke der Varianten', () => {
  const k = G.komponiere(ANALYSE, TEXTE), svg = G.flaechenSVG(ANALYSE, k.varianten, '', 'A');
  gleich((svg.match(/fill="#1FA35B"/g) || []).length, ANALYSE.free_map.free.filter(Boolean).length);
  assert(svg.includes('stroke-dasharray') && svg.includes('>A</tspan>'), 'Fläche gestrichelt, Block beschriftet');
});
test('Design: Debug-Vorschau zeichnet Raster, Freiraum grün und Unschärfe rot', () => {
  const unscharf = weich(bild(160, 80, (x, y) => (x < 80 ? [20, 40, 90] : schach(x, y, 8))), 3, 3);
  const A = K.analysiereBild(unscharf, { raster: ['2x1'] });
  gleich(A.grids['2x1'].map(k => [k.text_space, k.sharpness.reliable && k.sharpness.label !== 'scharf']), [[true, false], [false, true]]);
  const svg = G.debugSVG(A, '2x1');
  gleich((svg.match(/fill="#1FA35B"/g) || []).length, 1, 'eine grüne Kachel');
  gleich((svg.match(/fill="url\(#bd-rot2?\)"/g) || []).length, 1, 'eine rote Kachel');
  gleich((svg.match(/fill="none"/g) || []).length, 4, 'Rasterlinien für beide Kacheln, je zweimal');
  assert(svg.includes('viewBox="0 0 160 80"'), 'Maße des Bildes');
});
test('Design: Beschreibung auf zwei Sätze kürzen', () => {
  gleich(G.kuerzeBeschreibung('Ein Hügel.  Darüber Himmel! Und noch mehr. Viel mehr.'), 'Ein Hügel. Darüber Himmel!');
  gleich(G.kuerzeBeschreibung('Nur ein Halbsatz'), 'Nur ein Halbsatz');
});
