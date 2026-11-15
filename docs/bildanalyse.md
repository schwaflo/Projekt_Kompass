# Bild-Design: Bilder analysieren und Text darauf setzen

Das Design-Studio hat neben dem **Entwurf** einen zweiten Bereich: **Bild-Design**. Er misst ein Foto aus, zeigt, wo es ruhig genug für Text ist und wo es unscharf wird, und lässt daraus einen Vorschlag entstehen, wo Headline, Subline und CTA stehen. Alles läuft im Browser; die KI ist dein lokaler Server (Ollama oder ein OpenAI-kompatibler Server).

## Ablauf

Einstieg: **Bild-Design** in der Kopfzeile oder „Bild-Design öffnen“ auf der Startseite. Eine Projektanalyse ist dafür nicht nötig. Läuft schon ein Projekt, erreichst du den Bereich auch im Design-Studio über den Umschalter **Entwurf / Bild-Design**; nur dann gibt es „In den Flyer übernehmen“.

1. **Bild wählen.** Bilder hochladen oder eines der vorhandenen anklicken. Mehrere Bilder lassen sich mit „Alle Bilder analysieren“ in einem Durchgang verarbeiten.
2. **Raster wählen.** Vorgabe sind 2 × 2 und 4 × 2, dazu 4 × 4 und eigene Raster (Spalten × Zeilen, zum Beispiel `3x3`).
3. **Bild analysieren.** Nach dem Hochladen fragt die App, ob sie das neue Foto analysieren soll. Der Knopf dafür steht links oben unter „Bild“ und erscheint nur, wenn es etwas zu tun gibt: bei einem Foto ohne Analyse oder nachdem du ein anderes Raster gewählt hast. Eine erneute Analyse desselben Stands startest du unter „Modelle“.
   - Die App misst jede Kachel (ohne KI, immer mit demselben Ergebnis).
   - Das Vision-Modell beschreibt das Gesamtbild: Hauptmotiv, Bildaufbau, Stimmung, Stil, Licht.
   - Das Vision-Modell beschreibt jede Kachel in höchstens zwei Sätzen. Das lässt sich abschalten, wenn es schnell gehen soll.
4. **Analyse prüfen.** Die Debug-Vorschau zeigt das Bild mit Raster: Freiraum für Text grün, unscharfe Bereiche rot schraffiert. Darunter stehen die Beschreibung des Gesamtbilds, die Farben und alle Messwerte je Kachel.
5. **Design-Vorschlag.** Die App berechnet aus der Analyse und den Texten aus „Texte fürs Bild“ bis zu vier geprüfte Kompositionen und zeigt die beste sofort. Das Design-Modell wählt auf Wunsch eine davon aus und begründet sie (siehe unten).
6. **Weiterverwenden.** Analyse und Vorschlag als JSON speichern, die Debug-Vorschau als PNG, die Ansicht als eigenständige HTML-Datei. **In den Flyer übernehmen** setzt das Bild als Hintergrund des Entwurfs und übergibt die Farbpalette.

## Modelle

Unter „Modelle“ wählst du getrennt, welches Modell das Bild sieht und welches den Vorschlag zusammenführt. „Automatisch“ nimmt `qwen2.5vl` für das Sehen und Gemma 4 für das Design, wenn sie installiert sind, sonst das Modell von der Startseite.

```
ollama pull qwen2.5vl:7b
```

Das Vision-Modell muss Bilder verstehen. `gemma4:12b-mlx` kann beides und braucht für ein Bild mit 28 Kacheln (2 × 2, 4 × 2, 4 × 4) rund 40 Sekunden, für den Vorschlag rund 10 Sekunden.

## Was je Kachel gemessen wird

| Feld | Bedeutung |
|---|---|
| `id`, `row`, `col`, `label` | Position, zum Beispiel `4x2:r1c3` = Raster 4 × 2, Zeile 1, Spalte 3, „oben Mitte rechts“ |
| `x`, `y`, `width`, `height` | Pixel-Koordinaten im Bild |
| `colors` | bis zu 3 dominante Farben als Hex mit Anteil in Prozent (k-Means mit festem Startpunkt, kein Zufall) |
| `brightness`, `contrast` | Mittelwert und Streuung der Helligkeit (0–255) |
| `sharpness` | `laplace_variance` (Varianz des Laplace-Operators), `label` (scharf / leicht unscharf / blurry), `reliable` |
| `edge_density`, `color_variance` | Anteil Kantenpixel und Streuung der Farbe |
| `text_space`, `text_space_score` | Freiraum für Text: ja/nein und Score von 0 bis 1 |
| `text_color`, `text_tone`, `text_contrast` | empfohlene Schriftfarbe (hell oder dunkel) und ihr WCAG-Kontrast zum Hintergrund |
| `description` | Beschreibung des Vision-Modells |

Gut zu wissen:

- **Schärfe** hängt von der Auflösung ab. Deshalb wird jedes Bild für die Messung auf dieselbe längste Seite verkleinert (Vorgabe 1024 px). Die Koordinaten im JSON bleiben die des Bildes.
- **`reliable: false`** heißt: Die Kachel hat fast keine Struktur (Himmel, Wand). Dort lässt sich Schärfe nicht beurteilen; die Vorschau färbt solche Kacheln nicht rot.
- **Kanten** findet ein Sobel-Filter nach leichter Glättung. Das ist einfacher als Canny, liefert für die Frage „ruhig oder unruhig“ aber dieselbe Aussage.
- **Kontrast der Schrift** ist der kleinste Wert gegenüber allen Farben, die mindestens 10 % der Kachel füllen. Eine Kachel halb hell, halb dunkel bekommt deshalb einen schlechten Wert, auch wenn ihr Mittelwert passen würde.
- Das Studio verkleinert hochgeladene Bilder auf höchstens 1800 px. Die Koordinaten beziehen sich auf diese Fassung.

## Schwellwerte

Alle Schwellwerte stehen an einer Stelle: als `STANDARD` in [`bildanalyse/kern.js`](../bildanalyse/kern.js). Im Studio änderst du sie unter **Schwellwerte**; gespeichert werden nur Abweichungen, je Projekt. Eine Änderung wirkt sofort auf die Messung und auf den Vorschlag, ohne neue KI-Anfrage.

| Wert | Vorgabe | Wirkung |
|---|---|---|
| `schaerfe.scharf` | 150 | Laplace-Varianz, ab der eine Kachel „scharf“ ist |
| `schaerfe.leicht` | 45 | ab hier „leicht unscharf“, darunter „blurry“ |
| `schaerfe.min_kontrast` | 10 | darunter kein Schärfe-Urteil |
| `freiraum.kantenschwelle` | 60 | Stärke, ab der ein Pixel als Kante zählt (0–1020) |
| `freiraum.kantendichte_max` | 0,04 | höchster Anteil Kantenpixel für Freiraum |
| `freiraum.farbvarianz_max` | 24 | höchste Farbstreuung für Freiraum |
| `freiraum.karte` | 16 | Feinheit der Freiraum-Karte: Zellen entlang der längsten Seite |
| `kontrast_min` | 4,5 | Mindestkontrast für Schrift (WCAG AA) |
| `kontrast_flaeche_min` | 3 | Mindestkontrast des Knopfs zum Bild |
| `arbeitsgroesse` | 1024 | längste Seite bei der Messung |

Kalibrieren: Ein Bild nehmen, bei dem du weißt, was scharf ist und wo Text hinpasst, die Werte in der Tabelle unter der Vorschau ablesen und die Schwellwerte so setzen, dass die Vorschau zu deinem Urteil passt.

## Das Analyse-JSON

Ein JSON je Bild („JSON speichern“):

```json
{
  "version": 1,
  "image": { "name": "weinberg.jpg", "width": 1800, "height": 1012, "measured_width": 1024, "measured_height": 576 },
  "vlm": "gemma4:12b-mlx",
  "config": { "…": "die verwendeten Schwellwerte" },
  "overall": { "main_subject": "…", "composition": "…", "mood": "…", "style": "…", "lighting": "…" },
  "palette": [{ "hex": "#17190C", "percent": 41.8 }],
  "grids": {
    "2x2": [{ "id": "2x2:r1c1", "row": 1, "col": 1, "label": "oben links", "x": 0, "y": 0, "width": 900, "height": 506,
              "colors": [{ "hex": "#E0DDD4", "percent": 50 }], "mean_color": "#8F9AA6", "brightness": 159, "contrast": 68,
              "sharpness": { "laplace_variance": 902.4, "label": "scharf", "reliable": true },
              "edge_density": 0.1819, "color_variance": 79.2,
              "text_space": false, "text_space_score": 0, "text_color": "#16202A", "text_tone": "dunkel", "text_contrast": 1.98,
              "description": "…" }],
    "4x2": []
  }
}
```

`palette` sind die sechs prägenden Farben des ganzen Bildes. Dazu kommt `free_map`, die Freiraum-Karte: `cols`, `rows` und je Zelle `free` (0/1), `score` und `color`.

## Der Design-Vorschlag

Die Gestaltung rechnet die App selbst. Die KI wählt am Ende nur zwischen fertigen, geprüften Kompositionen und begründet ihre Wahl. So entsteht der Vorschlag:

1. **Freiraum-Karte.** Zusätzlich zu den Rastern misst die App ein feines Raster aus annähernd quadratischen Zellen (16 entlang der längsten Seite, im JSON unter `free_map`). Die groben Raster sind für die Platzierung zu grob: Eine 2 × 2-Kachel mit halber Person gilt als unruhig, obwohl ihre andere Hälfte frei ist.
2. **Zusammenhängende Flächen.** Aus der Karte sucht die App die größten Rechtecke aus lauter ruhigen Zellen, höchstens drei, die sich deutlich unterscheiden.
3. **Ein Textblock.** Headline, Subline und CTA stehen immer zusammen als ein Block an einer Kante, linksbündig. Nur wenn die Fläche fast die ganze Bildbreite füllt und kein Motiv daneben liegt, wird zentriert.
4. **Feste Hierarchie.** Die Headline wird so groß, wie Fläche und Format es zulassen (Obergrenze rund 6 % der Bildbreite im Querformat 3:2, mehr im Hochformat), in ausgewogenen Zeilen. Die Subline hat 36 % der Headline-Größe, der CTA etwas weniger. Passt der Block nicht mit mindestens der halben Obergrenze, scheidet die Fläche aus.
5. **Ränder und Motiv.** Zum Bildrand bleiben 6 % der kurzen Seite frei, zum Motiv gut eine halbe Zelle. Liegt neben der Fläche das Motiv, setzt sich der Block an diese Kante und auf dessen Höhe („auf Höhe des Motivs“); weitere Varianten sind mittig, unten und oben.
6. **Farbe und Kontrast.** Die Schrift steht direkt auf dem Bild, in einem Ton des Bildes: die dunkelste oder hellste Bildfarbe, bis fast Schwarz oder Weiß gezogen. Der Kontrast muss gegenüber jeder Zelle unter dem Block den Mindestwert erreichen. Fehlt wenig, legt die App einen weichen Schleier hinter den Block (höchstens 44 % Deckkraft, unscharfer Rand, kein Kasten). Reicht auch das nicht, bekommt der ganze Block eine Fläche, nie einzelne Zeilen.
7. **Auswahl.** Die bis zu vier besten Varianten heißen A bis D. Ohne KI gilt A. „KI wählen und begründen lassen“ schickt Bildbeschreibung und Varianten an das Design-Modell; es antwortet mit einem Buchstaben, den Palettenrollen und 2–3 Sätzen Begründung. Du kannst jede Variante selbst anklicken.

Die Ansicht „Textflächen“ in der Analyse zeigt die Freiraum-Karte, die gefundenen Flächen und die Blöcke aller Varianten.

### Layout-Regeln zum Durchklicken

Über der Ansicht wählst du die Regel; jede liefert bis zu vier Kompositionen (A–D). **‹** und **Nächste ›** blättern durch alle Kompositionen aller Regeln. Typografie, Ränder, Farbwahl und Kontrastprüfung bleiben bei jeder Regel gleich.

| Regel | Was sie tut |
|---|---|
| **Automatisch** | Die App entscheidet wie oben beschrieben: größte ruhige Fläche, Block am Motiv ausgerichtet. |
| **Drittel** | Eine senkrechte Kante des Blocks liegt auf einer Drittellinie, Ober- oder Unterkante auf einer waagerechten. Zulässig ist nur, was kein Bildelement trifft. |
| **Goldener Schnitt** | Dasselbe mit den Linien bei 38 % und 62 %. |
| **Viertel** | Dasselbe mit den Linien bei 1/4, 1/2 und 3/4. |
| **Überlappen** (Regelbruch) | Der Block schiebt sich mit Absicht über die Kante des Motivs: 22 bis 60 % liegen darauf, die Headline ist bis zu 30 % größer. |
| **Übergroß** (Regelbruch) | Die Headline läuft in Plakatgröße über die ganze Breite, ohne Rücksicht auf das Motiv, mit halbem Rand. |

Bei den Rasterregeln blendet „Hilfslinien zeigen“ die Linien über dem Bild ein. Liegt auf den Linien keine Stelle ganz frei, zeigt die App die am wenigsten störende und sagt das dazu. Bei den Regelbrüchen gibt es nie einen Kasten: Die App nimmt einen stärkeren Schleier (bis 60 %) und meldet, wenn die Schrift den Mindestkontrast trotzdem nicht überall erreicht.

Die KI wählt immer innerhalb der gerade aktiven Regel. Neue Regeln kommen als Eintrag in `REGELN` in [`bildanalyse/design.js`](../bildanalyse/design.js) dazu.

Hat ein Bild keine ruhige Fläche, in die der Block passt, steht er unten links auf einer Fläche; die App sagt das dazu.

## Skizzen: ausprobieren wie auf Papier

Kacheln messen und das Gesamtbild beschreiben reicht nicht für einen guten Entwurf. Der Reiter **Skizzen** probiert deshalb mehrere Richtungen nebeneinander aus, sieht sie sich an und urteilt:

1. **Freie Entwürfe der KI.** Das Vision-Modell sieht das Foto und gestaltet fünf Entwürfe frei. Es setzt Textbausteine, Flächen und Linien selbst: Position, Größe, Drehung, Farbe, Umbruch. Es darf die Headline teilen, Wörter verschieden groß setzen, stapeln und um 90 Grad drehen. Idee, Bausteine, Größen, Farben und ungefähre Lage kommen von der KI; die App setzt das Ergebnis danach sauber (siehe „Reinzeichnung“).
2. **Grundskizzen der App** zum Vergleich: sechs Richtungen aus dem Baukasten (ruhig neben dem Motiv, Sockel, Band über dem Motiv, diagonaler Schnitt, Plakat in Versalien, Goldener Schnitt).
3. **Ansehen und urteilen.** Die App zeichnet jede fertige Skizze als Bild. Das Vision-Modell sieht dieses Bild und vergibt je 1 bis 5 Punkte für Lesbarkeit, Bezug zum Motiv und Spannung, dazu einen Satz Urteil und einen Satz, was es als Nächstes ändern würde.
4. **Weiterentwickeln.** „Beste weiterentwickeln“ nimmt die drei besten Skizzen. Für jede sieht die KI ihre gezeichnete Skizze, die Kritik und die Messwerte der App und überarbeitet das Layout frei: Positionen, Größen, Farben, Umbrüche, Flächen. Das gilt auch für Grundskizzen aus dem Baukasten; sie werden dafür in ein freies Layout verwandelt.
5. **Übernehmen.** Ein Klick auf eine Skizze macht sie zum Entwurf im Reiter **Entwurf**.

Ein Blatt braucht mit `gemma4:12b-mlx` rund anderthalb Minuten (davon gut eine halbe für die freien Entwürfe), eine Runde Weiterentwickeln rund 40 Sekunden. Die Urteile sind ein Anhaltspunkt: Das Modell sieht eine verkleinerte Zeichnung der Skizze (768 px breit) und irrt sich, wie jedes Modell.

### Reinzeichnung

Ein kleines lokales Modell trifft Positionen nur grob: Ohne Nacharbeit liegen Texte übereinander, auf Händen oder halb außerhalb des Bildes. Deshalb setzt die App jeden freien Entwurf der KI sauber, ohne die Idee zu ändern. Wortlaut, Aufteilung, Größenverhältnisse und Flächen bleiben; jeder Baustein rückt nur so weit wie nötig:

- **Im Bild:** Jeder Text steht vollständig im Bild, mit 5 % der kurzen Seite Rand. Was zu breit ist, wird umbrochen oder kleiner.
- **Keine Überdeckung:** Kein Text liegt auf einem anderen. Der größere hat Vorrang und bleibt, wo er ist.
- **Motiv frei:** Text weicht auf die nächste ruhige Stelle aus, außer die KI hat eine Fläche darunter gesetzt.
- **Lesbar:** Kleingedrucktes bekommt eine Mindestgröße. Reicht der Kontrast nicht (4,5 : 1, bei großer Schrift 3 : 1), wechselt die Farbe auf einen hellen oder dunklen Ton des Bildes; reicht auch das nicht, kommt ein weicher Schleier darunter.
- **Drehung:** nur 0 oder 90 Grad.

Was dabei geändert wurde, steht an der Skizze und im Entwurf unter „Von der App sauber gesetzt“. Was du selbst von Hand verschiebst, lässt die App in Ruhe; „Sauber setzen“ im Entwurf räumt auf Wunsch wieder auf.

### Freier Entwurf

Nach dem Übernehmen einer freien Skizze:

- **Anfassen und verschieben:** Jedes Element lässt sich in der Ansicht greifen und bewegen. Ein Klick wählt es aus; darunter stehen seine Werte (Text, Größe, Zeilenbreite, Drehung, Farbe, Schnitt, Ausrichtung, Versalien; bei Formen Breite, Höhe, Deckkraft, Strichstärke). Elemente lassen sich hinzufügen, löschen und nach vorn holen.
- **Überarbeiten lassen:** Du schreibst, was sich ändern soll; die KI sieht den aktuellen Stand als Bild und gibt ein neues Layout zurück. „Vorherige Fassung“ holt den Stand davor zurück.
- **Was die App misst:** Kontrast jedes Textbausteins zum Untergrund, Anteil über dem Motiv, Anschnitt und Überdeckungen. Die Messwerte gehen als Rückmeldung an die KI, wenn sie überarbeitet. Bei deinen eigenen Änderungen sind sie nur Hinweise.
- **Frei bearbeiten** im Baukasten-Entwurf verwandelt auch diesen in ein freies Layout.

Das Format eines freien Layouts (im JSON unter `layout`): `texte` mit `text`, `x`, `y` (Ankerpunkt in Prozent des Bildes), `groesse` und `breite` (Prozent der Bildbreite), `farbe`, `gewicht`, `versal`, `ausrichtung`, `drehung`; `formen` mit `art` (rechteck, kreis, linie), `x`, `y`, `breite`, `hoehe`, `farbe`, `deckkraft`, `gefuellt`, `staerke`, `drehung`.

Der Code steht in [`bildanalyse/frei.js`](../bildanalyse/frei.js) (freies Layout) und [`bildanalyse/skizzen.js`](../bildanalyse/skizzen.js) (Grundskizzen, Bewertung).

## Stil: Farbwelt, Farbflächen, Schmuck, Datum

Links im Bereich stehen vier Bausteine, die sich einzeln an- und abwählen lassen. Jede Änderung wirkt sofort auf die Ansicht; die Komposition wird dabei neu gerechnet, ohne KI.

**Farbwelt.** Drei Farben: Schrift, Akzent (Knopf und Schmuck am Block) und Fläche. Ohne Angabe nimmt die App Töne aus dem Bild. Du setzt sie mit dem Farbwähler, lässt sie aus einer Beschreibung vorschlagen („frisch, Meer, Türkis mit Weiß“, ein KI-Aufruf) oder übernimmst die Farben der empfohlenen Gestaltungsrichtung aus der Projektanalyse, wenn es eine gibt. Die Kontrastregeln gelten weiter: Wäre eine Wunschfarbe an der Stelle nicht lesbar, nimmt die App eine andere und nennt den Grund.

**Farbflächen.** Eine Farbfläche überdeckt einen Teil des Fotos. Presets: Band (Streifen links oder rechts), Sockel (unten oder oben), Diagonale (schräg aus einer Ecke) und Farbton (halb durchsichtig über dem ganzen Bild). Einstellbar sind Seite, Größe, Deckkraft und Farbe. Der Text ist darauf abgestimmt: Die App rechnet mit der Freiraum-Karte, wie sie mit der Fläche aussieht. Eine deckende Fläche gilt als ruhiger Grund in ihrer Farbe, der Textblock stellt sich bevorzugt darauf, Schrift- und Knopffarbe richten sich nach ihr, und kein Text läuft über ihre Kante.

**Schmuckelemente.** Presets über dem Bild: diagonale Linie (steigend, fallend oder gekreuzt, Höhe einstellbar), Rahmen und Eckmarken (Abstand zum Rand einstellbar). Presets am Textblock, die mit ihm wandern: Akzentlinie über der Headline und Balken an der Kante. Für jedes Element: Stärke und Farbe. Ohne eigene Farbe nehmen Linien über dem Bild die Schriftfarbe der Komposition, Akzente am Block die Akzentfarbe.

**Schrift und Aufruf.** Headline in Versalien (mit Sperrung), Schnitt der Headline (Mittel, Halbfett, Fett) und die Form des Aufrufs: als Textzeile mit Pfeil und Linie, wie es auf Flyer und Plakat passt, oder als Knopf für digitale Formate. Vorgabe ist die Textzeile.

**Datum oder Nummer.** Das Feld unter „Texte fürs Bild“ wird an Punkten, Strichen und Leerzeichen geteilt und gestapelt gesetzt (30 – 03 – 19). Gibt es ein Band, steht der Stapel darin; sonst in der ersten Ecke, die ruhig ist und dem Textblock nicht in die Quere kommt.

Die Presets stehen als `FLAECHEN` und `SCHMUCK` in [`bildanalyse/stil.js`](../bildanalyse/stil.js); ein neues Preset ist ein Eintrag dort plus seine Zeichnung in `flaechePolygon` oder `schmuckBildSVG`.

## Aufbau

| Datei | Aufgabe | Läuft in |
|---|---|---|
| `bildanalyse/kern.js` | Raster, k-Means, Helligkeit, Schärfe, Kanten, Freiraum, WCAG-Kontrast, Schwellwerte | Browser, Node |
| `bildanalyse/design.js` | Flächen finden, Textblock setzen, Varianten prüfen, Fragen an die Modelle, HTML-Ansicht, Debug-Vorschau | Browser, Node |
| `bildanalyse/stil.js` | Presets für Farbflächen und Schmuck, gestapeltes Datum, Wirkung der Fläche auf die Freiraum-Karte | Browser, Node |
| `bildanalyse/skizzen.js` | Grundskizzen der App, Bewertung durch das Vision-Modell | Browser, Node |
| `bildanalyse/frei.js` | Freies Layout: Prompts, Antwort lesen, Darstellung, Nachmessen, Umwandlung aus dem Baukasten | Browser, Node |
| `bildanalyse/ui.js` | Bereich „Bild-Design“ im Studio, Aufrufe der KI, Speichern, Übernahme in den Flyer | Browser |
| `tests/bildanalyse.test.js` | Tests für Messung und Regeln, mit Testbildern aus dem Code | Browser, Node |

`index.html` kennt das Modul nur über `window.BildDesign` (Umschalter, linke Spalte, Hauptbereich). Fehlt der Ordner, läuft das Studio wie bisher.

## Unterschiede zum ursprünglichen Konzept

Das Konzept beschrieb eine Python-Kommandozeile. Umgesetzt ist dieselbe Pipeline im Browser:

- `analyze.py` und `compose.py` sind „Bild analysieren“ und der Reiter „Design-Vorschlag“.
- Die Platzierung entscheidet nicht die KI je Kachel, sondern die App über zusammenhängende Flächen; die KI wählt zwischen geprüften Varianten. Einzelne Kacheln je Element ergaben verstreute, kleine Texte.
- `config.yaml` ist der Bereich „Schwellwerte“ mit den Vorgaben in `kern.js`.
- Ordner-Batch ist „Alle Bilder analysieren“.
- OpenCV-Canny ist durch Sobel mit Schwelle ersetzt, scikit-learn-k-Means durch ein eigenes ohne Zufall.
