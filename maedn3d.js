// Mensch aergere dich nicht in 3D (Partyspiele-Kritik Schritt 2, Nico 08.11.2026: "in 3D, Qualitaetsstufe wie das Partybrett",
// "Kamerafahrten und Animationen: sichtbar, wer dran ist, wer wuerfelt, was gewuerfelt wurde").
// Gleicher Unterbau wie das Partybrett: three.js aus vendor/, Texturen und Himmel aus brett_schmuck.js, Baeume und Steine aus
// modelle.js, Leuchten (Nachbearbeitung) und Qualitaetsstufen wie brett3d.js. Nur die Darstellung - Regeln, Bots und Zustand
// bleiben in maedn.js beim Gastgeber; die Lage der Felder kommt aus maednPunkte (eine Quelle fuer 2D und 3D).
//   Brett     Holzbrett mit bemalter Platte auf einer Insel: Felder, Startfelder, Zielfelder und Haeuser als lackierte Scheiben,
//             Spielfiguren als klassische Kegel (eine Zeichnung fuer alle), Messingrand, Baeume und Blumen ringsum.
//   Ablauf    Jede Aenderung wird zu einem Auftritt in einer Warteschlange: Wurf (3D-Wuerfel fliegt vom Haus des Spielers in die
//             Mitte, rollt aus, die Zahl steht gross im Bild), Zug (Figur huepft Feld fuer Feld), Rauswurf (Stoss, Funken,
//             die geschlagene Figur fliegt in hohem Bogen ins Haus), Ziel (Glitzern), Wechsel (Kamera schwenkt zum naechsten
//             Haus), Sieg (Konfetti, die Figuren des Siegers springen, die Kamera kreist). Kommen Zuege schneller, als sie
//             gezeigt werden (Computer), laeuft die Schlange schneller; ist die Seite versteckt, springt alles auf den Stand.
//   Wer dran  Leuchtring um das Haus des Spielers am Zug, Namensschild mit Farbe oben links, beim Wuerfeln die Zahl gross.
//   Handy     Figur antippen waehlt sie (gleicher Weg wie der Knopf); waehlbare Figuren huepfen, tragen ihre Nummer und zeigen,
//             wo sie landen wuerden (rot: dort wird rausgeworfen).
//   Leistung  Stufen wie beim Partybrett (Pixeldichte, Schatten, Leuchten, Konfetti); faellt die Bildrate, eine Stufe tiefer.
//             ?fps in der Adresse zeigt die Bildrate. Ohne WebGL bleibt das flache Brett (SVG) stehen.
import * as THREE from "./vendor/three.module.js";
import * as SC from "./brett_schmuck.js";
import * as MD from "./modelle.js";
import { LOOKS, lookVon, STUFE, STUFEN, startStufe, wenigBewegung } from "./brett3d.js";
import { spiele as klang } from "./ton.js";
import { esc } from "./hilfe.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lsLesen = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSchreiben = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* privater Modus */ } };
const zufallFest = (k) => { const x = Math.sin(k * 91.7 + 13.1) * 43758.5453; return x - Math.floor(x); };
const sanft = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const kurz = (t, n = 14) => (String(t || "").length > n ? String(t).slice(0, n - 1) + "…" : String(t || ""));

// Zeiten in Sekunden (fuer die Tests auslesbar)
export const MD3_ZEIT = { wurf: 1.05, hopp: 0.17, raus: 0.5, flug: 0.95, landen: 0.18, ziel: 0.35, zahl: 1.6 };
const FELD_OBEN = 0.05;   // Oberkante der Feldscheiben (Brettplatte liegt bei y = 0)

let g = null, generation = 0;

// ---------------------------------------------------------------- Texturen
function leinwand(w, h = w) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
function textur(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
const weich = (() => { let t = null; return () => { if (t) return t; const [c, x] = leinwand(64); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "#fff"); gr.addColorStop(0.35, "#ffffffaa"); gr.addColorStop(1, "#fff0"); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); t = textur(c); return t; }; })();

// Brettplatte: cremefarbener Lack mit Maserung, Laufweg, Farbflaechen der Haeuser, Zielbahnen, Startpfeile, Rosette in der Mitte
function platteMalen(o, RB, k, S) {
  const [c, x] = leinwand(S), P = o.P, n = o.n, L = P.L;
  const px = (sx) => (0.5 + ((sx - 50) * k) / (2 * RB)) * S;
  const pr = (welt) => (welt / (2 * RB)) * S;
  const fr = P.feld * k;
  const grund = x.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S / 2);
  grund.addColorStop(0, "#fbf3df"); grund.addColorStop(0.75, "#f1e2bf"); grund.addColorStop(1, "#dcc394");
  x.fillStyle = grund; x.fillRect(0, 0, S, S);
  // feine Maserung (fest, damit jedes Geraet dasselbe Brett sieht)
  x.lineWidth = Math.max(1, S / 900);
  for (let i = 0; i < 260; i++) {
    const y0 = zufallFest(i) * S, a = (zufallFest(i + 300) - 0.5) * 0.05;
    x.strokeStyle = `rgba(120,80,30,${0.025 + zufallFest(i + 600) * 0.04})`;
    x.beginPath(); x.moveTo(0, y0); x.bezierCurveTo(S * 0.33, y0 + S * a, S * 0.66, y0 - S * a, S, y0 + S * a * 0.5); x.stroke();
  }
  // Zierringe am Rand
  [[0.485, "#9a6b2f", S / 220], [0.468, "#c9a46a", S / 420]].forEach(([r, f, w]) => { x.strokeStyle = f; x.lineWidth = w; x.beginPath(); x.arc(S / 2, S / 2, S * r, 0, 7); x.stroke(); });
  const mitte = (pts) => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
  for (let j = 0; j < n; j++) {
    const f = o.farben[j], haus = P.haus(j), hm = mitte(haus);
    const weit = Math.max(...haus.map((p) => Math.hypot(p[0] - hm[0], p[1] - hm[1]))) * k + fr * 1.45;
    // Hausflaeche: Farbe mit hellem Rand
    x.fillStyle = f; x.globalAlpha = 0.88; x.beginPath(); x.arc(px(hm[0]), px(hm[1]), pr(weit), 0, 7); x.fill(); x.globalAlpha = 1;
    x.lineWidth = pr(fr * 0.16); x.strokeStyle = "#fff8e8"; x.stroke();
    // Zielbahn: breites Band vom Feld vor dem Start bis zum letzten Zielfeld
    const z = P.ziel(j), vor = P.bahn[(o.sitz(j) * 10 - 1 + L) % L];
    x.strokeStyle = f; x.globalAlpha = 0.42; x.lineCap = "round"; x.lineWidth = pr(fr * 2.5);
    x.beginPath(); x.moveTo(px(vor[0]), px(vor[1])); x.lineTo(px(z[3][0]), px(z[3][1])); x.stroke(); x.globalAlpha = 1;
  }
  // Laufweg durch alle Felder
  x.strokeStyle = "#6b4423"; x.lineWidth = pr(fr * 0.34); x.lineJoin = "round"; x.beginPath();
  P.bahn.forEach((p, i) => (i ? x.lineTo(px(p[0]), px(p[1])) : x.moveTo(px(p[0]), px(p[1])))); x.closePath(); x.stroke();
  // Startpfeile in Laufrichtung
  for (let j = 0; j < n; j++) {
    const s0 = P.bahn[o.sitz(j) * 10], s1 = P.bahn[(o.sitz(j) * 10 + 1) % L], a = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]);
    const r = Math.hypot(s0[0] - 50, s0[1] - 50), aussen = [50 + ((s0[0] - 50) * (r + P.feld * 2.4)) / r, 50 + ((s0[1] - 50) * (r + P.feld * 2.4)) / r];
    x.save(); x.translate(px(aussen[0]), px(aussen[1])); x.rotate(a); x.fillStyle = o.farben[j];
    const q = pr(fr * 0.9); x.beginPath(); x.moveTo(q, 0); x.lineTo(-q * 0.6, q * 0.62); x.lineTo(-q * 0.6, -q * 0.62); x.closePath(); x.fill();
    x.lineWidth = q * 0.14; x.strokeStyle = "#fff8e8"; x.stroke(); x.restore();
  }
  // Rosette in der Mitte (hier landet der Wuerfel)
  const rm = pr(n <= 4 ? 2.3 : 4.2), sp = 16;
  x.save(); x.translate(S / 2, S / 2);
  const ros = x.createRadialGradient(0, 0, 0, 0, 0, rm); ros.addColorStop(0, "#fff7e2"); ros.addColorStop(1, "#e6cc96");
  x.fillStyle = ros; x.beginPath();
  for (let i = 0; i <= sp * 2; i++) { const a = (i / (sp * 2)) * Math.PI * 2, r = i % 2 ? rm * 0.72 : rm; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  x.fill(); x.lineWidth = S / 500; x.strokeStyle = "#b8894a"; x.stroke();
  for (let j = 0; j < n; j++) { const a = Math.atan2(P.haus(j)[0][1] - 50, P.haus(j)[0][0] - 50); x.fillStyle = o.farben[j]; x.beginPath(); x.arc(Math.cos(a) * rm * 0.5, Math.sin(a) * rm * 0.5, rm * 0.11, 0, 7); x.fill(); }
  x.restore();
  return textur(c);
}
// Wuerfelseiten: weiss mit runden Ecken und tiefen Augen
export function wuerfelMaterialien(stufe) {   // auch Wuerfelpoker in 3D (wuerfel3d.js)
  const punkte = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]],
    5: [[.26, .26], [.74, .26], [.5, .5], [.26, .74], [.74, .74]], 6: [[.27, .24], [.73, .24], [.27, .5], [.73, .5], [.27, .76], [.73, .76]] };
  // Reihenfolge der Seiten in three.js: +x, -x, +y, -y, +z, -z (Gegenseiten ergeben 7)
  return [1, 6, 2, 5, 3, 4].map((zahl) => {
    const [c, x] = leinwand(256);
    x.fillStyle = "#fffdf6"; x.fillRect(0, 0, 256, 256);
    const gl = x.createRadialGradient(90, 80, 10, 128, 128, 190); gl.addColorStop(0, "#ffffff"); gl.addColorStop(1, "#ece4d2");
    x.fillStyle = gl; x.fillRect(0, 0, 256, 256);
    punkte[zahl].forEach(([u, v]) => {
      const r = zahl === 1 ? 30 : 22, gp = x.createRadialGradient(u * 256 - 5, v * 256 - 5, 2, u * 256, v * 256, r);
      gp.addColorStop(0, zahl === 1 ? "#ff4b6e" : "#3a3d55"); gp.addColorStop(1, zahl === 1 ? "#a3001f" : "#0d0e1a");
      x.fillStyle = gp; x.beginPath(); x.arc(u * 256, v * 256, r, 0, 7); x.fill();
    });
    const t = textur(c);
    return stufe === "niedrig" ? new THREE.MeshStandardMaterial({ map: t, roughness: 0.3 })
      : new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 });
  });
}
// Drehung, die Seite "zahl" nach oben bringt
export const OBEN = { 2:[0, 0, 0], 5: [Math.PI, 0, 0], 1: [0, 0, Math.PI / 2], 6: [0, 0, -Math.PI / 2], 3: [-Math.PI / 2, 0, 0], 4: [Math.PI / 2, 0, 0] };
function nummerTextur(n, farbe) {
  const [c, x] = leinwand(128);
  x.fillStyle = "#ffd23f"; x.beginPath(); x.arc(64, 64, 56, 0, 7); x.fill();
  x.lineWidth = 9; x.strokeStyle = farbe; x.stroke();
  x.font = "900 74px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#1b1c2e"; x.fillText(String(n), 64, 69);
  return textur(c);
}

// ---------------------------------------------------------------- Formen
// Wuerfel mit runden Kanten: Wuerfel mit vielen Teilen, die Ecken auf Kugeln gezogen
export function rundWuerfel(groesse, rund = 0.16, teile = 5) {
  const geo = new THREE.BoxGeometry(1, 1, 1, teile, teile, teile), p = geo.attributes.position, v = V(), innen = V();
  const h = 0.5 - rund;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    innen.set(Math.max(-h, Math.min(h, v.x)), Math.max(-h, Math.min(h, v.y)), Math.max(-h, Math.min(h, v.z)));
    v.sub(innen); if (v.lengthSq() > 0) v.normalize().multiplyScalar(rund);
    v.add(innen).multiplyScalar(groesse); p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
// klassischer Kegel: Fuss, Taille, Kragen, Kugelkopf (Drehkoerper)
function kegelGeo(fr) {
  const pts = [[0, 0], [0.36, 0], [0.372, 0.025], [0.36, 0.06], [0.31, 0.095], [0.235, 0.15], [0.175, 0.27], [0.142, 0.42], [0.13, 0.55], [0.175, 0.585], [0.19, 0.61], [0.165, 0.635], [0.1, 0.665]];
  for (let k = -60; k <= 90; k += 10) { const a = (k * Math.PI) / 180; pts.push([0.175 * Math.cos(a), 0.825 + 0.175 * Math.sin(a)]); }
  pts[pts.length - 1][0] = 0;
  const sR = fr * 2.05, sH = fr * 2.25;
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r * sR, y * sH)), 32);
}

// ---------------------------------------------------------------- Aufbau
function aufbauen(o) {
  const t0 = performance.now();
  const n = o.n, P = o.P, L = P.L, k = n <= 4 ? 0.24 : 0.3, fr = P.feld * k;
  const w = (pt, y = FELD_OBEN) => V((pt[0] - 50) * k, y, (pt[1] - 50) * k);
  let weit = 0;
  for (let j = 0; j < n; j++) P.haus(j).forEach((p) => { weit = Math.max(weit, Math.hypot(p[0] - 50, p[1] - 50)); });
  P.bahn.forEach((p) => { weit = Math.max(weit, Math.hypot(p[0] - 50, p[1] - 50)); });
  const RB = weit * k + fr * 2.6, RI = RB * 1.5 + 2.5;
  const lookName = lookVon(), Lk = LOOKS[lookName] || LOOKS.normal;
  const st = startStufe(!!o.beamer), Q = STUFE[st.stufe];
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "default" });
  renderer.setPixelRatio(Math.min(Q.pr, window.devicePixelRatio || 1));
  renderer.info.autoReset = false;   // Zeichnungen je ganzem Bild zaehlen (mit Leuchten sind es mehrere Durchgaenge)
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = Lk.belichtung;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(Lk.nebel, RI * 2.2, RI * 5);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, RI * 12), mess = camera.clone();
  const hemi = new THREE.HemisphereLight(...Lk.hemi); scene.add(hemi);
  const sonne = new THREE.DirectionalLight(Lk.licht[0], Lk.licht[1]);
  sonne.position.copy(V(...Lk.lichtPos).normalize().multiplyScalar(RB * 2.6));
  sonne.castShadow = Q.schatten > 0; sonne.shadow.mapSize.set(Q.schatten || 1024, Q.schatten || 1024);
  const sc = sonne.shadow.camera; sc.left = sc.bottom = -RB * 1.25; sc.right = sc.top = RB * 1.25; sc.near = 1; sc.far = RB * 6; sc.updateProjectionMatrix();
  sonne.shadow.bias = -0.0005; sonne.shadow.normalBias = 0.02;
  scene.add(sonne, sonne.target);
  // ein warmes Licht ueber dem Brett (nur ab "mittel"): Glanz auf Lack und Figuren
  const glanz = new THREE.PointLight(0xffe2b8, 18, RB * 3, 1.6); glanz.position.set(-RB * 0.4, RB * 0.9, RB * 0.5); scene.add(glanz);

  // ---- Insel wie beim Partybrett: Grasdecke, Strand, Wasser
  const insel = new THREE.Mesh(new THREE.CylinderGeometry(RI, RI - 1, 1, 96, 1), [SC.felsMaterial(Lk.erde, 3), SC.bodenMaterial(Lk, RI), SC.felsMaterial(Lk.erde, 3)]);
  { const p = insel.geometry.attributes.position, uv = insel.geometry.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * RI) + 0.5, p.getZ(i) / (2 * RI) + 0.5); }
  insel.position.y = -0.62; insel.receiveShadow = true; scene.add(insel);
  const ufer = new THREE.Mesh(new THREE.CylinderGeometry(RI - 0.05, RI + 2.1, 2.2, 96, 1, true), Lk.lava ? SC.felsMaterial(0x3a2a26, 8) : SC.sandMaterial());
  ufer.position.y = -1.22; ufer.receiveShadow = true; scene.add(ufer);
  const wasserMat = SC.wasserMaterial(Lk.wasser, RI * 6);
  const wasser = new THREE.Mesh(new THREE.CircleGeometry(RI * 6, 64), wasserMat); wasser.rotation.x = -Math.PI / 2; wasser.position.y = -2.2; scene.add(wasser);
  const fels = new THREE.Mesh(new THREE.CylinderGeometry(RI - 1.3, RI * 0.59, 3.4, 40, 3), SC.felsMaterial(Lk.erde, 6)); fels.position.y = -2.82; scene.add(fels);

  // ---- Brett: Holzkoerper, bemalte Platte, Messingrand
  const S = Q.leuchten ? 2048 : 1024;
  const brettGeo = new THREE.CylinderGeometry(RB, RB * 1.015, 0.36, 128, 1);
  { const p = brettGeo.attributes.position, nr = brettGeo.attributes.normal, uv = brettGeo.attributes.uv; for (let i = 0; i < p.count; i++) if (nr.getY(i) > 0.5) uv.setXY(i, p.getX(i) / (2 * RB) + 0.5, 0.5 - p.getZ(i) / (2 * RB)); }
  const holz = SC.holzMaterial(0x7a4a26);
  const platte = new THREE.MeshPhysicalMaterial({ map: platteMalen(o, RB, k, S), roughness: 0.5, clearcoat: Q.leuchten ? 0.6 : 0, clearcoatRoughness: 0.25 });
  const brett = new THREE.Mesh(brettGeo, [holz, platte, holz]); brett.position.y = -0.18; brett.receiveShadow = true; brett.castShadow = true; scene.add(brett);
  const messing = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.85, roughness: 0.28 });
  const rand = new THREE.Mesh(new THREE.TorusGeometry(RB, 0.08, 10, 180), messing); rand.rotation.x = Math.PI / 2; rand.position.y = 0.0; scene.add(rand);

  // ---- Felder: lackierte Scheiben (eine Zeichnung), dunkle Fassung darum (eine Zeichnung)
  const feldGeo = new THREE.CylinderGeometry(fr, fr * 1.05, 0.1, 32);
  const feldMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0 });
  const fassGeo = new THREE.TorusGeometry(fr * 1.02, fr * 0.1, 8, 32); fassGeo.rotateX(Math.PI / 2);
  const fassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
  const felder = [], fassungen = [];
  const hell = (f, a) => new THREE.Color(f).lerp(new THREE.Color(0xffffff), a).getHex();
  const dunkel = (f, a) => new THREE.Color(f).lerp(new THREE.Color(0x1a1006), a).getHex();
  const startVon = {}; for (let j = 0; j < n; j++) startVon[o.sitz(j) * 10] = j;
  P.bahn.forEach((p, i) => { const j = startVon[i]; felder.push({ p: w(p, FELD_OBEN - 0.05), farbe: j !== undefined ? o.farben[j] : 0xf7f1e3, s: 1 }); fassungen.push({ p: w(p, 0.01), farbe: j !== undefined ? dunkel(o.farben[j], 0.35) : 0x4a2f17, s: 1 }); });
  for (let j = 0; j < n; j++) {
    P.ziel(j).forEach((p) => { felder.push({ p: w(p, FELD_OBEN - 0.05), farbe: hell(o.farben[j], 0.28), s: 1 }); fassungen.push({ p: w(p, 0.01), farbe: dunkel(o.farben[j], 0.4), s: 1 }); });
    P.haus(j).forEach((p) => { felder.push({ p: w(p, FELD_OBEN - 0.05), farbe: dunkel(o.farben[j], 0.25), s: 0.88 }); fassungen.push({ p: w(p, 0.01), farbe: hell(o.farben[j], 0.55), s: 0.88 }); });
  }
  const viele = (geo, mat, liste) => {
    const im = new THREE.InstancedMesh(geo, mat, liste.length), m = new THREE.Matrix4(), q = new THREE.Quaternion();
    liste.forEach((x, i) => { im.setMatrixAt(i, m.compose(x.p, q, V(x.s, 1, x.s))); im.setColorAt(i, new THREE.Color(x.farbe)); });
    im.receiveShadow = true; im.castShadow = false; scene.add(im); return im;
  };
  viele(feldGeo, feldMat, felder); viele(fassGeo, fassMat, fassungen);

  // ---- Figuren: alle Kegel in einer Zeichnung (Farbe je Figur)
  const kgeo = kegelGeo(fr);
  const kmat = st.stufe === "niedrig" ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    : new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, emissive: 0x000000 });
  const kegel = new THREE.InstancedMesh(kgeo, kmat, n * 4);
  kegel.castShadow = true; kegel.receiveShadow = true; kegel.frustumCulled = false;
  for (let i = 0; i < n * 4; i++) kegel.setColorAt(i, new THREE.Color(o.farben[Math.floor(i / 4)]));
  scene.add(kegel);

  // ---- Marker: Leuchtring ums Haus am Zug, Wahl-Ringe, Ziel-Vorschau, Nummern
  const leucht = (farbe, staerke) => new THREE.MeshStandardMaterial({ color: farbe, emissive: farbe, emissiveIntensity: staerke, roughness: 0.4 });
  const dranRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 10, 72), leucht(0xffffff, 2.2)); dranRing.rotation.x = Math.PI / 2; scene.add(dranRing);
  const dranSchein = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ map: weich(), color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  dranSchein.rotation.x = -Math.PI / 2; scene.add(dranSchein);
  const ringGeo = new THREE.TorusGeometry(fr * 0.98, fr * 0.11, 8, 36); ringGeo.rotateX(Math.PI / 2);
  const geistMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, emissive: 0xffffff, emissiveIntensity: 0.4 });
  const wahl = Array.from({ length: 4 }, () => {
    const ring = new THREE.Mesh(ringGeo, leucht(0xffd23f, 2.4)), ziel = new THREE.Mesh(ringGeo, leucht(0xffd23f, 2.0));
    const geist = new THREE.Mesh(kgeo, geistMat.clone()), nr = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    nr.scale.set(fr * 1.5, fr * 1.5, 1); nr.renderOrder = 5;
    [ring, ziel, geist, nr].forEach((x) => { x.visible = false; scene.add(x); });
    return { ring, ziel, geist, nr, key: "" };
  });

  // ---- Wuerfel
  const dS = RB * 0.11;
  const wuerfel = new THREE.Mesh(rundWuerfel(dS), wuerfelMaterialien(st.stufe)); wuerfel.castShadow = true; wuerfel.visible = false; scene.add(wuerfel);

  // ---- Effekte: Stosswelle, Funken, Konfetti
  const welle = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  welle.rotation.x = -Math.PI / 2; welle.visible = false; scene.add(welle);
  const FUNKEN = 90;
  const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FUNKEN * 3), 3));
  const funkenMat = new THREE.PointsMaterial({ size: fr * 0.7, map: weich(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff });
  const funken = new THREE.Points(fgeo, funkenMat); funken.visible = false; funken.frustumCulled = false; scene.add(funken);
  const KONFETTI = 180;
  const konfetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(fr * 0.32, fr * 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.6, emissive: 0x222222 }), KONFETTI);
  konfetti.visible = false; konfetti.frustumCulled = false;
  const konfDaten = Array.from({ length: KONFETTI }, (_, i) => ({ p: V(), v: V(), r: V(zufallFest(i) * 6, zufallFest(i + 9) * 6, 0), dr: V(2 + zufallFest(i + 3) * 5, 1 + zufallFest(i + 5) * 4, 0) }));
  for (let i = 0; i < KONFETTI; i++) konfetti.setColorAt(i, new THREE.Color(o.farben[i % n]).lerp(new THREE.Color(0xffd23f), i % 3 === 0 ? 0.6 : 0));
  scene.add(konfetti);

  g = { renderer, scene, camera, mess, sonne, glanz, hemi, n, P, L, k, fr, RB, RI, w, o, look: lookName, beamer: !!o.beamer, kegel, wahl, wuerfel, dS, dranRing, dranSchein,
    welle, funken, funkenDaten: [], konfetti, konfDaten, fliess: [...(wasserMat.userData.fliess || [])], stufe: st.stufe, stufeFest: st.fest, mess_dt: [], bilder: 0,
    uhr: new THREE.Clock(), zeige: null, stand: null, schlange: [], akt: null, ueber: {}, dranZeige: 0, sieg: null, wurfZahl: null, wurfRuhe: null, wuerfelWeg: 0,
    kam: { a: Math.PI / 2, e: 1.1, d: RB * 3, l: V() }, kamZiel: null, stoss: null, wackelBis: 0, passCache: {}, ui: null, zaehler: { wurf: 0, hopp: 0, rauswurf: 0, ziel: 0, sieg: 0, dran: 0 },
    folgen: lsLesen("pa_md_kamera") !== "uebersicht" && !wenigBewegung(), laeuft: false, container: null, wahlListe: [] };
  SC.himmelSetzen(g, Lk.himmel || "tag");
  // Baeume, Buesche, Blumen und Steine ringsum (Modelle wie beim Partybrett); fehlen sie, bleibt die Wiese frei
  const dieseSzene = g, nacht = lookName === "halloween";
  MD.vorladen(nacht ? "halloween" : "insel", 0).then((da) => {
    if (!da || g !== dieseSzene) return;
    const orte = (anzahl, rMin, rMax, saat) => Array.from({ length: anzahl }, (_, i) => {
      const a = i * 2.399 + saat, r = rMin + zufallFest(i * 7 + saat * 13) * (rMax - rMin);
      return { p: V(Math.cos(a) * r, -0.12, Math.sin(a) * r), s: 0.8 + zufallFest(i + saat * 31) * 0.45, ry: zufallFest(i + 77) * 6.28 };
    });
    const setze = (namen, liste, hoehe) => namen.forEach((nm, q) => {
      if (!MD.hat(nm)) return;
      MD.vieleStuecke(nm, liste.filter((_, i) => i % namen.length === q), { hoehe, schatten: hoehe > 1 }).forEach((im) => scene.add(im));
    });
    const innen = RB + 0.9, aussen = RI - 0.7;
    if (nacht) {
      setze(["kahl1", "kahl2", "tanne1"], orte(16, RB + 2.4, aussen, 1), 2.6);
      setze(["grab1", "grab2", "grab3", "grab4"], orte(12, innen, RB + 2.6, 2), 0.85);
      setze(["kuerbis1", "kuerbis2"], orte(10, innen, RB + 1.8, 3), 0.7);
      setze(["stein1", "stein2", "pilz1", "pilz2"], orte(14, innen, aussen, 4), 0.55);
    } else {
      setze(["tanne1", "tanne2", "tanne3", "laub1", "laub2", "laub3"], orte(22, RB + 2.6, aussen, 1), 2.8);
      setze(["busch1", "busch2"], orte(16, innen, RB + 3, 2), 0.8);
      setze(["blume1", "blume2", "blume3", "gras1"], orte(40, innen, aussen, 3), 0.4);
      setze(["stein1", "stein2", "stein3"], orte(10, innen, aussen, 4), 0.7);
    }
    g.modelleDa = true;
  }).catch((e) => console.warn("Modelle fuer Mensch aergere dich nicht fehlen", e));
  MD.nachbearbeitungModule().then((N) => {
    if (!N || g !== dieseSzene) return;
    const ziel = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    const c = new N.EffectComposer(renderer, ziel);
    c.addPass(new N.RenderPass(scene, camera));
    c.addPass(new N.UnrealBloomPass(new THREE.Vector2(256, 256), 0.36, 0.5, 1.15));
    c.addPass(new N.OutputPass());
    g.composer = c; groesseAnwenden();
  }).catch((e) => console.warn("Nachbearbeitung aus", e));
  tippBinden(renderer.domElement);
  qualitaetAnwenden();
  g.aufbauMs = Math.round(performance.now() - t0);
}

function qualitaetAnwenden() {
  const Q = STUFE[g.stufe];
  g.renderer.setPixelRatio(Math.min(Q.pr, window.devicePixelRatio || 1));
  groesseAnwenden();
  g.sonne.castShadow = Q.schatten > 0;
  g.glanz.visible = Q.lichter > 0;
  g.konfetti.count = Math.round(g.konfDaten.length * Math.max(0.35, Q.partikel));
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

// ---------------------------------------------------------------- Lage der Figuren
function posVon(j, rel, f) {
  const P = g.P;
  if (rel === -1) return g.w(P.haus(j)[f]);
  if (rel >= g.L) return g.w(P.ziel(j)[Math.min(3, rel - g.L)]);
  return g.w(P.bahn[g.o.abs(j, rel)]);
}
const mitteVon = (pts) => pts.reduce((a, p) => a.add(g.w(p, 0)), V()).multiplyScalar(1 / pts.length);
function hausMitte(j) { return mitteVon(g.P.haus(j)); }
function sitzWinkel(j) { const m = hausMitte(j); return Math.atan2(m.z, m.x); }

// ---------------------------------------------------------------- Kamera
// Passt das ganze Brett ins Bild? Bildrand in -1..1 (oben etwas Platz fuer das Namensschild)
function randPunkte() {
  if (g.randPkt) return g.randPkt;
  const r = [];
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; r.push(V(Math.cos(a) * g.RB, 0, Math.sin(a) * g.RB), V(Math.cos(a) * g.RB, -0.36, Math.sin(a) * g.RB)); }
  return (g.randPkt = r);
}
function randWert(cam, oben = 0.8) {
  let m = 0;
  const v = V();
  for (const p of randPunkte()) {
    v.copy(p).project(cam);
    m = Math.max(m, Math.abs(v.x) / 0.95, v.y > 0 ? v.y / oben : -v.y / 0.95);
  }
  return m;
}
function setzeKamera(cam, a, e, d, l) {
  cam.position.set(l.x + Math.cos(a) * Math.cos(e) * d, l.y + Math.sin(e) * d, l.z + Math.sin(a) * Math.cos(e) * d);
  cam.lookAt(l);
}
function passend(a, e, l) {
  const key = `${a.toFixed(3)}|${e}|${l.x.toFixed(2)},${l.z.toFixed(2)}|${g.camera.aspect.toFixed(3)}`;
  if (g.passCache[key]) return g.passCache[key];
  const cam = g.mess; cam.aspect = g.camera.aspect; cam.fov = g.camera.fov; cam.updateProjectionMatrix();
  let lo = g.RB * 0.8, hi = g.RB * 12;
  for (let i = 0; i < 22; i++) { const d = (lo + hi) / 2; setzeKamera(cam, a, e, d, l); cam.updateMatrixWorld(); if (randWert(cam) > 1) lo = d; else hi = d; }
  return (g.passCache[key] = hi);
}
// Nahansicht: nur am Handy (nicht Beamer), 8er-Brett, ich bin am Zug, kein Sieg. Im Bild bleiben: das eigene Haus, alle eigenen
// Figuren, die Ziele der waehlbaren Zuege und die Figur, die gerade huepft - mit Rand. Nie weiter weg als das ganze Brett.
export const MD3_NAH = { rand: 0.78, minD: 0.55 };
function nahePunkte() {
  const ich = g.o.ich, pts = g.P.haus(ich).map((p) => g.w(p, 0));
  for (let f = 0; f < 4; f++) pts.push(posVon(ich, g.zeige[ich][f], f));
  g.wahlListe.forEach((x) => pts.push(posVon(ich, x.nach, x.f)));
  if (g.akt && g.akt.art === "zug" && g.akt.j === ich && g.akt.pts) pts.push(g.akt.pts[g.akt.pts.length - 1]);
  return pts;
}
function naheEigene(a) {
  const ich = g.o.ich;
  if (g.beamer || g.n <= 4 || ich < 0 || ich >= g.n || g.dranZeige !== ich || g.sieg !== null) return null;
  const pts = nahePunkte(), l = pts.reduce((s, p) => s.add(p), V()).multiplyScalar(1 / pts.length).setY(0);
  const e = 0.98, voll = passend(a, e, V());
  const key = `nah|${a.toFixed(3)}|${pts.map((p) => p.x.toFixed(1) + "," + p.z.toFixed(1)).join(";")}|${g.camera.aspect.toFixed(3)}`;
  let d = g.passCache[key];
  if (d === undefined) {
    const cam = g.mess; cam.aspect = g.camera.aspect; cam.fov = g.camera.fov; cam.updateProjectionMatrix();
    const v = V(), passt = () => pts.every((p) => { v.copy(p).setY(FELD_OBEN + g.fr).project(cam); return Math.abs(v.x) < MD3_NAH.rand && Math.abs(v.y) < MD3_NAH.rand * 0.9 && v.z < 1; });
    let lo = g.RB * 0.3, hi = voll;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; setzeKamera(cam, a, e, m, l); cam.updateMatrixWorld(); if (passt()) hi = m; else lo = m; }
    d = g.passCache[key] = Math.max(hi, voll * MD3_NAH.minD);
  }
  if (d >= voll * 0.97) return null;   // die Figuren stehen ohnehin ueberall: ganzes Brett
  return { a, e, d, l, nah: true };
}
function zielPose(t) {
  const e0 = g.beamer ? 0.8 : 0.86;
  if (g.sieg !== null && !wenigBewegung()) {
    const l = V(), e = 0.86;
    g.siegA = (g.siegA === undefined ? g.kam.a : g.siegA) + (g.dtLetzt || 0) * 0.32;
    return { a: g.siegA, e, d: passend(0, e, l) * 0.98, l };
  }
  if (!g.folgen) { const l = V(), a = g.beamer ? Math.PI / 2 : g.o.ich >= 0 && g.o.ich < g.n ? sitzWinkel(g.o.ich) : Math.PI / 2, e = 1.15; return { a, e, d: passend(a, e, l), l }; }
  const a = sitzWinkel(g.dranZeige), dir = V(Math.cos(a), 0, Math.sin(a));
  // 8er-Brett am Handy, selbst am Zug: naeher an die eigenen Figuren (Abnahme Schritt 2, Nico 08.11.2026 "Figuren zu klein")
  const nah = naheEigene(a);
  if (nah) return nah;
  const l = dir.clone().multiplyScalar(g.RB * 0.1);
  const pose = { a, e: e0, d: passend(a, e0, l), l };
  // beim Ziehen und Rauswerfen ein wenig mitgehen (ohne das Brett aus dem Bild zu verlieren)
  if (g.folgePunkt) pose.l = pose.l.clone().lerp(g.folgePunkt.clone().setY(0), 0.14);
  if (g.stoss && g.stoss.bis > t) { pose.l = pose.l.clone().lerp(g.stoss.p.clone().setY(0), 0.3); pose.d *= 0.86; }
  return pose;
}
function kameraBewegen(dt, t) {
  const z = zielPose(t), K = g.kam, f = wenigBewegung() ? 1 : 1 - Math.exp(-dt * 2.8);
  if (g.kamSprung) { K.a = z.a; K.e = z.e; K.d = z.d; K.l.copy(z.l); g.kamSprung = false; }
  K.a += Math.atan2(Math.sin(z.a - K.a), Math.cos(z.a - K.a)) * f;
  K.e += (z.e - K.e) * f; K.d += (z.d - K.d) * f; K.l.lerp(z.l, f);
  setzeKamera(g.camera, K.a, K.e, K.d, K.l);
  if (g.wackelBis > t && !wenigBewegung()) { const s = Math.min(1, (g.wackelBis - t) * 2.4) * g.fr * 0.45; g.camera.position.add(V((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s)); }
}

// ---------------------------------------------------------------- Ablauf (Warteschlange der Auftritte)
function schnappen(stand) {
  g.schlange = []; g.akt = null; g.ueber = {}; g.folgePunkt = null;
  g.zeige = stand.fig.map((r) => r.slice());
  g.dranZeige = stand.phase === "ende" && stand.sieger !== null ? stand.sieger : stand.dran;
  g.sieg = stand.phase === "ende" ? stand.sieger : null;
  g.konfetti.visible = g.sieg !== null; if (g.sieg !== null) konfettiStart();
}
function einreihen(alt, neu) {
  if (!alt || !g.zeige || alt.n !== neu.n) { schnappen(neu); g.kamSprung = true; return; }
  if (alt.phase === "ende" && neu.phase !== "ende") { schnappen(neu); return; }   // neue Runde
  const l = neu.letzt;
  if ((neu.wuerfe || 0) > (alt.wuerfe || 0)) {
    const j = l ? l.j : neu.dran, zahl = l ? l.w : neu.wurf;
    if (zahl) g.schlange.push({ art: "wurf", j, zahl, nichts: !!(l && l.nichts), versuch: neu.versuche });
  }
  let bewegt = false;
  if (l && !l.nichts && neu.fig[l.j] && neu.fig[l.j][l.f] === l.nach && alt.fig[l.j] && alt.fig[l.j][l.f] !== l.nach) {
    const opfer = [];
    for (let j = 0; j < neu.n; j++) for (let f = 0; f < 4; f++) if (j !== l.j && alt.fig[j][f] >= 0 && neu.fig[j][f] === -1) opfer.push([j, f]);
    g.schlange.push({ art: "zug", j: l.j, f: l.f, nach: l.nach, opfer });
    bewegt = true;
  }
  // sonst etwas anders (Nachzuegler, Neustart): am Ende auf den Stand springen
  const rest = neu.fig.some((r, j) => r.some((x, f) => x !== alt.fig[j][f] && !(bewegt && ((j === l.j && f === l.f) || (x === -1 && alt.fig[j][f] >= 0)))));
  if (rest) g.schlange.push({ art: "stand", fig: neu.fig.map((r) => r.slice()) });
  if (neu.phase === "ende" && alt.phase !== "ende") g.schlange.push({ art: "sieg", j: neu.sieger });
  else if (neu.dran !== alt.dran) g.schlange.push({ art: "dran", j: neu.dran });
}
// Dauer eines Auftritts (Sekunden)
function dauerVon(x) {
  const Z = MD3_ZEIT;
  if (x.art === "wurf") return Z.wurf;
  if (x.art === "zug") return x.hops * x.seg + Z.landen + (x.opfer.length ? Z.flug : 0) + (x.ziel ? Z.ziel : 0);
  return 0;
}
function auftrittStart(x, t) {
  x.t = 0;
  if (x.art === "wurf") {
    const a = sitzWinkel(x.j);
    x.von = V(Math.cos(a) * g.RB * 0.62, g.dS * 5, Math.sin(a) * g.RB * 0.62);
    x.nach = V((zufallFest(t) - 0.5) * g.dS * 1.2, g.dS / 2, (zufallFest(t + 1) - 0.5) * g.dS * 1.2);
    x.qEnd = new THREE.Quaternion().setFromEuler(new THREE.Euler(...OBEN[x.zahl])).premultiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), zufallFest(t + 2) * Math.PI * 2));
    x.achse = V(zufallFest(t + 3) - 0.5, zufallFest(t + 4) - 0.5, zufallFest(t + 5) - 0.5).normalize();
    g.wuerfel.visible = true; g.wuerfel.scale.setScalar(1); g.wuerfelWeg = 0; g.wurfZahl = null;
    g.dranZeige = x.j; klang("wuerfel");
  } else if (x.art === "zug") {
    const von = g.zeige[x.j][x.f];
    x.pts = [posVon(x.j, von, x.f)];
    if (von === -1) x.pts.push(posVon(x.j, 0, x.f));
    else for (let r = von + 1; r <= x.nach; r++) x.pts.push(posVon(x.j, r, x.f));
    x.hops = x.pts.length - 1; x.seg = von === -1 ? MD3_ZEIT.raus : MD3_ZEIT.hopp; x.hoch = von === -1 ? g.fr * 3.2 : g.fr * 1.15;
    x.ziel = x.nach >= g.L && von < g.L; x.gelandet = false; x.letzterHopp = 0;
    x.opferStart = x.opfer.map(([j, f]) => posVon(j, g.zeige[j][f], f));
    x.opferHaus = x.opfer.map(([j, f]) => posVon(j, -1, f));
    g.dranZeige = x.j;
  }
  x.dauer = dauerVon(x);
}
function auftrittTakt(x, dt, t) {
  x.t += dt;
  if (x.art === "wurf") {
    const u = Math.min(1, x.t / x.dauer), d = g.wuerfel;
    // Flug mit zwei kleinen Huepfern, die Drehung laeuft gegen Ende aus
    const h = u < 0.55 ? (1 - Math.pow(u / 0.55, 2)) * (x.von.y - x.nach.y) : u < 0.8 ? Math.sin(((u - 0.55) / 0.25) * Math.PI) * g.dS * 0.7 : u < 0.93 ? Math.sin(((u - 0.8) / 0.13) * Math.PI) * g.dS * 0.18 : 0;
    d.position.lerpVectors(x.von, x.nach, sanft(Math.min(1, u / 0.85))); d.position.y = x.nach.y + h;
    const rest = Math.pow(1 - Math.min(1, u / 0.93), 2);
    d.quaternion.copy(x.qEnd).multiply(new THREE.Quaternion().setFromAxisAngle(x.achse, rest * Math.PI * 5));
    if (u >= 1 && !x.fertig) { x.fertig = true; g.wurfZahl = { j: x.j, zahl: x.zahl, nichts: x.nichts, versuch: x.versuch, seit: t }; g.zaehler.wurf++; funkenAn(x.nach, g.o.farben[x.j], 0.5); }
  } else if (x.art === "zug") {
    const hz = x.hops * x.seg, i = g.j4(x.j, x.f);
    if (x.t < hz) {
      const s = Math.min(x.hops - 1, Math.floor(x.t / x.seg)), uu = (x.t - s * x.seg) / x.seg;
      if (s + 1 > x.letzterHopp) { if (x.letzterHopp > 0) klang("schritt"); x.letzterHopp = s + 1; g.zaehler.hopp++; }
      const p = x.pts[s].clone().lerp(x.pts[s + 1], sanft(uu));
      const quetsch = uu < 0.12 ? (0.12 - uu) * 2.2 : uu > 0.88 ? (uu - 0.88) * 2.2 : 0;
      g.ueber[i] = { p, hoch: Math.sin(uu * Math.PI) * x.hoch, quetsch };
      g.folgePunkt = p;
    } else {
      const lu = Math.min(1, (x.t - hz) / MD3_ZEIT.landen);
      g.ueber[i] = { p: x.pts[x.hops].clone(), hoch: 0, quetsch: Math.sin(lu * Math.PI) * 0.22 };
      if (!x.gelandet) {
        x.gelandet = true; klang("schritt");
        const ort = x.pts[x.hops];
        if (x.opfer.length) {
          klang("aua"); g.zaehler.rauswurf++;
          g.knall = { text: `💥 ${x.opfer.map(([j]) => kurz((g.o.namen || [])[j] || "")).join(" & ")} fliegt raus!`, farbe: g.o.farben[x.opfer[0][0]], seit: t };
          welleAn(ort, 0xffffff); x.opfer.forEach(([j]) => funkenAn(ort, g.o.farben[j], 1));
          g.wackelBis = t + 0.45; g.stoss = { p: ort.clone(), bis: t + 1.3 };
        }
        if (x.ziel) {
          klang("ziel"); g.zaehler.ziel++;
          if (!x.opfer.length) g.knall = { text: `🏁 ${g.zeige[x.j].filter((r) => r >= g.L).length + 1} von 4 im Ziel!`, farbe: g.o.farben[x.j], seit: t };
          funkenAn(ort, 0xffd23f, 0.9); welleAn(ort, 0xffd23f);
        }
      }
      // Rauswurf: die geschlagene Figur fliegt in hohem Bogen und kreiselnd zurueck ins Haus
      const fu = Math.min(1, (x.t - hz - MD3_ZEIT.landen * 0.3) / MD3_ZEIT.flug);
      x.opfer.forEach(([j, f], k) => {
        if (fu <= 0) return;
        const p = x.opferStart[k].clone().lerp(x.opferHaus[k], sanft(fu));
        g.ueber[g.j4(j, f)] = { p, hoch: Math.sin(fu * Math.PI) * g.RB * 0.38, kipp: fu < 1 ? fu * Math.PI * 4 : 0, dreh: fu * Math.PI * 3, quetsch: 0 };
      });
    }
  }
}
function auftrittEnde(x, t) {
  if (x.art === "zug") {
    g.zeige[x.j][x.f] = x.nach;
    delete g.ueber[g.j4(x.j, x.f)];
    x.opfer.forEach(([j, f]) => { g.zeige[j][f] = -1; delete g.ueber[g.j4(j, f)]; funkenAn(posVon(j, -1, f), g.o.farben[j], 0.4); });
    g.folgePunkt = null;
  } else if (x.art === "stand") { g.zeige = x.fig.map((r) => r.slice()); g.ueber = {}; }
  else if (x.art === "dran") {
    g.dranZeige = x.j; g.zaehler.dran++; g.wuerfelWeg = t;
    if (g.beamer || x.j === g.o.ich) klang("dran");
  } else if (x.art === "sieg") {
    g.sieg = x.j; g.dranZeige = x.j; g.siegA = undefined; g.zaehler.sieg++; g.wuerfelWeg = t; klang("sieg"); konfettiStart();
  }
}
function ablauf(dt, t) {
  if (document.hidden && g.schlange.length) { while (g.schlange.length || g.akt) { const x = g.akt || g.schlange.shift(); if (!g.akt) auftrittStart(x, t); g.akt = null; auftrittTakt(x, 99, t); auftrittEnde(x, t); } return; }
  // Computer ziehen schneller, als gezeigt wird: dann zuegig aufholen
  const eile = g.schlange.length >= 4 ? 3.2 : g.schlange.length >= 2 ? 1.8 : 1;
  for (let schutz = 0; schutz < 8; schutz++) {
    if (!g.akt) { if (!g.schlange.length) return; g.akt = g.schlange.shift(); auftrittStart(g.akt, t); }
    auftrittTakt(g.akt, dt * eile, t);
    if (g.akt.t < g.akt.dauer) return;
    auftrittEnde(g.akt, t); g.akt = null; dt = 0;
  }
}

// ---------------------------------------------------------------- Effekte
function funkenAn(ort, farbe, menge = 1) {
  const anzahl = Math.round(90 * Math.min(1, menge) * Math.max(0.4, STUFE[g.stufe].partikel));
  g.funkenDaten = Array.from({ length: anzahl }, (_, i) => {
    const a = Math.random() * Math.PI * 2, s = (0.6 + Math.random()) * g.fr * 4;
    return { p: ort.clone().add(V(0, g.fr * 0.8, 0)), v: V(Math.cos(a) * s, (1.2 + Math.random() * 1.6) * g.fr * 5, Math.sin(a) * s), t: 0, i };
  });
  g.funken.material.color.set(farbe); g.funken.visible = true; g.funkenT = 0;
}
function welleAn(ort, farbe) { g.welle.position.copy(ort).setY(0.08); g.welle.material.color.set(farbe); g.welle.visible = true; g.welleT = 0; }
function konfettiStart() {
  g.konfetti.visible = true;
  g.konfDaten.forEach((x, i) => { x.p.set((zufallFest(i + 40) - 0.5) * g.RB * 2, g.RB * (0.6 + zufallFest(i + 50) * 1.2), (zufallFest(i + 60) - 0.5) * g.RB * 2); x.v.set(0, -(0.8 + zufallFest(i + 70)) * g.fr * 3, 0); });
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = V();
function effekte(dt, t) {
  if (g.funken.visible) {
    g.funkenT += dt;
    const pos = g.funken.geometry.attributes.position;
    for (let i = 0; i < 90; i++) {
      const x = g.funkenDaten[i];
      if (!x) { pos.setXYZ(i, 0, -99, 0); continue; }
      x.v.y -= dt * g.fr * 18; x.p.addScaledVector(x.v, dt);
      pos.setXYZ(i, x.p.x, Math.max(0.05, x.p.y), x.p.z);
    }
    pos.needsUpdate = true; g.funken.material.opacity = Math.max(0, 1 - g.funkenT / 1.1);
    if (g.funkenT > 1.1) g.funken.visible = false;
  }
  if (g.welle.visible) {
    g.welleT += dt; const u = g.welleT / 0.6, s = g.fr * (1 + u * 6);
    g.welle.scale.set(s, s, s); g.welle.material.opacity = Math.max(0, 0.9 * (1 - u));
    if (u >= 1) g.welle.visible = false;
  }
  if (g.konfetti.visible) {
    for (let i = 0; i < g.konfetti.count; i++) {
      const x = g.konfDaten[i];
      x.p.addScaledVector(x.v, dt); x.p.x += Math.sin(t * 2 + i) * dt * g.fr; x.r.addScaledVector(x.dr, dt);
      if (x.p.y < 0.05) { x.p.y = g.RB * (0.9 + zufallFest(i + t) * 0.6); }
      _q.setFromEuler(_e.set(x.r.x, x.r.y, 0)); g.konfetti.setMatrixAt(i, _m.compose(x.p, _q, _s.set(1, 1, 1)));
    }
    g.konfetti.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- Figuren und Marker je Bild
function figurenSetzen(t) {
  const n = g.n;
  for (let j = 0; j < n; j++) for (let f = 0; f < 4; f++) {
    const i = j * 4 + f, u = g.ueber[i];
    const p = u ? u.p.clone() : posVon(j, g.zeige[j][f], f);
    let hoch = u ? u.hoch : 0, quetsch = u ? u.quetsch : 0, kipp = u ? u.kipp || 0 : 0, dreh = u ? u.dreh || 0 : 0;
    const wahl = !u && !g.akt && !g.schlange.length && g.wahlListe.find((x) => x.f === f) && j === g.o.ich;
    if (wahl) hoch += Math.abs(Math.sin(t * 4.2 + f)) * g.fr * 0.45;
    if (!u && g.sieg === j) { hoch += Math.abs(Math.sin(t * 5 + f * 0.9)) * g.fr * 1.6; dreh = t * 3 + f; }
    else if (!u && j === g.dranZeige && !g.akt && g.sieg === null && g.zeige[j][f] === -1) hoch += Math.abs(Math.sin(t * 2.6 + f * 0.7)) * g.fr * 0.08;
    p.y = FELD_OBEN + hoch;
    _q.setFromEuler(_e.set(kipp, dreh, kipp * 0.4));
    g.kegel.setMatrixAt(i, _m.compose(p, _q, _s.set(1 + quetsch, 1 - quetsch * 1.6, 1 + quetsch)));
  }
  g.kegel.instanceMatrix.needsUpdate = true;
}
function markerSetzen(t) {
  const j = g.dranZeige, farbe = g.o.farben[j] || "#ffffff";
  const hm = hausMitte(j), weit = Math.max(...g.P.haus(j).map((p) => g.w(p, 0).distanceTo(hm))) + g.fr * 1.55;
  const puls = 1 + Math.sin(t * 3.2) * 0.04;
  g.dranRing.position.copy(hm).setY(0.06); g.dranRing.scale.set(weit * puls, weit * puls, weit * puls);
  g.dranRing.material.color.set(farbe); g.dranRing.material.emissive.set(farbe); g.dranRing.material.emissiveIntensity = 1.8 + Math.sin(t * 3.2) * 0.6;
  g.dranSchein.position.copy(hm).setY(0.03); g.dranSchein.scale.setScalar(weit * 1.5); g.dranSchein.material.color.set(farbe);
  // Wuerfel nach dem Wechsel ausblenden
  if (g.wuerfelWeg && g.wuerfel.visible && !(g.akt && g.akt.art === "wurf")) {
    const u = (t - g.wuerfelWeg) / 0.35;
    g.wuerfel.scale.setScalar(Math.max(0.001, 1 - u));
    if (u >= 1) { g.wuerfel.visible = false; g.wuerfelWeg = 0; }
  }
  // waehlbare Figuren: Ring darunter, Nummer darueber, Vorschau am Ziel
  const zeigen = !g.akt && !g.schlange.length && g.o.ich === g.o.dran && g.wahlListe.length;
  g.wahl.forEach((m, k) => {
    const x = zeigen ? g.wahlListe[k] : null;
    [m.ring, m.ziel, m.geist, m.nr].forEach((o) => { o.visible = !!x; });
    if (!x) return;
    const ich = g.o.ich, von = posVon(ich, g.zeige[ich][x.f], x.f), nach = posVon(ich, x.nach, x.f);
    const s = 1 + Math.sin(t * 5 + k) * 0.08;
    m.ring.position.copy(von).setY(FELD_OBEN + 0.02); m.ring.scale.set(s, 1, s);
    m.ziel.position.copy(nach).setY(FELD_OBEN + 0.02); m.ziel.scale.set(1.15 * s, 1, 1.15 * s);
    const zf = x.schlag ? 0xff3b3b : 0xffd23f;
    m.ziel.material.color.setHex(zf); m.ziel.material.emissive.setHex(zf);
    m.geist.position.copy(nach).setY(FELD_OBEN); m.geist.material.color.set(g.o.farben[ich]); m.geist.material.emissive.set(g.o.farben[ich]);
    m.geist.material.opacity = 0.22 + Math.abs(Math.sin(t * 3 + k)) * 0.2;
    const key = `${x.f}-${g.o.farben[ich]}`;
    if (m.key !== key) { if (m.nr.material.map) m.nr.material.map.dispose(); m.nr.material.map = nummerTextur(x.f + 1, g.o.farben[ich]); m.nr.material.needsUpdate = true; m.key = key; }
    m.nr.position.copy(von).setY(FELD_OBEN + g.fr * 3.3 + Math.abs(Math.sin(t * 4.2 + x.f)) * g.fr * 0.45);
  });
}

// ---------------------------------------------------------------- Anzeige im Bild (Namensschild, Zahl, Sieg)
function uiBauen() {
  const ui = document.createElement("div"); ui.className = "md3-ui";
  ui.innerHTML = `<div class="md3-dran"><i></i><div><span class="md3-name"></span><small></small></div></div>
    <div class="md3-zahl" hidden><b></b><small></small></div><div class="md3-sieg" hidden></div><span class="md3-marke" hidden></span><div class="md3-knall" hidden></div>`;
  return { el: ui, knall: ui.querySelector(".md3-knall"), dran: ui.querySelector(".md3-dran"), name: ui.querySelector(".md3-name"), unter: ui.querySelector(".md3-dran small"),
    zahl: ui.querySelector(".md3-zahl"), zahlB: ui.querySelector(".md3-zahl b"), zahlS: ui.querySelector(".md3-zahl small"), sieg: ui.querySelector(".md3-sieg"), marke: ui.querySelector(".md3-marke"), sig: "" };
}
function uiSetzen(t) {
  const u = g.ui, o = g.o, j = g.dranZeige, nm = (o.namen || [])[j] || `Spieler ${j + 1}`, farbe = o.farben[j] || "#fff";
  const ich = j === o.ich;
  let unter;
  if (g.sieg !== null) unter = "hat alle Figuren im Ziel!";
  else if (g.akt && g.akt.art === "wurf") unter = "würfelt …";
  else if (g.akt && g.akt.art === "zug") unter = g.akt.opfer.length && g.akt.gelandet ? "wirft raus! 💥" : g.akt.ziel && g.akt.gelandet ? "ist im Ziel!" : "zieht …";
  else if (o.phase === "ziehen" && o.dran === j) unter = o.zwang ? "💥 muss rauswerfen" : ich ? "Figur antippen" : "wählt eine Figur";
  else if (o.dran === j) unter = o.versuche ? `würfelt – Versuch ${o.versuche + 1} von 3` : ich ? "jetzt würfeln!" : "ist dran";
  else unter = "ist dran";
  // die grosse Zahl steht, bis gezogen wird (hoechstens MD3_ZEIT.zahl), danach klein unten rechts
  const zahlZeigen = g.wurfZahl && t - g.wurfZahl.seit < MD3_ZEIT.zahl && !g.akt;
  const marke = g.wurfZahl && !zahlZeigen && g.wuerfel.visible && g.sieg === null ? `🎲 ${g.wurfZahl.zahl}` : "";
  const knall = g.knall && t - g.knall.seit < 1.5 && g.sieg === null ? g.knall : null;
  const sig = [j, nm, unter, ich, zahlZeigen && g.wurfZahl.seit, marke, g.sieg, knall && knall.seit].join("|");
  if (sig === u.sig) return;
  u.sig = sig;
  u.knall.hidden = !knall;
  if (knall) { u.knall.textContent = knall.text; u.knall.style.setProperty("--md3-knall", knall.farbe); }
  u.el.style.setProperty("--md3-farbe", farbe);
  u.name.textContent = g.sieg !== null ? `🏆 ${nm}` : ich ? `Du (${nm})` : nm;
  u.unter.textContent = unter;
  u.dran.classList.toggle("ich", ich && g.sieg === null);
  if (zahlZeigen) {
    if (u.zahl.hidden || u.zahl.dataset.seit !== String(g.wurfZahl.seit)) {
      u.zahl.hidden = false; u.zahl.dataset.seit = String(g.wurfZahl.seit);
      u.zahlB.textContent = String(g.wurfZahl.zahl);
      u.zahlS.textContent = g.wurfZahl.nichts ? (g.wurfZahl.zahl === 6 ? "Kein Zug – nochmal!" : "Kein Zug möglich") : g.wurfZahl.zahl === 6 ? "Sechs! Danach nochmal" : `${kurz(nm)} würfelt`;
      u.zahlB.style.animation = "none"; void u.zahlB.offsetWidth; u.zahlB.style.animation = "";
    }
  } else u.zahl.hidden = true;
  u.marke.hidden = !marke; u.marke.textContent = marke;
  u.sieg.hidden = g.sieg === null;
  if (g.sieg !== null) u.sieg.textContent = `🏆 ${nm} gewinnt!`;
}

// ---------------------------------------------------------------- Tippen aufs Bild: Figur waehlen
function tippBinden(el) {
  let start = null;
  el.addEventListener("pointerdown", (e) => { start = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  el.addEventListener("pointerup", (e) => {
    if (!start || !g) return;
    const weit = Math.hypot(e.clientX - start.x, e.clientY - start.y), lang = performance.now() - start.t;
    start = null;
    if (weit > 14 || lang > 600) return;
    const f = figurBeiPunkt(e.clientX, e.clientY);
    if (f !== null && g.o.tippen) { e.preventDefault(); g.o.tippen(f); }
  });
}
// naechste waehlbare Figur (oder ihr Zielfeld) zum Fingerpunkt, hoechstens 46 Bildpunkte entfernt
export function figurBeiPunkt(cx, cy) {
  if (!g || !g.wahlListe.length || g.o.ich !== g.o.dran) return null;
  const r = g.renderer.domElement.getBoundingClientRect(), v = V();
  let best = null, bestD = 46;
  g.wahlListe.forEach((x) => {
    const ich = g.o.ich;
    [posVon(ich, g.zeige[ich][x.f], x.f).setY(FELD_OBEN + g.fr), posVon(ich, x.nach, x.f).setY(FELD_OBEN + g.fr)].forEach((p) => {
      v.copy(p).project(g.camera);
      const sx = r.left + ((v.x + 1) / 2) * r.width, sy = r.top + ((1 - v.y) / 2) * r.height, d = Math.hypot(sx - cx, sy - cy);
      if (d < bestD) { bestD = d; best = x.f; }
    });
  });
  return best;
}
// fuer Tests: wo eine Figur gerade im Bild steht (Seitenkoordinaten)
export function figurImBild(j, f) {
  if (!g) return null;
  const r = g.renderer.domElement.getBoundingClientRect(), v = posVon(j, g.zeige[j][f], f).setY(FELD_OBEN + g.fr).project(g.camera);
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}

// ---------------------------------------------------------------- Bildschleife
function schleife(gen) {
  if (!g || g.gen !== gen) return;
  if (!g.container || !g.container.isConnected) { g.laeuft = false; return; }
  requestAnimationFrame(() => schleife(gen));
  const t0 = performance.now();
  const dt = Math.min(0.1, g.uhr.getDelta()), t = g.uhr.elapsedTime;
  g.dtLetzt = dt; g.bilder++;
  g.renderer.info.reset();
  bildrateMessen(dt);
  SC.fliessen(g, dt);
  ablauf(dt, t);
  figurenSetzen(t);
  markerSetzen(t);
  effekte(dt, t);
  kameraBewegen(dt, t);
  uiSetzen(t);
  if (g.composer && STUFE[g.stufe].leuchten) g.composer.render(dt);
  else g.renderer.render(g.scene, g.camera);
  // Rechenzeit je Bild (Prozessor-Anteil, gleitender Schnitt) fuer die Leistungsprobe
  g.ms = (g.ms || 0) * 0.95 + (performance.now() - t0) * 0.05;
}

// Schalter oben rechts: Kamera folgt / Ganzes Brett (wie beim Partybrett)
function kameraSchalter(container) {
  let el = g.kamEl;
  if (!el) { el = g.kamEl = document.createElement("span"); el.className = "brett3d-kamera md3-kamera"; el.setAttribute("role", "button"); el.tabIndex = 0; }
  const zeigen = () => { el.textContent = g.folgen ? "🎥 Kamera folgt" : "🗺️ Ganzes Brett"; };
  const umschalten = (ev) => { ev.preventDefault(); ev.stopPropagation(); g.folgen = !g.folgen; lsSchreiben("pa_md_kamera", g.folgen ? "folgen" : "uebersicht"); zeigen(); };
  el.onclick = umschalten; el.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") umschalten(ev); };
  zeigen(); container.appendChild(el);
}

// ---------------------------------------------------------------- Einstieg
// d: Stand (fig, dran, wurf, versuche, phase, sieger, letzt, wuerfe, zwang); o: Brett und Bedienung aus maedn.js
// (n, P = maednPunkte, abs, sitz, farben, namen, ich, beamer, wahl = [{ f, nach, schlag }], tippen(f))
export function maedn3dZeigen(container, d, o) {
  if (g && (g.n !== o.n || g.beamer !== !!o.beamer || g.look !== lookVon())) {
    try { if (g.composer) g.composer.dispose(); g.renderer.dispose(); } catch (e) { /* egal */ }
    g.laeuft = false; g = null;
  }
  try { if (!g) aufbauen(o); } catch (e) { console.warn("3D nicht verfuegbar - flaches Brett", e); g = null; return false; }
  g.j4 = (j, f) => j * 4 + f;
  g.o = { ...o, phase: d.phase, dran: d.dran, versuche: d.versuche || 0, zwang: !!d.zwang };
  g.wahlListe = o.wahl || [];
  // Stand uebernehmen: Unterschiede zum letzten Stand werden zu Auftritten
  const neu = { n: d.n, fig: d.fig.map((r) => r.slice()), dran: d.dran, wurf: d.wurf, versuche: d.versuche, phase: d.phase, sieger: d.sieger, letzt: d.letzt ? { ...d.letzt } : null, wuerfe: d.wuerfe || 0 };
  einreihen(g.stand, neu);
  g.stand = neu;
  if (g.schlange.length > 12) { const ende = g.schlange.filter((x) => x.art === "sieg" || x.art === "dran").pop(); schnappen(neu); if (ende && ende.art === "dran") g.dranZeige = ende.j; }
  // Bild in den neuen Platzhalter haengen (die Szene bleibt ueber Neuzeichnungen erhalten)
  g.container = container;
  container.classList.add("hat-3d");
  container.insertBefore(g.renderer.domElement, container.firstChild);
  if (!g.ui) g.ui = uiBauen();
  container.appendChild(g.ui.el);
  kameraSchalter(container);
  const breite = container.clientWidth || 360;
  const hoehe = g.beamer && container.clientHeight > 80 ? container.clientHeight : Math.round(breite * (breite < 520 ? 0.96 : 0.8));
  if (!g.groesse || g.groesse[0] !== breite || g.groesse[1] !== hoehe) { g.groesse = [breite, hoehe]; groesseAnwenden(); g.passCache = {}; }
  g.renderer.domElement.style.width = "100%"; g.renderer.domElement.style.height = g.beamer ? "100%" : "auto";
  g.camera.aspect = breite / hoehe; g.camera.updateProjectionMatrix();
  if (!g.laeuft) { g.laeuft = true; g.gen = ++generation; g.uhr.getDelta(); schleife(g.gen); }
  return true;
}

// fuer Tests und die Probe am Ally
export function maedn3dStand() {
  if (!g) return null;
  const cam = g.mess; cam.aspect = g.camera.aspect; cam.fov = g.camera.fov; cam.updateProjectionMatrix();
  cam.position.copy(g.camera.position); cam.quaternion.copy(g.camera.quaternion); cam.updateMatrixWorld();
  return { fps: g.fps || 0, ms: +(g.ms || 0).toFixed(2), stufe: g.stufe, aufbauMs: g.aufbauMs, modelleDa: !!g.modelleDa, leuchten: !!(g.composer && STUFE[g.stufe].leuchten),
    zeichnungen: g.renderer.info.render.calls, dreiecke: g.renderer.info.render.triangles, schlange: g.schlange.length + (g.akt ? 1 : 0), akt: g.akt ? g.akt.art : null,
    zaehler: { ...g.zaehler }, dran: g.dranZeige, sieg: g.sieg, folgen: g.folgen, wuerfel: g.wuerfel.visible, wahl: g.wahl.filter((m) => m.ring.visible).length,
    rand: +randWert(cam, 1).toFixed(3), kamera: { a: +g.kam.a.toFixed(3), e: +g.kam.e.toFixed(3), d: +g.kam.d.toFixed(2) }, zeige: g.zeige.map((r) => r.slice()),
    groesse: g.groesse ? g.groesse.slice() : null, bilder: g.bilder, nah: g.folgen && !!naheEigene(sitzWinkel(g.dranZeige)),
    // eigene Figuren und Ziele der waehlbaren Zuege im Bild? (Nahansicht 8er-Brett)
    eigeneDrin: g.o.ich >= 0 && g.o.ich < g.n ? nahePunkte().every((p) => { const v = p.clone().setY(FELD_OBEN + g.fr).project(cam); return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1; }) : null, ui: g.ui ? g.ui.name.textContent + " · " + g.ui.unter.textContent : "" };
}
export const maedn3dDa = () => !!g;
