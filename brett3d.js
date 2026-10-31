// 3D-Ansicht fuer das Partybrett (three.js, liegt lokal in vendor/). Die Szene bleibt ueber Neuzeichnungen erhalten:
// das Canvas wird jeweils in den neuen Platzhalter umgehaengt, Figuren laufen Feld fuer Feld den echten Weg entlang
// (auch durch Abzweigungen).
// Umbau 31.10.2026 abends (Nico: "Grafik verbessern, Kamerafahrten der jeweiligen Figuren - so nah wie moeglich am Original",
// gemeint ist die Art bekannter Party-Brettspiele; alles hier selbst gebaut, keine fremden Namen, Modelle, Texturen, Klaenge):
// - Kamera-Regie: Ueberflug zu Rundenbeginn, Fahrt zum Stern, Fahrt zur Figur bei Zugbeginn, Folgen beim Laufen, Schwenk an
//   der Abzweigung, Nahaufnahme bei Ereignis/Stern/Laden/Duell. Jede Fahrt unter 2 s je Abschnitt, ein Tipp aufs Bild
//   ueberspringt sie. Schalter "Kamera folgt / Ganzes Brett" oben rechts (gemerkt). Bei "weniger Bewegung" im System: ganzes
//   Brett ohne Fahrten.
// - Welt je Aussehen: Halloween = Nacht mit Mond, Kuerbislaternen, Grabsteinen, kahlen Baeumen, Spukhaus mit Geist,
//   Fledermaeusen, Irrlichtern und Nebel; sonst Insel mit Tannen, Laubbaeumen, Burg, Gluehwuermchen.
// - Felder als Platten mit Symbol, Erdweg darunter, Trittsteine auf langen Wegen, Wegweiser an Abzweigungen, Ladenstaende.
// - Knubbelfiguren mit Gesicht, Armen und Hut: Laufen, Jubeln, Trauern, Blinzeln; der Wuerfelblock schwebt ueber dem Kopf
//   und wird angesprungen, danach zaehlt eine Zahl die restlichen Schritte herunter.
// - Gegenstands-Effekte: Muenzen fliegen (auch vom Bestohlenen zum Dieb), Schild-Blase, Sternenrohr, Tauschwirbel,
//   zuschnappende Falle; Siegerpodest nach Minispielen und am Ende.
// - Handy: automatische Qualitaetsstufen (Pixeldichte, Schatten, Lichter, Partikel). Faellt die Bildrate, geht es eine Stufe
//   herunter. Fest einstellbar fuer Tests ueber window.__brettQualitaet = "hoch" | "mittel" | "niedrig".
import { spiele as klang } from "./ton.js";
import * as THREE from "./vendor/three.module.js";

// gleiche Farben wie die Namenspunkte: die 20 festen Spielerfarben --s0 ... --s19 aus style.css (eine Quelle, 31.10.2026)
// (erst beim Aufbau gelesen, dann ist style.css sicher geladen)
const ERSATZ_SP = [0xff5fae, 0x3fd0ff, 0xffd23f, 0x5ef08a];
let FARBEN_SP = ERSATZ_SP;
function spielerFarbenLesen() {
  FARBEN_SP = Array.from({ length: 20 }, (_, j) => {
    const css = getComputedStyle(document.documentElement).getPropertyValue(`--s${j}`).trim();
    return css ? new THREE.Color(css).getHex() : ERSATZ_SP[j % 4];
  });
}
// Teil 4b: s = Stachelfeld, h = Heilquelle, k = Truhe, p = Portal, g = Glutfeld
const FELDFARBE = { m: 0x2fbf62, v: 0xe0464e, t: 0xf39c2b, a: 0xf39c2b, e: 0x4a7dff, d: 0xa84bff, l: 0x18b6b0, s: 0x8a2433, h: 0xff6fb8, k: 0xc8901e, p: 0x7b3bd1, g: 0xff4d00 };
const SYMBOL = { m: "🪙", v: "💸", t: "🍺", a: "🎯", e: "❓", d: "⚔️", l: "🛒", s: "🌵", h: "💖", k: "🧰", p: "🌀", g: "🔥" };   // a = Aufgabenfeld (Trinkfeld ohne Trinken)
const LP_MAX = 30;

let g = null;   // die eine Szene (bleibt ueber Neuzeichnungen erhalten)

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lsLesen = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSchreiben = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* privater Modus */ } };
const zufallFest = (k) => { const x = Math.sin(k * 91.7 + 13.1) * 43758.5453; return x - Math.floor(x); };
const sanft = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const FELD_OBEN = 0.19;          // Oberkante der Feldplatten
const PODEST = V(2.5, 0, 2.1);   // Siegertreppchen (frei von Feldern und Wegen, vor der Burg)
const BURG = V(1.6, 0, -1.4);

// ---------------------------------------------------------------- Qualitaetsstufen
const STUFEN = ["niedrig", "mittel", "hoch"];
const STUFE = {
  hoch: { pr: 2, schatten: 2048, lichter: 3, partikel: 1 },
  mittel: { pr: 1.5, schatten: 1024, lichter: 2, partikel: 0.6 },
  niedrig: { pr: 1, schatten: 0, lichter: 0, partikel: 0.3 },
};
function startStufe() {
  const vor = (typeof globalThis !== "undefined" && globalThis.__brettQualitaet) || lsLesen("pa_brett_qualitaet");
  if (STUFE[vor]) return { stufe: vor, fest: true };
  const handy = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || window.innerWidth < 700;
  return { stufe: handy ? "mittel" : "hoch", fest: false };
}
const wenigBewegung = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

// ---------------------------------------------------------------- Aussehen je Anlass
const LOOKS = {
  halloween: { nebel: 0x170d22, hemi: [0x9d8cff, 0x2a1206, 0.75], licht: [0xc4ccff, 1.7], lichtPos: [-8, 17, 6], gras: 0x3a5a2e, erde: 0x3b2416,
    wasser: 0x140c26, weg: 0x7a6650, krone: 0x1f3d2c, nacht: true, belichtung: 1.2 },
  edel: { nebel: 0x120c08, hemi: [0xffe2b0, 0x2a1a10, 0.95], licht: [0xffd9a0, 2.1], lichtPos: [9, 15, 5], gras: 0x2f6b45, erde: 0x5a3a22,
    wasser: 0x10243a, weg: 0xd8c39a, krone: 0x2a7a46, nacht: false, belichtung: 1.0 },
  normal: { nebel: 0x0d0e1a, hemi: [0xbfd4ff, 0x2a1840, 1.1], licht: [0xfff1dd, 2.3], lichtPos: [8, 16, 6], gras: 0x3f9a4a, erde: 0x6b4426,
    wasser: 0x1b4f8a, weg: 0xe8d9b0, krone: 0x2f9e4f, nacht: false, belichtung: 1.0 },
  // zweites Brett (Teil 4b): Vulkaninsel - Asche, Basalt, Lavameer, glimmende Steine; gilt unabhaengig vom Anlass
  vulkan: { nebel: 0x1c0c08, hemi: [0xffc29a, 0x2a0a05, 0.85], licht: [0xffd2a8, 1.9], lichtPos: [-7, 16, 7], gras: 0x5a4a44, erde: 0x2b1d19,
    wasser: 0x5a1600, weg: 0xb39472, krone: 0x3d5a2a, nacht: true, belichtung: 1.15, lava: true },
};
const lookVon = () => { const l = document.body && document.body.dataset.look; return LOOKS[l] ? l : "normal"; };

// ---------------------------------------------------------------- Texturen (selbst gemalt, je Art einmal)
const texCache = new Map();
function canvasTextur(key, w, h, malen) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  malen(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
const hex = (n) => "#" + n.toString(16).padStart(6, "0");
function feldTextur(art) {
  return canvasTextur("feld-" + art, 256, 256, (x, w) => {
    const m = w / 2;
    x.fillStyle = hex(FELDFARBE[art] || 0x888888); x.beginPath(); x.arc(m, m, m, 0, 7); x.fill();
    const gl = x.createRadialGradient(m * 0.8, m * 0.7, 8, m, m, m);
    gl.addColorStop(0, "#ffffff66"); gl.addColorStop(0.55, "#ffffff00"); gl.addColorStop(1, "#00000040");
    x.fillStyle = gl; x.beginPath(); x.arc(m, m, m, 0, 7); x.fill();
    x.lineWidth = 13; x.strokeStyle = "#ffffffd8"; x.beginPath(); x.arc(m, m, m - 15, 0, 7); x.stroke();
    x.lineWidth = 5; x.strokeStyle = "#00000038"; x.beginPath(); x.arc(m, m, m - 26, 0, 7); x.stroke();
    x.font = `${Math.round(w * 0.46)}px sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
    x.shadowColor = "#0009"; x.shadowBlur = 10; x.shadowOffsetY = 5;
    x.fillText(SYMBOL[art] || "•", m, m + w * 0.03);
  });
}
function emojiTextur(text, groesse = 128) {
  return canvasTextur("emo-" + text, groesse, groesse, (x) => {
    x.font = `${groesse * 0.7}px sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(text, groesse / 2, groesse / 2 + groesse * 0.05);
  });
}
// schwebende Texte werden nach dem Verblassen weggeworfen - deshalb ohne Zwischenspeicher
function schriftTextur(text, farbe) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128;
  const x = c.getContext("2d");
  x.font = "900 72px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.lineWidth = 12; x.strokeStyle = "#000a"; x.strokeText(text, 128, 66);
  x.fillStyle = farbe; x.fillText(text, 128, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Schrittzaehler ueber dem Kopf (runde Plakette mit Zahl)
function zahlTextur(n) {
  return canvasTextur("zahl-" + n, 128, 128, (x) => {
    x.fillStyle = "#1b1c2e"; x.beginPath(); x.arc(64, 64, 58, 0, 7); x.fill();
    x.lineWidth = 8; x.strokeStyle = "#ffffff"; x.stroke();
    x.font = "900 70px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#ffffff";
    x.fillText(String(n), 64, 68);
  });
}
// Lebenspunkte-Plakette: dunkle Pille mit rotem Balken und Zahl
function lpTextur(n) {
  return canvasTextur("lp-" + n, 160, 64, (x) => {
    x.fillStyle = "#1b1c2ee6"; x.beginPath(); x.roundRect(4, 8, 152, 48, 24); x.fill();
    x.fillStyle = "#3a1018"; x.beginPath(); x.roundRect(52, 20, 94, 24, 12); x.fill();
    x.fillStyle = n <= 10 ? "#ff3b3b" : "#ff6b81"; x.beginPath(); x.roundRect(52, 20, Math.max(8, 94 * n / LP_MAX), 24, 12); x.fill();
    x.font = "900 30px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#ffffff";
    x.fillText("❤", 28, 34); x.font = "900 22px sans-serif"; x.fillText(String(n), 99, 33);
  });
}
const weichTextur = () => canvasTextur("weich", 64, 64, (x) => {
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.3, "#ffffffaa"); gr.addColorStop(1, "#ffffff00");
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
});
// Kuerbis: Rillen und ein geschnitztes Gesicht nach vorn (+z liegt bei u = 0.25 der Kugel); das Gesicht leuchtet
function kuerbisTexturen() {
  const gesicht = (x, w, h, farbe) => {
    x.fillStyle = farbe;
    const cx = w * 0.25, cy = h * 0.5, s = w * 0.05;
    for (const sx of [-1, 1]) { x.beginPath(); x.moveTo(cx + sx * s * 1.6, cy - s * 1.7); x.lineTo(cx + sx * s * 0.5, cy - s * 0.4); x.lineTo(cx + sx * s * 2.6, cy - s * 0.4); x.closePath(); x.fill(); }
    x.beginPath(); x.moveTo(cx - s * 2.8, cy + s * 0.6);
    for (let k = 0; k <= 6; k++) x.lineTo(cx - s * 2.8 + k * s * 0.93, cy + s * (k % 2 ? 1.2 : 0.6) + s * 0.6 * Math.sin((k / 6) * Math.PI));
    x.lineTo(cx + s * 2.8, cy + s * 0.9); x.quadraticCurveTo(cx, cy + s * 3.4, cx - s * 2.8, cy + s * 0.9); x.closePath(); x.fill();
  };
  const map = canvasTextur("kuerbis", 512, 256, (x, w, h) => {
    x.fillStyle = "#e8721c"; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 16; k++) { x.fillStyle = k % 2 ? "#d2601200" : "#b8500f55"; x.fillRect((k / 16) * w, 0, w / 32, h); }
    gesicht(x, w, h, "#2a1000");
  });
  const glut = canvasTextur("kuerbis-glut", 512, 256, (x, w, h) => { x.fillStyle = "#000"; x.fillRect(0, 0, w, h); gesicht(x, w, h, "#ffb347"); });
  return { map, glut };
}
const streifenTextur = (a, b) => canvasTextur(`streifen-${a}-${b}`, 128, 32, (x) => { for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? b : a; x.fillRect(k * 16, 0, 16, 32); } });

function wuerfelMaterialien() {
  const punkte = { 1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]],
    5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.28, .24], [.72, .24], [.28, .5], [.72, .5], [.28, .76], [.72, .76]] };
  // Reihenfolge der Wuerfelseiten in three.js: +x, -x, +y, -y, +z, -z
  return [1, 6, 2, 5, 3, 4].map((zahl) => {
    const t = canvasTextur("wuerfel-" + zahl, 128, 128, (x) => {
      x.fillStyle = "#fffaf0"; x.fillRect(0, 0, 128, 128);
      x.lineWidth = 10; x.strokeStyle = "#e9dcc4"; x.strokeRect(5, 5, 118, 118);
      x.fillStyle = zahl === 1 ? "#e11d48" : "#1b1c2e";
      punkte[zahl].forEach(([px, py]) => { x.beginPath(); x.arc(px * 128, py * 128, 12, 0, 7); x.fill(); });
    });
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.18 });
  });
}
// Drehung, damit die geworfene Zahl nach vorn zeigt (Seite +z); danach wird der Block zur Kamera gedreht
const WUERFEL_VORN = { 3: [0, 0, 0], 4: [0, Math.PI, 0], 1: [0, -Math.PI / 2, 0], 6: [0, Math.PI / 2, 0], 2: [Math.PI / 2, 0, 0], 5: [-Math.PI / 2, 0, 0] };
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _vz = new THREE.Vector3(0, 0, 1);
// Zeitplan des Wurfs (Sekunden ab dem Wurf): Figur springt, trifft den Block, Zahl steht, dann geht es los
const WURF = { sprung: 0.08, treffer: 0.32, los: 0.95, weg: 1.25 };

// ---------------------------------------------------------------- Gruppen aus vielen gleichen Teilen (ein Zeichenaufruf)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
function instanzen(geo, mat, liste, schatten = true) {
  if (!liste.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, liste.length);
  liste.forEach((x, i) => {
    _q.setFromEuler(_e.set(x.rx || 0, x.ry || 0, x.rz || 0));
    if (typeof x.s === "number") _s.set(x.s, x.s, x.s); else _s.copy(x.s || V(1, 1, 1));
    _m.compose(x.p, _q, _s); im.setMatrixAt(i, _m);
    if (x.farbe !== undefined) im.setColorAt(i, new THREE.Color(x.farbe));
  });
  im.castShadow = schatten; im.receiveShadow = true;
  return im;
}

// ---------------------------------------------------------------- Figur
function figurBauen(farbe, look) {
  const fig = new THREE.Group();
  const k = new THREE.Group(); fig.add(k);                    // innen: Stauchen, Neigen
  const mat = new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.4, metalness: 0.05, emissive: farbe, emissiveIntensity: look === "halloween" ? 0.2 : 0.1 });
  const weiss = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const schwarz = new THREE.MeshStandardMaterial({ color: 0x15151f, roughness: 0.4 });
  const koerper = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), mat); koerper.scale.set(1, 1.08, 0.96); koerper.position.y = 0.62;
  const bauch = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshStandardMaterial({ color: new THREE.Color(farbe).lerp(new THREE.Color(0xffffff), 0.45), roughness: 0.5 }));
  bauch.scale.set(1, 1, 0.45); bauch.position.set(0, 0.44, 0.35);
  const augen = new THREE.Group(); augen.position.set(0, 0.8, 0.41);
  for (const sx of [-0.15, 0.15]) {
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), weiss); a.scale.set(0.9, 1.15, 0.55); a.position.x = sx;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), schwarz); p.position.set(sx, -0.01, 0.055);
    const glanz = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), weiss); glanz.position.set(sx + 0.02, 0.025, 0.1);
    augen.add(a, p, glanz);
  }
  const mund = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.026, 8, 16, Math.PI), schwarz); mund.position.set(0, 0.6, 0.47); mund.rotation.z = Math.PI;
  const wange = new THREE.MeshStandardMaterial({ color: 0xff7aa8, roughness: 0.6, transparent: true, opacity: 0.7 });
  const wangen = [-0.27, 0.27].map((sx) => { const w = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), wange); w.position.set(sx, 0.64, 0.42); w.rotation.y = sx * 1.4; return w; });
  // Arme an Schultergelenken (rotation.z: links negativ = nach aussen/oben, rechts positiv)
  const arme = [-1, 1].map((sx) => {
    const gelenk = new THREE.Group(); gelenk.position.set(sx * 0.45, 0.72, 0.02);
    const arm = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mat); arm.scale.set(0.8, 1.3, 0.8); arm.position.y = -0.17;
    gelenk.add(arm); gelenk.rotation.z = sx * 0.25; return gelenk;
  });
  const fuesse = [-0.17, 0.17].map((sx) => { const f = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), schwarz); f.scale.set(1, 0.55, 1.35); f.position.set(sx, 0.07, 0.05); return f; });
  // Hut: zu Halloween ein Hexenhut mit Band in Spielerfarbe, sonst ein Partyhut
  const hut = new THREE.Group();
  if (look === "halloween") {
    const dunkel = new THREE.MeshStandardMaterial({ color: 0x251a36, roughness: 0.7 });
    const krempe = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 24), dunkel); krempe.position.y = 1.16;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.09, 20), mat); band.position.y = 1.23;
    const spitze = new THREE.Mesh(new THREE.ConeGeometry(0.29, 0.66, 18), dunkel); spitze.position.set(0.03, 1.53, 0); spitze.rotation.z = -0.22;
    hut.add(krempe, band, spitze);
  } else {
    const party = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.44, 16), new THREE.MeshStandardMaterial({ map: streifenTextur("#ffffff", hex(farbe)), roughness: 0.5 }));
    party.position.y = 1.36; party.rotation.z = 0.15;
    const bommel = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), weiss); bommel.position.set(-0.03, 1.59, 0);
    hut.add(party, bommel);
  }
  k.add(koerper, bauch, augen, mund, ...wangen, ...arme, ...fuesse, hut);
  fig.traverse((o) => { o.castShadow = true; });
  return { obj: fig, k, fuesse, arme, augen, mund, hut };
}

// ---------------------------------------------------------------- Aufbau der Welt
function aufbauen(muster, anzahlSpieler, brett) {
  const look = lookVon(), vulkan = brett.welt === "vulkan", L = LOOKS[vulkan ? "vulkan" : look];
  const nh = brett.nh || 36;   // Felder der Hauptrunde (danach Abkuerzung/Umweg)
  const st = startStufe(), Q = STUFE[st.stufe];
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "default" });
  renderer.setPixelRatio(Math.min(Q.pr, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = L.belichtung;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(L.nebel, 28, 52);
  const camera = new THREE.PerspectiveCamera(42, 1 / 0.82, 0.1, 240);
  const mess = new THREE.PerspectiveCamera(42, 1 / 0.82, 0.1, 240);   // nur zum Rechnen (passt etwas ins Bild?)
  scene.add(new THREE.HemisphereLight(...L.hemi));
  const sonne = new THREE.DirectionalLight(L.licht[0], L.licht[1]);
  sonne.position.set(...L.lichtPos);
  sonne.castShadow = Q.schatten > 0;
  sonne.shadow.mapSize.set(Q.schatten || 1024, Q.schatten || 1024);
  Object.assign(sonne.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
  sonne.shadow.bias = -0.0006; sonne.shadow.normalBias = 0.03;
  scene.add(sonne);

  // ---- Insel: Grasdecke mit welligem Rand, felsige Erde darunter, Wasser mit Brandung
  const wellig = (geo, fels) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
      if (r < 0.5) continue;
      const a = Math.atan2(z, x);
      let f = 1 + 0.04 * Math.sin(a * 5 + 0.7) + 0.025 * Math.sin(a * 11 + 2.1) + 0.015 * Math.sin(a * 23);
      if (fels) f *= 1 + 0.05 * Math.sin(a * 7 + y * 3) + 0.035 * Math.sin(a * 13 - y * 5);
      p.setX(i, x * f); p.setZ(i, z * f);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const gras = new THREE.Mesh(wellig(new THREE.CylinderGeometry(14.6, 13.6, 1.0, 96, 1)), new THREE.MeshStandardMaterial({ color: L.gras, roughness: 0.95 }));
  gras.position.y = -0.62; gras.receiveShadow = true; scene.add(gras);
  const erde = new THREE.Mesh(wellig(new THREE.CylinderGeometry(13.3, 8.6, 3.4, 40, 3), true), new THREE.MeshStandardMaterial({ color: L.erde, roughness: 1, flatShading: true }));
  erde.position.y = -2.82; scene.add(erde);
  const wasser = new THREE.Mesh(new THREE.CircleGeometry(90, 64), L.lava
    ? new THREE.MeshStandardMaterial({ color: L.wasser, roughness: 0.6, emissive: 0xff3a00, emissiveIntensity: 0.55 })
    : new THREE.MeshStandardMaterial({ color: L.wasser, roughness: 0.18, metalness: 0.35, transparent: true, opacity: 0.9 }));
  wasser.rotation.x = -Math.PI / 2; wasser.position.y = -2.2; scene.add(wasser);
  const brandung = new THREE.Mesh(new THREE.RingGeometry(11.7, 13.0, 96), new THREE.MeshBasicMaterial({ color: L.lava ? 0xffb000 : 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }));
  brandung.rotation.x = -Math.PI / 2; brandung.position.y = -2.17; scene.add(brandung);

  const lage = brett.lage.map((p) => V(p.x, 0, p.z));
  const kanten = [];
  brett.next.forEach((nx, i) => nx.forEach((j) => kanten.push([i, j, nx.length > 1 || i >= nh])));
  const abstandWeg = (x, z) => {
    let d = Infinity;
    for (const [i, j] of kanten) {
      const a = lage[i], b = lage[j], vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / l2));
      d = Math.min(d, Math.hypot(a.x + vx * t - x, a.z + vz * t - z));
    }
    return d;
  };
  const frei = (x, z, abst) => abstandWeg(x, z) > abst && Math.hypot(x - BURG.x, z - BURG.z) > 2.7 && Math.hypot(x - PODEST.x, z - PODEST.z) > 2.1;

  // ---- Felder: Sockel in dunkler Feldfarbe, Platte mit Symbol (leuchtet nachts etwas)
  const n = muster.length;
  const sockelGeo = new THREE.CylinderGeometry(0.8, 0.88, 0.3, 28, 1, true);
  const deckelGeo = new THREE.CircleGeometry(0.8, 36); deckelGeo.rotateX(-Math.PI / 2);
  const matCache = {};
  const feldMat = (art) => matCache[art] || (matCache[art] = {
    sockel: new THREE.MeshStandardMaterial({ color: new THREE.Color(FELDFARBE[art] || 0x888888).multiplyScalar(0.5), roughness: 0.6 }),
    deckel: new THREE.MeshStandardMaterial({ map: feldTextur(art), roughness: 0.45, emissive: 0xffffff, emissiveMap: feldTextur(art), emissiveIntensity: L.nacht ? 0.3 : 0.1 }),
  });
  const felder = [];
  for (let i = 0; i < n; i++) {
    const p = lage[i], art = muster[i], fm = feldMat(art);
    const gr = new THREE.Group(); gr.position.set(p.x, 0, p.z);
    // Sockel ohne Deckel (die Platte ist der Deckel - zwei Flaechen uebereinander flimmern aus der Ferne)
    const sockel = new THREE.Mesh(sockelGeo, fm.sockel); sockel.position.y = FELD_OBEN - 0.15; sockel.castShadow = true; sockel.receiveShadow = true;
    const deckel = new THREE.Mesh(deckelGeo, fm.deckel); deckel.position.y = FELD_OBEN; deckel.receiveShadow = true;
    gr.add(sockel, deckel); scene.add(gr);
    felder.push({ gr, p, art, plopp: 0 });
  }
  // ---- Wege: Erdband unter den Feldern, Trittsteine auf langen Stuecken; Abkuerzung und Umweg golden
  const band = [], bandNeben = [], tritt = [];
  for (const [i, j, neben] of kanten) {
    const a = lage[i], b = lage[j], len = a.distanceTo(b), mitte = a.clone().add(b).multiplyScalar(0.5);
    (neben ? bandNeben : band).push({ p: V(mitte.x, -0.09, mitte.z), ry: -Math.atan2(b.z - a.z, b.x - a.x), s: V(len, 1, 1) });
    const stuecke = Math.floor((len - 1.6) / 0.55);
    for (let k = 1; k <= stuecke; k++) {
      const t = 0.8 / len + ((len - 1.6) / len) * (k / (stuecke + 1));
      tritt.push({ p: V(a.x + (b.x - a.x) * t, -0.02, a.z + (b.z - a.z) * t), ry: k * 1.3, s: 0.8 + zufallFest(i * 7 + k) * 0.3 });
    }
  }
  const bandGeo = new THREE.BoxGeometry(1, 0.06, 0.78);
  const wegMat = new THREE.MeshStandardMaterial({ color: L.weg, roughness: 1 });
  const nebenMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, roughness: 0.9, emissive: 0x6b4a00, emissiveIntensity: L.nacht ? 0.55 : 0.25 });
  [instanzen(bandGeo, wegMat, band, false), instanzen(bandGeo, nebenMat, bandNeben, false),
    instanzen(new THREE.CylinderGeometry(0.2, 0.24, 0.08, 9), new THREE.MeshStandardMaterial({ color: 0xbdb3a2, roughness: 1, flatShading: true }), tritt, false)]
    .forEach((x) => x && scene.add(x));
  // ---- Wegweiser an den Abzweigungen: Pfosten mit zwei Pfeilbrettern in die beiden Richtungen
  const holz = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffcf5a, roughness: 0.5, emissive: 0x6b4a00, emissiveIntensity: 0.4 });
  brett.next.forEach((nx, i) => {
    if (nx.length < 2) return;
    // im Zwickel zwischen den beiden Wegen (nicht vor der Figur)
    const p = lage[i], zwickel = nx.reduce((a, z) => a.add(lage[z].clone().sub(p).normalize()), V()).normalize();
    const pos = p.clone().addScaledVector(zwickel, 1.4);
    const schild = new THREE.Group(); schild.position.copy(pos);
    const pfahl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.5, 6), holz); pfahl.position.y = 0.6; schild.add(pfahl);
    nx.forEach((z, k) => {
      const ziel = lage[z], w = Math.atan2(ziel.z - pos.z, ziel.x - pos.x);
      const brettchen = new THREE.Group(); brettchen.position.y = 1.05 + k * 0.28; brettchen.rotation.y = -w;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.17, 0.05), k ? gold : holz); b.position.x = 0.28;
      const spitze = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.16, 3), k ? gold : holz); spitze.rotation.z = -Math.PI / 2; spitze.position.x = 0.66;
      brettchen.add(b, spitze); schild.add(brettchen);
    });
    schild.traverse((o) => { o.castShadow = true; });
    scene.add(schild);
  });
  // ---- Ladenstaende neben den Ladenfeldern (Theke mit gestreiftem Dach)
  const markise = new THREE.MeshStandardMaterial({ map: streifenTextur("#ffffff", look === "halloween" ? "#7b3bd1" : "#18b6b0"), roughness: 0.6 });
  const theke = new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.8 });
  felder.forEach((f, i) => {
    if (f.art !== "l") return;
    const nx = lage[brett.next[i][0]], vr = lage[(brett.next.findIndex((x) => x.includes(i)) + n) % n] || f.p;
    const dir = V(nx.x - vr.x, 0, nx.z - vr.z).normalize();
    let quer = V(-dir.z, 0, dir.x); if (quer.dot(V(f.p.x, 0, f.p.z)) < 0) quer.negate();
    const pos = f.p.clone().addScaledVector(quer, 1.35);
    const stand = new THREE.Group(); stand.position.copy(pos); stand.lookAt(f.p.x, 0, f.p.z);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.42, 0.38), theke); t.position.y = 0.21;
    const dach = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.62), markise); dach.position.set(0, 0.98, 0.08); dach.rotation.x = 0.25;
    const ps = [-0.44, 0.44].map((x) => { const pf = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 6), holz); pf.position.set(x, 0.48, -0.12); return pf; });
    const korb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa000, emissiveIntensity: 0.4 })); korb.position.set(0.2, 0.5, 0.05);
    stand.add(t, dach, ...ps, korb); stand.traverse((o) => { o.castShadow = true; });
    scene.add(stand);
  });
  // ---- Teil 4b: Beiwerk der neuen Felder - Truhe neben dem Truhenfeld, Leuchtring ums Portal, Kristall an der Heilquelle,
  //      Stacheln am Stachelfeld, Glutschein am Glutfeld (alles neben bzw. um das Feld, nie darauf)
  const aussenVon = (f) => { const q = V(f.p.x, 0, f.p.z); return q.lengthSq() > 0.01 ? q.normalize() : V(1, 0, 0); };
  const truheHolz = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.7 });
  const truheGold = new THREE.MeshStandardMaterial({ color: 0xffcf5a, roughness: 0.35, metalness: 0.6, emissive: 0x6b4a00, emissiveIntensity: 0.4 });
  const portalMat = new THREE.MeshStandardMaterial({ color: 0xb98cff, emissive: 0x7b3bd1, emissiveIntensity: 1.3, transparent: true, opacity: 0.9 });
  const kristallMat = new THREE.MeshStandardMaterial({ color: 0xff9fd6, emissive: 0xff4fa8, emissiveIntensity: 0.9, roughness: 0.2, transparent: true, opacity: 0.9 });
  const stachelMat = new THREE.MeshStandardMaterial({ color: 0x9aa0ad, metalness: 0.6, roughness: 0.35 });
  const portale = [], truhen = [];
  felder.forEach((f) => {
    const raus = aussenVon(f);
    if (f.art === "k") {
      const t = new THREE.Group(); t.position.copy(f.p).addScaledVector(raus, 1.15); t.lookAt(f.p.x, 0, f.p.z);
      const kasten = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.42), truheHolz); kasten.position.y = 0.18;
      const deckel = new THREE.Group(); deckel.position.set(0, 0.36, -0.21);
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.62, 12, 1, false, 0, Math.PI), truheHolz); d.rotation.z = Math.PI / 2; d.position.z = 0.21; deckel.add(d);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.06, 0.44), truheGold); band.position.y = 0.3;
      const schloss = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.04), truheGold); schloss.position.set(0, 0.3, 0.22);
      t.add(kasten, deckel, band, schloss); t.traverse((o) => { o.castShadow = true; });
      scene.add(t); truhen.push({ t, deckel, feld: felder.indexOf(f), auf: 0 });
    } else if (f.art === "p") {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 10, 40), portalMat); ring.rotation.x = -Math.PI / 2; ring.position.set(f.p.x, FELD_OBEN + 0.06, f.p.z);
      scene.add(ring); portale.push(ring);
    } else if (f.art === "h") {
      const k = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), kristallMat); k.scale.set(1, 1.7, 1); k.position.copy(f.p).addScaledVector(raus, 1.05).setY(0.45);
      k.castShadow = true; scene.add(k); portale.push(k);
    } else if (f.art === "s") {
      for (let x = -1; x <= 1; x++) {
        const st = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 6), stachelMat);
        const quer = V(-raus.z, 0, raus.x);
        st.position.copy(f.p).addScaledVector(raus, 0.98).addScaledVector(quer, x * 0.28).setY(0.21); st.castShadow = true; scene.add(st);
      }
    } else if (f.art === "g" && Q.lichter > 0) {
      const l = new THREE.PointLight(0xff5a00, 3.5, 3.2, 1.6); l.position.set(f.p.x, 0.5, f.p.z); scene.add(l);
    }
  });

  // ---- Deko (nie auf Feldern oder Wegen), je Aussehen
  const halloween = look === "halloween" && !vulkan;
  const liste = { tanne: [], laub: [], kahl: [], grab: [], kuerbis: [], stein: [], busch: [], pilz: [], blume: [], glut: [] };
  for (let k = 0; k < 120; k++) {
    const a = k * 2.399, r = 2.2 + (k % 13) * 0.93;
    const x = Math.cos(a) * r * 1.05, z = Math.sin(a) * r * 0.86;
    if (Math.hypot(x / 13.4, z / 12.2) > 1 || !frei(x, z, 1.25)) continue;
    const rnd = zufallFest(k), s = 0.8 + rnd * 0.45, p = V(x, 0, z), ry = rnd * 6.28;
    let typ = vulkan ? ["stein", "kahl", "glut", "stein", "busch", "kahl", "glut"][k % 7]
      : halloween ? ["grab", "kuerbis", "tanne", "grab", "kahl", "stein", "pilz"][k % 7] : ["tanne", "laub", "tanne", "stein", "busch", "laub", "blume"][k % 7];
    // hohe Baeume mit mehr Abstand zum Weg (sie verdecken sonst bei Nahaufnahmen die Figur) - dort lieber etwas Kleines
    if (["tanne", "laub", "kahl"].includes(typ) && !frei(x, z, 2.0)) typ = halloween ? "grab" : vulkan ? "glut" : "busch";
    if (vulkan && Math.hypot(x - BURG.x, z - BURG.z) < 3.4) continue;   // Vulkanfuss frei lassen
    liste[typ].push({ p, s, ry: typ === "kuerbis" ? (rnd - 0.5) * 0.9 : typ === "grab" ? (rnd - 0.5) * 0.6 : ry, rz: typ === "grab" ? (rnd - 0.5) * 0.18 : 0 });
  }
  // Kuerbislaternen (bzw. Blumen) am Wegrand, jedes fuenfte Feld
  for (let i = 0; i < Math.min(n, nh); i += 5) {
    const p = lage[i], aussen = V(p.x, 0, p.z).normalize(), q = p.clone().addScaledVector(aussen, 1.25);
    if (abstandWeg(q.x, q.z) > 0.9) liste[vulkan ? "glut" : halloween ? "kuerbis" : "blume"].push({ p: q, s: 1, ry: (zufallFest(i) - 0.5) * 0.6 });
  }
  const krone = new THREE.MeshStandardMaterial({ color: L.krone, flatShading: true, roughness: 0.9 });
  const stamm = new THREE.MeshStandardMaterial({ color: halloween ? 0x2e2320 : 0x7a4b25, roughness: 1 });
  const mitY = (geo, y) => { geo.translate(0, y, 0); return geo; };
  const teile = [
    [mitY(new THREE.CylinderGeometry(0.11, 0.15, 0.6, 6), 0.3), stamm, liste.tanne],
    [mitY(new THREE.ConeGeometry(0.66, 1.05, 7), 1.0), krone, liste.tanne],
    [mitY(new THREE.ConeGeometry(0.46, 0.8, 7), 1.55), krone, liste.tanne],
    [mitY(new THREE.CylinderGeometry(0.11, 0.15, 0.8, 6), 0.4), stamm, liste.laub],
    [mitY(new THREE.IcosahedronGeometry(0.62, 0), 1.25), new THREE.MeshStandardMaterial({ color: 0x3fae55, flatShading: true }), liste.laub],
    [mitY(new THREE.DodecahedronGeometry(0.36), 0.1), new THREE.MeshStandardMaterial({ color: halloween ? 0x5d5870 : 0x8f8aa6, flatShading: true, roughness: 1 }), liste.stein],
    [mitY(new THREE.IcosahedronGeometry(0.42, 0), 0.2), new THREE.MeshStandardMaterial({ color: 0x2f8a3e, flatShading: true }), liste.busch],
  ];
  if (halloween) {
    const grauStein = new THREE.MeshStandardMaterial({ color: 0x8c8a98, roughness: 0.95, flatShading: true });
    // halbe Scheibe als runder Grabstein-Kopf: Achse nach vorn (z), Rundung nach oben
    const halb = new THREE.CylinderGeometry(0.25, 0.25, 0.13, 14, 1, false, -Math.PI / 2, Math.PI); halb.rotateX(-Math.PI / 2); halb.translate(0, 0.62, 0);
    const ast = (len, rz, x, y) => { const g = new THREE.CylinderGeometry(0.025, 0.06, len, 5); g.translate(0, len / 2, 0); g.rotateZ(rz); g.translate(x, y, 0); return g; };
    const { map, glut } = kuerbisTexturen();
    const kuerbisGeo = new THREE.SphereGeometry(0.34, 18, 12); kuerbisGeo.scale(1, 0.78, 1); kuerbisGeo.translate(0, 0.26, 0);
    teile.push(
      [mitY(new THREE.BoxGeometry(0.5, 0.62, 0.13), 0.31), grauStein, liste.grab],
      [halb, grauStein, liste.grab],
      [mitY(new THREE.CylinderGeometry(0.07, 0.16, 1.5, 6), 0.75), stamm, liste.kahl],
      [ast(0.75, -0.85, 0.03, 1.0), stamm, liste.kahl],
      [ast(0.6, 0.95, -0.03, 0.75), stamm, liste.kahl],
      [ast(0.45, -0.3, 0.02, 1.4), stamm, liste.kahl],
      [kuerbisGeo, new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: glut, emissiveIntensity: 1.4, roughness: 0.7 }), liste.kuerbis],
      [mitY(new THREE.CylinderGeometry(0.035, 0.05, 0.14, 5), 0.56), new THREE.MeshStandardMaterial({ color: 0x4a5a22 }), liste.kuerbis],
      [mitY(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6), 0.15), new THREE.MeshStandardMaterial({ color: 0xe8e0d0 }), liste.pilz],
      [mitY(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.28), new THREE.MeshStandardMaterial({ color: 0x9b4dff, emissive: 0x9b4dff, emissiveIntensity: 0.9 }), liste.pilz],
    );
  } else if (vulkan) {
    // kahle, verkohlte Baeume und glimmende Lavabrocken
    const ast = (len, rz, x, y) => { const g = new THREE.CylinderGeometry(0.025, 0.06, len, 5); g.translate(0, len / 2, 0); g.rotateZ(rz); g.translate(x, y, 0); return g; };
    const kohle = new THREE.MeshStandardMaterial({ color: 0x1e1512, roughness: 1 });
    teile.push(
      [mitY(new THREE.CylinderGeometry(0.07, 0.16, 1.5, 6), 0.75), kohle, liste.kahl],
      [ast(0.75, -0.85, 0.03, 1.0), kohle, liste.kahl],
      [ast(0.6, 0.95, -0.03, 0.75), kohle, liste.kahl],
      [mitY(new THREE.DodecahedronGeometry(0.3), 0.12), new THREE.MeshStandardMaterial({ color: 0x3a1a10, emissive: 0xff4a00, emissiveIntensity: 0.9, flatShading: true, roughness: 0.8 }), liste.glut],
    );
  } else {
    const bluete = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222 });
    const bl = liste.blume.flatMap((b, i) => [0, 1, 2, 3].map((k) => ({ p: b.p.clone().add(V(Math.cos(k * 1.7 + i) * 0.28, 0, Math.sin(k * 1.7 + i) * 0.28)), s: 1, farbe: [0xff5fae, 0xffd23f, 0xffffff, 0xa84bff][(i + k) % 4] })));
    teile.push([mitY(new THREE.IcosahedronGeometry(0.09, 0), 0.12), bluete, bl]);
  }
  teile.forEach(([geo, mat, l]) => { const im = instanzen(geo, mat, l); if (im) scene.add(im); });
  // warme Lichter an einigen Kuerbissen (zu Halloween), Anzahl je Qualitaet
  const lichter = [];
  const lichtOrte = halloween ? liste.kuerbis.slice(0, 3).map((x) => x.p) : [];
  lichtOrte.forEach((p, k) => { const l = new THREE.PointLight(0xff8a2a, 7, 5.5, 1.6); l.position.set(p.x, 0.7, p.z); l.visible = k < Q.lichter; scene.add(l); lichter.push(l); });

  // ---- in der Mitte: Spukhaus (Halloween) oder Burg
  const mitte = new THREE.Group(); mitte.position.copy(BURG);
  const fensterMat = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff9a2a, emissiveIntensity: 1.6 });
  const fenster = (x, y, z, ry = 0, w = 0.3, h = 0.4) => { const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), fensterMat); f.position.set(x, y, z); f.rotation.y = ry; return f; };
  let geist = null, krater = null;
  const rauch = [];
  if (vulkan) {
    // Vulkan: Felskegel mit glühendem Kratersee, drei Lavastroeme die Flanke hinunter, Rauch steigt auf (Schleife)
    const fels = new THREE.MeshStandardMaterial({ color: 0x3b2a24, roughness: 1, flatShading: true });
    const kegelGeo = new THREE.CylinderGeometry(0.85, 2.6, 3.0, 14, 4);
    const kp = kegelGeo.attributes.position;
    for (let i = 0; i < kp.count; i++) { const y = kp.getY(i); if (y > -1.49 && y < 1.49) { const f = 1 + 0.08 * Math.sin(i * 2.3) ; kp.setX(i, kp.getX(i) * f); kp.setZ(i, kp.getZ(i) * f); } }
    kegelGeo.computeVertexNormals();
    const kegel = new THREE.Mesh(kegelGeo, fels); kegel.position.y = 1.5;
    const glutMat = new THREE.MeshStandardMaterial({ color: 0xff6a00, emissive: 0xff4a00, emissiveIntensity: 1.8, roughness: 0.6 });
    const see = new THREE.Mesh(new THREE.CircleGeometry(0.74, 20), glutMat); see.rotation.x = -Math.PI / 2; see.position.y = 2.97;
    mitte.add(kegel, see);
    [0.3, 2.4, 4.4].forEach((a) => {
      const arm = new THREE.Group(); arm.rotation.y = a;
      const strom = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 0.05), glutMat); strom.position.set(0, 1.5, 1.76); strom.rotation.x = -0.53;
      arm.add(strom); mitte.add(arm);
    });
    const licht = new THREE.PointLight(0xff5a00, 14, 10, 1.5); licht.position.y = 3.7; mitte.add(licht);
    for (let k = 0; k < 6; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: weichTextur(), color: 0x6b5a55, transparent: true, opacity: 0.35, depthWrite: false }));
      sp.position.set(BURG.x, 3.2, BURG.z); scene.add(sp); rauch.push({ sp, t: k / 6 });
    }
    krater = { see, licht, pos: BURG.clone().setY(3.1) };
  } else if (halloween) {
    const wand = new THREE.MeshStandardMaterial({ color: 0x433a52, roughness: 0.9 });
    const dachM = new THREE.MeshStandardMaterial({ color: 0x1d1729, roughness: 0.8 });
    const unten = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.0), wand); unten.position.y = 0.8;
    const oben = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.5), wand); oben.position.set(-0.15, 2.15, 0); oben.rotation.z = 0.05;
    const dach = new THREE.Mesh(new THREE.ConeGeometry(1.55, 1.3, 4), dachM); dach.position.set(-0.15, 3.3, 0); dach.rotation.y = Math.PI / 4;
    const turm = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 3.4, 8), wand); turm.position.set(1.15, 1.7, 0.75);
    const turmDach = new THREE.Mesh(new THREE.ConeGeometry(0.66, 1.4, 8), dachM); turmDach.position.set(1.15, 4.1, 0.75); turmDach.rotation.z = 0.12;
    const tuer = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.75), new THREE.MeshStandardMaterial({ color: 0x1a0f08 })); tuer.position.set(-0.3, 0.38, 1.011);
    mitte.add(unten, oben, dach, turm, turmDach, tuer, fenster(0.5, 0.95, 1.011), fenster(-0.95, 0.95, 1.011), fenster(-0.4, 2.2, 0.76), fenster(0.25, 2.15, 0.76, 0, 0.25, 0.32),
      fenster(1.15, 2.6, 1.23, 0.4, 0.22, 0.34), fenster(1.21, 0.9, 0.2, Math.PI / 2));
    // kleiner Geist, der ums Haus schwebt
    geist = new THREE.Group();
    const tuch = new THREE.MeshStandardMaterial({ color: 0xf4f0ff, emissive: 0xb9a6ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.88 });
    const kopf = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), tuch); kopf.position.y = 0.3;
    const rock = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.6, 16, 1, true), tuch); rock.position.y = -0.02; rock.rotation.x = Math.PI;
    const ga = [-0.11, 0.11].map((x) => { const a = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ color: 0x15151f })); a.position.set(x, 0.36, 0.3); return a; });
    geist.add(kopf, rock, ...ga); scene.add(geist);
  } else {
    const stein = new THREE.MeshStandardMaterial({ color: look === "edel" ? 0xe8dcc0 : 0xd9d2e9, roughness: 0.7 });
    const dachM = new THREE.MeshStandardMaterial({ color: look === "edel" ? 0xb8862f : 0x6d5dfc, roughness: 0.5 });
    const haupt = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.2), stein); haupt.position.y = 0.8; mitte.add(haupt);
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      const turm = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 2.4, 12), stein); turm.position.set(x, 1.2, z); mitte.add(turm);
      const spitze = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1, 12), dachM); spitze.position.set(x, 2.9, z); mitte.add(spitze);
      const fahne = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.26), new THREE.MeshStandardMaterial({ color: 0xff5fae, side: THREE.DoubleSide })); fahne.position.set(x + 0.24, 3.55, z); mitte.add(fahne);
      const stab = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), holz); stab.position.set(x, 3.55, z); mitte.add(stab);
    }
    mitte.add(fenster(0, 0.9, 1.111, 0, 0.4, 0.55));
    fensterMat.emissiveIntensity = 0.5;
  }
  mitte.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(mitte);

  // ---- Himmel und Stimmung: Mond, Fledermaeuse, Irrlichter/Gluehwuermchen, Nebelschwaden
  if (halloween) {
    const mond = new THREE.Sprite(new THREE.SpriteMaterial({ map: weichTextur(), color: 0xfff4c8, fog: false, transparent: true, depthWrite: false }));
    mond.scale.set(22, 22, 1); mond.position.set(-26, 26, -50); scene.add(mond);
    const scheibe = new THREE.Mesh(new THREE.CircleGeometry(4.2, 32), new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
    scheibe.position.set(-26, 26, -50.5); scene.add(scheibe);
  }
  const flederm = [];
  if (halloween) {
    const fm = new THREE.MeshStandardMaterial({ color: 0x15101d, side: THREE.DoubleSide, roughness: 0.8 });
    const fluegelForm = new THREE.Shape(); fluegelForm.moveTo(0, 0); fluegelForm.lineTo(0.55, 0.12); fluegelForm.lineTo(0.48, -0.02); fluegelForm.lineTo(0.36, 0.04); fluegelForm.lineTo(0.26, -0.06); fluegelForm.lineTo(0.14, 0.0); fluegelForm.lineTo(0, -0.08);
    const fg = new THREE.ShapeGeometry(fluegelForm); fg.rotateX(-Math.PI / 2);
    for (let k = 0; k < 6; k++) {
      const b = new THREE.Group();
      const rumpf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), fm); rumpf.scale.set(0.8, 0.8, 1.3);
      const l = new THREE.Mesh(fg, fm), r = new THREE.Mesh(fg, fm); r.scale.x = -1;
      const lg = new THREE.Group(), rg = new THREE.Group(); lg.add(l); rg.add(r);
      b.add(rumpf, lg, rg); scene.add(b);
      flederm.push({ b, lg, rg, r: 4 + k * 1.3, h: 4.5 + (k % 3) * 0.9, v: 0.35 + (k % 2) * 0.2, ph: k * 1.1 });
    }
  }
  const lichtN = 70;
  const lichtPos = new Float32Array(lichtN * 3), lichtBasis = [];
  for (let k = 0; k < lichtN; k++) {
    const a = zufallFest(k + 300) * 6.28, r = 2 + zufallFest(k + 400) * 11;
    lichtBasis.push([Math.cos(a) * r, 0.5 + zufallFest(k + 500) * 2.2, Math.sin(a) * r * 0.86, zufallFest(k + 600) * 6.28]);
  }
  const irrlichter = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(lichtPos, 3)),
    new THREE.PointsMaterial({ map: weichTextur(), size: halloween ? 0.42 : 0.3, color: halloween ? 0x9dffb0 : vulkan ? 0xff8a3a : 0xfff08a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
  scene.add(irrlichter);
  const nebel = [];
  if (halloween) {
    for (let k = 0; k < 9; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: weichTextur(), color: 0xc9b8ff, transparent: true, opacity: 0.1, depthWrite: false }));
      const a = (k / 9) * 6.28; sp.scale.set(7, 2.6, 1); sp.position.set(Math.cos(a) * 12, 0.3, Math.sin(a) * 10.5);
      scene.add(sp); nebel.push({ sp, a, v: 0.03 + (k % 3) * 0.01 });
    }
  }

  // ---- Stern mit Lichtsaeule
  const sternForm = new THREE.Shape();
  for (let k = 0; k < 10; k++) { const r = k % 2 ? 0.32 : 0.75; const a = (k / 10) * Math.PI * 2 + Math.PI / 2; k ? sternForm.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sternForm.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const sternGeo = new THREE.ExtrudeGeometry(sternForm, { depth: 0.25, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06 }); sternGeo.center();
  const stern = new THREE.Mesh(sternGeo, new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb300, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.3 }));
  stern.castShadow = true; scene.add(stern);
  const sternLicht = new THREE.PointLight(0xffd23f, 16, 6); scene.add(sternLicht);
  const saeule = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.75, 7, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(saeule);

  // ---- Ring unter dem, der dran ist
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.07, 10, 40), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  ring.rotation.x = -Math.PI / 2; scene.add(ring);

  // ---- Spielfiguren
  spielerFarbenLesen();
  const figuren = [];
  for (let j = 0; j < anzahlSpieler; j++) {
    const f = figurBauen(FARBEN_SP[j % FARBEN_SP.length], look);
    f.obj.scale.setScalar(0.9);
    scene.add(f.obj);
    Object.assign(f, { anzeige: 0, pfad: [], huepfen: 0, blick: 0, startIn: 0, gefuehl: null, blinzel: 2 + j * 0.7, richtung: V(), boden: V() });
    // Lebenspunkte-Plakette ueber dem Kopf (Teil 4b) - nur sichtbar, wenn jemand Schaden hat
    f.lpSchild = new THREE.Sprite(new THREE.SpriteMaterial({ map: lpTextur(LP_MAX), transparent: true, depthWrite: false }));
    f.lpSchild.scale.set(1.0, 0.44, 1); f.lpSchild.position.y = 2.0; f.lpSchild.visible = false; f.lpSchild.userData.n = LP_MAX;
    f.obj.add(f.lpSchild);
    figuren.push(f);
  }
  // Blitze (Gewitterwolke) und Geschosse (Pfeil, Boxhandschuh, Lavabrocken)
  const blitzMat = new THREE.MeshBasicMaterial({ color: 0xfff4a0, transparent: true, opacity: 0.95 });
  const blitze = [0, 1, 2, 3, 4, 5].map(() => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 12, 6), blitzMat); b.visible = false; scene.add(b); return { b, t: 9 }; });

  // ---- Wuerfelblock (bis zu drei) und Schrittzaehler
  const wuerfelMat = wuerfelMaterialien();
  const wuerfel = [0, 1, 2].map(() => { const w = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.66, 0.66), wuerfelMat); w.castShadow = true; w.visible = false; scene.add(w); return w; });
  const zaehler = new THREE.Sprite(new THREE.SpriteMaterial({ map: zahlTextur(1), transparent: true, depthWrite: false }));
  zaehler.scale.set(0.8, 0.8, 1); zaehler.visible = false; scene.add(zaehler);

  // ---- Effekte: Funken (drei Wolken im Wechsel), Muenzen, Schildblase, Sternenrohre
  const funken = [0, 1, 2].map(() => {
    const pt = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.2, vertexColors: true, transparent: true, depthWrite: false, map: weichTextur(), blending: THREE.AdditiveBlending }));
    pt.visible = false; scene.add(pt); return { pt, v: [], zeit: 0 };
  });
  const muenzMat = new THREE.MeshStandardMaterial({ color: 0xffcf3a, metalness: 0.7, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 0.5 });
  const muenzGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 18); muenzGeo.rotateX(Math.PI / 2);
  const muenzen = Array.from({ length: 16 }, () => { const m = new THREE.Mesh(muenzGeo, muenzMat); m.visible = false; scene.add(m); return { m, t: 1, dauer: 1 }; });
  const blase = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color: 0x7fe3ff, emissive: 0x3fd0ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.28, depthWrite: false }));
  blase.visible = false; scene.add(blase);
  const rohrMat = new THREE.MeshStandardMaterial({ color: 0x2fbf62, emissive: 0x1d7a3e, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.2 });
  const rohre = [0, 1].map(() => {
    const r = new THREE.Group();
    const leib = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 20, 1, true), rohrMat); leib.position.y = 0.4;
    const rand = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 8, 24), rohrMat); rand.rotation.x = Math.PI / 2; rand.position.y = 0.8;
    r.add(leib, rand); r.visible = false; scene.add(r); return r;
  });

  // ---- Siegertreppchen (nur bei der Siegerehrung sichtbar)
  const podest = new THREE.Group(); podest.position.copy(PODEST); podest.visible = false;
  const PODEST_STUFE = { 1: [0, 0.9, 0xffd23f], 2: [-1.05, 0.6, 0xd7dbe6], 3: [1.05, 0.4, 0xd08a4a] };
  Object.entries(PODEST_STUFE).forEach(([nr, [x, h, farbe]]) => {
    const blk = new THREE.Mesh(new THREE.BoxGeometry(1.0, h, 1.0), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.6 })); blk.position.set(x, h / 2, 0);
    const deckel = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.08, 1.04), new THREE.MeshStandardMaterial({ color: farbe, metalness: 0.5, roughness: 0.3, emissive: farbe, emissiveIntensity: 0.25 })); deckel.position.set(x, h, 0);
    const zahl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: zahlTextur(Number(nr)), transparent: true })); zahl.position.set(x, h / 2, 0.505);
    podest.add(blk, deckel, zahl);
  });
  podest.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(podest);

  g = { renderer, scene, camera, mess, sonne, lichter, felder, figuren, stern, sternLicht, saeule, ring, wuerfel, wuerfelMat, zaehler, funken, funkenNr: 0,
    muenzen, blase, rohre, podest, PODEST_STUFE, geist, flederm, irrlichter, lichtBasis, nebel, brandung, n, lage, look,
    welt: vulkan ? "vulkan" : "insel", krater, rauch, portale, truhen, blitze, geschosse: [], marker: {}, wackelBis: 0, muenzGeo, muenzMat,
    stufe: st.stufe, stufeFest: st.fest, mess_dt: [], wurfSchluessel: null, wurf: null, uhr: new THREE.Clock(), container: null, aktiv: 0, laeuft: false,
    schweber: [], fallenObj: {}, schnapp: [], effektNr: null, nachLanden: [], fahrt: null, phase: "", sieger: null, hoehe: 0.82,
    folgen: lsLesen("pa_brett_kamera") !== "uebersicht" && !wenigBewegung(), sternFlug: null, sternPos: V(), wuerfelZahl: 1, wuerfelKlein: false,
    kamP: V(0, 23.5, 20), kamL: V(0, 0, 0.8), uebersichtCache: {}, bilder: 0 };
  camera.position.copy(g.kamP); camera.lookAt(g.kamL);
  // ein Tipp aufs Bild ueberspringt die laufende Kamerafahrt
  renderer.domElement.addEventListener("pointerdown", () => { if (g && g.fahrt) g.fahrt = null; });
  qualitaetAnwenden();
}

// Stufe auf Renderer und Szene uebertragen (beim Aufbau und wenn die Bildrate faellt)
function qualitaetAnwenden() {
  const Q = STUFE[g.stufe];
  g.renderer.setPixelRatio(Math.min(Q.pr, window.devicePixelRatio || 1));
  if (g.groesse) g.renderer.setSize(g.groesse[0], g.groesse[1], false);
  g.sonne.castShadow = Q.schatten > 0;
  g.lichter.forEach((l, k) => { l.visible = k < Q.lichter; });
  g.irrlichter.geometry.setDrawRange(0, Math.round(70 * Q.partikel));
  g.nebel.forEach((x) => { x.sp.visible = Q.partikel >= 0.5; });
  g.flederm.forEach((x, k) => { x.b.visible = k < Math.max(2, Math.round(6 * Q.partikel)); });
}
function bildrateMessen(dt) {
  if (g.stufeFest || g.stufe === "niedrig" || document.hidden) return;
  if (g.bilder < 30) return;   // die ersten Bilder (Shader bauen) zaehlen nicht
  g.mess_dt.push(dt);
  if (g.mess_dt.length < 90) return;
  const schnitt = g.mess_dt.reduce((a, b) => a + b, 0) / g.mess_dt.length;
  g.mess_dt = [];
  if (schnitt > 1 / 38) { g.stufe = STUFEN[STUFEN.indexOf(g.stufe) - 1]; qualitaetAnwenden(); }
}

// ---------------------------------------------------------------- Effekte
function funkenAn(pos, farbe = null, menge = 1) {
  const f = g.funken[g.funkenNr++ % g.funken.length];
  const N = Math.max(20, Math.round(130 * STUFE[g.stufe].partikel * menge));
  const p = new Float32Array(N * 3), c = new Float32Array(N * 3);
  f.v = [];
  for (let i = 0; i < N; i++) {
    p.set([pos.x, pos.y + 1, pos.z], i * 3);
    const col = farbe !== null ? new THREE.Color().setHSL(farbe + Math.random() * 0.08, 0.95, 0.6) : new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
    c.set([col.r, col.g, col.b], i * 3);
    f.v.push(V((Math.random() - 0.5) * 6, Math.random() * 7 + 2, (Math.random() - 0.5) * 6));
  }
  f.pt.geometry.dispose();
  f.pt.geometry = new THREE.BufferGeometry();
  f.pt.geometry.setAttribute("position", new THREE.BufferAttribute(p, 3));
  f.pt.geometry.setAttribute("color", new THREE.BufferAttribute(c, 3));
  f.zeit = 1.6; f.pt.visible = true; f.pt.material.opacity = 1;
}
// schwebender Text ueber einer Figur ("+3 🪙")
function schweben(text, farbe, pos) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: schriftTextur(text, farbe), transparent: true, depthWrite: false }));
  sp.scale.set(2.2, 1.1, 1); sp.position.set(pos.x, pos.y + 2.6, pos.z);
  g.scene.add(sp); g.schweber.push({ sp, t: 0 });
}
// Muenzen: aus der Figur heraus nach oben (gewonnen), herunterfallend (verloren) oder im Bogen von einer Figur zur anderen
function muenzenFliegen(von, nach, anzahl, art) {
  const frei = g.muenzen.filter((x) => x.t >= x.dauer).slice(0, Math.min(10, Math.max(3, anzahl)));
  frei.forEach((x, k) => {
    x.t = -k * 0.07; x.dauer = art === "bogen" ? 0.9 : 1.1; x.art = art; x.von = von.clone(); x.nach = (nach || von).clone();
    x.seite = V((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6);
    x.m.visible = false;
  });
}
const figurPos = (j) => (g.figuren[j] ? g.figuren[j].obj.position.clone().setY(FELD_OBEN) : V());
function gefuehl(j, art, dauer = 1.8) { const f = g.figuren[j]; if (f) f.gefuehl = { art, bis: g.uhr.elapsedTime + dauer }; }
// erst ausloesen, wenn die Figur angekommen ist (sonst nach spaetestens 7 s)
function nachDerLandung(j, fn) { g.nachLanden.push({ j, fn, bis: g.uhr.elapsedTime + 7 }); }

function effektZeigen(e) {
  const p = figurPos(e.j);
  if (e.art === "muenzen") {
    if (e.von !== undefined && g.figuren[e.von] && e.wert > 0) {   // Muenzmagnet: vom Bestohlenen zum Dieb
      muenzenFliegen(figurPos(e.von).setY(1.4), p.clone().setY(1.4), e.wert, "bogen");
      gefuehl(e.j, "jubel"); gefuehl(e.von, "trauer");
    } else {
      muenzenFliegen(p.clone().setY(1.2), null, Math.abs(e.wert), e.wert > 0 ? "hoch" : "fallen");
      gefuehl(e.j, e.wert > 0 ? "jubel" : "trauer", 1.5);
    }
    schweben(`${e.wert > 0 ? "+" : "−"}${Math.abs(e.wert)} 🪙`, e.wert > 0 ? "#ffd23f" : "#ff6b6b", p);
    if (e.wert > 0) funkenAn(p, 0.13, 0.5);
  } else if (e.art === "stern") {
    funkenAn(p); funkenAn(p, 0.14); schweben("+1 ⭐", "#ffe27a", p); gefuehl(e.j, "jubel", 2.4);
    zoomFahrt(e.j, "stern");
  } else if (e.art === "ereignis") {
    funkenAn(p, 0.62); schweben("❓", "#9fb8ff", p);
    zoomFahrt(e.j, "ereignis");
  } else if (e.art === "falle") {
    funkenAn(p, 0.08, 0.4); schweben("🪤", "#ffffff", p);
  } else if (e.art === "schild") {
    g.blase.userData = { j: e.j, t: 0 }; g.blase.visible = true; schweben("🛡️", "#7fe3ff", p); gefuehl(e.j, "jubel", 1.2);
  } else if (e.art === "rohr") {
    funkenAn(p, 0.3); gefuehl(e.j, "jubel", 1.2);
  } else if (e.art === "tausch") {
    funkenAn(p, 0.78); if (e.ziel !== undefined) funkenAn(figurPos(e.ziel), 0.78);
  } else if (e.art === "schaden") {
    const treffer = () => { funkenAn(figurPos(e.j), 0.0, 0.5); schweben(`−${Math.abs(e.wert)} ❤️`, "#ff5b5b", figurPos(e.j)); gefuehl(e.j, "trauer", 1.6); };
    const q = e.quelle;
    if (q && q.von !== undefined && g.figuren[q.von]) { gefuehl(q.von, "jubel", 1.2); geschoss(figurPos(q.von).setY(1.2), () => figurPos(e.j).setY(1.0), q.art === "faust" ? "🥊" : "🏹", treffer); }
    else treffer();
  } else if (e.art === "heilen") {
    funkenAn(p, 0.92, 0.6); if (e.wert) schweben(`+${e.wert} ❤️`, "#ff8ad8", p); gefuehl(e.j, "jubel", 1.2);
  } else if (e.art === "ko") {
    // am Unglücksfeld: graue Wolke und "K.O."; die Figur fliegt zum Start (Sprung, siehe Uebernahme der Positionen)
    const ort = e.feld !== undefined && g.lage[e.feld] ? g.lage[e.feld].clone() : p;
    funkenAn(ort, 0.0, 0.8); funkenAn(ort, 0.6, 0.4); schweben("K.O. 💫", "#ffffff", ort); wackeln(0.35);
    if (e.wert) schweben(`−${Math.abs(e.wert)} 🪙`, "#ff6b6b", ort.clone().setY(-0.8));
    zoomFahrt(e.j, "ko");
  } else if (e.art === "flaeche") {
    // mehrere Getroffene auf einmal: Blitz, Bombe, Gift, Vulkanausbruch
    const ziele = e.ziele || [];
    if (e.quelle === "ausbruch" && g.krater) { funkenAn(g.krater.pos.clone().setY(2.2), 0.06, 2); funkenAn(g.krater.pos.clone().setY(2.2), 0.02, 1.5); g.krater.ausbruch = 1; wackeln(1.4); }
    if (e.quelle === "bombe") wackeln(0.8);
    ziele.forEach((z, k) => {
      const zeig = () => {
        const q = figurPos(z.j);
        if (z.schild) { g.blase.userData = { j: z.j, t: 0 }; g.blase.visible = true; schweben("🛡️", "#7fe3ff", q); return; }
        funkenAn(q, e.quelle === "gift" ? 0.33 : e.quelle === "blitz" ? 0.15 : 0.05, 0.6);
        schweben(z.ko ? "K.O. 💫" : `−${Math.abs(z.wert)} ❤️`, z.ko ? "#ffffff" : "#ff5b5b", q); gefuehl(z.j, "trauer", 1.6);
      };
      if (e.quelle === "blitz") { blitz(figurPos(z.j)); setTimeout(zeig, 120 + k * 60); }
      else if (e.quelle === "ausbruch" && g.krater) geschoss(g.krater.pos.clone(), () => figurPos(z.j).setY(0.8), "🔥", zeig, 1.1 + k * 0.12);
      else setTimeout(zeig, k * 90);
    });
    if (!ziele.length && e.quelle === "blitz") blitz(p.clone().add(V(1.5, 0, 0)));
  } else if (e.art === "rakete") {
    funkenAn(p, 0.06, 0.8); gefuehl(e.j, "jubel", 1.4);
    (e.ziele || []).forEach((z) => { const q = figurPos(z.j); funkenAn(q, 0.05, 0.5); schweben(z.ko ? "K.O. 💫" : `−${Math.abs(z.wert)} ❤️`, "#ff5b5b", q); gefuehl(z.j, "trauer", 1.4); });
  } else if (e.art === "portal") {
    funkenAn(p, 0.75, 0.9); schweben("🌀", "#c9a6ff", p);
  } else if (e.art === "truhe") {
    funkenAn(p, 0.13, 0.7); schweben(`${e.inhalt || "🧰"}${e.wert ? ` +${e.wert}` : ""}`, "#ffd23f", p); gefuehl(e.j, "jubel", 1.4);
    const t = g.truhen.find((x) => x.feld === g.figuren[e.j].anzeige) || g.truhen.reduce((a, x) => (!a || g.lage[x.feld].distanceTo(p) < g.lage[a.feld].distanceTo(p) ? x : a), null);
    if (t) t.auf = 1.8;
  } else if (e.art === "gift" || e.art === "fluch") {
    funkenAn(p, e.art === "gift" ? 0.33 : 0.5, 0.6); schweben(e.art === "gift" ? "🧪" : "🐌", e.art === "gift" ? "#7dff8a" : "#ffd27a", p); gefuehl(e.j, "trauer", 1.4);
  } else if (e.art === "handschuh") {
    if (e.von !== undefined && g.figuren[e.von]) geschoss(figurPos(e.von).setY(1.2), () => figurPos(e.j).setY(1.2), "🧤", () => { schweben("🧤", "#ffffff", p); gefuehl(e.j, "jubel", 1.2); gefuehl(e.von, "trauer", 1.2); });
  } else if (e.art === "wunder") {
    funkenAn(p); schweben("🎁", "#ffffff", p); gefuehl(e.j, "jubel", 1.4);
  } else if (e.art === "bombe" || e.art === "sperre") {
    funkenAn(p, e.art === "bombe" ? 0.02 : 0.1, 0.4); schweben(e.art === "bombe" ? "💣" : "🚧", "#ffffff", p);
  } else funkenAn(p, 0.8);
}
// Kamera wackelt (Explosion, Ausbruch, K.O.)
function wackeln(dauer) { if (!wenigBewegung()) g.wackelBis = Math.max(g.wackelBis, g.uhr.elapsedTime + dauer); }
// Blitz aus dem Himmel auf einen Punkt
function blitz(ziel) {
  const b = g.blitze.find((x) => x.t > 0.4) || g.blitze[0];
  b.t = 0; b.b.position.set(ziel.x, 6.2, ziel.z); b.b.rotation.set((Math.random() - 0.5) * 0.18, 0, (Math.random() - 0.5) * 0.18); b.b.visible = true;
  funkenAn(ziel, 0.15, 0.4);
}
// fliegendes Ding im Bogen (Pfeil, Boxhandschuh, Lavabrocken); nach() liefert das Ziel (Figur bewegt sich evtl. noch)
function geschoss(von, nach, emo, dann, dauer = 0.6) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTextur(emo), transparent: true, depthWrite: false }));
  sp.scale.set(0.9, 0.9, 1); sp.position.copy(von); g.scene.add(sp);
  g.geschosse.push({ sp, von: von.clone(), nach, t: 0, dauer, dann });
}
// Bomben, Absperrungen und Muenzhaufen auf den Feldern (wie die Fallen)
function markerBauen(art) {
  const o = new THREE.Group();
  if (art === "bombe") {
    const kugel = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshStandardMaterial({ color: 0x1b1b24, roughness: 0.4, metalness: 0.3 })); kugel.position.y = 0.26;
    const lunte = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 5), new THREE.MeshStandardMaterial({ color: 0xc8a060 })); lunte.position.set(0.08, 0.56, 0); lunte.rotation.z = -0.4;
    const funke = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd23f })); funke.position.set(0.14, 0.67, 0); funke.userData.funke = true;
    o.add(kugel, lunte, funke);
  } else if (art === "sperre") {
    const holz = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.9 });
    [-0.42, 0.42].forEach((x) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.6, 6), holz); p.position.set(x, 0.3, 0); o.add(p); });
    const balken = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 0.06), new THREE.MeshStandardMaterial({ map: streifenTextur("#ffffff", "#e0464e"), roughness: 0.6 })); balken.position.y = 0.5;
    o.add(balken);
  } else {
    for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(g.muenzGeo, g.muenzMat); m.rotation.x = Math.PI / 2; m.position.set((k % 2) * 0.12 - 0.06, 0.03 + k * 0.055, (k % 3) * 0.05 - 0.05); o.add(m); }
  }
  o.traverse((x) => { if (x.isMesh) x.castShadow = true; });
  return o;
}
function markerAbgleichen(s) {
  const soll = {};
  Object.keys(s.bomben || {}).forEach((f) => { soll[`bombe:${f}`] = Number(f); });
  Object.keys(s.sperren || {}).forEach((f) => { soll[`sperre:${f}`] = Number(f); });
  Object.keys(s.haufen || {}).forEach((f) => { soll[`haufen:${f}`] = Number(f); });
  Object.keys(g.marker).forEach((k) => { if (!(k in soll)) { g.scene.remove(g.marker[k]); delete g.marker[k]; } });
  Object.entries(soll).forEach(([k, f]) => {
    if (g.marker[k] || !g.felder[f]) return;
    const art = k.split(":")[0], o = markerBauen(art), p = g.felder[f].p;
    const ver = { bombe: [-0.4, 0.3], sperre: [0, 0], haufen: [0.35, 0.35] }[art];
    o.position.set(p.x + ver[0], FELD_OBEN, p.z + ver[1]);
    if (art === "sperre") { const nx = g.lage[(g.next[f] || [f])[0]] || p; o.lookAt(nx.x, FELD_OBEN, nx.z); }   // Balken quer zum Weg
    o.userData.art = art; g.scene.add(o); g.marker[k] = o;
  });
}

// ---------------------------------------------------------------- Kamera-Regie
// Posen: p = Kameraort, l = Blickpunkt. Ruhig folgen, Fahrten als kurze Abschnitte mit weichem Anfahren und Abbremsen.
const KAM_RICHTUNG = V(0, 23.5, 19.2).normalize();   // Uebersicht (ganzes Brett)
const FOLGE_RICHTUNG = V(0, 0.78, 0.63).normalize();
const NAH_RICHTUNG = V(0, 0.5, 0.87).normalize();
const pose = (p, l) => ({ p, l });
function folgePose(j, abstand = 11.5, richtung = FOLGE_RICHTUNG) {
  const f = g.figuren[j];
  if (!f) return uebersichtPose();
  // bei Spruengen (Tausch, Rohr) gleich aufs Zielfeld schauen - sonst fliegt die Figur an der Kamera vorbei
  const l = f.sprung && f.pfad.length ? g.lage[f.pfad[f.pfad.length - 1]].clone().add(versatz(j, g.figuren.length)).setY(0.7)
    : f.boden.clone().setY(0.7).addScaledVector(f.richtung, 0.9);
  return pose(l.clone().addScaledVector(richtung, abstand), l);
}
const nahPose = (j) => folgePose(j, 6.8, NAH_RICHTUNG);
function sternPose() { const l = g.sternPos.clone().setY(1.0); return pose(l.clone().addScaledVector(NAH_RICHTUNG, 8), l); }
// Abzweigung: beide Wege drei Felder weit ins Bild nehmen
function wegPose(j) {
  const f = g.figuren[j], start = f.anzeige, punkte = [g.lage[start]];
  (g.next[start] || []).forEach((z) => { let x = z; for (let k = 0; k < 3; k++) { punkte.push(g.lage[x]); x = (g.next[x] || [x])[0]; } });
  const l = punkte.reduce((a, b) => a.add(b.clone()), V()).multiplyScalar(1 / punkte.length).setY(0.5);
  // die Figur selbst (Fuesse bis Hutspitze) muss mit ins Bild
  const fig = [f.boden.clone().setY(0), f.boden.clone().setY(2.1)];
  const d = passendAbstand(l, FOLGE_RICHTUNG, [...punkte.map((q) => q.clone().setY(0.6)), ...fig], 6, 30, 0.74);
  return pose(l.clone().addScaledVector(FOLGE_RICHTUNG, d), l);
}
function siegerPose() {
  const l = PODEST.clone().add(V(0, 1.15, 0.6));
  const neben = g.sieger ? Object.values(g.sieger.platz).reduce((m, x) => Math.max(m, x.stufe ? 1.3 : Math.abs(x.x) + 0.5), 1.3) : 1.3;
  const punkte = [V(-1.6, 2.4, 0), V(1.6, 2.4, 0), V(0, 3.1, 0), V(-neben, 0, 0.8), V(neben, 0, 0.8), V(-neben, 1.7, 0.35), V(neben, 1.7, 0.35)].map((q) => q.add(PODEST));
  const d = passendAbstand(l, NAH_RICHTUNG, punkte, 3, 30, 0.86);
  return pose(l.clone().addScaledVector(NAH_RICHTUNG, d), l);
}
// Ueberflug zu Rundenbeginn: Bogen ueber die Insel
function bahnPose(u) {
  const ue = uebersichtPose(), r = ue.p.distanceTo(ue.l) * 0.8, el = 0.62, az = -1.0 + 2.0 * u, l = V(0, 0, 0.6);
  return pose(V(Math.sin(az) * r * Math.cos(el), r * Math.sin(el), 0.6 + Math.cos(az) * r * Math.cos(el)), l);
}

// Punkte am Rand der Insel (Oberkante, Unterkante der Erde, Baumspitzen am Rand) - die muessen in der Uebersicht ins Bild
const RAND_PUNKTE = [];
for (let k = 0; k < 48; k++) {
  const a = (k / 48) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
  RAND_PUNKTE.push(V(c * 14.6, -0.1, s * 14.6), V(c * 13, -1.5, s * 13), V(c * 9.5, -4.5, s * 9.5), V(c * 13.2, 1.9, s * 13.2));
}
const RAND_NDC = 0.96;   // etwas Luft zum Rand des Bildes
const _p = V();
function randWert(cam, punkte = RAND_PUNKTE) {
  cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  let m = 0;
  for (const q of punkte) { _p.copy(q).project(cam); m = Math.max(m, Math.abs(_p.x), Math.abs(_p.y)); }
  return m;
}
// kleinster Abstand in fester Blickrichtung, bei dem alle Punkte ins Bild passen
function passendAbstand(blick, richtung, punkte, nah, fern, rand = RAND_NDC) {
  const cam = g.mess;
  cam.aspect = g.camera.aspect; cam.updateProjectionMatrix();
  for (let i = 0; i < 14; i++) {
    const mitte = (nah + fern) / 2;
    cam.position.copy(blick).addScaledVector(richtung, mitte); cam.lookAt(blick);
    if (randWert(cam, punkte) <= rand) fern = mitte; else nah = mitte;
  }
  return fern;
}
// Uebersicht: so nah wie moeglich, aber mit der ganzen Insel im Bild (je Seitenverhaeltnis einmal gerechnet)
function uebersichtPose() {
  const key = g.camera.aspect.toFixed(3);
  if (!g.uebersichtCache[key]) {
    const l = V(0, 0, 0.8);
    g.uebersichtCache[key] = pose(l.clone().addScaledVector(KAM_RICHTUNG, passendAbstand(l, KAM_RICHTUNG, RAND_PUNKTE, 18, 90)), l);
  }
  const x = g.uebersichtCache[key];
  return pose(x.p.clone(), x.l.clone());
}
const fahrtenAn = () => g.folgen && !(typeof globalThis !== "undefined" && globalThis.__brettKamera === "uebersicht");
// Ruhelage ohne Fahrt: je nach Lage im Zug
function ruhePose() {
  if (g.sieger) return siegerPose();
  if (!fahrtenAn()) return uebersichtPose();
  const j = g.aktiv, f = g.figuren[j];
  if (!f) return uebersichtPose();
  const steht = !f.pfad.length && f.startIn <= 0;
  if (steht && g.phase === "weg") return wegPose(j);
  if (steht && ["laden", "duell", "stern", "ziel", "aufgabe"].includes(g.phase)) return nahPose(j);
  return folgePose(j);
}
function fahrtStarten(name, schritte) {
  if (!fahrtenAn() || g.sieger) return;
  g.fahrt = { name, schritte, i: 0, t: 0, von: pose(g.kamP.clone(), g.kamL.clone()) };
}
function zoomFahrt(j, name) {
  if (g.fahrt && g.fahrt.name === "runde") return;
  fahrtStarten(name, [{ ziel: () => nahPose(j), dauer: 0.5, halten: 0.9 }, { ziel: () => folgePose(j), dauer: 0.55 }]);
}
function kameraBewegen(dt) {
  let ziel = null;
  if (g.fahrt) {
    const fa = g.fahrt, sch = fa.schritte[fa.i];
    fa.t += dt;
    const u = Math.min(1, fa.t / sch.dauer);
    if (sch.bahn) { const b = bahnPose(u), k = sanft(Math.min(1, u * 3)); ziel = pose(fa.von.p.clone().lerp(b.p, k), fa.von.l.clone().lerp(b.l, k)); }
    else { const z = sch.ziel(), k = sanft(u); ziel = pose(fa.von.p.clone().lerp(z.p, k), fa.von.l.clone().lerp(z.l, k)); }
    if (fa.t >= sch.dauer + (sch.halten || 0)) {
      fa.von = pose(ziel.p.clone(), ziel.l.clone()); fa.i++; fa.t = 0;
      if (fa.i >= fa.schritte.length) g.fahrt = null;
    }
    g.kamP.copy(ziel.p); g.kamL.copy(ziel.l);
  } else {
    ziel = ruhePose();
    const k = 1 - Math.exp(-dt * 3.2);
    g.kamP.lerp(ziel.p, k); g.kamL.lerp(ziel.l, 1 - Math.exp(-dt * 4.2));
  }
  g.camera.position.copy(g.kamP); g.camera.lookAt(g.kamL); g.camera.updateMatrixWorld();
  // Nebel wandert mit dem Abstand (beginnt kurz vor dem Blickpunkt)
  const d = g.kamP.distanceTo(g.kamL);
  if (g.scene.fog) { g.scene.fog.near = d - 2.3 + (g.look === "halloween" ? -1.5 : 0); g.scene.fog.far = d + 21.7; }
}

// ---------------------------------------------------------------- Bild fuer Bild
// eine Bildschleife je Szene (nach einem Neuaufbau laeuft die alte nicht weiter)
let generation = 0;
function schleife(gen) {
  if (!g || !g.laeuft || g.gen !== gen) return;
  requestAnimationFrame(() => schleife(gen));
  if (!g.container || !g.container.isConnected) return;
  const dt = Math.min(0.05, g.uhr.getDelta());
  const t = g.uhr.elapsedTime;
  g.bilder++;
  bildrateMessen(dt);
  const jetzt = performance.now();
  const w = g.wurf ? (jetzt - g.wurf.t0) / 1000 : 99;

  // ---- Figuren
  g.figuren.forEach((f, j) => {
    let pos, hoch = 0;
    const platz = g.sieger && g.sieger.platz[j];
    if (g.sieger) {
      const [x, h] = platz && platz.stufe ? g.PODEST_STUFE[platz.stufe] : [platz ? platz.x : 0, 0];
      pos = PODEST.clone().add(V(platz && platz.stufe ? x + platz.dx : platz.x, h, platz && platz.stufe ? 0 : 0.35));
      f.pfad = []; f.startIn = 0;
    } else {
      if (f.startIn > 0) f.startIn -= dt;
      const laufend = f.pfad.length > 0 && f.startIn <= 0;
      let a = g.lage[f.anzeige], b = laufend ? g.lage[f.pfad[0]] : a;
      if (laufend) {
        f.huepfen += dt * (f.sprung ? 1.6 : 3.4);
        if (f.huepfen >= 1) {
          f.huepfen = 0; f.anzeige = f.pfad.shift(); klang("schritt");
          a = g.lage[f.anzeige]; b = f.pfad.length ? g.lage[f.pfad[0]] : a;
          // letzter Abschnitt ist ein Sprung (Portal, K.O. zurueck zum Start)
          if (f.sprungZiel !== undefined && f.pfad.length === 1 && f.pfad[0] === f.sprungZiel) { f.sprung = true; f.sprungZiel = undefined; }
          if (!f.pfad.length && g.felder[f.anzeige]) g.felder[f.anzeige].plopp = 1;
        }
      }
      const k = f.pfad.length && f.startIn <= 0 ? f.huepfen : 0;
      pos = a.clone().lerp(b, k).add(versatz(j, g.figuren.length));
      hoch = Math.sin(k * Math.PI) * (f.sprung ? 2.2 : 0.75);   // Sprung (Tausch, Rohr) nicht zu hoch - die Kamera ist nah
      if (f.pfad.length && f.startIn <= 0) { const r = b.clone().sub(a); if (r.lengthSq() > 0.01) f.richtung.lerp(r.normalize(), Math.min(1, dt * 8)); }
      else f.richtung.multiplyScalar(Math.max(0, 1 - dt * 3));
    }
    f.boden.copy(pos).setY(0);
    const laeuft = !g.sieger && f.pfad.length > 0 && f.startIn <= 0;
    const gf = f.gefuehl && f.gefuehl.bis > t ? f.gefuehl.art : (g.sieger && platz ? platz.gefuehl : null);
    // Sprung gegen den Wuerfelblock
    let wurfSprung = 0;
    if (g.wurf && g.wurf.j === j && w > WURF.sprung && w < WURF.treffer + 0.3) wurfSprung = Math.sin(Math.min(1, (w - WURF.sprung) / (WURF.treffer + 0.3 - WURF.sprung)) * Math.PI) * 0.75;
    let jubelSprung = gf === "jubel" ? Math.abs(Math.sin(t * 7 + j)) * 0.38 : 0;
    f.obj.position.set(pos.x, pos.y + FELD_OBEN + hoch + wurfSprung + jubelSprung + (j === g.aktiv && !laeuft && !gf && !g.sieger ? Math.abs(Math.sin(t * 3.2)) * 0.08 : 0), pos.z);
    // Blickrichtung: beim Laufen in Laufrichtung, sonst zur Kamera
    const zielBlick = laeuft ? Math.atan2(f.richtung.x, f.richtung.z) : Math.atan2(g.kamP.x - f.obj.position.x, g.kamP.z - f.obj.position.z);
    let d = zielBlick - f.blick; d = Math.atan2(Math.sin(d), Math.cos(d));
    f.blick += d * Math.min(1, dt * (laeuft ? 10 : 4));
    f.obj.rotation.y = f.blick + (gf === "jubel" && g.sieger ? Math.sin(t * 2) * 0.3 : 0);
    // Koerper: Atmen, Wackeln beim Laufen, Stauchen bei der Landung, gebeugt beim Trauern
    const kk = f.pfad.length ? f.huepfen : 0;
    const atmen = 1 + Math.sin(t * 2.6 + j) * 0.025;
    const stauch = laeuft ? 1 - Math.max(0, Math.cos(kk * Math.PI * 2)) * 0.12 : 1;
    f.k.scale.set(1 / Math.sqrt(stauch * atmen), stauch * atmen * (gf === "trauer" ? 0.9 : 1), 1 / Math.sqrt(stauch * atmen));
    f.k.rotation.x += ((gf === "trauer" ? 0.38 : laeuft ? 0.12 : 0) - f.k.rotation.x) * Math.min(1, dt * 8);
    f.k.rotation.z = laeuft ? Math.sin(kk * Math.PI * 2) * 0.12 : gf === "trauer" ? Math.sin(t * 1.6) * 0.05 : Math.sin(t * 1.4 + j) * 0.03;
    // Arme
    const [al, ar] = f.arme;
    let zl = -0.25, zr = 0.25, xl = 0, xr = 0;
    if (gf === "jubel") { zl = -2.5 - Math.sin(t * 12) * 0.3; zr = 2.5 + Math.sin(t * 12 + 1) * 0.3; }
    else if (gf === "trauer") { zl = -0.08; zr = 0.08; xl = xr = 0.3; }
    else if (wurfSprung > 0) { zr = 2.8; zl = -0.6; }
    else if (laeuft) { xl = Math.sin(kk * Math.PI * 2) * 0.9; xr = -xl; zl = -0.35; zr = 0.35; }
    al.rotation.z += (zl - al.rotation.z) * Math.min(1, dt * 14); ar.rotation.z += (zr - ar.rotation.z) * Math.min(1, dt * 14);
    al.rotation.x += (xl - al.rotation.x) * Math.min(1, dt * 14); ar.rotation.x += (xr - ar.rotation.x) * Math.min(1, dt * 14);
    f.fuesse.forEach((fu, x) => { fu.position.z = 0.05 + (laeuft ? Math.sin(kk * Math.PI * 2 + x * Math.PI) * 0.13 : 0); });
    // Gesicht: Mund lacht oder haengt, Augen blinzeln
    f.mund.rotation.z = gf === "trauer" ? 0 : Math.PI;
    f.mund.position.y = gf === "trauer" ? 0.55 : 0.6;
    f.mund.scale.setScalar(gf === "jubel" ? 1.35 : 1);
    f.blinzel -= dt;
    if (f.blinzel < 0) f.blinzel = 2.5 + zufallFest(t + j) * 3;
    f.augen.scale.y = f.blinzel < 0.12 ? 0.15 : gf === "trauer" ? 0.7 : 1;
    const ziel = j === g.aktiv && !g.sieger ? 1.05 : 0.9;
    f.obj.scale.setScalar(f.obj.scale.x + (ziel - f.obj.scale.x) * Math.min(1, dt * 6));
    if (!f.pfad.length) f.sprung = false;
  });
  // Effekte, die auf die Landung gewartet haben
  g.nachLanden = g.nachLanden.filter((x) => {
    const f = g.figuren[x.j];
    if (f && (f.pfad.length || f.startIn > 0) && t < x.bis) return true;
    try { x.fn(); } catch (e) { console.error(e); }
    return false;
  });
  // Felder ploppen kurz, wenn jemand landet
  g.felder.forEach((fe) => { if (fe.plopp > 0) { fe.plopp = Math.max(0, fe.plopp - dt * 3); fe.gr.position.y = -Math.sin(fe.plopp * Math.PI) * 0.09; } });

  // ---- Ring unter dem Aktiven
  const akt = g.figuren[g.aktiv];
  g.ring.visible = !!akt && !g.sieger;
  if (akt) { g.ring.position.set(akt.obj.position.x, FELD_OBEN + 0.03, akt.obj.position.z); g.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.08); g.ring.material.color.setHex(FARBEN_SP[g.aktiv % FARBEN_SP.length]); }

  // ---- Stern: dreht sich, fliegt im Bogen zu seinem neuen Platz, Lichtsaeule pulsiert
  if (g.sternFlug) {
    g.sternFlug.t += dt / 1.1;
    const u = sanft(Math.min(1, g.sternFlug.t));
    g.sternPos.lerpVectors(g.sternFlug.von, g.sternFlug.nach, u);
    g.sternPos.y = Math.sin(u * Math.PI) * 4;
    if (g.sternFlug.t >= 1) { g.sternFlug = null; g.sternPos.y = 0; }
  }
  g.stern.visible = !g.sieger;
  g.stern.rotation.y += dt * 1.6;
  g.stern.position.set(g.sternPos.x, 1.6 + g.sternPos.y + Math.sin(t * 2) * 0.15, g.sternPos.z);
  g.sternLicht.position.copy(g.stern.position).y += 0.6;
  g.saeule.visible = !g.sieger && !g.sternFlug;
  g.saeule.position.set(g.sternPos.x, 3.5, g.sternPos.z);
  g.saeule.material.opacity = 0.12 + Math.sin(t * 2.4) * 0.05;

  // ---- Fallen wippen; zugeschnappte Fallen klappen zu und verschwinden
  Object.values(g.fallenObj).forEach((o, k) => { o.rotation.y += dt * 0.6; o.position.y = FELD_OBEN + 0.02 + Math.abs(Math.sin(t * 3 + k)) * 0.03; });
  g.schnapp = g.schnapp.filter((x) => {
    x.t += dt;
    x.o.children.forEach((c) => { if (c.userData.zahn) c.rotation.x = Math.min(1, x.t * 6) * 0.9 * c.userData.zahn; });
    x.o.scale.setScalar(Math.max(0.01, 1 - Math.max(0, x.t - 0.6) * 2.5));
    if (x.t > 1) { g.scene.remove(x.o); return false; }
    return true;
  });

  // ---- Wuerfelblock ueber dem Kopf: wartet drehend, wird angesprungen, zeigt die Zahl, verschwindet
  const dranFig = g.figuren[g.aktiv];
  const warten = !g.sieger && g.phase === "wuerfeln" && dranFig && !dranFig.pfad.length && (!g.wurf || w > WURF.weg);
  const zahlen = g.wurf && w <= WURF.weg ? g.wurf.zahlen : null;
  const anzahl = zahlen ? zahlen.length : g.wuerfelZahl;
  const wf = zahlen ? g.figuren[g.wurf.j] : dranFig;
  g.wuerfel.forEach((wu, k) => {
    wu.visible = !!wf && (warten || !!zahlen) && k < anzahl;
    if (!wu.visible) return;
    const kopf = wf.obj.position.clone();
    const x = (k - (anzahl - 1) / 2) * 0.82;
    let gr = g.wuerfelKlein && !zahlen ? 0.75 : 1, y = 2.35 + Math.sin(t * 2.5 + k) * 0.08;
    if (zahlen && w < WURF.treffer) { wu.rotation.x += dt * (13 + k * 3); wu.rotation.y += dt * (10 - k * 2); }
    else if (zahlen) {
      // Zahl zur Kamera, leicht wiegend
      const [rx, ry, rz] = WUERFEL_VORN[zahlen[k] || 1];
      _qa.setFromEuler(_e.set(rx, ry, rz));
      const zurKamera = g.kamP.clone().sub(wf.obj.position); zurKamera.y *= 0.6;
      _qb.setFromUnitVectors(_vz, zurKamera.normalize());
      wu.quaternion.copy(_qb).multiply(_qa);
      wu.rotateY(Math.sin(t * 1.5 + k) * 0.15);
      const nach = w - WURF.treffer;
      gr *= nach < 0.15 ? 1 + (0.15 - nach) * 3 : 1;   // kurzes Aufploppen beim Treffer
      if (w > WURF.los) gr *= Math.max(0.01, 1 - (w - WURF.los) / (WURF.weg - WURF.los));
      y += Math.max(0, 0.15 - nach) * 1.2;
    } else { wu.rotation.x += dt * 3.2; wu.rotation.y += dt * 4.1; }
    wu.position.set(kopf.x + x, kopf.y - FELD_OBEN + y, kopf.z);
    wu.scale.setScalar(gr);
  });
  if (g.wurf && !g.wurf.getroffen && w >= WURF.treffer) {
    g.wurf.getroffen = true;
    const kp = g.figuren[g.wurf.j] ? g.figuren[g.wurf.j].obj.position.clone().setY(1.6) : V();
    funkenAn(kp, 0.12, 0.45);
  }
  // Schrittzaehler waehrend des Laufens
  const lf = g.wurf && g.figuren[g.wurf.j];
  const rest = lf ? lf.pfad.length : 0;
  g.zaehler.visible = !!lf && !g.sieger && rest > 0 && w > WURF.weg - 0.1 && !lf.sprung;
  if (g.zaehler.visible) {
    if (g.zaehler.userData.n !== rest) { g.zaehler.material.map = zahlTextur(rest); g.zaehler.userData.n = rest; }
    g.zaehler.position.copy(lf.obj.position).y += 2.25;
  }

  // ---- Funken, Muenzen, Blase, Rohre
  g.funken.forEach((fk) => {
    if (fk.zeit <= 0) { fk.pt.visible = false; return; }
    fk.zeit -= dt;
    const pos = fk.pt.geometry.getAttribute("position");
    fk.v.forEach((v, i) => { v.y -= 9.8 * dt; pos.array[i * 3] += v.x * dt; pos.array[i * 3 + 1] += v.y * dt; pos.array[i * 3 + 2] += v.z * dt; });
    pos.needsUpdate = true; fk.pt.material.opacity = Math.max(0, fk.zeit / 1.6);
  });
  g.muenzen.forEach((x) => {
    if (x.t >= x.dauer) { x.m.visible = false; return; }
    x.t += dt;
    if (x.t < 0) return;
    const u = Math.min(1, x.t / x.dauer);
    x.m.visible = u < 1;
    if (x.art === "bogen") { x.m.position.lerpVectors(x.von, x.nach, u); x.m.position.y += Math.sin(u * Math.PI) * 2.4; }
    else if (x.art === "hoch") { x.m.position.copy(x.von).addScaledVector(x.seite, u * 0.5); x.m.position.y += u * 2.2 - u * u * 0.6; x.m.scale.setScalar(1 - Math.max(0, u - 0.7) * 3); }
    else { x.m.position.copy(x.von).addScaledVector(x.seite, u * 1.4); x.m.position.y += u * 1.6 - u * u * 3.6; }
    x.m.rotation.y += dt * 12;
  });
  if (g.blase.visible) {
    const b = g.blase.userData; b.t += dt;
    const f = g.figuren[b.j];
    if (!f || b.t > 1.5) g.blase.visible = false;
    else { g.blase.position.copy(f.obj.position).y += 0.7; g.blase.scale.setScalar(Math.min(1, b.t * 5) * (1 + Math.sin(t * 9) * 0.03)); g.blase.material.opacity = 0.28 * Math.min(1, (1.5 - b.t) * 3); }
  }
  g.rohre.forEach((r) => {
    if (!r.visible) return;
    r.userData.t += dt;
    const u = r.userData.t;
    r.scale.set(1, Math.min(1, u * 4) * Math.max(0, Math.min(1, (1.6 - u) * 3)), 1);
    if (u > 1.6) r.visible = false;
  });

  // ---- Stimmung: Geist, Fledermaeuse, Irrlichter, Nebel, Brandung
  if (g.geist) { const a = t * 0.45; g.geist.position.set(BURG.x + Math.cos(a) * 2.4, 2.2 + Math.sin(t * 1.7) * 0.3, BURG.z + Math.sin(a) * 2.0); g.geist.rotation.y = -a; }
  g.flederm.forEach((x) => {
    if (!x.b.visible) return;
    const a = t * x.v + x.ph;
    x.b.position.set(Math.cos(a) * x.r, x.h + Math.sin(t * 1.3 + x.ph) * 0.5, Math.sin(a) * x.r * 0.8);
    x.b.rotation.y = -a - Math.PI / 2 * (x.v > 0 ? 1 : -1);
    const s = Math.sin(t * 16 + x.ph) * 0.9;
    x.lg.rotation.z = s; x.rg.rotation.z = -s;
  });
  const lp = g.irrlichter.geometry.getAttribute("position");
  g.lichtBasis.forEach(([x, y, z, ph], i) => { lp.array[i * 3] = x + Math.sin(t * 0.4 + ph) * 0.6; lp.array[i * 3 + 1] = y + Math.sin(t * 0.9 + ph * 2) * 0.35; lp.array[i * 3 + 2] = z + Math.cos(t * 0.35 + ph) * 0.6; });
  lp.needsUpdate = true;
  g.irrlichter.material.opacity = 0.6 + Math.sin(t * 2) * 0.2;
  g.nebel.forEach((x) => { const a = x.a + t * x.v; x.sp.position.set(Math.cos(a) * 12.2, 0.3, Math.sin(a) * 10.6); });
  g.brandung.material.opacity = 0.12 + Math.sin(t * 1.3) * 0.05;
  g.brandung.scale.setScalar(1 + Math.sin(t * 1.3) * 0.012);

  // ---- Podest: Konfetti in Abstaenden
  if (g.sieger && t - (g.sieger.konfetti || 0) > 2.2) { g.sieger.konfetti = t; funkenAn(PODEST.clone().add(V(0, 1.3, 0))); }

  // ---- schwebende Texte steigen und verblassen
  g.schweber = g.schweber.filter((x) => {
    x.t += dt;
    x.sp.position.y += dt * 1.1;
    x.sp.material.opacity = Math.max(0, 1 - x.t / 1.8);
    if (x.t > 1.8) { g.scene.remove(x.sp); x.sp.material.map.dispose(); x.sp.material.dispose(); return false; }
    return true;
  });

  // ---- Teil 4b: Geschosse, Blitze, Rauch, Portale, Truhen, Marker, Lebenspunkte
  g.geschosse = g.geschosse.filter((x) => {
    x.t += dt;
    const u = Math.min(1, x.t / x.dauer), ziel = x.nach();
    x.sp.position.lerpVectors(x.von, ziel, u); x.sp.position.y += Math.sin(u * Math.PI) * 2.2;
    if (u < 1) return true;
    g.scene.remove(x.sp); x.sp.material.dispose();
    try { x.dann(); } catch (e) { console.error(e); }
    return false;
  });
  g.blitze.forEach((b) => { if (!b.b.visible) return; b.t += dt; b.b.material.opacity = Math.max(0, 0.95 - b.t * 3); if (b.t > 0.35) b.b.visible = false; });
  g.rauch.forEach((x) => {
    x.t += dt * (g.krater && g.krater.ausbruch > 0 ? 0.5 : 0.12);
    if (x.t > 1) x.t -= 1;
    x.sp.position.set(BURG.x + Math.sin(x.t * 6 + x.sp.id) * 0.4 * x.t, 3.2 + x.t * 4.5, BURG.z + Math.cos(x.t * 5) * 0.3 * x.t);
    const gr = 0.8 + x.t * 2.6; x.sp.scale.set(gr, gr, 1); x.sp.material.opacity = 0.38 * (1 - x.t);
  });
  if (g.krater) {
    const a = g.krater.ausbruch || 0;
    g.krater.licht.intensity = 14 + Math.sin(t * 3) * 2 + a * 40; g.krater.see.material.emissiveIntensity = 1.8 + a * 2;
    if (a > 0) g.krater.ausbruch = Math.max(0, a - dt * 0.6);
  }
  g.portale.forEach((o, k) => { o.rotation.y += dt * 1.2; const s = 1 + Math.sin(t * 3 + k) * 0.06; o.scale.set(s, o.geometry.type === "OctahedronGeometry" ? s * 1.7 : s, s); });
  g.truhen.forEach((x) => { if (x.auf > 0) x.auf = Math.max(0, x.auf - dt); x.deckel.rotation.x = -Math.min(1, x.auf) * 1.2; });
  Object.values(g.marker).forEach((o, k) => {
    if (o.userData.art === "bombe") { const s = 1 + Math.abs(Math.sin(t * 6 + k)) * 0.12; o.scale.setScalar(s); o.children.forEach((c) => { if (c.userData.funke) c.visible = Math.sin(t * 20 + k) > -0.3; }); }
    if (o.userData.art === "haufen") o.rotation.y += dt * 0.8;
  });
  const dranLauf = g.figuren[g.aktiv];
  g.figuren.forEach((f, j) => {
    const n = g.lp ? g.lp[j] : LP_MAX;
    if (f.lpSchild.userData.n !== n) { f.lpSchild.material.map = lpTextur(Math.max(0, Math.min(LP_MAX, n))); f.lpSchild.userData.n = n; }
    const verdeckt = j === g.aktiv && (g.zaehler.visible || g.wuerfel.some((x) => x.visible));
    f.lpSchild.visible = !g.sieger && n < LP_MAX && !verdeckt && !(f === dranLauf && f.pfad.length);
  });

  kameraBewegen(dt);
  if (g.wackelBis > t) { const st = Math.min(1, g.wackelBis - t) * 0.16; g.camera.position.add(V((Math.random() - 0.5) * st, (Math.random() - 0.5) * st, (Math.random() - 0.5) * st)); }
  g.renderer.render(g.scene, g.camera);
}
function versatz(j, n) {
  if (n <= 4) return V(Math.cos(j * 1.57 + 0.6) * 0.42, 0, Math.sin(j * 1.57 + 0.6) * 0.42);
  const a = j * 2.399 + 0.6, r = 0.32 + (j % 3) * 0.12;
  return V(Math.cos(a) * r, 0, Math.sin(a) * r);
}
function falleBauen() {
  const o = new THREE.Group();
  const metall = new THREE.MeshStandardMaterial({ color: 0x8d8fa0, metalness: 0.7, roughness: 0.35 });
  const teller = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.06, 18), metall); teller.position.y = 0.03;
  const buegel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 20), metall); buegel.rotation.x = Math.PI / 2; buegel.position.y = 0.07;
  o.add(teller, buegel);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const zahn = new THREE.Group(); zahn.position.set(Math.cos(a) * 0.27, 0.06, Math.sin(a) * 0.27); zahn.rotation.y = -a + Math.PI / 2;
    const z = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), metall); z.position.y = 0.07; zahn.add(z);
    zahn.userData.zahn = k % 2 ? 1 : -1; o.add(zahn);
  }
  o.traverse((x) => { if (x.isMesh) x.castShadow = true; });
  return o;
}

// fuer die Tests: ragt die Insel in der Uebersicht ("Ganzes Brett", auch Ruhelage ohne Kamerafahrten) ueber den Bildrand?
// (<= 1 heisst: alles im Bild). Seit dem Kamera-Umbau 31.10.2026 abends folgt die Kamera sonst bewusst nah der Figur.
export function kameraRand() {
  if (!g) return null;
  const ue = uebersichtPose(), cam = g.mess;
  cam.aspect = g.camera.aspect; cam.updateProjectionMatrix();
  cam.position.copy(ue.p); cam.lookAt(ue.l);
  return randWert(cam);
}
// fuer die Tests: was die Kamera gerade tut
export function kameraStand() {
  if (!g) return null;
  return { fahrt: g.fahrt ? g.fahrt.name : null, folgen: fahrtenAn(), abstand: +g.kamP.distanceTo(g.kamL).toFixed(2), stufe: g.stufe, sieger: !!g.sieger,
    wuerfel: g.wuerfel.filter((x) => x.visible).length, zaehler: g.zaehler.visible ? g.zaehler.userData.n : 0, look: g.look, bilder: g.bilder,
    laufen: g.figuren.some((f) => f.pfad.length > 0 || f.startIn > 0) };
}

// Schalter oben rechts: Kamera folgt / ganzes Brett (kein <button>, damit die Controller-Fuehrung ihn nicht anspringt)
function kameraSchalter(container) {
  let el = container.querySelector(".brett3d-kamera");
  if (!el) {
    el = document.createElement("span");
    el.className = "brett3d-kamera"; el.setAttribute("role", "button"); el.tabIndex = 0;
    container.appendChild(el);
  }
  const zeigen = () => { el.textContent = g.folgen ? "🎥 Kamera folgt" : "🗺️ Ganzes Brett"; el.setAttribute("aria-label", g.folgen ? "Kamera folgt der Figur – antippen für das ganze Brett" : "Ganzes Brett – antippen, damit die Kamera folgt"); };
  const umschalten = (ev) => { ev.preventDefault(); ev.stopPropagation(); g.folgen = !g.folgen; g.fahrt = null; lsSchreiben("pa_brett_kamera", g.folgen ? "folgen" : "uebersicht"); zeigen(); };
  el.onclick = umschalten;
  el.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") umschalten(ev); };
  el.hidden = !!g.sieger;
  zeigen();
}

// brett = { lage: [{x, z}], next: [[...]], waren }  (aus brett.js)
// sieger (nur fuer die Siegerehrung): { plaetze: [[j, stufe 1-3 oder 0], ...], jubel: [j], trauer: [j] }
export function brett3dZeigen(container, s, muster, brett, sieger = null) {
  // neu bauen, wenn sich Spielerzahl, Felder oder Aussehen aendern (ohne Trinken: Aufgabenfelder statt Trinkfelder)
  if (g && (g.figuren.length !== s.pos.length || g.muster !== muster || g.look !== lookVon() || g.welt !== (brett.welt === "vulkan" ? "vulkan" : "insel"))) {
    try { g.renderer.dispose(); } catch (e) { /* egal */ }
    g.laeuft = false; g = null;
  }
  try {
    if (!g) { aufbauen(muster, s.pos.length, brett); g.muster = muster; g.next = brett.next; }
  } catch (e) {
    console.warn("3D nicht verfuegbar - flaches Brett", e);
    g = null;
    return false;
  }
  g.container = container;
  container.insertBefore(g.renderer.domElement, container.firstChild);
  // Siegerehrung: flacheres Bild, Figuren aufs Treppchen
  const warSieger = !!g.sieger;
  g.sieger = sieger ? siegerPlaetze(sieger, s.pos.length) : null;
  g.podest.visible = !!g.sieger;
  g.hoehe = g.sieger ? 0.56 : 0.82;
  const breite = container.clientWidth || 360;
  g.groesse = [breite, Math.round(breite * g.hoehe)];
  g.renderer.setSize(g.groesse[0], g.groesse[1], false);
  g.renderer.domElement.style.width = "100%"; g.renderer.domElement.style.height = "auto";
  g.camera.aspect = 1 / g.hoehe; g.camera.updateProjectionMatrix();
  // Siegerehrung: von etwas weiter oben aufs Treppchen zufahren; zurueck aufs Brett ohne Fahrt
  if (g.sieger && !warSieger) { const z = siegerPose(); g.kamP.copy(z.p).add(V(0, 3, 6)); g.kamL.copy(z.l); g.fahrt = null; }
  if (!g.sieger && warSieger) { g.gesetzt = true; }
  kameraSchalter(container);
  const ersterBlick = g.rundeAlt === undefined;
  g.phase = s.phase;

  // Wurf: neuer Wurf -> Block anspringen, erst danach loslaufen
  const zahlen = s.wuerfe && s.wuerfe.length ? s.wuerfe : s.wurf ? [s.wurf] : null;
  const schluessel = zahlen ? `${s.runde}-${s.dran}-${zahlen.join("+")}-${s.spur ? s.spur.nr : 0}` : null;
  let neuerWurf = false;
  if (schluessel && schluessel !== g.wurfSchluessel) {
    const alt = g.wurfSchluessel;
    g.wurfSchluessel = schluessel;
    if (alt !== null || !ersterBlick) {
      neuerWurf = true;
      g.wurf = { j: s.dran, t0: performance.now(), zahlen: zahlen.map((z) => Math.min(6, z)), getroffen: false };
      klang("wuerfel");
    }
  }
  g.wuerfelZahl = s.wuerfelArt === "dreifach" ? 3 : s.wuerfelArt === "doppel" ? 2 : 1;
  g.wuerfelKlein = s.wuerfelArt === "mini";

  // Zustand uebernehmen: neuer Zug -> Figur laeuft den Weg (s.spur), sonst direkt hinhuepfen
  s.pos.forEach((p, j) => {
    const f = g.figuren[j];
    if (f.erst === undefined) { f.erst = true; f.anzeige = p; f.ziel = p; if (s.spur && s.spur.j === j) { f.spurNr = s.spur.nr; f.spurLaenge = s.spur.felder.length; } return; }
    if (s.spur && s.spur.j === j && s.spur.nr !== f.spurNr) {
      f.spurNr = s.spur.nr; f.spurLaenge = s.spur.felder.length;
      const weg = s.spur.felder.slice(1);
      if (s.spur.sprung) { f.pfad = [p]; f.sprung = true; }
      else {
        const k = weg.lastIndexOf(p);
        f.pfad = k >= 0 ? weg.slice(0, k + 1) : [...weg, p];
        if (f.pfad[f.pfad.length - 1] !== p) f.pfad.push(p);
        if (k < 0) f.sprungZiel = p;   // Portal oder K.O.: erst den Weg laufen, dann springen
        if (f.pfad.length === 1 && k < 0) f.sprung = true;
        if (neuerWurf && g.wurf.j === j) { f.startIn = WURF.los; f.huepfen = 0; }
      }
      f.ziel = p;
    } else if (s.spur && s.spur.j === j && s.spur.nr === f.spurNr && s.spur.felder.length > (f.spurLaenge || 0) && !s.spur.sprung) {
      // nach der Wegwahl an der Abzweigung: den Rest des Weges weiterlaufen (nicht springen)
      const neu = s.spur.felder.slice(f.spurLaenge);
      f.spurLaenge = s.spur.felder.length;
      f.pfad = [...f.pfad, ...neu];
      if (f.pfad[f.pfad.length - 1] !== p) f.pfad.push(p);
      f.ziel = p;
    } else if (f.ziel !== p) {
      const lauf = f.pfad.length ? f.pfad[f.pfad.length - 1] : f.anzeige;
      if (lauf !== p) { f.pfad = [p]; f.sprung = true; }
      f.ziel = p;
    }
  });
  // Standort fuer die Kamera schon jetzt (die Bildschleife setzt ihn sonst erst im naechsten Bild)
  if (!g.sieger) g.figuren.forEach((f, j) => { if (!f.pfad.length || f.startIn > 0) f.boden.copy(g.lage[f.anzeige]).add(versatz(j, g.figuren.length)).setY(0); });

  // Kamerafahrten: Rundenbeginn (Ueberflug, Stern, Figur), Zugbeginn (zur Figur), Stern wandert (hin und zurueck)
  const neueRunde = !ersterBlick && s.runde !== g.rundeAlt && !s.ende;
  const spielStart = ersterBlick && s.runde === 1 && !(s.spurNr > 0) && s.phase === "wuerfeln";
  const sternNeu = !ersterBlick && g.sternAlt !== undefined && g.sternAlt !== s.stern;
  const sp = g.lage[s.stern] || V();
  if (ersterBlick || !g.sternPos.lengthSq()) g.sternPos.set(sp.x, 0, sp.z);
  else if (sternNeu) g.sternFlug = { von: g.sternPos.clone().setY(0), nach: V(sp.x, 0, sp.z), t: 0 };
  g.aktiv = s.dran;
  if ((ersterBlick || g.gesetzt) && !g.sieger) { const r = ruhePose(); g.kamP.copy(r.p); g.kamL.copy(r.l); g.gesetzt = false; }
  if ((neueRunde || spielStart) && s.phase === "wuerfeln") {
    if (spielStart) { const ue = uebersichtPose(); g.kamP.copy(ue.p); g.kamL.copy(ue.l); }
    fahrtStarten("runde", [{ bahn: true, dauer: 1.7 }, { ziel: sternPose, dauer: 0.7, halten: 0.45 }, { ziel: () => folgePose(s.dran), dauer: 0.65 }]);
  } else if (sternNeu && !(g.fahrt && g.fahrt.name === "runde")) {
    fahrtStarten("stern", [{ ziel: sternPose, dauer: 0.8, halten: 0.9 }, { ziel: () => ruhePose(), dauer: 0.6 }]);
  } else if (!ersterBlick && g.dranAlt !== s.dran && !(g.fahrt && g.fahrt.name === "runde")) {
    fahrtStarten("zug", [{ ziel: () => folgePose(s.dran), dauer: 0.8 }]);
  }
  g.rundeAlt = s.runde; g.sternAlt = s.stern; g.dranAlt = s.dran;

  // Teil 4b: Lebenspunkte fuer die Plaketten, Bomben/Absperrungen/Muenzhaufen auf den Feldern
  g.lp = Array.isArray(s.lp) ? s.lp.slice() : null;
  markerAbgleichen(s);
  // Fallen: neue erscheinen, ausgeloeste schnappen zu
  const fallen = s.fallen || {};
  Object.keys(g.fallenObj).forEach((k) => {
    if (k in fallen) return;
    g.schnapp.push({ o: g.fallenObj[k], t: 0 }); delete g.fallenObj[k];
  });
  Object.keys(fallen).forEach((k) => {
    if (g.fallenObj[k] || !g.felder[k]) return;
    const o = falleBauen(); const p = g.felder[k].p; o.position.set(p.x + 0.42, FELD_OBEN, p.z - 0.3);
    g.scene.add(o); g.fallenObj[k] = o;
  });

  // Effekte zum letzten Ereignis (einmal je Ereignis, erst wenn die Figur angekommen ist); was beim ersten Anblick schon
  // da war, wird nicht nachgespielt - das erste neue Ereignis danach aber schon
  if (ersterBlick) g.effektNr = s.effekt ? s.effekt.nr : 0;
  if (s.effekt && s.effekt.nr !== g.effektNr) {
    const e = s.effekt;
    if (!g.sieger) {
      if (e.art === "rohr" || e.art === "tausch") {
        // Sternenrohr/Tausch: am alten Platz ein Rohr bzw. Wirbel, die Figur springt, am Ziel taucht sie auf
        const f = g.figuren[e.j];
        if (e.art === "rohr" && f) {
          const alt = f.obj.position.clone().setY(0), neu = g.lage[s.pos[e.j]] || alt;
          [alt, neu].forEach((q, k) => { const r = g.rohre[k]; r.position.set(q.x, 0, q.z); r.visible = true; r.userData.t = -k * 0.4; r.scale.set(1, 0.01, 1); });
        }
        effektZeigen(e);
        nachDerLandung(e.j, () => { funkenAn(figurPos(e.j), e.art === "rohr" ? 0.14 : 0.78); if (e.art === "rohr") zoomFahrt(e.j, "rohr"); });
      } else if (e.art === "schild" || e.art === "falle") effektZeigen(e);
      else nachDerLandung(e.j, () => effektZeigen(e));
    }
    g.effektNr = e.nr;
  }
  if (!g.sieger) {
    const sternSchluessel = s.sterne.join(",");
    if (g.sterneAlt !== undefined && g.sterneAlt !== sternSchluessel && !(s.effekt && s.effekt.art === "stern")) nachDerLandung(s.dran, () => { funkenAn(figurPos(s.dran)); gefuehl(s.dran, "jubel"); });
    g.sterneAlt = sternSchluessel;
  }
  if (!g.laeuft) { g.laeuft = true; g.gen = ++generation; g.uhr.getDelta(); schleife(g.gen); }
  return true;
}
function siegerPlaetze(sieger, n) {
  const platz = {}, je = { 1: [], 2: [], 3: [] }, boden = [];
  sieger.plaetze.forEach(([j, stufe]) => { if (stufe) je[stufe].push(j); else boden.push(j); });
  for (let j = 0; j < n; j++) if (!sieger.plaetze.some(([x]) => x === j)) boden.push(j);
  Object.entries(je).forEach(([stufe, l]) => l.forEach((j, k) => { platz[j] = { stufe: Number(stufe), dx: (k - (l.length - 1) / 2) * 0.42 }; }));
  // wer nicht aufs Treppchen kommt, steht links und rechts daneben (nie davor - sonst verdeckt er die Stufen)
  boden.forEach((j, k) => { platz[j] = { stufe: 0, x: (k % 2 ? 1 : -1) * (1.95 + Math.floor(k / 2) * 0.75) }; });
  (sieger.jubel || []).forEach((j) => { if (platz[j]) platz[j].gefuehl = "jubel"; });
  (sieger.trauer || []).forEach((j) => { if (platz[j]) platz[j].gefuehl = "trauer"; });
  return { platz };
}
