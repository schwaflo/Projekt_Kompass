# Demo Corporate

Ein vollständiges Designsystem als Vorlage. Alle Logos und Bilder sind Platzhalter. Du machst daraus dein eigenes System, indem du den Ordner kopierst, umbenennst und die Dateien ersetzt.

## Aufbau des Pakets

```
demo-corporate/
  design-system.json   Farben, Schriften, Layouts und die Liste der Assets
  voice.md             Formulierungsrichtlinien für die KI
  README.md            diese Datei
  assets/
    logos/             Logos
    images/            Bilder
```

## Welche Datei gehört wohin?

| Datei | Rolle | Format | Empfohlene Größe | Erscheint auf |
|---|---|---|---|---|
| `assets/logos/logo-primary.svg` | `logo-primary` | SVG oder PNG, transparenter Hintergrund | 600 × 160 px (etwa 15:4) | Reserve für helle Folien; in diesem System auf keiner Folie fest verbaut |
| `assets/logos/logo-negative.svg` | `logo-negative` | SVG oder PNG, transparent, helle Farbe | 600 × 160 px (etwa 15:4) | Titelfolie oben links, Abschlussfolie oben Mitte |
| `assets/logos/logo-icon.svg` | `logo-icon` | SVG oder PNG, quadratisch | 256 × 256 px | Oben rechts auf Inhalts-, Zwei-Spalten-, Kennzahlen-, Zeitstrahl- und Zitatfolien |
| `assets/images/hero.svg` | `hero-image` | JPG oder PNG, Querformat 16:9 | 1920 × 1080 px | Vollbild-Folie (`image-full`), füllt die ganze Folie |
| `assets/images/portrait.svg` | `portrait-image` | JPG oder PNG, Hochformat | 1280 × 1800 px | Bild-links-Folie (`image-left`), linke 40 % der Folie |
| `assets/images/square.svg` | `square-image` | JPG oder PNG, Quadrat | 1200 × 1200 px | Wählbar für `image-left`, wird auf Hochformat beschnitten |

Bilder werden immer so beschnitten, dass sie ihre Fläche füllen. Wichtige Motive gehören deshalb in die Bildmitte. Logos werden nie beschnitten, sondern in ihre Fläche eingepasst.

## Eigene Dateien einsetzen

**Am einfachsten:** Gib deiner Datei denselben Namen und überschreibe den Platzhalter. Dann musst du sonst nichts ändern.

**Anderer Dateiname oder anderes Format:** Lege die Datei in `assets/` ab und passe in `design-system.json` unter `assets` den Eintrag `file` an:

```json
{ "id": "logo-negative", "file": "assets/logos/mein-logo-weiss.png", "role": "logo-negative" }
```

**Weitere Bilder:** Trage jedes zusätzliche Bild als neuen Eintrag mit eigener `id` ein. Über `tags` und `beschreibung` entscheidet die KI, welches Bild zu welcher Folie passt. Sie kann nur Bilder wählen, die hier eingetragen sind.

```json
{ "id": "team-werkstatt", "file": "assets/images/team-werkstatt.jpg", "role": "portrait-image",
  "tags": ["team", "werkstatt"], "beschreibung": "Drei Mitarbeitende an der Werkbank", "verwendung": ["image-left"] }
```

## Farben und Schriften ändern

Alles steht in `design-system.json` unter `tokens`:

- `colors`: Farben als `#RRGGBB`. Die Layouts verweisen nur auf die Namen (`primary`, `accent` …). Wer hier eine Farbe ändert, ändert sie auf allen Folien.
- `typography`: `headingFont` und `bodyFont` sind die Wunschschriften. `headingFallback` und `bodyFallback` nennen Systemschriften, die überall vorhanden sind. Der PowerPoint-Export nutzt standardmäßig die erste Ersatzschrift, damit die Datei auf jedem Rechner gleich aussieht.
- `sizes`: Schriftgrößen in Punkt.

## Layouts

Jedes Layout unter `layouts` hat eine `id`, eine `beschreibung` (die liest die KI, um das passende Layout zu wählen) und `placeholders`. Positionen und Größen sind Prozent der Folie. `maxChars`, `maxItems` und `maxCharsPerItem` begrenzen den Text, damit nichts überläuft.

Layouts mit `"master": "inhalt"` übernehmen Kopfstrich, Fußzeile, Seitenzahl und Bildmarke aus `masters.inhalt`.

| Layout | Zweck |
|---|---|
| `title` | Titelfolie |
| `section` | Kapiteltrenner |
| `content-bullets` | Überschrift und bis zu fünf Stichpunkte |
| `two-column` | Zwei Spalten nebeneinander |
| `image-left` | Bild links, Text rechts |
| `image-full` | Vollbild mit kurzer Aussage |
| `kpi-grid` | Zwei bis vier Kennzahlen |
| `timeline` | Drei bis fünf Schritte |
| `quote` | Zitat |
| `closing` | Abschlussfolie |

## Prüfen

Beim Laden prüft die App das Paket. Fehlt eine Datei oder verweist ein Layout auf eine Farbe, die es nicht gibt, nennt die Fehlermeldung die genaue Stelle.
