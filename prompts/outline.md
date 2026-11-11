---
name: outline
version: 1
zweck: Erstellt aus dem Briefing die Gliederung: Storyline, Folienreihenfolge und je Folie ein Layout.
variablen: briefing, layouts, folienzahl
---
BRIEFING (JSON):
{{briefing}}

VERFÜGBARE LAYOUTS (id – wofür es gedacht ist):
{{layouts}}

AUFGABE: Erstelle die Gliederung für eine Präsentation mit etwa {{folienzahl}} Folien.
- titel: kurzer Titel der Präsentation (höchstens 40 Zeichen). Er erscheint in der Fußzeile.
- storyline: der rote Faden in zwei Sätzen (Ausgangslage, Wendepunkt, Ziel).
- folien: in Reihenfolge. Je Folie:
  - layoutId: genau eine id aus der Liste. Erfinde keine eigenen.
  - kernaussage: die eine Aussage dieser Folie als ganzer Satz.
  - inhalt: in Stichworten, was auf die Folie gehört. Nur Informationen aus dem Briefing.

Regeln:
- Die erste Folie ist die Titelfolie, die letzte die Abschlussfolie mit der Handlungsaufforderung aus dem Briefing.
- Alle Pflichtinhalte aus dem Briefing kommen vor.
- Wähle das Layout nach dem Inhalt: Kennzahlen nur, wenn das Briefing echte Zahlen enthält. Zeitstrahl nur für eine zeitliche Abfolge. Zitat nur, wenn das Briefing ein Zitat oder eine prägnante Kernaussage hergibt.
- Wechsle die Layouts ab. Nicht mehr als drei gleiche Layouts hintereinander.
- Bei mehr als acht Folien gliedern Kapiteltrenner die Präsentation.
