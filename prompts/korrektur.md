---
name: korrektur
version: 1
zweck: Wird an den ursprünglichen Prompt angehängt, wenn die Antwort die Prüfung nicht bestanden hat (höchstens zwei Mal, danach greift die automatische Kürzung).
variablen: antwort, fehler
---


ACHTUNG, KORREKTUR NÖTIG. Deine letzte Antwort war:
{{antwort}}

Sie ist ungültig, weil:
{{fehler}}

Antworte erneut mit dem vollständigen JSON und behebe genau diese Punkte. Ändere sonst nichts.
