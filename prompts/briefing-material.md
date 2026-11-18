---
name: briefing-material
version: 2
zweck: Sortiert Material, das die Person mitten im Briefing hinzufügt (Bild, Tabelle, Text), ins Briefing ein und stellt die offene Frage so, dass sie das Material aufgreift.
variablen: art, felder, material, bisher, frage, auftrag
---
ART DER PRÄSENTATION: {{art}}

STAND DES BRIEFINGS (JSON):
{{felder}}

NEUES MATERIAL DER PERSON (es kommt sicher in die Präsentation):
{{material}}

MATERIAL, DAS SCHON DA WAR:
{{bisher}}

OFFENE FRAGE {{frage}}

AUFGABE:
1. updates: Was geht aus dem neuen Material eindeutig hervor? Trage es in die passenden Punkte ein, höchstens drei Einträge, und jeden Punkt höchstens einmal. Zahlen aus einer Tabelle fasst du in einem Eintrag zusammen, im Punkt, der nach Daten, Zahlen oder Belegen fragt. Status "bestaetigt" nur für das, was wörtlich im Material steht (Zahlen, Namen, Termine, Ergebnisse), sonst "annahme". Zahlen und Namen wörtlich übernehmen. Überschreibe nichts, was die Person schon bestätigt hat. Steht im Material nichts Verwertbares für einen Punkt, lass ihn weg.
2. naechste_frage: {{auftrag}}
   Greife das Material auf, wo es weiterhilft: frage zum Beispiel, welche Aussage eine Tabelle tragen soll, was hinter einer auffälligen Zahl steckt oder wofür ein Foto steht. Frage nie nach etwas, das das Material schon beantwortet. Kurz und wie im Gespräch, dazu 2–4 kurze Antwortvorschläge, die zu diesem Material passen.
