// Konten in der Partyspiele-App (Nico 26.10.2026, Nachtraege 1-5 zum Halloween-Auftrag).
//
// Gaeste geben nur einen Namen ein. Daneben gibt es zwei Sonderfaelle, beide nur hier erkannt:
//
// 1. Testkonto: Name enthaelt "test" (Schreibweise egal), solange der Raum-Schalter "Testkonten erlaubt" an ist (Vorgabe
//    an; jede Spielleitung kann ihn umschalten, er wirkt sofort bei allen). Ein Testkonto spielt ganz normal mit und sieht
//    seine Punkte im Spiel, aber nichts davon kommt in Gesamtwertung, Runden, Pokal, Abendwertung oder die Sicherung.
//    Steuerrechte hat ein Testkonto NICHT von selbst - auch Tester brauchen den Freischaltcode. Schalter aus = ein Name
//    mit "test" ist ein ganz normaler Spieler.
//
// 2. Spielleitung (Admin): wer den festen Freischaltcode eingibt. Gilt in jedem Raum, mehrere gleichzeitig moeglich,
//    spielt normal mit und schaltet zwischen Mitspielen und Steuern um. Der Code steht nirgends im Klartext:
//      Pruefwert = SHA-256( PBKDF2-SHA-256(code, SALZ, 600 000 Runden, 32 Byte) ), als Hex-Text in PRUEFWERTE.
//    Erzeugen: `python alltag/partyspiele/pruefwert.py` (fragt den Code verdeckt ab, gibt nur den Pruefwert aus).
//    Ablauf: das Handy prueft den Code gegen den Pruefwert und behaelt nur den abgeleiteten Schluessel (sessionStorage,
//    ueberlebt Neuladen im selben Tab). Dem Gastgeber-Geraet beweist es den Code mit HMAC(Schluessel, Raum + Konto);
//    der Gastgeber prueft den Beweis mit seinem eigenen Schluessel - er muss also selbst den Code eingegeben haben.
//    Ein Gast kann sich so keine Steuerrechte geben, ohne den Code zu kennen. Falsche Eingaben werden gebremst.
//
// Grenzen, ehrlich: Der Pruefwert ist oeffentlich. Wer ihn mit viel Rechenleistung gegen alle sechsstelligen Zahlen
// probiert, findet den Code (die 600 000 Runden machen das nur langsam, nicht unmoeglich) - ein laengerer Code hilft.
// Aktionen mit fremdem Absender faelschen kann ein Kundiger erst nicht mehr, wenn die anonyme Anmeldung und die Regeln aus
// firebase-regeln-vorschlag.json aktiv sind (net.js ANMELDUNG).

export const istTestName = (n) => /test/i.test(String(n ?? ""));
export const testkontenAn = (raum) => !raum || raum.testkonten !== false;
export const istTestkonto = (raum, name) => testkontenAn(raum) && istTestName(name);
export const istAdmin = (raum, id) => !!(raum && Array.isArray(raum.admins) && id && raum.admins.includes(id));

export const SALZ = "partyspiele-huette:freischalt:v1";
export const RUNDEN = 600000;

// >>> HIER setzt Jarvis den Pruefwert des echten Codes ein (Ausgabe von pruefwert.py). Der Platzhalter passt zu keinem Code.
export const PRUEFWERTE = [
  "70d876e42ca2c397ea941f01be85700ac73c433bcb00e7ffbc71524e08896887",  // Nicos Code (26.10.2026, Klartext nur in geheim/persoenliche-pins.md)
];
// Pruefwert des Testcodes der automatischen Tests (testhilfe.py). Gilt NUR, wenn die Seite von diesem PC kommt
// (localhost/127.0.0.1), nie auf der veroeffentlichten Seite.
const TEST_PRUEFWERT = "cd039a15e21071846bcbdf2cef021756648bffe26623799081e4035e7a053233";
const lokal = () => ["localhost", "127.0.0.1"].includes(location.hostname);

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
const bytes = (h) => new Uint8Array((String(h).match(/../g) || []).map((x) => parseInt(x, 16)));
export const codeSauber = (c) => String(c ?? "").replace(/\s+/g, "");

export async function schluesselAus(code) {
  const basis = await crypto.subtle.importKey("raw", new TextEncoder().encode(codeSauber(code)), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(SALZ), iterations: RUNDEN }, basis, 256));
}
export async function pruefwertAus(schluesselHex) { return hex(await crypto.subtle.digest("SHA-256", bytes(schluesselHex))); }

// -> Schluessel (Hex) bei richtigem Code, sonst null
export async function codePruefen(code) {
  if (!codeSauber(code)) return null;
  const k = await schluesselAus(code);
  const p = await pruefwertAus(k);
  const gueltig = [...PRUEFWERTE, ...(lokal() ? [TEST_PRUEFWERT] : [])];
  return gueltig.some((x) => gleichLang(x, p)) ? k : null;
}

async function hmac(schluesselHex, text) {
  const k = await crypto.subtle.importKey("raw", bytes(schluesselHex), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(text)));
}
export const beweisText = (raumcode, id) => `spielleitung|${raumcode}|${id}`;
export const beweis = (schluesselHex, raumcode, id) => hmac(schluesselHex, beweisText(raumcode, id));
export async function beweisPruefen(schluesselHex, raumcode, id, b) {
  if (!schluesselHex || typeof b !== "string") return false;
  return gleichLang(await beweis(schluesselHex, raumcode, id), b);
}
// Vergleich ohne fruehen Abbruch
function gleichLang(x, y) {
  x = String(x); y = String(y);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return d === 0;
}

// ---------------------------------------------------------------- Bremse fuer falsche Codes (je Geraet)
// nach 3 Fehlversuchen 10 s, dann 30 s, 60 s, 2 min, 5 min ... (hoechstens 15 min)
const BREMSE = "pa_bremse";
const STUFEN = [0, 0, 0, 10, 30, 60, 120, 300, 600, 900];
function bremseLesen() { try { return JSON.parse(localStorage.getItem(BREMSE)) || { n: 0, bis: 0 }; } catch (e) { return { n: 0, bis: 0 }; } }
export function wartezeit(jetzt = Date.now()) { return Math.max(0, bremseLesen().bis - jetzt); }
export function fehlversuch(jetzt = Date.now()) {
  const b = bremseLesen();
  b.n += 1;
  b.bis = jetzt + STUFEN[Math.min(b.n, STUFEN.length - 1)] * 1000;
  localStorage.setItem(BREMSE, JSON.stringify(b));
  return b.bis - jetzt;
}
export function erfolg() { localStorage.removeItem(BREMSE); }

// Schluessel dieses Tabs (ueberlebt Neuladen, nicht das Schliessen)
const SITZ = "pa_admin_k";
export const meinSchluessel = () => sessionStorage.getItem(SITZ);
export const schluesselMerken = (k) => (k ? sessionStorage.setItem(SITZ, k) : sessionStorage.removeItem(SITZ));
