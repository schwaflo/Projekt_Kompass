/* ============================================================
   Präsentationsgenerator – PowerPoint-Dateien lesen (nur Browser)
   Liest aus den XML-Teilen einer .pptx oder .potx alles, was eine
   Folie ausmacht: Formen mit Füllung, Linie, Drehung und Geometrie,
   Bilder mit Zuschnitt, Gruppen, Texte mit ihren Stilen, Hintergründe
   und Platzhalter, jeweils mit der Vererbung Master → Layout → Folie.

   Ergebnis je Fläche (Master, Layout oder Folie):
   { name, typ, zeigeMaster, hintergrund, elemente[] }
   Element: { art: 'form' | 'bild', name, ph, box (EMU), rot, flipH, flipV,
              geo, adj, pfad, fuellung, linie, text, bild }
   ============================================================ */

export const xml = text => new DOMParser().parseFromString(text, 'application/xml');
const kinder = (el, name) => el ? [...el.children].filter(c => c.tagName === name) : [];
const kind = (el, name) => el ? [...el.children].find(c => c.tagName === name) || null : null;
const pfad = (el, ...namen) => namen.reduce((e, n) => kind(e, n), el);
const zahl = (el, attr, std = 0) => el && el.hasAttribute(attr) ? +el.getAttribute(attr) : std;
const an = (el, attr) => el && el.hasAttribute(attr) ? ['1', 'true'].includes(el.getAttribute(attr)) : undefined;

/* ---------- Farben ---------- */
const PRST = { black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#008000', blue: '#0000FF', yellow: '#FFFF00', gray: '#808080', grey: '#808080', darkGray: '#A9A9A9', lightGray: '#D3D3D3' };
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const hexAus = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
function zuHsl([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function ausHsl([h, s, l]) {
  if (!s) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const t = x => { x = (x + 1) % 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
  return [t(h + 1 / 3), t(h), t(h - 1 / 3)];
}

/* el: Element, das genau eine Farbangabe enthält (a:solidFill, a:fgClr, a:fillRef …).
   ctx: { theme: { dk1: '#…', … }, clrMap: { bg1: 'lt1', … }, phClr } → { hex, alpha } oder null */
export function farbe(el, ctx) {
  const c = el && [...el.children].find(x => /^a:(srgbClr|schemeClr|sysClr|prstClr|scrgbClr|hslClr)$/.test(x.tagName));
  if (!c) return null;
  let hex = null;
  const v = c.getAttribute('val');
  if (c.tagName === 'a:srgbClr') hex = '#' + String(v).toUpperCase();
  else if (c.tagName === 'a:sysClr') hex = '#' + String(c.getAttribute('lastClr') || (v === 'window' ? 'FFFFFF' : '000000')).toUpperCase();
  else if (c.tagName === 'a:prstClr') hex = PRST[v] || '#000000';
  else if (c.tagName === 'a:scrgbClr') hex = hexAus(['r', 'g', 'b'].map(k => { const x = zahl(c, k) / 100000; return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; }));
  else if (c.tagName === 'a:hslClr') hex = hexAus(ausHsl([zahl(c, 'hue') / 21600000, zahl(c, 'sat') / 100000, zahl(c, 'lum') / 100000]));
  else if (c.tagName === 'a:schemeClr') {
    if (v === 'phClr') hex = ctx.phClr || null;
    else hex = ctx.theme[(ctx.clrMap || {})[v] || v] || ctx.theme[v] || null;
  }
  if (!hex || !/^#[0-9A-F]{6}$/.test(hex)) return null;
  let a = rgb(hex), alpha = 1;
  for (const m of c.children) {
    const w = zahl(m, 'val') / 100000;
    switch (m.tagName) {
      case 'a:lumMod': { const h = zuHsl(a); h[2] *= w; a = ausHsl(h); break; }
      case 'a:lumOff': { const h = zuHsl(a); h[2] = Math.min(1, h[2] + w); a = ausHsl(h); break; }
      case 'a:satMod': { const h = zuHsl(a); h[1] = Math.min(1, h[1] * w); a = ausHsl(h); break; }
      case 'a:tint': a = a.map(x => 1 - (1 - x) * w); break;
      case 'a:shade': a = a.map(x => x * w); break;
      case 'a:alpha': alpha = w; break;
      case 'a:alphaMod': alpha *= w; break;
    }
  }
  return { hex: hexAus(a), alpha: Math.round(alpha * 1000) / 1000 };
}

/* ---------- Theme ---------- */
export function leseTheme(text) {
  const d = xml(text), schema = d.getElementsByTagName('a:clrScheme')[0], theme = {};
  ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].forEach(k => {
    const f = farbe(kind(schema, 'a:' + k), { theme: {} });
    if (f) theme[k] = f.hex;
  });
  const schrift = art => { const el = d.getElementsByTagName('a:' + art)[0], l = kind(el, 'a:latin'); return l ? l.getAttribute('typeface') || '' : ''; };
  return { name: schema ? schema.getAttribute('name') || '' : '', farben: theme, major: schrift('majorFont'), minor: schrift('minorFont') };
}

/* ---------- Texte ---------- */
function runStil(el, ctx) {
  if (!el) return {};
  const out = {}, sz = zahl(el, 'sz', 0);
  if (sz) out.sz = sz / 100;
  const b = an(el, 'b'), i = an(el, 'i');
  if (b !== undefined) out.b = b;
  if (i !== undefined) out.i = i;
  if (el.hasAttribute('cap')) out.caps = el.getAttribute('cap') === 'all';
  const sf = kind(el, 'a:solidFill'), f = sf && farbe(sf, ctx);
  if (f) out.farbe = f;
  const latin = kind(el, 'a:latin');
  if (latin && latin.getAttribute('typeface')) out.font = latin.getAttribute('typeface');
  return out;
}
function absatzStil(el, ctx) {
  if (!el) return {};
  const out = { ...runStil(kind(el, 'a:defRPr'), ctx) };
  if (el.hasAttribute('algn')) out.algn = el.getAttribute('algn');
  if (kind(el, 'a:buNone')) out.bullet = false;
  else if (kind(el, 'a:buChar') || kind(el, 'a:buAutoNum')) out.bullet = kind(el, 'a:buAutoNum') ? 'number' : 'dot';
  return out;
}
/* Listenstil (a:lstStyle, p:titleStyle …) → { 1: {…}, 2: {…} } */
export function ebenen(el, ctx) {
  const out = {};
  if (!el) return out;
  for (let i = 1; i <= 9; i++) { const l = kind(el, `a:lvl${i}pPr`); if (l) out[i] = absatzStil(l, ctx); }
  return out;
}

function textKoerper(tx, ctx) {
  if (!tx) return null;
  const bp = kind(tx, 'a:bodyPr'), absaetze = [];
  for (const p of kinder(tx, 'a:p')) {
    const pPr = kind(p, 'a:pPr'), lvl = zahl(pPr, 'lvl', 0) + 1;
    let text = '', erster = null;
    for (const r of p.children) {
      if (r.tagName === 'a:r' || r.tagName === 'a:fld') { text += [...r.getElementsByTagName('a:t')].map(t => t.textContent).join(''); if (!erster) erster = kind(r, 'a:rPr'); }
      else if (r.tagName === 'a:br') text += '\n';
    }
    absaetze.push({ text, lvl, ...absatzStil(pPr, ctx), run: runStil(erster || kind(p, 'a:endParaRPr'), ctx) });
  }
  const ins = (a, std) => zahl(bp, a, std);
  return {
    anker: bp && bp.getAttribute('anchor') || '', vert: bp && bp.getAttribute('vert') || '',
    raender: { l: ins('lIns', 91440), r: ins('rIns', 91440), t: ins('tIns', 45720), b: ins('bIns', 45720) },
    schrumpfen: !!(bp && kind(bp, 'a:normAutofit')), skala: bp && kind(bp, 'a:normAutofit') ? zahl(kind(bp, 'a:normAutofit'), 'fontScale', 100000) / 100000 : 1,
    ebenen: ebenen(kind(tx, 'a:lstStyle'), ctx), absaetze
  };
}

/* ---------- Geometrie ---------- */
function transform(el) {
  const x = el && (kind(el, 'a:xfrm') || kind(el, 'p:xfrm'));
  if (!x) return null;
  const off = kind(x, 'a:off'), ext = kind(x, 'a:ext'), chOff = kind(x, 'a:chOff'), chExt = kind(x, 'a:chExt');
  if (!off || !ext) return null;
  return {
    box: { x: zahl(off, 'x'), y: zahl(off, 'y'), w: zahl(ext, 'cx'), h: zahl(ext, 'cy') },
    rot: zahl(x, 'rot') / 60000, flipH: an(x, 'flipH') || false, flipV: an(x, 'flipV') || false,
    ...(chOff && chExt ? { ch: { x: zahl(chOff, 'x'), y: zahl(chOff, 'y'), w: zahl(chExt, 'cx') || 1, h: zahl(chExt, 'cy') || 1 } } : {})
  };
}
/* Box aus dem Koordinatensystem einer Gruppe in das der Folie */
const abbilden = (box, gruppen) => gruppen.reduceRight((b, g) => {
  const sx = g.box.w / g.ch.w, sy = g.box.h / g.ch.h;
  return { x: g.box.x + (b.x - g.ch.x) * sx, y: g.box.y + (b.y - g.ch.y) * sy, w: b.w * sx, h: b.h * sy };
}, box);

/* Freie Form (a:custGeom) → Pfad in Koordinaten 0 bis 1 der eigenen Box.
   Befehle: ['M',x,y] ['L',x,y] ['C',x1,y1,x2,y2,x,y] ['Q',x1,y1,x,y] ['Z'] */
function freiform(geom) {
  const out = [];
  for (const p of kinder(pfad(geom, 'a:pathLst'), 'a:path')) {
    const w = zahl(p, 'w', 0) || 1, h = zahl(p, 'h', 0) || 1;
    const pt = el => [zahl(el, 'x') / w, zahl(el, 'y') / h];
    let cur = [0, 0];
    for (const c of p.children) {
      const pts = kinder(c, 'a:pt').map(pt);
      if (c.tagName === 'a:moveTo' && pts[0]) { out.push(['M', ...pts[0]]); cur = pts[0]; }
      else if (c.tagName === 'a:lnTo' && pts[0]) { out.push(['L', ...pts[0]]); cur = pts[0]; }
      else if (c.tagName === 'a:cubicBezTo' && pts.length === 3) { out.push(['C', ...pts[0], ...pts[1], ...pts[2]]); cur = pts[2]; }
      else if (c.tagName === 'a:quadBezTo' && pts.length === 2) { out.push(['Q', ...pts[0], ...pts[1]]); cur = pts[1]; }
      else if (c.tagName === 'a:arcTo') {
        /* Ellipsenbogen in kubische Kurven zerlegen */
        const wr = zahl(c, 'wR') / w, hr = zahl(c, 'hR') / h, st = zahl(c, 'stAng') / 60000 * Math.PI / 180, sw = zahl(c, 'swAng') / 60000 * Math.PI / 180;
        const cx = cur[0] - wr * Math.cos(st), cy = cur[1] - hr * Math.sin(st), teile = Math.max(1, Math.ceil(Math.abs(sw) / (Math.PI / 2)));
        for (let i = 0; i < teile; i++) {
          const a1 = st + sw * i / teile, a2 = st + sw * (i + 1) / teile, k = 4 / 3 * Math.tan((a2 - a1) / 4);
          const p1 = [cx + wr * (Math.cos(a1) - k * Math.sin(a1)), cy + hr * (Math.sin(a1) + k * Math.cos(a1))];
          const p2 = [cx + wr * (Math.cos(a2) + k * Math.sin(a2)), cy + hr * (Math.sin(a2) - k * Math.cos(a2))];
          cur = [cx + wr * Math.cos(a2), cy + hr * Math.sin(a2)];
          out.push(['C', ...p1, ...p2, ...cur]);
        }
      } else if (c.tagName === 'a:close') out.push(['Z']);
    }
  }
  return out.length ? out.map(b => b.map(v => typeof v === 'number' ? Math.round(v * 10000) / 10000 : v)) : null;
}

/* ---------- Füllung und Linie ---------- */
function fuellung(spPr, stil, ctx, rels) {
  for (const c of spPr ? spPr.children : []) {
    if (c.tagName === 'a:noFill') return null;
    if (c.tagName === 'a:solidFill') return farbe(c, ctx);
    if (c.tagName === 'a:pattFill') return farbe(kind(c, 'a:fgClr'), ctx);
    if (c.tagName === 'a:grpFill') return ctx.gruppenFuellung || null;
    if (c.tagName === 'a:gradFill') {
      const stops = kinder(pfad(c, 'a:gsLst'), 'a:gs').map(g => ({ pos: zahl(g, 'pos') / 100000, ...farbe(g, ctx) })).filter(s => s.hex).sort((a, b) => a.pos - b.pos);
      const lin = kind(c, 'a:lin');
      if (stops.length) return { verlauf: { stops, winkel: lin ? zahl(lin, 'ang') / 60000 : 90, radial: !!kind(c, 'a:path') }, hex: stops[0].hex, alpha: stops[0].alpha };
    }
    if (c.tagName === 'a:blipFill') { const b = blip(c, rels); if (b) return { bild: b }; }
  }
  const ref = stil && kind(stil, 'a:fillRef');
  if (ref && zahl(ref, 'idx') > 0) return farbe(ref, ctx);
  return null;
}
function linie(spPr, stil, ctx) {
  const ln = spPr && kind(spPr, 'a:ln');
  if (ln) {
    if (kind(ln, 'a:noFill')) return null;
    const f = farbe(kind(ln, 'a:solidFill'), ctx) || (stil && farbe(kind(stil, 'a:lnRef'), ctx));
    if (!f) return null;
    return { ...f, pt: Math.max(0.25, zahl(ln, 'w', 9525) / 12700), strich: (kind(ln, 'a:prstDash') || { getAttribute: () => 'solid' }).getAttribute('val') || 'solid' };
  }
  const ref = stil && kind(stil, 'a:lnRef');
  if (ref && zahl(ref, 'idx') > 0) { const f = farbe(ref, ctx); return f ? { ...f, pt: 0.75, strich: 'solid' } : null; }
  return null;
}
function blip(blipFill, rels) {
  const b = kind(blipFill, 'a:blip'), id = b && (b.getAttribute('r:embed') || b.getAttribute('r:link'));
  if (!id || !rels[id]) return null;
  const sr = kind(blipFill, 'a:srcRect');
  const crop = sr ? { l: zahl(sr, 'l') / 100000, t: zahl(sr, 't') / 100000, r: zahl(sr, 'r') / 100000, b: zahl(sr, 'b') / 100000 } : null;
  const alpha = kind(b, 'a:alphaModFix');
  return { media: rels[id], ...(crop && (crop.l || crop.t || crop.r || crop.b) ? { crop } : {}), ...(alpha ? { alpha: zahl(alpha, 'amt', 100000) / 100000 } : {}) };
}

/* ---------- Formenbaum ---------- */
function platzhalter(nv) {
  const ph = nv && pfad(nv, 'p:nvPr', 'p:ph');
  if (!ph) return null;
  return { typ: ph.getAttribute('type') || 'obj', idx: ph.getAttribute('idx') || '0' };
}
function form(sp, ctx, rels, gruppen) {
  const nv = kind(sp, 'p:nvSpPr') || kind(sp, 'p:nvCxnSpPr'), spPr = kind(sp, 'p:spPr'), stil = kind(sp, 'p:style'), t = transform(spPr);
  const name = (pfad(nv, 'p:cNvPr') || { getAttribute: () => '' }).getAttribute('name') || '';
  const prst = pfad(spPr, 'a:prstGeom'), cust = pfad(spPr, 'a:custGeom');
  const fontRef = stil && kind(stil, 'a:fontRef');
  const el = {
    art: 'form', name, ph: platzhalter(nv), box: t ? abbilden(t.box, gruppen) : null,
    rot: t ? t.rot : 0, flipH: t ? t.flipH : false, flipV: t ? t.flipV : false,
    geo: cust ? 'pfad' : prst ? prst.getAttribute('prst') : (sp.tagName === 'p:cxnSp' ? 'line' : 'rect'),
    fuellung: fuellung(spPr, stil, ctx, rels), linie: linie(spPr, stil, ctx),
    text: textKoerper(kind(sp, 'p:txBody'), ctx),
    ...(fontRef && farbe(fontRef, ctx) ? { schriftFarbe: farbe(fontRef, ctx) } : {})
  };
  const gd = prst && pfad(prst, 'a:avLst'), adj = gd && kinder(gd, 'a:gd')[0];
  if (adj) { const m = /val\s+(-?\d+)/.exec(adj.getAttribute('fmla') || ''); if (m) el.adj = +m[1]; }
  if (cust) el.pfad = freiform(cust);
  if (sp.tagName === 'p:cxnSp') el.geo = 'line';
  return el;
}
function bild(pic, ctx, rels, gruppen) {
  const nv = kind(pic, 'p:nvPicPr'), spPr = kind(pic, 'p:spPr'), t = transform(spPr);
  const name = (pfad(nv, 'p:cNvPr') || { getAttribute: () => '' }).getAttribute('name') || '';
  return {
    art: 'bild', name, ph: platzhalter(nv), box: t ? abbilden(t.box, gruppen) : null, rot: t ? t.rot : 0, flipH: t ? t.flipH : false, flipV: t ? t.flipV : false,
    geo: (pfad(spPr, 'a:prstGeom') || { getAttribute: () => 'rect' }).getAttribute('prst'), bild: blip(kind(pic, 'p:blipFill'), rels), linie: linie(spPr, null, ctx)
  };
}
function sammle(baum, ctx, rels, gruppen = [], out = []) {
  for (const c of baum ? baum.children : []) {
    if (c.tagName === 'p:sp' || c.tagName === 'p:cxnSp') out.push(form(c, ctx, rels, gruppen));
    else if (c.tagName === 'p:pic') out.push(bild(c, ctx, rels, gruppen));
    else if (c.tagName === 'p:grpSp') {
      const gp = kind(c, 'p:grpSpPr'), t = transform(gp);
      const gf = fuellung(gp, null, ctx, rels);
      sammle(c, { ...ctx, gruppenFuellung: gf || ctx.gruppenFuellung }, rels, t && t.ch ? [...gruppen, t] : gruppen, out);
    } else if (c.tagName === 'p:graphicFrame') {
      const t = transform(c), nv = kind(c, 'p:nvGraphicFramePr');
      if (t) out.push({ art: 'rahmen', name: (pfad(nv, 'p:cNvPr') || { getAttribute: () => '' }).getAttribute('name') || '', ph: platzhalter(nv), box: abbilden(t.box, gruppen), rot: 0 });
    } else if (c.tagName === 'mc:AlternateContent') {
      const wahl = kind(c, 'mc:Fallback') || kind(c, 'mc:Choice');
      if (wahl) sammle(wahl, ctx, rels, gruppen, out);
    }
  }
  return out;
}

/* ---------- Eine Fläche (Master, Layout oder Folie) ---------- */
/* ctx: { theme, clrMap }, rels: { rId: 'ppt/media/…' } */
export function leseFlaeche(text, ctx, rels = {}) {
  const d = xml(text), wurzel = d.documentElement, cSld = kind(wurzel, 'p:cSld');
  const bg = kind(cSld, 'p:bg');
  let hintergrund = null;
  if (bg) {
    const pr = kind(bg, 'p:bgPr'), ref = kind(bg, 'p:bgRef');
    hintergrund = pr ? fuellung(pr, null, ctx, rels) : ref ? farbe(ref, ctx) : null;
  }
  const clrMap = kind(wurzel, 'p:clrMap');
  const txStyles = kind(wurzel, 'p:txStyles');
  return {
    name: cSld ? cSld.getAttribute('name') || '' : '', typ: wurzel.getAttribute('type') || '',
    zeigeMaster: wurzel.getAttribute('showMasterSp') !== '0',
    hintergrund,
    ...(clrMap ? { clrMap: Object.fromEntries([...clrMap.attributes].map(a => [a.name, a.value])) } : {}),
    ...(txStyles ? { textstile: { title: ebenen(kind(txStyles, 'p:titleStyle'), ctx), body: ebenen(kind(txStyles, 'p:bodyStyle'), ctx), other: ebenen(kind(txStyles, 'p:otherStyle'), ctx) } } : {}),
    elemente: sammle(kind(cSld, 'p:spTree'), ctx, rels)
  };
}

/* Beziehungen einer Datei: { rId: 'ppt/media/image1.png' } */
export function leseRels(text, basis) {
  const out = {};
  if (!text) return out;
  for (const r of xml(text).getElementsByTagName('Relationship')) {
    const ziel = r.getAttribute('Target') || '';
    if (r.getAttribute('TargetMode') === 'External') continue;
    out[r.getAttribute('Id')] = ziel.startsWith('/') ? ziel.slice(1) : aufloesen(basis, ziel);
  }
  return out;
}
const aufloesen = (basis, ziel) => {
  const teile = basis.split('/').slice(0, -1);
  for (const s of ziel.split('/')) { if (s === '..') teile.pop(); else if (s !== '.') teile.push(s); }
  return teile.join('/');
};

/* Clrmap des Masters lesen, bevor die Farben aufgelöst werden */
export function leseClrMap(text) {
  const el = xml(text).getElementsByTagName('p:clrMap')[0];
  return el ? Object.fromEntries([...el.attributes].map(a => [a.name, a.value])) : { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
}
