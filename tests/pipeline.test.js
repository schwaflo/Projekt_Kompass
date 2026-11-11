import { test, assert, gleich, meldet, env } from './harness.js';
import { loadPackage, fnSource } from '../praesentation/registry.js';
import { validateSpec } from '../praesentation/spec.js';
import { buildSlides } from '../praesentation/layout.js';
import * as P from '../praesentation/pipeline.js';

const system = async id => (await loadPackage(fnSource({ readText: p => env.readText(`design-systems/${id}/${p}`) }), id)).system;
const prompts = () => P.ladePrompts(env.readText);

/* Simulierte KI: beantwortet jede Anfrage aus einer Liste und merkt sich, was gefragt wurde */
function kiMit(antworten) {
  const ki = { anfragen: [], frage: async a => { ki.anfragen.push(a); const n = antworten.shift(); if (n === undefined) throw new Error('simulierte KI: keine Antwort mehr hinterlegt'); return typeof n === 'function' ? n(a) : n; } };
  return ki;
}
const BRIEFING = { schemaVersion: '1.0', thema: 'Neues Kundenportal', ziel: 'Freigabe für Phase 2', zielgruppe: 'Lenkungskreis', kernbotschaft: 'Das Portal entlastet den Service', anlass: 'Sitzung am 14. Mai', pflichtinhalte: 'Ergebnisse der Pilotphase', daten: '72 % nutzen das Portal monatlich; 31 % weniger Anrufe', cta: 'Freigabe erteilen', umfang: '5 Folien', folienzahl: 5, weiteres: [], annahmen: [] };
const OUTLINE = { titel: 'Neues Kundenportal', storyline: 'Der Pilot lief gut. Jetzt braucht es die Freigabe.', folien: [
  { layoutId: 'title', kernaussage: 'Das Kundenportal ist bereit für den nächsten Schritt.', inhalt: 'Titel, Anlass' },
  { layoutId: 'kpi-grid', kernaussage: 'Die Pilotphase hat überzeugt.', inhalt: '72 %, 31 %' },
  { layoutId: 'content-bullets', kernaussage: 'Das Portal löst die häufigsten Anliegen.', inhalt: 'Rechnungen, Adresse, Status' },
  { layoutId: 'image-left', kernaussage: 'Das Team gewinnt Zeit.', inhalt: 'Beratung' },
  { layoutId: 'closing', kernaussage: 'Wir bitten um die Freigabe.', inhalt: 'Freigabe erteilen' }
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
  assert(fehler.includes('{{layouts}}'), fehler);
  gleich(P.fuelle({ meta: {}, text: 'A {{x}} B {{x}}' }, { x: 1 }), 'A 1 B 1');
});

/* ---------- Briefing ---------- */
test('Briefing: Start trägt Bekanntes ein und stellt die erste Frage', async () => {
  const p = await prompts(), B = P.neuesBriefing('Präsentation zum Kundenportal für den Lenkungskreis');
  const ki = kiMit([{ vorbefuellt: [{ feld: 'thema', wert: 'Kundenportal', status: 'bestaetigt' }, { feld: 'zielgruppe', wert: 'Lenkungskreis', status: 'bestaetigt' }, { feld: 'gibtsnicht', wert: 'x', status: 'annahme' }], erste_frage: { feld: 'ziel', frage: 'Was soll der Lenkungskreis am Ende entscheiden?', vorschlaege: ['Freigabe für Phase 2', 'Budget erhöhen'] } }]);
  await P.briefingStart(ki, p, B, '{"projekt":"Portal"}');
  gleich(B.felder.find(f => f.id === 'thema').wert, 'Kundenportal');
  gleich(B.aktuell, { feld: 'ziel', frage: 'Was soll der Lenkungskreis am Ende entscheiden?', vorschlaege: ['Freigabe für Phase 2', 'Budget erhöhen'], nachfrage: false });
  const a = ki.anfragen[0];
  assert(a.prompt.includes('Kundenportal für den Lenkungskreis') && a.prompt.includes('{"projekt":"Portal"}') && a.prompt.includes('- kernbotschaft:'), 'Prompt unvollständig');
  assert(!a.prompt.includes('{{') && !a.system.includes('{{') && a.schema === P.BRIEFING_START_SCHEMA && a.art === 'praes_briefing');
});

test('Briefing: Antwort einsortieren, Nebenbei-Angaben, Zusatzfeld, Folgefrage', () => {
  const B = P.neuesBriefing(); B.aktuell = { feld: 'ziel', frage: 'Ziel?', vorschlaege: [] };
  P.wendeRundeAn(B, { updates: [{ feld: 'ziel', wert: 'Freigabe für Phase 2', status: 'bestaetigt' }, { feld: 'anlass', wert: 'Sitzung am 14. Mai', status: 'annahme' }], antwort_vage: false, neue_felder: [{ id: 'Einwände', label: 'Erwartete Einwände', beschreibung: 'Welche Bedenken hat das Gremium?' }], naechste_frage: { feld: 'einwaende', frage: 'Welche Bedenken erwartest du?', vorschlaege: ['Kosten', 'Datenschutz', 'a', 'b', 'c'] } }, 'Die sollen Phase 2 freigeben');
  gleich(B.felder.find(f => f.id === 'ziel').wert, 'Freigabe für Phase 2');
  gleich(B.felder.find(f => f.id === 'anlass').status, 'annahme');
  assert(B.felder.find(f => f.id === 'einwaende').zusatz);
  gleich(B.aktuell.feld, 'einwaende'); gleich(B.aktuell.vorschlaege.length, 4);
});

test('Briefing: vage Antwort führt zur Nachfrage, Antwort der Person geht nie verloren', () => {
  const B = P.neuesBriefing(); B.aktuell = { feld: 'zielgruppe', frage: 'Wer?', vorschlaege: [] };
  P.wendeRundeAn(B, { updates: [{ feld: 'zielgruppe', wert: 'alle', status: 'bestaetigt' }], antwort_vage: true, neue_felder: [], naechste_frage: { feld: 'zielgruppe', frage: 'Wer genau sitzt im Raum?', vorschlaege: [] } }, 'alle');
  gleich(B.felder.find(f => f.id === 'zielgruppe').wert, '', 'vage Antwort wird nicht eingetragen');
  assert(B.aktuell.nachfrage && B.aktuell.feld === 'zielgruppe');
  /* KI vergisst das Update und nennt ein unbekanntes Feld */
  P.wendeRundeAn(B, { updates: [], antwort_vage: false, neue_felder: [], naechste_frage: { feld: 'quatsch', frage: '?', vorschlaege: [] } }, 'Der Lenkungskreis, acht Personen');
  gleich(B.felder.find(f => f.id === 'zielgruppe').wert, 'Der Lenkungskreis, acht Personen');
  assert(B.aktuell && B.felder.find(f => f.id === B.aktuell.feld).kern, 'Ersatzfrage zu einem offenen Kernfeld');
});

test('Briefing: „Weiß ich nicht“ → Annahme der KI; ohne Annahme wird das Feld zurückgestellt', async () => {
  const p = await prompts(), B = P.neuesBriefing(); B.aktuell = { feld: 'zielgruppe', frage: 'Wer?', vorschlaege: [] };
  const ki = kiMit([{ updates: [{ feld: 'zielgruppe', wert: 'Eltern der Grundschule', status: 'annahme' }], antwort_vage: true, neue_felder: [], naechste_frage: { feld: 'ziel', frage: 'Ziel?', vorschlaege: [] } }]);
  await P.briefingAntwort(ki, p, B, 'Weiß ich nicht.', { annahme: true });
  gleich([B.felder.find(f => f.id === 'zielgruppe').wert, B.felder.find(f => f.id === 'zielgruppe').status], ['Eltern der Grundschule', 'annahme']);
  assert(ki.anfragen[0].prompt.includes('bittet dich um eine Annahme') && ki.anfragen[0].prompt.includes('„Zielgruppe“'));
  gleich(B.aktuell.feld, 'ziel');
  P.wendeRundeAn(B, { updates: [], antwort_vage: true, neue_felder: [], naechste_frage: { feld: 'ziel', frage: 'Ziel?', vorschlaege: [] } }, 'Weiß ich nicht.', { annahme: true });
  gleich(B.felder.find(f => f.id === 'ziel').status, 'uebersprungen');
  assert(B.aktuell.feld !== 'ziel', 'dieselbe Frage wird nicht endlos wiederholt');
});

test('Briefing: höchstens drei Zusatzfelder, Bestätigtes bleibt', () => {
  const B = P.neuesBriefing(); B.aktuell = { feld: 'ziel', frage: '?', vorschlaege: [] };
  B.felder.find(f => f.id === 'thema').wert = 'Portal'; B.felder.find(f => f.id === 'thema').status = 'bestaetigt';
  P.wendeRundeAn(B, { updates: [{ feld: 'thema', wert: 'Etwas anderes', status: 'annahme' }], antwort_vage: false, neue_felder: [1, 2, 3, 4, 5].map(i => ({ id: 'z' + i, label: 'Zusatz ' + i, beschreibung: 'x' })), naechste_frage: { feld: '', frage: '', vorschlaege: [] } }, 'Freigabe');
  gleich(B.felder.filter(f => f.zusatz).length, 3);
  gleich(B.felder.find(f => f.id === 'thema').wert, 'Portal');
});

test('Briefing: fertiges Briefing ist geprüftes JSON, fehlende Kernangaben werden benannt', () => {
  const B = P.neuesBriefing();
  let r = P.briefingFertig(B);
  assert(!r.ok); meldet(r.errors, '„Kernbotschaft“ ist noch offen');
  const setze = (id, wert, status = 'bestaetigt') => Object.assign(B.felder.find(f => f.id === id), { wert, status });
  setze('thema', 'Portal'); setze('ziel', 'Freigabe'); setze('zielgruppe', 'Lenkungskreis', 'annahme'); setze('kernbotschaft', 'Entlastet den Service'); setze('umfang', 'etwa 20 Minuten');
  B.aktuell = { feld: 'daten', frage: '?', vorschlaege: [] }; P.briefingUeberspringen(B);
  r = P.briefingFertig(B);
  gleich(r.errors, []);
  gleich(r.briefing.folienzahl, 10); gleich(r.briefing.daten, ''); gleich(r.briefing.annahmen, ['Zielgruppe: Lenkungskreis']);
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
test('Outline: KI bekommt nur die Layouts des Designsystems und die Formulierungsrichtlinien', async () => {
  const p = await prompts(), sys = await system('demo-corporate'), ki = kiMit([OUTLINE]);
  const r = await P.erstelleOutline(ki, p, BRIEFING, sys);
  gleich(r.versuche, 1); gleich(r.outline.folien.length, 5);
  const a = ki.anfragen[0];
  gleich(a.schema.properties.folien.items.properties.layoutId.enum, sys.layouts.map(l => l.id));
  sys.layouts.forEach(l => assert(a.prompt.includes(`- ${l.id} – ${l.beschreibung}`), `Layout ${l.id} fehlt im Prompt`));
  assert(a.system.includes('Das Publikum wird mit **Sie** angesprochen'), 'voice.md fehlt im System-Prompt');
  assert(a.system.includes('Höchstens 5 Stichpunkte pro Folie') && a.system.includes('Höchstens eine Zitatfolie'), 'Regeln fehlen');
  assert(!a.prompt.includes('{{') && !a.system.includes('{{'));
});

test('Outline: erfundenes Layout → Wiederholung mit Fehlerhinweis', async () => {
  const p = await prompts(), sys = await system('demo-corporate');
  const falsch = { ...OUTLINE, folien: OUTLINE.folien.map((f, i) => i === 2 ? { ...f, layoutId: 'agenda' } : f) };
  const ki = kiMit([falsch, OUTLINE]);
  const r = await P.erstelleOutline(ki, p, BRIEFING, sys);
  gleich(r.versuche, 2); gleich(r.aenderungen, []);
  assert(ki.anfragen[1].prompt.startsWith(ki.anfragen[0].prompt), 'ursprünglicher Prompt bleibt erhalten');
  assert(ki.anfragen[1].prompt.includes('KORREKTUR NÖTIG') && ki.anfragen[1].prompt.includes('„agenda“ ist nicht erlaubt') && ki.anfragen[1].prompt.includes('"layoutId":"agenda"'));
});

test('Outline: nach drei ungültigen Antworten wird ersetzt statt abgebrochen', async () => {
  const p = await prompts(), sys = await system('demo-hell');
  const falsch = { ...OUTLINE, folien: OUTLINE.folien.map((f, i) => i === 2 ? { ...f, layoutId: 'agenda' } : f) };
  const ki = kiMit([falsch, falsch, falsch]);
  const r = await P.erstelleOutline(ki, p, BRIEFING, sys);
  gleich(ki.anfragen.length, 3); gleich(r.outline.folien[2].layoutId, 'content-bullets');
  meldet(r.aenderungen, 'Layout „agenda“ unbekannt');
});

/* ---------- Folien ---------- */
test('Folie: Antwortformat enthält nur Felder, Limits und Bild-IDs des Layouts', async () => {
  const sys = await system('demo-corporate');
  const s = P.folienSchema(sys.layout('image-left'), sys).properties.inhalt;
  gleich(Object.keys(s.properties).sort(), ['bullets', 'image', 'title']);
  gleich(s.properties.image.enum, ['hero', 'portrait', 'square']);
  gleich(s.properties.title.maxLength, 60); gleich(s.properties.bullets.maxItems, 4); gleich(s.properties.bullets.items.maxLength, 90);
  gleich(s.required, ['title', 'bullets']);
  const k = P.folienSchema(sys.layout('kpi-grid'), sys).properties.inhalt.properties.kpis;
  gleich([k.minItems, k.maxItems, k.items.properties.value.maxLength, k.items.required], [2, 4, 9, ['value']]);
  assert(!('footer' in P.folienSchema(sys.layout('content-bullets'), sys).properties.inhalt.properties), 'Fußzeile füllt der Renderer');
});

test('Folie: Prompt nennt Felder, Limits, Bilder und markiert die Folie in der Gliederung', async () => {
  const p = await prompts(), sys = await system('demo-corporate'), ki = kiMit([FOLIEN[3]]);
  const r = await P.erstelleFolie(ki, p, { briefing: BRIEFING, outline: OUTLINE, index: 3, system: sys });
  gleich(r.versuche, 1); gleich(r.folie.layoutId, 'image-left'); gleich(r.folie.inhalt.image, 'portrait');
  const t = ki.anfragen[0].prompt;
  assert(t.includes('► 4. [image-left] Das Team gewinnt Zeit.') && t.includes('  3. [content-bullets]'));
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
  const stur = await P.erstelleFolie(kiMit([erfunden, erfunden, erfunden]), p, { briefing: BRIEFING, outline: OUTLINE, index: 4, system: sys });
  gleich(stur.folie.inhalt.contact, 'Hans Meier, hans.meier@example.org', 'Inhalt bleibt stehen');
  meldet(stur.pruefen, 'Folie 5, body: Die Zahl „4800“ steht nicht im Briefing. Bitte prüfen.');
  const neu = await P.erstelleFolie(kiMit([erfunden]), p, { briefing: BRIEFING, outline: OUTLINE, index: 4, system: sys }, { wunsch: 'Nenne 4.800 Euro und hans.meier@example.org' });
  gleich(neu.pruefen, [], 'Angaben aus dem Wunsch der Person gelten als bekannt');
});

test('Folie neu generieren: bisheriger Inhalt und Wunsch stehen im Prompt', async () => {
  const p = await prompts(), sys = await system('demo-corporate'), ki = kiMit([FOLIEN[2]]);
  await P.erstelleFolie(ki, p, { briefing: BRIEFING, outline: OUTLINE, index: 2, system: sys }, { bisher: { title: 'Alt' }, wunsch: 'Bitte kürzer und mit Beispiel' });
  assert(ki.anfragen[0].prompt.includes('BISHERIGER INHALT DIESER FOLIE') && ki.anfragen[0].prompt.includes('"title":"Alt"') && ki.anfragen[0].prompt.includes('Bitte kürzer und mit Beispiel'));
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
