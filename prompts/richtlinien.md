---
name: richtlinien
version: 1
zweck: Liest einen Teil der Formulierungsrichtlinien einer Marke (zum Beispiel aus einem Brand-Guide als PowerPoint) und zieht heraus, was für das Schreiben von Präsentationstexten gilt. Die Ergebnisse aller Teile führt die App ohne KI zusammen.
variablen: datei, teil, anzahl, text
---
Du liest die Formulierungsrichtlinien einer Marke aus der Datei „{{datei}}“. Das ist Teil {{teil}} von {{anzahl}}.

TEXT DIESES TEILS:
"""
{{text}}
"""

AUFGABE: Ziehe aus diesem Teil heraus, was beim Schreiben von Texten für Präsentationsfolien gilt. Nur was in diesem Text steht, nichts dazuerfinden. Teile, die nur Farben, Logos oder Bilder betreffen, ignorierst du. Kommt etwas nicht vor, gib eine leere Liste zurück.

- tonalitaet: wie die Marke klingt, als kurze Aussagen, zum Beispiel „Klar und nahbar, nie belehrend“.
- anrede: "du" oder "sie", wenn der Text festlegt, wie Leserinnen und Leser angesprochen werden, sonst "unklar".
- regeln: konkrete Schreibregeln als kurze Anweisung, zum Beispiel „Aktiv formulieren“, „Überschriften ohne Punkt“, „Zahlen immer als Ziffer“. Höchstens zehn, die wichtigsten zuerst.
- verboten: einzelne Wörter oder kurze Wendungen, die nicht verwendet werden sollen. Genau so geschrieben wie im Text.
- ersetzen: Paare aus „statt“ (nicht verwenden) und „besser“ (stattdessen verwenden), zum Beispiel statt „Kunden“, besser „Kundinnen und Kunden“.
- schreibweisen: verbindliche Schreibweisen von Marken-, Produkt- und Fachbegriffen mit kurzer Erklärung, zum Beispiel „nordlicht immer klein geschrieben“.
- beispiele: Formulierungsbeispiele aus dem Text, jeweils „schlecht“ (wie es nicht klingen soll, darf leer sein) und „gut“ (wie es klingen soll). Wörtlich übernehmen.
