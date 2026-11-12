/* ============================================================
   Präsentationsgenerator – Formulierungsrichtlinien einer Marke
   1. Text aus einer Datei lesen (PowerPoint, Word, Text, Markdown)
   2. In Teile schneiden, die auch ein kleines lokales Modell
      vollständig lesen kann
   3. Je Teil zieht die KI heraus, was die Sprache betrifft
      (Tonalität, Anrede, Regeln, verbotene und bevorzugte Begriffe,
      Schreibweisen, Beispiele). Zusammengeführt wird ohne KI.
   4. Daraus entsteht der Abschnitt in voice.md, der bei jeder Folie
      mitgeht. leseSprachregeln() liest daraus die prüfbaren Regeln.
   ============================================================ */
import { fuelle } from './pipeline.js';

const xml = t => new DOMParser().parseFromString(t, 'application/xml');
const nummer = n => +(/(\d+)\.xml$/.exec(n) || [0, 0])[1];
const absaetze = (doc, tag, tTag) => [...doc.getElementsByTagName(tag)].map(p => [...p.getElementsByTagName(tTag)].map(t => t.textContent).join('').trim()).filter(Boolean);

/* ---------- 1. Datei lesen ---------- */
/* Liefert { name, abschnitte: [{ titel, text }] }. Je Folie ein Abschnitt, bei Word je Überschrift. */
export async function textAusDatei(datei, JSZip) {
  const name = String(datei.name || 'Datei'), ext = name.split('.').pop().toLowerCase();
  if (['txt', 'md', 'markdown'].includes(ext)) {
    const text = await datei.text();
    const teile = text.split(/\n(?=#{1,3}\s)/).map(t => t.trim()).filter(Boolean);
    return { name, abschnitte: teile.map((t, i) => ({ titel: (/^#{1,3}\s*(.+)/.exec(t) || [0, `Abschnitt ${i + 1}`])[1], text: t })) };
  }
  if (ext === 'pdf') throw new Error('PDF-Dateien kann der Browser hier nicht lesen. Speichere die Richtlinien als PowerPoint (.pptx), Word (.docx) oder Text (.txt) und lade sie dann hoch.');
  if (!['pptx', 'potx', 'docx'].includes(ext)) throw new Error(`„${name}“ wird nicht unterstützt. Möglich sind .pptx, .potx, .docx, .txt und .md.`);
  let zip;
  try { zip = await JSZip.loadAsync(datei); } catch { throw new Error(`„${name}“ ist keine lesbare Office-Datei.`); }
  const lies = async p => zip.file(p) ? zip.file(p).async('string') : null;

  if (ext === 'docx') {
    const doc = await lies('word/document.xml');
    if (!doc) throw new Error('In der Word-Datei fehlt word/document.xml.');
    const d = xml(doc), abschnitte = [];
    let akt = { titel: 'Anfang', text: '' };
    for (const p of d.getElementsByTagName('w:p')) {
      const t = [...p.getElementsByTagName('w:t')].map(x => x.textContent).join('').trim();
      if (!t) continue;
      const stil = (p.getElementsByTagName('w:pStyle')[0] || { getAttribute: () => '' }).getAttribute('w:val') || '';
      if (/heading|berschrift|titel|title/i.test(stil)) { if (akt.text) abschnitte.push(akt); akt = { titel: t, text: '' }; }
      akt.text += (akt.text ? '\n' : '') + t;
    }
    if (akt.text) abschnitte.push(akt);
    return { name, abschnitte };
  }

  /* PowerPoint: Folien in der Reihenfolge der Präsentation, mit Notizen */
  const pres = await lies('ppt/presentation.xml'), relsText = await lies('ppt/_rels/presentation.xml.rels');
  const rels = {};
  if (relsText) for (const r of xml(relsText).getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = 'ppt/' + r.getAttribute('Target').replace(/^\/?ppt\//, '').replace(/^\.\//, '');
  let folien = pres ? [...xml(pres).getElementsByTagName('p:sldId')].map(e => rels[e.getAttribute('r:id')]).filter(p => p && zip.file(p)) : [];
  if (!folien.length) folien = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => nummer(a) - nummer(b));
  if (!folien.length) throw new Error('In der Datei wurden keine Folien gefunden.');
  const abschnitte = [];
  for (const [i, pfad] of folien.entries()) {
    const zeilen = absaetze(xml(await lies(pfad)), 'a:p', 'a:t');
    const notizPfad = Object.keys(zip.files).find(n => n === pfad.replace('slides/slide', 'notesSlides/notesSlide'));
    const notizen = notizPfad ? absaetze(xml(await lies(notizPfad)), 'a:p', 'a:t').filter(z => !/^\d+$/.test(z)) : [];
    if (!zeilen.length && !notizen.length) continue;
    abschnitte.push({ titel: `Folie ${i + 1}${zeilen[0] ? ': ' + zeilen[0].slice(0, 60) : ''}`, text: [...zeilen, ...(notizen.length ? ['Notizen: ' + notizen.join(' ')] : [])].join('\n') });
  }
  return { name, abschnitte };
}

/* ---------- 2. Teile ---------- */
export function teile(abschnitte, max = 5000) {
  const out = [];
  let akt = '';
  for (const a of abschnitte) {
    const block = `### ${a.titel}\n${a.text.length > max ? a.text.slice(0, max) : a.text}`;
    if (akt && akt.length + block.length > max) { out.push(akt); akt = ''; }
    akt += (akt ? '\n\n' : '') + block;
  }
  if (akt) out.push(akt);
  return out;
}

/* ---------- 3. Herausziehen und zusammenführen ---------- */
const S = { type: 'string' }, LISTE = { type: 'array', items: S };
export const RICHTLINIEN_SCHEMA = {
  type: 'object',
  properties: {
    tonalitaet: LISTE, anrede: { type: 'string', enum: ['du', 'sie', 'unklar'] }, regeln: LISTE,
    verboten: LISTE, ersetzen: { type: 'array', items: { type: 'object', properties: { statt: S, besser: S }, required: ['statt', 'besser'] } },
    schreibweisen: LISTE, beispiele: { type: 'array', items: { type: 'object', properties: { schlecht: S, gut: S }, required: ['schlecht', 'gut'] } }
  },
  required: ['tonalitaet', 'anrede', 'regeln', 'verboten', 'ersetzen', 'schreibweisen', 'beispiele']
};

const sauber = s => String(s || '').replace(/\s+/g, ' ').replace(/^[-•–*\s]+/, '').trim();
const schluessel = s => sauber(s).toLowerCase().replace(/[„“"'.,:;!?()]/g, '');
function einzigartig(liste, max, laenge = 220) {
  const gesehen = new Set(), out = [];
  for (const x of liste) { const t = sauber(x).slice(0, laenge), k = schluessel(t); if (!k || gesehen.has(k)) continue; gesehen.add(k); out.push(t); if (out.length >= max) break; }
  return out;
}

/* Ohne KI: Ergebnisse aller Teile zusammenführen. Doppeltes fällt weg, ganze Sätze gehören zu den Beispielen statt in Wortlisten, Wörter, die sowohl verboten als auch
   bevorzugt wären, bleiben nur bevorzugt; die Anrede entscheidet die Mehrheit. */
export function fuehreZusammen(ergebnisse) {
  const alle = k => ergebnisse.flatMap(e => Array.isArray(e[k]) ? e[k] : []);
  const ersetzen = [], gesehen = new Set();
  alle('ersetzen').forEach(x => { const statt = sauber(x && x.statt), besser = sauber(x && x.besser); const k = schluessel(statt); if (statt && besser && k !== schluessel(besser) && !gesehen.has(k) && statt.split(' ').length <= 4 && besser.split(' ').length <= 8) { gesehen.add(k); ersetzen.push({ statt, besser }); } });
  const bevorzugt = new Set(ersetzen.map(e => schluessel(e.besser)));
  const verboten = einzigartig(alle('verboten').flatMap(v => String(v).split(/[,;]\s*/)).filter(v => sauber(v).length <= 40 && sauber(v).split(' ').length <= 3 && !bevorzugt.has(schluessel(v))), 40, 40);
  const stimmen = ergebnisse.map(e => e.anrede).filter(a => a === 'du' || a === 'sie');
  const du = stimmen.filter(a => a === 'du').length, sie = stimmen.length - du;
  const beispiele = [], bsp = new Set();
  alle('beispiele').forEach(b => { const s = sauber(b && b.schlecht), g = sauber(b && b.gut); if (g && !bsp.has(schluessel(g)) && g.length <= 200) { bsp.add(schluessel(g)); beispiele.push({ schlecht: s, gut: g }); } });
  return {
    tonalitaet: einzigartig(alle('tonalitaet'), 8), anrede: du > sie ? 'du' : sie > du ? 'sie' : '',
    regeln: einzigartig(alle('regeln'), 20), verboten, ersetzen: ersetzen.slice(0, 40),
    schreibweisen: einzigartig(alle('schreibweisen'), 20), beispiele: beispiele.slice(0, 8)
  };
}

/* opts.fortschritt(nr, anzahl) vor jedem KI-Aufruf. Ein Teil, der fehlschlägt, wird übersprungen. */
export async function destilliere(ki, prompts, datei, opts = {}) {
  const stuecke = teile(datei.abschnitte, opts.max || 5000), ergebnisse = [], fehler = [];
  for (const [i, stueck] of stuecke.entries()) {
    if (opts.fortschritt) opts.fortschritt(i + 1, stuecke.length);
    try {
      ergebnisse.push(await ki.frage({ art: 'praes_richtlinien', system: fuelle(prompts['system-briefing']), schema: RICHTLINIEN_SCHEMA, prompt: fuelle(prompts.richtlinien, { datei: datei.name, teil: i + 1, anzahl: stuecke.length, text: stueck }) }));
    } catch (e) { fehler.push(`Teil ${i + 1}: ${e.message}`); }
  }
  if (!ergebnisse.length) throw new Error(`Die Richtlinien konnten nicht ausgewertet werden. ${fehler[0] || ''}`);
  return { regeln: fuehreZusammen(ergebnisse), teile: stuecke.length, fehler };
}

/* ---------- 4. voice.md ---------- */
const START = '<!-- aus-richtlinien', ENDE = '<!-- /aus-richtlinien -->';
export function voiceAbschnitt(r, quelle) {
  const z = [`${START}: ${quelle.replace(/-->/g, '')} -->`, `Diese Richtlinien stammen aus „${quelle}“. Sie haben Vorrang vor allem, was weiter unten steht.`, ''];
  if (r.tonalitaet.length) z.push('## Tonalität', '', ...r.tonalitaet.map(t => `- ${t}`), '');
  if (r.anrede) z.push('## Anrede', '', `- Das Publikum wird mit **${r.anrede === 'du' ? 'Du' : 'Sie'}** angesprochen.`, '');
  if (r.regeln.length) z.push('## Regeln', '', ...r.regeln.map(t => `- ${t}`), '');
  if (r.schreibweisen.length) z.push('## Schreibweisen der Marke', '', ...r.schreibweisen.map(t => `- ${t}`), '');
  if (r.verboten.length) z.push('## Verbotene Füllwörter', '', r.verboten.join(', '), '');
  if (r.ersetzen.length) z.push('## Bevorzugte Begriffe', '', '| Statt | Lieber |', '|---|---|', ...r.ersetzen.map(e => `| ${e.statt.replace(/\|/g, '/')} | ${e.besser.replace(/\|/g, '/')} |`), '');
  if (r.beispiele.length) z.push('## Beispiele', '', ...r.beispiele.map(b => b.schlecht ? `- Nicht: „${b.schlecht}“ – sondern: „${b.gut}“` : `- So klingt es: „${b.gut}“`), '');
  z.push(ENDE);
  return z.join('\n');
}
/* Abschnitt in voice.md einsetzen: ersetzt einen früheren Import, der Rest bleibt darunter erhalten.
   Die Vorlage ohne eigene Inhalte („Passe sie an …“) fällt weg. */
export function setzeEin(voice, abschnitt, titel = 'Formulierungsrichtlinien') {
  let rest = String(voice || '');
  const a = rest.indexOf(START), b = rest.indexOf(ENDE);
  if (a >= 0 && b > a) rest = (rest.slice(0, a) + rest.slice(b + ENDE.length));
  rest = rest.replace(/^# .*\n+/, '').replace(/^Diese Datei wird beim Schreiben[^\n]*\n+/m, '').trim();
  const vorlage = /Passe sie an eure Organisation an|Sachlich, klar und freundlich\.\n- Aussagen statt Themen als Überschrift\./.test(String(voice || '')) && !/aus-richtlinien/.test(String(voice || ''));
  return `# ${titel}\n\n${abschnitt}\n${rest && !vorlage ? `\n## Weitere Richtlinien\n\n${rest.replace(/^## Weitere Richtlinien\n+/, '')}\n` : ''}`;
}

/* ---------- Prüfbare Regeln aus voice.md ---------- */
/* Liest „Verbotene Füllwörter“, „Bevorzugte Begriffe“ (Tabelle) und „Anrede“ – egal ob von Hand geschrieben oder importiert */
export function leseSprachregeln(voice) {
  const v = String(voice || ''), abschnitt = re => { const m = new RegExp(`^##\\s*${re}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|<!--|$(?![\\s\\S]))`, 'mi').exec(v); return m ? m[1] : ''; };
  const verboten = abschnitt('Verbotene').replace(/^\s*[-*]\s*/gm, '').split(/[,\n]/).map(sauber).filter(w => w && w.length <= 40);
  const ersetzen = abschnitt('Bevorzugte').split('\n').map(z => z.split('|').map(sauber)).filter(z => z.length >= 4 && z[1] && z[2] && !/^-+$/.test(z[1]) && !/^statt$/i.test(z[1])).map(z => ({ statt: z[1], besser: z[2] }));
  const an = abschnitt('Anrede'), anrede = /\*\*Du\*\*|\bmit Du\b|\bduzen\b/i.test(an) ? 'du' : /\*\*Sie\*\*|\bmit Sie\b|\bsiezen\b/i.test(an) ? 'sie' : '';
  return { verboten, ersetzen, anrede };
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wort = w => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(w)}(?=$|[^\\p{L}\\p{N}])`, 'iu');
/* Meldungen für einen Text; leer, wenn alles passt */
export function pruefeSprache(text, regeln) {
  if (!regeln) return [];
  const t = String(text), out = [];
  regeln.verboten.forEach(w => { if (wort(w).test(t)) out.push(`„${w}“ ist laut Formulierungsrichtlinien nicht erlaubt. Formuliere ohne dieses Wort.`); });
  regeln.ersetzen.forEach(({ statt, besser }) => {
    /* „Kunden“ steckt auch in „Kundinnen und Kunden“: die bevorzugte Form zählt nicht als Verstoß */
    const ohne = t.replace(new RegExp(esc(besser), 'gi'), ' ');
    if (wort(statt).test(ohne)) out.push(`„${statt}“: Laut Formulierungsrichtlinien heißt es „${besser}“.`);
  });
  if (regeln.anrede === 'sie' && /(^|[^\p{L}])(du|dich|dir|dein|deine|deinen|deinem|deiner|euch|euer|eure|euren)(?=$|[^\p{L}])/iu.test(t)) out.push('Das Publikum wird laut Formulierungsrichtlinien mit „Sie“ angesprochen, nicht mit „du“ oder „ihr“.');
  if (regeln.anrede === 'du' && (/(^|[^\p{L}])(Ihnen|Ihre|Ihren|Ihrem|Ihrer)(?=$|[^\p{L}])/u.test(t) || /[^.!?:\s„"]\s+Sie(?=$|[^\p{L}])/u.test(t))) out.push('Das Publikum wird laut Formulierungsrichtlinien mit „du“ angesprochen, nicht mit „Sie“.');
  return out;
}
