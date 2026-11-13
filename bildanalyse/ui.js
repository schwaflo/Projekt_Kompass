/* ============================================================
   Bildanalyse – Oberfläche im Design-Studio („Bild-Design“)
   Hängt sich in die App aus index.html ein und nutzt deren
   Bausteine: Zustand S, run(), render(), die Live-Ansicht der KI
   und den Bildspeicher des Studios.
   Ablauf: Bild wählen → analysieren (Messung + Vision-Modell)
   → Debug-Vorschau prüfen → Design vorschlagen → speichern oder
   in den Flyer-Entwurf übernehmen.
   ============================================================ */
/* global S, ui, render, run, save, esc, toast, liveInner, designState, addLog, slug, KIND, TOK, FORMATE, errorBox */
import { STANDARD, konfig, analysiereBild, parseRaster, parseRasterListe, alleKacheln } from './kern.js';
import * as G from './design.js';

Object.assign(KIND, {
  bild_gesamt: { name: 'Gesamtbild beschreiben', expect: 500 },
  bild_kachel: { name: 'Kachel beschreiben', expect: 160 },
  bild_design: { name: 'Design-Vorschlag zusammenführen', expect: 700 }
});
Object.assign(TOK, { bild_gesamt: 600, bild_kachel: 260, bild_design: 1000 });

const RASTER_FEST = ['2x2', '4x2', '4x4'];
const VLM_WUNSCH = /qwen2\.5-?vl/i, DESIGN_WUNSCH = /gemma-?4/i;

/* ---------- Zustand (liegt in S.design.bild und wird mit dem Projekt gespeichert) ---------- */
function Z() {
  const D = designState();
  if (!D.bild) D.bild = { asset: '', raster: ['2x2', '4x2'], eigene: [], beschreiben: true, vlm: '', modell: '', cfg: {}, analysen: {}, vorschlaege: {}, tab: 'analyse', grid: '' };
  /* Analysen entfernter Bilder nicht weiter mitspeichern */
  const da = new Set(D.assets.map(a => a.id));
  for (const feld of ['analysen', 'vorschlaege']) for (const id of Object.keys(D.bild[feld])) if (!da.has(id)) delete D.bild[feld][id];
  return D.bild;
}
const an = () => S.screen === 'design' && S.design && S.design.modus === 'bild' && !FORMATE[designState().format].web;
const bilder = () => designState().assets.filter(a => a.w > 0);   /* SVG-Dateien haben keine Pixel zum Messen */
function asset() {
  const z = Z(), liste = bilder();
  return liste.find(a => a.id === z.asset) || liste.find(a => a.rolle !== 'logo') || liste[0] || null;
}
const modelle = () => ui.models || [];
const vlmName = () => (Z().vlm && modelle().includes(Z().vlm) ? Z().vlm : modelle().find(m => VLM_WUNSCH.test(m)) || S.model);
const designName = () => (Z().modell && modelle().includes(Z().modell) ? Z().modell : modelle().find(m => DESIGN_WUNSCH.test(m)) || S.model);
const texte = () => { const t = designState().texte || {}; return { headline: t.headline || '', subline: t.subline || '', cta: t.cta || '' }; };
/* Der geprüfte Vorschlag wird bei jedem Zeichnen neu aus der KI-Antwort berechnet, damit geänderte Schwellwerte sofort gelten */
function vorschlag(id) {
  const z = Z(), A = z.analysen[id], v = z.vorschlaege[id];
  return A && v ? G.pruefeVorschlag(A, v.roh) : null;
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
const frage = o => window.KompassKI.frage(o);
function fortschritt(text) { ui.busyText = text; const el = document.getElementById('bd-fort'); if (el) el.textContent = text; }
function messe(a, img, alt) {
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
    try { z.analysen[a.id] = messe(a, await ladeBild(ui.assetURL[a.id]), z.analysen[a.id]); } catch (e) { ui.error = e.message; }
  }
  save(); if (an()) render();
}
function analysiere(liste, nurFehlende) {
  const z = Z();
  if (!liste.length) return;
  if (!parseRasterListe(z.raster).length) { ui.error = 'Wähle mindestens ein Raster.'; return render(); }
  run(liste.length > 1 ? 'Bilder werden analysiert …' : 'Bild wird analysiert …', async () => {
    const modell = vlmName();
    for (const [nr, a] of liste.entries()) {
      const vor = liste.length > 1 ? `Bild ${nr + 1} von ${liste.length} · ` : '';
      fortschritt(vor + 'Farben, Schärfe und Freiraum werden gemessen');
      const img = await ladeBild(ui.assetURL[a.id]);
      const A = z.analysen[a.id] = messe(a, img, nurFehlende ? z.analysen[a.id] : null);
      if (!nurFehlende) delete z.vorschlaege[a.id];
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
    const roh = await frage({ system: G.DESIGN_SYSTEM, prompt: G.designPrompt(A, texte()), schema: G.designSchema(A), art: 'bild_design', modell, denken: false });   /* ohne Denkphase: die App prüft jede Angabe nach, langes Grübeln bringt hier nichts */
    z.vorschlaege[a.id] = { roh, modell };
    z.tab = 'vorschlag';
    addLog('Design für Bild vorgeschlagen', a.name);
  });
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
  const z = Z(), v = vorschlag(a.id), t = texte();
  return JSON.stringify({ image: z.analysen[a.id].image, model: z.vorschlaege[a.id].modell, texts: t, ...v, model_answer: z.vorschlaege[a.id].roh }, null, 2);
}
async function debugPNG(a) {
  const z = Z(), A = z.analysen[a.id], svg = G.debugSVG(A, gridName(A), ui.assetURL[a.id]);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await ladeBild(url), c = document.createElement('canvas'); c.width = A.image.width; c.height = A.image.height;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(b => speichere(`${stamm(a)}-debug-${gridName(A)}.png`, b), 'image/png');
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
  ['kontrast_min', 'Kontrast Schrift mindestens', 'WCAG AA verlangt 4,5 : 1.', 0.1],
  ['kontrast_flaeche_min', 'Kontrast Knopf mindestens', 'Knopffläche gegen das Bild, WCAG verlangt 3 : 1.', 0.1],
  ['arbeitsgroesse', 'Messgröße in Pixel', 'Längste Seite, auf die das Bild für die Messung verkleinert wird.', 64]
];
const lies = (o, pfad) => pfad.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
function setze(o, pfad, wert) { const t = pfad.split('.'); let x = o; for (let i = 0; i < t.length - 1; i++) x = x[t[i]] = x[t[i]] && typeof x[t[i]] === 'object' ? x[t[i]] : {}; x[t[t.length - 1]] = wert; }

function panel() {
  const z = Z(), D = designState(), liste = bilder(), a = asset(), t = D.texte, cfg = konfig(z.cfg), A = a && z.analysen[a.id];
  const raster = [...new Set([...RASTER_FEST, ...z.eigene])];
  const wahl = (feld, auto) => `<select class="input" data-bdf="${feld}"><option value="">Automatisch (${esc(auto || 'kein Modell')})</option>${modelle().map(m => `<option ${z[feld] === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>`;
  const abweichend = Object.keys(z.cfg).length > 0;
  return `<aside class="ds-panel bd-panel">
    <details open><summary>Bild <span class="muted small">${liste.length || ''}</span></summary>
      ${liste.length ? `<div class="bd-bilder">${liste.map(x => `<button class="bd-bild ${a && x.id === a.id ? 'on' : ''}" data-bdbild="${x.id}" title="${esc(x.name)}">${ui.assetURL[x.id] ? `<img src="${ui.assetURL[x.id]}" alt="${esc(x.name)}">` : ''}${z.analysen[x.id] ? '<i aria-label="analysiert"></i>' : ''}</button>`).join('')}</div>` : ''}
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
      <label class="ds-l">CTA<input class="input" data-d="texte.cta" value="${esc(t.cta)}"></label>
    </details>
    <details><summary>Modelle</summary>
      <label class="ds-l">Vision-Modell (sieht das Bild)${wahl('vlm', vlmName())}</label>
      <label class="ds-l">Design-Modell (führt zusammen)${wahl('modell', designName())}</label>
      <p class="small muted">Automatisch nimmt qwen2.5vl für das Sehen und Gemma 4 für das Design, wenn sie installiert sind, sonst das Modell von der Startseite. Das Vision-Modell muss Bilder verstehen.</p>
    </details>
    <details ${abweichend ? 'open' : ''}><summary>Schwellwerte ${abweichend ? '<span class="muted small">angepasst</span>' : ''}</summary>
      ${SCHWELLEN.map(([pfad, name, info, schritt]) => `<label class="bd-schwelle" title="${esc(info)}"><span>${name}<small>${esc(info)}</small></span><input class="input" type="number" min="0" step="${schritt}" data-bdcfg="${pfad}" value="${lies(cfg, pfad)}"></label>`).join('')}
      <p class="small muted">Änderungen wirken sofort auf die Messung, ohne neue KI-Anfrage.${abweichend ? ' <button class="linkbtn" data-bd="cfgreset">Auf Vorgaben zurücksetzen</button>' : ''}</p>
    </details>
    <button class="btn primary ds-go" data-bd="analyse" ${ui.busy || !a ? 'disabled' : ''}>${A ? 'Bild neu analysieren' : 'Bild analysieren'}</button>
    ${liste.length > 1 ? `<button class="btn ds-go bd-zweit" data-bd="alle" ${ui.busy ? 'disabled' : ''}>Alle ${liste.length} Bilder analysieren</button>` : ''}
  </aside>`;
}

/* ---------- Ansicht: Hauptbereich ---------- */
const farbfeld = c => `<span class="bd-farbe" title="${c.hex}${c.percent !== undefined ? ` · ${zahl(c.percent)} %` : ''}" style="background:${c.hex}"></span>`;
function viewAnalyse(a, A) {
  const g = gridName(A), z = Z(), sum = G.zusammenfassung(A), o = A.overall;
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
      <div class="seg2">${Object.keys(A.grids).map(n => `<button data-bdgrid="${n}" aria-pressed="${n === g}">${n.replace('x', ' × ')}</button>`).join('')}</div>
      <span class="small muted">${sum.frei} von ${sum.kacheln} Kacheln mit Freiraum · ${sum.unscharf} unscharf</span>
      <span class="spacer"></span>
      <button class="btn tiny" data-bd="debugpng">Vorschau als PNG</button><button class="btn tiny" data-bd="json">JSON speichern</button>
    </div>
    <div class="bd-debug">${G.debugSVG(A, g, ui.assetURL[a.id])}</div>
    <p class="bd-legende small"><span><i class="gruen"></i>Freiraum für Text</span><span><i class="rot"></i>blurry</span><span><i class="rot2"></i>leicht unscharf</span><span class="muted">Flächen fast ohne Struktur (Himmel, Wand) bekommen kein Schärfe-Urteil.</span></p>
    ${offen ? `<p class="bd-hinweis small">${offen} Kacheln haben noch keine Beschreibung. <button class="linkbtn" data-bd="fehlende">Fehlende Beschreibungen ergänzen</button></p>` : ''}
    <div class="ds-info">
      <div class="m-box"><h4>Gesamtbild</h4>${o ? `<dl class="bd-dl"><dt>Hauptmotiv</dt><dd>${esc(o.main_subject)}</dd><dt>Bildaufbau</dt><dd>${esc(o.composition)}</dd><dt>Stimmung</dt><dd>${esc(o.mood)}</dd><dt>Stil</dt><dd>${esc(o.style)}</dd><dt>Licht</dt><dd>${esc(o.lighting)}</dd></dl>` : '<p class="muted">Noch nicht beschrieben.</p>'}</div>
      <div class="m-box"><h4>Farben des Bildes</h4><div class="bd-palette">${A.palette.map(c => `<div>${farbfeld(c)}<b>${c.hex}</b><span class="muted">${zahl(c.percent, 0)} %</span></div>`).join('')}</div>
        <p class="small muted" style="margin-top:10px">${A.image.width} × ${A.image.height} px, gemessen bei ${A.image.measured_width} × ${A.image.measured_height} px${A.vlm ? `, beschrieben von ${esc(A.vlm)}` : ''}.</p></div>
    </div>
    <div class="bd-tabelle"><table><thead><tr><th>Kachel</th><th>Farben</th><th>Helligkeit</th><th>Schärfe</th><th>Freiraum</th><th>Schrift</th><th>Inhalt</th></tr></thead><tbody>${A.grids[g].map(zeile).join('')}</tbody></table></div>`;
}
function viewVorschlag(a, A) {
  const z = Z(), v = vorschlag(a.id);
  if (!v) return `<div class="ds-empty"><h2>Wohin mit dem Text?</h2><p class="muted">Das Design-Modell (${esc(designName() || 'kein Modell')}) bekommt die Analyse und schlägt vor, wo Headline, Subline und CTA stehen. Die App prüft danach jede Stelle und jede Farbe: Text nur in Kacheln mit Freiraum, Schrift mit mindestens ${zahl(konfig(z.cfg).kontrast_min)} : 1 Kontrast.</p><button class="btn primary" data-bd="vorschlag">Design vorschlagen</button></div>`;
  const e = v.elements, p = v.palette, nach = Object.fromEntries(alleKacheln(A).map(k => [k.id, k]));
  const wo = id => `${id.replace(':', ' · ')} (${esc(nach[id] ? nach[id].label : '')})`;
  return `
    <div class="ds-toolbar">
      <span class="small muted">Vorschlag von ${esc(z.vorschlaege[a.id].modell)}</span><span class="spacer"></span>
      <button class="btn tiny" data-bd="vorschlag">Neu vorschlagen</button><button class="btn tiny" data-bd="html">HTML speichern</button><button class="btn tiny" data-bd="vjson">JSON speichern</button>
      <button class="btn tiny primary" data-bd="flyer">In den Flyer übernehmen</button>
    </div>
    <div class="bd-stage" id="bd-stage">${G.ansichtHTML(A, v, texte(), ui.assetURL[a.id])}</div>
    ${v.corrections.length ? `<div class="m-box warn"><h4>Von der App korrigiert</h4><ul class="mlist">${v.corrections.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    <div class="ds-info">
      <div class="m-box"><h4>Platzierung und Kontrast</h4>
        <table class="bd-mini"><tbody>
          <tr><th>Headline</th><td>${wo(e.headline.tile)}</td><td><span class="bd-probe" style="background:${nach[e.headline.tile].mean_color};color:${e.headline.color}">Aa</span> ${e.headline.color}</td><td>${zahl(e.headline.contrast)} : 1</td></tr>
          <tr><th>Subline</th><td>${wo(e.subline.tile)}</td><td><span class="bd-probe" style="background:${nach[e.subline.tile].mean_color};color:${e.subline.color}">Aa</span> ${e.subline.color}</td><td>${zahl(e.subline.contrast)} : 1</td></tr>
          <tr><th>CTA</th><td>${wo(e.cta.tile)}</td><td><span class="bd-probe" style="background:${e.cta.background};color:${e.cta.color}">Aa</span> ${e.cta.background}</td><td>${zahl(e.cta.contrast)} : 1</td></tr>
        </tbody></table>
        <p class="small muted" style="margin-top:8px">Kontrast = kleinster Wert gegenüber allen Farben unter dem Text. Mindestens ${zahl(v.min_contrast)} : 1.</p></div>
      <div class="m-box"><h4>Farbpalette</h4><div class="bd-palette">${[['Hintergrund', p.background], ['Fläche', p.surface], ['Akzent', p.accent], ['Schrift', p.text]].map(([n, h]) => `<div>${farbfeld({ hex: h })}<b>${h}</b><span class="muted">${n}</span></div>`).join('')}</div>
        ${v.reasoning ? `<h4 style="margin-top:14px">Begründung</h4><p>${esc(v.reasoning)}</p>` : ''}</div>
    </div>`;
}
function main() {
  const z = Z(), a = asset(), A = a && z.analysen[a.id];
  if (ui.busy) return `<p class="bd-fort" id="bd-fort" role="status">${esc(ui.busyText || '')}</p><div class="live" id="live">${liveInner()}</div>`;
  if (!a) return `<div class="ds-empty"><h2>Design für ein Bild</h2><p class="muted">Lade links ein Foto hoch. Die App misst, wo das Bild ruhig genug für Text ist, wo es unscharf wird und welche Farben es prägen. Daraus entsteht ein Vorschlag, wo Headline, Subline und CTA stehen.</p></div>`;
  if (!A) return `<div class="ds-empty bd-leer">${ui.assetURL[a.id] ? `<img src="${ui.assetURL[a.id]}" alt="">` : ''}<h2>${esc(a.name)}</h2><p class="muted">Die Analyse teilt das Bild in Raster, misst jede Kachel und lässt das Vision-Modell (${esc(vlmName() || 'kein Modell')}) beschreiben, was zu sehen ist.</p><button class="btn primary" data-bd="analyse">Bild analysieren</button></div>`;
  const tab = ['analyse', 'vorschlag', 'json'].includes(z.tab) ? z.tab : 'analyse';
  return `<div class="bd-tabs"><div class="seg2"><button data-bdtab="analyse" aria-pressed="${tab === 'analyse'}">Analyse</button><button data-bdtab="vorschlag" aria-pressed="${tab === 'vorschlag'}">Design-Vorschlag</button><button data-bdtab="json" aria-pressed="${tab === 'json'}">JSON</button></div></div>
    ${tab === 'analyse' ? viewAnalyse(a, A) : tab === 'vorschlag' ? viewVorschlag(a, A) : `<div class="ds-toolbar"><span class="small muted">Dieses JSON geht an das Design-Modell (dort ohne Pixel- und Messdetails).</span><span class="spacer"></span><button class="btn tiny" data-bd="kopieren">Kopieren</button><button class="btn tiny" data-bd="json">JSON speichern</button></div><pre class="bd-json">${esc(analyseJSON(A))}</pre>`}`;
}
/* Umschalter im Kopf des Studios */
const umschalter = () => `<div class="seg2 bd-modus" role="group" aria-label="Bereich"><button data-dsmodus="entwurf" aria-pressed="${designState().modus !== 'bild'}">Entwurf</button><button data-dsmodus="bild" aria-pressed="${designState().modus === 'bild'}">Bild-Design</button></div>`;

/* ---------- Ereignisse ---------- */
function klick(e) {
  if (S.screen !== 'design') return;
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.dsmodus) { if (ui.busy) return; designState().modus = d.dsmodus; ui.error = null; save(); return render(); }
  if (!an()) return;
  const z = Z(), a = asset();
  if (d.bdbild) { z.asset = d.bdbild; save(); return render(); }
  if (d.bdtab) { z.tab = d.bdtab; save(); return render(); }
  if (d.bdgrid) { z.grid = d.bdgrid; save(); return render(); }
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
    case 'alle': return ui.busy ? null : analysiere(bilder(), false);
    case 'fehlende': return a && !ui.busy ? analysiere([a], true) : null;
    case 'vorschlag': return ui.busy ? null : schlageVor();
    case 'json': return speichere(`${stamm(a)}-analyse.json`, analyseJSON(z.analysen[a.id]), 'application/json');
    case 'vjson': return speichere(`${stamm(a)}-design.json`, vorschlagJSON(a), 'application/json');
    case 'html': return speichere(`${stamm(a)}-design.html`, G.ansichtDatei(z.analysen[a.id], vorschlag(a.id), texte(), ui.assetURL[a.id]), 'text/html');
    case 'debugpng': return debugPNG(a);
    case 'kopieren': return navigator.clipboard.writeText(analyseJSON(z.analysen[a.id])).then(() => toast('JSON kopiert'), () => toast('Kopieren hat nicht geklappt'));
    case 'flyer': return uebernehmen();
  }
}
function wechsel(e) {
  if (!an()) return;
  const t = e.target, z = Z();
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
/* Texte links ändern: die Ansicht folgt sofort */
function eingabe(e) {
  if (!an() || !e.target.dataset || !/^texte\./.test(e.target.dataset.d || '')) return;
  const st = document.getElementById('bd-stage'), a = asset(), v = a && vorschlag(a.id);
  if (st && v) st.innerHTML = G.ansichtHTML(Z().analysen[a.id], v, texte(), ui.assetURL[a.id]);
}

/* ---------- Stile ---------- */
const CSS = `${G.ANSICHT_CSS}
.bd-modus{margin:-6px 0 18px}
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
.bd-zweit{margin-top:8px}
.bd-tabs{margin-bottom:12px}
.bd-fort{font-weight:600;margin:0 0 10px}
.bd-debug{border-radius:14px;overflow:hidden;background:var(--surface-2);line-height:0}
.bd-debug svg{width:100%;height:auto;display:block}
.bd-legende{display:flex;flex-wrap:wrap;gap:6px 18px;margin:10px 0 0;align-items:center}
.bd-legende span{display:inline-flex;align-items:center;gap:6px}
.bd-legende i{width:14px;height:14px;border-radius:3px;display:inline-block}
.bd-legende i.gruen{background:rgba(31,163,91,.6)}
.bd-legende i.rot{background:repeating-linear-gradient(45deg,rgba(215,54,43,.85) 0 3px,rgba(215,54,43,.4) 3px 7px)}
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

/* ---------- Start ---------- */
document.head.appendChild(Object.assign(document.createElement('style'), { id: 'bild-css', textContent: CSS }));
const app = document.getElementById('app');
app.addEventListener('click', klick);
app.addEventListener('change', wechsel);
app.addEventListener('input', eingabe);
window.BildDesign = { panel, main, umschalter, aktiv: an };
if (S.screen === 'design') render();
