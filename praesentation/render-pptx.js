/* ============================================================
   Präsentationsgenerator – PowerPoint-Export
   Schreibt das Folienmodell aus layout.js mit PptxGenJS in eine
   .pptx. Texte bleiben echte, bearbeitbare Textfelder.
   PptxGenJS und das Laden der Bilder werden übergeben, damit
   dieses Modul im Browser und in Node gleich funktioniert.
   ============================================================ */
import { einzug, absatzAbstand } from './text.js';

export const ZOLL = { w: 13.333, h: 7.5 };
const hex = c => String(c).replace('#', '').toUpperCase();
const X = p => +(p / 100 * ZOLL.w).toFixed(4), Y = p => +(p / 100 * ZOLL.h).toFixed(4);
/* Freie Form (Koordinaten 0 bis 1) → Punkte für PptxGenJS (Zoll, relativ zur Form) */
const punkte = (pfad, w, h) => pfad.map(([b, ...v]) => {
  const p = (i) => ({ x: +(v[i] * w).toFixed(4), y: +(v[i + 1] * h).toFixed(4) });
  if (b === 'M') return { ...p(0), moveTo: true };
  if (b === 'L') return p(0);
  if (b === 'C') { const a = p(0), c = p(2); return { ...p(4), curve: { type: 'cubic', x1: a.x, y1: a.y, x2: c.x, y2: c.y } }; }
  if (b === 'Q') { const a = p(0); return { ...p(2), curve: { type: 'quadratic', x1: a.x, y1: a.y } }; }
  return { close: true };
});

/* folien: Ergebnis von buildSlides
   opts.PptxGenJS: der Konstruktor (im Browser window.PptxGenJS)
   opts.ladeBild(element) → { data, x, y, w, h } in Zoll, oder null
   Liefert das PptxGenJS-Objekt; speichern mit .write({ outputType: 'blob' }) oder .writeFile(). */
export async function exportPptx(folien, opts) {
  const pptx = new opts.PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = opts.titel || 'Präsentation';
  pptx.author = opts.autor || 'Projekt-Kompass';
  pptx.company = opts.autor || 'Projekt-Kompass';

  for (const f of folien) {
    const s = pptx.addSlide();
    s.background = { color: hex(f.background) };
    for (const e of f.elemente) {
      if (e.art === 'form') {
        const rund = (e.form === 'rect' || e.form === 'preset') && e.radius;
        const typen = Object.values(pptx.ShapeType || {});
        const form = e.form === 'ellipse' ? pptx.ShapeType.ellipse : e.form === 'line' ? pptx.ShapeType.line : e.form === 'pfad' && e.pfad ? 'custGeom'
          : e.form === 'preset' && typen.includes(e.prst) ? e.prst : rund ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
        const durchsicht = a => a !== undefined && a < 1 ? { transparency: Math.round((1 - a) * 100) } : {};
        const w = X(e.w), h = Y(e.h);
        s.addShape(form, {
          x: X(e.x), y: Y(e.y), w, h,
          ...(e.form === 'line' ? {} : e.farbe ? { fill: { color: hex(e.farbe), ...durchsicht(e.deckkraft) } } : { fill: { color: 'FFFFFF', transparency: 100 } }),
          ...(e.linie ? { line: { color: hex(e.linie.farbe), width: e.linie.pt, ...durchsicht(e.linie.deckkraft) } } : {}),
          ...(e.rot ? { rotate: e.rot } : {}), ...(e.flipH ? { flipH: true } : {}), ...(e.flipV ? { flipV: true } : {}),
          ...(form === 'custGeom' ? { points: punkte(e.pfad, w, h) } : {}),
          ...(rund ? { rectRadius: e.radius / 72 } : {}),
          ...(e.schatten === 'soft' ? { shadow: { type: 'outer', color: '000000', opacity: 0.12, blur: 10, offset: 3, angle: 90 } } : {}),
          ...(e.schatten === 'hard' ? { shadow: { type: 'outer', color: '000000', opacity: 0.2, blur: 0, offset: 3, angle: 45 } } : {})
        });
      } else if (e.art === 'bild') {
        const b = e.src && opts.ladeBild ? await opts.ladeBild(e) : null;
        if (b) s.addImage({ data: b.data.replace(/^data:/, ''), x: b.x, y: b.y, w: b.w, h: b.h, altText: e.alt || '', ...(e.rot ? { rotate: e.rot } : {}), ...(e.flipH ? { flipH: true } : {}), ...(e.deckkraft !== undefined ? { transparency: Math.round((1 - e.deckkraft) * 100) } : {}) });
      } else if (e.art === 'tabelle') {
        /* Echte PowerPoint-Tabelle: Linie unter dem Kopf, feine Linien zwischen den Zeilen, keine senkrechten Linien */
        const ohne = { type: 'none' }, linie = (pt, farbe) => [ohne, ohne, { type: 'solid', pt, color: hex(farbe) }, ohne];
        const zeilen = e.zellen.map((z, i) => z.map((t, j) => ({ text: t, options: { align: e.spalten[j].align, bold: e.kopf && i === 0, border: e.kopf && i === 0 ? linie(1.5, e.kopfLinie) : linie(0.75, e.linie) } })));
        s.addTable(zeilen, {
          x: X(e.x), y: Y(e.y), w: X(e.w), colW: e.spalten.map(sp => X(sp.w)), rowH: e.zeilenH.map(h => Y(h)),
          fontFace: e.schrift, fontSize: e.pt, color: hex(e.farbe), valign: 'top', margin: [e.py, e.px, e.py, e.px].map(v => Math.max(1, +v.toFixed(1))), autoPage: false
        });
      } else if (e.art === 'text') {
        const n = e.absaetze.length;
        const teile = e.absaetze.map((a, i) => ({
          text: a.text,
          options: {
            breakLine: i < n - 1,
            ...(i ? { paraSpaceBefore: +absatzAbstand(e.pt, !!a.bullet).toFixed(1) } : {}),
            ...(a.bullet && a.bullet !== 'none' ? { bullet: { indent: +einzug(e.pt).toFixed(1), ...(a.bullet === 'dash' ? { code: '2013' } : a.bullet === 'number' ? { type: 'number' } : {}) } } : {})
          }
        }));
        s.addText(teile, {
          x: X(e.x), y: Y(e.y), w: X(e.w), h: Y(e.h), margin: 0,
          fontFace: e.schrift, fontSize: e.pt, color: hex(e.farbe), bold: e.bold, italic: e.italic,
          align: e.align, valign: e.valign === 'middle' ? 'middle' : e.valign,
          lineSpacing: +(e.pt * e.zeilenhoehe).toFixed(1), fit: 'shrink', lang: 'de-DE'
        });
      }
    }
    if (f.notizen) s.addNotes(f.notizen);
  }
  return pptx;
}
