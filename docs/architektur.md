# Architektur des Präsentationsgenerators

Der Präsentationsgenerator ist ein Modul von Projekt-Kompass. Er läuft wie die übrige App vollständig im Browser: Es gibt kein Backend, und die KI wird direkt vom Browser aus angesprochen.

## Grundprinzip

**Die KI gestaltet nicht, sie strukturiert.** Die KI liefert nur Inhalt und Struktur als geprüftes JSON. Wie eine Folie aussieht, entscheidet allein das Designsystem. Deshalb lässt sich derselbe Inhalt ohne erneuten KI-Aufruf in jedem Designsystem darstellen.

```
Beschreibung
   │  Art der Präsentation erkennen (Pitch, Entscheidung, Bericht, Schulung, Vorstellung)
   │  Briefing-Gespräch: Punkte der Art, Schwerpunkte vertiefen, höchstens 6 Fragen
   ▼
Briefing (JSON)
   │  1 KI-Aufruf mit Dramaturgie und Stil der Art
   ▼
Outline (JSON): Titel, Storyline, je Folie Abschnitt, Form, Betonung und Kernaussage
   │  Layoutwahl (ohne KI): Form + Betonung → passendstes Layout, mit Abwechslung
   │  je Folie 1 KI-Aufruf, Antwortformat = Felder und Limits des Layouts
   │  optional je Folie 1 KI-Aufruf: Flächen verschieben und vergrößern (Schalter, geprüft)
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
| `analyse.js` | Profil jedes Layouts (Schriftgrößen, Bildanteil, Kacheln, Wucht), Formen, Layoutwahl | Browser, Node |
| `richtlinien.js` | Formulierungsrichtlinien aus PowerPoint, Word oder Text lesen, von der KI auswerten lassen, in voice.md schreiben; prüfbare Sprachregeln | Browser (Lesen), überall (Rest) |
| `pipeline.js` | Briefing, Outline, Folien, Layout-Anpassung; Wiederholung bei Fehlern; Faktenprüfung | Browser, Node |
| `bilder.js` | Bilder für den Export zuschneiden und als PNG oder JPG einbetten | nur Browser |
| `assets.js` | Rolle, Tags und Beschreibung für Bilddateien vorschlagen | Vorschlag überall, Bildanalyse nur Browser |
| `pakete.js` | ZIP lesen und schreiben, Designsysteme im Browser speichern, Kopien | nur Browser |
| `pptx-lesen.js` | OOXML lesen: Formen, Freiformen, Gruppen, Bilder, Texte, Farben mit Vererbung | nur Browser |
| `import-pptx.js` | Designsystem aus `.pptx` oder `.potx`: Layouts und Beispielfolien, Zweck erkennen, fehlende Typen ableiten | nur Browser |
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

`index.html` bleibt die App. Der Präsentationsgenerator hängt sich an sechs Stellen ein:

1. `<script type="module" src="praesentation/ui.js">` am Ende der Seite
2. Bildschirm `praes` in `render()`
3. Knopf „Präsentation“ in der Kopfzeile und Kachel bei den Vertiefungen
4. `window.KompassKI`: die Schnittstelle zur KI (siehe unten)
5. Speicherbereich `designsysteme` in der IndexedDB der App
6. Ergebnisseite der Projektanalyse: Knopf „Präsentation daraus erstellen“ und `Praes.hinweis()`, ein Hinweis, wenn die Person mit der Präsentation gestartet und dafür erst analysiert hat

Die Projektanalyse selbst bleibt unverändert. Startet eine Präsentation aus einem Projekt, gehen Akte, Steckbrief und Vertiefungen ins Briefing. Was die Analyse sicher klärt (Problem, Idee, Nutzen …), wird nicht noch einmal gefragt; Punkte zur Präsentation selbst (Publikum, Bitte, Umfang) nur, wenn die Person sie in ihrer Beschreibung genannt hat. Höchstens vier Fragen.

Der Zustand einer Präsentation liegt in `S.praes` und wird deshalb mit dem Projekt gespeichert, exportiert und importiert.

Wird `index.html` per Doppelklick geöffnet (`file://`), lädt der Browser keine Module. Die App funktioniert dann wie bisher, und der Bildschirm „Präsentation“ erklärt, dass ein Webserver nötig ist.

## KI-Anbindung

Die Pipeline kennt nur eine Funktion:

```js
ki.frage({ system, prompt, schema, art, bilder }) → geparstes JSON
```

In der App erfüllt `llm()` aus `index.html` diese Schnittstelle. Sie spricht Ollama und jeden OpenAI-kompatiblen Server an (LM Studio, llama.cpp, vLLM, Cloud-Anbieter mit API-Schlüssel) und übergibt das Schema als Structured Output (`format` bei Ollama, sonst `response_format` mit Rückfallstufen). Welcher Server genutzt wird, stellt man auf der Startseite ein. Eine `.env` gibt es nicht, weil die App keinen Server hat; die Einstellungen liegen im Browser.

Für Tests genügt ein Objekt mit einer `frage`-Funktion, siehe `tests/pipeline.test.js`.

## Präsentationsarten

[`prompts/arten.json`](../prompts/arten.json) beschreibt je Art, welche Punkte im Briefing geklärt werden (mit Priorität), welche davon vertieft werden können, die Dramaturgie, den Stil, passende Layouts und die Höchstzahl an Stichpunkten.

Das Briefing ist ein gesteuertes Gespräch: Die App entscheidet in jeder Runde, was als Nächstes dran ist (nächster Punkt, Vertiefung eines Schwerpunkts, Nachfrage oder fertig), und gibt der KI genau diesen Auftrag. Die KI formuliert die Frage passend zum Gesagten. So bleiben die Fragen relevant, auch mit kleinen Modellen. Regeln:

- Kernpunkte werden immer einmal geklärt, auch wenn die KI sie aus der Beschreibung ableiten konnte.
- Wer ankündigt, dass es Zahlen gibt, ohne eine zu nennen, wird nach der Zahl gefragt.
- Nachfragen höchstens einmal je Punkt, Vertiefung höchstens einmal je Schwerpunkt.
- Höchstens sechs Fragen; danach nur noch fehlende Kernpunkte.

## Welches Layout für welche Folie

Die KI wählt kein Layout, sondern die Form, in der eine Aussage wirken soll (`analyse.js`, `FORMEN`): Kernsatz, Zahl, Kennzahlen, Liste, Bausteine, Vergleich, Ablauf, Bild, Zitat, Kapitel, Titel, Abschluss. Dazu markiert sie die zwei, drei wichtigsten Aussagen als betont.

Jedes Layout bekommt ein Profil, rein aus seinen Platzhaltern: größte Schrift im Verhältnis zum Fließtext, dunkler Grund, Fettung, Bildanteil und Bildseite, Kacheln für Zahlen, Textmenge. Daraus ergibt sich die „Wucht“ (wie stark das Layout betont) und die Eignung je Form. `waehleLayouts` nimmt je Folie das Layout mit der höchsten Eignung und berücksichtigt:

- Betonte Aussagen bekommen Layouts mit mehr Wucht, Listen lieber ruhige.
- Kein Layout zweimal hintereinander, mehrere Varianten desselben Zwecks wechseln sich ab.
- Bildseiten wechseln; gibt es nur eine Seite und die KI darf Layouts anpassen, wird gespiegelt.
- Höchstens etwa ein Drittel reine Textfolien, höchstens ein Zitat.
- Ohne Fotos im Designsystem keine Bildfolien.

Weil die Wahl nur von Form und Betonung abhängt, wählt der Kompass beim Wechsel des Designsystems für jede Folie neu das passende Layout. Inhalte wandern dabei in verwandte Felder (eine Überschrift wird zur großen Aussage, Kacheln werden zur Liste). Passt ein Text nicht mehr, bietet der Editor an, die betroffenen Folien von der KI anpassen zu lassen.

## KI darf Layouts anpassen

Ein Schalter im Schritt Designsystem und im Editor. Aus: Jede Folie sieht exakt so aus wie im Designsystem. An:

- Nach dem Schreiben bekommt die KI je Folie die Inhaltsflächen mit Position, Größe und Füllstand und die feste Gestaltung der Marke und schlägt neue Positionen und Größen vor (`prompts/gestalten.md`).
- Ohne KI wächst eine Textfläche, deren Schrift stark verkleinert werden musste, in freien Raum (`luftFuerText`).
- `pruefeAnpassung` verwirft alles, was über den Rand ragt, Text oder Logo überdeckt oder Text kleiner macht oder abschneidet.
- Die Anpassung liegt als `anpassung` in der Folie der Slide-Spec; das Designsystem bleibt unverändert. Mit dem Schalter aus wird sie ausgeblendet, „Original-Layout“ entfernt sie.

## Prüfung in vier Stufen

1. **Antwortformat.** Jede Folie bekommt ein eigenes JSON-Schema: nur die Felder ihres Layouts und Bild-IDs als feste Auswahl. Layout-IDs in der Outline sind ebenfalls eine feste Auswahl. Zeichenlimits stehen bewusst nicht im Schema, weil Server mit Grammatik (Ollama, llama.cpp) den Text sonst mitten im Wort abschneiden; sie stehen im Prompt und werden in Stufe 2 geprüft.
2. **Prüfung der Antwort.** `validateSpec` prüft Layout-IDs, Platzhalter, Limits und Bild-IDs. `pruefeFakten` prüft, ob Zahlen, E-Mail- und Webadressen im Briefing stehen. `pruefeStil` erkennt Überschriften, die über die Präsentation statt über die Sache sprechen („Willkommen“, „… im Pitch“), zu viele Stichpunkte für die Art und Verstöße gegen die Formulierungsrichtlinien (verbotene Wörter, bevorzugte Begriffe, Du oder Sie).
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

- **PowerPoint-Master.** Der Export zeichnet jede Folie vollständig (Hintergrund, Formen, Bilder, Texte). Die Folienmaster der Vorlage stecken nicht als Master in der exportierten Datei.
- **Import.** Tabellen, Diagramme, SmartArt und Videos werden nicht übernommen, Bilder im Format EMF oder WMF ebenfalls nicht. Seltene PowerPoint-Grundformen zeigt die Vorschau angenähert; im Export sind sie exakt.
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
