/* ============================================================
   Präsentationsgenerator – Folienmodell
   buildSlides macht aus Slide-Spec + Designsystem eine Liste
   fertig berechneter Folien. Vorschau (render-html.js) und
   PowerPoint-Export (render-pptx.js) lesen nur dieses Modell,
   deshalb sehen beide gleich aus.

   Folie:   { nr, layoutId, typ, background, elemente[], notizen }
   Element: { art: 'form' | 'bild' | 'text', x, y, w, h (Prozent), … }
   ============================================================ */
import { inhaltsPlatzhalter } from './spec.js';
import { einpassen, blockHoehe } from './text.js';

export const FOLIE_PT = { w: 960, h: 540 };

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
      pt: fit.pt, sollPt: soll, farbe: C[st.color || 'text'], align: st.align || 'left', valign: st.valign || 'top',
      bold, italic: !!st.italic, zeilenhoehe: ty.lineHeight, ...(fit.gekuerzt ? { gekuerzt: true } : {}), ...extra
    };
  }
  const bildEl = (box, ref, fit, extra = {}) => {
    const a = system.asset(ref);
    return { art: 'bild', ...box, fit: fit || 'cover', src: a ? system.assetUrl(a.id) : null, assetId: a ? a.id : null, alt: a ? (a.beschreibung || a.id) : '', ...(a && a.w && a.h ? { ratio: a.w / a.h } : {}), ...extra };
  };
  const box = (x, y, w, h) => ({ x: r(x), y: r(y), w: r(w), h: r(h) });

  /* Reihe gleich aufgebauter Kacheln (Kennzahlen, Zeitstrahl) */
  function itemsEl(ph, liste) {
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
        out.push({ art: 'form', form: 'rect', ...box(x, ph.y, iw, ph.h), farbe: C[ph.on || 'surface'], radius: T.shapes.radius, schatten: T.shapes.shadow });
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

  return spec.folien.map((f, i) => {
    const layout = system.layout(f.layoutId) || system.layoutForTyp(f.layoutId);
    const inhalt = f.inhalt || {}, el = [], bilder = [];
    const auto = { pageNumber: String(i + 1), presentationTitle: spec.titel || '', date: opts.datum || '' };
    const istInhalt = new Set(inhaltsPlatzhalter(layout).map(p => p.id));

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

    /* Reihenfolge von hinten nach vorn: Bilder, Deko, Texte und Logos */
    const deko = (layout.deko || []).map(d => ({ art: 'form', form: d.shape === 'ellipse' ? 'ellipse' : 'rect', ...box(d.x, d.y, d.w, d.h), farbe: C[d.fill], ...(d.opacity !== undefined && d.opacity < 1 ? { deckkraft: d.opacity } : {}), ...(d.rounded ? { radius: T.shapes.radius } : {}) }));
    return { nr: i + 1, ...(f.id ? { id: f.id } : {}), layoutId: layout.id, typ: layout.typ, background: C[layout.background], elemente: [...bilder, ...deko, ...el], notizen: f.notizen || '' };
  });
}
const r = v => Math.round(v * 100) / 100;

/* Kompakte Textfassung des Modells für Snapshot-Tests und zum Vergleichen */
export function modellText(folien) {
  return folien.map(f => [`# ${f.nr} ${f.layoutId} ${f.background}`, ...f.elemente.map(e => {
    const p = `${e.x},${e.y},${e.w},${e.h}`;
    if (e.art === 'form') return `  form ${e.form} ${p} ${e.farbe}${e.deckkraft !== undefined ? ' ' + e.deckkraft : ''}`;
    if (e.art === 'bild') return `  bild ${p} ${e.fit} ${e.assetId}`;
    return `  text ${p} ${e.schrift} ${e.pt}pt ${e.farbe} ${e.align}/${e.valign}${e.bold ? ' fett' : ''}${e.gekuerzt ? ' GEKÜRZT' : ''} | ${e.absaetze.map(a => (a.bullet ? '• ' : '') + a.text).join(' ¶ ')}`;
  })].join('\n')).join('\n');
}
