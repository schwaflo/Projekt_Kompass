/* ============================================================
   Bildanalyse – Skizzen
   Ausprobieren wie auf Papier: mehrere Entwürfe nebeneinander,
   ansehen, urteilen, die besten weiterentwickeln.
   1. Die App legt Grundskizzen an, die sich deutlich
      unterscheiden.
   2. Die KI entwickelt Konzepte aus dem Bildinhalt. Ein Konzept
      ist eine Kombination aus Layout-Regel, Farbfläche, Schmuck,
      Farbwelt und Schriftbehandlung; gesetzt wird es von der App
      nach den geprüften Regeln.
   3. Das Vision-Modell sieht jede fertige Skizze als Bild und
      bewertet sie.
   Alles ohne Browser lauffähig.
   ============================================================ */
import { istHex, hexNorm } from './kern.js';
import { FLAECHEN, SCHMUCK } from './stil.js';
import { REGELN } from './design.js';

const S = { type: 'string' }, I = { type: 'integer' };
const text = (t, max) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, max);
const hex = h => (istHex(h) ? hexNorm(h) : '');

/* Auf welcher Seite liegt das Motiv? Dort, wo weniger ruhige Zellen sind. */
export function motivSeite(analyse) {
  const m = analyse.free_map; let l = 0, r = 0;
  for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) { if (x < m.cols / 2) l += m.free[y * m.cols + x]; else r += m.free[y * m.cols + x]; }
  return l <= r ? 'links' : 'rechts';
}

/* ---------- Grundskizzen der App ---------- */
/* Sechs Richtungen, die sich klar unterscheiden, damit das Blatt nicht sechsmal dasselbe zeigt */
export function eigeneSkizzen(analyse) {
  const motiv = motivSeite(analyse), frei = motiv === 'links' ? 'rechts' : 'links';
  const an = { an: true };
  return [
    { name: 'Ruhe neben dem Motiv', idee: `Der Text steht ohne Zutat auf der ruhigen Fläche ${frei}, auf Höhe des Motivs.`, regel: 'auto', stil: {} },
    { name: 'Sockel', idee: 'Eine Farbfläche unten trägt den Text, das Foto bleibt darüber frei.', regel: 'auto', stil: { flaeche: { art: 'sockel' }, schmuck: { akzentlinie: an } } },
    { name: 'Band über dem Motiv', idee: `Ein Farbband ${motiv} schneidet das Motiv an, gekreuzte Linien verbinden Band und Foto.`, regel: 'auto', stil: { flaeche: { art: 'band', seite: motiv, groesse: 26 }, schmuck: { diagonale: { an: true, richtung: 'kreuz' } } } },
    { name: 'Diagonaler Schnitt', idee: `Eine schräge Fläche aus der Ecke unten ${frei} gibt dem Text eine eigene Bühne.`, regel: 'auto', stil: { flaeche: { art: 'diagonale', seite: frei === 'rechts' ? 'ur' : 'ul', groesse: 115 }, schmuck: { diagonale: an } } },
    { name: 'Plakat', idee: 'Die Headline läuft in Versalien übergroß über das ganze Bild, auch über das Motiv.', regel: 'uebergross', stil: { typo: { versal: true } } },
    { name: 'Goldener Schnitt', idee: 'Der Block sitzt streng auf den Linien des Goldenen Schnitts, ein Balken betont seine Kante.', regel: 'golden', stil: { schmuck: { balken: an } } }
  ].map(s => ({ ...s, quelle: 'app' }));
}

/* ---------- Konzepte der KI ---------- */
export const SKIZZEN_SYSTEM = 'Du bist Art Director und skizzierst Entwürfe für Text auf einem Foto. Du denkst vom Bild aus: Motiv, Blickrichtung, Linien, Stimmung, Farben. Antworte ausschließlich mit JSON, alles auf Deutsch.';
const alleSeiten = [...new Set(Object.values(FLAECHEN).flatMap(f => Object.keys(f.seiten || {})))];
export function skizzenSchema(anzahl = 6) {
  return {
    type: 'object',
    properties: { skizzen: { type: 'array', minItems: anzahl, maxItems: anzahl, items: {
      type: 'object',
      properties: {
        name: S, idee: S,
        regel: { type: 'string', enum: Object.keys(REGELN) },
        flaeche: { type: 'string', enum: Object.keys(FLAECHEN) },
        flaeche_seite: { type: 'string', enum: ['', ...alleSeiten] },
        flaeche_groesse: I,
        schmuck: { type: 'array', items: { type: 'string', enum: Object.keys(SCHMUCK) } },
        linie: { type: 'string', enum: ['steigend', 'fallend', 'kreuz'] },
        versal: { type: 'boolean' },
        farbe_schrift: S, farbe_akzent: S, farbe_flaeche: S
      },
      required: ['name', 'idee', 'regel', 'flaeche', 'flaeche_seite', 'flaeche_groesse', 'schmuck', 'linie', 'versal', 'farbe_schrift', 'farbe_akzent', 'farbe_flaeche']
    } } },
    required: ['skizzen']
  };
}
const liste = o => Object.entries(o).map(([k, v]) => `${k} (${v.name}: ${v.info})`).join('; ');
/* vorher: bewertete Skizzen der letzten Runde, die besten zuerst. Dann entwickelt die KI weiter. */
export function skizzenPrompt(analyse, texte, { anzahl = 6, vorher = [] } = {}) {
  const grob = Object.entries(analyse.grids || {}).sort((a, b) => a[1].length - b[1].length)[0];
  const o = analyse.overall;
  return `BILD
${o ? `Hauptmotiv: ${o.main_subject}\nBildaufbau: ${o.composition}\nStimmung: ${o.mood}\nStil: ${o.style}\nLicht: ${o.lighting}` : '(keine Beschreibung)'}
Das Motiv liegt eher ${motivSeite(analyse)}.
${grob ? 'BILDBEREICHE\n' + grob[1].map(k => `- ${k.label}: ${k.description || (k.text_space ? 'ruhige Fläche' : 'unruhig')}`).join('\n') : ''}
FARBEN DES BILDES (Hex, Anteil): ${(analyse.palette || []).map(c => `${c.hex} ${Math.round(c.percent)} %`).join(', ')}

TEXTE
Headline: ${texte.headline || '(offen)'}
Subline: ${texte.subline || '(keine)'}
Aufruf: ${texte.cta || '(keiner)'}

BAUKASTEN (die App setzt daraus den Entwurf und prüft Lesbarkeit, Ränder und Kontrast selbst)
- regel: ${liste(REGELN)}
- flaeche: ${liste(FLAECHEN)}
  flaeche_seite: bei band links|rechts, bei sockel unten|oben, bei diagonale ul|ur|ol|or, sonst "". flaeche_groesse: Prozent des Bildes (band 8–60, sockel 15–70, diagonale 30–170), sonst 0.
- schmuck: beliebig viele aus ${liste(SCHMUCK)}. linie: Richtung der diagonalen Linie.
- versal: Headline in Großbuchstaben.
- farbe_schrift, farbe_akzent, farbe_flaeche: Hex-Codes (#RRGGBB) oder "" für Töne aus dem Bild. Die Fläche braucht deutlichen Kontrast zur Schrift.

${vorher.length ? `BISHERIGE SKIZZEN MIT URTEIL (beste zuerst)\n${vorher.map((s, i) => `${i + 1}. „${s.name}“ (${s.regel}${s.stil && s.stil.flaeche ? ', Fläche ' + s.stil.flaeche.art : ''}): ${s.wertung ? `${s.wertung.summe} von 15 Punkten. ${s.wertung.urteil} Besser wäre: ${s.wertung.verbessern}` : 'ohne Urteil'}`).join('\n')}\n\nAUFGABE: Entwickle daraus ${anzahl} neue Skizzen. Nimm, was an den besten funktioniert, behebe die genannten Schwächen und wage in mindestens einer Skizze etwas deutlich anderes.` : `AUFGABE: Skizziere ${anzahl} deutlich verschiedene Entwürfe für dieses Bild, wie ein Designer, der auf Papier ausprobiert. Mindestens eine Skizze bricht bewusst eine Regel.`}
- name: 2–4 Wörter. idee: ein Satz, der sagt, worauf im Bild sich der Entwurf bezieht (Geste, Blick, Linie, Farbe, Stimmung) und was er daraus macht.
- Wiederhole keine Kombination. Farbflächen und Schmuck nur, wenn sie dem Bild etwas geben.`;
}
/* Antwort der KI in Skizzen übersetzen; alles Unbekannte fällt weg */
export function leseSkizzen(antwort = {}) {
  const out = [];
  for (const s of Array.isArray(antwort.skizzen) ? antwort.skizzen : []) {
    if (!s || typeof s !== 'object') continue;
    const art = FLAECHEN[s.flaeche] ? s.flaeche : 'keine', schmuck = {};
    for (const id of Array.isArray(s.schmuck) ? s.schmuck : []) if (SCHMUCK[id]) schmuck[id] = { an: true, ...(id === 'diagonale' && ['steigend', 'fallend', 'kreuz'].includes(s.linie) ? { richtung: s.linie } : {}) };
    const stil = { farben: { schrift: hex(s.farbe_schrift), akzent: hex(s.farbe_akzent), flaeche: hex(s.farbe_flaeche) }, schmuck, typo: { versal: s.versal === true } };
    if (art !== 'keine') stil.flaeche = { art, ...(s.flaeche_seite ? { seite: s.flaeche_seite } : {}), ...(Number(s.flaeche_groesse) > 0 ? { groesse: Number(s.flaeche_groesse) } : {}) };
    out.push({ name: text(s.name, 40) || 'Skizze', idee: text(s.idee, 240), regel: REGELN[s.regel] ? s.regel : 'auto', stil, quelle: 'ki' });
  }
  /* gleiche Kombination nur einmal */
  const marke = s => JSON.stringify([s.regel, s.stil.flaeche || null, Object.keys(s.stil.schmuck).sort(), s.stil.typo.versal, s.stil.farben]);
  return out.filter((s, i) => out.findIndex(o => marke(o) === marke(s)) === i);
}

/* ---------- Ansehen und urteilen ---------- */
export const BEWERTUNG_SYSTEM = 'Du bist Art Director und beurteilst Entwurfsskizzen streng und konkret. Du beschreibst nur, was im Bild zu sehen ist. Antworte ausschließlich mit JSON, auf Deutsch.';
export const BEWERTUNG_SCHEMA = {
  type: 'object',
  properties: { lesbarkeit: I, motiv: I, spannung: I, urteil: S, verbessern: S },
  required: ['lesbarkeit', 'motiv', 'spannung', 'urteil', 'verbessern']
};
export const bewertungPrompt = (skizze, texte) => `Das Bild ist eine Entwurfsskizze: ein Foto mit dem Text „${texte.headline || ''}“${texte.subline ? ` und der Unterzeile „${texte.subline}“` : ''}. Idee der Skizze: ${skizze.idee || skizze.name}

Sieh genau hin und bewerte mit 1 (schwach) bis 5 (stark):
- lesbarkeit: Ist der Text auf einen Blick lesbar? Stimmen Größe, Kontrast und Hierarchie?
- motiv: Arbeitet der Text mit dem Motiv (Blickrichtung, Geste, Linien), oder stört oder verdeckt er es?
- spannung: Hat der Entwurf Charakter und eine klare Komposition, oder wirkt er beliebig?
- urteil: ein Satz, was funktioniert oder nicht.
- verbessern: ein Satz, was du als Nächstes ändern würdest.
Sei kritisch: 5 gibt es nur, wenn nichts zu verbessern ist.`;
export function leseBewertung(antwort = {}) {
  const p = n => Math.max(1, Math.min(5, Math.round(Number(n)) || 1));
  const w = { lesbarkeit: p(antwort.lesbarkeit), motiv: p(antwort.motiv), spannung: p(antwort.spannung), urteil: text(antwort.urteil, 360), verbessern: text(antwort.verbessern, 360) };
  w.summe = w.lesbarkeit + w.motiv + w.spannung;
  return w;
}
/* Beste zuerst: Punkte, bei Gleichstand die Lesbarkeit; Skizzen ohne Urteil ans Ende */
export const rangfolge = skizzen => skizzen.map((s, i) => ({ s, i })).sort((a, b) => (b.s.wertung ? b.s.wertung.summe : -1) - (a.s.wertung ? a.s.wertung.summe : -1) || (b.s.wertung ? b.s.wertung.lesbarkeit : 0) - (a.s.wertung ? a.s.wertung.lesbarkeit : 0) || a.i - b.i).map(x => x.s);
