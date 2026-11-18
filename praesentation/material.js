/* ============================================================
   Präsentationsgenerator – Material der Person
   Bilder, Tabellen und Texte, die unbedingt in die Präsentation
   gehören. Dieses Modul
   1. liest Tabellen aus Text (CSV, TSV, aus Excel kopiert), aus
      HTML (aus Excel, Numbers, Word, Google Tabellen kopiert) und
      aus Excel-Dateien,
   2. fasst Material für die Prompts zusammen: kurz für Briefing
      und Gliederung, vollständig für die Folie, die es trägt,
   3. sorgt nach der Gliederung der KI dafür, dass jedes Bild und
      jede Tabelle eine eigene Folie bekommt und jeder Text eine
      Folie, die ihn nutzt (ohne KI),
   4. macht Bilder der Person zu Bildern des Designsystems, damit
      Layoutwahl, Vorschau und Export sie wie eigene Bilder
      behandeln.
   Bis auf das Lesen von HTML und Excel läuft alles ohne Browser.

   Material: { id (kurz, z. B. „M1“, so sieht es die KI), key (eindeutig, für den Bildspeicher),
     art: 'bild' | 'tabelle' | 'text', name, notiz,
     bild:    w, h, bildart ('foto' | 'grafik'), beschreibung, textImBild
     tabelle: tabelle: { kopf: [..], zeilen: [[..]] }
     text:    text, kurz, fakten: [..] }
   ============================================================ */

export const MAX_ZEILEN = 12;   /* Tabellenzeilen je Folie; längere Tabellen gehen über mehrere Folien */
export const MAX_SPALTEN = 8;   /* mehr Spalten sind auf einer Folie nicht lesbar */
const MAX_ZELLE = 80;           /* Zeichen je Zelle */
export const MAX_TEXT = 20000;  /* Zeichen, die von einem Text behalten werden */

const sauber = s => String(s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const kurzText = (t, n) => { const s = sauber(t); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + ' …' : s; };
export const neuerKey = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
/* Kurze ID für die KI: M1, M2 … (lange IDs schreiben kleine Modelle gern falsch ab) */
export const neueId = (materialien = []) => 'M' + (Math.max(0, ...materialien.map(m => +(/^M(\d+)$/.exec(m.id) || [0, 0])[1])) + 1);
export const ART_NAME = { bild: 'Bild', tabelle: 'Tabelle', text: 'Text' };

/* ---------- Zahlen erkennen und schreiben ---------- */
/* „12.400“, „1,2 Mio. €“, „-3 %“, „€ 45,90“, „2024“ zählen als Zahl */
export function istZahl(c) {
  let s = sauber(c);
  if (!s) return false;
  s = s.replace(/^(€|\$|£|CHF|EUR|USD)\s*/i, '');
  for (let i = 0; i < 3; i++) s = s.replace(/\s*(%|‰|€|\$|£|CHF|EUR|USD|Mio\.?|Mrd\.?|Tsd\.?|T€|k|Std\.?|h|min|kg|km|m²|qm|Stk\.?|Pkt\.?|x)$/i, '');
  return /^[-+−–]?\s?\d[\d.,'\s]*$/.test(s) && /\d$/.test(s);
}
/* Zahl aus Excel so schreiben, wie man sie in Deutschland liest. Vierstellige Zahlen (Jahre)
   bekommen keinen Tausenderpunkt. */
export function zahlText(v, art = '') {
  if (!isFinite(v)) return '';
  if (art === 'prozent') { const p = Math.round(v * 1000) / 10; return `${String(p).replace('.', ',')} %`; }
  if (art === 'datum') {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return isNaN(d) ? String(v) : `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
  }
  const r = Math.round(v * 100) / 100;
  if (Number.isInteger(r) && Math.abs(r) < 10000) return String(r);
  return r.toLocaleString('de-DE', { maximumFractionDigits: 2, useGrouping: Math.abs(r) >= 10000 });
}

/* ---------- Tabellen lesen ---------- */
/* Rohe Zeilen → { kopf, zeilen } oder null. Leere Zeilen und Spalten fallen weg, die erste Zeile
   gilt als Kopf, wenn sie wie eine Beschriftung aussieht (Text über Zahlen). */
export function bereinige(rows) {
  let r = (rows || []).map(z => (Array.isArray(z) ? z : []).map(c => kurzText(c, MAX_ZELLE)));
  r = r.filter(z => z.some(Boolean));
  if (!r.length) return null;
  const n = Math.max(...r.map(z => z.length));
  r = r.map(z => [...z, ...Array(n - z.length).fill('')]);
  const voll = Array.from({ length: n }, (_, j) => r.some(z => z[j]));
  r = r.map(z => z.filter((_, j) => voll[j]));
  const spalten = r[0].length;
  if (spalten < 2 || r.length < 2) return null;   /* eine Spalte oder eine Zeile ist keine Tabelle, sondern Text */
  const zahlen = z => z.filter(istZahl).length, erste = r[0], zweite = r[1];
  const kopf = erste.filter(Boolean).length >= spalten - 1 && (zahlen(erste) === 0 || zahlen(erste) < zahlen(zweite));
  return { kopf: kopf ? erste : [], zeilen: kopf ? r.slice(1) : r };
}

/* Text mit Trennzeichen: Tab (aus Excel kopiert), Semikolon (deutsches CSV) oder Komma */
export function leseTabelleText(text) {
  const t = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!t.includes('\n')) return null;
  const zeilen = t.split('\n').filter(z => z.trim()).slice(0, 30);
  const zaehle = (z, c) => { let n = 0, q = false; for (const ch of z) { if (ch === '"') q = !q; else if (ch === c && !q) n++; } return n; };
  const info = ['\t', ';', ','].map(c => { const n = zeilen.map(z => zaehle(z, c)); return { c, min: Math.min(...n), gleich: n[0] > 0 && n.every(x => x === n[0]) }; });
  const wahl = info.find(k => k.c === '\t' && k.min > 0) || info.find(k => k.gleich) || info.filter(k => k.min > 0).sort((a, b) => b.min - a.min)[0];
  if (!wahl) return null;
  const rows = []; let row = [], zelle = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { zelle += '"'; i++; } else q = false; } else zelle += ch; continue; }
    if (ch === '"' && !zelle.trim()) { q = true; zelle = ''; continue; }
    if (ch === wahl.c) { row.push(zelle); zelle = ''; continue; }
    if (ch === '\n') { row.push(zelle); rows.push(row); row = []; zelle = ''; continue; }
    zelle += ch;
  }
  row.push(zelle); rows.push(row);
  return bereinige(rows);
}

/* HTML aus der Zwischenablage. Verbundene Zellen bekommen leere Nachbarn, damit die Spalten stimmen. */
export function leseTabelleHtml(html, parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null) {
  if (!parser || !/<table/i.test(String(html))) return null;
  const t = parser.parseFromString(String(html), 'text/html').querySelector('table');
  if (!t) return null;
  const rows = [...t.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('th,td')].flatMap(td => {
    const span = Math.max(1, Math.min(12, +td.getAttribute('colspan') || 1));
    return [sauber(td.textContent), ...Array(span - 1).fill('')];
  }));
  return bereinige(rows);
}

/* Excel-Datei (.xlsx): jedes Blatt mit Inhalt wird eine Tabelle. Formeln liefern ihr letztes Ergebnis,
   Prozent und Datum werden erkannt. */
export async function leseXlsx(datei, JSZip) {
  let zip;
  try { zip = await JSZip.loadAsync(datei); } catch { throw new Error(`„${datei.name || 'Datei'}“ ist keine lesbare Excel-Datei.`); }
  const lies = async p => zip.file(p) ? zip.file(p).async('string') : null;
  const xml = t => new DOMParser().parseFromString(t, 'application/xml');
  const texte = [], ss = await lies('xl/sharedStrings.xml');
  if (ss) for (const si of xml(ss).getElementsByTagName('si')) texte.push([...si.getElementsByTagName('t')].map(x => x.textContent).join(''));
  /* Zahlenformate je Zellstil */
  const formate = [], eigene = {}, st = await lies('xl/styles.xml');
  if (st) {
    const d = xml(st);
    for (const nf of d.getElementsByTagName('numFmt')) eigene[nf.getAttribute('numFmtId')] = nf.getAttribute('formatCode') || '';
    const xfs = d.getElementsByTagName('cellXfs')[0];
    if (xfs) for (const xf of xfs.getElementsByTagName('xf')) formate.push(+xf.getAttribute('numFmtId') || 0);
  }
  const formatArt = id => {
    const code = String(eigene[id] || '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
    if (id === 9 || id === 10 || /%/.test(code)) return 'prozent';
    if ((id >= 14 && id <= 22) || (/[dmy]/i.test(code) && !/[0#]/.test(code))) return 'datum';
    return '';
  };
  const spalte = ref => { const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; let n = 0; for (const c of m[1]) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
  const wb = await lies('xl/workbook.xml'), relsText = await lies('xl/_rels/workbook.xml.rels');
  if (!wb) throw new Error(`In „${datei.name || 'Datei'}“ fehlt xl/workbook.xml.`);
  const ziel = {};
  if (relsText) for (const r of xml(relsText).getElementsByTagName('Relationship')) ziel[r.getAttribute('Id')] = r.getAttribute('Target');
  const blaetter = [...xml(wb).getElementsByTagName('sheet')].map(s => ({ name: s.getAttribute('name') || '', pfad: 'xl/' + String(ziel[s.getAttribute('r:id')] || '').replace(/^\/?xl\//, '') }));
  const out = [];
  for (const b of blaetter) {
    const t = await lies(b.pfad);
    if (!t) continue;
    const rows = [];
    for (const row of xml(t).getElementsByTagName('row')) {
      const nr = (+row.getAttribute('r') || rows.length + 1) - 1, z = [];
      if (nr > 400) break;
      for (const c of row.getElementsByTagName('c')) {
        const j = spalte(c.getAttribute('r'));
        if (j < 0 || j > 40) continue;
        const typ = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], wert = v ? v.textContent : '';
        let text = '';
        if (typ === 's') text = texte[+wert] || '';
        else if (typ === 'inlineStr') text = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
        else if (typ === 'b') text = wert === '1' ? 'ja' : 'nein';
        else if (typ === 'str' || typ === 'e') text = wert;
        else if (wert !== '') text = zahlText(+wert, formatArt(formate[+c.getAttribute('s') || 0] || 0));
        z[j] = text;
      }
      rows[nr] = z;
    }
    const tab = bereinige(Array.from(rows, z => Array.from(z || [], c => c || '')));
    if (tab) out.push({ name: b.name, ...tab });
  }
  return out;
}

/* Eine Tabelle für die Folie begrenzen: höchstens MAX_SPALTEN Spalten. Liefert die Tabelle und,
   falls etwas wegfiel, einen Hinweis. */
export function begrenzeTabelle(t) {
  const n = Math.max(t.kopf.length, ...t.zeilen.map(z => z.length));
  if (n <= MAX_SPALTEN) return { tabelle: t, hinweis: '' };
  return {
    tabelle: { kopf: t.kopf.slice(0, MAX_SPALTEN), zeilen: t.zeilen.map(z => z.slice(0, MAX_SPALTEN)) },
    hinweis: `Die Tabelle hat ${n} Spalten. Auf einer Folie sind ${MAX_SPALTEN} gut lesbar, die übrigen ${n - MAX_SPALTEN} sind weggelassen.`
  };
}
/* Wie viele Folien braucht eine Tabelle? */
export const tabellenTeile = t => Math.max(1, Math.ceil(((t && t.zeilen) || []).length / MAX_ZEILEN));
/* Zeilen eines Teils (1-basiert); der Kopf steht auf jedem Teil */
export const tabellenTeil = (t, teil = 1) => ({ kopf: t.kopf, zeilen: t.zeilen.slice((teil - 1) * MAX_ZEILEN, teil * MAX_ZEILEN) });

/* Tabelle als Text für die KI: Kopf und Zeilen mit „|“ getrennt */
export function tabelleText(t, maxZeilen = Infinity) {
  const zeile = z => z.map(c => c || '–').join(' | ');
  const zeilen = t.zeilen.slice(0, maxZeilen).map(zeile);
  if (t.zeilen.length > maxZeilen) zeilen.push(`… (noch ${t.zeilen.length - maxZeilen} weitere Zeilen)`);
  return [...(t.kopf.length ? [zeile(t.kopf)] : []), ...zeilen].join('\n');
}

/* ---------- Material für die Prompts ---------- */
const bildArt = m => m.bildart === 'grafik' ? 'Grafik' : 'Foto';
const kopfzeile = m => {
  if (m.art === 'bild') return `${m.id} (${bildArt(m)} „${m.name}“)`;
  if (m.art === 'tabelle') { const t = m.tabelle, n = Math.max(t.kopf.length, ...t.zeilen.map(z => z.length)); return `${m.id} (Tabelle „${m.name}“, ${n} Spalten × ${t.zeilen.length} Zeilen${t.kopf.length ? `; Spalten: ${t.kopf.join(', ')}` : ''})`; }
  return `${m.id} (Text „${m.name}“)`;
};
/* Kurzfassung eines Materials, eine Zeile: für Briefing und Gliederung */
export function materialKurz(m) {
  const notiz = m.notiz ? ` Hinweis der Person: ${kurzText(m.notiz, 200)}` : '';
  if (m.art === 'bild') return `- ${kopfzeile(m)}: ${m.beschreibung ? kurzText(m.beschreibung, 220) : 'ohne Beschreibung'}${m.textImBild ? ` Im Bild steht: ${kurzText(m.textImBild, 160)}` : ''}.${notiz}`;
  if (m.art === 'tabelle') return `- ${kopfzeile(m)}:\n${tabelleText(m.tabelle, 4).split('\n').map(z => '    ' + z).join('\n')}${notiz ? '\n   ' + notiz : ''}`;
  const kern = m.kurz ? `${m.kurz}${(m.fakten || []).length ? ' ' + m.fakten.slice(0, 5).join(' ') : ''}` : m.text;
  return `- ${kopfzeile(m)}: ${kurzText(kern, 600)}${notiz}`;
}
/* Alle Materialien für einen Prompt, höchstens etwa max Zeichen */
export function materialListe(materialien, max = 3500) {
  const l = (materialien || []).filter(m => m && m.status !== 'fehler');
  if (!l.length) return '(keins)';
  let out = '';
  for (const m of l) { const z = materialKurz(m); if (out && out.length + z.length > max) { out += `\n- … und ${l.length - l.indexOf(m)} weitere`; break; } out += (out ? '\n' : '') + z; }
  return out;
}
/* Vollständiger Inhalt für die Folie, die das Material trägt */
export function materialVoll(m, teil = 1) {
  const notiz = m.notiz ? `\nHinweis der Person dazu: ${m.notiz}` : '';
  if (m.art === 'bild') return `BILD DER PERSON AUF DIESER FOLIE (${bildArt(m)} „${m.name}“, die App setzt es ein): ${m.beschreibung || 'ohne Beschreibung'}${m.textImBild ? `\nIm Bild steht: ${m.textImBild}` : ''}${notiz}
Schreibe den Text so, dass er zum Bild passt und eine Aussage trifft. Beschreibe das Bild nicht nur.`;
  if (m.art === 'tabelle') {
    const n = tabellenTeile(m.tabelle), t = tabellenTeil(m.tabelle, teil);
    return `TABELLE DER PERSON AUF DIESER FOLIE (die App setzt sie vollständig ein, schreibe sie nicht ab${n > 1 ? `; das ist Teil ${teil} von ${n}` : ''}):
${tabelleText(t)}${notiz}
Die Überschrift sagt, was die Tabelle zeigt oder belegt (zum Beispiel was steigt, was auffällt, was sich unterscheidet), als konkrete Aussage. Zahlen nur aus der Tabelle.`;
  }
  return `TEXT DER PERSON, DESSEN INHALT AUF DIESE FOLIE GEHÖRT („${m.name}“):
"""${String(m.text || '').slice(0, 4000)}${String(m.text || '').length > 4000 ? ' …' : ''}"""${notiz}
Nutze diesen Inhalt, so vollständig die Felder es zulassen. Fakten wie Zahlen, Namen und Termine wörtlich.`;
}
/* Alles, was als Quelle für Fakten gilt: Zahlen und Namen aus dem Material darf die KI verwenden */
export function materialQuelle(materialien) {
  return (materialien || []).map(m => [m.name, m.notiz, m.beschreibung, m.textImBild, m.text, m.kurz, ...(m.fakten || []), m.tabelle ? tabelleText(m.tabelle) : ''].filter(Boolean).join(' ')).join(' ');
}

/* ---------- Bilder der Person als Bilder des Designsystems ---------- */
export const assetId = m => `material-${m.key || m.id}`;
const rolle = m => { const r = m.w && m.h ? m.w / m.h : 1.5; return r >= 1.25 ? 'hero-image' : r <= 0.85 ? 'portrait-image' : 'square-image'; };
/* Designsystem mit den Bildern der Person. url(key) liefert die Bildadresse (Data-URL) oder null,
   solange das Bild noch nicht geladen ist. Grafiken werden ganz gezeigt statt beschnitten. */
export function mitMaterial(system, materialien = [], url = () => null) {
  const bilder = (materialien || []).filter(m => m && m.art === 'bild');
  if (!system || !bilder.length) return system;
  const extra = bilder.map(m => ({
    id: assetId(m), role: rolle(m), file: assetId(m), beschreibung: m.beschreibung || m.notiz || m.name, tags: ['material'],
    ...(m.w && m.h ? { w: m.w, h: m.h } : {}), ...(m.bildart === 'grafik' ? { fit: 'contain' } : {}), material: m.id, key: m.key || m.id
  }));
  const eigenes = ref => extra.find(a => a.id === ref) || null;
  return {
    ...system, manifest: { ...system.manifest, assets: [...system.manifest.assets, ...extra] }, original: system.original || system,
    asset: ref => eigenes(ref) || system.asset(ref),
    assetUrl: ref => { const a = eigenes(ref); return a ? url(a.key) : system.assetUrl(ref); }
  };
}

/* ---------- Jedes Material bekommt seine Folie ---------- */
const WORT = /[\p{L}\d]{4,}/gu;
const worte = t => new Set((String(t || '').toLowerCase().match(WORT) || []));
const materialWorte = m => worte([m.name.replace(/\.[a-z0-9]+$/i, ''), m.notiz, m.beschreibung, m.kurz, m.tabelle ? m.tabelle.kopf.join(' ') : ''].join(' '));
/* Wo passt eine neue Folie für dieses Material hin? Hinter die Folie, mit der es die meisten Wörter
   teilt; sonst vor die letzte Folie. Nie vor den Titel, nie hinter den Abschluss. */
export function materialPosition(folien, m) {
  const mw = materialWorte(m);
  let best = -1, bestN = 0;
  folien.forEach((f, i) => {
    if (i === folien.length - 1 && folien.length > 1) return;
    const fw = worte(`${f.kernaussage} ${f.inhalt}`);
    const n = [...mw].filter(w => fw.has(w)).length;
    if (n > bestN) { best = i; bestN = n; }
  });
  return best >= 0 ? best + 1 : Math.max(1, folien.length - 1);
}
/* Form für eine eigene Folie: Bild, Tabelle; ein kurzer Text mit Anführungszeichen wird ein Zitat */
export const formFuer = m => m.art === 'bild' ? 'bild' : m.art === 'tabelle' ? 'tabelle' : /[„“”"»«]/.test(m.text || '') && String(m.text || '').length <= 400 ? 'zitat' : 'liste';
const neueFolie = (m, teil, teile) => ({
  abschnitt: '', form: formFuer(m), betont: false,
  kernaussage: kurzText(m.notiz || (m.art === 'bild' ? m.aussage || m.beschreibung : m.art === 'tabelle' ? `Was die Tabelle „${m.name}“ zeigt` : m.kurz) || m.name, 160) + (teile > 1 ? ` (Teil ${teil} von ${teile})` : ''),
  inhalt: `Material ${m.id}`, material: m.id, ...(teile > 1 ? { teil, teile } : {})
});
/* Zahlen einer Tabelle, ohne Tausenderpunkte, mindestens zweistellig */
const zahlenIn = t => (String(t).match(/\d[\d.,]*\d|\d/g) || []).map(z => z.replace(/[.,]/g, '')).filter(z => z.length >= 2);
const tabellenZahlen = t => new Set(zahlenIn([...t.kopf, ...t.zeilen.flat()].join(' ')));
/* Plant die Gliederung schon eine Folie für dieses Material, nur ohne es zu nennen? Eine Bildfolie ohne Bild,
   oder eine Folie, die mindestens zwei Zahlen der Tabelle zeigt. Dann trägt diese Folie das Material,
   statt dass daneben eine zweite Folie mit derselben Aussage entsteht. */
function passendeFolie(folien, m) {
  const n = folien.length, frei = (f, i) => !f.material && !(n >= 3 && (i === 0 || i === n - 1));
  const mw = materialWorte(m), treffer = f => [...mw].filter(w => worte(`${f.kernaussage} ${f.inhalt}`).has(w)).length;
  let kandidaten = [];
  if (m.art === 'bild') kandidaten = folien.map((f, i) => ({ i, f })).filter(({ f, i }) => frei(f, i) && f.form === 'bild');
  if (m.art === 'tabelle') {
    const tz = tabellenZahlen(m.tabelle);
    kandidaten = folien.map((f, i) => ({ i, f, z: zahlenIn(`${f.kernaussage} ${f.inhalt}`).filter(x => tz.has(x)).length }))
      .filter(({ f, i, z }) => frei(f, i) && ['kennzahlen', 'zahl', 'liste', 'vergleich', 'bausteine', 'ablauf'].includes(f.form) && z >= 2);
  }
  kandidaten.sort((a, b) => (b.z || 0) - (a.z || 0) || treffer(b.f) - treffer(a.f) || a.i - b.i);
  return kandidaten.length ? kandidaten[0].i : -1;
}

/* Nach der Gliederung der KI, vor der Layoutwahl:
   - unbekannte Material-IDs fallen weg; ein Bild und eine Tabelle stehen auf genau einer Folie,
   - Folien mit Bild bekommen die Form bild, Folien mit Tabelle die Form tabelle,
   - Titel und Abschluss tragen kein Bild und keine Tabelle,
   - Material ohne Folie bekommt eine eigene Folie an passender Stelle,
   - lange Tabellen gehen über mehrere Folien hintereinander,
   - ohne Fotos im Designsystem gibt es keine Bildfolie ohne Bild der Person,
   - die Form tabelle gibt es nur mit Tabelle.
   opts.eigeneFotos: das Designsystem hat eigene Fotos.
   Liefert { folien, aenderungen }; jede Folie hat danach material (oder nicht) und bild (ob ein Bild darauf darf). */
export function sichereMaterial(folien, materialien = [], opts = {}) {
  const nachId = new Map((materialien || []).filter(m => m && m.status !== 'fehler').map(m => [m.id, m]));
  const aenderungen = [], vergeben = new Set(), n = folien.length;
  let out = folien.map((f, i) => {
    const g = { ...f }, m = g.material && nachId.get(g.material);
    if (g.material && !m) { aenderungen.push(`Gliederung, Folie ${i + 1}: Material „${g.material}“ gibt es nicht.`); delete g.material; }
    else if (m && m.art !== 'text' && (vergeben.has(m.id) || (n >= 3 && (i === 0 || i === n - 1)))) delete g.material;
    else if (m) vergeben.add(m.id);
    delete g.teil; delete g.teile;
    return g;
  });
  /* Texte dürfen mehrfach dienen, Titel und Abschluss inklusive; als „vergeben“ zählt jede Nennung */
  out.forEach(f => { if (f.material) vergeben.add(f.material); });
  /* Fehlendes Material: auf die Folie, die schon davon handelt, sonst eine eigene Folie an passender Stelle */
  for (const m of nachId.values()) {
    if (vergeben.has(m.id)) continue;
    const ziel = passendeFolie(out, m);
    if (ziel >= 0) {
      out[ziel] = { ...out[ziel], material: m.id };
      aenderungen.push(`Gliederung: ${ART_NAME[m.art]} „${m.name}“ steht auf Folie ${ziel + 1}, die schon davon handelt.`);
    } else {
      const pos = materialPosition(out, m);
      out.splice(pos, 0, neueFolie(m, 1, 1));
      aenderungen.push(`Gliederung: Für ${ART_NAME[m.art]} „${m.name}“ war keine Folie geplant. Eine Folie dafür steht jetzt an Position ${pos + 1}.`);
    }
    vergeben.add(m.id);
  }
  /* Formen passend zum Material */
  out = out.map(f => {
    const m = f.material && nachId.get(f.material);
    if (m && m.art === 'bild' && f.form !== 'bild') return { ...f, form: 'bild' };
    if (m && m.art === 'tabelle' && f.form !== 'tabelle') return { ...f, form: 'tabelle' };
    if ((!m || m.art !== 'tabelle') && f.form === 'tabelle') return { ...f, form: 'liste' };
    if ((!m || m.art !== 'bild') && f.form === 'bild' && !opts.eigeneFotos) return { ...f, form: 'kernsatz' };
    return f;
  });
  /* Lange Tabellen: Folgefolien direkt dahinter */
  const mitTeilen = [];
  out.forEach(f => {
    const m = f.material && nachId.get(f.material);
    const teile = m && m.art === 'tabelle' ? tabellenTeile(m.tabelle) : 1;
    if (teile < 2) { mitTeilen.push(f); return; }
    mitTeilen.push({ ...f, teil: 1, teile });
    for (let t = 2; t <= teile; t++) mitTeilen.push({ ...neueFolie(m, t, teile), abschnitt: f.abschnitt, kernaussage: `${f.kernaussage} (Fortsetzung, Teil ${t} von ${teile})` });
    aenderungen.push(`Gliederung: Die Tabelle „${m.name}“ hat ${m.tabelle.zeilen.length} Zeilen und steht auf ${teile} Folien.`);
  });
  return { folien: mitTeilen.map(f => { const m = f.material && nachId.get(f.material); return { ...f, bild: !!(m && m.art === 'bild') || !!opts.eigeneFotos }; }), aenderungen };
}

/* Wo steht welches Material in einer fertigen Präsentation? → { materialId: [Foliennummern] } */
export function materialOrte(spec, materialien = []) {
  const out = {}, nachBild = new Map((materialien || []).map(m => [assetId(m), m.id]));
  ((spec && spec.folien) || []).forEach((f, i) => {
    const ids = new Set();
    if (f.material) ids.add(f.material);
    Object.values(f.inhalt || {}).forEach(v => { if (typeof v === 'string' && nachBild.has(v)) ids.add(nachBild.get(v)); });
    ids.forEach(id => (out[id] = out[id] || []).push(i + 1));
  });
  return out;
}
