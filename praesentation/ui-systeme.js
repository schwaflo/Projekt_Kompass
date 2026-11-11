/* ============================================================
   Präsentationsgenerator – Designsystem-Editor
   Übersicht aller Designsysteme, ZIP-Upload, Import aus PowerPoint,
   Vorschau von Farben, Schriften und Layouts, Zuordnung der Bilder
   per Drag & Drop, Export als ZIP.
   Mitgelieferte Systeme sind schreibgeschützt; bearbeitet wird eine
   Kopie, die im Browser gespeichert ist.
   ============================================================ */
/* global S, ui, render, run, esc, toast, IDB */
import { ladePaket, paketAusZip, zipAusSystem, kopiereSystem, fuegeDateiHinzu, freieId } from './pakete.js';
import { importPptx } from './import-pptx.js';
import { ROLLEN, bildFuerKI } from './assets.js';
import { inhaltsPlatzhalter } from './spec.js';
import { buildSlides } from './layout.js';
import { slideHTML, fontUrl } from './render-html.js';
import { fuelle } from './pipeline.js';

const STORE = 'designsysteme';
let K = null; /* { reg, ladePrompts, ki } aus ui.js */
const zustand = () => (ui.prSys = ui.prSys || { id: '', bericht: [], fehler: [] });
const kopie = o => JSON.parse(JSON.stringify(o));
const zip = async () => { if (!window.JSZip) await new Promise((ok, f) => { const s = document.createElement('script'); s.src = 'vendor/pptxgen.bundle.js'; s.onload = ok; s.onerror = () => f(new Error('vendor/pptxgen.bundle.js konnte nicht geladen werden.')); document.head.appendChild(s); }); return window.JSZip; };
const bearbeitbar = s => !!(s && s.paket);

export function initSysteme(kontext) { K = kontext; }

/* Beim Start: gespeicherte Pakete aus dem Browser in die Registry laden */
export async function ladeGespeicherte() {
  let liste = [];
  try { liste = await IDB.all(STORE); } catch { return; }
  for (const p of liste) K.reg.add(await ladePaket(p));
}

/* Paket prüfen, speichern und in der Registry ersetzen. Liefert die Fehlerliste. */
async function speichere(paket) {
  const r = await ladePaket(paket);
  if (!r.ok) return r.errors;
  paket.id = r.system.id;
  try { await IDB.put(paket.id, paket, STORE); } catch { ui.notice = 'Das Designsystem bleibt nur bis zum Neuladen der Seite erhalten, weil der Browser-Speicher nicht verfügbar ist.'; }
  K.reg.add(r);
  return [];
}
/* Änderung an einer Kopie ausprobieren; nur übernehmen, wenn das Paket gültig bleibt */
async function aendere(system, fn) {
  const p = { ...system.paket, manifest: kopie(system.paket.manifest), dateien: { ...system.paket.dateien } };
  try { await fn(p); } catch (e) { ui.error = e.message; return render(); }
  const fehler = await speichere(p);
  ui.error = fehler.length ? `Das geht so nicht: ${fehler[0]}` : null;
  render();
}

/* ---------- Aktionen ---------- */
async function ladeZip(datei) {
  const z = zustand(); z.fehler = []; z.bericht = [];
  const r = await paketAusZip(datei, await zip());
  if (r.paket && K.reg.get(r.paket.id) && !bearbeitbar(K.reg.get(r.paket.id))) r.errors.push(`Ein mitgeliefertes Designsystem heißt bereits „${r.paket.id}“. Ändere meta.id in der design-system.json.`);
  const fehler = r.errors.length ? r.errors : await speichere(r.paket);
  if (fehler.length) { z.fehler = [`„${datei.name}“ konnte nicht übernommen werden:`, ...fehler]; return render(); }
  z.id = r.paket.id;
  z.bericht = [`„${r.paket.manifest.meta.name}“ wurde hinzugefügt und steht ab sofort für alle Präsentationen bereit.`, ...r.vorschlaege.map(v => `${v.file}: als ${v.role} eingetragen (${v.grund}). Bitte prüfen.`)];
  render(); window.scrollTo({ top: 0 });
}

async function ladePptx(datei) {
  const z = zustand(); z.fehler = []; z.bericht = [];
  try {
    const r = await importPptx(datei, await zip(), { vergebeneIds: K.reg.list().map(s => s.id), basis: K.reg.get('demo-hell') || K.reg.list()[0] });
    const fehler = await speichere(r.paket);
    if (fehler.length) { z.fehler = [`Der Entwurf aus „${datei.name}“ ist nicht gültig:`, ...fehler]; return render(); }
    z.id = r.paket.id; z.bericht = ['Entwurf angelegt. Das wurde aus der Datei gelesen:', ...r.bericht];
  } catch (e) { z.fehler = [e.message]; }
  render(); window.scrollTo({ top: 0 });
}

async function kopiere(system) {
  const ids = K.reg.list().map(s => s.id), id = freieId(system.id + '-kopie', ids), z = zustand();
  const fehler = await speichere(await kopiereSystem(system, id, system.meta.name + ' (Kopie)'));
  if (fehler.length) ui.error = fehler[0]; else { z.id = id; z.bericht = ['Kopie angelegt. Du kannst jetzt Farben, Schriften und Bilder ändern.']; z.fehler = []; }
  render(); window.scrollTo({ top: 0 });
}

async function speichereZip(system) {
  try {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await zipAusSystem(system, await zip())), download: system.id + '.zip' });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('ZIP-Paket gespeichert');
  } catch (e) { ui.error = 'Das ZIP-Paket konnte nicht erstellt werden: ' + e.message; render(); }
}

async function loesche(system) {
  if (!confirm(`Designsystem „${system.meta.name}“ löschen? Das lässt sich nicht rückgängig machen.`)) return;
  try { await IDB.del(system.id, STORE); } catch {}
  K.reg.remove(system.id); zustand().id = '';
  if (S.praes && S.praes.systemId === system.id) S.praes.systemId = '';
  render();
}

const neueDateien = (system, files, rolle) => aendere(system, async p => { for (const f of files) await fuegeDateiHinzu(p, f, rolle); });

function beschreibeMitKI(system, assetId) {
  run('Bild wird beschrieben …', async () => {
    const prompts = await K.ladePrompts(), a = system.asset(assetId);
    const res = await K.ki().frage({
      art: 'praes_bild', system: fuelle(prompts['system-briefing']), prompt: fuelle(prompts['asset-beschreiben'], { datei: a.file.split('/').pop() }),
      schema: { type: 'object', properties: { beschreibung: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['beschreibung', 'tags'] },
      bilder: [await bildFuerKI(system.assetUrl(assetId))]
    });
    const p = { ...system.paket, manifest: kopie(system.paket.manifest) }, ziel = p.manifest.assets.find(x => x.id === assetId);
    ziel.beschreibung = String(res.beschreibung || ziel.beschreibung).slice(0, 160);
    ziel.tags = [...new Set([...(ziel.tags || []).filter(t => /^(logo|querformat|hochformat|quadrat|hell|dunkel)$/.test(t)), ...(res.tags || []).map(t => String(t).toLowerCase().trim()).filter(Boolean)])].slice(0, 8);
    const fehler = await speichere(p); if (fehler.length) throw new Error(fehler[0]);
  });
}

/* ---------- Ansicht ---------- */
const FUELL = 'Die Bearbeitungszeit sinkt deutlich, weil Kundinnen und Kunden ihre Anliegen künftig selbst erledigen und das Team mehr Zeit für Beratung gewinnt. ';
const fuell = n => FUELL.repeat(Math.ceil(n / FUELL.length)).slice(0, Math.max(3, Math.round(n * 0.7))).trim();
/* Jedes Layout einmal, gefüllt bis nahe an die Zeichenlimits */
function layoutVorschau(system) {
  const spec = { titel: system.meta.name, folien: system.layouts.map(l => ({ layoutId: l.id, inhalt: Object.fromEntries(inhaltsPlatzhalter(l).filter(p => p.typ !== 'image').map(p => [p.id,
    p.typ === 'text' ? (p.id === 'number' ? '01' : fuell(p.maxChars)) : p.typ === 'bullets' ? Array.from({ length: Math.max(2, p.maxItems - 1) }, () => fuell(p.maxCharsPerItem)) : Array.from({ length: p.maxItems }, (_, i) => Object.fromEntries(p.felder.map(f => [f.id, f.id === 'value' ? ['72 %', '−31 %', '4,5', '2 Min.'][i % 4] : fuell(f.maxChars)])))])) })) };
  return buildSlides(spec, system, { schrift: 'system' });
}

const meldungen = () => { const z = zustand(); return `${z.fehler.length ? `<div class="error" role="alert"><b>${esc(z.fehler[0])}</b>${z.fehler.length > 1 ? `<ul>${z.fehler.slice(1, 12).map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}${z.fehler.length > 12 ? `<p class="small">und ${z.fehler.length - 12} weitere</p>` : ''}</div>` : ''}${z.bericht.length ? `<div class="notice" role="status"><b>${esc(z.bericht[0])}</b>${z.bericht.length > 1 ? `<ul>${z.bericht.slice(1).map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}</div>` : ''}`; };

function viewListe() {
  const liste = K.reg.list();
  return `<div class="pr-kopf"><div><h1>Designsysteme</h1><p class="lead">Ein Designsystem legt Farben, Schriften, Layouts, Logos und den Ton der Texte fest. Einmal hinzugefügt, steht es für alle Präsentationen bereit.</p></div><button class="btn ghost" data-ps="zurueck">Zurück</button></div>
  ${meldungen()}${ui.error ? `<div class="error" role="alert">${esc(ui.error)}</div>` : ''}
  <div class="ps-drop" id="ps-drop"><b>Designsystem hinzufügen</b>
    <span class="muted">ZIP-Paket oder PowerPoint-Vorlage (.pptx, .potx) hierher ziehen</span>
    <span class="actions"><label class="btn tiny">ZIP-Paket wählen<input type="file" id="ps-zip" accept=".zip" hidden></label><label class="btn tiny">Aus PowerPoint importieren<input type="file" id="ps-pptx" accept=".pptx,.potx" hidden></label></span></div>
  <section class="pr-systeme">${liste.map(s => `<div class="pr-system ps-karte">
      <span class="pr-muster">${layoutVorschau(s).slice(0, 2).map(slideHTML).join('')}</span>
      <span class="pr-system-text"><b>${esc(s.meta.name)} <em class="${bearbeitbar(s) ? '' : 'fest'}">${bearbeitbar(s) ? 'im Browser gespeichert' : 'mitgeliefert'}</em></b>
        <span>${esc(s.meta.beschreibung)}</span>
        <span class="small">${s.layouts.length} Layouts · ${s.manifest.assets.length} Bilder${s.warnings.length ? ` · <span class="ps-warn">${s.warnings.length} ${s.warnings.length === 1 ? 'Hinweis' : 'Hinweise'}</span>` : ''}</span></span>
      <span class="actions"><button class="btn tiny primary" data-ps="auf" data-id="${s.id}">${bearbeitbar(s) ? 'Bearbeiten' : 'Ansehen'}</button><button class="btn tiny" data-ps="zip" data-id="${s.id}">Als ZIP speichern</button>${bearbeitbar(s) ? '' : `<button class="btn tiny" data-ps="kopie" data-id="${s.id}">Kopie zum Bearbeiten</button>`}</span>
    </div>`).join('')}</section>
  ${K.reg.problems().map(p => `<div class="error"><b>${esc(p.ordner || p.id)}</b> konnte nicht geladen werden:<ul>${p.errors.slice(0, 8).map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`).join('')}`;
}

function viewDetail(s) {
  const e = bearbeitbar(s), C = s.tokens.colors, ty = s.tokens.typography, m = s.manifest;
  if (fontUrl(s) && !document.querySelector(`link[href="${fontUrl(s)}"]`)) document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: fontUrl(s) }));
  const farben = Object.keys(C).filter(k => k !== 'chartPalette');
  const rolleVon = r => m.assets.find(a => a.role === r);
  return `<div class="pr-kopf"><div><h1>${esc(s.meta.name)}</h1><p class="lead">${esc(s.meta.beschreibung)}</p></div><button class="btn ghost" data-ps="liste">Alle Designsysteme</button></div>
  ${meldungen()}${ui.error ? `<div class="error" role="alert">${esc(ui.error)}</div>` : ''}${ui.notice ? `<div class="notice">${esc(ui.notice)}</div>` : ''}
  ${ui.busy ? `<div class="live" id="live">${window.liveInner()}</div>` : ''}
  <div class="actions" style="margin:0 0 18px">
    <span class="tag">${e ? 'im Browser gespeichert, bearbeitbar' : 'mitgeliefert, schreibgeschützt'}</span><span class="tag">ID: ${esc(s.id)}</span><span class="tag">Version ${esc(s.meta.version)}</span><span class="spacer"></span>
    ${e ? '' : `<button class="btn primary tiny" data-ps="kopie" data-id="${s.id}">Kopie zum Bearbeiten anlegen</button>`}
    <button class="btn tiny" data-ps="zip" data-id="${s.id}">Als ZIP speichern</button>
    ${e ? `<button class="btn tiny" data-ps="weg" data-id="${s.id}">Löschen</button>` : ''}
  </div>
  ${s.warnings.length ? `<details class="ps-block"><summary>${s.warnings.length} ${s.warnings.length === 1 ? 'Hinweis' : 'Hinweise'} aus der Prüfung</summary><ul>${s.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}

  ${e ? `<section class="ps-block"><h3>Name und Beschreibung</h3><div class="ps-form"><label>Name<input class="input" data-pm="name" value="${esc(s.meta.name)}"></label><label>Beschreibung<input class="input" data-pm="beschreibung" value="${esc(s.meta.beschreibung)}"></label><label>Tags, mit Komma getrennt<input class="input" data-pm="tags" value="${esc(s.meta.tags.join(', '))}"></label></div></section>` : ''}

  <section class="ps-block"><h3>Farben</h3>
    <div class="ps-farben">${farben.map(k => `<label class="ps-farbe"><span class="ps-fleck" style="background:${C[k]}">${e ? `<input type="color" data-pc="${k}" value="${C[k]}" aria-label="${esc(k)}">` : ''}</span><b>${esc(k)}</b><i>${C[k]}</i></label>`).join('')}</div>
    <p class="small muted" style="margin:10px 0 4px">Diagrammfarben</p><div class="ps-palette">${C.chartPalette.map(c => `<span style="background:${c}" title="${c}"></span>`).join('')}</div>
  </section>

  <section class="ps-block"><h3>Schriften</h3>
    <div class="ps-schriften">
      <div><p style="font-family:'${esc(ty.headingFont)}',${ty.headingFallback.join(',')};font-size:1.7rem;font-weight:${ty.headingBold === false ? 400 : 700};margin:0">Überschrift in ${esc(ty.headingFont)}</p><p class="small muted">Ersatzschrift für den Export: ${esc(ty.headingFallback[0])}</p>${e ? `<input class="input" data-pt="headingFont" value="${esc(ty.headingFont)}" aria-label="Schrift für Überschriften">` : ''}</div>
      <div><p style="font-family:'${esc(ty.bodyFont)}',${ty.bodyFallback.join(',')};font-size:1.05rem;margin:0">Fließtext in ${esc(ty.bodyFont)}: Kundinnen und Kunden erledigen ihre Anliegen künftig selbst.</p><p class="small muted">Ersatzschrift für den Export: ${esc(ty.bodyFallback[0])}</p>${e ? `<input class="input" data-pt="bodyFont" value="${esc(ty.bodyFont)}" aria-label="Schrift für Text">` : ''}</div>
    </div>
    <p class="small muted" style="margin:8px 0 0">Größen in Punkt: ${Object.entries(ty.sizes).map(([k, v]) => `${esc(k)} ${v}`).join(' · ')}</p>
  </section>

  <section class="ps-block"><h3>Bilder und Logos</h3>
    <p class="small muted" style="margin:0 0 12px">${e ? 'Zieh eine Datei auf eine Rolle, um das Bild dort einzusetzen. Vorhandene Bilder lassen sich ebenfalls auf eine Rolle ziehen.' : 'Lege eine Kopie an, um eigene Logos und Bilder einzusetzen.'}</p>
    <div class="ps-rollen">${Object.entries(ROLLEN).map(([r, info]) => { const a = rolleVon(r); return `<div class="ps-rolle ${e ? 'ziel' : ''}" data-rolle="${r}">
      <span class="ps-bild ${r === 'logo-negative' ? 'dunkel' : ''}">${a ? `<img src="${esc(s.assetUrl(a.id))}" alt="">` : '<i>leer</i>'}</span>
      <b>${esc(info.name)}</b><span class="small muted">${esc(r)} · ${esc(info.form)}</span>
      ${e ? `<label class="linkbtn">Datei wählen<input type="file" data-prolle="${r}" accept="image/*" hidden></label>` : ''}</div>`; }).join('')}</div>
    <table class="ps-assets"><thead><tr><th></th><th>ID</th><th>Rolle</th><th>Beschreibung</th><th>Tags</th><th></th></tr></thead><tbody>
      ${m.assets.map(a => `<tr ${e ? `draggable="true" data-asset="${a.id}"` : ''}>
        <td><span class="ps-bild klein ${a.role === 'logo-negative' ? 'dunkel' : ''}"><img src="${esc(s.assetUrl(a.id))}" alt=""></span></td>
        <td><code>${esc(a.id)}</code><br><span class="small muted">${esc(a.file.split('/').pop())}${a.w ? ` · ${a.w} × ${a.h}` : ''}</span></td>
        <td>${e ? `<select class="input" data-pa="role" data-id="${a.id}">${[...new Set([...Object.keys(ROLLEN), a.role])].map(r => `<option ${r === a.role ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>` : esc(a.role)}</td>
        <td>${e ? `<input class="input" data-pa="beschreibung" data-id="${a.id}" value="${esc(a.beschreibung || '')}">` : esc(a.beschreibung || '')}</td>
        <td>${e ? `<input class="input" data-pa="tags" data-id="${a.id}" value="${esc((a.tags || []).join(', '))}">` : esc((a.tags || []).join(', '))}</td>
        <td>${e ? `<button class="linkbtn" data-ps="kibild" data-id="${s.id}" data-asset="${a.id}" ${ui.busy ? 'disabled' : ''}>Von KI beschreiben</button><br><button class="linkbtn" data-ps="assetweg" data-id="${s.id}" data-asset="${a.id}">Entfernen</button>` : ''}</td></tr>`).join('')}
    </tbody></table>
    ${e ? `<div class="ps-drop klein" id="ps-bilder" data-sys="${s.id}"><span class="muted">Weitere Bilder hierher ziehen. Die Rolle wird aus Dateiname, Format und Seitenverhältnis vorgeschlagen.</span><label class="btn tiny">Bilder wählen<input type="file" data-prolle="" accept="image/*" multiple hidden></label></div>` : ''}
  </section>

  <section class="ps-block"><h3>Layouts</h3>
    <p class="small muted" style="margin:0 0 12px">Jedes Layout mit Beispieltext nahe an den Zeichenlimits.</p>
    <div class="ps-layouts">${layoutVorschau(s).map((f, i) => { const l = s.layouts[i]; return `<figure>${slideHTML(f)}<figcaption><b>${esc(l.name || l.id)}</b> <code>${esc(l.id)}</code><br><span class="small muted">${inhaltsPlatzhalter(l).map(p => `${p.id}${p.maxChars ? ' ≤ ' + p.maxChars : p.maxItems ? ' ≤ ' + p.maxItems + (p.maxCharsPerItem ? ' × ' + p.maxCharsPerItem : '') : ''}`).join(' · ')}</span></figcaption></figure>`; }).join('')}</div>
  </section>

  <section class="ps-block"><h3>Formulierungsrichtlinien (voice.md)</h3>
    ${e ? `<textarea class="answer" data-pv="1" rows="10" style="min-height:220px;font-size:.9rem">${esc(s.voice)}</textarea><p class="small muted">Wird gespeichert, sobald du das Feld verlässt.</p>` : `<pre class="ps-voice">${esc(s.voice || '(keine)')}</pre>`}
  </section>`;
}

export function viewSysteme() {
  const s = K.reg.get(zustand().id);
  return s ? viewDetail(s) : viewListe();
}

/* ---------- Ereignisse ---------- */
export function klickSysteme(e) {
  const b = e.target.closest('[data-ps]'); if (!b || b.disabled) return false;
  const d = b.dataset, z = zustand(), s = K.reg.get(d.id);
  ui.error = null;
  switch (d.ps) {
    case 'zurueck': K.zurueck(); break;
    case 'liste': z.id = ''; z.bericht = []; z.fehler = []; render(); window.scrollTo({ top: 0 }); break;
    case 'auf': z.id = d.id; z.bericht = []; z.fehler = []; render(); window.scrollTo({ top: 0 }); break;
    case 'zip': speichereZip(s); break;
    case 'kopie': kopiere(s); break;
    case 'weg': loesche(s); break;
    case 'kibild': beschreibeMitKI(s, d.asset); break;
    case 'assetweg': aendere(s, p => { const a = p.manifest.assets.find(x => x.id === d.asset); p.manifest.assets = p.manifest.assets.filter(x => x !== a); if (!p.manifest.assets.some(x => x.file === a.file)) delete p.dateien[a.file]; }); break;
  }
  return true;
}

export function wechselSysteme(e) {
  const t = e.target, d = t.dataset || {}, s = K.reg.get(zustand().id);
  if (t.id === 'ps-zip' && t.files[0]) { ladeZip(t.files[0]); t.value = ''; return true; }
  if (t.id === 'ps-pptx' && t.files[0]) { ladePptx(t.files[0]); t.value = ''; return true; }
  if (!s || !bearbeitbar(s)) return false;
  if (d.prolle !== undefined && t.files && t.files.length) { neueDateien(s, [...t.files], d.prolle); t.value = ''; return true; }
  const liste = v => v.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (d.pm) { aendere(s, p => { p.manifest.meta[d.pm] = d.pm === 'tags' ? liste(t.value) : t.value.trim() || p.manifest.meta[d.pm]; }); return true; }
  if (d.pc) { aendere(s, p => { p.manifest.tokens.colors[d.pc] = t.value.toUpperCase(); }); return true; }
  if (d.pt) { aendere(s, p => { p.manifest.tokens.typography[d.pt] = t.value.trim() || p.manifest.tokens.typography[d.pt]; }); return true; }
  if (d.pa) { aendere(s, p => { const a = p.manifest.assets.find(x => x.id === d.id); a[d.pa] = d.pa === 'tags' ? liste(t.value) : t.value.trim(); }); return true; }
  if (d.pv) { aendere(s, p => { p.voice = t.value; }); return true; }
  return false;
}

/* Drag & Drop: Dateien auf die Seite oder auf eine Rolle, vorhandene Bilder auf eine Rolle */
export function dragSysteme(e) {
  const ziel = e.target.closest && e.target.closest('.ps-rolle.ziel, .ps-drop'), s = K.reg.get(zustand().id);
  if (e.type === 'dragstart') { const tr = e.target.closest('[data-asset]'); if (tr) e.dataTransfer.setData('text/x-asset', tr.dataset.asset); return; }
  if (!ziel) return;
  e.preventDefault();
  if (e.type === 'dragover') { ziel.classList.add('ueber'); return; }
  ziel.classList.remove('ueber');
  if (e.type !== 'drop') return;
  const files = [...e.dataTransfer.files], assetId = e.dataTransfer.getData('text/x-asset');
  if (ziel.id === 'ps-drop') { const f = files[0]; if (!f) return; return /\.(pptx|potx)$/i.test(f.name) ? ladePptx(f) : ladeZip(f); }
  if (!s || !bearbeitbar(s)) return;
  const rolle = ziel.dataset.rolle || '';
  if (files.length) return neueDateien(s, files, rolle);
  if (assetId && rolle) aendere(s, p => { p.manifest.assets.find(x => x.id === assetId).role = rolle; });
}

export const SYSTEME_CSS = `
.ps-drop{display:flex;flex-direction:column;gap:8px;align-items:flex-start;border:2px dashed var(--line);border-radius:var(--radius-l);padding:18px 20px;margin:0 0 20px;background:var(--surface)}
.ps-drop.klein{flex-direction:row;align-items:center;justify-content:space-between;padding:12px 16px;margin:14px 0 0;font-size:.88rem}
.ps-drop.ueber,.ps-rolle.ueber{border-color:var(--accent);background:var(--accent-soft)}
.ps-drop .actions{margin-top:2px}
.ps-karte{cursor:default}.ps-karte:hover{border-color:var(--line)}
.pr-system-text b em.fest{background:var(--surface-2);color:var(--muted)}
.ps-warn{color:var(--assume)}
.ps-block{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-l);padding:18px 20px;margin-bottom:16px}
.ps-block h3{font-size:1.1rem;margin-bottom:12px}
.ps-block summary{cursor:pointer;font-weight:600}.ps-block ul{margin:8px 0 0;padding-left:18px;font-size:.9rem}
.ps-form{display:grid;grid-template-columns:1fr 2fr 1fr;gap:12px}.ps-form label{display:flex;flex-direction:column;gap:4px;font-size:.8rem;color:var(--muted)}.ps-form .input{color:var(--ink)}
.ps-farben{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
.ps-farbe{display:flex;flex-direction:column;font-size:.82rem}
.ps-fleck{position:relative;height:54px;border-radius:var(--radius-m);border:1px solid var(--line);margin-bottom:5px;overflow:hidden}
.ps-fleck input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.ps-farbe i{font-style:normal;color:var(--muted);font-variant-numeric:tabular-nums}
.ps-palette{display:flex;gap:4px}.ps-palette span{width:38px;height:22px;border-radius:4px;border:1px solid var(--line)}
.ps-schriften{display:grid;grid-template-columns:1fr 1fr;gap:20px}.ps-schriften .input{margin-top:6px}
.ps-rollen{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-bottom:16px}
.ps-rolle{display:flex;flex-direction:column;gap:3px;border:2px dashed transparent;border-radius:var(--radius-m);padding:8px;background:var(--surface-2);font-size:.86rem}
.ps-rolle.ziel{border-color:var(--line)}
.ps-bild{display:grid;place-items:center;height:84px;border-radius:var(--radius-s);background:repeating-conic-gradient(#e9ecef 0 25%,#fff 0 50%) 0 0/14px 14px;margin-bottom:4px;overflow:hidden}
.ps-bild.dunkel{background:#26303c}
.ps-bild img{max-width:100%;max-height:100%;object-fit:contain}.ps-bild i{color:#8a94a0;font-style:normal;font-size:.8rem}
.ps-bild.klein{width:64px;height:44px;margin:0}
.ps-assets{width:100%;border-collapse:collapse;font-size:.86rem}
.ps-assets th{text-align:left;font-weight:600;color:var(--muted);font-size:.78rem;padding:4px 6px}
.ps-assets td{padding:6px;border-top:1px solid var(--line);vertical-align:middle}
.ps-assets tr[draggable]{cursor:grab}.ps-assets .input{padding:5px 8px;font-size:.84rem}
.ps-assets code,.ps-layouts code{font-size:.8rem;background:var(--surface-2);padding:1px 5px;border-radius:4px}
.ps-layouts{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.ps-layouts figure{margin:0}.ps-layouts .pf{border:1px solid var(--line);border-radius:4px}.ps-layouts figcaption{font-size:.86rem;margin-top:6px}
.ps-voice{white-space:pre-wrap;font:inherit;font-size:.88rem;background:var(--surface-2);border-radius:var(--radius-m);padding:14px;margin:0;max-height:320px;overflow:auto}
@media (max-width:760px){.ps-form,.ps-schriften{grid-template-columns:1fr}.ps-assets thead{display:none}.ps-assets td{display:block;border:0;padding:3px 0}.ps-assets tr{display:block;border-top:1px solid var(--line);padding:8px 0}}
`;
