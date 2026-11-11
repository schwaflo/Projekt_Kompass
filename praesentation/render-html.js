/* ============================================================
   Präsentationsgenerator – HTML-Vorschau
   Zeichnet das Folienmodell aus layout.js. Alle Maße hängen an
   der Breite der Folie (Einheit cqw), die Vorschau skaliert also
   ohne JavaScript von der Miniatur bis zum Vollbild.
   ============================================================ */

export const FOLIEN_CSS = `
.pf { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; container-type: inline-size; text-align: left; }
.pf > * { position: absolute; box-sizing: border-box; margin: 0; }
.pf-t { display: flex; flex-direction: column; overflow-wrap: anywhere; }
.pf-t p { margin: 0; }
.pf-t p + p { margin-top: .3em; }
.pf-t p.pf-b { position: relative; padding-left: 1.25em; }
.pf-t p.pf-b + p.pf-b { margin-top: .5em; }
.pf-t p.pf-b::before { content: attr(data-z); position: absolute; left: 0; }
.pf-i img { width: 100%; height: 100%; display: block; }
.pf-leer { display: grid; place-items: center; border: .15cqw dashed currentColor; opacity: .45; font: 1.6cqw sans-serif; }
`;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cqw = pt => (pt / 9.6).toFixed(3) + 'cqw';
const pos = e => `left:${e.x}%;top:${e.y}%;width:${e.w}%;height:${e.h}%;`;
const VALIGN = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
const zeichen = (a, n) => a.bullet === 'dash' ? '–' : a.bullet === 'number' ? n + '.' : a.bullet === 'none' ? '' : '•';
const SCHATTEN = { soft: '0 .4cqw 1.4cqw rgba(0,0,0,.10)', hard: '.3cqw .3cqw 0 rgba(0,0,0,.18)' };

function element(e) {
  if (e.art === 'form') {
    const rund = e.form === 'ellipse' ? 'border-radius:50%;' : e.radius ? `border-radius:${cqw(e.radius)};` : '';
    return `<div style="${pos(e)}background:${e.farbe};${rund}${e.deckkraft !== undefined ? `opacity:${e.deckkraft};` : ''}${SCHATTEN[e.schatten] ? `box-shadow:${SCHATTEN[e.schatten]};` : ''}"></div>`;
  }
  if (e.art === 'bild') {
    if (!e.src) return `<div class="pf-leer" style="${pos(e)}">Bild</div>`;
    return `<div class="pf-i" style="${pos(e)}"><img src="${esc(e.src)}" alt="${esc(e.alt)}" style="object-fit:${e.fit === 'contain' ? 'contain' : 'cover'}"></div>`;
  }
  let n = 0;
  const abs = e.absaetze.map(a => a.bullet ? `<p class="pf-b" data-z="${esc(zeichen(a, ++n))}">${esc(a.text)}</p>` : `<p>${esc(a.text).replace(/\n/g, '<br>')}</p>`).join('');
  const daten = `data-ph="${esc(e.ph || '')}"${e.index !== undefined ? ` data-index="${e.index}" data-feld="${esc(e.feld)}"` : ''}${e.auto ? ' data-auto="1"' : ''}`;
  return `<div class="pf-t" ${daten} style="${pos(e)}justify-content:${VALIGN[e.valign] || 'flex-start'};text-align:${e.align};font-family:${esc(e.schriftCss)};font-size:${cqw(e.pt)};line-height:${e.zeilenhoehe};color:${e.farbe};font-weight:${e.bold ? 700 : 400};${e.italic ? 'font-style:italic;' : ''}">${abs}</div>`;
}

/* Eine Folie als HTML */
export function slideHTML(folie) {
  return `<div class="pf" data-folie="${folie.nr}" data-layout="${esc(folie.layoutId)}" style="background:${folie.background}">${folie.elemente.map(element).join('')}</div>`;
}

/* Adresse des Google-Fonts-Stylesheets für die Wunschschriften eines Designsystems */
export function fontUrl(system) {
  const ty = system.tokens.typography;
  if (!ty.googleFonts) return null;
  const fam = [...new Set([ty.headingFont, ty.bodyFont])].map(f => 'family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':ital,wght@0,400;0,700;1,400');
  return `https://fonts.googleapis.com/css2?${fam.join('&')}&display=swap`;
}
