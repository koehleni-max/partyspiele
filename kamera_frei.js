// Freie Kamera im Partybrett (Grossumbau Runde 3, Plan 3.1 F; Nico 01.11.2026).
//
// Wer am Zug ist, darf die Kamera selbst fuehren: Handy (ein Finger verschiebt, zwei zoomen und drehen), Maus (ziehen
// verschiebt, Rad zoomt, rechte Taste dreht), Controller (rechter Stick verschiebt, Schultertasten LB/RB zoomen, Trigger
// LT/RT drehen). Der Knopf "Karte ansehen" fliegt ueber das ganze Brett, "Zurueck zur Figur" beendet den Freiflug.
// Die Lage geht hoechstens 8-mal pro Sekunde an alle (Live-Leitung von duell.js: stand/live/<pid>kam/<spieler>, nicht
// im Spielstand - so zeichnet kein Handy deshalb neu). Zuschauer und Beamer ziehen sie weich nach. Am Beamer fuehrt die
// Maus nur die eigene Ansicht (der Beamer ist kein Spieler und sendet nichts).
//
// Zustand K: an (Freiflug aktiv), x/z = Blickpunkt auf dem Brett, a = Abstand, d = Drehung um die Hochachse (Bogenmass),
// quelle: "ich" (dieses Geraet am Zug), "lokal" (Beamer-Maus), "fern" (von der Leitung).

export const RAND = 13;            // Blickpunkt bleibt ueber der Insel (Radius der Grasdecke 14,6)
export const NAH = 4.5, FERN = 42;
export const HOEHE = 0.89;         // feste Neigung (wie die Folge-Kamera, ~51 Grad): die Kamera bleibt immer ueber dem Brett
export const SENDE_ABSTAND = 125;  // hoechstens 8 Lagen pro Sekunde
const PAD_TOT = 0.2;

export const K = { an: false, x: 0, z: 0.8, a: 22, d: 0, quelle: "" };
let rolle = { darf: false, sendet: false, key: "", senden: null, start: null };
let zuletztGesendet = 0, sendTimer = null, aenderungen = 0;

export const darf = () => rolle.darf;
export const anzahlAenderungen = () => aenderungen;

// Wer fuehrt die Kamera auf diesem Geraet? key = Zug-Kennung (neuer Zug -> Freiflug aus);
// start() liefert die Lage der Kamera im Moment des Anfassens ({x, z, a, d}), senden(v) schreibt auf die Leitung.
export function steuerung(r) {
  const neu = { darf: !!r.darf, sendet: !!r.sendet, key: String(r.key || ""), senden: r.senden || null, start: r.start || null };
  if (neu.key !== rolle.key) { K.an = false; K.quelle = ""; }
  rolle = neu;
}

const klemmen = () => {
  const r = Math.hypot(K.x, K.z);
  if (r > RAND) { K.x *= RAND / r; K.z *= RAND / r; }
  K.a = Math.max(NAH, Math.min(FERN, K.a));
  K.d = Math.atan2(Math.sin(K.d), Math.cos(K.d));
};

function lageSenden(sofort = false) {
  if (!rolle.sendet || !rolle.senden) return;
  const v = { an: K.an, x: +K.x.toFixed(2), z: +K.z.toFixed(2), a: +K.a.toFixed(2), d: +K.d.toFixed(3) };
  const jetzt = Date.now(), rest = SENDE_ABSTAND - (jetzt - zuletztGesendet);
  clearTimeout(sendTimer);
  if (sofort || rest <= 0) { zuletztGesendet = jetzt; try { rolle.senden(v); } catch (e) { console.warn(e); } }
  else sendTimer = setTimeout(() => lageSenden(true), rest);   // die letzte Lage kommt immer an
}

// Freiflug beginnen (falls noch nicht): Lage der Kamera uebernehmen
function anfassen() {
  if (K.an && K.quelle) return;
  const s = rolle.start ? rolle.start() : null;
  if (s) Object.assign(K, s);
  K.an = true; K.quelle = rolle.sendet ? "ich" : "lokal";
}
export function aendern(fn) {
  if (!rolle.darf) return;
  anfassen();
  fn(K);
  klemmen();
  aenderungen++;
  lageSenden();
}
// Knopf "Karte ansehen": ganzes Brett von oben, danach frei verschieben
export function karteAnsehen(uebersicht) {
  if (!rolle.darf) return;
  Object.assign(K, uebersicht || { x: 0, z: 0.8, a: 30, d: 0 });
  K.an = true; K.quelle = rolle.sendet ? "ich" : "lokal";
  klemmen(); aenderungen++;
  lageSenden(true);
}
export function zurueck() {
  if (!K.an) return;
  K.an = false; K.quelle = "";
  aenderungen++;
  if (rolle.darf) lageSenden(true);
}
// Lage von der Leitung (andere Geraete): nur, solange hier niemand selbst fuehrt
export function fern(v) {
  if (rolle.darf && K.quelle === "lokal" && K.an) return;   // Beamer-Maus hat Vorrang an diesem Geraet
  if (rolle.sendet) return;                                // wer am Zug ist, fuehrt selbst
  if (!v || typeof v !== "object") { if (K.quelle === "fern") { K.an = false; K.quelle = ""; } return; }
  if (!v.an) { if (K.an && K.quelle !== "lokal") { K.an = false; K.quelle = ""; } return; }
  ["x", "z", "a", "d"].forEach((k) => { if (typeof v[k] === "number" && isFinite(v[k])) K[k] = v[k]; });
  K.an = true; K.quelle = "fern";
  klemmen();
}

// Bewegung je Pixel auf dem Bildschirm (bei Abstand a und senkrechtem Sichtwinkel fov)
const proPixel = (hoehePx, fov = 42) => (2 * K.a * Math.tan((fov * Math.PI) / 360)) / Math.max(120, hoehePx);
function verschieben(dx, dy, hoehePx) {
  const s = proPixel(hoehePx);
  // rechts auf dem Bildschirm = (cos d, -sin d), "nach oben" auf dem Bildschirm = vom Betrachter weg = -(sin d, cos d)
  const c = Math.cos(K.d), n = Math.sin(K.d);
  K.x += -dx * s * c + -dy * s * n * 1.25;
  K.z += dx * s * n + -dy * s * c * 1.25;
}

// Eingaben an einem Element (3D-Bild oder Kamera-Flaeche am Handy). tipp() = kurzer Tipp ohne Bewegung.
export function binden(el, { tipp = null, beiAenderung = null } = {}) {
  if (!el || el.dataset.kameraFrei) return;
  el.dataset.kameraFrei = "1";
  const finger = new Map();
  let start = null, bewegt = false, rechts = false, zwei = null;
  const melde = () => { if (beiAenderung) beiAenderung(); };
  el.addEventListener("contextmenu", (e) => { if (rolle.darf) e.preventDefault(); });
  el.addEventListener("pointerdown", (e) => {
    finger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (finger.size === 1) { start = { x: e.clientX, y: e.clientY }; bewegt = false; rechts = e.button === 2; }
    if (finger.size === 2) { const [p, q] = [...finger.values()]; zwei = { d: Math.hypot(q.x - p.x, q.y - p.y), w: Math.atan2(q.y - p.y, q.x - p.x) }; }
    if (rolle.darf) { try { el.setPointerCapture(e.pointerId); } catch (x) { /* egal */ } }
  });
  el.addEventListener("pointermove", (e) => {
    const alt = finger.get(e.pointerId);
    if (!alt) return;
    const neu = { x: e.clientX, y: e.clientY };
    finger.set(e.pointerId, neu);
    if (!rolle.darf) return;
    if (!bewegt && start && Math.hypot(neu.x - start.x, neu.y - start.y) < 6 && finger.size < 2) return;
    bewegt = true;
    const h = el.clientHeight || 300;
    if (finger.size >= 2) {
      const [p, q] = [...finger.values()];
      const d = Math.hypot(q.x - p.x, q.y - p.y), w = Math.atan2(q.y - p.y, q.x - p.x);
      if (zwei && zwei.d > 10) aendern((k) => { k.a *= zwei.d / Math.max(10, d); k.d -= w - zwei.w; });
      zwei = { d, w };
    } else if (rechts) aendern((k) => { k.d -= (neu.x - alt.x) * 0.006; });
    else aendern(() => verschieben(neu.x - alt.x, neu.y - alt.y, h));
    melde();
  });
  const los = (e) => {
    finger.delete(e.pointerId);
    if (finger.size < 2) zwei = null;
    if (!finger.size) { if (!bewegt && tipp && e.type === "pointerup") tipp(); start = null; }
  };
  el.addEventListener("pointerup", los);
  el.addEventListener("pointercancel", los);
  el.addEventListener("wheel", (e) => {
    if (!rolle.darf) return;
    e.preventDefault();
    aendern((k) => { k.a *= Math.exp(e.deltaY * 0.0012); });
    melde();
  }, { passive: false });
}

// Controller: rechter Stick verschiebt, LB/RB zoomen, LT/RT drehen, rechter Stick gedrueckt = zurueck zur Figur.
// Wird je Bild aufgerufen (3D-Schleife bzw. eigener Takt der Kamera-Flaeche).
let r3Vorher = false;
export function padTakt(dt, hoehePx = 600) {
  if (!rolle.darf || typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return false;
  let liste = [];
  try { liste = [...(navigator.getGamepads() || [])].filter((g) => g && g.connected !== false); } catch (e) { return false; }
  if (!liste.length) return false;
  let sx = 0, sy = 0, zoom = 0, dreh = 0, r3 = false;
  const knopf = (g, i) => !!(g.buttons && g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5));
  liste.forEach((g) => {
    const ax = g.axes || [];
    if (Math.abs(ax[2] || 0) > PAD_TOT) sx += ax[2];
    if (Math.abs(ax[3] || 0) > PAD_TOT) sy += ax[3];
    if (knopf(g, 4)) zoom += 1; if (knopf(g, 5)) zoom -= 1;
    if (knopf(g, 6)) dreh += 1; if (knopf(g, 7)) dreh -= 1;
    if (knopf(g, 11)) r3 = true;
  });
  if (r3 && !r3Vorher) zurueck();
  r3Vorher = r3;
  if (!sx && !sy && !zoom && !dreh) return false;
  aendern((k) => {
    if (sx || sy) verschieben(-sx * 520 * dt, -sy * 520 * dt, hoehePx);
    if (zoom) k.a *= Math.exp(zoom * dt * 1.1);
    if (dreh) k.d += dreh * dt * 1.6;
  });
  return true;
}

// Pose fuer die 3D-Ansicht: Blickpunkt und Kameraort
export function pose() {
  const l = { x: K.x, y: 0.6, z: K.z };
  const ch = Math.cos(HOEHE);
  return { l, p: { x: l.x + Math.sin(K.d) * ch * K.a, y: l.y + Math.sin(HOEHE) * K.a, z: l.z + Math.cos(K.d) * ch * K.a } };
}
// aus einer Kamera (Ort p, Blick l) die Werte fuer K (beim Anfassen)
export function ausKamera(p, l) {
  const dx = p.x - l.x, dz = p.z - l.z, dy = p.y - l.y;
  return { x: l.x, z: l.z, a: Math.max(NAH, Math.min(FERN, Math.hypot(dx, dy, dz))), d: Math.atan2(dx, dz) };
}
