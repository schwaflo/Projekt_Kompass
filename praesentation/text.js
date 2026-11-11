/* ============================================================
   Präsentationsgenerator – Textanpassung
   Schätzt, wie viel Platz ein Text braucht, und verkleinert die
   Schrift, bis er in seine Fläche passt. Die Schätzung ist
   bewusst vorsichtig und rein rechnerisch, damit Vorschau und
   PowerPoint-Datei dieselben Größen bekommen.
   Einheiten: Punkt (pt). Eine Folie ist 960 × 540 pt.
   ============================================================ */

/* Zeichenbreite als Anteil der Schriftgröße (Richtwerte für Arial) */
function zeichenBreite(c) {
  if (c === ' ') return 0.28;
  if ("iIl.,:;!|'j".includes(c)) return 0.26;
  if ('ft()[]-"r/'.includes(c)) return 0.35;
  if ('mM'.includes(c)) return 0.86;
  if (c === 'W') return 0.95;
  if (c === 'w') return 0.74;
  if ('%@…—'.includes(c)) return 0.95;
  if (c >= '0' && c <= '9') return 0.56;
  if (c >= 'A' && c <= 'Z' || 'ÄÖÜ'.includes(c)) return 0.69;
  return 0.54;
}

/* Wie viel breiter oder schmaler eine Schrift gegenüber Arial läuft */
const SCHRIFT_FAKTOR = {
  'arial': 1, 'helvetica': 1, 'georgia': 1.08, 'times new roman': 0.93, 'verdana': 1.17, 'tahoma': 1.02, 'calibri': 0.92, 'cambria': 0.98, 'segoe ui': 0.98,
  'manrope': 1.05, 'inter': 1.04, 'fraunces': 1.04, 'work sans': 1.05
};
const RESERVE = 1.07; /* Sicherheitszuschlag, weil die echte Schrift abweichen kann */

export function textBreite(text, pt, stil = {}) {
  const f = (SCHRIFT_FAKTOR[String(stil.font || '').toLowerCase()] || 1.06) * (stil.bold ? 1.06 : 1) * RESERVE;
  let w = 0;
  for (const c of String(text)) w += zeichenBreite(c);
  return w * pt * f;
}

/* Text in Zeilen umbrechen; liefert die Zahl der Zeilen */
export function zeilen(text, breite, pt, stil) {
  let n = 0;
  for (const absatz of String(text).split('\n')) {
    const leer = textBreite(' ', pt, stil);
    let x = 0; n++;
    for (const wort of absatz.split(/\s+/).filter(Boolean)) {
      const w = textBreite(wort, pt, stil);
      if (x > 0 && x + leer + w > breite) { n++; x = 0; }
      /* ein einzelnes Wort, das breiter als die Zeile ist, bricht mitten im Wort um */
      if (w > breite) { n += Math.ceil(w / breite) - 1; x = w % breite; continue; }
      x += (x > 0 ? leer : 0) + w;
    }
  }
  return n;
}

export const einzug = pt => pt * 1.25;          /* Einrückung von Aufzählungen */
export const absatzAbstand = (pt, bullets) => pt * (bullets ? 0.5 : 0.3);

/* Höhe eines Textblocks aus Absätzen [{ text, bullet }] */
export function blockHoehe(absaetze, breite, pt, stil) {
  let h = 0;
  absaetze.forEach((a, i) => {
    const b = a.bullet ? breite - einzug(pt) : breite;
    h += zeilen(a.text, Math.max(b, pt), pt, stil) * pt * stil.lineHeight;
    if (i) h += absatzAbstand(pt, !!a.bullet);
  });
  return h;
}

/* Schriftgröße finden, mit der die Absätze in breite × hoehe passen.
   Erst wird bis zur Mindestgröße verkleinert, erst danach gekürzt. */
export function einpassen(absaetze, breite, hoehe, stil) {
  const soll = stil.pt, min = Math.max(Math.min(soll, 9), soll * 0.6);
  let pt = soll;
  /* Kein Wort soll mitten im Wort umbrechen müssen: auch dafür wird zuerst verkleinert */
  const zuBreit = p => absaetze.some(a => a.text.split(/\s+/).some(w => textBreite(w, p, stil) > (a.bullet ? breite - einzug(p) : breite)));
  while (pt > min && (blockHoehe(absaetze, breite, pt, stil) > hoehe || zuBreit(pt))) pt = Math.max(min, pt - 0.5);
  let gekuerzt = false, abs = absaetze;
  if (blockHoehe(abs, breite, pt, stil) > hoehe) {
    abs = absaetze.map(a => ({ ...a }));
    gekuerzt = true;
    for (let schutz = 0; schutz < 400 && blockHoehe(abs, breite, pt, stil) > hoehe; schutz++) {
      const letzter = abs[abs.length - 1], worte = letzter.text.replace(/…$/, '').trim().split(/\s+/);
      if (worte.length > 1) letzter.text = worte.slice(0, -1).join(' ').replace(/[,;:.–-]+$/, '') + '…';
      else if (abs.length > 1) abs.pop();
      else { letzter.text = [...letzter.text.replace(/…$/, '')].slice(0, -2).join('') + '…'; if (letzter.text.length < 3) break; }
    }
  }
  return { pt, absaetze: abs, gekuerzt };
}
