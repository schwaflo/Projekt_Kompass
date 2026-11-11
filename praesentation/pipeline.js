/* ============================================================
   Präsentationsgenerator – KI-Pipeline
   Briefing-Gespräch → Briefing → Outline → Slide-Spec.

   Die KI wird über eine kleine Schnittstelle angesprochen, damit
   derselbe Ablauf mit jedem Anbieter funktioniert:
     ki.frage({ system, prompt, schema, art }) → geparstes JSON
   In der App erfüllt llm() aus index.html diese Schnittstelle
   (Ollama und alle OpenAI-kompatiblen Server, lokal oder Cloud).

   Alle Prompts kommen aus prompts/*.md, hier steht kein Prompttext.
   ============================================================ */
import { checkSchema } from './validate.js';
import { validateSpec, kuerzeSpec, inhaltsPlatzhalter, SPEC_VERSION } from './spec.js';

export const MAX_VERSUCHE = 3;
export const PROMPT_NAMEN = ['system', 'system-briefing', 'briefing-start', 'briefing-runde', 'briefing-annahme', 'designsystem', 'outline', 'folie', 'korrektur', 'asset-beschreiben'];

/* ---------- Prompts ---------- */
/* Datei mit Kopf (--- name/version/… ---) lesen */
export function parsePrompt(roh) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(roh.replace(/\r\n/g, '\n'));
  if (!m) return { meta: {}, text: roh };
  const meta = Object.fromEntries(m[1].split('\n').map(z => z.split(/:\s*(.*)/)).filter(z => z.length > 1).map(([k, v]) => [k.trim(), v.trim()]));
  return { meta, text: m[2] };
}
export async function ladePrompts(readText, ordner = 'prompts/') {
  const out = {};
  await Promise.all(PROMPT_NAMEN.map(async n => {
    const roh = await readText(`${ordner}${n}.md`);
    if (roh === null) throw new Error(`Der Prompt ${ordner}${n}.md fehlt.`);
    out[n] = parsePrompt(roh);
  }));
  return out;
}
/* {{name}} ersetzen. Fehlt ein Wert, ist das ein Programmierfehler und fällt sofort auf. */
export function fuelle(prompt, werte = {}) {
  return prompt.text.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (werte[k] === undefined) throw new Error(`Prompt „${prompt.meta.name}“: Der Wert für {{${k}}} fehlt.`);
    return String(werte[k]);
  });
}

/* ---------- Aufruf mit Prüfung und Wiederholung ---------- */
/* pruefe(antwort) → Liste von Fehlermeldungen. Bei Fehlern wird derselbe Prompt mit den
   Meldungen erneut gestellt, insgesamt höchstens MAX_VERSUCHE Mal.
   Liefert { antwort, fehler, versuche }; fehler ist leer, wenn die Antwort gültig ist. */
export async function frageGeprueft(ki, prompts, anfrage, pruefe) {
  let prompt = anfrage.prompt, antwort = null, fehler = [];
  for (let versuch = 1; versuch <= MAX_VERSUCHE; versuch++) {
    antwort = await ki.frage({ ...anfrage, prompt });
    fehler = pruefe(antwort);
    if (!fehler.length) return { antwort, fehler, versuche: versuch };
    prompt = anfrage.prompt + fuelle(prompts.korrektur, { antwort: JSON.stringify(antwort), fehler: fehler.slice(0, 12).map(f => '- ' + f).join('\n') });
  }
  return { antwort, fehler, versuche: MAX_VERSUCHE };
}

/* ============================================================
   1. Briefing-Gespräch
   ============================================================ */
const S_STR = { type: 'string' };
const S_UPDATE = { type: 'object', properties: { feld: S_STR, wert: S_STR, status: { type: 'string', enum: ['bestaetigt', 'annahme'] } }, required: ['feld', 'wert', 'status'] };
const S_FRAGE = { type: 'object', properties: { feld: S_STR, frage: S_STR, vorschlaege: { type: 'array', items: S_STR } }, required: ['feld', 'frage', 'vorschlaege'] };

export const BRIEFING_START_SCHEMA = { type: 'object', properties: { vorbefuellt: { type: 'array', items: S_UPDATE }, erste_frage: S_FRAGE }, required: ['vorbefuellt', 'erste_frage'] };
export const BRIEFING_RUNDE_SCHEMA = {
  type: 'object',
  properties: {
    updates: { type: 'array', items: S_UPDATE },
    antwort_vage: { type: 'boolean' },
    neue_felder: { type: 'array', items: { type: 'object', properties: { id: S_STR, label: S_STR, beschreibung: S_STR }, required: ['id', 'label', 'beschreibung'] } },
    naechste_frage: S_FRAGE
  },
  required: ['updates', 'antwort_vage', 'neue_felder', 'naechste_frage']
};

/* Die festen Felder des Briefings. kern = ohne sie gibt es keine Präsentation. */
export const BRIEFING_FELDER = [
  { id: 'thema', label: 'Thema', beschreibung: 'Worum geht es in der Präsentation? Arbeitstitel in wenigen Worten.', kern: true },
  { id: 'ziel', label: 'Ziel', beschreibung: 'Was soll das Publikum nach der Präsentation wissen, glauben oder tun?', kern: true },
  { id: 'zielgruppe', label: 'Zielgruppe', beschreibung: 'Wer sitzt im Publikum, was wissen diese Menschen schon, was ist ihnen wichtig?', kern: true },
  { id: 'anlass', label: 'Anlass', beschreibung: 'Bei welcher Gelegenheit wird präsentiert (Termin, Rahmen, Ort)?' },
  { id: 'kernbotschaft', label: 'Kernbotschaft', beschreibung: 'Der eine Satz, der hängen bleiben soll.', kern: true },
  { id: 'umfang', label: 'Umfang', beschreibung: 'Wie lang soll die Präsentation sein: Anzahl Folien oder Dauer in Minuten?' },
  { id: 'pflichtinhalte', label: 'Pflichtinhalte', beschreibung: 'Welche Themen oder Punkte müssen auf jeden Fall vorkommen?' },
  { id: 'daten', label: 'Zahlen und Fakten', beschreibung: 'Welche Zahlen, Ergebnisse, Termine oder Zitate liegen vor und dürfen gezeigt werden?' },
  { id: 'cta', label: 'Handlungsaufforderung', beschreibung: 'Was soll das Publikum am Ende konkret tun oder entscheiden?' }
];
export const MAX_ZUSATZFELDER = 3;

const slug = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
const offen = f => !f.wert;
const offeneFelder = B => B.felder.filter(offen);
const frageZu = f => ({ feld: f.id, frage: f.beschreibung, vorschlaege: [], nachfrage: false });
const naechsteOffene = B => { const f = offeneFelder(B).sort((a, b) => (b.kern ? 1 : 0) - (a.kern ? 1 : 0))[0]; return f ? frageZu(f) : null; };
const felderText = () => BRIEFING_FELDER.map(f => `- ${f.id}: ${f.label} – ${f.beschreibung}`).join('\n');

export function neuesBriefing(beschreibung = '') {
  return { beschreibung, felder: BRIEFING_FELDER.map(f => ({ ...f, wert: '', status: 'leer' })), aktuell: null, verlauf: [] };
}

function trageEin(B, updates, ausser) {
  (updates || []).forEach(u => {
    const f = B.felder.find(x => x.id === u.feld);
    if (!f || !u.wert || !String(u.wert).trim() || f.id === ausser) return;
    if (f.status === 'bestaetigt' && u.status === 'annahme') return; /* Bestätigtes nicht durch Vermutungen überschreiben */
    f.wert = String(u.wert).trim(); f.status = u.status === 'annahme' ? 'annahme' : 'bestaetigt';
  });
}
function setzeFrage(B, q, nachfrage) {
  const f = q && B.felder.find(x => x.id === q.feld);
  B.aktuell = f && (offen(f) || nachfrage) && q.frage ? { feld: f.id, frage: q.frage, vorschlaege: (q.vorschlaege || []).slice(0, 4), nachfrage: !!nachfrage } : naechsteOffene(B);
}

/* Erste Runde: Bekanntes eintragen, erste Frage stellen. projekt = Text der Projektanalyse oder leer. */
export async function briefingStart(ki, prompts, B, projekt = '') {
  const res = await ki.frage({
    art: 'praes_briefing', system: fuelle(prompts['system-briefing']), schema: BRIEFING_START_SCHEMA,
    prompt: fuelle(prompts['briefing-start'], { beschreibung: B.beschreibung || '(keine)', projekt: projekt || '(keine)', felder: felderText() })
  });
  trageEin(B, res.vorbefuellt);
  setzeFrage(B, res.erste_frage, false);
  return B;
}

/* Antwort auf die aktuelle Frage einsortieren (ohne KI-Aufruf testbar) */
/* Nach einer Änderung von Hand: ist die aktuelle Frage erledigt, zur nächsten offenen gehen */
export function naechsteFrage(B) {
  const f = B.aktuell && B.felder.find(x => x.id === B.aktuell.feld);
  if (!f || !offen(f)) B.aktuell = naechsteOffene(B);
  return B;
}

/* opts.annahme: Die Person hat um eine Annahme gebeten; ihre Antwort wird dann nicht wörtlich eingetragen. */
export function wendeRundeAn(B, res, antwort, opts = {}) {
  const cur = B.aktuell, f = B.felder.find(x => x.id === cur.feld), vage = !!res.antwort_vage && !opts.annahme;
  trageEin(B, res.updates, vage ? cur.feld : null);
  /* Die Antwort der Person geht nie verloren, auch wenn die KI sie nicht einträgt */
  if (f && !vage && offen(f) && !opts.annahme) { f.wert = antwort; f.status = 'bestaetigt'; }
  const zusatz = B.felder.filter(x => x.zusatz).length;
  (res.neue_felder || []).slice(0, Math.max(0, MAX_ZUSATZFELDER - zusatz)).forEach(n => {
    const id = slug(n.id || n.label);
    if (!id || !n.label || B.felder.some(x => x.id === id)) return;
    B.felder.push({ id, label: String(n.label), beschreibung: String(n.beschreibung || n.label), wert: '', status: 'leer', zusatz: true });
  });
  const q = res.naechste_frage || {};
  /* Bleibt das Feld trotz Bitte um eine Annahme leer, wird es zurückgestellt statt erneut gefragt */
  if (opts.annahme && f && offen(f)) { f.wert = '–'; f.status = 'uebersprungen'; }
  setzeFrage(B, q, vage && q.feld === cur.feld);
  return B;
}

export async function briefingAntwort(ki, prompts, B, antwort, opts = {}) {
  const cur = B.aktuell, f = B.felder.find(x => x.id === cur.feld);
  B.verlauf.push({ feld: cur.feld, frage: cur.frage, antwort });
  const zusatz = B.felder.filter(x => x.zusatz).length;
  const res = await ki.frage({
    art: 'praes_briefing', system: fuelle(prompts['system-briefing']), schema: BRIEFING_RUNDE_SCHEMA,
    prompt: fuelle(prompts['briefing-runde'], {
      felder: JSON.stringify(B.felder.map(x => ({ id: x.id, label: x.label, beschreibung: x.beschreibung, wert: x.wert, status: x.status }))),
      verlauf: B.verlauf.slice(-6).map(v => `- F: ${v.frage}\n  A: ${v.antwort}`).join('\n'),
      feld: cur.feld, label: f ? f.label : '', frage: cur.frage, antwort: opts.annahme ? fuelle(prompts['briefing-annahme'], { label: f ? f.label : cur.feld }).trim() : antwort,
      zusatzErlaubt: zusatz >= MAX_ZUSATZFELDER ? 'Es sind keine weiteren Felder mehr möglich: leeres Array.' : `Höchstens ${MAX_ZUSATZFELDER - zusatz} weitere, mit kurzer id in snake_case.`
    })
  });
  return wendeRundeAn(B, res, antwort, opts);
}

/* Frage überspringen: Feld bleibt leer und wird nicht mehr gefragt */
export function briefingUeberspringen(B) {
  const f = B.aktuell && B.felder.find(x => x.id === B.aktuell.feld);
  if (f) { f.wert = '–'; f.status = 'uebersprungen'; }
  B.aktuell = naechsteOffene(B);
  return B;
}

/* ---------- Briefing als geprüftes JSON ---------- */
export const BRIEFING_SCHEMA = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'string' },
    thema: { type: 'string', minLength: 1 }, ziel: { type: 'string', minLength: 1 }, zielgruppe: { type: 'string', minLength: 1 }, kernbotschaft: { type: 'string', minLength: 1 },
    anlass: S_STR, pflichtinhalte: S_STR, daten: S_STR, cta: S_STR, umfang: S_STR,
    folienzahl: { type: 'integer', minimum: 3, maximum: 30 },
    weiteres: { type: 'array', items: { type: 'object', properties: { thema: S_STR, inhalt: S_STR }, required: ['thema', 'inhalt'] } },
    annahmen: { type: 'array', items: S_STR }
  },
  required: ['thema', 'ziel', 'zielgruppe', 'kernbotschaft', 'folienzahl']
};

/* „12 Folien“, „20 Minuten“ oder nichts → Folienzahl (etwa eine Folie je zwei Minuten) */
export function folienzahlAus(text) {
  const t = String(text || '');
  const f = /(\d+)\s*(folien|slides|seiten)/i.exec(t), m = /(\d+)\s*(min|minuten)/i.exec(t), s = /(\d+(?:[.,]\d+)?)\s*(stunde|std)/i.exec(t);
  const n = f ? +f[1] : m ? Math.round(+m[1] / 2) : s ? Math.round(parseFloat(s[1].replace(',', '.')) * 30) : (/^\s*\d+\s*$/.test(t) ? +t : 10);
  return Math.max(3, Math.min(30, n || 10));
}

/* Liefert { ok, briefing, errors }. errors nennt die Kernfelder, die noch fehlen. */
export function briefingFertig(B) {
  const w = id => { const f = B.felder.find(x => x.id === id); return f && f.status !== 'uebersprungen' ? f.wert : ''; };
  const briefing = {
    schemaVersion: '1.0',
    thema: w('thema'), ziel: w('ziel'), zielgruppe: w('zielgruppe'), kernbotschaft: w('kernbotschaft'),
    anlass: w('anlass'), pflichtinhalte: w('pflichtinhalte'), daten: w('daten'), cta: w('cta'), umfang: w('umfang'),
    folienzahl: folienzahlAus(w('umfang')),
    weiteres: B.felder.filter(f => f.zusatz && f.wert && f.status !== 'uebersprungen').map(f => ({ thema: f.label, inhalt: f.wert })),
    annahmen: B.felder.filter(f => f.status === 'annahme').map(f => `${f.label}: ${f.wert}`)
  };
  const fehlt = B.felder.filter(f => f.kern && !briefing[f.id]).map(f => `„${f.label}“ ist noch offen. Ohne diese Angabe lässt sich keine Präsentation aufbauen.`);
  const errors = fehlt.length ? fehlt : checkSchema(briefing, BRIEFING_SCHEMA);
  return { ok: !errors.length, briefing, errors };
}

/* ============================================================
   2. Designsystem vorschlagen
   ============================================================ */
export async function schlageDesignsystemVor(ki, prompts, briefing, systeme) {
  const ids = systeme.map(s => s.id);
  if (ids.length < 2) return { systemId: ids[0] || null, begruendung: '' };
  const schema = { type: 'object', properties: { systemId: { type: 'string', enum: ids }, begruendung: S_STR }, required: ['systemId', 'begruendung'] };
  try {
    const res = await ki.frage({
      art: 'praes_system', system: fuelle(prompts['system-briefing']), schema,
      prompt: fuelle(prompts.designsystem, { briefing: JSON.stringify(briefing), systeme: systeme.map(s => `- ${s.id}: ${s.meta.name} – ${s.meta.beschreibung} – Tags: ${s.meta.tags.join(', ')}`).join('\n') })
    });
    if (ids.includes(res.systemId)) return { systemId: res.systemId, begruendung: String(res.begruendung || '') };
  } catch (e) { /* Vorschlag ist nur eine Hilfe: bei Fehlern greift die Auswahl über Tags */ }
  return { systemId: nachTags(briefing, systeme), begruendung: '' };
}
/* Ersatz ohne KI: das System, dessen Tags am häufigsten im Briefing vorkommen */
function nachTags(briefing, systeme) {
  const t = JSON.stringify(briefing).toLowerCase();
  return systeme.map(s => ({ id: s.id, n: s.meta.tags.filter(tag => t.includes(tag.toLowerCase())).length })).sort((a, b) => b.n - a.n)[0].id;
}

/* ============================================================
   3. Outline
   ============================================================ */
const systemPrompt = (prompts, system) => fuelle(prompts.system, {
  systemName: system.meta.name,
  voice: system.voice.trim() || '(keine eigenen Richtlinien hinterlegt)',
  regeln: [...(system.rules.hinweise || []), system.rules.maxBullets ? `Höchstens ${system.rules.maxBullets} Stichpunkte pro Folie.` : '', system.rules.bildstil ? `Bildstil: ${system.rules.bildstil}` : ''].filter(Boolean).map(r => '- ' + r).join('\n') || '(keine)'
});

export function outlineSchema(system, folienzahl) {
  return {
    type: 'object',
    properties: {
      titel: { type: 'string', minLength: 1, maxLength: 40 },
      storyline: S_STR,
      folien: {
        type: 'array', minItems: Math.max(3, folienzahl - 2), maxItems: Math.min(30, folienzahl + 2),
        items: { type: 'object', properties: { layoutId: { type: 'string', enum: system.layouts.map(l => l.id) }, kernaussage: { type: 'string', minLength: 1 }, inhalt: S_STR }, required: ['layoutId', 'kernaussage', 'inhalt'] }
      }
    },
    required: ['titel', 'storyline', 'folien']
  };
}

export async function erstelleOutline(ki, prompts, briefing, system) {
  const schema = outlineSchema(system, briefing.folienzahl);
  const r = await frageGeprueft(ki, prompts, {
    art: 'praes_outline', system: systemPrompt(prompts, system), schema,
    prompt: fuelle(prompts.outline, { briefing: JSON.stringify(briefing), folienzahl: briefing.folienzahl, layouts: system.layouts.map(l => `- ${l.id} – ${l.beschreibung}`).join('\n') })
  }, a => checkSchema(a, schema, 'Gliederung'));

  /* Fallback: unbekannte Layouts ersetzen, Länge begrenzen, statt die Erstellung abzubrechen */
  const aenderungen = [], roh = r.antwort && typeof r.antwort === 'object' ? r.antwort : {};
  const folien = (Array.isArray(roh.folien) ? roh.folien : []).filter(f => f && typeof f === 'object').slice(0, schema.properties.folien.maxItems).map((f, i) => {
    let layoutId = f.layoutId;
    if (!system.layout(layoutId)) { layoutId = system.layoutForTyp(i === 0 ? 'title' : 'content-bullets').id; aenderungen.push(`Gliederung, Folie ${i + 1}: Layout „${f.layoutId}“ unbekannt, ersetzt durch „${layoutId}“.`); }
    return { layoutId, kernaussage: String(f.kernaussage || ''), inhalt: String(f.inhalt || '') };
  });
  if (!folien.length) throw new Error('Die KI hat keine brauchbare Gliederung geliefert. Versuche es erneut oder wähle ein anderes Modell.');
  return { outline: { titel: String(roh.titel || briefing.thema).slice(0, 40), storyline: String(roh.storyline || ''), folien }, versuche: r.versuche, aenderungen };
}

/* ============================================================
   4. Slide-Spec: jede Folie einzeln
   ============================================================ */
const bildAssets = system => system.manifest.assets.filter(a => !/^logo/.test(a.role));

/* Antwortformat für genau ein Layout: nur dessen Felder, mit Limits und festen Bild-IDs */
export function folienSchema(layout, system) {
  const props = {}, pflicht = [];
  inhaltsPlatzhalter(layout).forEach(ph => {
    if (ph.typ === 'text') props[ph.id] = { type: 'string', maxLength: ph.maxChars };
    else if (ph.typ === 'bullets') props[ph.id] = { type: 'array', minItems: ph.pflicht ? 1 : 0, maxItems: Math.min(ph.maxItems, system.rules.maxBullets || ph.maxItems), items: { type: 'string', maxLength: ph.maxCharsPerItem } };
    else if (ph.typ === 'items') props[ph.id] = { type: 'array', minItems: ph.minItems || 1, maxItems: ph.maxItems, items: { type: 'object', properties: Object.fromEntries(ph.felder.map(f => [f.id, { type: 'string', maxLength: f.maxChars }])), required: [ph.felder[0].id] } };
    else if (ph.typ === 'image') { const ids = bildAssets(system).map(a => a.id); if (!ids.length) return; props[ph.id] = { type: 'string', enum: ids }; }
    else return;
    if (ph.pflicht) pflicht.push(ph.id);
  });
  return { type: 'object', properties: { inhalt: { type: 'object', properties: props, required: pflicht }, notizen: S_STR }, required: ['inhalt', 'notizen'] };
}

function felderBeschreibung(layout, system) {
  return inhaltsPlatzhalter(layout).map(ph => {
    const p = ph.pflicht ? 'Pflicht' : 'optional', b = ph.beschreibung ? ` ${ph.beschreibung}.` : '';
    if (ph.typ === 'text') return `- ${ph.id} (Text, ${p}, höchstens ${ph.maxChars} Zeichen):${b}`;
    if (ph.typ === 'bullets') return `- ${ph.id} (Liste, ${p}, höchstens ${Math.min(ph.maxItems, system.rules.maxBullets || ph.maxItems)} Punkte mit je höchstens ${ph.maxCharsPerItem} Zeichen):${b}`;
    if (ph.typ === 'items') return `- ${ph.id} (Liste, ${p}, ${ph.minItems || 1} bis ${ph.maxItems} Einträge):${b} Jeder Eintrag hat die Felder: ${ph.felder.map(f => `${f.id} (höchstens ${f.maxChars} Zeichen${f.beschreibung ? ', ' + f.beschreibung : ''})`).join('; ')}`;
    if (ph.typ === 'image') return `- ${ph.id} (Bild, optional): eine Bild-ID aus der Liste unten.${b}`;
    return '';
  }).filter(Boolean).join('\n');
}

/* Erfundene Fakten erkennen: Zahlen, E-Mail-Adressen und Webadressen auf der Folie müssen im Briefing
   (oder im Wunsch der Person) stehen. Platzhalter wie [Zahl] sind erlaubt. Sprechernotizen werden nicht geprüft. */
const zahlen = t => (String(t).match(/\d[\d.,]*\d|\d/g) || []).map(z => z.replace(/[.,]/g, '')).filter(z => z.length >= 2);
export function pruefeFakten(folie, layout, quelle) {
  const q = String(quelle), bekannt = new Set(zahlen(q)), ql = q.toLowerCase(), out = [];
  const pruef = (wo, text) => {
    const t = String(text).replace(/\[[^\]]*\]/g, '');
    (t.match(/[\w.+-]+@[\w-]+\.[\w.-]+|(?:https?:\/\/|www\.)\S+/g) || []).forEach(a => { if (!ql.includes(a.toLowerCase())) out.push(`${wo}: „${a}“ steht nicht im Briefing. Erfinde keine Kontaktdaten. Lass das Feld weg oder schreibe [Kontakt].`); });
    [...new Set(zahlen(t))].forEach(z => { if (!bekannt.has(z)) out.push(`${wo}: Die Zahl „${z}“ steht nicht im Briefing. Erfinde keine Zahlen. Nutze nur Zahlen aus dem Briefing oder einen Platzhalter wie [Zahl].`); });
  };
  inhaltsPlatzhalter(layout).forEach(ph => {
    const v = folie.inhalt[ph.id];
    if (v === undefined || ph.typ === 'image' || ph.id === 'number') return;
    if (typeof v === 'string') pruef(ph.id, v);
    else if (Array.isArray(v)) v.forEach((x, i) => typeof x === 'string' ? pruef(`${ph.id}, Punkt ${i + 1}`, x) : x && typeof x === 'object' && Object.entries(x).forEach(([k, w]) => pruef(`${ph.id}, Eintrag ${i + 1}, ${k}`, w)));
  });
  return out;
}

/* Eine Folie schreiben. opts.wunsch: Änderungswunsch beim Neu-Generieren; opts.bisher: der bisherige Inhalt.
   Liefert immer eine gültige Folie: { folie, versuche, aenderungen, pruefen }.
   pruefen nennt Zahlen und Kontaktdaten, die nicht im Briefing stehen. */
export async function erstelleFolie(ki, prompts, { briefing, outline, index, system }, opts = {}) {
  const plan = outline.folien[index], layout = system.layout(plan.layoutId) || system.layoutForTyp('content-bullets');
  const schema = folienSchema(layout, system), hatBild = inhaltsPlatzhalter(layout).some(p => p.typ === 'image');
  const einzel = a => ({ titel: outline.titel || 'Präsentation', folien: [{ layoutId: layout.id, inhalt: a && a.inhalt && typeof a.inhalt === 'object' ? a.inhalt : {}, notizen: a && typeof a.notizen === 'string' ? a.notizen : '' }] });
  const quelle = JSON.stringify(briefing) + ' ' + (opts.wunsch || '') + ' ' + JSON.stringify(opts.bisher || '');
  const fakten = f => pruefeFakten(f, layout, quelle);
  const wunsch = [opts.bisher ? `\nBISHERIGER INHALT DIESER FOLIE (JSON):\n${JSON.stringify(opts.bisher)}` : '', opts.wunsch ? `\nWUNSCH DER PERSON ZUR ÜBERARBEITUNG (hat Vorrang):\n${opts.wunsch}` : (opts.bisher ? '\nSchreibe die Folie neu und formuliere sie anders als bisher.' : '')].join('');

  const r = await frageGeprueft(ki, prompts, {
    art: 'praes_folie', system: systemPrompt(prompts, system), schema,
    prompt: fuelle(prompts.folie, {
      briefing: JSON.stringify(briefing),
      gliederung: outline.folien.map((f, i) => `${i === index ? '►' : ' '} ${i + 1}. [${f.layoutId}] ${f.kernaussage}`).join('\n'),
      nr: index + 1, anzahl: outline.folien.length, kernaussage: plan.kernaussage, hinweis: plan.inhalt || '(keine weiteren Hinweise)',
      layoutId: layout.id, layoutBeschreibung: layout.beschreibung,
      felder: felderBeschreibung(layout, system),
      bilder: hatBild ? bildAssets(system).map(a => `- ${a.id}: ${a.beschreibung || a.role}${(a.tags || []).length ? ' (' + a.tags.join(', ') + ')' : ''}`).join('\n') || '(keine)' : '(dieses Layout hat kein Bild)',
      wunsch
    })
  }, a => {
    const form = validateSpec(einzel(a), system).errors.map(e => e.replace(/^Folie 1 \([^)]*\), |^Folie 1: /, ''));
    return form.length ? form : fakten(einzel(a).folien[0]);
  });

  /* Nach drei Versuchen noch Fehler: selbst kürzen, statt abzubrechen */
  let folie = einzel(r.antwort).folien[0], aenderungen = [];
  if (r.fehler.length) { const k = kuerzeSpec(einzel(r.antwort), system); folie = k.spec.folien[0]; aenderungen = k.aenderungen.map(a => a.replace(/^Folie 1/, `Folie ${index + 1}`)); }
  /* Angaben, die nicht aus dem Briefing stammen, bleiben stehen, werden aber zur Prüfung gemeldet */
  const pruefen = fakten(folie).map(f => `Folie ${index + 1}, ${f.split(' Erfinde')[0]} Bitte prüfen.`);
  return { folie, versuche: r.versuche, aenderungen, pruefen };
}

/* Alles in einem Lauf: Outline, dann jede Folie.
   opts.fortschritt({ schritt, nr, anzahl }) wird vor jedem KI-Aufruf gerufen. */
export async function erstellePraesentation(ki, prompts, briefing, system, opts = {}) {
  const melde = opts.fortschritt || (() => {});
  melde({ schritt: 'outline', nr: 0, anzahl: 0 });
  const o = await erstelleOutline(ki, prompts, briefing, system);
  const folien = [], protokoll = [...o.aenderungen], pruefen = [];
  for (let i = 0; i < o.outline.folien.length; i++) {
    melde({ schritt: 'folie', nr: i + 1, anzahl: o.outline.folien.length });
    const f = await erstelleFolie(ki, prompts, { briefing, outline: o.outline, index: i, system });
    folien.push(f.folie); protokoll.push(...f.aenderungen); pruefen.push(...f.pruefen);
  }
  const spec = { schemaVersion: SPEC_VERSION, titel: o.outline.titel, folien };
  const v = validateSpec(spec, system);
  return { spec, outline: o.outline, protokoll, pruefen, ok: v.ok, errors: v.errors };
}
