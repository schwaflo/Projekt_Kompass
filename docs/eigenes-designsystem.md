# Eigenes Designsystem erstellen

Ein Designsystem legt fest, wie Präsentationen aussehen und klingen: Farben, Schriften, Layouts, Logos, Bilder und Formulierungsrichtlinien. Es wird einmal hinterlegt und steht danach für alle Präsentationen zur Auswahl.

## Der schnellste Weg: im Editor

1. In der App **Präsentation → Designsysteme verwalten** öffnen.
2. Bei „Demo Corporate“ oder „Demo Hell“ auf **Kopie zum Bearbeiten** klicken.
3. Name, Farben und Schriften ändern.
4. Eigene Logos und Bilder auf die sechs Rollen-Felder ziehen.
5. `voice.md` im Textfeld unten anpassen.
6. **Als ZIP speichern**, um das System weiterzugeben oder ins Repository zu legen.

Die Kopie liegt im Speicher deines Browsers. Auf einen anderen Rechner kommt sie als ZIP.

## Aus einer PowerPoint-Vorlage

Im Editor **Aus PowerPoint importieren** wählen und eine `.pptx` oder `.potx` angeben. Übernommen werden:

- die zehn Theme-Farben
- Überschriften- und Textschrift
- Platzhalter der Master-Layouts für Titelfolie, Kapiteltrenner, Inhalt, zwei Spalten und Bild mit Text
- Bilder aus dem Folienmaster, meist das Logo

Layouts, die die Vorlage nicht hat (Kennzahlen, Zeitstrahl, Zitat, Abschluss, Vollbild), werden aus „Demo Hell“ ergänzt und in deinen Farben dargestellt. Der Bericht nach dem Import sagt genau, was woher kommt. Prüfe danach die Zeichenlimits, sie sind aus der Größe der Flächen geschätzt.

## Von Hand: der Ordner

```
design-systems/
  mein-system/
    design-system.json      Pflicht: Metadaten, Tokens, Layouts, Assets, Regeln
    voice.md                empfohlen: Formulierungsrichtlinien für die KI
    README.md               empfohlen: Erklärung für Menschen
    assets/
      logos/
      images/
```

Der Ordnername muss der `meta.id` entsprechen: Kleinbuchstaben, Ziffern und Bindestriche.

### So wird der Ordner gefunden

| Wo läuft die App? | Was du tun musst |
|---|---|
| Lokal mit `python3 -m http.server` | nichts, der Ordner wird beim Laden der Seite gefunden |
| Docker (nginx) | nichts |
| GitHub Pages | Ordner einchecken. Die GitHub Action trägt ihn in `design-systems/index.json` ein. Von Hand geht es mit `node scripts/build-index.mjs` oder durch Ergänzen der Liste in der Datei. |
| Egal wo | Ordner als ZIP packen und im Editor hochladen |

Code muss in keinem Fall geändert werden.

### Das Manifest

Am einfachsten kopierst du [`design-systems/demo-corporate/design-system.json`](../design-systems/demo-corporate/design-system.json) und änderst sie. Die vollständige Beschreibung aller Angaben steht in [`praesentation/schema.js`](../praesentation/schema.js).

```json
{
  "schemaVersion": "1.0",
  "meta": { "id": "mein-system", "name": "Mein System", "beschreibung": "…", "version": "1.0.0", "tags": ["modern"] },
  "tokens": { "colors": { … }, "typography": { … }, "spacing": { … }, "shapes": { … } },
  "masters": { … },
  "layouts": [ … ],
  "assets": [ … ],
  "rules": { … }
}
```

#### meta

`tags` und `beschreibung` nutzt die KI, um ein passendes Designsystem vorzuschlagen. Schreib dort, für welche Anlässe das System gedacht ist.

#### tokens.colors

Pflicht sind `primary`, `secondary`, `accent`, `background`, `surface`, `text`, `textMuted`, `success`, `warning`, `error` und `chartPalette` (mindestens drei, empfohlen sechs Farben). Alle Werte als `#RRGGBB`. Du darfst weitere Farben ergänzen, zum Beispiel `onPrimary` für Text auf dunklen Flächen. Layouts verweisen immer auf den Namen, nie auf den Farbwert.

Die Prüfung warnt, wenn Text auf seinem Untergrund weniger Kontrast hat als von WCAG AA empfohlen (4,5:1, ab 18 Punkt 3:1).

#### tokens.typography

| Angabe | Bedeutung |
|---|---|
| `headingFont`, `bodyFont` | Wunschschriften |
| `headingFallback`, `bodyFallback` | Ersatzschriften. Die erste echte Schrift der Liste wird standardmäßig im Export verwendet, weil sie auf jedem Rechner vorhanden ist. |
| `googleFonts` | `true`, wenn die Wunschschriften bei Google Fonts liegen und für die Vorschau geladen werden sollen |
| `sizes` | Schriftgrößen in Punkt. Pflicht: `title`, `h1`, `h2`, `body`, `caption`. Eigene Stufen wie `kpi` sind erlaubt. |
| `lineHeight` | Zeilenhöhe als Faktor |
| `headingBold` | Überschriften fett (Standard) oder normal |

#### layouts

Jedes Layout hat:

| Angabe | Bedeutung |
|---|---|
| `id` | eindeutig, zum Beispiel `content-bullets` |
| `typ` | Standardtyp, falls die ID davon abweicht. Über den Typ werden Folien beim Wechsel des Designsystems zugeordnet. |
| `beschreibung` | liest die KI, um das passende Layout zu wählen. Schreib, **wann** das Layout passt. |
| `master` | übernimmt Hintergrund, Deko und Platzhalter aus `masters.<name>` |
| `background` | Name einer Farbe |
| `deko` | Flächen ohne Inhalt: `rect` oder `ellipse` mit Position, Farbe und optional `opacity` |
| `placeholders` | die Felder der Folie |

Standardtypen: `title`, `section`, `content-bullets`, `two-column`, `image-left`, `image-full`, `kpi-grid`, `timeline`, `quote`, `comparison`, `closing`.

#### placeholders

Positionen und Größen sind Prozent der Folie (`x`, `y`, `w`, `h`, jeweils 0 bis 100).

| `typ` | Inhalt | Pflichtangaben |
|---|---|---|
| `text` | ein Text | `maxChars` |
| `bullets` | Aufzählung | `maxItems`, `maxCharsPerItem` |
| `items` | Reihe gleich aufgebauter Kacheln (Kennzahlen, Zeitstrahl) | `maxItems`, `felder` mit je `id` und `maxChars` |
| `image` | Bild aus den Assets | `asset` (ID oder Rolle des Standardbilds) empfohlen |
| `logo` | Logo, wird automatisch gesetzt | `asset` (ID oder Rolle) |

Weitere Angaben:

- `pflicht: true`: die KI muss das Feld füllen
- `beschreibung`: sagt der KI, was in das Feld gehört
- `auto`: `pageNumber`, `presentationTitle` oder `date`. Das Feld füllt die App selbst.
- `style`: `font` (`heading` oder `body`), `size` (Name aus `sizes` oder Zahl), `color`, `align`, `valign`, `bold`, `italic`, `uppercase`, `bullet` (`dot`, `dash`, `number`)
- `on`: Farbe der Fläche hinter dem Text, falls sie vom Folienhintergrund abweicht (für die Kontrastprüfung und für Karten)
- `variante` bei `items`: `karten`, `zeitstrahl` oder `schlicht`

**Gleiche Platzhalter-IDs wie in den Demo-Systemen verwenden** (`title`, `subtitle`, `bullets`, `leftBullets`, `kpis`, `steps`, `quote` …). Dann bleibt der Inhalt beim Wechsel zwischen Designsystemen vollständig erhalten.

**Zeichenlimits:** Wähle sie so, dass der Text bei voller Länge noch in die Fläche passt. Die Layout-Vorschau im Editor füllt jedes Feld nahe ans Limit. Wird dort Text abgeschnitten oder sehr klein, ist das Limit zu hoch.

#### assets

```json
{ "id": "team-werkstatt", "file": "assets/images/team-werkstatt.jpg", "role": "portrait-image",
  "tags": ["team", "werkstatt"], "beschreibung": "Drei Mitarbeitende an der Werkbank", "verwendung": ["image-left"] }
```

| Rolle | Format | Empfohlene Größe |
|---|---|---|
| `logo-primary` | SVG oder PNG, transparent, für helle Flächen | 600 × 160 px |
| `logo-negative` | SVG oder PNG, transparent, helle Farbe für dunkle Flächen | 600 × 160 px |
| `logo-icon` | quadratische Bildmarke | 256 × 256 px |
| `hero-image` | Querformat 16:9 | 1920 × 1080 px |
| `portrait-image` | Hochformat | 1280 × 1800 px |
| `square-image` | Quadrat | 1200 × 1200 px |

Die KI wählt Bilder nur über `id` oder `tags`. Je genauer `beschreibung` und `tags`, desto besser passt die Auswahl. Bilder ohne Eintrag im Manifest werden beim ZIP-Upload automatisch mit einer vorgeschlagenen Rolle eingetragen.

Bilder füllen ihre Fläche und werden dafür mittig beschnitten. Logos werden nie beschnitten.

#### rules

- `logoAuf`: Layouts, auf denen ein Logo stehen muss. Die Prüfung stellt sicher, dass sie einen Logo-Platzhalter haben.
- `maxBullets`: Obergrenze für Stichpunkte, unabhängig vom Layout
- `bildstil`: ein Satz zur Bildsprache
- `hinweise`: Regeln für die KI, zum Beispiel „Höchstens eine Zitatfolie pro Präsentation“

### voice.md

Freier Text in Markdown. Er wird vollständig in den System-Prompt übernommen. Bewährt haben sich die Abschnitte Tonalität, Anrede (Du oder Sie), Satzlänge, verbotene Füllwörter, bevorzugte Begriffe. Vorlage: [`design-systems/demo-corporate/voice.md`](../design-systems/demo-corporate/voice.md).

## Prüfen

- **Im Editor:** Fehler erscheinen mit Pfad und Erklärung, zum Beispiel „layouts[2] (content-bullets).title.style.color: Die Farbe „blau“ gibt es in tokens.colors nicht.“
- **Mit der Beispielpräsentation:** [`praesentation/demo.html`](../praesentation/demo.html) zeigt dieselben zehn Folien in jedem Designsystem unter `design-systems/`.
- **Mit den Tests:** `http://localhost:8765/tests/` öffnen.

## Häufige Fehler

| Meldung | Ursache |
|---|---|
| „design-system.json fehlt“ | Die Datei liegt nicht im obersten Ordner des Pakets. |
| „passt nicht zum Ordnernamen“ | `meta.id` und Ordnername unterscheiden sich. |
| „Die Datei … fehlt im Paket“ | Ein Asset ist eingetragen, aber die Datei liegt woanders oder heißt anders. Groß- und Kleinschreibung zählt. |
| „brauchen maxChars“ | Ein Textplatzhalter hat kein Zeichenlimit. |
| „ragt über die Folie hinaus“ | `x + w` oder `y + h` ist größer als 100. |
| „Es gibt kein Asset mit der ID oder Rolle …“ | Ein Logo-Platzhalter verweist auf ein Logo, das unter `assets` fehlt. |
