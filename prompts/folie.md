---
name: folie
version: 1
zweck: Schreibt den Inhalt einer einzelnen Folie passend zu ihrem Layout. Wird auch zum Neu-Generieren einer Folie verwendet.
variablen: briefing, gliederung, nr, anzahl, kernaussage, hinweis, layoutId, layoutBeschreibung, felder, bilder, wunsch
---
BRIEFING (JSON):
{{briefing}}

GLIEDERUNG (die Folie mit ► ist jetzt dran):
{{gliederung}}

AUFGABE: Schreibe Folie {{nr}} von {{anzahl}}.
Kernaussage: {{kernaussage}}
Was auf die Folie gehört: {{hinweis}}

LAYOUT "{{layoutId}}": {{layoutBeschreibung}}

FELDER DIESES LAYOUTS (nur diese sind erlaubt, Limits sind hart):
{{felder}}

BILDER (nur diese IDs sind erlaubt, keine Dateipfade):
{{bilder}}

Regeln:
- inhalt: fülle die Felder passend zur Kernaussage. Pflichtfelder müssen gefüllt sein, andere Felder darfst du weglassen, wenn sie nichts beitragen.
- NUR FAKTEN AUS DEM BRIEFING: Jede Zahl, jeder Betrag, jeder Name, jede E-Mail-Adresse und jedes Zitat auf der Folie muss wörtlich im Briefing stehen. Steht dort nichts, lass das Feld weg oder setze einen Platzhalter wie [Betrag], [Name], [Kontakt]. Teile keine Summen selbst auf und erfinde keine Beispiele.
- Wiederhole nicht, was auf den Folien davor oder danach steht.
- notizen: zwei bis vier Sätze Sprechtext für die vortragende Person. Hier ist Platz für Details, die nicht auf die Folie passen.
{{wunsch}}
