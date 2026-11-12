import { test, assert, gleich, meldet, env } from './harness.js';
import { loadPackage, fnSource } from '../praesentation/registry.js';
import { validateSpec } from '../praesentation/spec.js';
import { buildSlides } from '../praesentation/layout.js';
import * as P from '../praesentation/pipeline.js';
import { waehleLayouts, profil, rangliste } from '../praesentation/analyse.js';
import { ordneInhaltZu } from '../praesentation/spec.js';

const system = async id => (await loadPackage(fnSource({ readText: p => env.readText(`design-systems/${id}/${p}`) }), id)).system;
const prompts = () => P.ladePrompts(env.readText);

/* Simulierte KI: beantwortet jede Anfrage aus einer Liste und merkt sich, was gefragt wurde */
function kiMit(antworten) {
  const ki = { anfragen: [], frage: async a => { ki.anfragen.push(a); const n = antworten.shift(); if (n === undefined) throw new Error('simulierte KI: keine Antwort mehr hinterlegt'); return typeof n === 'function' ? n(a) : n; } };
  return ki;
}
const BRIEFING = { schemaVersion: '2.0', art: 'entscheidung', art_name: 'Entscheidungsvorlage', thema: 'Neues Kundenportal', ziel: 'Freigabe für Phase 2', zielgruppe: 'Lenkungskreis', kernbotschaft: 'Das Portal entlastet den Service', anlass: 'Sitzung am 14. Mai', pflichtinhalte: 'Ergebnisse der Pilotphase', daten: '72 % nutzen das Portal monatlich; 31 % weniger Anrufe', cta: 'Freigabe erteilen', umfang: '5 Folien', folienzahl: 5, weiteres: [], annahmen: [] };
const OUTLINE = { titel: 'Neues Kundenportal', storyline: 'Der Pilot lief gut. Jetzt braucht es die Freigabe.', kernbotschaft: 'Das Portal entlastet den Service', folien: [
  { abschnitt: 'Abschnitt', form: 'titel', betont: false, layoutId: 'title', kernaussage: 'Das Kundenportal ist bereit für den nächsten Schritt.', inhalt: 'Titel, Anlass' },
  { abschnitt: 'Abschnitt', form: 'kennzahlen', betont: true, layoutId: 'kpi-grid', kernaussage: 'Die Pilotphase hat überzeugt.', inhalt: '72 %, 31 %' },
  { abschnitt: 'Abschnitt', form: 'liste', betont: false, layoutId: 'content-bullets', kernaussage: 'Das Portal löst die häufigsten Anliegen.', inhalt: 'Rechnungen, Adresse, Status' },
  { abschnitt: 'Abschnitt', form: 'bild', betont: false, layoutId: 'image-left', kernaussage: 'Das Team gewinnt Zeit.', inhalt: 'Beratung' },
  { abschnitt: 'Abschnitt', form: 'abschluss', betont: false, layoutId: 'closing', kernaussage: 'Wir bitten um die Freigabe.', inhalt: 'Freigabe erteilen' }
] };
const FOLIEN = [
  { inhalt: { title: 'Kundenportal: bereit für Phase 2', subtitle: 'Ergebnisse der Pilotphase', meta: 'Lenkungskreis · 14. Mai' }, notizen: 'Begrüßung.' },
  { inhalt: { title: 'Die Pilotphase hat überzeugt', kpis: [{ value: '72 %', label: 'nutzen das Portal monatlich' }, { value: '−31 %', label: 'weniger Anrufe' }] }, notizen: 'Zahlen erläutern.' },
  { inhalt: { title: 'Das Portal löst die häufigsten Anliegen', bullets: ['Rechnungen einsehen', 'Adresse ändern', 'Status verfolgen'] }, notizen: 'Beispiele nennen.' },
  { inhalt: { title: 'Das Team gewinnt Zeit für Beratung', bullets: ['Weniger Routineanfragen'], image: 'portrait' }, notizen: 'Stimmen aus dem Team.' },
  { inhalt: { title: 'Vielen Dank', body: 'Wir bitten Sie um die Freigabe für Phase 2.' }, notizen: 'Beschluss festhalten.' }
];

/* ---------- Prompts ---------- */
test('Prompts: alle Dateien vorhanden, mit Name und Version', async () => {
  const p = await prompts();
  P.PROMPT_NAMEN.forEach(n => { gleich(p[n].meta.name, n); assert(/^\d+$/.test(p[n].meta.version), `${n}: Version fehlt`); assert(p[n].text.trim().length > 50); });
  const liste = await env.readText('prompts/README.md');
  P.PROMPT_NAMEN.forEach(n => assert(liste.includes(`${n}.md`), `${n}.md fehlt in der Prompt-Übersicht`));
});

test('Prompts: fehlender Wert fällt sofort auf', async () => {
  const p = await prompts();
  let fehler = '';
  try { P.fuelle(p.outline, { briefing: '{}' }); } catch (e) { fehler = e.message; }
  assert(fehler.includes('{{art}}'), fehler);
  gleich(P.fuelle({ meta: {}, text: 'A {{x}} B {{x}}' }, { x: 1 }), 'A 1 B 1');
});

/* ---------- Präsentationsarten ---------- */
test('Arten: jede Art hat Kernpunkte, Dramaturgie, Stil und nennt nur vorhandene Layouts', async () => {
  const { arten } = await prompts(), sys = await system('demo-corporate'), typen = new Set(sys.layouts.map(l => l.typ));
  gleich(arten.arten.map(a => a.id), ['pitch', 'entscheidung', 'bericht', 'wissen', 'vorstellung']);
  arten.arten.forEach(a => {
    assert(a.felder.some(f => f.prio === 'kern'), `${a.id}: kein Kernpunkt`);
    a.felder.forEach(f => assert(['kern', 'hoch', 'mittel', 'auto'].includes(f.prio) && f.frage && f.label, `${a.id}.${f.id}`));
    assert(a.dramaturgie.length >= 5 && a.stil.length > 40 && a.erkennen.length >= 3, a.id);
    [...a.layouts.matchAll(/\(([a-z, -]+)\)/g)].flatMap(m => m[1].split(', ')).forEach(id => assert(typen.has(id), `${a.id}: Layout „${id}“ gibt es nicht`));
  });
  gleich(P.artNachWorten('Ich will meine Idee vor der Jury pitchen', arten), 'pitch');
  gleich(P.artNachWorten('Quartalsbericht zum Stand des Projekts', arten), 'bericht');
  gleich(P.artNachWorten('irgendwas', arten), 'vorstellung');
});

/* ---------- Briefing ---------- */
const pitchBriefing = async () => { const p = await prompts(), B = P.neuesBriefing('Ideenpitch: besseres Besuchererlebnis im Eingangsbereich'); P.setzeArt(B, 'pitch', p.arten); return { p, B }; };
const feld = (B, id) => B.felder.find(f => f.id === id);

test('Briefing: Art wird erkannt, Punkte der Art, Schwerpunkte, Unwichtiges, erste Frage', async () => {
  const p = await prompts(), B = P.neuesBriefing('Ich will im Team die Idee pitchen, den Besucherbereich neu zu gestalten. Heute stehen Gäste ratlos vor der Tür.');
  const ki = kiMit([
    { art: 'pitch', thema: 'Präsentation Besucherbereich neu' },
    { vorbefuellt: [{ feld: 'problem', wert: 'Gäste stehen ratlos vor der Tür', status: 'bestaetigt' }, { feld: 'kernbotschaft', wert: 'Ein klarer Empfang macht aus Gästen Fans', status: 'annahme' }],
      schwerpunkte: ['problem', 'nutzen'], unwichtig: ['belege'],
      erste_frage: { feld: 'idee', frage: 'Wie sieht der neue Besucherbereich in einem Satz aus?', vorschlaege: ['Ein Empfangstresen mit Leitsystem', 'Ein digitaler Check-in'] } }
  ]);
  await P.briefingStart(ki, p, B, '');
  gleich(B.art, 'pitch');
  gleich(feld(B, 'thema').wert, 'Besucherbereich neu', 'das Wort „Präsentation“ fliegt raus');
  ['problem', 'idee', 'bitte', 'nutzen', 'belege'].forEach(id => assert(feld(B, id), id + ' fehlt'));
  assert(!feld(B, 'ziel') && !feld(B, 'daten'), 'keine Punkte anderer Arten');
  assert(feld(B, 'problem').schwerpunkt && feld(B, 'nutzen').schwerpunkt);
  gleich([feld(B, 'belege').status, feld(B, 'belege').unwichtig], ['uebersprungen', true]);
  gleich([B.aktuell.feld, B.aktuell.art], ['idee', 'neu']);
  const [a1, a2] = ki.anfragen;
  gleich(a1.schema.properties.art.enum, ['pitch', 'entscheidung', 'bericht', 'wissen', 'vorstellung']);
  assert(a2.prompt.includes('ART DER PRÄSENTATION: Pitch') && a2.prompt.includes('"idee" (Idee:') && !a2.prompt.includes('{{'));
  gleich(a2.schema.properties.erste_frage.properties.feld.enum, ['problem', 'idee', 'bitte']);
  assert(!a2.schema.properties.unwichtig.items.enum.includes('problem'), 'Kernpunkte können nicht weggelassen werden');
});

test('Briefing: abgeleitete Kernpunkte und angekündigte Zahlen werden trotzdem einmal gefragt', async () => {
  const { p, B } = await pitchBriefing();
  Object.assign(feld(B, 'problem'), { wert: 'Der Besucherbereich ist nicht optimal', status: 'bestaetigt', vorbefuellt: true });
  Object.assign(feld(B, 'zielgruppe'), { wert: 'Team und Geschäftsleitung', status: 'bestaetigt', vorbefuellt: true });
  Object.assign(feld(B, 'belege'), { wert: 'Es gibt aktuelle Zahlen zur Anzahl der Besucher', status: 'bestaetigt', vorbefuellt: true });
  gleich(P.kandidaten(B), ['problem', 'idee', 'bitte'], 'Kernpunkte zuerst, auch der abgeleitete');
  Object.assign(feld(B, 'idee'), { wert: 'Neuer Empfang', status: 'bestaetigt', gefragt: true }); Object.assign(feld(B, 'bitte'), { wert: '25.000 Euro', status: 'bestaetigt', gefragt: true });
  gleich(P.kandidaten(B), ['problem', 'belege', 'nutzen'], 'die angekündigte Zahl kommt vor den übrigen Punkten, die Zielgruppe aus der Beschreibung genügt');
  B.aktuell = { feld: 'belege', frage: 'Wie viele Besucher kommen?', vorschlaege: [], art: 'neu' };
  const ki = kiMit([{ updates: [], antwort_vage: false, naechste_frage: { feld: 'problem', frage: '?', vorschlaege: [] } }]);
  await P.briefingAntwort(ki, p, B, 'Etwa 1.200 Besucher pro Monat');
  gleich([feld(B, 'belege').wert, feld(B, 'belege').gefragt], ['Etwa 1.200 Besucher pro Monat', true], 'die Antwort ersetzt die ungenaue Vorbefüllung');
  assert(!P.kandidaten(B).includes('belege'), 'nur einmal');
});

test('Briefing: Erkennung ohne KI über Schlüsselwörter', async () => {
  const p = await prompts(), B = P.neuesBriefing('Statusbericht für den Lenkungskreis');
  const ki = kiMit([() => { throw new Error('nicht erreichbar'); }, { vorbefuellt: [], schwerpunkte: [], unwichtig: [], erste_frage: { feld: 'stand', frage: 'Wie steht es?', vorschlaege: [] } }]);
  await P.briefingStart(ki, p, B, '');
  gleich(B.art, 'bericht'); gleich(B.aktuell.feld, 'stand');
});

test('Briefing: Schwerpunkt wird einmal vertieft, Antworten werden ergänzt statt ersetzt', async () => {
  const { p, B } = await pitchBriefing();
  feld(B, 'problem').schwerpunkt = true; B.aktuell = { feld: 'problem', frage: 'Was ist das Problem?', vorschlaege: [], art: 'neu' };
  const ki = kiMit([
    { updates: [{ feld: 'problem', wert: 'Gäste finden den Empfang nicht', status: 'bestaetigt' }], antwort_vage: false, naechste_frage: { feld: 'problem', frage: 'Was passiert dann genau, wenn jemand den Empfang sucht?', vorschlaege: [] } },
    { updates: [], antwort_vage: false, naechste_frage: { feld: 'idee', frage: 'Und deine Idee dafür?', vorschlaege: [] } }
  ]);
  await P.briefingAntwort(ki, p, B, 'Gäste finden den Empfang nicht');
  gleich([B.aktuell.feld, B.aktuell.art], ['problem', 'vertiefung']);
  assert(ki.anfragen[0].prompt.includes('Vertiefungsfrage') && ki.anfragen[0].schema.properties.naechste_frage.properties.feld.enum.includes('problem'));
  await P.briefingAntwort(ki, p, B, 'Sie irren zehn Minuten durchs Foyer und rufen dann an');
  gleich(feld(B, 'problem').wert, 'Gäste finden den Empfang nicht\nSie irren zehn Minuten durchs Foyer und rufen dann an');
  assert(feld(B, 'problem').vertieft);
  gleich([B.aktuell.feld, B.aktuell.art, B.gefragt], ['idee', 'neu', 2]);
  assert(!ki.anfragen[1].prompt.includes('Vertiefungsfrage'), 'nur einmal vertiefen');
});

test('Briefing: höchstens eine Nachfrage je Punkt, danach wird die Antwort übernommen', async () => {
  const { p, B } = await pitchBriefing();
  B.aktuell = { feld: 'nutzen', frage: 'Was wird besser?', vorschlaege: [], art: 'neu' };
  const vage = { updates: [], antwort_vage: true, naechste_frage: { feld: 'nutzen', frage: 'Woran würden Gäste den Unterschied merken?', vorschlaege: [] } };
  const ki = kiMit([vage, vage]);
  await P.briefingAntwort(ki, p, B, 'Es wird halt besser');
  gleich([B.aktuell.feld, B.aktuell.art, feld(B, 'nutzen').wert], ['nutzen', 'nachfrage', '']);
  await P.briefingAntwort(ki, p, B, 'Es gibt aktuelle Zahlen zu den Besuchern');
  gleich(feld(B, 'nutzen').wert, 'Es gibt aktuelle Zahlen zu den Besuchern');
  assert(B.aktuell.feld !== 'nutzen', 'nicht ein drittes Mal fragen');
  assert(ki.anfragen[1].prompt.includes('immer false'));
});

test('Briefing: Fragenlimit – danach nur noch Kernpunkte, dann fertig', async () => {
  const { p, B } = await pitchBriefing();
  Object.assign(feld(B, 'problem'), { wert: 'x', status: 'bestaetigt' }); Object.assign(feld(B, 'idee'), { wert: 'y', status: 'bestaetigt' });
  B.gefragt = B.max;
  gleich(P.kandidaten(B), ['bitte']);
  B.aktuell = { feld: 'bitte', frage: 'Was brauchst du?', vorschlaege: [], art: 'neu' };
  await P.briefingAntwort(kiMit([{ updates: [], antwort_vage: false, naechste_frage: { feld: '', frage: '', vorschlaege: [] } }]), p, B, '800 Euro und zwei Samstage Hilfe');
  gleich(B.aktuell, null);
  assert(P.briefingFertig(B, p.arten).ok);
});

test('Briefing: Frage zu einem Punkt außerhalb des Auftrags wird nicht übernommen', async () => {
  const { p, B } = await pitchBriefing();
  B.aktuell = { feld: 'problem', frage: '?', vorschlaege: [], art: 'neu' };
  await P.briefingAntwort(kiMit([{ updates: [], antwort_vage: false, naechste_frage: { feld: 'belege', frage: 'Wie lange wurde das schon getestet?', vorschlaege: [] } }]), p, B, 'Gäste finden den Eingang nicht');
  gleich(B.aktuell.feld, 'idee', 'nächster Kernpunkt statt der mittleren Frage');
});

test('Briefing: „Weiß ich nicht“ → Annahme der KI; ohne Annahme wird der Punkt zurückgestellt', async () => {
  const { p, B } = await pitchBriefing();
  B.aktuell = { feld: 'zielgruppe', frage: 'Wer?', vorschlaege: [], art: 'neu' };
  const ki = kiMit([{ updates: [{ feld: 'zielgruppe', wert: 'Die Geschäftsleitung', status: 'annahme' }], antwort_vage: true, naechste_frage: { feld: 'problem', frage: 'Was ist das Problem?', vorschlaege: [] } }]);
  await P.briefingAntwort(ki, p, B, 'Weiß ich nicht.', { annahme: true });
  gleich([feld(B, 'zielgruppe').wert, feld(B, 'zielgruppe').status], ['Die Geschäftsleitung', 'annahme']);
  assert(ki.anfragen[0].prompt.includes('bittet dich um eine Annahme') && ki.anfragen[0].prompt.includes('„Publikum“'));
  gleich(B.aktuell.feld, 'problem');
  P.wendeRundeAn(B, { updates: [], antwort_vage: true, naechste_frage: { feld: 'problem', frage: '?', vorschlaege: [] } }, 'Weiß ich nicht.', { annahme: true });
  gleich(feld(B, 'problem').status, 'uebersprungen');
  assert(B.aktuell.feld !== 'problem', 'dieselbe Frage wird nicht wiederholt');
});

test('Briefing: Art wechseln behält passende Einträge', async () => {
  const { p, B } = await pitchBriefing();
  Object.assign(feld(B, 'zielgruppe'), { wert: 'Geschäftsleitung', status: 'bestaetigt' }); Object.assign(feld(B, 'problem'), { wert: 'x', status: 'bestaetigt' });
  P.setzeArt(B, 'entscheidung', p.arten);
  gleich(feld(B, 'zielgruppe').wert, 'Geschäftsleitung'); assert(!feld(B, 'problem') && feld(B, 'empfehlung'));
  gleich(B.aktuell.feld, 'entscheidung');
});

test('Briefing: fertiges Briefing ist flach, Kernpunkte werden verlangt, Folienzahl je Art', async () => {
  const { p, B } = await pitchBriefing();
  let r = P.briefingFertig(B, p.arten);
  assert(!r.ok); meldet(r.errors, '„Problem“ ist noch offen');
  const setze = (id, wert, status = 'bestaetigt') => Object.assign(feld(B, id), { wert, status });
  setze('problem', 'Gäste finden den Empfang nicht'); setze('idee', 'Ein Leitsystem ab dem Parkplatz'); setze('bitte', '800 Euro', 'bestaetigt'); setze('zielgruppe', 'Geschäftsleitung', 'annahme');
  B.aktuell = { feld: 'belege', frage: '?', vorschlaege: [], art: 'neu' }; P.briefingUeberspringen(B);
  r = P.briefingFertig(B, p.arten);
  gleich(r.errors, []);
  gleich([r.briefing.art, r.briefing.art_name, r.briefing.problem, r.briefing.folienzahl, r.briefing.belege], ['pitch', 'Pitch', 'Gäste finden den Empfang nicht', 7, undefined]);
  gleich(r.briefing.annahmen, ['Publikum: Geschäftsleitung']);
  setze('umfang', 'etwa 20 Minuten'); gleich(P.briefingFertig(B, p.arten).briefing.folienzahl, 10);
});

test('Briefing: Folienzahl aus Folien, Minuten oder nichts', () => {
  gleich([P.folienzahlAus('12 Folien'), P.folienzahlAus('ca. 30 Min'), P.folienzahlAus('eine halbe Stunde'), P.folienzahlAus('8'), P.folienzahlAus('200 Folien'), P.folienzahlAus('1,5 Stunden')], [12, 15, 10, 8, 30, 30]);
});

/* ---------- Designsystem vorschlagen ---------- */
test('Designsystem: Vorschlag der KI, bei ungültiger Antwort Auswahl über Tags', async () => {
  const p = await prompts(), systeme = [await system('demo-corporate'), await system('demo-hell')];
  const ki = kiMit([{ systemId: 'demo-hell', begruendung: 'Passt zum Workshop.' }]);
  gleich((await P.schlageDesignsystemVor(ki, p, BRIEFING, systeme)).systemId, 'demo-hell');
  gleich(ki.anfragen[0].schema.properties.systemId.enum, ['demo-corporate', 'demo-hell']);
  assert(ki.anfragen[0].prompt.includes('minimalistisch') && ki.anfragen[0].prompt.includes('Lenkungskreis'));
  const b = { ...BRIEFING, anlass: 'Business-Termin, seriös und klassisch' };
  gleich((await P.schlageDesignsystemVor(kiMit([{ systemId: 'erfunden', begruendung: '' }]), p, b, systeme)).systemId, 'demo-corporate');
  gleich((await P.schlageDesignsystemVor(kiMit([]), p, { ...BRIEFING, anlass: 'ruhig und minimalistisch' }, systeme)).systemId, 'demo-hell', 'KI nicht erreichbar');
});

/* ---------- Outline ---------- */
test('Outline: KI wählt Formen, die das Designsystem darstellen kann; das Layout wählt die App', async () => {
  const p = await prompts(), sys = await system('demo-corporate'), ki = kiMit([OUTLINE]);
  const r = await P.erstelleOutline(ki, p, BRIEFING, sys);
  gleich(r.versuche, 1); gleich(r.outline.folien.length, 5);
  const a = ki.anfragen[0], formen = a.schema.properties.folien.items.properties.form.enum;
  gleich(formen, P.verfuegbareFormen(sys));
  ['titel', 'kernsatz', 'zahl', 'kennzahlen', 'vergleich', 'ablauf', 'bild', 'abschluss'].forEach(f => assert(formen.includes(f), f));
  assert(a.prompt.includes('- kernsatz – eine einzelne starke Aussage') && !a.prompt.includes('content-bullets'), 'Formen statt Layout-IDs im Prompt');
  gleich(r.outline.folien.map(f => f.layoutId), ['title', 'kpi-grid', 'content-bullets', 'image-left', 'closing']);
  assert(a.system.includes('Das Publikum wird mit **Sie** angesprochen'), 'voice.md fehlt im System-Prompt');
  assert(a.system.includes('Höchstens 5 Stichpunkte pro Folie') && a.system.includes('Höchstens eine Zitatfolie'), 'Regeln fehlen');
  assert(!a.prompt.includes('{{') && !a.system.includes('{{'));
});

test('Outline: erfundene Form → Wiederholung mit Fehlerhinweis', async () => {
  const p = await prompts(), sys = await system('demo-corporate');
  const falsch = { ...OUTLINE, folien: OUTLINE.folien.map((f, i) => i === 2 ? { ...f, form: 'agenda' } : f) };
  const ki = kiMit([falsch, OUTLINE]);
  const r = await P.erstelleOutline(ki, p, BRIEFING, sys);
  gleich(r.versuche, 2); gleich(r.aenderungen, []);
  assert(ki.anfragen[1].prompt.startsWith(ki.anfragen[0].prompt), 'ursprünglicher Prompt bleibt erhalten');
  assert(ki.anfragen[1].prompt.includes('KORREKTUR NÖTIG') && ki.anfragen[1].prompt.includes('„agenda“ ist nicht erlaubt') && ki.anfragen[1].prompt.includes('"form":"agenda"'));
});

test('Outline: nach drei ungültigen Antworten wird ersetzt statt abgebrochen', async () => {
  const p = await prompts(), sys = await system('demo-hell');
  const falsch = { ...OUTLINE, folien: OUTLINE.folien.map((f, i) => i === 2 ? { ...f, form: 'agenda', layoutId: undefined } : f) };
  const ki = kiMit([falsch, falsch, falsch]);
  const r = await P.erstelleOutline(ki, p, BRIEFING, sys);
  gleich(ki.anfragen.length, 3); gleich([r.outline.folien[2].form, r.outline.folien[2].layoutId], ['liste', 'content-bullets']);
  meldet(r.aenderungen, 'Form „agenda“ gibt es nicht');
});

/* ---------- Folien ---------- */
test('Folie: Antwortformat enthält nur Felder, Limits und Bild-IDs des Layouts', async () => {
  const sys = await system('demo-corporate');
  const s = P.folienSchema(sys.layout('image-left'), sys).properties.inhalt;
  gleich(Object.keys(s.properties).sort(), ['bullets', 'image', 'title']);
  gleich(s.properties.image.enum, ['hero', 'portrait', 'square']);
  gleich([s.properties.title.maxLength, s.properties.bullets.items.maxLength], [undefined, undefined], 'keine Zeichenlimits im Schema, sonst schneidet der Server mitten im Wort ab'); gleich(s.properties.bullets.maxItems, 4);
  gleich(s.required, ['title', 'bullets']);
  const k = P.folienSchema(sys.layout('kpi-grid'), sys).properties.inhalt.properties.kpis;
  gleich([k.minItems, k.maxItems, k.items.required], [2, 4, ['value']]);
  assert(!('footer' in P.folienSchema(sys.layout('content-bullets'), sys).properties.inhalt.properties), 'Fußzeile füllt der Renderer');
});

test('Folie: Prompt nennt Felder, Limits, Bilder und markiert die Folie in der Gliederung', async () => {
  const p = await prompts(), sys = await system('demo-corporate'), ki = kiMit([FOLIEN[3]]);
  const r = await P.erstelleFolie(ki, p, { briefing: BRIEFING, outline: OUTLINE, index: 3, system: sys });
  gleich(r.versuche, 1); gleich(r.folie.layoutId, 'image-left'); gleich(r.folie.inhalt.image, 'portrait');
  const t = ki.anfragen[0].prompt;
  assert(t.includes('► 4. [bild] Das Team gewinnt Zeit.') && t.includes('  3. [liste]') && t.includes('Form: bild – '));
  assert(t.includes('- title (Text, Pflicht, höchstens 60 Zeichen)') && t.includes('höchstens 4 Punkte mit je höchstens 90 Zeichen'));
  assert(t.includes('- portrait: Bild im Hochformat') && !t.includes('assets/images'), 'Bilder nur per ID, ohne Dateipfad');
  assert(!t.includes('{{'));
});

test('Folie: zu langer Text → Wiederholung mit genauer Fehlermeldung', async () => {
  const p = await prompts(), sys = await system('demo-corporate');
  const zuLang = { inhalt: { title: 'Das Portal löst die häufigsten Anliegen unserer Kundinnen und Kunden ganz ohne Anruf im Service-Center', bullets: ['a'] }, notizen: '' };
  const ki = kiMit([zuLang, FOLIEN[2]]);
  const r = await P.erstelleFolie(ki, p, { briefing: BRIEFING, outline: OUTLINE, index: 2, system: sys });
  gleich(r.versuche, 2); gleich(r.aenderungen, []);
  assert(/title: \d+ Zeichen, erlaubt sind höchstens 70/.test(ki.anfragen[1].prompt), 'Fehlerhinweis fehlt');
});

test('Folie: drei ungültige Antworten → automatische Kürzung, Ergebnis ist gültig', async () => {
  const p = await prompts(), sys = await system('demo-corporate');
  const kaputt = { inhalt: { title: 'x'.repeat(40) + ' ' + 'y'.repeat(60), bullets: ['1', '2', '3', '4', '5', '6', '7'], image: 'C:/fotos/team.jpg', erfunden: 'x' }, notizen: 'n' };
  const ki = kiMit([kaputt, kaputt, kaputt]);
  const r = await P.erstelleFolie(ki, p, { briefing: BRIEFING, outline: OUTLINE, index: 2, system: sys });
  gleich(ki.anfragen.length, 3, 'höchstens drei Versuche');
  gleich(validateSpec({ titel: 'T', folien: [r.folie] }, sys).errors, []);
  gleich(r.folie.inhalt.bullets.length, 5); assert(r.folie.inhalt.title.endsWith('…') && !('image' in r.folie.inhalt) && !('erfunden' in r.folie.inhalt));
  meldet(r.aenderungen, 'Folie 3, title: Text gekürzt'); gleich(r.folie.notizen, 'n');
});

test('Folie: unbrauchbare Antwort (kein Inhalt) endet mit markierten Lücken', async () => {
  const p = await prompts(), sys = await system('demo-hell');
  const r = await P.erstelleFolie(kiMit([{}, { inhalt: 'Text' }, null]), p, { briefing: BRIEFING, outline: OUTLINE, index: 2, system: sys });
  gleich(r.folie.inhalt, { title: '[…]', bullets: ['[…]'] });
  gleich(validateSpec({ titel: 'T', folien: [r.folie] }, sys).errors, []);
});

test('Folie: erfundene Zahlen und Kontaktdaten → Wiederholung, danach Hinweis zur Prüfung', async () => {
  const p = await prompts(), sys = await system('demo-corporate'), layout = sys.layout('closing');
  const erfunden = { inhalt: { title: 'Vielen Dank', body: 'Wir brauchen 4.800 Euro für [Zweck].', contact: 'Hans Meier, hans.meier@example.org' }, notizen: 'Im Schnitt 99 Anrufe.' };
  const fehler = P.pruefeFakten(erfunden, layout, JSON.stringify(BRIEFING));
  meldet(fehler, 'body: Die Zahl „4800“ steht nicht im Briefing'); meldet(fehler, '„hans.meier@example.org“ steht nicht im Briefing');
  gleich(fehler.length, 2, 'Notizen und Platzhalter werden nicht geprüft');
  gleich(P.pruefeFakten(FOLIEN[1], sys.layout('kpi-grid'), JSON.stringify(BRIEFING)), [], 'Zahlen aus dem Briefing sind erlaubt');
  gleich(P.pruefeFakten({ inhalt: { number: '02', title: 'Kapitel' } }, sys.layout('section'), '{}'), [], 'Kapitelnummern sind erlaubt');

  const ki = kiMit([erfunden, FOLIEN[4]]);
  const gut = await P.erstelleFolie(ki, p, { briefing: BRIEFING, outline: OUTLINE, index: 4, system: sys });
  gleich([gut.versuche, gut.pruefen], [2, []]);
  assert(ki.anfragen[1].prompt.includes('Erfinde keine Zahlen'));
  /* ohne Platzhalter, sonst würde das optionale Feld als wertlos entfernt */
  const erfunden2 = { ...erfunden, inhalt: { ...erfunden.inhalt, body: 'Wir brauchen 4.800 Euro für den Umbau.' } };
  const stur = await P.erstelleFolie(kiMit([erfunden2, erfunden2, erfunden2]), p, { briefing: BRIEFING, outline: OUTLINE, index: 4, system: sys });
  gleich(stur.folie.inhalt.contact, 'Hans Meier, hans.meier@example.org', 'Inhalt bleibt stehen');
  meldet(stur.pruefen, 'Folie 5, body: Die Zahl „4800“ steht nicht im Briefing. Bitte prüfen.');
  const neu = await P.erstelleFolie(kiMit([erfunden]), p, { briefing: BRIEFING, outline: OUTLINE, index: 4, system: sys }, { wunsch: 'Nenne 4.800 Euro und hans.meier@example.org' });
  gleich(neu.pruefen, [], 'Angaben aus dem Wunsch der Person gelten als bekannt');
});

test('Folie: Faktenprüfung ignoriert technische Angaben, Stichpunkte je Art begrenzt', async () => {
  const p = await prompts(), sys = await system('demo-corporate');
  const pitch = { ...BRIEFING, art: 'pitch', schemaVersion: '2.0', folienzahl: 20 };
  const erfunden = { inhalt: { title: 'Das Portal löst die häufigsten Anliegen', bullets: ['+20 % weniger Anrufe'] }, notizen: '' };
  const zuviele = { inhalt: { title: 'Das Portal löst die häufigsten Anliegen', bullets: ['Rechnungen', 'Adresse', 'Status', 'Termine'] }, notizen: '' };
  const ki = kiMit([erfunden, zuviele, FOLIEN[2]]);
  const r = await P.erstelleFolie(ki, p, { briefing: pitch, outline: OUTLINE, index: 2, system: sys });
  gleich(r.versuche, 3);
  assert(ki.anfragen[1].prompt.includes('Die Zahl „20“ steht nicht im Briefing'), '„2.0“ und die Folienzahl zählen nicht als Fakten');
  assert(ki.anfragen[2].prompt.includes('höchstens 3. Schreibe weniger'));
  gleich(ki.anfragen[0].schema.properties.inhalt.properties.bullets.maxItems, 3);
  assert(ki.anfragen[0].prompt.includes('höchstens 3 Punkte'));
});

test('Folie: Zahlwörter zählen als genannt, Platzhalter für unbekannte Zahlen und erfundene Namen fliegen raus', async () => {
  const p = await prompts(), sys = await system('demo-corporate');
  const b = { ...BRIEFING, art: 'pitch', problem: 'Ein Kunde stand zwanzig Minuten im Flur.' };
  gleich(P.pruefeFakten({ inhalt: { title: 'Ein Kunde wartet 20 Minuten' } }, sys.layout('title'), JSON.stringify(b)), [], '„zwanzig“ deckt „20“');
  gleich(P.pruefeStil({ inhalt: { title: 'Weniger Warten', bullets: ['Wartezeiten reduziert um [Zahl] %'] } }, sys.layout('content-bullets')).length, 1);
  gleich(P.pruefeStil({ inhalt: { title: 'Kundenportal', meta: 'Pitch für das neue Portal' } }, sys.layout('title')).length, 1, 'auch Nebenzeilen');
  const ki = kiMit([{ inhalt: { title: 'Vielen Dank', body: 'Wir bitten um die Freigabe.', contact: 'Herr Müller, Projektleitung' }, notizen: '' }]);
  const r = await P.erstelleFolie(ki, p, { briefing: b, outline: OUTLINE, index: 4, system: sys });
  assert(!('contact' in r.folie.inhalt)); meldet(r.aenderungen, 'contact: entfernt');
});

test('Folie: Platzhalter werden aus Sätzen entfernt, Abschluss bekommt immer eine Handlungsaufforderung', async () => {
  const p = await prompts(), sys = await system('demo-corporate'), b = { ...BRIEFING, art: 'pitch', bitte: 'Freigabe für 25.000 Euro und eine Projektgruppe.' };
  let r = await P.erstelleFolie(kiMit([{ inhalt: { title: 'Starten wir jetzt', body: 'Wir bitten um die Freigabe von 25.000 Euro bis [Datum].' }, notizen: '' }]), p, { briefing: b, outline: OUTLINE, index: 4, system: sys });
  gleich(r.folie.inhalt.body, 'Wir bitten um die Freigabe von 25.000 Euro.');
  r = await P.erstelleFolie(kiMit([{ inhalt: { title: 'Starten wir jetzt', body: '[Handlungsaufforderung]' }, notizen: '' }]), p, { briefing: b, outline: OUTLINE, index: 4, system: sys });
  gleich(r.folie.inhalt.body, 'Freigabe für 25.000 Euro und eine Projektgruppe.');
  meldet(r.aenderungen, 'Handlungsaufforderung aus dem Briefing eingesetzt');
  r = await P.erstelleFolie(kiMit([{ inhalt: { title: 'Neues Portal', subtitle: 'Für alle Kunden', meta: '[Datum] | [Name] | Lenkungskreis' }, notizen: '' }]), p, { briefing: b, outline: OUTLINE, index: 0, system: sys });
  gleich(r.folie.inhalt.meta, 'Lenkungskreis');
});

test('Folie neu generieren: bisheriger Inhalt und Wunsch stehen im Prompt', async () => {
  const p = await prompts(), sys = await system('demo-corporate'), ki = kiMit([FOLIEN[2]]);
  await P.erstelleFolie(ki, p, { briefing: BRIEFING, outline: OUTLINE, index: 2, system: sys }, { bisher: { title: 'Alt' }, wunsch: 'Bitte kürzer und mit Beispiel' });
  assert(ki.anfragen[0].prompt.includes('BISHERIGER INHALT DIESER FOLIE') && ki.anfragen[0].prompt.includes('"title":"Alt"') && ki.anfragen[0].prompt.includes('Bitte kürzer und mit Beispiel'));
});

/* ---------- Dramaturgie und Abwechslung ---------- */
test('Outline: Dramaturgie, Stil und Layouthinweise der Art stehen im Prompt', async () => {
  const p = await prompts(), sys = await system('demo-corporate'), ki = kiMit([OUTLINE]);
  await P.erstelleOutline(ki, p, { ...BRIEFING, art: 'pitch' }, sys);
  const t = ki.anfragen[0].prompt;
  assert(t.includes('ART DER PRÄSENTATION: Pitch') && t.includes('1. Haken:') && t.includes('Pitch-Stil') && t.includes('- zahl – '));
});

test('Abwechslung: Titel und Abschluss, Bildseiten wechseln, keine Wiederholung, wenig Aufzählungen', async () => {
  const sys = await system('demo-corporate'), typ = id => sys.layout(id).typ;
  const roh = ['content-bullets', 'image-left', 'content-bullets', 'content-bullets', 'content-bullets', 'image-left', 'image-left', 'quote', 'quote', 'section', 'content-bullets', 'statement']
    .map((layoutId, i) => ({ abschnitt: '', layoutId, kernaussage: 'K' + i, inhalt: '' }));
  const f = P.abwechslung(roh, sys), t = f.map(x => typ(x.layoutId));
  gleich([t[0], t[t.length - 1]], ['title', 'closing']);
  for (let i = 1; i < t.length; i++) assert(t[i] !== t[i - 1], `Folie ${i + 1} wiederholt ${t[i]}: ${t.join(', ')}`);
  gleich(t.filter(x => x.startsWith('image-left') || x === 'image-right').slice(0, 2), ['image-left', 'image-right']);
  assert(t.filter(x => x === 'quote').length <= 1 && t.filter(x => x === 'content-bullets').length <= 4, t.join(', '));
  gleich(f.map(x => x.kernaussage), roh.map(x => x.kernaussage), 'Inhalt und Reihenfolge bleiben');
  gleich(P.abwechslung(OUTLINE.folien, sys).map(x => x.layoutId), OUTLINE.folien.map(x => x.layoutId), 'eine abwechslungsreiche Gliederung bleibt unverändert');
});

test('Folie: Überschrift über die Präsentation statt über die Sache → Wiederholung', async () => {
  const p = await prompts(), sys = await system('demo-corporate');
  gleich(P.pruefeStil({ inhalt: { title: 'Verbesserung des Besuchserlebnisses im Ideenpitch' } }, sys.layout('content-bullets')).length, 1);
  gleich(P.pruefeStil({ inhalt: { title: 'Gäste finden den Empfang nicht', bullets: ['Die Präsentation der Ware leidet'] } }, sys.layout('content-bullets')), [], 'Text in Stichpunkten ist frei');
  const ki = kiMit([{ inhalt: { title: 'Willkommen zur Präsentation', subtitle: 'x' }, notizen: '' }, FOLIEN[0]]);
  const r = await P.erstelleFolie(ki, p, { briefing: BRIEFING, outline: OUTLINE, index: 0, system: sys });
  gleich(r.versuche, 2); gleich(r.pruefen, []);
  assert(ki.anfragen[1].prompt.includes('spricht über die Präsentation statt über die Sache'));
  assert(ki.anfragen[0].prompt.includes('STIL: Sachlich, klar') && ki.anfragen[0].prompt.includes('Abschnitt der Dramaturgie: Abschnitt'));
});

/* ---------- Gesamter Lauf ---------- */
for (const id of ['demo-corporate', 'demo-hell']) {
  test(`Gesamter Lauf mit ${id}: Briefing → Outline → gültige Slide-Spec → Folien`, async () => {
    const p = await prompts(), sys = await system(id), schritte = [];
    const ki = kiMit([OUTLINE, ...FOLIEN.map(f => JSON.parse(JSON.stringify(f)))]);
    const r = await P.erstellePraesentation(ki, p, BRIEFING, sys, { fortschritt: s => schritte.push(s.schritt + s.nr) });
    gleich(r.errors, []); assert(r.ok); gleich(r.protokoll, []); gleich(r.pruefen, []);
    gleich(schritte, ['outline0', 'folie1', 'folie2', 'folie3', 'folie4', 'folie5']);
    gleich(ki.anfragen.map(a => a.art), ['praes_outline', 'praes_folie', 'praes_folie', 'praes_folie', 'praes_folie', 'praes_folie']);
    gleich(r.spec.folien.map(f => f.layoutId), OUTLINE.folien.map(f => f.layoutId));
    const folien = buildSlides(r.spec, sys);
    gleich(folien.length, 5); assert(folien.every(f => f.elemente.every(e => !e.gekuerzt)));
    assert(ki.anfragen[1].system.includes(id === 'demo-hell' ? 'mit **Du** angesprochen' : 'mit **Sie** angesprochen'), 'Formulierungsrichtlinien des gewählten Systems');
  });
}


/* ---------- Layoutwahl nach Inhalt ---------- */
test('Layoutwahl: Form bestimmt das Layout, betonte Aussagen bekommen kräftige Layouts, keine Wiederholung', async () => {
  const sys = await system('demo-corporate'), typ = id => sys.layout(id).typ;
  const w = waehleLayouts(['titel', 'kernsatz', 'zahl', 'vergleich', 'bausteine', 'ablauf', 'liste', 'liste', 'zitat', 'abschluss'].map(form => ({ form })), sys);
  gleich(w.map(x => typ(x.layoutId)), ['title', 'statement', 'big-number', 'two-column', 'cards', 'timeline', 'content-bullets', 'image-left', 'quote', 'closing']);
  /* Kennzahlen ohne Kachel-Layout fallen auf eine passende Alternative, nie auf ein Bildlayout */
  const ohneBild = waehleLayouts([{ form: 'titel' }, { form: 'bild' }, { form: 'liste' }, { form: 'abschluss' }], sys, { bilder: false });
  assert(!ohneBild.some(x => profil(sys.layout(x.layoutId), sys).bilder), 'ohne Fotos keine Bildlayouts');
  /* Betonung: Kernsatz auf dem kräftigsten Layout */
  gleich(typ(rangliste('kernsatz', true, sys)[0].id), 'statement');
  assert(profil(sys.layout('statement'), sys).wucht > profil(sys.layout('content-bullets'), sys).wucht);
});

test('Layoutwahl: Bildseiten wechseln; mit Spiegeln auch bei nur einer Bildseite', async () => {
  const sys = await system('demo-corporate');
  const w = waehleLayouts([{ form: 'titel' }, { form: 'bild' }, { form: 'liste' }, { form: 'bild' }, { form: 'abschluss' }], sys);
  gleich([w[1].layoutId, w[3].layoutId], ['image-left', 'image-right']);
  /* System mit nur einem Bildlayout: zweites Bild wird gespiegelt, wenn erlaubt */
  const weg = l => ['image-right', 'image-full'].includes(l.typ);
  const nurLinks = { ...sys, layouts: sys.layouts.filter(l => !weg(l)), layout: id => sys.layouts.find(l => l.id === id && !weg(l)) || null };
  const s = waehleLayouts([{ form: 'titel' }, { form: 'bild' }, { form: 'kernsatz' }, { form: 'bild' }, { form: 'abschluss' }], nurLinks, { spiegeln: true });
  gleich([s[1].layoutId, s[3].layoutId, !!s[1].spiegeln, !!s[3].spiegeln], ['image-left', 'image-left', false, true]);
});

test('Inhalt wandert beim Layoutwechsel in verwandte Felder', async () => {
  const sys = await system('demo-corporate');
  gleich(ordneInhaltZu({ title: 'Wir halbieren die Wartezeit', bullets: ['a'] }, sys.layout('statement')).statement, 'Wir halbieren die Wartezeit');
  gleich(ordneInhaltZu({ title: 'T', bullets: ['a', 'b'] }, sys.layout('two-column')).leftBullets, ['a', 'b']);
  gleich(ordneInhaltZu({ title: 'T', cards: [{ title: 'Schnell', text: 'In zwei Minuten' }] }, sys.layout('content-bullets')).bullets, ['Schnell: In zwei Minuten']);
});

/* ---------- Layout anpassen ---------- */
const FOLIE_BULLETS = { layoutId: 'content-bullets', form: 'liste', inhalt: { title: 'Das Portal löst die häufigsten Anliegen', bullets: ['Rechnungen einsehen', 'Adresse ändern'] } };
test('Layout anpassen: Vorschläge außerhalb der Ränder, mit Überlappung oder kleinerer Schrift werden verworfen', async () => {
  const sys = await system('demo-corporate'), l = sys.layout('content-bullets'), b = l.placeholders.find(p => p.id === 'bullets');
  const r = P.pruefeAnpassung(FOLIE_BULLETS, sys, { aenderungen: [
    { id: 'bullets', x: b.x, y: b.y + 2, w: b.w * 0.8, h: b.h - 2 },
    { id: 'title', x: -5, y: 2, w: 50, h: 10 }
  ], spiegeln: true });
  assert(r.anpassung && r.anpassung.boxen.bullets && !r.anpassung.boxen.title, JSON.stringify(r));
  assert(!r.anpassung.spiegeln, 'Spiegeln nur bei Bildlayouts');
  meldet(r.meldungen, 'title: ragt über den Rand');
  const t = l.placeholders.find(p => p.id === 'title');
  const ueber = P.pruefeAnpassung(FOLIE_BULLETS, sys, { aenderungen: [{ id: 'bullets', x: t.x, y: t.y, w: t.w, h: 40 }], spiegeln: false });
  assert(!ueber.anpassung, 'Liste über der Überschrift'); meldet(ueber.meldungen, 'überdecken');
  const klein = P.pruefeAnpassung(FOLIE_BULLETS, sys, { aenderungen: [{ id: 'title', x: t.x, y: t.y, w: 12, h: 5 }], spiegeln: false });
  assert(!klein.anpassung, 'Überschrift würde winzig'); meldet(klein.meldungen, 'kleiner oder abgeschnitten');
  /* angewendet wird die Anpassung nur, wenn der Schalter an ist */
  const f = { ...FOLIE_BULLETS, anpassung: r.anpassung };
  const an = buildSlides({ titel: 'x', folien: [f] }, sys)[0].elemente.find(e => e.ph === 'bullets'), aus = buildSlides({ titel: 'x', folien: [f] }, sys, { anpassen: false })[0].elemente.find(e => e.ph === 'bullets');
  assert(an.w < aus.w, 'Anpassung wirkt'); gleich(aus.w, b.w);
});

test('Layout anpassen: KI-Vorschlag wird geprüft übernommen, Spiegeln nur bei Bildfolien', async () => {
  const p = await prompts(), sys = await system('demo-corporate');
  const folie = { layoutId: 'image-left', form: 'bild', kernaussage: 'Das Team gewinnt Zeit', inhalt: { title: 'Das Team gewinnt Zeit', bullets: ['Weniger Routine'], image: 'portrait' } };
  const ki = kiMit([a => { assert(a.prompt.includes('- image – Bild') && a.prompt.includes('- bullets – Stichpunkte') && a.art === 'praes_layout'); return { aenderungen: [], spiegeln: true, begruendung: 'Abwechslung zur vorherigen Bildfolie' }; }]);
  const g = await P.gestalteFolie(ki, p, { folie, system: sys });
  assert(g.anpassung && g.anpassung.spiegeln, JSON.stringify(g));
  const m = buildSlides({ titel: 'x', folien: [{ ...folie, anpassung: g.anpassung }] }, sys)[0];
  assert(m.elemente.find(e => e.art === 'bild' && !e.deko).x > 40, 'Bild steht jetzt rechts');
});

test('Gesamter Lauf mit Layout-Anpassung: zusätzlicher Aufruf je Folie, Fehler brechen nichts ab', async () => {
  const p = await prompts(), sys = await system('demo-corporate'), schritte = [];
  const ki = kiMit([OUTLINE, ...FOLIEN.map(f => JSON.parse(JSON.stringify(f))), ...FOLIEN.map((_, i) => i === 1 ? (() => { throw new Error('Zeitüberschreitung'); }) : { aenderungen: [], spiegeln: false, begruendung: '' })]);
  const r = await P.erstellePraesentation(ki, p, BRIEFING, sys, { gestalten: true, fortschritt: s => schritte.push(s.schritt + s.nr) });
  assert(r.ok, r.errors.join(' '));
  gleich(schritte.filter(x => x.startsWith('gestalten')).length, 5);
  meldet(r.protokoll, 'Folie 2: Layout konnte nicht angepasst werden');
  gleich(r.spec.folien.map(f => f.form), ['titel', 'kennzahlen', 'liste', 'bild', 'abschluss']);
  gleich(r.spec.folien[1].betont, true);
});

/* ---------- Start aus der Projektanalyse ---------- */
test('Briefing aus einer Projektanalyse: Bestätigtes wird nicht noch einmal gefragt, höchstens vier Fragen', async () => {
  const p = await prompts(), B = P.neuesBriefing('Projekt der Geschäftsleitung vorstellen und Budget bekommen');
  const ki = kiMit([
    { art: 'pitch', thema: 'Besucherbereich' },
    { vorbefuellt: [{ feld: 'problem', wert: 'Gäste finden den Empfang nicht', status: 'bestaetigt' }, { feld: 'idee', wert: 'Ein Empfangstresen mit Leitsystem', status: 'bestaetigt' }, { feld: 'zielgruppe', wert: 'Besucherinnen und Besucher', status: 'bestaetigt' }, { feld: 'bitte', wert: 'Budget für den Umbau', status: 'bestaetigt' }],
      schwerpunkte: ['nutzen'], unwichtig: [], erste_frage: { feld: 'problem', frage: 'Was ist das Problem?', vorschlaege: [] } }
  ]);
  await P.briefingStart(ki, p, B, '{"projekt":{"titel":"Besucherbereich"}}', { ausProjekt: true });
  gleich(B.max, 4);
  assert(feld(B, 'problem').gefragt && feld(B, 'idee').gefragt, 'aus der Analyse bestätigt');
  assert(!P.kandidaten(B).includes('problem') && !P.kandidaten(B).includes('idee'));
  gleich([feld(B, 'zielgruppe').wert, feld(B, 'zielgruppe').status], ['', 'leer'], 'die Zielgruppe des Projekts ist nicht das Publikum der Präsentation');
  assert(feld(B, 'bitte').gefragt, 'die Bitte stand in der eigenen Beschreibung');
  assert(P.kandidaten(B).includes('zielgruppe'), 'nach dem Publikum wird gefragt');
  assert(B.aktuell.feld !== 'problem', 'die Frage der KI zu einem geklärten Punkt wird ersetzt');
  assert(ki.anfragen[1].prompt.includes('"titel":"Besucherbereich"'), 'Projektkontext steht im Prompt');
});
