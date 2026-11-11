# Designsysteme

Jeder Ordner hier ist ein Designsystem für den Präsentationsgenerator. Die App findet sie beim Laden von selbst.

| Ordner | Beschreibung |
|---|---|
| [demo-corporate](demo-corporate/README.md) | Dunkelblau mit türkisem Akzent. Vollständige Vorlage mit Erklärung jedes Assets. |
| [demo-hell](demo-hell/README.md) | Hell, Serifenschrift, ein Akzent. Zeigt, dass derselbe Inhalt anders aussehen kann. |

Eigenes Designsystem anlegen: [docs/eigenes-designsystem.md](../docs/eigenes-designsystem.md).

`index.json` listet die Ordner auf. GitHub Pages kann keine Ordner auflisten und braucht diese Datei. Eine GitHub Action pflegt sie nach jedem Push auf `main`; von Hand geht es mit `node scripts/build-index.mjs`.
