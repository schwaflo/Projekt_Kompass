/* ============================================================
   Präsentationsgenerator – Folienmodell
   buildSlides macht aus Slide-Spec + Designsystem eine Liste
   fertig berechneter Folien. Vorschau (render-html.js) und
   PowerPoint-Export (render-pptx.js) lesen nur dieses Modell,
   deshalb sehen beide gleich aus.

   Folie:   { nr, layoutId, typ, background, elemente[], notizen }
   Element: { art: 'form' | 'bild' | 'text' | 'tabelle', x, y, w, h (Prozent), … }
   ============================================================ */
import { inhaltsPlatzhalter, tabellenFlaeche, istTabelle } from './spec.js';
import { einpassen, blockHoehe, textBreite, zeilen as zeilenZahl } from './text.js';
import { farbeVon } from './validate.js';

export const FOLIE_PT = { w: 960, h: 540 };

/* Anpassung einer Folie (von der KI oder beim Spiegeln für Abwechslung) auf ein Layout anwenden.
   anpassung: { spiegeln?: true, boxen?: { platzhalterId: { x, y, w, h } } }
   Logos, Seitenzahl und Fußzeile bleiben, wo das Designsystem sie vorsieht. */
export function passeAn(layout, a) {
  if (!a || (!a.spiegeln && !(a.boxen && Object.keys(a.boxen).length))) return layout;
  const sp = b => a.spiegeln ? { ...b, x: r(100 - b.x - b.w) } : b;
  const placeholders = layout.placeholders.map(p => {
    if (p.auto || p.typ === 'logo') return p;
    let q = sp(p);
    if (a.spiegeln && p.zellen) q = { ...q, zellen: p.zellen.map(z => Object.fromEntries(Object.entries(z).map(([k, b]) => [k, sp(b)]))).reverse() };
    if (a.boxen && a.boxen[p.id]) { const b = a.boxen[p.id]; q = { ...q, x: b.x, y: b.y, w: b.w, h: b.h }; }
    return q;
  });
  const deko = !a.spiegeln ? layout.deko : (layout.deko || []).map(d => d.logo || d.shape === 'text' ? d : { ...sp(d), ...(d.rot ? { rot: -d.rot } : {}), ...(['line', 'pfad', 'preset'].includes(d.shape) ? { flipH: !d.flipH } : {}) });
  return { ...layout, placeholders, deko };
}

/* opts.schrift: 'system' (Standard) nimmt die erste Ersatzschrift, die auf jedem Rechner
   vorhanden ist. 'marke' nimmt die Wunschschrift; sie muss dann installiert sein. */
export function buildSlides(spec, system, opts = {}) {
  const T = system.tokens, C = T.colors, ty = T.typography, marke = opts.schrift === 'marke';
  const schrift = art => {
    const h = art === 'heading', name = h ? ty.headingFont : ty.bodyFont, fb = h ? ty.headingFallback : ty.bodyFallback;
    const generisch = fb.filter(f => /^(serif|sans-serif|monospace)$/.test(f)), echte = fb.filter(f => !generisch.includes(f));
    const face = marke ? name : (echte[0] || 'Arial');
    return { face, css: [...(marke ? [name] : []), ...echte, ...(generisch.length ? generisch : ['sans-serif'])].map(f => /\s/.test(f) ? `"${f}"` : f).join(', ') };
  };
  const linie = C.border || C.textMuted;

  function textEl(box, absaetze, st = {}, extra = {}) {
    const art = st.font === 'heading' ? 'heading' : 'body', f = schrift(art);
    const soll = typeof st.size === 'number' ? st.size : (ty.sizes[st.size || 'body'] || ty.sizes.body);
    const bold = st.bold !== undefined ? !!st.bold : (art === 'heading' && ty.headingBold !== false);
    if (st.uppercase) absaetze = absaetze.map(a => ({ ...a, text: a.text.toLocaleUpperCase('de-DE') }));
    const fit = einpassen(absaetze, box.w / 100 * FOLIE_PT.w, box.h / 100 * FOLIE_PT.h, { pt: soll, font: f.face, bold, lineHeight: ty.lineHeight });
    return {
      art: 'text', ...box, absaetze: fit.absaetze, schrift: f.face, schriftCss: f.css,
      pt: fit.pt, sollPt: soll, farbe: farbeVon(C, st.color || 'text') || C.text, align: st.align || 'left', valign: st.valign || 'top',
      bold, italic: !!st.italic, zeilenhoehe: ty.lineHeight, ...(fit.gekuerzt ? { gekuerzt: true } : {}), ...extra
    };
  }
  const bildEl = (box, ref, fit, extra = {}) => {
    const a = system.asset(ref);
    /* Grafiken der Person (Diagramme, Screenshots) werden ganz gezeigt, nie beschnitten */
    if (a && a.fit && !extra.logo && !extra.deko) fit = a.fit;
    return { art: 'bild', ...box, fit: fit || 'cover', src: a ? system.assetUrl(a.id) : null, assetId: a ? a.id : null, alt: a ? (a.beschreibung || a.id) : '', ...(a && a.w && a.h ? { ratio: a.w / a.h } : {}), ...extra };
  };
  const box = (x, y, w, h) => ({ x: r(x), y: r(y), w: r(w), h: r(h) });

  /* Reihe gleich aufgebauter Kacheln (Kennzahlen, Zeitstrahl) */
  function itemsEl(ph, liste) {
    if (ph.variante === 'frei' && ph.zellen) return zellenEl(ph, liste);
    const out = [], n = liste.length, gap = T.spacing.gap, iw = (ph.w - gap * (n - 1)) / n;
    const variante = ph.variante || 'schlicht', anteile = ph.felder.reduce((s, f) => s + (f.anteil || 1), 0);
    const fliessend = variante !== 'karten';
    /* Gleiche Felder bekommen in allen Kacheln dieselbe Schriftgröße: die kleinste, die irgendwo nötig ist */
    const innen = variante === 'karten' ? { w: iw * 0.86, h: ph.h * 0.84 } : { w: iw * 0.94, h: ph.h - (variante === 'zeitstrahl' ? 6 : 3) };
    const groesse = Object.fromEntries(ph.felder.map(fd => [fd.id, Math.min(...liste.map(it => textEl(box(0, 0, innen.w, innen.h * (fd.anteil || 1) / anteile), [{ text: String(it[fd.id] || '') }], fd.style).pt))]));
    if (variante === 'zeitstrahl') out.push({ art: 'form', form: 'rect', ...box(ph.x, ph.y + 1.1, ph.w, 0.3), farbe: linie });
    liste.forEach((it, i) => {
      const x = ph.x + i * (iw + gap);
      let ix = x, iy = ph.y, w = iw, h = ph.h;
      if (variante === 'karten') {
        out.push({ art: 'form', form: 'rect', ...box(x, ph.y, iw, ph.h), farbe: farbeVon(C, ph.on || 'surface') || C.surface, radius: T.shapes.radius, schatten: T.shapes.shadow });
        ix += iw * 0.07; w = iw * 0.86; iy += ph.h * 0.08; h = ph.h * 0.84;
      } else if (variante === 'zeitstrahl') {
        out.push({ art: 'form', form: 'ellipse', ...box(x, ph.y, 1.4, 1.4 * 16 / 9), farbe: C.accent });
        iy += 6; h -= 6; w = iw * 0.94;
      } else {
        out.push({ art: 'form', form: 'rect', ...box(x, ph.y, iw, 0.3), farbe: linie });
        iy += 3; h -= 3; w = iw * 0.94;
      }
      let fy = iy;
      ph.felder.forEach(fd => {
        const fh = h * (fd.anteil || 1) / anteile;
        if (it[fd.id]) {
          const t = textEl(box(ix, fy, w, fh), [{ text: String(it[fd.id]) }], { ...fd.style, size: groesse[fd.id] }, { ph: ph.id, index: i, feld: fd.id });
          if (fliessend) {
            /* Felder rücken zusammen: jedes nimmt nur die Höhe, die sein Text braucht */
            t.valign = 'top';
            t.h = r(Math.min(fh, blockHoehe(t.absaetze, w / 100 * FOLIE_PT.w, t.pt, { font: t.schrift, bold: t.bold, lineHeight: t.zeilenhoehe }) / FOLIE_PT.h * 100 + 0.2));
            fy += t.h + 1.4;
          }
          out.push(t);
        }
        if (!fliessend) fy += fh;
      });
    });
    return out;
  }

  /* Kacheln mit festen Flächen je Feld (aus PowerPoint-Vorlagen): Rahmen und Deko kommen aus dem Layout */
  function zellenEl(ph, liste) {
    const out = [], n = Math.min(liste.length, ph.zellen.length);
    const groesse = Object.fromEntries(ph.felder.map(fd => {
      const pts = liste.slice(0, n).map((it, i) => { const c = ph.zellen[i][fd.id]; return c && it[fd.id] ? textEl(box(c.x, c.y, c.w, c.h), [{ text: String(it[fd.id]) }], fd.style).pt : Infinity; });
      return [fd.id, Math.min(...pts)];
    }));
    liste.slice(0, n).forEach((it, i) => ph.felder.forEach(fd => {
      const c = ph.zellen[i][fd.id];
      if (c && it[fd.id]) out.push(textEl(box(c.x, c.y, c.w, c.h), [{ text: String(it[fd.id]) }], { ...fd.style, ...(isFinite(groesse[fd.id]) ? { size: groesse[fd.id] } : {}) }, { ph: ph.id, index: i, feld: fd.id }));
    }));
    return out;
  }

  /* Tabelle der Person in der Inhaltsfläche: Schrift so groß wie möglich, höchstens Fließtext.
     Spalten so breit wie ihr Inhalt, Zahlenspalten rechtsbündig, Text bricht um. Was auch in der
     kleinsten Schrift nicht passt, wird abgeschnitten und markiert. */
  function tabelleEl(t, fl) {
    const kopf = (t.kopf || []).map(c => String(c ?? '')), roh = (t.zeilen || []).map(z => (z || []).map(c => String(c ?? '')));
    const n = Math.max(kopf.length, ...roh.map(z => z.length), 0);
    if (!n) return null;
    let zellen = [...(kopf.length ? [kopf] : []), ...roh].map(z => Array.from({ length: n }, (_, j) => z[j] || ''));
    const W = fl.w / 100 * FOLIE_PT.w, H = fl.h / 100 * FOLIE_PT.h, f = schrift('body'), lh = 1.2;
    const zahl = c => /^[-+−–]?\s?(€|\$|£)?\s?\d[\d.,'\s]*\s?(%|‰|€|\$|£|Mio\.?|Mrd\.?|Tsd\.?|T€|k)?(\s?(€|\$))?$/i.test(c.trim());
    const daten = kopf.length ? zellen.slice(1) : zellen;
    const align = Array.from({ length: n }, (_, j) => { const v = daten.map(z => z[j]).filter(Boolean); return j > 0 && v.length && v.filter(zahl).length >= v.length * 0.6 ? 'right' : 'left'; });
    const stil = i => ({ font: f.face, bold: !!kopf.length && i === 0, lineHeight: lh });
    const soll = Math.min(ty.sizes.body || 18, 20), min = 9;
    const rechne = pt => {
      const px = pt * 0.55, py = pt * 0.34;
      const natur = Array.from({ length: n }, (_, j) => Math.max(...zellen.map((z, i) => textBreite(z[j], pt, stil(i)))) + 2 * px);
      const wort = Array.from({ length: n }, (_, j) => Math.max(...zellen.map((z, i) => Math.max(0, ...z[j].split(/\s+/).map(w => textBreite(w, pt, stil(i)))))) + 2 * px);
      if (wort.reduce((a, b) => a + b, 0) > W) return null;
      const summe = natur.reduce((a, b) => a + b, 0);
      let breiten;
      if (summe <= W) {
        /* Luft verteilen: kleine Tabellen werden etwas breiter, aber nicht auf jede Fläche gezogen */
        const ziel = Math.min(W, Math.max(summe * 1.3, W * 0.62));
        breiten = natur.map(b => b * ziel / summe);
      } else {
        /* Zu breit: Textspalten umbrechen, jede höchstens bis auf ihr längstes Wort */
        breiten = natur.slice();
        for (let s = 0; s < 60 && breiten.reduce((a, b) => a + b, 0) > W + 0.1; s++) {
          const ueber = breiten.reduce((a, b) => a + b, 0) - W, dehnbar = breiten.map((b, j) => b - wort[j]), luft = dehnbar.reduce((a, b) => a + b, 0);
          if (luft <= 0.1) return null;
          breiten = breiten.map((b, j) => b - ueber * dehnbar[j] / luft);
        }
      }
      const hoehen = zellen.map((z, i) => Math.max(...z.map((c, j) => zeilenZahl(c || ' ', Math.max(1, breiten[j] - 2 * px), pt, stil(i)))) * pt * lh + 2 * py);
      return { pt, px, py, breiten, hoehen };
    };
    let g = null;
    for (let pt = soll; pt >= min && !(g && g.hoehen.reduce((a, b) => a + b, 0) <= H); pt -= 0.5) g = rechne(pt) || g;
    if (!g) g = rechne(min) || { pt: min, px: min * 0.55, py: min * 0.34, breiten: Array(n).fill(W / n), hoehen: zellen.map(() => min * lh + min * 0.68) };
    let gekuerzt = false;
    while (zellen.length > 1 && g.hoehen.reduce((a, b) => a + b, 0) > H + 0.5) { zellen = zellen.slice(0, -1); g.hoehen = g.hoehen.slice(0, -1); gekuerzt = true; }
    const w = g.breiten.reduce((a, b) => a + b, 0), h = g.hoehen.reduce((a, b) => a + b, 0);
    return {
      art: 'tabelle', ...box(fl.x, fl.y, w / FOLIE_PT.w * 100, h / FOLIE_PT.h * 100), kopf: !!kopf.length, zellen,
      spalten: g.breiten.map((b, j) => ({ w: r(b / FOLIE_PT.w * 100), align: align[j] })), zeilenH: g.hoehen.map(x => r(x / FOLIE_PT.h * 100)),
      pt: g.pt, px: r(g.px), py: r(g.py), schrift: f.face, schriftCss: f.css, zeilenhoehe: lh,
      farbe: C.text, kopfLinie: C.primary || C.text, linie: C.border || C.textMuted || C.text, ph: 'tabelle', ...(gekuerzt ? { gekuerzt: true } : {})
    };
  }

  /* Gestaltung ohne Inhalt */
  const farbe = f => farbeVon(C, f) || C.text;
  function dekoEl(d) {
    const b = box(d.x, d.y, d.w, d.h), dreh = { ...(d.rot ? { rot: d.rot } : {}), ...(d.flipH ? { flipH: true } : {}), ...(d.flipV ? { flipV: true } : {}) };
    if (d.shape === 'image') return bildEl(b, d.asset, d.fit || 'cover', { deko: true, ...(d.logo ? { logo: true } : {}), ...(d.opacity !== undefined && d.opacity < 1 ? { deckkraft: d.opacity } : {}), ...dreh });
    if (d.shape === 'text') return textEl(b, [{ text: String(d.text || '') }], d.style || {}, { deko: true });
    const f = { art: 'form', form: d.shape === 'ellipse' ? 'ellipse' : d.shape === 'line' ? 'line' : d.shape === 'pfad' ? 'pfad' : d.shape === 'preset' ? 'preset' : 'rect', ...b, ...dreh };
    if (d.fill !== undefined && d.shape !== 'line') f.farbe = farbe(d.fill);
    if (d.opacity !== undefined && d.opacity < 1) f.deckkraft = d.opacity;
    if (d.rounded) f.radius = T.shapes.radius;
    if (d.radius) f.radius = d.radius;
    const strich = d.stroke !== undefined ? d.stroke : d.shape === 'line' ? d.fill : undefined;
    if (strich !== undefined) f.linie = { farbe: farbe(strich), pt: d.strokeWidth || T.shapes.lineWidth || 1, ...(d.strokeOpacity !== undefined && d.strokeOpacity < 1 ? { deckkraft: d.strokeOpacity } : {}) };
    if (d.prst) f.prst = d.prst;
    if (d.pfad) f.pfad = d.pfad;
    return f;
  }

  return spec.folien.map((f, i) => {
    const grund = system.layout(f.layoutId) || system.layoutForTyp(f.layoutId);
    const layout = opts.anpassen === false ? grund : passeAn(grund, f.anpassung);
    const inhalt = f.inhalt || {}, el = [], bilder = [];
    const auto = { pageNumber: String(i + 1), presentationTitle: spec.titel || '', date: opts.datum || '' };
    const istInhalt = new Set(inhaltsPlatzhalter(layout).map(p => p.id));
    /* Tabelle: belegt die Inhaltsfläche, deren Platzhalter bleiben leer */
    const tabFl = istTabelle(f.tabelle) ? tabellenFlaeche(layout) : null;
    if (tabFl) { tabFl.ids.forEach(id => istInhalt.delete(id)); const t = tabelleEl(f.tabelle, tabFl); if (t) el.push(t); }

    layout.placeholders.forEach(ph => {
      const b = box(ph.x, ph.y, ph.w, ph.h), v = inhalt[ph.id];
      if (ph.typ === 'logo') { el.push(bildEl(b, ph.asset, ph.fit || 'contain', { ph: ph.id, logo: true })); return; }
      if (ph.auto) { if (auto[ph.auto]) el.push(textEl(b, [{ text: auto[ph.auto] }], ph.style, { ph: ph.id, auto: ph.auto })); return; }
      if (!istInhalt.has(ph.id)) return;
      if (ph.typ === 'image') { bilder.push(bildEl(b, (typeof v === 'string' && system.asset(v)) ? v : ph.asset, ph.fit, { ph: ph.id })); return; }
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return;
      if (ph.typ === 'text') el.push(textEl(b, [{ text: String(v) }], ph.style, { ph: ph.id }));
      else if (ph.typ === 'bullets') el.push(textEl(b, [].concat(v).map(t => ({ text: String(t), bullet: (ph.style || {}).bullet || 'dot' })), ph.style, { ph: ph.id }));
      else if (ph.typ === 'items') el.push(...itemsEl(ph, [].concat(v).filter(x => x && typeof x === 'object').slice(0, ph.maxItems)));
    });

    /* Reihenfolge von hinten nach vorn: Deko „hinten“, Bilder, übrige Deko, feste Texte, Inhalte und Logos */
    const dk = layout.deko || [], hinten = dk.filter(d => d.hinten).map(dekoEl), vorn = dk.filter(d => !d.hinten && d.shape !== 'text').map(dekoEl), texte = dk.filter(d => !d.hinten && d.shape === 'text').map(dekoEl);
    return { nr: i + 1, ...(f.id ? { id: f.id } : {}), layoutId: layout.id, typ: layout.typ, background: farbeVon(C, layout.background) || C.background, elemente: [...hinten, ...bilder, ...vorn, ...texte, ...el], notizen: f.notizen || '' };
  });
}
const r = v => Math.round(v * 100) / 100;

/* Kompakte Textfassung des Modells für Snapshot-Tests und zum Vergleichen */
export function modellText(folien) {
  return folien.map(f => [`# ${f.nr} ${f.layoutId} ${f.background}`, ...f.elemente.map(e => {
    const p = `${e.x},${e.y},${e.w},${e.h}`;
    if (e.art === 'form') return `  form ${e.form} ${p} ${e.farbe}${e.deckkraft !== undefined ? ' ' + e.deckkraft : ''}${e.linie ? ` linie ${e.linie.farbe} ${e.linie.pt}` : ''}${e.rot ? ' rot ' + e.rot : ''}`;
    if (e.art === 'bild') return `  bild ${p} ${e.fit} ${e.assetId}`;
    return `  text ${p} ${e.schrift} ${e.pt}pt ${e.farbe} ${e.align}/${e.valign}${e.bold ? ' fett' : ''}${e.gekuerzt ? ' GEKÜRZT' : ''} | ${e.absaetze.map(a => (a.bullet ? '• ' : '') + a.text).join(' ¶ ')}`;
  })].join('\n')).join('\n');
}
