# Architektur des Präsentationsgenerators

Der Präsentationsgenerator ist ein Modul von Projekt-Kompass. Er läuft wie die übrige App vollständig im Browser: Es gibt kein Backend, und die KI wird direkt vom Browser aus angesprochen.

## Grundprinzip

**Die KI gestaltet nicht, sie strukturiert.** Die KI liefert nur Inhalt und Struktur als geprüftes JSON. Wie eine Folie aussieht, entscheidet allein das Designsystem. Deshalb lässt sich derselbe Inhalt ohne erneuten KI-Aufruf in jedem Designsystem darstellen.

```
Beschreibung
   │  Briefing-Gespräch (KI fragt, Person antwortet)
   ▼
Briefing (JSON)
   │  1 KI-Aufruf
   ▼
Outline (JSON): Titel, Storyline, je Folie Layout und Kernaussage
   │  je Folie 1 KI-Aufruf, Antwortformat = Felder und Limits des Layouts
   ▼
Slide-Spec (JSON, geprüft)            ◄── Designsystem (Tokens, Layouts, Assets, voice.md)
   │  rechnerisch, ohne KI
   ▼
Folienmodell (Flächen in Prozent, fertige Schriftgrößen)
   ├──► HTML-Vorschau
   └──► PowerPoint-Datei (.pptx)
```

## Die Bausteine

Alle Dateien liegen in [`praesentation/`](../praesentation/) und sind ES-Module ohne Build-Schritt.

| Datei | Aufgabe | Läuft in |
|---|---|---|
| `schema.js` | JSON-Schema des Designsystem-Manifests (Version 1.0) | Browser, Node |
| `validate.js` | Schema-Prüfer mit deutschen Meldungen, inhaltliche Regeln, Kontrastprüfung | Browser, Node |
| `registry.js` | Designsysteme finden, laden, bereithalten | Browser, Node |
| `spec.js` | Slide-Spec: Schema, Prüfung gegen ein Designsystem, Fallback-Kürzung, Wechsel des Designsystems | Browser, Node |
| `text.js` | Textbreite schätzen, Schrift verkleinern, erst danach kürzen | Browser, Node |
| `layout.js` | Slide-Spec + Designsystem → Folienmodell | Browser, Node |
| `render-html.js` | Folienmodell → HTML | Browser, Node |
| `render-pptx.js` | Folienmodell → PptxGenJS | Browser, Node |
| `pipeline.js` | Briefing, Outline, Folien; Wiederholung bei Fehlern; Faktenprüfung | Browser, Node |
| `bilder.js` | Bilder für den Export zuschneiden und als PNG oder JPG einbetten | nur Browser |
| `assets.js` | Rolle, Tags und Beschreibung für Bilddateien vorschlagen | Vorschlag überall, Bildanalyse nur Browser |
| `pakete.js` | ZIP lesen und schreiben, Designsysteme im Browser speichern, Kopien | nur Browser |
| `import-pptx.js` | Entwurf eines Designsystems aus `.pptx` oder `.potx` | nur Browser |
| `ui.js` | Oberfläche: Thema, Briefing, Designsystem, Folien | nur Browser |
| `ui-systeme.js` | Designsystem-Editor | nur Browser |
| `demo.html` | Beispielpräsentation in jedem Designsystem ansehen, ohne KI | nur Browser |

Außerhalb des Ordners:

- [`prompts/`](../prompts/README.md): alle Texte, die an die KI gehen, als versionierte Dateien
- [`design-systems/`](../design-systems/): mitgelieferte Designsysteme und `index.json`
- [`examples/`](../examples/): Beispiel-Slide-Spec und fertige `.pptx`
- [`vendor/pptxgen.bundle.js`](../vendor/): PptxGenJS 3.12.0 mit JSZip (MIT-Lizenz), lokal eingebunden
- [`tests/`](../tests/): Tests für Browser und Node

## Anbindung an die bestehende App

`index.html` bleibt die App. Der Präsentationsgenerator hängt sich an fünf Stellen ein:

1. `<script type="module" src="praesentation/ui.js">` am Ende der Seite
2. Bildschirm `praes` in `render()`
3. Knopf „Präsentation“ in der Kopfzeile und Kachel bei den Vertiefungen
4. `window.KompassKI`: die Schnittstelle zur KI (siehe unten)
5. Speicherbereich `designsysteme` in der IndexedDB der App

Der Zustand einer Präsentation liegt in `S.praes` und wird deshalb mit dem Projekt gespeichert, exportiert und importiert.

Wird `index.html` per Doppelklick geöffnet (`file://`), lädt der Browser keine Module. Die App funktioniert dann wie bisher, und der Bildschirm „Präsentation“ erklärt, dass ein Webserver nötig ist.

## KI-Anbindung

Die Pipeline kennt nur eine Funktion:

```js
ki.frage({ system, prompt, schema, art, bilder }) → geparstes JSON
```

In der App erfüllt `llm()` aus `index.html` diese Schnittstelle. Sie spricht Ollama und jeden OpenAI-kompatiblen Server an (LM Studio, llama.cpp, vLLM, Cloud-Anbieter mit API-Schlüssel) und übergibt das Schema als Structured Output (`format` bei Ollama, sonst `response_format` mit Rückfallstufen). Welcher Server genutzt wird, stellt man auf der Startseite ein. Eine `.env` gibt es nicht, weil die App keinen Server hat; die Einstellungen liegen im Browser.

Für Tests genügt ein Objekt mit einer `frage`-Funktion, siehe `tests/pipeline.test.js`.

## Prüfung in vier Stufen

1. **Antwortformat.** Jede Folie bekommt ein eigenes JSON-Schema: nur die Felder ihres Layouts, mit Zeichenlimits, und Bild-IDs als feste Auswahl. Layout-IDs in der Outline sind ebenfalls eine feste Auswahl.
2. **Prüfung der Antwort.** `validateSpec` prüft Layout-IDs, Platzhalter, Limits und Bild-IDs. `pruefeFakten` prüft, ob Zahlen, E-Mail- und Webadressen im Briefing stehen.
3. **Wiederholung.** Bei Fehlern geht derselbe Prompt mit den konkreten Meldungen erneut an die KI, höchstens drei Versuche.
4. **Fallback.** `kuerzeSpec` bringt jede Antwort in einen gültigen Zustand: kürzt an der Wortgrenze, streicht überzählige Punkte, markiert fehlende Pflichtinhalte als `[…]`. Angaben, die nicht aus dem Briefing stammen, bleiben stehen und werden als „Bitte prüfen“ gemeldet.

## Warum kein Text überläuft

- Jeder Textplatzhalter hat ein Zeichenlimit. Das Manifest ist ohne Limit ungültig.
- `text.js` schätzt die Breite jedes Wortes, bricht um und verkleinert die Schrift bis auf 60 Prozent der Sollgröße. Reicht das nicht, wird gekürzt und die Oberfläche zeigt einen Hinweis.
- Die Schätzung ist bewusst vorsichtig und rein rechnerisch. Vorschau und PowerPoint-Datei bekommen dieselben Größen.
- Ein Test füllt jedes Feld jedes mitgelieferten Layouts bis zum Limit und prüft, dass nichts gekürzt werden muss. Ein zweiter Test misst im Browser, ob ein Text über seine Fläche hinausragt.

## Woher Designsysteme kommen

| Quelle | Wie gefunden | Bearbeitbar |
|---|---|---|
| Ordner unter `design-systems/` | `index.json`, zusätzlich die Verzeichnisliste des Webservers (`python3 -m http.server`, nginx mit `autoindex`) | nein, aber kopierbar |
| ZIP-Upload | im Designsystem-Editor | ja, liegt im Browser-Speicher |
| Import aus PowerPoint | im Designsystem-Editor | ja, liegt im Browser-Speicher |

Jedes Paket wird beim Laden geprüft. Ungültige Pakete erscheinen mit ihren Fehlermeldungen in der Übersicht und werden nicht verwendet.

## Bekannte Grenzen

- **PowerPoint-Master.** Der Export zeichnet Folien aus den Tokens. Eine `template.potx` wird nicht als Master übernommen; der Import liest daraus Farben, Schriften und Platzhalter.
- **Schriften.** Eine `.pptx` kennt keine Ersatzschriften. Standard ist deshalb die erste Ersatzschrift des Designsystems (zum Beispiel Arial). Die Wunschschrift lässt sich wählen, muss dann aber auf dem Rechner installiert sein.
- **Diagramme und Tabellen.** Die Platzhaltertypen `chart` und `table` sind im Schema vorgesehen, werden aber noch nicht gezeichnet. Die Prüfung meldet das.
- **Faktenprüfung.** Sie erkennt Zahlen und Kontaktdaten, keine erfundenen Namen oder Zitate ohne Zahl.
- **Bildbeschreibung per KI.** Braucht ein Modell mit Bildverständnis.

## Tests

```
python3 -m http.server 8765      # dann http://localhost:8765/tests/ öffnen
node tests/run.mjs                # ohne Browser; Tests, die einen Browser brauchen, werden übersprungen
```

Die Tests decken ab: Schema-Prüfung der Designsysteme, Prüfung und Kürzung von Slide-Specs, Textanpassung, Snapshots des Folienmodells, die Pipeline mit simulierter KI, Asset-Erkennung, ZIP und PowerPoint-Import.

Ändert sich das Folienmodell absichtlich, müssen die Snapshots unter `tests/snapshots/` neu erzeugt werden. Sie enthalten die Ausgabe von `modellText(buildSlides(…))` für die Beispielpräsentation.
