/* ============================================================
   Präsentationsgenerator – Oberfläche
   Hängt sich als Bildschirm „praes“ in die App aus index.html ein
   und nutzt deren Bausteine: Zustand S, run(), render(), die
   Live-Ansicht der KI und die vorhandenen Stile.
   Schritte: start → briefing → system → vorschau
   ============================================================ */
/* global S, ui, render, run, save, esc, toast, akte, errorBox, liveInner, statLine, hasProject, doPrint, slug, STATUS_TEXT */
import { createRegistry } from './registry.js';
import * as P from './pipeline.js';
import { validateSpec, kuerzeSpec, remapSpec, inhaltsPlatzhalter, SPEC_VERSION } from './spec.js';
import { buildSlides } from './layout.js';
import { slideHTML, FOLIEN_CSS, fontUrl } from './render-html.js';
import { exportPptx } from './render-pptx.js';
import { ladeBild } from './bilder.js';

const reg = createRegistry();
let bereit = false, prompts = null;
const lese = async p => { try { const r = await fetch(p, { cache: 'no-cache' }); return r.ok ? await r.text() : null; } catch { return null; } };
const ladePrompts = async () => (prompts = prompts || await P.ladePrompts(lese));
const ki = () => window.KompassKI;

/* ---------- Zustand (liegt in S.praes und wird mit dem Projekt gespeichert) ---------- */
const neu = () => ({ schritt: 'start', beschreibung: '', mitProjekt: true, B: null, briefing: null, systemId: '', vorschlag: null, spec: null, protokoll: [], pruefen: [], schrift: 'system', auswahl: 0, zurueck: 'start' });
const Z = () => { if (!S.praes) S.praes = neu(); return S.praes; };
const system = () => reg.get(Z().systemId) || reg.list()[0] || null;
const folie = () => { const z = Z(); z.auswahl = Math.max(0, Math.min(z.auswahl || 0, z.spec.folien.length - 1)); return z.spec.folien[z.auswahl]; };
const modell = () => buildSlides(Z().spec, system(), { schrift: Z().schrift });

function open() {
  const z = Z();
  if (S.screen !== 'praes') z.zurueck = S.screen;
  S.screen = 'praes'; ui.error = null; save(); render(); window.scrollTo({ top: 0 });
}
function close() { const z = Z(); S.screen = z.zurueck && z.zurueck !== 'praes' ? z.zurueck : 'start'; ui.error = null; save(); render(); window.scrollTo({ top: 0 }); }
function geh(schritt) { Z().schritt = schritt; ui.error = null; ui.praesEdit = null; save(); render(); window.scrollTo({ top: 0 }); }

/* ============================================================
   Aktionen
   ============================================================ */
function starte() {
  const z = Z(), t = (document.getElementById('pr-desc') || {}).value || '';
  z.beschreibung = t.trim();
  const mitProjekt = z.mitProjekt && hasProject();
  if (z.beschreibung.length < 10 && !mitProjekt) { ui.error = 'Beschreibe in ein, zwei Sätzen, worum es in der Präsentation geht.'; return render(); }
  run('Briefing wird vorbereitet …', async () => {
    await ladePrompts();
    const B = P.neuesBriefing(z.beschreibung || `Präsentation zum Projekt „${S.titel}“`);
    const e = S.ergebnis, projekt = mitProjekt ? akte() + (e ? '\nSTECKBRIEF: ' + JSON.stringify({ kurzbeschreibung: e.kurzbeschreibung, ziel: e.ziel_in_einem_satz, zielgruppe: e.zielgruppe_kurz, kernbotschaft: e.kernbotschaft, naechste_schritte: e.naechste_schritte, risiken: e.risiken }) : '') : '';
    await P.briefingStart(ki(), prompts, B, projekt);
    z.B = B; z.briefing = null; z.schritt = 'briefing';
  });
}

function antworte(text, annahme) {
  const z = Z(), a = (text ?? (document.getElementById('pr-answer') || {}).value ?? '').trim();
  if (!a || !z.B || !z.B.aktuell) return;
  ui.notice = null;
  run('Antwort wird einsortiert …', async () => { await ladePrompts(); await P.briefingAntwort(ki(), prompts, z.B, a, { annahme }); });
}

function briefingWeiter() {
  const z = Z(), r = P.briefingFertig(z.B);
  if (!r.ok) { ui.error = r.errors.join(' '); return render(); }
  z.briefing = r.briefing; z.schritt = 'system'; ui.error = null; save(); render(); window.scrollTo({ top: 0 });
  if (!z.vorschlag && reg.list().length > 1) run('Passendes Designsystem wird gesucht …', async () => {
    await ladePrompts();
    z.vorschlag = await P.schlageDesignsystemVor(ki(), prompts, z.briefing, reg.list());
    if (!z.systemId) z.systemId = z.vorschlag.systemId;
  });
}

function erstelle() {
  const z = Z(), sys = system();
  if (!sys) { ui.error = 'Es ist kein Designsystem vorhanden.'; return render(); }
  z.systemId = sys.id;
  run('Präsentation wird geschrieben …', async () => {
    await ladePrompts();
    const r = await P.erstellePraesentation(ki(), prompts, z.briefing, sys, { fortschritt: s => { ui.praesFortschritt = s.schritt === 'outline' ? 'Gliederung wird erstellt' : `Folie ${s.nr} von ${s.anzahl} wird geschrieben`; const el = document.getElementById('pr-fort'); if (el) el.textContent = ui.praesFortschritt; } });
    r.spec.folien.forEach((f, i) => { f.kernaussage = r.outline.folien[i].kernaussage; });
    Object.assign(z, { spec: r.spec, protokoll: r.protokoll, pruefen: r.pruefen, auswahl: 0, schritt: 'vorschau' });
    ui.praesFortschritt = '';
  });
}

async function beispiel() {
  const z = Z(), roh = await lese('examples/demo.slides.json');
  if (!roh) { ui.error = 'Die Beispielpräsentation konnte nicht geladen werden.'; return render(); }
  Object.assign(z, { spec: JSON.parse(roh), systemId: reg.get('demo-corporate') ? 'demo-corporate' : (reg.list()[0] || {}).id, protokoll: [], pruefen: [], auswahl: 0, schritt: 'vorschau' });
  ui.error = null; save(); render();
}

function schreibeNeu() {
  const z = Z(), sys = system(), i = z.auswahl, f = folie(), wunsch = ((document.getElementById('pr-wunsch') || {}).value || '').trim();
  run(`Folie ${i + 1} wird neu geschrieben …`, async () => {
    await ladePrompts();
    const titelVon = x => x.kernaussage || Object.values(x.inhalt).find(v => typeof v === 'string') || '';
    const outline = { titel: z.spec.titel, folien: z.spec.folien.map(x => ({ layoutId: (sys.layout(x.layoutId) || sys.layoutForTyp('content-bullets')).id, kernaussage: titelVon(x), inhalt: '' })) };
    const r = await P.erstelleFolie(ki(), prompts, { briefing: z.briefing || { thema: z.spec.titel }, outline, index: i, system: sys }, { bisher: f.inhalt, wunsch });
    z.spec.folien[i] = { ...r.folie, kernaussage: f.kernaussage };
    const nr = new RegExp(`^Folie ${i + 1}[,:]`);
    z.protokoll = [...z.protokoll.filter(t => !nr.test(t)), ...r.aenderungen];
    z.pruefen = [...z.pruefen.filter(t => !nr.test(t)), ...r.pruefen];
  });
}

function wechsleSystem(id) {
  const z = Z(), alt = system(), neuS = reg.get(id);
  if (!neuS || !z.spec) return;
  z.spec = remapSpec(z.spec, alt, neuS); z.systemId = id; save(); render();
}

function folienAktion(a) {
  const z = Z(), fl = z.spec.folien, i = z.auswahl;
  if (a === 'hoch' && i > 0) { [fl[i - 1], fl[i]] = [fl[i], fl[i - 1]]; z.auswahl--; }
  else if (a === 'runter' && i < fl.length - 1) { [fl[i + 1], fl[i]] = [fl[i], fl[i + 1]]; z.auswahl++; }
  else if (a === 'weg' && fl.length > 1 && confirm(`Folie ${i + 1} löschen?`)) { fl.splice(i, 1); z.protokoll = []; z.pruefen = []; }
  else if (a === 'dazu') {
    /* neue Folie mit markierten Lücken, damit sie sofort gültig ist */
    const l = system().layoutForTyp('content-bullets');
    fl.splice(i + 1, 0, kuerzeSpec({ titel: 'x', folien: [{ layoutId: l.id, inhalt: {} }] }, system()).spec.folien[0]); z.auswahl = i + 1;
  }
  save(); render();
}

async function speicherePptx() {
  const z = Z(), sys = system();
  ui.praesExport = true; render();
  try {
    if (!window.PptxGenJS) await new Promise((ok, fehler) => { const s = document.createElement('script'); s.src = 'vendor/pptxgen.bundle.js'; s.onload = ok; s.onerror = () => fehler(new Error('vendor/pptxgen.bundle.js konnte nicht geladen werden.')); document.head.appendChild(s); });
    const pptx = await exportPptx(modell(), { PptxGenJS: window.PptxGenJS, ladeBild, titel: z.spec.titel, autor: sys.meta.name });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await pptx.write({ outputType: 'blob' })), download: (slug(z.spec.titel) || 'praesentation') + '.pptx' });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('PowerPoint-Datei gespeichert');
  } catch (e) { ui.error = 'Die PowerPoint-Datei konnte nicht erstellt werden: ' + e.message; console.error(e); }
  ui.praesExport = false; render();
}

function drucke() {
  doPrint(modell().map(f => `<div class="pr-seite">${slideHTML(f)}</div>`).join(''), 'size: 338.67mm 190.5mm; margin: 0', 'pr-print');
}

/* ---------- Inhalte bearbeiten ---------- */
/* Wert eines Feldes setzen. pfad = { ph, index, feld } */
function setze(pfad, wert) {
  const f = folie(), ph = (system().layout(f.layoutId) || { placeholders: [] }).placeholders.find(p => p.id === pfad.ph);
  if (!ph) return;
  if (ph.typ === 'text') { if (wert) f.inhalt[ph.id] = wert; else delete f.inhalt[ph.id]; }
  else if (ph.typ === 'bullets') { const l = String(wert).split(/\n+/).map(x => x.trim()).filter(Boolean); if (l.length) f.inhalt[ph.id] = l; else delete f.inhalt[ph.id]; }
  else if (ph.typ === 'image') { if (wert) f.inhalt[ph.id] = wert; else delete f.inhalt[ph.id]; }
  else if (ph.typ === 'items') {
    const l = Array.isArray(f.inhalt[ph.id]) ? f.inhalt[ph.id] : (f.inhalt[ph.id] = []);
    while (l.length <= pfad.index) l.push({});
    if (wert) l[pfad.index][pfad.feld] = wert; else delete l[pfad.index][pfad.feld];
  }
  save();
}
/* Nach einer Eingabe nur Folie, Miniatur und Hinweise neu zeichnen, damit der Cursor bleibt */
function zeichneFolie(ohneBuehne) {
  const z = Z(), m = modell(), f = m[z.auswahl];
  const st = document.getElementById('pr-stage'); if (st && !ohneBuehne) st.innerHTML = buehne(f);
  const th = document.querySelector(`.pr-thumb[data-i="${z.auswahl}"] .pr-thumb-f`); if (th) th.innerHTML = slideHTML(f);
  const h = document.getElementById('pr-hinweise'); if (h) h.innerHTML = hinweise(m);
  document.querySelectorAll('[data-zaehler]').forEach(el => { const t = document.querySelector(`[data-prf="${el.dataset.zaehler}"]`); if (t) zaehler(el, t); });
}
function zaehler(el, t) {
  const max = +t.dataset.max, n = t.dataset.typ === 'bullets' ? t.value.split(/\n+/).filter(x => x.trim()).length : [...t.value].length;
  el.textContent = `${n}/${max}`; el.classList.toggle('zuviel', n > max);
}

/* ============================================================
   Ansichten
   ============================================================ */
const kopf = (titel, text) => `<div class="pr-kopf"><div><h1>${titel}</h1>${text ? `<p class="lead">${text}</p>` : ''}</div><button class="btn ghost" data-pr="zu">Schließen</button></div>`;
const live = () => ui.busy ? `<div class="live" id="live">${liveInner()}</div>` : '';
const SCHRITTE = [['start', 'Thema'], ['briefing', 'Briefing'], ['system', 'Designsystem'], ['vorschau', 'Folien']];
function pfad() {
  const z = Z(), erreichbar = { start: true, briefing: !!z.B, system: !!z.briefing, vorschau: !!z.spec };
  return `<nav class="pr-pfad" aria-label="Schritte">${SCHRITTE.map(([id, name], i) => `<button data-pr="geh" data-s="${id}" ${erreichbar[id] && !ui.busy ? '' : 'disabled'} aria-current="${z.schritt === id ? 'step' : 'false'}"><b>${i + 1}</b> ${name}</button>`).join('')}</nav>`;
}

function viewStart() {
  const z = Z(), proj = hasProject();
  return `${kopf('Präsentation erstellen', 'Der Kompass klärt mit dir in ein paar Fragen, was die Präsentation leisten soll, und schreibt dann die Folien. Das Aussehen kommt aus einem Designsystem.')}
  ${pfad()}
  <section class="pr-start">
    <div class="qcard">
      ${errorBox()}
      <label class="fieldlabel" for="pr-desc">Worum geht es in der Präsentation?</label>
      <textarea class="bigtext" id="pr-desc" placeholder="Zum Beispiel: Ich stelle dem Vorstand in zehn Minuten vor, warum wir ein neues Kundenportal brauchen.">${esc(z.beschreibung)}</textarea>
      ${proj ? `<label class="row small" style="margin:14px 0 0;gap:10px;align-items:flex-start"><input type="checkbox" id="pr-proj" ${z.mitProjekt ? 'checked' : ''} style="margin-top:4px"><span>Projekt „${esc(S.titel || 'Ohne Titel')}“ als Grundlage nehmen<br><span class="muted">Was in der Projektanalyse schon steht, wird übernommen. Gefragt wird nur, was noch fehlt.</span></span></label>` : ''}
      <div class="actions"><button class="btn primary" data-pr="start" ${ui.busy ? 'disabled' : ''}>Briefing starten</button>
        ${z.B ? '<button class="btn" data-pr="geh" data-s="briefing">Briefing fortsetzen</button>' : ''}
        ${z.spec ? '<button class="btn" data-pr="geh" data-s="vorschau">Zu den Folien</button>' : ''}
        <span class="spacer"></span><button class="btn ghost" data-pr="beispiel" ${bereit ? '' : 'disabled'}>Beispiel ansehen, ohne KI</button></div>
      ${live()}${!ui.busy && ui.error ? statLine() : ''}
    </div>
    <aside class="panel"><h3>So läuft es ab</h3>
      <ol class="pr-ablauf"><li><b>Briefing.</b> Ziel, Zielgruppe, Kernbotschaft, Umfang.</li><li><b>Designsystem.</b> Du wählst eines, oder der Kompass schlägt eines vor.</li><li><b>Folien.</b> Die KI schreibt Gliederung und Texte. Layout, Farben und Schriften kommen aus dem Designsystem.</li><li><b>Bearbeiten und speichern.</b> Texte ändern, Folien neu schreiben lassen, als PowerPoint speichern.</li></ol>
      <p class="small muted" style="margin:10px 0 0">${bereit ? `${reg.list().length} Designsysteme gefunden: ${reg.list().map(s => esc(s.meta.name)).join(', ')}.` : 'Designsysteme werden geladen …'}</p>
      ${reg.problems().map(p => `<div class="notice" style="margin-top:10px"><b>${esc(p.ordner || p.id)}</b> konnte nicht geladen werden: ${esc(p.errors[0])}${p.errors.length > 1 ? ` (und ${p.errors.length - 1} weitere)` : ''}</div>`).join('')}
    </aside>
  </section>`;
}

function viewBriefing() {
  const z = Z(), B = z.B, a = B.aktuell, f = a && B.felder.find(x => x.id === a.feld), fertig = P.briefingFertig(B);
  const fehlt = B.felder.filter(x => x.kern && (!x.wert || x.status === 'uebersprungen')).map(x => esc(x.label)).join(', ');
  const frage = ui.busy ? `<div class="qcard">${live()}</div>` : !a ? `<div class="qcard done">
      <h2>${fertig.ok ? 'Das Briefing ist vollständig.' : 'Fast fertig.'}</h2>
      <p class="muted">${fertig.ok ? 'Rechts kannst du jeden Eintrag noch ändern. Annahmen der KI sind markiert.' : `Es fehlt noch: ${fehlt}. Trage es rechts über „Selbst eintragen“ ein.`}</p>
      <div class="actions"><button class="btn primary" data-pr="weiter" ${fertig.ok ? '' : 'disabled'}>Weiter zum Designsystem</button></div></div>` : `<div class="qcard">
      <div class="qmeta"><span class="tag">Briefing · ${esc(f ? f.label : '')}</span>${a.nachfrage ? '<span class="tag follow">Nachfrage</span>' : ''}</div>
      <p class="question">${esc(a.frage)}</p>
      ${a.vorschlaege.length ? `<div class="chips">${a.vorschlaege.map((v, i) => `<button class="chip" data-pr="chip" data-i="${i}">${esc(v)}</button>`).join('')}</div>` : ''}
      <label class="small muted" for="pr-answer">Deine Antwort (Vorschlag anklicken, anpassen oder frei schreiben)</label>
      <textarea class="answer" id="pr-answer" placeholder="Antwort eingeben …"></textarea>
      <div class="actions">
        <button class="btn primary" data-pr="send">Antworten</button>
        <button class="btn" data-pr="unknown">Weiß ich nicht, nimm etwas an</button>
        ${f && !f.kern ? '<button class="btn ghost" data-pr="skip">Überspringen</button>' : ''}
        <span class="spacer"></span><span class="kbd">⌘ + Enter sendet</span>
      </div>
      <div class="actions" style="margin-top:22px;border-top:1px solid var(--line);padding-top:14px">
        <span class="small muted">${fertig.ok ? 'Schon genug? Offene Punkte bleiben einfach leer.' : 'Noch nötig: ' + fehlt + '.'}</span>
        <span class="spacer"></span><button class="btn tiny" data-pr="weiter" ${fertig.ok ? '' : 'disabled'}>Weiter zum Designsystem</button>
      </div></div>`;
  const status = x => x.status === 'uebersprungen' ? '<span class="status leer">übersprungen</span>' : `<span class="status ${x.status}">${STATUS_TEXT[x.status] || x.status}</span>`;
  return `${kopf('Briefing', '')}${pfad()}
  <section class="work">
    <div>${errorBox()}${frage}${ui.busy ? '' : statLine()}</div>
    <aside class="side" aria-label="Briefing">
      <div class="side-head"><h3>Briefing</h3><span class="small muted">${B.felder.filter(x => x.wert && x.status !== 'uebersprungen').length}/${B.felder.length}</span></div>
      ${B.felder.map(x => `<div class="fact"><div class="fact-top"><span class="fact-label">${esc(x.label)}</span>${status(x)}</div>
        ${ui.praesEdit === x.id
          ? `<textarea id="pr-edit">${esc(x.status === 'uebersprungen' ? '' : x.wert)}</textarea><div class="fact-tools"><button class="linkbtn" data-pr="feldsave" data-id="${x.id}">Speichern</button><button class="linkbtn" data-pr="feldcancel">Abbrechen</button></div>`
          : `<div class="fact-val ${x.wert && x.status !== 'uebersprungen' ? '' : 'empty'}">${x.wert && x.status !== 'uebersprungen' ? esc(x.wert) : 'noch offen'}</div>
             <div class="fact-tools"><button class="linkbtn" data-pr="feldedit" data-id="${x.id}">${x.wert && x.status !== 'uebersprungen' ? 'Ändern' : 'Selbst eintragen'}</button>${x.status === 'annahme' ? `<button class="linkbtn" data-pr="feldok" data-id="${x.id}">Bestätigen</button>` : ''}</div>`}
      </div>`).join('')}
    </aside>
  </section>`;
}

/* Zwei Musterfolien eines Designsystems mit den Angaben aus dem Briefing */
function muster(sys) {
  const b = Z().briefing || {}, roh = { titel: b.thema || 'Präsentation', folien: [
    { layoutId: sys.layoutForTyp('title').id, inhalt: { title: b.thema || 'Titel der Präsentation', subtitle: b.kernbotschaft || '' } },
    { layoutId: sys.layoutForTyp('content-bullets').id, inhalt: { title: b.kernbotschaft || 'Eine Aussage als Überschrift', bullets: [b.ziel || 'Erster Punkt', b.zielgruppe || 'Zweiter Punkt', b.cta || 'Dritter Punkt'].filter(Boolean) } }] };
  return buildSlides(kuerzeSpec(roh, sys).spec, sys, { schrift: Z().schrift }).map(slideHTML).join('');
}

function viewSystem() {
  const z = Z(), v = z.vorschlag, gewaehlt = (system() || {}).id;
  return `${kopf('Designsystem wählen', 'Derselbe Inhalt sieht in jedem Designsystem anders aus. Du kannst später jederzeit wechseln.')}${pfad()}
  ${errorBox()}${live()}
  ${reg.problems().map(p => `<div class="notice"><b>${esc(p.ordner || p.id)}</b> konnte nicht geladen werden: ${p.errors.slice(0, 3).map(esc).join(' · ')}</div>`).join('')}
  <section class="pr-systeme">
    ${reg.list().map(s => `<button class="pr-system" data-pr="system" data-id="${s.id}" aria-pressed="${s.id === gewaehlt}">
      <span class="pr-muster">${muster(s)}</span>
      <span class="pr-system-text"><b>${esc(s.meta.name)}${v && v.systemId === s.id ? ' <em>Vorschlag</em>' : ''}</b>
        <span>${esc(s.meta.beschreibung)}</span>
        ${v && v.systemId === s.id && v.begruendung ? `<span class="pr-grund">${esc(v.begruendung)}</span>` : ''}
        <span class="pr-tags">${s.meta.tags.map(t => `<i>${esc(t)}</i>`).join('')}</span></span>
    </button>`).join('') || '<p class="muted">Es wurde kein Designsystem gefunden. Lege eines unter design-systems/ ab.</p>'}
  </section>
  <div class="actions" style="margin-bottom:60px">
    <button class="btn primary" data-pr="erstellen" ${ui.busy || !gewaehlt ? 'disabled' : ''}>Präsentation schreiben (${z.briefing.folienzahl} Folien)</button>
    <button class="btn" data-pr="geh" data-s="briefing" ${ui.busy ? 'disabled' : ''}>Zurück zum Briefing</button>
    <span class="small muted" id="pr-fort">${esc(ui.praesFortschritt || '')}</span>
  </div>${!ui.busy && ui.error ? statLine() : ''}`;
}

/* Große Folie: Texte sind direkt bearbeitbar (außer Seitenzahl und Fußzeile) */
const buehne = f => slideHTML(f).replace(/<div class="pf-t" (data-ph="[^"]+"(?: data-index="\d+" data-feld="[^"]+")?) style/g, '<div class="pf-t" contenteditable="true" spellcheck="false" $1 style');

function hinweise(m) {
  const z = Z(), l = [];
  validateSpec(z.spec, system()).errors.filter(e => !e.includes('gibt es in diesem Layout nicht')).forEach(e => l.push(['zuviel', e]));
  m.forEach(f => f.elemente.filter(e => e.gekuerzt).forEach(e => l.push(['zuviel', `Folie ${f.nr}, ${e.ph}: Der Text passt nicht in die Fläche und wird abgeschnitten.`])));
  z.pruefen.forEach(t => l.push(['pruefen', t]));
  z.protokoll.forEach(t => l.push(['info', t]));
  return l.length ? `<details ${l.some(x => x[0] !== 'info') ? 'open' : ''}><summary>${l.length} ${l.length === 1 ? 'Hinweis' : 'Hinweise'}</summary><ul>${l.map(([art, t]) => `<li class="${art}">${esc(t)}</li>`).join('')}</ul></details>` : '';
}

function felder(f, layout) {
  const sys = system();
  return inhaltsPlatzhalter(layout).map(ph => {
    const v = f.inhalt[ph.id], name = `${esc(ph.beschreibung || ph.id)}${ph.pflicht ? '' : ' <span class="muted">(optional)</span>'}`;
    if (ph.typ === 'text') return `<label class="pr-feld"><span>${name}<i data-zaehler="${ph.id}"></i></span><textarea rows="2" data-prf="${ph.id}" data-typ="text" data-max="${ph.maxChars}">${esc(v || '')}</textarea></label>`;
    if (ph.typ === 'bullets') return `<label class="pr-feld"><span>${name}, ein Punkt pro Zeile<i data-zaehler="${ph.id}"></i></span><textarea rows="${Math.max(3, (v || []).length + 1)}" data-prf="${ph.id}" data-typ="bullets" data-max="${Math.min(ph.maxItems, sys.rules.maxBullets || ph.maxItems)}">${esc((Array.isArray(v) ? v : []).join('\n'))}</textarea></label>`;
    if (ph.typ === 'image') return `<label class="pr-feld"><span>${name}</span><select class="input" data-prb="${ph.id}"><option value="">Standardbild des Layouts</option>${sys.manifest.assets.filter(a => !/^logo/.test(a.role)).map(a => `<option value="${a.id}" ${v === a.id ? 'selected' : ''}>${esc(a.beschreibung || a.id)}</option>`).join('')}</select></label>`;
    if (ph.typ === 'items') {
      const l = Array.isArray(v) ? v : [], n = Math.min(ph.maxItems, Math.max(l.length + 1, ph.minItems || 1));
      return `<div class="pr-feld"><span>${name} (${ph.minItems || 1} bis ${ph.maxItems})</span>${Array.from({ length: n }, (_, i) => `<div class="pr-item">${ph.felder.map(fd => `<input class="input" data-pri="${ph.id}" data-index="${i}" data-feld="${fd.id}" maxlength="${fd.maxChars * 2}" placeholder="${esc(fd.beschreibung || fd.id)}" value="${esc((l[i] || {})[fd.id] || '')}">`).join('')}${i < l.length ? `<button class="linkbtn" data-pr="itemweg" data-ph="${ph.id}" data-i="${i}">Entfernen</button>` : ''}</div>`).join('')}</div>`;
    }
    return '';
  }).join('');
}

function viewVorschau() {
  const z = Z(), sys = system();
  if (!sys) return `${kopf('Folien', '')}${pfad()}<div class="notice">${bereit ? 'Es ist kein Designsystem vorhanden.' : 'Designsysteme werden geladen …'}</div>`;
  if (z.systemId !== sys.id) z.systemId = sys.id;
  const m = modell(), f = folie(), layout = sys.layout(f.layoutId) || sys.layoutForTyp('content-bullets'), i = z.auswahl;
  if (z.schrift === 'marke' && fontUrl(sys) && !document.querySelector(`link[href="${fontUrl(sys)}"]`)) document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: fontUrl(sys) }));
  return `${kopf('Folien', '')}${pfad()}
  <div class="pr-leiste">
    <label>Titel <input class="input" id="pr-titel" value="${esc(z.spec.titel)}" maxlength="40"></label>
    <label>Designsystem <select class="input" id="pr-system">${reg.list().map(s => `<option value="${s.id}" ${s.id === sys.id ? 'selected' : ''}>${esc(s.meta.name)}</option>`).join('')}</select></label>
    <label>Schrift <select class="input" id="pr-schrift"><option value="system" ${z.schrift !== 'marke' ? 'selected' : ''}>Systemschrift (überall gleich)</option><option value="marke" ${z.schrift === 'marke' ? 'selected' : ''}>${esc(sys.tokens.typography.headingFont)} (muss installiert sein)</option></select></label>
    <span class="spacer"></span>
    <button class="btn" data-pr="pdf" ${ui.busy ? 'disabled' : ''}>Als PDF drucken</button>
    <button class="btn primary" data-pr="pptx" ${ui.busy || ui.praesExport ? 'disabled' : ''}>${ui.praesExport ? 'Datei wird erstellt …' : 'Als PowerPoint speichern'}</button>
  </div>
  ${errorBox()}
  <div id="pr-hinweise" class="pr-hinweise">${hinweise(m)}</div>
  <section class="pr-editor">
    <div class="pr-thumbs" aria-label="Folien">${m.map((x, n) => `<button class="pr-thumb" data-pr="sel" data-i="${n}" aria-pressed="${n === i}" aria-label="Folie ${n + 1}"><span class="pr-nr">${n + 1}</span><span class="pr-thumb-f">${slideHTML(x)}</span></button>`).join('')}</div>
    <div class="pr-mitte">
      <div id="pr-stage" class="pr-stage">${buehne(m[i])}</div>
      <div class="actions">
        <span class="small muted">Folie ${i + 1} von ${m.length} · Texte lassen sich direkt auf der Folie ändern</span><span class="spacer"></span>
        <button class="btn tiny" data-pr="fa" data-a="hoch" ${i === 0 ? 'disabled' : ''}>Nach vorn</button>
        <button class="btn tiny" data-pr="fa" data-a="runter" ${i === m.length - 1 ? 'disabled' : ''}>Nach hinten</button>
        <button class="btn tiny" data-pr="fa" data-a="dazu">Folie danach einfügen</button>
        <button class="btn tiny" data-pr="fa" data-a="weg" ${m.length < 2 ? 'disabled' : ''}>Löschen</button>
      </div>
      ${live()}${!ui.busy && ui.error ? statLine() : ''}
    </div>
    <aside class="panel pr-panel">
      <label class="pr-feld"><span>Layout</span><select class="input" id="pr-layout">${sys.layouts.map(l => `<option value="${l.id}" ${l.id === layout.id ? 'selected' : ''}>${esc(l.name || l.id)}</option>`).join('')}</select></label>
      <p class="small muted" style="margin:-4px 0 12px">${esc(layout.beschreibung)}</p>
      ${felder(f, layout)}
      <label class="pr-feld"><span>Sprechernotizen</span><textarea rows="3" id="pr-notizen">${esc(f.notizen || '')}</textarea></label>
      <div class="pr-neu"><label class="pr-feld"><span>Von der KI neu schreiben lassen</span><textarea rows="2" id="pr-wunsch" placeholder="Optional: Was soll anders werden? Zum Beispiel: kürzer, mit Beispiel, sachlicher."></textarea></label>
        <button class="btn tiny" data-pr="neu" ${ui.busy ? 'disabled' : ''}>Folie neu schreiben</button></div>
    </aside>
  </section>`;
}

function view() {
  const z = Z();
  if (z.schritt === 'briefing' && !z.B) z.schritt = 'start';
  if (z.schritt === 'system' && !z.briefing) z.schritt = z.B ? 'briefing' : 'start';
  if (z.schritt === 'vorschau' && !z.spec) z.schritt = 'start';
  return `<div class="praes">${({ start: viewStart, briefing: viewBriefing, system: viewSystem, vorschau: viewVorschau })[z.schritt]()}</div>`;
}

/* ============================================================
   Ereignisse (eigene Attribute data-pr…, damit sich nichts mit der übrigen App überschneidet)
   ============================================================ */
const an = () => S.screen === 'praes';
function klick(e) {
  if (!an()) return;
  const b = e.target.closest('[data-pr]'); if (!b || b.disabled) return;
  const d = b.dataset, z = Z();
  switch (d.pr) {
    case 'zu': return close();
    case 'geh': return geh(d.s);
    case 'start': return starte();
    case 'beispiel': return beispiel();
    case 'chip': { const t = document.getElementById('pr-answer'); t.value = z.B.aktuell.vorschlaege[+d.i]; return t.focus(); }
    case 'send': return antworte();
    case 'unknown': return antworte('Weiß ich nicht. Bitte triff eine begründete Annahme, die zu meiner Präsentation passt.', true);
    case 'skip': P.briefingUeberspringen(z.B); save(); return render();
    case 'weiter': return briefingWeiter();
    case 'feldedit': ui.praesEdit = d.id; render(); { const t = document.getElementById('pr-edit'); if (t) t.focus(); } return;
    case 'feldcancel': ui.praesEdit = null; return render();
    case 'feldsave': { const f = z.B.felder.find(x => x.id === d.id), w = document.getElementById('pr-edit').value.trim(); f.wert = w; f.status = w ? 'bestaetigt' : 'leer'; ui.praesEdit = null; P.naechsteFrage(z.B); z.briefing = null; save(); return render(); }
    case 'feldok': z.B.felder.find(x => x.id === d.id).status = 'bestaetigt'; save(); return render();
    case 'system': z.systemId = d.id; save(); return render();
    case 'erstellen': return erstelle();
    case 'sel': z.auswahl = +d.i; save(); return render();
    case 'fa': return folienAktion(d.a);
    case 'neu': return schreibeNeu();
    case 'itemweg': { const l = folie().inhalt[d.ph]; if (Array.isArray(l)) l.splice(+d.i, 1); save(); return render(); }
    case 'pptx': return speicherePptx();
    case 'pdf': return drucke();
  }
}
function eingabe(e) {
  if (!an()) return;
  const t = e.target, d = t.dataset || {};
  if (t.id === 'pr-desc') { Z().beschreibung = t.value; return; }
  if (Z().schritt !== 'vorschau') return;
  if (d.prf) { setze({ ph: d.prf }, d.typ === 'bullets' ? t.value : t.value.trim()); return zeichneFolie(); }
  if (d.pri) { setze({ ph: d.pri, index: +d.index, feld: d.feld }, t.value.trim()); return zeichneFolie(); }
  if (t.id === 'pr-notizen') { folie().notizen = t.value; return save(); }
  if (t.id === 'pr-titel') { Z().spec.titel = t.value || 'Präsentation'; save(); return zeichneFolie(); }
}
function wechsel(e) {
  if (!an()) return;
  const t = e.target, z = Z();
  if (t.id === 'pr-proj') { z.mitProjekt = t.checked; return save(); }
  if (t.id === 'pr-system') return wechsleSystem(t.value);
  if (t.id === 'pr-schrift') { z.schrift = t.value; save(); return render(); }
  if (t.id === 'pr-layout') { folie().layoutId = t.value; save(); return render(); }
  if (t.dataset && t.dataset.prb) { setze({ ph: t.dataset.prb }, t.value); return zeichneFolie(); }
  if (t.dataset && t.dataset.pri) return render(); /* neue leere Zeile für den nächsten Eintrag anbieten */
}
/* Direkt auf der Folie bearbeiten */
const roh = d => { const v = folie().inhalt[d.ph]; return d.index !== undefined ? ((v || [])[+d.index] || {})[d.feld] || '' : v; };
function fokus(e) {
  const t = e.target;
  if (!an() || !t.isContentEditable || !t.closest('#pr-stage')) return;
  /* Großschreibung und Kürzung sind nur Darstellung: zum Bearbeiten den echten Text zeigen */
  const v = roh(t.dataset), soll = Array.isArray(v) ? v.join('\n') : String(v || '');
  if (t.innerText.replace(/\n+/g, '\n').trim() !== soll.trim()) t.innerHTML = Array.isArray(v) ? v.map(x => `<p class="pf-b" data-z="•">${esc(x)}</p>`).join('') : `<p>${esc(soll)}</p>`;
}
function fokusWeg(e) {
  const t = e.target;
  if (!an() || !t.isContentEditable || !t.closest('#pr-stage')) return;
  const d = t.dataset, liste = Array.isArray(roh(d)), text = t.innerText.replace(/ /g, ' ');
  setze({ ph: d.ph, index: d.index !== undefined ? +d.index : undefined, feld: d.feld }, liste ? text : text.replace(/\s*\n+\s*/g, ' ').trim());
  /* Formularfeld rechts nachziehen; die Folie erst neu zeichnen, wenn der Cursor sie verlassen hat */
  const feld = d.index !== undefined ? document.querySelector(`[data-pri="${d.ph}"][data-index="${d.index}"][data-feld="${d.feld}"]`) : document.querySelector(`[data-prf="${d.ph}"]`);
  const v = roh(d); if (feld) feld.value = Array.isArray(v) ? v.join('\n') : (v || '');
  setTimeout(() => zeichneFolie(!!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#pr-stage'))), 0);
}
function taste(e) {
  if (!an()) return;
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { if (e.target.id === 'pr-answer') { e.preventDefault(); antworte(); } else if (e.target.id === 'pr-desc') { e.preventDefault(); starte(); } }
  /* einzeilige Felder auf der Folie: Enter beendet die Eingabe */
  if (e.key === 'Enter' && e.target.isContentEditable && !Array.isArray(roh(e.target.dataset))) { e.preventDefault(); e.target.blur(); }
}

const CSS = FOLIEN_CSS + `
.praes{padding-bottom:40px}
.pr-kopf{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:26px 0 6px}
.pr-kopf h1{font-size:clamp(1.8rem,3.4vw,2.6rem);font-weight:700}
.pr-kopf .lead{color:var(--muted);max-width:68ch;margin:10px 0 0}
.pr-pfad{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 20px}
.pr-pfad button{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 14px 5px 6px;font-size:.88rem;display:flex;gap:8px;align-items:center}
.pr-pfad button b{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--surface-2);font-size:.75rem}
.pr-pfad button[aria-current="step"]{border-color:var(--accent);background:var(--accent-soft);color:var(--accent);font-weight:600}
.pr-pfad button[aria-current="step"] b{background:var(--accent);color:var(--on-accent)}
.pr-pfad button:disabled{opacity:.5;cursor:default}
.pr-start{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:22px;align-items:start}
.pr-ablauf{margin:0;padding-left:20px;font-size:.92rem}.pr-ablauf li{margin:0 0 8px}
.pr-systeme{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px;margin:6px 0 20px}
.pr-system{text-align:left;border:2px solid var(--line);background:var(--surface);border-radius:var(--radius-l);padding:14px;display:flex;flex-direction:column;gap:12px}
.pr-system:hover{border-color:var(--muted)}
.pr-system[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft)}
.pr-muster{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pr-muster .pf,.pr-thumb .pf,.pr-stage .pf{border:1px solid var(--line);border-radius:4px}
.pr-system-text{display:flex;flex-direction:column;gap:6px}
.pr-system-text b{font-family:var(--display);font-size:1.15rem}
.pr-system-text b em{font-style:normal;font-family:var(--body);font-size:.72rem;font-weight:600;background:var(--ok-bg);color:var(--ok);border-radius:var(--radius-s);padding:2px 8px;vertical-align:middle;margin-left:6px}
.pr-system-text>span{font-size:.9rem;color:var(--muted)}
.pr-system-text .pr-grund{color:var(--ink)}
.pr-tags{display:flex;flex-wrap:wrap;gap:5px}.pr-tags i{font-style:normal;font-size:.75rem;background:var(--surface-2);border-radius:var(--radius-s);padding:1px 7px}
.pr-leiste{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:flex-end;margin-bottom:14px}
.pr-leiste label{display:flex;flex-direction:column;gap:3px;font-size:.8rem;color:var(--muted)}
.pr-leiste .input{color:var(--ink);font-size:.92rem;min-width:190px;background:var(--surface)}
.pr-leiste .spacer{flex:1}
.pr-hinweise details{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-m);padding:8px 14px;margin-bottom:14px;font-size:.88rem}
.pr-hinweise summary{cursor:pointer;font-weight:600}
.pr-hinweise ul{margin:8px 0 4px;padding-left:18px}.pr-hinweise li{margin:3px 0}
.pr-hinweise li.zuviel{color:var(--review)}.pr-hinweise li.pruefen{color:var(--assume)}.pr-hinweise li.info{color:var(--muted)}
.pr-editor{display:grid;grid-template-columns:150px minmax(0,1fr) 340px;gap:18px;align-items:start}
.pr-thumbs{display:flex;flex-direction:column;gap:8px;max-height:calc(100vh - 40px);overflow:auto;position:sticky;top:16px;padding:2px}
.pr-thumb{display:flex;gap:6px;align-items:flex-start;border:0;background:none;padding:3px;border-radius:8px;text-align:left}
.pr-thumb .pr-nr{font-size:.72rem;color:var(--muted);width:14px;flex:none;text-align:right;padding-top:2px}
.pr-thumb-f{flex:1;min-width:0;pointer-events:none}
.pr-thumb[aria-pressed="true"]{background:var(--accent-soft)}.pr-thumb[aria-pressed="true"] .pf{border-color:var(--accent);outline:1px solid var(--accent)}
.pr-stage .pf{box-shadow:0 2px 14px rgba(0,0,0,.12)}
.pr-stage [contenteditable]{cursor:text;outline:1px dashed transparent;outline-offset:.3cqw}
.pr-stage [contenteditable]:hover{outline-color:rgba(127,127,127,.6)}
.pr-stage [contenteditable]:focus{outline:2px solid var(--accent)}
.pr-panel{padding:16px;position:sticky;top:16px;max-height:calc(100vh - 32px);overflow:auto}
.pr-feld{display:flex;flex-direction:column;gap:4px;margin-bottom:12px;font-size:.82rem}
.pr-feld>span{display:flex;justify-content:space-between;gap:8px;font-weight:600}
.pr-feld>span i{font-style:normal;font-weight:400;color:var(--muted);font-variant-numeric:tabular-nums}
.pr-feld>span i.zuviel{color:var(--review);font-weight:600}
.pr-feld textarea,.pr-feld .input{width:100%;border:1px solid var(--line);border-radius:var(--radius-s);padding:7px 9px;background:var(--surface-2);font-size:.88rem;resize:vertical}
.pr-item{display:flex;flex-direction:column;gap:4px;padding:6px 0 8px;border-top:1px solid var(--line)}
.pr-neu{border-top:1px solid var(--line);padding-top:12px}
#printroot.pr-print .pr-seite{width:338.67mm;height:190.5mm;break-after:page;overflow:hidden}
#printroot.pr-print .pf{border:0}
@media (max-width:1100px){.pr-editor{grid-template-columns:110px minmax(0,1fr)}.pr-panel{grid-column:1 / -1;position:static;max-height:none}}
@media (max-width:760px){.pr-start{grid-template-columns:1fr}.pr-editor{grid-template-columns:1fr}.pr-thumbs{flex-direction:row;position:static;max-height:none;overflow:auto}.pr-thumb{flex:0 0 120px}.pr-systeme{grid-template-columns:1fr}.pr-leiste .input{min-width:0}}
`;

/* ---------- Start ---------- */
document.head.appendChild(Object.assign(document.createElement('style'), { id: 'praes-css', textContent: CSS }));
const app = document.getElementById('app');
app.addEventListener('click', klick);
app.addEventListener('input', eingabe);
app.addEventListener('change', wechsel);
app.addEventListener('focusin', fokus);
app.addEventListener('focusout', fokusWeg);
app.addEventListener('keydown', taste);
/* Zähler nach jedem Zeichnen füllen */
new MutationObserver(() => { if (an()) document.querySelectorAll('[data-zaehler]').forEach(el => { if (!el.textContent) { const t = document.querySelector(`[data-prf="${el.dataset.zaehler}"]`); if (t) zaehler(el, t); } }); }).observe(app, { childList: true });

window.Praes = { view, open, close, reg };
if (an()) render();
reg.discover('design-systems/').then(() => { bereit = true; if (an()) render(); });
