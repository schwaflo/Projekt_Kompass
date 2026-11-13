/* Tests für die Bildanalyse im Design-Studio: die Messung (bildanalyse/kern.js) und die Regeln
   für den Design-Vorschlag (bildanalyse/design.js). Die Testbilder entstehen im Code. */
import { test, assert, gleich } from './harness.js';
import * as K from '../bildanalyse/kern.js';
import * as G from '../bildanalyse/design.js';

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

/* ---------- Design-Vorschlag ---------- */
const ANALYSE = K.analysiereBild(HALB, { raster: ['2x2', '4x2'], original: { width: 1600, height: 800 } });
test('Design: der KI werden nur Freiraum-Kacheln und gemessene Farben angeboten', () => {
  const s = G.designSchema(ANALYSE);
  gleich(s.properties.headline.properties.tile.enum, ['2x2:r1c1', '2x2:r2c1', '4x2:r1c1', '4x2:r1c2', '4x2:r2c1', '4x2:r2c2']);
  gleich(s.properties.palette.properties.accent.enum, ANALYSE.palette.map(c => c.hex));
  const p = G.designPrompt(ANALYSE, { headline: 'Sommerfest' });
  assert(p.includes('Sommerfest') && p.includes('4x2:r1c2') && !p.includes('"x":'), 'Prompt nennt Text und Kacheln, aber keine Pixelwerte');
});
test('Design: Text in einer Kachel ohne Freiraum wird verschoben', () => {
  const v = G.pruefeVorschlag(ANALYSE, { headline: { tile: '2x2:r1c2', align: 'links', color: '#FFFFFF' }, subline: { tile: '4x2:r2c4', align: 'links', color: '#FFFFFF' }, cta: { tile: 'gibtsnicht', align: 'links', background: '#FFFFFF' } });
  const frei = new Set(K.alleKacheln(ANALYSE).filter(k => k.text_space).map(k => k.id));
  for (const r of G.ROLLEN) assert(frei.has(v.elements[r].tile), `${r} steht in ${v.elements[r].tile}`);
  for (const g of v.groups) assert(g.tiles.every(id => frei.has(id)), 'jede belegte Kachel hat Freiraum');
  gleich(v.corrections.length >= 3, true);
  assert(v.corrections[0].includes('2x2:r1c2') && v.corrections[0].includes('keinen Freiraum'), v.corrections[0]);
});
test('Design: zu schwache Schriftfarbe wird ersetzt, ausreichende bleibt', () => {
  const roh = { headline: { tile: '2x2:r1c1', align: 'links', color: '#22335A' }, subline: { tile: '2x2:r2c1', align: 'links', color: '#F2E9D0' }, cta: { tile: '2x2:r2c1', align: 'links', background: '#14285A' }, palette: {}, reasoning: 'Weil.' };
  const v = G.pruefeVorschlag(ANALYSE, roh);
  gleich(v.elements.headline.color, '#FFFFFF', 'dunkelblau auf dunkelblau ersetzt');
  gleich(v.elements.subline.color, '#F2E9D0', 'helle Farbe der KI bleibt');
  for (const r of ['headline', 'subline', 'cta']) assert(v.elements[r].contrast >= 4.5, `${r}: ${v.elements[r].contrast}`);
  assert(v.elements.cta.background !== '#14285A' && v.elements.cta.background_contrast >= 3, 'Knopf hebt sich vom Bild ab');
  assert(v.corrections.some(c => c.includes('Headline') && c.includes('#22335A')), 'Korrektur wird genannt');
  gleich(v.reasoning, 'Weil.');
});
test('Design: Texte in übereinander liegenden Kacheln stehen als Gruppe zusammen', () => {
  const v = G.pruefeVorschlag(ANALYSE, { headline: { tile: '2x2:r1c1', align: 'links', color: '#FFFFFF' }, subline: { tile: '4x2:r1c2', align: 'links', color: '#FFFFFF' }, cta: { tile: '4x2:r2c1', align: 'links', background: '#FFFFFF' } });
  gleich(v.groups.map(g => g.roles), [['headline', 'subline'], ['cta']]);
  gleich([v.groups[0].x, v.groups[0].y, v.groups[0].width, v.groups[0].height], [0, 0, 50, 50]);
  /* der Knopf wächst nach rechts in die freie Nachbarkachel, aber nicht ins Muster */
  gleich(v.groups[1].tiles, ['4x2:r2c1', '4x2:r2c2']);
  gleich([v.groups[1].x, v.groups[1].width, v.groups[1].valign], [0, 50, 'unten']);
});
test('Design: ohne Antwort der KI entsteht trotzdem ein gültiger Vorschlag', () => {
  const v = G.pruefeVorschlag(ANALYSE, {});
  gleich(v.elements.headline.tile, '2x2:r1c1');
  assert(ANALYSE.palette.some(c => c.hex === v.palette.background) && ANALYSE.palette.some(c => c.hex === v.palette.accent), 'Palette aus dem Bild');
  assert(K.kontrast(v.palette.text, v.palette.background) >= 4.5, 'Schrift der Palette lesbar');
});
test('Design: Bild ohne Freiraum bekommt eine Fläche unter dem Text', () => {
  const voll = K.analysiereBild(bild(120, 80, (x, y) => schach(x, y, 3)), { raster: ['2x2'] });
  gleich(G.kandidaten(voll).notfall, true);
  const v = G.pruefeVorschlag(voll, {});
  gleich(v.emergency, true);
  assert(v.groups.every(g => g.panel), 'Fläche als Unterlage');
  assert(v.elements.headline.contrast >= 4.5, `Kontrast auf der Fläche: ${v.elements.headline.contrast}`);
  assert(v.corrections[0].includes('keinen Freiraum'), 'Hinweis');
});
test('Design: HTML-Ansicht setzt die Texte an die Stellen des Vorschlags', () => {
  const v = G.pruefeVorschlag(ANALYSE, { headline: { tile: '4x2:r1c1', align: 'mitte', color: '#FFFFFF' }, subline: { tile: '4x2:r1c1', align: 'mitte', color: '#FFFFFF' }, cta: { tile: '4x2:r2c1', align: 'links', background: '#FFFFFF' } });
  const h = G.ansichtHTML(ANALYSE, v, { headline: 'Tag der <offenen> Tür', subline: 'Samstag', cta: 'Anmelden' }, 'bild.jpg');
  assert(h.includes('aspect-ratio:1600/800') && h.includes("url('bild.jpg')"), 'Bild als Hintergrund');
  assert(h.includes('Tag der &lt;offenen&gt; Tür'), 'Text maskiert');
  assert(/data-kachel="4x2:r1c1" style="left:0%;top:0%;width:50%;height:50%"/.test(h), 'Gruppe an der Kachel, über die freie Nachbarkachel verbreitert');
  assert(h.includes('h-mitte v-oben'), 'Ausrichtung');
  const d = G.ansichtDatei(ANALYSE, v, { headline: 'Test' }, 'bild.jpg');
  assert(d.startsWith('<!doctype html>') && d.includes('.bd-headline') && d.includes('<title>Test</title>'), 'eigenständige Datei');
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
