---
name: folie
version: 6
zweck: Schreibt den Inhalt einer einzelnen Folie passend zu ihrem Layout. Wird auch zum Neu-Generieren einer Folie verwendet.
variablen: art, stil, briefing, gliederung, nr, anzahl, abschnitt, form, kernaussage, hinweis, layoutId, layoutBeschreibung, felder, bilder, material, wunsch
---
ART DER PRÄSENTATION: {{art}}
STIL: {{stil}}

BRIEFING (JSON):
{{briefing}}

GLIEDERUNG (die Folie mit ► ist jetzt dran):
{{gliederung}}

AUFGABE: Schreibe Folie {{nr}} von {{anzahl}}.
Abschnitt der Dramaturgie: {{abschnitt}}
Form: {{form}}
Kernaussage: {{kernaussage}}
Was auf die Folie gehört: {{hinweis}}

LAYOUT "{{layoutId}}": {{layoutBeschreibung}}

FELDER DIESES LAYOUTS (nur diese sind erlaubt, Limits sind hart):
{{felder}}

BILDER (nur diese IDs sind erlaubt, keine Dateipfade):
{{bilder}}
{{material}}
Regeln:
- ÜBERSCHRIFTEN sprechen über die Sache, nie über die Präsentation: nicht „Willkommen“, nicht „Agenda“, nicht „Präsentation“, „Pitch“ oder „Folie“. Eine Überschrift ist eine konkrete Behauptung, die man sofort versteht und die neugierig macht. Falsch: „Verbesserung des Besuchserlebnisses“. Richtig: „Besucher finden den Eingang erst nach zehn Minuten“.
- Ist die Folie BETONT (siehe Form), formuliere besonders knapp und kräftig: wenige starke Wörter, die man aus der letzten Reihe liest.
- Halte dich an den STIL oben. Weniger Wörter sind besser, solange die Aussage konkret bleibt.
- inhalt: fülle die Felder passend zur Kernaussage. Pflichtfelder müssen gefüllt sein, andere Felder darfst du weglassen, wenn sie nichts beitragen.
- NUR FAKTEN AUS BRIEFING UND MATERIAL: Jede Zahl, jeder Betrag, jeder Name, jede E-Mail-Adresse und jedes Zitat auf der Folie muss wörtlich im Briefing oder im Material der Person stehen. Steht dort nichts, lass das Feld weg oder setze einen Platzhalter wie [Betrag], [Name], [Kontakt]. Teile keine Summen selbst auf und erfinde keine Beispiele.
- Wiederhole nicht, was auf den Folien davor oder danach steht.
- OPTIONALE FELDER ohne passende Information lässt du weg, statt [Platzhalter] einzusetzen. Erfinde keine Namen und keine Kontaktdaten.
- FEHLT EINE ZAHL, formuliere die Aussage ohne Zahl („Gäste warten deutlich kürzer“), statt „[Zahl] %“ zu schreiben. Platzhalter in eckigen Klammern nur für Angaben, die die Person sicher nachtragen kann, etwa ein Datum.
- Halte die Zeichenlimits beim Schreiben ein: lieber kürzer formulieren, als dass der Text abgeschnitten wird.
- notizen: zwei bis vier Sätze Sprechtext für die vortragende Person. Hier ist Platz für Details, die nicht auf die Folie passen.
{{wunsch}}
