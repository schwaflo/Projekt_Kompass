# Prompts

Alle Texte, die an die KI gehen, liegen hier als eigene Dateien. Im Code steht kein Prompt. Jede Datei beginnt mit einem Kopf (`name`, `version`, `zweck`, `variablen`), danach folgt der Text. Stellen in doppelten geschweiften Klammern wie `{{briefing}}` ersetzt die Pipeline ([praesentation/pipeline.js](../praesentation/pipeline.js)) vor dem Absenden.

Wer einen Prompt ändert, erhöht `version`. Die Version steht im Protokoll jedes KI-Aufrufs.

| Datei | Schritt | Antwort der KI |
|---|---|---|
| [arten.json](arten.json) | Präsentationsarten: Erkennen, Fragen je Art, Dramaturgie, Stil, passende Layouts | – |
| [briefing-art.md](briefing-art.md) | Briefing: Art der Präsentation erkennen | Art, Arbeitstitel |
| [system-briefing.md](system-briefing.md) | Rolle für das Briefing-Gespräch | – |
| [briefing-start.md](briefing-start.md) | Briefing, erste Runde | bekannte Angaben, Schwerpunkte, unwichtige Punkte, erste Frage |
| [briefing-runde.md](briefing-runde.md) | Briefing, jede weitere Runde | Einträge, Nachfrage, Vertiefung oder nächste Frage |
| [briefing-annahme.md](briefing-annahme.md) | Briefing, wenn die Person „Weiß ich nicht“ wählt | – |
| [briefing-material.md](briefing-material.md) | Briefing, wenn die Person mitten im Gespräch Material hinzufügt | Einträge, die das Material belegt; offene Frage neu oder die nächste |
| [designsystem.md](designsystem.md) | Designsystem vorschlagen | ID eines Designsystems, Begründung |
| [system.md](system.md) | Rolle für Outline und Folien, enthält `voice.md` und die Regeln des Designsystems | – |
| [outline.md](outline.md) | Gliederung nach der Dramaturgie der Art | Titel, Storyline, Kernbotschaft, Folien mit Abschnitt, Form (Kernsatz, Zahl, Vergleich …), Betonung, Kernaussage und dem Material, das die Folie trägt. Das Layout wählt danach die App; Material ohne Folie bekommt eine. |
| [folie.md](folie.md) | Eine Folie schreiben oder neu schreiben | Inhalte je Feld, Sprechernotizen |
| [richtlinien.md](richtlinien.md) | Designsystem-Editor: Formulierungsrichtlinien einer Marke aus einer Datei lesen, Teil für Teil | Tonalität, Anrede, Regeln, verbotene und bevorzugte Begriffe, Schreibweisen, Beispiele. Die App führt die Teile zusammen und schreibt sie in voice.md. |
| [gestalten.md](gestalten.md) | Nur mit dem Schalter „KI darf Layouts anpassen“: Positionen und Größen der Flächen einer fertigen Folie verbessern | Geänderte Flächen, Spiegeln ja/nein, Begründung. Die App prüft Ränder, Überlappung und Lesbarkeit. |
| [korrektur.md](korrektur.md) | Anhang bei ungültiger Antwort | – |
| [asset-beschreiben.md](asset-beschreiben.md) | Designsystem-Editor: Bild beschreiben lassen (optional, braucht ein Modell mit Bildverständnis) | Beschreibung, Tags |
| [layouts-bewerten.md](layouts-bewerten.md) | Designsystem-Editor: nach dem Import einer PowerPoint-Vorlage jedes Layout einordnen (auch von Hand startbar) | Je Layout Zweck, passende Wirkungen (beste zuerst), „nicht verwenden“. Die App rechnet das bei der Layoutwahl mit ein. |
| [material-bild.md](material-bild.md) | Material: Bild der Person beschreiben (braucht ein Modell mit Bildverständnis) | Beschreibung, Foto oder Grafik, Aussage, lesbarer Text |
| [material-text.md](material-text.md) | Material: langen Text der Person zusammenfassen | Kurzfassung, wichtigste Aussagen |

## Präsentationsarten

[`arten.json`](arten.json) bestimmt, wie sich das Briefing anfühlt und wie die Folien klingen. Jede Art (Pitch, Entscheidungsvorlage, Bericht, Schulung, Vorstellung) hat eigene Punkte mit Priorität, eine Dramaturgie, einen Stil und Hinweise für die Layoutwahl. Neue Arten lassen sich dort ergänzen, ohne Code zu ändern.

Das Briefing ist kein Formular: Die App gibt der KI in jeder Runde einen Auftrag (nächster Punkt, Vertiefung eines Schwerpunkts oder fertig), die KI formuliert die Frage passend zum Gespräch. Höchstens `fragenMax` Fragen, Nachfragen zu einem Punkt höchstens einmal.

## Ablauf

```
Art erkennen ──► Briefing-Gespräch ──► Briefing (JSON) ──► Outline (1 Aufruf) ──► je Folie 1 Aufruf ──► Slide-Spec
```

Jede Folie wird einzeln geschrieben. So bekommt die KI genau die Felder und Limits ihres Layouts als Antwortformat vorgegeben, und eine ungültige Folie wird allein wiederholt.

Material der Person (Fotos, Tabellen, Texte) läuft durch alle Schritte mit: im Briefing als `{{material}}`, in der Outline als Liste mit IDs, beim Schreiben einer Folie vollständig als `MATERIAL`. Kommt Material mitten im Briefing dazu, folgt ein Aufruf mit `briefing-material.md`. Bilder und Tabellen setzt die App selbst auf die Folie; die KI schreibt nur Überschrift, Aussage und Notizen dazu.

## Prüfung und Wiederholung

1. Das Antwortformat wird als JSON-Schema an den KI-Server übergeben (Ollama `format`, sonst `response_format`). Layout-IDs und Bild-IDs sind darin als feste Auswahl hinterlegt.
2. Jede Antwort wird zusätzlich geprüft: Layout-IDs, Bild-IDs, Zeichen- und Stichpunktlimits.
3. Zahlen, E-Mail-Adressen und Webadressen auf einer Folie müssen im Briefing stehen. Erfundene Angaben gelten als Fehler.
4. Bei Fehlern geht derselbe Prompt mit `korrektur.md` und den konkreten Fehlermeldungen erneut an die KI. Insgesamt gibt es höchstens drei Versuche.
5. Ist die Antwort dann noch ungültig, kürzt die App selbst: zu lange Texte an der Wortgrenze, überzählige Punkte entfallen, fehlende Pflichtinhalte werden als `[…]` markiert. Was geändert wurde, steht im Protokoll. Angaben, die nicht aus dem Briefing stammen, bleiben stehen und werden zur Prüfung gemeldet.
