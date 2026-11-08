// Autoscooter in 3D (Partyspiele-Kritik Schritt 3, Nico 08.11.2026: "soll in 3D sein", "darf nicht ruckeln", "deutlich
// hochwertiger"). Gleicher Unterbau wie Partybrett und Mensch aergere dich nicht: three.js aus vendor/, Himmel und
// Spiegelungen aus brett_schmuck.js, Fahrer-Figuren aus modelle.js, Leuchten (Nachbearbeitung) und Qualitaetsstufen wie brett3d.js.
// Nur die Darstellung - Regeln, Punkte und Computer bleiben in autoscooter.js beim Gastgeber.
//   Halle     Kirmes-Autoscooter bei Nacht: Stahlboden mit Glanz und Plattenfugen, Gummibande auf Blechwand mit
//             Warnstreifen und Lauflichtern, Stromgitter unter dem Dach, Saeulen, Neonroehren, Leuchtschrift, bunte Strahler.
//   Wagen     richtige Autoscooter: lackierte Wanne in der Spielerfarbe, Gummiring, Sitz, Lenkrad (dreht beim Lenken),
//             Scheinwerfer, Ruecklichter, Stromstange mit Funken am Gitter, Unterboden-Leuchten, Fahrer am Steuer, Name darueber.
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
// Zeiten in Sekunden (fuer die Tests auslesbar)
export const AS3_ZEIT = { podest: 1.7, plus: 1.1, funken: 0.7, ring: 0.55, los: 0.9 };

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
function wagenTeile() {
  const lack = vereinen([
    hochziehen(rundRechteck(0.62, 0.5, 0.14, 0.2), 0.16, 0.05, 0.1),                         // Wanne
    (() => { const k = new THREE.SphereGeometry(0.24, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2); k.scale(0.9, 0.55, 1.0); k.translate(0.16, 0.34, 0); return k; })(), // Haube vorn
    (() => { const f = new THREE.BoxGeometry(0.1, 0.2, 0.44); f.translate(-0.3, 0.42, 0); return f; })(),                  // Heck-Rueckenblech
  ]);
  const gummi = (() => { const t = new THREE.TorusGeometry(0.34, 0.068, 12, 48); t.rotateX(Math.PI / 2); t.scale(1.12, 1, 0.88); t.translate(0, 0.14, 0); return t; })();
  const dunkel = vereinen([
    (() => { const k = new THREE.CylinderGeometry(0.33, 0.35, 0.1, 32); k.scale(1.1, 1, 0.86); k.translate(0, 0.07, 0); return k; })(),   // Sockel
    (() => { const k = new THREE.BoxGeometry(0.2, 0.08, 0.36); k.translate(-0.12, 0.36, 0); return k; })(),                   // Sitzflaeche
    (() => { const k = new THREE.BoxGeometry(0.07, 0.26, 0.36); k.rotateZ(0.18); k.translate(-0.23, 0.48, 0); return k; })(), // Lehne
    (() => { const k = new THREE.CylinderGeometry(0.018, 0.022, 0.24, 8); k.rotateZ(0.75); k.translate(0.1, 0.42, 0); return k; })(), // Lenksaeule
  ]);
  const chrom = vereinen([
    (() => { const k = new THREE.CylinderGeometry(0.014, 0.02, 2.12, 8); k.translate(-0.3, 0.5 + 1.06, 0); return k; })(),    // Stromstange
    (() => { const k = new THREE.TorusGeometry(0.035, 0.008, 6, 16); k.rotateY(Math.PI / 2); k.translate(-0.3, 2.62, 0); return k; })(), // Abnehmer oben
    (() => { const k = new THREE.TorusGeometry(0.3, 0.012, 6, 40); k.rotateX(Math.PI / 2); k.scale(1.12, 1, 0.88); k.translate(0, 0.3, 0); return k; })(), // Zierleiste
  ]);
  const rad = (() => { const k = new THREE.TorusGeometry(0.07, 0.014, 8, 24); const sp = new THREE.BoxGeometry(0.01, 0.13, 0.016); return vereinen([k, sp]); })();
  const vorn = vereinen([-1, 1].map((s) => { const k = new THREE.SphereGeometry(0.035, 12, 8); k.translate(0.36, 0.3, s * 0.13); return k; }));
  const hinten = vereinen([-1, 1].map((s) => { const k = new THREE.BoxGeometry(0.02, 0.04, 0.09); k.translate(-0.36, 0.42, s * 0.14); return k; }));
  return { lack, gummi, dunkel, chrom, rad, vorn, hinten };
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
  const boden = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, H * 2), new THREE.MeshPhysicalMaterial({ map: bodenTextur(), metalness: 0.55, roughness: 0.3, clearcoat: Q.leuchten ? 0.8 : 0.3, clearcoatRoughness: 0.12 }));
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
  const sammel = (geo, mat, schatten = true) => { const im = new THREE.InstancedMesh(geo, mat, n); im.castShadow = schatten; im.receiveShadow = true; im.frustumCulled = false; scene.add(im); return im; };
  const vollSchatten = Q.schatten >= 2048;   // Handy-Stufen: nur Wanne und Gummiring werfen Schatten (spart einen Durchgang je Teil)
  const W3 = {
    lack: sammel(T.lack, lackMat), gummi: sammel(T.gummi, new THREE.MeshStandardMaterial({ color: 0x121218, roughness: 0.7 })),
    dunkel: sammel(T.dunkel, new THREE.MeshStandardMaterial({ color: 0x2a1a22, roughness: 0.55 }), vollSchatten), chrom: sammel(T.chrom, chromMat, vollSchatten),
    rad: sammel(T.rad, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }), false),
    vorn: sammel(T.vorn, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.6) }), false),
    hinten: sammel(T.hinten, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.25, 0.2) }), false),
    glow: sammel(new THREE.PlaneGeometry(1.5, 1.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: weich(), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), false),
    kopf: sammel(new THREE.SphereGeometry(0.085, 14, 10).translate(-0.1, 0.66, 0), new THREE.MeshStandardMaterial({ color: 0xf1c7a0, roughness: 0.6 })),
    rumpf: sammel(new THREE.CylinderGeometry(0.075, 0.1, 0.22, 12).translate(-0.1, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })),
  };
  W3.glow.renderOrder = 1;
  const hell = (f, a) => new THREE.Color(f).lerp(new THREE.Color(0xffffff), a);
  for (let j = 0; j < n; j++) {
    const f = o.farben[j % o.farben.length];
    W3.lack.setColorAt(j, new THREE.Color(f)); W3.glow.setColorAt(j, hell(f, 0.1)); W3.rumpf.setColorAt(j, new THREE.Color(f).multiplyScalar(0.6));
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
    [-0.12, 0.12].forEach((z) => { const m = new THREE.Mesh(flammeGeo, flammeMat); m.position.set(-0.36, 0.22, z); flammen.add(m); });
    flammen.visible = false; scene.add(flammen);
    const spurGeo = new THREE.BufferGeometry();
    spurGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPUR * 2 * 3), 3)); spurGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(SPUR * 2 * 3), 3));
    const idx = []; for (let i = 0; i < SPUR - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } spurGeo.setIndex(idx);
    const spur = new THREE.Mesh(spurGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    spur.frustumCulled = false; spur.visible = false; scene.add(spur);
    return { j, farbe: new THREE.Color(o.farben[j % o.farben.length]), puffer: [], x: 0, y: 0, w: 0, zx: 0, zy: 0, zw: 0, fehler: null, roll: 0, nick: 0, v: 0, gier: 0,
      ruck: V(), ruckV: V(), wipp: 0, wippT: 0, flammen, spur, spurPkt: [], spurAlt: 0, turbo: false, lenk: 0, rad: 0, fahrer: null, jubel: 0, matrix: new THREE.Matrix4(), podest: null };
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
    podest, kegel, beamer: !!o.beamer, o, stufe: st.stufe, stufeFest: st.fest, mess_dt: [], bilder: 0, uhr: new THREE.Clock(), offsets: [], offMin: null, phase: null, runde: 0, start: 0, bis: 0,
    punkte: [], stoesse: 0, gesehen: new Set(), offen: [], eingabe: { l: 0, turboT: 0 }, kam: { a: Math.PI / 2, e: 0.9, d: 14, l: V() }, kamSprung: true, wackel: 0, stossZiel: null,
    intro: null, sieg: null, countZuletzt: null, letztT: -1, zaehler: { knall: 0, turbo: 0, plus: 0, sieg: 0, countdown: 0, snaps: 0, vorausgerechnet: 0 }, mess_: null, ui: null, laeuft: false, container: null, groesse: null };
  SC.himmelSetzen(g, "nacht");
  g.scene.environmentIntensity = 0.45;
  // Fahrer: Kenney-Figuren in Spielerfarbe; fehlen die Dateien, bleiben Kopf und Rumpf aus einfachen Formen
  const dieseSzene = g;
  MD.vorladen("autoscooter", Math.min(12, n)).then((da) => {
    if (!da || g !== dieseSzene) return;
    g.autos.forEach((a) => {
      const m = MD.figur(a.j % 12, o.farben[a.j % o.farben.length], 0.62);
      if (!m) return;
      m.wurzel.traverse((x) => { if (x.isMesh) x.castShadow = Q.schatten >= 2048; });
      scene.add(m.wurzel); a.fahrer = m;
      const idle = m.aktionen.idle; if (idle) idle.play();
    });
    g.modelleDa = g.autos.some((a) => a.fahrer);
  }).catch((e) => console.warn("Fahrer fuer den Autoscooter fehlen", e));
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
    a.matrix.compose(_p, _q, _s.set(1, 1, 1));
    ["lack", "gummi", "dunkel", "chrom", "vorn", "hinten", "kopf", "rumpf"].forEach((k) => g.W3[k].setMatrixAt(j, a.matrix));
    // Lenkrad: vor dem Sitz, schraeg, dreht mit der Lenk-Stellung
    _qr.copy(RAD_LAGE).multiply(_qs.setFromAxisAngle(ACHSE_Z, a.lenk * 1.4));
    _m2.compose(_v.set(0.04, 0.5, 0), _qr, _s.set(1, 1, 1));
    g.W3.rad.setMatrixAt(j, _m.multiplyMatrices(a.matrix, _m2));
    // Unterboden-Leuchten: am eigenen Wagen heller und groesser
    const gs = (j === ich ? 1.35 : 1) * (dunkel && !a.podest ? 0.6 : 1);
    _m2.compose(_v.set(0, 0.012, 0), _q.identity(), _s.set(gs, 1, gs));
    g.W3.glow.setMatrixAt(j, _m.multiplyMatrices(a.matrix, _m2));
    // Stangen-Funke oben am Gitter: flackert, beim Turbo und nach dem Stoss stark
    _v.set(-0.3, 2.62, 0).applyMatrix4(a.matrix);
    g.stangenFunken.geometry.attributes.position.setXYZ(j, _v.x, _v.y, _v.z);
    const fl = g.phase === "fahrt" ? (Math.random() < 0.18 + a.v / 120 ? 0.4 + Math.random() * 0.8 : 0.05) + (z.turbo ? 0.6 : 0) + a.wipp * 2 : 0.04;
    g.stangenFunken.geometry.attributes.color.setXYZ(j, 0.55 * fl, 0.75 * fl, 1.0 * fl);
    // Fahrer
    if (a.fahrer) {
      const m = a.fahrer;
      m.wurzel.position.copy(_v.set(-0.12, 0.2, 0).applyMatrix4(a.matrix));
      m.wurzel.quaternion.copy(_q.setFromEuler(_e.set(a.roll, -z.w + (z.dreh || 0) + Math.PI / 2, 0, "YXZ")));
      m.mixer.update(dt);
      if (a.jubel && t > a.jubel) { a.jubel = 0; const al = m.aktionen.idle, nu = m.aktionen["emote-yes"]; if (al && nu) { al.reset().play(); nu.crossFadeTo(al, 0.25, false); } }
    }
    // Turbo: Flammen und Spur
    const turbo = !!z.turbo && g.phase === "fahrt";
    if (turbo && !a.turbo) { g.zaehler.turbo++; if (g.beamer || j === ich) turboTon(t); }
    a.turbo = turbo;
    a.flammen.visible = turbo && Q.partikel > 0.2;
    if (a.flammen.visible) {
      a.flammen.position.copy(_v.setFromMatrixPosition(a.matrix)); a.flammen.quaternion.copy(_q.setFromRotationMatrix(a.matrix));
      a.flammen.children.forEach((f, k) => { const s = 0.75 + Math.random() * 0.6; f.scale.set(s, 0.8 + Math.random() * 0.4, 0.8 + Math.random() * 0.4); f.rotation.x = t * 20 + k; });
    }
    spurSetzen(a, turbo, dt);
  });
  ["lack", "gummi", "dunkel", "chrom", "vorn", "hinten", "kopf", "rumpf", "rad", "glow"].forEach((k) => { g.W3[k].instanceMatrix.needsUpdate = true; });
  g.W3.kopf.visible = g.W3.rumpf.visible = !g.modelleDa;
  g.stangenFunken.geometry.attributes.position.needsUpdate = true; g.stangenFunken.geometry.attributes.color.needsUpdate = true;
  // eigener Wagen: Pfeil und Ring
  const meins = ich >= 0 && g.autos[ich];
  g.pfeil.visible = g.ring.visible = !!meins && g.phase !== "ende";
  if (meins) {
    const p = _v.setFromMatrixPosition(meins.matrix), farbe = meins.farbe;
    g.pfeil.position.set(p.x, 1.25 + Math.sin(t * 4) * 0.06, p.z); g.pfeil.rotation.y = t * 2; g.pfeil.material.color.copy(farbe).multiplyScalar(2.2);
    g.ring.position.set(p.x, 0.02, p.z); const rs = 1 + Math.sin(t * 5) * 0.06; g.ring.scale.set(rs, 1, rs); g.ring.material.color.copy(farbe).multiplyScalar(2.4);
  }
  if (g.mess_) {
    g.mess_.push({ dt, zeige: g.autos.map((a) => [a.zx, a.zy]), roh: g.autos.map((a) => { const z = a.puffer[a.puffer.length - 1]; return z ? [z.x, z.y] : [0, 0]; }) });
    if (g.mess_.length > 4000) g.mess_.shift();
  }
}
let turboTonZuletzt = -9;
function turboTon(t) { if (t - turboTonZuletzt < 0.35) return; turboTonZuletzt = t; klang("schuss"); }
function spurSetzen(a, turbo, dt) {
  if (turbo) a.spurAlt = 0.6; else a.spurAlt = Math.max(0, a.spurAlt - dt);
  if (a.spurAlt <= 0 || STUFE[g.stufe].partikel < 0.3) { a.spur.visible = false; a.spurPkt = []; return; }
  const p = _v.set(-0.38, 0.16, 0).applyMatrix4(a.matrix).clone();
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
  g.wackel = Math.max(g.wackel, 0.35 + wucht * 0.65);
  g.stossZiel = { p: ort.clone(), t };
  [[k.a, -1, k.pa], [k.b, 1, k.pb]].forEach(([j, s, plus]) => {
    const a = g.autos[j];
    if (!a) return;
    a.ruckV.add(V((k.nx || 0) * s, 0, (k.ny || 0) * s).multiplyScalar(1.6 + wucht * 2.2));
    a.wipp = Math.max(a.wipp, 0.08 + wucht * 0.12); a.wippT = t;
    if (plus > 0) {
      plusZeigen(j, plus);
      if (a.fahrer && a.fahrer.aktionen["emote-yes"]) { const em = a.fahrer.aktionen["emote-yes"]; em.reset(); em.setLoop(THREE.LoopOnce); em.clampWhenFinished = true; em.play(); a.jubel = t + 1.1; }
    }
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
  // Lauflichter: Bande in Wellen, Dach als Lauflicht (jedes dritte Bild reicht dem Auge)
  if (g.bilder % 3 === 0) birnenSetzen(t);
  // Strahler drehen langsam ihre Staerke (Kirmes-Licht)
  g.strahler.forEach((l, i) => { l.intensity = 7 + Math.sin(t * 1.3 + i * 1.7) * 3; });
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
    g.sieg.fanfare = true; klang("sieg");
    g.sieg.sieger.forEach((j) => { const a = g.autos[j]; if (a && a.fahrer && a.fahrer.aktionen["emote-yes"]) { const em = a.fahrer.aktionen["emote-yes"]; em.reset(); em.setLoop(THREE.LoopRepeat); em.play(); } });
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
  const cam = g.mess; cam.aspect = g.camera.aspect; cam.fov = g.camera.fov; cam.updateProjectionMatrix();
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
function kameraBewegen(dt, t) {
  const z = zielPose(t), Kp = g.kam, f = wenigBewegung() ? 1 : 1 - Math.exp(-dt * 3.2);
  if (g.kamSprung) { Kp.a = z.a; Kp.e = z.e; Kp.d = z.d; Kp.l.copy(z.l); g.kamSprung = false; }
  Kp.a += wDiff(z.a, Kp.a) * f; Kp.e += (z.e - Kp.e) * f; Kp.d += (z.d - Kp.d) * f; Kp.l.lerp(z.l, f);
  setzeKamera(g.camera, Kp.a, Kp.e, Kp.d, Kp.l);
  g.wackel *= Math.exp(-dt * 5.5);
  if (g.wackel > 0.01 && !wenigBewegung()) {
    const s = g.wackel * 0.07;
    g.camera.position.add(_v.set(Math.sin(t * 61) * s, Math.sin(t * 47 + 1) * s * 0.6, Math.sin(t * 53 + 2) * s));
    g.camera.rotateZ(Math.sin(t * 37) * g.wackel * 0.006);
  }
}

// ---------------------------------------------------------------- Anzeige im Bild
function uiBauen() {
  const ui = document.createElement("div"); ui.className = "as3-ui";
  ui.innerHTML = `<div class="as3-uhr"><b>–</b><small></small></div><div class="as3-platz" hidden></div><div class="as3-rang" hidden></div>
    <div class="as3-namen"></div><div class="as3-plusse"></div><div class="as3-count" hidden></div><div class="as3-sieg" hidden><b></b><small></small></div><div class="as3-blitz"></div>`;
  return { el: ui, uhr: ui.querySelector(".as3-uhr b"), uhrKlein: ui.querySelector(".as3-uhr small"), uhrBox: ui.querySelector(".as3-uhr"), platz: ui.querySelector(".as3-platz"), rang: ui.querySelector(".as3-rang"),
    namen: ui.querySelector(".as3-namen"), plus: ui.querySelector(".as3-plusse"), count: ui.querySelector(".as3-count"), sieg: ui.querySelector(".as3-sieg"),
    siegB: ui.querySelector(".as3-sieg b"), siegS: ui.querySelector(".as3-sieg small"), blitz: ui.querySelector(".as3-blitz"), schilder: [], zeilen: [], sig: {} };
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
      rang.forEach(([j, p], k) => {
        const z = u.zeilen[j];
        z.style.transform = `translateY(${k * 100}%)`; z.style.zIndex = String(100 - k);
        z.style.setProperty("--as3-farbe", o.farben[j % o.farben.length]);
        z.querySelector(".as3-nr").textContent = MEDAILLE[k] && p > 0 ? MEDAILLE[k] : `${k + 1}.`;
        z.querySelector(".as3-nm").textContent = namen[j];
        const b = z.querySelector("b");
        if (b.textContent !== String(p)) { if (b.textContent) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); } b.textContent = String(p); }
      });
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
  g.autos.forEach((a, j) => {
    const s = u.schilder[j], txt = j === ich ? "Du" : kurz(namen[j] || "", g.beamer ? 16 : 8);
    // Groesse nur nach einem Textwechsel messen (sonst rechnet der Browser jedes Bild die Seite neu)
    if (s.dataset.t !== txt || !s._w) { s.dataset.t = txt; s.innerHTML = `<i></i>${esc(txt)}`; s.style.setProperty("--as3-farbe", o.farben[j % o.farben.length]); s.classList.toggle("ich", j === ich); s._w = s.offsetWidth; s._h = s.offsetHeight; }
    _v.setFromMatrixPosition(a.matrix); _v.y += a.podest ? 1.15 : 0.95; _v.project(g.camera);
    const sw = s._w || 40, sh = s._h || 16;
    const x = Math.max(2, Math.min(bw - sw - 2, ((_v.x + 1) / 2) * bw - sw / 2)), y = Math.max(2, Math.min(bh - sh - 2, ((1 - _v.y) / 2) * bh - sh));
    s.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    s.style.opacity = g.phase === "ende" && !a.podest ? "0.35" : "1";
  });
  // aufschwebende Punkte folgen ihrem Wagen
  u.plus.querySelectorAll(".as3-plus").forEach((el) => {
    const a = g.autos[Number(el.dataset.j)];
    if (!a) return;
    _v.setFromMatrixPosition(a.matrix); _v.y += 1.2; _v.project(g.camera);
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
    platz: g.ui && !g.ui.platz.hidden ? g.ui.platz.textContent : "", rang: g.ui && !g.ui.rang.hidden ? g.ui.zeilen.filter((z) => !z.hidden).map((z) => z.textContent) : [] };
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
      font-size:calc(var(--as3-zeile) * .46);font-weight:800;transition:transform .45s cubic-bezier(.3,1.3,.5,1);isolation:isolate}
    .as3-zeile::before{content:"";position:absolute;inset:6% 0;border-radius:99px;background:#140d26;box-shadow:0 0 0 2px var(--as3-farbe);z-index:-1}
    .as3-zeile .as3-nr{width:2.2em;text-align:center;flex:none}.as3-zeile i{width:.8em;height:.8em;border-radius:50%;background:var(--as3-farbe);flex:none}
    .as3-zeile .as3-nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.as3-zeile b{font-size:1.25em;font-variant-numeric:tabular-nums}
    .as3-zeile b.pop{animation:as3-zahl .5s cubic-bezier(.2,1.8,.4,1)}@keyframes as3-zahl{from{transform:scale(1.9);color:#facc15}to{transform:scale(1)}}
    .as3-ui.wand .as3-uhr{left:1vw;top:1.2vh;padding:.5vh 1.2vw;gap:1vw}.as3-ui.wand .as3-uhr b{font-size:2.6vw}.as3-ui.wand .as3-uhr small{font-size:1.4vw}
    .as3-ui.wand .as3-name{font-size:1vw;padding:.1vw .6vw .1vw .25vw;gap:.3vw}.as3-ui.wand .as3-name i{width:.8vw;height:.8vw}
    .as3-ui.wand .as3-plus{font-size:3vw}.as3-ui.wand .as3-count{left:40%;font-size:16vw}.as3-ui.wand .as3-sieg{left:40%;max-width:72%}
    .as3-ui.wand .as3-sieg b{font-size:3vw}.as3-ui.wand .as3-sieg small{font-size:1.5vw}
    .as3-ui [hidden]{display:none!important}
    .as-wand .as3d canvas{width:80%!important}
  </style>`);
}
