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
.pf-tab table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.pf-tab th, .pf-tab td { padding: var(--pf-py) var(--pf-px); vertical-align: top; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; font-weight: 400; }
.pf-tab th { font-weight: 700; border-bottom: .156cqw solid var(--pf-kopf); }
.pf-tab td { border-bottom: .078cqw solid var(--pf-linie); }
`;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cqw = pt => (pt / 9.6).toFixed(3) + 'cqw';
const pos = e => `left:${e.x}%;top:${e.y}%;width:${e.w}%;height:${e.h}%;`;
const VALIGN = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
const zeichen = (a, n) => a.bullet === 'dash' ? '–' : a.bullet === 'number' ? n + '.' : a.bullet === 'none' ? '' : '•';
const SCHATTEN = { soft: '0 .4cqw 1.4cqw rgba(0,0,0,.10)', hard: '.3cqw .3cqw 0 rgba(0,0,0,.18)' };

/* PowerPoint-Grundformen, die die Vorschau nachzeichnen kann (Umriss in Prozent der Box) */
const PRESET = {
  triangle: '50% 0,100% 100%,0 100%', rtTriangle: '0 0,100% 100%,0 100%', diamond: '50% 0,100% 50%,50% 100%,0 50%',
  parallelogram: '25% 0,100% 0,75% 100%,0 100%', trapezoid: '25% 0,75% 0,100% 100%,0 100%', homePlate: '0 0,75% 0,100% 50%,75% 100%,0 100%',
  pentagon: '50% 0,100% 38%,82% 100%,18% 100%,0 38%', chevron: '0 0,75% 0,100% 50%,75% 100%,0 100%,25% 50%', hexagon: '25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%',
  octagon: '29% 0,71% 0,100% 29%,100% 71%,71% 100%,29% 100%,0 71%,0 29%', snip1Rect: '0 0,84% 0,100% 16%,100% 100%,0 100%', snip2DiagRect: '0 0,84% 0,100% 16%,100% 100%,16% 100%,0 84%',
  rightArrow: '0 25%,60% 25%,60% 0,100% 50%,60% 100%,60% 75%,0 75%', leftArrow: '100% 25%,40% 25%,40% 0,0 50%,40% 100%,40% 75%,100% 75%', flowChartOffpageConnector: '0 0,100% 0,100% 80%,50% 100%,0 80%'
};
const RUND = /ellipse|oval|circle|donut|pie|chord|arc|moon|flowChartConnector/i;
const dreh = e => e.rot || e.flipH || e.flipV ? `transform:${e.rot ? `rotate(${e.rot}deg)` : ''}${e.flipH ? ' scaleX(-1)' : ''}${e.flipV ? ' scaleY(-1)' : ''};` : '';
const rgba = (hex, a) => a === undefined || a >= 1 ? hex : `rgba(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;
const svgPfad = p => p.map(([b, ...v]) => b + v.join(' ')).join(' ');

function element(e) {
  if (e.art === 'form') {
    const strich = e.linie ? { farbe: rgba(e.linie.farbe, e.linie.deckkraft), breite: (e.linie.pt / 9.6).toFixed(3) + 'cqw' } : null;
    if (e.form === 'line') {
      const [x1, y1, x2, y2] = [e.flipH ? 100 : 0, e.flipV ? 100 : 0, e.flipH ? 0 : 100, e.flipV ? 0 : 100];
      return `<svg style="${pos(e)}overflow:visible;${e.rot ? `transform:rotate(${e.rot}deg);` : ''}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strich ? strich.farbe : e.farbe}" style="stroke-width:${strich ? strich.breite : '.1cqw'}" vector-effect="non-scaling-stroke"/></svg>`;
    }
    if (e.form === 'pfad' && e.pfad) {
      return `<svg style="${pos(e)}overflow:visible;${dreh(e)}" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true"><path d="${svgPfad(e.pfad)}" fill="${e.farbe ? rgba(e.farbe, e.deckkraft) : 'none'}"${strich ? ` stroke="${strich.farbe}" style="stroke-width:${strich.breite}" vector-effect="non-scaling-stroke"` : ''}/></svg>`;
    }
    const clip = e.form === 'preset' && PRESET[e.prst] ? `clip-path:polygon(${PRESET[e.prst]});` : '';
    const rund = e.form === 'ellipse' || (e.form === 'preset' && RUND.test(e.prst || '')) ? 'border-radius:50%;' : e.radius ? `border-radius:${cqw(e.radius)};` : '';
    const rand = strich && !clip ? `border:${strich.breite} solid ${strich.farbe};` : '';
    return `<div style="${pos(e)}${e.farbe ? `background:${e.farbe};` : ''}${rund}${clip}${rand}${e.deckkraft !== undefined ? `opacity:${e.deckkraft};` : ''}${SCHATTEN[e.schatten] ? `box-shadow:${SCHATTEN[e.schatten]};` : ''}${dreh(e)}"></div>`;
  }
  if (e.art === 'bild') {
    if (!e.src) return e.deko ? '' : `<div class="pf-leer" style="${pos(e)}">Bild</div>`;
    return `<div class="pf-i" style="${pos(e)}${e.deckkraft !== undefined ? `opacity:${e.deckkraft};` : ''}${dreh(e)}"><img src="${esc(e.src)}" alt="${esc(e.alt)}" style="object-fit:${e.fit === 'contain' ? 'contain' : 'cover'}"></div>`;
  }
  if (e.art === 'tabelle') {
    const zelle = (t, j, tag) => `<${tag} style="text-align:${e.spalten[j].align}">${esc(t)}</${tag}>`;
    const kopf = e.kopf ? e.zellen[0] : null, rumpf = e.kopf ? e.zellen.slice(1) : e.zellen;
    return `<div class="pf-tab" data-ph="tabelle" style="${pos(e)}font-family:${esc(e.schriftCss)};font-size:${cqw(e.pt)};line-height:${e.zeilenhoehe};color:${e.farbe};--pf-px:${cqw(e.px)};--pf-py:${cqw(e.py)};--pf-kopf:${e.kopfLinie};--pf-linie:${e.linie}"><table><colgroup>${e.spalten.map(sp => `<col style="width:${(sp.w / e.w * 100).toFixed(2)}%">`).join('')}</colgroup>${kopf ? `<thead><tr>${kopf.map((t, j) => zelle(t, j, 'th')).join('')}</tr></thead>` : ''}<tbody>${rumpf.map(z => `<tr>${z.map((t, j) => zelle(t, j, 'td')).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  let n = 0;
  const abs = e.absaetze.map(a => a.bullet ? `<p class="pf-b" data-z="${esc(zeichen(a, ++n))}">${esc(a.text)}</p>` : `<p>${esc(a.text).replace(/\n/g, '<br>')}</p>`).join('');
  const daten = `${e.deko ? 'data-deko="1" ' : ''}data-ph="${esc(e.ph || '')}"${e.index !== undefined ? ` data-index="${e.index}" data-feld="${esc(e.feld)}"` : ''}${e.auto ? ' data-auto="1"' : ''}`;
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
