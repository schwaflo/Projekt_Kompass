# Projekt-Kompass

Ein Werkzeug, das dich vor dem Start eines Projekts durch die wichtigen Fragen führt: Problem, Zielgruppe, Ziel, Inhalte, Risiken. Am Ende stehen ein Projekt-Steckbrief mit Strategien, Vertiefungen wie Personas, Stakeholder-Analyse und SWOT, für Gestaltungsprojekte ein Design-Studio für Flyer und Website-Wireframes, und ein Präsentationsgenerator, der aus einem kurzen Briefing fertige PowerPoint-Folien in deinem Design macht.

**Die App läuft komplett in deinem Browser.** Sie spricht direkt mit einem KI-Server auf deinem eigenen Rechner. Es gibt keinen Server dazwischen, und deine Projektdaten liegen nur in deinem Browser.

## Nutzen

1. Seite öffnen: `https://<dein-name>.github.io/<repo-name>/`
2. Auf der Startseite unter **KI-Server** auswählen, was du nutzt, und Adresse und Port prüfen.
3. Auf **Verbinden** klicken. Klappt es nicht, zeigt die App genau die Schritte, die für deinen Server fehlen.

Tipp: Mit Chrome, Edge oder Firefox klappt es am zuverlässigsten. Safari blockiert die Verbindung von einer Website zu `localhost`.

### Mit Ollama

Ollama muss dieser Seite einmalig erlauben, dass sie es nutzen darf. Ersetze die Adresse durch die deiner Seite (ohne Pfad), und starte Ollama danach neu.

macOS:

```
launchctl setenv OLLAMA_ORIGINS "https://<dein-name>.github.io"
```

Windows:

```
setx OLLAMA_ORIGINS "https://<dein-name>.github.io"
```

Linux (systemd): `sudo systemctl edit ollama` und unter `[Service]` eintragen:

```
Environment="OLLAMA_ORIGINS=https://<dein-name>.github.io"
```

Danach ein Modell laden, zum Beispiel `ollama pull qwen3:14b`.

### Mit LM Studio

Im Bereich **Developer** den Server starten und in den Server-Einstellungen **Enable CORS** einschalten. Ein Modell laden. Die Adresse ist meist `http://localhost:1234`.

### Mit einem anderen Server

Alles, was die OpenAI-Schnittstelle spricht, funktioniert: llama.cpp, Jan, vLLM und andere. Der Server muss Anfragen von dieser Seite erlauben (CORS).

Auch Cloud-Anbieter wie `https://api.openai.com/v1` oder `https://openrouter.ai/api/v1` lassen sich mit einem eigenen API-Schlüssel nutzen. Dann werden deine Projektdaten allerdings an diesen Anbieter geschickt; die App weist darauf hin.

### Zugangsschlüssel

Verlangt dein Server einen Schlüssel, trägst du ihn auf der Startseite ein. Er wird nur im Speicher deines Browsers abgelegt, nie in Projekten oder Exporten mitgegeben und nie in diesem Repository gespeichert.

### Vorbelegter Link

Du kannst einen Link teilen, der den Server schon auswählt, zum Beispiel:

```
https://<dein-name>.github.io/<repo-name>/#anbieter=lmstudio&server=http://localhost:1234
```

Mögliche Werte für `anbieter`: `ollama`, `lmstudio`, `openai`. Einen Schlüssel nimmt der Link absichtlich nicht entgegen.

## Veröffentlichen auf GitHub Pages

1. Neues Repository anlegen und den gesamten Inhalt dieses Ordners hochladen. Die App selbst ist `index.html`; der Präsentationsgenerator braucht zusätzlich die Ordner `praesentation/`, `prompts/`, `design-systems/`, `examples/` und `vendor/`.
2. **Settings → Pages**: unter „Build and deployment“ als Quelle „Deploy from a branch“, Branch `main`, Ordner `/ (root)` wählen.
3. Nach ein, zwei Minuten ist die Seite unter `https://<dein-name>.github.io/<repo-name>/` erreichbar.

## Lokal nutzen, ohne GitHub

```
python3 -m http.server 8765
```

im Ordner mit `index.html` starten und `http://localhost:8765` öffnen. Ollama braucht dann keine zusätzliche Freigabe.

Ein Doppelklick auf `index.html` funktioniert für die Projektanalyse ebenfalls. Der Präsentationsgenerator braucht den kleinen Webserver, weil er Designsysteme und Prompts nachlädt.

### Mit Docker

```
docker compose up
```

startet die App unter `http://localhost:8080`. Der Ordner `design-systems/` ist eingebunden: Ein neues Designsystem dort ablegen und die Seite neu laden genügt. Den KI-Server stellst du wie gewohnt auf der Startseite ein, zum Beispiel Ollama auf deinem Rechner unter `http://localhost:11434`.

Für einen Server in der Cloud reicht jeder Dienst, der statische Dateien oder dieses Docker-Image ausliefert. Die App hat kein Backend. Liegt die Seite unter HTTPS, muss auch der KI-Server unter HTTPS erreichbar sein (oder auf dem eigenen Rechner unter `localhost` laufen).

## Präsentationsgenerator

Über **Präsentation** in der Kopfzeile:

1. **Thema** beschreiben, auf Wunsch mit dem geöffneten Projekt als Grundlage.
2. **Briefing:** Die KI fragt nach Ziel, Zielgruppe, Kernbotschaft, Umfang und dem, was sonst noch fehlt.
3. **Designsystem** wählen. Die KI schlägt eines vor.
4. **Folien** ansehen, Texte ändern, einzelne Folien neu schreiben lassen, Layout oder Designsystem wechseln und als PowerPoint speichern.

Die KI liefert nur Inhalt und Struktur. Farben, Schriften, Layouts und Logos kommen aus dem Designsystem. Zwei Demo-Systeme sind dabei; **Beispiel ansehen, ohne KI** zeigt sie sofort.

| Mehr dazu | |
|---|---|
| [docs/eigenes-designsystem.md](docs/eigenes-designsystem.md) | Eigenes Designsystem anlegen: im Editor, aus einer PowerPoint-Vorlage oder von Hand |
| [docs/architektur.md](docs/architektur.md) | Wie das Modul aufgebaut ist |
| [prompts/README.md](prompts/README.md) | Alle Prompts und der Ablauf der KI-Aufrufe |
| [design-systems/demo-corporate/README.md](design-systems/demo-corporate/README.md) | Welche Datei eines Designsystems wohin gehört |
| [examples/](examples/) | Beispiel-Slide-Spec und fertige `.pptx` in beiden Demo-Systemen |

### Tests

`http://localhost:8765/tests/` öffnen, oder ohne Browser `node tests/run.mjs`.

## Gut zu wissen

- **Projekte** speichert der Browser getrennt für jede Adresse. Was du lokal unter `localhost` gespeichert hast, erscheint nicht automatisch auf der GitHub-Seite. Mit „Projekte → Als Datei“ und „Datei öffnen“ nimmst du Projekte mit, auch auf andere Rechner.
- Schriften im Design-Studio werden von Google Fonts geladen, im Präsentationsgenerator nur, wenn du die Wunschschrift eines Designsystems wählst. Alles andere liegt in diesem Repository.
- **Eigene Designsysteme**, die du im Editor anlegst oder hochlädst, speichert der Browser ebenfalls je Adresse. Mit „Als ZIP speichern“ nimmst du sie mit.
- Nutzt du einen Cloud-Anbieter als KI-Server, gehen auch Briefing und Folientexte dorthin.

### Wenn es nicht funktioniert und Der Port nicht gestattet wird

```javascript
launchctl setenv OLLAMA_ORIGINS "https://<dein-name>.github.io"
OLLAMA_ORIGINS="https://<dein-name>.github.io" ollama serve
```
