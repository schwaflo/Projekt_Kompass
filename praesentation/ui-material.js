/* ============================================================
   Präsentationsgenerator – Material der Person (Oberfläche)
   Ein Feld zum Hineinziehen, Einfügen (⌘V) und Schreiben:
   Bilder, Tabellen und Texte, die unbedingt in die Präsentation
   sollen. Es steht vor dem Briefing, während der Fragen, vor dem
   Schreiben und bei den fertigen Folien.
   Lesen und Zusammenfassen: material.js. Was danach passiert
   (ins Briefing einsortieren, Folie dafür schreiben), entscheidet
   ui.js über kontext.nachMaterial.
   ============================================================ */
/* global S, ui, render, run, save, esc, toast, IDB, readImage */
import * as M from './material.js';
import { textAusDatei } from './richtlinien.js';
import { bildFuerKI } from './assets.js';
import { fuelle } from './pipeline.js';
import { zip } from './ui-systeme.js';

let K = null; /* { Z, ladePrompts, ki, nachMaterial, zeigeFolie } aus ui.js */
export function initMaterial(kontext) { K = kontext; }
const Z = () => K.Z();
const liste = () => { const z = Z(); if (!Array.isArray(z.material)) z.material = []; return z.material; };
const finde = id => liste().find(m => m.id === id);

/* ---------- Bilder im Browser-Speicher ---------- */
ui.matURL = ui.matURL || {};
export const matUrl = key => ui.matURL[key] || null;
const speicherKey = m => M.assetId(m);
export async function ladeMaterialBilder(materialien = liste()) {
  let neu = false;
  for (const m of materialien) if (m && m.art === 'bild' && !ui.matURL[m.key]) { try { const u = await IDB.get(speicherKey(m)); if (u) { ui.matURL[m.key] = u; neu = true; } } catch {} }
  return neu;
}
/* Bilddaten für „Als Datei“: { key: Data-URL } */
export async function bilderVon(materialien = []) {
  const out = {};
  for (const m of materialien) if (m && m.art === 'bild') { const u = ui.matURL[m.key] || await IDB.get(speicherKey(m)).catch(() => null); if (u) out[m.key] = u; }
  return out;
}
export async function legeBilderAb(bilder = {}, materialien = []) {
  for (const m of materialien) if (m && m.art === 'bild' && bilder[m.key]) { ui.matURL[m.key] = bilder[m.key]; try { await IDB.put(speicherKey(m), bilder[m.key]); } catch {} }
}
/* Bilder freigeben, die nichts mehr braucht: weder die aktuelle Präsentation noch eine gespeicherte
   Präsentation noch ein gespeichertes Projekt. Läuft nur, wenn gerade nichts hinzugefügt wird. */
export async function raeumeAuf() {
  if (ui.busy) return;
  try {
    const praes = await IDB.all('praesentationen'), projekte = await IDB.all('projekte');
    const alle = [...liste(), ...praes.flatMap(e => (e.zustand && e.zustand.material) || []), ...projekte.flatMap(p => (p.state && p.state.praes && p.state.praes.material) || [])];
    const gebraucht = new Set(alle.filter(m => m && m.art === 'bild').map(speicherKey));
    const db = await IDB.open();
    const keys = await new Promise(ok => { const q = db.transaction('assets').objectStore('assets').getAllKeys(); q.onsuccess = () => ok(q.result || []); q.onerror = () => ok([]); });
    keys.filter(k => String(k).startsWith('material-') && !gebraucht.has(k)).forEach(k => IDB.del(k));
  } catch { /* Aufräumen ist nur Ordnung, kein Fehler */ }
}

/* ---------- Material lesen ---------- */
const kurzName = t => { const z = String(t).trim().split('\n')[0].trim(); return z.length > 40 ? z.slice(0, 38).replace(/\s+\S*$/, '') + ' …' : z || 'Text'; };
const basis = (art, name) => ({ id: M.neueId(liste()), key: M.neuerKey(), art, name: String(name || M.ART_NAME[art]).slice(0, 80), notiz: '' });
function tabellenMaterial(t, name) {
  const b = M.begrenzeTabelle(t);
  return { ...basis('tabelle', name), tabelle: b.tabelle, ...(b.hinweis ? { hinweis: b.hinweis } : {}) };
}
function textMaterial(text, name) {
  const t = String(text || '').replace(/\r\n?/g, '\n').trim();
  return { ...basis('text', name || kurzName(t)), text: t.slice(0, M.MAX_TEXT), ...(t.length > M.MAX_TEXT ? { hinweis: `Der Text ist sehr lang; behalten werden die ersten ${M.MAX_TEXT.toLocaleString('de-DE')} Zeichen.` } : {}) };
}
/* Foto oder Grafik? Grafiken (Diagramme, Screenshots, Logos) haben wenige Farben, oft eine
   durchgehende Grundfläche oder Transparenz. Das Vision-Modell darf es danach besser wissen. */
function schaetzeBildart(url) {
  return new Promise(ok => {
    const img = new Image();
    img.onerror = () => ok('foto');
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = 48; c.height = Math.max(1, Math.round(48 * (img.naturalHeight || 1) / (img.naturalWidth || 1)));
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
        const d = g.getImageData(0, 0, c.width, c.height).data, farben = new Map();
        let durch = 0;
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) { durch++; continue; } const k = (d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4); farben.set(k, (farben.get(k) || 0) + 1); }
        const n = d.length / 4, haeufigste = Math.max(0, ...farben.values());
        ok(durch / n > 0.08 || farben.size < 90 || haeufigste / n > 0.45 ? 'grafik' : 'foto');
      } catch { ok('foto'); }
    };
    img.src = url;
  });
}
async function bildMaterial(datei) {
  const { url, w, h } = await readImage(datei);
  const m = { ...basis('bild', datei.name || 'Bild'), w, h, bildart: await schaetzeBildart(url) };
  ui.matURL[m.key] = url;
  try { await IDB.put(speicherKey(m), url); } catch { ui.notice = 'Bilder werden nur bis zum Neuladen der Seite behalten, weil der Browser-Speicher nicht verfügbar ist.'; }
  return m;
}
const endung = n => String(n || '').split('.').pop().toLowerCase();
async function ausDatei(datei) {
  const e = endung(datei.name), typ = datei.type || '';
  if (typ.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(e)) return [await bildMaterial(datei)];
  if (e === 'csv' || e === 'tsv') {
    const t = M.leseTabelleText(await datei.text());
    if (!t) throw new Error(`In „${datei.name}“ wurde keine Tabelle gefunden.`);
    return [tabellenMaterial(t, datei.name)];
  }
  if (e === 'xlsx' || e === 'xlsm') {
    const blaetter = await M.leseXlsx(datei, await zip());
    if (!blaetter.length) throw new Error(`In „${datei.name}“ steht keine Tabelle mit mindestens zwei Zeilen und zwei Spalten.`);
    return blaetter.map(b => tabellenMaterial(b, blaetter.length > 1 ? `${datei.name} – ${b.name}` : datei.name));
  }
  if (e === 'xls' || e === 'numbers') throw new Error(`„${datei.name}“ kann der Browser nicht lesen. Speichere die Tabelle als .xlsx oder .csv, oder kopiere sie und füge sie hier mit ⌘V ein.`);
  if (e === 'pdf') throw new Error(`PDF-Dateien kann der Browser hier nicht lesen. Kopiere Text oder Tabelle aus der PDF und füge sie hier ein, oder speichere die Datei als Word-Dokument.`);
  if (['txt', 'md', 'markdown', 'docx', 'pptx', 'potx'].includes(e)) {
    if (e === 'txt') { const roh = await datei.text(); const t = roh.includes('\t') ? M.leseTabelleText(roh) : null; if (t) return [tabellenMaterial(t, datei.name)]; }
    const r = await textAusDatei(datei, await zip());
    const text = r.abschnitte.map(a => r.abschnitte.length > 1 && !a.text.startsWith(a.titel) ? `${a.titel}\n${a.text}` : a.text).join('\n\n');
    if (!text.trim()) throw new Error(`In „${datei.name}“ steht kein Text.`);
    return [textMaterial(text, datei.name)];
  }
  throw new Error(`„${datei.name}“ wird nicht unterstützt. Möglich sind Bilder, Tabellen (.xlsx, .csv) und Texte (.docx, .pptx, .txt, .md).`);
}

/* ---------- Material verstehen (KI) ---------- */
const BILD_SCHEMA = { type: 'object', properties: { beschreibung: { type: 'string' }, bildart: { type: 'string', enum: ['foto', 'grafik'] }, aussage: { type: 'string' }, text_im_bild: { type: 'string' } }, required: ['beschreibung', 'bildart', 'aussage', 'text_im_bild'] };
const TEXT_SCHEMA = { type: 'object', properties: { kurz: { type: 'string' }, fakten: { type: 'array', items: { type: 'string' }, maxItems: 8 } }, required: ['kurz', 'fakten'] };
const OHNE_BILDMODELL = 'Keines deiner Modelle versteht Bilder. Schreib in den Hinweis, was das Bild zeigt, damit der Text auf der Folie dazu passt.';
async function verstehe(m) {
  const prompts = await K.ladePrompts(), ki = K.ki(), system = fuelle(prompts['system-briefing']);
  if (m.art === 'bild') {
    await window.KompassKI.ladeModellInfo();
    const modell = window.KompassKI.bildModell();
    if (!modell) { m.hinweis = OHNE_BILDMODELL; return; }
    ui.busyText = `„${m.name}“ wird angesehen`;
    const r = await ki.frage({ art: 'praes_material_bild', system, schema: BILD_SCHEMA, prompt: fuelle(prompts['material-bild'], { datei: m.name, notiz: m.notiz || '(keiner)' }), bilder: [await bildFuerKI(ui.matURL[m.key], 768)], modell, denken: false });
    m.beschreibung = String(r.beschreibung || '').trim();
    if (['foto', 'grafik'].includes(r.bildart)) m.bildart = r.bildart;
    m.aussage = String(r.aussage || '').trim();
    m.textImBild = String(r.text_im_bild || '').trim().slice(0, 300);
    delete m.hinweis;
  } else if (m.art === 'text' && m.text.length > 1500) {
    ui.busyText = `„${m.name}“ wird zusammengefasst`;
    const r = await ki.frage({ art: 'praes_material_text', system, schema: TEXT_SCHEMA, prompt: fuelle(prompts['material-text'], { name: m.name, notiz: m.notiz || '(keiner)', text: m.text.slice(0, 7000) }) });
    m.kurz = String(r.kurz || '').trim();
    m.fakten = (Array.isArray(r.fakten) ? r.fakten : []).map(x => String(x).trim()).filter(Boolean).slice(0, 8);
  }
}

/* quellen: [{ datei } | { text, name } | { tabelle, name }] */
export function fuegeHinzu(quellen) {
  if (ui.busy || !quellen.length) return;
  run('Material wird gelesen …', async () => {
    const neue = [], fehler = [];
    for (const q of quellen) {
      try {
        const ms = q.datei ? await ausDatei(q.datei) : q.tabelle ? [tabellenMaterial(q.tabelle, q.name || 'Eingefügte Tabelle')] : [textMaterial(q.text, q.name)];
        ms.forEach(m => { liste().push(m); neue.push(m); });
        save();
      } catch (e) { fehler.push(e.message); }
    }
    if (!neue.length) throw new Error(fehler.join(' '));
    for (const m of neue) {
      try { await verstehe(m); }
      catch (e) { m.hinweis = `Die KI konnte „${m.name}“ nicht lesen (${e.message.replace(/\.$/, '')}). Es kommt trotzdem in die Präsentation.`; }
      save();
    }
    if (K.nachMaterial) await K.nachMaterial(neue);
    toast(neue.length === 1 ? `${M.ART_NAME[neue[0].art]} „${neue[0].name}“ ist dabei` : `${neue.length} Materialien sind dabei`);
    if (fehler.length) ui.error = fehler.join(' ');
  });
}

/* ---------- Ansicht ---------- */
const HINWEIS = {
  start: 'Bilder, Tabellen und Texte, die sicher in die Präsentation sollen. Die KI kennt sie schon bei der ersten Frage.',
  briefing: 'Fällt dir beim Antworten etwas ein, leg es hier ab. Die nächste Frage greift es auf, und jedes Stück bekommt in der Präsentation seinen Platz.',
  system: 'Jedes Bild und jede Tabelle bekommt beim Schreiben eine eigene Folie, Texte fließen in die Folien ein, zu denen sie passen.',
  vorschau: 'Neues Material bekommt sofort eine eigene Folie an passender Stelle.'
};
const PLATZ = { bild: 'Hinweis (optional): wofür steht das Bild?', tabelle: 'Hinweis (optional): was soll die Tabelle zeigen?', text: 'Hinweis (optional): wohin gehört der Text?' };
const spaltenZahl = t => Math.max(t.kopf.length, ...t.zeilen.map(z => z.length));
function miniTabelle(t) {
  const n = Math.min(4, spaltenZahl(t)), z = (r, tag) => `<tr>${Array.from({ length: n }, (_, j) => `<${tag}>${esc(r[j] || '')}</${tag}>`).join('')}</tr>`;
  return `<table class="pm-mini">${t.kopf.length ? z(t.kopf, 'th') : ''}${t.zeilen.slice(0, 3).map(r => z(r, 'td')).join('')}</table>`;
}
function eintrag(m, orte, ort) {
  const wo = orte[m.id], kurz = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + ' …' : s; };
  const bild = m.art === 'bild' ? (ui.matURL[m.key] ? `<img src="${ui.matURL[m.key]}" alt="">` : '<span>Bild</span>') : m.art === 'tabelle' ? miniTabelle(m.tabelle) : '<span class="pm-absatz" aria-hidden="true">¶</span>';
  const info = m.art === 'bild' ? (m.beschreibung || (m.hinweis ? '' : 'Noch ohne Beschreibung'))
    : m.art === 'tabelle' ? `${spaltenZahl(m.tabelle)} Spalten × ${m.tabelle.zeilen.length} Zeilen${M.tabellenTeile(m.tabelle) > 1 ? ` · auf ${M.tabellenTeile(m.tabelle)} Folien` : ''}`
    : kurz(m.kurz || m.text, 180);
  const art = m.art === 'bild' ? (m.bildart === 'grafik' ? 'Grafik' : 'Foto') : M.ART_NAME[m.art];
  return `<div class="pm-item">
    <div class="pm-bild pm-${m.art}">${bild}</div>
    <div class="pm-text">
      <div class="pm-zeile"><span class="pm-art">${m.id} · ${art}</span><b>${esc(m.name)}</b></div>
      ${info ? `<span class="pm-info">${esc(info)}</span>` : ''}
      ${m.hinweis ? `<span class="pm-hinweis">${esc(m.hinweis)}</span>` : ''}
      <input class="pm-notiz" data-pmnotiz="${m.id}" value="${esc(m.notiz || '')}" placeholder="${PLATZ[m.art]}" aria-label="Hinweis zu ${esc(m.name)}">
      ${m.art === 'bild' ? `<div class="pm-seg" role="group" aria-label="Darstellung auf der Folie"><button data-pmbildart="${m.id}" data-v="foto" aria-pressed="${m.bildart !== 'grafik'}">Füllend</button><button data-pmbildart="${m.id}" data-v="grafik" aria-pressed="${m.bildart === 'grafik'}">Ganz zeigen</button></div>` : ''}
    </div>
    <div class="pm-tools">
      ${wo ? `<button class="pm-ort" data-pm="zeige" data-id="${m.id}" title="Zur Folie">Folie ${wo.join(', ')}</button>`
        : ort === 'vorschau' ? `<button class="btn tiny" data-pm="einbauen" data-id="${m.id}" ${ui.busy ? 'disabled' : ''}>Folie einfügen</button>` : ''}
      ${wo ? '' : `<button class="pm-weg" data-pm="weg" data-id="${m.id}" aria-label="${esc(m.name)} entfernen" title="Entfernen">×</button>`}
    </div>
  </div>`;
}
/* Das Feld. ort: start | briefing | system | vorschau */
export function materialFeld(ort) {
  const l = liste(), orte = ort === 'vorschau' ? M.materialOrte(Z().spec, l) : {};
  const offen = l.filter(m => !orte[m.id]).length;
  return `<section class="pm pm-${ort}" aria-label="Material">
    <div class="pm-kopf"><h3>Material, das hinein muss</h3><span class="small muted">${l.length ? `${l.length} ${l.length === 1 ? 'Stück' : 'Stücke'}${ort === 'vorschau' && offen ? `, ${offen} noch ohne Folie` : ''}` : 'optional'}</span></div>
    <p class="pm-lead">${HINWEIS[ort]}</p>
    <div class="pm-drop" id="pm-drop">
      <b>Hierher ziehen oder mit ⌘V einfügen</b>
      <span>Fotos, Grafiken, Tabellen aus Excel oder Numbers, Word- und PowerPoint-Dateien · <label class="linkbtn">Dateien wählen<input type="file" id="pm-datei" multiple hidden accept="image/*,.csv,.tsv,.txt,.md,.xlsx,.xlsm,.docx,.pptx"></label></span>
    </div>
    <div class="pm-eingabe"><textarea id="pm-text" rows="2" placeholder="Oder Text hineinschreiben, der vorkommen muss: Zahlen, Namen, ein Zitat, eine Liste …"></textarea><button class="btn tiny" data-pm="text" ${ui.busy ? 'disabled' : ''}>Hinzufügen</button></div>
    ${l.length ? `<div class="pm-liste">${l.map(m => eintrag(m, orte, ort)).join('')}</div>` : ''}
  </section>`;
}

/* ---------- Ereignisse ---------- */
/* true, wenn das Ereignis zum Materialfeld gehörte */
export function klickMaterial(e) {
  const b = e.target.closest('[data-pm],[data-pmbildart]');
  if (!b || b.disabled || !b.closest('.pm')) return false;
  const d = b.dataset;
  if (d.pmbildart) { const m = finde(d.pmbildart); if (m) { m.bildart = d.v; save(); render(); } return true; }
  if (d.pm === 'text') {
    const t = document.getElementById('pm-text'), v = (t && t.value || '').trim();
    if (!v) { if (t) t.focus(); return true; }
    const tab = v.includes('\t') ? M.leseTabelleText(v) : null;
    t.value = '';
    fuegeHinzu([tab ? { tabelle: tab, name: 'Eingefügte Tabelle' } : { text: v }]);
    return true;
  }
  if (d.pm === 'weg') {
    const l = liste(), i = l.findIndex(m => m.id === d.id);
    if (i >= 0) { l.splice(i, 1); save(); render(); }
    return true;
  }
  if (d.pm === 'zeige') { if (K.zeigeFolie) K.zeigeFolie(d.id); return true; }
  if (d.pm === 'einbauen') { const m = finde(d.id); if (m && K.nachMaterial && !ui.busy) run(`Folie für „${m.name}“ wird geschrieben …`, () => K.nachMaterial([m])); return true; }
  return false;
}
export function eingabeMaterial(e) {
  const t = e.target;
  if (!t.dataset || !t.dataset.pmnotiz) return false;
  const m = finde(t.dataset.pmnotiz);
  if (m) { m.notiz = t.value; save(); }
  return true;
}
export function wechselMaterial(e) {
  const t = e.target;
  if (t.id !== 'pm-datei') return false;
  const dateien = [...(t.files || [])];
  t.value = '';
  if (dateien.length) fuegeHinzu(dateien.map(datei => ({ datei })));
  return true;
}
export function tasteMaterial(e) {
  if (e.target.id !== 'pm-text' || e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return false;
  e.preventDefault();
  const b = document.querySelector('[data-pm="text"]'); if (b) b.click();
  return true;
}
/* Ziehen und Ablegen auf das Feld */
export function dragMaterial(e) {
  const zone = e.target.closest && e.target.closest('.pm');
  if (!zone) return false;
  const drop = zone.querySelector('.pm-drop');
  if (e.type === 'dragover') { e.preventDefault(); if (drop) drop.classList.add('ueber'); return true; }
  if (e.type === 'dragleave') { if (drop && !zone.contains(e.relatedTarget)) drop.classList.remove('ueber'); return true; }
  if (e.type === 'drop') {
    e.preventDefault(); if (drop) drop.classList.remove('ueber');
    const dateien = [...((e.dataTransfer && e.dataTransfer.files) || [])];
    if (dateien.length) fuegeHinzu(dateien.map(datei => ({ datei })));
    else { const text = e.dataTransfer && e.dataTransfer.getData('text/plain'); if (text && text.trim()) fuegeHinzu([text.includes('\t') && M.leseTabelleText(text) ? { tabelle: M.leseTabelleText(text) } : { text }]); }
    return true;
  }
  return false;
}
/* Einfügen (⌘V): Bilder und Tabellen werden überall zu Material, außer beim Bearbeiten der Folien.
   Reiner Text landet im Materialfeld als Text, in anderen Eingabefeldern ganz normal im Feld. */
export function einfuegenMaterial(e, schritt) {
  if (ui.busy || !['start', 'briefing', 'system', 'vorschau'].includes(schritt)) return;
  const t = e.target, el = t && t.closest ? t : null;
  if (el && el.closest('#pr-stage, .pr-panel, .pr-leiste')) return;
  const imFeld = !!(el && el.closest('#pm-text')), anderesFeld = !imFeld && !!(el && el.closest('input, textarea, select, [contenteditable="true"]'));
  const cd = e.clipboardData;
  if (!cd) return;
  const dateien = [...(cd.files || [])].filter(f => /^image\//.test(f.type) || /\.(xlsx|xlsm|csv|tsv|docx|pptx|txt|md)$/i.test(f.name));
  if (dateien.length) { e.preventDefault(); fuegeHinzu(dateien.map(datei => ({ datei }))); return; }
  const html = cd.getData('text/html'), text = cd.getData('text/plain');
  const tab = (html && M.leseTabelleHtml(html)) || (text && text.includes('\t') && !anderesFeld ? M.leseTabelleText(text) : null);
  if (tab) { e.preventDefault(); fuegeHinzu([{ tabelle: tab, name: 'Eingefügte Tabelle' }]); return; }
  if (!imFeld && !anderesFeld && text && text.trim().length > 20) { e.preventDefault(); fuegeHinzu([{ text }]); }
}

export const MATERIAL_CSS = `
.pm{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-l);padding:16px 18px;margin:16px 0}
.pm-kopf{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.pm-kopf h3{font-size:1.02rem;margin:0}
.pm-lead{font-size:.86rem;color:var(--muted);margin:4px 0 12px;max-width:70ch}
.pm-drop{display:flex;flex-direction:column;gap:3px;align-items:center;text-align:center;border:2px dashed var(--line);border-radius:var(--radius-m);padding:14px 12px;font-size:.84rem;color:var(--muted);transition:border-color .15s,background .15s}
.pm-drop b{color:var(--ink);font-size:.92rem}
.pm-drop.ueber{border-color:var(--accent);background:var(--accent-soft)}
.pm-eingabe{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;margin-top:10px}
.pm-eingabe textarea{width:100%;border:1px solid var(--line);border-radius:var(--radius-s);padding:8px 10px;background:var(--surface-2);font:inherit;font-size:.88rem;resize:vertical;color:var(--ink)}
.pm-liste{display:flex;flex-direction:column;margin-top:12px;border-top:1px solid var(--line)}
.pm-item{display:grid;grid-template-columns:88px minmax(0,1fr) auto;gap:12px;align-items:start;padding:12px 0;border-bottom:1px solid var(--line)}
.pm-item:last-child{border-bottom:0}
.pm-bild{width:88px;height:62px;border-radius:6px;background:var(--surface-2);border:1px solid var(--line);overflow:hidden;display:grid;place-items:center;color:var(--muted);font-size:.75rem}
.pm-bild img{width:100%;height:100%;object-fit:cover;display:block}
.pm-bild.pm-tabelle{place-items:start;padding:4px;background:var(--surface)}
.pm-absatz{font-size:1.6rem;line-height:1;color:var(--muted)}
.pm-mini{border-collapse:collapse;width:100%;table-layout:fixed;font-size:7px;line-height:1.25;color:var(--ink)}
.pm-mini th,.pm-mini td{padding:1px 2px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid var(--line)}
.pm-mini th{font-weight:700;border-bottom-color:var(--ink)}
.pm-text{display:flex;flex-direction:column;gap:4px;min-width:0}
.pm-zeile{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.pm-zeile b{font-size:.92rem;overflow-wrap:anywhere}
.pm-art{font-size:.72rem;font-weight:600;letter-spacing:.02em;color:var(--accent);text-transform:uppercase}
.pm-info{font-size:.84rem;color:var(--muted)}
.pm-hinweis{font-size:.8rem;color:var(--assume);background:var(--assume-bg);border-radius:var(--radius-s);padding:3px 8px}
.pm-notiz{width:100%;border:1px solid var(--line);border-radius:var(--radius-s);padding:5px 8px;background:var(--surface-2);font:inherit;font-size:.82rem;color:var(--ink)}
.pm-seg{display:inline-flex;align-self:flex-start;border:1px solid var(--line);border-radius:999px;padding:2px;margin-top:2px}
.pm-seg button{border:0;background:none;border-radius:999px;padding:2px 10px;font-size:.74rem;color:var(--muted)}
.pm-seg button[aria-pressed="true"]{background:var(--accent-soft);color:var(--accent);font-weight:600}
.pm-tools{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.pm-weg{border:0;background:none;color:var(--muted);font-size:1.25rem;line-height:1;padding:0 4px;border-radius:6px}
.pm-weg:hover{color:var(--review);background:var(--review-bg)}
.pm-ort{border:1px solid var(--accent);background:var(--accent-soft);color:var(--accent);border-radius:999px;padding:2px 10px;font-size:.76rem;font-weight:600;white-space:nowrap}
.pm-start{margin:4px 0 16px}
.pm-vorschau{margin:0 0 14px}
.pm-teditor{display:flex;flex-direction:column;gap:3px;overflow:auto;max-height:280px}
.pm-tz{display:grid;grid-template-columns:repeat(var(--n),minmax(70px,1fr));gap:3px}
.pm-tz .input{padding:4px 6px;font-size:.8rem;min-width:0;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius-s)}
@media (max-width:760px){.pm-item{grid-template-columns:64px minmax(0,1fr)}.pm-bild{width:64px;height:48px}.pm-tools{grid-column:1 / -1;flex-direction:row;justify-content:flex-end}}
`;
