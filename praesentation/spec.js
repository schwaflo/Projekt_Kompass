/* ============================================================
   Präsentationsgenerator – Slide-Spec
   Die Slide-Spec enthält nur Inhalt und Struktur: je Folie ein
   Layout und die Inhalte pro Platzhalter. Wie das aussieht,
   entscheidet allein das Designsystem.

   { schemaVersion, titel, folien: [
       { layoutId, inhalt: { <platzhalterId>: … }, notizen } ] }

   Inhalte je Platzhaltertyp:
     text    → "Text"
     bullets → ["Punkt", "Punkt"]
     items   → [{ <feldId>: "Text", … }]
     image   → "asset-id" oder "tag" aus dem Designsystem
   ============================================================ */
import { checkSchema } from './validate.js';

export const SPEC_VERSION = '1.0';

export const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'string', enum: [SPEC_VERSION] },
    titel: { type: 'string', minLength: 1 },
    folien: {
      type: 'array', minItems: 1,
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, layoutId: { type: 'string', minLength: 1 }, inhalt: { type: 'object' }, notizen: { type: 'string' } },
        required: ['layoutId', 'inhalt']
      }
    }
  },
  required: ['titel', 'folien']
};

/* Platzhalter, die Inhalt aus der Slide-Spec bekommen (also nicht Seitenzahl, Fußzeile, Logo) */
export const inhaltsPlatzhalter = layout => layout.placeholders.filter(p => !p.auto && p.typ !== 'logo');

const leer = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
const laenge = s => [...String(s)].length;

/* Prüft eine Slide-Spec gegen ein Designsystem.
   Jede Meldung ist so formuliert, dass sie der KI als Korrekturhinweis zurückgegeben werden kann. */
export function validateSpec(spec, system) {
  const errors = checkSchema(spec, SPEC_SCHEMA, '');
  if (errors.length) return { ok: false, errors };
  const maxBullets = system.rules.maxBullets || Infinity;

  spec.folien.forEach((f, i) => {
    const wo = `Folie ${i + 1}`;
    const layout = system.layout(f.layoutId);
    if (!layout) { errors.push(`${wo}: Das Layout „${f.layoutId}“ gibt es nicht. Erlaubt: ${system.layouts.map(l => l.id).join(', ')}.`); return; }
    const phs = inhaltsPlatzhalter(layout), ids = phs.map(p => p.id);
    Object.keys(f.inhalt).forEach(k => { if (!ids.includes(k)) errors.push(`${wo} (${layout.id}): Den Platzhalter „${k}“ gibt es in diesem Layout nicht. Erlaubt: ${ids.join(', ')}.`); });

    phs.forEach(ph => {
      const v = f.inhalt[ph.id], p = `${wo} (${layout.id}), ${ph.id}`;
      if (leer(v)) { if (ph.pflicht) errors.push(`${p}: Pflichtinhalt fehlt.`); return; }
      switch (ph.typ) {
        case 'text':
          if (typeof v !== 'string') errors.push(`${p}: erwartet einen Text.`);
          else if (laenge(v) > ph.maxChars) errors.push(`${p}: ${laenge(v)} Zeichen, erlaubt sind höchstens ${ph.maxChars}. Kürze den Text.`);
          break;
        case 'bullets': {
          if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) { errors.push(`${p}: erwartet eine Liste von Texten.`); break; }
          const max = Math.min(ph.maxItems, maxBullets);
          if (v.length > max) errors.push(`${p}: ${v.length} Stichpunkte, erlaubt sind höchstens ${max}.`);
          v.forEach((x, j) => { if (laenge(x) > ph.maxCharsPerItem) errors.push(`${p}, Punkt ${j + 1}: ${laenge(x)} Zeichen, erlaubt sind höchstens ${ph.maxCharsPerItem}. Kürze den Punkt.`); });
          break;
        }
        case 'items': {
          if (!Array.isArray(v) || v.some(x => !x || typeof x !== 'object' || Array.isArray(x))) { errors.push(`${p}: erwartet eine Liste von Einträgen mit den Feldern ${ph.felder.map(x => x.id).join(', ')}.`); break; }
          if (v.length > ph.maxItems) errors.push(`${p}: ${v.length} Einträge, erlaubt sind höchstens ${ph.maxItems}.`);
          if (ph.minItems && v.length < ph.minItems) errors.push(`${p}: ${v.length} Einträge, nötig sind mindestens ${ph.minItems}.`);
          const fids = ph.felder.map(x => x.id);
          v.forEach((it, j) => {
            Object.keys(it).forEach(k => { if (!fids.includes(k)) errors.push(`${p}, Eintrag ${j + 1}: Das Feld „${k}“ gibt es nicht. Erlaubt: ${fids.join(', ')}.`); });
            if (leer(it[fids[0]])) errors.push(`${p}, Eintrag ${j + 1}: Das Feld „${fids[0]}“ fehlt.`);
            ph.felder.forEach(fd => {
              const w = it[fd.id];
              if (leer(w)) return;
              if (typeof w !== 'string') errors.push(`${p}, Eintrag ${j + 1}, ${fd.id}: erwartet einen Text.`);
              else if (laenge(w) > fd.maxChars) errors.push(`${p}, Eintrag ${j + 1}, ${fd.id}: ${laenge(w)} Zeichen, erlaubt sind höchstens ${fd.maxChars}.`);
            });
          });
          break;
        }
        case 'image':
          if (typeof v !== 'string' || !system.asset(v)) errors.push(`${p}: „${v}“ ist kein Bild aus dem Designsystem. Erlaubte IDs: ${bildIds(system).join(', ')}. Freie Dateipfade sind nicht möglich.`);
          break;
        default:
          errors.push(`${p}: Der Platzhaltertyp „${ph.typ}“ wird noch nicht unterstützt.`);
      }
    });
  });
  return { ok: !errors.length, errors };
}

const bildIds = system => system.manifest.assets.filter(a => !/^logo/.test(a.role)).map(a => a.id);

/* Text an einer Wortgrenze kürzen und mit … abschließen */
export function kuerze(text, max) {
  const z = [...String(text)];
  if (z.length <= max) return String(text);
  let t = z.slice(0, max - 1).join('');
  const cut = t.lastIndexOf(' ');
  /* nur zurückgehen, wenn der Schnitt mitten in einem Wort liegt */
  if (z[max - 1] !== ' ' && cut > max * 0.6) t = t.slice(0, cut);
  return t.replace(/[\s,;:.–-]+$/, '') + '…';
}

const LUECKE = '[…]';

/* Layout, in das vorhandene Inhalte am besten passen: möglichst viele Felder treffen,
   möglichst wenige Pflichtfelder bleiben leer */
function passendesLayout(system, inhalt) {
  const keys = Object.keys(inhalt).filter(k => !leer(inhalt[k]));
  let best = null, bestWert = -Infinity;
  system.layouts.forEach(l => {
    const phs = inhaltsPlatzhalter(l);
    const wert = phs.filter(p => keys.includes(p.id)).length * 2 - phs.filter(p => p.pflicht && !keys.includes(p.id)).length * 3 - keys.filter(k => !phs.some(p => p.id === k)).length;
    if (wert > bestWert) { best = l; bestWert = wert; }
  });
  return best || system.layoutForTyp('content-bullets');
}

/* Fallback, wenn die KI nach allen Versuchen noch Fehler liefert:
   bringt jede Slide-Spec in einen gültigen Zustand, ohne Inhalte zu erfinden.
   Liefert die bereinigte Spec und eine Liste dessen, was geändert wurde. */
export function kuerzeSpec(spec, system) {
  const aenderungen = [];
  const out = { schemaVersion: SPEC_VERSION, titel: String(spec.titel || 'Präsentation'), folien: [] };
  const maxBullets = system.rules.maxBullets || Infinity;

  (Array.isArray(spec.folien) ? spec.folien : []).forEach((f, i) => {
    if (!f || typeof f !== 'object') return;
    const wo = `Folie ${i + 1}`;
    const roh = f.inhalt && typeof f.inhalt === 'object' ? f.inhalt : {}, inhalt = {};
    let layout = system.layout(f.layoutId);
    if (!layout) { layout = passendesLayout(system, roh); aenderungen.push(`${wo}: Layout „${f.layoutId}“ unbekannt, ersetzt durch „${layout.id}“.`); }

    inhaltsPlatzhalter(layout).forEach(ph => {
      let v = roh[ph.id];
      if (leer(v)) return;
      const p = `${wo}, ${ph.id}`;
      if (ph.typ === 'text') {
        if (Array.isArray(v)) v = v.join(' ');
        v = String(v);
        if (laenge(v) > ph.maxChars) { v = kuerze(v, ph.maxChars); aenderungen.push(`${p}: Text gekürzt.`); }
        inhalt[ph.id] = v;
      } else if (ph.typ === 'bullets') {
        let l = (Array.isArray(v) ? v : String(v).split(/\n+/)).map(x => String(x).trim()).filter(Boolean);
        const max = Math.min(ph.maxItems, maxBullets);
        if (l.length > max) { aenderungen.push(`${p}: ${l.length - max} Stichpunkte entfernt.`); l = l.slice(0, max); }
        l = l.map((x, j) => { if (laenge(x) <= ph.maxCharsPerItem) return x; aenderungen.push(`${p}, Punkt ${j + 1}: gekürzt.`); return kuerze(x, ph.maxCharsPerItem); });
        if (l.length) inhalt[ph.id] = l;
      } else if (ph.typ === 'items') {
        let l = (Array.isArray(v) ? v : []).filter(x => x && typeof x === 'object' && !Array.isArray(x));
        if (l.length > ph.maxItems) { aenderungen.push(`${p}: ${l.length - ph.maxItems} Einträge entfernt.`); l = l.slice(0, ph.maxItems); }
        l = l.map((it, j) => Object.fromEntries(ph.felder.filter(fd => !leer(it[fd.id])).map(fd => {
          let w = String(it[fd.id]);
          if (laenge(w) > fd.maxChars) { w = kuerze(w, fd.maxChars); aenderungen.push(`${p}, Eintrag ${j + 1}, ${fd.id}: gekürzt.`); }
          return [fd.id, w];
        }))).filter(it => Object.keys(it).length);
        if (l.length) inhalt[ph.id] = l;
      } else if (ph.typ === 'image') {
        if (typeof v === 'string' && system.asset(v)) inhalt[ph.id] = v;
        else aenderungen.push(`${p}: Bild „${v}“ unbekannt, Standardbild des Layouts wird verwendet.`);
      }
    });
    /* Pflichtinhalte, die fehlen, werden als sichtbare Lücke markiert statt erfunden */
    inhaltsPlatzhalter(layout).forEach(ph => {
      const p = `${wo}, ${ph.id}`;
      if (ph.typ === 'items' && ph.minItems && inhalt[ph.id] && inhalt[ph.id].length < ph.minItems) {
        while (inhalt[ph.id].length < ph.minItems) inhalt[ph.id].push({ [ph.felder[0].id]: LUECKE });
        aenderungen.push(`${p}: zu wenige Einträge, Lücke markiert.`);
      }
      if (!ph.pflicht || !leer(inhalt[ph.id])) return;
      inhalt[ph.id] = ph.typ === 'text' ? LUECKE : ph.typ === 'bullets' ? [LUECKE] : Array.from({ length: ph.minItems || 1 }, () => ({ [ph.felder[0].id]: LUECKE }));
      aenderungen.push(`${p}: Pflichtinhalt fehlt, Lücke markiert.`);
    });
    Object.keys(roh).forEach(k => { if (!inhaltsPlatzhalter(layout).some(ph => ph.id === k)) aenderungen.push(`${wo}: Inhalt „${k}“ passt in kein Feld des Layouts und wurde weggelassen.`); });
    out.folien.push({ ...(f.id ? { id: String(f.id) } : {}), layoutId: layout.id, inhalt, ...(typeof f.notizen === 'string' && f.notizen ? { notizen: f.notizen } : {}) });
  });
  return { spec: out, aenderungen };
}

/* Slide-Spec in ein anderes Designsystem übertragen: Layouts werden über den Typ zugeordnet,
   Inhalte über die Platzhalter-ID. Der Inhalt selbst bleibt unverändert; was im neuen Layout
   kein Feld hat, wird beim Rendern übersprungen, geht aber nicht verloren. */
export function remapSpec(spec, von, nach) {
  return {
    ...spec,
    folien: spec.folien.map(f => {
      const alt = von && von.layout(f.layoutId);
      const neu = nach.layout(f.layoutId) && (!alt || nach.layout(f.layoutId).typ === alt.typ) ? nach.layout(f.layoutId) : nach.layoutForTyp(alt ? alt.typ : f.layoutId);
      /* Bildverweise per ID gelten nur im alten System: auf die Rolle umschreiben */
      const inhalt = { ...f.inhalt };
      inhaltsPlatzhalter(neu).filter(ph => ph.typ === 'image' && typeof inhalt[ph.id] === 'string').forEach(ph => {
        const a = von && von.asset(inhalt[ph.id]);
        if (!nach.asset(inhalt[ph.id]) || (a && nach.asset(inhalt[ph.id]).role !== a.role)) { if (a && nach.asset(a.role)) inhalt[ph.id] = nach.asset(a.role).id; else delete inhalt[ph.id]; }
      });
      return { ...f, layoutId: neu.id, inhalt };
    })
  };
}
