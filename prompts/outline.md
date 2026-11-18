---
name: outline
version: 4
zweck: Erstellt aus dem Briefing die Gliederung: Storyline, Folienreihenfolge und je Folie die Form, in der die Aussage wirken soll. Das passende Layout wählt danach die App.
variablen: art, briefing, material, dramaturgie, stil, formen, folienzahl
---
ART DER PRÄSENTATION: {{art}}

BRIEFING (JSON):
{{briefing}}

MATERIAL DER PERSON (muss vollständig in die Präsentation; kann leer sein):
{{material}}

DRAMATURGIE FÜR DIESE ART (Reihenfolge der Abschnitte):
{{dramaturgie}}

STIL: {{stil}}

FORMEN, DIE DAS DESIGNSYSTEM DARSTELLEN KANN (form – wann sie passt):
{{formen}}

AUFGABE: Erstelle die Gliederung für eine Präsentation mit etwa {{folienzahl}} Folien.
- titel: kurzer Titel (höchstens 40 Zeichen), der neugierig macht. Er erscheint in der Fußzeile. Nicht das Wort „Präsentation“ oder „Pitch“.
- storyline: der rote Faden in zwei Sätzen.
- kernbotschaft: der eine Satz, der hängen bleiben soll. Steht er im Briefing, übernimm ihn, sonst leite ihn ab.
- folien: in Reihenfolge, entlang der Dramaturgie. Je Folie:
  - abschnitt: welcher Abschnitt der Dramaturgie das ist.
  - form: genau eine form aus der Liste. Überlege, wie die Aussage am stärksten wirkt: Ein Satz, der hängen bleiben soll → kernsatz. Eine einzelne beeindruckende Zahl aus dem Briefing → zahl. Mehrere Zahlen → kennzahlen. Drei gleichwertige Teile → bausteine. Vorher und nachher, Problem und Lösung → vergleich. Schritte oder Termine → ablauf. Eine Szene, die man sehen soll → bild. Erst wenn nichts davon passt → liste.
  - betont: true, wenn diese Aussage zu den zwei, drei wichtigsten der ganzen Präsentation gehört und groß und kräftig erscheinen soll, sonst false. Höchstens ein Drittel der Folien ist betont.
  - kernaussage: die eine Aussage dieser Folie als ganzer, konkreter Satz über die Sache selbst, nicht über die Präsentation.
  - inhalt: in Stichworten, was auf die Folie gehört. Nur Informationen aus Briefing und Material.
  - material: nur wenn es Material gibt: die ID des Materials, das diese Folie trägt, sonst "". Jedes Bild und jede Tabelle bekommt genau eine eigene Folie, ein Bild mit der Form bild, eine Tabelle mit der Form tabelle. Ein Text der Person liefert Inhalt; setze seine ID bei der Folie, die ihn hauptsächlich nutzt. Plane die Folien mit Material dort ein, wo sie in der Dramaturgie eine Aussage stützen, nicht gesammelt am Ende. Titel und Abschluss tragen kein Bild und keine Tabelle.

Regeln:
- Die erste Folie hat die Form titel, die letzte die Form abschluss mit der Bitte oder Handlungsaufforderung aus dem Briefing.
- Abwechslung: Keine zwei gleichen Formen hintereinander. Nach zwei textlastigen Folien (liste, vergleich, bausteine) kommt kernsatz, zahl oder bild.
- kapitel nur bei mehr als acht Folien.
- Fehlt in Briefing und Material eine Zahl, plane keine Folie mit der Form zahl oder kennzahlen.
