/* ============================================================
   Bildanalyse – freies Layout
   Hier entscheidet die KI selbst: Sie sieht das Foto und setzt
   Texte, Flächen und Linien frei aufs Bild (Position, Größe,
   Drehung, Farbe). Die Idee und die ungefähre Lage kommen von
   der KI. Die App
   - bringt die Antwort in eine zeichenbare Form,
   - setzt sie sauber (Reinzeichnung): Texte bleiben im Bild,
     überdecken sich nicht, weichen dem Motiv aus und bleiben
     lesbar; jeder Baustein bleibt so nah wie möglich an der
     Stelle, die die KI gewählt hat,
   - misst nach und gibt das als Rückmeldung für die nächste
     Fassung mit.
   Alles ohne Browser lauffähig.
   ============================================================ */
import { istHex, hexNorm, hexZuRgb, kontrast, mische, konfig } from './kern.js';
import { breiteEm, schriftToene } from './design.js';

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
Koordinaten in Prozent: x von 0 (linker Bildrand) bis 100 (rechter), y von 0 (oben) bis 100 (unten).
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
- Es gibt keine Vorgaben zu Raster, Größe oder Zahl der Elemente. Du entscheidest.
- Du darfst die Headline auf mehrere Bausteine verteilen, Wörter unterschiedlich groß setzen, stapeln oder um 90 Grad drehen.
- Handwerk, das immer gilt: Jeder Text steht vollständig im Bild, kein Text überdeckt einen anderen, und Text liegt auf ruhigen Stellen (in der Karte mit . markiert) oder auf einer Fläche, die du dafür setzt, nicht auf Händen, Gesichtern oder anderen Details des Motivs. Halte zum Motiv sichtbar Abstand. Die App rückt Bausteine zurecht, die das nicht einhalten.
- Hierarchie: Die Headline (oder ihr wichtigstes Wort) ist das größte Element, mindestens doppelt so groß wie die Unterzeile. Unterzeile und Aufruf sind klein und ruhig.
- Ein Block: Headline, Unterzeile und Aufruf stehen zusammen, auf einer gemeinsamen Kante (gleiches x und gleiche ausrichtung), untereinander mit etwas Luft. Verteile sie nur dann auf verschiedene Stellen, wenn genau das die Idee des Entwurfs ist, und nicht in jedem Entwurf.
- Schätze die Breite: Ein Zeichen ist etwa 0,55 × groesse breit. „Straßenfest“ bei groesse 8 braucht also rund 48 % der Bildbreite. Plane so, dass nichts über den Rand läuft.
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
    staerke: runde(zahl(f.staerke, 0.5, 40, 2), 1), drehung: Math.round(zahl(f.drehung, -180, 180, 0)),
    ...(f.weich === true ? { weich: true } : {})   /* weicher Schleier der Reinzeichnung: Rand läuft aus */
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
    flaechen.push(`<i class="bf-form"${k('formen', i)} style="left:${f.x}%;top:${f.y}%;${mass};${f.gefuellt ? `background:${rgba(f.farbe, f.deckkraft)}` : `border:${runde(f.staerke / 10)}cqw solid ${rgba(f.farbe, f.deckkraft)}`}${f.drehung ? `;transform:rotate(${f.drehung}deg)` : ''}${f.weich ? ';filter:blur(3.5cqw);pointer-events:none' : ''}"></i>`);
  });
  const texte = layout.texte.map((t, i) => `<p class="bf-text${t.versal ? ' versal' : ''}"${k('texte', i)} style="left:${t.x}%;top:${t.y}%;font-size:${t.groesse}cqw;font-weight:${GEWICHT[t.gewicht]};color:${t.farbe};text-align:${{ links: 'left', mitte: 'center', rechts: 'right' }[t.ausrichtung]};${t.breite ? `width:${t.breite}cqw;text-wrap:balance;` : 'white-space:pre;'}transform-origin:${URSPRUNG[t.ausrichtung]};transform:${SCHUB[t.ausrichtung]}rotate(${t.drehung}deg)">${esc(t.text)}</p>`);
  return `<div class="bd-ansicht bd-frei" style="aspect-ratio:${W}/${H};${bildURL ? `background-image:url('${bildURL}')` : 'background-color:#888'}">${flaechen.join('')}${linien.length ? `<svg class="bf-linien" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${linien.join('')}</svg>` : ''}${texte.join('')}</div>`;
}

/* ---------- Nachmessen ---------- */
/* Zeilen eines Textbausteins, wie sie etwa umbrechen */
export function zeilen(t, messe = breiteEm) {
  const out = [], text = t.versal ? t.text.toLocaleUpperCase('de') : t.text, fett = t.gewicht !== 'normal';
  const brich = (absatz, breite) => { const z = []; let akt = ''; for (const w of absatz.split(' ')) { const probe = akt ? akt + ' ' + w : w; if (akt && messe(probe, fett) * t.groesse > breite) { z.push(akt); akt = w; } else akt = probe; } z.push(akt); return z; };
  for (const absatz of text.split('\n')) {
    if (!t.breite) { out.push(absatz); continue; }
    /* Ausgewogen umbrechen: so schmal wie möglich bei gleicher Zeilenzahl, damit keine Zeile
       verwaist (ein einzelnes Wort unter einer langen Zeile) */
    let z = brich(absatz, t.breite);
    if (z.length > 1) for (let b = t.breite * 0.98; b >= t.breite * 0.5; b -= t.breite * 0.02) { const v = brich(absatz, b); if (v.length !== z.length) break; z = v; }
    out.push(...z);
  }
  return out;
}
/* Umriss eines Textbausteins in Prozent des Bildes (Drehung grob: ab 45° stehen Breite und Höhe vertauscht) */
export function umriss(t, verh, messe = breiteEm) {
  const zl = zeilen(t, messe), fett = t.gewicht !== 'normal';
  /* Versalien sind gesperrt: je Zeichen kommen 0,04 Geviert dazu */
  let b = Math.max(...zl.map(z => messe(z, fett) + (t.versal ? 0.04 * [...z].length : 0))) * t.groesse, h = zl.length * t.groesse * 1.08 / verh;
  let x = t.ausrichtung === 'mitte' ? t.x - b / 2 : t.ausrichtung === 'rechts' ? t.x - b : t.x, y = t.y;
  const d = ((t.drehung % 360) + 360) % 360;
  if (d > 45 && d < 135) { const bb = h * verh, hh = b / verh; x = t.x - bb; y = t.y; b = bb; h = hh; }
  else if (d > 225 && d < 315) { const bb = h * verh, hh = b / verh; x = t.x; y = t.y - hh; b = bb; h = hh; }
  return { x, y, b, h };
}
/* Was die App an einem freien Layout misst. Das sind Hinweise, keine Regeln. */
export function messeLayout(analyse, layout, messe = breiteEm) {
  const m = analyse.free_map, verh = analyse.image.height / analyse.image.width, zb = 100 / m.cols, zh = 100 / m.rows;
  const { grund, bedeckt } = untergrund(analyse, layout.formen);
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

/* ---------- Reinzeichnung ---------- */
/* Untergrund je Zelle der Freiraum-Karte: Foto, darüber die gefüllten Flächen des Layouts */
function untergrund(analyse, formen) {
  const m = analyse.free_map, verh = analyse.image.height / analyse.image.width, zb = 100 / m.cols, zh = 100 / m.rows;
  const grund = m.color.slice(), bedeckt = m.color.map(() => false);
  for (const f of formen) {
    if (f.art === 'linie' || !f.gefuellt || f.deckkraft < 5) continue;
    const hoehe = f.art === 'kreis' ? f.breite / verh : f.hoehe;
    for (let cy = 0; cy < m.rows; cy++) for (let cx = 0; cx < m.cols; cx++) {
      const px = (cx + 0.5) * zb, py = (cy + 0.5) * zh;
      const drin = f.art === 'kreis' ? ((px - f.x - f.breite / 2) / (f.breite / 2)) ** 2 + ((py - f.y - hoehe / 2) / (hoehe / 2)) ** 2 <= 1 : px >= f.x && px <= f.x + f.breite && py >= f.y && py <= f.y + f.hoehe;
      if (drin) { const i = cy * m.cols + cx; grund[i] = mische(f.farbe, grund[i], f.deckkraft / 100); if (f.deckkraft >= 80) bedeckt[i] = true; }
    }
  }
  return { grund, bedeckt };
}
/* Die Idee der KI sauber setzen. Nichts wird neu erfunden: Jeder Textbaustein behält Wortlaut und
   Charakter und rückt nur so weit, wie es das Handwerk verlangt.
   - ganz im Bild, mit Rand (5 % der kurzen Seite); zu Großes wird umbrochen oder kleiner,
   - Bausteine mit gemeinsamer Kante bleiben ein Block: lieber etwas kleiner als versetzt,
   - kein Text überdeckt einen anderen; der größere hat Vorrang und bleibt, wo er ist,
   - Text weicht dem Motiv aus, außer es liegt eine Fläche darunter,
   - Drehung nur 0 oder 90 Grad, Mindestgröße für Kleines,
   - Farbe mit lesbarem Kontrast; reicht keine, kommt eine ruhige Fläche darunter.
   Zurück kommt das gesetzte Layout und in Worten, was geändert wurde. */
export function reinzeichnen(analyse, layout, messe = breiteEm) {
  const cfg = konfig(analyse.config || {}), m = analyse.free_map, W = analyse.image.width, H = analyse.image.height, verh = H / W, kurz = Math.min(W, H);
  const rx = 5 * kurz / W, ry = 5 * kurz / H, zb = 100 / m.cols, zh = 100 / m.rows, klein = 1.7 * Math.max(1, Math.min(1.8, Math.sqrt(verh) / 0.8));
  const L = JSON.parse(JSON.stringify(layout)), toene = schriftToene(analyse, cfg), aenderungen = [], gesetzt = [];
  const name = t => `„${t.text.replace(/\n/g, ' ').slice(0, 28)}“`;
  const zellen = u => { const z = []; for (let cy = Math.max(0, Math.floor(u.y / zh)); cy <= Math.min(m.rows - 1, Math.floor((u.y + u.h - 0.01) / zh)); cy++) for (let cx = Math.max(0, Math.floor(u.x / zb)); cx <= Math.min(m.cols - 1, Math.floor((u.x + u.b - 0.01) / zb)); cx++) z.push(cy * m.cols + cx); return z; };
  /* Schritte, in denen ein Baustein verschoben werden darf: nächstliegende zuerst */
  const schritte = [];
  for (let dy = -100; dy <= 100; dy += zh / 2) for (let dx = -100; dx <= 100; dx += zb / 2) schritte.push([dx, dy, Math.hypot(dx, dy * verh)]);
  schritte.sort((a, b) => a[2] - b[2]);
  const vorher = L.texte.map(t => ({ ...t })), was = L.texte.map(() => []);
  /* 1. Jeder Baustein für sich: Drehung, Mindestgröße, nicht breiter oder höher als das Bild */
  const maxB = 100 - 2 * rx, maxH = 100 - 2 * ry;
  for (const t of L.texte) {
    t.drehung = Math.abs(t.drehung) < 30 || Math.abs(t.drehung) > 150 ? 0 : t.drehung > 0 ? 90 : -90;
    /* Gedrehter Text läuft als eine Zeile vom Ankerpunkt weg: so ist seine Lage eindeutig */
    if (t.drehung) { t.breite = 0; t.ausrichtung = 'links'; }
    if (t.groesse < klein) t.groesse = runde(klein);
    for (let n = 0; n < 14; n++) {
      const u = umriss(t, verh, messe);
      if (u.b > maxB + 0.01) { if (!t.drehung && (!t.breite || t.breite > maxB) && /\s/.test(t.text.trim())) { t.breite = runde(maxB, 1); continue; } t.groesse = runde(t.groesse * Math.max(0.5, maxB / u.b) * 0.98); if (t.breite > maxB) t.breite = runde(maxB, 1); continue; }
      if (u.h > maxH + 0.01) { t.groesse = runde(t.groesse * Math.max(0.5, maxH / u.h) * 0.98); continue; }
      break;
    }
  }
  /* 2. Blöcke erkennen: Bausteine mit gemeinsamer Kante (gleiche Ausrichtung, gleiches x), die
     untereinander stehen, gehören zusammen. Ein Block wird als Ganzes verkleinert und verschoben,
     damit die Kante hält; einzeln verschoben wären Headline und Unterzeile plötzlich versetzt. */
  const gruppe = L.texte.map((_, i) => i), wurzel = i => gruppe[i] === i ? i : (gruppe[i] = wurzel(gruppe[i]));
  const nachY = L.texte.map((_, i) => i).filter(i => !L.texte[i].drehung).sort((a, b) => L.texte[a].y - L.texte[b].y);
  for (let a = 0; a < nachY.length; a++) for (let b = a + 1; b < nachY.length; b++) {
    const A = L.texte[nachY[a]], Bt = L.texte[nachY[b]];
    if (A.ausrichtung !== Bt.ausrichtung || Math.abs(A.x - Bt.x) > 1.5) continue;
    const ua = umriss(A, verh, messe), ub = umriss(Bt, verh, messe), luecke = ub.y - (ua.y + ua.h);
    if (luecke >= -0.3 && luecke <= 14) gruppe[wurzel(nachY[b])] = wurzel(nachY[a]);
  }
  const bloecke = [...new Set(L.texte.map((_, i) => wurzel(i)))].map(w => L.texte.map((_, i) => i).filter(i => wurzel(i) === w).sort((a, b) => L.texte[a].y - L.texte[b].y));
  const vereint = idx => { const us = idx.map(i => umriss(L.texte[i], verh, messe)), x = Math.min(...us.map(u => u.x)), y = Math.min(...us.map(u => u.y)); return { x, y, b: Math.max(...us.map(u => u.x + u.b)) - x, h: Math.max(...us.map(u => u.y + u.h)) - y }; };
  bloecke.sort((a, b) => Math.max(...b.map(i => L.texte[i].groesse)) - Math.max(...a.map(i => L.texte[i].groesse)));
  const { grund, bedeckt } = untergrund(analyse, L.formen);
  const motiv = u => { const z = zellen(u); return z.length ? z.filter(c => !m.free[c] && !bedeckt[c]).length / z.length : 0; };
  /* Block verkleinern: Schrift und Umbruchbreite schrumpfen, die Abstände zwischen den Bausteinen bleiben */
  const skaliere = (blk, f) => {
    const alt = blk.map(i => umriss(L.texte[i], verh, messe)), luecken = alt.slice(1).map((u, n) => Math.max(0, u.y - (alt[n].y + alt[n].h)));
    for (const i of blk) { const t = L.texte[i]; t.groesse = runde(Math.max(klein, t.groesse * f)); if (t.breite) t.breite = runde(t.breite * f, 1); }
    for (let n = 1; n < blk.length; n++) { const v = umriss(L.texte[blk[n - 1]], verh, messe); L.texte[blk[n]].y = runde(v.y + v.h + luecken[n - 1], 1); }
  };
  for (const blk of bloecke) {
    const kopf = L.texte[blk[0]];
    /* Ragt ein Block mit fester Kante seitlich aus dem Bild, wird er lieber etwas kleiner, als von seiner Kante zu rücken */
    if (blk.length > 1 || !kopf.drehung) {
      const U = vereint(blk), rechts = U.x + U.b - (100 - rx), links = rx - U.x;
      if (rechts > 0.01 || links > 0.01) {
        const ax = kopf.x, platz = kopf.ausrichtung === 'links' ? 100 - rx - ax : kopf.ausrichtung === 'rechts' ? ax - rx : 2 * Math.min(ax - rx, 100 - rx - ax);
        const f = platz / U.b;
        if (f >= 0.72 && f < 1) skaliere(blk, f * 0.99);
      }
    }
    /* Läuft ein Baustein mit mehreren Wörtern ins Motiv, bricht er zuerst auf die Breite seines Blocks um,
       statt dort mit Schleier lesbar gemacht oder weggeschoben zu werden */
    if (blk.length > 1) {
      const breitester = Math.max(...blk.map(i => umriss(L.texte[i], verh, messe).b));
      for (const i of blk) {
        const t = L.texte[i], u = umriss(t, verh, messe);
        /* stört: liegt auf dem Motiv oder auf einer Stelle, auf der die Schrift nicht lesbar ist (etwa ein unscharfer dunkler Ärmel) */
        const stoert = x => { const z = zellen(x); return motiv(x) > 0.12 || (z.length && Math.min(...z.map(c => kontrast(t.farbe, grund[c]))) < (t.groesse >= 5 ? 3 : cfg.kontrast_min)); };
        if (t.drehung || !/\s/.test(t.text.trim()) || !stoert(u)) continue;
        const andere = Math.max(10, ...blk.filter(j => j !== i).map(j => umriss(L.texte[j], verh, messe).b));
        const ziel = Math.min(u.b * 0.95, Math.max(andere, breitester * 0.6));
        if (ziel >= u.b - 0.5) continue;
        t.breite = runde(ziel, 1);
        for (let n = 0; n < 6 && stoert(umriss(t, verh, messe)) && zeilen(t, messe).length < 3; n++) t.breite = runde(t.breite * 0.85, 1);
        if (stoert(umriss(t, verh, messe))) { t.breite = vorher[i].breite; continue; }   /* hilft nicht: lieber verschieben oder Schleier */
        was[i].push('umbrochen, damit es nicht ins Motiv läuft');
      }
    }
    /* Luft im Block: zwischen zwei Bausteinen mindestens eine halbe Zeile der kleineren Schrift,
       sonst kleben Unterzeile und Aufruf aneinander (passiert leicht, wenn eine Zeile umbricht) */
    for (let n = 1; n < blk.length; n++) {
      /* gleich große Teile (eine aufgeteilte Headline) stehen eng wie Zeilen, Stufen der Hierarchie bekommen Luft */
      const a = L.texte[blk[n - 1]], b = L.texte[blk[n]], v = umriss(a, verh, messe), gleich = Math.min(a.groesse, b.groesse) >= 4 && a.gewicht === b.gewicht && Math.abs(a.groesse - b.groesse) <= 0.15 * Math.max(a.groesse, b.groesse);
      const soll = v.y + v.h + (gleich ? 0.05 * a.groesse : 0.55 * Math.min(a.groesse, b.groesse)) / verh;
      if (b.y < soll - 0.05) { b.y = runde(soll, 1); was[blk[n]].push('mit Luft zum Baustein darüber gesetzt'); }
    }
    /* Lage: im Bild, frei von anderen Texten, möglichst nicht auf dem Motiv; der Block rückt als Ganzes.
       Erst nur in der Nähe (ein Baustein, der quer übers Bild wandert, zerstört die Idee), dann
       stufenweise etwas kleiner an derselben Stelle, erst danach auch weiter weg. */
    let u0 = blk.map(i => umriss(L.texte[i], verh, messe));
    const passt = (dx, dy, streng) => u0.every(o => {
      const u = { x: o.x + dx, y: o.y + dy, b: o.b, h: o.h };
      if (u.x < rx - 0.01 || u.y < ry - 0.01 || u.x + u.b > 100 - rx + 0.01 || u.y + u.h > 100 - ry + 0.01) return false;
      if (gesetzt.some(g => u.x < g.x + g.b + 1.2 && g.x < u.x + u.b + 1.2 && u.y < g.y + g.h + 1.2 / verh && g.y < u.y + u.h + 1.2 / verh)) return false;
      return !streng || motiv(u) <= 0.12;
    });
    const nahe = Math.max(10, 2.2 * zb), suche = (streng, weit) => schritte.find(([dx, dy, d]) => d <= weit && passt(dx, dy, streng));
    let wahl = suche(true, nahe);
    const stand = blk.map(i => ({ ...L.texte[i] }));
    for (let k = 0; !wahl && k < 4 && blk.some(i => L.texte[i].groesse > klein); k++) { skaliere(blk, 0.92); u0 = blk.map(i => umriss(L.texte[i], verh, messe)); wahl = suche(true, nahe); }
    if (!wahl) { blk.forEach((i, n) => { L.texte[i] = stand[n]; }); u0 = blk.map(i => umriss(L.texte[i], verh, messe)); wahl = suche(true, 999) || suche(false, 999); }
    for (const i of blk) {
      const t = L.texte[i];
      if (wahl) { t.x = runde(t.x + wahl[0], 1); t.y = runde(t.y + wahl[1], 1); if (wahl[2] > 1.5) was[i].push(blk.length > 1 ? 'mit seinem Block verschoben' : 'verschoben'); }
      gesetzt.push(umriss(t, verh, messe));
    }
  }
  /* 3. Farbe je Baustein */
  L.texte.forEach((t, i) => {
    const vor = vorher[i];
    if (t.groesse !== vor.groesse) was[i].unshift(t.groesse > vor.groesse ? 'größer gesetzt' : 'verkleinert, damit es ins Bild passt');
    if (t.drehung !== vor.drehung) was[i].push('gerade gestellt');
    const u = umriss(t, verh, messe);
    const unter = zellen(u).map(c => grund[c]), k = f => (unter.length ? Math.min(...unter.map(g => kontrast(f, g))) : 21), ziel = t.groesse >= 5 ? 3 : cfg.kontrast_min;
    if (k(t.farbe) < ziel) {
      const ton = k(toene.dunkel) >= k(toene.hell) ? toene.dunkel : toene.hell;
      if (k(ton) >= ziel) { t.farbe = ton; was[i].push('Farbe für lesbaren Kontrast geändert'); }
      else {
        /* keine Farbe reicht ganz: ein weicher Schleier in der Gegenfarbe hebt den Kontrast, ohne als Kasten aufzufallen */
        const schein = ton === toene.dunkel ? toene.hell : toene.dunkel;
        let a = 0.08; while (a < 0.6 && Math.min(...unter.map(g => kontrast(ton, mische(schein, g, a)))) < ziel) a += 0.04;
        const p = 5;
        L.formen.push({ art: 'rechteck', x: runde(u.x - p, 1), y: runde(u.y - p / verh, 1), breite: runde(u.b + 2 * p, 1), hoehe: runde(u.h + 2 * p / verh, 1), farbe: schein, deckkraft: Math.round(a * 100), gefuellt: true, staerke: 2, drehung: 0, weich: true });
        t.farbe = ton; was[i].push(`weicher Schleier untergelegt (${Math.round(a * 100)} %), damit die Schrift lesbar ist`);
      }
    }
    if (was[i].length) aenderungen.push(`${name(t)}: ${was[i].join(', ')}`);
  });
  return { layout: L, aenderungen };
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
