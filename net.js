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
//   puls/<id>              {t, ms, akku, laedt}  Lebenszeichen je Handy (nur die Spielleitung liest es, netzwache.js)
//   meldungen/<push-id>    {von, name, spiel ...} "Geht nicht"-Knopf; Kopie unter raeume/meldungsarchiv-partyspiele/<raum>/,
//                                                die bleibt auch nach dem Raum-Ende (meldungen_abholen.py)
//   protokoll/<push-id>    {t, wer, art, text, punkte?}  Spielprotokoll; schreibt der Gastgeber, liest nur die Spielleitung (spielleitung.js)
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
// Nur fuer die Tests (Fund 130): der Test-Webserver (testserver.py) setzt window.__partyEmulator = {host, port}, dann geht
// die App an den lokalen Datenbank-Emulator. Greift ausschliesslich unter localhost/127.0.0.1 - die veroeffentlichte Seite
// nutzt immer die echte Datenbank, auch wenn jemand den Schalter von Hand setzt. Das SDK kommt dann ebenfalls vom Testserver,
// damit die Tests nicht am Netz haengen.
const EMULATOR_SDK = "/__sdk/";
export function emulatorZiel(hostname, schalter) {
  if (!["localhost", "127.0.0.1"].includes(hostname) || !schalter) return null;
  return ["localhost", "127.0.0.1"].includes(schalter.host) && Number.isInteger(schalter.port) ? { host: schalter.host, port: schalter.port } : null;
}

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
      const emu = emulatorZiel(location.hostname, window.__partyEmulator);
      const quelle = emu ? EMULATOR_SDK : SDK;
      const [a, d] = await Promise.all([import(quelle + "firebase-app.js"), import(quelle + "firebase-database.js")]);
      const app = a.initializeApp(KONFIG);
      let uid = null;
      if (ANMELDUNG) {
        try {
          const au = await import(SDK + "firebase-auth.js");
          const auth = au.initializeAuth(app, { persistence: au.browserSessionPersistence });
          uid = auth.currentUser ? auth.currentUser.uid : (await au.signInAnonymously(auth)).user.uid;
        } catch (e) { console.warn("Anonyme Anmeldung fehlgeschlagen:", e && e.code); }
      }
      const db = d.getDatabase(app);
      if (emu) d.connectDatabaseEmulator(db, emu.host, emu.port);
      return { d, db, uid };
    })().catch((e) => { sdkLaden = null; throw e; });
  }
  return sdkLaden;
}

// Verlaesslichkeit am Hotspot (Geburtstags-Runde A, Vorschlaege 121 und 123). Das SDK haelt Schreibvorgaenge bei einem
// Funkloch selbst zurueck und schickt sie nach; drei Luecken schliesst dieser Teil:
// - Geht die Bestaetigung verloren, schickt das SDK dieselbe Aktion noch einmal. Hat der Gastgeber sie schon ausgefuehrt und
//   geloescht, staende sie doppelt da -> der Gastgeber merkt sich die Kennungen (ERLEDIGT_MAX).
// - Die Warteschlange des SDK lebt nur im Speicher -> das Postfach haelt offene Eingaben auch ueber ein Neuladen.
// - Das SDK wartet nach Fehlversuchen immer laenger (bis 5 Minuten), und ein still totes Netz faellt ihm erst spaet auf ->
//   der Waechter stoesst die Verbindung selbst an, der Puls merkt, wenn Schreiben unbestaetigt bleibt.
export const EINGABE_GILT = 60000;   // laenger unterwegs gewesene Spiel-Eingaben verfallen: das Spiel ist laengst weiter
export const PULS_MS = 6000;
const PULS_STUMM_MS = 9000;          // so lange ohne Bestaetigung, obwohl "verbunden": Leitung gilt als tot
const ANSTOSS_MS = [5000, 8000, 12000, 20000];
const ERLEDIGT_MAX = 300;
const MELDUNGSARCHIV = "meldungsarchiv-partyspiele";
const lies = (k, leer) => { try { return JSON.parse(sessionStorage.getItem(k)) || leer; } catch (e) { return leer; } };
const merke = (k, wert) => { try { sessionStorage.setItem(k, JSON.stringify(wert)); } catch (e) { /* privater Modus */ } };

export class Verbindung {
  constructor(code) {
    this.code = code;
    this.abmelden = [];
    this.versatz = 0;          // Serverzeit - eigene Uhr
    this.verbunden = false;
    this.beiVerbindung = null; // (an) => ...
    this.beiVersatz = null;    // (versatz) => ...
    this.beiPostfach = null;   // (offene Eingaben) => ...
    this.postfach = lies(`pa_postfach_${code}`, {});   // Kennung -> {von, a, k}: abgeschickt, aber noch nicht bestaetigt
    this.erledigt = new Set(lies(`pa_erledigt_${code}`, []));
    this.anstoesse = 0;        // fuer die Tests: wie oft die Verbindung angestossen wurde
    this.anstossNr = 0;
    this.naechsterAnstoss = 0;
    this.pulsOffen = 0;
    this.pulsMs = 0;
    this.gesperrt = false;     // nur die Tests: Funkloch nachstellen, solange greift der Waechter nicht ein
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
      if (this.verbunden) { this.anstossNr = 0; this.naechsterAnstoss = 0; this.pulsOffen = 0; this.postfachNachsenden(); }
      if (this.anwesenheit && this.verbunden) this.anwesenheitSetzen();
      if (this.beiVerbindung) this.beiVerbindung(this.verbunden);
    }));
    return this;
  }

  // ---- Selbst-Neuverbinden: ohne Neuladen und ohne neue Anmeldung; Stand, Beobachter und Anwesenheit bleiben, das SDK
  // holt sie beim Wiederverbinden selbst nach
  waechterStarten() {
    if (this.waechter) return;
    this.waechter = setInterval(() => this.wachen(), 1000);
    const sofort = () => { if (!this.verbunden && !document.hidden) this.anstossen(); };
    window.addEventListener("online", sofort);
    document.addEventListener("visibilitychange", sofort);
    this.an(() => { clearInterval(this.waechter); this.waechter = null; window.removeEventListener("online", sofort); document.removeEventListener("visibilitychange", sofort); });
  }
  wachen() {
    if (this.verbunden || this.gesperrt) return;
    const jetzt = Date.now();
    if (!this.naechsterAnstoss) this.naechsterAnstoss = jetzt + ANSTOSS_MS[0];
    if (jetzt >= this.naechsterAnstoss) this.anstossen();
  }
  anstossen() {
    if (this.gesperrt || !this.d) return;
    this.anstoesse++;
    this.anstossNr = Math.min(this.anstossNr + 1, ANSTOSS_MS.length - 1);
    this.naechsterAnstoss = Date.now() + ANSTOSS_MS[this.anstossNr];
    this.d.goOffline(this.db);
    this.d.goOnline(this.db);
  }
  // nur die Tests: Funkloch an (true) oder aus (false)
  funkloch(an) {
    this.gesperrt = an;
    if (an) this.d.goOffline(this.db); else this.d.goOnline(this.db);
  }

  // ---- Lebenszeichen: die Spielleitung sieht daran gruen/gelb/rot und den Akku (netzwache.js). Bleibt ein Puls trotz
  // "verbunden" unbestaetigt, ist die Leitung still tot - dann anstossen statt auf das SDK zu warten.
  pulsStarten(id, zusatz) {
    if (this.pulsTimer) clearInterval(this.pulsTimer);
    this.pulsId = id; this.pulsZusatz = zusatz;
    this.pulsTimer = setInterval(() => this.pulsTakt(), PULS_MS);
    this.an(() => { clearInterval(this.pulsTimer); this.pulsTimer = null; });
    this.pulsTakt();
  }
  pulsTakt() {
    if (!this.verbunden || !this.pulsId) return;
    if (this.pulsOffen) {
      if (Date.now() - this.pulsOffen > PULS_STUMM_MS) { this.pulsOffen = 0; this.anstossen(); }
      return;
    }
    const t0 = this.pulsOffen = Date.now();
    const fertig = () => { if (this.pulsOffen === t0) this.pulsOffen = 0; };
    try {
      this.d.set(this.r(`puls/${this.pulsId}`), { t: this.d.serverTimestamp(), ms: this.pulsMs, ...(this.pulsZusatz ? this.pulsZusatz() : {}) })
        .then(() => { this.pulsMs = Date.now() - t0; fertig(); }, fertig);
    } catch (e) { console.warn("Puls:", e); fertig(); }   // ein Lebenszeichen darf nie die Seite stoeren
  }

  // ---- "Geht nicht"-Knopf: geht am Gastgeber vorbei direkt in die Datenbank, damit er auch ankommt, wenn der haengt
  meldungSenden(werte) {
    const key = this.d.push(this.r("meldungen")).key;
    const m = { ...werte, t: this.d.serverTimestamp() };
    return Promise.all([this.d.set(this.r(`meldungen/${key}`), m),
      this.d.set(this.d.ref(this.db, `raeume/${MELDUNGSARCHIV}/${this.code}/${key}`), m)]);
  }

  // ---- Spielprotokoll: eigener Zweig neben "stand", damit nicht jede Zeile an alle Handys geht
  protokollSchreiben(e) { return this.d.set(this.d.push(this.r("protokoll")), e); }

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
    this.waechterStarten();
    if (this.verbunden) this.anwesenheitSetzen();
  }
  anwesenheitSetzen() {
    const eintragen = (id, name) => {
      const mein = this.r(`da/${id}`);
      this.d.onDisconnect(mein).remove()
        .then(() => this.d.set(mein, { name, t: this.d.serverTimestamp() }))
        .catch((e) => console.warn("Anwesenheit:", e && e.code));
    };
    if (this.anwesenheit) eintragen(this.anwesenheit.id, this.anwesenheit.name);
    Object.entries(this.weitere || {}).forEach(([id, name]) => eintragen(id, name));
  }
  // Controller am selben Geraet (controller.js): eigene Spieler, gleiche Anwesenheit wie das Geraet selbst
  anwesendDazu(id, name) {
    this.weitere = { ...(this.weitere || {}), [id]: name };
    if (this.verbunden && this.d) {
      const r = this.r(`da/${id}`);
      this.d.onDisconnect(r).remove().then(() => this.d.set(r, { name, t: this.d.serverTimestamp() })).catch((e) => console.warn("Anwesenheit:", e && e.code));
    }
  }
  anwesendWeg(id) {
    if (this.weitere) delete this.weitere[id];
    if (this.d) this.d.remove(this.r(`da/${id}`)).catch(() => {});
  }

  // k = Zeitpunkt des Tippens (nach Serverzeit), t = Ankunft beim Server: die Differenz ist die Zeit im Funkloch
  aktionSenden(von, a) {
    const text = JSON.stringify(a);
    // Im Funkloch passiert nach dem Tippen nichts - wer deshalb noch mal tippt, schickt dieselbe Eingabe nur einmal
    if (!this.verbunden && Object.values(this.postfach).some((x) => x.von === von && x.a === text)) return Promise.resolve();
    const key = this.d.push(this.r("aktionen")).key;
    const e = { von, a: text, k: Date.now() + this.versatz };
    this.postfach[key] = e;
    this.postfachGeaendert();
    return this.aktionSchreiben(key, e);
  }
  aktionSchreiben(key, e) {
    e.laeuft = true;
    const fertig = () => { delete this.postfach[key]; this.postfachGeaendert(); };
    return this.d.set(this.r(`aktionen/${key}`), { von: e.von, a: e.a, k: e.k, t: this.d.serverTimestamp() })
      .then(fertig, (x) => { fertig(); throw x; });
  }
  // nach einem Neuladen: was noch offen war, unter derselben Kennung erneut schicken (doppelt faengt der Gastgeber ab)
  postfachNachsenden() {
    Object.entries(this.postfach).forEach(([key, e]) => { if (!e.laeuft) this.aktionSchreiben(key, e).catch((x) => console.warn(x)); });
  }
  postfachGeaendert() {
    merke(`pa_postfach_${this.code}`, Object.fromEntries(Object.entries(this.postfach).map(([k, { laeuft, ...e }]) => [k, e])));
    if (this.beiPostfach) this.beiPostfach(Object.keys(this.postfach).length);
  }
  // nur der Gastgeber: jede neue Aktion genau einmal ausfuehren und aus der Warteschlange nehmen
  aktionenEmpfangen(cb) {
    this.an(this.d.onChildAdded(this.r("aktionen"), (s) => {
      const v = s.val();
      this.d.remove(s.ref).catch(() => {});
      if (this.erledigt.has(s.key)) return;
      this.erledigt.add(s.key);
      if (this.erledigt.size > ERLEDIGT_MAX) this.erledigt.delete(this.erledigt.values().next().value);
      merke(`pa_erledigt_${this.code}`, [...this.erledigt]);
      if (!v || typeof v.a !== "string" || v.a.length > 20000) return;
      let a;
      try { a = JSON.parse(v.a); } catch (e) { return; }
      cb(String(v.von || ""), a, Number(v.t) && Number(v.k) ? v.t - v.k : 0);
    }));
  }

  raumLoeschen() { return this.d.remove(this.wurzel); }
  beenden() {
    this.abmelden.forEach((f) => { try { f(); } catch (e) { /* schon weg */ } });
    this.abmelden = [];
    this.pulsId = null;
    if (this.anwesenheit) { const mein = this.r(`da/${this.anwesenheit.id}`); this.d.remove(mein).catch(() => {}); this.anwesenheit = null; }
    Object.keys(this.weitere || {}).forEach((id) => this.d.remove(this.r(`da/${id}`)).catch(() => {}));
    this.weitere = {};
  }
}

// Stand <-> JSON-Texte. Der Gastgeber merkt sich, was er zuletzt geschrieben hat, und schickt nur Aenderungen.
// stand/beamer (Schritt D): Auszug fuer den Beamer (beamer_spiele.js) - Spiele ohne ihren vollen Stand, also ohne
// Werwolf-Rollen, Mal-Begriff oder Schaetz-Tipps; der Beamer liest nur lobby, tafel und beamer, nie stand/partien.
export function standTeile(raum, beamer) {
  const { partien, tafel, ...lobby } = raum;
  const teile = { lobby: JSON.stringify(lobby), tafel: JSON.stringify(tafel || null), partien: {} };
  Object.entries(partien || {}).forEach(([pid, p]) => { teile.partien[pid] = JSON.stringify(p); });
  if (beamer !== undefined) teile.beamer = JSON.stringify(beamer);
  return teile;
}
export function standAenderung(alt, neu) {
  const upd = {};
  if (!alt || alt.lobby !== neu.lobby) upd["stand/lobby"] = neu.lobby;
  if (!alt || alt.tafel !== neu.tafel) upd["stand/tafel"] = neu.tafel;
  if (neu.beamer !== undefined && (!alt || alt.beamer !== neu.beamer)) upd["stand/beamer"] = neu.beamer;
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
// Beamer: Raum aus lobby, tafel und dem Beamer-Auszug (Spiele nur als Kurzfassung mit "bm" = was die Wand zeigen darf)
export function beamerLesen(t) {
  if (!t || typeof t.lobby !== "string") return null;
  let lobby, tafel = null, bm = null;
  try { lobby = JSON.parse(t.lobby); } catch (e) { return null; }
  try { tafel = t.tafel ? JSON.parse(t.tafel) : null; } catch (e) { tafel = null; }
  try { bm = t.beamer ? JSON.parse(t.beamer) : null; } catch (e) { bm = null; }
  return { ...lobby, tafel, partien: (bm && bm.partien) || {} };
}
