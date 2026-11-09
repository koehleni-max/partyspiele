// Wuerfelpoker in 3D (Nico 09.11.2026, "Ja, in 3D"). Nur die Darstellung - Regeln, Computer, Zustand und Punktezettel bleiben
// beim Regelwerk (fremd/yahtzee.js, LAN Games); der Zettel steht weiter unter dem Bild. Unterbau: tisch3d.js.
//   Bild     Gruener Filz in einem Holzrahmen auf dem Tisch, davor eine Holzleiste fuer behaltene Wuerfel, rechts der lederne
//            Wuerfelbecher. Fuenf echte Wuerfel mit runden Kanten (wie bei Mensch aergere dich nicht).
//   Ablauf   Wurf: der Becher hebt sich, schuettelt (Klappern), kippt ueber dem Filz aus; die Wuerfel fliegen heraus, ueberschlagen
//            sich, springen zweimal auf und bleiben mit der gewuerfelten Zahl oben liegen. Behaltene Wuerfel bleiben auf der Leiste.
//            Danach steht gross, was liegt (Fuenferpasch, Grosse Strasse, Full House ...); wird ein Feld eingetragen, zaehlen die
//            Punkte als "+25" herein. Fuenferpasch: Konfetti und Fanfare.
//   Handy    Wuerfel antippen = behalten (rutscht auf die Leiste) bzw. zurueck in den Filz; Becher oder Knopf "Wuerfeln" wuerfelt.
//            Antippen laeuft ueber die Wuerfel-Knoepfe des Regelwerks (dieselbe Merkliste wie bisher).
import * as T3 from "./tisch3d.js";
import { rundWuerfel, wuerfelMaterialien, OBEN } from "./maedn3d.js";
import { spiele as klang } from "./ton.js";

const { THREE, V } = T3;
export const WUERFEL3D_ZEIT = { schuetteln: 0.55, flug: 0.95, rutschen: 0.32, ergebnis: 2.2 };
const DS = 0.9, FILZ_B = 7.2, FILZ_T = 4.4, FILZ_Z = -0.4, LEISTE_Z = 2.65, BECHER = V(4.9, 0, 1.6);

let T = null, g = null;

function filzTextur(S) {
  const [c, x] = T3.leinwand(S);
  x.fillStyle = "#1f6b3a"; x.fillRect(0, 0, S, S);
  const bild = x.getImageData(0, 0, S, S), d = bild.data;
  for (let i = 0; i < d.length; i += 4) { const k = (T3.zufallFest(i * 0.37) - 0.5) * 26; d[i] += k * 0.6; d[i + 1] += k; d[i + 2] += k * 0.6; }
  x.putImageData(bild, 0, 0);
  const gr = x.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.75); gr.addColorStop(0, "#ffffff10"); gr.addColorStop(1, "#00000055");
  x.fillStyle = gr; x.fillRect(0, 0, S, S);
  return T3.textur(c);
}
function becherGeo() {
  const pts = [[0, 0.06], [0.98, 0.06], [1.02, 0.16], [0.98, 0.3], [1.05, 2.0], [1.14, 2.08], [1.16, 2.22], [1.06, 2.24], [0.96, 2.12], [0.88, 0.32], [0, 0.32]].map(([a, b]) => new THREE.Vector2(a, b));
  return new THREE.LatheGeometry(pts, 40);
}

function aufbauen(d) {
  T = T3.buehne("tisch", { beamer: d.beamer, R: 4.6, breite: 15, tiefe: 10, name: "wuerfel", tiefer: 0.12 });
  T3.stil();
  const sc = T.scene;
  const filz = new THREE.Mesh(new THREE.BoxGeometry(FILZ_B, 0.1, FILZ_T), new THREE.MeshStandardMaterial({ map: filzTextur(512), roughness: 1 }));
  filz.position.set(0, -0.05, FILZ_Z); filz.receiveShadow = true; sc.add(filz);
  const rahmen = T3.lack(T, 0x5a2e14, { roughness: 0.45 });
  [[0, FILZ_Z - FILZ_T / 2 - 0.2, FILZ_B + 0.8, 0.4], [0, FILZ_Z + FILZ_T / 2 + 0.2, FILZ_B + 0.8, 0.4], [FILZ_B / 2 + 0.2, FILZ_Z, 0.4, FILZ_T], [-FILZ_B / 2 - 0.2, FILZ_Z, 0.4, FILZ_T]].forEach(([x, z, b, t]) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(b, 0.55, t), rahmen); l.position.set(x, 0.17, z); l.castShadow = true; l.receiveShadow = true; sc.add(l);
  });
  const leiste = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.18, 1.3), T3.lack(T, 0x8a5226, { roughness: 0.5 })); leiste.position.set(0, 0.01, LEISTE_Z); leiste.receiveShadow = true; leiste.castShadow = true; sc.add(leiste);
  const leder = new THREE.MeshStandardMaterial({ color: 0x5a2a12, roughness: 0.75 }), naht = new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 0.6 });
  const becher = new THREE.Group();
  const koerper = new THREE.Mesh(becherGeo(), leder); koerper.castShadow = true; becher.add(koerper);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.025, 6, 48), naht); ring.rotation.x = Math.PI / 2; ring.position.y = 2.02; becher.add(ring);
  const ring2 = ring.clone(); ring2.position.y = 0.4; ring2.scale.setScalar(0.9); becher.add(ring2);
  becher.position.copy(BECHER); becher.scale.setScalar(0.75); sc.add(becher);
  const geo = rundWuerfel(DS), mats = wuerfelMaterialien(T.stufe);
  const wuerfel = Array.from({ length: 5 }, () => { const m = new THREE.Mesh(geo, mats); m.castShadow = true; m.visible = false; sc.add(m); return m; });
  const ring3 = new THREE.TorusGeometry(DS * 0.72, 0.04, 8, 36); ring3.rotateX(Math.PI / 2);
  const markierung = Array.from({ length: 5 }, () => { const m = new THREE.Mesh(ring3, T3.leucht(0xffd23f, 2.2)); m.visible = false; sc.add(m); return m; });
  g = { becher, wuerfel, markierung, werte: [], lage: [], wurf: null, schluessel: null, lokal: [false, false, false, false, false], rutsch: {}, ergebnis: null, punkteAlt: null, felderAlt: null, sieg: null,
    zaehler: { wurf: 0, halten: 0, ergebnis: 0, punkte: 0, sieg: 0 }, d };
  T.takt = takt; T.pose = pose; T.tipp = tipp;
}

// ---------------------------------------------------------------- Lagen
const leistePlatz = (i) => V((i - 2) * 1.2, 0.1 + DS / 2, LEISTE_Z);
function filzPlatz(i, saat) {
  // fuenf Plaetze im Filz, je Wurf leicht verschoben und gedreht (fest aus dem Wurf-Schluessel)
  const x = (i - 2) * 1.35 + (T3.zufallFest(saat + i * 3) - 0.5) * 0.5, z = FILZ_Z + (T3.zufallFest(saat + i * 7) - 0.5) * 2.2;
  return V(x, DS / 2, z);
}
const drehung = (zahl, um) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...OBEN[zahl])).premultiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), um));
function liegtHalten(i) { const d = g.d; return d.darf ? !!g.lokal[i] : !!(d.halten || [])[i]; }
function ruheLage(i) {
  const saat = g.saat || 1;
  return { p: liegtHalten(i) ? leistePlatz(i) : filzPlatz(i, saat), q: drehung(g.werte[i] || 1, (T3.zufallFest(saat + i * 11) - 0.5) * 1.2) };
}

// ---------------------------------------------------------------- Stand
function kombi(w) {
  if (w.length !== 5 || w.some((x) => !x)) return null;
  const z = {}; w.forEach((x) => (z[x] = (z[x] || 0) + 1));
  const anz = Object.values(z).sort((a, b) => b - a), s = [...new Set(w)].sort().join("");
  if (anz[0] === 5) return { gross: "🎲 FÜNFERPASCH!", klein: "Fünf Gleiche!", stufe: 3 };
  if (s === "12345" || s === "23456") return { gross: "Große Straße!", klein: "1 bis 5 oder 2 bis 6", stufe: 2 };
  if (anz[0] === 4) return { gross: "Viererpasch!", klein: "Vier Gleiche", stufe: 2 };
  if (anz[0] === 3 && anz[1] === 2) return { gross: "Full House!", klein: "Drei und zwei Gleiche", stufe: 2 };
  if (["1234", "2345", "3456"].some((k) => k.split("").every((c) => s.includes(c)))) return { gross: "Kleine Straße", klein: "vier in Folge", stufe: 1 };
  if (anz[0] === 3) return { gross: "Dreierpasch", klein: "drei Gleiche", stufe: 1 };
  return null;
}
function neuerStand(d) {
  const werte = (d.wuerfel || []).slice(0, 5);
  if (g.schluessel === null) {
    g.schluessel = d.wurfKey; g.werte = werte; g.saat = hash(d.wurfKey);
    g.punkteAlt = (d.punkte || []).slice(); g.felderAlt = (d.felder || []).slice(); T.kamSprung = true;
  } else if (d.wurfKey !== g.schluessel && d.wurf > 0 && werte.length === 5) {
    // neuer Wurf: die nicht behaltenen Wuerfel fliegen aus dem Becher
    g.schluessel = d.wurfKey;
    const halten = (d.halten || []).slice(0, 5);
    g.lokal = halten.map(Boolean);
    const von = werte.map((_, i) => (g.wuerfel[i].visible ? { p: g.wuerfel[i].position.clone(), q: g.wuerfel[i].quaternion.clone() } : null));
    g.werte = werte; g.saat = hash(d.wurfKey);
    g.wurf = { t: 0, halten, von, achse: werte.map((_, i) => V(T3.zufallFest(g.saat + i) - 0.5, T3.zufallFest(g.saat + i + 9) - 0.5, T3.zufallFest(g.saat + i + 17) - 0.5).normalize()), klapper: false, geklackt: false };
    g.ergebnis = null; g.zaehler.wurf++;
  } else if (d.wurfKey !== g.schluessel) {
    // neuer Zug ohne Wurf (Feld eingetragen): Wuerfel zurueck in den Becher
    g.schluessel = d.wurfKey; g.werte = werte; g.lokal = [false, false, false, false, false];
  }
  if (!d.darf) g.lokal = (d.halten || []).map(Boolean);
  // Punkte eingetragen: "+N" einblenden
  const p = d.punkte || [], f = d.felder || [];
  p.forEach((x, j) => {
    if (g.felderAlt && f[j] > (g.felderAlt[j] || 0)) {
      const plus = x - ((g.punkteAlt || [])[j] || 0);
      g.punkteKnall = { gross: plus > 0 ? `+${plus} Punkte` : "Feld gestrichen", klein: `${(d.namen || [])[j] || ""} · jetzt ${x}`, farbe: plus > 0 ? "#5ef08a" : "#ff8a7a", seit: T.uhr.elapsedTime };
      g.zaehler.punkte++;
      if (d.ton) klang(plus > 0 ? "muenzen" : "falsch");
    }
  });
  g.punkteAlt = p.slice(); g.felderAlt = f.slice();
  if (d.vorbei && !g.sieg) { g.sieg = { p: d.sieger.length ? d.sieger : [], seit: T.uhr.elapsedTime }; g.zaehler.sieg++; T3.konfettiStart(T, ["#ffd23f", "#ff5fae", "#3fd0ff", "#5ef08a"], V(0, 0, 0), 6); }
  if (!d.vorbei) g.sieg = null;
}
function hash(s) { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 100003; return h / 997; }

// ---------------------------------------------------------------- je Bild
function takt(dt, t) {
  const d = g.d, Z = WUERFEL3D_ZEIT;
  const da = g.werte.length === 5 && !d.vorbei;
  // Becher: Ruhe, beim Wurf heben, schuetteln, auskippen, zurueck
  const b = g.becher;
  b.position.copy(BECHER); b.rotation.set(0, 0, 0);
  if (g.wurf) {
    const w = g.wurf; w.t += dt;
    if (!w.klapper) { w.klapper = true; if (d.ton) klang("wuerfel"); }
    if (w.t < Z.schuetteln) {
      const u = w.t / Z.schuetteln;
      b.position.y += Math.sin(u * Math.PI) * 1.2; b.rotation.z = Math.sin(w.t * 38) * 0.18; b.rotation.x = Math.cos(w.t * 31) * 0.12;
    } else {
      const u = Math.min(1, (w.t - Z.schuetteln) / 0.35), zurueck = Math.max(0, (w.t - Z.schuetteln - Z.flug) / 0.4);
      const k = Math.min(1, u) * (1 - Math.min(1, zurueck));
      b.position.lerp(V(2.6, 1.6, FILZ_Z + 0.4), T3.sanft(k)); b.rotation.z = k * 1.95;
    }
    // Wuerfel: fliegen aus der Becheroeffnung, ueberschlagen sich, springen zweimal, liegen
    const fu = Math.max(0, Math.min(1, (w.t - Z.schuetteln - 0.12) / Z.flug));
    const mund = V(2.0, 1.8, FILZ_Z + 0.4);
    g.werte.forEach((zahl, i) => {
      const m = g.wuerfel[i], ziel = ruheLage(i);
      m.visible = true;
      if (w.halten[i]) { m.position.copy(ziel.p); m.quaternion.copy(ziel.q); return; }
      if (fu <= 0) { m.visible = false; return; }
      const vers = Math.min(1, fu * (1.08 + i * 0.04)), p = mund.clone().lerp(ziel.p, T3.sanft(Math.min(1, vers / 0.82)));
      const h = vers < 0.55 ? (1 - Math.pow(vers / 0.55, 2)) * 1.4 + Math.sin(vers / 0.55 * Math.PI) * 0.9 : vers < 0.8 ? Math.sin(((vers - 0.55) / 0.25) * Math.PI) * 0.5 : vers < 0.93 ? Math.sin(((vers - 0.8) / 0.13) * Math.PI) * 0.14 : 0;
      p.y = ziel.p.y + Math.max(0, h); m.position.copy(p);
      const rest = Math.pow(1 - Math.min(1, vers / 0.95), 2);
      m.quaternion.copy(ziel.q).multiply(new THREE.Quaternion().setFromAxisAngle(w.achse[i], rest * Math.PI * 6));
    });
    if (fu > 0.55 && !w.geklackt) { w.geklackt = true; T3.wackeln(T, t, 0.2, 0.4); }
    if (w.t > Z.schuetteln + Z.flug + 0.45) {
      g.wurf = null; g.rutsch = {};
      const k = kombi(g.werte);
      g.ergebnis = { k, seit: t }; g.zaehler.ergebnis++;
      if (k && k.stufe >= 2) { T3.funkenAn(T, V(0, 0.6, FILZ_Z), 0xffd23f, k.stufe === 3 ? 1 : 0.6, 0.6); if (d.ton) klang(k.stufe === 3 ? "fanfare" : "stern"); }
      if (k && k.stufe === 3) T3.konfettiStart(T, ["#ffd23f", "#ffffff", "#ff5fae"], V(0, 0, 0), 6);
    }
  } else {
    // Ruhe: Wuerfel liegen; behalten/zurueck rutscht weich
    g.werte.forEach((zahl, i) => {
      const m = g.wuerfel[i]; m.visible = da;
      if (!da) return;
      const ziel = ruheLage(i), r = g.rutsch[i];
      if (r) {
        r.t += dt; const u = Math.min(1, r.t / Z.rutschen);
        m.position.copy(r.von).lerp(ziel.p, T3.sanft(u)); m.position.y += Math.sin(u * Math.PI) * 0.6; m.quaternion.copy(ziel.q);
        if (u >= 1) delete g.rutsch[i];
      } else { m.position.copy(ziel.p); m.quaternion.copy(ziel.q); }
    });
    if (!da) g.wuerfel.forEach((m) => { m.visible = false; });
  }
  // waehlbare Wuerfel: Ring darunter (nur wer dran ist und halten darf)
  const halt = d.darf && d.kannHalten && !g.wurf;
  g.markierung.forEach((m, i) => {
    m.visible = !!(halt && da);
    if (!m.visible) return;
    const w = g.wuerfel[i].position; m.position.set(w.x, liegtHalten(i) ? 0.115 : 0.02, w.z);
    m.material.color.setHex(liegtHalten(i) ? 0x5ef08a : 0xffd23f); m.material.emissive.setHex(liegtHalten(i) ? 0x5ef08a : 0xffd23f);
    const s = 1 + Math.sin(t * 4 + i) * 0.06; m.scale.set(s, 1, s);
  });
  uiSetzen(t);
}
function eckpunkte() { return [V(-FILZ_B / 2 - 0.5, 0, FILZ_Z - FILZ_T / 2 - 0.5), V(FILZ_B / 2 + 0.5, 0, FILZ_Z - FILZ_T / 2 - 0.5), V(-3.4, 0, LEISTE_Z + 0.8), V(3.4, 0, LEISTE_Z + 0.8), V(BECHER.x + 0.9, 1.7, BECHER.z), V(BECHER.x + 0.9, 0, BECHER.z + 0.9)]; }
function pose(t) {
  const blick = V(0.6, 0, 0.3);
  const e = T.beamer ? 0.78 : 0.98, a = T.beamer ? 0 : 0.0, dir = T3.richtungAus(a, e);
  // Ergebnis: Kamera geht naeher an den Filz
  const nah = g.ergebnis && g.ergebnis.k && g.ergebnis.k.stufe >= 2 && t - g.ergebnis.seit < WUERFEL3D_ZEIT.ergebnis && !T3.wenigBewegung();
  const dd = T3.einpassen(T, eckpunkte(), blick, dir, 0.95, 0.72) * (nah ? 0.82 : 1);
  return { pos: blick.clone().addScaledVector(dir, dd), blick, tempo: nah ? 3.2 : 2.6 };
}
function uiSetzen(t) {
  const d = g.d, nm = (j) => (d.namen || [])[j] || `Spieler ${j + 1}`;
  if (g.sieg) {
    const s = g.sieg.p;
    T3.anzeigeDran(T, s.length ? { name: `🏆 ${s.map((j) => (j === d.ich ? "Du" : nm(j))).join(" & ")}`, farbe: d.farben[s[0]] || "#ffd23f", unter: `${(d.punkte || [])[s[0]] || 0} Punkte` } : null);
    T3.anzeigeSieg(T, s.length ? `🏆 ${s.includes(d.ich) ? "Du gewinnst!" : `${s.map(nm).join(" & ")} ${s.length > 1 ? "gewinnen" : "gewinnt"}!`}` : "🤝 Unentschieden!");
    T3.anzeigeKnall(T, null); T3.anzeigeKnopf(T, null); T3.anzeigeHinweis(T, null); return;
  }
  T3.anzeigeSieg(T, null);
  const pk = g.punkteKnall && t - g.punkteKnall.seit < 1.8 ? g.punkteKnall : null;
  const ek = !g.wurf && g.ergebnis && g.ergebnis.k && t - g.ergebnis.seit < WUERFEL3D_ZEIT.ergebnis ? g.ergebnis.k : null;
  T3.anzeigeKnall(T, pk || (ek ? { gross: ek.gross, klein: ek.klein, farbe: ek.stufe === 3 ? "#ffd23f" : ek.stufe === 2 ? "#ff8a3d" : "#7fd3ff" } : null));
  if (d.dran === null || d.dran === undefined) { T3.anzeigeDran(T, null); return; }
  const ich = d.dran === d.ich;
  const unter = g.wurf ? "würfelt …" : d.wurf ? `Wurf ${d.wurf} von ${d.wuerfe}` : ich ? "jetzt würfeln!" : "ist dran";
  T3.anzeigeDran(T, { name: ich ? `Du (${nm(d.dran)})` : nm(d.dran), farbe: d.farben[d.dran], unter, ich });
  T3.anzeigeKnopf(T, d.darf && d.kannWuerfeln && !g.wurf ? (d.wurf ? `🎲 Nochmal (${d.wurf + 1} von ${d.wuerfe})` : "🎲 Würfeln") : null, () => wuerfeln());
  T3.anzeigeHinweis(T, d.darf && d.kannHalten && !g.wurf ? "👆 Würfel antippen = behalten" : d.darf && d.wurf && !g.wurf ? "👇 Feld auf dem Zettel wählen" : null);
}
function wuerfeln() {
  const d = g.d;
  if (!d.darf || !d.kannWuerfeln || g.wurf || !d.wuerfeln) return;
  d.wuerfeln();
}

// ---------------------------------------------------------------- Tippen
function tipp(cx, cy) {
  const d = g.d;
  if (!d.darf || g.wurf) return false;
  if (d.kannHalten && g.werte.length === 5) {
    const i = T3.naechster(T, cx, cy, g.wuerfel.map((m, k) => ({ p: m.position.clone(), w: k })), 48);
    if (i !== null) {
      g.rutsch[i] = { von: g.wuerfel[i].position.clone(), t: 0 };
      if (d.halte) d.halte(i);
      g.lokal[i] = !g.lokal[i]; g.zaehler.halten++;
      if (d.ton) klang("tack");
      return true;
    }
  }
  // Becher antippen = wuerfeln
  const b = T3.naechster(T, cx, cy, [{ p: BECHER.clone().add(V(0, 0.9, 0)), w: 1 }], 70);
  if (b && d.kannWuerfeln) { wuerfeln(); return true; }
  return false;
}

// ---------------------------------------------------------------- Einstieg
// d: { wuerfel [5 Zahlen oder leer], halten [5] (beim letzten Wurf behalten), lokal [5] (gerade angetippt, nur am Zug),
//      wurf (benutzte Wuerfe), wuerfe (hoechstens), wurfKey (wechselt mit jedem Wurf und Zug), dran, punkte [], felder [], namen,
//      farben, vorbei, sieger [], ich, beamer, darf, kannHalten, kannWuerfeln, halte(i), wuerfeln(), ton }
export function wuerfel3dZeigen(container, d) {
  if (T && (T.weg || T.beamer !== !!d.beamer)) { T3.freigeben(T); T = null; g = null; }
  try { if (!T) aufbauen(d); } catch (e) { console.warn("3D nicht verfuegbar - flache Wuerfel", e); T = null; g = null; return false; }
  g.d = d;
  neuerStand(d);
  if (d.darf && d.lokal && !g.wurf) d.lokal.forEach((x, i) => { if (!!x !== !!g.lokal[i] && !g.rutsch[i]) { g.rutsch[i] = { von: g.wuerfel[i].position.clone(), t: 0 }; g.lokal[i] = !!x; } });
  T3.einhaengen(T, container, 0.9);
  return true;
}
export function wuerfel3dBild(i) { return T ? T3.bildPunkt(T, g.wuerfel[i].position.clone()) : null; }
export function wuerfel3dBecher() { return T ? T3.bildPunkt(T, BECHER.clone().add(V(0, 0.9, 0))) : null; }
export function wuerfel3dStand() {
  if (!T || !g) return null;
  return { ...T3.buehneStand(T), werte: g.werte.slice(), wurf: !!g.wurf, lokal: g.lokal.slice(), zaehler: { ...g.zaehler }, ergebnis: g.ergebnis && g.ergebnis.k ? g.ergebnis.k.gross : null,
    sichtbar: g.wuerfel.filter((m) => m.visible).length, aufLeiste: g.wuerfel.map((m) => Math.abs(m.position.z - LEISTE_Z) < 0.3), sieg: g.sieg ? g.sieg.p : null,
    drin: T3.imBild(T, eckpunkte(), 1), knopf: T.ui && !T.ui.knopf.hidden ? T.ui.knopf.textContent : null, ui: T.ui ? `${T.ui.name.textContent} · ${T.ui.unter.textContent}` : "" };
}
