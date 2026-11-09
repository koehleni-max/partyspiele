// Gemeinsamer 3D-Unterbau fuer die Tischspiele (Nico 09.11.2026, Knopf "Ja, in 3D": Vier gewinnt, Dame, Wuerfelpoker, Schiffe
// versenken und die Millionaer-Buehne "richtig in 3D, wie Autoscooter und Mensch aergere dich nicht").
// Gleicher Unterbau wie maedn3d.js: three.js aus vendor/, Stufen/Startstufe/"weniger Bewegung" aus brett3d.js, Spiegelungen aus
// dem Himmel von brett_schmuck.js, Leuchten ueber die Nachbearbeitung aus modelle.js. Hier nur, was alle fuenf brauchen:
//   Buehne     Renderer, Szene, Kamera, Licht; Umgebung "tisch" (Holztisch unter einer Haengelampe im dunklen Raum), "meer"
//              (offene See mit Wellen) oder "studio" (dunkles Fernsehstudio). Je Geraet nur EINE Buehne: wer neu aufbaut,
//              gibt die vorige frei (WebGL-Kontexte sind am Handy knapp).
//   Kamera     Das Spiel sagt, wohin sie schaut (Position + Blickpunkt); sie gleitet weich dorthin, kann wackeln.
//              einpassen() sucht den Abstand, bei dem alle genannten Punkte mit Rand ins Bild passen.
//   Tippen     kurzer Tipp aufs Bild -> spiel.tipp(x, y); naechster() findet das naechste Ziel (Bildpunkte, grosszuegig).
//   Effekte    Funken, Konfetti, Stosswelle - wie bei Mensch aergere dich nicht.
//   Anzeige    Namensschild (wer dran), grosse Einblendung, Siegesbanner, ein Knopf im Bild, Hinweiszeile, Ecklabel.
//   Leistung   Stufen wie beim Partybrett; faellt die Bildrate, eine Stufe tiefer. ?fps zeigt die Bildrate.
// Ohne WebGL wirft buehne() - die Spiele bleiben dann bei ihrer flachen Ansicht.
import * as THREE from "./vendor/three.module.js";
import * as SC from "./brett_schmuck.js";
import * as MD from "./modelle.js";
import { STUFE, STUFEN, startStufe, wenigBewegung } from "./brett3d.js";

export { THREE, wenigBewegung };
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const zufallFest = (k) => { const x = Math.sin(k * 91.7 + 13.1) * 43758.5453; return x - Math.floor(x); };
export const sanft = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
export const raus = (u) => 1 - Math.pow(1 - u, 3);
export const kurz = (t, n = 16) => (String(t || "").length > n ? String(t).slice(0, n - 1) + "…" : String(t || ""));
export function leinwand(w, h = w) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
export function textur(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
export const weich = (() => { let t = null; return () => { if (t) return t; const [c, x] = leinwand(64); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "#fff"); gr.addColorStop(0.35, "#ffffffaa"); gr.addColorStop(1, "#fff0"); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); t = textur(c); return t; }; })();
// glaenzender Lack (auf "niedrig" ohne Klarlack)
export function lack(T, farbe, extra = {}) {
  return T.stufe === "niedrig" ? new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.32, ...extra })
    : new THREE.MeshPhysicalMaterial({ color: farbe, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, ...extra });
}
export const leucht = (farbe, staerke = 2) => new THREE.MeshStandardMaterial({ color: farbe, emissive: farbe, emissiveIntensity: staerke, roughness: 0.4 });

let aktiv = null, generation = 0;

// ---------------------------------------------------------------- Umgebungen
function raumHintergrund(oben, mitte, unten) {
  const [c, x] = leinwand(512, 512);
  const gr = x.createRadialGradient(256, 210, 20, 256, 256, 420);
  gr.addColorStop(0, mitte); gr.addColorStop(0.55, oben); gr.addColorStop(1, unten);
  x.fillStyle = gr; x.fillRect(0, 0, 512, 512);
  return textur(c);
}
// Holztisch unter einer Haengelampe: breite Platte mit Kante, Beine, Dielenboden, warmes Licht von oben
function tischBauen(T, o) {
  const B = o.breite || T.R * 2.4, D = o.tiefe || T.R * 2.0;
  const holz = SC.holzMaterial(o.holz || 0x6b3f1f);
  // Tischplatte etwas unter 0: Spielbretter liegen mit ihrer Unterseite darauf, ohne dass zwei Flaechen gleich hoch flimmern
  const platte = new THREE.Mesh(new THREE.BoxGeometry(B, 0.5, D), holz); platte.position.y = -0.25 - (o.tiefer || 0); platte.receiveShadow = true; T.scene.add(platte);
  const kante = new THREE.Mesh(new THREE.BoxGeometry(B + 0.16, 0.14, D + 0.16), SC.holzMaterial(0x4a2a12)); kante.position.y = -0.5; T.scene.add(kante);
  const beinGeo = new THREE.BoxGeometry(0.5, 7, 0.5);
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => { const bein = new THREE.Mesh(beinGeo, holz); bein.position.set(a * (B / 2 - 0.6), -4, b * (D / 2 - 0.6)); T.scene.add(bein); });
  const boden = new THREE.Mesh(new THREE.PlaneGeometry(T.R * 30, T.R * 30), new THREE.MeshStandardMaterial({ color: 0x24160d, roughness: 0.9 }));
  boden.rotation.x = -Math.PI / 2; boden.position.y = -7.5; boden.receiveShadow = true; T.scene.add(boden);
  // Haengelampe: Schirm und Gluehbirne (leuchtet), dazu ein Spot mit Schatten
  const schirm = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.1, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x1f3a2a, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }));
  const lampeH = T.R * 3.4;
  schirm.position.set(0, lampeH, 0); T.scene.add(schirm);
  const birne = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), leucht(0xffe2a8, 3)); birne.position.set(0, lampeH - 0.45, 0); T.scene.add(birne);
  const kabel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 20, 6), new THREE.MeshBasicMaterial({ color: 0x111111 })); kabel.position.set(0, lampeH + 10.5, 0); T.scene.add(kabel);
  T.lampe = { schirm, birne, hoehe: lampeH };
  const spot = new THREE.SpotLight(0xffe4bc, o.licht || 150, T.R * 14, 0.85, 0.65, 1);
  spot.position.set(0, lampeH - 0.5, 0); spot.target.position.set(0, 0, 0);
  T.scene.add(spot, spot.target); T.schattenLicht = spot;
  spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.02;
  // Fuelllicht von vorn (ohne Schatten): Spielfiguren und Gitter bleiben auch auf der Lampen-abgewandten Seite gut zu sehen
  const fuell = new THREE.DirectionalLight(0xfff0e0, 1.3); fuell.position.set(T.R * 0.6, T.R * 1.6, T.R * 3); T.scene.add(fuell);
  T.scene.background = raumHintergrund("#3a2516", "#8a5a36", "#120a05");
}
// offene See: grosses Wellenfeld (bewegt sich je Bild), Himmel am Abend, Sonne tief
function meerBauen(T) {
  // Wellenfeld: die Hoehe wird je Bild auf dem Prozessor gerechnet - am Handy grob, an der Wand fein
  const teile = T.stufe === "niedrig" ? 24 : T.stufe === "mittel" ? 36 : 80, gr = T.R * 9;
  const geo = new THREE.PlaneGeometry(gr, gr, teile, teile); geo.rotateX(-Math.PI / 2);
  const mat = SC.wasserMaterial(0x0f5d8c, gr);
  mat.transparent = false; mat.opacity = 1;   // undurchsichtig: Seile, Stifte und Schilder liegen sonst je nach Reihenfolge darunter
  const meer = new THREE.Mesh(geo, mat); meer.receiveShadow = true; T.scene.add(meer);
  T.fliess.push(...(mat.userData.fliess || []));
  T.meer = { mesh: meer, basis: Float32Array.from(geo.attributes.position.array) };
  T.scene.fog = new THREE.Fog(0x9fb6c8, T.R * 4, T.R * 11);
  SC.himmelSetzen(T, "abend");
}
// Wellen: ein paar Sinuswellen, die Hoehe je Punkt (fuer Schiffe und Fontaenen auch abfragbar)
export function welle(T, x, z, t) {
  if (!T.meer || wenigBewegung()) return 0;
  return Math.sin(x * 0.55 + t * 1.3) * 0.09 + Math.sin(z * 0.7 - t * 1.05) * 0.07 + Math.sin((x + z) * 1.4 + t * 2.1) * 0.025;
}
// ruhiges Wasser in Rechtecken (Spielfelder): dort nur ein Hauch Welle, damit Raster und Stifte frei liegen
export function meerRuhe(T, rechtecke) {
  if (!T.meer) return;
  const b = T.meer.basis, n = b.length / 3, f = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = b[i * 3], z = b[i * 3 + 2];
    let k = 1;
    rechtecke.forEach((r) => { const d = Math.hypot(Math.max(0, Math.abs(x - r.x) - r.b / 2), Math.max(0, Math.abs(z - r.z) - r.t / 2)); k = Math.min(k, 0.12 + Math.min(1, d / 3) * 0.88); });
    f[i] = k;
  }
  T.meer.faktor = f;
}
function meerTakt(T, t) {
  // nur jedes zweite Bild (ausser an der Wand); die Lichtwellen kommen aus der Normalenkarte, die Flaechennormalen bleiben
  if (!T.meer || (T.stufe !== "beamer" && T.stufe !== "hoch" && T.bilder % 2)) return;
  const p = T.meer.mesh.geometry.attributes.position, b = T.meer.basis, f = T.meer.faktor;
  for (let i = 0; i < p.count; i++) p.array[i * 3 + 1] = welle(T, b[i * 3], b[i * 3 + 2], t) * 1.4 * (f ? f[i] : 1) - 0.05;
  p.needsUpdate = true;
}
// dunkles Studio: glaenzender Boden, Hintergrund fast schwarz (Buehne, Licht und Publikum baut mio3d.js)
function studioBauen(T) {
  T.scene.background = raumHintergrund("#0a0c2a", "#1c2160", "#020208");
  const boden = new THREE.Mesh(new THREE.CircleGeometry(T.R * 6, 64), new THREE.MeshPhysicalMaterial({ color: 0x05060f, roughness: 0.22, metalness: 0.3, clearcoat: T.stufe === "niedrig" ? 0 : 1 }));
  boden.rotation.x = -Math.PI / 2; boden.receiveShadow = true; T.scene.add(boden);
}

// ---------------------------------------------------------------- Buehne bauen
// art: "tisch" | "meer" | "studio"; o: { beamer, R (Groesse der Spielflaeche), breite/tiefe/holz (Tisch), fov, name }
export function buehne(art, o = {}) {
  if (aktiv) freigeben(aktiv);
  const t0 = performance.now();
  const st = startStufe(!!o.beamer), Q = STUFE[st.stufe];
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "default" });
  renderer.setPixelRatio(Math.min(Q.pr, window.devicePixelRatio || 1));
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = o.belichtung || 1.0;
  const scene = new THREE.Scene();
  const R = o.R || 5;
  const camera = new THREE.PerspectiveCamera(o.fov || 38, 1, 0.1, R * 40), mess = camera.clone();
  const T = { art, name: o.name || art, renderer, scene, camera, mess, R, beamer: !!o.beamer, stufe: st.stufe, stufeFest: st.fest, mess_dt: [], bilder: 0,
    uhr: new THREE.Clock(), kam: { pos: V(0, R * 2, R * 3), blick: V() }, kamSprung: true, wackelBis: 0, wackelStaerke: 1, passCache: {}, fliess: [],
    funkenDaten: [], container: null, ui: null, laeuft: false, takt: null, pose: null, tipp: null, weg: false };
  aktiv = T;
  const hemi = new THREE.HemisphereLight(art === "studio" ? 0x8090ff : 0xfff0dd, art === "studio" ? 0x05050f : 0x5a3a24, art === "meer" ? 1.0 : art === "tisch" ? 1.0 : 0.55);
  scene.add(hemi); T.hemi = hemi;
  if (art !== "studio") SC.himmelSetzen(T, "abend");   // Spiegelungen auf Lack und Metall
  if (art === "tisch") tischBauen(T, o);
  else if (art === "meer") meerBauen(T);
  else studioBauen(T);
  if (!T.schattenLicht) {
    const sonne = new THREE.DirectionalLight(art === "meer" ? 0xffd2a0 : 0xffffff, art === "meer" ? 2.4 : 0.8);
    sonne.position.set(-R * 2, R * 3, R * 1.6); scene.add(sonne, sonne.target);
    const sc = sonne.shadow.camera; sc.left = sc.bottom = -R * 1.6; sc.right = sc.top = R * 1.6; sc.near = 0.5; sc.far = R * 10; sc.updateProjectionMatrix();
    sonne.shadow.bias = -0.0005; sonne.shadow.normalBias = 0.02;
    T.schattenLicht = sonne;
  }
  // Funken, Stosswelle, Konfetti (wie maedn3d.js)
  const FUNKEN = 120;
  const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FUNKEN * 3), 3));
  T.funken = new THREE.Points(fgeo, new THREE.PointsMaterial({ size: R * 0.06, map: weich(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff }));
  T.funken.visible = false; T.funken.frustumCulled = false; scene.add(T.funken);
  T.welleM = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  T.welleM.rotation.x = -Math.PI / 2; T.welleM.visible = false; scene.add(T.welleM);
  const KONFETTI = 200;
  T.konfetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(R * 0.03, R * 0.05), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.6, emissive: 0x222222 }), KONFETTI);
  T.konfetti.visible = false; T.konfetti.frustumCulled = false; scene.add(T.konfetti);
  T.konfDaten = Array.from({ length: KONFETTI }, (_, i) => ({ p: V(), v: V(), r: V(zufallFest(i) * 6, zufallFest(i + 9) * 6, 0), dr: V(2 + zufallFest(i + 3) * 5, 1 + zufallFest(i + 5) * 4, 0) }));
  const dieseBuehne = T;
  MD.nachbearbeitungModule().then((N) => {
    if (!N || T.weg || aktiv !== dieseBuehne) return;
    const ziel = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    const c = new N.EffectComposer(renderer, ziel);
    c.addPass(new N.RenderPass(scene, camera));
    c.addPass(new N.UnrealBloomPass(new THREE.Vector2(256, 256), o.leuchten || 0.42, 0.5, 1.05));
    c.addPass(new N.OutputPass());
    T.composer = c; groesseAnwenden(T);
  }).catch((e) => console.warn("Nachbearbeitung aus", e));
  tippBinden(T);
  qualitaetAnwenden(T);
  T.aufbauMs = Math.round(performance.now() - t0);
  return T;
}
export function freigeben(T) {
  if (!T || T.weg) return;
  T.weg = true; T.laeuft = false;
  try { if (T.composer) T.composer.dispose(); T.renderer.dispose(); T.renderer.forceContextLoss(); } catch (e) { /* egal */ }
  if (T.renderer.domElement.parentNode) T.renderer.domElement.remove();
  if (T.ui && T.ui.el.parentNode) T.ui.el.remove();
  if (aktiv === T) aktiv = null;
}
export const aktiveBuehne = () => aktiv;

function qualitaetAnwenden(T) {
  const Q = STUFE[T.stufe];
  T.renderer.setPixelRatio(Math.min(Q.pr, window.devicePixelRatio || 1));
  groesseAnwenden(T);
  T.schattenLicht.castShadow = Q.schatten > 0;
  T.schattenLicht.shadow.mapSize.set(Q.schatten || 1024, Q.schatten || 1024);
  if (T.schattenLicht.shadow.map) { T.schattenLicht.shadow.map.dispose(); T.schattenLicht.shadow.map = null; }
  T.konfetti.count = Math.round(T.konfDaten.length * Math.max(0.35, Q.partikel));
  if (T.beiStufe) T.beiStufe(T.stufe);
}
function groesseAnwenden(T) {
  if (!T.groesse) return;
  T.renderer.setSize(T.groesse[0], T.groesse[1], false);
  if (T.composer) { T.composer.setPixelRatio(T.renderer.getPixelRatio()); T.composer.setSize(T.groesse[0], T.groesse[1]); }
}
function bildrateMessen(T, dt) {
  T.fpsZeit = (T.fpsZeit || 0) + dt; T.fpsBilder = (T.fpsBilder || 0) + 1;
  if (T.fpsZeit >= 1) {
    T.fps = Math.round(T.fpsBilder / T.fpsZeit); T.fpsZeit = 0; T.fpsBilder = 0;
    if (/[?&]fps\b/.test(location.search) && T.container) {
      let el = T.container.querySelector(".brett3d-fps");
      if (!el) { el = document.createElement("span"); el.className = "brett3d-fps"; el.style.cssText = "position:absolute;left:6px;bottom:6px;z-index:5;padding:2px 6px;background:#000a;color:#fff;font:12px monospace;border-radius:4px;pointer-events:none"; T.container.appendChild(el); }
      el.textContent = `${T.fps} Bilder/s · ${T.stufe}`;
    }
  }
  if (T.stufeFest || T.stufe === "niedrig" || document.hidden || T.bilder < 30) return;
  T.mess_dt.push(dt);
  if (T.mess_dt.length < 90) return;
  const schnitt = T.mess_dt.reduce((a, b) => a + b, 0) / T.mess_dt.length;
  T.mess_dt = [];
  if (schnitt > 1 / STUFE[T.stufe].ziel) { T.stufe = STUFEN[STUFEN.indexOf(T.stufe) - 1]; qualitaetAnwenden(T); }
}

// ---------------------------------------------------------------- Kamera
// Abstand, bei dem alle Punkte (Welt) mit Rand ins Bild passen; richtung = vom Blickpunkt zur Kamera
export function einpassen(T, punkte, blick, richtung, rand = 0.9, obenRand = rand) {
  const r = richtung.clone().normalize();
  const key = `${punkte.length}|${punkte.slice(0, 6).map((p) => p.x.toFixed(1) + p.y.toFixed(1) + p.z.toFixed(1)).join(",")}|${blick.x.toFixed(2)},${blick.y.toFixed(2)},${blick.z.toFixed(2)}|${r.x.toFixed(3)},${r.y.toFixed(3)},${r.z.toFixed(3)}|${T.camera.aspect.toFixed(3)}|${rand}|${obenRand}`;
  if (T.passCache[key]) return T.passCache[key];
  const cam = T.mess; cam.aspect = T.camera.aspect; cam.fov = T.camera.fov; cam.updateProjectionMatrix();
  const v = V(), passt = () => punkte.every((p) => { v.copy(p).project(cam); return v.z < 1 && Math.abs(v.x) <= rand && v.y <= obenRand && v.y >= -rand; });
  let lo = T.R * 0.2, hi = T.R * 30;
  for (let i = 0; i < 24; i++) { const d = (lo + hi) / 2; cam.position.copy(blick).addScaledVector(r, d); cam.lookAt(blick); cam.updateMatrixWorld(); if (passt()) hi = d; else lo = d; }
  return (T.passCache[key] = hi);
}
// Richtung aus Winkeln: a um die senkrechte Achse (0 = von vorn, +z), e = Hoehe ueber der Tischebene
export const richtungAus = (a, e) => V(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
function kameraBewegen(T, dt, t) {
  if (!T.pose) return;
  const z = T.pose(t), K = T.kam, f = wenigBewegung() || T.kamSprung ? 1 : 1 - Math.exp(-dt * (z.tempo || 2.6));
  K.pos.lerp(z.pos, f); K.blick.lerp(z.blick, f); T.kamSprung = false;
  T.camera.position.copy(K.pos); T.camera.lookAt(K.blick);
  if (T.wackelBis > t && !wenigBewegung()) {
    const s = Math.min(1, (T.wackelBis - t) * 2.4) * T.R * 0.012 * T.wackelStaerke;
    T.camera.position.add(V((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
  }
}
export function wackeln(T, t, dauer = 0.45, staerke = 1) { T.wackelBis = t + dauer; T.wackelStaerke = staerke; }

// ---------------------------------------------------------------- Bildpunkte, Tippen
export function bildPunkt(T, p) {
  const r = T.renderer.domElement.getBoundingClientRect(), v = p.clone().project(T.camera);
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, z: v.z };
}
// naechstes Ziel zum Fingerpunkt: liste = [{ p: Vector3, w: Wert }], hoechstens maxPx Bildpunkte entfernt
export function naechster(T, cx, cy, liste, maxPx = 46) {
  let best = null, bestD = maxPx;
  liste.forEach((z) => { const b = bildPunkt(T, z.p), d = Math.hypot(b.x - cx, b.y - cy); if (d < bestD && b.z < 1) { bestD = d; best = z.w; } });
  return best;
}
// Strahl vom Fingerpunkt auf eine waagerechte Ebene (y = hoehe): Weltpunkt oder null
export function aufEbene(T, cx, cy, hoehe = 0) {
  const r = T.renderer.domElement.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), T.camera);
  const p = V();
  return ray.ray.intersectPlane(new THREE.Plane(V(0, 1, 0), -hoehe), p) ? p : null;
}
function tippBinden(T) {
  const el = T.renderer.domElement;
  let start = null;
  el.addEventListener("pointerdown", (e) => { start = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  el.addEventListener("pointerup", (e) => {
    if (!start || T.weg) return;
    const weit = Math.hypot(e.clientX - start.x, e.clientY - start.y), lang = performance.now() - start.t;
    start = null;
    if (weit > 16 || lang > 700 || !T.tipp) return;
    if (T.tipp(e.clientX, e.clientY) !== false) e.preventDefault();
  });
}

// ---------------------------------------------------------------- Effekte
export function funkenAn(T, ort, farbe, menge = 1, weite = 1) {
  const anzahl = Math.round(120 * Math.min(1, menge) * Math.max(0.4, STUFE[T.stufe].partikel)), s0 = T.R * 0.35 * weite;
  T.funkenDaten = Array.from({ length: anzahl }, () => {
    const a = Math.random() * Math.PI * 2, s = (0.5 + Math.random()) * s0;
    return { p: ort.clone(), v: V(Math.cos(a) * s, (1 + Math.random() * 1.6) * s0 * 1.3, Math.sin(a) * s) };
  });
  T.funken.material.color.set(farbe); T.funken.visible = true; T.funkenT = 0;
}
export function welleAn(T, ort, farbe, groesse = 1) { T.welleM.position.copy(ort); T.welleM.material.color.set(farbe); T.welleM.visible = true; T.welleT = 0; T.welleG = groesse; }
export function konfettiStart(T, farben, mitte = V(), hoehe = null) {
  T.konfetti.visible = true;
  const h = hoehe || T.R * 1.4;
  T.konfDaten.forEach((x, i) => {
    T.konfetti.setColorAt(i, new THREE.Color(farben[i % farben.length]).lerp(new THREE.Color(0xffd23f), i % 3 === 0 ? 0.6 : 0));
    x.p.set(mitte.x + (zufallFest(i + 40) - 0.5) * T.R * 2.4, mitte.y + h * (0.6 + zufallFest(i + 50) * 0.9), mitte.z + (zufallFest(i + 60) - 0.5) * T.R * 2.4);
    x.v.set(0, -(0.6 + zufallFest(i + 70)) * T.R * 0.25, 0); x.boden = mitte.y;
  });
  T.konfetti.instanceColor.needsUpdate = true; T.konfHoehe = h; T.konfMitte = mitte.clone();
}
export const konfettiAus = (T) => { T.konfetti.visible = false; };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = V();
function effekte(T, dt, t) {
  if (T.funken.visible) {
    T.funkenT += dt;
    const pos = T.funken.geometry.attributes.position;
    for (let i = 0; i < 120; i++) {
      const x = T.funkenDaten[i];
      if (!x) { pos.setXYZ(i, 0, -999, 0); continue; }
      x.v.y -= dt * T.R * 1.6; x.p.addScaledVector(x.v, dt);
      pos.setXYZ(i, x.p.x, x.p.y, x.p.z);
    }
    pos.needsUpdate = true; T.funken.material.opacity = Math.max(0, 1 - T.funkenT / 1.1);
    if (T.funkenT > 1.1) T.funken.visible = false;
  }
  if (T.welleM.visible) {
    T.welleT += dt; const u = T.welleT / 0.6, s = T.R * 0.08 * (1 + u * 6) * T.welleG;
    T.welleM.scale.set(s, s, s); T.welleM.material.opacity = Math.max(0, 0.9 * (1 - u));
    if (u >= 1) T.welleM.visible = false;
  }
  if (T.konfetti.visible) {
    for (let i = 0; i < T.konfetti.count; i++) {
      const x = T.konfDaten[i];
      x.p.addScaledVector(x.v, dt); x.p.x += Math.sin(t * 2 + i) * dt * T.R * 0.05; x.r.addScaledVector(x.dr, dt);
      if (x.p.y < x.boden) x.p.y = x.boden + T.konfHoehe * (0.8 + zufallFest(i + t) * 0.5);
      _q.setFromEuler(_e.set(x.r.x, x.r.y, 0)); T.konfetti.setMatrixAt(i, _m.compose(x.p, _q, _s.set(1, 1, 1)));
    }
    T.konfetti.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- Anzeige im Bild
function uiBauen() {
  const el = document.createElement("div"); el.className = "t3-ui";
  el.innerHTML = `<div class="t3-dran" hidden><i></i><div><span class="t3-name"></span><small></small></div></div><span class="t3-ecke" hidden></span>
    <div class="t3-knall" hidden><b></b><small></small></div><div class="t3-sieg" hidden></div><div class="t3-unten"><span class="t3-hinweis" hidden></span><button type="button" class="t3-knopf" hidden></button></div>`;
  const q = (s) => el.querySelector(s);
  const ui = { el, dran: q(".t3-dran"), name: q(".t3-name"), unter: q(".t3-dran small"), ecke: q(".t3-ecke"), knall: q(".t3-knall"), knallB: q(".t3-knall b"), knallS: q(".t3-knall small"),
    sieg: q(".t3-sieg"), hinweis: q(".t3-hinweis"), knopf: q(".t3-knopf"), sig: {} };
  ui.knopf.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (ui.knopfTun) ui.knopfTun(); });
  ui.ecke.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (ui.eckeTun) ui.eckeTun(); });
  return ui;
}
const gleich = (ui, k, wert) => { const s = JSON.stringify(wert); if (ui.sig[k] === s) return true; ui.sig[k] = s; return false; };
// wer dran: { name, farbe, unter, ich } oder null
export function anzeigeDran(T, x) {
  const u = T.ui; if (gleich(u, "dran", x)) return;
  u.dran.hidden = !x; if (!x) return;
  u.el.style.setProperty("--t3-farbe", x.farbe || "#fff");
  u.name.textContent = x.name; u.unter.textContent = x.unter || ""; u.dran.classList.toggle("ich", !!x.ich);
}
// grosse Einblendung (springt herein): { gross, klein, farbe } oder null
export function anzeigeKnall(T, x) {
  const u = T.ui; if (gleich(u, "knall", x)) return;
  u.knall.hidden = !x; if (!x) return;
  u.knall.style.setProperty("--t3-knall", x.farbe || "#ffd23f");
  u.knallB.textContent = x.gross || ""; u.knallS.textContent = x.klein || ""; u.knallS.hidden = !x.klein;
  u.knall.style.animation = "none"; void u.knall.offsetWidth; u.knall.style.animation = "";
}
export function anzeigeSieg(T, text) { const u = T.ui; if (gleich(u, "sieg", text)) return; u.sieg.hidden = !text; if (text) u.sieg.textContent = text; }
export function anzeigeHinweis(T, text) { const u = T.ui; if (gleich(u, "hinweis", text)) return; u.hinweis.hidden = !text; if (text) u.hinweis.textContent = text; }
export function anzeigeKnopf(T, text, tun, art = "") {
  const u = T.ui; u.knopfTun = tun;
  if (gleich(u, "knopf", [text, art])) return;
  u.knopf.hidden = !text; if (text) { u.knopf.textContent = text; u.knopf.className = `t3-knopf ${art}`; }
}
export function anzeigeEcke(T, text, tun) {
  const u = T.ui; u.eckeTun = tun;
  if (gleich(u, "ecke", [text, !!tun])) return;
  u.ecke.hidden = !text; if (text) { u.ecke.textContent = text; u.ecke.classList.toggle("knopf", !!tun); }
}

// ---------------------------------------------------------------- Bildschleife
function schleife(T, gen) {
  if (T.weg || T.gen !== gen) return;
  if (!T.container || !T.container.isConnected) { T.laeuft = false; return; }
  requestAnimationFrame(() => schleife(T, gen));
  const t0 = performance.now();
  const dt = Math.min(0.1, T.uhr.getDelta()), t = T.uhr.elapsedTime;
  T.dtLetzt = dt; T.bilder++;
  T.renderer.info.reset();
  bildrateMessen(T, dt);
  SC.fliessen(T, dt);
  meerTakt(T, t);
  if (T.takt) T.takt(dt, t);
  effekte(T, dt, t);
  kameraBewegen(T, dt, t);
  if (T.composer && STUFE[T.stufe].leuchten) T.composer.render(dt);
  else T.renderer.render(T.scene, T.camera);
  T.ms = (T.ms || 0) * 0.95 + (performance.now() - t0) * 0.05;
}

// Bild in den Platzhalter haengen (Szene bleibt ueber Neuzeichnungen erhalten) und die Schleife starten.
// hoehe: Seitenverhaeltnis am Handy (Hoehe = Breite * hoehe, hoechstens 72 % des Fensters); am Beamer die Kastenhoehe
export function einhaengen(T, container, hoehe = 1) {
  T.container = container;
  container.classList.add("hat-3d", "t3-kasten");
  if (T.renderer.domElement.parentNode !== container) container.insertBefore(T.renderer.domElement, container.firstChild);
  if (!T.ui) T.ui = uiBauen();
  if (T.ui.el.parentNode !== container) container.appendChild(T.ui.el);
  const breite = container.clientWidth || 360;
  const h = T.beamer && container.clientHeight > 80 ? container.clientHeight : Math.round(Math.min(breite * hoehe, Math.max(260, window.innerHeight * 0.72)));
  if (!T.groesse || T.groesse[0] !== breite || T.groesse[1] !== h) { T.groesse = [breite, h]; groesseAnwenden(T); T.passCache = {}; }
  T.renderer.domElement.style.width = "100%"; T.renderer.domElement.style.height = T.beamer ? "100%" : "auto";
  T.camera.aspect = breite / h; T.camera.updateProjectionMatrix();
  if (!T.laeuft) { T.laeuft = true; T.gen = ++generation; T.uhr.getDelta(); schleife(T, T.gen); }
}
// fuer Tests: Leistungszahlen der Buehne
export function buehneStand(T) {
  if (!T) return null;
  return { fps: T.fps || 0, ms: +(T.ms || 0).toFixed(2), stufe: T.stufe, aufbauMs: T.aufbauMs, leuchten: !!(T.composer && STUFE[T.stufe].leuchten), zeichnungen: T.renderer.info.render.calls,
    dreiecke: T.renderer.info.render.triangles, groesse: T.groesse ? T.groesse.slice() : null, bilder: T.bilder, weg: T.weg };
}
// fuer Tests: liegen alle Punkte im Bild? (Bildrand -1..1, mit Rand)
export function imBild(T, punkte, rand = 1) {
  const cam = T.mess; cam.aspect = T.camera.aspect; cam.fov = T.camera.fov; cam.updateProjectionMatrix();
  cam.position.copy(T.camera.position); cam.quaternion.copy(T.camera.quaternion); cam.updateMatrixWorld();
  const v = V();
  return punkte.every((p) => { v.copy(p).project(cam); return Math.abs(v.x) <= rand && Math.abs(v.y) <= rand && v.z < 1; });
}

// ---------------------------------------------------------------- Stil der Anzeige
let stilDa = false;
export function stil() {
  if (stilDa || typeof document === "undefined") return;
  stilDa = true;
  document.head.insertAdjacentHTML("beforeend", `<style id="t3-stil">
    .t3d{position:relative;width:100%;max-width:min(96vw,560px);margin:.4em auto;border-radius:16px;overflow:hidden;background:#0b0d1a}
    .t3d canvas{display:block;width:100%;touch-action:manipulation}
    .t3d:not(.hat-3d){display:none}
    .t3-ui{position:absolute;inset:0;pointer-events:none;--t3-farbe:#fff}
    .t3-ui [hidden]{display:none!important}
    .t3-dran{position:absolute;left:8px;top:8px;max-width:calc(100% - 16px);display:flex;align-items:center;gap:8px;padding:5px 12px 5px 6px;border-radius:99px;
      background:#0b0d1ad9;color:#fff;box-shadow:0 0 0 2px var(--t3-farbe),0 0 16px var(--t3-farbe)}
    .t3-ecke~.t3-dran,.t3-dran:has(~.t3-ecke:not([hidden])){max-width:calc(100% - 150px)}
    .t3-dran.ich{animation:t3-ich 1s ease-in-out infinite alternate}@keyframes t3-ich{to{box-shadow:0 0 0 3px var(--t3-farbe),0 0 28px var(--t3-farbe)}}
    .t3-dran i{flex:none;width:22px;height:22px;border-radius:50%;background:var(--t3-farbe);box-shadow:inset 0 -3px 0 #0005,inset 0 2px 0 #fff6}
    .t3-dran div{min-width:0;line-height:1.15}.t3-name{display:block;font-weight:900;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .t3-dran small{display:block;font-size:12px;font-weight:700;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .t3-ecke{position:absolute;right:8px;top:8px;max-width:42%;padding:6px 10px;border-radius:99px;background:#0b0d1ad9;color:#fff;font-weight:800;font-size:12px;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .t3-ecke.knopf{pointer-events:auto;cursor:pointer;box-shadow:0 0 0 2px #ffffff55;min-height:22px}
    .t3-knall{position:absolute;left:50%;top:62px;transform:translateX(-50%);max-width:90%;padding:6px 16px;border-radius:16px;text-align:center;
      background:#0b0d1ae6;color:#fff;box-shadow:0 0 0 3px var(--t3-knall),0 0 30px var(--t3-knall);animation:t3-pop .5s cubic-bezier(.2,1.7,.4,1)}
    .t3-knall b{display:block;font-size:22px;font-weight:900;line-height:1.15;color:var(--t3-knall);text-shadow:0 2px 0 #0008;white-space:nowrap}
    .t3-knall small{display:block;margin-top:2px;font-size:13px;font-weight:800;overflow-wrap:anywhere}
    @keyframes t3-pop{from{transform:translateX(-50%) scale(.15) rotate(-12deg);opacity:0}to{transform:translateX(-50%) scale(1);opacity:1}}
    .t3-sieg{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);max-width:90%;padding:6px 18px;border-radius:16px;text-align:center;overflow-wrap:anywhere;white-space:nowrap;
      background:linear-gradient(#ffe68a,#f5a623);color:#3a2200;font-weight:900;font-size:19px;box-shadow:0 6px 0 #0006,0 0 30px #ffd23f;animation:t3-auf .6s cubic-bezier(.2,1.6,.4,1)}
    @keyframes t3-auf{from{transform:translateX(-50%) scale(.2);opacity:0}to{transform:translateX(-50%) scale(1);opacity:1}}
    .t3-unten{position:absolute;left:8px;right:8px;bottom:8px;display:flex;flex-direction:column;align-items:center;gap:6px}
    .t3-hinweis{max-width:100%;padding:4px 12px;border-radius:99px;background:#0b0d1ad0;color:#fff;font-weight:800;font-size:13px;text-align:center;overflow-wrap:anywhere}
    .t3-ui .t3-knopf{pointer-events:auto;width:auto;min-height:48px;max-width:100%;margin:0;padding:10px 22px;border:0!important;border-radius:99px;font:inherit;font-size:18px;font-weight:900;color:#2a1600!important;
      background:linear-gradient(#ffe68a,#f5a623)!important;box-shadow:0 5px 0 #8a5200,0 0 22px #ffb02088!important;cursor:pointer;overflow-wrap:anywhere;opacity:1;text-shadow:none}
    .t3-ui .t3-knopf.rot{color:#fff!important;background:linear-gradient(#ff6a5a,#d0241a)!important;box-shadow:0 5px 0 #7a0d06,0 0 22px #ff3b2c88!important}
    .t3-ui .t3-knopf:active{transform:translateY(3px)}
    .t3d.t3-wand{max-width:none;margin:0;border-radius:1vw}.t3-wand canvas{height:100%!important}
    .t3-wand .t3-dran{left:1vw;top:1vw;gap:.7vw;padding:.45vw 1.3vw .45vw .5vw}.t3-wand .t3-dran i{width:2vw;height:2vw}
    .t3-wand .t3-name{font-size:1.9vw}.t3-wand .t3-dran small{font-size:1.2vw}.t3-wand .t3-ecke{font-size:1.2vw;padding:.5vw 1vw}
    .t3-wand .t3-knall{top:5vw}.t3-wand .t3-knall b{font-size:3.4vw}.t3-wand .t3-knall small{font-size:1.6vw}.t3-wand .t3-sieg{font-size:2.8vw}.t3-wand .t3-hinweis{font-size:1.3vw}
  </style>`);
}
