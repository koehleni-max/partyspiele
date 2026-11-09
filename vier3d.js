// Vier gewinnt in 3D (Nico 09.11.2026, "Ja, in 3D"). Nur die Darstellung - Regeln, Computer und Zustand bleiben beim Regelwerk
// (fremd/connect-four.js, LAN Games). Unterbau: tisch3d.js.
//   Bild     Aufrechtes blaues Gitter (Vorder- und Rueckwand mit runden Loechern, Standfuesse) auf dem Holztisch unter der Lampe,
//            Kamera leicht schraeg von vorn. Steine mit Rillenrand, glaenzend lackiert, in den Spielerfarben.
//   Ablauf   Ein neuer Stein faellt oben in seine Spalte, beschleunigt, schlaegt auf, federt zweimal nach (Klack), die Kamera wackelt
//            ein wenig. Steht ein Sieg fest, leuchten die vier Steine der Reihe, ein Goldstab verbindet sie, die Kamera faehrt heran,
//            Konfetti faellt.
//   Handy    Wer dran ist, sieht ueber jeder freien Spalte einen pulsierenden Pfeil in seiner Farbe und tippt einfach in die Spalte
//            (die ganze Spaltenbreite, auch ueber dem Gitter). Sofort schwebt der eigene Stein ueber der Spalte, bis der Zug zurueck ist.
//   Wand     Gleiches Bild gross (beamer_spiele.js), ohne Tippen und ohne eigene Klaenge (die Wand hat ihre eigenen).
import * as T3 from "./tisch3d.js";
import { spiele as klang } from "./ton.js";

const { THREE, V } = T3;
export const VIER3D_ZEIT = { fallG: 34, prall: 0.32, ruhe: 0.25 };
const SP = 7, ZE = 6, R_STEIN = 0.42, DICKE = 0.18, UNTEN = 0.55;   // Gitter: Zellen 1 x 1, unterste Reihe ab y = UNTEN
const zelleX = (c) => c - (SP - 1) / 2;
const zelleY = (r) => UNTEN + (ZE - 1 - r) + 0.5;
const OBEN_Y = UNTEN + ZE + 0.15;

let T = null, g = null;

function gitterGeo() {
  const B = SP + 0.5, H = ZE + 0.4;
  const form = new THREE.Shape();
  const r = 0.28, x0 = -B / 2, y0 = UNTEN - 0.2;
  form.moveTo(x0 + r, y0); form.lineTo(x0 + B - r, y0); form.quadraticCurveTo(x0 + B, y0, x0 + B, y0 + r); form.lineTo(x0 + B, y0 + H - r);
  form.quadraticCurveTo(x0 + B, y0 + H, x0 + B - r, y0 + H); form.lineTo(x0 + r, y0 + H); form.quadraticCurveTo(x0, y0 + H, x0, y0 + H - r); form.lineTo(x0, y0 + r); form.quadraticCurveTo(x0, y0, x0 + r, y0);
  for (let c = 0; c < SP; c++) for (let rr = 0; rr < ZE; rr++) { const loch = new THREE.Path(); loch.absarc(zelleX(c), zelleY(rr), R_STEIN + 0.03, 0, Math.PI * 2, true); form.holes.push(loch); }
  const geo = new THREE.ExtrudeGeometry(form, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 20 });
  return geo;
}
function steinGeo() {
  // Drehkoerper: Rillenrand, flache Mulde in der Mitte; Achse danach entlang z (Stein steht aufrecht im Gitter)
  const h = DICKE / 2, R = R_STEIN;
  const halb = [[0, h * 0.62], [R * 0.62, h * 0.62], [R * 0.7, h], [R * 0.9, h], [R, h * 0.7], [R, h * 0.25], [R * 0.97, 0]];
  const pts = [...halb.map(([x, y]) => [x, y]), ...halb.slice().reverse().map(([x, y]) => [x, -y])].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 40); geo.rotateX(Math.PI / 2);
  return geo;
}

function aufbauen(d) {
  T = T3.buehne("tisch", { beamer: d.beamer, R: 4.4, breite: 13, tiefe: 8, name: "vier" });
  T3.stil();
  const sc = T.scene;
  const blau = T3.lack(T, 0x2f6bff, { roughness: 0.3 });
  const geo = gitterGeo();
  [0.1, -0.2].forEach((z) => { const w = new THREE.Mesh(geo, blau); w.position.z = z; w.castShadow = true; w.receiveShadow = true; sc.add(w); });
  // Seitenholme und Standfuesse
  const holm = new THREE.BoxGeometry(0.3, ZE + 1.0, 0.5), fuss = new THREE.BoxGeometry(0.5, 0.22, 2.4);
  [-1, 1].forEach((s) => {
    const h = new THREE.Mesh(holm, blau); h.position.set(s * (SP / 2 + 0.38), UNTEN + ZE / 2 - 0.05, -0.05); h.castShadow = true; sc.add(h);
    const f = new THREE.Mesh(fuss, blau); f.position.set(s * (SP / 2 + 0.38), 0.11, -0.05); f.castShadow = true; f.receiveShadow = true; sc.add(f);
  });
  // Boden-Leiste (haelt die Steine), leicht dunkler
  const leiste = new THREE.Mesh(new THREE.BoxGeometry(SP + 0.5, 0.18, 0.5), T3.lack(T, 0x163c9e)); leiste.position.set(0, UNTEN - 0.28, -0.05); sc.add(leiste);
  // Steine: alle Zellen in einer Zeichnung (Farbe je Stein), dazu der schwebende Vorschau-Stein
  const sgeo = steinGeo();
  const steine = new THREE.InstancedMesh(sgeo, T3.lack(T, 0xffffff), SP * ZE + 1);
  steine.castShadow = true; steine.receiveShadow = true; steine.frustumCulled = false;
  for (let i = 0; i <= SP * ZE; i++) steine.setColorAt(i, new THREE.Color(0xffffff));
  sc.add(steine);
  // Pfeile ueber den freien Spalten (wer dran ist), Glanz und Goldstab fuer die Siegesreihe
  const pfeilGeo = new THREE.ConeGeometry(0.22, 0.4, 20); pfeilGeo.rotateX(Math.PI);
  const pfeile = Array.from({ length: SP }, (_, c) => { const m = new THREE.Mesh(pfeilGeo, T3.leucht(0xffffff, 1.6)); m.position.set(zelleX(c), OBEN_Y + 0.45, 0); m.visible = false; sc.add(m); return m; });
  const glanzMat = new THREE.SpriteMaterial({ map: T3.weich(), color: 0xffe08a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const glanz = Array.from({ length: 4 }, () => { const s = new THREE.Sprite(glanzMat.clone()); s.visible = false; s.renderOrder = 4; sc.add(s); return s; });
  const stab = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 16), T3.leucht(0xffb020, 1)); stab.visible = false; sc.add(stab);
  g = { steine, pfeile, glanz, stab, zeige: null, fall: null, schlange: [], vorschau: null, sieg: null, zaehler: { fall: 0, prall: 0, sieg: 0 }, d };
  T.takt = takt; T.pose = pose; T.tipp = tipp;
}

// ---------------------------------------------------------------- Stand -> Auftritte
function neuerStand(d) {
  const alt = g.zeige, neu = d.brett.map((r) => r.slice());
  const zahl = (b) => b.flat().filter((x) => x !== null).length;
  if (!alt || zahl(neu) < zahl(alt) || zahl(neu) - zahl(alt) > 1) { g.zeige = neu; g.fall = null; g.schlange = []; g.sieg = null; T.kamSprung = !alt; T3.konfettiAus(T); siegPruefen(d, true); return; }
  for (let r = 0; r < ZE; r++) for (let c = 0; c < SP; c++) {
    if (alt[r][c] === null && neu[r][c] !== null) g.schlange.push({ r, c, p: neu[r][c] });
  }
  g.ziel = neu;
}
function siegReihe(b, p) {
  const ds = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ZE; r++) for (let c = 0; c < SP; c++) for (const [dr, dc] of ds) {
    const reihe = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]);
    if (reihe.every(([y, x]) => y >= 0 && y < ZE && x >= 0 && x < SP && b[y][x] === p)) return reihe;
  }
  return null;
}
function siegPruefen(d, sofort = false) {
  if (!d.vorbei || g.sieg || g.fall || g.schlange.length) return;
  const p = d.sieger.length === 1 ? d.sieger[0] : null;
  const reihe = p === null ? null : siegReihe(g.zeige, p);
  g.sieg = { p, reihe, seit: T.uhr.elapsedTime, sofort };
  g.zaehler.sieg++;
  if (reihe) {
    const a = V(zelleX(reihe[0][1]), zelleY(reihe[0][0]), 0.14), b = V(zelleX(reihe[3][1]), zelleY(reihe[3][0]), 0.14);
    g.stab.position.copy(a).lerp(b, 0.5); g.stab.scale.set(1, a.distanceTo(b) + 0.5, 1);
    g.stab.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    T3.konfettiStart(T, [d.farben[p] || "#ffd23f", "#ffd23f", "#ffffff"], V(0, 0, 0.5), 8);
    T3.funkenAn(T, g.stab.position.clone(), 0xffd23f, 1, 0.6);
  }
}

// ---------------------------------------------------------------- je Bild
function takt(dt, t) {
  const d = g.d;
  // Fall des naechsten Steins: beschleunigen, aufschlagen, zweimal nachfedern
  if (!g.fall && g.schlange.length) {
    const x = g.schlange.shift();
    const start = g.vorschau && g.vorschau.c === x.c ? g.vorschau.y : OBEN_Y + 0.9;
    g.fall = { ...x, y: start, v: 0, praelle: 0, ruhe: 0 }; g.vorschau = null; g.zaehler.fall++;
  }
  if (g.fall) {
    const f = g.fall, ziel = zelleY(f.r), eile = g.schlange.length ? 1.8 : 1;
    f.v -= VIER3D_ZEIT.fallG * dt * eile; f.y += f.v * dt * eile;
    if (f.y <= ziel) {
      f.y = ziel;
      if (Math.abs(f.v) > 2.2 && f.praelle < 2) {
        if (d.ton && f.praelle === 0) klang("tack");
        if (f.praelle === 0) { T3.wackeln(T, t, 0.25, 0.6); g.zaehler.prall++; }
        f.v = -f.v * VIER3D_ZEIT.prall; f.praelle++;
      } else { f.v = 0; f.ruhe += dt; }
    }
    if (f.ruhe > VIER3D_ZEIT.ruhe) { g.zeige[f.r][f.c] = f.p; g.fall = null; siegPruefen(d); }
  }
  if (!g.fall && !g.schlange.length && g.ziel) {
    // was sonst anders ist (Nachzuegler): auf den Stand springen
    if (JSON.stringify(g.ziel) !== JSON.stringify(g.zeige)) g.zeige = g.ziel.map((r) => r.slice());
    g.ziel = null; siegPruefen(d);
  }
  steineSetzen(t);
  // Pfeile: nur wer dran ist und tippen darf, ueber freien Spalten
  const zeigen = d.darf && !g.fall && !g.schlange.length && !g.vorschau;
  g.pfeile.forEach((m, c) => {
    m.visible = !!(zeigen && g.zeige[0][c] === null);
    if (!m.visible) return;
    m.material.color.set(d.farben[d.ich] || "#fff"); m.material.emissive.set(d.farben[d.ich] || "#fff");
    m.position.y = OBEN_Y + 0.5 + Math.abs(Math.sin(t * 4 + c * 0.6)) * 0.22;
  });
  // Siegesreihe leuchtet
  const s = g.sieg && g.sieg.reihe;
  g.stab.visible = !!s; g.glanz.forEach((x, k) => {
    x.visible = !!s; if (!s) return;
    x.position.set(zelleX(s[k][1]), zelleY(s[k][0]), 0.25); const p = 1.5 + Math.sin(t * 5 + k) * 0.35; x.scale.set(p, p, 1);
  });
  if (s) g.stab.material.emissiveIntensity = 0.9 + Math.sin(t * 5) * 0.35;
  uiSetzen(t);
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = V();
function steineSetzen(t) {
  const d = g.d, st = g.steine;
  for (let r = 0; r < ZE; r++) for (let c = 0; c < SP; c++) {
    const i = r * SP + c, p = g.zeige[r][c], fall = g.fall && g.fall.r === r && g.fall.c === c ? g.fall : null;
    if (p === null && !fall) { st.setMatrixAt(i, _m.compose(V(0, -50, 0), _q, _s.set(0.001, 0.001, 0.001))); continue; }
    const y = fall ? fall.y : zelleY(r);
    const gew = g.sieg && g.sieg.reihe && g.sieg.reihe.some(([a, b]) => a === r && b === c);
    const sk = gew ? 1 + Math.abs(Math.sin(t * 5)) * 0.06 : 1;
    st.setMatrixAt(i, _m.compose(V(zelleX(c), y, -0.05), _q, _s.set(sk, sk, 1)));
    const farbe = new THREE.Color(d.farben[fall ? fall.p : p] || "#888");
    if (gew) farbe.lerp(new THREE.Color(0xffffff), 0.06 + Math.abs(Math.sin(t * 5)) * 0.1);
    st.setColorAt(i, farbe);
  }
  // Vorschau: eigener Stein schwebt ueber der getippten Spalte, bis der Zug zurueck ist
  const v = g.vorschau, iv = SP * ZE;
  if (v) {
    if (t - v.seit > 4) g.vorschau = null;
    else { v.y = OBEN_Y + 0.55 + Math.sin(t * 6) * 0.05; st.setMatrixAt(iv, _m.compose(V(zelleX(v.c), v.y, -0.05), _q, _s.set(1, 1, 1))); st.setColorAt(iv, new THREE.Color(d.farben[d.ich] || "#fff")); }
  }
  if (!g.vorschau) st.setMatrixAt(iv, _m.compose(V(0, -50, 0), _q, _s.set(0.001, 0.001, 0.001)));
  st.instanceMatrix.needsUpdate = true; if (st.instanceColor) st.instanceColor.needsUpdate = true;
}
function eckpunkte() { const B = SP / 2 + 0.6; return [V(-B, 0, 0.6), V(B, 0, 0.6), V(-B, OBEN_Y + 1.0, 0), V(B, OBEN_Y + 1.0, 0), V(-B, 0, -1.2), V(B, 0, -1.2)]; }
function pose(t) {
  const blick = V(0, UNTEN + ZE / 2 + 0.1, 0);
  const s = g.sieg && g.sieg.reihe && !T3.wenigBewegung();
  if (s && t - g.sieg.seit > 0.4) {
    // Kamerafahrt zum Sieg: naeher an die Reihe, langsam kreisend
    const pts = g.sieg.reihe.map(([r, c]) => V(zelleX(c), zelleY(r), 0)), mitte = pts.reduce((a, p) => a.add(p), V()).multiplyScalar(0.25);
    // die Reihe steht im oberen Teil des Bildes (unten das Siegesbanner), mit zwei Zellen Rand ringsum
    const a = 0.3 * Math.sin((t - g.sieg.seit) * 0.4), blickS = mitte.clone().add(V(0, -1.1, 0));
    const rand = pts.flatMap((p) => [p.clone().add(V(-2.8, 2.6, 0)), p.clone().add(V(2.8, -2.2, 0))]);
    const dir = T3.richtungAus(a, 0.16), dd = T3.einpassen(T, rand, blickS, dir, 0.92, 0.78);
    return { pos: blickS.clone().addScaledVector(dir, dd), blick: blickS, tempo: 1.6 };
  }
  // oben bleibt Platz fuer das Namensschild (Pfeile ueber den Spalten muessen darunter sichtbar sein)
  const dir = T3.richtungAus(T.beamer ? 0.28 : 0.22, T.beamer ? 0.26 : 0.2), dd = T3.einpassen(T, eckpunkte(), blick, dir, 0.94, T.beamer ? 0.74 : 0.6);
  return { pos: blick.clone().addScaledVector(dir, dd), blick };
}
function uiSetzen() {
  const d = g.d, nm = (j) => (d.namen || [])[j] || `Spieler ${j + 1}`;
  if (g.sieg && d.vorbei) {
    T3.anzeigeDran(T, g.sieg.p === null ? { name: "🤝 Unentschieden", farbe: "#ffffff", unter: "das Gitter ist voll" } : { name: `🏆 ${g.sieg.p === d.ich ? `Du (${nm(g.sieg.p)})` : nm(g.sieg.p)}`, farbe: d.farben[g.sieg.p], unter: "vier in einer Reihe!" });
    T3.anzeigeSieg(T, g.sieg.p === null ? "🤝 Unentschieden!" : `🏆 ${g.sieg.p === d.ich ? "Du gewinnst!" : `${nm(g.sieg.p)} gewinnt!`}`);
    T3.anzeigeHinweis(T, null);
    return;
  }
  T3.anzeigeSieg(T, null);
  if (d.dran === null || d.dran === undefined) { T3.anzeigeDran(T, null); return; }
  // waehrend ein Stein faellt, steht der Werfer im Schild (der Zug ist im Regelwerk schon weiter)
  const wer = g.fall ? g.fall.p : d.dran, ich = wer === d.ich;
  T3.anzeigeDran(T, { name: ich ? `Du (${nm(wer)})` : nm(wer), farbe: d.farben[wer], unter: g.fall ? "wirft ein …" : ich ? "Spalte antippen!" : "überlegt …", ich: ich && !g.fall });
  T3.anzeigeHinweis(T, d.darf && !g.fall && !g.vorschau ? "👆 In eine Spalte tippen" : null);
}

// ---------------------------------------------------------------- Tippen: Spalte
function spalteBei(cx, cy) {
  const r = T.renderer.domElement.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), T.camera);
  const p = V();
  if (!ray.ray.intersectPlane(new THREE.Plane(V(0, 0, 1), 0), p)) return null;
  if (p.y < 0 || p.y > OBEN_Y + 2.2) return null;
  const c = Math.round(p.x + (SP - 1) / 2);
  return c >= 0 && c < SP && Math.abs(p.x - zelleX(c)) <= 0.62 ? c : null;
}
function tipp(cx, cy) {
  const d = g.d;
  if (!d.darf || g.fall || g.schlange.length || g.vorschau || !d.senden) return false;
  const c = spalteBei(cx, cy);
  if (c === null || g.zeige[0][c] !== null) return false;
  g.vorschau = { c, y: OBEN_Y + 0.55, seit: T.uhr.elapsedTime };
  if (d.ton) klang("klick");
  d.senden(c);
  return true;
}

// ---------------------------------------------------------------- Einstieg
// d: { brett (Zeilen oben->unten, null | Spieler-Nr.), farben, dran, vorbei, sieger [], ich, namen, beamer, darf, senden(spalte), ton }
export function vier3dZeigen(container, d) {
  if (T && (T.weg || T.beamer !== !!d.beamer)) { T3.freigeben(T); T = null; g = null; }
  try { if (!T) aufbauen(d); } catch (e) { console.warn("3D nicht verfuegbar - flaches Gitter", e); T = null; g = null; return false; }
  g.d = d;
  neuerStand(d);
  if (!d.darf) g.vorschau = null;
  T3.einhaengen(T, container, 0.95);
  return true;
}
// fuer Tests: wo eine Spalte im Bild liegt (Mitte der obersten Zelle)
export function vier3dSpalte(c) { return T ? T3.bildPunkt(T, V(zelleX(c), zelleY(0), 0.1)) : null; }
export function vier3dStand() {
  if (!T || !g) return null;
  return { ...T3.buehneStand(T), zeige: g.zeige.map((r) => r.slice()), fall: !!g.fall, schlange: g.schlange.length + (g.fall ? 1 : 0), zaehler: { ...g.zaehler },
    sieg: g.sieg ? { p: g.sieg.p, reihe: g.sieg.reihe } : null, pfeile: g.pfeile.filter((m) => m.visible).length, vorschau: g.vorschau ? g.vorschau.c : null,
    drin: T3.imBild(T, eckpunkte().slice(0, 4), 1), ui: T.ui ? `${T.ui.name.textContent} · ${T.ui.unter.textContent}` : "" };
}
