/* ============================================================
   Präsentationsgenerator – Layouts einer Vorlage von der KI
   einordnen lassen
   Die Rechnung in analyse.js sieht nur Flächen und Schriftgrößen.
   Was ein Layout in der Vorlage bedeutet („Kapitel“, „Unsere
   Zahlen“, „Agenda“), steht oft nur im Namen oder im Text der
   Beispielfolie. Die KI liest beides und sagt je Layout:
   zweck, passende Wirkungen (beste zuerst) und ob es gemieden
   werden soll. Das Ergebnis liegt als layout.ki im Manifest;
   eignung() in analyse.js rechnet es mit ein.
   ============================================================ */
import { profil, typName, FORMEN, FORM_IDS } from './analyse.js';
import { inhaltsPlatzhalter } from './spec.js';
import { fuelle, frageGeprueft } from './pipeline.js';

const JE_AUFRUF = 10; /* Layouts je KI-Aufruf: kurze Prompts, auch für kleine Modelle */
const lage = p => `${p.x + p.w / 2 < 40 ? 'links' : p.x + p.w / 2 > 60 ? 'rechts' : 'mittig'}${p.y + p.h / 2 < 35 ? ' oben' : p.y + p.h / 2 > 65 ? ' unten' : ''}`;
const pt = (system, p) => { const s = (p.style || {}).size, sz = typeof s === 'number' ? s : system.tokens.typography.sizes[s || 'body']; return sz ? `${Math.round(sz)} pt` : ''; };

/* Steckbrief eines Layouts in wenigen Zeilen */
export function steckbrief(l, system) {
  const p = profil(l, system), z = [];
  z.push(`${l.id}: „${l.name || l.id}“${l.herkunft ? ` (${l.herkunft})` : ''}, die App hat es als „${typName(l.typ)}“ erkannt, ${p.dunkel ? 'dunkler' : 'heller'} Grund.`);
  (l.placeholders || []).filter(ph => !ph.auto && ph.typ !== 'logo').forEach(ph => {
    const art = ph.typ === 'image' ? 'Bildfläche' : ph.typ === 'table' ? 'Tabellenfläche' : ph.typ === 'bullets' ? `Liste, bis ${ph.maxItems} Punkte` : ph.typ === 'items' ? `${ph.maxItems} Kacheln (${ph.felder.map(f => f.id).join(', ')})` : `Text, bis ${ph.maxChars} Zeichen`;
    const stil = ph.style ? [pt(system, ph), ph.style.bold ? 'fett' : '', ph.style.font === 'heading' ? 'Überschriftenschrift' : ''].filter(Boolean).join(', ') : '';
    z.push(`  - ${ph.id}: ${art}${stil ? `, ${stil}` : ''}, ${Math.round(ph.w)} × ${Math.round(ph.h)} % ${lage(ph)}${ph.beispiel ? `; Beispiel: „${ph.beispiel.slice(0, 90)}“` : ''}`);
  });
  const deko = (l.deko || []).filter(d => d.shape === 'text' && d.text).map(d => String(d.text).slice(0, 40));
  if (deko.length) z.push(`  - feste Texte: ${deko.slice(0, 4).map(t => `„${t}“`).join(', ')}`);
  return z.join('\n');
}

/* opts.vorlage: Name der Vorlage. Liefert { [layoutId]: { zweck, formen, meiden } } und die Zahl der Aufrufe. */
export async function bewerteLayouts(ki, prompts, system, opts = {}) {
  const layouts = system.layouts.filter(l => inhaltsPlatzhalter(l).length || l.placeholders.some(p => p.typ === 'table'));
  const wirkungen = FORM_IDS.map(f => `- ${f}: ${FORMEN[f]}`).join('\n');
  const ergebnis = {};
  for (let i = 0; i < layouts.length; i += JE_AUFRUF) {
    const teil = layouts.slice(i, i + JE_AUFRUF), ids = teil.map(l => l.id);
    const schema = {
      type: 'object', required: ['layouts'],
      properties: { layouts: { type: 'array', items: { type: 'object', required: ['id', 'zweck', 'formen', 'meiden'], properties: {
        id: { type: 'string', enum: ids }, zweck: { type: 'string' },
        formen: { type: 'array', items: { type: 'string', enum: FORM_IDS } }, meiden: { type: 'boolean' }
      } } } }
    };
    const r = await frageGeprueft(ki, prompts, {
      art: 'praes_layouts', schema, denken: false,
      prompt: fuelle(prompts['layouts-bewerten'], { vorlage: opts.vorlage || system.meta.name, wirkungen, layouts: teil.map(l => steckbrief(l, system)).join('\n\n') })
    }, a => {
      const l = a && Array.isArray(a.layouts) ? a.layouts : null;
      if (!l) return ['Die Antwort braucht eine Liste „layouts“.'];
      const fehlt = ids.filter(id => !l.some(x => x && x.id === id));
      return fehlt.length ? [`Es fehlen Einträge für: ${fehlt.join(', ')}. Bewerte jedes Layout genau einmal.`] : [];
    });
    for (const x of (r.antwort && Array.isArray(r.antwort.layouts) ? r.antwort.layouts : [])) {
      if (!x || !ids.includes(x.id) || ergebnis[x.id]) continue;
      const formen = [...new Set((Array.isArray(x.formen) ? x.formen : []).filter(f => FORM_IDS.includes(f)))].slice(0, 4);
      ergebnis[x.id] = { zweck: String(x.zweck || '').trim().slice(0, 160), formen, meiden: x.meiden === true };
    }
  }
  return ergebnis;
}

/* Bewertung ins Manifest schreiben (vorher vorhandene ersetzt). Liefert die Zahl der bewerteten Layouts. */
export function wendeBewertungAn(manifest, bewertung) {
  let n = 0;
  manifest.layouts.forEach(l => { const b = bewertung[l.id]; if (b && (b.formen.length || b.zweck)) { l.ki = b; n++; } });
  return n;
}
