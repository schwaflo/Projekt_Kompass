---
name: briefing-runde
version: 1
zweck: Eine Runde im Briefing. Sortiert die Antwort ein und wählt die nächste Frage.
variablen: felder, verlauf, feld, label, frage, antwort, zusatzErlaubt
---
STAND DES BRIEFINGS (JSON):
{{felder}}

BISHERIGER VERLAUF (zuletzt):
{{verlauf}}

AKTUELLE FRAGE zu Feld "{{feld}}" ({{label}}): {{frage}}
ANTWORT DER PERSON: {{antwort}}

AUFGABE:
1. updates: Übernimm die Antwort konkret in das Feld "{{feld}}" (status "bestaetigt"). Behalte alle Fakten (Zahlen, Namen, Termine) vollständig und wörtlich, kürze nur Füllwörter. Beantwortet die Antwort nebenbei andere Felder, trage sie dort auch ein ("bestaetigt", wenn ausdrücklich gesagt, sonst "annahme"). Bittet die Person um eine Annahme („Weiß ich nicht“), triff eine begründete, zur Präsentation passende Annahme mit status "annahme" und setze antwort_vage auf false. Bei Fakten (Zahlen, Termine, Namen) triffst du keine Annahme, sondern lässt das Feld leer.
2. antwort_vage: true, wenn die Antwort zu allgemein ist, um damit eine Präsentation zu bauen. Dann für dieses Feld nichts eintragen und als naechste_frage gezielt zum selben Feld nachfragen.
3. neue_felder: Nur wenn die Antwort einen wichtigen Aspekt zeigt, den kein Feld abdeckt (zum Beispiel erwartete Einwände des Publikums oder ein fester Zeitrahmen). {{zusatzErlaubt}} Sonst leeres Array.
4. naechste_frage: Die wichtigste noch offene Frage (Feld mit leerem wert), mit 2–4 Antwortvorschlägen, die zu den bisherigen Antworten passen. Sind alle Felder gefüllt: feld = "".
