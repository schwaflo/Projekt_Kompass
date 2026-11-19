/* ============================================================
   Präsentationsgenerator – Symbole für die Oberfläche
   Eigene Liniensymbole (24 × 24, Strich in currentColor), damit
   jede Auswahl auf einen Blick zeigt, was sie tut. Kein Laden
   von außen, keine Schrift mit Symbolen.
   ============================================================ */
const kreis = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

export const ICONS = {
  /* Wirkungen einer Folie */
  titel: 'M3 4h18v12H3z M12 16v4 M8 20h8',
  kapitel: 'M6 3h12v18l-6-4-6 4z',
  kernsatz: 'M5 7V4h14v3 M12 4v16 M9 20h6',
  zahl: 'M5 9h14 M5 15h14 M10 4 8 20 M16 4l-2 16',
  kennzahlen: 'M3 20h18 M6 20v-6 M12 20V6 M18 20v-10',
  liste: `M9 6h11 M9 12h11 M9 18h11 ${kreis(4.5, 6, 1)} ${kreis(4.5, 12, 1)} ${kreis(4.5, 18, 1)}`,
  bausteine: 'M3 5h5v14H3z M9.5 5h5v14h-5z M16 5h5v14h-5z',
  vergleich: 'M3 4h18v16H3z M12 4v16 M6.5 10h2.5 M15 10h2.5 M6.5 14h2.5 M15 14h2.5',
  ablauf: `${kreis(5, 12, 2)} ${kreis(12, 12, 2)} ${kreis(19, 12, 2)} M7 12h3 M14 12h3`,
  bild: `M3 5h18v14H3z ${kreis(8.5, 9.5, 1.5)} M21 15l-5-5L5 19`,
  zitat: 'M10 7H6a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3v1a3 3 0 0 1-3 3 M19 7h-4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3v1a3 3 0 0 1-3 3',
  abschluss: 'M5 21V4 M5 4h12l-2.5 4 2.5 4H5',
  tabelle: 'M3 5h18v14H3z M3 10h18 M3 14.5h18 M9 5v14 M15 5v14',
  /* Bearbeiten */
  betont: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z',
  layout: 'M3 4h18v16H3z M3 9h18 M10 9v11',
  design: 'M12 3s6 6.4 6 10.9a6 6 0 0 1-12 0C6 9.4 12 3 12 3z',
  schrift: 'M3 19 8 5l5 14 M5 14h6 M20 11v8 M20 15.5a2.8 2.8 0 1 1-5.6 0 2.8 2.8 0 0 1 5.6 0',
  stift: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  hoch: 'M12 19V5 M6 11l6-6 6 6',
  runter: 'M12 5v14 M6 13l6 6 6-6',
  plus: 'M12 5v14 M5 12h14',
  loeschen: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v5 M14 11v5',
  ki: 'M11 3l1.8 4.7L17.5 9.5l-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8z M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  notiz: 'M5 4h14v16H5z M8.5 9h7 M8.5 13h7 M8.5 17h4',
  inhalt: 'M4 6h16 M4 12h16 M4 18h10',
  speichern: 'M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6',
  pdf: 'M7 9V4h10v5 M6 18H4v-7h16v7h-2 M7 14h10v6H7z',
  pptx: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  neu: 'M6 3h8l4 4v14H6z M14 3v4h4 M12 11v6 M9 14h6',
  material: 'M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1L13 4.3a3.4 3.4 0 0 1 4.8 4.8l-8.3 8.3a1.8 1.8 0 0 1-2.6-2.6L14.5 7.2',
  hinweis: `${kreis(12, 12, 9)} M12 8v5 M12 16.5v.01`,
  auf: 'M6 9l6 6 6-6',
  folien: 'M4 5h12v9H4z M8 18h12V9'
};

/* Symbole für Inhalte auf Folien (Karten, Bausteine). Die KI wählt je Eintrag eines davon;
   gezeichnet wird es in der Akzentfarbe des Designsystems, in Vorschau und Export gleich. */
export const SYMBOLE = {
  ziel: `${kreis(12, 12, 9)} ${kreis(12, 12, 5)} ${kreis(12, 12, 1)}`,
  zeit: `${kreis(12, 12, 9)} M12 7v5l3 2`,
  geld: `${kreis(12, 12, 9)} M15 8.8a4 4 0 1 0 0 6.4 M7.5 11h6 M7.5 13.2h6`,
  team: `${kreis(9, 8, 3)} M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6 ${kreis(17, 9, 2.4)} M17 14c2.4.3 4 2.6 4 5`,
  person: `${kreis(12, 8, 4)} M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8`,
  sicherheit: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z M9 12l2 2 4-4',
  wachstum: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
  idee: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z',
  herz: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  prozess: 'M20 12a8 8 0 0 1-14 5.3 M4 12a8 8 0 0 1 14-5.3 M18 3v4h-4 M6 21v-4h4',
  qualitaet: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z',
  ort: `M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z ${kreis(12, 10, 2)}`,
  daten: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  diagramm: 'M3 20h18 M6 20v-6 M12 20V6 M18 20v-10',
  haken: `${kreis(12, 12, 9)} M8 12.5l2.5 2.5L16 9.5`,
  warnung: 'M12 3l9 16H3z M12 10v4 M12 16.5v.01',
  nachhaltig: 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15 M5 19c3-4 6-7 10-9',
  werkzeug: 'M15 4a5 5 0 0 0-4.6 7L4 17.4V20h2.6L13 13.6A5 5 0 0 0 20 9l-3 1-2-2 1-3z',
  dokument: 'M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h6',
  gespraech: 'M4 5h16v11H9l-5 4z M8 9.5h8 M8 12.5h5',
  start: 'M12 15l-3-3c1-4 4-8 9-9-1 5-5 8-9 9 M9 12H5l2-4h4 M12 15v4l4-2v-4 M6.5 17.5C5 19 5 21 5 21s2 0 3.5-1.5',
  welt: `${kreis(12, 12, 9)} M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18`,
  kalender: 'M4 6h16v15H4z M4 10h16 M9 3v4 M15 3v4',
  gebaeude: 'M5 21V4h10v17 M15 9h4v12 M3 21h18 M8 8h1 M11 8h1 M8 12h1 M11 12h1 M8 16h1 M11 16h1',
  lernen: 'M2 9l10-5 10 5-10 5z M6 11v5c3 2 9 2 12 0v-5',
  einkauf: 'M3 4h2l2.5 11h11L21 7H6.5 M9 20h.01 M18 20h.01',
  verbindung: `${kreis(6, 12, 2.5)} ${kreis(18, 6, 2.5)} ${kreis(18, 18, 2.5)} M8.3 10.9l7.4-3.8 M8.3 13.1l7.4 3.8`,
  pfeil: 'M5 12h14 M13 6l6 6-6 6'
};
export const SYMBOL_IDS = Object.keys(SYMBOLE);
export const SYMBOL_NAMEN = { ziel: 'Ziel', zeit: 'Zeit', geld: 'Geld', team: 'Team', person: 'Person', sicherheit: 'Sicherheit', wachstum: 'Wachstum', idee: 'Idee', herz: 'Herz', prozess: 'Prozess', qualitaet: 'Qualität', ort: 'Ort', daten: 'Daten', diagramm: 'Diagramm', haken: 'Erledigt', warnung: 'Warnung', nachhaltig: 'Nachhaltig', werkzeug: 'Werkzeug', dokument: 'Dokument', gespraech: 'Gespräch', start: 'Start', welt: 'Welt', kalender: 'Kalender', gebaeude: 'Gebäude', lernen: 'Lernen', einkauf: 'Einkauf', verbindung: 'Verbindung', pfeil: 'Pfeil' };
/* Als Bild (SVG-Daten-URL) in einer Farbe: für das Folienmodell */
export const symbolBild = (name, farbe) => SYMBOLE[name] ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="192" height="192" fill="none" stroke="${farbe}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${SYMBOLE[name]}"/></svg>`) : null;

/* Das Symbol als Inline-SVG. Dekorativ: Text daneben oder title/aria-label am Knopf sagen, was es tut. */
export const ic = (name, extra = '') => { const d = ICONS[name] || SYMBOLE[name]; return d ? `<svg class="ic${extra ? ' ' + extra : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>` : ''; };

export const ICON_CSS = `
.ic{width:1.15em;height:1.15em;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.2em}
`;
