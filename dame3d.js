// Dame in 3D (Nico 09.11.2026, "Ja, in 3D"). Nur die Darstellung - Regeln (ohne Schlagzwang, Hausregel aus fremd_bauen.py),
// Computer und Zustand bleiben beim Regelwerk (fremd/checkers.js, LAN Games). Unterbau: tisch3d.js.
//   Bild     Holzbrett mit Ahorn- und Nussbaumfeldern im dunklen Rahmen auf dem Tisch unter der Lampe; gedrechselte, lackierte
//            Steine mit Rillen (rot und schwarz). Eine Dame ist ein Doppelstein mit Goldkrone. Geschlagene Steine liegen als Stapel
//            neben dem Brett.
//   Ablauf   Zug = der Stein gleitet (kurz angehoben) aufs Zielfeld. Schlag = der Stein springt in hohem Bogen ueber den Gegner,
//            der getroffene Stein fliegt kreiselnd vom Brett auf den Stapel daneben (Stoss, Funken). Erreicht ein Stein die
//            Grundlinie, faellt ein zweiter Stein darauf, die Krone glitzert. Sieg: Konfetti, die Steine des Siegers huepfen.
//   Handy    Kamera von der eigenen Seite. Eigene Steine, die ziehen koennen, leuchten; antippen hebt den Stein, die Zielfelder
//            leuchten (rot = Schlag), Zielfeld antippen zieht. Mitten in einer Schlagkette ist der Stein schon gewaehlt.
import * as T3 from "./tisch3d.js";
import { spiele as klang } from "./ton.js";

const { THREE, V } = T3;
export const DAME3D_ZEIT = { gleiten: 0.38, sprung: 0.6, flug: 0.85, krone: 0.55 };
const N = 8, STEIN_R = 0.4, STEIN_H = 0.17, OBEN = 0.02;
const FARBE = [0xb81d12, 0x1d1e24];   // Stein-Lack: rot, schwarz (wie an der Wand)
const pos = (r, c, y = OBEN) => V(c - (N - 1) / 2, y, r - (N - 1) / 2);

let T = null, g = null;

function brettTextur(S) {
  const [cv, x] = T3.leinwand(S), f = S / N;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const dunkel = (r + c) % 2 === 1;
    const gr = x.createLinearGradient(c * f, r * f, (c + 1) * f, (r + 1) * f);
    if (dunkel) { gr.addColorStop(0, "#6a3d22"); gr.addColorStop(1, "#4a2814"); } else { gr.addColorStop(0, "#dcbf8a"); gr.addColorStop(1, "#c9a470"); }
    x.fillStyle = gr; x.fillRect(c * f, r * f, f, f);
    // Maserung je Feld (fest)
    x.strokeStyle = dunkel ? "rgba(20,8,2,.22)" : "rgba(120,80,30,.16)"; x.lineWidth = Math.max(1, S / 700);
    for (let k = 0; k < 4; k++) {
      const y0 = r * f + T3.zufallFest(r * 31 + c * 7 + k) * f, a = (T3.zufallFest(k + r + c * 3) - 0.5) * f * 0.12;
      x.beginPath(); x.moveTo(c * f, y0); x.bezierCurveTo(c * f + f * 0.33, y0 + a, c * f + f * 0.66, y0 - a, c * f + f, y0 + a * 0.4); x.stroke();
    }
  }
  x.strokeStyle = "#2b1607"; x.lineWidth = S / 160; x.strokeRect(0, 0, S, S);
  return T3.textur(cv);
}
// gedrechselter Stein: Drehkoerper mit zwei Rillen am Rand und Mulde oben
function steinGeo() {
  const R = STEIN_R, H = STEIN_H;
  const pts = [[0, 0], [R * 0.92, 0], [R, H * 0.12], [R, H * 0.3], [R * 0.95, H * 0.36], [R, H * 0.42], [R, H * 0.6], [R * 0.95, H * 0.66], [R, H * 0.72], [R, H * 0.88], [R * 0.9, H],
    [R * 0.78, H], [R * 0.72, H * 0.9], [R * 0.4, H * 0.86], [0, H * 0.86]].map(([a, b]) => new THREE.Vector2(a, b));
  return new THREE.LatheGeometry(pts, 40);
}
function kroneGeo() {
  const teile = [];
  const ring = new THREE.TorusGeometry(0.22, 0.045, 10, 32); ring.rotateX(Math.PI / 2); teile.push(ring);
  for (let k = 0; k < 6; k++) { const z = new THREE.ConeGeometry(0.06, 0.18, 8); z.translate(Math.cos((k / 6) * Math.PI * 2) * 0.22, 0.1, Math.sin((k / 6) * Math.PI * 2) * 0.22); teile.push(z); }
  return mergeGeos(teile);
}
// kleine Zusammenfuehrung ohne Zusatzmodul (nur Position/Normale)
function mergeGeos(geos) {
  const pos = [], nor = [];
  geos.forEach((gg) => { const g2 = gg.index ? gg.toNonIndexed() : gg; pos.push(...g2.attributes.position.array); nor.push(...g2.attributes.normal.array); });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}

function aufbauen(d) {
  T = T3.buehne("tisch", { beamer: d.beamer, R: 4.6, breite: 15, tiefe: 11, name: "dame", licht: 75, leuchten: 0.2, tiefer: 0.2 });
  T3.stil();
  const sc = T.scene, S = T.stufe === "niedrig" ? 1024 : 2048;
  const platte = new THREE.Mesh(new THREE.BoxGeometry(N, 0.2, N), [SCrand(), SCrand(), new THREE.MeshStandardMaterial({ map: brettTextur(S), roughness: 0.72 }) /* matt: sonst spiegelt die Lampe */, SCrand(), SCrand(), SCrand()]);
  platte.position.y = -0.1; platte.receiveShadow = true; sc.add(platte);
  // Rahmen: vier Leisten aus dunklem Holz, leicht erhaben
  const rahmenMat = T3.lack(T, 0x3a1d0c, { roughness: 0.45 });
  [[0, N / 2 + 0.3, N + 1.2, 0.6], [0, -N / 2 - 0.3, N + 1.2, 0.6], [N / 2 + 0.3, 0, 0.6, N], [-N / 2 - 0.3, 0, 0.6, N]].forEach(([x, z, b, t]) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(b, 0.34, t), rahmenMat); l.position.set(x, -0.05, z); l.castShadow = true; l.receiveShadow = true; sc.add(l);
  });
  const sgeo = steinGeo(), kgeo = kroneGeo();
  const steine = FARBE.map((f) => { const m = new THREE.InstancedMesh(sgeo, T3.lack(T, f, { roughness: 0.28 }), 26); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; sc.add(m); return m; });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 0.9, roughness: 0.22, emissive: 0x7a4b00, emissiveIntensity: 0.6 });
  const kronen = new THREE.InstancedMesh(kgeo, gold, 26); kronen.frustumCulled = false; kronen.count = 0; sc.add(kronen);
  // Marker: waehlbare Steine (Ring), gewaehlter Stein, Zielfelder (gelb, Schlag rot)
  const ringGeo = new THREE.TorusGeometry(STEIN_R * 1.08, 0.035, 8, 40); ringGeo.rotateX(Math.PI / 2);
  const zielGeo = new THREE.CircleGeometry(0.36, 32); zielGeo.rotateX(-Math.PI / 2);
  const marker = Array.from({ length: 16 }, () => { const m = new THREE.Mesh(ringGeo, T3.leucht(0xffd23f, 2.2)); m.visible = false; sc.add(m); return m; });
  const ziele = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(zielGeo, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })); m.visible = false; sc.add(m); return m; });
  const letzt = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }));
  letzt.visible = false; sc.add(letzt);
  g = { steine, kronen, marker, ziele, letzt, zeige: null, schlange: [], akt: null, gewaehlt: null, ueber: {}, sieg: null, zaehler: { zug: 0, schlag: 0, krone: 0, sieg: 0 }, d };
  T.takt = takt; T.pose = pose; T.tipp = tipp;
}
function SCrand() { return new THREE.MeshStandardMaterial({ color: 0x3a1d0c, roughness: 0.6 }); }

// ---------------------------------------------------------------- Stand -> Auftritte
const kopie = (b) => b.map((r) => r.map((x) => (x ? { ...x } : null)));
const steinZahl = (b, i) => b.flat().filter((x) => x && x.i === i).length;
function neuerStand(d) {
  const alt = g.akt ? g.akt.nachher : g.schlange.length ? g.schlange[g.schlange.length - 1].nachher : g.zeige, neu = kopie(d.brett);
  if (!alt) { g.zeige = neu; T.kamSprung = true; siegPruefen(d); return; }
  if (JSON.stringify(alt) === JSON.stringify(neu)) { siegPruefen(d); return; }
  const weg = [], neuDa = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (alt[r][c] && !neu[r][c]) weg.push([r, c]);
    if (!alt[r][c] && neu[r][c]) neuDa.push([r, c]);
  }
  if (neuDa.length === 1) {
    const [tr, tc] = neuDa[0], st = neu[tr][tc], von = weg.find(([r, c]) => alt[r][c].i === st.i);
    const opfer = weg.filter(([r, c]) => alt[r][c].i !== st.i);
    if (von && opfer.length <= 1 && weg.length === 1 + opfer.length) {
      g.schlange.push({ von, nach: [tr, tc], i: st.i, opfer: opfer[0] || null, opferI: opfer[0] ? alt[opfer[0][0]][opfer[0][1]].i : null, krone: st.k && !alt[von[0]][von[1]].k, nachher: neu });
      g.gewaehlt = null;
      return;
    }
  }
  // sonst (neue Partie, Nachzuegler): auf den Stand springen
  g.schlange = []; g.akt = null; g.ueber = {}; g.zeige = neu; g.sieg = null; g.gewaehlt = null; T3.konfettiAus(T); siegPruefen(d);
}
function siegPruefen(d) {
  if (!d.vorbei) { g.sieg = null; return; }
  if (g.sieg || g.akt || g.schlange.length) return;
  g.sieg = { p: d.sieger.length === 1 ? d.sieger[0] : null, seit: T.uhr.elapsedTime }; g.zaehler.sieg++;
  if (g.sieg.p !== null) T3.konfettiStart(T, [d.farben[g.sieg.p] || "#ffd23f", "#ffd23f", "#ffffff"], V(0, 0, 0), 6);
}
// Stapel geschlagener Steine neben dem Brett: Farbe i liegt auf der Seite des Gegners
function stapelPlatz(i, k) {
  const seite = i === 0 ? -1 : 1, reihe = Math.floor(k / 6), h = k % 6;
  return V(seite * (N / 2 + 1.3 + reihe * 0.95), OBEN - 0.12 + h * STEIN_H, seite * -1.6 + seite * reihe * 0.0);
}

// ---------------------------------------------------------------- je Bild
function auftrittStart(x) {
  x.t = 0; x.schlag = !!x.opfer; x.dauer = (x.schlag ? DAME3D_ZEIT.sprung : DAME3D_ZEIT.gleiten) + (x.schlag ? DAME3D_ZEIT.flug * 0.6 : 0) + (x.krone ? DAME3D_ZEIT.krone : 0);
  x.stapelZiel = x.opfer ? stapelPlatz(x.opferI, 12 - steinZahl(g.zeige, x.opferI)) : null;
  x.gelandet = false; x.getroffen = false; x.gekroent = false;
}
function auftrittTakt(x, dt, t) {
  const d = g.d;
  x.t += dt;
  const dz = x.schlag ? DAME3D_ZEIT.sprung : DAME3D_ZEIT.gleiten, u = Math.min(1, x.t / dz);
  const a = pos(...x.von), b = pos(...x.nach), p = a.clone().lerp(b, T3.sanft(u));
  p.y += x.schlag ? Math.sin(u * Math.PI) * 1.25 : Math.sin(u * Math.PI) * 0.18;
  g.ueber[`${x.von[0]},${x.von[1]}`] = { p, kipp: x.schlag ? Math.sin(u * Math.PI) * 0.35 : 0 };
  if (x.schlag && u >= 0.5 && !x.getroffen) {
    x.getroffen = true; x.flugT = 0; g.zaehler.schlag++;
    const o = pos(...x.opfer, OBEN + STEIN_H);
    if (d.ton) klang("aua");
    T3.funkenAn(T, o, FARBE[x.opferI] === 0x1d1e24 ? 0xffffff : 0xff7a3a, 0.7, 0.35); T3.welleAn(T, o.clone().setY(0.05), 0xffffff, 0.8); T3.wackeln(T, t, 0.4);
  }
  if (x.getroffen) {
    x.flugT += dt;
    const fu = Math.min(1, x.flugT / DAME3D_ZEIT.flug), o = pos(...x.opfer), q = o.clone().lerp(x.stapelZiel, T3.sanft(fu));
    q.y += Math.sin(fu * Math.PI) * 2.6;
    g.ueber[`${x.opfer[0]},${x.opfer[1]}`] = { p: q, kipp: fu < 1 ? fu * Math.PI * 5 : 0, dreh: fu * 7, i: x.opferI };
  }
  if (u >= 1 && !x.gelandet) { x.gelandet = true; g.zaehler.zug++; if (d.ton) klang("tack"); }
  if (x.krone && u >= 1) {
    const ku = Math.min(1, (x.t - dz) / DAME3D_ZEIT.krone);
    g.kroneFall = { an: x.nach, y: OBEN + STEIN_H + (1 - ku * ku) * 2.2, i: x.i };
    if (ku >= 1 && !x.gekroent) { x.gekroent = true; g.zaehler.krone++; if (d.ton) klang("ziel"); T3.funkenAn(T, pos(...x.nach, OBEN + STEIN_H * 2), 0xffd23f, 0.8, 0.35); g.knall = { gross: "👑 Dame!", farbe: "#ffd23f", seit: t }; }
  }
}
function auftrittEnde(x) {
  g.zeige = kopie(x.nachher); g.ueber = {}; g.kroneFall = null;
}
function takt(dt, t) {
  const d = g.d;
  if (document.hidden && (g.akt || g.schlange.length)) { if (g.akt) auftrittEnde(g.akt); g.schlange.forEach(auftrittEnde); g.akt = null; g.schlange = []; }
  const eile = g.schlange.length >= 2 ? 2.2 : 1;
  if (!g.akt && g.schlange.length) { g.akt = g.schlange.shift(); auftrittStart(g.akt); }
  if (g.akt) { auftrittTakt(g.akt, dt * eile, t); if (g.akt.t >= g.akt.dauer) { auftrittEnde(g.akt); g.akt = null; if (!g.schlange.length) siegPruefen(d); } }
  steineSetzen(t);
  markerSetzen(t);
  uiSetzen(t);
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = V();
function steineSetzen(t) {
  const n = [0, 0], kn = { n: 0 }, d = g.d;
  const setze = (i, p, kipp = 0, dreh = 0, dame = false) => {
    _q.setFromEuler(_e.set(kipp, dreh, kipp * 0.4));
    g.steine[i].setMatrixAt(n[i]++, _m.compose(p, _q, _s.set(1, 1, 1)));
    if (dame) {
      const p2 = p.clone().add(V(0, STEIN_H, 0).applyQuaternion(_q));
      g.steine[i].setMatrixAt(n[i]++, _m.compose(p2, _q, _s.set(1, 1, 1)));
      g.kronen.setMatrixAt(kn.n++, _m.compose(p2.clone().add(V(0, STEIN_H * 0.92, 0).applyQuaternion(_q)), _q, _s.set(1, 1, 1)));
    }
  };
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const s = g.zeige[r][c]; if (!s) continue;
    const u = g.ueber[`${r},${c}`];
    let p = u ? u.p.clone() : pos(r, c);
    const gew = g.gewaehlt && g.gewaehlt[0] === r && g.gewaehlt[1] === c;
    if (gew) p.y += 0.28 + Math.sin(t * 5) * 0.05;
    if (g.sieg && g.sieg.p === s.i && !T3.wenigBewegung()) p.y += Math.abs(Math.sin(t * 5 + r + c * 0.7)) * 0.4;
    const dameSchon = s.k && !(g.akt && g.akt.krone && g.akt.von[0] === r && g.akt.von[1] === c);
    setze(s.i, p, u ? u.kipp : 0, u ? u.dreh || 0 : 0, dameSchon);
  }
  // fallender Kronenstein
  if (g.kroneFall) { const p = pos(...g.kroneFall.an, g.kroneFall.y); setze(g.kroneFall.i, p); }
  // Stapel geschlagener Steine (ohne den, der gerade fliegt)
  for (let i = 0; i < 2; i++) {
    let weg = 12 - steinZahl(g.zeige, i);
    if (g.akt && g.akt.opfer && g.akt.opferI === i) { /* fliegt noch: zaehlt erst nach der Landung */ }
    for (let k = 0; k < Math.min(weg, 12); k++) setze(i, stapelPlatz(i, k));
  }
  g.steine.forEach((m, i) => { m.count = n[i]; m.instanceMatrix.needsUpdate = true; });
  g.kronen.count = kn.n; g.kronen.instanceMatrix.needsUpdate = true;
}
function waehlbar() {
  const d = g.d;
  if (!d.darf || g.akt || g.schlange.length) return [];
  return d.wahl || [];
}
function markerSetzen(t) {
  const w = waehlbar(), d = g.d;
  if (d.kette && !g.gewaehlt && w.length) g.gewaehlt = d.kette.slice();
  const vonListe = [...new Set(w.map((x) => x.von.join(",")))].map((k) => k.split(",").map(Number));
  g.marker.forEach((m, k) => {
    const v = !g.gewaehlt && vonListe[k];
    m.visible = !!v; if (!v) return;
    m.position.copy(pos(v[0], v[1], OBEN + 0.02)); const s = 1 + Math.sin(t * 4.5 + k) * 0.06; m.scale.set(s, 1, s);
  });
  const ziele = g.gewaehlt ? w.filter((x) => x.von[0] === g.gewaehlt[0] && x.von[1] === g.gewaehlt[1]) : [];
  g.ziele.forEach((m, k) => {
    const z = ziele[k]; m.visible = !!z; if (!z) return;
    m.position.copy(pos(z.nach[0], z.nach[1], OBEN + 0.015)); m.material.color.setHex(z.schlag ? 0xff3b3b : 0xffd23f);
    m.material.opacity = 0.45 + Math.abs(Math.sin(t * 4 + k)) * 0.35;
  });
  const l = g.akt || null; g.letzt.visible = false;
  if (!l && g.letzterZug) { g.letzt.visible = true; g.letzt.position.copy(pos(...g.letzterZug, 0.012)); }
}
function eckpunkte() { const B = N / 2 + 0.6; return [V(-B, 0, -B), V(B, 0, -B), V(-B, 0, B), V(B, 0, B), V(-B, 0.6, -B), V(B, 0.6, -B)]; }
function pose(t) {
  const d = g.d, blick = V(0, 0, 0);
  const seite = d.beamer ? Math.PI / 2 : d.ich === 1 ? Math.PI : 0;   // Rot (Spieler 1) sitzt bei den hohen Reihen (+z)
  if (g.sieg && g.sieg.p !== null && !T3.wenigBewegung()) {
    const a = seite + (t - g.sieg.seit) * 0.25, dir = T3.richtungAus(a, 0.7);
    return { pos: blick.clone().addScaledVector(dir, T3.einpassen(T, eckpunkte(), blick, dir, 0.92, 0.8)), blick, tempo: 1.5 };
  }
  const e = d.beamer ? 0.82 : 0.98, dir = T3.richtungAus(seite, e);
  return { pos: blick.clone().addScaledVector(dir, T3.einpassen(T, eckpunkte(), blick, dir, 0.97, 0.8)), blick };
}
function uiSetzen(t) {
  const d = g.d, nm = (j) => (d.namen || [])[j] || `Spieler ${j + 1}`;
  if (g.sieg) {
    T3.anzeigeDran(T, g.sieg.p === null ? null : { name: `🏆 ${g.sieg.p === d.ich ? `Du (${nm(g.sieg.p)})` : nm(g.sieg.p)}`, farbe: d.farben[g.sieg.p], unter: "hat gewonnen!" });
    T3.anzeigeSieg(T, g.sieg.p === null ? "🤝 Unentschieden!" : `🏆 ${g.sieg.p === d.ich ? "Du gewinnst!" : `${nm(g.sieg.p)} gewinnt!`}`);
    T3.anzeigeHinweis(T, null); T3.anzeigeKnall(T, null);
    return;
  }
  T3.anzeigeSieg(T, null);
  const knall = g.knall && t - g.knall.seit < 1.4 ? g.knall : null;
  T3.anzeigeKnall(T, knall ? { gross: knall.gross, farbe: knall.farbe } : null);
  if (d.dran === null || d.dran === undefined) { T3.anzeigeDran(T, null); return; }
  // waehrend eines Auftritts steht, wer zieht (im Regelwerk ist schon der Naechste dran)
  const wer = g.akt ? g.akt.i : d.dran, ich = wer === d.ich;
  const unter = g.akt ? (g.akt.schlag ? "schlägt! 💥" : "zieht …") : ich ? (d.kette ? "darf weiterschlagen" : g.gewaehlt ? "Zielfeld antippen" : "Stein antippen") : "überlegt …";
  T3.anzeigeDran(T, { name: ich ? `Du (${nm(wer)})` : nm(wer), farbe: d.farben[wer], unter, ich: ich && !g.akt });
  T3.anzeigeHinweis(T, d.darf && !g.akt && waehlbar().length ? (g.gewaehlt ? "👆 Leuchtendes Feld antippen" : "👆 Leuchtenden Stein antippen") : null);
}

// ---------------------------------------------------------------- Tippen
function tipp(cx, cy) {
  const d = g.d, w = waehlbar();
  if (!w.length || !d.senden) return false;
  // erst Zielfelder des gewaehlten Steins, dann eigene ziehbare Steine
  if (g.gewaehlt) {
    const ziele = w.filter((x) => x.von[0] === g.gewaehlt[0] && x.von[1] === g.gewaehlt[1]);
    const z = T3.naechster(T, cx, cy, ziele.map((x) => ({ p: pos(...x.nach), w: x })), 52);
    if (z) { if (d.ton) klang("klick"); g.letzterZug = z.nach; d.senden(z.von, z.nach); return true; }
  }
  const vonListe = [...new Set(w.map((x) => x.von.join(",")))].map((k) => k.split(",").map(Number));
  const v = T3.naechster(T, cx, cy, vonListe.map((x) => ({ p: pos(x[0], x[1], OBEN + STEIN_H), w: x })), 52);
  if (v && !d.kette) { g.gewaehlt = v; if (d.ton) klang("pop"); return true; }
  return false;
}

// ---------------------------------------------------------------- Einstieg
// d: { brett (8x8: null | { i: Spieler-Nr., k: Dame }), farben, dran, vorbei, sieger [], ich, namen, beamer, darf,
//      wahl [{ von: [r, c], nach: [r, c], schlag }], kette: [r, c] | null, senden(von, nach), ton }
export function dame3dZeigen(container, d) {
  if (T && (T.weg || T.beamer !== !!d.beamer)) { T3.freigeben(T); T = null; g = null; }
  try { if (!T) aufbauen(d); } catch (e) { console.warn("3D nicht verfuegbar - flaches Brett", e); T = null; g = null; return false; }
  g.d = d;
  if (!d.darf) g.gewaehlt = null;
  else if (g.gewaehlt && !(d.wahl || []).some((x) => x.von[0] === g.gewaehlt[0] && x.von[1] === g.gewaehlt[1])) g.gewaehlt = null;
  neuerStand(d);
  T3.einhaengen(T, container, 0.98);
  return true;
}
// fuer Tests: Bildpunkt eines Feldes
export function dame3dFeld(r, c) { return T ? T3.bildPunkt(T, pos(r, c, OBEN + STEIN_H)) : null; }
export function dame3dStand() {
  if (!T || !g) return null;
  return { ...T3.buehneStand(T), zeige: g.zeige.map((r) => r.map((x) => (x ? (x.k ? `${x.i}K` : `${x.i}`) : "."))).map((r) => r.join("")), schlange: g.schlange.length + (g.akt ? 1 : 0),
    akt: g.akt ? (g.akt.schlag ? "schlag" : "zug") : null, zaehler: { ...g.zaehler }, gewaehlt: g.gewaehlt, ziele: g.ziele.filter((m) => m.visible).length, marker: g.marker.filter((m) => m.visible).length,
    sieg: g.sieg ? g.sieg.p : null, stapel: [12 - steinZahl(g.zeige, 0), 12 - steinZahl(g.zeige, 1)], drin: T3.imBild(T, eckpunkte().slice(0, 4), 1),
    ui: T.ui ? `${T.ui.name.textContent} · ${T.ui.unter.textContent}` : "" };
}
