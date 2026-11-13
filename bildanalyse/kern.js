/* ============================================================
   Bildanalyse – Rechenkern
   Alles hier ist deterministisch und kommt ohne Browser aus:
   Raster, dominante Farben (k-Means), Helligkeit, Kontrast,
   Schärfe (Varianz des Laplace-Operators), Kantendichte und
   Freiraum für Text. Ein Bild ist { data, width, height } mit
   RGBA-Werten wie bei ImageData.
   ============================================================ */

/* Alle Schwellwerte an einer Stelle. Das Design-Studio zeigt sie unter „Schwellwerte“
   und speichert nur Abweichungen von diesen Vorgaben. */
export const STANDARD = {
  /* Längste Seite, auf die das Bild für die Messung verkleinert wird. Schärfe und
     Kantendichte hängen von der Auflösung ab, deshalb immer dieselbe Größe. */
  arbeitsgroesse: 1024,
  farben: 3,
  schaerfe: {
    scharf: 150,        /* Laplace-Varianz ab hier: „scharf“ */
    leicht: 45,         /* ab hier: „leicht unscharf“, darunter „blurry“ */
    min_kontrast: 10    /* unter diesem Kontrast hat die Kachel zu wenig Struktur für ein Urteil */
  },
  freiraum: {
    kantenschwelle: 60,      /* Stärke, ab der ein Pixel als Kante zählt (Sobel, 0–1020) */
    kantendichte_max: 0.04,  /* höchster Anteil Kantenpixel für Freiraum */
    farbvarianz_max: 24      /* höchste Streuung der Farbe (0–128) für Freiraum */
  },
  kontrast_min: 4.5,         /* WCAG AA für Text */
  kontrast_flaeche_min: 3,   /* WCAG für Flächen wie den Knopf */
  text_hell: '#FFFFFF',
  text_dunkel: '#16202A'
};

const istObj = o => o && typeof o === 'object' && !Array.isArray(o);
/* Vorgaben mit eigenen Werten mischen; ungültige Angaben fallen auf die Vorgabe zurück */
export function konfig(eigene = {}, basis = STANDARD) {
  const out = {};
  for (const [k, v] of Object.entries(basis)) {
    const e = eigene ? eigene[k] : undefined;
    if (istObj(v)) out[k] = konfig(istObj(e) ? e : {}, v);
    else if (typeof v === 'number') { const n = typeof e === 'string' ? parseFloat(e.replace(',', '.')) : e; out[k] = typeof n === 'number' && isFinite(n) && n >= 0 ? n : v; }
    else out[k] = typeof e === 'string' && istHex(e) ? hexNorm(e) : v;
  }
  return out;
}

/* ---------- Farben und WCAG ---------- */
export const istHex = h => /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(h || '').trim());
export function hexNorm(h) {
  let s = String(h).trim().replace(/^#/, '');
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  return '#' + s.toUpperCase();
}
export const rgbZuHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
export const hexZuRgb = h => { const s = hexNorm(h).slice(1); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); };
export function luminanz(hex) {
  const [r, g, b] = hexZuRgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function kontrast(a, b) {
  const x = luminanz(a), y = luminanz(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/* Vordergrund mit Deckkraft über einem Hintergrund */
export function mische(vorn, hinten, deckkraft) {
  const a = hexZuRgb(vorn), b = hexZuRgb(hinten);
  return rgbZuHex(a.map((v, i) => v * deckkraft + b[i] * (1 - deckkraft)));
}
const runde = (n, stellen = 2) => { const f = 10 ** stellen; return Math.round(n * f) / f; };
const klemme = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));

/* ---------- Raster ---------- */
/* „4x2“ heißt 4 Spalten nebeneinander, 2 Zeilen untereinander. */
export function parseRaster(text) {
  const m = /^\s*(\d{1,2})\s*[x×*]\s*(\d{1,2})\s*$/i.exec(String(text || ''));
  if (!m) return null;
  const spalten = +m[1], zeilen = +m[2];
  if (spalten < 1 || zeilen < 1 || spalten > 12 || zeilen > 12) return null;
  return { name: `${spalten}x${zeilen}`, spalten, zeilen };
}
export function parseRasterListe(text) {
  const liste = (Array.isArray(text) ? text : String(text || '').split(/[,;\s]+/)).map(parseRaster).filter(Boolean);
  return liste.filter((r, i) => liste.findIndex(x => x.name === r.name) === i);
}
const LAGE_V = { 1: [''], 2: ['oben', 'unten'], 3: ['oben', 'Mitte', 'unten'], 4: ['oben', 'obere Mitte', 'untere Mitte', 'unten'] };
const LAGE_H = { 1: [''], 2: ['links', 'rechts'], 3: ['links', 'Mitte', 'rechts'], 4: ['links', 'Mitte links', 'Mitte rechts', 'rechts'] };
/* Lesbares Label wie „oben links“; zeile und spalte zählen ab 1 */
export function positionsLabel(zeile, spalte, zeilen, spalten) {
  if (!LAGE_V[zeilen] || !LAGE_H[spalten]) return `Zeile ${zeile}, Spalte ${spalte}`;
  const v = LAGE_V[zeilen][zeile - 1], h = LAGE_H[spalten][spalte - 1];
  if (!v && !h) return 'ganzes Bild';
  if (v === 'Mitte' && h === 'Mitte') return 'Mitte';
  if (!v || !h) return v || h;
  return v.includes(' ') && h.includes(' ') ? `${v}, ${h}` : `${v} ${h}`;
}
/* Kacheln mit Position und Pixel-Koordinaten; die Kanten liegen lückenlos aneinander */
export function kachelRechtecke(breite, hoehe, raster) {
  const out = [];
  for (let z = 0; z < raster.zeilen; z++) for (let s = 0; s < raster.spalten; s++) {
    const x0 = Math.round(s * breite / raster.spalten), x1 = Math.round((s + 1) * breite / raster.spalten);
    const y0 = Math.round(z * hoehe / raster.zeilen), y1 = Math.round((z + 1) * hoehe / raster.zeilen);
    out.push({ id: `${raster.name}:r${z + 1}c${s + 1}`, row: z + 1, col: s + 1, label: positionsLabel(z + 1, s + 1, raster.zeilen, raster.spalten), x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  }
  return out;
}

/* ---------- Karten für das ganze Bild: Graustufen, Laplace, Kantenstärke ---------- */
export function karten(bild) {
  const { data, width: w, height: h } = bild, n = w * h;
  const grau = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) grau[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  /* Laplace mit dem 4er-Kern (wie cv2.Laplacian mit ksize=1) auf den ungeglätteten Werten */
  const lap = new Float32Array(n);
  /* Leichte Glättung (3×3 Gauß) vor der Kantensuche, damit Bildrauschen keine Kanten vortäuscht */
  const glatt = new Float32Array(n);
  const at = (a, x, y) => a[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    lap[i] = at(grau, x - 1, y) + at(grau, x + 1, y) + at(grau, x, y - 1) + at(grau, x, y + 1) - 4 * grau[i];
    glatt[i] = (4 * grau[i] + 2 * (at(grau, x - 1, y) + at(grau, x + 1, y) + at(grau, x, y - 1) + at(grau, x, y + 1))
      + at(grau, x - 1, y - 1) + at(grau, x + 1, y - 1) + at(grau, x - 1, y + 1) + at(grau, x + 1, y + 1)) / 16;
  }
  const kante = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = at(glatt, x - 1, y - 1), b = at(glatt, x, y - 1), c = at(glatt, x + 1, y - 1), d = at(glatt, x - 1, y), f = at(glatt, x + 1, y), g = at(glatt, x - 1, y + 1), hh = at(glatt, x, y + 1), k = at(glatt, x + 1, y + 1);
    const gx = c + 2 * f + k - a - 2 * d - g, gy = g + 2 * hh + k - a - 2 * b - c;
    kante[y * w + x] = Math.sqrt(gx * gx + gy * gy);
  }
  return { w, h, grau, lap, kante };
}

/* ---------- k-Means ohne Zufall ---------- */
/* punkte: Float32Array mit r,g,b hintereinander. Start: der Punkt am Mittelwert, danach jeweils
   der Punkt, der am weitesten von allen bisherigen Zentren entfernt liegt. So liefert dasselbe
   Bild immer dieselben Farben. */
export function kmeans(punkte, k, durchlaeufe = 14) {
  const n = punkte.length / 3;
  if (!n) return [];
  const d2 = (i, c) => { const a = punkte[i * 3] - c[0], b = punkte[i * 3 + 1] - c[1], e = punkte[i * 3 + 2] - c[2]; return a * a + b * b + e * e; };
  const mittel = [0, 0, 0];
  for (let i = 0; i < n; i++) { mittel[0] += punkte[i * 3]; mittel[1] += punkte[i * 3 + 1]; mittel[2] += punkte[i * 3 + 2]; }
  mittel.forEach((v, i) => { mittel[i] = v / n; });
  let start = 0, best = Infinity;
  for (let i = 0; i < n; i++) { const d = d2(i, mittel); if (d < best) { best = d; start = i; } }
  const zentren = [[punkte[start * 3], punkte[start * 3 + 1], punkte[start * 3 + 2]]];
  const naechst = new Float32Array(n).fill(Infinity);
  while (zentren.length < k) {
    const c = zentren[zentren.length - 1];
    let weit = -1, wi = 0;
    for (let i = 0; i < n; i++) { const d = d2(i, c); if (d < naechst[i]) naechst[i] = d; if (naechst[i] > weit) { weit = naechst[i]; wi = i; } }
    if (weit < 1) break;   /* alle Punkte liegen schon auf einem Zentrum */
    zentren.push([punkte[wi * 3], punkte[wi * 3 + 1], punkte[wi * 3 + 2]]);
  }
  const zu = new Int32Array(n);
  let zahl = [];
  for (let lauf = 0; lauf < durchlaeufe; lauf++) {
    const summe = zentren.map(() => [0, 0, 0]); zahl = zentren.map(() => 0);
    let wechsel = 0;
    for (let i = 0; i < n; i++) {
      let b = 0, bd = Infinity;
      for (let c = 0; c < zentren.length; c++) { const d = d2(i, zentren[c]); if (d < bd) { bd = d; b = c; } }
      if (zu[i] !== b) { zu[i] = b; wechsel++; }
      summe[b][0] += punkte[i * 3]; summe[b][1] += punkte[i * 3 + 1]; summe[b][2] += punkte[i * 3 + 2]; zahl[b]++;
    }
    zentren.forEach((c, j) => { if (zahl[j]) { c[0] = summe[j][0] / zahl[j]; c[1] = summe[j][1] / zahl[j]; c[2] = summe[j][2] / zahl[j]; } });
    if (!wechsel && lauf) break;
  }
  /* Fast gleiche Farben zusammenlegen, leere Gruppen entfernen */
  let gruppen = zentren.map((c, j) => ({ rgb: c, zahl: zahl[j] })).filter(g => g.zahl > 0);
  for (let i = 0; i < gruppen.length; i++) for (let j = gruppen.length - 1; j > i; j--) {
    const a = gruppen[i], b = gruppen[j];
    if (Math.hypot(a.rgb[0] - b.rgb[0], a.rgb[1] - b.rgb[1], a.rgb[2] - b.rgb[2]) < 12) {
      const z = a.zahl + b.zahl; a.rgb = a.rgb.map((v, x) => (v * a.zahl + b.rgb[x] * b.zahl) / z); a.zahl = z; gruppen.splice(j, 1);
    }
  }
  gruppen.sort((a, b) => b.zahl - a.zahl);
  return gruppen.map(g => ({ hex: rgbZuHex(g.rgb), percent: runde(g.zahl / n * 100, 1) }));
}
/* Pixel eines Ausschnitts in gleichmäßigen Abständen einsammeln */
function stichprobe(bild, r, hoechstens) {
  const schritt = Math.max(1, Math.ceil(Math.sqrt(r.width * r.height / hoechstens)));
  const out = [];
  for (let y = r.y; y < r.y + r.height; y += schritt) for (let x = r.x; x < r.x + r.width; x += schritt) {
    const p = (y * bild.width + x) * 4; out.push(bild.data[p], bild.data[p + 1], bild.data[p + 2]);
  }
  return Float32Array.from(out);
}
export const dominanteFarben = (bild, r, k = 3, hoechstens = 3000) => kmeans(stichprobe(bild, r, hoechstens), k);

/* ---------- Einstufungen ---------- */
export function schaerfeLabel(varianz, cfg = STANDARD) {
  return varianz >= cfg.schaerfe.scharf ? 'scharf' : varianz >= cfg.schaerfe.leicht ? 'leicht unscharf' : 'blurry';
}
/* Freiraum: wenig Kanten und wenig Farbunterschied. Score 1 = völlig ruhig, 0,5 = genau an der Grenze. */
export function textFreiraum(kantendichte, farbvarianz, cfg = STANDARD) {
  const f = cfg.freiraum;
  const sk = klemme(1 - kantendichte / (2 * f.kantendichte_max)), sv = klemme(1 - farbvarianz / (2 * f.farbvarianz_max));
  return { text_space: kantendichte <= f.kantendichte_max && farbvarianz <= f.farbvarianz_max, text_space_score: runde(0.6 * sk + 0.4 * sv) };
}
/* Kleinster Kontrast einer Schriftfarbe gegenüber allen Farben, die mindestens 10 % der Fläche füllen */
export function kleinsterKontrast(farbe, farben) {
  const wichtig = farben.filter((c, i) => i === 0 || c.percent >= 10);
  return Math.min(...wichtig.map(c => kontrast(farbe, c.hex)));
}
/* Helle oder dunkle Schrift: die mit dem größeren Kontrast zum Hintergrund */
export function textFarbe(farben, cfg = STANDARD) {
  const hell = kleinsterKontrast(cfg.text_hell, farben), dunkel = kleinsterKontrast(cfg.text_dunkel, farben);
  return hell >= dunkel ? { text_color: cfg.text_hell, text_tone: 'hell', text_contrast: runde(hell) } : { text_color: cfg.text_dunkel, text_tone: 'dunkel', text_contrast: runde(dunkel) };
}

/* ---------- Eine Kachel messen ---------- */
/* r liegt in den Koordinaten des gemessenen Bildes */
export function messeKachel(bild, K, r, cfg = STANDARD) {
  let n = 0, sg = 0, sg2 = 0, sl = 0, sl2 = 0, kanten = 0, sr = 0, sgn = 0, sb = 0, sr2 = 0, sgn2 = 0, sb2 = 0;
  const schwelle = cfg.freiraum.kantenschwelle;
  for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) {
    const i = y * K.w + x, p = i * 4, g = K.grau[i], l = K.lap[i], R = bild.data[p], G = bild.data[p + 1], B = bild.data[p + 2];
    n++; sg += g; sg2 += g * g; sl += l; sl2 += l * l; if (K.kante[i] > schwelle) kanten++;
    sr += R; sgn += G; sb += B; sr2 += R * R; sgn2 += G * G; sb2 += B * B;
  }
  if (!n) n = 1;
  const va = (s, s2) => Math.max(0, s2 / n - (s / n) ** 2);
  const helligkeit = sg / n, kontrastWert = Math.sqrt(va(sg, sg2)), lapVar = va(sl, sl2);
  const kantendichte = kanten / n, farbvarianz = Math.sqrt((va(sr, sr2) + va(sgn, sgn2) + va(sb, sb2)) / 3);
  const colors = dominanteFarben(bild, r, cfg.farben);
  return {
    colors,
    mean_color: rgbZuHex([sr / n, sgn / n, sb / n]),
    brightness: runde(helligkeit, 1),
    contrast: runde(kontrastWert, 1),
    sharpness: { laplace_variance: runde(lapVar, 1), label: schaerfeLabel(lapVar, cfg), reliable: kontrastWert >= cfg.schaerfe.min_kontrast },
    edge_density: runde(kantendichte, 4),
    color_variance: runde(farbvarianz, 1),
    ...textFreiraum(kantendichte, farbvarianz, cfg),
    ...textFarbe(colors, cfg)
  };
}

/* ---------- Ganzes Bild ---------- */
/* bild: die verkleinerte Fassung für die Messung. original: Breite und Höhe der Datei; alle
   Koordinaten im Ergebnis beziehen sich darauf. */
export function analysiereBild(bild, { raster = ['2x2', '4x2'], cfg: eigene = {}, name = '', original = null } = {}) {
  const cfg = konfig(eigene), K = karten(bild);
  const W = original ? original.width : bild.width, H = original ? original.height : bild.height;
  const fx = bild.width / W, fy = bild.height / H;
  const grids = {};
  for (const ra of parseRasterListe(raster)) {
    grids[ra.name] = kachelRechtecke(W, H, ra).map(k => {
      const x0 = Math.round(k.x * fx), y0 = Math.round(k.y * fy), x1 = Math.round((k.x + k.width) * fx), y1 = Math.round((k.y + k.height) * fy);
      return { ...k, ...messeKachel(bild, K, { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) }, cfg), description: '' };
    });
  }
  return {
    version: 1,
    image: { name, width: W, height: H, measured_width: bild.width, measured_height: bild.height },
    config: cfg,
    overall: null,
    palette: dominanteFarben(bild, { x: 0, y: 0, width: bild.width, height: bild.height }, 6, 8000),
    grids
  };
}
/* Alle Kacheln aller Raster als Liste, jeweils mit dem Namen ihres Rasters */
export const alleKacheln = analyse => Object.entries(analyse.grids || {}).flatMap(([grid, liste]) => liste.map(k => ({ ...k, grid })));
