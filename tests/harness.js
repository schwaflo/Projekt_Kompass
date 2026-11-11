/* Winziger Testrahmen ohne Abhängigkeiten. Läuft im Browser (tests/index.html)
   und in Node (node tests/run.mjs). Der jeweilige Starter setzt env.readText. */
export const tests = [];
export const env = { readText: async () => null };

export const test = (name, fn) => tests.push({ name, fn });
export function assert(bedingung, text) { if (!bedingung) throw new Error(text || 'Bedingung nicht erfüllt'); }
export function gleich(ist, soll, text) {
  const a = JSON.stringify(ist), b = JSON.stringify(soll);
  if (a !== b) throw new Error(`${text ? text + ': ' : ''}erwartet ${b}, erhalten ${a}`);
}
/* Enthält eine der Meldungen den gesuchten Text? */
export function meldet(liste, teil, text) {
  if (!liste.some(m => m.includes(teil))) throw new Error(`${text ? text + ': ' : ''}keine Meldung mit „${teil}“. Meldungen: ${liste.join(' | ') || '(keine)'}`);
}

export async function runAll() {
  const ergebnisse = [];
  for (const t of tests) {
    try { await t.fn(); ergebnisse.push({ name: t.name, ok: true }); }
    catch (e) { ergebnisse.push({ name: t.name, ok: false, fehler: e.message }); }
  }
  return ergebnisse;
}
