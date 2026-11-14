/* ============================================================
   Bildanalyse – freies Layout
   Hier entscheidet die KI selbst: Sie sieht das Foto und setzt
   Texte, Flächen und Linien frei aufs Bild (Position, Größe,
   Drehung, Farbe). Es gibt kein Raster und keine Regel, die die
   App durchsetzt. Die App
   - bringt die Antwort nur in eine zeichenbare Form,
   - zeichnet sie,
   - misst nach (Kontrast, Lage zum Motiv, Anschnitt) und gibt
     das als Rückmeldung für die nächste Fassung mit.
   Alles ohne Browser lauffähig.
   ============================================================ */
import { istHex, hexNorm, hexZuRgb, kontrast, mische } from './kern.js';
import { breiteEm } from './design.js';

const S = { type: 'string' }, I = { type: 'integer' }, B = { type: 'boolean' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const runde = (n, st = 2) => { const f = 10 ** st; return Math.round(n * f) / f; };
const zahl = (n, a, b, vorgabe) => { const x = Number(n); return isFinite(x) ? Math.max(a, Math.min(b, x)) : vorgabe; };
const GEWICHT = { normal: 500, halbfett: 600, fett: 700 };
const AUSRICHTUNG = ['links', 'mitte', 'rechts'];
const FORMEN = ['rechteck', 'kreis', 'linie'];

/* ---------- Antwortformat ---------- */
const TEXT_ITEM = {
  type: 'object',
  properties: { text: S, x: I, y: I, groesse: { type: 'number' }, breite: I, farbe: S, gewicht: { type: 'string', enum: Object.keys(GEWICHT) }, versal: B, ausrichtung: { type: 'string', enum: AUSRICHTUNG }, drehung: I },
  required: ['text', 'x', 'y', 'groesse', 'breite', 'farbe', 'gewicht', 'versal', 'ausrichtung', 'drehung']
};
const FORM_ITEM = {
  type: 'object',
  properties: { art: { type: 'string', enum: FORMEN }, x: I, y: I, breite: I, hoehe: I, farbe: S, deckkraft: I, gefuellt: B, staerke: { type: 'number' }, drehung: I },
  required: ['art', 'x', 'y', 'breite', 'hoehe', 'farbe', 'deckkraft', 'gefuellt', 'staerke', 'drehung']
};
const SKIZZE = { type: 'object', properties: { name: S, idee: S, formen: { type: 'array', items: FORM_ITEM }, texte: { type: 'array', items: TEXT_ITEM } }, required: ['name', 'idee', 'formen', 'texte'] };
export const freiSchema = anzahl => ({ type: 'object', properties: { skizzen: { type: 'array', minItems: anzahl, maxItems: anzahl, items: SKIZZE } }, required: ['skizzen'] });
export const FREI_EINZEL_SCHEMA = SKIZZE;

/* ---------- Prompts ---------- */
export const FREI_SYSTEM = 'Du bist ein eigenständiger Grafikdesigner mit starker Handschrift. Du siehst das Foto und gestaltest frei: Du entscheidest selbst, was gut aussieht. Antworte ausschließlich mit JSON, Namen und Ideen auf Deutsch.';
const FORMAT = `SO BESCHREIBST DU EIN LAYOUT
Koordinaten in Prozent: x von 0 (linker Bildrand) bis 100 (rechter), y von 0 (oben) bis 100 (unten). Werte unter 0 oder über 100 schneiden etwas am Rand an; das ist erlaubt.
texte: jedes Element ist ein eigener Textbaustein.
- text: der Wortlaut. Zeilenumbruch mit \\n.
- x, y: der Ankerpunkt an der Oberkante. Bei ausrichtung "links" ist x die linke Kante, bei "mitte" die Mitte, bei "rechts" die rechte Kante.
- groesse: Schriftgröße in Prozent der Bildbreite. Zur Orientierung: 1,6 ist Kleingedrucktes, 2,5 Lesetext, 5 eine kräftige Überschrift, 10 plakativ, 18 riesig.
- breite: höchste Zeilenbreite in Prozent der Bildbreite, danach bricht der Text um. 0 = kein automatischer Umbruch.
- farbe: Hex-Code. gewicht: normal, halbfett oder fett. versal: Großbuchstaben.
- drehung: Grad im Uhrzeigersinn um den Ankerpunkt, -90 liest sich von unten nach oben.
- Beispiele: Ein Wort mittig im Bild hat ausrichtung "mitte" und x 50. Ein Text am rechten Rand hat ausrichtung "rechts" und x 94. Bei gedrehtem Text zählt breite entlang der Leserichtung; für eine einzelne senkrechte Zeile nimm breite 0.
formen: Flächen und Linien, sie liegen unter den Texten, in der Reihenfolge der Liste.
- art "rechteck" oder "kreis": x, y ist die linke obere Ecke, breite in Prozent der Bildbreite, hoehe in Prozent der Bildhöhe (beim Kreis zählt nur die breite). gefuellt true = Fläche, false = nur Umriss mit staerke.
- art "linie": von (x, y) nach (x + breite, y + hoehe); breite und hoehe dürfen negativ sein.
- farbe: Hex-Code. deckkraft: 0 bis 100. staerke: Strichstärke in Promille der Bildbreite (2 = fein, 8 = kräftig). drehung: Grad.`;
/* Die Freiraum-Karte als Zeichenbild: . = ruhig, # = Motiv oder unruhig */
export function kartenText(analyse) {
  const m = analyse.free_map, z = [];
  for (let y = 0; y < m.rows; y++) z.push(m.free.slice(y * m.cols, (y + 1) * m.cols).map(f => (f ? '.' : '#')).join(''));
  return z.join('\n');
}
const bildInfo = (analyse, texte) => `FARBEN IM FOTO (Hex, Anteil): ${(analyse.palette || []).map(c => `${c.hex} ${Math.round(c.percent)} %`).join(', ')}
RUHIGE UND UNRUHIGE STELLEN (von der App gemessen, nur als Hinweis; ${analyse.free_map.cols} Spalten × ${analyse.free_map.rows} Zeilen über das ganze Bild, . = ruhig, # = Motiv oder unruhig):
${kartenText(analyse)}

INHALT, DER AUFS BILD SOLL
Headline: ${texte.headline || '(offen)'}
Unterzeile: ${texte.subline || '(keine)'}
Aufruf: ${texte.cta || '(keiner)'}
${texte.datum ? `Datum oder Nummer: ${texte.datum}` : ''}`;
export function freiPrompt(analyse, texte, anzahl = 4) {
  return `Du siehst das Foto. Gestalte ${anzahl} Entwürfe, die Text auf dieses Foto setzen, so wie du es als Designer gut findest.

${bildInfo(analyse, texte)}

${FORMAT}

DEINE FREIHEIT
- Es gibt keine Vorgaben zu Raster, Rand, Größe oder Zahl der Elemente. Du entscheidest.
- Du darfst die Headline auf mehrere Bausteine verteilen, Wörter unterschiedlich groß setzen, stapeln, drehen, anschneiden, über das Motiv legen oder ihm ausweichen.
- Flächen und Linien nur, wenn sie dem Entwurf etwas geben. Farben frei, aus dem Foto oder bewusst dagegen.
- Verwende den Inhalt oben wörtlich (Aufteilen und Umbrechen ist erlaubt), erfinde keine neuen Aussagen. Unterzeile, Aufruf und Datum dürfen in einem Entwurf fehlen, wenn er dadurch stärker wird.
- Die ${anzahl} Entwürfe sollen sich deutlich unterscheiden: nicht viermal dieselbe Idee.

Für jeden Entwurf: name (2–4 Wörter) und idee (ein Satz: Was siehst du im Foto, und was machst du daraus?).`;
}
/* Rückmeldung in Worten: was die App an einer Skizze gemessen hat */
export function messungText(m) {
  const z = m.texte.map(t => `- „${t.text}“: Kontrast zum Untergrund ${String(t.kontrast).replace('.', ',')} : 1${t.kontrast < 3 ? ' (kaum lesbar)' : t.kontrast < 4.5 ? ' (schwach)' : ''}${t.ueberMotiv >= 0.3 ? `, liegt zu ${Math.round(t.ueberMotiv * 100)} % über dem Motiv` : ''}${t.ausserhalb >= 0.15 ? `, ${Math.round(t.ausserhalb * 100)} % ragen aus dem Bild` : ''}${t.groesse < 1.5 ? ', sehr klein' : ''}`);
  if (m.ueberlappungen.length) z.push(...m.ueberlappungen.map(([a, b]) => `- „${a}“ und „${b}“ überdecken sich`));
  return z.join('\n');
}
/* Eine Skizze überarbeiten: Die KI sieht ihre gezeichnete Skizze, die Kritik und die Messwerte.
   wunsch: was die Person ändern möchte (hat Vorrang). */
export function ueberarbeitePrompt(analyse, texte, skizze, { wertung = null, messung = null, wunsch = '' } = {}) {
  return `Du siehst deinen Entwurf „${skizze.name}“ als Bild: das Foto mit deinem Text darauf.

DEIN LAYOUT (JSON)
${JSON.stringify({ name: skizze.name, idee: skizze.idee, formen: skizze.layout.formen, texte: skizze.layout.texte })}

${wertung ? `KRITIK EINES ART DIRECTORS\nLesbarkeit ${wertung.lesbarkeit} von 5, Bezug zum Motiv ${wertung.motiv} von 5, Spannung ${wertung.spannung} von 5.\n${wertung.urteil}\nVorschlag: ${wertung.verbessern}\n` : ''}${messung ? `MESSWERTE DER APP (Hinweise, keine Regeln)\n${messungText(messung) || '- nichts Auffälliges'}\n` : ''}${wunsch ? `WUNSCH DER PERSON (hat Vorrang)\n${wunsch}\n` : ''}
${bildInfo(analyse, texte)}

${FORMAT}

AUFGABE: Überarbeite den Entwurf${wunsch ? ' nach dem Wunsch' : ''}. Sieh dir das Bild genau an, entscheide selbst, was du von Kritik und Messwerten übernimmst, und verändere mutig, was nicht funktioniert: Positionen, Größen, Farben, Umbrüche, Flächen. Behalte, was gut ist. Gib das vollständige Layout zurück, mit name und idee (ein Satz dazu, was du geändert hast und warum).`;
}

/* ---------- Antwort in eine zeichenbare Form bringen ---------- */
const farbe = (h, ersatz) => (istHex(h) ? hexNorm(h) : ersatz);
export function leseLayout(roh = {}) {
  const texte = (Array.isArray(roh.texte) ? roh.texte : []).filter(t => t && String(t.text || '').trim()).slice(0, 10).map(t => ({
    text: String(t.text).replace(/\\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, 200),
    x: runde(zahl(t.x, -40, 140, 8), 1), y: runde(zahl(t.y, -40, 140, 8), 1),
    groesse: runde(zahl(t.groesse, 0.8, 40, 4), 2), breite: runde(zahl(t.breite, 0, 160, 0), 1),
    farbe: farbe(t.farbe, '#FFFFFF'), gewicht: GEWICHT[t.gewicht] ? t.gewicht : 'fett', versal: t.versal === true,
    ausrichtung: AUSRICHTUNG.includes(t.ausrichtung) ? t.ausrichtung : 'links', drehung: Math.round(zahl(t.drehung, -180, 180, 0))
  }));
  const formen = (Array.isArray(roh.formen) ? roh.formen : []).filter(f => f && FORMEN.includes(f.art)).slice(0, 10).map(f => ({
    art: f.art, x: runde(zahl(f.x, -60, 160, 0), 1), y: runde(zahl(f.y, -60, 160, 0), 1),
    breite: runde(zahl(f.breite, -200, 260, 20), 1), hoehe: runde(zahl(f.hoehe, -200, 260, 20), 1),
    farbe: farbe(f.farbe, '#FFFFFF'), deckkraft: Math.round(zahl(f.deckkraft, 0, 100, 100)), gefuellt: f.gefuellt !== false,
    staerke: runde(zahl(f.staerke, 0.5, 40, 2), 1), drehung: Math.round(zahl(f.drehung, -180, 180, 0))
  }));
  return { formen, texte };
}
const kurz = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);
export function leseFrei(antwort = {}) {
  const liste = Array.isArray(antwort.skizzen) ? antwort.skizzen : antwort.texte ? [antwort] : [];
  return liste.filter(s => s && typeof s === 'object').map(s => ({ name: kurz(s.name, 40) || 'Freier Entwurf', idee: kurz(s.idee, 260), frei: true, quelle: 'ki', layout: leseLayout(s) })).filter(s => s.layout.texte.length);
}

/* ---------- Darstellung ---------- */
export const FREI_CSS = `.bf-form,.bf-text{position:absolute;box-sizing:border-box}
.bf-text{margin:0;line-height:1.08;white-space:pre-line;letter-spacing:-.01em}
.bf-text.versal{text-transform:uppercase;letter-spacing:.04em}
.bf-linien{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}`;
const rgba = (h, d) => `rgba(${hexZuRgb(h).join(',')},${runde(d / 100)})`;
const URSPRUNG = { links: 'left top', mitte: 'center top', rechts: 'right top' }, SCHUB = { links: '', mitte: 'translateX(-50%) ', rechts: 'translateX(-100%) ' };
/* Foto mit dem freien Layout. bearbeiten: Elemente bekommen Kennungen zum Anfassen. */
export function freiHTML(analyse, layout, bildURL = '', { bearbeiten = false, gewaehlt = '' } = {}) {
  const W = analyse.image.width, H = analyse.image.height, k = (art, i) => (bearbeiten ? ` data-bf="${art}.${i}"${gewaehlt === `${art}.${i}` ? ' data-an="1"' : ''}` : '');
  const linien = [], flaechen = [];
  layout.formen.forEach((f, i) => {
    if (f.art === 'linie') return linien.push(`<line${k('formen', i)} x1="${runde(f.x * W / 100, 1)}" y1="${runde(f.y * H / 100, 1)}" x2="${runde((f.x + f.breite) * W / 100, 1)}" y2="${runde((f.y + f.hoehe) * H / 100, 1)}" stroke="${f.farbe}" stroke-opacity="${runde(f.deckkraft / 100)}" stroke-width="${runde(f.staerke * W / 1000, 1)}"${bearbeiten ? ' style="pointer-events:stroke"' : ''}/>`);
    const mass = f.art === 'kreis' ? `width:${f.breite}cqw;height:${f.breite}cqw;border-radius:50%` : `width:${f.breite}%;height:${f.hoehe}%`;
    flaechen.push(`<i class="bf-form"${k('formen', i)} style="left:${f.x}%;top:${f.y}%;${mass};${f.gefuellt ? `background:${rgba(f.farbe, f.deckkraft)}` : `border:${runde(f.staerke / 10)}cqw solid ${rgba(f.farbe, f.deckkraft)}`}${f.drehung ? `;transform:rotate(${f.drehung}deg)` : ''}"></i>`);
  });
  const texte = layout.texte.map((t, i) => `<p class="bf-text${t.versal ? ' versal' : ''}"${k('texte', i)} style="left:${t.x}%;top:${t.y}%;font-size:${t.groesse}cqw;font-weight:${GEWICHT[t.gewicht]};color:${t.farbe};text-align:${{ links: 'left', mitte: 'center', rechts: 'right' }[t.ausrichtung]};${t.breite ? `width:${t.breite}cqw;` : 'white-space:pre;'}transform-origin:${URSPRUNG[t.ausrichtung]};transform:${SCHUB[t.ausrichtung]}rotate(${t.drehung}deg)">${esc(t.text)}</p>`);
  return `<div class="bd-ansicht bd-frei" style="aspect-ratio:${W}/${H};${bildURL ? `background-image:url('${bildURL}')` : 'background-color:#888'}">${flaechen.join('')}${linien.length ? `<svg class="bf-linien" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${linien.join('')}</svg>` : ''}${texte.join('')}</div>`;
}

/* ---------- Nachmessen ---------- */
/* Zeilen eines Textbausteins, wie sie etwa umbrechen */
export function zeilen(t, messe = breiteEm) {
  const out = [], text = t.versal ? t.text.toLocaleUpperCase('de') : t.text, fett = t.gewicht !== 'normal';
  for (const absatz of text.split('\n')) {
    if (!t.breite) { out.push(absatz); continue; }
    let z = '';
    for (const w of absatz.split(' ')) { const probe = z ? z + ' ' + w : w; if (z && messe(probe, fett) * t.groesse > t.breite) { out.push(z); z = w; } else z = probe; }
    out.push(z);
  }
  return out;
}
/* Umriss eines Textbausteins in Prozent des Bildes (Drehung grob: ab 45° stehen Breite und Höhe vertauscht) */
export function umriss(t, verh, messe = breiteEm) {
  const zl = zeilen(t, messe), fett = t.gewicht !== 'normal';
  let b = Math.max(...zl.map(z => messe(z, fett) * (t.versal ? 1.06 : 1))) * t.groesse, h = zl.length * t.groesse * 1.08 / verh;
  let x = t.ausrichtung === 'mitte' ? t.x - b / 2 : t.ausrichtung === 'rechts' ? t.x - b : t.x, y = t.y;
  const d = ((t.drehung % 360) + 360) % 360;
  if (d > 45 && d < 135) { const bb = h * verh, hh = b / verh; x = t.x - bb; y = t.y; b = bb; h = hh; }
  else if (d > 225 && d < 315) { const bb = h * verh, hh = b / verh; x = t.x; y = t.y - hh; b = bb; h = hh; }
  return { x, y, b, h };
}
/* Was die App an einem freien Layout misst. Das sind Hinweise, keine Regeln. */
export function messeLayout(analyse, layout, messe = breiteEm) {
  const m = analyse.free_map, verh = analyse.image.height / analyse.image.width, zb = 100 / m.cols, zh = 100 / m.rows;
  /* Untergrund je Zelle: Foto, darüber die Flächen */
  const grund = m.color.slice(), bedeckt = m.color.map(() => false);
  for (const f of layout.formen) {
    if (f.art === 'linie' || !f.gefuellt || f.deckkraft < 5) continue;
    const hoehe = f.art === 'kreis' ? f.breite / verh : f.hoehe;
    for (let cy = 0; cy < m.rows; cy++) for (let cx = 0; cx < m.cols; cx++) {
      const px = (cx + 0.5) * zb, py = (cy + 0.5) * zh;
      const drin = f.art === 'kreis' ? ((px - f.x - f.breite / 2) / (f.breite / 2)) ** 2 + ((py - f.y - hoehe / 2) / (hoehe / 2)) ** 2 <= 1 : px >= f.x && px <= f.x + f.breite && py >= f.y && py <= f.y + f.hoehe;
      if (drin) { const i = cy * m.cols + cx; grund[i] = mische(f.farbe, grund[i], f.deckkraft / 100); if (f.deckkraft >= 80) bedeckt[i] = true; }
    }
  }
  const boxen = layout.texte.map(t => umriss(t, verh, messe));
  const texte = layout.texte.map((t, n) => {
    const u = boxen[n], zellen = []; let motiv = 0;
    for (let cy = Math.max(0, Math.floor(u.y / zh)); cy <= Math.min(m.rows - 1, Math.floor((u.y + u.h - 0.01) / zh)); cy++) for (let cx = Math.max(0, Math.floor(u.x / zb)); cx <= Math.min(m.cols - 1, Math.floor((u.x + u.b - 0.01) / zb)); cx++) { const i = cy * m.cols + cx; zellen.push(i); if (!m.free[i] && !bedeckt[i]) motiv++; }
    const innen = Math.max(0, Math.min(100, u.x + u.b) - Math.max(0, u.x)) * Math.max(0, Math.min(100, u.y + u.h) - Math.max(0, u.y)), flaeche = u.b * u.h;
    return { text: t.text.replace(/\n/g, ' ').slice(0, 40), groesse: t.groesse, kontrast: zellen.length ? runde(Math.min(...zellen.map(i => kontrast(t.farbe, grund[i])))) : 0, ueberMotiv: zellen.length ? runde(motiv / zellen.length) : 0, ausserhalb: flaeche ? runde(1 - innen / flaeche) : 1 };
  });
  const ueberlappungen = [];
  for (let a = 0; a < boxen.length; a++) for (let b = a + 1; b < boxen.length; b++) {
    const A = boxen[a], Bx = boxen[b], w = Math.min(A.x + A.b, Bx.x + Bx.b) - Math.max(A.x, Bx.x), h = Math.min(A.y + A.h, Bx.y + Bx.h) - Math.max(A.y, Bx.y);
    if (w > 0 && h > 0 && w * h > 0.25 * Math.min(A.b * A.h, Bx.b * Bx.h)) ueberlappungen.push([texte[a].text, texte[b].text]);
  }
  return { texte, ueberlappungen };
}

/* ---------- Aus einem Baukasten-Entwurf ein freies Layout machen ---------- */
/* Damit sich auch Skizzen aus dem Baukasten frei weiterentwickeln und von Hand verschieben lassen.
   v: Ergebnis von pruefeVorschlag (variant, texts, style). */
export function ausVorschlag(analyse, v) {
  const e = v.variant, g = v.style, verh = analyse.image.height / analyse.image.width, formen = [], texte = [];
  if (!e) return { formen, texte };
  const ausr = e.align === 'mitte' ? 'mitte' : 'links', ax = ausr === 'mitte' ? e.block.x + e.block.width / 2 : e.block.x;
  const fl = g.flaeche;
  if (fl && (fl.art === 'band' || fl.art === 'sockel' || fl.art === 'ton')) { const xs = fl.polygon.map(p => p[0]), ys = fl.polygon.map(p => p[1]); formen.push({ art: 'rechteck', x: Math.min(...xs), y: Math.min(...ys), breite: Math.max(...xs) - Math.min(...xs), hoehe: Math.max(...ys) - Math.min(...ys), farbe: fl.color, deckkraft: Math.round(fl.opacity * 100), gefuellt: true, staerke: 2, drehung: 0 }); }
  const lage = e.panel || e.veil;
  if (lage) formen.push({ art: 'rechteck', x: e.block.x - 2.4, y: e.block.y - 2.4 / verh, breite: e.block.width + 4.8, hoehe: e.block.height + 4.8 / verh, farbe: lage.color, deckkraft: Math.round(lage.opacity * 100), gefuellt: true, staerke: 2, drehung: 0 });
  const sm = g.schmuck, linie = (id, x, y, b, h) => formen.push({ art: 'linie', x, y, breite: b, hoehe: h, farbe: sm[id].farbe || e.colors.text, deckkraft: 100, gefuellt: false, staerke: runde(sm[id].staerke * Math.min(1, verh) * 1.43, 1), drehung: 0 });
  if (sm.diagonale.an) { const d = 21 / verh, m = sm.diagonale.lage; if (sm.diagonale.richtung !== 'fallend') linie('diagonale', 0, m + d, 100, -2 * d); if (sm.diagonale.richtung !== 'steigend') linie('diagonale', 0, m - d, 100, 2 * d); }
  if (sm.rahmen.an) { const a = sm.rahmen.abstand * Math.min(1, verh); formen.push({ art: 'rechteck', x: a, y: a / verh, breite: 100 - 2 * a, hoehe: 100 - 2 * a / verh, farbe: sm.rahmen.farbe || e.colors.text, deckkraft: 100, gefuellt: false, staerke: runde(sm.rahmen.staerke * Math.min(1, verh) * 1.43, 1), drehung: 0 }); }
  let y = e.block.y;
  const baustein = (text, groesse, o = {}) => texte.push({ text, x: runde(ax, 1), y: runde(y, 1), groesse: runde(groesse), breite: 0, farbe: e.colors.text, gewicht: 'fett', versal: false, ausrichtung: ausr, drehung: 0, ...o });
  baustein(e.lines.join('\n'), e.sizes.headline, { gewicht: g.typo.gewicht === 500 ? 'normal' : g.typo.gewicht === 600 ? 'halbfett' : 'fett' });
  y += e.lines.length * e.sizes.headline * 1.06 / verh;
  if (v.texts.subline) { y += e.gaps.headline / verh; baustein(v.texts.subline, e.sizes.subline, { gewicht: 'normal', breite: runde(e.sub_max, 1) }); y += Math.ceil(breiteEm(v.texts.subline) * e.sizes.subline / e.sub_max) * e.sizes.subline * 1.36 / verh; }
  if (v.texts.cta) { y += e.gaps.cta / verh; baustein(g.typo.cta === 'zeile' ? `${v.texts.cta} →` : v.texts.cta, e.sizes.cta * 1.08, { gewicht: 'halbfett' }); }
  if (e.date) texte.push({ text: e.date.parts.join('\n–\n'), x: runde(e.date.x + e.date.width / 2, 1), y: e.date.y, groesse: e.date.size, breite: 0, farbe: e.date.color, gewicht: 'fett', versal: false, ausrichtung: 'mitte', drehung: 0 });
  return leseLayout({ formen, texte });
}
/* Eigenständige HTML-Datei */
export function freiDatei(analyse, skizze, bildURL, ansichtCSS, schriftURL) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(skizze.name || 'Entwurf')}</title>
<link rel="stylesheet" href="${schriftURL}">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111}
main{width:min(100vw,calc(100vh * ${analyse.image.width} / ${analyse.image.height}))}
${ansichtCSS}
${FREI_CSS}
</style>
</head>
<body>
<main>${freiHTML(analyse, skizze.layout, bildURL)}</main>
</body>
</html>
`;
}
