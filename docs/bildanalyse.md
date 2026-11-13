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
5. **Design vorschlagen.** Das Design-Modell bekommt die Analyse und die Texte aus „Texte fürs Bild“ und legt Kacheln, Ausrichtung und Farben fest. Die App prüft jede Angabe nach (siehe unten) und zeigt das Bild mit den Texten an den vorgeschlagenen Stellen.
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

`palette` sind die sechs prägenden Farben des ganzen Bildes.

## Der Design-Vorschlag

Das Design-Modell bekommt das Analyse-JSON in knapper Form (ohne Pixel- und Messdetails) und antwortet mit Kachel, Ausrichtung und Farbe je Element, einer Palette und einer Begründung in 2–3 Sätzen. Die App sorgt auf zwei Wegen dafür, dass die Regeln sicher gelten:

**Vorher:** Das Antwortformat lässt als Kachel nur solche mit `text_space = true` zu und als Palettenfarben nur die gemessenen Farben des Bildes.

**Nachher** prüft `pruefeVorschlag` in [`bildanalyse/design.js`](../bildanalyse/design.js) jede Angabe:

- Steht ein Element in einer Kachel ohne Freiraum, wird es in die beste freie Kachel verschoben.
- Liegen zwei gewählte Kacheln übereinander (grobes und feines Raster), stehen die Texte als Gruppe zusammen.
- Eine Gruppe darf in ihrer Zeile über benachbarte freie Kacheln breiter werden, nie in eine Kachel ohne Freiraum.
- Jede Schriftfarbe muss den Mindestkontrast gegenüber allen Farben unter dem Text erreichen. Sonst wird sie durch die empfohlene helle oder dunkle Farbe ersetzt.
- Der Knopf muss sich vom Bild abheben, seine Schrift auf dem Knopf lesbar sein.
- Hat das Bild gar keinen Freiraum oder reicht kein Kontrast, bekommt der Text eine Fläche als Unterlage.

Was die App geändert hat, steht im Kasten „Von der App korrigiert“ und im JSON unter `corrections`.

## Aufbau

| Datei | Aufgabe | Läuft in |
|---|---|---|
| `bildanalyse/kern.js` | Raster, k-Means, Helligkeit, Schärfe, Kanten, Freiraum, WCAG-Kontrast, Schwellwerte | Browser, Node |
| `bildanalyse/design.js` | Fragen an die Modelle, Antwortformate, Prüfung des Vorschlags, HTML-Ansicht, Debug-Vorschau | Browser, Node |
| `bildanalyse/ui.js` | Bereich „Bild-Design“ im Studio, Aufrufe der KI, Speichern, Übernahme in den Flyer | Browser |
| `tests/bildanalyse.test.js` | Tests für Messung und Regeln, mit Testbildern aus dem Code | Browser, Node |

`index.html` kennt das Modul nur über `window.BildDesign` (Umschalter, linke Spalte, Hauptbereich). Fehlt der Ordner, läuft das Studio wie bisher.

## Unterschiede zum ursprünglichen Konzept

Das Konzept beschrieb eine Python-Kommandozeile. Umgesetzt ist dieselbe Pipeline im Browser:

- `analyze.py` und `compose.py` sind die Knöpfe „Bild analysieren“ und „Design vorschlagen“.
- `config.yaml` ist der Bereich „Schwellwerte“ mit den Vorgaben in `kern.js`.
- Ordner-Batch ist „Alle Bilder analysieren“.
- OpenCV-Canny ist durch Sobel mit Schwelle ersetzt, scikit-learn-k-Means durch ein eigenes ohne Zufall.
