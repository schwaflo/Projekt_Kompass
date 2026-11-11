# Demo Hell

Das zweite mitgelieferte Designsystem, bewusst anders als „Demo Corporate“: helle Folien, Serifenschrift, linksbündig, ein einziger Akzent. Es hat dieselben Layout-IDs und Platzhalter, deshalb lässt sich jede Präsentation ohne Änderung am Inhalt zwischen beiden Systemen umschalten.

Der Aufbau des Pakets und das Ersetzen der Dateien funktionieren wie in [Demo Corporate](../demo-corporate/README.md).

## Welche Datei gehört wohin?

| Datei | Rolle | Empfohlene Größe | Erscheint auf |
|---|---|---|---|
| `assets/logos/logo-primary.svg` | `logo-primary` | 600 × 160 px (etwa 15:4), transparent | Titelfolie oben links, Abschlussfolie unten rechts |
| `assets/logos/logo-negative.svg` | `logo-negative` | 600 × 160 px, transparent, helle Farbe | Auf keiner Folie, weil es keine dunklen Folien gibt |
| `assets/logos/logo-icon.svg` | `logo-icon` | 256 × 256 px | Auf keiner Folie fest verbaut |
| `assets/images/hero.svg` | `hero-image` | 1920 × 1080 px, JPG oder PNG | `image-full`, obere zwei Drittel der Folie |
| `assets/images/portrait.svg` | `portrait-image` | 1280 × 1800 px, JPG oder PNG | `image-left`, links mit Rand |
| `assets/images/square.svg` | `square-image` | 1200 × 1200 px, JPG oder PNG | Wählbar für `image-left`, wird auf Hochformat beschnitten |

## Was unterscheidet es von Demo Corporate?

| | Demo Corporate | Demo Hell |
|---|---|---|
| Titel- und Kapitelfolien | dunkelblau | hell |
| Überschriften | Manrope, fett | Fraunces (Serife), normal |
| Aufzählungszeichen | Punkt | Strich |
| Kennzahlen | Karten auf grauer Fläche, zentriert | ohne Karten, linksbündig, Akzentfarbe |
| Seitenzahl | unten rechts | oben rechts |
| Anrede in `voice.md` | Sie | Du |
