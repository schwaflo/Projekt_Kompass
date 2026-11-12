---
name: outline
version: 2
zweck: Erstellt aus dem Briefing die Gliederung: Storyline, Folienreihenfolge und je Folie ein Layout, nach der Dramaturgie der Präsentationsart.
variablen: art, briefing, dramaturgie, stil, layoutHinweis, layouts, folienzahl
---
ART DER PRÄSENTATION: {{art}}

BRIEFING (JSON):
{{briefing}}

DRAMATURGIE FÜR DIESE ART (Reihenfolge der Abschnitte):
{{dramaturgie}}

STIL: {{stil}}

VERFÜGBARE LAYOUTS (id – wofür es gedacht ist):
{{layouts}}

LAYOUTS FÜR DIESE ART: {{layoutHinweis}}

AUFGABE: Erstelle die Gliederung für eine Präsentation mit etwa {{folienzahl}} Folien.
- titel: kurzer Titel (höchstens 40 Zeichen), der neugierig macht. Er erscheint in der Fußzeile. Nicht das Wort „Präsentation“ oder „Pitch“.
- storyline: der rote Faden in zwei Sätzen.
- kernbotschaft: der eine Satz, der hängen bleiben soll. Steht er im Briefing, übernimm ihn, sonst leite ihn ab.
- folien: in Reihenfolge, entlang der Dramaturgie. Je Folie:
  - abschnitt: welcher Abschnitt der Dramaturgie das ist.
  - layoutId: genau eine id aus der Liste. Wähle nach dem Inhalt: eine starke Einzelaussage → statement; eine einzelne beeindruckende Zahl → big-number (nur mit einer Zahl aus dem Briefing); drei gleichwertige Punkte → cards; Gegensatz oder vorher/nachher → two-column; zeitliche Abfolge → timeline; mehrere Zahlen → kpi-grid (nur mit Zahlen aus dem Briefing); Stimmung → image-full, image-left oder image-right.
  - kernaussage: die eine Aussage dieser Folie als ganzer, konkreter Satz über die Sache selbst, nicht über die Präsentation.
  - inhalt: in Stichworten, was auf die Folie gehört. Nur Informationen aus dem Briefing.

Regeln:
- Die erste Folie ist die Titelfolie, die letzte die Abschlussfolie mit der Bitte oder Handlungsaufforderung aus dem Briefing.
- Abwechslung: Keine zwei gleichen Layouts hintereinander. Nach zwei textlastigen Folien kommt eine Folie mit Bild, großer Aussage oder großer Zahl.
- Kapiteltrenner (section) nur bei mehr als acht Folien.
- Fehlt im Briefing eine Zahl, plane keine Zahlenfolie.
