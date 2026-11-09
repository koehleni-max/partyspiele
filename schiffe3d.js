// Schiffe versenken in 3D (Nico 09.11.2026, "Ja, in 3D"). Nur die Darstellung - Regeln, Computer und Zustand bleiben beim
// Regelwerk (fremd/battleship.js, LAN Games); die fremden Schiffe bleiben geheim (das Regelwerk schickt sie gar nicht).
// Unterbau: tisch3d.js (Umgebung "meer").
//   Bild     Offene See mit Wellen am Abend. Zwei Seegebiete, jedes in einem schwimmenden Holzrahmen mit Seil-Raster und
//            Schild: "Gegner" (dorthin wird geschossen) und "Deine Flotte" (eigene Schiffe als Modelle: Rumpf mit Bug, Aufbau,
//            Geschuetztuerme, Schornstein - sie schaukeln mit den Wellen). Versenkte Schiffe liegen schief und tief.
//   Ablauf   Schuss: eine gluehende Granate fliegt im Bogen ins Feld. Wasser = Fontaene und weisser Stift; Treffer = Explosion
//            (Blitz, Funken, Wackeln), danach brennt es dort und raucht; versenkt = grosse Einblendung.
//   Handy    Eigenes Feld und Gegnerfeld klar getrennt: die Kamera zeigt jeweils eines bildfuellend - wer dran ist, sieht das
//            Gegnerfeld, sonst die eigene Flotte; oben rechts umschalten. Feld antippen = Fadenkreuz, dann "Feuer!" (oder dasselbe
//            Feld nochmal antippen).
//   Wand     Beide Seegebiete nebeneinander, Schuesse, Feuer und Fontaenen; Schiffe nur als Wrack, wenn versenkt (sonst geheim).
//   Wrack    Ein versenktes Schiff ist nach der Regel offen: es liegt dann schief, tief und dunkel im Meer - am Handy auch im
//            Gegnermeer, an der Wand in beiden (09.11.2026). Nicht versenkte fremde Schiffe bleiben unsichtbar.
import * as T3 from "./tisch3d.js";
import { spiele as klang } from "./ton.js";
import * as BGU from "./vendor/addons/utils/BufferGeometryUtils.js";

const { THREE, V } = T3;
export const SCHIFFE3D_ZEIT = { flug: 0.95, nach: 0.9, wechsel: 1.4 };
const BUCHST = "ABCDEFGHIJ";

let T = null, g = null;

// Seegebiet k: Mitte und Weltlage eines Feldes
function mitteVon(k) { return g.nebeneinander ? V(k === 0 ? -(g.B / 2 + 1.6) : g.B / 2 + 1.6, 0, 0) : V(0, 0, k === 0 ? 0 : g.H + 4.5); }
const feld = (k, x, y, h = 0) => mitteVon(k).add(V(x - (g.B - 1) / 2, h, y - (g.H - 1) / 2));

function schildTextur(text, farbe) {
  const [c, x] = T3.leinwand(512, 128);
  x.fillStyle = "#3a2210"; x.fillRect(0, 0, 512, 128);
  x.strokeStyle = farbe; x.lineWidth = 10; x.strokeRect(5, 5, 502, 118);
  x.font = "900 54px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#fff";
  let t = text; while (x.measureText(t).width > 470 && t.length > 4) t = t.slice(0, -2) + "…";
  x.fillText(t, 256, 68);
  return T3.textur(c);
}
function rumpfGeo(laenge) {
  const L = laenge * 0.92, B = 0.62, s = new THREE.Shape();
  s.moveTo(-L / 2, -B / 2 * 0.8); s.lineTo(L / 2 - 0.55, -B / 2); s.quadraticCurveTo(L / 2, -B / 4, L / 2 + 0.05, 0); s.quadraticCurveTo(L / 2, B / 4, L / 2 - 0.55, B / 2);
  s.lineTo(-L / 2, B / 2 * 0.8); s.quadraticCurveTo(-L / 2 - 0.1, 0, -L / 2, -B / 2 * 0.8);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, -0.14, 0);
  return geo;
}
// Schiff als Gruppe (Achse entlang x): Rumpf, Deck, Aufbau, Tuerme, Schornstein - je Material zu einem Teil zusammengefasst
// (wenige Zeichnungen: am Handy kostet jede einzelne Rechenzeit)
function schiffBauen(laenge, mats) {
  const teile = { rumpf: [], deck: [], aufbau: [], dunkel: [] };
  const teil = (art, geo, x = 0, y = 0, z = 0, rz = 0) => { const gg = (geo.index ? geo.toNonIndexed() : geo); gg.deleteAttribute("uv"); if (rz) gg.rotateZ(rz); gg.translate(x, y, z); teile[art].push(gg); };
  teil("rumpf", rumpfGeo(laenge));
  teil("deck", new THREE.BoxGeometry(laenge * 0.8, 0.04, 0.5), 0, 0.25);
  teil("aufbau", new THREE.BoxGeometry(Math.min(1.4, laenge * 0.3), 0.32, 0.36), -laenge * 0.05, 0.42);
  teil("aufbau", new THREE.BoxGeometry(0.34, 0.2, 0.3), -laenge * 0.05, 0.68);
  if (laenge >= 3) teil("dunkel", new THREE.CylinderGeometry(0.09, 0.11, 0.38, 12), -laenge * 0.05 - 0.45, 0.6);
  (laenge >= 4 ? [0.32, -0.38] : laenge >= 3 ? [0.32] : [0.3]).forEach((f) => {
    teil("aufbau", new THREE.CylinderGeometry(0.16, 0.18, 0.14, 14), f * laenge, 0.33);
    teil("dunkel", new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6), f * laenge + Math.sign(f) * 0.24, 0.36, 0, Math.PI / 2);
  });
  if (laenge === 5) teil("deck", new THREE.BoxGeometry(laenge * 0.86, 0.05, 0.7), 0, 0.3);
  const gr = new THREE.Group();
  Object.entries(teile).forEach(([art, liste]) => {
    if (!liste.length) return;
    const m = new THREE.Mesh(BGU.mergeGeometries(liste), mats[art]); m.castShadow = art !== "dunkel"; gr.add(m);
  });
  return gr;
}
// Koordinaten (A-J oben, 1-10 links) als eine flache Tafel je Seegebiet statt vieler Einzelbilder
function beschriftungsTafel(B, H) {
  const px = 64, w = (B + 2) * px, h = (H + 2) * px;
  const [c, x] = T3.leinwand(w, h);
  x.font = "900 40px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#fff"; x.strokeStyle = "#000a"; x.lineWidth = 7;
  const schreib = (t, a, b) => { x.strokeText(t, a, b); x.fillText(t, a, b); };
  for (let i = 0; i < B; i++) schreib(BUCHST[i] || String(i + 1), (i + 1.5) * px, px * 0.6);
  for (let j = 0; j < H; j++) schreib(String(j + 1), px * 0.55, (j + 1.5) * px);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(B + 2, H + 2), new THREE.MeshBasicMaterial({ map: T3.textur(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.34; m.renderOrder = 3;
  return m;
}

function aufbauen(d) {
  T = T3.buehne("meer", { beamer: d.beamer, R: 7, name: "schiffe", leuchten: 0.5 });
  T3.stil();
  g = { B: d.b || 10, H: d.h || 10, nebeneinander: !!d.beamer, schiffe: [], gezeigt: [[], []], schlange: [], akt: null, ziel: null, blick: null, blickFest: null, sieg: null,
    zaehler: { schuss: 0, wasser: 0, treffer: 0, versenkt: 0, sieg: 0 }, d, knall: null, rauch: [] };
  const sc = T.scene;
  const holz = T3.lack(T, 0x6b3f1f, { roughness: 0.6 });
  g.rahmen = [0, 1].map((k) => {
    const gr = new THREE.Group(), B = g.B, H = g.H, m = mitteVon(k);
    [[0, -H / 2 - 0.25, B + 0.9, 0.4], [0, H / 2 + 0.25, B + 0.9, 0.4], [-B / 2 - 0.25, 0, 0.4, H], [B / 2 + 0.25, 0, 0.4, H]].forEach(([x, z, b, t]) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(b, 0.3, t), holz); l.position.set(x, 0.05, z); l.castShadow = true; gr.add(l);
    });
    // Seil-Raster
    const pts = [];
    for (let i = 0; i <= B; i++) pts.push(i - B / 2, 0.1, -H / 2, i - B / 2, 0.1, H / 2);
    for (let j = 0; j <= H; j++) pts.push(-B / 2, 0.1, j - H / 2, B / 2, 0.1, j - H / 2);
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    gr.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xf2e6c8, transparent: true, opacity: 0.55 })));
    gr.add(beschriftungsTafel(B, H));
    const schild = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshBasicMaterial({ transparent: true }));
    schild.position.set(0, 1.0, H / 2 + 1.1); schild.rotation.x = -0.6; gr.add(schild);
    gr.position.copy(m); sc.add(gr);
    return { gr, schild, schildText: "" };
  });
  T3.meerRuhe(T, [0, 1].map((k) => { const m = mitteVon(k); return { x: m.x, z: m.z, b: g.B + 1, t: g.H + 1 }; }));
  // Stifte (weiss = Wasser, rot = Treffer), Feuer, Rauch, Fadenkreuz, Granate, Fontaene, Blitz
  const stiftGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.62, 12); stiftGeo.translate(0, 0.26, 0);
  g.weiss = new THREE.InstancedMesh(stiftGeo, T3.lack(T, 0xf4f4f4), 200); g.rot = new THREE.InstancedMesh(stiftGeo, T3.leucht(0xff2a1a, 0.9), 200);
  [g.weiss, g.rot].forEach((m) => { m.count = 0; m.frustumCulled = false; m.castShadow = true; sc.add(m); });
  g.feuer = new THREE.InstancedMesh(new THREE.ConeGeometry(0.34, 0.95, 10).translate(0, 0.45, 0), new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), 200);
  g.feuer.count = 0; g.feuer.frustumCulled = false; sc.add(g.feuer);
  const RAUCH = 160;
  g.rauchGeo = new THREE.BufferGeometry(); g.rauchGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RAUCH * 3), 3));
  g.rauchPkt = new THREE.Points(g.rauchGeo, new THREE.PointsMaterial({ size: 0.9, map: T3.weich(), color: 0x3a3a3a, transparent: true, opacity: 0.55, depthWrite: false }));
  g.rauchPkt.frustumCulled = false; sc.add(g.rauchPkt);
  g.rauchDaten = Array.from({ length: RAUCH }, (_, i) => ({ p: V(0, -99, 0), alter: 9 + i }));
  const kreuz = new THREE.Group();
  const kmat = T3.leucht(0xff3b3b, 2.6);
  [[1.1, 0.06], [0.06, 1.1]].forEach(([b, t]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(b, 0.06, t), kmat); m.position.y = 0.12; kreuz.add(m); });
  const kring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 32).rotateX(Math.PI / 2), kmat); kring.position.y = 0.12; kreuz.add(kring);
  kreuz.visible = false; sc.add(kreuz); g.kreuz = kreuz;
  g.granate = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), T3.leucht(0xffb040, 3)); g.granate.visible = false; sc.add(g.granate);
  g.blitz = new THREE.Sprite(new THREE.SpriteMaterial({ map: T3.weich(), color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); g.blitz.visible = false; sc.add(g.blitz);
  const FONT = 70;
  g.fontGeo = new THREE.BufferGeometry(); g.fontGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FONT * 3), 3));
  g.fontaene = new THREE.Points(g.fontGeo, new THREE.PointsMaterial({ size: 0.35, map: T3.weich(), color: 0xe8f6ff, transparent: true, depthWrite: false }));
  g.fontaene.visible = false; g.fontaene.frustumCulled = false; sc.add(g.fontaene);
  g.mats = { rumpf: new THREE.MeshStandardMaterial({ color: 0x4f5a66, roughness: 0.5, metalness: 0.15 }), deck: new THREE.MeshStandardMaterial({ color: 0x6b6f74, roughness: 0.8 }), aufbau: new THREE.MeshStandardMaterial({ color: 0x9aa6b4, roughness: 0.45, metalness: 0.1 }),
    dunkel: new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.5, metalness: 0.5 }), wrack: new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.9 }) };
  T.takt = takt; T.pose = pose; T.tipp = tipp;
}

// ---------------------------------------------------------------- Stand -> Auftritte
function meereAus(d) {
  // Handy: 0 = Gegner (meine Schuesse), 1 = eigene Flotte (fremde Schuesse + eigene Schiffe). Wand: 0/1 = Meer von Spieler 0/1
  // Versenkte fremde Schiffe sind nach der Regel offen (battleship.js: SHIP_SUNK zeigt die Zellen) - sie liegen als Wrack im
  // Meer (wracks); alle anderen fremden Schiffe bleiben unsichtbar.
  if (d.beamer) return [0, 1].map((j) => ({ schuesse: (d.schuesse[1 - j] || []), schiffe: ((d.wracks || [])[j] || []), titel: `${(d.namen || [])[j] || `Spieler ${j + 1}`}s Meer`, farbe: d.farben[j] || "#fff", schuetze: 1 - j }));
  const geg = 1 - d.ich, nmG = (d.namen || [])[geg] || "Gegner";
  return [{ schuesse: d.vonMir || [], schiffe: d.wracks || [], titel: `🎯 ${nmG}s Meer`, farbe: d.farben[geg] || "#ff5a5a", schuetze: d.ich },
    { schuesse: d.aufMich || [], schiffe: d.meineSchiffe || [], titel: "🛡️ Deine Flotte", farbe: d.farben[d.ich] || "#5ab4ff", schuetze: geg }];
}
function neuerStand(d) {
  const meere = meereAus(d);
  g.meere = meere;
  meere.forEach((m, k) => {
    const alt = g.gezeigt[k], neu = m.schuesse;
    if (neu.length < alt.length || neu.length - alt.length > 3 || !g.erstGesehen) { g.gezeigt[k] = neu.map((s) => s.slice()); return; }
    for (let i = alt.length; i < neu.length; i++) g.schlange.push({ k, s: neu[i].slice(), schuetze: m.schuetze });
  });
  g.erstGesehen = true;
  // Schilder
  g.rahmen.forEach((r, k) => {
    const t = meere[k].titel;
    if (r.schildText !== t) { r.schildText = t; if (r.schild.material.map) r.schild.material.map.dispose(); r.schild.material.map = schildTextur(t, meere[k].farbe); r.schild.material.needsUpdate = true; }
  });
  schiffeAbgleichen(meere.map((m) => m.schiffe));
  // Blick am Handy: wer dran ist, sieht das Gegnerfeld; sonst die eigene Flotte (bis jemand umschaltet)
  const blickSoll = d.phase === "setup" ? 1 : d.dran === d.ich ? 0 : 1;
  if (g.blickSollAlt !== blickSoll) { g.blickSollAlt = blickSoll; g.blickFest = null; }
  if (d.vorbei && !g.sieg) { g.sieg = { p: d.sieger.length ? d.sieger[0] : null, seit: T.uhr.elapsedTime }; g.zaehler.sieg++; if (g.sieg.p !== null) T3.konfettiStart(T, [d.farben[g.sieg.p] || "#ffd23f", "#ffd23f", "#ffffff"], mitteVon(g.blick || 0), 7); }
  if (!d.vorbei) g.sieg = null;
  if (g.ziel && (!d.darf || g.gezeigt[0].some(([x, y]) => x === g.ziel[0] && y === g.ziel[1]))) g.ziel = null;
}
// je Seegebiet k eine Liste [{ zellen, waagerecht, versenkt }] - Handy: 0 = Wracks im Gegnermeer, 1 = eigene Flotte
function schiffeAbgleichen(jeMeer) {
  const listen = [0, 1].map((k) => (jeMeer[k] || []).filter((s) => s && Array.isArray(s.zellen) && s.zellen.length));
  const sig = JSON.stringify(listen.map((l) => l.map((s) => [s.zellen[0], s.zellen.length, s.waagerecht, s.versenkt])));
  if (sig === g.schiffSig) return;
  g.schiffSig = sig;
  g.schiffe.forEach((s) => T.scene.remove(s.gr));
  g.schiffe = listen.flatMap((liste, k) => liste.map((s) => {
    const gr = schiffBauen(s.zellen.length, g.mats);
    const a = s.zellen[0], b = s.zellen[s.zellen.length - 1];
    const p = feld(k, (a.x + b.x) / 2, (a.y + b.y) / 2);
    gr.position.copy(p); gr.rotation.y = s.waagerecht ? 0 : -Math.PI / 2;
    if (s.versenkt) gr.traverse((o) => { if (o.isMesh) o.material = g.mats.wrack; });
    T.scene.add(gr);
    return { gr, p, k, versenkt: s.versenkt, saat: a.x * 7 + a.y * 3 };
  }));
}
// versenkte Schiffe eines Spielers im Format oben (aus dem vollen Stand des Regelwerks; nur versenkte - die sind offen)
export function wracksVon(spieler) {
  const weg = new Set((spieler && spieler.shipsSunk) || []);
  return ((spieler && spieler.ships) || []).filter((s) => weg.has(s.id)).map((s) => ({ zellen: (s.cells || []).map((c) => ({ x: c.x, y: c.y })), waagerecht: s.orientation === "horizontal", versenkt: true }));
}

// ---------------------------------------------------------------- je Bild
function takt(dt, t) {
  const d = g.d, Z = SCHIFFE3D_ZEIT;
  if (document.hidden && (g.akt || g.schlange.length)) { g.schlange.forEach((x) => g.gezeigt[x.k].push(x.s)); if (g.akt) g.gezeigt[g.akt.k].push(g.akt.s); g.schlange = []; g.akt = null; }
  if (!g.akt && g.schlange.length) {
    const x = g.akt = g.schlange.shift(); x.t = 0; x.ziel = feld(x.k, x.s[0], x.s[1]);
    const seite = g.nebeneinander ? (x.k === 0 ? 1 : -1) : x.k === 0 ? 1 : -1;
    x.von = g.nebeneinander ? x.ziel.clone().add(V(seite * 9, 6, 4)) : x.ziel.clone().add(V(0, 7, seite * 10));
    g.zaehler.schuss++; if (d.ton) klang("schuss");
  }
  if (g.akt) {
    const x = g.akt; x.t += dt * (g.schlange.length ? 2 : 1);
    const u = Math.min(1, x.t / Z.flug);
    g.granate.visible = u < 1; g.granate.position.copy(x.von).lerp(x.ziel, u); g.granate.position.y = x.ziel.y + (1 - u) * x.von.y + Math.sin(u * Math.PI) * 3;
    if (u >= 1 && !x.da) {
      x.da = true; g.gezeigt[x.k].push(x.s);
      const r = x.s[2];
      if (r === 0) { g.zaehler.wasser++; fontaeneAn(x.ziel); if (d.ton) klang("pop"); g.knall = { gross: "💦 Wasser!", farbe: "#7fd3ff", seit: t }; }
      else {
        g.zaehler.treffer++; if (r === 2) g.zaehler.versenkt++;
        g.blitz.visible = true; g.blitzT = 0; g.blitz.position.copy(x.ziel).add(V(0, 0.6, 0));
        T3.funkenAn(T, x.ziel.clone().add(V(0, 0.4, 0)), 0xffa040, r === 2 ? 1 : 0.7, 0.5); T3.wackeln(T, t, r === 2 ? 0.7 : 0.45, r === 2 ? 1.6 : 1);
        if (d.ton) klang(r === 2 ? "schrei" : "aua");
        g.knall = r === 2 ? { gross: "💥 Versenkt!", klein: x.k === (d.beamer ? -1 : 1) ? "Ein eigenes Schiff ist gesunken" : "Ein ganzes Schiff ist weg", farbe: "#ff5a3a", seit: t } : { gross: "💥 Treffer!", farbe: "#ff8a3a", seit: t };
      }
    }
    if (x.t >= Z.flug + Z.nach) { g.akt = null; g.nachBlick = { k: x.k, bis: t + Z.wechsel }; }
  }
  // Blitz und Fontaene ausklingen
  if (g.blitz.visible) { g.blitzT += dt; const s = 1 + g.blitzT * 9; g.blitz.scale.set(s, s, 1); g.blitz.material.opacity = Math.max(0, 1 - g.blitzT / 0.45); if (g.blitzT > 0.45) g.blitz.visible = false; }
  if (g.fontaene.visible) {
    g.fontT += dt; const pos = g.fontGeo.attributes.position;
    g.fontDaten.forEach((p, i) => { p.v.y -= dt * 14; p.p.addScaledVector(p.v, dt); pos.setXYZ(i, p.p.x, Math.max(-0.2, p.p.y), p.p.z); });
    pos.needsUpdate = true; g.fontaene.material.opacity = Math.max(0, 1 - g.fontT / 1.1); if (g.fontT > 1.1) g.fontaene.visible = false;
  }
  stifteSetzen(t, dt);
  // Schiffe schaukeln mit den Wellen
  g.schiffe.forEach((s) => {
    const w = T3.welle(T, s.p.x, s.p.z, t) * 0.3;
    s.gr.position.y = (s.versenkt ? -0.22 : 0) + w;
    s.gr.rotation.z = (s.versenkt ? 0.22 : 0) + Math.sin(t * 1.3 + s.saat) * 0.03; s.gr.rotation.x = Math.sin(t * 1.1 + s.saat) * 0.025;
  });
  // Fadenkreuz
  g.kreuz.visible = !!(g.ziel && d.darf);
  if (g.kreuz.visible) { g.kreuz.position.copy(feld(0, g.ziel[0], g.ziel[1])); g.kreuz.rotation.y = t * 1.5; const s = 1 + Math.sin(t * 6) * 0.06; g.kreuz.scale.set(s, 1, s); }
  uiSetzen(t);
}
function fontaeneAn(ort) {
  g.fontDaten = Array.from({ length: 70 }, () => { const a = Math.random() * Math.PI * 2, s = Math.random() * 0.9; return { p: ort.clone(), v: V(Math.cos(a) * s, 5 + Math.random() * 4, Math.sin(a) * s) }; });
  g.fontaene.visible = true; g.fontT = 0;
  T3.welleAn(T, ort.clone().setY(0.1), 0xe8f6ff, 0.9);
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = V();
function stifteSetzen(t, dt) {
  let nw = 0, nr = 0, nf = 0;
  const brennt = [];
  g.gezeigt.forEach((liste, k) => liste.forEach(([x, y, r]) => {
    const p = feld(k, x, y); p.y = T3.welle(T, p.x, p.z, t) * 0.17;
    if (r === 0) g.weiss.setMatrixAt(nw++, _m.compose(p, _q.identity(), _s.set(1, 1, 1)));
    else {
      g.rot.setMatrixAt(nr++, _m.compose(p, _q.identity(), _s.set(1, 1, 1)));
      const f = 0.8 + Math.sin(t * 17 + x * 3 + y) * 0.2 + Math.sin(t * 29 + y) * 0.1;
      g.feuer.setMatrixAt(nf++, _m.compose(p.clone().add(V(0, 0.25, 0)), _q.identity(), _s.set(f, f * (r === 2 ? 1.5 : 1.1), f)));
      brennt.push(p);
    }
  }));
  g.weiss.count = nw; g.rot.count = nr; g.feuer.count = nf;
  [g.weiss, g.rot, g.feuer].forEach((m) => { m.instanceMatrix.needsUpdate = true; });
  // Rauch: von brennenden Stellen steigt reihum Rauch auf
  const pos = g.rauchGeo.attributes.position, viele = T.stufe === "niedrig" ? 40 : T.stufe === "mittel" ? 80 : g.rauchDaten.length;
  g.rauchDaten.forEach((r, i) => {
    r.alter += dt;
    if (i >= viele || !brennt.length) { pos.setXYZ(i, 0, -99, 0); return; }
    if (r.alter > 2.4) { const q = brennt[i % brennt.length]; r.p.copy(q).add(V((Math.random() - 0.5) * 0.3, 0.6, (Math.random() - 0.5) * 0.3)); r.alter = Math.random() * 0.4; }
    r.p.y += dt * 0.9; r.p.x += dt * 0.25;
    pos.setXYZ(i, r.p.x, r.p.y, r.p.z);
  });
  pos.needsUpdate = true;
}
function eckpunkte(k) {
  const m = mitteVon(k), B = g.B / 2 + 1.1, H = g.H / 2 + 1.0;
  return [V(-B, 0, -H - 0.3), V(B, 0, -H - 0.3), V(-B, 0, H + 1.4), V(B, 0, H + 1.4), V(-B, 1.2, H + 1.2), V(B, 1.2, H + 1.2)].map((p) => p.add(m));
}
function pose(t) {
  const d = g.d;
  if (g.nebeneinander) {
    const pts = [...eckpunkte(0), ...eckpunkte(1)], blick = V(0, 0, 0.6), dir = T3.richtungAus(0, 0.95);
    return { pos: blick.clone().addScaledVector(dir, T3.einpassen(T, pts, blick, dir, 0.95, 0.72)), blick };
  }
  // Blick: selbst umgeschaltet > laufender Schuss > kurz nach dem Schuss noch dort > wer dran ist
  const k = g.blickFest !== null && g.blickFest !== undefined ? g.blickFest : g.akt ? g.akt.k : g.nachBlick && g.nachBlick.bis > t ? g.nachBlick.k : g.blickSollAlt || 0;
  g.blick = k;
  const blick = mitteVon(k).add(V(0, 0, 0.5)), dir = T3.richtungAus(0, 1.08);
  return { pos: blick.clone().addScaledVector(dir, T3.einpassen(T, eckpunkte(k), blick, dir, 0.96, 0.72)), blick, tempo: 2.2 };
}
function uiSetzen(t) {
  const d = g.d, nm = (j) => (d.namen || [])[j] || `Spieler ${j + 1}`;
  const knall = g.knall && t - g.knall.seit < 1.5 ? g.knall : null;
  if (g.sieg) {
    T3.anzeigeDran(T, g.sieg.p === null ? null : { name: `🏆 ${g.sieg.p === d.ich ? `Du (${nm(g.sieg.p)})` : nm(g.sieg.p)}`, farbe: d.farben[g.sieg.p], unter: "hat die ganze Flotte versenkt!" });
    T3.anzeigeSieg(T, g.sieg.p === null ? "Spiel vorbei" : `🏆 ${g.sieg.p === d.ich ? "Du gewinnst!" : `${nm(g.sieg.p)} gewinnt!`}`);
    T3.anzeigeKnall(T, knall); T3.anzeigeKnopf(T, null); T3.anzeigeHinweis(T, null); T3.anzeigeEcke(T, null); return;
  }
  T3.anzeigeSieg(T, null);
  T3.anzeigeKnall(T, knall);
  if (d.phase === "setup") {
    T3.anzeigeDran(T, { name: "Flotte aufstellen", farbe: d.farben[d.ich] || "#5ab4ff", unter: d.beamer ? "heimlich …" : "unten zufällig aufstellen, dann „Fertig“" });
    T3.anzeigeKnopf(T, null); T3.anzeigeHinweis(T, null); T3.anzeigeEcke(T, d.beamer ? null : "🛡️ Deine Flotte", null); return;
  }
  const ich = d.dran === d.ich;
  T3.anzeigeDran(T, d.dran === null || d.dran === undefined ? null : { name: ich ? `Du (${nm(d.dran)})` : nm(d.dran), farbe: d.farben[d.dran], unter: g.akt ? "schießt …" : ich ? "du schießt!" : "zielt …", ich });
  if (d.beamer) { T3.anzeigeEcke(T, null); T3.anzeigeKnopf(T, null); T3.anzeigeHinweis(T, null); return; }
  const andere = g.blick === 0 ? "🛡️ Meine Flotte" : "🎯 Gegnermeer";
  T3.anzeigeEcke(T, andere, () => { g.blickFest = g.blick === 0 ? 1 : 0; });
  const zielText = g.ziel ? `${BUCHST[g.ziel[0]] || g.ziel[0] + 1}${g.ziel[1] + 1}` : "";
  T3.anzeigeKnopf(T, d.darf && g.ziel && g.blick === 0 && !g.akt ? `🎯 Feuer auf ${zielText}!` : null, () => feuern(), "rot");
  T3.anzeigeHinweis(T, d.darf && !g.ziel && g.blick === 0 && !g.akt ? "👆 Feld antippen zum Zielen" : null);
}
function feuern() {
  const d = g.d;
  if (!g.ziel || !d.darf || !d.senden) return;
  const [x, y] = g.ziel; g.ziel = null;
  if (d.ton) klang("klick");
  d.senden(x, y);
}

// ---------------------------------------------------------------- Tippen: Feld im Gegnermeer
function tipp(cx, cy) {
  const d = g.d;
  if (!d.darf || g.blick !== 0 || g.akt) return false;
  const p = T3.aufEbene(T, cx, cy, 0);
  if (!p) return false;
  const m = mitteVon(0), x = Math.round(p.x - m.x + (g.B - 1) / 2), y = Math.round(p.z - m.z + (g.H - 1) / 2);
  if (x < 0 || y < 0 || x >= g.B || y >= g.H) return false;
  if (g.gezeigt[0].some(([a, b]) => a === x && b === y)) return false;
  if (g.ziel && g.ziel[0] === x && g.ziel[1] === y) { feuern(); return true; }
  g.ziel = [x, y]; if (d.ton) klang("tick");
  return true;
}

// ---------------------------------------------------------------- Einstieg
// d: { phase ("setup" | "firing"), b, h, dran, ich, namen, farben, vorbei, sieger [], beamer, darf, senden(x, y), ton,
//      Handy: meineSchiffe [{ zellen: [{x, y}], waagerecht, versenkt }], aufMich [[x, y, r]], vonMir [[x, y, r]] (r: 0 Wasser, 1 Treffer, 2 versenkt)
//      Wand: schuesse [[[x, y, r]], [[x, y, r]]] (je Spieler seine Schuesse auf den anderen) }
export function schiffe3dZeigen(container, d) {
  if (T && (T.weg || T.beamer !== !!d.beamer)) { T3.freigeben(T); T = null; g = null; }
  try { if (!T) aufbauen(d); } catch (e) { console.warn("3D nicht verfuegbar - flaches Meer", e); T = null; g = null; return false; }
  g.d = d;
  neuerStand(d);
  T3.einhaengen(T, container, d.beamer ? 0.6 : 1.12);
  return true;
}
export function schiffe3dFeld(k, x, y) { return T ? T3.bildPunkt(T, feld(k, x, y)) : null; }
export function schiffe3dStand() {
  if (!T || !g) return null;
  return { ...T3.buehneStand(T), blick: g.blick, ziel: g.ziel, schlange: g.schlange.length + (g.akt ? 1 : 0), zaehler: { ...g.zaehler }, schiffe: g.schiffe.length, versenkteSchiffe: g.schiffe.filter((s) => s.versenkt).length,
    wracksGegner: g.nebeneinander ? null : g.schiffe.filter((s) => s.k === 0).length,
    stifte: [g.weiss.count, g.rot.count], sieg: g.sieg ? g.sieg.p : null, drin: T3.imBild(T, g.nebeneinander ? [...eckpunkte(0), ...eckpunkte(1)].slice(0, 4).concat(eckpunkte(1).slice(0, 4)) : eckpunkte(g.blick || 0).slice(0, 4), 1),
    knopf: T.ui && !T.ui.knopf.hidden ? T.ui.knopf.textContent : null, ecke: T.ui && !T.ui.ecke.hidden ? T.ui.ecke.textContent : null, ui: T.ui ? `${T.ui.name.textContent} · ${T.ui.unter.textContent}` : "" };
}
