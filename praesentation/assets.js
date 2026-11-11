/* ============================================================
   Präsentationsgenerator – Asset-Erkennung
   Schlägt für eine Bilddatei Rolle, ID, Tags und Beschreibung vor:
   aus Dateiname, Format, Seitenverhältnis und Transparenz.
   Die Vorschläge sind nur ein Anfang; im Designsystem-Editor
   lassen sie sich bestätigen oder ändern.
   ============================================================ */

export const ROLLEN = {
  'logo-primary': { name: 'Logo für helle Flächen', form: 'breit, etwa 15:4', verwendung: ['title', 'closing'] },
  'logo-negative': { name: 'Logo für dunkle Flächen', form: 'breit, etwa 15:4, helle Farbe', verwendung: ['title', 'closing'] },
  'logo-icon': { name: 'Bildmarke', form: 'quadratisch', verwendung: [] },
  'hero-image': { name: 'Großes Bild im Querformat', form: '16:9, etwa 1920 × 1080 px', verwendung: ['image-full'] },
  'portrait-image': { name: 'Bild im Hochformat', form: 'etwa 1280 × 1800 px', verwendung: ['image-left'] },
  'square-image': { name: 'Quadratisches Bild', form: '1:1, etwa 1200 × 1200 px', verwendung: ['image-left'] }
};

const FUELLWORT = new Set(['img', 'image', 'bild', 'foto', 'photo', 'final', 'neu', 'new', 'kopie', 'copy', 'rgb', 'cmyk', 'web', 'print', 'png', 'jpg', 'jpeg', 'svg', 'webp', 'px', 'x', 'v', 'de', 'en']);
const normal = s => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
const worte = name => normal(name).replace(/\.[a-z0-9]+$/, '').split(/[^a-z]+/).filter(w => w.length > 1 && !FUELLWORT.has(w));

/* info: { pfad, breite, hoehe, transparent, hell }
   hell = das Motiv ist überwiegend hell (bei Logos ein Hinweis auf die Negativ-Variante)
   vorhandeneIds: schon vergebene IDs, damit die neue eindeutig ist */
export function schlageAssetVor(info, vorhandeneIds = []) {
  const datei = String(info.pfad).split('/').pop(), n = normal(datei), svg = /\.svg$/.test(n);
  const r = info.breite && info.hoehe ? info.breite / info.hoehe : 0, w = worte(datei), grund = [];
  const nameLogo = /logo|signet|wortmarke|bildmarke|brand|emblem|wappen/.test(n);
  const nameIcon = /icon|bildmarke|signet|favicon|symbol|emblem|avatar/.test(n);
  const nameNeg = /negativ|negative|invert|white|weiss|hell|light|_neg|-neg|_inv|-inv|onDark|on-dark/i.test(datei) && !/hellblau|hellgrau/.test(n);
  const klein = info.breite && Math.max(info.breite, info.hoehe) <= 800;
  let role;

  if (nameLogo || nameIcon || ((((svg || info.transparent) && klein) || (svg && info.transparent)) && !/foto|photo|bild|hero|team|portrait/.test(n))) {
    grund.push(nameLogo || nameIcon ? 'Dateiname deutet auf ein Logo' : info.transparent ? 'transparenter Hintergrund: vermutlich ein Logo' : 'kleine SVG-Datei: vermutlich ein Logo');
    if (nameIcon && !/wortmarke/.test(n) || (r && r > 0.8 && r < 1.25 && !nameNeg)) { role = 'logo-icon'; grund.push(r ? 'quadratisch' : 'als Bildmarke benannt'); }
    else if (nameNeg || info.hell) { role = 'logo-negative'; grund.push(nameNeg ? 'Dateiname nennt eine helle oder negative Variante' : 'helles Motiv: für dunkle Flächen'); }
    else role = 'logo-primary';
  } else if (!r) { role = 'hero-image'; grund.push('Maße unbekannt: als Querformat angenommen'); }
  else if (r >= 1.25) { role = 'hero-image'; grund.push(`Querformat (${fmt(r)}:1)`); }
  else if (r <= 0.85) { role = 'portrait-image'; grund.push(`Hochformat (${fmt(r)}:1)`); }
  else { role = 'square-image'; grund.push('nahezu quadratisch'); }

  const logo = role.startsWith('logo');
  const tags = [...new Set([logo ? 'logo' : null, role === 'hero-image' ? 'querformat' : role === 'portrait-image' ? 'hochformat' : role === 'square-image' ? 'quadrat' : null, role === 'logo-negative' ? 'dunkel' : role === 'logo-primary' ? 'hell' : null, ...w.filter(x => !/^logo|^icon/.test(x))].filter(Boolean))].slice(0, 6);
  /* Logos bekommen die Rolle als ID, damit Layouts sie direkt finden */
  let id = logo ? role : (w.join('-').replace(/[^a-z0-9-]/g, '').slice(0, 30) || role.replace('-image', ''));
  if (!/^[a-z0-9]/.test(id)) id = 'bild-' + id;
  for (let i = 2, basis = id; vorhandeneIds.includes(id); i++) id = `${basis}-${i}`;
  const titel = w.filter(x => !/^logo|^icon/.test(x)).join(' ');
  return {
    id, file: info.pfad, role, tags,
    beschreibung: logo ? ROLLEN[role].name : (titel ? titel.charAt(0).toUpperCase() + titel.slice(1) : ROLLEN[role].name),
    verwendung: ROLLEN[role].verwendung,
    ...(info.breite && info.hoehe ? { w: info.breite, h: info.hoehe } : {}),
    grund: grund.join(', ')
  };
}
const fmt = r => (Math.round(r * 100) / 100).toLocaleString('de-DE');

/* Bild im Browser vermessen: Maße, Transparenz, Helligkeit des Motivs */
export function analysiereBild(url) {
  return new Promise(ok => {
    const img = new Image();
    img.onerror = () => ok({ breite: 0, hoehe: 0, transparent: false, hell: false });
    img.onload = () => {
      const breite = img.naturalWidth, hoehe = img.naturalHeight, out = { breite, hoehe, transparent: false, hell: false };
      try {
        const c = document.createElement('canvas'); c.width = 48; c.height = Math.max(1, Math.round(48 * (hoehe || 1) / (breite || 1)));
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let durch = 0, summe = 0, sichtbar = 0;
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) durch++; if (d[i + 3] > 40) { sichtbar++; summe += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; } }
        out.transparent = durch / (d.length / 4) > 0.08;
        out.hell = out.transparent && sichtbar > 0 && summe / sichtbar > 200;
      } catch { /* fremde Herkunft: nur die Maße verwenden */ }
      ok(out);
    };
    img.src = url;
  });
}

/* Bild für ein Vision-Modell verkleinern und als PNG ohne Präfix liefern */
export function bildFuerKI(url, kante = 512) {
  return new Promise((ok, fehler) => {
    const img = new Image();
    img.onerror = () => fehler(new Error('Das Bild konnte nicht gelesen werden.'));
    img.onload = () => {
      const k = Math.min(1, kante / Math.max(img.naturalWidth || kante, img.naturalHeight || kante));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round((img.naturalWidth || kante) * k)); c.height = Math.max(1, Math.round((img.naturalHeight || kante) * k));
      const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/png'));
    };
    img.src = url;
  });
}
