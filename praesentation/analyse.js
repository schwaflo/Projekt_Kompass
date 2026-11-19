/* ============================================================
   Präsentationsgenerator – Layouts verstehen und passend wählen
   1. profil(): Was kann ein Layout? Rein rechnerisch aus seinen
      Platzhaltern: Schriftgrößen, Flächen, Bildanteil, Spalten,
      Kacheln, Hintergrund. Funktioniert für jedes Designsystem,
      auch für aus PowerPoint importierte.
   2. FORMEN: Wie soll eine Aussage wirken? Die KI ordnet jeder
      Folie eine Form zu (Kernsatz, Zahl, Vergleich …), nicht ein
      Layout. Das passende Layout wählt die App.
   3. waehleLayouts(): je Folie das Layout mit der höchsten Eignung,
      mit Abwechslung (keine Wiederholung, Bildseiten im Wechsel,
      wenige reine Textfolien) und Betonung (wichtige Aussagen
      bekommen Layouts mit großer, kräftiger Schrift).
   ============================================================ */
import { inhaltsPlatzhalter, tabellenFlaeche } from './spec.js';
import { kontrast } from './validate.js';

export const FORMEN = {
  titel: 'Titelfolie: Thema und Untertitel',
  kapitel: 'Kapiteltrenner zwischen zwei Teilen',
  kernsatz: 'eine einzelne starke Aussage, groß und kräftig',
  zahl: 'eine einzelne Zahl im Mittelpunkt (nur mit Zahl aus dem Briefing)',
  kennzahlen: 'zwei bis vier Zahlen nebeneinander (nur mit Zahlen aus dem Briefing)',
  liste: 'mehrere Punkte zu einem Thema',
  bausteine: 'drei gleichwertige Teile, Säulen oder Vorteile',
  vergleich: 'Gegensatz: vorher und nachher, Problem und Lösung, zwei Optionen',
  ablauf: 'Schritte, Phasen oder Termine in zeitlicher Reihenfolge',
  bild: 'eine Szene oder ein Beispiel, das ein Bild trägt, mit kurzer Aussage',
  zitat: 'ein Zitat oder eine Stimme aus der Zielgruppe',
  abschluss: 'letzte Folie: Bitte, nächster Schritt, Kontakt',
  tabelle: 'Tabelle: eine Tabelle der Person mit einer Überschrift, die sagt, was sie zeigt (nur für Tabellen aus dem Material)'
};
export const FORM_IDS = Object.keys(FORMEN);
/* Für die Oberfläche: kurzer Name und ein Satz, was die Wirkung mit der Folie macht */
export const FORM_KURZ = { titel: 'Titel', kapitel: 'Kapitel', kernsatz: 'Kernsatz', zahl: 'Große Zahl', kennzahlen: 'Kennzahlen', liste: 'Liste', bausteine: 'Bausteine', vergleich: 'Vergleich', ablauf: 'Ablauf', bild: 'Bild', zitat: 'Zitat', abschluss: 'Abschluss', tabelle: 'Tabelle' };
export const FORM_HILFE = {
  titel: 'Erste Folie: Thema und Untertitel.',
  kapitel: 'Trennt zwei Teile der Präsentation, mit Kapitelnummer, wenn das Layout eine hat.',
  kernsatz: 'Eine einzige Aussage, groß und kräftig. Für die Sätze, die hängen bleiben sollen.',
  zahl: 'Eine Zahl steht im Mittelpunkt, darunter, was sie bedeutet.',
  kennzahlen: 'Zwei bis vier Zahlen nebeneinander, jede mit kurzer Erklärung.',
  liste: 'Mehrere Punkte zu einem Thema, als Stichpunkte.',
  bausteine: 'Drei gleichwertige Teile, Säulen oder Vorteile in Kacheln.',
  vergleich: 'Zwei Seiten gegenüber: vorher und nachher, Problem und Lösung, Option A und B.',
  ablauf: 'Schritte, Phasen oder Termine in ihrer Reihenfolge.',
  bild: 'Ein Bild trägt die Folie, dazu eine kurze Aussage.',
  zitat: 'Ein Zitat oder eine Stimme aus der Zielgruppe.',
  abschluss: 'Letzte Folie: Bitte, nächster Schritt oder Kontakt.',
  tabelle: 'Eine Tabelle aus deinem Material auf der größten freien Fläche.'
};

/* Welche Layouttypen eine Form tragen können, mit Grundeignung */
const FORM_TYPEN = {
  titel: { title: 1 },
  kapitel: { section: 1, statement: 0.5 },
  kernsatz: { statement: 1, quote: 0.55, 'image-full': 0.7, section: 0.35, 'big-number': 0.2 },
  zahl: { 'big-number': 1, statement: 0.45, 'kpi-grid': 0.4 },
  kennzahlen: { 'kpi-grid': 1, cards: 0.55, 'big-number': 0.35 },
  liste: { 'content-bullets': 1, 'image-left': 0.8, 'image-right': 0.8, cards: 0.5, 'two-column': 0.35 },
  bausteine: { cards: 1, 'kpi-grid': 0.4, 'content-bullets': 0.55, timeline: 0.3 },
  vergleich: { 'two-column': 1, comparison: 1, cards: 0.55, 'content-bullets': 0.3 },
  ablauf: { timeline: 1, cards: 0.5, 'content-bullets': 0.45 },
  bild: { 'image-left': 1, 'image-right': 1, 'image-full': 0.9 },
  zitat: { quote: 1, statement: 0.6 },
  abschluss: { closing: 1, statement: 0.3 },
  tabelle: { table: 1.3, 'content-bullets': 1, 'two-column': 0.45, comparison: 0.45, 'kpi-grid': 0.4, cards: 0.35, timeline: 0.3 }
};
/* Umgekehrt: welche Form ein Layouttyp am besten trägt (für alte Gliederungen mit layoutId) */
export const FORM_VON_TYP = { title: 'titel', section: 'kapitel', statement: 'kernsatz', 'content-bullets': 'liste', cards: 'bausteine', 'two-column': 'vergleich', comparison: 'vergleich', 'image-left': 'bild', 'image-right': 'bild', 'image-full': 'bild', 'big-number': 'zahl', 'kpi-grid': 'kennzahlen', timeline: 'ablauf', quote: 'zitat', closing: 'abschluss', table: 'tabelle' };

const TEXT_TYPEN = ['content-bullets', 'cards', 'two-column', 'comparison'];
const groesse = (system, s) => typeof s === 'number' ? s : (system.tokens.typography.sizes[s || 'body'] || system.tokens.typography.sizes.body);
const farbe = (system, n) => system.tokens.colors[n] || (/^#[0-9a-f]{6}$/i.test(n || '') ? n : null);

/* ---------- 1. Profil eines Layouts ---------- */
export function profil(layout, system) {
  const body = system.tokens.typography.sizes.body || 18, phs = inhaltsPlatzhalter(layout);
  const texte = phs.filter(p => p.typ === 'text'), listen = phs.filter(p => p.typ === 'bullets'), kacheln = phs.filter(p => p.typ === 'items'), bilder = phs.filter(p => p.typ === 'image');
  const pts = [...texte.map(p => groesse(system, (p.style || {}).size)), ...kacheln.flatMap(p => p.felder.map(f => groesse(system, (f.style || {}).size)))];
  const maxPt = pts.length ? Math.max(...pts) : body;
  const bg = farbe(system, layout.background) || '#FFFFFF', dunkel = kontrast('#FFFFFF', bg) > kontrast('#000000', bg);
  const fett = texte.some(p => groesse(system, (p.style || {}).size) === maxPt && ((p.style || {}).bold || ((p.style || {}).font === 'heading' && system.tokens.typography.headingBold !== false)));
  /* Wucht: wie stark das Layout eine Aussage betont (0 bis 1) */
  const wucht = Math.max(0, Math.min(1, (maxPt / body - 1.2) / 3 + (dunkel ? 0.2 : 0) + (fett ? 0.1 : 0) - listen.length * 0.15));
  const bildAnteil = bilder.reduce((s, p) => s + p.w * p.h, 0) / 10000;
  const bildSeite = bilder.length && bildAnteil < 0.7 ? (bilder[0].x + bilder[0].w / 2 < 50 ? 'links' : 'rechts') : bildAnteil >= 0.7 ? 'voll' : '';
  const kapazitaet = texte.reduce((s, p) => s + (p.maxChars || 0), 0) + listen.reduce((s, p) => s + p.maxItems * p.maxCharsPerItem, 0) + kacheln.reduce((s, p) => s + p.maxItems * p.felder.reduce((t, f) => t + f.maxChars, 0), 0);
  const zahlKachel = kacheln.some(p => p.felder.some(f => /^(value|zahl|number|wert)$/i.test(f.id) || groesse(system, (f.style || {}).size) >= body * 1.8));
  const tf = tabellenFlaeche(layout), tabelle = tf ? tf.w * tf.h / 10000 : 0;
  return { typ: layout.typ, tabelle, texte: texte.length, listen: listen.length, kacheln: kacheln.length, kachelZahl: kacheln.reduce((s, p) => s + p.maxItems, 0), zahlKachel, bilder: bilder.length, bildAnteil, bildSeite, maxPt, wucht, dunkel, kapazitaet };
}

/* Eignung eines Layouts für eine Form (0 = gar nicht) */
export function eignung(layout, system, form, p = profil(layout, system)) {
  let w = (FORM_TYPEN[form] || {})[layout.typ] || 0;
  /* Einordnung durch die KI beim Import (layout-ki.js): genannte Wirkungen zählen, die erste am meisten.
     Was das Layout dafür an Flächen braucht, prüfen die Regeln darunter trotzdem. */
  const ki = layout.ki;
  if (ki && Array.isArray(ki.formen) && ki.formen.length) {
    const rang = ki.formen.indexOf(form);
    if (rang >= 0) w = Math.max(w, 1 - 0.12 * rang); else w *= 0.6;
  }
  if (ki && ki.meiden) w *= 0.25;
  /* Was die Form unbedingt braucht */
  if (form === 'liste' && !p.listen && !p.kacheln) return 0;
  if (form === 'vergleich' && p.listen + p.kacheln < 2 && !(p.kacheln && p.kachelZahl >= 2)) w *= 0.5;
  if (form === 'bild' && !p.bilder) return 0;
  /* Tabellen brauchen eine große Inhaltsfläche und stehen nicht neben Fotos */
  if (form === 'tabelle') return p.tabelle >= 0.25 && !p.bilder ? Math.max(w, 0.25) * Math.min(1, p.tabelle / 0.4) : 0;
  if ((form === 'kennzahlen' || form === 'bausteine' || form === 'ablauf') && !p.kacheln && !p.listen) return 0;
  if (form === 'kennzahlen' && p.kacheln && !p.zahlKachel) w *= 0.7;
  if ((form === 'kernsatz' || form === 'zahl') && p.listen) w *= 0.4;
  if (form === 'kernsatz' || form === 'zahl' || form === 'zitat') w *= 0.75 + 0.5 * p.wucht;
  return Math.max(0, w);
}

/* ---------- 3. Layouts wählen ----------
   folien: [{ form, betont, layoutId? }]  (layoutId: Wunsch, wird nur genommen, wenn er zur Form passt)
   opts.spiegeln: Bildlayouts dürfen gespiegelt werden, wenn es nur eine Bildseite gibt
   opts.bilder: false, wenn das Designsystem keine Fotos hat (dann keine Bildlayouts)
   Je Folie kann f.bild (true/false) das für diese Folie festlegen, etwa für ein Bild der Person.
   Liefert [{ layoutId, form, spiegeln? }] */
export function waehleLayouts(folien, system, opts = {}) {
  const n = folien.length, profile = new Map(system.layouts.map(l => [l.id, profil(l, system)]));
  const benutzt = new Map(), out = [];
  let letzteBildSeite = '', textFolien = 0;
  const grenzeText = Math.max(2, Math.ceil(n / 3));
  const hatSeite = s => system.layouts.some(l => profile.get(l.id).bildSeite === s);

  folien.forEach((f, i) => {
    let form = FORM_IDS.includes(f.form) ? f.form : 'liste';
    if (n >= 3 && i === 0 && system.layouts.some(l => l.typ === 'title')) form = 'titel';
    if (n >= 3 && i === n - 1 && system.layouts.some(l => l.typ === 'closing')) form = 'abschluss';
    if (form === 'titel' && i > 0) form = 'kernsatz';
    /* Kapiteltrenner erst ab sechs Folien; vorher kosten sie zu viel Platz */
    if (form === 'kapitel' && n <= 5) form = 'kernsatz';
    if (form === 'abschluss' && i < n - 1) form = 'kernsatz';
    const vor = out[i - 1], vorTyp = vor ? (system.layout(vor.layoutId) || {}).typ : '';

    let best = null, bestWert = 0, bestSpiegeln = false;
    const bilder = typeof f.bild === 'boolean' ? f.bild : opts.bilder !== false;
    /* Eine Tabelle über mehrere Folien behält ihr Layout */
    const fortsetzung = form === 'tabelle' && vor && vor.form === 'tabelle';
    system.layouts.forEach((l, idx) => {
      const p = profile.get(l.id);
      if (!bilder && p.bilder) return; /* ohne Fotos keine leeren Bildflächen */
      let w = eignung(l, system, form, p);
      if (w <= 0) return;
      if (f.layoutId === l.id) w += 0.25;
      if (f.betont) w += 0.35 * p.wucht; else if (['liste', 'vergleich', 'ablauf', 'bausteine'].includes(form)) w -= 0.1 * p.wucht;
      /* Tabellen brauchen vor allem Platz: keine Abzüge für Wiederholung, eine Fortsetzung behält ihr Layout */
      if (form === 'tabelle') { if (fortsetzung && vor.layoutId === l.id) w += 0.5; }
      else {
        if (vor && vor.layoutId === l.id) w -= 0.7;
        else if (vorTyp && vorTyp === l.typ) w -= 0.3;
        w -= 0.14 * (benutzt.get(l.id) || 0);
        if (TEXT_TYPEN.includes(l.typ) && textFolien >= grenzeText) w -= 0.35;
        if (l.typ === 'quote' && (benutzt.get(l.id) || 0) >= 1) w -= 0.5;
      }
      /* Bildseiten wechseln; gibt es nur eine Seite, darf gespiegelt werden */
      let spiegeln = false;
      if (p.bildSeite && p.bildSeite !== 'voll' && p.bildSeite === letzteBildSeite) {
        const andere = p.bildSeite === 'links' ? 'rechts' : 'links';
        if (opts.spiegeln && !hatSeite(andere)) spiegeln = true; else w -= 0.3;
      }
      w -= idx * 0.0001; /* bei Gleichstand gewinnt die Reihenfolge im Designsystem */
      if (w > bestWert) { best = l; bestWert = w; bestSpiegeln = spiegeln; }
    });
    if (!best) { best = system.layoutForTyp(form === 'titel' ? 'title' : form === 'abschluss' ? 'closing' : 'content-bullets'); bestSpiegeln = false; }
    const p = profile.get(best.id);
    if (p.bildSeite && p.bildSeite !== 'voll') letzteBildSeite = bestSpiegeln ? (p.bildSeite === 'links' ? 'rechts' : 'links') : p.bildSeite;
    if (TEXT_TYPEN.includes(best.typ)) textFolien++;
    benutzt.set(best.id, (benutzt.get(best.id) || 0) + 1);
    out.push({ layoutId: best.id, form, ...(bestSpiegeln ? { spiegeln: true } : {}) });
  });
  return out;
}

/* Layouts für eine einzelne Folie nach Eignung sortiert (für die Auswahl im Editor) */
export function rangliste(form, betont, system, nachbarn = []) {
  return system.layouts.map((l, idx) => {
    const p = profil(l, system);
    let w = eignung(l, system, form, p);
    if (w <= 0) return null;
    if (betont) w += 0.35 * p.wucht;
    if (nachbarn.includes(l.id)) w -= 0.5;
    return { layout: l, wert: w - idx * 0.0001 };
  }).filter(Boolean).sort((a, b) => b.wert - a.wert).map(x => x.layout);
}

/* ---------- Beschreibung in Worten (für Editor, Import-Bericht und KI) ---------- */
const TYP_NAMEN = { title: 'Titelfolie', section: 'Kapiteltrenner', statement: 'Große Aussage', 'content-bullets': 'Inhalt mit Stichpunkten', cards: 'Karten', 'two-column': 'Zwei Spalten', comparison: 'Vergleich', 'image-left': 'Bild links, Text rechts', 'image-right': 'Text links, Bild rechts', 'image-full': 'Vollbild mit Aussage', 'big-number': 'Große Zahl', 'kpi-grid': 'Kennzahlen', timeline: 'Zeitstrahl', quote: 'Zitat', closing: 'Abschluss', table: 'Tabelle' };
export const typName = t => TYP_NAMEN[t] || t;

export function beschreibe(layout, system, p = profil(layout, system)) {
  const formen = FORM_IDS.filter(f => f !== 'tabelle').map(f => [f, eignung(layout, system, f, p)]).filter(([, w]) => w >= 0.5).sort((a, b) => b[1] - a[1]).map(([f]) => f);
  const teile = [];
  if (p.wucht >= 0.6) teile.push('sehr betont, große kräftige Schrift');
  else if (p.wucht >= 0.35) teile.push('betont');
  if (p.dunkel) teile.push('dunkler Grund');
  if (p.bildAnteil >= 0.7) teile.push('Bild über die ganze Folie');
  else if (p.bilder) teile.push(`Bild ${p.bildSeite === 'links' ? 'links' : 'rechts'} (${Math.round(p.bildAnteil * 100)} % der Fläche)`);
  if (p.kacheln) teile.push(`${p.kachelZahl} Kacheln${p.zahlKachel ? ' für Zahlen' : ''}`);
  if (p.listen) teile.push(p.listen > 1 ? `${p.listen} Spalten mit Stichpunkten` : 'Stichpunkte');
  teile.push(p.kapazitaet < 160 ? 'wenig Text' : p.kapazitaet < 450 ? 'mittlere Textmenge' : 'viel Platz für Text');
  return { formen, merkmale: teile, text: `${typName(layout.typ)}: ${teile.join(', ')}. Gut für: ${formen.map(f => FORMEN[f].split(':')[0].split(',')[0]).join('; ') || 'allgemeine Inhalte'}.` };
}
