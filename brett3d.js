// 3D-Ansicht fuer das Partybrett (three.js, liegt lokal in vendor/). Die Szene bleibt ueber Neuzeichnungen erhalten:
// das Canvas wird jeweils in den neuen Platzhalter umgehaengt, Figuren huepfen Feld fuer Feld zur neuen Position.
import { spiele as klang } from "./ton.js";
import * as THREE from "./vendor/three.module.js";

const FARBEN_SP = [0xff5fae, 0x3fd0ff, 0xffd23f, 0x5ef08a];
const FELDFARBE = { m: 0x2fbf62, v: 0xe0464e, t: 0xf39c2b, e: 0x4a7dff, d: 0xa84bff };
const SYMBOL = { m: "🪙", v: "💸", t: "🍺", e: "❓", d: "⚔️" };

let g = null;

function feldPos(i, n) {
  // Rundkurs als weiche, leicht gewellte Schleife
  const a = (i / n) * Math.PI * 2;
  const rx = 9.2, rz = 7.4;
  const x = Math.cos(a) * rx * (1 + 0.08 * Math.sin(a * 3));
  const z = Math.sin(a) * rz * (1 + 0.08 * Math.cos(a * 2));
  return new THREE.Vector3(x, 0, z);
}

function emojiTextur(text, groesse = 128) {
  const c = document.createElement("canvas"); c.width = c.height = groesse;
  const x = c.getContext("2d");
  x.font = `${groesse * 0.7}px sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(text, groesse / 2, groesse / 2 + groesse * 0.05);
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

function aufbauen(muster, anzahlSpieler) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0d0e1a, 26, 48);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 17, 17);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a1840, 1.1));
  const sonne = new THREE.DirectionalLight(0xffffff, 2.2);
  sonne.position.set(8, 16, 6); sonne.castShadow = true;
  sonne.shadow.mapSize.set(1024, 1024);
  Object.assign(sonne.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16 });
  scene.add(sonne);

  // Insel
  const insel = new THREE.Mesh(new THREE.CylinderGeometry(13.5, 12, 1.4, 64), new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.9 }));
  insel.position.y = -0.8; insel.receiveShadow = true; scene.add(insel);
  const erde = new THREE.Mesh(new THREE.CylinderGeometry(12, 9, 3, 64), new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 1 }));
  erde.position.y = -3; scene.add(erde);
  const wasser = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: 0x1b4f8a, roughness: 0.25, metalness: 0.2, transparent: true, opacity: 0.85 }));
  wasser.rotation.x = -Math.PI / 2; wasser.position.y = -2.2; scene.add(wasser);

  // Deko: Baeume, Steine, ein Schloss in der Mitte
  const baumStamm = new THREE.MeshStandardMaterial({ color: 0x7a4b25 });
  const baumKrone = new THREE.MeshStandardMaterial({ color: 0x2f9e4f, flatShading: true });
  for (let k = 0; k < 14; k++) {
    const a = k * 2.399, r = 2.5 + (k % 5) * 0.9;
    const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r * 0.9;
    if (Math.abs(x) < 2.2 && Math.abs(z) < 2.2) continue;
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
  scene.add(burg);

  // Felder
  const n = muster.length;
  const felder = [];
  for (let i = 0; i < n; i++) {
    const p = feldPos(i, n);
    const art = muster[i];
    const feld = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.35, 28),
      new THREE.MeshStandardMaterial({ color: FELDFARBE[art], roughness: 0.4, emissive: FELDFARBE[art], emissiveIntensity: 0.12 }));
    feld.position.copy(p); feld.position.y = 0.05; feld.castShadow = true; feld.receiveShadow = true;
    scene.add(feld);
    const sym = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTextur(SYMBOL[art]), transparent: true }));
    sym.scale.set(0.9, 0.9, 0.9); sym.position.set(p.x, 0.75, p.z);
    scene.add(sym);
    felder.push({ feld, sym, p });
  }
  // Weg zwischen den Feldern
  const wegMat = new THREE.MeshStandardMaterial({ color: 0xe8d9b0, roughness: 1 });
  for (let i = 0; i < n; i++) {
    const a = felder[i].p, b = felder[(i + 1) % n].p;
    const mitte = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    const weg = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.5), wegMat);
    weg.position.set(mitte.x, -0.08, mitte.z);
    weg.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    weg.receiveShadow = true; scene.add(weg);
  }

  // Stern
  const sternForm = new THREE.Shape();
  for (let k = 0; k < 10; k++) { const r = k % 2 ? 0.32 : 0.75; const a = (k / 10) * Math.PI * 2 + Math.PI / 2; k ? sternForm.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sternForm.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const stern = new THREE.Mesh(new THREE.ExtrudeGeometry(sternForm, { depth: 0.25, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06 }),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb300, emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.3 }));
  stern.castShadow = true; scene.add(stern);
  const sternLicht = new THREE.PointLight(0xffd23f, 18, 6); scene.add(sternLicht);

  // Spielfiguren
  const figuren = [];
  for (let j = 0; j < anzahlSpieler; j++) {
    const fig = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: FARBEN_SP[j], roughness: 0.3, metalness: 0.1, emissive: FARBEN_SP[j], emissiveIntensity: 0.15 });
    const fuss = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.2, 20), mat); fuss.position.y = 0.1;
    const koerper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.75, 20), mat); koerper.position.y = 0.55;
    const kopf = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), mat); kopf.position.y = 1.08;
    fig.add(fuss, koerper, kopf);
    fig.traverse((o) => { o.castShadow = true; });
    scene.add(fig);
    figuren.push({ obj: fig, anzeige: 0, ziel: 0, huepfen: 0 });
  }

  // Wuerfel
  const wuerfel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), wuerfelTexturen());
  wuerfel.castShadow = true; wuerfel.position.set(0, 4.2, 0); wuerfel.visible = false; scene.add(wuerfel);

  // Funken
  const funken = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true }));
  scene.add(funken);

  g = { renderer, scene, camera, felder, figuren, stern, sternLicht, wuerfel, funken, n, wurfSchluessel: null, wurfStart: 0, wurfZahl: 1,
    funkenZeit: 0, uhr: new THREE.Clock(), container: null, aktiv: 0, laeuft: false };
}

function funkenAn(pos) {
  const N = 140, p = new Float32Array(N * 3), c = new Float32Array(N * 3), v = [];
  for (let i = 0; i < N; i++) {
    p.set([pos.x, pos.y + 1, pos.z], i * 3);
    const col = new THREE.Color().setHSL(Math.random(), 0.9, 0.6); c.set([col.r, col.g, col.b], i * 3);
    v.push(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 7 + 2, (Math.random() - 0.5) * 6));
  }
  g.funken.geometry.setAttribute("position", new THREE.BufferAttribute(p, 3));
  g.funken.geometry.setAttribute("color", new THREE.BufferAttribute(c, 3));
  g.funkenV = v; g.funkenZeit = 1.6; g.funken.material.opacity = 1;
}

function schleife() {
  if (!g || !g.laeuft) return;
  requestAnimationFrame(schleife);
  if (!g.container || !g.container.isConnected) return;
  const dt = Math.min(0.05, g.uhr.getDelta());
  const t = g.uhr.elapsedTime;
  // Figuren huepfen Feld fuer Feld
  g.figuren.forEach((f, j) => {
    if (f.anzeige !== f.ziel) {
      f.huepfen += dt * 3.6;
      if (f.huepfen >= 1) { f.huepfen = 0; f.anzeige = (f.anzeige + 1) % g.n; klang("schritt"); }
    }
    const a = g.felder[f.anzeige].p, b = g.felder[(f.anzeige + (f.anzeige !== f.ziel ? 1 : 0)) % g.n].p;
    const k = f.anzeige !== f.ziel ? f.huepfen : 0;
    const versatz = new THREE.Vector3(Math.cos(j * 1.57) * 0.38, 0, Math.sin(j * 1.57) * 0.38);
    f.obj.position.lerpVectors(a, b, k).add(versatz);
    f.obj.position.y = 0.22 + Math.sin(k * Math.PI) * 1.1 + (j === g.aktiv ? Math.sin(t * 4) * 0.06 : 0);
    f.obj.scale.setScalar(j === g.aktiv ? 1.18 : 1);
  });
  // Stern dreht sich
  g.stern.rotation.y += dt * 1.6;
  g.stern.position.y = 1.5 + Math.sin(t * 2) * 0.15;
  g.sternLicht.position.copy(g.stern.position).y += 0.6;
  // Wuerfel
  if (g.wuerfel.visible) {
    const w = (performance.now() - g.wurfStart) / 1000;
    if (w < 0.9) { g.wuerfel.rotation.x += dt * 14; g.wuerfel.rotation.y += dt * 11; g.wuerfel.position.y = 4.2 + Math.sin(w * Math.PI) * 1.4; }
    else { const [rx, ry, rz] = WUERFEL_OBEN[g.wurfZahl]; g.wuerfel.rotation.set(rx, ry + t * 0.4, rz); g.wuerfel.position.y = 4.2; }
    if (w > 4) g.wuerfel.visible = false;
  }
  // Funken
  if (g.funkenZeit > 0 && g.funkenV) {
    g.funkenZeit -= dt;
    const pos = g.funken.geometry.getAttribute("position");
    g.funkenV.forEach((v, i) => { v.y -= 9.8 * dt; pos.array[i * 3] += v.x * dt; pos.array[i * 3 + 1] += v.y * dt; pos.array[i * 3 + 2] += v.z * dt; });
    pos.needsUpdate = true; g.funken.material.opacity = Math.max(0, g.funkenZeit / 1.6);
  }
  // Kamera folgt sanft dem aktiven Spieler
  const ziel = g.figuren[g.aktiv] ? g.figuren[g.aktiv].obj.position : new THREE.Vector3();
  const kamZiel = new THREE.Vector3(ziel.x * 0.3, 19.5, ziel.z * 0.3 + 17.5);
  g.camera.position.lerp(kamZiel, Math.min(1, dt * 1.5));
  g.camera.lookAt(ziel.x * 0.32, 0, ziel.z * 0.32 + 0.5);
  g.renderer.render(g.scene, g.camera);
}

export function brett3dZeigen(container, s, muster) {
  try {
    if (!g) aufbauen(muster, s.pos.length);
  } catch (e) {
    console.error(e);
    return false;
  }
  if (g.figuren.length !== s.pos.length) { g = null; aufbauen(muster, s.pos.length); }
  g.container = container;
  container.appendChild(g.renderer.domElement);
  const breite = container.clientWidth || 360;
  g.renderer.setSize(breite, breite * 0.82, false);
  g.renderer.domElement.style.width = "100%"; g.renderer.domElement.style.height = "auto";
  g.camera.aspect = 1 / 0.82; g.camera.updateProjectionMatrix();
  // Zustand uebernehmen
  s.pos.forEach((p, j) => { const f = g.figuren[j]; f.ziel = p; if (f.erst === undefined) { f.erst = true; f.anzeige = p; } });
  g.aktiv = s.dran;
  const sp = g.felder[s.stern].p; g.stern.position.x = sp.x; g.stern.position.z = sp.z;
  const schluessel = s.wurf ? `${s.runde}-${s.dran}-${s.wurf}-${s.pos.join(",")}` : null;
  if (schluessel && schluessel !== g.wurfSchluessel) {
    g.wurfSchluessel = schluessel; g.wurfStart = performance.now(); g.wurfZahl = s.wurf; g.wuerfel.visible = true; klang("wuerfel");
  }
  const sternSchluessel = s.sterne.join(",");
  if (g.sterneAlt !== undefined && g.sterneAlt !== sternSchluessel) funkenAn(g.felder[s.pos[s.dran]].p);
  g.sterneAlt = sternSchluessel;
  if (!g.laeuft) { g.laeuft = true; schleife(); }
  return true;
}
