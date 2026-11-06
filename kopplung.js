// Beamer koppeln ohne Code am Beamer (Grossumbau Runde 3, Plan 3.16; Nico 01.11.2026: "Am Ally ging das ZAHLENFELD des
// Steuerpults auf - genau das muss weg").
//
// 1. Am Ally ist das Lesezeichen ".../partyspiele/#beamer" gespeichert. Die Seite zeigt eine grosse vierstellige Zahl und
//    traegt unter raeume/kopplung-<zahl>/beamer ihre Beamer-Kennung ein (eigener Mini-"Raum": die heutigen Regeln erlauben
//    nur Pfade unter raeume/ mit mindestens 12 Zeichen - "kopplung-1234" hat 13).
// 2. Nico tippt die Zahl am Handy auf der Steuerseite ein ("Beamer koppeln"). Das Handy liest die Kennung, der Gastgeber
//    nimmt sie in raum.admins auf (Aktion "_koppeln", nur Spielleitung), dann schreibt das Handy den Raumcode nach .../ziel.
// 3. Der Beamer springt in den Raum - mit derselben Kennung, also gleich mit Steuerrechten. Der Eintrag wird geloescht.
// Das Ziffernfeld im Steuerpult bleibt nur als Ersatzweg (beamer_pult.js).
import { Verbindung, zufallsText, codeGueltig } from "./net.js";

export const PFAD = (zahl) => `kopplung-${zahl}`;
export const zahlGueltig = (z) => /^\d{4}$/.test(String(z || ""));
const neueZahl = () => String(1000 + Math.floor(Math.random() * 9000));
const GUELTIG = 3 * 3600000;   // so lange gilt ein wartender Eintrag als belegt
const istBeamerId = (id) => /^beamer-[a-z0-9]{6,20}$/.test(String(id || ""));

// ---------------------------------------------------------------- Beamer: Zahl anbieten und warten
// -> Promise { zahl, ende() }; beiZiel(code) kommt, sobald die Spielleitung gekoppelt hat
export async function anbieten(id, beiZiel) {
  let zahl = null, v = null;
  const gemerkt = (() => { try { return sessionStorage.getItem("pa_kopplung_zahl"); } catch (e) { return null; } })();
  for (let versuch = 0; versuch < 6; versuch++) {
    const z = versuch === 0 && zahlGueltig(gemerkt) ? gemerkt : neueZahl();
    const vv = await new Verbindung(PFAD(z)).start();
    const da = await vv.lesen("beamer").catch(() => null);
    if (da && da.id && da.id !== id && Date.now() - (Number(da.t) || 0) < GUELTIG) { vv.beenden(); continue; }   // belegt
    zahl = z; v = vv;
    break;
  }
  if (!v) throw new Error("keine freie Kopplungszahl");
  try { sessionStorage.setItem("pa_kopplung_zahl", zahl); } catch (e) { /* privater Modus */ }
  try { await v.d.onDisconnect(v.wurzel).remove(); } catch (e) { /* aeltere Regeln */ }
  await v.schreiben("beamer", { id, t: Date.now() });
  let fertig = false;
  const ende = () => { if (fertig) return; fertig = true; try { v.raumLoeschen().catch(() => {}); } catch (e) { /* weg */ } v.beenden(); };
  v.beobachten("ziel", (z) => {
    if (fertig || !z || !codeGueltig(z.code)) return;
    ende();
    try { sessionStorage.removeItem("pa_kopplung_zahl"); } catch (e) { /* egal */ }
    beiZiel(z.code);
  });
  return { zahl, ende };
}

// ---------------------------------------------------------------- Handy der Spielleitung
// Kennung des Beamers, der gerade mit dieser Zahl wartet (oder null)
export async function beamerVon(zahl) {
  if (!zahlGueltig(zahl)) return null;
  const v = await new Verbindung(PFAD(zahl)).start();
  try {
    const b = await v.lesen("beamer");
    return b && istBeamerId(b.id) && Date.now() - (Number(b.t) || 0) < GUELTIG ? b.id : null;
  } finally { v.beenden(); }
}
// Raumcode an den wartenden Beamer
export async function zuweisen(zahl, code) {
  const v = await new Verbindung(PFAD(zahl)).start();
  try { await v.schreiben("ziel", { code, t: Date.now() }); } finally { v.beenden(); }
}

// ---------------------------------------------------------------- Seite #beamer (Lesezeichen am Ally)
export function beamerSeite(app, beiRaum) {
  document.body.classList.add("beamer", "koppel-seite");
  document.title = "📽️ Beamer koppeln – Partyspiele";
  let id = null;
  try { id = sessionStorage.getItem("pa_kopplung_id"); } catch (e) { id = null; }
  if (!istBeamerId(id)) id = `beamer-${zufallsText(10)}`;
  try { sessionStorage.setItem("pa_kopplung_id", id); } catch (e) { /* privater Modus */ }
  app.innerHTML = `<div class="koppel">
      <div class="koppel-logo">📽️</div>
      <h1>Beamer koppeln</h1>
      <p class="koppel-zeile">Am Handy der Spielleitung: <b>🛠️ Steuerseite → 🔗 Beamer koppeln</b> und diese Zahl eintippen</p>
      <div class="koppel-zahl" data-kopplungszahl aria-live="polite">····</div>
      <p class="koppel-leise" data-koppel-stand>Verbinde …</p>
      <button class="koppel-voll" data-koppel-voll>⛶ Vollbild</button>
    </div>`;
  const stand = (t) => { const el = app.querySelector("[data-koppel-stand]"); if (el) el.textContent = t; };
  app.querySelector("[data-koppel-voll]").addEventListener("click", async (e) => {
    try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" }); } catch (x) { /* geht auch ohne */ }
    e.currentTarget.remove();
  });
  window.__kopplung = { zahl: () => (app.querySelector("[data-kopplungszahl]") || {}).textContent, id: () => id };
  anbieten(id, (code) => {
    try { sessionStorage.setItem(`pa_beamer_${code}`, id); sessionStorage.setItem("pa_pult_nach_kopplung", "1"); } catch (e) { /* privater Modus */ }
    stand("✓ Gekoppelt – der Raum wird geladen …");
    document.body.classList.remove("koppel-seite");
    beiRaum(code);
  }).then(({ zahl }) => {
    const el = app.querySelector("[data-kopplungszahl]");
    if (el) el.textContent = zahl;
    stand("Wartet auf das Handy … (die Zahl gilt, solange diese Seite offen ist)");
  }).catch((e) => { console.warn(e); stand("Keine Verbindung – Internet prüfen und die Seite neu laden."); });
}
