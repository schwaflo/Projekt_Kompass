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
        const rund = e.form !== 'ellipse' && e.radius;
        s.addShape(e.form === 'ellipse' ? pptx.ShapeType.ellipse : rund ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
          x: X(e.x), y: Y(e.y), w: X(e.w), h: Y(e.h),
          fill: { color: hex(e.farbe), ...(e.deckkraft !== undefined ? { transparency: Math.round((1 - e.deckkraft) * 100) } : {}) },
          ...(rund ? { rectRadius: e.radius / 72 } : {}),
          ...(e.schatten === 'soft' ? { shadow: { type: 'outer', color: '000000', opacity: 0.12, blur: 10, offset: 3, angle: 90 } } : {}),
          ...(e.schatten === 'hard' ? { shadow: { type: 'outer', color: '000000', opacity: 0.2, blur: 0, offset: 3, angle: 45 } } : {})
        });
      } else if (e.art === 'bild') {
        const b = e.src && opts.ladeBild ? await opts.ladeBild(e) : null;
        if (b) s.addImage({ data: b.data.replace(/^data:/, ''), x: b.x, y: b.y, w: b.w, h: b.h, altText: e.alt || '' });
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
