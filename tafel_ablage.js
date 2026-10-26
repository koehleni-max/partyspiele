// Datenhaltung und Abgleich der Turniertafel hinter einer kleinen Schnittstelle.
//
// Die Tafel selbst (tafel.js) ist reine Logik: aktion(t, a, {gastgeber, wer}) aendert einen Stand t anhand einer
// schlichten JSON-Aktion {typ:"_tafel", was, ...}. Wer den Stand haelt und wie Aktionen dorthin kommen, steht nur hier:
//   ablage   = { laden() -> t, sichern(t) }   Sicherung im Browser des Gastgeber-Geraets
//   abgleich = { aendern(a) }                 wie eine Aktion zum Halter des Stands kommt
// Seit 26.10.2026 (Halloween-Fassung): der Stand liegt im Raum in der Datenbank (net.js, stand/tafel) und kommt nach einem
// Neuladen von dort zurueck. Die Browser-Sicherung ist je Raum (pa_tafel_<raumcode>) und nur der Rueckfallweg, falls der
// Raum in der Datenbank fehlt. Aktionen gehen wie jede andere ueber die Warteschlange des Raums (app.js senden).
// Testkonten (konten.js): ihre Eintraege kommen nicht in die Sicherung - sie verfallen mit dem Raum.
import { laden, SPEICHER } from "./tafel.js";
import { istTestName } from "./konten.js";

export const schluesselFuer = (raumcode) => `${SPEICHER}_${raumcode}`;

// Kopie ohne Testkonten: Punkte und Zeiten von Testkonten weg, Bierpong-Teams mit Testkonto weg (samt ausgelostem Baum,
// falls eins mitspielte - der Baum haengt an den Team-Nummern). Buchungen der Wertung enthalten ohnehin keine Testkonten.
export function ohneTestkonten(t) {
  const k = JSON.parse(JSON.stringify(t));
  (k.stationen || []).forEach((st) => {
    if (Array.isArray(st.eintraege)) st.eintraege = st.eintraege.filter((e) => !istTestName(e.name));
    if (Array.isArray(st.zeiten)) st.zeiten = st.zeiten.filter((z) => !istTestName(z.name));
    if (Array.isArray(st.teams)) {
      const test = st.teams.filter((tm) => istTestName(tm.a) || istTestName(tm.b)).map((tm) => tm.id);
      if (test.length) {
        st.teams = st.teams.filter((tm) => !test.includes(tm.id));
        if (st.baum) { st.baum = null; st.platz3 = null; }
      }
    }
  });
  if (k.wertung && Array.isArray(k.wertung.buchungen)) k.wertung.buchungen = k.wertung.buchungen.filter((b) => ![...(b.namen || []), ...(b.gegner || [])].some(istTestName));
  return k;
}

export function browserAblage(schluessel = SPEICHER, { testFilter = () => true } = {}) {
  return {
    laden: () => laden(localStorage.getItem(schluessel)),
    sichern: (t) => {
      try { localStorage.setItem(schluessel, JSON.stringify(testFilter() ? ohneTestkonten(t) : t)); } catch (e) { /* Speicher voll/gesperrt */ }
    },
    loeschen: () => localStorage.removeItem(schluessel),
  };
}

export function abgleich(senden) {
  return { aendern: (a) => senden(a) };
}
