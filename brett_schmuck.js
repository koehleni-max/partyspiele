// Das Aussehen der Bretter (Runde 5): selbst gemalte Texturen fuer Boden, Wasser, Lava und Himmel, dazu das Einsetzen der echten
// Modelle (modelle.js) anstelle der einfachen Formen aus brett3d.js. Die einfachen Formen bleiben der Rueckfallweg, falls die
// Dateien nicht laden - sie werden hier nur ausgeblendet, nie geloescht.
import * as THREE from "./vendor/three.module.js";
import * as MD from "./modelle.js";

// ---------------------------------------------------------------- Rauschen und Texturen
const rnd = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
// kachelbares Wertrauschen: Gitter der Groesse n wiederholt sich
function rauschen(u, v, n, s) {
  const x = u * n, y = v * n, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const a = (i, j) => rnd(((i % n) + n) % n, ((j % n) + n) % n, s);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (a(x0, y0) * (1 - sx) + a(x0 + 1, y0) * sx) * (1 - sy) + (a(x0, y0 + 1) * (1 - sx) + a(x0 + 1, y0 + 1) * sx) * sy;
}
const fbm = (u, v, n, s, stufen = 4) => { let w = 0, a = 0.5, f = n; for (let k = 0; k < stufen; k++) { w += a * rauschen(u, v, f, s + k); a *= 0.5; f *= 2; } return w / (1 - Math.pow(0.5, stufen)); };

const cache = new Map();
// Bild je Name nur einmal malen (das kostet Zeit beim Aufbau, gemessen 4 s bei jedem Brett), je Wiederholung eine leichte Kopie
function malen(name, w, fn, farbraum = true, wiederholung = 1) {
  const key = `${name}@${wiederholung}`;
  if (cache.has(key)) return cache.get(key);
  if (cache.has(name)) {
    const t = cache.get(name).clone();
    t.repeat.set(wiederholung, wiederholung); t.needsUpdate = true;
    cache.set(key, t);
    return t;
  }
  const c = document.createElement("canvas"); c.width = w; c.height = w;
  const x = c.getContext("2d"), bild = x.createImageData(w, w), d = bild.data;
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
    const o = fn(i / w, j / w), k = (j * w + i) * 4;
    d[k] = o[0]; d[k + 1] = o[1]; d[k + 2] = o[2]; d[k + 3] = o[3] === undefined ? 255 : o[3];
  }
  x.putImageData(bild, 0, 0);
  const t = new THREE.CanvasTexture(c);
  if (farbraum) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(wiederholung, wiederholung); t.anisotropy = 8;
  cache.set(name, t); cache.set(key, t);
  return t;
}
const mix = (a, b, t) => a + (b - a) * t;
const hexRgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
// Hoehenbild -> Normalenkarte
function normalen(key, w, hoehe, staerke, wiederholung) {
  if (cache.has(key)) return malen(key, w, null, false, wiederholung);
  const H = new Float32Array(w * w);   // jede Hoehe einmal rechnen statt viermal
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) H[j * w + i] = hoehe(i / w, j / w);
  const an = (i, j) => H[((j + w) % w) * w + ((i + w) % w)];
  return malen(key, w, (u, v) => {
    const i = Math.round(u * w), j = Math.round(v * w), dx = (an(i + 1, j) - an(i - 1, j)) * staerke, dy = (an(i, j + 1) - an(i, j - 1)) * staerke;
    const l = Math.hypot(dx, dy, 1);
    return [(-dx / l * 0.5 + 0.5) * 255, (dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255];
  }, false, wiederholung);
}

// Boden je Welt: Grundfarbe mit Flecken und Halmen (gras), Steinplatten (innen), Asche (vulkan)
export function bodenMaterial(L, R) {
  const [r, gr, b] = hexRgb(L.gras), n = Math.max(6, Math.round(R / 2.6));
  const art = L.innen ? "platten" : L.lava ? "asche" : "gras";
  const hoehe = art === "platten"
    ? (u, v) => { const fu = (u * 4) % 1, fv = (v * 4) % 1; return Math.min(1, Math.min(fu, 1 - fu, fv, 1 - fv) * 60) * 0.5 + fbm(u, v, 16, 3, 2) * 0.1; }
    : (u, v) => fbm(u, v, art === "gras" ? 32 : 12, 7, 4);
  const map = malen(`boden-${art}-${L.gras}`, 256,(u, v) => {
    const f = fbm(u, v, 8, 1, 4), h = hoehe(u, v), hell = 0.72 + f * 0.42 + (h - 0.5) * 0.4;
    if (art === "gras") { const gelb = Math.max(0, fbm(u, v, 5, 9, 3) - 0.52) * 2.2; return [mix(r, r * 1.5 + 30, gelb) * hell, mix(gr, gr * 1.1, gelb) * hell, b * hell * 0.9]; }
    if (art === "asche") { const riss = Math.max(0, 0.05 - Math.abs(fbm(u, v, 6, 4, 3) - 0.5)) * 12; return [r * hell + riss * 120, gr * hell + riss * 30, b * hell]; }
    return [r * hell, gr * hell, b * hell];
  }, true, n);
  const normalMap = normalen(`boden-n-${art}`, 256,hoehe, art === "platten" ? 2.5 : 5, n);
  return new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: L.innen ? 0.32 : 0.95, metalness: 0 });
}
// Fels unter der Insel und am Vulkan
export function felsMaterial(farbe, wiederholung = 5) {
  const [r, gr, b] = hexRgb(farbe);
  const hoehe = (u, v) => Math.abs(fbm(u, v, 6, 11, 5) - 0.5) * 2;
  const map = malen(`fels-${farbe}`, 256,(u, v) => { const h = hoehe(u, v), k = 0.65 + h * 0.75; return [r * k, gr * k, b * k]; }, true, wiederholung);
  return new THREE.MeshStandardMaterial({ map, normalMap: normalen("fels-n", 256,hoehe, 7, wiederholung), roughness: 1 });
}
// Kaufhaus: Etagenwand mit Schaufenstern (leuchten abends), Rolltreppe mit Stufen
export function schaufensterMaterial(r) {
  const FARBEN = ["#ff5fae", "#3fd0ff", "#ffd23f", "#5ef08a", "#a84bff", "#ff8a3a"];
  const baue = (leuchten) => {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 128;
    const x = c.getContext("2d");
    x.fillStyle = leuchten ? "#000" : "#d9d0ea"; x.fillRect(0, 0, 1024, 128);
    for (let k = 0; k < 6; k++) {
      const l = k * 170 + 10;
      x.fillStyle = leuchten ? "#ffd9a0" : "#fff1d6"; x.fillRect(l, 30, 150, 90);
      if (!leuchten) { x.fillStyle = "#b9a98a"; for (let w = 0; w < 4; w++) x.fillRect(l + 10 + w * 36, 78 - (w % 2) * 14, 26, 42 + (w % 2) * 14); }
      x.fillStyle = FARBEN[k]; x.fillRect(l - 4, 8, 158, 22);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.x = Math.max(2, Math.round(r / 3)); t.anisotropy = 8;
    return t;
  };
  return new THREE.MeshStandardMaterial({ map: baue(false), emissive: 0xffffff, emissiveMap: baue(true), emissiveIntensity: 0.9, roughness: 0.4 });
}
export function rolltreppeMaterial() {
  const t = malen("rolltreppe", 64, (u, v) => { const k = (v * 4) % 1; return k < 0.14 ? [255, 214, 90] : k < 0.5 ? [120, 128, 150] : [84, 90, 110]; }, true);
  const m = new THREE.MeshStandardMaterial({ map: t, metalness: 0.3, roughness: 0.45 });
  return m;
}
export function sandMaterial() {
  const hoehe = (u, v) => fbm(u, v, 32, 25, 3);
  return new THREE.MeshStandardMaterial({ map: malen("sand", 256, (u, v) => { const k = 0.82 + hoehe(u, v) * 0.32; return [236 * k, 210 * k, 150 * k]; }, true, 12), normalMap: normalen("sand-n", 256, hoehe, 3, 12), roughness: 1 });
}
export function wegMaterial(farbe) {
  const [r, gr, b] = hexRgb(farbe);
  const hoehe = (u, v) => fbm(u, v, 16, 21, 3);
  return new THREE.MeshStandardMaterial({ map: malen(`weg-${farbe}`, 256, (u, v) => { const k = 0.7 + hoehe(u, v) * 0.55; return [r * k, gr * k, b * k]; }), normalMap: normalen("weg-n", 256, hoehe, 4, 1), roughness: 0.95 });
}
export function holzMaterial(farbe = 0x8a5a33) {
  const [r, gr, b] = hexRgb(farbe);
  return new THREE.MeshStandardMaterial({ map: malen(`holz-${farbe}`, 256, (u, v) => { const m = fbm(u * 0.25, v, 16, 31, 3), k = 0.72 + Math.sin((v + m * 0.25) * 60) * 0.1 + m * 0.3; return [r * k, gr * k, b * k]; }), roughness: 0.82 });
}
// Bewegtes Wasser: zwei Karten, die im Bild gegeneinander laufen (fliess in g, siehe fliessen)
export function wasserMaterial(farbe, R) {
  const [r, gr, b] = hexRgb(farbe), n = Math.max(3, Math.round(R * 0.2));
  const hoehe = (u, v) => fbm(u, v, 20, 41, 4);
  const map = malen(`wasser-${farbe}`, 256,(u, v) => { const k = 0.82 + fbm(u, v, 4, 45, 3) * 0.3 + hoehe(u, v) * 0.14; return [r * k, gr * k, b * k]; }, true, n);
  const normalMap = normalen("wasser-n", 256,hoehe, 6, n).clone();
  normalMap.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.16, metalness: 0.25, transparent: true, opacity: 0.92 });
  m.userData.fliess = [{ t: map, x: 0.006, y: 0.004 }, { t: normalMap, x: -0.009, y: 0.007 }];
  return m;
}
// Lava: dunkle Kruste, helle Risse, die leuchten (das Leuchten kommt ueber die Emissionskarte und nur dort)
export function lavaMaterial(R, staerke = 2.6) {
  const n = Math.max(2, Math.round(R / 12));
  // weite Flaechen Kruste, darin Adern; der langsame Anteil bricht das Kachelmuster
  const riss = (u, v) => { const a = Math.abs(fbm(u, v, 12, 51, 4) - 0.5) * 2, weit = Math.min(1, Math.max(0, fbm(u, v, 3, 53, 3) * 2.4 - 0.75)); return Math.pow(Math.max(0, 1 - a * 3.6), 2) * weit; };
  const map = malen("lava", 256,(u, v) => { const k = riss(u, v), f = fbm(u, v, 10, 57, 3) * 40; return [mix(44 + f, 255, k), mix(20 + f * 0.4, 150, k), mix(14, 30, k)]; }, true, n);
  const glut = malen("lava-glut", 256,(u, v) => { const k = riss(u, v); return [255 * k, 120 * k * k, 18 * k]; }, true, n);
  const m = new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: glut, emissiveIntensity: staerke, roughness: 0.75 });
  m.userData.fliess = [{ t: map, x: 0.004, y: 0.006 }, { t: glut, x: 0.004, y: 0.006 }];
  return m;
}
export function fliessen(g, dt) {
  (g.fliess || []).forEach((f) => { f.t.offset.x += f.x * dt; f.t.offset.y += f.y * dt; });
}

// ---------------------------------------------------------------- Himmel
const HIMMEL = {
  tag: { oben: [78, 150, 232], unten: [205, 233, 250], sonne: [255, 244, 214], wolke: 0.75 },
  abend: { oben: [64, 62, 138], unten: [255, 158, 96], sonne: [255, 196, 120], wolke: 0.55 },
  nacht: { oben: [10, 10, 34], unten: [38, 34, 78], sonne: [230, 230, 255], wolke: 0.12, sterne: true },
  glut: { oben: [34, 12, 12], unten: [150, 52, 20], sonne: [255, 120, 50], wolke: 0.3, sterne: false },
};
function himmelTextur(art) {
  const key = "himmel-" + art;
  if (cache.has(key)) return cache.get(key);
  const h = HIMMEL[art], w = 512, hh = 256;
  const c = document.createElement("canvas"); c.width = w; c.height = hh;
  const x = c.getContext("2d"), bild = x.createImageData(w, hh), d = bild.data;
  for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) {
    const u = i / w, v = j / hh, k = (j * w + i) * 4;
    const t = Math.min(1, Math.max(0, (0.52 - v) / 0.46)), s = Math.pow(1 - t, 2.2);
    const wolke = Math.max(0, fbm(u, v * 2.2, 8, 61, 5) - 0.5) * 3.2 * h.wolke * (v < 0.5 ? 1 : 0);
    const stern = h.sterne && v < 0.5 && rnd(i, j, 5) > 0.9985 ? 200 : 0;
    const o = [0, 1, 2].map((q) => mix(mix(h.oben[q], h.unten[q], s), 255, Math.min(1, wolke)) + stern);
    d[k] = o[0]; d[k + 1] = o[1]; d[k + 2] = o[2]; d[k + 3] = 255;
  }
  x.putImageData(bild, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
  cache.set(key, t);
  return t;
}
export const himmelFarbe = (art) => new THREE.Color().setRGB(...HIMMEL[art].unten.map((x) => x / 255), THREE.SRGBColorSpace);
// Spiegelungen fuer alle Oberflaechen kommen aus demselben Himmel (je Art einmal gerechnet, je Renderer)
export function himmelSetzen(g, art) {
  if (g.himmelArt === art) return;
  g.himmelArt = art;
  const t = himmelTextur(art);
  g.scene.background = t;
  g.himmelEnv = g.himmelEnv || {};
  if (!g.himmelEnv[art]) {
    const p = new THREE.PMREMGenerator(g.renderer);
    g.himmelEnv[art] = p.fromEquirectangular(t).texture; p.dispose();
  }
  g.scene.environment = g.himmelEnv[art];
  g.scene.environmentIntensity = art === "tag" ? 0.3 : 0.25;
  if (g.scene.fog) g.scene.fog.color.copy(himmelFarbe(art));
}

// ---------------------------------------------------------------- Modelle einsetzen
export const UNSICHTBAR = new THREE.MeshBasicMaterial({ visible: false });
const HOEHE = { tanne: 2.9, laub: 2.6, palme: 3.4, kahl: 2.3, stein: 0.8, busch: 0.8, blume: 0.42, pilz: 0.5, grab: 0.85, kuerbis: 0.78, glut: 0.5, gras: 0.32 };
const SORTEN = { tanne: ["tanne1", "tanne2", "tanne3"], laub: ["laub1", "laub2", "laub3"], stein: ["stein1", "stein2", "stein3"], busch: ["busch1", "busch2"],
  blume: ["blume1", "blume2", "blume3"], pilz: ["pilz1", "pilz2"], grab: ["grab1", "grab2", "grab3", "grab4"], kuerbis: ["kuerbis1", "kuerbis2"], kahl: ["kahl1", "kahl2"], glut: ["stein3"] };
const dunkler = (farbe) => (alt) => { const m = alt.clone(); m.color = new THREE.Color(farbe); return m; };

// Leuchten: Modellkopie mit eigener Leuchtfarbe (nur die helle Sache leuchtet, das Leuchten kommt von der Stufe)
function leuchtend(o, farbe, staerke) {
  o.traverse((x) => { if (x.isMesh) { x.material = x.material.clone(); x.material.emissive = new THREE.Color(farbe); x.material.emissiveMap = x.material.map; x.material.emissiveIntensity = staerke; } });
  return o;
}
function tauschen(mesh, kind) { mesh.material = UNSICHTBAR; mesh.add(kind); mesh.castShadow = false; }
const ausblenden = (o) => { o.visible = false; };

function dekoSetzen(g, c) {
  const { scene, liste, sorte } = c;
  const palmen = c.hafen;
  const netze = [];
  Object.entries(SORTEN).forEach(([typ, namen]) => {
    const l = liste[typ] || [];
    const nutzen = palmen && typ === "laub" ? ["palme1", "palme2", "laub1", "laub3"] : c.vulkan && typ === "kahl" ? ["stumpf"] : namen;
    nutzen.forEach((n, k) => {
      const teil = l.filter((_, i) => i % nutzen.length === k);
      const hoehe = n.startsWith("palme") ? HOEHE.palme : n === "stumpf" ? 0.9 : HOEHE[typ];
      // Vulkan: Steine ohne Grasdecke, Baumreste verkohlt; Glutbrocken nur schwach (hell ist die Lava)
      const material = c.vulkan && (typ === "stein" || typ === "busch" || typ === "glut") ? dunkler(0x5a4640) : c.vulkan && typ === "kahl" ? dunkler(0x2a1d18) : (sorte && sorte[typ]) || null;
      netze.push(...MD.vieleStuecke(n, teil, { hoehe, material }));
    });
  });
  // Blumen: kleine Gruppen; Grasbueschel ueberall, wo nichts anderes steht
  const blumen = (liste.blume || []).flatMap((b, i) => [0, 1, 2].map((k) => ({ p: b.p.clone().add(new THREE.Vector3(Math.cos(k * 2.1 + i) * 0.3, 0, Math.sin(k * 2.1 + i) * 0.3)), s: 0.9 + rnd(i, k, 2) * 0.4, ry: i + k })));
  ["blume1", "blume2", "blume3"].forEach((n, k) => netze.push(...MD.vieleStuecke(n, blumen.filter((_, i) => i % 3 === k), { hoehe: HOEHE.blume, schatten: false })));
  if (c.gruen && MD.hat("gras1")) {
    const bueschel = [];
    for (let k = 0; k < Math.round(420 * c.W * c.W); k++) {
      const a = rnd(k, 1, 3) * 6.283, r = Math.sqrt(rnd(k, 2, 3)) * c.R * 0.92, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (c.frei(x, z, 1.05)) bueschel.push({ p: new THREE.Vector3(x, -0.12, z), s: 0.8 + rnd(k, 3, 3) * 0.8, ry: rnd(k, 4, 3) * 6.28 });
    }
    netze.push(...MD.vieleStuecke("gras1", bueschel, { hoehe: HOEHE.gras, schatten: false }));
  }
  netze.forEach((m) => scene.add(m));
}

// Turm aus Stockwerken: die Teile stehen aufeinander, alle im gleichen Massstab
function stapel(namen, breite) {
  const gr = new THREE.Group();
  let y = 0;
  namen.forEach((n) => { const o = MD.stueck(n, { breite }); if (!o) return; o.position.y = y; gr.add(o); y += new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y * 0.985; });
  gr.userData.hoehe = y;
  return gr;
}
function burgBauen(mitte) {
  const d = 1.55;
  [[-d, -d], [d, -d], [-d, d], [d, d]].forEach(([x, z]) => {
    const t = stapel(["turm_fuss", "turm_mitte", "turm_dach"], 1.15); t.position.set(x, 0, z); mitte.add(t);
  });
  const haupt = stapel(["turm_fuss", "turm_haupt", "turm_mitte", "turm_haube"], 2.0); haupt.position.set(0, 0, -0.2); mitte.add(haupt);
  // die Mauerstuecke und das Tor liegen in den Dateien laengs der z-Achse
  [[0, -d, Math.PI / 2], [-d, 0, 0], [d, 0, 0]].forEach(([x, z, ry]) => { const m = MD.stueck("mauer", { breite: 2.2 }); if (m) { m.position.set(x, 0, z); m.rotation.y = ry; mitte.add(m); } });
  const tor = MD.stueck("burgtor", { breite: 2.2 }); if (tor) { tor.position.set(0, 0, d); tor.rotation.y = Math.PI / 2; mitte.add(tor); }
  const f = MD.stueck("fahne", { hoehe: 0.9 }); if (f) { f.position.set(0, haupt.userData.hoehe - 0.05, -0.2); mitte.add(f); }
}
function spukBauen(mitte) {
  mitte.add(stapel(["gruft", "gruft_dach"], 3.2));
  [[-2.5, 0.6, 0.7], [2.5, 0.6, -0.7]].forEach(([x, z, ry]) => { const k = stapel(["gruft_klein", "gruft_klein_dach"], 1.5); k.position.set(x, 0, z); k.rotation.y = ry; mitte.add(k); });
  [[-1.7, 2.3], [1.7, 2.3]].forEach(([x, z]) => { const l = MD.stueck("laterne_spuk", { hoehe: 2 }); if (l) { l.position.set(x, 0, z); mitte.add(l); } });
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + 0.3, z = MD.stueck("zaun_spuk", { breite: 1.2 }); if (z && Math.abs(a - Math.PI / 2) > 0.5) { z.position.set(Math.cos(a) * 3.6, 0, Math.sin(a) * 3.2); z.rotation.y = -a + Math.PI / 2; mitte.add(z); } }
  [[-2.7, -1.6], [2.7, -1.6]].forEach(([x, z]) => { const k = MD.stueck("feuerkorb", { hoehe: 0.9 }); if (k) { k.position.set(x, 0, z); mitte.add(leuchtend(k, 0xff7a1a, 1.2)); } });
}
function brunnenBauen(mitte) {
  const b = MD.stueck("brunnen", { breite: 7 }); if (b) mitte.add(b);
}
function hafenSetzen(g, c) {
  const { scene, R } = c;
  const turm = MD.stueck("leuchtturm", { hoehe: 6 });
  if (turm) { turm.position.copy(c.LEUCHTTURM); scene.add(turm); }
  const lampe = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffd76a, emissiveIntensity: 3 }));
  lampe.position.copy(c.LEUCHTTURM).setY(6.2); lampe.userData.grundform = "Leuchtfeuer: reines Licht"; scene.add(lampe);
  [["schiff", R + 7, 6, 7, 1.1], ["schiff", -R - 8, -9, 7, -0.6], ["schiff_klein", 8, R + 7, 4, 2.4], ["schiff_klein", -14, R + 5, 4, 0.8]].forEach(([n, x, z, breite, ry]) => {
    const s = MD.stueck(n, { breite }); if (s) { s.position.set(x, -2.25, z); s.rotation.y = ry; scene.add(s); g.schiffe.push(s); }
  });
  [[-9, R - 0.9, 0.3], [9, R - 0.9, -0.3]].forEach(([x, z, ry]) => { const s = MD.stueck("steg", { breite: 3 }); if (s) { s.position.set(x, -0.5, z); s.rotation.y = ry; scene.add(s); } });
  const kram = ["fass", "kiste", "kiste_flaschen", "fass", "kanone"], orte = c.platzSuchen(26, 1.3);
  orte.forEach((p, k) => { const n = kram[k % kram.length], o = MD.stueck(n, { hoehe: n === "kanone" ? 0.7 : 0.65 }); if (o) { o.position.copy(p); o.rotation.y = k * 1.9; scene.add(o); } });
}
function vulkanSetzen(g, c) {
  const { scene, BURG, GR } = c;
  const netze = [];
  [["fels1", 0], ["fels2", 1]].forEach(([n, k]) => {
    const l = [];
    for (let i = k; i < 26; i += 2) { const a = i * 0.71, r = (3.3 + rnd(i, 7, 4) * 1.6) * GR; const x = BURG.x + Math.cos(a) * r, z = BURG.z + Math.sin(a) * r; if (c.frei(x, z, 1.3)) l.push({ p: new THREE.Vector3(x, -0.1, z), s: 0.8 + rnd(i, 8, 4) * 1.1, ry: a }); }
    netze.push(...MD.vieleStuecke(n, l, { hoehe: 1.9, material: (alt) => { const m = alt.clone(); m.color = new THREE.Color(0x6a5048); return m; } }));
  });
  netze.forEach((m) => scene.add(m));
  // Lavapfuetzen in der Asche
  const pfuetze = lavaMaterial(14, 2.4);
  g.fliess.push(...pfuetze.userData.fliess);
  c.platzSuchen(9, 1.8).forEach((p, k) => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.7 + rnd(k, 1, 6) * 0.7, 18), pfuetze); m.rotation.x = -Math.PI / 2; m.position.copy(p).setY(-0.1); scene.add(m); });
}
function kaufhausSetzen(c) {
  const { scene, R, etagen } = c;
  const rand = R * 0.93;
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2 + 0.2, x = Math.cos(a) * rand, z = Math.sin(a) * rand;
    const s = MD.stueck(k % 2 ? "laterne" : "saeule", { hoehe: k % 2 ? 1.5 : 3.4 }); if (s) { s.position.set(x, -0.12, z); scene.add(k % 2 ? leuchtend(s, 0xffc070, 1.1) : s); }
  }
  // Pflanzkuebel und Warenkisten zwischen den Wegen
  c.platzSuchen(26, 1.2).forEach((p, k) => {
    const n = ["hecke", "fass", "busch1", "kiste"][k % 4], o = MD.stueck(n, { hoehe: n === "busch1" ? 0.9 : 0.7 });
    if (o) { o.position.copy(p); o.rotation.y = k * 1.3; scene.add(o); }
  });
  (etagen || []).forEach((e, n) => {
    const m = 12 - n * 3;
    for (let k = 0; k < m; k++) {
      const a = (k / m) * Math.PI * 2 + 0.1 + n, r = e.r - 0.35, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!c.frei(x, z, 1.0)) continue;
      const o = MD.stueck(k % 3 === 0 ? "banner" : k % 3 === 1 ? "laterne" : "hecke", { hoehe: k % 3 === 0 ? 1.5 : k % 3 === 1 ? 1.1 : 0.7 });
      if (o) { o.position.set(x, e.h - 0.12, z); o.rotation.y = -a + Math.PI / 2; scene.add(k % 3 === 1 ? leuchtend(o, 0xffc070, 1.1) : o); }
    }
  });
}

// Alles einsetzen; laeuft einmal, sobald die Dateien der Karte da sind. Liefert die Anzahl der eingesetzten Teile
export function schmuecken(g, c) {
  g.schiffe = [];
  dekoSetzen(g, c);
  c.deko.forEach(ausblenden);
  // Mitte
  if (c.mitteArt) {
    if (c.mitteArt !== "vulkan") c.mitte.children.slice().forEach(ausblenden);
    if (c.mitteArt === "burg") burgBauen(c.mitte);
    else if (c.mitteArt === "spuk") spukBauen(c.mitte);
    else if (c.mitteArt === "brunnen") brunnenBauen(c.mitte);
    else if (c.mitteArt === "vulkan") vulkanSetzen(g, c);
  }
  if (c.hafen) { if (c.leuchtturm) ausblenden(c.leuchtturm); hafenSetzen(g, c); }
  if (c.kaufhaus) kaufhausSetzen(c);
  // Geist
  if (g.geist && MD.hat("geist")) { g.geist.children.forEach(ausblenden); const o = MD.stueck("geist", { hoehe: 1.1, schatten: false }); if (o) { o.position.y = -0.3; g.geist.add(o); } }
  // Laeden, Truhen, Stacheln, Kristalle
  c.staende.forEach((st, k) => { const o = MD.stueck(k % 2 ? "stand_gruen" : "stand_rot", { breite: 1.5 }); if (o) { st.children.slice().forEach(ausblenden); st.add(o); } });
  g.truhen.forEach((x) => { const o = MD.stueck("truhe", { breite: 0.8 }); if (o) { x.t.children.slice().forEach(ausblenden); x.t.add(o); } });
  c.stacheln.forEach((s) => { const o = MD.stueck("stacheln", { breite: 1.0 }); if (o) { o.position.copy(s.p); o.rotation.y = s.ry; c.scene.add(o); s.alt.forEach(ausblenden); } });
  c.kristalle.forEach((k) => { const o = MD.stueck("juwel", { hoehe: 0.55 }); if (o) { o.position.y = -0.28; o.scale.y = 1 / 1.7; tauschen(k, leuchtend(o, 0xff4fa8, 1.4)); } });
  // Stern, Muenzen, Rohre
  [g.stern, g.feierStern].forEach((s) => { const o = MD.stueck("stern", { hoehe: 1.5 }); if (o) { o.position.y = -0.75; tauschen(s, leuchtend(o, 0xffb300, 1.5)); } });
  g.muenzen.forEach((x) => { const o = MD.stueck("muenze", { hoehe: 0.36, schatten: false }); if (o) { o.position.y = -0.18; tauschen(x.m, leuchtend(o, 0xffa800, 0.5)); } });
  g.rohre.forEach((r) => { const o = MD.stueck("rohr", { hoehe: 0.95 }); if (o) { r.children.slice().forEach(ausblenden); r.add(o); } });
  return true;
}

// Figur: Kenney-Figur statt Knubbel, Hut bleibt und wandert an den Kopf
export function figurTauschen(f, nr, farbe) {
  const m = MD.figur(nr, farbe, 1.3);
  if (!m) return false;
  f.k.children.slice().forEach((x) => { if (x !== f.hut) x.visible = false; });
  f.k.add(m.wurzel);
  f.modell = m; f.aktion = null;
  m.wurzel.updateMatrixWorld(true);
  if (m.kopf) {
    f.hut.position.y = 0.22;   // Hut sass auf dem Knubbel bei 1,1; der Kopf der Figur endet hoeher
    f.k.updateMatrixWorld(true);
    m.kopf.attach(f.hut);
  }
  figurAktion(f, "idle");
  return true;
}
const EINMAL = new Set(["jump", "emote-yes", "emote-no", "die"]);
export function figurAktion(f, name, tempo = 1) {
  const a = f.modell && f.modell.aktionen[name];
  if (!a) return;
  a.timeScale = tempo;
  if (f.aktion === name) return;
  const alt = f.modell.aktionen[f.aktion];
  a.reset(); a.setLoop(EINMAL.has(name) ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = EINMAL.has(name);
  a.play();
  if (alt) a.crossFadeFrom(alt, 0.18, false);
  f.aktion = name;
}
