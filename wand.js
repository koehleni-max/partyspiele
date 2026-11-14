// Wand-Geraet haelt den Raum (Nico 13.11.2026: "ich will einfach einen Link, der relativ einfach abzutippen ist, auf dem Ally
// oder Tablet oeffnen - dort ist dann die Beamer-Seite und gleichzeitig kann ich dort auch den Raum aufrecht halten").
//
// Adresse: .../partyspiele/#tv
// 1. Die Seite fragt einmal nach Anlass und Spielleitungs-Code und oeffnet den Raum.
// 2. Den Raum haelt dieselbe Seite: in einem unsichtbaren Rahmen laeuft die normale App im Raumhalter-Modus (?halter=1,
//    app.js) - sie fuehrt alle Spiele aus, spielt aber nirgends mit. Davor liegt die gewohnte Wand-Ansicht (beamer.js).
// 3. Neu laden oder Browser neu starten: die Seite fuehrt denselben Raum weiter (Raum und Schluessel merkt sich dieses Geraet).
// Grenze, ehrlich: der Raum laeuft nur, solange diese Seite auf dem Geraet vorn ist. Zeigt das Geraet etwas anderes (Spiel im
// Vollbild, andere App am Tablet), stehen die Spiele, bis die Seite wieder vorn ist - oder eine Spielleitung holt den Raum
// solange auf ihr Handy ("Raum hierher holen"); ist die Wand zurueck, uebernimmt sie von selbst wieder.
import { Verbindung, codeGueltig } from "./net.js";
import * as K from "./konten.js";
import * as A from "./anlass.js";
import { esc } from "./hilfe.js";

const RAUM = "pa_wand_raum";       // {code, id, titel, zeit}: der Raum, den dieses Geraet haelt
const SCHLUESSEL = "pa_wand_k";    // Schluessel der Spielleitung auf diesem Geraet (damit es nach einem Neustart weiter freischalten kann)
const LAEUFT = "pa_wand_laeuft";   // dieser Tab haelt gerade diesen Raum: Neuladen fuehrt ohne Nachfrage weiter
export const NAME = "Wand-Gerät";
const WARTEN = 40000;

const lies = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const basis = () => location.href.split("#")[0].split("?")[0];
const gemerkt = () => { const g = lies(RAUM); return g && codeGueltig(g.code) && g.id ? g : null; };
function vergessen() { try { localStorage.removeItem(RAUM); sessionStorage.removeItem(LAEUFT); } catch (e) { /* privater Modus */ } }

let app = null, wandStart = null, meldung = "";

export function seite(wurzel, start) {
  app = wurzel; wandStart = start;
  document.body.classList.add("beamer", "wand-start");
  document.title = "📽️ Partyspiele an der Wand";
  window.__wand = { halter: () => { const f = document.getElementById("wand-halter"); return f && f.contentWindow ? f.contentWindow.__partyspiele : null; }, gemerkt };
  const g = gemerkt();
  let laeuft = null;
  try { laeuft = sessionStorage.getItem(LAEUFT); } catch (e) { laeuft = null; }
  if (g && laeuft === g.code) return fortsetzen(g);   // Seite mitten am Abend neu geladen
  zeigen();
}

function zeigen() {
  const g = gemerkt();
  app.innerHTML = `<div class="wand">
      <div class="wand-logo">📽️</div>
      <h1>Partyspiele an der Wand</h1>
      <p class="wand-leise">Dieses Gerät zeigt das große Bild und hält den Raum. Lass die Seite offen und vorn – dann laufen alle Spiele.</p>
      ${meldung ? `<p class="wand-meldung" role="alert">${esc(meldung)}</p>` : ""}
      ${g ? `<div class="wand-karte"><h2>Raum von vorhin</h2>
          <button class="wand-gross gruen" data-wand-weiter>▶️ ${esc(g.titel || "Raum")} weiterführen</button>
          <p class="wand-leise klein">Alle Gäste und Punkte bleiben, der Link bleibt derselbe.</p></div>` : ""}
      <div class="wand-karte"><h2>${g ? "Oder einen neuen Raum öffnen" : "Raum öffnen"}</h2>
        <label class="wand-feld">Spielleitungs-Code
          <input id="wand-code" type="password" inputmode="numeric" autocomplete="off" maxlength="40" placeholder="Code der Spielleitung">
        </label>
        <div class="wand-anlaesse">
          <button class="wand-gross a-geburtstag" data-wand-auf="geburtstag">🎂 Geburtstag</button>
          <button class="wand-gross a-halloween" data-wand-auf="halloween">🎃 Halloween</button>
        </div>
        <p class="wand-leise klein">Der Code bleibt auf diesem Gerät – so kann es Spielleitungen freischalten.</p>
      </div>
      <p class="wand-leise klein">Einen Raum zeigen, den ein Handy schon geöffnet hat? <a href="#beamer">Mit Zahl koppeln</a></p>
    </div>`;
  app.onclick = async (ev) => {
    const el = ev.target.closest("[data-wand-auf],[data-wand-weiter]");
    if (!el || el.disabled) return;
    if (el.dataset.wandWeiter !== undefined) return fortsetzen(gemerkt());
    oeffnen(el.dataset.wandAuf);
  };
}

function warteBild(text) {
  app.onclick = null;
  app.innerHTML = `<div class="wand"><div class="wand-logo spin">⏳</div><h1>${esc(text)}</h1></div>`;
}
function fehler(text) { meldung = text; rahmenWeg(); zeigen(); }

function rahmenWeg() { const f = document.getElementById("wand-halter"); if (f) f.remove(); }
// Der unsichtbare Rahmen mit dem Raumhalter. Er liegt im Bild (2 x 2 Punkte, durchsichtig): so behandelt ihn kein Browser
// als "nicht zu sehen" und bremst seine Uhren.
function rahmen(adresse) {
  rahmenWeg();
  const f = document.createElement("iframe");
  f.id = "wand-halter";
  f.setAttribute("aria-hidden", "true");
  f.tabIndex = -1;
  f.allow = "screen-wake-lock";
  f.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;border:0;opacity:0;pointer-events:none;z-index:-1";
  f.src = adresse;
  document.body.appendChild(f);
  return f;
}
// -> {code, id}, sobald der Rahmen den Raum haelt; null nach WARTEN
function halterBereit(f) {
  return new Promise((fertig) => {
    const ab = Date.now();
    const t = setInterval(() => {
      let p = null;
      try { p = f.contentWindow && f.contentWindow.__partyspiele; } catch (e) { p = null; }
      if (p && p.rolle() === "gastgeber" && p.raum() && p.code()) { clearInterval(t); fertig({ code: p.code(), id: p.id() }); }
      else if (Date.now() - ab > WARTEN) { clearInterval(t); fertig(null); }
    }, 250);
  });
}

function schluesselHolen() {
  // nach einem Browser-Neustart kennt der Tab den Schluessel nicht mehr: aus dem Gedaechtnis dieses Geraets nachlegen
  try { if (!K.meinSchluessel() && localStorage.getItem(SCHLUESSEL)) K.schluesselMerken(localStorage.getItem(SCHLUESSEL)); } catch (e) { /* privater Modus */ }
}

async function oeffnen(art) {
  const feld = document.getElementById("wand-code");
  const roh = feld ? feld.value : "";
  if (!K.codeSauber(roh)) { meldung = "Bitte zuerst den Spielleitungs-Code eintippen – ohne ihn kann später niemand Spielleitung werden."; return zeigen(); }
  if (K.wartezeit() > 0) { meldung = `Zu viele falsche Codes – nächster Versuch in ${Math.ceil(K.wartezeit() / 1000)} Sekunden.`; return zeigen(); }
  warteBild("Code wird geprüft …");
  const k = await K.codePruefen(roh).catch(() => null);
  if (!k) { K.fehlversuch(); return fehler("Der Code stimmt nicht. Bitte noch einmal eintippen."); }
  K.erfolg();
  K.schluesselMerken(k);
  try { localStorage.setItem(SCHLUESSEL, k); } catch (e) { /* privater Modus */ }
  const anlass = A.anlassNeu(art);
  if (!anlass) return fehler("Diesen Anlass gibt es nicht.");
  meldung = "";
  warteBild("Raum wird geöffnet …");
  const f = rahmen(`${basis()}?halter=1&auf=${encodeURIComponent(art)}`);
  const r = await halterBereit(f);
  if (!r) return fehler("Der Raum ließ sich nicht öffnen. Ist das Internet an?");
  try {
    localStorage.setItem(RAUM, JSON.stringify({ code: r.code, id: r.id, titel: A.titel(anlass), zeit: Date.now() }));
    sessionStorage.setItem(LAEUFT, r.code);
  } catch (e) { /* privater Modus */ }
  wandZeigen(r.code);
}

async function fortsetzen(g) {
  if (!g) return zeigen();
  warteBild("Raum wird geladen …");
  // gibt es den Raum noch? (die Spielleitung kann ihn beendet haben)
  let da = null;
  try {
    const v = await new Verbindung(g.code).start();
    try { da = await v.lesen("stand/lobby"); } finally { v.beenden(); }
  } catch (e) { return fehler("Keine Verbindung. Ist das Internet an?"); }
  if (!da) { vergessen(); return fehler("Den Raum von vorhin gibt es nicht mehr. Öffne einfach einen neuen."); }
  schluesselHolen();
  try { sessionStorage.setItem(`pa_sitzung_${g.code}`, JSON.stringify({ id: g.id, name: NAME, rolle: "gastgeber" })); } catch (e) { /* privater Modus */ }
  const f = rahmen(`${basis()}?halter=1#r=${g.code}`);
  const r = await halterBereit(f);
  if (!r) return fehler("Der Raum ließ sich nicht übernehmen. Ist das Internet an?");
  try {
    localStorage.setItem(RAUM, JSON.stringify({ ...g, id: r.id, zeit: Date.now() }));
    sessionStorage.setItem(LAEUFT, g.code);
  } catch (e) { /* privater Modus */ }
  wandZeigen(g.code);
}

function wandZeigen(code) {
  app.onclick = null;
  document.body.classList.remove("wand-start");
  wandStart(code);
}
