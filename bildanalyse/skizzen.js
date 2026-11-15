/* ============================================================
   Bildanalyse – Skizzen
   Ausprobieren wie auf Papier: mehrere Entwürfe nebeneinander,
   ansehen, urteilen, die besten weiterentwickeln.
   1. Die App legt Grundskizzen an, die sich deutlich
      unterscheiden.
   2. Die KI entwirft frei (frei.js): Sie sieht das Foto und setzt
      Texte, Flächen und Linien selbst.
   3. Das Vision-Modell sieht jede fertige Skizze als Bild und
      bewertet sie.
   Alles ohne Browser lauffähig.
   ============================================================ */

const S = { type: 'string' }, I = { type: 'integer' };
const text = (t, max) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, max);

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

/* ---------- Ansehen und urteilen ---------- */
export const BEWERTUNG_SYSTEM = 'Du bist Art Director und beurteilst Entwurfsskizzen streng und konkret. Du beschreibst nur, was im Bild zu sehen ist. Antworte ausschließlich mit JSON, auf Deutsch.';
export const BEWERTUNG_SCHEMA = {
  type: 'object',
  properties: { lesbarkeit: I, motiv: I, spannung: I, urteil: S, verbessern: S },
  required: ['lesbarkeit', 'motiv', 'spannung', 'urteil', 'verbessern']
};
export const bewertungPrompt = (skizze, texte) => `Das Bild ist eine Entwurfsskizze: ein Foto mit dem Text „${texte.headline || ''}“${texte.subline ? ` und der Unterzeile „${texte.subline}“` : ''}. Idee der Skizze: ${skizze.idee || skizze.name}
Beurteile den Entwurf als Ganzes und ohne Vorliebe für brave Lösungen: Ein mutiger Entwurf, der trägt, ist besser als ein korrekter, der langweilt.

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
