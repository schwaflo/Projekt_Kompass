---
name: briefing-runde
version: 4
zweck: Eine Runde im Briefing. Sortiert die Antwort ein und stellt die nächste Frage nach dem Auftrag, den die App vorgibt.
variablen: art, felder, verlauf, material, feld, label, frage, antwort, nachfrageErlaubt, auftrag
---
ART DER PRÄSENTATION: {{art}}

STAND DES BRIEFINGS (JSON):
{{felder}}

BISHERIGER VERLAUF (zuletzt):
{{verlauf}}

MATERIAL DER PERSON (kommt sicher in die Präsentation; kann leer sein):
{{material}}

AKTUELLE FRAGE zu „{{label}}“ (feld "{{feld}}"): {{frage}}
ANTWORT DER PERSON: {{antwort}}

AUFGABE:
1. updates: Übernimm die Antwort konkret in den Punkt "{{feld}}" (status "bestaetigt"). Behalte alle Fakten (Zahlen, Namen, Orte, Termine) vollständig und wörtlich, kürze nur Füllwörter. Beantwortet die Antwort nebenbei andere Punkte, trage sie dort auch ein (höchstens drei Einträge insgesamt, nur echte neue Information) ("bestaetigt", wenn ausdrücklich gesagt, sonst "annahme"). Die Kernbotschaft darfst du als "annahme" ableiten oder schärfen. Bittet die Person um eine Annahme („Weiß ich nicht“), triff eine begründete, zur Präsentation passende Annahme mit status "annahme". Bei Fakten wie Zahlen, Terminen oder Namen triffst du keine Annahme.
2. antwort_vage: {{nachfrageErlaubt}}
3. naechste_frage: {{auftrag}}
   Die Frage knüpft an das Gesagte an (greife ein Detail aus der Antwort oder aus dem Material auf), ist kurz und klingt wie ein Gespräch, nicht wie ein Formular. Frage nie nach etwas, das schon beantwortet ist, auch nicht durch das Material. Dazu 2–4 kurze Antwortvorschläge, die zu genau diesem Vorhaben passen.
