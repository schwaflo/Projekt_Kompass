# Prompts

Alle Texte, die an die KI gehen, liegen hier als eigene Dateien. Im Code steht kein Prompt. Jede Datei beginnt mit einem Kopf (`name`, `version`, `zweck`, `variablen`), danach folgt der Text. Stellen in doppelten geschweiften Klammern wie `{{briefing}}` ersetzt die Pipeline ([praesentation/pipeline.js](../praesentation/pipeline.js)) vor dem Absenden.

Wer einen Prompt ändert, erhöht `version`. Die Version steht im Protokoll jedes KI-Aufrufs.

| Datei | Schritt | Antwort der KI |
|---|---|---|
| [system-briefing.md](system-briefing.md) | Rolle für das Briefing-Gespräch | – |
| [briefing-start.md](briefing-start.md) | Briefing, erste Runde | bekannte Angaben, erste Frage |
| [briefing-runde.md](briefing-runde.md) | Briefing, jede weitere Runde | Einträge, Nachfrage oder nächste Frage |
| [designsystem.md](designsystem.md) | Designsystem vorschlagen | ID eines Designsystems, Begründung |
| [system.md](system.md) | Rolle für Outline und Folien, enthält `voice.md` und die Regeln des Designsystems | – |
| [outline.md](outline.md) | Gliederung | Titel, Storyline, Folien mit Layout und Kernaussage |
| [folie.md](folie.md) | Eine Folie schreiben oder neu schreiben | Inhalte je Feld, Sprechernotizen |
| [korrektur.md](korrektur.md) | Anhang bei ungültiger Antwort | – |

## Ablauf

```
Briefing-Gespräch ──► Briefing (JSON) ──► Outline (1 Aufruf) ──► je Folie 1 Aufruf ──► Slide-Spec
```

Jede Folie wird einzeln geschrieben. So bekommt die KI genau die Felder und Limits ihres Layouts als Antwortformat vorgegeben, und eine ungültige Folie wird allein wiederholt.

## Prüfung und Wiederholung

1. Das Antwortformat wird als JSON-Schema an den KI-Server übergeben (Ollama `format`, sonst `response_format`). Layout-IDs und Bild-IDs sind darin als feste Auswahl hinterlegt.
2. Jede Antwort wird zusätzlich geprüft: Layout-IDs, Bild-IDs, Zeichen- und Stichpunktlimits.
3. Zahlen, E-Mail-Adressen und Webadressen auf einer Folie müssen im Briefing stehen. Erfundene Angaben gelten als Fehler.
4. Bei Fehlern geht derselbe Prompt mit `korrektur.md` und den konkreten Fehlermeldungen erneut an die KI. Insgesamt gibt es höchstens drei Versuche.
5. Ist die Antwort dann noch ungültig, kürzt die App selbst: zu lange Texte an der Wortgrenze, überzählige Punkte entfallen, fehlende Pflichtinhalte werden als `[…]` markiert. Was geändert wurde, steht im Protokoll. Angaben, die nicht aus dem Briefing stammen, bleiben stehen und werden zur Prüfung gemeldet.
