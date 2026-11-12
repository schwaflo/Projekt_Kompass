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
import { validateSpec, kuerzeSpec, inhaltsPlatzhalter, kuerze, SPEC_VERSION } from './spec.js';
import { FORMEN, FORM_IDS, FORM_VON_TYP, waehleLayouts, eignung, profil } from './analyse.js';
import { buildSlides, passeAn, FOLIE_PT } from './layout.js';
import { blockHoehe } from './text.js';
import { leseSprachregeln, pruefeSprache } from './richtlinien.js';

export const MAX_VERSUCHE = 3;
export const PROMPT_NAMEN = ['system', 'system-briefing', 'briefing-art', 'briefing-start', 'briefing-runde', 'briefing-annahme', 'designsystem', 'outline', 'folie', 'korrektur', 'asset-beschreiben', 'gestalten', 'richtlinien'];

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
  const arten = await readText(`${ordner}arten.json`);
  if (arten === null) throw new Error(`Die Datei ${ordner}arten.json fehlt.`);
  out.arten = JSON.parse(arten);
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
   Die Art der Präsentation bestimmt, welche Punkte geklärt werden
   (prompts/arten.json). Die App entscheidet in jeder Runde, WAS
   als Nächstes dran ist (nächster Punkt, Vertiefung oder fertig);
   die KI formuliert die Frage passend zum Gespräch.
   ============================================================ */
const S_STR = { type: 'string' };
const PRIO_RANG = { kern: 0, hoch: 1, mittel: 2, auto: 9 };

const s_update = ids => ({ type: 'object', properties: { feld: { type: 'string', enum: ids }, wert: S_STR, status: { type: 'string', enum: ['bestaetigt', 'annahme'] } }, required: ['feld', 'wert', 'status'] });
const s_frage = ids => ({ type: 'object', properties: { feld: { type: 'string', enum: ids }, frage: S_STR, vorschlaege: { type: 'array', items: S_STR, maxItems: 4 } }, required: ['feld', 'frage', 'vorschlaege'] });
export const artSchema = arten => ({ type: 'object', properties: { art: { type: 'string', enum: arten.arten.map(a => a.id) }, thema: S_STR }, required: ['art', 'thema'] });
export function startSchema(B, kandidaten) {
  const ids = B.felder.map(f => f.id), waehlbar = B.felder.filter(f => f.prio !== 'kern' && f.prio !== 'auto').map(f => f.id), schwer = B.felder.filter(f => f.tief).map(f => f.id);
  return {
    type: 'object',
    properties: {
      vorbefuellt: { type: 'array', items: s_update(ids) },
      schwerpunkte: { type: 'array', items: { type: 'string', enum: schwer.length ? schwer : ['-'] }, maxItems: 2 },
      unwichtig: { type: 'array', items: { type: 'string', enum: waehlbar.length ? waehlbar : ['-'] } },
      erste_frage: s_frage(kandidaten.length ? kandidaten : [''])
    },
    required: ['vorbefuellt', 'schwerpunkte', 'unwichtig', 'erste_frage']
  };
}
export function rundeSchema(B, kandidaten, aktuellesFeld) {
  return {
    type: 'object',
    properties: { updates: { type: 'array', items: s_update(B.felder.map(f => f.id)), maxItems: 3 }, antwort_vage: { type: 'boolean' }, naechste_frage: s_frage([...new Set([aktuellesFeld, ...kandidaten, ''])]) },
    required: ['updates', 'antwort_vage', 'naechste_frage']
  };
}

const offen = f => !f.wert && f.status !== 'uebersprungen';
/* „Es gibt Zahlen“, aber keine Zahl genannt */
const zahlFehlt = f => !!f.wert && /zahl|daten|anzahl|statistik|kennzahl|messung|umfrage/i.test(f.wert) && !/\d/.test(f.wert);
/* Muss der Punkt im Gespräch noch geklärt werden? Leere Punkte, aus der Beschreibung abgeleitete
   Kernpunkte und angekündigte, aber nicht genannte Zahlen. Jeder Punkt wird nur einmal gefragt. */
const klaeren = f => f.status !== 'uebersprungen' && f.prio !== 'auto' && !f.gefragt && (offen(f) || (f.vorbefuellt && (f.prio === 'kern' || zahlFehlt(f))));
const rang = f => f.prio === 'kern' ? 0 : zahlFehlt(f) ? 1 : f.prio === 'hoch' ? 2 : 3;
const fertigFeld = f => !offen(f);
/* Punkte, die die Präsentation selbst betreffen und nicht aus einer Projektanalyse folgen */
const PRAESENTATION_SELBST = new Set(['zielgruppe', 'bitte', 'cta', 'mitmachen', 'umfang', 'anlass', 'entscheidung']);
export const art = (arten, id) => arten.arten.find(a => a.id === id) || arten.arten.find(a => a.id === 'vorstellung') || arten.arten[0];

export function neuesBriefing(beschreibung = '') {
  return { beschreibung, art: '', felder: [], aktuell: null, verlauf: [], gefragt: 0, max: 6 };
}

/* Felder für eine Art anlegen. Vorhandene Einträge mit gleicher id bleiben erhalten. */
export function setzeArt(B, artId, arten) {
  const a = art(arten, artId), alt = Object.fromEntries((B.felder || []).map(f => [f.id, f]));
  B.art = a.id; B.max = arten.fragenMax || 6;
  B.felder = [...a.felder, ...arten.gemeinsam].map(d => {
    const v = alt[d.id];
    const behalten = v && v.status !== 'uebersprungen';
    return { id: d.id, label: d.label, beschreibung: d.frage, prio: d.prio, tief: !!d.tief, wert: behalten ? v.wert : '', status: behalten ? v.status : 'leer', schwerpunkt: !!(v && v.schwerpunkt && d.tief), gefragt: !!(behalten && v.gefragt), vorbefuellt: !!(behalten && v.vorbefuellt) };
  });
  B.aktuell = null; naechsteFrage(B);
  return B;
}

/* Erkennung der Art ohne KI, aus Schlüsselwörtern */
export function artNachWorten(text, arten) {
  const t = String(text).toLowerCase();
  const best = arten.arten.map(a => ({ id: a.id, n: a.erkennen.filter(w => t.includes(w)).length })).sort((x, y) => y.n - x.n)[0];
  return best && best.n ? best.id : 'vorstellung';
}

/* Welche Punkte kommen als Nächstes in Frage? Kern immer, sonst nur innerhalb des Fragenlimits. */
export function kandidaten(B) {
  const imLimit = B.gefragt < B.max;
  return B.felder.filter(f => klaeren(f) && (f.prio === 'kern' || (imLimit && (f.prio === 'hoch' || zahlFehlt(f) || (f.prio === 'mittel' && B.gefragt < B.max - 1)))))
    .sort((a, b) => rang(a) - rang(b) || (b.schwerpunkt ? 1 : 0) - (a.schwerpunkt ? 1 : 0))
    .slice(0, 3).map(f => f.id);
}
/* Soll der eben beantwortete Punkt vertieft werden? Nur Schwerpunkte, nur einmal, nur im Limit. */
const vertiefen = (B, f) => !!(f && f.schwerpunkt && f.tief && !f.vertieft && B.gefragt < B.max);

const frageZu = f => ({ feld: f.id, frage: f.beschreibung, vorschlaege: [], art: 'neu' });
function naechsteOffene(B) { const id = kandidaten(B)[0], f = id && B.felder.find(x => x.id === id); return f ? frageZu(f) : null; }

export function naechsteFrage(B) {
  const f = B.aktuell && B.felder.find(x => x.id === B.aktuell.feld);
  if (!f || (fertigFeld(f) && !klaeren(f) && B.aktuell.art !== 'vertiefung' && B.aktuell.art !== 'nachfrage')) B.aktuell = naechsteOffene(B);
  return B;
}

function trageEin(B, updates, ausser) {
  (updates || []).forEach(u => {
    const f = B.felder.find(x => x.id === u.feld);
    if (!f || !u.wert || !String(u.wert).trim() || f.id === ausser || f.status === 'uebersprungen') return;
    if (f.id === 'umfang' && !/\d|folie|minut|stunde|kurz|lang/i.test(u.wert)) return; /* Umfang nur, wenn es wirklich um die Länge geht */
    if (f.status === 'bestaetigt' && u.status === 'annahme') return; /* Bestätigtes nicht durch Vermutungen überschreiben */
    f.wert = String(u.wert).trim(); f.status = u.status === 'annahme' ? 'annahme' : 'bestaetigt';
  });
}
/* Frage der KI übernehmen, wenn sie zu einem erlaubten Punkt passt, sonst die Standardfrage */
function setzeFrage(B, q, erlaubt, artDerFrage) {
  const f = q && q.frage && erlaubt.includes(q.feld) && B.felder.find(x => x.id === q.feld);
  B.aktuell = f ? { feld: f.id, frage: String(q.frage), vorschlaege: (q.vorschlaege || []).map(String).slice(0, 4), art: artDerFrage || 'neu' } : naechsteOffene(B);
}

const felderListe = B => B.felder.map(f => `- ${f.id}: ${f.label}${f.prio === 'auto' ? ' (wird abgeleitet, nicht fragen)' : ''}${f.tief ? ' (kann Schwerpunkt sein)' : ''} – ${f.beschreibung}`).join('\n');
const artenListe = arten => arten.arten.map(a => `- ${a.id}: ${a.name} – ${a.kurz}`).join('\n');
const kandidatenText = (B, ids) => ids.map(id => { const f = B.felder.find(x => x.id === id); return `"${id}" (${f.label}: ${f.beschreibung}${f.wert ? ` Bisher nur vermutet oder zu ungenau: „${f.wert}“. Frage so, dass die Person es bestätigt und konkret macht${zahlFehlt(f) ? ', und frage nach der Zahl selbst' : ''}.` : ''})`; }).join('; ');

/* Erste Runde: Art erkennen (sofern nicht gesetzt), Bekanntes eintragen, Schwerpunkte, erste Frage.
   opts.ausProjekt: Die Angaben stammen aus einer Projektanalyse, die die Person schon durchlaufen hat.
   Was daraus sicher hervorgeht, wird nicht noch einmal gefragt, und es gibt weniger Fragen. */
export async function briefingStart(ki, prompts, B, projekt = '', opts = {}) {
  const arten = prompts.arten, sys = fuelle(prompts['system-briefing']);
  if (!B.art) {
    let gewaehlt = null;
    try {
      const r = await ki.frage({ art: 'praes_briefing', system: sys, schema: artSchema(arten), prompt: fuelle(prompts['briefing-art'], { beschreibung: B.beschreibung || '(keine)', projekt: projekt || '(keine)', arten: artenListe(arten) }) });
      if (arten.arten.some(a => a.id === r.art)) gewaehlt = r;
    } catch (e) { /* Erkennung ist eine Hilfe: bei Fehlern entscheiden Schlüsselwörter */ }
    setzeArt(B, gewaehlt ? gewaehlt.art : artNachWorten(B.beschreibung + ' ' + projekt, arten), arten);
    if (gewaehlt && gewaehlt.thema) { const t = B.felder.find(f => f.id === 'thema'); t.wert = String(gewaehlt.thema).replace(/präsentation/gi, '').trim(); t.status = 'annahme'; }
  }
  const a = art(arten, B.art), kand = kandidaten(B);
  const res = await ki.frage({
    art: 'praes_briefing', system: sys, schema: startSchema(B, kand),
    prompt: fuelle(prompts['briefing-start'], { art: a.name, artKurz: a.kurz, beschreibung: B.beschreibung || '(keine)', projekt: projekt || '(keine)', felder: felderListe(B), kandidaten: kandidatenText(B, kand) })
  });
  trageEin(B, res.vorbefuellt);
  B.felder.forEach(f => { if (f.wert && !f.gefragt) f.vorbefuellt = true; });
  if (opts.ausProjekt) {
    B.max = Math.min(B.max, 4);
    /* Was das Projekt sicher klärt, wird nicht noch einmal gefragt. Punkte zur Präsentation selbst
       (Publikum, Bitte, Umfang) kennt die Analyse nicht: sie gelten nur, wenn die Person sie selbst genannt hat. */
    const genannt = w => { const worte = String(w).toLowerCase().match(/[\p{L}\d]{4,}/gu) || []; const b = String(B.beschreibung).toLowerCase(); return worte.length > 0 && worte.filter(x => b.includes(x)).length / worte.length >= 0.5; };
    B.felder.forEach(f => {
      if (!f.vorbefuellt) return;
      if (PRAESENTATION_SELBST.has(f.id) && !genannt(f.wert)) { Object.assign(f, { wert: '', status: 'leer', vorbefuellt: false }); return; }
      if (f.status === 'bestaetigt' && !zahlFehlt(f)) { f.gefragt = true; f.ausProjekt = true; }
    });
    if (B.aktuell && !kandidaten(B).includes(B.aktuell.feld)) B.aktuell = null;
  }
  (res.schwerpunkte || []).slice(0, 2).forEach(id => { const f = B.felder.find(x => x.id === id); if (f && f.tief) f.schwerpunkt = true; });
  if (!B.felder.some(f => f.schwerpunkt)) { const f = B.felder.find(x => x.tief); if (f) f.schwerpunkt = true; }
  (res.unwichtig || []).forEach(id => { const f = B.felder.find(x => x.id === id); if (f && offen(f) && (f.prio === 'hoch' || f.prio === 'mittel') && !f.schwerpunkt) { f.wert = ''; f.status = 'uebersprungen'; f.unwichtig = true; } });
  if (!B.felder.find(f => f.id === 'thema').wert) Object.assign(B.felder.find(f => f.id === 'thema'), { wert: String(B.beschreibung).split(/[.!?\n]/)[0].slice(0, 60), status: 'annahme' });
  setzeFrage(B, res.erste_frage, kandidaten(B), 'neu');
  return B;
}

/* Was soll die KI in dieser Runde als nächste Frage tun? Wird vor dem Aufruf festgelegt. */
export function auftragFuer(B, antwortAnnahme) {
  const cur = B.aktuell, f = B.felder.find(x => x.id === cur.feld);
  B.gefragt++;
  if (!antwortAnnahme && cur.art === 'neu' && vertiefen(B, f)) return { art: 'vertiefung', ids: [f.id] };
  const ids = kandidaten(B).filter(id => id !== cur.feld);
  return ids.length ? { art: 'neu', ids } : { art: 'fertig', ids: [] };
}
function auftragText(B, auftrag) {
  if (auftrag.art === 'fertig') return 'Es ist genug gefragt. Setze feld = "" und frage = "".';
  if (auftrag.art === 'vertiefung') { const f = B.felder.find(x => x.id === auftrag.ids[0]); return `„${f.label}“ ist bei dieser Präsentation der wichtigste Punkt. Stelle dazu EINE Vertiefungsfrage (feld = "${f.id}"), die tiefer geht als die bisherige Antwort: nach einem konkreten Beispiel, einer Szene aus dem Alltag, einer Zahl oder dem eigentlichen Grund. Wiederhole nicht die erste Frage.`; }
  return `Wähle aus diesen offenen Punkten den, der für diese Präsentation jetzt am meisten bringt, und frage danach: ${kandidatenText(B, auftrag.ids)}`;
}

/* Antwort einsortieren (ohne KI-Aufruf testbar). opts.annahme: Person bat um eine Annahme. */
export function wendeRundeAn(B, res, antwort, opts = {}) {
  const cur = B.aktuell, f = B.felder.find(x => x.id === cur.feld), auftrag = opts.auftrag || { art: 'neu', ids: kandidaten(B) };
  /* Nachfragen nur einmal je Punkt und nur, wenn der Punkt noch leer ist */
  const vage = !!res.antwort_vage && !opts.annahme && !!f && !f.nachgefragt && cur.art !== 'vertiefung' && f.prio !== 'mittel';
  const alt = f ? f.wert : '';
  if (f && !vage) f.gefragt = true;
  trageEin(B, res.updates, vage || cur.art === 'vertiefung' ? cur.feld : null);
  if (f && cur.art === 'vertiefung') { f.wert = alt ? `${alt}\n${antwort}` : antwort; f.status = 'bestaetigt'; f.vertieft = true; }
  else if (f && !vage && !opts.annahme && (offen(f) || f.status === 'annahme' || (f.vorbefuellt && f.wert === alt))) { f.wert = antwort; f.status = 'bestaetigt'; }
  if (opts.annahme && f && offen(f)) { f.wert = '–'; f.status = 'uebersprungen'; }
  if (f && cur.art === 'neu' && f.schwerpunkt && auftrag.art !== 'vertiefung') f.vertieft = true;
  const q = res.naechste_frage || {};
  if (vage) { f.nachgefragt = true; setzeFrage(B, { ...q, feld: cur.feld, frage: q.feld === cur.feld && q.frage ? q.frage : `Kannst du das konkreter machen? ${f.beschreibung}` }, [cur.feld], 'nachfrage'); return B; }
  if (auftrag.art === 'vertiefung') { setzeFrage(B, q, auftrag.ids, 'vertiefung'); return B; }
  setzeFrage(B, q, kandidaten(B), 'neu');
  return B;
}

export async function briefingAntwort(ki, prompts, B, antwort, opts = {}) {
  const cur = B.aktuell, f = B.felder.find(x => x.id === cur.feld), a = art(prompts.arten, B.art);
  B.verlauf.push({ feld: cur.feld, frage: cur.frage, antwort });
  const auftrag = auftragFuer(B, opts.annahme);
  const darfNachfragen = !opts.annahme && f && !f.nachgefragt && cur.art !== 'vertiefung' && f.prio !== 'mittel';
  const res = await ki.frage({
    art: 'praes_briefing', system: fuelle(prompts['system-briefing']), schema: rundeSchema(B, auftrag.ids, cur.feld),
    prompt: fuelle(prompts['briefing-runde'], {
      art: a.name,
      felder: JSON.stringify(B.felder.filter(x => x.status !== 'uebersprungen').map(x => ({ id: x.id, label: x.label, wert: x.wert, status: x.status }))),
      verlauf: B.verlauf.slice(-6).map(v => `- F: ${v.frage}\n  A: ${v.antwort}`).join('\n'),
      feld: cur.feld, label: f ? f.label : '', frage: cur.frage,
      antwort: opts.annahme ? fuelle(prompts['briefing-annahme'], { label: f ? f.label : cur.feld }).trim() : antwort,
      nachfrageErlaubt: darfNachfragen
        ? `true nur, wenn die Antwort für „${f.label}“ nichts Verwertbares enthält (zum Beispiel „weiß nicht genau“, „das Übliche“) oder wenn die Person sagt, dass es Zahlen gibt, aber keine nennt. Dann ist naechste_frage EINE gezielte Nachfrage zum selben Punkt (feld = "${cur.feld}"), die genau das Fehlende erfragt, zum Beispiel „Wie viele Besucher sind es ungefähr pro Monat?“. Sonst false.`
        : 'immer false. Übernimm die Antwort so, wie sie ist.',
      auftrag: auftragText(B, auftrag)
    })
  });
  return wendeRundeAn(B, res, antwort, { ...opts, auftrag });
}

/* Frage überspringen: Punkt bleibt leer und wird nicht mehr gefragt */
export function briefingUeberspringen(B) {
  const f = B.aktuell && B.felder.find(x => x.id === B.aktuell.feld);
  if (f) { f.wert = '–'; f.status = 'uebersprungen'; f.gefragt = true; }
  B.aktuell = naechsteOffene(B);
  return B;
}

/* ---------- Briefing als geprüftes JSON ---------- */
export const BRIEFING_SCHEMA = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'string' },
    art: { type: 'string', minLength: 1 }, art_name: S_STR, thema: { type: 'string', minLength: 1 },
    folienzahl: { type: 'integer', minimum: 3, maximum: 30 },
    annahmen: { type: 'array', items: S_STR }
  },
  required: ['art', 'thema', 'folienzahl'],
  additionalProperties: S_STR
};

/* „12 Folien“, „20 Minuten“ oder nichts → Folienzahl (etwa eine Folie je zwei Minuten) */
export function folienzahlAus(text, standard = 10) {
  const t = String(text || '');
  const f = /(\d+)\s*(folien|slides|seiten)/i.exec(t), m = /(\d+)\s*(min|minuten)/i.exec(t), s = /(\d+(?:[.,]\d+)?)\s*(stunde|std)/i.exec(t);
  const n = f ? +f[1] : m ? Math.round(+m[1] / 2) : s ? Math.round(parseFloat(s[1].replace(',', '.')) * 30) : (/^\s*\d+\s*$/.test(t) ? +t : standard);
  return Math.max(3, Math.min(30, n || standard));
}

/* Liefert { ok, briefing, errors }. errors nennt die Kernpunkte, die noch fehlen.
   Das Briefing ist flach: je Punkt id → Text, damit die KI es direkt lesen kann. */
export function briefingFertig(B, arten) {
  const a = arten ? art(arten, B.art) : null;
  const gilt = f => f.wert && f.status !== 'uebersprungen' && f.wert !== '–';
  const briefing = { schemaVersion: '2.0', art: B.art, art_name: a ? a.name : B.art };
  B.felder.filter(gilt).forEach(f => { briefing[f.id] = f.wert; });
  briefing.thema = briefing.thema || String(B.beschreibung || '').slice(0, 60) || 'Präsentation';
  briefing.folienzahl = folienzahlAus(briefing.umfang, a ? a.folien : 8);
  briefing.annahmen = B.felder.filter(f => f.status === 'annahme' && gilt(f)).map(f => `${f.label}: ${f.wert}`);
  const fehlt = B.felder.filter(f => f.prio === 'kern' && !gilt(f)).map(f => `„${f.label}“ ist noch offen. Ohne diese Angabe lässt sich die Präsentation nicht sinnvoll aufbauen.`);
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

/* Formen, die dieses Designsystem darstellen kann. Ohne Fotos keine Bildfolien. */
export function verfuegbareFormen(system) {
  const fotos = bildAssets(system).length > 0;
  return FORM_IDS.filter(f => system.layouts.some(l => (fotos || !profil(l, system).bilder) && eignung(l, system, f) > 0));
}
export function outlineSchema(system, folienzahl) {
  const formen = verfuegbareFormen(system);
  return {
    type: 'object',
    properties: {
      titel: { type: 'string', minLength: 1 },
      storyline: S_STR,
      kernbotschaft: S_STR,
      folien: {
        type: 'array', minItems: Math.max(3, folienzahl - 2), maxItems: Math.min(30, folienzahl + 2),
        items: { type: 'object', properties: { abschnitt: S_STR, form: { type: 'string', enum: formen.length ? formen : ['liste'] }, betont: { type: 'boolean' }, kernaussage: { type: 'string', minLength: 1 }, inhalt: S_STR }, required: ['abschnitt', 'form', 'betont', 'kernaussage', 'inhalt'] }
      }
    },
    required: ['titel', 'storyline', 'kernbotschaft', 'folien']
  };
}

/* ---------- Abwechslung ----------
   Kleine Modelle wählen gern immer dasselbe Layout. Diese Regeln sorgen für Rhythmus,
   ohne den Inhalt anzutasten (geschrieben werden die Folien erst danach):
   - erste Folie Titel, letzte Abschluss
   - Bild links und rechts wechseln sich ab
   - keine zwei gleichen Layouts hintereinander
   - Aufzählungen und andere Textlayouts höchstens etwa ein Drittel
   - Zitat höchstens einmal, Kapiteltrenner nur bei mehr als acht Folien */
const TEXT_TYPEN = ['content-bullets', 'cards', 'two-column', 'statement'];
export function abwechslung(folien, system) {
  const typ = id => (system.layout(id) || {}).typ || id, hat = t => system.layouts.find(l => l.typ === t), n = folien.length;
  const setze = (f, t) => { const l = hat(t); if (l) f.layoutId = l.id; };
  const out = folien.map(f => ({ ...f }));
  if (n >= 3) { if (typ(out[0].layoutId) !== 'title') setze(out[0], 'title'); if (typ(out[n - 1].layoutId) !== 'closing') setze(out[n - 1], 'closing'); }
  const mitte = out.slice(1, n - 1), grenze = Math.max(2, Math.ceil(n / 3));
  /* Kapiteltrenner und Zitate */
  let zitate = 0;
  mitte.forEach(f => { if (typ(f.layoutId) === 'section' && n <= 8) setze(f, 'statement'); if (typ(f.layoutId) === 'quote' && ++zitate > 1) setze(f, 'statement'); });
  /* Bildseiten abwechseln */
  let links = true;
  mitte.forEach(f => { const t = typ(f.layoutId); if ((t === 'image-left' || t === 'image-right') && hat('image-left') && hat('image-right')) { setze(f, links ? 'image-left' : 'image-right'); links = !links; } });
  /* Wiederholungen und Übermaß an Textfolien auflösen */
  const zaehle = t => out.filter(f => typ(f.layoutId) === t).length;
  for (let i = 1; i < n - 1; i++) {
    const f = out[i], t = typ(f.layoutId), vor = typ(out[i - 1].layoutId), nach = i + 1 < n ? typ(out[i + 1].layoutId) : '';
    const zuviel = TEXT_TYPEN.includes(t) && zaehle(t) > (t === 'statement' ? 2 : grenze);
    if (t !== vor && !zuviel) continue;
    const ersatz = (t.startsWith('image') ? ['image-full', 'statement', 'cards'] : TEXT_TYPEN)
      .filter(x => hat(x) && x !== t && x !== vor && x !== nach && zaehle(x) < (x === 'statement' ? 2 : grenze))
      .sort((a, b) => zaehle(a) - zaehle(b))[0];
    if (ersatz) setze(f, ersatz);
  }
  return out;
}

/* opts.spiegeln: Bildlayouts dürfen für Abwechslung gespiegelt werden (nur wenn die KI Layouts anpassen darf) */
export async function erstelleOutline(ki, prompts, briefing, system, opts = {}) {
  const schema = outlineSchema(system, briefing.folienzahl), a = art(prompts.arten, briefing.art), formen = schema.properties.folien.items.properties.form.enum;
  const r = await frageGeprueft(ki, prompts, {
    art: 'praes_outline', system: systemPrompt(prompts, system), schema,
    prompt: fuelle(prompts.outline, {
      art: a.name, briefing: JSON.stringify(briefing), folienzahl: briefing.folienzahl,
      dramaturgie: a.dramaturgie.map((d, i) => `${i + 1}. ${d}`).join('\n'), stil: a.stil,
      formen: formen.map(f => `- ${f} – ${FORMEN[f]}`).join('\n')
    })
  }, a => checkSchema(a, schema, 'Gliederung'));

  /* Fallback: unbekannte Layouts ersetzen, Länge begrenzen, statt die Erstellung abzubrechen */
  const aenderungen = [], roh = r.antwort && typeof r.antwort === 'object' ? r.antwort : {};
  const folien = (Array.isArray(roh.folien) ? roh.folien : []).filter(f => f && typeof f === 'object').slice(0, schema.properties.folien.maxItems).map((f, i) => {
    /* Form aus der Antwort; ältere Antworten mit Layout-ID werden über den Layouttyp übersetzt */
    let form = formen.includes(f.form) ? f.form : system.layout(f.layoutId) ? FORM_VON_TYP[system.layout(f.layoutId).typ] : null;
    if (!form || !formen.includes(form)) { if (f.form || f.layoutId) aenderungen.push(`Gliederung, Folie ${i + 1}: Form „${f.form || f.layoutId}“ gibt es nicht, ersetzt durch „liste“.`); form = 'liste'; }
    return { abschnitt: String(f.abschnitt || ''), form, betont: f.betont === true, kernaussage: String(f.kernaussage || ''), inhalt: String(f.inhalt || ''), ...(system.layout(f.layoutId) ? { layoutId: f.layoutId } : {}) };
  });
  if (!folien.length) throw new Error('Die KI hat keine brauchbare Gliederung geliefert. Versuche es erneut oder wähle ein anderes Modell.');
  /* Das Layout wählt die App: passend zur Form, mit Abwechslung und Betonung */
  const wahl = waehleLayouts(folien, system, { spiegeln: !!opts.spiegeln, bilder: bildAssets(system).length > 0 });
  const mitLayout = folien.map((f, i) => ({ ...f, layoutId: wahl[i].layoutId, form: wahl[i].form, ...(wahl[i].spiegeln ? { spiegeln: true } : {}) }));
  return { outline: { titel: kuerze(String(roh.titel || briefing.thema).replace(/\s*[–-]?\s*(präsentation|pitch)\b/gi, '').trim() || String(briefing.thema), 40), storyline: String(roh.storyline || ''), kernbotschaft: String(roh.kernbotschaft || briefing.kernbotschaft || ''), folien: mitLayout }, versuche: r.versuche, aenderungen };
}

/* ============================================================
   4. Slide-Spec: jede Folie einzeln
   ============================================================ */
export const bildAssets = system => system.manifest.assets.filter(a => !/^(logo|deko|background|icon)/.test(a.role));

/* Antwortformat für genau ein Layout: nur dessen Felder, mit Limits und festen Bild-IDs */
export function folienSchema(layout, system, maxPunkte = Infinity) {
  const props = {}, pflicht = [];
  inhaltsPlatzhalter(layout).forEach(ph => {
    /* Zeichenlimits stehen absichtlich NICHT im Schema: Server mit Grammatik (Ollama, llama.cpp) brechen den Text
       sonst mitten im Wort ab. Die Limits stehen im Prompt und werden danach geprüft. */
    if (ph.typ === 'text') props[ph.id] = { type: 'string' };
    else if (ph.typ === 'bullets') props[ph.id] = { type: 'array', minItems: ph.pflicht ? 1 : 0, maxItems: Math.min(ph.maxItems, system.rules.maxBullets || ph.maxItems, maxPunkte), items: { type: 'string' } };
    else if (ph.typ === 'items') props[ph.id] = { type: 'array', minItems: ph.minItems || 1, maxItems: ph.maxItems, items: { type: 'object', properties: Object.fromEntries(ph.felder.map(f => [f.id, { type: 'string' }])), required: [ph.felder[0].id] } };
    else if (ph.typ === 'image') { const ids = bildAssets(system).map(a => a.id); if (!ids.length) return; props[ph.id] = { type: 'string', enum: ids }; }
    else return;
    if (ph.pflicht) pflicht.push(ph.id);
  });
  return { type: 'object', properties: { inhalt: { type: 'object', properties: props, required: pflicht }, notizen: S_STR }, required: ['inhalt', 'notizen'] };
}

function felderBeschreibung(layout, system, maxPunkte = Infinity) {
  return inhaltsPlatzhalter(layout).map(ph => {
    const p = ph.pflicht ? 'Pflicht' : 'optional', b = ph.beschreibung ? ` ${ph.beschreibung}.` : '';
    if (ph.typ === 'text') return `- ${ph.id} (Text, ${p}, höchstens ${ph.maxChars} Zeichen):${b}`;
    if (ph.typ === 'bullets') return `- ${ph.id} (Liste, ${p}, höchstens ${Math.min(ph.maxItems, system.rules.maxBullets || ph.maxItems, maxPunkte)} Punkte mit je höchstens ${ph.maxCharsPerItem} Zeichen):${b}`;
    if (ph.typ === 'items') return `- ${ph.id} (Liste, ${p}, ${ph.minItems || 1} bis ${ph.maxItems} Einträge):${b} Jeder Eintrag hat die Felder: ${ph.felder.map(f => `${f.id} (höchstens ${f.maxChars} Zeichen${f.beschreibung ? ', ' + f.beschreibung : ''})`).join('; ')}`;
    if (ph.typ === 'image') return `- ${ph.id} (Bild, optional): eine Bild-ID aus der Liste unten.${b}`;
    return '';
  }).filter(Boolean).join('\n');
}

/* Erfundene Fakten erkennen: Zahlen, E-Mail-Adressen und Webadressen auf der Folie müssen im Briefing
   (oder im Wunsch der Person) stehen. Platzhalter wie [Zahl] sind erlaubt. Sprechernotizen werden nicht geprüft. */
const zahlen = t => (String(t).match(/\d[\d.,]*\d|\d/g) || []).map(z => z.replace(/[.,]/g, '')).filter(z => z.length >= 2);
/* Zahlwörter („zwanzig Minuten“) gelten als genannte Zahlen */
const ZAHLWORT = { zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90, hundert: 100, tausend: 1000, zweihundert: 200, dreihundert: 300, fünfhundert: 500 };
const mitZahlwoertern = t => String(t).replace(/\b(zehn|elf|zwölf|dreizehn|vierzehn|fünfzehn|sechzehn|siebzehn|achtzehn|neunzehn|zwanzig|dreißig|vierzig|fünfzig|sechzig|siebzig|achtzig|neunzig|hundert|tausend|zweihundert|dreihundert|fünfhundert)\b/gi, w => `${w} ${ZAHLWORT[w.toLowerCase()]}`);
export function pruefeFakten(folie, layout, quelle) {
  const q = mitZahlwoertern(quelle), bekannt = new Set(zahlen(q)), ql = q.toLowerCase(), out = [];
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

/* Überschriften, die über die Präsentation statt über die Sache sprechen */
const META = /\b(präsentation\w*|\w*pitch\w*|folie\w*|willkommen|agenda|vortrag\w*|tagesordnung)\b/i;
/* sprache: prüfbare Regeln aus voice.md (verbotene Wörter, bevorzugte Begriffe, Anrede), siehe richtlinien.js */
export function pruefeStil(folie, layout, sprache = null) {
  const out = [], kopf = st => st && st.font === 'heading';
  inhaltsPlatzhalter(layout).forEach(ph => {
    const v = folie.inhalt[ph.id];
    if (v === undefined || ph.typ === 'image') return;
    const pruef = (wo, text) => { const m = META.exec(String(text)); if (m) out.push(`${wo}: „${m[0]}“ – der Text spricht über die Präsentation statt über die Sache. Schreibe eine konkrete Aussage über das Thema selbst.`); };
    const luecke = (wo, text) => { const m = /\[[^\]]*(zahl|prozent|%|wert|anzahl|zeit|betrag)[^\]]*\]/i.exec(String(text)); if (m) out.push(`${wo}: „${m[0]}“ ist ein Platzhalter für eine Zahl, die niemand kennt. Formuliere die Aussage ohne Zahl.`); };
    if (typeof v === 'string' && (kopf(ph.style) || ph.typ === 'text')) pruef(ph.id, v);
    if (typeof v === 'string') luecke(ph.id, v);
    const texte = typeof v === 'string' ? [[ph.id, v]] : Array.isArray(v) ? v.flatMap((x, i) => typeof x === 'string' ? [[`${ph.id}, Punkt ${i + 1}`, x]] : x && typeof x === 'object' ? Object.entries(x).map(([k, w]) => [`${ph.id}, Eintrag ${i + 1}, ${k}`, w]) : []) : [];
    if (sprache) texte.forEach(([wo, t]) => pruefeSprache(t, sprache).forEach(m => out.push(`${wo}: ${m}`)));
    if (Array.isArray(v) && ph.typ === 'bullets') v.forEach((x, i) => luecke(`${ph.id}, Punkt ${i + 1}`, x));
    if (Array.isArray(v) && ph.typ === 'items') v.forEach((x, i) => x && typeof x === 'object' && Object.entries(x).forEach(([k, w]) => luecke(`${ph.id}, Eintrag ${i + 1}, ${k}`, w)));
    if (Array.isArray(v) && ph.typ === 'items') v.forEach((x, i) => x && typeof x === 'object' && ph.felder.filter(fd => kopf(fd.style)).forEach(fd => x[fd.id] && pruef(`${ph.id}, Eintrag ${i + 1}, ${fd.id}`, x[fd.id])));
  });
  return out;
}

/* Eine Folie schreiben. opts.wunsch: Änderungswunsch beim Neu-Generieren; opts.bisher: der bisherige Inhalt.
   Liefert immer eine gültige Folie: { folie, versuche, aenderungen, pruefen }.
   pruefen nennt Zahlen und Kontaktdaten, die nicht im Briefing stehen. */
export async function erstelleFolie(ki, prompts, { briefing, outline, index, system }, opts = {}) {
  const plan = outline.folien[index], layout = system.layout(plan.layoutId) || system.layoutForTyp('content-bullets');
  const a = art(prompts.arten, briefing.art), maxPunkte = a.maxPunkte || Infinity;
  const schema = folienSchema(layout, system, maxPunkte), hatBild = inhaltsPlatzhalter(layout).some(p => p.typ === 'image');
  const einzel = a => ({ titel: outline.titel || 'Präsentation', folien: [{ layoutId: layout.id, inhalt: a && a.inhalt && typeof a.inhalt === 'object' ? a.inhalt : {}, notizen: a && typeof a.notizen === 'string' ? a.notizen : '' }] });
  /* Quelle für die Faktenprüfung: nur Inhalte, keine technischen Angaben wie die Schema-Version („2.0“ wäre sonst die Zahl 20) */
  const { schemaVersion, folienzahl, ...inhaltlich } = briefing;
  const quelle = JSON.stringify(inhaltlich) + ' ' + (opts.wunsch || '') + ' ' + JSON.stringify(opts.bisher || '');
  const fakten = f => pruefeFakten(f, layout, quelle);
  const sprache = leseSprachregeln(system.voice);
  const stil = f => [...pruefeStil(f, layout, sprache), ...inhaltsPlatzhalter(layout).filter(ph => ph.typ === 'bullets' && Array.isArray(f.inhalt[ph.id]) && f.inhalt[ph.id].length > maxPunkte).map(ph => `${ph.id}: ${f.inhalt[ph.id].length} Stichpunkte, bei dieser Präsentationsart höchstens ${maxPunkte}. Schreibe weniger, dafür stärkere Punkte.`)];
  const wunsch = [opts.bisher ? `\nBISHERIGER INHALT DIESER FOLIE (JSON):\n${JSON.stringify(opts.bisher)}` : '', opts.wunsch ? `\nWUNSCH DER PERSON ZUR ÜBERARBEITUNG (hat Vorrang):\n${opts.wunsch}` : (opts.bisher ? '\nSchreibe die Folie neu und formuliere sie anders als bisher.' : '')].join('');

  const r = await frageGeprueft(ki, prompts, {
    art: 'praes_folie', system: systemPrompt(prompts, system), schema,
    prompt: fuelle(prompts.folie, {
      art: a.name, stil: a.stil, abschnitt: plan.abschnitt || '(frei)',
      briefing: JSON.stringify(briefing),
      gliederung: outline.folien.map((f, i) => `${i === index ? '►' : ' '} ${i + 1}. [${f.form || f.layoutId}] ${f.kernaussage}`).join('\n'),
      nr: index + 1, anzahl: outline.folien.length, form: plan.form ? `${plan.form} – ${FORMEN[plan.form] || ''}${plan.betont ? ' – BETONT' : ''}` : '(frei)', kernaussage: plan.kernaussage, hinweis: plan.inhalt || '(keine weiteren Hinweise)',
      layoutId: layout.id, layoutBeschreibung: layout.beschreibung,
      felder: felderBeschreibung(layout, system, maxPunkte),
      bilder: hatBild ? bildAssets(system).map(a => `- ${a.id}: ${a.beschreibung || a.role}${(a.tags || []).length ? ' (' + a.tags.join(', ') + ')' : ''}`).join('\n') || '(keine)' : '(dieses Layout hat kein Bild)',
      wunsch
    })
  }, a => {
    const form = validateSpec(einzel(a), system).errors.map(e => e.replace(/^Folie 1 \([^)]*\), |^Folie 1: /, ''));
    return form.length ? form : [...stil(einzel(a).folien[0]), ...fakten(einzel(a).folien[0])];
  });

  /* Nach drei Versuchen noch Fehler: selbst kürzen, statt abzubrechen */
  let folie = einzel(r.antwort).folien[0], aenderungen = [];
  if (r.fehler.length) { const k = kuerzeSpec(einzel(r.antwort), system); folie = k.spec.folien[0]; aenderungen = k.aenderungen.map(a => a.replace(/^Folie 1/, `Folie ${index + 1}`)); }
  /* Optionale Felder: Platzhalter samt Präposition aus dem Satz nehmen („bis [Datum]“); bleibt kaum etwas übrig
     oder steht ein Name ohne Grundlage im Briefing darin, fällt das Feld weg */
  inhaltsPlatzhalter(layout).filter(ph => !ph.pflicht && ph.typ === 'text' && typeof folie.inhalt[ph.id] === 'string').forEach(ph => {
    const v = folie.inhalt[ph.id], namen = (v.match(/\b(Herr|Frau|Dr\.)\s+\p{Lu}\p{Ll}+/gu) || []).filter(n => !quelle.includes(n.split(/\s+/).pop()));
    if (!/\[[^\]]+\]/.test(v) && !namen.length) return;
    const rest = v.replace(/\s*(?:\b(?:bis|am|zum|zur|um|ab|von|für|mit|unter|per|an|bei)\s*)?\[[^\]]+\]/gi, '').replace(/\s*[|·,;:–-]\s*(?=[|·,;:–-]|$)/g, '').replace(/\s+([.,;:])/g, '$1').replace(/^[\s|·,;:–-]+|[\s|·,;–-]+$/g, '').trim();
    if (!namen.length && rest.replace(/[^\p{L}]/gu, '').length >= 12) { folie.inhalt[ph.id] = rest; aenderungen.push(`Folie ${index + 1}, ${ph.id}: Platzhalter entfernt.`); }
    else { delete folie.inhalt[ph.id]; aenderungen.push(`Folie ${index + 1}, ${ph.id}: entfernt, weil nur ein Platzhalter oder ein Name ohne Grundlage im Briefing darin stand.`); }
  });
  /* Die Abschlussfolie endet nie ohne Handlungsaufforderung: fehlt der Text, kommt sie aus dem Briefing */
  const schlussText = inhaltsPlatzhalter(layout).find(ph => ph.id === 'body' && ph.typ === 'text');
  const aufforderung = briefing.bitte || briefing.mitmachen || briefing.cta || briefing.empfehlung || briefing.naechste_schritte;
  if (layout.typ === 'closing' && schlussText && !folie.inhalt.body && aufforderung) {
    folie.inhalt.body = kuerze(String(aufforderung).split('\n')[0], schlussText.maxChars);
    aenderungen.push(`Folie ${index + 1}, body: Handlungsaufforderung aus dem Briefing eingesetzt.`);
  }
  /* Angaben, die nicht aus dem Briefing stammen, bleiben stehen, werden aber zur Prüfung gemeldet */
  const pruefen = [...stil(folie).map(f => `Folie ${index + 1}, ${f.split(' Schreibe')[0]} Bitte prüfen.`), ...fakten(folie).map(f => `Folie ${index + 1}, ${f.split(' Erfinde')[0]} Bitte prüfen.`)];
  return { folie, versuche: r.versuche, aenderungen, pruefen };
}

/* ============================================================
   5. Layout anpassen (nur wenn die Person es erlaubt)
   ============================================================ */
const r1 = v => Math.round(v * 10) / 10;
const ueberlapp = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/* Wie voll ist jede Textfläche bei Sollgröße? (100 % = passt genau) */
function fuellstand(e) {
  const h = blockHoehe(e.absaetze, e.w / 100 * FOLIE_PT.w, e.sollPt, { font: e.schrift, bold: e.bold, lineHeight: e.zeilenhoehe });
  return Math.round(h / (e.h / 100 * FOLIE_PT.h) * 100);
}

/* Vorschlag prüfen: Ränder, Mindestgröße, keine Überlappung, kein Text darf schlechter passen als vorher */
export function pruefeAnpassung(folie, system, vorschlag) {
  const layout = system.layout(folie.layoutId), meldungen = [];
  if (!layout || !vorschlag) return { anpassung: null, meldungen };
  const phs = inhaltsPlatzhalter(layout), boxen = {};
  (Array.isArray(vorschlag.aenderungen) ? vorschlag.aenderungen : []).forEach(a => {
    const ph = a && phs.find(p => p.id === a.id);
    if (!ph) return;
    const b = { x: r1(+a.x), y: r1(+a.y), w: r1(+a.w), h: r1(+a.h) }, bild = ph.typ === 'image';
    if ([b.x, b.y, b.w, b.h].some(v => !isFinite(v))) return;
    const rand = bild ? 0 : 3;
    if (b.x < rand || b.y < rand || b.x + b.w > 100 - rand || b.y + b.h > 100 - rand || b.w < 8 || b.h < 4) { meldungen.push(`${a.id}: ragt über den Rand, nicht übernommen.`); return; }
    if (Math.abs(b.x - ph.x) < 0.5 && Math.abs(b.y - ph.y) < 0.5 && Math.abs(b.w - ph.w) < 0.5 && Math.abs(b.h - ph.h) < 0.5) return;
    boxen[a.id] = b;
  });
  const bildSeitlich = phs.some(p => p.typ === 'image' && p.w < 70);
  const anp = { ...(vorschlag.spiegeln && bildSeitlich ? { spiegeln: true } : (folie.anpassung && folie.anpassung.spiegeln ? { spiegeln: true } : {})), boxen };
  /* Überlappungen: Textflächen untereinander und mit fester Gestaltung (außer flächigem Hintergrund) */
  const angepasst = passeAn(layout, anp), gefuellt = p => folie.inhalt[p.id] !== undefined || p.typ === 'image';
  const texte = inhaltsPlatzhalter(angepasst).filter(p => p.typ !== 'image' && gefuellt(p));
  /* Gestaltung der Marke: Logos, feste Texte, Akzente und Flächen. Hindernis ist sie nur, wenn die Fläche sie neu überdecken würde. */
  const fest = (angepasst.deko || []).filter(d => d.logo || d.shape === 'text' || d.w * d.h < 6000).map(o => ({ ...o, x: o.x - 1, y: o.y - 1, w: Math.max(o.w, 0.5) + 2, h: Math.max(o.h, 0.5) + 2 })); /* mit 1 % Abstand */
  const trifft = (b, o) => ueberlapp(b, o) > Math.max(0.3, Math.min(b.w * b.h, o.w * o.h) * 0.04);
  Object.keys(boxen).forEach(id => {
    const b = { ...boxen[id] }, ph = phs.find(p => p.id === id);
    const stoert = [...texte.filter(p => p.id !== id), ...(ph.typ === 'image' ? [] : fest.filter(o => !trifft(ph, o)))].find(o => trifft(b, o));
    if (stoert && ph.typ !== 'image') { delete boxen[id]; meldungen.push(`${id}: würde ${stoert.id || 'die Gestaltung'} überdecken, nicht übernommen.`); }
    if (ph.typ === 'image' && texte.some(t => ueberlapp(b, t) > 0.5) && !phs.some(p => p.typ === 'image' && p.w * p.h > 5000)) { delete boxen[id]; meldungen.push(`${id}: Bild würde Text überdecken, nicht übernommen.`); }
  });
  /* Wirkung auf den Text: nichts darf abgeschnitten oder deutlich kleiner werden */
  const probe = a => buildSlides({ titel: 'x', folien: [{ ...folie, anpassung: a }] }, system)[0].elemente.filter(e => e.art === 'text' && e.ph && !e.auto);
  const vorher = new Map(probe(null).map(e => [e.ph + (e.index ?? ''), e]));
  probe(anp).forEach(e => {
    const v = vorher.get(e.ph + (e.index ?? ''));
    if (!boxen[e.ph]) return;
    if ((e.gekuerzt && !(v && v.gekuerzt)) || (v && e.pt < v.pt * 0.9)) { delete boxen[e.ph]; meldungen.push(`${e.ph}: Text würde kleiner oder abgeschnitten, nicht übernommen.`); }
  });
  return { anpassung: Object.keys(boxen).length || anp.spiegeln ? anp : null, meldungen };
}

/* Ohne KI: Textflächen, deren Schrift stark verkleinert werden musste, nach unten und rechts in freien Raum wachsen lassen */
export function luftFuerText(folie, system) {
  const layout = passeAn(system.layout(folie.layoutId), folie.anpassung), m = buildSlides({ titel: 'x', folien: [folie] }, system)[0];
  const andere = id => [...inhaltsPlatzhalter(layout).filter(p => p.id !== id && (folie.inhalt[p.id] !== undefined || p.typ === 'image')), ...(layout.deko || []).filter(d => d.logo || d.shape === 'text')];
  const aenderungen = [];
  m.elemente.filter(e => e.art === 'text' && e.ph && !e.auto && e.index === undefined && e.pt < e.sollPt * 0.85).forEach(e => {
    const b = { x: e.x, y: e.y, w: e.w, h: e.h }, hindernisse = andere(e.ph);
    const frei = t => t.x >= 3 && t.y >= 3 && t.x + t.w <= 97 && t.y + t.h <= 96 && !hindernisse.some(o => ueberlapp(t, o) > 0.2);
    for (let s = 0; s < 40; s++) { const t = { ...b, h: b.h + 1 }; if (!frei(t)) break; b.h = t.h; }
    for (let s = 0; s < 40; s++) { const t = { ...b, w: b.w + 1 }; if (!frei(t)) break; b.w = t.w; }
    if (b.h > e.h + 0.5 || b.w > e.w + 0.5) aenderungen.push({ id: e.ph, ...b });
  });
  return aenderungen;
}

/* Eine Folie gestalten lassen. Liefert { anpassung, meldungen, begruendung } */
export async function gestalteFolie(ki, prompts, { folie, system, wunsch }) {
  const layout = system.layout(folie.layoutId);
  if (!layout) return { anpassung: null, meldungen: [], begruendung: '' };
  const m = buildSlides({ titel: 'x', folien: [folie] }, system)[0];
  const ids = inhaltsPlatzhalter(layout).filter(p => folie.inhalt[p.id] !== undefined || p.typ === 'image').map(p => p.id);
  const elemente = inhaltsPlatzhalter(passeAn(layout, folie.anpassung)).filter(p => ids.includes(p.id)).map(p => {
    const t = m.elemente.filter(e => e.ph === p.id && e.art === 'text');
    const voll = t.length && p.typ !== 'items' ? `${Math.max(...t.map(fuellstand))} % voll${t.some(e => e.pt < e.sollPt * 0.9) ? ', Schrift musste verkleinert werden' : ''}` : p.typ === 'image' ? 'Bild' : 'Kacheln';
    return `- ${p.id} – ${p.typ === 'image' ? 'Bild' : p.typ === 'bullets' ? 'Stichpunkte' : p.typ === 'items' ? 'Kacheln' : 'Text'} – ${r1(p.x)}, ${r1(p.y)}, ${r1(p.w)}, ${r1(p.h)} – ${voll}`;
  });
  const feste = (layout.deko || []).filter(d => d.logo || d.shape === 'text' || (d.w * d.h > 30 && d.w * d.h < 6000)).slice(0, 12).map(d => `- ${d.logo ? 'Logo' : d.shape === 'text' ? `Text „${String(d.text).slice(0, 30)}“` : 'Fläche'} – ${r1(d.x)}, ${r1(d.y)}, ${r1(d.w)}, ${r1(d.h)}`);
  const auto = luftFuerText(folie, system);
  const schema = { type: 'object', properties: { aenderungen: { type: 'array', maxItems: 6, items: { type: 'object', properties: { id: { type: 'string', enum: ids.length ? ids : ['keine'] }, x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } }, required: ['id', 'x', 'y', 'w', 'h'] } }, spiegeln: { type: 'boolean' }, begruendung: S_STR }, required: ['aenderungen', 'spiegeln', 'begruendung'] };
  let antwort = { aenderungen: [], spiegeln: false, begruendung: '' };
  try {
    antwort = await ki.frage({
      art: 'praes_layout', system: systemPrompt(prompts, system), schema,
      prompt: fuelle(prompts.gestalten, {
        form: folie.form ? `${folie.form}${folie.betont ? ' (betont)' : ''}` : '(frei)', kernaussage: folie.kernaussage || '(keine)',
        layoutBeschreibung: layout.beschreibung, elemente: elemente.join('\n') || '(keine)', feste: feste.join('\n') || '(keine)',
        wunsch: [auto.length ? `\nVORSCHLAG DER APP, weil Text zu eng ist (darfst du übernehmen oder verbessern): ${JSON.stringify(auto)}` : '', wunsch ? `\nWUNSCH DER PERSON (hat Vorrang): ${wunsch}` : ''].join('')
      })
    }) || antwort;
  } catch (e) { if (!auto.length) throw e; }
  const vorschlag = { aenderungen: [...auto.filter(a => !(antwort.aenderungen || []).some(b => b && b.id === a.id)), ...(antwort.aenderungen || [])], spiegeln: !!antwort.spiegeln };
  const r = pruefeAnpassung(folie, system, vorschlag);
  return { ...r, begruendung: String(antwort.begruendung || '') };
}

/* Alles in einem Lauf: Outline, dann jede Folie.
   opts.fortschritt({ schritt, nr, anzahl }) wird vor jedem KI-Aufruf gerufen.
   opts.gestalten: die KI darf danach Positionen und Größen anpassen (und Bildlayouts spiegeln). */
export async function erstellePraesentation(ki, prompts, briefing, system, opts = {}) {
  const melde = opts.fortschritt || (() => {});
  melde({ schritt: 'outline', nr: 0, anzahl: 0 });
  const o = await erstelleOutline(ki, prompts, briefing, system, { spiegeln: !!opts.gestalten });
  const folien = [], protokoll = [...o.aenderungen], pruefen = [];
  for (let i = 0; i < o.outline.folien.length; i++) {
    melde({ schritt: 'folie', nr: i + 1, anzahl: o.outline.folien.length });
    const plan = o.outline.folien[i];
    const f = await erstelleFolie(ki, prompts, { briefing, outline: o.outline, index: i, system });
    f.folie.form = plan.form; f.folie.betont = !!plan.betont; f.folie.kernaussage = plan.kernaussage;
    if (plan.spiegeln) f.folie.anpassung = { spiegeln: true };
    folien.push(f.folie); protokoll.push(...f.aenderungen); pruefen.push(...f.pruefen);
  }
  if (opts.gestalten) for (let i = 0; i < folien.length; i++) {
    melde({ schritt: 'gestalten', nr: i + 1, anzahl: folien.length });
    try {
      const g = await gestalteFolie(ki, prompts, { folie: folien[i], system });
      if (g.anpassung) { folien[i].anpassung = g.anpassung; protokoll.push(`Folie ${i + 1}: Layout angepasst${g.begruendung ? ` – ${g.begruendung.replace(/[.\s]+$/, '')}` : ''}.`); }
    } catch (e) { protokoll.push(`Folie ${i + 1}: Layout konnte nicht angepasst werden (${e.message}).`); }
  }
  const spec = { schemaVersion: SPEC_VERSION, titel: o.outline.titel, folien };
  const v = validateSpec(spec, system);
  return { spec, outline: o.outline, protokoll, pruefen, ok: v.ok, errors: v.errors };
}
