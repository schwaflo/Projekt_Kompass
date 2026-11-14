# Bild-Design: Bilder analysieren und Text darauf setzen

Das Design-Studio hat neben dem **Entwurf** einen zweiten Bereich: **Bild-Design**. Er misst ein Foto aus, zeigt, wo es ruhig genug für Text ist und wo es unscharf wird, und lässt daraus einen Vorschlag entstehen, wo Headline, Subline und CTA stehen. Alles läuft im Browser; die KI ist dein lokaler Server (Ollama oder ein OpenAI-kompatibler Server).

## Ablauf

Weg: Projekt-Analyse → **Design entwickeln** → oben auf **Bild-Design** umschalten.

1. **Bild wählen.** Bilder hochladen oder eines der vorhandenen anklicken. Mehrere Bilder lassen sich mit „Alle Bilder analysieren“ in einem Durchgang verarbeiten.
2. **Raster wählen.** Vorgabe sind 2 × 2 und 4 × 2, dazu 4 × 4 und eigene Raster (Spalten × Zeilen, zum Beispiel `3x3`).
3. **Bild analysieren.**
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

Hat ein Bild keine ruhige Fläche, in die der Block passt, steht er unten links auf einer Fläche; die App sagt das dazu.

## Aufbau

| Datei | Aufgabe | Läuft in |
|---|---|---|
| `bildanalyse/kern.js` | Raster, k-Means, Helligkeit, Schärfe, Kanten, Freiraum, WCAG-Kontrast, Schwellwerte | Browser, Node |
| `bildanalyse/design.js` | Flächen finden, Textblock setzen, Varianten prüfen, Fragen an die Modelle, HTML-Ansicht, Debug-Vorschau | Browser, Node |
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
