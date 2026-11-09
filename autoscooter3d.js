// Autoscooter in 3D (Partyspiele-Kritik Schritt 3, Nico 08.11.2026: "soll in 3D sein", "darf nicht ruckeln", "deutlich
// hochwertiger"). Gleicher Unterbau wie Partybrett und Mensch aergere dich nicht: three.js aus vendor/, Himmel und
// Spiegelungen aus brett_schmuck.js, Fahrer-Figuren aus modelle.js, Leuchten (Nachbearbeitung) und Qualitaetsstufen wie brett3d.js.
// Nur die Darstellung - Regeln, Punkte und Computer bleiben in autoscooter.js beim Gastgeber.
//   Halle     Kirmes-Autoscooter bei Nacht: Stahlboden mit Glanz und Plattenfugen, Gummibande auf Blechwand mit
//             Warnstreifen und Lauflichtern, Stromgitter unter dem Dach, Saeulen, Neonroehren, Leuchtschrift, bunte Strahler.
//   Wagen     richtige Autoscooter (Schritt 4b): runde Lackwanne mit Haube und Heckschild, Gummiwulst, Chrom, Startnummer,
//             Sitz, Lenkrad (dreht beim Lenken), Scheinwerfer, Ruecklichter, Stromstange mit Feder und Funken am Gitter,
//             Unterboden-Leuchten; Fahrer aus runden Formen mit Kopf (wackelt beim Stoss nach), Haaren, Haenden am Lenkrad.
//   Glanz     Lack, Chrom, Boden und Bande spiegeln eine einmal gerechnete Ersatz-Halle (Lichterketten, Neon, Strahler).
//   Weich     Der Gastgeber rechnet 10-mal pro Sekunde. Jeder Stand kommt mit seiner Gastgeber-Uhr (t); die Ansicht spielt
//             die Staende mit kleinem Puffer (VERZUG) nach und zieht die Wagen dazwischen weich (Bild fuer Bild, 60/s).
//             Fehlt ein Stand, wird kurz vorausgerechnet. Das eigene Auto am Handy faehrt sofort: es wird ab dem letzten
//             Stand mit der eigenen Lenk-Stellung vorausgerechnet (asFahren) und Abweichungen klingen sanft aus.
//   Wucht     Zusammenstoss: Ruck und Nachwippen beider Wagen, Funken, Stossring, Lichtblitz, Kamera-Stoss, Ton,
//             Punkte schweben auf, am Handy Vibration. Turbo: Flammen und Leuchtspur. Countdown 3-2-1-LOS,
//             Siegerehrung mit Treppchen, Scheinwerfern und Konfetti. Rangliste live (Wand) bzw. eigener Platz (Handy).
//   Leistung  Wagenteile als wenige Sammel-Zeichnungen (je Teil eine fuer alle Wagen). Stufen wie beim Partybrett
//             (Pixeldichte, Schatten, Lichter, Leuchten); faellt die Bildrate, eine Stufe tiefer. ?fps zeigt die Bildrate.
//             Ohne WebGL bleibt das flache Bild (autoscooter.js, asBild).
import * as THREE from "./vendor/three.module.js";
import { mergeGeometries } from "./vendor/addons/utils/BufferGeometryUtils.js";
import * as SC from "./brett_schmuck.js";
import * as MD from "./modelle.js";
import { STUFE, STUFEN, startStufe, wenigBewegung } from "./brett3d.js";
import { spiele as klang } from "./ton.js";
import { esc } from "./hilfe.js";
import * as AS from "./autoscooter.js";   // gegenseitiger Import: nur innerhalb von Funktionen benutzen

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const K = 0.1;                       // eine Rechen-Einheit = 0,1 in der Welt (Flaeche 10 x 6)
const VERZUG = 170;                  // Puffer der Nachspiel-Uhr (ms): ein Takt (100) plus Schwankung im Netz
const VORAUS_MAX = 0.25;             // so lange (s) wird ohne neuen Stand weitergerechnet
const zufallFest = (k) => { const x = Math.sin(k * 91.7 + 13.1) * 43758.5453; return x - Math.floor(x); };
const wDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const kurz = (t, n = 14) => (String(t || "").length > n ? String(t).slice(0, n - 1) + "…" : String(t || ""));
const MEDAILLE = ["🥇", "🥈", "🥉"];
const lsLesen = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSchreiben = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* privater Modus */ } };
// Zeiten in Sekunden (fuer die Tests auslesbar)
export const AS3_ZEIT = { podest: 1.7, plus: 1.1, funken: 0.7, ring: 0.55, los: 0.9 };
const HAUT = ["#f1c7a0", "#c98e62", "#f6d5b8", "#8d5a3b", "#e0ac7e", "#5c3a28"];
// Haarfarben eher mittel bis hell: hinter dem Wagen hebt sich der Kopf so vom dunklen Hallendach ab
const HAARE = ["#8a5a2e", "#e2b866", "#b4522a", "#5a3a22", "#f08bb5", "#c9a06a", "#3b2a20", "#6f8fe0"];

let g = null, generation = 0, geht = null;

// Kann dieses Geraet WebGL? (einmal pruefen; der Probe-Kasten wird gleich wieder freigegeben)
export function as3dGeht() {
  if (geht !== null) return geht && !globalThis.__as3dAus;
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas"), gl = c.getContext("webgl2") || c.getContext("webgl");
    geht = !!gl;
    const weg = gl && gl.getExtension("WEBGL_lose_context"); if (weg) weg.loseContext();
  } catch (e) { geht = false; }
  return geht && !globalThis.__as3dAus;
}

// ---------------------------------------------------------------- Texturen
function leinwand(w, h = w) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
function textur(c, wdh = false) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (wdh) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
let weichT = null;
function weich() {
  if (weichT) return weichT;
  const [c, x] = leinwand(64), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "#fff"); gr.addColorStop(0.35, "#ffffffaa"); gr.addColorStop(1, "#fff0"); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return (weichT = textur(c));
}
// Stahlboden: dunkle Platten mit Fugen und Nieten, feiner Schliff, Reifen-Spuren, Stern in der Mitte
function bodenTextur() {
  const W = 1280, H = 768, [c, x] = leinwand(W, H), p = W / 10;
  x.fillStyle = "#171c29"; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 10; i++) for (let j = 0; j < 6; j++) { x.fillStyle = `rgba(160,180,255,${0.02 + zufallFest(i * 7 + j) * 0.04})`; x.fillRect(i * p, j * p, p, p); }
  x.lineWidth = 1;
  for (let k = 0; k < 900; k++) { const y = zufallFest(k + 11) * H; x.strokeStyle = `rgba(255,255,255,${0.01 + zufallFest(k) * 0.025})`; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y + (zufallFest(k + 3) - 0.5) * 6); x.stroke(); }
  // Reifen-Abrieb: dunkle Boegen
  for (let k = 0; k < 40; k++) { x.strokeStyle = `rgba(0,0,0,${0.08 + zufallFest(k + 40) * 0.12})`; x.lineWidth = 6 + zufallFest(k + 41) * 10; x.beginPath(); x.arc(zufallFest(k + 42) * W, zufallFest(k + 43) * H, 60 + zufallFest(k + 44) * 220, zufallFest(k + 45) * 6, zufallFest(k + 45) * 6 + 0.6 + zufallFest(k + 46)); x.stroke(); }
  // Mitte: Ring mit Stern und Schrift
  x.save(); x.translate(W / 2, H / 2);
  x.strokeStyle = "rgba(255,210,63,0.26)"; x.lineWidth = 12; x.beginPath(); x.arc(0, 0, 200, 0, 7); x.stroke();
  x.lineWidth = 4; x.beginPath(); x.arc(0, 0, 176, 0, 7); x.stroke();
  x.fillStyle = "rgba(255,210,63,0.14)"; x.beginPath();
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 62 : 150; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  x.fill();
  x.font = "900 58px sans-serif"; x.textAlign = "center"; x.fillStyle = "rgba(255,255,255,0.09)"; x.fillText("AUTOSCOOTER", 0, 250 + 20);
  x.restore();
  // Plattenfugen mit Lichtkante, Nieten an den Ecken
  for (let i = 0; i <= 10; i++) { x.fillStyle = "#080a10"; x.fillRect(i * p - 2, 0, 4, H); x.fillStyle = "rgba(255,255,255,0.07)"; x.fillRect(i * p + 2, 0, 1, H); }
  for (let j = 0; j <= 6; j++) { x.fillStyle = "#080a10"; x.fillRect(0, j * p - 2, W, 4); x.fillStyle = "rgba(255,255,255,0.07)"; x.fillRect(0, j * p + 2, W, 1); }
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 6; j++) [[-9, -9], [9, -9], [-9, 9], [9, 9]].forEach(([a, b]) => {
    const gr = x.createRadialGradient(i * p + a - 1, j * p + b - 1, 0, i * p + a, j * p + b, 4); gr.addColorStop(0, "#9aa3b8"); gr.addColorStop(1, "#2a3040");
    x.fillStyle = gr; x.beginPath(); x.arc(i * p + a, j * p + b, 3.5, 0, 7); x.fill();
  });
  return textur(c);
}
function warnTextur() {
  const [c, x] = leinwand(256, 32);
  x.fillStyle = "#151515"; x.fillRect(0, 0, 256, 32); x.fillStyle = "#facc15";
  for (let i = -2; i < 10; i++) { x.beginPath(); x.moveTo(i * 32, 32); x.lineTo(i * 32 + 16, 32); x.lineTo(i * 32 + 32, 0); x.lineTo(i * 32 + 16, 0); x.closePath(); x.fill(); }
  const t = textur(c, true); t.repeat.set(14, 1); return t;
}
function neonSchrift(text, farbe) {
  const [c, x] = leinwand(1024, 200);
  x.font = "900 128px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  for (const [blur, a] of [[40, 0.9], [18, 1], [6, 1]]) { x.shadowColor = farbe; x.shadowBlur = blur; x.globalAlpha = a; x.lineWidth = 10; x.strokeStyle = farbe; x.strokeText(text, 512, 104); }
  x.shadowBlur = 0; x.globalAlpha = 1; x.fillStyle = "#fff6fb"; x.fillText(text, 512, 104);
  return textur(c);
}
function flammenTextur() {
  const [c, x] = leinwand(32, 128), gr = x.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, "#ffffff00"); gr.addColorStop(0.25, "#ff3d0088"); gr.addColorStop(0.7, "#ffb020"); gr.addColorStop(1, "#ffffff");
  x.fillStyle = gr; x.fillRect(0, 0, 32, 128); return textur(c);
}
function zahlTextur(n, farbe) {
  const [c, x] = leinwand(128);
  x.fillStyle = farbe; x.fillRect(0, 0, 128, 128);
  x.font = "900 96px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#fff"; x.strokeStyle = "#0006"; x.lineWidth = 8;
  x.strokeText(String(n), 64, 70); x.fillText(String(n), 64, 70);
  return textur(c);
}

// ---------------------------------------------------------------- Formen
const vereinen = (liste) => mergeGeometries(liste.map((x) => (x.index ? x.toNonIndexed() : x)));
function rundRechteck(l, b, r, rv = r) {   // Draufsicht: x nach vorn (l lang), y quer (b breit); vorn runder (rv)
  const s = new THREE.Shape(), hl = l / 2, hb = b / 2;
  s.moveTo(-hl + r, -hb); s.lineTo(hl - rv, -hb); s.quadraticCurveTo(hl, -hb, hl, -hb + rv); s.lineTo(hl, hb - rv); s.quadraticCurveTo(hl, hb, hl - rv, hb);
  s.lineTo(-hl + r, hb); s.quadraticCurveTo(-hl, hb, -hl, hb - r); s.lineTo(-hl, -hb + r); s.quadraticCurveTo(-hl, -hb, -hl + r, -hb);
  return s;
}
// liegende Form (Hoehe nach oben) aus einer Draufsicht
function hochziehen(form, hoehe, fase, y0) {
  const geo = new THREE.ExtrudeGeometry(form, { depth: hoehe, bevelEnabled: true, bevelThickness: fase, bevelSize: fase, bevelSegments: 3, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, y0 + fase, 0);
  return geo;
}
// Draufsicht als runde Wanne (Superellipse), vorn etwas schmaler - die Grundform echter Kirmes-Autoscooter
function wannenPunkte(l, b, n = 3.4, N = 56, schmal = 0.14) {
  const pkt = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * (l / 2);
    pkt.push(new THREE.Vector2(x, Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * (b / 2) * (1 - schmal * Math.max(0, x / (l / 2)))));
  }
  return pkt;
}
const wannenForm = (l, b, n, schmal) => new THREE.Shape(wannenPunkte(l, b, n, 56, schmal));
const ringWeg = (l, b, y, schmal) => new THREE.CatmullRomCurve3(wannenPunkte(l, b, 3.4, 40, schmal).map((p) => V(p.x, y, p.y)), true);
// stehende Platte (Ansicht von hinten: quer z, Hoehe y), Dicke nach x; bogen = oben rund
function platte(breite, hoehe, dicke, fase, bogen) {
  const s = new THREE.Shape(), hb = breite / 2;
  if (bogen) { s.moveTo(-hb, 0); s.lineTo(-hb, hoehe - hb); s.absarc(0, hoehe - hb, hb, Math.PI, 0, true); s.lineTo(hb, 0); s.lineTo(-hb, 0); }
  else { const r = Math.min(hb, hoehe / 2) * 0.6; s.moveTo(-hb + r, 0); s.lineTo(hb - r, 0); s.quadraticCurveTo(hb, 0, hb, r); s.lineTo(hb, hoehe - r); s.quadraticCurveTo(hb, hoehe, hb - r, hoehe); s.lineTo(-hb + r, hoehe); s.quadraticCurveTo(-hb, hoehe, -hb, hoehe - r); s.lineTo(-hb, r); s.quadraticCurveTo(-hb, 0, -hb + r, 0); }
  const geo = new THREE.ExtrudeGeometry(s, { depth: dicke, bevelEnabled: true, bevelThickness: fase, bevelSize: fase, bevelSegments: 3, curveSegments: 14 });
  geo.translate(0, 0, -dicke / 2); geo.rotateY(Math.PI / 2);   // Dicke liegt jetzt auf x, Mitte bei x = 0
  return geo;
}
// Stab von a nach b (Rohr, Stange)
function stab(a, b, r, seg = 8) {
  const d = new THREE.Vector3().subVectors(b, a), k = new THREE.CylinderGeometry(r, r, d.length(), seg);
  k.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize())); k.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return k;
}
const farbig = (geo, f) => { const c = new THREE.Color(f), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); geo.setAttribute("color", new THREE.BufferAttribute(a, 3)); return geo; };
// Masse des Wagens (Wagen-Raum: x nach vorn, y nach oben, z quer). Die Stromstange steht hinten hinter dem Heckschild.
export const WAGEN = { stange: V(-0.42, 0, 0.13), stangeOben: 2.62, rad: V(0.05, 0.5, 0), radR: 0.075, huefte: V(-0.15, 0.4, 0), schulter: V(0.012, 0.205, 0.09), hals: V(0.004, 0.25, 0) };
// Kirmes-Autoscooter (Schritt 4b, Nico 08.11.2026: "noch klobig" in der Sicht hinter dem Wagen): runde lackierte Wanne mit
// Haube und hohem, oben rundem Heckschild, dicker Gummiwulst rundum, Chrom (Zierleiste, Schildrand, Scheinwerferringe,
// Stromstange mit Feder und Abnehmer), Cockpit mit gepolstertem Sitz, Lenkrad mit drei Speichen, Startnummer hinten und vorn.
function wagenTeile() {
  const lack = vereinen([
    hochziehen(wannenForm(0.56, 0.44, 3.4, 0.12), 0.09, 0.06, 0.1),                                                            // Wanne
    (() => { const k = new THREE.SphereGeometry(0.21, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2); k.scale(1.05, 0.46, 1.04); k.translate(0.15, 0.3, 0); return k; })(), // Haube
    // Heckschild: niedrig genug, dass man hinter dem Wagen Kopf und Schultern des Fahrers sieht
    (() => { const k = platte(0.44, 0.25, 0.05, 0.022, true); k.translate(-0.33, 0.26, 0); return k; })(),
    ...[-1, 1].map((s) => { const k = new THREE.SphereGeometry(0.12, 18, 10); k.scale(1.3, 0.62, 0.7); k.translate(-0.2, 0.3, s * 0.21); return k; }),   // Kotfluegel hinten
  ]);
  const gummi = new THREE.TubeGeometry(ringWeg(0.72, 0.6, 0.15, 0.1), 72, 0.078, 12, true);
  const dunkel = vereinen([
    (() => { const k = new THREE.CylinderGeometry(0.3, 0.33, 0.1, 40); k.scale(1.12, 1, 0.92); k.translate(0, 0.06, 0); return k; })(),          // Unterboden
    (() => { const k = hochziehen(wannenForm(0.36, 0.34, 3, 0), 0.004, 0.006, 0.312); k.translate(-0.05, 0, 0); return k; })(),               // Cockpit-Boden
    (() => { const k = hochziehen(wannenForm(0.15, 0.3, 4, 0), 0.03, 0.025, 0.33); k.translate(-0.17, 0, 0); return k; })(),                  // Sitzkissen
    (() => { const k = platte(0.34, 0.15, 0.04, 0.025, false); k.rotateZ(0.16); k.translate(-0.27, 0.36, 0); return k; })(),                  // Rueckenpolster (Schultern bleiben frei)
    stab(V(0.17, 0.34, 0), V(WAGEN.rad.x, WAGEN.rad.y, 0), 0.016),                                                                              // Lenksaeule
  ]);
  const st = WAGEN.stange;
  const feder = (() => { const p = []; for (let i = 0; i <= 90; i++) { const u = i / 90, a = u * Math.PI * 2 * 7; p.push(V(st.x + Math.cos(a) * 0.028, 0.36 + u * 0.24, st.z + Math.sin(a) * 0.028)); } return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p), 120, 0.006, 5, false); })();
  const chrom = vereinen([
    stab(V(st.x, 0.3, st.z), V(st.x, WAGEN.stangeOben - 0.04, st.z), 0.015),                                                          // Stromstange
    feder,                                                                                                                              // Feder unten
    (() => { const k = new THREE.CylinderGeometry(0.035, 0.045, 0.06, 14); k.translate(st.x, 0.33, st.z); return k; })(),             // Halter
    stab(V(-0.37, 0.31, st.z), V(st.x, 0.32, st.z), 0.02),                                                                             // Arm zum Schild
    (() => { const k = new THREE.BoxGeometry(0.16, 0.018, 0.05); k.translate(st.x + 0.02, WAGEN.stangeOben - 0.02, st.z); return k; })(), // Abnehmer-Schuh am Gitter
    new THREE.TubeGeometry(ringWeg(0.62, 0.5, 0.325, 0.12), 64, 0.012, 6, true),                                                      // Zierleiste oben
    (() => { const s = []; for (let i = 0; i <= 24; i++) { const a = Math.PI - (i / 24) * Math.PI; s.push(V(-0.33, 0.26 + 0.03 + Math.sin(a) * 0.243, Math.cos(a) * 0.243)); } return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(s), 40, 0.013, 6, false); })(), // Schildrand
    ...[-1, 1].map((s) => { const k = new THREE.TorusGeometry(0.04, 0.009, 6, 18); k.rotateY(Math.PI / 2); k.translate(0.315, 0.33, s * 0.12); return k; }),   // Scheinwerferringe
  ]);
  const rad = vereinen([new THREE.TorusGeometry(WAGEN.radR, 0.013, 8, 28), new THREE.CylinderGeometry(0.022, 0.022, 0.02, 12).rotateX(Math.PI / 2),
    ...[0, 1, 2].map((k) => { const b = new THREE.BoxGeometry(0.009, WAGEN.radR, 0.008); b.translate(0, -WAGEN.radR / 2, 0); b.rotateZ(k * (Math.PI * 2 / 3)); return b; })]);
  const vorn = vereinen([-1, 1].map((s) => { const k = new THREE.SphereGeometry(0.036, 14, 10); k.scale(0.7, 1, 1); k.translate(0.315, 0.33, s * 0.12); return k; }));
  const hinten = vereinen([-1, 1].map((s) => { const k = new THREE.CapsuleGeometry(0.018, 0.05, 4, 8); k.rotateX(Math.PI / 2); k.translate(-0.378, 0.34, s * 0.16); return k; }));
  // Startnummer: hinten auf dem Schild (die sieht man hinter dem eigenen Wagen) und oben auf der Haube; Feld je Wagen aus dem Zahlen-Atlas
  const nummer = vereinen([
    (() => { const k = new THREE.PlaneGeometry(0.17, 0.17); k.rotateY(-Math.PI / 2); k.translate(-0.381, 0.395, -0.01); return k; })(),
    (() => { const k = new THREE.PlaneGeometry(0.11, 0.11); k.rotateX(-Math.PI / 2); k.rotateY(-Math.PI / 2); k.rotateZ(-0.24); k.translate(0.2, 0.399, 0); return k; })(),
  ]);
  return { lack, gummi, dunkel, chrom, rad, vorn, hinten, nummer };
}
// Fahrer aus runden Formen (statt der kantigen Figuren): Rumpf, Kopf mit Augen, Nase und Ohren, Haare, Arme am Lenkrad.
// Ursprung je Teil = Gelenk (Huefte, Hals, Schulter), damit Kopf und Rumpf beim Stoss mitwackeln und die Arme zum Lenkrad greifen.
export const ARM_L = 0.235;
function fahrerTeile() {
  const rumpf = new THREE.CapsuleGeometry(0.078, 0.11, 6, 14); rumpf.translate(0, 0.133, 0);
  const haut = 0xffffff, dunkel = 0x1b1410;
  const kopf = vereinen([
    farbig(new THREE.SphereGeometry(0.085, 20, 14), haut),
    farbig((() => { const k = new THREE.SphereGeometry(0.013, 8, 6); k.translate(0.084, -0.006, 0); return k; })(), haut),
    ...[-1, 1].map((s) => farbig((() => { const k = new THREE.SphereGeometry(0.013, 8, 6); k.translate(0.073, 0.02, s * 0.031); return k; })(), dunkel)),
    ...[-1, 1].map((s) => farbig((() => { const k = new THREE.SphereGeometry(0.022, 8, 6); k.scale(0.5, 1, 0.55); k.translate(-0.004, 0, s * 0.084); return k; })(), haut)),
    farbig((() => { const k = new THREE.TorusGeometry(0.026, 0.005, 4, 10, Math.PI); k.rotateZ(Math.PI); k.rotateY(Math.PI / 2); k.translate(0.074, -0.03, 0); return k; })(), 0x8a2a2a),   // Laecheln
  ]);
  kopf.translate(0, 0.095, 0);
  const haare = (() => { const k = new THREE.SphereGeometry(0.092, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.52); k.scale(1.04, 1, 1.02); k.rotateZ(0.4); k.translate(-0.006, 0.098, 0); return k; })();
  const arm = new THREE.CapsuleGeometry(0.027, ARM_L - 0.054, 4, 10); arm.rotateZ(-Math.PI / 2); arm.translate(ARM_L / 2, 0, 0);
  const hand = new THREE.SphereGeometry(0.03, 10, 8); hand.translate(ARM_L, 0, 0);
  return { rumpf, kopf, haare, arm, hand };
}
// Zahlen-Atlas 4 x 4 (Startnummern 1-16): weisse Plakette mit dunkler Zahl
function nummernAtlas() {
  const S = 128, [c, x] = leinwand(S * 4);
  for (let i = 0; i < 16; i++) {
    const cx = (i % 4) * S + S / 2, cy = Math.floor(i / 4) * S + S / 2;
    x.fillStyle = "#f8f6ef"; x.beginPath(); x.arc(cx, cy, S * 0.46, 0, 7); x.fill();
    x.lineWidth = 7; x.strokeStyle = "#1c1c24"; x.beginPath(); x.arc(cx, cy, S * 0.4, 0, 7); x.stroke();
    x.font = `900 ${i + 1 > 9 ? 62 : 74}px sans-serif`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#1c1c24"; x.fillText(String(i + 1), cx, cy + 5);
  }
  const t = textur(c); t.flipY = true; return t;
}
// Spiegelungen in der Halle: kleine Ersatz-Halle (Lichterketten, Neonroehren, bunte Strahler, Leuchtschrift) einmal in eine
// Umgebungs-Karte gerechnet - so spiegeln Lack, Chrom, Boden und Bande die Kirmeslichter statt des Nachthimmels
function hallenUmgebung(renderer, W, H) {
  const s = new THREE.Scene(); s.background = new THREE.Color(0x0d0819);
  const raum = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 30), new THREE.MeshBasicMaterial({ color: 0x150e26, side: THREE.BackSide })); raum.position.y = 5; s.add(raum);
  const boden = new THREE.Mesh(new THREE.PlaneGeometry(40, 30).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b0a12 })); s.add(boden);
  const hell = (f, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(f).multiplyScalar(k) });
  const sx = W + 1.5, sz = H + 1.3;
  [[0xff3fa8, 0, -sz, sx * 2, 0], [0x22d3ee, 0, sz, sx * 2, 0], [0xa855f7, -sx, 0, sz * 2, 1], [0xfacc15, sx, 0, sz * 2, 1]].forEach(([f, x, z, l, quer]) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(quer ? 0.12 : l, 0.12, quer ? l : 0.12), hell(f, 5)); r.position.set(x, 2.66, z); s.add(r);
  });
  const birne = new THREE.SphereGeometry(0.09, 6, 4), birneMat = hell(0xffe2a8, 7);
  for (const [hx, hz, y, schritt] of [[W + 0.17, H + 0.17, 0.42, 0.5], [sx, sz, 2.62, 0.42]]) {
    for (let x = -hx; x <= hx; x += schritt) [-hz, hz].forEach((z) => { const b = new THREE.Mesh(birne, birneMat); b.position.set(x, y, z); s.add(b); });
    for (let z = -hz; z <= hz; z += schritt) [-hx, hx].forEach((x) => { const b = new THREE.Mesh(birne, birneMat); b.position.set(x, y, z); s.add(b); });
  }
  [[0xff3fa8, -W + 0.5, -H + 0.4], [0x22d3ee, W - 0.5, -H + 0.4], [0xfacc15, -W + 0.5, H - 0.4], [0xa855f7, W - 0.5, H - 0.4]].forEach(([f, x, z]) => {
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16).rotateX(Math.PI / 2), hell(f, 3)); p.position.set(x * 1.2, 3.4, z * 1.2); s.add(p);
  });
  const schild = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.2), hell(0xff3fa8, 2.5)); schild.position.set(0, 3.65, -sz - 0.1); s.add(schild);
  const pm = new THREE.PMREMGenerator(renderer), env = pm.fromScene(s, 0.02, 0.1, 60).texture; pm.dispose();
  s.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return env;
}

// ---------------------------------------------------------------- Aufbau
function aufbauen(o, n) {
  const t0 = performance.now();
  const st = startStufe(!!o.beamer), Q = STUFE[st.stufe];
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "default" });
  renderer.setPixelRatio(Math.min(Q.pr, window.devicePixelRatio || 1));
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0716, 16, 46);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 140), mess = camera.clone();
  const W = AS.AS_B * K / 2, H = AS.AS_H * K / 2;   // halbe Breite/Tiefe der Fahrflaeche (5 x 3)

  // ---- Licht: kuehles Grundlicht, ein Hauptlicht mit Schatten, bunte Strahler an den Ecken
  scene.add(new THREE.HemisphereLight(0x8a7cff, 0x1a1020, 0.55));
  const sonne = new THREE.DirectionalLight(0xfff0e0, 1.6);
  sonne.position.set(2.5, 12, 6); sonne.target.position.set(0, 0, 0);
  sonne.castShadow = Q.schatten > 0; sonne.shadow.mapSize.set(Q.schatten || 1024, Q.schatten || 1024);
  const sc = sonne.shadow.camera; sc.left = -W - 1; sc.right = W + 1; sc.top = H + 1.5; sc.bottom = -H - 1.5; sc.near = 2; sc.far = 30; sc.updateProjectionMatrix();
  sonne.shadow.bias = -0.0006; sonne.shadow.normalBias = 0.02;
  scene.add(sonne, sonne.target);
  const STRAHLER = [[0xff3fa8, -W + 0.5, -H + 0.4], [0x22d3ee, W - 0.5, -H + 0.4], [0xfacc15, -W + 0.5, H - 0.4], [0xa855f7, W - 0.5, H - 0.4]];
  const strahler = STRAHLER.map(([f, x, z]) => { const l = new THREE.PointLight(f, 9, 9, 1.6); l.position.set(x, 2.2, z); scene.add(l); return l; });
  const blitz = new THREE.PointLight(0xfff2c0, 0, 6, 1.8); blitz.position.set(0, 0.8, 0); scene.add(blitz);

  // ---- Boden: Stahl mit Glanz; aussen Holzsteg, dahinter der dunkle Kirmesplatz
  // Boden poliert (Schritt 4b): Klarlack fast spiegelglatt - auf Augenhoehe spiegeln sich Lichterketten und Neon darin
  const boden = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, H * 2), new THREE.MeshPhysicalMaterial({ map: bodenTextur(), metalness: 0.6, roughness: 0.26, clearcoat: Q.leuchten ? 1 : 0.7, clearcoatRoughness: 0.04 }));
  boden.rotation.x = -Math.PI / 2; boden.receiveShadow = true; scene.add(boden);
  const steg = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 3.4, H * 2 + 3.2), SC.holzMaterial(0x5a3a22));
  steg.rotation.x = -Math.PI / 2; steg.position.y = -0.03; steg.receiveShadow = true; scene.add(steg);
  const platz = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: 0x14121c, roughness: 0.95 }));
  platz.rotation.x = -Math.PI / 2; platz.position.y = -0.06; scene.add(platz);

  // ---- Bande: Blechwand mit Warnstreifen oben, davor der dicke Gummiring
  const RB = 0.4, aussen = 0.34;
  const wandForm = rundRechteck(W * 2 + aussen * 2, H * 2 + aussen * 2, RB + aussen);
  wandForm.holes.push(rundRechteck(W * 2, H * 2, RB));
  const wand = new THREE.Mesh(hochziehen(wandForm, 0.36, 0.02, 0), [new THREE.MeshStandardMaterial({ map: warnTextur(), roughness: 0.5, metalness: 0.2 }), new THREE.MeshStandardMaterial({ color: 0x2b2f3d, metalness: 0.75, roughness: 0.35 })]);
  wand.castShadow = true; wand.receiveShadow = true; scene.add(wand);
  const bandWeg = new THREE.CurvePath(), ecke = (cx, cz, a0) => new THREE.EllipseCurve(cx, cz, RB + 0.1, RB + 0.1, a0, a0 + Math.PI / 2);
  const ix = W - RB, iz = H - RB, d = RB + 0.1;
  [[V(-ix, 0, -iz - d), V(ix, 0, -iz - d)], null, [V(ix + d, 0, -iz), V(ix + d, 0, iz)], null, [V(ix, 0, iz + d), V(-ix, 0, iz + d)], null, [V(-ix - d, 0, iz), V(-ix - d, 0, -iz)], null].forEach((x, k) => {
    if (x) { bandWeg.add(new THREE.LineCurve3(x[0], x[1])); return; }
    const [cx, cz, a0] = [[ix, -iz, -Math.PI / 2], [ix, iz, 0], [-ix, iz, Math.PI / 2], [-ix, -iz, Math.PI]][(k - 1) / 2];
    const e = ecke(cx, cz, a0), pts = e.getPoints(8).map((p) => V(p.x, 0, p.y));
    for (let i = 0; i < pts.length - 1; i++) bandWeg.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
  });
  const gummiBande = new THREE.Mesh(new THREE.TubeGeometry(bandWeg, 240, 0.11, 10, true), new THREE.MeshPhysicalMaterial({ color: 0x14141a, roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.4 }));
  gummiBande.position.y = 0.2; gummiBande.castShadow = true; scene.add(gummiBande);
  // Chrom-Handlauf oben auf der Bande (glaenzt auf Augenhoehe)
  const handlauf = new THREE.Mesh(new THREE.TubeGeometry(bandWeg, 240, 0.028, 8, true), new THREE.MeshStandardMaterial({ color: 0xe8edf6, metalness: 1, roughness: 0.14 }));
  handlauf.position.y = 0.395; scene.add(handlauf);
  // Lichtpfuetzen: die bunten Strahler spiegeln sich als weiche Flecken im polierten Boden
  const pfuetzen = [[0xff3fa8, -W + 0.9, -H + 0.7], [0x22d3ee, W - 0.9, -H + 0.7], [0xfacc15, -W + 0.9, H - 0.7], [0xa855f7, W - 0.9, H - 0.7]].map(([f, x, z]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: weich(), color: new THREE.Color(f).multiplyScalar(0.35), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(x, 0.006, z); scene.add(m); return m;
  });

  // ---- Lauflichter oben auf der Bande und unter dem Dach (Gluehbirnen, laufen im Kreis)
  const birnenOrte = [];
  const umfang = (hx, hz, y, schritt) => { for (let x = -hx; x <= hx + 1e-6; x += schritt) { birnenOrte.push(V(x, y, -hz), V(x, y, hz)); } for (let z = -hz + schritt; z < hz - 1e-6; z += schritt) { birnenOrte.push(V(-hx, y, z), V(hx, y, z)); } };
  umfang(W + aussen * 0.5, H + aussen * 0.5, 0.42, 0.5);
  const dachBirnenAb = birnenOrte.length;
  umfang(W + 1.5, H + 1.3, 2.62, 0.42);
  const birnenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 1.6) });
  const birnen = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), birnenMat, birnenOrte.length);
  birnenOrte.forEach((p, i) => birnen.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  birnen.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(birnen);

  // ---- Dach: vier Saeulen, Traeger mit Neonroehren, Stromgitter, Leuchtschrift hinten
  const saeuleMat = new THREE.MeshStandardMaterial({ color: 0xc81e4a, metalness: 0.6, roughness: 0.35 });
  const chromMat = new THREE.MeshStandardMaterial({ color: 0xdfe6f2, metalness: 1, roughness: 0.18 });
  const sx = W + 1.5, sz = H + 1.3;
  [[-sx, -sz], [sx, -sz], [-sx, sz], [sx, sz], [0, -sz]].forEach(([x, z]) => {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.75, 16), saeuleMat); s.position.set(x, 1.37, z); s.castShadow = true; scene.add(s);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.08, 16), chromMat); f.position.set(x, 0.0, z); scene.add(f);
  });
  const traeger = new THREE.MeshStandardMaterial({ color: 0x23283a, metalness: 0.7, roughness: 0.4 });
  [[0, -sz, sx * 2, 0], [0, sz, sx * 2, 0], [-sx, 0, sz * 2, 1], [sx, 0, sz * 2, 1]].forEach(([x, z, l, quer]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(quer ? 0.16 : l, 0.2, quer ? l : 0.16), traeger); b.position.set(x, 2.78, z); scene.add(b);
  });
  const neon = [[0xff3fa8, 0, -sz + 0.12, sx * 2 - 0.3, 0], [0x22d3ee, 0, sz - 0.12, sx * 2 - 0.3, 0], [0xa855f7, -sx + 0.12, 0, sz * 2 - 0.3, 1], [0xfacc15, sx - 0.12, 0, sz * 2 - 0.3, 1]];
  neon.forEach(([f, x, z, l, quer]) => {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, l, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(f).multiplyScalar(3) }));
    r.rotation.z = quer ? 0 : Math.PI / 2; if (quer) r.rotation.x = Math.PI / 2; r.position.set(x, 2.66, z); scene.add(r);
  });
  const gitterPkt = [];
  // Stromgitter: nur ein Hauch (es liegt zwischen Kamera und Fahrbahn und darf die Wagen nicht verdecken)
  for (let x = -W; x <= W + 1e-6; x += 1) gitterPkt.push(x, 2.62, -H, x, 2.62, H);
  for (let z = -H; z <= H + 1e-6; z += 1) gitterPkt.push(-W, 2.62, z, W, 2.62, z);
  const gitterGeo = new THREE.BufferGeometry(); gitterGeo.setAttribute("position", new THREE.Float32BufferAttribute(gitterPkt, 3));
  const gitter = new THREE.LineSegments(gitterGeo, new THREE.LineBasicMaterial({ color: 0x6f7fb8, transparent: true, opacity: 0.07, depthWrite: false }));
  scene.add(gitter);
  const schild = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.4), new THREE.MeshBasicMaterial({ map: neonSchrift("★ AUTOSCOOTER ★", "#ff3fa8"), color: new THREE.Color(2.2, 2.2, 2.2), transparent: true, depthWrite: false }));
  schild.position.set(0, 3.65, -sz - 0.05); scene.add(schild);
  const schildTafel = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.5, 0.08), traeger); schildTafel.position.set(0, 3.65, -sz - 0.12); scene.add(schildTafel);

  // ---- Wagen: je Teil eine Sammel-Zeichnung fuer alle Wagen
  const T = wagenTeile();
  const lackMat = Q.leuchten || st.stufe === "mittel" ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06 })
    : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 });
  const sammel = (geo, mat, schatten = true, anzahl = n) => { const im = new THREE.InstancedMesh(geo, mat, anzahl); im.castShadow = schatten; im.receiveShadow = true; im.frustumCulled = false; scene.add(im); return im; };
  const vollSchatten = Q.schatten >= 2048;   // Handy-Stufen: nur Wanne und Gummiring werfen Schatten (spart einen Durchgang je Teil)
  // Startnummer: ein Zahlen-Atlas fuer alle Wagen; welches Feld, steht je Wagen im Merkmal nrOff (kleine Ergaenzung im Shader)
  T.nummer.setAttribute("nrOff", new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: n }, (_, j) => [(j % 4) / 4, 1 - (Math.floor((j % 16) / 4) + 1) / 4]).flat()), 2));
  const nrMat = new THREE.MeshStandardMaterial({ map: nummernAtlas(), transparent: true, alphaTest: 0.3, roughness: 0.3, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  nrMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("void main() {", "attribute vec2 nrOff;\nvoid main() {").replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = vMapUv * 0.25 + nrOff;\n#endif");
  };
  nrMat.customProgramCacheKey = () => "as3-nummer";
  const F = fahrerTeile();
  const hautMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
  const W3 = {
    lack: sammel(T.lack, lackMat),
    gummi: sammel(T.gummi, new THREE.MeshPhysicalMaterial({ color: 0x15151c, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35 })),
    dunkel: sammel(T.dunkel, new THREE.MeshStandardMaterial({ color: 0x2a1a24, roughness: 0.5 }), vollSchatten), chrom: sammel(T.chrom, chromMat, vollSchatten),
    rad: sammel(T.rad, new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.35 }), false),
    vorn: sammel(T.vorn, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.6) }), false),
    hinten: sammel(T.hinten, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.25, 0.2) }), false),
    nummer: sammel(T.nummer, nrMat, false),
    glow: sammel(new THREE.PlaneGeometry(1.5, 1.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: weich(), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), false),
    rumpf: sammel(F.rumpf, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), vollSchatten),
    kopf: sammel(F.kopf, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, vertexColors: true }), vollSchatten),
    haare: sammel(F.haare, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), false),
    arme: sammel(F.arm, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), false, n * 2),
    haende: sammel(F.hand, hautMat, false, n * 2),
  };
  W3.glow.renderOrder = 1;
  const hell = (f, a) => new THREE.Color(f).lerp(new THREE.Color(0xffffff), a);
  for (let j = 0; j < n; j++) {
    const f = o.farben[j % o.farben.length], hemd = hell(f, 0.62).multiplyScalar(0.92), haut = new THREE.Color(HAUT[j % HAUT.length]);
    W3.lack.setColorAt(j, new THREE.Color(f)); W3.glow.setColorAt(j, hell(f, 0.1));
    W3.rumpf.setColorAt(j, hemd); W3.kopf.setColorAt(j, haut); W3.haare.setColorAt(j, new THREE.Color(HAARE[(j * 5) % HAARE.length]));
    [0, 1].forEach((s) => { W3.arme.setColorAt(j * 2 + s, hemd); W3.haende.setColorAt(j * 2 + s, haut); });
  }
  // Funken an der Stromstange (ein Punkt je Wagen)
  const fsGeo = new THREE.BufferGeometry();
  fsGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3)); fsGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const stangenFunken = new THREE.Points(fsGeo, new THREE.PointsMaterial({ size: 0.32, map: weich(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  stangenFunken.frustumCulled = false; scene.add(stangenFunken);
  // Turbo: zwei Flammen je Wagen (eigene Objekte, nur sichtbar beim Turbo) und eine Leuchtspur
  const flammeGeo = new THREE.ConeGeometry(0.06, 0.36, 10, 1, true); flammeGeo.rotateZ(Math.PI / 2); flammeGeo.translate(-0.18, 0, 0);
  const flammeMat = new THREE.MeshBasicMaterial({ map: flammenTextur(), color: new THREE.Color(1.5, 0.62, 0.16), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const SPUR = 26;
  const autos = Array.from({ length: n }, (_, j) => {
    const flammen = new THREE.Group();
    [-0.12, 0.12].forEach((z) => { const m = new THREE.Mesh(flammeGeo, flammeMat); m.position.set(-0.4, 0.22, z); flammen.add(m); });
    flammen.visible = false; scene.add(flammen);
    const spurGeo = new THREE.BufferGeometry();
    spurGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPUR * 2 * 3), 3)); spurGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(SPUR * 2 * 3), 3));
    const idx = []; for (let i = 0; i < SPUR - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } spurGeo.setIndex(idx);
    const spur = new THREE.Mesh(spurGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    spur.frustumCulled = false; spur.visible = false; scene.add(spur);
    return { j, farbe: new THREE.Color(o.farben[j % o.farben.length]), puffer: [], x: 0, y: 0, w: 0, zx: 0, zy: 0, zw: 0, fehler: null, roll: 0, nick: 0, v: 0, gier: 0,
      ruck: V(), ruckV: V(), wipp: 0, wippT: 0, flammen, spur, spurPkt: [], spurAlt: 0, turbo: false, lenk: 0, rad: 0, jubel: 0, jubelK: 0, matrix: new THREE.Matrix4(), podest: null,
      kopf: { x: 0, z: 0, vx: 0, vz: 0 } };   // Kopf-Wackeln (Feder): x = zur Seite, z = vor/zurueck
  });
  // eigenes Auto (Handy): Pfeil darueber und Ring darunter
  const pfeil = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.025, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
  pfeil.visible = ring.visible = false; scene.add(pfeil, ring);

  // ---- Effekte: Funken (Vorrat), Stossringe, Konfetti, Siegertreppchen mit Scheinwerfern
  const FUNKEN = 260;
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FUNKEN * 3).fill(-99), 3)); fGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(FUNKEN * 3), 3));
  const funken = new THREE.Points(fGeo, new THREE.PointsMaterial({ size: 0.12, map: weich(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  funken.frustumCulled = false; scene.add(funken);
  const ringe = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); m.visible = false; scene.add(m); return { m, t: 9 }; });
  const KONF = 220;
  const konfetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.11), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.6, emissive: 0x333333 }), KONF);
  konfetti.visible = false; konfetti.frustumCulled = false; scene.add(konfetti);
  const konfDaten = Array.from({ length: KONF }, (_, i) => ({ p: V(), v: V(), r: V(zufallFest(i) * 6, zufallFest(i + 9) * 6, 0), dr: V(2 + zufallFest(i + 3) * 5, 1 + zufallFest(i + 5) * 4, 0) }));
  const podest = new THREE.Group();
  const STUFEN_P = [[0, 0.42, "#e8b923", 1], [-1.05, 0.28, "#b9c2cf", 2], [1.05, 0.18, "#c8793a", 3]];
  STUFEN_P.forEach(([x, h, f, nr]) => {
    // lackiert statt Vollmetall (Metall spiegelt nur den Nachthimmel und wird schwarz), leicht von innen beleuchtet
    const lack = new THREE.MeshPhysicalMaterial({ color: f, metalness: 0.3, roughness: 0.3, clearcoat: 1, emissive: f, emissiveIntensity: 0.1 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, h, 0.95), [lack, lack, lack, lack, new THREE.MeshStandardMaterial({ map: zahlTextur(nr, f), roughness: 0.4, emissive: 0xffffff, emissiveMap: zahlTextur(nr, f), emissiveIntensity: 0.35 }), lack]);
    m.position.set(x, h / 2, 0.2); m.castShadow = true; m.receiveShadow = true; podest.add(m);
  });
  // Buehnenlicht aufs Treppchen (nur bei der Siegerehrung an)
  const buehne = new THREE.SpotLight(0xfff1d0, 0, 9, 0.55, 0.5, 1.2); buehne.position.set(0, 2.6, 2.6); buehne.target.position.set(0, 0.3, 0.2);
  scene.add(buehne, buehne.target); podest.userData.licht = buehne;
  podest.visible = false; scene.add(podest);
  // Scheinwerfer aufs Treppchen: schmaler Lichtkegel vom Dach, nach unten weicher (Verlauf in der Textur)
  const kegelT = (() => { const [c, x] = leinwand(8, 128), gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "#fff0"); gr.addColorStop(0.15, "#fff6"); gr.addColorStop(1, "#fff"); x.fillStyle = gr; x.fillRect(0, 0, 8, 128); return textur(c); })();
  const kegelMat = new THREE.MeshBasicMaterial({ map: kegelT, color: 0xfff3c4, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const kegel = [-1, 1].map((x) => { const k = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.5, 32, 1, true), kegelMat); k.position.set(x * 0.5, 1.35, 0.2); k.rotation.z = x > 0 ? 0.25 : -0.25; k.visible = false; scene.add(k); return k; });

  g = { renderer, scene, camera, mess, sonne, strahler, blitz, birnen, birnenOrte, dachBirnenAb, W3, autos, n, W, H, pfeil, ring, stangenFunken, funken, funkDaten: [], ringe, konfetti, konfDaten,
    podest, kegel, pfuetzen, beamer: !!o.beamer, o, stufe: st.stufe, stufeFest: st.fest, mess_dt: [], bilder: 0, uhr: new THREE.Clock(), offsets: [], offMin: null, phase: null, runde: 0, start: 0, bis: 0,
    punkte: [], stoesse: 0, gesehen: new Set(), offen: [], eingabe: { l: 0, turboT: 0 }, kam: { a: Math.PI / 2, e: 0.9, d: 14, l: V() }, kamSprung: true, wackel: 0, stossZiel: null,
    intro: null, sieg: null, countZuletzt: null, letztT: -1, folgen: lsLesen("pa_as_kamera") !== "oben", vMix: 0, kick: null, zaehler: { knall: 0, turbo: 0, plus: 0, sieg: 0, countdown: 0, snaps: 0, vorausgerechnet: 0 }, mess_: null, ui: null, laeuft: false, container: null, groesse: null };
  SC.himmelSetzen(g, "nacht");
  // Spiegelungen aus der Halle statt aus dem Himmel (Lack, Chrom, Boden und Bande zeigen die Kirmeslichter)
  try { g.scene.environment = hallenUmgebung(renderer, W, H); g.scene.environmentIntensity = 0.55; }
  catch (e) { g.scene.environmentIntensity = 0.45; console.warn("Hallen-Spiegelung aus", e); }
  // Fahrer: eigene runde Figuren (fahrerTeile), immer da - keine Dateien noetig
  g.modelleDa = true;
  const dieseSzene = g;
  MD.nachbearbeitungModule().then((N) => {
    if (!N || g !== dieseSzene) return;
    const ziel = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    const c = new N.EffectComposer(renderer, ziel);
    c.addPass(new N.RenderPass(scene, camera));
    c.addPass(new N.UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.45, 0.82));
    c.addPass(new N.OutputPass());
    g.composer = c; groesseAnwenden();
  }).catch((e) => console.warn("Nachbearbeitung aus", e));
  qualitaetAnwenden();
  g.aufbauMs = Math.round(performance.now() - t0);
}

function qualitaetAnwenden() {
  const Q = STUFE[g.stufe];
  g.renderer.setPixelRatio(Math.min(Q.pr, window.devicePixelRatio || 1));
  groesseAnwenden();
  g.sonne.castShadow = Q.schatten > 0;
  g.strahler.forEach((l, i) => { l.visible = Q.lichter >= 3 || (Q.lichter >= 2 && i % 3 === 0); });
  g.blitz.visible = Q.lichter > 0;
}
function groesseAnwenden() {
  if (!g.groesse) return;
  g.renderer.setSize(g.groesse[0], g.groesse[1], false);
  if (g.composer) { g.composer.setPixelRatio(g.renderer.getPixelRatio()); g.composer.setSize(g.groesse[0], g.groesse[1]); }
}
function bildrateMessen(dt) {
  g.fpsZeit = (g.fpsZeit || 0) + dt; g.fpsBilder = (g.fpsBilder || 0) + 1;
  if (g.fpsZeit >= 1) {
    g.fps = Math.round(g.fpsBilder / g.fpsZeit); g.fpsZeit = 0; g.fpsBilder = 0;
    if (/[?&]fps\b/.test(location.search) && g.container) {
      let el = g.container.querySelector(".brett3d-fps");
      if (!el) { el = document.createElement("span"); el.className = "brett3d-fps"; el.style.cssText = "position:absolute;left:6px;bottom:6px;z-index:5;padding:2px 6px;background:#000a;color:#fff;font:12px monospace;border-radius:4px;pointer-events:none"; g.container.appendChild(el); }
      el.textContent = `${g.fps} Bilder/s · ${g.stufe}`;
    }
  }
  if (g.stufeFest || g.stufe === "niedrig" || document.hidden || g.bilder < 30) return;
  g.mess_dt.push(dt);
  if (g.mess_dt.length < 90) return;
  const schnitt = g.mess_dt.reduce((a, b) => a + b, 0) / g.mess_dt.length;
  g.mess_dt = [];
  if (schnitt > 1 / STUFE[g.stufe].ziel) { g.stufe = STUFEN[STUFEN.indexOf(g.stufe) - 1]; qualitaetAnwenden(); }
}

// ---------------------------------------------------------------- Staende annehmen
const welt = (x, y, out) => out.set((x - AS.AS_B / 2) * K, 0, (y - AS.AS_H / 2) * K);
function einspeisen(d) {
  if (!d || !Array.isArray(d.wagen)) return;
  const neueRunde = (d.runde || 1) !== g.runde || (d.phase === "bereit" && g.phase && g.phase !== "bereit");
  if (neueRunde) {
    g.runde = d.runde || 1; g.gesehen.clear(); g.offen = []; g.sieg = null; g.intro = null; g.countZuletzt = null; g.offsets = []; g.offMin = null;
    g.autos.forEach((a) => { a.puffer = []; a.fehler = null; a.podest = null; a.spurPkt = []; });
    g.podest.visible = false; g.podest.userData.licht.intensity = 0; g.kegel.forEach((k) => { k.visible = false; }); g.konfetti.visible = false; g.kamSprung = true;
  }
  if (d.phase === g.phase && d.t && d.t === g.letztT) return;   // derselbe Stand noch einmal (Neuzeichnen)
  const jetzt = performance.now();
  if (d.phase === "fahrt" && d.t) {
    g.offsets.push([jetzt, jetzt - d.t]);
    while (g.offsets.length > 2 && jetzt - g.offsets[0][0] > 4000) g.offsets.shift();
    g.offMin = Math.min(...g.offsets.map((x) => x[1]));
    if (g.phase !== "fahrt") g.intro = { t: g.uhr.elapsedTime };
  }
  g.letztT = d.t; g.zaehler.snaps++;
  const vorher = g.phase;
  g.phase = d.phase; g.start = d.start || 0; g.bis = d.bis || 0; g.stoesse = d.stoesse || 0;
  const altePunkte = g.punkte;
  g.punkte = (d.punkte || []).slice();
  d.wagen.forEach((w, j) => {
    const a = g.autos[j];
    if (!a) return;
    const s = { t: d.t || 0, x: w[0], y: w[1], w: w[2], turbo: !!w[3], l: w[4] || 0, pause: (w[5] || 0) * 100 };
    if (d.phase !== "fahrt") a.puffer = [s];
    else { a.puffer.push(s); if (a.puffer.length > 14) a.puffer.shift(); }
  });
  (d.knalle || []).forEach((k) => { if (!g.gesehen.has(k.nr)) { g.gesehen.add(k.nr); g.offen.push({ ...k }); } });
  if (d.phase === "ende" && vorher !== "ende") siegStart(altePunkte);
}

// ---------------------------------------------------------------- Wagen je Bild
const _a = { x: 0, y: 0, w: 0, l: 0 }, _p = V(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, "YXZ"), _s = V(1, 1, 1), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _v = V();
// Lenkrad: Ring steht quer zum Fahrer (Achse nach vorn), oben zum Fahrer gekippt; gedreht wird um die eigene Achse
const ACHSE_Z = V(0, 0, 1), _qr = new THREE.Quaternion(), _qs = new THREE.Quaternion();
const RAD_LAGE = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI / 2 + 0.75).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2));
function zwischen(a, T) {
  const b = a.puffer;
  if (!b.length) return null;
  if (g.phase !== "fahrt" || b.length === 1 || T <= b[0].t) return { ...b[b.length === 1 || T > b[0].t ? b.length - 1 : 0], voraus: false };
  for (let i = b.length - 2; i >= 0; i--) {
    if (b[i].t <= T && T < b[i + 1].t) {
      const p = b[i], q = b[i + 1], u = (T - p.t) / Math.max(1, q.t - p.t);
      if (Math.hypot(q.x - p.x, q.y - p.y) > 20) return { ...q, voraus: false };   // Sprung (Einsteiger, neue Aufstellung)
      return { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u, w: p.w + wDiff(q.w, p.w) * u, turbo: u < 0.5 ? p.turbo : q.turbo, l: q.l, t: T, voraus: false };
    }
  }
  // kein neuerer Stand: kurz weiterrechnen (wie der Gastgeber), dann stehen bleiben
  const z = b[b.length - 1], dt = Math.min(VORAUS_MAX, Math.max(0, (T - Math.max(z.t, g.start)) / 1000));
  Object.assign(_a, { x: z.x, y: z.y, w: z.w, l: z.l });
  if (dt > 0) AS.asFahren(_a, dt, z.turbo);
  return { x: _a.x, y: _a.y, w: _a.w, turbo: z.turbo, l: z.l, t: T, voraus: dt > 0 };
}
// eigenes Auto: ab dem letzten Stand mit der eigenen Lenk-Stellung bis "jetzt" vorausrechnen
function eigenesVoraus(a, hostJetzt) {
  const z = a.puffer[a.puffer.length - 1];
  if (!z) return null;
  const turboT = g.eingabe.turboT && performance.now() - g.eingabe.turboT < AS.AS_TURBO_DAUER && z.pause <= 0;
  Object.assign(_a, { x: z.x, y: z.y, w: z.w, l: g.eingabe.l });
  let rest = Math.min(0.4, Math.max(0, (hostJetzt - Math.max(z.t, g.start)) / 1000));
  while (rest > 1e-4) { const st = Math.min(1 / 60, rest); AS.asFahren(_a, st, z.turbo || turboT); rest -= st; }
  return { x: _a.x, y: _a.y, w: _a.w, turbo: z.turbo || !!turboT, l: g.eingabe.l, voraus: true };
}
function autosSetzen(dt, t, T, hostJetzt) {
  const ich = g.beamer ? -1 : g.o.ich;
  const zeigen = [];
  g.autos.forEach((a) => {
    let z = a.j === ich && g.phase === "fahrt" ? eigenesVoraus(a, hostJetzt) : zwischen(a, T);
    if (!z) z = { x: a.zx || 50, y: a.zy || 30, w: a.zw || 0, turbo: false, l: 0 };
    if (a.j === ich && g.phase === "fahrt") {
      // Abweichung zum zuletzt Gezeigten klingt sanft aus (statt zu springen); grosse Spruenge gelten sofort
      if (a.fehler && a.letztSnap !== g.zaehler.snaps) {
        const fx = a.zx - z.x, fy = a.zy - z.y, fw = wDiff(a.zw, z.w);
        a.fehler = Math.hypot(fx, fy) > 12 ? { x: 0, y: 0, w: 0 } : { x: fx, y: fy, w: fw };
      }
      if (!a.fehler) a.fehler = { x: 0, y: 0, w: 0 };
      a.letztSnap = g.zaehler.snaps;
      const k = Math.exp(-dt / 0.14);
      a.fehler.x *= k; a.fehler.y *= k; a.fehler.w *= k;
      z = { ...z, x: z.x + a.fehler.x, y: z.y + a.fehler.y, w: z.w + a.fehler.w };
    }
    zeigen.push(z);
  });
  // nur fuers Auge: Wagen, die sich im Bild ueberlappen (Vorausrechnung, Puffer), etwas auseinander schieben
  const R2 = AS.AS_R * 2 * 0.98;
  for (let i = 0; i < zeigen.length; i++) for (let j = i + 1; j < zeigen.length; j++) {
    const p = zeigen[i], q = zeigen[j], dx = q.x - p.x, dy = q.y - p.y, dd = Math.hypot(dx, dy);
    if (dd >= R2 || dd < 1e-3) continue;
    const u = (R2 - dd) / 2 / dd, iP = i === ich ? 0.25 : 1, iQ = j === ich ? 0.25 : 1;
    p.x -= dx * u * iP; p.y -= dy * u * iP; q.x += dx * u * iQ; q.y += dy * u * iQ;
  }
  const Q = STUFE[g.stufe], dunkel = g.phase === "ende";
  g.autos.forEach((a, j) => {
    const z = zeigen[j];
    if (a.podest) Object.assign(z, podestPose(a, t));
    const altX = a.zx, altY = a.zy, altW = a.zw, erstes = a.v === 0 && !a.bewegt;
    a.zx = z.x; a.zy = z.y; a.zw = z.w; a.bewegt = true;
    // Fahrdynamik fuers Auge: Tempo, Kurvenlage, Nicken beim Anfahren, Ruck nach dem Stoss, Brummen
    const v = erstes || dt <= 0 ? 0 : Math.hypot(z.x - altX, z.y - altY) / dt;
    const gier = erstes || dt <= 0 ? 0 : wDiff(z.w, altW) / dt;
    const fk = 1 - Math.exp(-dt * 8);
    const altV = a.v;
    a.v += (Math.min(60, v) - a.v) * fk; a.gier += (Math.max(-6, Math.min(6, gier)) - a.gier) * fk;
    a.roll += (Math.max(-0.14, Math.min(0.14, -a.gier * a.v * 0.0035)) - a.roll) * fk;
    a.nick += (Math.max(-0.07, Math.min(0.07, ((a.v - altV) / Math.max(dt, 1e-3)) * -0.0009)) - a.nick) * fk;
    a.ruckV.addScaledVector(a.ruck, -140 * dt); a.ruckV.multiplyScalar(Math.exp(-dt * 9)); a.ruck.addScaledVector(a.ruckV, dt);
    a.wipp *= Math.exp(-dt * 3.2);
    const wippW = Math.sin((t - a.wippT) * 26) * a.wipp;
    a.lenk += ((z.l || 0) - a.lenk) * (1 - Math.exp(-dt * 14));
    welt(z.x, z.y, _p).add(a.ruck);
    _p.y = (g.phase === "fahrt" ? Math.sin(t * 38 + j * 1.7) * 0.004 * Math.min(1, a.v / 16) : 0) + (z.hoch || 0);
    _e.set(a.roll + wippW * 0.6, -z.w + (z.dreh || 0), a.nick + wippW * 0.35, "YXZ");
    _q.setFromEuler(_e);
    // hinter dem Wagen: ein fremder Wagen direkt an der Kamera wird ausgeblendet (sonst fuellt sein Fahrer das ganze Bild)
    const anKamera = (g.vMix || 0) > 0.5 && j !== ich && Math.hypot(_p.x - g.camera.position.x, _p.z - g.camera.position.z) < 0.8;
    a.matrix.compose(_p, _q, _s.setScalar(anKamera ? 1e-4 : 1));
    a.anKamera = anKamera;
    ["lack", "gummi", "dunkel", "chrom", "vorn", "hinten", "nummer"].forEach((k) => g.W3[k].setMatrixAt(j, a.matrix));
    // Lenkrad: vor dem Sitz, schraeg, dreht mit der Lenk-Stellung
    _qr.copy(RAD_LAGE).multiply(_qs.setFromAxisAngle(ACHSE_Z, a.lenk * 1.4));
    _m2.compose(WAGEN.rad, _qr, _s.set(1, 1, 1));
    g.W3.rad.setMatrixAt(j, _m.multiplyMatrices(a.matrix, _m2));
    fahrerSetzen(a, j, dt, t, sieger(a));
    // Unterboden-Leuchten: am eigenen Wagen heller und groesser
    const gs = (j === ich ? 1.35 : 1) * (dunkel && !a.podest ? 0.6 : 1);
    _m2.compose(_v.set(0, 0.012, 0), _q.identity(), _s.set(gs, 1, gs));
    g.W3.glow.setMatrixAt(j, _m.multiplyMatrices(a.matrix, _m2));
    // Stangen-Funke oben am Gitter: flackert, beim Turbo und nach dem Stoss stark
    _v.set(WAGEN.stange.x, WAGEN.stangeOben, WAGEN.stange.z).applyMatrix4(a.matrix);
    g.stangenFunken.geometry.attributes.position.setXYZ(j, _v.x, _v.y, _v.z);
    const fl = g.phase === "fahrt" ? (Math.random() < 0.18 + a.v / 120 ? 0.4 + Math.random() * 0.8 : 0.05) + (z.turbo ? 0.6 : 0) + a.wipp * 2 : 0.04;
    g.stangenFunken.geometry.attributes.color.setXYZ(j, 0.55 * fl, 0.75 * fl, 1.0 * fl);
    // Turbo: Flammen und Spur
    const turbo = !!z.turbo && g.phase === "fahrt";
    if (turbo && !a.turbo) { g.zaehler.turbo++; if (g.beamer || j === ich) turboTon(t); }
    a.turbo = turbo;
    a.flammen.visible = turbo && Q.partikel > 0.2 && !a.anKamera;
    if (a.flammen.visible) {
      a.flammen.position.copy(_v.setFromMatrixPosition(a.matrix)); a.flammen.quaternion.copy(_q.setFromRotationMatrix(a.matrix));
      a.flammen.children.forEach((f, k) => { const s = 0.75 + Math.random() * 0.6; f.scale.set(s, 0.8 + Math.random() * 0.4, 0.8 + Math.random() * 0.4); f.rotation.x = t * 20 + k; });
    }
    spurSetzen(a, turbo, dt);
  });
  Object.values(g.W3).forEach((im) => { im.instanceMatrix.needsUpdate = true; });
  g.stangenFunken.geometry.attributes.position.needsUpdate = true; g.stangenFunken.geometry.attributes.color.needsUpdate = true;
  // eigener Wagen: Pfeil und Ring
  const meins = ich >= 0 && g.autos[ich];
  g.pfeil.visible = g.ring.visible = !!meins && g.phase !== "ende";
  if ((g.vMix || 0) > 0.5) g.pfeil.visible = false;   // hinter dem Wagen stoert der Pfeil nur
  if (meins) {
    const p = _v.setFromMatrixPosition(meins.matrix), farbe = meins.farbe;
    g.pfeil.position.set(p.x, 1.25 + Math.sin(t * 4) * 0.06, p.z); g.pfeil.rotation.y = t * 2; g.pfeil.material.color.copy(farbe).multiplyScalar(2.2);
    g.ring.position.set(p.x, 0.02, p.z); const rs = 1 + Math.sin(t * 5) * 0.06; g.ring.scale.set(rs, 1, rs); g.ring.material.color.copy(farbe).multiplyScalar(2.4);
  }
  if (g.mess_) {
    // kam: Kamera des letzten Bildes (Lage und Blickwinkel) - fuer die Ruckel-Probe der Verfolger-Kamera
    g.mess_.push({ dt, zeige: g.autos.map((a) => [a.zx, a.zy]), roh: g.autos.map((a) => { const z = a.puffer[a.puffer.length - 1]; return z ? [z.x, z.y] : [0, 0]; }),
      kam: [g.camera.position.x, g.camera.position.y, g.camera.position.z, g.vYaw ?? 0, g.kick || g.wackel > 0.05 ? 1 : 0, g.vDreh || 0] });
    if (g.mess_.length > 4000) g.mess_.shift();
  }
}
// Fahrer je Bild: Rumpf und Kopf haengen an Federn (Kurven, Anfahren, Stoss - der Kopf wackelt nach), die Haende greifen das
// Lenkrad auf "zehn vor zwei" und drehen mit; beim Jubeln (Punkt geholt, Sieg) gehen die Arme hoch und winken.
const _fm = new THREE.Matrix4(), _fm2 = new THREE.Matrix4(), _fq = new THREE.Quaternion(), _fq2 = new THREE.Quaternion(), _fe = new THREE.Euler(), _fv = V(), _fz = V(), _fs = V(1, 1, 1), _fh = V();
const X1 = V(1, 0, 0);
const sieger = (a) => !!(g.sieg && g.sieg.fanfare && g.sieg.sieger.includes(a.j));
function fahrerSetzen(a, j, dt, t, siegt) {
  const k = a.kopf;
  if (dt > 0) {
    const zx = a.roll * 1.6, zz = -a.nick * 3;   // Kurve: Kopf lehnt mit nach aussen; Anfahren: nach hinten
    k.vx += ((zx - k.x) * 150 - k.vx * 8) * dt; k.vz += ((zz - k.z) * 150 - k.vz * 8) * dt;
    k.x = Math.max(-0.6, Math.min(0.6, k.x + k.vx * dt)); k.z = Math.max(-0.6, Math.min(0.6, k.z + k.vz * dt));
  }
  const jubelt = siegt || a.jubel > t;
  a.jubelK += ((jubelt ? 1 : 0) - a.jubelK) * (1 - Math.exp(-dt * 9));
  // Rumpf: leicht zurueckgelehnt, macht ein Drittel des Kopf-Wackelns mit
  _fq.setFromEuler(_fe.set(k.x * 0.35, 0, 0.06 + k.z * 0.35, "XYZ"));
  _fm2.compose(WAGEN.huefte, _fq, _fs);
  g.W3.rumpf.setMatrixAt(j, _fm.multiplyMatrices(a.matrix, _fm2));
  // Kopf und Haare am Hals
  _fv.copy(WAGEN.hals).applyQuaternion(_fq).add(WAGEN.huefte);
  const nicken = a.jubelK * Math.sin(t * 9) * 0.18;
  _fq2.setFromEuler(_fe.set(k.x, a.jubelK * Math.sin(t * 4.5) * 0.25, 0.04 + k.z - nicken, "XYZ"));
  _fm2.compose(_fv, _fq2, _fs);
  _fm.multiplyMatrices(a.matrix, _fm2);
  g.W3.kopf.setMatrixAt(j, _fm); g.W3.haare.setMatrixAt(j, _fm);
  // Arme: Schulter -> Hand am Lenkradkranz (zehn vor zwei, dreht mit) bzw. hoch zum Jubeln
  _qr.copy(RAD_LAGE).multiply(_qs.setFromAxisAngle(ACHSE_Z, a.lenk * 1.4));
  [-1, 1].forEach((s, i) => {
    _fv.set(WAGEN.schulter.x, WAGEN.schulter.y, s * WAGEN.schulter.z).applyQuaternion(_fq).add(WAGEN.huefte);
    _fh.set(-s * 0.866 * WAGEN.radR, -0.5 * WAGEN.radR, 0).applyQuaternion(_qr).add(WAGEN.rad);
    if (a.jubelK > 0.01) _fz.set(_fv.x + 0.05, _fv.y + 0.22, _fv.z + s * (0.08 + Math.sin(t * 10 + i * 2) * 0.05)), _fh.lerp(_fz, a.jubelK);
    _fz.subVectors(_fh, _fv).normalize();
    _fm2.compose(_fv, _fq2.setFromUnitVectors(X1, _fz), _fs);
    _fm.multiplyMatrices(a.matrix, _fm2);
    g.W3.arme.setMatrixAt(j * 2 + i, _fm); g.W3.haende.setMatrixAt(j * 2 + i, _fm);
  });
}
// Kopf-Stoss: der Wagen wird weggeschoben, der Kopf bleibt erst zurueck und schwingt dann nach
function kopfStoss(a, nx, ny, wucht) {
  const c = Math.cos(a.zw), s = Math.sin(a.zw), vor = nx * c + ny * s, quer = -nx * s + ny * c, k = 5 + wucht * 9;
  a.kopf.vz += vor * k; a.kopf.vx -= quer * k;
}
let turboTonZuletzt = -9;
function turboTon(t) { if (t - turboTonZuletzt < 0.35) return; turboTonZuletzt = t; klang("schuss"); }
function spurSetzen(a, turbo, dt) {
  if (turbo) a.spurAlt = 0.6; else a.spurAlt = Math.max(0, a.spurAlt - dt);
  if (a.spurAlt <= 0 || STUFE[g.stufe].partikel < 0.3) { a.spur.visible = false; a.spurPkt = []; return; }
  const p = _v.set(-0.44, 0.16, 0).applyMatrix4(a.matrix).clone();
  if (!a.spurPkt.length || a.spurPkt[0].distanceTo(p) > 0.05) { a.spurPkt.unshift(p); if (a.spurPkt.length > 26) a.spurPkt.pop(); }
  const pos = a.spur.geometry.attributes.position, col = a.spur.geometry.attributes.color, N = 26;
  for (let i = 0; i < N; i++) {
    const q = a.spurPkt[Math.min(i, a.spurPkt.length - 1)] || p, r = a.spurPkt[Math.min(i + 1, a.spurPkt.length - 1)] || q;
    const dx = q.x - r.x, dz = q.z - r.z, l = Math.hypot(dx, dz) || 1, b = 0.16 * (1 - i / N);
    pos.setXYZ(i * 2, q.x - (dz / l) * b, q.y, q.z + (dx / l) * b); pos.setXYZ(i * 2 + 1, q.x + (dz / l) * b, q.y, q.z - (dx / l) * b);
    const k = Math.pow(1 - i / N, 1.5) * (a.spurAlt / 0.6) * 0.9;
    col.setXYZ(i * 2, a.farbe.r * k, a.farbe.g * k, a.farbe.b * k); col.setXYZ(i * 2 + 1, a.farbe.r * k, a.farbe.g * k, a.farbe.b * k);
  }
  pos.needsUpdate = true; col.needsUpdate = true; a.spur.visible = a.spurPkt.length > 2;
}

// ---------------------------------------------------------------- Zusammenstoss
function knalleAusloesen(t, T, hostJetzt) {
  const ich = g.beamer ? -1 : g.o.ich;
  g.offen = g.offen.filter((k) => {
    const meiner = k.a === ich || k.b === ich, wann = meiner ? hostJetzt : T;
    if (wann < k.t) return true;
    if (wann - k.t > 1500) return false;   // zu alt (Seite war versteckt)
    knall(k, t, meiner);
    return false;
  });
}
function knall(k, t, meiner) {
  const wucht = Math.max(0.25, k.wucht || 0.5), ort = welt(k.x, k.y, V()); ort.y = 0.3;
  g.zaehler.knall++;
  funkenAn(ort, 34 + Math.round(wucht * 40), wucht);
  const r = g.ringe.find((x) => x.t > AS3_ZEIT.ring) || g.ringe[0];
  r.t = 0; r.m.visible = true; r.m.position.set(ort.x, 0.03, ort.z); r.s = 0.5 + wucht * 0.9;
  if (g.blitz.visible) { g.blitz.position.copy(ort).setY(0.9); g.blitz.intensity = 22 * wucht; }
  // hinter dem Wagen wackelt nur der eigene Stoss richtig (fremde Stoesse nur ein Hauch)
  g.wackel = Math.max(g.wackel, (0.35 + wucht * 0.65) * (verfolger() && !meiner ? 0.2 : 1));
  g.stossZiel = { p: ort.clone(), t };
  if (meiner && verfolger()) { const s = k.a === g.o.ich ? -1 : 1; g.kick = { t, x: (k.nx || 0) * s, z: (k.ny || 0) * s, w: 0.6 + wucht * 0.8 }; g.zaehler.kick = (g.zaehler.kick || 0) + 1; }
  [[k.a, -1, k.pa], [k.b, 1, k.pb]].forEach(([j, s, plus]) => {
    const a = g.autos[j];
    if (!a) return;
    a.ruckV.add(V((k.nx || 0) * s, 0, (k.ny || 0) * s).multiplyScalar(1.6 + wucht * 2.2));
    a.wipp = Math.max(a.wipp, 0.08 + wucht * 0.12); a.wippT = t;
    kopfStoss(a, (k.nx || 0) * s, (k.ny || 0) * s, wucht);
    g.zaehler.kopf = (g.zaehler.kopf || 0) + 1;
    if (plus > 0) { plusZeigen(j, plus); a.jubel = t + 1.1; }
  });
  klang("aua");
  if (meiner) {
    try { if (navigator.vibrate) navigator.vibrate(Math.round(40 + wucht * 80)); } catch (e) { /* egal */ }
    const ich = g.o.ich, gab = (k.a === ich && k.pa) || (k.b === ich && k.pb);
    if (g.ui) { g.ui.blitz.classList.remove("an", "gut"); void g.ui.blitz.offsetWidth; g.ui.blitz.classList.add("an"); if (gab) g.ui.blitz.classList.add("gut"); }
    if (gab) klang("muenzen");
  }
}
function funkenAn(ort, anzahl, wucht) {
  const Q = STUFE[g.stufe], n = Math.round(anzahl * Math.max(0.4, Q.partikel));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = (0.8 + Math.random() * 1.6) * (1 + wucht);
    g.funkDaten.push({ p: ort.clone(), v: V(Math.cos(a) * s, 1 + Math.random() * 2.4 * (0.6 + wucht), Math.sin(a) * s), t: 0, l: AS3_ZEIT.funken * (0.6 + Math.random() * 0.6), warm: Math.random() });
  }
  if (g.funkDaten.length > 260) g.funkDaten.splice(0, g.funkDaten.length - 260);
}
function plusZeigen(j, plus) {
  if (!g.ui) return;
  g.zaehler.plus++;
  const el = document.createElement("div");
  el.className = "as3-plus"; el.textContent = `+${plus}`; el.style.setProperty("--as3-farbe", g.o.farben[j % g.o.farben.length]);
  el.dataset.j = j; el.dataset.seit = String(performance.now());
  g.ui.plus.appendChild(el);
  setTimeout(() => el.remove(), AS3_ZEIT.plus * 1000 + 100);
}
const _m4 = new THREE.Matrix4();
function effekte(dt, t) {
  // Funken: Schwerkraft, abprallen am Boden, verglimmen
  const pos = g.funken.geometry.attributes.position, col = g.funken.geometry.attributes.color;
  g.funkDaten = g.funkDaten.filter((x) => (x.t += dt) < x.l);
  const leer = !g.funkDaten.length;
  g.funken.visible = !leer;
  for (let i = 0; i < 260 && !(leer && g.funkenLeer); i++) {
    const x = g.funkDaten[i];
    if (!x) { pos.setXYZ(i, 0, -99, 0); continue; }
    x.v.y -= dt * 9; x.p.addScaledVector(x.v, dt);
    if (x.p.y < 0.02) { x.p.y = 0.02; x.v.y *= -0.35; x.v.x *= 0.7; x.v.z *= 0.7; }
    const k = Math.pow(1 - x.t / x.l, 1.4) * 2.4;
    pos.setXYZ(i, x.p.x, x.p.y, x.p.z); col.setXYZ(i, k, k * (0.55 + x.warm * 0.4), k * 0.25 * x.warm);
  }
  if (!(leer && g.funkenLeer)) { pos.needsUpdate = true; col.needsUpdate = true; }
  g.funkenLeer = leer;
  g.ringe.forEach((r) => {
    if (!r.m.visible) return;
    r.t += dt; const u = r.t / AS3_ZEIT.ring, s = 0.3 + u * 1.4 * (r.s || 1);
    r.m.scale.set(s, 1, s); r.m.material.opacity = Math.max(0, 0.9 * (1 - u));
    if (u >= 1) r.m.visible = false;
  });
  g.blitz.intensity *= Math.exp(-dt * 12);
  g.funken.material.size = 0.12 - 0.05 * (g.vMix || 0);   // nah an der Kamera sonst grosse Flecken
  // Lauflichter: Bande in Wellen, Dach als Lauflicht (jedes dritte Bild reicht dem Auge)
  if (g.bilder % 3 === 0) birnenSetzen(t);
  // Strahler drehen langsam ihre Staerke (Kirmes-Licht)
  g.strahler.forEach((l, i) => { l.intensity = 7 + Math.sin(t * 1.3 + i * 1.7) * 3; g.pfuetzen[i].material.opacity = l.visible ? 0.55 + Math.sin(t * 1.3 + i * 1.7) * 0.25 : 0.25; });
  // Stromstangen knistern: ab und zu regnen ein paar Funken vom Gitter (bei schwachen Geraeten seltener)
  // (nicht am eigenen Wagen hinter dem Wagen: die Funken fielen direkt vor der Kamera als grosse Flecken herunter)
  const nah = (g.vMix || 0) > 0.5 ? g.o.ich : -1;
  if (g.phase === "fahrt" && STUFE[g.stufe].partikel >= 0.6) g.autos.forEach((a) => {
    if (a.j !== nah && Math.random() < dt * (0.25 + a.v / 30 + (a.turbo ? 3 : 0))) funkenAn(_v.set(WAGEN.stange.x, WAGEN.stangeOben - 0.03, WAGEN.stange.z).applyMatrix4(a.matrix).clone(), 3, 0.05);
  });
  if (g.konfetti.visible) {
    for (let i = 0; i < g.konfDaten.length; i++) {
      const x = g.konfDaten[i];
      x.p.addScaledVector(x.v, dt); x.p.x += Math.sin(t * 2 + i) * dt * 0.3; x.r.addScaledVector(x.dr, dt);
      if (x.p.y < 0.03) x.p.y = 3 + zufallFest(i + t) * 1.5;
      _q.setFromEuler(_e.set(x.r.x, x.r.y, 0, "XYZ")); g.konfetti.setMatrixAt(i, _m4.compose(x.p, _q, _s.set(1, 1, 1)));
    }
    g.konfetti.instanceMatrix.needsUpdate = true;
  }
}
const _birne = new THREE.Color();
function birnenSetzen(t) {
  const birne = _birne;
  for (let i = 0; i < g.birnenOrte.length; i++) {
    const dach = i >= g.dachBirnenAb;
    const an = dach ? (Math.floor(t * 8) + i) % 3 === 0 : 0.5 + 0.5 * Math.sin(t * 5 + i * 0.6);
    const k = dach ? (an ? 1 : 0.18) : 0.25 + an * 0.75;
    birne.setRGB(k, k * (dach ? 0.92 : 0.8 + 0.2 * Math.sin(i)), k * (dach ? 0.7 : 0.55));
    g.birnen.setColorAt(i, birne);
  }
  g.birnen.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- Siegerehrung
function siegStart(altePunkte) {
  const punkte = g.punkte.length ? g.punkte : altePunkte || [];
  const rang = punkte.map((p, j) => [j, p]).sort((x, y) => y[1] - x[1]);
  const max = rang.length ? rang[0][1] : 0;
  g.sieg = { t: g.uhr.elapsedTime, rang, sieger: rang.filter(([, p]) => p === max && max > 0).map(([j]) => j), fanfare: false };
  g.zaehler.sieg++;
  const PL = [[0, 0.42], [-1.05, 0.28], [1.05, 0.18]];
  const oben = [];
  rang.slice(0, 3).forEach(([j, p], k) => {
    const a = g.autos[j];
    if (!a || (p <= 0 && k > 0)) return;
    a.podest = { von: { x: a.zx, y: a.zy, w: a.zw }, nach: { x: AS.AS_B / 2 + PL[k][0] / K, y: AS.AS_H / 2 + 0.2 / K, w: Math.PI / 2 }, hoch: PL[k][1], k };
    oben.push(j);
  });
  // alle anderen machen Platz: in einer Reihe an die hintere Bande, Blick zum Treppchen (Publikum statt Sichtschutz)
  const rest = g.autos.filter((a) => !oben.includes(a.j));
  rest.forEach((a, i) => {
    const x = rest.length > 1 ? 10 + (i * 80) / (rest.length - 1) : 20;
    a.podest = { von: { x: a.zx, y: a.zy, w: a.zw }, nach: { x, y: AS.AS_R + 3, w: Math.PI / 2 }, hoch: 0, k: 0.4 + i * 0.08, zu: true };
  });
  g.podest.visible = true; g.podest.scale.set(1, 0.001, 1);
  g.konfetti.visible = true;
  const farbe = (j) => new THREE.Color(g.o.farben[j % g.o.farben.length]);
  g.konfDaten.forEach((x, i) => {
    x.p.set((zufallFest(i + 40) - 0.5) * 6, 2 + zufallFest(i + 50) * 2.5, (zufallFest(i + 60) - 0.5) * 4); x.v.set(0, -(0.5 + zufallFest(i + 70) * 0.6), 0);
    const w = g.sieg.sieger.length ? g.sieg.sieger[i % g.sieg.sieger.length] : i % g.n;
    g.konfetti.setColorAt(i, farbe(w).lerp(new THREE.Color(0xffd23f), i % 3 === 0 ? 0.7 : 0));
  });
  if (g.konfetti.instanceColor) g.konfetti.instanceColor.needsUpdate = true;
  klang("fanfare");
}
// Fahrt aufs Treppchen: im Bogen zur Stufe, dort hoch und zur Kamera drehen
function podestPose(a, t) {
  const P = a.podest, u = Math.min(1, (t - g.sieg.t - P.k * 0.25) / AS3_ZEIT.podest), s = u < 0 ? 0 : u * u * (3 - 2 * u);
  const x = P.von.x + (P.nach.x - P.von.x) * s, y = P.von.y + (P.nach.y - P.von.y) * s;
  const w = P.von.w + wDiff(P.nach.w, P.von.w) * s;
  const hoch = Math.max(0, s) * P.hoch + (P.zu ? 0 : Math.sin(Math.max(0, s) * Math.PI) * 0.5);
  const sieger = g.sieg.sieger.includes(a.j);
  return { x, y, w, hoch: hoch + (sieger && u >= 1 ? Math.abs(Math.sin((t - g.sieg.t) * 4)) * 0.08 : 0), dreh: u >= 1 && sieger ? Math.sin((t - g.sieg.t) * 1.5) * 0.35 : 0, turbo: false, l: 0 };
}
function siegTakt(t) {
  if (!g.sieg) return;
  const u = Math.min(1, (t - g.sieg.t) / 0.8);
  g.podest.scale.set(1, Math.max(0.001, u * u * (3 - 2 * u)), 1);
  g.podest.userData.licht.intensity = 9 * u;
  g.kegel.forEach((k, i) => { k.visible = u > 0.5; k.rotation.z = (i ? 0.25 : -0.25) + Math.sin(t * 0.9 + i) * 0.12; });
  if (!g.sieg.fanfare && t - g.sieg.t > AS3_ZEIT.podest + 0.4) {
    g.sieg.fanfare = true; klang("sieg");   // ab jetzt jubeln die Sieger-Fahrer (sieger() in fahrerSetzen)
  }
}

// ---------------------------------------------------------------- Kamera
// passt die Fahrflaeche (samt Bande) ins Bild? oben bleibt Platz fuer Uhr und Rangliste
let randPkt = null;
function randPunkte() {
  if (randPkt) return randPkt;
  const w = g.W + 0.36, h = g.H + 0.36;
  randPkt = [];
  [[-w, -h], [w, -h], [-w, h], [w, h], [0, -h], [0, h], [-w, 0], [w, 0]].forEach(([x, z]) => randPkt.push(V(x, 0, z), V(x, 0.45, z)));
  return randPkt;
}
// Bildrand -1..1; seite/oben/unten = wie weit die Halle reichen darf (Rest: Luft fuer Schwanken, Stoss und Wackeln)
function randWert(cam, pts, oben, unten = 0.92, seite = 0.92) {
  let m = 0;
  for (const p of pts) { _v.copy(p).project(cam); m = Math.max(m, Math.abs(_v.x) / seite, _v.y > 0 ? _v.y / oben : -_v.y / unten); }
  return m;
}
function setzeKamera(cam, a, e, d, l) {
  cam.position.set(l.x + Math.cos(a) * Math.cos(e) * d, l.y + Math.sin(e) * d, l.z + Math.sin(a) * Math.cos(e) * d);
  cam.lookAt(l);
}
function passend(a, e, l, pts, oben) {
  const cam = g.mess; cam.aspect = g.camera.aspect; cam.fov = VF.fovOben; cam.updateProjectionMatrix();
  let lo = 2, hi = 80;
  for (let i = 0; i < 20; i++) { const d = (lo + hi) / 2; setzeKamera(cam, a, e, d, l); cam.updateMatrixWorld(); if (randWert(cam, pts, oben) > 1) lo = d; else hi = d; }
  return hi;
}
function zielPose(t) {
  const beamer = g.beamer, oben = beamer ? 0.84 : 0.78;
  if (g.sieg && !wenigBewegung()) {
    const l = V(0, 0.45, 0), a = Math.PI / 2 + Math.sin((t - g.sieg.t) * 0.35) * 0.4, e = 0.58;
    const pts = [V(-2.4, 0, 1.0), V(2.4, 0, 1.0), V(-2.4, 1.4, -0.4), V(2.4, 1.4, -0.4), V(0, 0, 1.4)];
    return { a, e, d: passend(a, e, l, pts, 0.72) * 1.15, l };
  }
  const e = beamer ? 0.9 : 1.12;
  let a = Math.PI / 2 + (wenigBewegung() ? 0 : Math.sin(t * 0.11) * (beamer ? 0.09 : 0.05));
  const l = V(0, 0, beamer ? 0.1 : 0.15);
  const ich = beamer ? -1 : g.o.ich, meins = ich >= 0 && g.autos[ich];
  if (meins && g.phase === "fahrt") { l.x += (meins.zx - AS.AS_B / 2) * K * 0.18; l.z += (meins.zy - AS.AS_H / 2) * K * 0.12; }
  // Einpassen kostet Rechenzeit: nur jedes vierte Bild (oder wenn sich das Bildformat aendert) neu rechnen
  const kk = `${g.camera.aspect.toFixed(3)}|${e}`;
  if (!g.passD || g.passK !== kk || g.bilder % 4 === 0) { g.passD = passend(a, e, l, randPunkte(), oben); g.passK = kk; }
  let d = g.passD;
  // Countdown: die Kamera faehrt von schraeg oben herein
  if (g.intro && !wenigBewegung()) {
    const u = Math.min(1, (t - g.intro.t) / 2.6), s = 1 - Math.pow(1 - u, 3);
    a += (1 - s) * 0.7; d *= 1 + (1 - s) * 0.35;
    if (u >= 1) g.intro = null;
    return { a, e: e + (1 - s) * 0.25, d, l };
  }
  if (g.phase === "bereit") a += Math.sin(t * 0.25) * 0.12;
  // Kamera-Stoss: kurz zum Knall hin
  if (g.stossZiel && t - g.stossZiel.t < 0.45 && !wenigBewegung()) { const k = 1 - (t - g.stossZiel.t) / 0.45; l.lerp(g.stossZiel.p.clone().setY(0), 0.08 * k); d *= 1 - 0.035 * k; }
  return { a, e, d, l };
}
// ---- Verfolger-Kamera am Handy (Nachtrag Nico 08.11.2026 22:45: "2,5D, nicht 3D" - Kamera hinter dem eigenen Wagen, faehrt
// und dreht mit). Die Kamera haengt hinter und ueber dem eigenen Fahrer; die Blickrichtung folgt dem Wagen gefedert und
// hoechstens VF.dreh rad/s schnell (Abprall an der Bande wirbelt nicht herum - kein Schwindel), der Horizont bleibt gerade.
// Eigener Stoss: Ruck weg vom Gegner, kurzes Wackeln, Sichtfeld zuckt auf (dazu Funken, Blitz, Vibration wie bisher).
// Turbo weitet das Sichtfeld. Wand/Beamer und Siegerehrung bleiben in der Uebersicht von oben; Umschalter im Bild.
export const VF = { hinten: 1.55, hoehe: 0.8, vorne: 1.7, blickHoehe: 0.28, fov: 64, fovTurbo: 9, fovOben: 38, dreh: 2.6, feder: 3.4, ruck: 0.12 };
function verfolger() {
  const ich = g.beamer ? -1 : g.o.ich;
  return ich >= 0 && g.autos[ich] && !g.sieg && g.folgen ? g.autos[ich] : null;
}
const _cp = V(), _cz = V(), _ov = V(), _ol = V();
function verfolgerPose(a, dt, t) {
  const VF_ = VF, fest = wenigBewegung();
  if (g.vYaw === undefined || g.vSprung) { g.vYaw = a.zw; g.vSprung = false; }
  const fehl = wDiff(a.zw, g.vYaw), k = fest ? 1 : 1 - Math.exp(-dt * VF_.feder);
  const schritt = Math.min(Math.abs(fehl) * k, VF_.dreh * dt * (Math.abs(fehl) > 1.2 ? 1 : 1.6));
  g.vYaw += Math.sign(fehl) * schritt;
  g.vDreh = dt > 0 ? schritt / dt : 0;   // fuer die Messung: Drehtempo der Blickrichtung (rad/s)
  const fx = Math.cos(g.vYaw), fz = Math.sin(g.vYaw);
  _cp.setFromMatrixPosition(a.matrix); _cp.y = 0;
  const pos = V(_cp.x - fx * VF_.hinten, VF_.hoehe, _cp.z - fz * VF_.hinten);
  // nicht durch die Saeulen am Rand: Kamera bleibt innerhalb des Dachs
  pos.x = Math.max(-g.W - 1.1, Math.min(g.W + 1.1, pos.x)); pos.z = Math.max(-g.H - 0.9, Math.min(g.H + 0.9, pos.z));
  const ziel = V(_cp.x + fx * VF_.vorne, VF_.blickHoehe, _cp.z + fz * VF_.vorne);
  // eigener Stoss: Ruck (gedaempfte Schwingung entlang der Stossrichtung)
  if (g.kick && !fest) {
    const u = t - g.kick.t;
    if (u > 1.2) g.kick = null;
    else { const s = Math.exp(-u * 6) * Math.sin(u * 22) * VF_.ruck * g.kick.w; pos.x += g.kick.x * s; pos.z += g.kick.z * s; pos.y += Math.abs(s) * 0.4; }
  }
  return { pos, ziel };
}
function kameraBewegen(dt, t) {
  const z = zielPose(t), Kp = g.kam, f = wenigBewegung() ? 1 : 1 - Math.exp(-dt * 3.2);
  if (g.kamSprung) { Kp.a = z.a; Kp.e = z.e; Kp.d = z.d; Kp.l.copy(z.l); }
  Kp.a += wDiff(z.a, Kp.a) * f; Kp.e += (z.e - Kp.e) * f; Kp.d += (z.d - Kp.d) * f; Kp.l.lerp(z.l, f);
  setzeKamera(g.camera, Kp.a, Kp.e, Kp.d, Kp.l);
  // Mischung Uebersicht <-> Verfolger (weicher Uebergang beim Umschalten und zur Siegerehrung)
  const a = verfolger(), soll = a ? 1 : 0;
  if (g.kamSprung || wenigBewegung()) g.vMix = soll;
  else g.vMix = (g.vMix || 0) + (soll - (g.vMix || 0)) * (1 - Math.exp(-dt * 2.4));
  if (Math.abs(g.vMix - soll) < 0.002) g.vMix = soll;
  g.kamSprung = false;
  let fov = VF.fovOben;
  if (g.vMix > 0) {
    const meins = a || g.autos[g.o.ich];
    if (meins) {
      const v = verfolgerPose(meins, dt, t), m = sanftMix(g.vMix);
      _ov.copy(g.camera.position); _ol.copy(Kp.l);
      g.camera.position.lerpVectors(_ov, v.pos, m);
      g.camera.lookAt(_cz.lerpVectors(_ol, v.ziel, m));
      const turboT = meins.turbo ? 1 : 0;
      g.vTurbo = (g.vTurbo || 0) + (turboT - (g.vTurbo || 0)) * (1 - Math.exp(-dt * 4));
      fov = VF.fovOben + (VF.fov + VF.fovTurbo * g.vTurbo + (g.kick ? 6 * Math.exp(-(t - g.kick.t) * 6) * g.kick.w : 0) - VF.fovOben) * m;
    }
  } else g.vSprung = true;
  if (Math.abs(g.camera.fov - fov) > 0.01) { g.camera.fov = fov; g.camera.updateProjectionMatrix(); }
  g.wackel *= Math.exp(-dt * 5.5);
  if (g.wackel > 0.01 && !wenigBewegung()) {
    // nah am Wagen weniger Weg (sonst schwindelt es), in der Uebersicht wie bisher; kein Kippen hinter dem Wagen
    const s = g.wackel * (0.07 - 0.045 * (g.vMix || 0));
    g.camera.position.add(_v.set(Math.sin(t * 61) * s, Math.sin(t * 47 + 1) * s * 0.6, Math.sin(t * 53 + 2) * s));
    if ((g.vMix || 0) < 0.5) g.camera.rotateZ(Math.sin(t * 37) * g.wackel * 0.006);
  }
  // Lage der Kamera sofort festschreiben: Namensschilder und Punkte werden vor dem Zeichnen mit ihr ins Bild gerechnet
  // (lookAt rechnet intern mit der alten Drehung - ohne das stuenden die Schilder hinter dem Wagen alle ausserhalb)
  g.camera.updateMatrixWorld();
}
const sanftMix = (u) => u * u * (3 - 2 * u);
// Umschalter im Bild (Handy): hinter dem Wagen / von oben; gemerkt im Geraet
function kameraSchalter() {
  if (g.beamer || !g.ui) return;
  let el = g.ui.kamEl;
  if (!el) {
    el = g.ui.kamEl = document.createElement("span"); el.className = "as3-kamera"; el.setAttribute("role", "button"); el.tabIndex = 0;
    const um = (ev) => { ev.preventDefault(); ev.stopPropagation(); g.folgen = !g.folgen; lsSchreiben("pa_as_kamera", g.folgen ? "hinten" : "oben"); zeigen(); };
    const zeigen = () => { el.textContent = g.folgen ? "🗺️ Von oben" : "🎥 Hinter dem Wagen"; };
    el.addEventListener("click", um); el.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") um(ev); });
    el.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    zeigen(); g.ui.el.appendChild(el);
  }
}

// ---------------------------------------------------------------- Anzeige im Bild
function uiBauen() {
  const ui = document.createElement("div"); ui.className = "as3-ui";
  ui.innerHTML = `<div class="as3-uhr"><b>–</b><small></small></div><div class="as3-platz" hidden></div><div class="as3-rang" hidden></div>
    <div class="as3-namen"></div><div class="as3-plusse"></div><canvas class="as3-karte" width="184" height="184" hidden></canvas><div class="as3-count" hidden></div><div class="as3-sieg" hidden><b></b><small></small></div><div class="as3-blitz"></div>`;
  return { el: ui, karte: ui.querySelector(".as3-karte"), uhr: ui.querySelector(".as3-uhr b"), uhrKlein: ui.querySelector(".as3-uhr small"), uhrBox: ui.querySelector(".as3-uhr"), platz: ui.querySelector(".as3-platz"), rang: ui.querySelector(".as3-rang"),
    namen: ui.querySelector(".as3-namen"), plus: ui.querySelector(".as3-plusse"), count: ui.querySelector(".as3-count"), sieg: ui.querySelector(".as3-sieg"),
    siegB: ui.querySelector(".as3-sieg b"), siegS: ui.querySelector(".as3-sieg small"), blitz: ui.querySelector(".as3-blitz"), schilder: [], zeilen: [], sig: {} };
}
// Rangliste umsortieren (Abnahme Schritt 3, Nico 08.11.2026: Zeilen ueberlappten beim Umsortieren und standen kurz falsch).
// Jede Zeile steht immer auf genau einem Platz. Wechseln Plaetze, blenden alle betroffenen Zeilen gemeinsam aus (kurz nach rechts),
// springen auf den neuen Platz und blenden dort wieder ein. Kommt waehrenddessen ein neuer Stand, folgt er danach (nichts kreuzt).
export const AS3_RANG = { raus: 0.16, rein: 0.24 };
function rangUmsortieren(u) {
  if (u.rangLaeuft || !u.rangZiel) return;
  const rang = u.rangZiel, wandern = [];
  const nr = (z, k, p) => { z.querySelector(".as3-nr").textContent = MEDAILLE[k] && p > 0 ? MEDAILLE[k] : `${k + 1}.`; z.dataset.platz = String(k); };
  rang.forEach(([j, p], k) => {
    const z = u.zeilen[j];
    if (z._k === undefined || wenigBewegung()) { z._k = k; z.style.top = `calc(${k} * var(--as3-zeile))`; nr(z, k, p); }
    else if (z._k !== k) wandern.push([z, k, p]);
    else nr(z, k, p);
  });
  if (!wandern.length) return;
  u.rangLaeuft = true;
  wandern.forEach(([z]) => z.classList.add("weg"));
  setTimeout(() => {
    wandern.forEach(([z, k, p]) => { z._k = k; z.style.top = `calc(${k} * var(--as3-zeile))`; nr(z, k, p); z.classList.remove("weg"); z.classList.add("rein"); });
    setTimeout(() => {
      wandern.forEach(([z]) => z.classList.remove("rein"));
      u.rangLaeuft = false;
      if (u.rangZiel !== rang) rangUmsortieren(u);
    }, AS3_RANG.rein * 1000);
  }, AS3_RANG.raus * 1000);
}
function karteMalen(c, ich) {
  const x = c.getContext("2d"), S = c.width, sk = (S * 0.92) / Math.hypot(AS.AS_B, AS.AS_H);
  x.clearRect(0, 0, S, S);
  x.save(); x.translate(S / 2, S / 2); x.rotate(-Math.PI / 2 - (g.vYaw ?? 0)); x.scale(sk, sk); x.translate(-AS.AS_B / 2, -AS.AS_H / 2);
  x.fillStyle = "#0b0716cc"; x.strokeStyle = "#facc15"; x.lineWidth = 2.2 / sk * 1.2;
  x.beginPath(); if (x.roundRect) x.roundRect(0, 0, AS.AS_B, AS.AS_H, 6); else x.rect(0, 0, AS.AS_B, AS.AS_H); x.fill(); x.stroke();
  g.autos.forEach((a) => {
    const meins = a.j === ich, r = meins ? 5.2 : 4;
    x.fillStyle = `#${a.farbe.getHexString()}`; x.beginPath(); x.arc(a.zx, a.zy, r, 0, 7); x.fill();
    if (meins) {
      x.lineWidth = 1.6; x.strokeStyle = "#fff"; x.stroke();
      x.fillStyle = "#fff"; x.beginPath(); x.moveTo(a.zx + Math.cos(a.zw) * 9, a.zy + Math.sin(a.zw) * 9);
      x.lineTo(a.zx + Math.cos(a.zw + 2.5) * 5, a.zy + Math.sin(a.zw + 2.5) * 5); x.lineTo(a.zx + Math.cos(a.zw - 2.5) * 5, a.zy + Math.sin(a.zw - 2.5) * 5); x.fill();
    }
  });
  x.restore();
}
// Namensschilder entwirren: der Reihe nach setzen (das eigene Schild zuerst, dann von oben nach unten). Stoesst ein Schild an
// ein schon gesetztes, kommt es auf die naechste freie Hoehe direkt darueber oder darunter - die mit dem kuerzesten Weg.
// So liegt nie eins auf dem anderen; bleibt im Kasten.
function schilderEntwirren(lage, ich, bh) {
  const luft = 4, gesetzt = [];
  const quer = (A, B) => A.x < B.x + B.w + luft && B.x < A.x + A.w + luft;
  const stoesst = (A, y) => gesetzt.some((B) => quer(A, B) && y < B.y + B.dy + B.h + luft && B.y + B.dy < y + A.h + luft);
  // Reihenfolge mit Gedaechtnis (sonst tauschen zwei fast gleich hohe Schilder bei jedem Bild die Plaetze und zappeln):
  // Nachbarn tauschen erst, wenn einer deutlich (12 px) hoeher steht. Das eigene Schild kommt immer zuerst.
  const nach = new Map(lage.map((A) => [A.j, A]));
  let ord = (lage[0] && lage[0].s.parentNode && lage[0].s.parentNode._ord) || [];
  ord = ord.filter((j) => nach.has(j));
  lage.forEach((A) => { if (!ord.includes(A.j)) ord.push(A.j); });
  for (let runde = 0; runde < ord.length; runde++) {
    let getauscht = false;
    for (let i = 0; i + 1 < ord.length; i++) if (nach.get(ord[i]).y - nach.get(ord[i + 1]).y > 12) { [ord[i], ord[i + 1]] = [ord[i + 1], ord[i]]; getauscht = true; }
    if (!getauscht) break;
  }
  if (lage[0] && lage[0].s.parentNode) lage[0].s.parentNode._ord = ord;
  const reihe = ord.map((j) => nach.get(j)).sort((A, B) => (B.j === ich) - (A.j === ich));
  reihe.forEach((A) => {
    const lo = g.beamer ? 2 : 46, hi = bh - A.h - 2;   // am Handy nicht unter Uhr und Platz-Anzeige oben
    let y = Math.max(lo, Math.min(hi, A.y));
    if (stoesst(A, y)) {
      // freie Hoehen direkt ueber/unter den Nachbarn; die Seite vom letzten Bild bekommt 12 px Vorsprung (kein Hin und Her)
      const vorher = Math.sign(A.s._ziel || 0), kosten = (c) => Math.abs(c - A.y) + (vorher && Math.sign(c - A.y) !== vorher ? 12 : 0);
      const kand = [];
      gesetzt.forEach((B) => { if (quer(A, B)) kand.push(B.y + B.dy - A.h - luft, B.y + B.dy + B.h + luft); });
      let best = null;
      kand.filter((c) => c >= lo && c <= hi && !stoesst(A, c)).forEach((c) => { if (best === null || kosten(c) < kosten(best)) best = c; });
      if (best !== null) y = best;
    }
    A.dy = y - A.y;
    gesetzt.push(A);
  });
}
const uhrText = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
function uiSetzen(t, hostJetzt) {
  const u = g.ui, o = g.o, ich = g.beamer ? -1 : o.ich, namen = o.namen || [];
  // Uhr und Stoesse
  const rest = g.phase === "fahrt" ? Math.min(AS.AS_ZEIT, g.bis - hostJetzt) : g.phase === "bereit" ? AS.AS_ZEIT : 0;
  const ut = g.phase === "ende" ? "Ende" : uhrText(rest);
  if (u.uhr.textContent !== ut) {
    u.uhr.textContent = ut;
    const knapp = g.phase === "fahrt" && rest <= 10000 && hostJetzt >= g.start;
    u.uhrBox.classList.toggle("knapp", knapp);
    if (knapp && rest > 0 && (g.beamer || ich >= 0)) klang("tick");
  }
  const kl = `💥 ${g.stoesse}`;
  if (u.uhrKlein.textContent !== kl) u.uhrKlein.textContent = kl;
  // Countdown 3-2-1-LOS
  let ct = "";
  if (g.phase === "fahrt") { const bis = g.start - hostJetzt; ct = bis > 0 ? String(Math.ceil(bis / 1000)) : bis > -AS3_ZEIT.los * 1000 ? "LOS!" : ""; }
  if (ct !== (u.sig.count || "")) {
    u.sig.count = ct; u.count.hidden = !ct;
    if (ct) {
      u.count.textContent = ct; u.count.classList.toggle("los", ct === "LOS!");
      u.count.style.animation = "none"; void u.count.offsetWidth; u.count.style.animation = "";
      g.zaehler.countdown++;
      if (g.beamer || ich >= 0) klang(ct === "LOS!" ? "los" : "tick");
    }
  }
  // Rangliste (Wand) bzw. eigener Platz (Handy)
  const rang = namen.map((_, j) => [j, g.punkte[j] || 0]).sort((x, y) => y[1] - x[1] || x[0] - y[0]);
  const rsig = rang.map((x) => x.join(":")).join(",") + "|" + namen.join(",");
  if (rsig !== u.sig.rang) {
    u.sig.rang = rsig;
    if (g.beamer) {
      u.rang.hidden = false;
      while (u.zeilen.length < namen.length) { const z = document.createElement("div"); z.className = "as3-zeile"; z.innerHTML = "<span class='as3-nr'></span><i></i><span class='as3-nm'></span><b></b>"; u.rang.appendChild(z); u.zeilen.push(z); }
      u.zeilen.forEach((z, j) => { z.hidden = j >= namen.length; });
      // Punkte sofort, Plaetze ueber rangUmsortieren (nie zwei Zeilen uebereinander)
      rang.forEach(([j, p]) => {
        const z = u.zeilen[j];
        z.style.setProperty("--as3-farbe", o.farben[j % o.farben.length]);
        z.querySelector(".as3-nm").textContent = namen[j];
        const b = z.querySelector("b");
        if (b.textContent !== String(p)) { if (b.textContent) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); } b.textContent = String(p); }
      });
      u.rangZiel = rang;
      rangUmsortieren(u);
      u.rang.style.height = `calc(${namen.length} * var(--as3-zeile))`;
    } else if (ich >= 0 && ich < namen.length) {
      const p = g.punkte[ich] || 0, k = rang.filter(([, x]) => x > p).length;   // Gleichstand = gleicher Platz
      u.platz.hidden = false;
      u.platz.innerHTML = `${MEDAILLE[k] && p > 0 ? `<span>${MEDAILLE[k]}</span> ` : ""}Platz ${k + 1} · <b>${p}</b> ${p === 1 ? "Punkt" : "Punkte"}`;
      u.platz.style.setProperty("--as3-farbe", o.farben[ich % o.farben.length]);
    }
  }
  // Sieg
  const siegSig = g.sieg ? g.sieg.sieger.join(",") : "";
  if (siegSig !== (u.sig.sieg || "") || !!g.sieg !== !u.sieg.hidden) {
    u.sig.sieg = siegSig; u.sieg.hidden = !g.sieg;
    if (g.sieg) {
      const w = g.sieg.sieger, p = w.length ? g.punkte[w[0]] || 0 : 0;
      u.siegB.textContent = w.length ? `🏆 ${w.map((j) => (j === ich ? "Du" : kurz(namen[j], 18))).join(" & ")} ${w.length > 1 ? "gewinnen" : w[0] === ich ? "gewinnst" : "gewinnt"}!` : "🏁 Keiner hat gerammt";
      u.siegS.textContent = `${p} ${p === 1 ? "Punkt" : "Punkte"} · ${g.stoesse} Zusammenstöße`;
      u.sieg.style.setProperty("--as3-farbe", w.length ? o.farben[w[0] % o.farben.length] : "#fff");
    }
  }
  // Namensschilder ueber den Wagen (bleiben im Kasten)
  const bw = g.groesse ? g.groesse[0] : 360, bh = g.groesse ? g.groesse[1] : 260;
  while (u.schilder.length < g.n) { const s = document.createElement("span"); s.className = "as3-name"; u.namen.appendChild(s); u.schilder.push(s); }
  // Abnahme Schritt 3 (Nico 08.11.2026): bei Gedraenge nicht uebereinander - Schilder weichen einander nach oben/unten aus;
  // das eigene Schild bleibt am Wagen, die anderen machen Platz.
  const lage = g.autos.map((a, j) => {
    const s = u.schilder[j], txt = j === ich ? "Du" : kurz(namen[j] || "", g.beamer ? 16 : 8);
    // Groesse nur nach einem Textwechsel messen (sonst rechnet der Browser jedes Bild die Seite neu)
    if (s.dataset.t !== txt || !s._w) { s.dataset.t = txt; s.innerHTML = `<i></i>${esc(txt)}`; s.style.setProperty("--as3-farbe", o.farben[j % o.farben.length]); s.classList.toggle("ich", j === ich); s._w = s.offsetWidth + 1; s._h = s.offsetHeight + 1; }   // +1: Bruchteile (Schrift in vw)
    _v.setFromMatrixPosition(a.matrix); _v.y += a.podest ? 1.15 : 0.95; _v.project(g.camera);
    const sw = s._w || 40, sh = s._h || 16;
    // hinter dem Wagen: das eigene Schild weg (man sitzt ja drin), Wagen hinter der Kamera oder weit ausserhalb ohne Schild
    const weg = (g.vMix > 0.5 && j === ich) || a.anKamera || _v.z > 1 || (g.vMix > 0 && (Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05));
    const x = Math.max(2, Math.min(bw - sw - 2, ((_v.x + 1) / 2) * bw - sw / 2)), y = Math.max(2, Math.min(bh - sh - 2, ((1 - _v.y) / 2) * bh - sh));
    return { s, j, x, y, w: sw, h: sh, dy: 0, weg };
  });
  lage.filter((L) => L.weg).forEach((L) => { L.s.style.opacity = "0"; L.s._dy = undefined; });
  const sicht = lage.filter((L) => !L.weg);
  schilderEntwirren(sicht, ich, bh);
  sicht.forEach((L) => {
    const s = L.s;
    // genau auf den freien Platz (kein Nachgleiten: gleitende Schilder lagen unter Last kurz uebereinander); ruhig bleibt es
    // durch die Reihenfolge mit Gedaechtnis und den Seiten-Vorsprung in schilderEntwirren
    s._ziel = L.dy;
    s._dy = L.dy;
    s.style.transform = `translate(${L.x.toFixed(1)}px,${(L.y + s._dy).toFixed(1)}px)`;
    s.style.opacity = g.phase === "ende" && !g.autos[L.j].podest ? "0.35" : "1";
  });
  // Hallenkarte (nur hinter dem Wagen): wer ist wo - gedreht, sodass "vorne" oben ist
  const karteAn = (g.vMix || 0) > 0.5 && g.phase !== "ende";
  if (u.karte.hidden === karteAn) u.karte.hidden = !karteAn;
  if (karteAn && g.bilder % 2 === 0) karteMalen(u.karte, ich);
  // aufschwebende Punkte folgen ihrem Wagen
  u.plus.querySelectorAll(".as3-plus").forEach((el) => {
    const a = g.autos[Number(el.dataset.j)];
    if (!a) return;
    _v.setFromMatrixPosition(a.matrix); _v.y += 1.2; _v.project(g.camera);
    el.style.visibility = _v.z > 1 ? "hidden" : "";
    const auf = (performance.now() - Number(el.dataset.seit)) / 1000;
    el.style.transform = `translate(${(((_v.x + 1) / 2) * bw).toFixed(1)}px,${(((1 - _v.y) / 2) * bh - auf * 46).toFixed(1)}px) translate(-50%,-100%)`;
  });
}

// ---------------------------------------------------------------- Bildschleife
function schleife(gen) {
  if (!g || g.gen !== gen) return;
  if (!g.container || !g.container.isConnected) { g.laeuft = false; return; }
  requestAnimationFrame(() => schleife(gen));
  const t0 = performance.now();
  const dt = Math.min(0.1, g.uhr.getDelta()), t = g.uhr.elapsedTime;
  g.bilder++;
  g.renderer.info.reset();
  bildrateMessen(dt);
  if (g.bilder % 20 === 0) groessePruefen();
  // Uhren: hostJetzt = Gastgeber-Zeit (abzueglich der kuerzesten Laufzeit im Netz), T = Nachspiel-Uhr fuer alle anderen Wagen
  const letzt = g.autos[0] && g.autos[0].puffer.length ? g.autos[0].puffer[g.autos[0].puffer.length - 1].t : 0;
  const hostJetzt = g.offMin !== null ? t0 - g.offMin : letzt, T = hostJetzt - VERZUG;
  autosSetzen(dt, t, T, hostJetzt);
  knalleAusloesen(t, T, hostJetzt);
  siegTakt(t);
  effekte(dt, t);
  kameraBewegen(dt, t);
  if (g.ui) uiSetzen(t, hostJetzt);
  if (g.composer && STUFE[g.stufe].leuchten) g.composer.render(dt);
  else g.renderer.render(g.scene, g.camera);
  g.ms = (g.ms || 0) * 0.95 + (performance.now() - t0) * 0.05;
}
function groessePruefen() {
  const c = g.container;
  const breite = Math.round(c.clientWidth * (g.beamer ? 0.8 : 1)) || 360, hoehe = c.clientHeight || Math.round(breite * 0.7);
  if (!g.groesse || g.groesse[0] !== breite || g.groesse[1] !== hoehe) {
    g.groesse = [breite, hoehe]; groesseAnwenden();
    g.camera.aspect = breite / hoehe; g.camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------- Einstieg
// container: Kasten mit data-as3d (null = nur den neuen Stand an die laufende Wand-Ansicht geben); d: asDaten/asAuszug;
// o: { namen, farben, ich (-1 = keiner), beamer }
export function as3dZeigen(container, d, o) {
  if (!d || !Array.isArray(d.wagen)) return false;
  const n = Math.max(1, d.wagen.length);
  if (!container) {
    if (!g || g.beamer !== !!o.beamer || g.n !== n) return false;
    g.o = { ...g.o, ...o }; einspeisen(d); return true;
  }
  if (!as3dGeht()) return false;
  if (g && (g.n !== n || g.beamer !== !!o.beamer)) {   // andere Spielerzahl (Einsteiger) oder Ort: Halle neu bauen
    try { g.renderer.domElement.remove(); if (g.ui) g.ui.el.remove(); if (g.composer) g.composer.dispose(); g.renderer.dispose(); } catch (e) { /* egal */ }
    g.laeuft = false; g = null; randPkt = null;
  }
  try { if (!g) aufbauen(o, n); } catch (e) { console.warn("3D nicht verfuegbar - flaches Bild", e); g = null; geht = false; return false; }
  g.o = { ...o };
  einspeisen(d);
  g.container = container;
  container.classList.add("hat-3d");
  if (g.renderer.domElement.parentNode !== container) container.insertBefore(g.renderer.domElement, container.firstChild);
  if (!g.ui) g.ui = uiBauen();
  if (g.ui.el.parentNode !== container) container.appendChild(g.ui.el);
  g.ui.el.classList.toggle("wand", g.beamer);
  kameraSchalter();
  groessePruefen();
  if (!g.laeuft) { g.laeuft = true; g.gen = ++generation; g.uhr.getDelta(); schleife(g.gen); }
  return true;
}
// Lenk-Eingabe am eigenen Handy (autoscooter.js): wirkt sofort auf das vorausgerechnete eigene Auto
export function as3dEingabe(l, turbo) {
  if (!g) return;
  g.eingabe.l = l;
  if (turbo) g.eingabe.turboT = performance.now();
}

// fuer Tests und die Probe am Ally
export function as3dStand() {
  if (!g) return null;
  const cam = g.mess; cam.aspect = g.camera.aspect; cam.fov = g.camera.fov; cam.updateProjectionMatrix();
  cam.position.copy(g.camera.position); cam.quaternion.copy(g.camera.quaternion); cam.updateMatrixWorld();
  return { fps: g.fps || 0, ms: +(g.ms || 0).toFixed(2), stufe: g.stufe, aufbauMs: g.aufbauMs, modelleDa: !!g.modelleDa, leuchten: !!(g.composer && STUFE[g.stufe].leuchten),
    zeichnungen: g.renderer.info.render.calls, dreiecke: g.renderer.info.render.triangles, n: g.n, phase: g.phase, bilder: g.bilder, zaehler: { ...g.zaehler },
    rand: +randWert(cam, randPunkte(), 1, 1, 1).toFixed(3), groesse: g.groesse ? g.groesse.slice() : null, beamer: g.beamer, sieg: g.sieg ? g.sieg.sieger.slice() : null,
    wagen: g.autos.map((a) => [+a.zx.toFixed(2), +a.zy.toFixed(2), +a.zw.toFixed(2)]), turbo: g.autos.map((a) => a.flammen.visible), offMin: g.offMin,
    // Netz: Schwankung der Laufzeit in den letzten 4 s (ms) und die Lenk-Stellung des eigenen Wagens laut Gastgeber
    schwankung: g.offsets.length > 1 ? Math.round(Math.max(...g.offsets.map((x) => x[1])) - g.offMin) : 0,
    eigenL: !g.beamer && g.autos[g.o.ich] && g.autos[g.o.ich].puffer.length ? g.autos[g.o.ich].puffer[g.autos[g.o.ich].puffer.length - 1].l : null,
    countdown: g.ui && !g.ui.count.hidden ? g.ui.count.textContent : "", uhr: g.ui ? g.ui.uhr.textContent : "", sieger: g.ui && !g.ui.sieg.hidden ? g.ui.siegB.textContent : "",
    platz: g.ui && !g.ui.platz.hidden ? g.ui.platz.textContent : "", rang: g.ui && !g.ui.rang.hidden ? g.ui.zeilen.filter((z) => !z.hidden).sort((x, y) => (x._k ?? 99) - (y._k ?? 99)).map((z) => z.textContent) : [],
    // Rangliste: Lage jeder sichtbaren Zeile (Bildpunkte) und Namensschilder - fuer die Ueberlappungs-Probe
    zeilenLage: g.ui && !g.ui.rang.hidden ? g.ui.zeilen.filter((z) => !z.hidden).map((z) => { const r = z.getBoundingClientRect(); return { t: z.textContent, oben: r.top, unten: r.bottom, sicht: +getComputedStyle(z).opacity }; }) : [],
    schilder: g.ui ? g.ui.schilder.map((s) => { const r = s.getBoundingClientRect(); return { t: s.textContent, l: r.left, r: r.right, o: r.top, u: r.bottom, dy: +(s._dy || 0).toFixed(1), ziel: +(s._ziel || 0).toFixed(1), w: s._w, h: s._h, sicht: s.style.opacity !== "0" }; }) : [],
    // Verfolger-Kamera (Handy): an?, Mischung, Sichtfeld, eigener Wagen im Bild (Seitenkoordinaten -1..1), Stoss-Rucks
    verfolger: !!verfolger(), vMix: +(g.vMix || 0).toFixed(2), fov: +g.camera.fov.toFixed(1),
    // Fahrer: Kopf-Auslenkung (rad) und Jubel-Anteil je Wagen
    kopf: g.autos.map((a) => +Math.hypot(a.kopf.x, a.kopf.z).toFixed(3)), jubel: g.autos.map((a) => +a.jubelK.toFixed(2)),
    eigenImBild: !g.beamer && g.autos[g.o.ich] ? (() => { const p = _v.setFromMatrixPosition(g.autos[g.o.ich].matrix).project(g.camera); return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(3)]; })() : null,
    vorne: !g.beamer && g.autos[g.o.ich] ? g.autos.filter((a) => a.j !== g.o.ich).filter((a) => { const p = _v.setFromMatrixPosition(a.matrix).project(g.camera); return p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1; }).length : 0 };
}
// Bild-fuer-Bild-Messung: gezeigte Lage jedes Wagens und der zuletzt angekommene Stand (so sah es frueher aus)
export function as3dMessen(an) { if (g) g.mess_ = an ? [] : null; }
export function as3dMessung() { return g && g.mess_ ? g.mess_.slice() : null; }
// wo ein Wagen gerade im Bild steht (Seitenkoordinaten)
export function as3dBildPunkt(j) {
  if (!g || !g.autos[j]) return null;
  const r = g.renderer.domElement.getBoundingClientRect();
  _v.setFromMatrixPosition(g.autos[j].matrix).project(g.camera);
  return { x: r.left + ((_v.x + 1) / 2) * r.width, y: r.top + ((1 - _v.y) / 2) * r.height };
}
export const as3dDa = () => !!g;

// ---------------------------------------------------------------- Aussehen der Anzeige
if (typeof document !== "undefined" && !document.getElementById("as3-stil")) {
  document.head.insertAdjacentHTML("beforeend", `<style id="as3-stil">
    .as3-ui{position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:inherit;--as3-zeile:clamp(22px,4.2vh,46px)}
    .as3-uhr{position:absolute;left:8px;top:8px;display:flex;align-items:baseline;gap:8px;padding:4px 12px;border-radius:99px;background:#0b0716d9;color:#fff;box-shadow:0 0 0 2px #ffffff30,0 0 14px #ff3fa855}
    .as3-uhr b{font-size:20px;font-weight:900;font-variant-numeric:tabular-nums;letter-spacing:.02em}.as3-uhr small{font-size:13px;font-weight:800;opacity:.85}
    .as3-uhr.knapp{box-shadow:0 0 0 2px #ef4444,0 0 20px #ef4444;animation:as3-puls .5s ease-in-out infinite alternate}.as3-uhr.knapp b{color:#fecaca}
    @keyframes as3-puls{to{transform:scale(1.07)}}
    .as3-platz{position:absolute;right:8px;top:8px;max-width:calc(100% - 150px);padding:4px 12px;border-radius:99px;background:#0b0716d9;color:#fff;font-weight:800;font-size:14px;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 0 0 2px var(--as3-farbe,#fff),0 0 14px var(--as3-farbe,#fff)}
    .as3-platz b{font-size:17px}
    .as3-name{position:absolute;left:0;top:0;display:flex;align-items:center;gap:3px;padding:0 6px 0 3px;border-radius:99px;background:#0b0716b8;color:#fff;font-weight:800;font-size:10px;line-height:1.5;
      white-space:nowrap;box-shadow:0 0 0 1.5px var(--as3-farbe);will-change:transform;transition:opacity .4s}
    .as3-name i{width:9px;height:9px;border-radius:50%;background:var(--as3-farbe);flex:none}
    .as3-name.ich{font-size:13px;background:var(--as3-farbe);box-shadow:0 0 0 2px #fff,0 0 12px var(--as3-farbe)}.as3-name.ich i{background:#fff}
    .as3-plus{position:absolute;left:0;top:0;font-size:19px;font-weight:900;color:#fff;-webkit-text-stroke:2px var(--as3-farbe);text-shadow:0 0 14px var(--as3-farbe),0 3px 0 #0008;
      animation:as3-plus ${AS3_ZEIT.plus}s ease-out forwards;white-space:nowrap}
    @keyframes as3-plus{0%{opacity:0;scale:.3}15%{opacity:1;scale:1.25}30%{scale:1}75%{opacity:1}100%{opacity:0;scale:.9}}
    .as3-count{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font-size:min(30vw,130px);font-weight:900;line-height:1;color:#fff;-webkit-text-stroke:4px #0009;
      text-shadow:0 0 40px #ff3fa8,0 8px 0 #0008;animation:as3-pop .55s cubic-bezier(.2,1.7,.4,1)}
    .as3-count.los{color:#facc15;text-shadow:0 0 50px #f97316,0 8px 0 #0008}
    @keyframes as3-pop{from{transform:translate(-50%,-50%) scale(2.4);opacity:0}to{transform:translate(-50%,-50%) scale(1);opacity:1}}
    .as3-sieg{position:absolute;left:50%;bottom:7%;transform:translateX(-50%);max-width:92%;padding:8px 20px;border-radius:16px;text-align:center;overflow-wrap:anywhere;
      background:linear-gradient(#ffe68a,#f5a623);color:#3a2200;box-shadow:0 6px 0 #0006,0 0 30px #ffd23f;animation:as3-sieg .7s cubic-bezier(.2,1.6,.4,1)}
    .as3-sieg b{display:block;font-size:20px;font-weight:900}.as3-sieg small{display:block;font-size:13px;font-weight:800;opacity:.8}
    @keyframes as3-sieg{from{transform:translateX(-50%) scale(.2);opacity:0}to{transform:translateX(-50%) scale(1);opacity:1}}
    .as3-blitz{position:absolute;inset:0;opacity:0;box-shadow:inset 0 0 60px 18px #ef4444}.as3-blitz.gut{box-shadow:inset 0 0 60px 18px #facc15}
    .as3-blitz.an{animation:as3-blitz .45s ease-out}@keyframes as3-blitz{from{opacity:1}to{opacity:0}}
    .as3-rang{position:absolute;right:0;top:1.2vh;width:19.5%;}
    .as3-zeile{position:absolute;left:0;right:.6vw;top:0;height:var(--as3-zeile);display:flex;align-items:center;gap:.5vw;padding:0 .7vw;box-sizing:border-box;color:#fff;
      font-size:calc(var(--as3-zeile) * .46);font-weight:800;transition:opacity ${AS3_RANG.raus}s ease-in,translate ${AS3_RANG.raus}s ease-in;isolation:isolate}
    .as3-zeile.weg{opacity:0;translate:35% 0}
    .as3-zeile.rein{animation:as3-rein ${AS3_RANG.rein}s cubic-bezier(.2,.9,.3,1)}@keyframes as3-rein{from{opacity:0;translate:-25% 0}to{opacity:1;translate:0 0}}
    .as3-zeile::before{content:"";position:absolute;inset:6% 0;border-radius:99px;background:#140d26;box-shadow:0 0 0 2px var(--as3-farbe);z-index:-1}
    .as3-zeile .as3-nr{width:2.2em;text-align:center;flex:none}.as3-zeile i{width:.8em;height:.8em;border-radius:50%;background:var(--as3-farbe);flex:none}
    .as3-zeile .as3-nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.as3-zeile b{font-size:1.25em;font-variant-numeric:tabular-nums}
    .as3-zeile b.pop{animation:as3-zahl .5s cubic-bezier(.2,1.8,.4,1)}@keyframes as3-zahl{from{transform:scale(1.9);color:#facc15}to{transform:scale(1)}}
    .as3-ui.wand .as3-uhr{left:1vw;top:1.2vh;padding:.5vh 1.2vw;gap:1vw}.as3-ui.wand .as3-uhr b{font-size:2.6vw}.as3-ui.wand .as3-uhr small{font-size:1.4vw}
    .as3-ui.wand .as3-name{font-size:1vw;padding:.1vw .6vw .1vw .25vw;gap:.3vw}.as3-ui.wand .as3-name i{width:.8vw;height:.8vw}
    .as3-ui.wand .as3-plus{font-size:3vw}.as3-ui.wand .as3-count{left:40%;font-size:16vw}.as3-ui.wand .as3-sieg{left:40%;max-width:72%}
    .as3-ui.wand .as3-sieg b{font-size:3vw}.as3-ui.wand .as3-sieg small{font-size:1.5vw}
    .as3-ui [hidden]{display:none!important}
    .as3d .as3-karte{position:absolute;right:6px;bottom:6px;width:92px!important;height:92px!important;border-radius:50%;background:radial-gradient(#0b0716aa,#0b071640 70%,#0000 72%);
      filter:drop-shadow(0 2px 4px #000a)}
    .as3-kamera{position:absolute;left:8px;bottom:8px;padding:5px 10px;border-radius:99px;background:#0b0716cc;color:#fff;font-weight:800;font-size:12px;
      pointer-events:auto;cursor:pointer;box-shadow:0 0 0 1.5px #ffffff40;-webkit-tap-highlight-color:transparent;user-select:none}
    .as-wand .as3d canvas{width:80%!important}
  </style>`);
}
