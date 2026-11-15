---
name: briefing-runde
version: 3
zweck: Eine Runde im Briefing. Sortiert die Antwort ein und stellt die nächste Frage nach dem Auftrag, den die App vorgibt.
variablen: art, felder, verlauf, feld, label, frage, antwort, nachfrageErlaubt, auftrag
---
ART DER PRÄSENTATION: {{art}}

STAND DES BRIEFINGS (JSON):
{{felder}}

BISHERIGER VERLAUF (zuletzt):
{{verlauf}}

AKTUELLE FRAGE zu „{{label}}“ (feld "{{feld}}"): {{frage}}
ANTWORT DER PERSON: {{antwort}}

AUFGABE:
1. updates: Übernimm die Antwort konkret in den Punkt "{{feld}}" (status "bestaetigt"). Behalte alle Fakten (Zahlen, Namen, Orte, Termine) vollständig und wörtlich, kürze nur Füllwörter. Beantwortet die Antwort nebenbei andere Punkte, trage sie dort auch ein (höchstens drei Einträge insgesamt, nur echte neue Information) ("bestaetigt", wenn ausdrücklich gesagt, sonst "annahme"). Die Kernbotschaft darfst du als "annahme" ableiten oder schärfen. Bittet die Person um eine Annahme („Weiß ich nicht“), triff eine begründete, zur Präsentation passende Annahme mit status "annahme". Bei Fakten wie Zahlen, Terminen oder Namen triffst du keine Annahme.
2. antwort_vage: {{nachfrageErlaubt}}
3. naechste_frage: {{auftrag}}
   Die Frage knüpft an das Gesagte an (greife ein Detail aus der Antwort auf), ist kurz und klingt wie ein Gespräch, nicht wie ein Formular. Frage nie nach etwas, das schon beantwortet ist. Dazu 2–4 kurze Antwortvorschläge, die zu genau diesem Vorhaben passen.
