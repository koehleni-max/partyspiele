// Wer wird Millionaer - Buehne in 3D (Nico 09.11.2026, "Ja, in 3D"). Nur die Darstellung: Regeln, Fragen und Zustand bleiben in
// gruppen_geburtstag.js (die Fragen kommen weiter ueber MILLIONAER[stufe] - dort wird spaeter der neue Fragenpool eingesteckt).
// Unterbau: tisch3d.js (Umgebung "studio").
//   Bild     Dunkles Studio: runde Buehne mit leuchtendem Rand und Bodenringen, zwei Stuehle (Kandidat und Moderation) mit Pult,
//            Lichtkegel von oben, Publikum als Silhouetten auf ansteigenden Raengen (Handylichter blinken). Dahinter die grosse
//            Videowand: Frage und vier Antworten als leuchtende Tafeln (A-D), daneben bzw. darunter die Gewinnleiter mit
//            Sicherheitsstufen.
//   Ablauf   Frage: ruhiges Blau, die Lichtkegel wandern langsam. Einloggen: die gewaehlte Tafel wird orange, das Licht geht herunter,
//            alle Kegel richten sich auf den Kandidaten, Trommelwirbel. Aufloesen: die richtige Tafel blitzt gruen (falsch gewaehlt:
//            rot), der Buehnenrand leuchtet mit, Ton, bei Richtig steigt die Leiter eine Stufe, ab 500 Euro Funken, bei der Million
//            Konfetti. 50:50: zwei Tafeln erloeschen. Aufhoeren und Ende ebenfalls mit Licht-Moment.
//   Handy    Tafeln antippen: der Kandidat waehlt (Tafel orange) und loggt mit dem Knopf im Bild ein; alle anderen tippen ihren Tipp
//            (gleicher Weg wie die Knoepfe), der Telefonjoker ebenso. Joker, Aufhoeren und "Weiter" bleiben als Knoepfe darunter.
import * as T3 from "./tisch3d.js";
import { spiele as klang } from "./ton.js";

const { THREE, V } = T3;
export const MIO3D_ZEIT = { spannung: 1.9, aufloesen: 2.6 };
const BUCH = ["A", "B", "C", "D"];
const GELD = [50, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 500000, 1000000], SICHER = [4, 9];
const euro = (n) => `${Number(n || 0).toLocaleString("de-DE")} €`;
const WAND_Z = -5.2, WAND_Y = 3.4;

let T = null, g = null;

// ---------------------------------------------------------------- Tafeln (Leinwand-Texturen)
function zeilen(x, text, breite, max) {
  const woerter = String(text || "").split(/\s+/), z = [];
  let akt = "";
  woerter.forEach((w) => { const t = akt ? `${akt} ${w}` : w; if (x.measureText(t).width > breite && akt) { z.push(akt); akt = w; } else akt = t; });
  if (akt) z.push(akt);
  return z.length > max ? null : z;
}
function passendSchreiben(x, text, breite, hoehe, start, max, cx, cy) {
  for (let px = start; px >= 18; px -= 2) {
    x.font = `800 ${px}px system-ui, sans-serif`;
    const z = zeilen(x, text, breite, max);
    if (z && z.length * px * 1.18 <= hoehe) { z.forEach((t, i) => x.fillText(t, cx, cy + (i - (z.length - 1) / 2) * px * 1.18)); return; }
  }
  x.font = "800 18px system-ui, sans-serif"; x.fillText(String(text).slice(0, 80), cx, cy);
}
// Rautenform wie im Fernsehen: lange Tafel mit spitzen Enden
function raute(x, w, h, rand, fuell, linie, glanz) {
  const p = h / 2;
  x.beginPath(); x.moveTo(rand, h / 2); x.lineTo(rand + p * 0.7, rand); x.lineTo(w - rand - p * 0.7, rand); x.lineTo(w - rand, h / 2); x.lineTo(w - rand - p * 0.7, h - rand); x.lineTo(rand + p * 0.7, h - rand); x.closePath();
  const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, fuell[0]); gr.addColorStop(1, fuell[1]); x.fillStyle = gr; x.fill();
  x.lineWidth = rand * 0.8; x.strokeStyle = linie; x.shadowColor = glanz; x.shadowBlur = rand * 2; x.stroke(); x.shadowBlur = 0;
}
const ZUSTAND = { normal: [["#16236e", "#0a1240"], "#c9a227", "#4f6bff"], gewaehlt: [["#ff9d1a", "#c86400"], "#ffe08a", "#ffb020"], richtig: [["#22c55e", "#0f7a34"], "#c8ffd8", "#5ef08a"],
  falsch: [["#e0362a", "#8a120c"], "#ffd0c8", "#ff5a3a"], weg: [["#0a0e2a", "#05071a"], "#2a3060", "#000000"], tipp: [["#2a3aa8", "#141f6a"], "#8fd3ff", "#3fd0ff"] };
function antwortTextur(alt, buch, text, zustand) {
  const [c, x] = alt || T3.leinwand(1024, 256);
  x.clearRect(0, 0, 1024, 256);
  const z = ZUSTAND[zustand] || ZUSTAND.normal;
  raute(x, 1024, 256, 14, z[0], z[1], z[2]);
  if (zustand !== "weg") {
    x.textAlign = "left"; x.textBaseline = "middle"; x.font = "900 76px system-ui, sans-serif"; x.fillStyle = zustand === "normal" || zustand === "tipp" ? "#ffd23f" : "#fff"; x.fillText(`${buch}:`, 112, 132);
    x.fillStyle = "#fff"; x.textAlign = "center"; passendSchreiben(x, text, 700, 200, 70, 2, 580, 132);
  }
  return [c, x];
}
function frageTextur(alt, text, kopf) {
  const [c, x] = alt || T3.leinwand(1536, 448);
  x.clearRect(0, 0, 1536, 448);
  raute(x, 1536, 448, 16, ["#1a2a8a", "#0a1240"], "#c9a227", "#6d8bff");
  x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#ffd23f"; x.font = "800 46px system-ui, sans-serif"; x.fillText(kopf, 768, 70);
  x.fillStyle = "#fff"; passendSchreiben(x, text, 1240, 290, 84, 3, 768, 258);
  return [c, x];
}
function leiterTextur(alt, stufe, hoch, fertig) {
  const W = hoch ? 512 : 1536, H = hoch ? 1280 : 200;
  const [c, x] = alt && alt[0].width === W ? alt : T3.leinwand(W, H);
  x.clearRect(0, 0, W, H);
  x.fillStyle = "#070b26ee"; x.strokeStyle = "#c9a227"; x.lineWidth = 6;
  x.beginPath(); x.roundRect(4, 4, W - 8, H - 8, 28); x.fill(); x.stroke();
  x.textBaseline = "middle";
  if (hoch) {
    GELD.forEach((geld, k) => {
      const y = H - 52 - k * ((H - 90) / 14), an = k === stufe;
      if (an) { x.fillStyle = "#e08a00"; x.beginPath(); x.roundRect(20, y - 36, W - 40, 72, 36); x.fill(); }
      x.fillStyle = an ? "#fff" : SICHER.includes(k) ? "#ffffff" : k < stufe || fertig ? "#a58a4a" : "#ffd23f";
      x.font = `${an || SICHER.includes(k) ? 900 : 700} 42px system-ui, sans-serif`;
      x.textAlign = "left"; x.fillText(String(k + 1), 44, y); x.textAlign = "right"; x.fillText(euro(geld), W - 40, y);
      if (k < stufe) { x.fillStyle = "#ffd23f"; x.beginPath(); x.arc(120, y, 9, 0, 7); x.fill(); }
    });
  } else {
    const b = (W - 60) / 15;
    GELD.forEach((geld, k) => {
      const xx = 30 + k * b, an = k === stufe;
      x.fillStyle = an ? "#e08a00" : k < stufe ? "#a5781e" : SICHER.includes(k) ? "#3a4aa8" : "#1a2260";
      x.beginPath(); x.roundRect(xx + 4, 22, b - 8, 70, 14); x.fill();
      x.fillStyle = "#fff"; x.textAlign = "center"; x.font = `${an ? 900 : 700} 34px system-ui, sans-serif`; x.fillText(String(k + 1), xx + b / 2, 58);
    });
    x.fillStyle = "#ffd23f"; x.font = "900 54px system-ui, sans-serif"; x.textAlign = "center";
    x.fillText(`Frage ${stufe + 1} um ${euro(GELD[Math.min(14, stufe)])}${SICHER.some((s) => stufe > s) ? ` · sicher ${euro(GELD[Math.max(...SICHER.filter((s) => stufe > s))])}` : ""}`, W / 2, 152);
  }
  return [c, x];
}
function tafel(breite, hoehe, tex) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(breite, hoehe), new THREE.MeshBasicMaterial({ map: T3.textur(tex[0]), transparent: true, toneMapped: false }));
  m.userData.tex = tex; return m;
}
function auffrischen(m, tex) { m.userData.tex = tex; m.material.map.needsUpdate = true; }

// ---------------------------------------------------------------- Aufbau
function aufbauen(d) {
  T = T3.buehne("studio", { beamer: d.beamer, R: 6, name: "mio", leuchten: 0.7, belichtung: 1.05 });
  T3.stil();
  const sc = T.scene;
  // Buehne: runde Plattform mit leuchtendem Rand, Bodenringe
  const plattform = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.36, 64), new THREE.MeshPhysicalMaterial({ color: 0x0b1240, roughness: 0.25, metalness: 0.5, clearcoat: T.stufe === "niedrig" ? 0 : 1 }));
  plattform.position.y = 0.18; plattform.receiveShadow = true; sc.add(plattform);
  const randMat = T3.leucht(0x3f6bff, 2.4);
  const rand = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.06, 8, 96), randMat); rand.rotation.x = Math.PI / 2; rand.position.y = 0.36; sc.add(rand);
  const ringe = [2.0, 3.2, 5.6, 7.4].map((r, k) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 6, 96), T3.leucht(k < 2 ? 0x7f9bff : 0x3a4aa8, 1.4)); m.rotation.x = Math.PI / 2; m.position.y = k < 2 ? 0.37 : 0.02; sc.add(m); return m; });
  // zwei Stuehle und ein Pult
  const chrom = new THREE.MeshStandardMaterial({ color: 0xd8dde8, metalness: 1, roughness: 0.2 }), polster = T3.lack(T, 0x1a1a2a, { roughness: 0.5 });
  const stuhl = (x, dreh) => {
    const gr = new THREE.Group();
    const sitz = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.16, 24), polster); sitz.position.y = 1.25; gr.add(sitz);
    const lehne = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.1), polster); lehne.position.set(0, 1.62, -0.38); gr.add(lehne);
    const saeule = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 10), chrom); saeule.position.y = 0.8; gr.add(saeule);
    const fuss = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.05, 24), chrom); fuss.position.y = 0.39; gr.add(fuss);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 24), chrom); ring.rotation.x = Math.PI / 2; ring.position.y = 0.75; gr.add(ring);
    gr.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    gr.position.set(x, 0, 0.6); gr.rotation.y = dreh; sc.add(gr); return gr;
  };
  stuhl(-1.25, Math.PI / 2 - 0.25); stuhl(1.25, -Math.PI / 2 + 0.25);
  const pult = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.1, 6), T3.lack(T, 0x101838, { roughness: 0.3, metalness: 0.4 })); pult.position.set(0, 0.9, 0.6); sc.add(pult);
  const bild = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), T3.leucht(0x6d8bff, 1.6)); bild.position.set(0, 1.5, 0.75); bild.rotation.x = -0.6; sc.add(bild);
  // Publikum: Silhouetten auf ansteigenden Raengen im Halbkreis, Handylichter
  const leute = [];
  for (let reihe = 0; reihe < 4; reihe++) for (let k = 0; k < 26; k++) {
    const a = Math.PI * (0.18 + (k / 25) * 0.64) + (reihe % 2) * 0.012, r = 8.6 + reihe * 1.25;
    leute.push({ p: V(Math.cos(a) * r * 1.2, 0.5 + reihe * 0.7, Math.sin(a) * r - 0.4), s: 0.85 + T3.zufallFest(reihe * 40 + k) * 0.3 });
  }
  const koerperGeo = new THREE.CapsuleGeometry(0.28, 0.5, 4, 10); koerperGeo.translate(0, 0.55, 0);
  const kopfGeo = new THREE.SphereGeometry(0.2, 12, 10); kopfGeo.translate(0, 1.22, 0);
  const sil = new THREE.MeshStandardMaterial({ color: 0x0a0c1c, roughness: 0.9 });
  [koerperGeo, kopfGeo].forEach((geo) => {
    const im = new THREE.InstancedMesh(geo, sil, leute.length), m = new THREE.Matrix4(), q = new THREE.Quaternion();
    leute.forEach((x, i) => im.setMatrixAt(i, m.compose(x.p, q, V(x.s, x.s, x.s)))); sc.add(im);
  });
  const rang = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 3, 64, 1, true, Math.PI * 0.1, Math.PI * 0.8), new THREE.MeshStandardMaterial({ color: 0x0c1030, side: THREE.BackSide, roughness: 0.8 }));
  rang.rotation.y = Math.PI / 2; rang.position.set(0, 1.2, 0); sc.add(rang);
  const lichterGeo = new THREE.BufferGeometry(), lp = [];
  leute.forEach((x, i) => { if (i % 5 === 0) lp.push(x.p.x + 0.2, x.p.y + 1.0, x.p.z - 0.2); });
  lichterGeo.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
  const lichter = new THREE.Points(lichterGeo, new THREE.PointsMaterial({ size: 0.22, map: T3.weich(), color: 0xcfe0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sc.add(lichter);
  // Lichtkegel: sichtbare Strahlen von oben (wandern, richten sich beim Einloggen auf den Kandidaten)
  const kegelGeo = new THREE.ConeGeometry(1.4, 9, 32, 1, true); kegelGeo.translate(0, -4.5, 0);
  const strahlTex = (() => { const [c, x] = T3.leinwand(4, 128); const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "#ffffffaa"); gr.addColorStop(1, "#ffffff00"); x.fillStyle = gr; x.fillRect(0, 0, 4, 128); return T3.textur(c); })();
  const strahlen = Array.from({ length: 6 }, (_, k) => {
    const m = new THREE.Mesh(kegelGeo, new THREE.MeshBasicMaterial({ map: strahlTex, color: k % 2 ? 0x6d8bff : 0xbfd0ff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(-6 + k * 2.4, 9.5, -2.5); sc.add(m); return m;
  });
  const spot = new THREE.SpotLight(0xdfe6ff, 60, 30, 0.42, 0.5, 1); spot.position.set(0, 11, 4); spot.target.position.set(-1.2, 1, 0.6); spot.castShadow = true;
  sc.add(spot, spot.target); T.schattenLicht.intensity = 0.3;
  const blau = new THREE.PointLight(0x3f6bff, 26, 18, 1.4); blau.position.set(0, 3, -3); sc.add(blau);
  // Videowand: Frage, vier Antworten, Gewinnleiter
  const rahmen = new THREE.Mesh(new THREE.BoxGeometry(13.6, 6.4, 0.3), new THREE.MeshStandardMaterial({ color: 0x05071a, roughness: 0.4, metalness: 0.6 }));
  rahmen.position.set(0, WAND_Y, WAND_Z - 0.25); sc.add(rahmen);
  const frage = tafel(10.4, 3.04, frageTextur(null, d.frage, "")); sc.add(frage);
  const antworten = BUCH.map((b, k) => { const m = tafel(5.1, 1.27, antwortTextur(null, b, (d.a || [])[k], "normal")); sc.add(m); return m; });
  const leiter = tafel(2.6, 6.5, leiterTextur(null, d.stufe || 0, true, false)); sc.add(leiter);
  g = { wandRahmen: rahmen, frage, antworten, leiter, rand, ringe, strahlen, spot, blau, lichter, randMat, zustandSig: "", sig: {}, auswahl: null, ablauf: null, zaehler: { frage: 0, einloggen: 0, richtig: 0, falsch: 0, fifty: 0, ende: 0 }, d, letzt: null, hoch: null };
  T.takt = takt; T.pose = pose; T.tipp = tipp;
}

// Anordnung der Videowand: quer (Wand, PC) Leiter rechts; hochkant (Handy) Leiter als Streifen unter den Antworten, alles groesser
function anordnen() {
  const hoch = T.camera.aspect < 1;
  if (g.hoch === hoch) return;
  g.hoch = hoch;
  const z = WAND_Z;
  if (hoch) {
    // hohe Videowand: Frage oben, vier Antworten untereinander (gross genug zum Lesen und Tippen), Leiter als Streifen unten
    g.frage.position.set(0, 11.9, z); g.frage.scale.set(0.82, 0.82, 1);
    g.antworten.forEach((m, k) => { m.position.set(0, 9.36 - k * 2.12, z + 0.02); m.scale.set(1.6, 1.6, 1); });
    g.leiter.geometry.dispose(); g.leiter.geometry = new THREE.PlaneGeometry(8.3, 1.08);
    g.leiter.position.set(0, 1.6, z + 0.02);
    g.wandRahmen.scale.set(9.4 / 13.6, 13.4 / 6.4, 1); g.wandRahmen.position.y = 7.2;
  } else {
    g.frage.position.set(-1.45, WAND_Y + 1.5, z); g.frage.scale.set(1, 1, 1);
    g.antworten.forEach((m, k) => { m.position.set(-1.45 + (k % 2 ? 2.65 : -2.65), WAND_Y - 0.55 - Math.floor(k / 2) * 1.45, z + 0.02); m.scale.set(1, 1, 1); });
    g.leiter.geometry.dispose(); g.leiter.geometry = new THREE.PlaneGeometry(2.6, 6.2);
    g.leiter.position.set(5.2, WAND_Y, z + 0.02);
    g.wandRahmen.scale.set(1, 1, 1); g.wandRahmen.position.y = WAND_Y;
  }
  g.sig.leiter = "";
}

// ---------------------------------------------------------------- Stand -> Licht-Momente
function zustandVon(k) {
  const d = g.d, a = g.ablauf;
  if ((d.weg || []).includes(k)) return "weg";
  if (a && a.art === "aufloesen") {
    const u = T.uhr.elapsedTime - a.seit;
    if (u < MIO3D_ZEIT.spannung) return k === a.wahl ? "gewaehlt" : "normal";
    if (k === a.richtig) return (Math.floor((u - MIO3D_ZEIT.spannung) * 6) % 2 === 0 || u > MIO3D_ZEIT.spannung + 1) ? "richtig" : "normal";
    return k === a.wahl ? "falsch" : "normal";
  }
  if (d.phase === "aufgeloest") return k === d.richtig ? "richtig" : k === d.wahl ? "falsch" : "normal";
  if (d.phase === "aufgehoert") return k === d.richtig ? "richtig" : "normal";
  if (g.auswahl === k) return "gewaehlt";
  if (d.rolle === "tipp" && d.meinTipp === k) return "tipp";
  return "normal";
}
function neuerStand(d) {
  const alt = g.letzt, t = T.uhr.elapsedTime;
  const frageNeu = !alt || alt.frage !== d.frage || alt.kand !== d.kand || alt.stufe !== d.stufe;
  if (frageNeu && d.phase === "frage") { g.auswahl = null; g.ablauf = { art: "frage", seit: t }; g.zaehler.frage++; }
  if (alt && alt.phase === "frage" && d.phase === "aufgeloest") {
    g.ablauf = { art: "aufloesen", seit: t, wahl: d.wahl, richtig: d.richtig, gut: d.wahl === d.richtig, stufe: d.stufe, kand: d.kand, million: d.wahl === d.richtig && d.stufe === 14 };
    g.zaehler.einloggen++; g.auswahl = null;
    if (d.ton) klang("spannung");
  } else if (alt && alt.phase === "frage" && d.phase === "aufgehoert") { g.ablauf = { art: "aufhoeren", seit: t }; if (d.ton) klang("gong"); }
  else if (d.phase === "ende" && (!alt || alt.phase !== "ende")) { g.ablauf = { art: "ende", seit: t }; g.zaehler.ende++; T3.konfettiStart(T, ["#ffd23f", "#6d8bff", "#ffffff"], V(0, 0, 0), 9); if (d.ton && alt) klang("fanfare"); }
  if (alt && (alt.weg || []).length < (d.weg || []).length) { g.zaehler.fifty++; if (d.ton) klang("magie"); g.knall = { gross: "✂️ 50:50", klein: "zwei Antworten sind weg", farbe: "#8fd3ff", seit: t }; }
  if (d.phase !== "frage") g.auswahl = null;
  if (d.phase === "frage" && alt && alt.phase !== "frage") T3.konfettiAus(T);
  g.letzt = { frage: d.frage, kand: d.kand, stufe: d.stufe, phase: d.phase, weg: (d.weg || []).slice() };
}

// ---------------------------------------------------------------- je Bild
function takt(dt, t) {
  const d = g.d, a = g.ablauf;
  anordnen();
  // Tafeln nur neu malen, wenn sich ihr Inhalt aendert
  const kopfText = d.phase === "ende" ? "Alle waren dran!" : `${(d.namen || [])[d.kand] || "Kandidat"} · Frage ${Math.min(15, (d.stufe || 0) + 1)} um ${euro(GELD[Math.min(14, d.stufe || 0)])}`;
  const fText = d.phase === "ende" ? siegerText(d) : d.frage;
  const fs = `${fText}|${kopfText}`;
  if (g.sig.frage !== fs) { g.sig.frage = fs; auffrischen(g.frage, frageTextur(g.frage.userData.tex, fText, kopfText)); }
  g.antworten.forEach((m, k) => {
    m.visible = d.phase !== "ende";
    const z = zustandVon(k), s = `${(d.a || [])[k]}|${z}`;
    if (g.sig[`a${k}`] !== s) { g.sig[`a${k}`] = s; auffrischen(m, antwortTextur(m.userData.tex, BUCH[k], (d.a || [])[k], z)); }
  });
  // Leiter: steigt erst nach dem Aufloesen (bei Richtig) eine Stufe
  let stufe = d.stufe || 0;
  if (a && a.art === "aufloesen" && a.gut && t - a.seit > MIO3D_ZEIT.spannung + 0.4) stufe = Math.min(14, stufe + 1);
  const ls = `${stufe}|${g.hoch}|${d.phase === "ende"}`;
  if (g.sig.leiter !== ls) { g.sig.leiter = ls; const tex = leiterTextur(g.leiter.userData.tex, stufe, !g.hoch, d.phase === "ende"); if (g.leiter.material.map.image !== tex[0]) { g.leiter.material.map.dispose(); g.leiter.material.map = T3.textur(tex[0]); } auffrischen(g.leiter, tex); }
  // Licht: Grundfarbe je Moment
  let farbe = 0x3f6bff, dunkel = 1, auf = null;
  if (a && a.art === "aufloesen") {
    const u = t - a.seit;
    if (u < MIO3D_ZEIT.spannung) { farbe = 0xff9d1a; dunkel = 0.45; auf = V(-1.25, 1.3, 0.6); }
    else {
      farbe = a.gut ? 0x22c55e : 0xe0362a;
      if (!a.fertig) {
        a.fertig = true; g.zaehler[a.gut ? "richtig" : "falsch"]++;
        if (d.ton) klang(a.gut ? (a.million ? "fanfare" : "richtig") : "falsch");
        if (a.gut && (a.stufe >= 4 || a.million)) T3.funkenAn(T, V(0, 2.5, -2), 0xffd23f, 1, 1.4);
        if (a.million) T3.konfettiStart(T, ["#ffd23f", "#ffffff", "#ff5fae"], V(0, 0, 0), 9);
        if (!a.gut) T3.wackeln(T, t, 0.35, 0.8);
        g.knall = a.gut ? { gross: a.million ? "🎉 MILLIONÄR!" : `✅ Richtig! ${euro(GELD[a.stufe])}`, farbe: "#5ef08a", seit: t }
          : { gross: "❌ Leider falsch", klein: `${(d.namen || [])[a.kand] || ""} geht mit ${euro((d.gewinn || [])[a.kand])} nach Hause`, farbe: "#ff5a3a", seit: t };
      }
    }
  } else if (a && a.art === "aufhoeren") { farbe = 0xffd23f; if (!a.fertig) { a.fertig = true; g.knall = { gross: `🛑 ${euro((d.gewinn || [])[d.kand])}`, klein: `${(d.namen || [])[d.kand] || ""} hört auf`, farbe: "#ffd23f", seit: t }; } }
  else if (a && a.art === "ende") farbe = 0xffd23f;
  else if (d.phase === "aufgeloest") farbe = d.wahl === d.richtig ? 0x22c55e : 0xe0362a;
  g.randMat.color.setHex(farbe); g.randMat.emissive.setHex(farbe); g.randMat.emissiveIntensity = 2 + Math.sin(t * 3) * 0.5;
  g.ringe.forEach((m, k) => { m.material.emissiveIntensity = (1 + Math.sin(t * 2 - k * 0.8) * 0.6) * dunkel; });
  g.blau.color.setHex(farbe); g.blau.intensity = 26 * dunkel;
  g.strahlen.forEach((m, k) => {
    const ziel = auf ? Math.atan2(auf.x - m.position.x, m.position.y - auf.y) : Math.sin(t * 0.5 + k * 1.3) * 0.35;
    m.rotation.z += (ziel - m.rotation.z) * Math.min(1, 1 - Math.exp(-dt * 3));
    m.material.color.setHex(auf ? 0xffc070 : k % 2 ? 0x6d8bff : 0xbfd0ff); m.material.opacity = (auf ? 0.22 : 0.13) + Math.sin(t * 1.7 + k) * 0.03;
  });
  g.lichter.material.opacity = 0.5 + Math.sin(t * 7) * 0.3;
  uiSetzen(t);
}
function siegerText(d) {
  const nm = d.namen || [], tafel = nm.map((n, j) => [j, (d.gewinn || [])[j] || 0]).sort((x, y) => y[1] - x[1]).slice(0, 3);
  return tafel.map(([j, x], k) => `${["🥇", "🥈", "🥉"][k]} ${nm[j]} ${euro(x)}`).join("   ");
}
function wandPunkte() {
  if (g.hoch) return [V(-4.3, 13.2, WAND_Z), V(4.3, 13.2, WAND_Z), V(-4.3, 0.9, WAND_Z), V(4.3, 0.9, WAND_Z), V(0, 0.36, 0.2)];
  return [V(-6.8, WAND_Y + 3.2, WAND_Z), V(6.8, WAND_Y + 3.2, WAND_Z), V(-6.8, 0, 1.5), V(6.8, 0, 1.5), V(0, 0, 4.4)];
}
function pose(t) {
  anordnen();
  const blick = g.hoch ? V(0, 6.8, WAND_Z + 1) : V(0, WAND_Y - 0.6, WAND_Z + 2.5);
  const a = g.ablauf, spannung = a && a.art === "aufloesen" && t - a.seit < MIO3D_ZEIT.spannung && !T3.wenigBewegung();
  const dir = T3.richtungAus(spannung ? 0.08 * Math.sin((t - a.seit) * 2) : Math.sin(t * 0.15) * 0.04, g.hoch ? 0.08 : 0.2);
  const dd = T3.einpassen(T, wandPunkte(), blick, dir, 0.97, 0.8) * (spannung ? 0.94 : 1);
  return { pos: blick.clone().addScaledVector(dir, dd), blick, tempo: spannung ? 1.2 : 2.2 };
}
function uiSetzen(t) {
  const d = g.d, nm = (j) => (d.namen || [])[j] || `Spieler ${j + 1}`;
  const knall = g.knall && t - g.knall.seit < 2.4 ? g.knall : null;
  T3.anzeigeKnall(T, knall);
  if (d.phase === "ende") { T3.anzeigeDran(T, null); T3.anzeigeSieg(T, "🏆 Alle waren dran!"); T3.anzeigeKnopf(T, null); T3.anzeigeHinweis(T, null); return; }
  T3.anzeigeSieg(T, null);
  const kand = d.kand === d.ich;
  const unter = g.ablauf && g.ablauf.art === "aufloesen" && t - g.ablauf.seit < MIO3D_ZEIT.spannung ? `loggt ${BUCH[g.ablauf.wahl]} ein …` : d.phase === "frage" ? `spielt um ${euro(GELD[d.stufe])}` : d.phase === "aufgehoert" ? "hat aufgehört" : "Auflösung";
  T3.anzeigeDran(T, { name: kand ? `Du (${nm(d.kand)})` : `💺 ${nm(d.kand)}`, farbe: "#ffd23f", unter, ich: kand && d.phase === "frage" });
  if (d.beamer) { T3.anzeigeKnopf(T, null); T3.anzeigeHinweis(T, d.phase === "frage" ? `📲 ${d.getippt || 0} raten mit` : null); return; }
  const frei = d.phase === "frage";
  T3.anzeigeKnopf(T, frei && d.rolle === "kand" && g.auswahl !== null ? `🔒 ${BUCH[g.auswahl]} einloggen` : null, () => einloggen());
  T3.anzeigeHinweis(T, !frei ? null : d.rolle === "kand" ? (g.auswahl === null ? "👆 Antwort antippen" : "Sicher? Dann einloggen") : d.rolle === "tel" ? "📞 Du wirst angerufen – Tafel antippen" : d.rolle === "tipp" ? (d.meinTipp === undefined || d.meinTipp === null ? "👆 Rate mit – Tafel antippen" : `Dein Tipp: ${BUCH[d.meinTipp]}`) : null);
}
function einloggen() {
  const d = g.d;
  if (g.auswahl === null || d.phase !== "frage" || !d.waehlen) return;
  const k = g.auswahl;
  d.waehlen("antwort", k);
}

// ---------------------------------------------------------------- Tippen auf eine Tafel
function tipp(cx, cy) {
  const d = g.d;
  if (d.phase !== "frage" || !d.waehlen || !d.rolle || d.rolle === "zu") return false;
  const r = T.renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), T.camera);
  const hit = ray.intersectObjects(g.antworten, false)[0];
  if (!hit) return false;
  const k = g.antworten.indexOf(hit.object);
  if ((d.weg || []).includes(k)) return false;
  if (d.rolle === "kand") { g.auswahl = g.auswahl === k ? null : k; if (d.ton) klang("klick"); return true; }
  if (d.ton) klang("klick");
  d.waehlen(d.rolle === "tel" ? "teltipp" : "tipp", k);
  return true;
}

// ---------------------------------------------------------------- Einstieg
// d: mioAuszug (phase, kand, stufe, frage, a, weg, joker, richtig, wahl, gewinn, mit, getippt) + { namen, ich, beamer, ton,
//    rolle ("kand" | "tel" | "tipp" | "zu"), meinTipp, waehlen(typ, k) }
export function mio3dZeigen(container, d) {
  if (T && (T.weg || T.beamer !== !!d.beamer)) { T3.freigeben(T); T = null; g = null; }
  try { if (!T) aufbauen(d); } catch (e) { console.warn("3D nicht verfuegbar - flache Buehne", e); T = null; g = null; return false; }
  g.d = d;
  neuerStand(d);
  T3.einhaengen(T, container, 1.25);
  return true;
}
// fuer Tests: Bildpunkt der Antworttafel k
export function mio3dTafel(k) { return T && g ? T3.bildPunkt(T, g.antworten[k].getWorldPosition(V())) : null; }
export function mio3dStand() {
  if (!T || !g) return null;
  const pts = wandPunkte();
  return { ...T3.buehneStand(T), hoch: g.hoch, auswahl: g.auswahl, ablauf: g.ablauf ? g.ablauf.art : null, zaehler: { ...g.zaehler }, zustand: [0, 1, 2, 3].map(zustandVon),
    drin: T3.imBild(T, pts, 1), knopf: T.ui && !T.ui.knopf.hidden ? T.ui.knopf.textContent : null, knall: T.ui && !T.ui.knall.hidden ? T.ui.knallB.textContent : null,
    ui: T.ui ? `${T.ui.name.textContent} · ${T.ui.unter.textContent}` : "" };
}
