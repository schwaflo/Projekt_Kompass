/* ============================================================
   Bildanalyse – Oberfläche im Design-Studio („Bild-Design“)
   Hängt sich in die App aus index.html ein und nutzt deren
   Bausteine: Zustand S, run(), render(), die Live-Ansicht der KI
   und den Bildspeicher des Studios.
   Ablauf: Bild wählen → analysieren (Messung + Vision-Modell)
   → Debug-Vorschau prüfen → Design vorschlagen → speichern oder
   in den Flyer-Entwurf übernehmen.
   ============================================================ */
/* global recIndex, isOpenAI, apiBase, authH */
/* global S, ui, render, run, save, esc, toast, liveInner, designState, addLog, slug, KIND, TOK, FORMATE, errorBox, loadAssets */
import { STANDARD, konfig, analysiereBild, parseRaster, parseRasterListe, alleKacheln } from './kern.js';
import * as G from './design.js';
import { FLAECHEN, SCHMUCK, stilVoll } from './stil.js';
import * as Sk from './skizzen.js';
import * as F from './frei.js';

Object.assign(KIND, {
  bild_gesamt: { name: 'Gesamtbild beschreiben', expect: 500 },
  bild_kachel: { name: 'Kachel beschreiben', expect: 160 },
  bild_design: { name: 'Design-Vorschlag zusammenführen', expect: 700 },
  bild_farben: { name: 'Farbwelt vorschlagen', expect: 120 },
  bild_frei: { name: 'Frei entwerfen', expect: 3400 },
  bild_frei2: { name: 'Entwurf überarbeiten', expect: 900 },
  bild_urteil: { name: 'Skizze ansehen und beurteilen', expect: 320 }
});
Object.assign(TOK, { bild_gesamt: 600, bild_kachel: 260, bild_design: 1000, bild_farben: 300, bild_frei: 4600, bild_frei2: 1800, bild_urteil: 500 });

const RASTER_FEST = ['2x2', '4x2', '4x4'];
const DESIGN_WUNSCH = /gemma-?4/i;

/* ---------- Zustand (liegt in S.design.bild und wird mit dem Projekt gespeichert) ---------- */
function Z() {
  const D = designState();
  if (!D.bild) D.bild = { asset: '', raster: ['2x2', '4x2'], eigene: [], beschreiben: true, vlm: '', modell: '', cfg: {}, analysen: {}, vorschlaege: {}, tab: 'analyse', grid: '' };
  if (!D.bild.skizzen) D.bild.skizzen = {};
  if (!D.bild.frei) D.bild.frei = {};
  if (!D.bild.rasterStand) D.bild.rasterStand = {};
  if (!D.bild.spaeter) D.bild.spaeter = {};
  if (!D.bild.stil) D.bild.stil = { farben: {}, flaeche: { art: 'keine' }, schmuck: {}, datum: '' };
  /* Analysen entfernter Bilder nicht weiter mitspeichern */
  const da = new Set(D.assets.map(a => a.id));
  for (const feld of ['analysen', 'vorschlaege', 'skizzen', 'frei', 'rasterStand', 'spaeter']) for (const id of Object.keys(D.bild[feld])) if (!da.has(id)) delete D.bild[feld][id];
  return D.bild;
}
const an = () => S.screen === 'design' && S.design && S.design.modus === 'bild';
/* Ohne Projektanalyse gibt es keinen Flyer-Entwurf: dann steht das Bild-Design für sich */
const ohneProjekt = () => !S.phasen.length && !S.ergebnis;
const bilder = () => designState().assets.filter(a => a.w > 0);   /* SVG-Dateien haben keine Pixel zum Messen */
function asset() {
  const z = Z(), liste = bilder();
  return liste.find(a => a.id === z.asset) || liste.find(a => a.rolle !== 'logo') || liste[0] || null;
}
/* Braucht dieses Bild eine Analyse? Nur wenn es noch keine gibt oder seit der letzten ein anderes Raster gewählt wurde. */
function offen(a) {
  const z = Z(), A = z.analysen[a.id];
  if (!A) return 'neu';
  const stand = z.rasterStand[a.id] || Object.keys(A.grids), gleich = l => [...l].sort().join(',');
  return gleich(stand) === gleich(z.raster) ? '' : 'raster';
}
/* Neu hinzugekommene Fotos: das jüngste wird gleich ausgewählt, damit die Nachfrage zur Analyse erscheint */
function merkeNeue() {
  const z = Z(), ids = bilder().map(a => a.id);
  if (!ui.bdBekannt) { ui.bdBekannt = new Set(ids); return; }
  const neu = ids.filter(id => !ui.bdBekannt.has(id));
  if (neu.length) { z.asset = neu[neu.length - 1]; neu.forEach(id => ui.bdBekannt.add(id)); z.tab = 'analyse'; }
}
const modelle = () => ui.models || [];
/* Welche Modelle verstehen Bilder? Ollama sagt es über /api/show. Bei anderen Servern ist es
   nicht abfragbar; dort gilt jedes Modell als möglich. */
/* Welche Modelle verstehen Bilder? Die Angaben kommen aus dem gemeinsamen KI-Aufruf in index.html
   (window.KompassKI); neu gelesen wird nur, was noch fehlt. */
const KI = () => window.KompassKI;
const ladeFaehigkeiten = () => KI().ladeModellInfo().then(neu => { if (neu && an() && !ui.busy) render(); });
/* Vor jedem Lauf: Fähigkeiten kennen und ein Modell haben, das Bilder versteht */
async function bildModell() { await KI().ladeModellInfo(); const m = vlmName(); if (!m) throw new Error(OHNE_BILDMODELL); return m; }
const denktImmer = m => KI().denktImmer(m);
const bildModelle = () => KI().bildModelle();
/* Vision-Modell: die eigene Wahl, sonst wie überall in der App (qwen2.5vl, Modell der Startseite, schnellstes Bildmodell) */
const vlmName = () => KI().bildModell(Z().vlm);
const OHNE_BILDMODELL = 'Keines deiner Modelle versteht Bilder. Lade eines in Ollama, zum Beispiel mit „ollama pull qwen2.5vl:7b“, und klicke danach auf der Startseite auf „Verbinden“.';
const designName = () => (Z().modell && modelle().includes(Z().modell) ? Z().modell : modelle().find(m => DESIGN_WUNSCH.test(m)) || (S.model && !denktImmer(S.model) ? S.model : modelle().find(m => !denktImmer(m)) || S.model));
const texte = () => { const t = designState().texte || {}; return { headline: t.headline || '', subline: t.subline || '', cta: t.cta || '' }; };
/* Textbreite mit der echten Schrift messen, damit Zeilen und Größen genau stimmen */
const messFlaeche = document.createElement('canvas').getContext('2d');
const messe = (text, fett) => { messFlaeche.font = `${fett ? 700 : 500} 100px "Familjen Grotesk", ui-sans-serif, system-ui, sans-serif`; return messFlaeche.measureText(text).width / 100 * 1.02; };
/* Der Vorschlag wird bei jedem Zeichnen neu gerechnet, damit geänderte Texte und Schwellwerte sofort gelten.
   Die Varianten kommen von der App; von der KI stammen nur Wahl, Palette und Begründung. */
const regel = () => (G.REGELN[Z().regel] ? Z().regel : 'auto');
const merk = new Map();
/* Wunsch für die aktuelle Regel: erst die eigene Wahl, sonst die der KI, wenn sie für diese Regel gilt */
function wunsch(v, r) {
  const eigene = v.wahl && typeof v.wahl === 'object' ? v.wahl[r] : '';
  return eigene || ((v.kiRegel || 'auto') === r ? v.key || '' : '');
}
/* Die Kompositionen ändern sich nur mit Bild, Texten, Stil, Schwellwerten oder Schrift: so lange merken */
function komponiert(id, r, stil) {
  const A = Z().analysen[id];
  const marke = [id, r, JSON.stringify(stil), JSON.stringify(texte()), JSON.stringify(A.config), A.image.measured_width, A.free_map.free.join(''), document.fonts ? document.fonts.status : ''].join('|');
  if (!merk.has(marke)) { if (merk.size > 120) merk.clear(); merk.set(marke, G.komponiere(A, texte(), { messe, regel: r, stil })); }
  return merk.get(marke);
}
function vorschlag(id, r = regel()) {
  const z = Z(), A = z.analysen[id], v = z.vorschlaege[id] || {};
  if (!A || !A.free_map) return null;
  const ki = (v.kiRegel || 'auto') === r ? v.roh || {} : {};
  return G.pruefeVorschlag(A, { variant: wunsch(v, r), palette: (v.roh || {}).palette, reasoning: ki.reasoning }, texte(), { fertig: komponiert(id, r, z.stil) });
}
/* Durch alle Kompositionen aller Regeln blättern */
function blaettere(schritt) {
  const z = Z(), a = asset(); if (!a) return;
  const alle = Object.keys(G.REGELN).flatMap(r => { const v = vorschlag(a.id, r); return v ? v.variants.map(x => [r, x.key]) : []; });
  if (!alle.length) return;
  const jetzt = vorschlag(a.id), i = alle.findIndex(([r, k]) => r === regel() && jetzt.variant && k === jetzt.variant.key);
  const [r, k] = alle[((i < 0 ? 0 : i + schritt) % alle.length + alle.length) % alle.length];
  const v = z.vorschlaege[a.id] = { ...(z.vorschlaege[a.id] || {}) };
  v.wahl = { ...(v.wahl && typeof v.wahl === 'object' ? v.wahl : {}), [r]: k };
  z.regel = r; save(); render();
}

/* ---------- Bilder laden und zuschneiden ---------- */
const ladeBild = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Das Bild konnte nicht gelesen werden.')); i.src = url; });
function flaeche(img, sx, sy, sw, sh, laengste, vergroessern = false) {
  let k = laengste / Math.max(sw, sh); if (!vergroessern) k = Math.min(1, k);
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high';
  x.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return { c, x };
}
const messbild = (img, max) => { const { c, x } = flaeche(img, 0, 0, img.naturalWidth, img.naturalHeight, max); return x.getImageData(0, 0, c.width, c.height); };
const alsJpeg = (img, sx, sy, sw, sh, laengste, vergr) => flaeche(img, sx, sy, sw, sh, laengste, vergr).c.toDataURL('image/jpeg', 0.88);

/* ---------- Analyse ---------- */
/* Aufruf der KI. Fehler, die am Modell liegen, bekommen eine Meldung, mit der man etwas anfangen kann. */
async function frage(o) {
  try { return await window.KompassKI.frage(o); }
  catch (e) {
    const t = String(e.message || e);
    if (o.bilder && /multimodal|does not support image|vision|image input/i.test(t)) throw new Error(`Das Modell „${o.modell}“ versteht keine Bilder. Wähle links unter „Modelle“ ein Vision-Modell.`);
    if (/Denkphase nicht abschalten|kommt zu keinem Ende|kommt zu keiner Antwort/.test(t)) throw new Error(`Das Modell „${o.modell}“ denkt bei jedem Aufruf sehr lange nach und kommt nicht zu einem Ergebnis. Wähle links unter „Modelle“ ein anderes, zum Beispiel eines ohne Denkphase.`);
    throw e;
  }
}
function fortschritt(text) { ui.busyText = text; const el = document.getElementById('bd-fort'); if (el) el.textContent = text; }
function vermiss(a, img, alt) {
  const z = Z();
  const A = analysiereBild(messbild(img, konfig(z.cfg).arbeitsgroesse), { raster: z.raster, cfg: z.cfg, name: a.name, original: { width: img.naturalWidth, height: img.naturalHeight } });
  if (alt) {
    /* Beschreibungen des Vision-Modells behalten, die Messwerte sind neu */
    const b = Object.fromEntries(alleKacheln(alt).map(k => [k.id, k.description]));
    A.overall = alt.overall; A.vlm = alt.vlm;
    Object.values(A.grids).forEach(l => l.forEach(k => { k.description = b[k.id] || ''; }));
  }
  return A;
}
/* Nur die Messung wiederholen, zum Beispiel nach geänderten Schwellwerten */
async function neuRechnen() {
  const z = Z();
  for (const a of bilder()) {
    if (!z.analysen[a.id] || !ui.assetURL[a.id]) continue;
    try { z.analysen[a.id] = vermiss(a, await ladeBild(ui.assetURL[a.id]), z.analysen[a.id]); } catch (e) { ui.error = e.message; }
  }
  save(); if (an()) render();
}
function analysiere(liste, nurFehlende) {
  const z = Z();
  if (!liste.length) return;
  if (!parseRasterListe(z.raster).length) { ui.error = 'Wähle mindestens ein Raster.'; return render(); }
  if (!vlmName()) { ui.error = OHNE_BILDMODELL; return render(); }
  run(liste.length > 1 ? 'Bilder werden analysiert …' : 'Bild wird analysiert …', async () => {
    const modell = await bildModell();
    for (const [nr, a] of liste.entries()) {
      const vor = liste.length > 1 ? `Bild ${nr + 1} von ${liste.length} · ` : '';
      fortschritt(vor + 'Farben, Schärfe und Freiraum werden gemessen');
      const img = await ladeBild(ui.assetURL[a.id]);
      const A = z.analysen[a.id] = vermiss(a, img, nurFehlende ? z.analysen[a.id] : null);
      if (!nurFehlende) delete z.vorschlaege[a.id];
      z.rasterStand[a.id] = [...z.raster]; delete z.spaeter[a.id];
      A.vlm = modell; save();
      if (!A.overall) {
        fortschritt(vor + 'Gesamtbild wird beschrieben');
        const o = await frage({ system: G.VISION_SYSTEM, prompt: G.GESAMT_PROMPT, schema: G.GESAMT_SCHEMA, art: 'bild_gesamt', bilder: [alsJpeg(img, 0, 0, img.naturalWidth, img.naturalHeight, 1024)], modell, denken: false });
        A.overall = Object.fromEntries(G.GESAMT_SCHEMA.required.map(k => [k, String(o[k] || '').trim()]));
        if (!a.beschreibung && A.overall.main_subject) a.beschreibung = A.overall.main_subject;
        save();
      }
      if (!z.beschreiben) continue;
      const offen = alleKacheln(A).filter(k => !k.description);
      for (const [i, k] of offen.entries()) {
        fortschritt(`${vor}Kachel ${i + 1} von ${offen.length} wird beschrieben (${k.grid}, ${k.label})`);
        const o = await frage({ system: G.VISION_SYSTEM, prompt: G.kachelPrompt(k), schema: G.KACHEL_SCHEMA, art: 'bild_kachel', bilder: [alsJpeg(img, k.x, k.y, k.width, k.height, 512, true)], modell, denken: false });
        A.grids[k.grid].find(x => x.id === k.id).description = G.kuerzeBeschreibung(o.description);
        save();
      }
    }
    z.tab = 'analyse';
    addLog(liste.length > 1 ? `${liste.length} Bilder analysiert` : 'Bild analysiert', liste.map(a => a.name).join(', '));
  });
}
function schlageVor() {
  const z = Z(), a = asset(), A = a && z.analysen[a.id];
  if (!A) return;
  run('Design-Vorschlag entsteht …', async () => {
    const modell = designName();
    fortschritt('Analyse wird zu einem Design-Vorschlag zusammengeführt');
    const K = vorschlag(a.id) ? { regel: regel(), varianten: vorschlag(a.id).variants, texte: vorschlag(a.id).texts } : G.komponiere(A, texte(), { messe, regel: regel(), stil: z.stil });
    const roh = await frage({ system: G.DESIGN_SYSTEM, prompt: G.designPrompt(A, texte(), K), schema: G.designSchema(A, K), art: 'bild_design', modell, denken: false });   /* ohne Denkphase: die Varianten sind schon geprüft */
    const wahl = K.varianten.find(v => v.id === roh.variant);
    const alt = z.vorschlaege[a.id] || {}, eigene = { ...(alt.wahl && typeof alt.wahl === 'object' ? alt.wahl : {}) };
    delete eigene[regel()];   /* die Wahl der KI gilt, bis du selbst eine andere anklickst */
    z.vorschlaege[a.id] = { roh, key: wahl ? wahl.key : '', kiRegel: regel(), wahl: eigene, modell };
    z.tab = 'vorschlag';
    addLog('Design für Bild vorgeschlagen', a.name);
  });
}

/* ---------- Skizzen: ausprobieren, ansehen, urteilen ---------- */
/* Eine Skizze als Bild zeichnen, damit das Vision-Modell sie ansehen kann */
function zeichneSkizze(img, A, v, breite = 768) {
  const W = breite, H = Math.round(breite * A.image.height / A.image.width), c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), u = W / 100, X = p => p * W / 100, Y = p => p * H / 100, g = v.style, e = v.variant, schrift = '"Familjen Grotesk", ui-sans-serif, system-ui, sans-serif';
  x.drawImage(img, 0, 0, W, H);
  if (g.flaeche) { x.globalAlpha = g.flaeche.opacity; x.fillStyle = g.flaeche.color; x.beginPath(); g.flaeche.polygon.forEach(([px, py], i) => (i ? x.lineTo(X(px), Y(py)) : x.moveTo(X(px), Y(py)))); x.closePath(); x.fill(); x.globalAlpha = 1; }
  const kurz = Math.min(W, H), strich = el => { x.strokeStyle = el.farbe || (e ? e.colors.text : '#FFFFFF'); x.lineWidth = Math.max(1, el.staerke * kurz / 700); };
  const sm = g.schmuck;
  if (sm.diagonale.an) { const m = H * sm.diagonale.lage / 100, d = W * 0.21, r = sm.diagonale.richtung; strich(sm.diagonale); x.beginPath(); if (r !== 'fallend') { x.moveTo(0, m + d); x.lineTo(W, m - d); } if (r !== 'steigend') { x.moveTo(0, m - d); x.lineTo(W, m + d); } x.stroke(); }
  if (sm.rahmen.an) { const a = kurz * sm.rahmen.abstand / 100; strich(sm.rahmen); x.strokeRect(a, a, W - 2 * a, H - 2 * a); }
  if (sm.ecken.an) { const a = kurz * sm.ecken.abstand / 100, l = kurz * 0.07; strich(sm.ecken); x.beginPath(); for (const [px, py, dx, dy] of [[a, a, 1, 1], [W - a, a, -1, 1], [a, H - a, 1, -1], [W - a, H - a, -1, -1]]) { x.moveTo(px + dx * l, py); x.lineTo(px, py); x.lineTo(px, py + dy * l); } x.stroke(); }
  if (!e) return c;
  const bx = X(e.block.x), by = Y(e.block.y), bw = X(e.block.width), bh = Y(e.block.height), mitte = e.align === 'mitte', tx = mitte ? bx + bw / 2 : bx;
  const lage = e.panel || e.veil;
  if (lage) { x.save(); x.globalAlpha = lage.opacity; x.fillStyle = lage.color; if (e.veil) x.filter = `blur(${4 * u}px)`; const r = e.veil ? 5 * u : 2.4 * u; x.fillRect(bx - r, by - r, bw + 2 * r, bh + 2 * r); x.restore(); }
  x.textBaseline = 'top'; x.textAlign = mitte ? 'center' : 'left'; x.fillStyle = e.colors.text;
  let y = by; const h = e.sizes.headline * u, su = e.sizes.subline * u, cu = e.sizes.cta * u;
  x.font = `${g.typo.gewicht} ${h}px ${schrift}`; if ('letterSpacing' in x) x.letterSpacing = g.typo.versal ? `${0.05 * h}px` : '0px';
  for (const z of e.lines) { x.fillText(z, tx, y + h * 0.06); y += h * 1.06; }
  if ('letterSpacing' in x) x.letterSpacing = '0px';
  if (v.texts.subline) {
    y += e.gaps.headline * u; x.font = `500 ${su}px ${schrift}`;
    const zeilen = ['']; for (const w of v.texts.subline.split(/\s+/)) { const probe = zeilen[zeilen.length - 1] ? zeilen[zeilen.length - 1] + ' ' + w : w; if (x.measureText(probe).width > e.sub_max * u && zeilen[zeilen.length - 1]) zeilen.push(w); else zeilen[zeilen.length - 1] = probe; }
    for (const z of zeilen) { x.fillText(z, tx, y + su * 0.18); y += su * 1.36; }
  }
  if (v.texts.cta) {
    y += e.gaps.cta * u; x.font = `600 ${cu}px ${schrift}`;
    if (g.typo.cta === 'zeile') { const t = v.texts.cta + '  →', b = x.measureText(t).width, l = mitte ? tx - b / 2 : tx; x.fillText(t, tx, y); x.fillStyle = g.farben.akzent || e.colors.cta_background; x.fillRect(l, y + cu * 1.45, b, Math.max(1, cu * 0.12)); }
    else { const b = x.measureText(v.texts.cta).width + 3 * cu, l = mitte ? tx - b / 2 : tx; x.fillStyle = e.colors.cta_background; x.beginPath(); x.roundRect(l, y, b, cu * 2.7, cu * 1.35); x.fill(); x.fillStyle = e.colors.cta_text; x.textAlign = 'center'; x.fillText(v.texts.cta, l + b / 2, y + cu * 0.85); }
  }
  x.fillStyle = g.farben.akzent || e.colors.cta_background;
  if (sm.akzentlinie.an) { const b = e.sizes.headline * 1.5 * u; x.fillStyle = sm.akzentlinie.farbe || x.fillStyle; x.fillRect(mitte ? tx - b / 2 : bx, by - e.sizes.headline * 0.3 * u, b, Math.max(1, sm.akzentlinie.staerke * 0.16 * u)); }
  if (sm.balken.an) { x.fillStyle = sm.balken.farbe || g.farben.akzent || e.colors.cta_background; x.fillRect(bx - e.sizes.headline * 0.32 * u, by, Math.max(1, sm.balken.staerke * 0.16 * u), bh); }
  if (e.date) {
    const d = e.date, gu = d.size * u; x.fillStyle = d.color; x.textAlign = 'center'; x.font = `700 ${gu}px ${schrift}`;
    let dy = Y(d.y); const dx = X(d.x + d.width / 2);
    d.parts.forEach((t, i) => { if (i) { x.fillRect(dx - gu * 0.25, dy + gu * 0.42, gu * 0.5, Math.max(1, gu * 0.09)); dy += gu * 0.93; } x.fillText(t, dx, dy); dy += gu * 1.05; });
  }
  return c;
}
/* Ein freies Layout als Bild zeichnen */
function zeichneFrei(img, A, L, breite = 768) {
  const W = breite, H = Math.round(breite * A.image.height / A.image.width), c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), u = W / 100, X = p => p * W / 100, Y = p => p * H / 100, rad = d => d * Math.PI / 180;
  x.drawImage(img, 0, 0, W, H);
  for (const f of L.formen) {
    x.save(); x.globalAlpha = f.deckkraft / 100; x.fillStyle = x.strokeStyle = f.farbe;
    if (f.art === 'linie') { x.lineWidth = Math.max(1, f.staerke * W / 1000); x.beginPath(); x.moveTo(X(f.x), Y(f.y)); x.lineTo(X(f.x + f.breite), Y(f.y + f.hoehe)); x.stroke(); }
    else {
      const b = X(f.breite), h = f.art === 'kreis' ? b : Y(f.hoehe);
      if (f.weich) x.filter = `blur(${3.5 * u}px)`;
      x.translate(X(f.x) + b / 2, Y(f.y) + h / 2); x.rotate(rad(f.drehung)); x.beginPath();
      if (f.art === 'kreis') x.ellipse(0, 0, Math.abs(b / 2), Math.abs(b / 2), 0, 0, 2 * Math.PI); else x.rect(-b / 2, -h / 2, b, h);
      if (f.gefuellt) x.fill(); else { x.lineWidth = Math.max(1, f.staerke / 10 * u); x.stroke(); }
    }
    x.restore();
  }
  for (const t of L.texte) {
    const g = t.groesse * u;
    x.save(); x.translate(X(t.x), Y(t.y)); x.rotate(rad(t.drehung));
    x.font = `${{ normal: 500, halbfett: 600, fett: 700 }[t.gewicht]} ${g}px "Familjen Grotesk", ui-sans-serif, system-ui, sans-serif`;
    x.fillStyle = t.farbe; x.textBaseline = 'top'; x.textAlign = { links: 'left', mitte: 'center', rechts: 'right' }[t.ausrichtung];
    if ('letterSpacing' in x) x.letterSpacing = t.versal ? `${0.04 * g}px` : '0px';
    F.zeilen(t, messe).forEach((z, i) => x.fillText(z, 0, i * g * 1.08 + g * 0.06));
    x.restore();
  }
  return c;
}
const skizzenVorschlag = (id, s) => G.pruefeVorschlag(Z().analysen[id], {}, texte(), { fertig: komponiert(id, s.regel, s.stil) });
/* Die Idee der KI sauber setzen (Reinzeichnung) und festhalten, was dabei geändert wurde */
const setzeSauber = A => s => { const r = F.reinzeichnen(A, s.layout, messe); s.layout = r.layout; s.rein = r.aenderungen; return s; };
const inhalt = () => ({ ...texte(), datum: stilVoll(Z().stil).datum });
/* Layout einer Skizze, gleich ob frei entworfen oder aus dem Baukasten */
const layoutVon = (id, s) => (s.frei ? s.layout : F.ausVorschlag(Z().analysen[id], skizzenVorschlag(id, s)));
async function beurteile(s, bild, modell) {
  s.wertung = Sk.leseBewertung(await frage({ system: Sk.BEWERTUNG_SYSTEM, prompt: Sk.bewertungPrompt(s, texte()), schema: Sk.BEWERTUNG_SCHEMA, art: 'bild_urteil', bilder: [bild], modell, denken: false }));
}
/* weiter = false: neues Blatt (freie Entwürfe der KI und Grundskizzen der App).
   weiter = true: Die KI sieht ihre besten Skizzen samt Kritik und Messwerten und überarbeitet sie frei. */
function skizziere(weiter) {
  const z = Z(), a = asset(), A = a && z.analysen[a.id];
  if (!A || !A.free_map) return;
  if (!vlmName()) { ui.error = OHNE_BILDMODELL; return render(); }
  run(weiter ? 'Skizzen werden weiterentwickelt …' : 'Skizzen entstehen …', async () => {
    const alt = weiter ? z.skizzen[a.id] || [] : [], runde = alt.reduce((m, s) => Math.max(m, s.runde || 1), 0) + 1;
    const blatt = z.skizzen[a.id] = [...alt], img = await ladeBild(ui.assetURL[a.id]), modell = await bildModell();
    const foto = alsJpeg(img, 0, 0, img.naturalWidth, img.naturalHeight, 1024);
    if (!weiter) {
      fortschritt('Die KI sieht das Foto und entwirft frei');
      const frei = F.leseFrei(await frage({ system: F.FREI_SYSTEM, prompt: F.freiPrompt(A, inhalt(), 5), schema: F.freiSchema(5), art: 'bild_frei', bilder: [foto], modell, denken: false })).map(setzeSauber(A));
      const jetzt = stilVoll(z.stil);
      const grund = Sk.eigeneSkizzen(A).map(s => ({ ...s, stil: { ...s.stil, datum: jetzt.datum, typo: { ...(s.stil.typo || {}), cta: jetzt.typo.cta } } }));
      const neu = [...frei, ...grund];
      for (const [i, s] of neu.entries()) {
        s.runde = runde;
        if (!s.frei && !skizzenVorschlag(a.id, s).variant) continue;   /* lässt sich mit diesem Bild nicht setzen */
        fortschritt(`Skizze ${i + 1} von ${neu.length} ansehen und beurteilen: ${s.name}`);
        await beurteile(s, zeichneFrei(img, A, layoutVon(a.id, s)).toDataURL('image/jpeg', 0.88), modell);
        blatt.push(s); save();
      }
    } else {
      const beste = Sk.rangfolge(alt).slice(0, 3);
      for (const [i, s] of beste.entries()) {
        const basis = { name: s.name, idee: s.idee, layout: layoutVon(a.id, s) };
        fortschritt(`Skizze ${i + 1} von ${beste.length} überarbeiten: ${s.name}`);
        const [n] = F.leseFrei(await frage({ system: F.FREI_SYSTEM, prompt: F.ueberarbeitePrompt(A, inhalt(), basis, { wertung: s.wertung, messung: F.messeLayout(A, basis.layout, messe) }), schema: F.FREI_EINZEL_SCHEMA, art: 'bild_frei2', bilder: [zeichneFrei(img, A, basis.layout).toDataURL('image/jpeg', 0.88)], modell, denken: false }));
        if (!n) continue;
        setzeSauber(A)(n); n.runde = runde; n.basis = s.name;
        fortschritt(`Überarbeitete Skizze ansehen und beurteilen: ${n.name}`);
        await beurteile(n, zeichneFrei(img, A, n.layout).toDataURL('image/jpeg', 0.88), modell);
        blatt.push(n); save();
      }
    }
    z.tab = 'skizzen';
    addLog(weiter ? 'Skizzen weiterentwickelt' : 'Skizzen ausprobiert', `${blatt.length} Entwürfe für ${a.name}`);
  });
}
function nimmSkizze(i) {
  const z = Z(), a = asset(), s = a && (z.skizzen[a.id] || [])[i];
  if (!s) return;
  if (s.frei) { z.frei[a.id] = JSON.parse(JSON.stringify({ name: s.name, idee: s.idee, layout: s.layout, rein: s.rein || [] })); ui.bfWahl = ''; }
  else {
    delete z.frei[a.id];
    z.regel = s.regel; z.stil = JSON.parse(JSON.stringify({ farben: {}, flaeche: { art: 'keine' }, schmuck: {}, ...s.stil, datum: z.stil.datum || '' }));
    z.farbname = s.stil.farben && (s.stil.farben.schrift || s.stil.farben.akzent) ? s.name : '';
    const v = z.vorschlaege[a.id]; if (v && v.wahl && typeof v.wahl === 'object') delete v.wahl[s.regel];
  }
  z.tab = 'vorschlag'; save(); render(); zuTabs(); toast(`Skizze „${s.name}“ übernommen`);
}
/* Den Baukasten-Entwurf in ein freies Layout verwandeln, um ihn von Hand zu verschieben */
function loeseEntwurf() {
  const z = Z(), a = asset(), v = a && vorschlag(a.id);
  if (!v || !v.variant) return;
  z.frei[a.id] = { name: 'Freier Entwurf', idee: '', layout: F.ausVorschlag(z.analysen[a.id], v) }; ui.bfWahl = ''; save(); render();
}
/* Freien Entwurf nach einem Wunsch überarbeiten lassen: die KI sieht den aktuellen Stand */
function freiWunsch() {
  const z = Z(), a = asset(), A = a && z.analysen[a.id], f = a && z.frei[a.id], feld = document.getElementById('bd-freiwunsch'), wunsch = feld ? feld.value.trim() : '';
  if (!f) return;
  if (!vlmName()) { ui.error = OHNE_BILDMODELL; return render(); }
  run('Entwurf wird überarbeitet …', async () => {
    fortschritt(wunsch ? 'Die KI sieht den Entwurf und setzt deinen Wunsch um' : 'Die KI sieht den Entwurf und überarbeitet ihn');
    const img = await ladeBild(ui.assetURL[a.id]);
    const [n] = F.leseFrei(await frage({ system: F.FREI_SYSTEM, prompt: F.ueberarbeitePrompt(A, inhalt(), f, { messung: F.messeLayout(A, f.layout, messe), wunsch }), schema: F.FREI_EINZEL_SCHEMA, art: 'bild_frei2', bilder: [zeichneFrei(img, A, f.layout).toDataURL('image/jpeg', 0.88)], modell: await bildModell(), denken: false }));
    if (!n) throw new Error('Das Modell hat kein brauchbares Layout geliefert. Versuch es noch einmal.');
    setzeSauber(A)(n);
    z.frei[a.id] = { name: n.name, idee: n.idee, layout: n.layout, rein: n.rein, davor: { name: f.name, idee: f.idee, layout: f.layout } }; ui.bfWahl = '';
  });
}

/* ---------- Farbwelt ---------- */
function farbweltKI() {
  const z = Z(), a = asset(), A = a && z.analysen[a.id], feld = document.getElementById('bd-farbwunsch'), wunsch = feld ? feld.value.trim() : '';
  if (!wunsch) { ui.error = 'Beschreib die Farbwelt in ein paar Worten, zum Beispiel „frisch, Meer, Türkis mit Weiß“.'; return render(); }
  z.farbwunsch = wunsch;
  run('Farbwelt entsteht …', async () => {
    fortschritt('Farbwelt wird vorgeschlagen');
    const f = G.leseFarbwelt(await frage({ system: 'Du bist Farbgestalterin. Antworte ausschließlich mit JSON.', prompt: G.farbweltPrompt(A || { palette: [] }, wunsch), schema: G.FARBWELT_SCHEMA, art: 'bild_farben', modell: designName(), denken: false }));
    if (!f.schrift && !f.akzent && !f.flaeche) throw new Error('Das Modell hat keine gültigen Farben geliefert. Versuch es noch einmal oder wähle die Farben selbst.');
    z.stil.farben = { schrift: f.schrift, akzent: f.akzent, flaeche: f.flaeche }; z.farbname = f.name;
  });
}
/* Farben der empfohlenen Gestaltungsrichtung aus der Projektanalyse */
function projektFarben() {
  const r = S.ergebnis, st = r && r.strategien && r.strategien.length ? r.strategien[typeof recIndex === 'function' ? recIndex(r) : 0] : null;
  const liste = ((st && st.farben) || []).filter(c => /^#?[0-9a-f]{6}$/i.test(String(c.hex || '').trim()));
  if (!liste.length) return null;
  const nach = re => (liste.find(c => re.test(`${c.rolle || ''} ${c.name || ''}`)) || {}).hex;
  const h = x => (x ? (x.startsWith('#') ? x : '#' + x).toUpperCase() : '');
  return { schrift: h(nach(/text|schrift/i)), akzent: h(nach(/akzent|signal|highlight/i) || liste[0].hex), flaeche: h(nach(/hintergrund|fläche|flaeche|grund/i)) };
}

/* ---------- Ausgaben ---------- */
function speichere(name, inhalt, typ) {
  const blob = inhalt instanceof Blob ? inhalt : new Blob([inhalt], { type: typ });
  const l = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(l.href), 4000);
}
const stamm = a => slug(a.name.replace(/\.[a-z0-9]+$/i, '')) || 'bild';
const analyseJSON = A => JSON.stringify({ version: A.version, image: A.image, vlm: A.vlm || '', config: A.config, overall: A.overall, palette: A.palette, grids: A.grids }, null, 2);
function vorschlagJSON(a) {
  const z = Z(), v = vorschlag(a.id), ki = z.vorschlaege[a.id] || {};
  return JSON.stringify({ image: z.analysen[a.id].image, model: ki.modell || '', chosen_by: ki.wahl && typeof ki.wahl === 'object' && ki.wahl[regel()] ? 'person' : wunsch(ki, regel()) ? 'model' : 'app', ...v, model_answer: ki.roh || null }, null, 2);
}
async function debugPNG(a) {
  const z = Z(), A = z.analysen[a.id], v = z.grid === 'flaechen' && vorschlag(a.id);
  const svg = v ? G.flaechenSVG(A, v.variants, ui.assetURL[a.id], v.variant && v.variant.key, v.lines) : G.debugSVG(A, gridName(A), ui.assetURL[a.id]);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await ladeBild(url), c = document.createElement('canvas'); c.width = A.image.width; c.height = A.image.height;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(b => speichere(`${stamm(a)}-debug-${v ? 'textflaechen' : gridName(A)}.png`, b), 'image/png');
  } finally { URL.revokeObjectURL(url); }
}
/* Bild und Farben in den Flyer-Entwurf des Studios übernehmen */
function uebernehmen() {
  const D = designState(), z = Z(), a = asset(), A = a && z.analysen[a.id], v = a && vorschlag(a.id);
  if (!v) return;
  D.assets.forEach(x => { if (x !== a && x.rolle === 'hintergrund') x.rolle = 'bild'; if (x !== a && x.platzierung === 'hintergrund') x.platzierung = 'auto'; });
  a.rolle = 'hintergrund';
  const pal = { hintergrund: v.palette.background, flaeche: v.palette.surface, text: v.palette.text, akzent: v.palette.accent };
  const hatFlyer = D.spec && D.spec.typ === 'flyer' && D.spec.sem;
  if (hatFlyer) {
    D.spec.sem.stil = { ...(D.spec.sem.stil || {}), palette: pal };
    D.versionen.push(JSON.parse(JSON.stringify({ spec: D.spec, texte: D.texte }))); D.versionen = D.versionen.slice(-8); D.aktiv = D.versionen.length - 1;
  } else {
    const farben = `Farben aus dem Bild: Hintergrund ${pal.hintergrund}, Fläche ${pal.flaeche}, Akzent ${pal.akzent}.`;
    D.briefing.wuensche = [D.briefing.wuensche.replace(/Farben aus dem Bild:[^\n]*\n?/, '').trim(), farben].filter(Boolean).join('\n');
    if (!D.briefing.stimmung && A.overall) D.briefing.stimmung = A.overall.mood;
  }
  D.modus = 'entwurf'; save(); render(); window.scrollTo({ top: 0 });
  toast(hatFlyer ? 'Bild als Hintergrund und Farben in den Entwurf übernommen' : 'Bild ist als Hintergrund gesetzt, die Farben stehen unter „Wünsche“');
}

/* ---------- Ansicht: linke Spalte ---------- */
const gridName = A => (A.grids[Z().grid] ? Z().grid : Object.keys(A.grids)[0]);
const zahl = (n, st = 1) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: st });
const SCHWELLEN = [
  ['schaerfe.scharf', 'Scharf ab', 'Varianz des Laplace-Operators. Höher = strenger.', 1],
  ['schaerfe.leicht', 'Leicht unscharf ab', 'Darunter gilt die Kachel als blurry.', 1],
  ['schaerfe.min_kontrast', 'Mindest-Struktur', 'Kacheln mit weniger Kontrast (z. B. Himmel) bekommen kein Schärfe-Urteil.', 1],
  ['freiraum.kantenschwelle', 'Kante ab Stärke', 'Ab welcher Stärke ein Pixel als Kante zählt (0–1020).', 1],
  ['freiraum.kantendichte_max', 'Freiraum: Kanten höchstens', 'Anteil Kantenpixel, 0,04 = 4 %.', 0.005],
  ['freiraum.farbvarianz_max', 'Freiraum: Farbstreuung höchstens', 'Wie stark die Farben in der Kachel schwanken dürfen.', 1],
  ['freiraum.karte', 'Feinheit der Freiraum-Karte', 'Zellen entlang der längsten Seite. Feiner = genauere Textflächen.', 1],
  ['kontrast_min', 'Kontrast Schrift mindestens', 'WCAG AA verlangt 4,5 : 1.', 0.1],
  ['kontrast_flaeche_min', 'Kontrast Knopf mindestens', 'Knopffläche gegen das Bild, WCAG verlangt 3 : 1.', 0.1],
  ['arbeitsgroesse', 'Messgröße in Pixel', 'Längste Seite, auf die das Bild für die Messung verkleinert wird.', 64]
];
const lies = (o, pfad) => pfad.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
function setze(o, pfad, wert) { const t = pfad.split('.'); let x = o; for (let i = 0; i < t.length - 1; i++) x = x[t[i]] = x[t[i]] && typeof x[t[i]] === 'object' ? x[t[i]] : {}; x[t[t.length - 1]] = wert; }

function panel() {
  merkeNeue();
  const z = Z(), D = designState(), liste = bilder(), a = asset(), t = D.texte, cfg = konfig(z.cfg), A = a && z.analysen[a.id];
  const raster = [...new Set([...RASTER_FEST, ...z.eigene])];
  ladeFaehigkeiten();
  const wahl = (feld, auto, nur = modelle()) => `<select class="input" data-bdf="${feld}"><option value="">Automatisch (${esc(auto || 'kein Modell')})</option>${nur.map(m => `<option value="${esc(m)}" ${z[feld] === m ? 'selected' : ''}>${esc(m)}${denktImmer(m) ? ' (denkt immer, sehr langsam)' : ''}</option>`).join('')}</select>`;
  const abweichend = Object.keys(z.cfg).length > 0;
  return `<aside class="ds-panel bd-panel">
    <details open><summary>Bild <span class="muted small">${liste.length || ''}</span></summary>
      ${liste.length ? `<div class="bd-bilder">${liste.map(x => `<button class="bd-bild ${a && x.id === a.id ? 'on' : ''}" data-bdbild="${x.id}" title="${esc(x.name)}">${ui.assetURL[x.id] ? `<img src="${ui.assetURL[x.id]}" alt="${esc(x.name)}">` : ''}${z.analysen[x.id] ? '<i aria-label="analysiert"></i>' : ''}</button>`).join('')}</div>` : ''}
      ${(() => { const zuTun = liste.filter(offen), grund = a ? offen(a) : '';
        return grund || zuTun.length > 1 ? `<div class="bd-analyse">${grund ? `<button class="btn tiny primary" data-bd="analyse" ${ui.busy ? 'disabled' : ''}>${grund === 'raster' ? 'Mit neuem Raster analysieren' : 'Bild analysieren'}</button>` : ''}${zuTun.length > 1 ? `<button class="btn tiny" data-bd="alleoffen" ${ui.busy ? 'disabled' : ''}>Alle ${zuTun.length} offenen analysieren</button>` : ''}</div>` : ''; })()}
      <label class="ds-drop" id="ds-drop"><input type="file" id="ds-file" accept="image/*" multiple hidden><b>Bilder wählen oder hierher ziehen</b><span>JPG oder PNG. Mehrere Bilder lassen sich in einem Durchgang analysieren.</span></label>
    </details>
    <details open><summary>Raster</summary>
      <div class="bd-chips">${raster.map(r => `<button class="bd-chip" data-bdraster="${r}" aria-pressed="${z.raster.includes(r)}">${r.replace('x', ' × ')}</button>`).join('')}</div>
      <div class="row bd-eigen"><input class="input" id="bd-raster-neu" placeholder="Eigenes Raster, z. B. 3x3" aria-label="Eigenes Raster"><button class="btn tiny" data-bd="rasterneu">Hinzufügen</button></div>
      <p class="small muted">Spalten × Zeilen. Grobe Raster finden große Textflächen, feine Raster zeigen genauer, wo es unscharf wird.</p>
      <label class="bd-check"><input type="checkbox" data-bdf="beschreiben" ${z.beschreiben ? 'checked' : ''}> Jede Kachel vom Vision-Modell beschreiben lassen</label>
    </details>
    <details open><summary>Texte fürs Bild</summary>
      <label class="ds-l">Headline<input class="input" data-d="texte.headline" value="${esc(t.headline)}"></label>
      <label class="ds-l">Subline<input class="input" data-d="texte.subline" value="${esc(t.subline)}"></label>
      <label class="ds-l">Aufruf<input class="input" data-d="texte.cta" value="${esc(t.cta)}"></label>
      <label class="ds-l">Datum oder Nummer<input class="input" data-bds="datum" value="${esc(z.stil.datum || '')}" placeholder="z. B. 30.03.19"></label>
      <p class="small muted">Wird an Punkten, Strichen und Leerzeichen in Blöcke geteilt und gestapelt.</p>
    </details>
    ${stilPanel()}
    <details><summary>Modelle</summary>
      <label class="ds-l">Vision-Modell (sieht das Bild)${wahl('vlm', vlmName(), bildModelle())}</label>
      <label class="ds-l">Design-Modell (führt zusammen)${wahl('modell', designName())}</label>
      <p class="small muted">${bildModelle().length < modelle().length ? `Für das Sehen stehen nur die ${bildModelle().length} Modelle zur Wahl, die Bilder verstehen. ` : ''}Automatisch nimmt qwen2.5vl für das Sehen und Gemma 4 für das Design, wenn sie installiert sind, sonst das Modell von der Startseite. Modelle, die immer nachdenken (z. B. qwen3-vl), sind hier kaum brauchbar: Eine Analyse besteht aus vielen Aufrufen, und jeder dauert dann eine Minute oder länger.${A ? ' <button class="linkbtn" data-bd="analyse">Dieses Bild noch einmal analysieren</button>' : ''}</p>
    </details>
    <details ${abweichend ? 'open' : ''}><summary>Schwellwerte ${abweichend ? '<span class="muted small">angepasst</span>' : ''}</summary>
      ${SCHWELLEN.map(([pfad, name, info, schritt]) => `<label class="bd-schwelle" title="${esc(info)}"><span>${name}<small>${esc(info)}</small></span><input class="input" type="number" min="0" step="${schritt}" data-bdcfg="${pfad}" value="${lies(cfg, pfad)}"></label>`).join('')}
      <p class="small muted">Änderungen wirken sofort auf die Messung, ohne neue KI-Anfrage.${abweichend ? ' <button class="linkbtn" data-bd="cfgreset">Auf Vorgaben zurücksetzen</button>' : ''}</p>
    </details>
  </aside>`;
}

/* Farbwelt, Farbflächen und Schmuck: Presets anklicken, darunter anpassen */
function stilPanel() {
  const z = Z(), st = stilVoll(z.stil), a = asset(), v = a && vorschlag(a.id), akt = v && v.variant;
  const farbe = (pfad, wert, name, auto) => `<div class="bd-farbwahl"><input type="color" data-bds="${pfad}" value="${wert || auto || '#888888'}" aria-label="${name}"><span>${name}<small>${wert || 'automatisch'}</small></span>${wert ? `<button class="linkbtn" data-bdsleer="${pfad}">auto</button>` : ''}</div>`;
  const regler = (pfad, wert, name, [min, max], schritt, einheit = '') => `<label class="bd-regler"><span>${name}</span><input type="range" min="${min}" max="${max}" step="${schritt}" data-bds="${pfad}" value="${wert}"><output>${zahl(wert)}${einheit}</output></label>`;
  const wahl = (pfad, wert, name, optionen) => `<label class="bd-regler"><span>${name}</span><select class="input" data-bds="${pfad}">${Object.entries(optionen).map(([k, n]) => `<option value="${k}" ${k === wert ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
  const fl = st.flaeche, F = FLAECHEN[fl.art], proj = projektFarben();
  const aktiv = Object.keys(SCHMUCK).filter(id => st.schmuck[id].an);
  return `<details><summary>Schrift und Aufruf</summary>
      <label class="bd-check"><input type="checkbox" data-bds="typo.versal" ${st.typo.versal ? 'checked' : ''}> Headline in Versalien</label>
      ${wahl('typo.gewicht', String(st.typo.gewicht), 'Schnitt der Headline', { 500: 'Mittel', 600: 'Halbfett', 700: 'Fett' })}
      ${wahl('typo.cta', st.typo.cta, 'Aufruf als', { zeile: 'Textzeile mit Pfeil (Druck)', knopf: 'Knopf (digital)' })}
    </details>
    <details ${st.farben.schrift || st.farben.akzent || st.farben.flaeche ? 'open' : ''}><summary>Farbwelt ${z.farbname && (st.farben.schrift || st.farben.akzent) ? `<span class="muted small">${esc(z.farbname)}</span>` : ''}</summary>
      ${farbe('farben.schrift', st.farben.schrift, 'Schrift', akt && akt.colors.text)}
      ${farbe('farben.akzent', st.farben.akzent, 'Akzent (Knopf, Schmuck)', akt && akt.colors.cta_background)}
      ${farbe('farben.flaeche', st.farben.flaeche, 'Fläche', v && v.style.flaeche ? v.style.flaeche.color : '#F7F0EC')}
      <div class="row bd-eigen"><input class="input" id="bd-farbwunsch" placeholder="z. B. frisch, Meer, Türkis mit Weiß" value="${esc(z.farbwunsch || '')}" aria-label="Farbwelt beschreiben"><button class="btn tiny" data-bd="farbwelt" ${ui.busy ? 'disabled' : ''}>Vorschlagen</button></div>
      <p class="small muted">Ohne Angabe nimmt die App Töne aus dem Bild. Die Schriftfarbe gilt nur dort, wo sie lesbar bleibt.${proj ? ' <button class="linkbtn" data-bd="farbprojekt">Farben aus der Projektanalyse nehmen</button>' : ''}</p>
    </details>
    <details ${fl.art !== 'keine' ? 'open' : ''}><summary>Farbflächen</summary>
      <div class="bd-chips">${Object.entries(FLAECHEN).map(([k, x]) => `<button class="bd-chip" data-bdflaeche="${k}" aria-pressed="${k === fl.art}" title="${esc(x.info)}">${x.name}</button>`).join('')}</div>
      ${fl.art !== 'keine' ? `<div class="bd-stilbox"><p class="small muted">${esc(F.info)}</p>
        ${F.seiten ? wahl('flaeche.seite', fl.seite, 'Seite', F.seiten) : ''}
        ${F.groesse ? regler('flaeche.groesse', fl.groesse, 'Größe', F.groesse, 1, ' %') : ''}
        ${regler('flaeche.deckkraft', fl.deckkraft, 'Deckkraft', [0.1, 1], 0.05)}
        ${farbe('flaeche.farbe', fl.farbe, 'Farbe der Fläche', v && v.style.flaeche ? v.style.flaeche.color : '')}</div>` : '<p class="small muted">Eine Farbfläche überdeckt einen Teil des Fotos. Text und Farben richten sich danach.</p>'}
    </details>
    <details ${aktiv.length ? 'open' : ''}><summary>Schmuckelemente <span class="muted small">${aktiv.length || ''}</span></summary>
      <div class="bd-chips">${Object.entries(SCHMUCK).map(([k, x]) => `<button class="bd-chip" data-bdschmuck="${k}" aria-pressed="${st.schmuck[k].an}" title="${esc(x.info)}">${x.name}</button>`).join('')}</div>
      ${aktiv.map(id => { const e = st.schmuck[id], P = SCHMUCK[id]; return `<div class="bd-stilbox"><b class="small">${P.name}</b>
        ${P.richtung ? wahl(`schmuck.${id}.richtung`, e.richtung, 'Richtung', P.richtung) : ''}
        ${P.lage ? regler(`schmuck.${id}.lage`, e.lage, 'Höhe', P.lage, 1, ' %') : ''}
        ${P.abstand ? regler(`schmuck.${id}.abstand`, e.abstand, 'Abstand zum Rand', P.abstand, 0.5, ' %') : ''}
        ${regler(`schmuck.${id}.staerke`, e.staerke, 'Stärke', [0.5, 6], 0.25)}
        ${farbe(`schmuck.${id}.farbe`, e.farbe, 'Farbe', P.ort === 'block' ? (st.farben.akzent || (akt && akt.colors.cta_background)) : akt && akt.colors.text)}</div>`; }).join('')}
      ${aktiv.length ? '' : '<p class="small muted">Linien, Rahmen und Akzente. Anklicken schaltet ein Element ein, darunter passt du es an.</p>'}
    </details>`;
}

/* ---------- Ansicht: Hauptbereich ---------- */
const farbfeld = c => `<span class="bd-farbe" title="${c.hex}${c.percent !== undefined ? ` · ${zahl(c.percent)} %` : ''}" style="background:${c.hex}"></span>`;
function viewAnalyse(a, A) {
  const g = gridName(A), z = Z(), sum = G.zusammenfassung(A), o = A.overall;
  const fl = z.grid === 'flaechen' && A.free_map, v = fl && vorschlag(a.id);
  const offen = z.beschreiben ? sum.kacheln - sum.beschrieben : 0;
  const zeile = k => `<tr class="${k.text_space ? 'frei' : ''}">
    <td><b>r${k.row}c${k.col}</b><br><span class="muted">${esc(k.label)}</span></td>
    <td><div class="bd-farben">${k.colors.map(farbfeld).join('')}</div><span class="muted">${k.colors.map(c => `${c.hex} ${zahl(c.percent, 0)} %`).join('<br>')}</span></td>
    <td>${zahl(k.brightness, 0)}<br><span class="muted">Kontrast ${zahl(k.contrast, 0)}</span></td>
    <td><span class="bd-marke ${k.sharpness.reliable ? (k.sharpness.label === 'scharf' ? 'ok' : 'rot') : ''}">${k.sharpness.reliable ? k.sharpness.label : 'kaum Struktur'}</span><br><span class="muted">${zahl(k.sharpness.laplace_variance, 0)}</span></td>
    <td><span class="bd-marke ${k.text_space ? 'gruen' : ''}">${k.text_space ? 'ja' : 'nein'} · ${zahl(k.text_space_score, 2)}</span><br><span class="muted">Kanten ${zahl(k.edge_density * 100)} % · Farbe ${zahl(k.color_variance, 0)}</span></td>
    <td><span class="bd-probe" style="background:${k.mean_color};color:${k.text_color}">Aa</span><br><span class="muted">${k.text_tone} · ${zahl(k.text_contrast)} : 1</span></td>
    <td class="bd-besch">${esc(k.description) || '<span class="muted">–</span>'}</td></tr>`;
  return `
    <div class="ds-toolbar">
      <div class="seg2">${Object.keys(A.grids).map(n => `<button data-bdgrid="${n}" aria-pressed="${!fl && n === g}">${n.replace('x', ' × ')}</button>`).join('')}${A.free_map ? `<button data-bdgrid="flaechen" aria-pressed="${!!fl}">Textflächen</button>` : ''}</div>
      <span class="small muted">${fl ? `Freiraum-Karte ${A.free_map.cols} × ${A.free_map.rows} · Regel „${G.REGELN[regel()].name}“ · ${v.variants.length} Kompositionen` : `${sum.frei} von ${sum.kacheln} Kacheln mit Freiraum · ${sum.unscharf} unscharf`}</span>
      <span class="spacer"></span>
      <button class="btn tiny" data-bd="debugpng">Vorschau als PNG</button><button class="btn tiny" data-bd="json">JSON speichern</button>
    </div>
    <div class="bd-debug">${fl ? G.flaechenSVG(A, v.variants, ui.assetURL[a.id], v.variant && v.variant.key, v.lines) : G.debugSVG(A, g, ui.assetURL[a.id])}</div>
    ${fl ? '<p class="bd-legende small"><span><i class="gruen"></i>ruhige Zelle</span><span><i class="strich"></i>zusammenhängende Fläche</span><span><i class="rahmen"></i>Textblock einer Komposition (A–D)</span></p>'
      : '<p class="bd-legende small"><span><i class="gruen"></i>Freiraum für Text</span><span><i class="rot"></i>blurry</span><span><i class="rot2"></i>leicht unscharf</span><span class="muted">Flächen fast ohne Struktur (Himmel, Wand) bekommen kein Schärfe-Urteil.</span></p>'}
    ${offen ? `<p class="bd-hinweis small">${offen} Kacheln haben noch keine Beschreibung. <button class="linkbtn" data-bd="fehlende">Fehlende Beschreibungen ergänzen</button></p>` : ''}
    <div class="ds-info">
      <div class="m-box"><h4>Gesamtbild</h4>${o ? `<dl class="bd-dl"><dt>Hauptmotiv</dt><dd>${esc(o.main_subject)}</dd><dt>Bildaufbau</dt><dd>${esc(o.composition)}</dd><dt>Stimmung</dt><dd>${esc(o.mood)}</dd><dt>Stil</dt><dd>${esc(o.style)}</dd><dt>Licht</dt><dd>${esc(o.lighting)}</dd></dl>` : '<p class="muted">Noch nicht beschrieben.</p>'}</div>
      <div class="m-box"><h4>Farben des Bildes</h4><div class="bd-palette">${A.palette.map(c => `<div>${farbfeld(c)}<b>${c.hex}</b><span class="muted">${zahl(c.percent, 0)} %</span></div>`).join('')}</div>
        <p class="small muted" style="margin-top:10px">${A.image.width} × ${A.image.height} px, gemessen bei ${A.image.measured_width} × ${A.image.measured_height} px${A.vlm ? `, beschrieben von ${esc(A.vlm)}` : ''}.</p></div>
    </div>
    <div class="bd-tabelle"><table><thead><tr><th>Kachel</th><th>Farben</th><th>Helligkeit</th><th>Schärfe</th><th>Freiraum</th><th>Schrift</th><th>Inhalt</th></tr></thead><tbody>${A.grids[g].map(zeile).join('')}</tbody></table></div>`;
}
/* Freier Entwurf: Elemente anfassen und verschieben, rechts daneben anpassen, per Wunsch überarbeiten lassen */
const FELDER = {
  texte: [['text', 'Text', 'text'], ['groesse', 'Größe', [0.8, 30, 0.1]], ['breite', 'Zeilenbreite (0 = frei)', [0, 100, 1]], ['drehung', 'Drehung', [-180, 180, 1]], ['farbe', 'Farbe', 'farbe'], ['gewicht', 'Schnitt', { normal: 'Mittel', halbfett: 'Halbfett', fett: 'Fett' }], ['ausrichtung', 'Ausrichtung', { links: 'links', mitte: 'mittig', rechts: 'rechts' }], ['versal', 'Versalien', 'haken']],
  formen: [['art', 'Form', { rechteck: 'Rechteck', kreis: 'Kreis', linie: 'Linie' }], ['breite', 'Breite', [-150, 200, 1]], ['hoehe', 'Höhe', [-150, 200, 1]], ['drehung', 'Drehung', [-180, 180, 1]], ['deckkraft', 'Deckkraft', [0, 100, 1]], ['staerke', 'Strichstärke', [0.5, 30, 0.5]], ['farbe', 'Farbe', 'farbe'], ['gefuellt', 'Gefüllt', 'haken']]
};
const freiBuehne = (a, A, f) => F.freiHTML(A, f.layout, ui.assetURL[a.id], { bearbeiten: true, gewaehlt: ui.bfWahl || '' });
function viewFrei(a, A, f) {
  const [art, nr] = (ui.bfWahl || '').split('.'), el = art && f.layout[art] ? f.layout[art][+nr] : null, m = F.messeLayout(A, f.layout, messe), hinweise = F.messungText(m);
  const feld = ([k, name, typ]) => { const pfad = `${art}.${nr}.${k}`, w = el[k];
    if (typ === 'text') return `<label class="ds-l">${name}<textarea class="input" rows="2" data-bfe="${pfad}">${esc(w)}</textarea></label>`;
    if (typ === 'farbe') return `<div class="bd-farbwahl"><input type="color" data-bfe="${pfad}" value="${w}" aria-label="${name}"><span>${name}<small>${w}</small></span></div>`;
    if (typ === 'haken') return `<label class="bd-check"><input type="checkbox" data-bfe="${pfad}" ${w ? 'checked' : ''}> ${name}</label>`;
    if (Array.isArray(typ)) return `<label class="bd-regler"><span>${name}</span><input type="range" min="${typ[0]}" max="${typ[1]}" step="${typ[2]}" data-bfe="${pfad}" value="${w}"><output>${zahl(w)}</output></label>`;
    return `<label class="bd-regler"><span>${name}</span><select class="input" data-bfe="${pfad}">${Object.entries(typ).map(([o, n]) => `<option value="${o}" ${o === w ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`; };
  return `
    <div class="ds-toolbar">
      <span><b>${esc(f.name)}</b> <span class="small muted">· freier Entwurf</span></span><span class="spacer"></span>
      ${f.davor ? '<button class="btn tiny" data-bd="freidavor">Vorherige Fassung</button>' : ''}<button class="btn tiny" data-bd="freisauber" title="Texte ins Bild holen, Überdeckungen lösen, dem Motiv ausweichen, Kontrast sichern">Sauber setzen</button><button class="btn tiny" data-bd="freihtml">HTML speichern</button><button class="btn tiny" data-bd="freijson">JSON speichern</button><button class="btn tiny" data-bd="freiweg">Zurück zum Baukasten</button>
    </div>
    ${f.idee ? `<p class="small muted bd-regelinfo">${esc(f.idee)}</p>` : ''}
    <div class="bd-stage frei" id="bd-stage">${freiBuehne(a, A, f)}</div>
    <p class="small muted" style="margin:8px 0 0">Elemente anfassen und verschieben. Ein Klick wählt ein Element aus, darunter passt du es an.</p>
    <div class="bd-refine"><textarea id="bd-freiwunsch" class="input" rows="2" placeholder="Was soll die KI ändern? z. B. Headline größer und in den Anschnitt, Datum senkrecht an den rechten Rand, weniger Elemente"></textarea><button class="btn primary" data-bd="freiwunsch" ${ui.busy ? 'disabled' : ''}>Überarbeiten lassen</button></div>
    <div class="ds-info">
      <div class="m-box"><h4>${el ? (art === 'texte' ? 'Textbaustein' : 'Form') : 'Elemente'}</h4>
        ${el ? `${FELDER[art].filter(([k]) => !(art === 'formen' && el.art === 'linie' && k === 'gefuellt')).map(feld).join('')}<div class="row" style="gap:6px;margin-top:6px"><button class="btn tiny" data-bd="freivor">Nach vorn</button><button class="btn tiny" data-bd="freiloeschen">Löschen</button></div>` : '<p class="small muted">Kein Element gewählt.</p>'}
        <div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap"><button class="btn tiny" data-bd="freitext">Text hinzufügen</button><button class="btn tiny" data-bd="freiflaeche">Fläche hinzufügen</button><button class="btn tiny" data-bd="freilinie">Linie hinzufügen</button></div></div>
      <div class="m-box"><h4>Was die App misst</h4>${hinweise ? `<ul class="mlist">${hinweise.split('\n').map(x => `<li>${esc(x.replace(/^- /, ''))}</li>`).join('')}</ul>` : '<p class="small muted">Nichts Auffälliges.</p>'}
        ${f.rein && f.rein.length ? `<h4 style="margin-top:12px">Von der App sauber gesetzt</h4><ul class="mlist">${f.rein.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <p class="small muted" style="margin-top:8px">Was du von Hand verschiebst, lässt die App in Ruhe. „Sauber setzen“ räumt auf Wunsch wieder auf. Kontrast ab 4,5 : 1 gilt als gut lesbar.</p></div>
    </div>`;
}
function viewVorschlag(a, A) {
  if (Z().frei[a.id] && A.free_map) return viewFrei(a, A, Z().frei[a.id]);
  const z = Z(), v = vorschlag(a.id), ki = z.vorschlaege[a.id] || {}, r = regel(), R = G.REGELN;
  if (!v) return `<div class="ds-empty"><h2>Analyse erneuern</h2><p class="muted">Für dieses Bild fehlt die Freiraum-Karte. Starte die Analyse noch einmal.</p><button class="btn primary" data-bd="analyse">Bild analysieren</button></div>`;
  const e = v.variant, p = v.palette, kiHier = ki.modell && (ki.kiRegel || 'auto') === r;
  const eigene = ki.wahl && typeof ki.wahl === 'object' ? ki.wahl[r] : '';
  const quelle = x => (eigene ? (x.key === eigene ? 'deine Wahl' : kiHier && x.key === ki.key ? 'Wahl der KI' : '') : kiHier && ki.key ? (x.key === ki.key ? 'Wahl der KI' : '') : x.id === 'A' ? 'Empfehlung der App' : '');
  const chip = k => `<button class="bd-chip" data-bdregel="${k}" aria-pressed="${k === r}" title="${esc(R[k].info)}">${R[k].name}</button>`;
  const regeln = Object.keys(R);
  return `
    <div class="bd-regeln">
      <div><span class="small muted">Nach Regeln</span><div class="bd-chips">${regeln.filter(k => !R[k].bruch).map(chip).join('')}</div></div>
      <div><span class="small muted">Regeln brechen</span><div class="bd-chips">${regeln.filter(k => R[k].bruch).map(chip).join('')}</div></div>
      <div class="bd-blaettern"><button class="btn tiny" data-bd="zurueck" aria-label="Vorherige Komposition">‹</button><button class="btn tiny" data-bd="weiter" aria-label="Nächste Komposition">Nächste ›</button></div>
    </div>
    <p class="small muted bd-regelinfo">${esc(R[r].info)}${v.lines.length ? ` <label class="bd-check inline"><input type="checkbox" data-bdf="linien" ${z.linien ? 'checked' : ''}> Hilfslinien zeigen</label>` : ''}</p>
    ${e ? `<div class="bd-stage" id="bd-stage">${G.ansichtHTML(A, e, v.texts, ui.assetURL[a.id], { linien: z.linien ? v.lines : [], stil: v.style })}</div>
    <div class="bd-varianten" role="group" aria-label="Komposition">${v.variants.map(x => `<button class="bd-var" data-bdvar="${esc(x.key)}" aria-pressed="${x.key === e.key}"><b>${x.id}</b><span>${esc(x.label)}${quelle(x) ? `<small>${quelle(x)}</small>` : ''}</span></button>`).join('')}</div>` : `<div class="bd-stage" id="bd-stage">${G.ansichtHTML(A, null, v.texts, ui.assetURL[a.id], { linien: z.linien ? v.lines : [], stil: v.style })}</div>`}
    ${v.corrections.length ? `<div class="m-box warn"><h4>Hinweis der App</h4><ul class="mlist">${v.corrections.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${e ? `<div class="ds-toolbar bd-aktionen">
      <span class="small muted">${kiHier ? `Gewählt und begründet von ${esc(ki.modell)}` : 'Von der App berechnet, noch ohne KI'}</span><span class="spacer"></span>
      <button class="btn tiny" data-bd="vorschlag">${kiHier ? 'KI neu wählen lassen' : 'KI wählen und begründen lassen'}</button><button class="btn tiny" data-bd="freiloesen" title="Macht aus dem Entwurf ein freies Layout: jedes Element lässt sich dann anfassen und verschieben">Frei bearbeiten</button><button class="btn tiny" data-bd="html">HTML speichern</button><button class="btn tiny" data-bd="vjson">JSON speichern</button>
      ${ohneProjekt() || FORMATE[designState().format].web ? '' : '<button class="btn tiny primary" data-bd="flyer">In den Flyer übernehmen</button>'}
    </div>
    <div class="ds-info">
      <div class="m-box"><h4>Typografie und Kontrast</h4>
        <table class="bd-mini"><tbody>
          <tr><th>Headline</th><td>${zahl(e.sizes.headline)} % der Bildbreite, ${e.lines.length}-zeilig</td><td><span class="bd-probe" style="background:${e.panel ? e.panel.color : e.ground};color:${e.colors.text}">Aa</span> ${e.colors.text}</td><td>${zahl(e.contrast.text)} : 1</td></tr>
          ${v.texts.subline ? `<tr><th>Subline</th><td>${zahl(e.sizes.subline)} % · Verhältnis 1 : ${zahl(e.sizes.headline / e.sizes.subline)}</td><td>${e.colors.text}</td><td>${zahl(e.contrast.text)} : 1</td></tr>` : ''}
          ${v.texts.cta ? (v.style.typo.cta === 'zeile' ? `<tr><th>Aufruf</th><td>${zahl(e.sizes.cta * 1.08)} %, Textzeile</td><td>${e.colors.text}</td><td>${zahl(e.contrast.text)} : 1</td></tr>` : `<tr><th>Aufruf</th><td>${zahl(e.sizes.cta)} %, Knopf</td><td><span class="bd-probe" style="background:${e.colors.cta_background};color:${e.colors.cta_text}">Aa</span> ${e.colors.cta_background}</td><td>${zahl(e.contrast.cta_text)} : 1</td></tr>`) : ''}
        </tbody></table>
        <p class="small muted" style="margin-top:8px">Ein Block, eine Kante, ${e.align === 'mitte' ? 'zentriert' : 'linksbündig'}. Kontrast = kleinster Wert gegenüber allen Bildstellen unter dem Block, Ziel ${zahl(v.min_contrast)} : 1.${e.overlap ? ` ${Math.round(e.overlap * 100)} % des Blocks liegen über dem Motiv.` : ''}${e.veil ? ` Ein weicher Schleier (${Math.round(e.veil.opacity * 100)} % ${e.veil.color}) liegt hinter dem Block.` : ''}</p></div>
      <div class="m-box"><h4>Farbpalette</h4><div class="bd-palette">${[['Hintergrund', p.background], ['Fläche', p.surface], ['Akzent', p.accent], ['Schrift', p.text]].map(([n, h]) => `<div>${farbfeld({ hex: h })}<b>${h}</b><span class="muted">${n}</span></div>`).join('')}</div>
        ${v.reasoning ? `<h4 style="margin-top:14px">Begründung</h4><p>${esc(v.reasoning)}</p>` : ''}</div>
    </div>` : ''}`;
}
function viewSkizzen(a, A) {
  const z = Z(), blatt = z.skizzen[a.id] || [];
  if (!A.free_map) return viewVorschlag(a, A);
  if (!blatt.length) return `<div class="ds-empty"><h2>Ausprobieren wie auf Papier</h2><p class="muted">Das Vision-Modell (${esc(vlmName() || 'kein Modell')}) sieht das Foto und entwirft frei: Es bestimmt Idee, Bausteine, Größen, Farben und ungefähre Lage selbst. Die App setzt das Ergebnis sauber: Texte bleiben im Bild, überdecken sich nicht und weichen dem Motiv aus. Daneben liegen sechs Grundskizzen der App zum Vergleich. Danach sieht sich das Modell jede fertige Skizze an und beurteilt sie. „Beste weiterentwickeln“ lässt es die stärksten Skizzen anhand der Kritik frei überarbeiten.</p><button class="btn primary" data-bd="skizzen">Skizzen ausprobieren</button></div>`;
  const karte = s => { const w = s.wertung, i = blatt.indexOf(s), v = s.frei ? null : skizzenVorschlag(a.id, s);
    return `<article class="bd-skizze">
      <button class="bd-skizze-bild" data-bdskizze="${i}" title="Als Entwurf übernehmen">${s.frei ? F.freiHTML(A, s.layout, ui.assetURL[a.id]) : G.ansichtHTML(A, v.variant, v.texts, ui.assetURL[a.id], { stil: v.style })}</button>
      <div class="bd-skizze-kopf"><b>${esc(s.name)}</b><span class="bd-marke ${w && w.summe >= 12 ? 'ok' : ''}">${w ? `${w.summe} / 15` : 'ohne Urteil'}</span></div>
      <p class="small muted">${s.frei ? (s.basis ? `Von der KI überarbeitet aus „${esc(s.basis)}“` : 'Frei entworfen von der KI') : `Grundskizze der App · ${esc(G.REGELN[s.regel].name)}`}${(s.runde || 1) > 1 ? ` · Runde ${s.runde}` : ''}</p>
      <p class="small">${esc(s.idee)}</p>
      ${s.frei && s.rein && s.rein.length ? `<p class="small muted" title="${esc(s.rein.join(' · '))}">Von der App sauber gesetzt (${s.rein.length} ${s.rein.length === 1 ? 'Baustein' : 'Bausteine'} angepasst)</p>` : ''}
      ${w ? `<p class="small muted">Lesbarkeit ${w.lesbarkeit} · Motiv ${w.motiv} · Spannung ${w.spannung}</p><p class="small"><b>Urteil:</b> ${esc(w.urteil)}</p><p class="small"><b>Nächster Schritt:</b> ${esc(w.verbessern)}</p>` : ''}
      <button class="btn tiny" data-bdskizze="${i}">Als Entwurf übernehmen</button></article>`; };
  return `<div class="ds-toolbar"><span class="small muted">${blatt.length} Skizzen, die besten zuerst. Die Urteile stammen vom Vision-Modell und sind ein Anhaltspunkt, kein Ersatz für dein Auge.</span><span class="spacer"></span>
      <button class="btn tiny primary" data-bd="skizzenweiter">Beste weiterentwickeln</button><button class="btn tiny" data-bd="skizzen">Neues Blatt</button></div>
    <div class="bd-blatt">${Sk.rangfolge(blatt).map(karte).join('')}</div>`;
}
function main() {
  const z = Z(), a = asset(), A = a && z.analysen[a.id];
  if (ui.busy) return `<p class="bd-fort" id="bd-fort" role="status">${esc(ui.busyText || '')}</p><div class="live" id="live">${liveInner()}</div>`;
  if (!a) return `<div class="ds-empty"><h2>Design für ein Bild</h2><p class="muted">Lade links ein Foto hoch. Die App misst, wo das Bild ruhig genug für Text ist, wo es unscharf wird und welche Farben es prägen. Daraus entsteht ein Vorschlag, wo Headline, Subline und CTA stehen.</p></div>`;
  if (A && !A.free_map && !ui.bdNach) { ui.bdNach = true; neuRechnen().finally(() => { ui.bdNach = false; }); }
  if (!A) {
    const weitere = bilder().filter(x => x.id !== a.id && !z.analysen[x.id]).length, bildTag = ui.assetURL[a.id] ? `<img src="${ui.assetURL[a.id]}" alt="">` : '';
    if (z.spaeter[a.id]) return `<div class="ds-empty bd-leer">${bildTag}<h2>${esc(a.name)}</h2><p class="muted">Noch nicht analysiert. Den Knopf dafür findest du links oben unter „Bild“.</p></div>`;
    return `<div class="ds-empty bd-leer">${bildTag}<h2>Soll ich „${esc(a.name)}“ analysieren?</h2><p class="muted">Die App misst Farben, Schärfe und ruhige Flächen${z.beschreiben ? `, und das Vision-Modell (${esc(vlmName() || 'kein Modell')}) beschreibt das Bild und jede Kachel` : `, und das Vision-Modell (${esc(vlmName() || 'kein Modell')}) beschreibt das Gesamtbild`}. Raster: ${z.raster.map(r => r.replace('x', ' × ')).join(', ') || 'keines gewählt'}.</p>
      <div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap"><button class="btn primary" data-bd="analyse">Ja, analysieren</button>${weitere ? `<button class="btn" data-bd="alleoffen">Alle ${weitere + 1} neuen analysieren</button>` : ''}<button class="btn" data-bd="spaeter">Jetzt nicht</button></div></div>`;
  }
  const tab = ['analyse', 'skizzen', 'vorschlag', 'json'].includes(z.tab) ? z.tab : 'analyse';
  return `<div class="bd-tabs"><div class="seg2"><button data-bdtab="analyse" aria-pressed="${tab === 'analyse'}">Analyse</button><button data-bdtab="skizzen" aria-pressed="${tab === 'skizzen'}">Skizzen</button><button data-bdtab="vorschlag" aria-pressed="${tab === 'vorschlag'}">Entwurf</button><button data-bdtab="json" aria-pressed="${tab === 'json'}">JSON</button></div></div>
    ${tab === 'analyse' ? viewAnalyse(a, A) : tab === 'skizzen' ? viewSkizzen(a, A) : tab === 'vorschlag' ? viewVorschlag(a, A) : `<div class="ds-toolbar"><span class="small muted">Dieses JSON geht an das Design-Modell (dort ohne Pixel- und Messdetails).</span><span class="spacer"></span><button class="btn tiny" data-bd="kopieren">Kopieren</button><button class="btn tiny" data-bd="json">JSON speichern</button></div><pre class="bd-json">${esc(analyseJSON(A))}</pre>`}`;
}
/* Umschalter im Kopf des Studios */
const umschalter = () => ohneProjekt() ? '' : `<div class="seg2 bd-modus" role="group" aria-label="Bereich"><button data-dsmodus="entwurf" aria-pressed="${designState().modus !== 'bild'}">Entwurf</button><button data-dsmodus="bild" aria-pressed="${designState().modus === 'bild'}">Bild-Design</button></div>`;

/* Direkter Einstieg von der Startseite oder aus der Kopfzeile, ohne Projektanalyse */
function open() {
  if (ui.busy) return;
  if (S.screen !== 'design') S.prevScreen = S.screen;
  S.screen = 'design'; ui.error = null;
  const D = designState();
  D.modus = 'bild'; Z(); save(); render(); window.scrollTo({ top: 0 });
  loadAssets().then(() => { if (S.screen === 'design') render(); });
}
const einstieg = () => `<section class="startlist bd-einstieg"><div><h3>Text auf ein Bild setzen</h3><p class="small muted">Foto hochladen, ruhige Flächen und Schärfe messen lassen und geprüfte Kompositionen für Headline, Subline und CTA bekommen. Ohne Projektanalyse.</p></div><button class="btn" data-bd="start">Bild-Design öffnen</button></section>`;

/* Nach einem Wechsel des Reiters beginnt der Inhalt oben, wenn man weiter unten war */
function zuTabs() { const t = document.querySelector('.bd-tabs'); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ block: 'start' }); }

/* ---------- Ereignisse ---------- */
function klick(e) {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.bd === 'start') return open();
  if (S.screen !== 'design') return;
  if (d.dsmodus) { if (ui.busy) return; designState().modus = d.dsmodus; ui.error = null; save(); return render(); }
  if (!an()) return;
  const z = Z(), a = asset();
  if (d.bdbild) { z.asset = d.bdbild; save(); return render(); }
  if (d.bdtab) { z.tab = d.bdtab; save(); render(); return zuTabs(); }
  if (d.bdgrid) { z.grid = d.bdgrid; save(); return render(); }
  if (d.bdvar && a) { const v = z.vorschlaege[a.id] = { ...(z.vorschlaege[a.id] || {}) }; v.wahl = { ...(v.wahl && typeof v.wahl === 'object' ? v.wahl : {}), [regel()]: d.bdvar }; save(); return render(); }
  if (d.bdregel) { z.regel = d.bdregel; save(); return render(); }
  if (d.bdskizze !== undefined) return nimmSkizze(+d.bdskizze);
  if (d.bdflaeche) { z.stil.flaeche = { ...(z.stil.flaeche || {}), art: d.bdflaeche }; if (d.bdflaeche !== (z.stil.flaeche.alt || '')) { delete z.stil.flaeche.seite; delete z.stil.flaeche.groesse; delete z.stil.flaeche.deckkraft; z.stil.flaeche.alt = d.bdflaeche; } save(); return render(); }
  if (d.bdschmuck) { const e = (z.stil.schmuck = z.stil.schmuck || {}); e[d.bdschmuck] = { ...(e[d.bdschmuck] || {}), an: !(e[d.bdschmuck] || {}).an }; save(); return render(); }
  if (d.bdsleer) { setze(z.stil, d.bdsleer, ''); save(); return render(); }
  if (d.bdraster) {
    z.raster = z.raster.includes(d.bdraster) ? z.raster.filter(r => r !== d.bdraster) : [...z.raster, d.bdraster];
    z.raster = [...RASTER_FEST, ...z.eigene].filter(r => z.raster.includes(r));
    save(); render(); return neuRechnen();
  }
  switch (d.bd) {
    case 'rasterneu': {
      const r = parseRaster(document.getElementById('bd-raster-neu').value);
      if (!r) { ui.error = 'Schreib das Raster als Spalten x Zeilen, zum Beispiel 3x3 (höchstens 12 je Richtung).'; return render(); }
      ui.error = null;
      if (!RASTER_FEST.includes(r.name) && !z.eigene.includes(r.name)) z.eigene.push(r.name);
      if (!z.raster.includes(r.name)) z.raster.push(r.name);
      save(); render(); return neuRechnen();
    }
    case 'cfgreset': z.cfg = {}; save(); render(); return neuRechnen();
    case 'analyse': return a && !ui.busy ? analysiere([a], false) : null;
    case 'alleoffen': return ui.busy ? null : analysiere(bilder().filter(offen), false);
    case 'spaeter': if (a) { z.spaeter[a.id] = true; save(); render(); } return;
    case 'fehlende': return a && !ui.busy ? analysiere([a], true) : null;
    case 'vorschlag': return ui.busy ? null : schlageVor();
    case 'json': return speichere(`${stamm(a)}-analyse.json`, analyseJSON(z.analysen[a.id]), 'application/json');
    case 'vjson': return speichere(`${stamm(a)}-design.json`, vorschlagJSON(a), 'application/json');
    case 'html': return speichere(`${stamm(a)}-design.html`, G.ansichtDatei(z.analysen[a.id], vorschlag(a.id), ui.assetURL[a.id]), 'text/html');
    case 'debugpng': return debugPNG(a);
    case 'kopieren': return navigator.clipboard.writeText(analyseJSON(z.analysen[a.id])).then(() => toast('JSON kopiert'), () => toast('Kopieren hat nicht geklappt'));
    case 'flyer': return uebernehmen();
    case 'farbwelt': return ui.busy ? null : farbweltKI();
    case 'farbprojekt': { const f = projektFarben(); if (f) { z.stil.farben = f; z.farbname = 'aus der Projektanalyse'; save(); render(); } return; }
    case 'freiloesen': return loeseEntwurf();
    case 'freiweg': delete z.frei[a.id]; ui.bfWahl = ''; save(); return render();
    case 'freidavor': { const f = z.frei[a.id]; if (f && f.davor) { z.frei[a.id] = f.davor; ui.bfWahl = ''; save(); render(); } return; }
    case 'freiwunsch': return ui.busy ? null : freiWunsch();
    case 'freisauber': { const f = z.frei[a.id], r = F.reinzeichnen(z.analysen[a.id], f.layout, messe); z.frei[a.id] = { ...f, layout: r.layout, rein: r.aenderungen, davor: { name: f.name, idee: f.idee, layout: f.layout } }; ui.bfWahl = ''; save(); render(); return toast(r.aenderungen.length ? `${r.aenderungen.length} Bausteine angepasst` : 'Alles sitzt schon sauber'); }
    case 'freihtml': return speichere(`${stamm(a)}-entwurf.html`, F.freiDatei(z.analysen[a.id], z.frei[a.id], ui.assetURL[a.id], G.ANSICHT_CSS, G.ANSICHT_SCHRIFT), 'text/html');
    case 'freijson': return speichere(`${stamm(a)}-entwurf.json`, JSON.stringify({ image: z.analysen[a.id].image, name: z.frei[a.id].name, idea: z.frei[a.id].idee, layout: z.frei[a.id].layout, measured: F.messeLayout(z.analysen[a.id], z.frei[a.id].layout, messe) }, null, 2), 'application/json');
    case 'freitext': case 'freiflaeche': case 'freilinie': {
      const L = z.frei[a.id].layout;
      if (d.bd === 'freitext') { L.texte.push(F.leseLayout({ texte: [{ text: 'Neuer Text', x: 40, y: 45, groesse: 4, breite: 0, farbe: '#FFFFFF', gewicht: 'fett', ausrichtung: 'links', drehung: 0 }] }).texte[0]); ui.bfWahl = `texte.${L.texte.length - 1}`; }
      else { L.formen.push(F.leseLayout({ formen: [d.bd === 'freilinie' ? { art: 'linie', x: 20, y: 50, breite: 60, hoehe: 0, farbe: '#FFFFFF', deckkraft: 100, gefuellt: false, staerke: 2, drehung: 0 } : { art: 'rechteck', x: 55, y: 55, breite: 35, hoehe: 30, farbe: '#FFFFFF', deckkraft: 90, gefuellt: true, staerke: 2, drehung: 0 }] }).formen[0]); ui.bfWahl = `formen.${L.formen.length - 1}`; }
      save(); return render();
    }
    case 'freiloeschen': case 'freivor': {
      const [art, nr] = (ui.bfWahl || '').split('.'), liste = z.frei[a.id] && z.frei[a.id].layout[art]; if (!liste || !liste[+nr]) return;
      const [el] = liste.splice(+nr, 1); if (d.bd === 'freivor') { liste.push(el); ui.bfWahl = `${art}.${liste.length - 1}`; } else ui.bfWahl = '';
      save(); return render();
    }
    case 'skizzen': return ui.busy ? null : skizziere(false);
    case 'skizzenweiter': return ui.busy ? null : skizziere(true);
    case 'weiter': return blaettere(1);
    case 'zurueck': return blaettere(-1);
  }
}
/* Wert eines Felds des freien Entwurfs setzen; die Bühne folgt sofort */
function freiSetze(t) {
  const z = Z(), a = asset(), f = a && z.frei[a.id]; if (!f) return false;
  setze(f.layout, t.dataset.bfe, t.type === 'range' ? parseFloat(t.value) : t.type === 'checkbox' ? t.checked : t.type === 'color' ? t.value.toUpperCase() : t.value);
  const st = document.getElementById('bd-stage'); if (st) st.innerHTML = freiBuehne(a, z.analysen[a.id], f);
  const o = t.parentElement.querySelector('output'); if (o) o.textContent = zahl(parseFloat(t.value));
  return true;
}
function wechsel(e) {
  if (!an()) return;
  const t = e.target, z = Z();
  if (t.dataset.bfe) { freiSetze(t); save(); return t.tagName === 'TEXTAREA' ? undefined : render(); }
  if (t.dataset.bds) {
    setze(z.stil, t.dataset.bds, stilWert(t)); save();
    /* Textfelder zeichnen nicht neu: die Ansicht ist beim Tippen schon mitgelaufen, und ein Neuzeichnen
       beim Verlassen des Felds würde den Klick verschlucken, mit dem man es verlässt. */
    return t.type === 'text' || t.tagName === 'TEXTAREA' ? undefined : render();
  }
  if (t.dataset.bdf) { z[t.dataset.bdf] = t.type === 'checkbox' ? t.checked : t.value; save(); return render(); }
  if (t.dataset.bdcfg) {
    const pfad = t.dataset.bdcfg, n = parseFloat(String(t.value).replace(',', '.'));
    if (!isFinite(n) || n < 0 || n === lies(STANDARD, pfad)) {
      /* zurück auf die Vorgabe: Abweichung entfernen */
      const teile = pfad.split('.'); if (teile.length === 2 && z.cfg[teile[0]]) { delete z.cfg[teile[0]][teile[1]]; if (!Object.keys(z.cfg[teile[0]]).length) delete z.cfg[teile[0]]; } else delete z.cfg[pfad];
    } else setze(z.cfg, pfad, n);
    save(); return neuRechnen();
  }
}
const stilWert = t => (t.type === 'range' || t.type === 'number' ? parseFloat(t.value) : t.type === 'checkbox' ? t.checked : t.type === 'color' ? t.value.toUpperCase() : t.value);
/* Texte und Stil links ändern: die Ansicht folgt sofort */
function eingabe(e) {
  if (!an() || !e.target.dataset) return;
  const t = e.target;
  if (t.dataset.bfe) return void freiSetze(t);
  if (t.dataset.bds) { setze(Z().stil, t.dataset.bds, stilWert(t)); const o = t.parentElement.querySelector('output'); if (o) o.textContent = zahl(parseFloat(t.value)) + (o.textContent.includes('%') ? ' %' : ''); }
  else if (!/^texte\./.test(t.dataset.d || '')) return;
  const st = document.getElementById('bd-stage'), a = asset(), v = a && vorschlag(a.id);
  if (st && v) st.innerHTML = G.ansichtHTML(Z().analysen[a.id], v.variant, v.texts, ui.assetURL[a.id], { linien: Z().linien ? v.lines : [], stil: v.style });
}

/* ---------- Stile ---------- */
const CSS = `${G.ANSICHT_CSS}
${F.FREI_CSS}
.bd-stage.frei [data-bf]{cursor:move;touch-action:none;user-select:none}
.bd-stage.frei [data-bf][data-an]{outline:1.5px dashed #fff;outline-offset:3px;box-shadow:0 0 0 1px rgba(0,0,0,.5)}
.bd-stage.frei line[data-an]{filter:drop-shadow(0 0 2px #fff)}
.bd-refine{display:grid;grid-template-columns:1fr auto;gap:8px;margin:12px 0}
.bd-refine textarea{resize:vertical}
.bd-modus{margin:-6px 0 18px}
.bd-einstieg{display:flex;flex-direction:column;gap:12px;align-items:flex-start}
.bd-einstieg h3{margin:0 0 4px}.bd-einstieg p{margin:0}
.bd-bilder{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
.bd-bild{position:relative;aspect-ratio:1;border:2px solid var(--line);border-radius:10px;padding:0;overflow:hidden;background:var(--surface-2)}
.bd-bild img{width:100%;height:100%;object-fit:cover;display:block}
.bd-bild.on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}
.bd-bild i{position:absolute;right:4px;top:4px;width:10px;height:10px;border-radius:50%;background:var(--ok);border:2px solid #fff}
.bd-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.bd-chip{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 14px;font-size:.88rem;font-variant-numeric:tabular-nums}
.bd-chip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.bd-eigen{display:grid;grid-template-columns:1fr auto;gap:6px;margin-bottom:8px}
.bd-eigen .input{font-size:.88rem;padding:5px 9px}
.bd-check{display:flex;gap:8px;align-items:flex-start;font-size:.88rem;margin-top:8px}
.bd-schwelle{display:grid;grid-template-columns:minmax(0,1fr) 92px;gap:10px;align-items:center;margin-bottom:8px;font-size:.86rem}
.bd-schwelle small{display:block;color:var(--muted);font-size:.74rem;line-height:1.3}
.bd-schwelle .input{padding:5px 8px;font-size:.88rem;font-variant-numeric:tabular-nums;text-align:right}
.bd-analyse{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.bd-tabs{margin-bottom:12px}
.bd-fort{font-weight:600;margin:0 0 10px}
.bd-debug{border-radius:14px;overflow:hidden;background:var(--surface-2);line-height:0}
.bd-debug svg{width:100%;height:auto;display:block}
.bd-legende{display:flex;flex-wrap:wrap;gap:6px 18px;margin:10px 0 0;align-items:center}
.bd-legende span{display:inline-flex;align-items:center;gap:6px}
.bd-legende i{width:14px;height:14px;border-radius:3px;display:inline-block}
.bd-legende i.gruen{background:rgba(31,163,91,.6)}
.bd-legende i.rot{background:repeating-linear-gradient(45deg,rgba(215,54,43,.85) 0 3px,rgba(215,54,43,.4) 3px 7px)}

.bd-legende i.strich{background:none;border:2px dashed var(--ink)}
.bd-legende i.rahmen{background:none;border:2px solid var(--ink)}
.bd-blatt{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px}
.bd-skizze{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:6px}
.bd-skizze p{margin:0}
.bd-skizze-bild{padding:0;border:0;background:none;border-radius:8px;overflow:hidden;display:block;cursor:pointer;text-align:left}
.bd-skizze-bild:hover{outline:2px solid var(--accent);outline-offset:2px}
.bd-skizze-kopf{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:4px}
.bd-skizze .btn{align-self:flex-start;margin-top:auto}
.bd-farbwahl{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;margin-bottom:8px;font-size:.86rem}
.bd-farbwahl input[type=color]{width:34px;height:28px;padding:0;border:1px solid var(--line);border-radius:8px;background:none}
.bd-farbwahl small{display:block;color:var(--muted);font-size:.74rem;font-variant-numeric:tabular-nums}
.bd-regler{display:grid;grid-template-columns:minmax(0,1fr) 120px 44px;gap:8px;align-items:center;margin-bottom:8px;font-size:.84rem}
.bd-regler select{grid-column:2 / -1;padding:4px 8px;font-size:.84rem}
.bd-regler input[type=range]{width:100%;accent-color:var(--accent)}
.bd-regler output{text-align:right;color:var(--muted);font-size:.78rem;font-variant-numeric:tabular-nums}
.bd-stilbox{border-top:1px solid var(--line);padding-top:10px;margin-top:6px}
.bd-stilbox>b{display:block;margin-bottom:8px}
.bd-regeln{display:flex;flex-wrap:wrap;gap:10px 22px;align-items:flex-end;margin-bottom:6px}
.bd-regeln .bd-chips{margin:3px 0 0}
.bd-blaettern{margin-left:auto;display:flex;gap:6px}
.bd-regelinfo{margin:0 0 10px;display:flex;flex-wrap:wrap;gap:4px 16px;align-items:center}
.bd-check.inline{margin:0;font-size:inherit;align-items:center}
.bd-aktionen{margin-top:14px}
.bd-varianten{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-top:12px}
.bd-var{display:flex;gap:10px;align-items:center;text-align:left;border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:8px 12px;font-size:.86rem}
.bd-var b{font-family:var(--display);font-size:1.1rem;width:1.2em}
.bd-var small{display:block;color:var(--muted);font-size:.74rem}
.bd-var[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft);color:var(--ink)}
.bd-legende i.rot2{background:repeating-linear-gradient(45deg,rgba(215,54,43,.6) 0 2px,rgba(215,54,43,.15) 2px 7px)}
.bd-hinweis{background:var(--assume-bg);border-radius:10px;padding:8px 12px;margin:10px 0 0}
.bd-dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0;font-size:.92rem}
.bd-dl dt{color:var(--muted)}.bd-dl dd{margin:0}
.bd-farbe{display:inline-block;width:18px;height:18px;border-radius:5px;border:1px solid rgba(0,0,0,.18);vertical-align:middle}
.bd-farben{display:flex;gap:3px;margin-bottom:3px}
.bd-palette{display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:10px}
.bd-palette div{display:flex;flex-direction:column;gap:2px;font-size:.8rem;font-variant-numeric:tabular-nums}
.bd-palette .bd-farbe{width:100%;height:38px;border-radius:8px}
.bd-tabelle{overflow:auto;margin-top:14px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
.bd-tabelle table{border-collapse:collapse;width:100%;font-size:.82rem;font-variant-numeric:tabular-nums}
.bd-tabelle th{text-align:left;font-weight:600;padding:8px 10px;border-bottom:1px solid var(--line);background:var(--surface-2);white-space:nowrap}
.bd-tabelle td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;white-space:nowrap}
.bd-tabelle tr:last-child td{border-bottom:0}
.bd-tabelle td.bd-besch{white-space:normal;min-width:220px}
.bd-tabelle tr.frei td:first-child{box-shadow:inset 3px 0 0 #1FA35B}
.bd-marke{display:inline-block;border-radius:999px;padding:1px 9px;background:var(--surface-2);font-size:.78rem}
.bd-marke.gruen,.bd-marke.ok{background:var(--ok-bg);color:var(--ok)}
.bd-marke.rot{background:var(--review-bg);color:var(--review)}
.bd-probe{display:inline-block;border-radius:6px;padding:1px 8px;font-weight:700;border:1px solid rgba(0,0,0,.15)}
.bd-stage{border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(10,14,20,.18)}
.bd-mini{border-collapse:collapse;width:100%;font-size:.86rem;font-variant-numeric:tabular-nums}
.bd-mini th{text-align:left;font-weight:600;padding:5px 10px 5px 0}.bd-mini td{padding:5px 10px 5px 0}
.bd-json{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;font-size:.78rem;line-height:1.45;max-height:70vh;overflow:auto;white-space:pre}
.bd-leer img{max-width:min(100%,520px);max-height:320px;border-radius:12px;display:block;margin:0 auto 16px}
`;

/* ---------- Elemente des freien Entwurfs anfassen und verschieben ---------- */
let zug = null;
function fassAn(e) {
  if (!an() || ui.busy) return;
  const el = e.target.closest ? e.target.closest('#bd-stage.frei [data-bf]') : null, a = asset(), f = a && Z().frei[a.id];
  if (!f || !e.target.closest || !e.target.closest('#bd-stage.frei')) return;
  if (!el) { if (ui.bfWahl) { ui.bfWahl = ''; render(); } return; }
  const [art, nr] = el.dataset.bf.split('.'), ding = f.layout[art][+nr], r = document.getElementById('bd-stage').getBoundingClientRect();
  e.preventDefault();
  zug = { a, f, ding, x0: e.clientX, y0: e.clientY, sx: ding.x, sy: ding.y, b: r.width, h: r.height, bewegt: false, neuGewaehlt: ui.bfWahl !== el.dataset.bf };
  ui.bfWahl = el.dataset.bf;
}
function zieh(e) {
  if (!zug) return;
  const dx = (e.clientX - zug.x0) / zug.b * 100, dy = (e.clientY - zug.y0) / zug.h * 100;
  if (!zug.bewegt && Math.abs(e.clientX - zug.x0) + Math.abs(e.clientY - zug.y0) < 3) return;
  zug.bewegt = true; zug.ding.x = Math.round((zug.sx + dx) * 10) / 10; zug.ding.y = Math.round((zug.sy + dy) * 10) / 10;
  const st = document.getElementById('bd-stage'); if (st) st.innerHTML = freiBuehne(zug.a, Z().analysen[zug.a.id], zug.f);
}
function lassLos() { if (!zug) return; const z = zug; zug = null; if (z.bewegt || z.neuGewaehlt) { save(); render(); } }

/* ---------- Neuzeichnen ohne Sprung ---------- */
/* Die App baut bei jeder Änderung die ganze Seite neu auf. Im Design-Studio bleibt dabei erhalten,
   wo man gerade ist: Position der Seite und der linken Spalte, auf- und zugeklappte Abschnitte
   und das Feld, in dem man steht. Gilt für das ganze Studio, nicht nur für das Bild-Design. */
const zeichneRoh = window.render;
window.render = function () {
  const feld = el => (!el || !el.dataset ? '' : el.dataset.bds ? `[data-bds="${el.dataset.bds}"]` : el.dataset.bfe ? `[data-bfe="${el.dataset.bfe}"]` : el.dataset.bdcfg ? `[data-bdcfg="${el.dataset.bdcfg}"]` : el.dataset.d ? `[data-d="${el.dataset.d}"]` : el.id ? '#' + el.id : '');
  const spalte = S.screen === 'design' ? document.querySelector('.ds-panel') : null;
  if (!spalte) return zeichneRoh();
  const stand = { y: window.scrollY, oben: spalte.scrollTop, art: spalte.className, offen: [...spalte.querySelectorAll('details')].map(d => d.open), fokus: feld(document.activeElement) };
  const auswahl = stand.fokus && 'selectionStart' in document.activeElement ? (() => { try { return [document.activeElement.selectionStart, document.activeElement.selectionEnd]; } catch { return null; } })() : null;
  zeichneRoh();
  const neu = S.screen === 'design' ? document.querySelector('.ds-panel') : null;
  if (!neu || neu.className !== stand.art) return;   /* anderer Bereich: dort beginnt man oben */
  const klappen = [...neu.querySelectorAll('details')];
  if (klappen.length === stand.offen.length) klappen.forEach((d, i) => { d.open = stand.offen[i]; });
  neu.scrollTop = stand.oben;
  window.scrollTo(0, stand.y);
  if (stand.fokus) { const el = document.querySelector(stand.fokus); if (el && el !== document.activeElement) { el.focus({ preventScroll: true }); if (auswahl && el.setSelectionRange) { try { el.setSelectionRange(auswahl[0], auswahl[1]); } catch {} } } }
};

/* ---------- Start ---------- */
document.head.appendChild(Object.assign(document.createElement('style'), { id: 'bild-css', textContent: CSS }));
const app = document.getElementById('app');
app.addEventListener('click', klick);
app.addEventListener('change', wechsel);
app.addEventListener('input', eingabe);
app.addEventListener('pointerdown', fassAn);
window.addEventListener('pointermove', zieh);
window.addEventListener('pointerup', lassLos);
window.BildDesign = { panel, main, umschalter, open, einstieg, aktiv: an };
if (S.screen === 'design' || S.screen === 'start') render();
/* Sobald die Schrift geladen ist, stimmen die gemessenen Breiten: dann neu zeichnen */
if (document.fonts && document.fonts.load) document.fonts.load('700 100px "Familjen Grotesk"').then(() => { if (an()) render(); }).catch(() => {});
