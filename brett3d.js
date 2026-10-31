// 3D-Ansicht fuer das Partybrett (three.js, liegt lokal in vendor/). Die Szene bleibt ueber Neuzeichnungen erhalten:
// das Canvas wird jeweils in den neuen Platzhalter umgehaengt, Figuren laufen Feld fuer Feld den echten Weg entlang
// (auch durch Abzweigungen). Ausbau 31.10.2026 (Nico, Punkt 8d): Brett mit Abkuerzung und Umweg, Figuren mit Gesicht und
// Muetze, Laufbewegung mit Huepfen und Wackeln, Effekte (Muenzen, Stern, Falle, Ereignis), Ring unter dem, der dran ist.
// Am Handy sparsam: Pixeldichte hoechstens 1,75, kleine Schattenkarte, keine Nachbearbeitung.
import { spiele as klang } from "./ton.js";
import * as THREE from "./vendor/three.module.js";

// gleiche Farben wie die Namenspunkte (style.css: f0-f3 fest, ab f4 hsl(188 + 47*k, 85%, 62%))
const FARBEN_SP = [0xff5fae, 0x3fd0ff, 0xffd23f, 0x5ef08a,
  ...Array.from({ length: 16 }, (_, k) => new THREE.Color().setHSL(((188 + 47 * k) % 360) / 360, 0.85, 0.62).getHex())];
const FELDFARBE = { m: 0x2fbf62, v: 0xe0464e, t: 0xf39c2b, a: 0xf39c2b, e: 0x4a7dff, d: 0xa84bff, l: 0x18b6b0 };
const SYMBOL = { m: "🪙", v: "💸", t: "🍺", a: "🎯", e: "❓", d: "⚔️", l: "🛒" };   // a = Aufgabenfeld (Trinkfeld ohne Trinken)

let g = null;

function emojiTextur(text, groesse = 128) {
  const c = document.createElement("canvas"); c.width = c.height = groesse;
  const x = c.getContext("2d");
  x.font = `${groesse * 0.7}px sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(text, groesse / 2, groesse / 2 + groesse * 0.05);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function schriftTextur(text, farbe) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128;
  const x = c.getContext("2d");
  x.font = "900 72px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.lineWidth = 12; x.strokeStyle = "#000a"; x.strokeText(text, 128, 66);
  x.fillStyle = farbe; x.fillText(text, 128, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function wuerfelTexturen() {
  const punkte = { 1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]],
    5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.28, .24], [.72, .24], [.28, .5], [.72, .5], [.28, .76], [.72, .76]] };
  // Reihenfolge der Wuerfelseiten in three.js: +x, -x, +y, -y, +z, -z
  return [1, 6, 2, 5, 3, 4].map((zahl) => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d");
    x.fillStyle = "#fffaf0"; x.fillRect(0, 0, 128, 128);
    x.fillStyle = zahl === 1 ? "#e11d48" : "#1b1c2e";
    punkte[zahl].forEach(([px, py]) => { x.beginPath(); x.arc(px * 128, py * 128, 12, 0, 7); x.fill(); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 });
  });
}
// Drehung, damit die geworfene Zahl oben liegt (Seite +y)
const WUERFEL_OBEN = { 1: [0, 0, Math.PI / 2], 6: [0, 0, -Math.PI / 2], 2: [0, 0, 0], 5: [Math.PI, 0, 0], 3: [-Math.PI / 2, 0, 0], 4: [Math.PI / 2, 0, 0] };

function figurBauen(farbe) {
  const fig = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.35, metalness: 0.05, emissive: farbe, emissiveIntensity: 0.12 });
  const weiss = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const schwarz = new THREE.MeshStandardMaterial({ color: 0x15151f, roughness: 0.4 });
  const koerper = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.42, 6, 14), mat); koerper.position.y = 0.55;
  const kopf = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), mat); kopf.position.y = 1.18;
  const augen = new THREE.Group(); augen.position.set(0, 1.22, 0.24);
  for (const sx of [-0.1, 0.1]) {
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), weiss); a.position.x = sx;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), schwarz); p.position.set(sx, 0, 0.055);
    augen.add(a, p);
  }
  const muetze = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: farbe, emissiveIntensity: 0.25 }));
  muetze.position.y = 1.6; muetze.rotation.z = 0.18;
  const bommel = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), weiss); bommel.position.set(-0.04, 1.82, 0);
  const fuesse = [];
  for (const sx of [-0.13, 0.13]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), schwarz); f.scale.set(1, 0.6, 1.4); f.position.set(sx, 0.08, 0.04); fuesse.push(f); }
  fig.add(koerper, kopf, augen, muetze, bommel, ...fuesse);
  fig.traverse((o) => { o.castShadow = true; });
  return { fig, fuesse, koerper };
}

function aufbauen(muster, anzahlSpieler, brett) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0d0e1a, 28, 52);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 19, 19);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a1840, 1.1));
  const sonne = new THREE.DirectionalLight(0xffffff, 2.2);
  sonne.position.set(8, 16, 6); sonne.castShadow = true;
  sonne.shadow.mapSize.set(1024, 1024);
  Object.assign(sonne.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17 });
  scene.add(sonne);

  // Insel
  const insel = new THREE.Mesh(new THREE.CylinderGeometry(14.6, 13, 1.4, 64), new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.9 }));
  insel.position.y = -0.8; insel.receiveShadow = true; scene.add(insel);
  const erde = new THREE.Mesh(new THREE.CylinderGeometry(13, 9.5, 3, 64), new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 1 }));
  erde.position.y = -3; scene.add(erde);
  const wasser = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: 0x1b4f8a, roughness: 0.25, metalness: 0.2, transparent: true, opacity: 0.85 }));
  wasser.rotation.x = -Math.PI / 2; wasser.position.y = -2.2; scene.add(wasser);

  const lage = brett.lage.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const frei = (x, z, abst) => lage.every((p) => Math.hypot(p.x - x, p.z - z) > abst);
  // Deko: Baeume, Steine, ein Schloss in der Mitte (nie auf einem Feld)
  const baumStamm = new THREE.MeshStandardMaterial({ color: 0x7a4b25 });
  const baumKrone = new THREE.MeshStandardMaterial({ color: 0x2f9e4f, flatShading: true });
  const steinMat = new THREE.MeshStandardMaterial({ color: 0x8f8aa6, flatShading: true, roughness: 1 });
  for (let k = 0; k < 40; k++) {
    const a = k * 2.399, r = 2.4 + (k % 9) * 1.35;
    const x = Math.cos(a) * r * 1.05, z = Math.sin(a) * r * 0.85;
    if ((Math.abs(x) < 2.2 && Math.abs(z) < 2.2) || !frei(x, z, 1.45) || Math.hypot(x / 13.5, z / 12) > 1) continue;
    if (k % 4 === 3) { const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + (k % 3) * 0.1), steinMat); st.position.set(x, 0.1, z); st.castShadow = true; scene.add(st); continue; }
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.6), baumStamm); st.position.set(x, 0.3, z); st.castShadow = true; scene.add(st);
    const kr = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 7), baumKrone); kr.position.set(x, 1.2, z); kr.castShadow = true; scene.add(kr);
  }
  const burg = new THREE.Group();
  const stein = new THREE.MeshStandardMaterial({ color: 0xd9d2e9, roughness: 0.7 });
  const dach = new THREE.MeshStandardMaterial({ color: 0x6d5dfc, roughness: 0.5 });
  const haupt = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.2), stein); haupt.position.y = 0.8; burg.add(haupt);
  for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
    const turm = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 2.4, 12), stein); turm.position.set(x, 1.2, z); burg.add(turm);
    const spitze = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1, 12), dach); spitze.position.set(x, 2.9, z); burg.add(spitze);
  }
  burg.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  burg.position.set(1.6, 0, -1.4);
  scene.add(burg);

  // Felder
  const n = muster.length;
  const felder = [];
  for (let i = 0; i < n; i++) {
    const p = lage[i];
    const art = muster[i];
    const feld = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.35, 28),
      new THREE.MeshStandardMaterial({ color: FELDFARBE[art] || 0x888888, roughness: 0.4, emissive: FELDFARBE[art] || 0x888888, emissiveIntensity: 0.12 }));
    feld.position.copy(p); feld.position.y = 0.05; feld.castShadow = true; feld.receiveShadow = true;
    scene.add(feld);
    const sym = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTextur(SYMBOL[art] || "•"), transparent: true }));
    sym.scale.set(0.85, 0.85, 0.85); sym.position.set(p.x, 0.75, p.z);
    scene.add(sym);
    felder.push({ feld, sym, p });
  }
  // Wege zwischen den Feldern (entlang des Graphen; Abzweigungen in anderer Farbe)
  const wegMat = new THREE.MeshStandardMaterial({ color: 0xe8d9b0, roughness: 1 });
  const nebenMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, roughness: 1, emissive: 0x6b4a00, emissiveIntensity: 0.25 });
  brett.next.forEach((nx, i) => nx.forEach((j) => {
    const a = lage[i], b = lage[j];
    const mitte = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    const weg = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.5), nx.length > 1 || i >= 36 ? nebenMat : wegMat);
    weg.position.set(mitte.x, -0.08, mitte.z);
    weg.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    weg.receiveShadow = true; scene.add(weg);
  }));
  // Wegweiser an den Abzweigungen
  brett.next.forEach((nx, i) => {
    if (nx.length < 2) return;
    const schild = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTextur("🔀"), transparent: true }));
    schild.scale.set(0.9, 0.9, 0.9); schild.position.set(lage[i].x, 1.9, lage[i].z); scene.add(schild);
  });

  // Stern
  const sternForm = new THREE.Shape();
  for (let k = 0; k < 10; k++) { const r = k % 2 ? 0.32 : 0.75; const a = (k / 10) * Math.PI * 2 + Math.PI / 2; k ? sternForm.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sternForm.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const stern = new THREE.Mesh(new THREE.ExtrudeGeometry(sternForm, { depth: 0.25, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06 }),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb300, emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.3 }));
  stern.castShadow = true; scene.add(stern);
  const sternLicht = new THREE.PointLight(0xffd23f, 18, 6); scene.add(sternLicht);
  // Lichtsaeule ueber dem Stern (gut sichtbar aus der Ferne)
  const saeule = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 6, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(saeule);

  // Ring unter dem, der dran ist
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 10, 40), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  ring.rotation.x = -Math.PI / 2; scene.add(ring);

  // Spielfiguren
  const figuren = [];
  for (let j = 0; j < anzahlSpieler; j++) {
    const { fig, fuesse, koerper } = figurBauen(FARBEN_SP[j % FARBEN_SP.length]);
    scene.add(fig);
    figuren.push({ obj: fig, fuesse, koerper, anzeige: 0, pfad: [], huepfen: 0, blick: 0 });
  }

  // Wuerfel (bis zu drei)
  const wuerfelMat = wuerfelTexturen();
  const wuerfel = [0, 1, 2].map(() => { const w = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), wuerfelMat); w.castShadow = true; w.visible = false; scene.add(w); return w; });

  // Funken
  const funken = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true }));
  scene.add(funken);

  g = { renderer, scene, camera, felder, figuren, stern, sternLicht, saeule, ring, wuerfel, funken, n, wurfSchluessel: null, wurfStart: 0, wurfZahlen: [1],
    funkenZeit: 0, uhr: new THREE.Clock(), container: null, aktiv: 0, laeuft: false, schweber: [], fallenObj: {}, effektNr: null, lage };
}

function funkenAn(pos, farbe = null) {
  const N = 140, p = new Float32Array(N * 3), c = new Float32Array(N * 3), v = [];
  for (let i = 0; i < N; i++) {
    p.set([pos.x, pos.y + 1, pos.z], i * 3);
    const col = farbe !== null ? new THREE.Color().setHSL(farbe + Math.random() * 0.08, 0.95, 0.6) : new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
    c.set([col.r, col.g, col.b], i * 3);
    v.push(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 7 + 2, (Math.random() - 0.5) * 6));
  }
  g.funken.geometry.setAttribute("position", new THREE.BufferAttribute(p, 3));
  g.funken.geometry.setAttribute("color", new THREE.BufferAttribute(c, 3));
  g.funkenV = v; g.funkenZeit = 1.6; g.funken.material.opacity = 1;
}
// schwebender Text ueber einer Figur ("+3 🪙")
function schweben(text, farbe, pos) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: schriftTextur(text, farbe), transparent: true, depthWrite: false }));
  sp.scale.set(2.2, 1.1, 1); sp.position.set(pos.x, pos.y + 2.4, pos.z);
  g.scene.add(sp); g.schweber.push({ sp, t: 0 });
}

function schleife() {
  if (!g || !g.laeuft) return;
  requestAnimationFrame(schleife);
  if (!g.container || !g.container.isConnected) return;
  const dt = Math.min(0.05, g.uhr.getDelta());
  const t = g.uhr.elapsedTime;
  // Figuren laufen Feld fuer Feld den Weg entlang (huepfend, wackelnd, Blick in Laufrichtung)
  g.figuren.forEach((f, j) => {
    const laufend = f.pfad.length > 0;
    let a = g.lage[f.anzeige], b = laufend ? g.lage[f.pfad[0]] : a;
    if (laufend) {
      f.huepfen += dt * (f.sprung ? 1.6 : 3.4);
      if (f.huepfen >= 1) { f.huepfen = 0; f.anzeige = f.pfad.shift(); klang("schritt"); a = g.lage[f.anzeige]; b = f.pfad.length ? g.lage[f.pfad[0]] : a; }
    }
    const k = f.pfad.length ? f.huepfen : 0;
    const versatz = new THREE.Vector3(Math.cos(j * 1.57 + 0.6) * 0.42, 0, Math.sin(j * 1.57 + 0.6) * 0.42);
    f.obj.position.lerpVectors(a, b, k).add(versatz);
    const hoch = f.sprung ? 3.2 : 0.9;
    f.obj.position.y = 0.22 + Math.sin(k * Math.PI) * hoch + (j === g.aktiv && !f.pfad.length ? Math.abs(Math.sin(t * 3.2)) * 0.12 : 0);
    if (f.pfad.length) f.blick = Math.atan2(b.x - a.x, b.z - a.z);
    else if (j === g.aktiv) f.blick += (Math.atan2(g.camera.position.x - f.obj.position.x, g.camera.position.z - f.obj.position.z) - f.blick) * Math.min(1, dt * 3);
    f.obj.rotation.y = f.blick;
    f.obj.rotation.z = f.pfad.length ? Math.sin(k * Math.PI * 2) * 0.12 : Math.sin(t * 1.4 + j) * 0.03;
    f.fuesse.forEach((fu, x) => { fu.position.z = 0.04 + (f.pfad.length ? Math.sin(k * Math.PI * 2 + x * Math.PI) * 0.12 : 0); });
    const ziel = j === g.aktiv ? 1.15 : 1;
    f.obj.scale.setScalar(f.obj.scale.x + (ziel - f.obj.scale.x) * Math.min(1, dt * 6));
    if (!f.pfad.length) f.sprung = false;
  });
  // Ring unter dem Aktiven
  const akt = g.figuren[g.aktiv];
  if (akt) { g.ring.position.set(akt.obj.position.x, 0.26, akt.obj.position.z); g.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.08); g.ring.material.color.setHex(FARBEN_SP[g.aktiv % FARBEN_SP.length]); }
  // Stern dreht sich, Lichtsaeule pulsiert
  g.stern.rotation.y += dt * 1.6;
  g.stern.position.y = 1.5 + Math.sin(t * 2) * 0.15;
  g.sternLicht.position.copy(g.stern.position).y += 0.6;
  g.saeule.position.set(g.stern.position.x, 3, g.stern.position.z);
  g.saeule.material.opacity = 0.12 + Math.sin(t * 2.4) * 0.05;
  // Fallen wippen
  Object.values(g.fallenObj).forEach((o, k) => { o.rotation.y += dt * 0.8; o.position.y = 0.6 + Math.sin(t * 3 + k) * 0.05; });
  // Wuerfel
  const w = (performance.now() - g.wurfStart) / 1000;
  g.wuerfel.forEach((wu, k) => {
    if (!wu.visible) return;
    if (w < 0.9) { wu.rotation.x += dt * (14 + k * 3); wu.rotation.y += dt * (11 - k * 2); wu.position.y = 4.2 + Math.sin(w * Math.PI) * 1.4; }
    else { const [rx, ry, rz] = WUERFEL_OBEN[g.wurfZahlen[k] || 1]; wu.rotation.set(rx, ry + t * 0.4, rz); wu.position.y = 4.2; }
    if (w > 4) wu.visible = false;
  });
  // Funken
  if (g.funkenZeit > 0 && g.funkenV) {
    g.funkenZeit -= dt;
    const pos = g.funken.geometry.getAttribute("position");
    g.funkenV.forEach((v, i) => { v.y -= 9.8 * dt; pos.array[i * 3] += v.x * dt; pos.array[i * 3 + 1] += v.y * dt; pos.array[i * 3 + 2] += v.z * dt; });
    pos.needsUpdate = true; g.funken.material.opacity = Math.max(0, g.funkenZeit / 1.6);
  }
  // schwebende Texte steigen und verblassen
  g.schweber = g.schweber.filter((x) => {
    x.t += dt;
    x.sp.position.y += dt * 1.1;
    x.sp.material.opacity = Math.max(0, 1 - x.t / 1.8);
    if (x.t > 1.8) { g.scene.remove(x.sp); x.sp.material.map.dispose(); x.sp.material.dispose(); return false; }
    return true;
  });
  // Kamera folgt sanft dem aktiven Spieler
  const ziel = akt ? akt.obj.position : new THREE.Vector3();
  const kamZiel = new THREE.Vector3(ziel.x * 0.22, 23.5, ziel.z * 0.22 + 20);
  g.camera.position.lerp(kamZiel, Math.min(1, dt * 1.5));
  g.camera.lookAt(ziel.x * 0.25, 0, ziel.z * 0.25 + 0.8);
  g.renderer.render(g.scene, g.camera);
}

// brett = { lage: [{x, z}], next: [[...]], waren }  (aus brett.js)
export function brett3dZeigen(container, s, muster, brett) {
  // neu bauen, wenn sich Spielerzahl oder Felder aendern (ohne Trinken: Aufgabenfelder statt Trinkfelder)
  if (g && (g.figuren.length !== s.pos.length || g.muster !== muster)) { try { g.renderer.dispose(); } catch (e) { /* egal */ } g = null; }
  try {
    if (!g) { aufbauen(muster, s.pos.length, brett); g.muster = muster; }
  } catch (e) {
    console.warn("3D nicht verfuegbar - flaches Brett", e);
    g = null;
    return false;
  }
  g.container = container;
  container.insertBefore(g.renderer.domElement, container.firstChild);
  const breite = container.clientWidth || 360;
  g.renderer.setSize(breite, breite * 0.82, false);
  g.renderer.domElement.style.width = "100%"; g.renderer.domElement.style.height = "auto";
  g.camera.aspect = 1 / 0.82; g.camera.updateProjectionMatrix();
  // Zustand uebernehmen: neuer Zug -> Figur laeuft den Weg (s.spur), sonst direkt hinhuepfen
  s.pos.forEach((p, j) => {
    const f = g.figuren[j];
    if (f.erst === undefined) { f.erst = true; f.anzeige = p; f.ziel = p; return; }
    if (s.spur && s.spur.j === j && s.spur.nr !== f.spurNr) {
      f.spurNr = s.spur.nr;
      const weg = s.spur.felder.slice(1);
      if (s.spur.sprung) { f.pfad = [p]; f.sprung = true; }
      else {
        const k = weg.lastIndexOf(p);
        f.pfad = k >= 0 ? weg.slice(0, k + 1) : [...weg, p];
        if (f.pfad[f.pfad.length - 1] !== p) f.pfad.push(p);
      }
      f.ziel = p;
    } else if (f.ziel !== p) {
      const lauf = f.pfad.length ? f.pfad[f.pfad.length - 1] : f.anzeige;
      if (lauf !== p) { f.pfad = [p]; f.sprung = true; }
      f.ziel = p;
    }
  });
  g.aktiv = s.dran;
  const sp = g.felder[s.stern].p; g.stern.position.x = sp.x; g.stern.position.z = sp.z;
  // Fallen
  const fallen = s.fallen || {};
  Object.keys(g.fallenObj).forEach((k) => { if (!(k in fallen)) { g.scene.remove(g.fallenObj[k]); delete g.fallenObj[k]; } });
  Object.keys(fallen).forEach((k) => {
    if (g.fallenObj[k] || !g.felder[k]) return;
    const o = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTextur("🪤"), transparent: true }));
    o.scale.set(0.8, 0.8, 0.8); const p = g.felder[k].p; o.position.set(p.x + 0.45, 0.6, p.z + 0.35);
    g.scene.add(o); g.fallenObj[k] = o;
  });
  // Wuerfel: so viele, wie geworfen wurden
  const zahlen = s.wuerfe && s.wuerfe.length ? s.wuerfe : s.wurf ? [s.wurf] : null;
  const schluessel = zahlen ? `${s.runde}-${s.dran}-${zahlen.join("+")}-${s.spur ? s.spur.nr : 0}` : null;
  if (schluessel && schluessel !== g.wurfSchluessel) {
    g.wurfSchluessel = schluessel; g.wurfStart = performance.now(); g.wurfZahlen = zahlen.map((z) => Math.min(6, z));
    g.wuerfel.forEach((wu, k) => { wu.visible = k < zahlen.length; wu.position.x = (k - (zahlen.length - 1) / 2) * 1.6; wu.position.z = 0; });
    klang("wuerfel");
  }
  // Effekte zum letzten Ereignis (einmal je Ereignis)
  const zielPos = (j) => { const p = g.lage[s.pos[j]]; return new THREE.Vector3(p.x, 0, p.z); };
  if (s.effekt && s.effekt.nr !== g.effektNr) {
    const e = s.effekt;
    if (g.effektNr !== null) {
      const verzug = s.spur && s.spur.j === e.j ? Math.min(4, (s.spur.felder.length - 1)) * 300 + 250 : 0;
      setTimeout(() => {
        if (!g) return;
        const p = zielPos(e.j);
        if (e.art === "muenzen") { schweben(`${e.wert > 0 ? "+" : "−"}${Math.abs(e.wert)} 🪙`, e.wert > 0 ? "#ffd23f" : "#ff6b6b", p); funkenAn(p, e.wert > 0 ? 0.13 : 0.0); }
        else if (e.art === "stern") { funkenAn(p); schweben("+1 ⭐", "#ffe27a", p); }
        else if (e.art === "ereignis") { funkenAn(p, 0.62); schweben("❓", "#9fb8ff", p); }
        else if (e.art === "falle") schweben("🪤", "#ffffff", p);
        else funkenAn(p, 0.8);
      }, verzug);
    }
    g.effektNr = e.nr;
  }
  const sternSchluessel = s.sterne.join(",");
  if (g.sterneAlt !== undefined && g.sterneAlt !== sternSchluessel && !(s.effekt && s.effekt.art === "stern")) funkenAn(zielPos(s.dran));
  g.sterneAlt = sternSchluessel;
  if (!g.laeuft) { g.laeuft = true; schleife(); }
  return true;
}
