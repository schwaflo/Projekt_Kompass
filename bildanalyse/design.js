/* ============================================================
   Bildanalyse – vom Analyse-JSON zum Design-Vorschlag
   Die KI wählt Kacheln, Ausrichtung und Farben. Dieses Modul
   gibt ihr nur zulässige Antworten vor und prüft danach jede
   Angabe nach: Text steht nur in Freiraum-Kacheln, jede
   Schriftfarbe erreicht den Mindestkontrast. Dazu die Ausgaben:
   Debug-Vorschau (SVG) und die HTML/CSS-Ansicht.
   Alles ohne Browser lauffähig.
   ============================================================ */
import { STANDARD, konfig, alleKacheln, istHex, hexNorm, hexZuRgb, kontrast, kleinsterKontrast, mische } from './kern.js';

export const ROLLEN = ['headline', 'subline', 'cta'];
export const ROLLEN_NAME = { headline: 'Headline', subline: 'Subline', cta: 'CTA' };
const AUSRICHTUNG = ['links', 'mitte', 'rechts'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const runde = (n, st = 2) => { const f = 10 ** st; return Math.round(n * f) / f; };

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
- composition: der Bildaufbau (wo liegt das Motiv, wo ist ruhige Fläche, Linien, Tiefe)
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

/* ---------- Auswahl für die KI ---------- */
/* Kacheln, in die Text darf. Gibt es keine einzige, bleiben die drei ruhigsten als Notlösung;
   der Text bekommt dann eine Fläche als Unterlage. */
export function kandidaten(analyse) {
  const alle = alleKacheln(analyse), frei = alle.filter(k => k.text_space);
  if (frei.length) return { notfall: false, kacheln: frei };
  return { notfall: true, kacheln: alle.slice().sort((a, b) => b.text_space_score - a.text_space_score).slice(0, 3) };
}
export function designSchema(analyse) {
  const ids = kandidaten(analyse).kacheln.map(k => k.id), farben = (analyse.palette || []).map(c => c.hex);
  const platz = { type: 'string', enum: ids }, ausr = { type: 'string', enum: AUSRICHTUNG }, pal = farben.length ? { type: 'string', enum: farben } : S;
  const text = { type: 'object', properties: { tile: platz, align: ausr, color: S }, required: ['tile', 'align', 'color'] };
  return {
    type: 'object',
    properties: {
      headline: text, subline: text,
      cta: { type: 'object', properties: { tile: platz, align: ausr, background: pal }, required: ['tile', 'align', 'background'] },
      palette: { type: 'object', properties: { background: pal, surface: pal, accent: pal }, required: ['background', 'surface', 'accent'] },
      reasoning: S
    },
    required: ['headline', 'subline', 'cta', 'palette', 'reasoning']
  };
}
/* Das Analyse-JSON in knapper Form: Pixelwerte und Messdetails braucht die KI nicht */
export function kompakt(analyse) {
  const k = x => x.text_space
    ? { id: x.id, lage: x.label, text_space: true, score: x.text_space_score, farben: x.colors.map(c => `${c.hex} ${Math.round(c.percent)}%`), helligkeit: Math.round(x.brightness), textfarbe: x.text_tone, schaerfe: x.sharpness.label, inhalt: x.description || undefined }
    : { id: x.id, lage: x.label, text_space: false, schaerfe: x.sharpness.label, inhalt: x.description || undefined };
  return { overall: analyse.overall || undefined, palette: (analyse.palette || []).map(c => `${c.hex} ${Math.round(c.percent)}%`), grids: Object.fromEntries(Object.entries(analyse.grids).map(([g, l]) => [g, l.map(k)])) };
}
export const DESIGN_SYSTEM = 'Du bist Art Director und setzt Text auf ein Bild. Du arbeitest nur mit den Messwerten und Beschreibungen, die du bekommst. Antworte ausschließlich mit JSON, Begründungen auf Deutsch.';
export function designPrompt(analyse, texte = {}) {
  const kd = kandidaten(analyse);
  return `BILDANALYSE (JSON). Das Bild wurde in Raster geteilt; „4x2“ heißt 4 Spalten und 2 Zeilen. Die id „4x2:r1c3“ meint Zeile 1, Spalte 3 in diesem Raster.
${JSON.stringify(kompakt(analyse))}

TEXTE, DIE AUFS BILD SOLLEN:
Headline: ${texte.headline || '(noch offen)'}
Subline: ${texte.subline || '(noch offen)'}
CTA (Knopf): ${texte.cta || '(noch offen)'}

AUFGABE: Lege fest, wo Headline, Subline und CTA stehen.
- tile: nur eine dieser Kacheln${kd.notfall ? ' (das Bild hat keinen echten Freiraum, dies sind die ruhigsten Stellen)' : ' mit text_space = true'}: ${kd.kacheln.map(k => k.id).join(', ')}. Das Hauptmotiv bleibt frei. Bevorzuge Kacheln mit hohem score. Die Headline braucht die größte ruhige Fläche; Subline und CTA stehen in derselben oder einer direkt benachbarten Kachel, damit die drei als Gruppe lesbar sind. Lange Texte brauchen ein grobes Raster (große Kachel).
- align: links, mitte oder rechts, passend zur Lage der Kachel und zum Bildaufbau.
- color: Schriftfarbe als Hex-Code mit deutlichem Kontrast zu den Farben der Kachel (bei „textfarbe: hell“ eine helle, bei „dunkel“ eine dunkle Farbe).
- cta.background: die Farbe aus der palette des Bildes, die als Knopf am stärksten auffällt und sich vom Hintergrund der Kachel abhebt.
- palette: wähle aus der palette des Bildes background (prägende Grundfarbe), surface (ruhige Fläche für Kästen) und accent (Signalfarbe).
- reasoning: Begründung in 2–3 Sätzen: warum diese Stellen, warum diese Farben.`;
}

/* ---------- Vorschlag prüfen und festschreiben ---------- */
const prozent = (analyse, k) => ({ x: k.x / analyse.image.width * 100, y: k.y / analyse.image.height * 100, w: k.width / analyse.image.width * 100, h: k.height / analyse.image.height * 100 });
const schneiden = (a, b) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
const saettigung = hex => { const [r, g, b] = hexZuRgb(hex), mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
const DECKKRAFT = 0.88;

/* Macht aus der Antwort der KI einen Vorschlag, der die Regeln sicher einhält. Was geändert
   werden musste, steht in „korrekturen“. Läuft auch ganz ohne Antwort (roh = {}). */
export function pruefeVorschlag(analyse, roh = {}, eigene = null) {
  const cfg = eigene ? konfig(eigene) : konfig(analyse.config || {});
  const alle = alleKacheln(analyse), nachId = Object.fromEntries(alle.map(k => [k.id, k]));
  const kd = kandidaten(analyse), erlaubt = new Set(kd.kacheln.map(k => k.id));
  const korrekturen = [];
  if (kd.notfall) korrekturen.push('Das Bild hat nach den Schwellwerten keinen Freiraum für Text. Der Text steht an der ruhigsten Stelle auf einer Fläche.');
  const flaeche = k => k.width * k.height * k.text_space_score;
  const beste = kd.kacheln.slice().sort((a, b) => flaeche(b) - flaeche(a))[0];

  /* 1. Jede Rolle bekommt eine zulässige Kachel */
  const wahl = {};
  ROLLEN.forEach((rolle, i) => {
    const r = roh[rolle] || {}, id = String(r.tile || '');
    let k = erlaubt.has(id) ? nachId[id] : null;
    if (!k) {
      k = i ? wahl[ROLLEN[0]].kachel : beste;
      if (id) korrekturen.push(`${ROLLEN_NAME[rolle]}: Die Kachel „${id}“ ${nachId[id] ? 'hat keinen Freiraum für Text' : 'gibt es nicht'}. Verschoben nach „${k.id}“ (${k.label}).`);
    }
    wahl[rolle] = { kachel: k, align: AUSRICHTUNG.includes(r.align) ? r.align : 'links', roh: r };
  });

  /* 2. Gruppen: Liegen zwei Kacheln übereinander (grobes und feines Raster), stehen die Texte zusammen */
  const gruppen = [];
  for (const rolle of ROLLEN) {
    const w = wahl[rolle], r = prozent(analyse, w.kachel);
    const g = gruppen.find(x => schneiden(x.rect, r));
    if (g) g.rollen.push(rolle);
    else gruppen.push({ kachel: w.kachel, rect: r, align: w.align, rollen: [rolle], kacheln: [w.kachel] });
  }

  /* 3. Breite: in der eigenen Zeile über benachbarte Freiraum-Kacheln wachsen, in Leserichtung der Ausrichtung */
  const waechst = (g, richtung) => {
    for (let c = g.kachel.col + richtung; ; c += richtung) {
      const n = nachId[`${g.kachel.grid}:r${g.kachel.row}c${c}`];
      if (!n || !n.text_space) break;
      const r = prozent(analyse, n);
      if (gruppen.some(x => x !== g && schneiden(x.rect, r))) break;
      g.kacheln.push(n);
    }
  };
  const umriss = g => {
    const rs = g.kacheln.map(k => prozent(analyse, k)), x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y));
    return { x, y, w: Math.max(...rs.map(r => r.x + r.w)) - x, h: Math.max(...rs.map(r => r.y + r.h)) - y };
  };
  for (const g of gruppen) {
    if (kd.notfall) continue;
    if (g.align !== 'rechts') waechst(g, 1);
    if (g.align !== 'links') waechst(g, -1);
    g.rect = umriss(g);   /* die nächste Gruppe darf nicht in diese Fläche hineinwachsen */
  }

  /* 4. Farben: Kontrast gegen alle Farben unter dem Text */
  const elemente = {};
  for (const g of gruppen) {
    const grund = () => g.kacheln.flatMap(k => k.colors);
    const besteTextfarbe = () => { const h = kleinsterKontrast(cfg.text_hell, grund()), d = kleinsterKontrast(cfg.text_dunkel, grund()); return h >= d ? [cfg.text_hell, h] : [cfg.text_dunkel, d]; };
    /* Erreicht keine Farbe den Kontrast über die ganze Breite, bleibt der Text in seiner Kachel */
    if (g.kacheln.length > 1 && besteTextfarbe()[1] < cfg.kontrast_min) g.kacheln = [g.kachel];
    let [sicher, sicherK] = besteTextfarbe();
    g.panel = null;
    if (sicherK < cfg.kontrast_min || kd.notfall) {
      /* Unterlage: dunkle oder helle Fläche, je nachdem, was näher am Bild liegt */
      const dunkel = g.kachel.brightness < 140, farbe = dunkel ? cfg.text_dunkel : cfg.text_hell;
      g.panel = { color: farbe, opacity: DECKKRAFT };
      sicher = dunkel ? cfg.text_hell : cfg.text_dunkel;
      sicherK = Math.min(...grund().map(c => kontrast(sicher, mische(farbe, c.hex, DECKKRAFT))));
      if (!kd.notfall) korrekturen.push(`In „${g.kachel.id}“ erreicht weder helle noch dunkle Schrift den Kontrast ${cfg.kontrast_min}:1. Der Text steht deshalb auf einer Fläche.`);
    }
    const hinterText = () => g.panel ? grund().map(c => ({ hex: mische(g.panel.color, c.hex, DECKKRAFT), percent: c.percent })) : grund();
    g.rect = umriss(g);
    g.valign = g.rect.y < 1 && g.rect.y + g.rect.h < 99 ? 'oben' : g.rect.y + g.rect.h > 99 && g.rect.y > 1 ? 'unten' : 'mitte';
    for (const rolle of g.rollen) {
      const r = wahl[rolle].roh;
      if (rolle === 'cta') {
        /* Knopf: Fläche hebt sich vom Bild ab, Schrift ist auf dem Knopf lesbar */
        const absetzen = hex => Math.min(...hinterText().filter((c, i) => i === 0 || c.percent >= 10).map(c => kontrast(hex, c.hex)));
        let bg = istHex(r.background) ? hexNorm(r.background) : '';
        if (!bg || absetzen(bg) < cfg.kontrast_flaeche_min) {
          const alt = (analyse.palette || []).map(c => c.hex).filter(h => absetzen(h) >= cfg.kontrast_flaeche_min).sort((a, b) => saettigung(b) - saettigung(a))[0] || sicher;
          if (bg) korrekturen.push(`CTA: Die Knopffarbe ${bg} hebt sich zu wenig vom Bild ab (${runde(absetzen(bg), 1)}:1). Ersetzt durch ${alt}.`);
          bg = alt;
        }
        const h = kontrast(cfg.text_hell, bg), d = kontrast(cfg.text_dunkel, bg);
        elemente.cta = { tile: g.kachel.id, background: bg, background_contrast: runde(absetzen(bg)), color: h >= d ? cfg.text_hell : cfg.text_dunkel, contrast: runde(Math.max(h, d)) };
      } else {
        let farbe = istHex(r.color) ? hexNorm(r.color) : '', k = farbe ? kleinsterKontrast(farbe, hinterText()) : 0;
        if (k < cfg.kontrast_min) {
          if (farbe) korrekturen.push(`${ROLLEN_NAME[rolle]}: Die Schriftfarbe ${farbe} erreicht nur ${runde(k, 1)}:1 statt ${cfg.kontrast_min}:1. Ersetzt durch ${sicher}.`);
          farbe = sicher; k = sicherK;
        }
        elemente[rolle] = { tile: g.kachel.id, color: farbe, contrast: runde(k) };
      }
    }
  }

  /* 5. Palette: nur Farben, die im Bild gemessen wurden */
  const gemessen = (analyse.palette || []).map(c => c.hex), p = roh.palette || {};
  const aus = (wert, ersatz) => istHex(wert) && gemessen.includes(hexNorm(wert)) ? hexNorm(wert) : ersatz;
  const bunt = gemessen.slice().sort((a, b) => saettigung(b) - saettigung(a))[0];
  const background = aus(p.background, gemessen[0] || '#FFFFFF');
  const palette = {
    background,
    surface: aus(p.surface, gemessen.find(h => h !== background) || background),
    accent: aus(p.accent, bunt || background),
    text: kontrast(cfg.text_hell, background) >= kontrast(cfg.text_dunkel, background) ? cfg.text_hell : cfg.text_dunkel
  };

  return {
    elements: elemente,
    groups: gruppen.map(g => ({ tile: g.kachel.id, tiles: g.kacheln.map(k => k.id), x: runde(g.rect.x), y: runde(g.rect.y), width: runde(g.rect.w), height: runde(g.rect.h), align: g.align, valign: g.valign, panel: g.panel, roles: g.rollen })),
    palette,
    reasoning: String(roh.reasoning || '').trim(),
    corrections: korrekturen,
    emergency: kd.notfall,
    min_contrast: cfg.kontrast_min
  };
}

/* ---------- HTML/CSS-Ansicht ---------- */
/* Schriftgrößen in cqw: Prozent der Bildbreite, damit die Ansicht in jeder Größe gleich aussieht */
export function schriftgroessen(gruppe, texte, analyse) {
  const verh = analyse.image.height / analyse.image.width;
  const b = gruppe.width * 0.86, h = gruppe.height * verh * 0.86;   /* nutzbare Fläche in Prozent der Bildbreite */
  const head = String(texte.headline || ''), zeichen = Math.max(6, head.length), wort = Math.max(4, ...head.split(/\s+/).map(w => w.length));
  const anteil = gruppe.roles.includes('headline') ? (gruppe.roles.length > 1 ? 0.5 : 0.85) : 0;
  let hl = Math.sqrt(b * h * anteil / (zeichen * 0.66));
  hl = Math.max(2.2, Math.min(hl, 11, b / (wort * 0.6)));
  const basis = gruppe.roles.includes('headline') ? hl : Math.max(3, Math.min(6, b / 8));
  return { headline: runde(hl), subline: runde(Math.max(1.5, Math.min(3.4, basis * 0.4))), cta: runde(Math.max(1.4, Math.min(2.6, basis * 0.34))) };
}
export const ANSICHT_CSS = `.bd-ansicht{position:relative;width:100%;container-type:inline-size;background-size:100% 100%;background-repeat:no-repeat;overflow:hidden;font-family:"Familjen Grotesk","IBM Plex Sans",ui-sans-serif,system-ui,sans-serif}
.bd-gruppe{position:absolute;display:flex;box-sizing:border-box;padding:3cqw}
.bd-gruppe.h-links{justify-content:flex-start;text-align:left}.bd-gruppe.h-mitte{justify-content:center;text-align:center}.bd-gruppe.h-rechts{justify-content:flex-end;text-align:right}
.bd-gruppe.v-oben{align-items:flex-start}.bd-gruppe.v-mitte{align-items:center}.bd-gruppe.v-unten{align-items:flex-end}
.bd-stapel{display:flex;flex-direction:column;gap:1.2cqw;max-width:100%;min-width:0}
.bd-gruppe.h-links .bd-stapel{align-items:flex-start}.bd-gruppe.h-mitte .bd-stapel{align-items:center}.bd-gruppe.h-rechts .bd-stapel{align-items:flex-end}
.bd-stapel.flaeche{padding:2cqw 2.4cqw;border-radius:1cqw}
.bd-headline{margin:0;font-weight:700;line-height:1.08;letter-spacing:-.01em;overflow-wrap:break-word;text-wrap:balance}
.bd-subline{margin:0;font-weight:500;line-height:1.3;text-wrap:pretty}
.bd-cta{display:inline-block;font-weight:600;line-height:1;padding:.75em 1.3em;border-radius:99em;text-decoration:none;white-space:nowrap}`;
/* Die Ansicht selbst: Bild als Hintergrund, Texte an den vorgeschlagenen Stellen */
export function ansichtHTML(analyse, vorschlag, texte = {}, bildURL = '') {
  const t = { headline: texte.headline || 'Headline', subline: texte.subline || 'Subline', cta: texte.cta || 'Mehr erfahren' };
  const e = vorschlag.elements;
  const gruppen = vorschlag.groups.map(g => {
    const gr = schriftgroessen(g, t, analyse);
    const teil = rolle => rolle === 'headline' ? `<h1 class="bd-headline" data-rolle="headline" style="color:${e.headline.color};font-size:${gr.headline}cqw">${esc(t.headline)}</h1>`
      : rolle === 'subline' ? `<p class="bd-subline" data-rolle="subline" style="color:${e.subline.color};font-size:${gr.subline}cqw">${esc(t.subline)}</p>`
      : `<a class="bd-cta" data-rolle="cta" style="background:${e.cta.background};color:${e.cta.color};font-size:${gr.cta}cqw">${esc(t.cta)}</a>`;
    const fl = g.panel ? ` flaeche" style="background:rgba(${hexZuRgb(g.panel.color).join(',')},${g.panel.opacity})` : '';
    return `<div class="bd-gruppe h-${g.align} v-${g.valign}" data-kachel="${g.tile}" style="left:${g.x}%;top:${g.y}%;width:${g.width}%;height:${g.height}%"><div class="bd-stapel${fl}">${g.roles.map(teil).join('')}</div></div>`;
  }).join('');
  return `<div class="bd-ansicht" style="aspect-ratio:${analyse.image.width}/${analyse.image.height};${bildURL ? `background-image:url('${bildURL}')` : `background-color:${vorschlag.palette.background}`}">${gruppen}</div>`;
}
/* Eigenständige HTML-Datei zum Speichern */
export function ansichtDatei(analyse, vorschlag, texte, bildURL) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(texte.headline || analyse.image.name || 'Design-Vorschlag')}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:${vorschlag.palette.background}}
main{width:min(100vw,calc(100vh * ${analyse.image.width} / ${analyse.image.height}))}
${ANSICHT_CSS}
</style>
</head>
<body>
<main>${ansichtHTML(analyse, vorschlag, texte, bildURL)}</main>
</body>
</html>
`;
}

/* ---------- Debug-Vorschau ---------- */
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
    const zeilen = [`r${k.row}c${k.col}`, k.text_space ? `Text ${String(k.text_space_score).replace('.', ',')}` : '', rot ? k.sharpness.label : ''].filter(Boolean);
    teile.push(`<text x="${k.x + fs * 0.5}" y="${k.y + fs * 1.3}" font-size="${fs}" font-family="ui-monospace,Menlo,monospace" font-weight="600" fill="#fff" stroke="#000" stroke-opacity=".7" stroke-width="${fs / 5}" paint-order="stroke">${zeilen.map((z, i) => `<tspan x="${k.x + fs * 0.5}" dy="${i ? fs * 1.25 : 0}">${esc(z)}</tspan>`).join('')}</text>`);
    return teile.join('');
  };
  const linien = liste.map(k => `<rect x="${k.x}" y="${k.y}" width="${k.width}" height="${k.height}" fill="none"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Debug-Vorschau Raster ${esc(grid)}">
<defs>
<pattern id="bd-rot" width="${sw * 7}" height="${sw * 7}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${sw * 7}" height="${sw * 7}" fill="#D7362B" fill-opacity=".38"/><rect width="${sw * 2.5}" height="${sw * 7}" fill="#D7362B" fill-opacity=".75"/></pattern>
<pattern id="bd-rot2" width="${sw * 7}" height="${sw * 7}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${sw * 7}" height="${sw * 7}" fill="#D7362B" fill-opacity=".14"/><rect width="${sw * 1.6}" height="${sw * 7}" fill="#D7362B" fill-opacity=".55"/></pattern>
</defs>
${bildURL ? `<image href="${bildURL}" width="${W}" height="${H}" preserveAspectRatio="none"/>` : `<rect width="${W}" height="${H}" fill="#888"/>`}
${liste.map(kachel).join('\n')}
<g stroke="#000" stroke-opacity=".55" stroke-width="${sw * 2.2}">${linien}</g>
<g stroke="#fff" stroke-width="${sw}">${linien}</g>
</svg>`;
}

/* Kurze Zusammenfassung für die Oberfläche */
export function zusammenfassung(analyse) {
  const alle = alleKacheln(analyse);
  return { kacheln: alle.length, frei: alle.filter(k => k.text_space).length, unscharf: alle.filter(k => k.sharpness.reliable && k.sharpness.label !== 'scharf').length, beschrieben: alle.filter(k => k.description).length };
}
export { STANDARD };
