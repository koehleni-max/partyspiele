// Verbindung ueber Firebase Realtime Database (Gratis-Stufe "Spark", Projekt partyspiele-huette, siehe
// alltag/partyspiele/firebase-projekt.md). Nico 26.10.2026: ein Link fuer alle, laeuft ueber mobiles Netz.
//
// Die fruehere Direktverbindung (WebRTC ohne Server, Einladungs- und Antwort-Link je Gast) ist entfernt: ohne STUN-Server
// kommen Handys ueber Mobilfunk nicht zueinander, und ohne Internet laedt die Seite (GitHub Pages) gar nicht erst - als
// Notloesung waere sie also nie gelaufen, haette aber jeden Umbau doppelt gekostet.
//
// Datenform unter /raeume/<raumcode> (Regeln: firebase-regeln.json, kuenftig firebase-regeln-vorschlag.json):
//   gastgeber              {uid, name, t}        welches Geraet den Stand haelt und alle Aktionen ausfuehrt
//   stand/lobby            JSON-Text             Raum ohne Spiele und Tafel (Spieler, Anlass, Aussehen, Schalter, Meldung)
//   stand/tafel            JSON-Text             Turniertafel mit Gesamtwertung
//   stand/partien/<pid>    JSON-Text             je laufendes Spiel
//   aktionen/<push-id>     {von, a: JSON, t}     was die Handys tippen; der Gastgeber fuehrt aus und loescht
//   da/<id>                {name, t}             wer gerade verbunden ist (der Server loescht den Eintrag beim Trennen)
//   gastgeberschluessel/<k>, gastgeberwechsel/<id>   Gastgeber-Wechsel nach Tab-Neustart (greift erst mit den neuen Regeln)
// Der Stand liegt als JSON-Text: die Datenbank loescht leere Listen/Objekte und baut Listen mit Luecken um - die Spiele
// verlassen sich aber genau auf diese Form. Geschrieben wird nur, was sich geaendert hat.

export const SDK = "https://www.gstatic.com/firebasejs/13.1.0/";
export const KONFIG = {
  apiKey: "AIzaSyCcM9DFn2vwRJNzHpT3UrXdgIuQTFf_dOg",
  authDomain: "partyspiele-huette.firebaseapp.com",
  databaseURL: "https://partyspiele-huette-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "partyspiele-huette",
  storageBucket: "partyspiele-huette.firebasestorage.app",
  messagingSenderId: "159330683376",
  appId: "1:159330683376:web:df48626a17b27af289b535",
};
// Anonyme Anmeldung: erst einschalten, wenn sie in der Firebase-Konsole aktiviert ist UND die Regeln aus
// firebase-regeln-vorschlag.json gesetzt sind (beides zusammen, sonst sperrt sich die App aus).
export const ANMELDUNG = false;

const ZEICHEN = "abcdefghjkmnpqrstuvwxyz23456789";
export function zufallsText(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ZEICHEN[x % ZEICHEN.length]).join("");
}
export const neuerCode = () => zufallsText(14);
export const codeGueltig = (c) => /^[a-z0-9]{12,32}$/.test(String(c || ""));

let sdkLaden = null;
function sdk() {
  if (!sdkLaden) {
    sdkLaden = (async () => {
      const [a, d] = await Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-database.js")]);
      const app = a.initializeApp(KONFIG);
      let uid = null;
      if (ANMELDUNG) {
        try {
          const au = await import(SDK + "firebase-auth.js");
          const auth = au.initializeAuth(app, { persistence: au.browserSessionPersistence });
          uid = auth.currentUser ? auth.currentUser.uid : (await au.signInAnonymously(auth)).user.uid;
        } catch (e) { console.warn("Anonyme Anmeldung fehlgeschlagen:", e && e.code); }
      }
      return { d, db: d.getDatabase(app), uid };
    })().catch((e) => { sdkLaden = null; throw e; });
  }
  return sdkLaden;
}

export class Verbindung {
  constructor(code) {
    this.code = code;
    this.abmelden = [];
    this.versatz = 0;          // Serverzeit - eigene Uhr
    this.verbunden = false;
    this.beiVerbindung = null; // (an) => ...
    this.beiVersatz = null;    // (versatz) => ...
  }

  async start() {
    const f = await sdk();
    this.d = f.d; this.db = f.db; this.uid = f.uid;
    this.wurzel = this.d.ref(this.db, `raeume/${this.code}`);
    this.an(this.d.onValue(this.d.ref(this.db, ".info/serverTimeOffset"), (s) => {
      this.versatz = Number(s.val()) || 0;
      if (this.beiVersatz) this.beiVersatz(this.versatz);
    }));
    this.an(this.d.onValue(this.d.ref(this.db, ".info/connected"), (s) => {
      this.verbunden = !!s.val();
      if (this.anwesenheit && this.verbunden) this.anwesenheitSetzen();
      if (this.beiVerbindung) this.beiVerbindung(this.verbunden);
    }));
    return this;
  }

  r(pfad) { return this.d.child(this.wurzel, pfad); }
  an(abm) { this.abmelden.push(abm); }
  zeitstempel() { return this.d.serverTimestamp(); }

  async lesen(pfad) { return (await this.d.get(this.r(pfad))).val(); }
  schreiben(pfad, wert) { return this.d.set(this.r(pfad), wert); }
  aendern(werte) { return this.d.update(this.wurzel, werte); }
  beobachten(pfad, cb) { this.an(this.d.onValue(this.r(pfad), (s) => cb(s.val()), (e) => console.warn("Lesen gesperrt:", pfad, e && e.code))); }

  // Anwesenheit: bei jeder (Wieder-)Verbindung neu eintragen; trennt sich das Handy, loescht der Server den Eintrag
  anwesend(id, name) {
    this.anwesenheit = { id, name };
    if (this.verbunden) this.anwesenheitSetzen();
  }
  anwesenheitSetzen() {
    const { id, name } = this.anwesenheit;
    const mein = this.r(`da/${id}`);
    this.d.onDisconnect(mein).remove()
      .then(() => this.d.set(mein, { name, t: this.d.serverTimestamp() }))
      .catch((e) => console.warn("Anwesenheit:", e && e.code));
  }

  aktionSenden(von, a) {
    return this.d.push(this.r("aktionen"), { von, a: JSON.stringify(a), t: this.d.serverTimestamp() });
  }
  // nur der Gastgeber: jede neue Aktion genau einmal ausfuehren und aus der Warteschlange nehmen
  aktionenEmpfangen(cb) {
    this.an(this.d.onChildAdded(this.r("aktionen"), (s) => {
      const v = s.val();
      this.d.remove(s.ref).catch(() => {});
      if (!v || typeof v.a !== "string" || v.a.length > 20000) return;
      let a;
      try { a = JSON.parse(v.a); } catch (e) { return; }
      cb(String(v.von || ""), a);
    }));
  }

  raumLoeschen() { return this.d.remove(this.wurzel); }
  beenden() {
    this.abmelden.forEach((f) => { try { f(); } catch (e) { /* schon weg */ } });
    this.abmelden = [];
    if (this.anwesenheit) { const mein = this.r(`da/${this.anwesenheit.id}`); this.d.remove(mein).catch(() => {}); this.anwesenheit = null; }
  }
}

// Stand <-> JSON-Texte. Der Gastgeber merkt sich, was er zuletzt geschrieben hat, und schickt nur Aenderungen.
export function standTeile(raum) {
  const { partien, tafel, ...lobby } = raum;
  const teile = { lobby: JSON.stringify(lobby), tafel: JSON.stringify(tafel || null), partien: {} };
  Object.entries(partien || {}).forEach(([pid, p]) => { teile.partien[pid] = JSON.stringify(p); });
  return teile;
}
export function standAenderung(alt, neu) {
  const upd = {};
  if (!alt || alt.lobby !== neu.lobby) upd["stand/lobby"] = neu.lobby;
  if (!alt || alt.tafel !== neu.tafel) upd["stand/tafel"] = neu.tafel;
  const vorher = (alt && alt.partien) || {};
  Object.entries(neu.partien).forEach(([pid, t]) => { if (vorher[pid] !== t) upd[`stand/partien/${pid}`] = t; });
  Object.keys(vorher).forEach((pid) => { if (!(pid in neu.partien)) upd[`stand/partien/${pid}`] = null; });
  return upd;
}
// gelesenen Stand zusammensetzen; merker = letzte Texte (fuer "was hat sich geaendert")
export function standLesen(stand, merker = {}) {
  if (!stand || typeof stand.lobby !== "string") return null;
  const aend = { lobby: merker.lobby !== stand.lobby, tafel: merker.tafel !== stand.tafel, partien: new Set() };
  const vorher = merker.partien || {};
  const partien = {};
  const texte = stand.partien || {};
  Object.entries(texte).forEach(([pid, t]) => {
    if (vorher[pid] !== t) aend.partien.add(pid);
    try { partien[pid] = JSON.parse(t); } catch (e) { /* kaputt: weglassen */ }
  });
  Object.keys(vorher).forEach((pid) => { if (!(pid in texte)) aend.partien.add(pid); });
  let lobby, tafel;
  try { lobby = JSON.parse(stand.lobby); tafel = stand.tafel ? JSON.parse(stand.tafel) : null; } catch (e) { return null; }
  return { raum: { ...lobby, tafel, partien }, aend, merker: { lobby: stand.lobby, tafel: stand.tafel, partien: { ...texte } } };
}
