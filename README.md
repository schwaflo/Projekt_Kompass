# Projekt-Kompass

Ein Werkzeug, das dich vor dem Start eines Projekts durch die wichtigen Fragen führt: Problem, Zielgruppe, Ziel, Inhalte, Risiken. Am Ende stehen ein Projekt-Steckbrief mit Strategien, Vertiefungen wie Personas, Stakeholder-Analyse und SWOT, und für Gestaltungsprojekte ein Design-Studio für Flyer und Website-Wireframes.

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

1. Neues Repository anlegen und `index.html` und `README.md` hochladen.
2. **Settings → Pages**: unter „Build and deployment“ als Quelle „Deploy from a branch“, Branch `main`, Ordner `/ (root)` wählen.
3. Nach ein, zwei Minuten ist die Seite unter `https://<dein-name>.github.io/<repo-name>/` erreichbar.

## Lokal nutzen, ohne GitHub

```
python3 -m http.server 8765
```

im Ordner mit `index.html` starten und `http://localhost:8765` öffnen. Ollama braucht dann keine zusätzliche Freigabe.

## Gut zu wissen

- **Projekte** speichert der Browser getrennt für jede Adresse. Was du lokal unter `localhost` gespeichert hast, erscheint nicht automatisch auf der GitHub-Seite. Mit „Projekte → Als Datei“ und „Datei öffnen“ nimmst du Projekte mit, auch auf andere Rechner.
- Schriften im Design-Studio werden von Google Fonts geladen. Alles andere kommt aus dieser einen Datei.

### Wenn es nicht funktioniert und Der Port nicht gestattet wird

```javascript
launchctl setenv OLLAMA_ORIGINS "https://<dein-name>.github.io"
OLLAMA_ORIGINS="https://<dein-name>.github.io" ollama serve
```
