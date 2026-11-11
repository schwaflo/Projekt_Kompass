/* ============================================================
   Präsentationsgenerator – Bilder für den Export (nur Browser)
   Jedes Bild wird auf einer Zeichenfläche genau so zugeschnitten,
   wie es auf der Folie erscheint, und als PNG oder JPG eingebettet.
   So kommen auch SVG-Dateien in PowerPoint, LibreOffice und
   Google Slides gleich an, und kein Programm muss selbst beschneiden.
   ============================================================ */
import { ZOLL } from './render-pptx.js';

const cache = new Map();

function lade(src) {
  return new Promise((ok, fehler) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => ok(img);
    img.onerror = () => fehler(new Error(`Bild „${src}“ konnte nicht geladen werden.`));
    img.src = src;
  });
}

/* Element aus dem Folienmodell → { data, x, y, w, h } (Maße in Zoll) */
export async function ladeBild(e) {
  const key = [e.src, e.fit, e.w, e.h].join('|');
  if (!cache.has(key)) cache.set(key, zeichne(e).catch(err => { cache.delete(key); console.warn(err.message); return null; }));
  const b = await cache.get(key);
  if (!b) return null;
  const bx = e.x / 100 * ZOLL.w, by = e.y / 100 * ZOLL.h, bw = e.w / 100 * ZOLL.w, bh = e.h / 100 * ZOLL.h;
  /* eingepasste Bilder sitzen mittig in ihrer Fläche */
  return { data: b.data, x: bx + (bw - b.w) / 2, y: by + (bh - b.h) / 2, w: b.w, h: b.h };
}

async function zeichne(e) {
  const img = await lade(e.src);
  const iw = img.naturalWidth || 1200, ih = img.naturalHeight || 800, ri = iw / ih;
  const bw = e.w / 100 * ZOLL.w, bh = e.h / 100 * ZOLL.h, rb = bw / bh;
  const c = document.createElement('canvas'), g = c.getContext('2d');
  if (e.fit === 'contain') {
    const w = ri > rb ? bw : bh * ri, h = ri > rb ? bw / ri : bh;
    c.width = Math.min(1600, Math.max(64, Math.round(w * 300))); c.height = Math.max(1, Math.round(c.width / ri));
    g.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/png'), w, h };
  }
  /* füllend: mittig beschneiden */
  c.width = Math.min(2400, Math.max(64, Math.round(bw * 180))); c.height = Math.max(1, Math.round(c.width / rb));
  const sw = ri > rb ? ih * rb : iw, sh = ri > rb ? ih : iw / rb;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  return { data: c.toDataURL('image/jpeg', 0.9), w: bw, h: bh };
}
