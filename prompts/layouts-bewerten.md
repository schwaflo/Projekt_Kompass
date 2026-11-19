---
name: layouts-bewerten
version: 1
zweck: Nach dem Import einer PowerPoint-Vorlage. Die KI sieht jedes Layout als Steckbrief (Name, Herkunft, Flächen mit Schriftgröße und Lage, Text der Beispielfolie) und sagt, wofür es gedacht ist und welche Wirkungen es trägt. Die App nutzt das bei der Layoutwahl zusätzlich zur eigenen Rechnung.
variablen: vorlage, wirkungen, layouts
---
Du ordnest die Layouts einer PowerPoint-Vorlage ein, damit eine App für jede Folie das passende Layout wählen kann.

VORLAGE: {{vorlage}}

WIRKUNGEN, die eine Folie haben kann:
{{wirkungen}}

LAYOUTS DER VORLAGE (Flächen in Prozent der Folie; „Beispiel“ ist der Text, den die Vorlage selbst in dieses Feld geschrieben hat):
{{layouts}}

AUFGABE, für jedes Layout:
- zweck: wofür die Vorlage das Layout gedacht hat, in einem kurzen Satz für Menschen. Nutze Namen und Beispieltexte: „Agenda“, „Kapitel 2“, „Vielen Dank“, „Unsere Zahlen“ verraten den Zweck.
- formen: die 1 bis 4 Wirkungen, für die das Layout am besten taugt, die beste zuerst. Nur Wirkungen, deren Inhalt in die Flächen passt: Kennzahlen brauchen mehrere kleine Flächen für Zahlen, Vergleich zwei Spalten, Bild eine Bildfläche, Tabelle eine große freie Fläche oder eine Tabellenfläche. Ein Layout mit sehr großer Schrift und wenig Text ist ein Kapitel, ein Kernsatz oder eine Zahl, keine Liste.
- meiden: true nur für Layouts, die für eine neue Präsentation nicht taugen: Agenda oder Inhaltsverzeichnis mit festen Punkten, rechtliche Hinweise, Platzhalter-Sammlungen, Folien nur mit Logo, Anleitungen zur Vorlage. Sonst false.

Bewerte nur, was im Steckbrief steht. Erfinde keine Flächen dazu.
