---
name: gestalten
version: 1
zweck: Schlägt für eine fertig geschriebene Folie neue Positionen und Größen der Inhaltsflächen vor, damit Inhalt und Gestaltung besser zusammenpassen. Läuft nur, wenn die Person der KI erlaubt, Layouts anzupassen. Die App prüft jeden Vorschlag und verwirft, was über den Rand ragt, sich überlappt oder Text abschneidet.
variablen: form, kernaussage, layoutBeschreibung, elemente, feste, wunsch
---
Du gestaltest eine einzelne Präsentationsfolie im Format 16:9. Alle Angaben sind Prozent der Folie: x nach rechts, y nach unten, jeweils 0 bis 100.

FORM DER FOLIE: {{form}}
KERNAUSSAGE: {{kernaussage}}
LAYOUT: {{layoutBeschreibung}}

INHALTSFLÄCHEN (id – Art – x, y, w, h – wie voll die Fläche ist):
{{elemente}}

FESTE GESTALTUNG DER MARKE (darf nicht verdeckt werden):
{{feste}}

AUFGABE: Schlage Änderungen an Position und Größe der Inhaltsflächen vor, damit die Folie klarer und stärker wirkt.
- Ändere nur, was die Folie deutlich besser macht. Keine Änderung ist eine gute Antwort, wenn alles passt.
- Eine Fläche über 100 % ist zu voll: Sie braucht mehr Platz, sonst wird die Schrift zu klein.
- Wenig Text in einer großen Fläche (unter 40 %): Fläche verkleinern, damit die Aussage näher an die anderen Elemente rückt und Weißraum gezielt entsteht.
- Betonte Aussagen und Zahlen dürfen größer werden. Bilder, die die Aussage tragen, dürfen mehr Fläche bekommen.
- Halte mindestens 4 % Abstand zum Folienrand. Nur Bilder dürfen bis an den Rand gehen.
- Textflächen dürfen sich nicht überlappen und keine feste Gestaltung verdecken.
- Kanten bündig halten: Elemente, die untereinander stehen, bekommen denselben x-Wert.
- spiegeln: true nur, wenn ein Bild seitlich steht und die Folie dadurch mehr Abwechslung zur vorherigen bekommt. Sonst false.
- begruendung: ein Satz, was die Änderung bewirkt.
{{wunsch}}
