// Inhalte ohne Wiederholung ueber den ganzen Abend (Nico 31.10.2026: "Wer bin ich ... wiederholen sich jede zweite
// Runde"). Der Raum merkt sich je Liste, welche Eintraege schon gezogen wurden (raum.gezogen[schluessel] = [Nummern]),
// ueber alle Partien hinweg. Erst wenn alles einmal dran war, faengt die Liste von vorn an. Laeuft nur beim Gastgeber.
const zufall = (n, r) => Math.floor(r() * n);

// -> n verschiedene Nummern aus 0..laenge-1, die heute Abend noch nicht dran waren. ohne raum: einfach zufaellig.
// nur(i) = false schliesst einen Eintrag aus (z. B. Trinkkarten ohne Trinken); ausgeschlossene bleiben "frei".
export function ziehen(raum, schluessel, laenge, n = 1, r = Math.random, nur = null) {
  const alle = Array.from({ length: laenge }, (_, i) => i).filter((i) => !nur || nur(i));
  if (!alle.length) return [];
  let schon = new Set();
  if (raum) {
    if (!raum.gezogen || typeof raum.gezogen !== "object") raum.gezogen = {};
    schon = new Set((Array.isArray(raum.gezogen[schluessel]) ? raum.gezogen[schluessel] : []).filter((i) => i < laenge));
  }
  let frei = alle.filter((i) => !schon.has(i));
  const aus = [];
  if (frei.length < n) {
    // Rest dieser Runde noch nehmen, dann von vorn (ohne die eben gezogenen)
    aus.push(...frei);
    schon = new Set();
    frei = alle.filter((i) => !aus.includes(i));
  }
  for (let i = frei.length - 1; i > 0; i--) { const j = zufall(i + 1, r); [frei[i], frei[j]] = [frei[j], frei[i]]; }
  while (aus.length < n && frei.length) aus.push(frei.pop());
  while (aus.length < n) aus.push(alle[zufall(alle.length, r)]);   // Liste kuerzer als n: dann doppelt
  if (raum) raum.gezogen[schluessel] = [...schon, ...aus.filter((i) => !schon.has(i))];
  return aus;
}
export const eins = (raum, schluessel, laenge, r = Math.random, nur = null) => ziehen(raum, schluessel, laenge, 1, r, nur)[0];
// wie viele sind heute Abend schon dran gewesen (Anzeige)
export const schonGezogen = (raum, schluessel) => ((raum && raum.gezogen && Array.isArray(raum.gezogen[schluessel])) ? raum.gezogen[schluessel].length : 0);
