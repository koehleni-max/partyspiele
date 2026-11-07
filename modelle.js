// Echte 3D-Modelle fuer das Partybrett (Runde 5, Nico 06.11.2026: "alles was ingame ist hat texturen und modelle und keine
// platzhalter"). Welche Datei wozu gehoert, steht in modelle/katalog.json; Herkunft und Lizenz in LIZENZEN.md.
// Geladen wird erst, wenn die Karte feststeht (vorladen). Fehlt eine Datei oder klappt das Laden nicht, bleibt das Spiel
// spielbar: wer die Modelle braucht, fragt mit hat() nach und behaelt sonst seine einfache Form.
import * as THREE from "./vendor/three.module.js";

let katalog = null, katalogLaden = null, addons = null, addonsLaden = null;
const fertig = new Map();    // Name -> { szene, clips, box, groesse }
const laeuft = new Map();    // Name -> Promise
const fehler = [];
const stand = { dateien: 0, ms: 0 };
const NATURFARBE = { leafsGreen: 0x3f9e3f, leafsDark: 0x2c7a3a, grass: 0x4faa3f, stone: 0x9b9a9f, dirt: 0x8a6a4e, woodBark: 0x7c5233, woodBarkDark: 0x5e3d28 };

function addonsHolen() {
  if (!addonsLaden) {
    addonsLaden = Promise.all([import("./vendor/addons/loaders/GLTFLoader.js"), import("./vendor/addons/utils/SkeletonUtils.js")])
      .then(([l, s]) => { addons = { GLTFLoader: l.GLTFLoader, SkeletonUtils: s }; return addons; })
      .catch((e) => { fehler.push("Zusatzmodule: " + e.message); return null; });
  }
  return addonsLaden;
}
function katalogHolen() {
  if (!katalogLaden) {
    katalogLaden = fetch(new URL("./modelle/katalog.json", import.meta.url)).then((r) => r.json())
      .then((k) => { katalog = k; return k; }).catch((e) => { fehler.push("Katalog: " + e.message); return null; });
  }
  return katalogLaden;
}
function eineDatei(name, pfad) {
  if (fertig.has(name)) return Promise.resolve(fertig.get(name));
  if (laeuft.has(name)) return laeuft.get(name);
  const p = new addons.GLTFLoader().loadAsync(new URL("./modelle/" + pfad, import.meta.url).href).then((gltf) => {
    const szene = gltf.scene;
    // die Dateien lassen den Metallwert weg, das heisst laut glTF "ganz Metall": Baeume spiegelten den blauen Himmel
    // Das Naturpaket ist tuerkis eingefaerbt; fuer einen einheitlichen Look bekommt es die Farben der Welt (Stoffnamen aus den Dateien)
    szene.traverse((o) => {
      if (!o.isMesh) return;
      o.material.metalness = 0; o.material.roughness = Math.max(0.7, o.material.roughness);
      if (pfad.startsWith("nature-kit/") && NATURFARBE[o.material.name] !== undefined) o.material.color.setHex(NATURFARBE[o.material.name]);
    });
    szene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(szene), groesse = box.getSize(new THREE.Vector3());
    const m = { szene, clips: gltf.animations || [], box, groesse };
    fertig.set(name, m); stand.dateien++;
    return m;
  }).catch((e) => { fehler.push(`${pfad}: ${e.message || e}`); return null; });
  laeuft.set(name, p);
  return p;
}

// Alles fuer eine Welt laden. namen: zusaetzliche Eintraege (z. B. die Figuren der Spieler)
export async function vorladen(welt, figuren = 4) {
  const t0 = performance.now();
  const [k, a] = await Promise.all([katalogHolen(), addonsHolen()]);
  if (!k || !a) return false;
  const namen = [...(k.welten.alle || []), ...(k.welten[welt] || [])];
  const auftraege = namen.map((n) => eineDatei(n, k.modelle[n]));
  for (let j = 0; j < Math.min(figuren, k.figuren.length); j++) auftraege.push(eineDatei("figur" + j, k.figuren[j]));
  await Promise.all(auftraege);
  stand.ms = Math.round(performance.now() - t0);
  return true;
}

export const hat = (name) => fertig.has(name);
export const standLesen = () => ({ ...stand, geladen: fertig.size, fehler: fehler.slice() });
export const figurenAnzahl = () => (katalog ? katalog.figuren.length : 0);

// Massstab, der das Modell auf die Hoehe (oder ersatzweise Breite) bringt
function massstab(m, hoehe, breite) {
  if (hoehe) return hoehe / Math.max(0.001, m.groesse.y);
  if (breite) return breite / Math.max(0.001, m.groesse.x, m.groesse.z);
  return 1;
}

// Eigenstaendige Kopie: Unterkante auf y = 0, Mitte auf der Achse, Schatten an
export function stueck(name, { hoehe = 0, breite = 0, schatten = true } = {}) {
  const m = fertig.get(name);
  if (!m) return null;
  const gr = new THREE.Group(), kopie = m.szene.clone(true), s = massstab(m, hoehe, breite);
  const mitte = m.box.getCenter(new THREE.Vector3());
  kopie.position.set(-mitte.x * s, -m.box.min.y * s, -mitte.z * s); kopie.scale.setScalar(s);
  gr.add(kopie);
  gr.traverse((o) => { if (o.isMesh) { o.castShadow = schatten; o.receiveShadow = true; } });
  gr.userData.modell = name;
  return gr;
}

// Viele gleiche Modelle mit wenigen Zeichenaufrufen: je Teilnetz des Modells ein InstancedMesh.
// liste: [{ p, s, ry, rz }], s ist ein Faktor auf die Zielhoehe; material(alt) darf Materialien tauschen
const _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
export function vieleStuecke(name, liste, { hoehe = 1, breite = 0, schatten = true, material = null } = {}) {
  const m = fertig.get(name);
  if (!m || !liste.length) return [];
  const grund = massstab(m, hoehe, breite), mitte = m.box.getCenter(new THREE.Vector3()), netze = [];
  m.szene.traverse((o) => { if (o.isMesh) netze.push(o); });
  const fuss = new THREE.Matrix4().makeTranslation(-mitte.x, -m.box.min.y, -mitte.z);
  return netze.map((netz) => {
    const im = new THREE.InstancedMesh(netz.geometry, material ? material(netz.material) : netz.material, liste.length);
    const innen = new THREE.Matrix4().multiplyMatrices(fuss, netz.matrixWorld);
    liste.forEach((x, i) => {
      const f = grund * (typeof x.s === "number" ? x.s : 1);
      _q.setFromEuler(_e.set(0, x.ry || 0, x.rz || 0));
      _m.compose(x.p, _q, _s.set(f, f, f));
      im.setMatrixAt(i, _t.multiplyMatrices(_m, innen));
    });
    im.castShadow = schatten; im.receiveShadow = true; im.userData.modell = name;
    im.frustumCulled = false;
    return im;
  });
}

// Spielerfarbe auf die Kleidung: in der Farbtabelle der Figuren sind die bunten Spalten die Kleidung, Haut bleibt
const _farbKarten = new Map();
function farbKarte(alt, farbe) {
  const key = farbe;
  if (_farbKarten.has(key)) return _farbKarten.get(key);
  const bild = alt.image, w = bild.width, h = bild.height;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(bild, 0, 0);
  const daten = x.getImageData(0, 0, w, h), d = daten.data, f = new THREE.Color(farbe), hsl = {};
  f.getHSL(hsl, THREE.SRGBColorSpace);
  // zweites Band der Tabelle (y 50-75 %): Spalten 12,5-62,5 % = gruen, gelb, orange, rot, blau; 75-100 % = lila
  const bunt = (px, py) => py >= h * 0.5 && py < h * 0.75 && px >= w * 0.125 && !(px >= w * 0.75 && px < w * 0.875);
  const hilf = new THREE.Color();
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    if (!bunt(px, py)) continue;
    const i = (py * w + px) * 4;
    hilf.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace);
    const l = {}; hilf.getHSL(l, THREE.SRGBColorSpace);
    hilf.setHSL(hsl.h, Math.max(0.55, hsl.s), Math.min(0.72, Math.max(0.3, hsl.l + (l.l - 0.55) * 0.8)), THREE.SRGBColorSpace);
    const o = {}; hilf.getRGB(o, THREE.SRGBColorSpace);
    d[i] = o.r * 255; d[i + 1] = o.g * 255; d[i + 2] = o.b * 255;
  }
  x.putImageData(daten, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = alt.flipY; t.magFilter = alt.magFilter; t.minFilter = alt.minFilter;
  t.wrapS = alt.wrapS; t.wrapT = alt.wrapT;
  _farbKarten.set(key, t);
  return t;
}

// Figur mit Knochen und Bewegungen: { wurzel, kopf, mixer, aktionen }. Eigene Kopie je Spieler (SkeletonUtils)
export function figur(nr, farbe, hoehe = 1.3) {
  const m = fertig.get("figur" + nr);
  if (!m || !addons) return null;
  const kopie = addons.SkeletonUtils.clone(m.szene), s = hoehe / Math.max(0.001, m.groesse.y);
  const wurzel = new THREE.Group();
  kopie.scale.setScalar(s); kopie.position.y = -m.box.min.y * s; wurzel.add(kopie);
  let kopf = null;
  kopie.traverse((o) => {
    if (o.name === "head" && !o.isMesh) kopf = o;
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const mat = o.material.clone();
      if (mat.map) mat.map = farbKarte(mat.map, farbe);
      o.material = mat;
    }
  });
  const mixer = new THREE.AnimationMixer(kopie), aktionen = {};
  m.clips.forEach((c) => { aktionen[c.name] = mixer.clipAction(c); });
  return { wurzel, kopf, mixer, aktionen, hoehe };
}

// Nachbearbeitung: Leuchten nur fuer Helles. null, wenn die Zusatzmodule fehlen
export async function nachbearbeitungModule() {
  try {
    const [c, r, u, o] = await Promise.all([import("./vendor/addons/postprocessing/EffectComposer.js"), import("./vendor/addons/postprocessing/RenderPass.js"),
      import("./vendor/addons/postprocessing/UnrealBloomPass.js"), import("./vendor/addons/postprocessing/OutputPass.js")]);
    return { EffectComposer: c.EffectComposer, RenderPass: r.RenderPass, UnrealBloomPass: u.UnrealBloomPass, OutputPass: o.OutputPass };
  } catch (e) { fehler.push("Nachbearbeitung: " + e.message); return null; }
}
