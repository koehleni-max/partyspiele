// Karten des Partybretts (Grossumbau Runde 4, Plan 3.1 E; Nico 01.11.2026 "Alle sieben Welten wie im Plan").
//
// Jede Karte ist eine Feldliste: je Feld x, z, Hoehe h, Art und Nachbarn (nach). Zeichnen, Laufen und Pruefen lesen nur
// diese Liste - die alte Zeichenkette auf fester Ellipse ist weg. Die neuen Karten beschreiben ihre Wege mit Stuetzpunkten,
// karteBauen() legt daraus die Felder in gleichen Abstaenden; das alte Inselbrett steht Feld fuer Feld als Tabelle da.
//
// Feldarten: m = +3 Muenzen, v = -3 Muenzen, t = Trinkfeld (ohne Trinken: a = Aufgabenfeld), e = Ereignis, d = Duell, l = Laden,
// s = Stachelfeld (-10 Lebenspunkte), h = Heilquelle (+8), k = Truhe, p = Portal (zum Partnerportal), g = Glutfeld (-5, +5 Muenzen),
// z = Aufzug (Etagenwahl), b = Bank (wer vorbeilaeuft, zahlt ein; wer genau darauf landet, bekommt den ganzen Inhalt)
//
// Der Weg next[f][0] ist immer der Hauptweg: er ist nie gesperrt (Rakete, Sturm und Co. gehen ihn ohne Nachfrage).
// Sperren: "flut" (Sandbank, Hafeninsel) und "kruste" (erkaltete Lava, Vulkaninsel). Wer auf einem gesperrten Feld steht,
// darf immer weiterlaufen, also gibt es keine Falle. kartePruefen() rechnet das fuer jede Lage jeder Karte nach.

export const VORGABE_KARTE = 3;   // Hafeninsel; die bisherige Karte (1) bleibt waehlbar, bis alle sieben Welten da sind
export const GEZEITEN_ALLE = 2;   // Hafeninsel: Ebbe und Flut wechseln alle 2 Runden
export const AUSBRUCH_ALLE = 3;   // Vulkaninsel: Ausbruch zu Beginn jeder dritten Runde
export const STEMPEL_ZIEL = 4;    // Glitzerpassage: so viele verschiedene Laeden bringen den Stern-Rabatt

const polar = (r, grad) => [Math.cos((grad * Math.PI) / 180) * r, Math.sin((grad * Math.PI) / 180) * r];
const rund = (x) => Math.round(x * 1000) / 1000;

// Catmull-Rom-Kurve durch die Stuetzpunkte als dichter Linienzug; lage(t) liefert den Punkt bei Anteil t der Laenge
function kurve(punkte, zu) {
  const n = punkte.length, p = (i) => (zu ? punkte[(i + n) % n] : punkte[Math.max(0, Math.min(n - 1, i))]);
  const dicht = [];
  for (let i = 0; i < (zu ? n : n - 1); i++) {
    const [a, b, c, d] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      dicht.push([0, 1].map((e) => 0.5 * (2 * b[e] + (c[e] - a[e]) * t + (2 * a[e] - 5 * b[e] + 4 * c[e] - d[e]) * t2 + (3 * b[e] - a[e] - 3 * c[e] + d[e]) * t3)));
    }
  }
  dicht.push(zu ? dicht[0] : punkte[n - 1]);
  const laenge = [0];
  for (let i = 1; i < dicht.length; i++) laenge.push(laenge[i - 1] + Math.hypot(dicht[i][0] - dicht[i - 1][0], dicht[i][1] - dicht[i - 1][1]));
  const gesamt = laenge[laenge.length - 1];
  return (t) => {
    const ziel = t * gesamt;
    let i = 1;
    while (i < laenge.length - 1 && laenge[i] < ziel) i++;
    const u = (ziel - laenge[i - 1]) / Math.max(1e-9, laenge[i] - laenge[i - 1]);
    return [dicht[i - 1][0] + (dicht[i][0] - dicht[i - 1][0]) * u, dicht[i - 1][1] + (dicht[i][1] - dicht[i - 1][1]) * u];
  };
}

// Beschreibung -> Karte. b.wege: Ringe ({ id, punkte | kreis, h, arten }) und Nebenwege ({ von, nach, ueber, arten, name, sperre }).
function karteBauen(b) {
  const felder = [], wegname = {}, sperren = {}, ringe = {};
  const dazu = (x, z, h, art) => { felder.push({ x: rund(x), z: rund(z), h, art, nach: [] }); return felder.length - 1; };
  const naechstes = (punkt, ids) => {
    let best = -1, d = Infinity;
    ids.forEach((f) => { const q = Math.hypot(felder[f].x - punkt[0], felder[f].z - punkt[1]); if (q < d) { d = q; best = f; } });
    return best;
  };
  // Ringe zuerst: ihre Felder sind die Hauptrunde(n)
  b.wege.filter((w) => w.punkte || w.kreis).forEach((w) => {
    const n = w.arten.length, ort = w.kreis ? null : kurve(w.punkte, true), ids = [];
    for (let i = 0; i < n; i++) {
      const [x, z] = w.kreis ? polar(w.kreis.r, w.kreis.start + (360 * i) / n) : ort(i / n);
      ids.push(dazu(x, z, w.h || 0, w.arten[i]));
    }
    ids.forEach((f, i) => felder[f].nach.push(ids[(i + 1) % n]));
    ringe[w.id] = ids;
  });
  const nh = felder.length;
  const feldAuf = (ring, punkt) => naechstes(punkt, ringe[ring]);
  // Nebenwege: nach dem Hauptweg (next[0]) in die Nachbarliste
  b.wege.filter((w) => w.von).forEach((w) => {
    const [ringV, punktV] = w.von, [ringN, punktN] = w.nach;
    const a = feldAuf(ringV, punktV), z = feldAuf(ringN, punktN), A = felder[a], Z = felder[z];
    const ort = kurve([[A.x, A.z], ...(w.ueber || []), [Z.x, Z.z]], false), n = w.arten.length, ids = [];
    for (let i = 0; i < n; i++) {
      const [x, q] = ort((i + 1) / (n + 1));
      const f = dazu(x, q, A.h, w.arten[i]);
      ids.push(f);
      if (w.sperre) sperren[f] = w.sperre;
    }
    ids.forEach((f, i) => felder[f].nach.push(i + 1 < n ? ids[i + 1] : z));
    A.nach.push(ids[0]);
    wegname[A.nach[0]] = wegname[A.nach[0]] || b.hauptName || "➡️ Hauptweg";
    wegname[ids[0]] = w.name;
  });
  // Rolltreppen: ein Schritt von Etage zu Etage
  (b.kanten || []).forEach((k) => {
    const a = feldAuf(k.von[0], k.von[1]), z = feldAuf(k.nach[0], k.nach[1]);
    felder[a].nach.push(z);
    wegname[felder[a].nach[0]] = b.hauptName || "➡️ Hauptweg";
    wegname[z] = k.name;
  });
  // Aufzug: ein Feld je Etage, von jedem zu jedem
  const aufzug = (b.aufzug || []).map((a) => {
    const f = feldAuf(a.ring, a.punkt);
    felder[f].art = "z"; wegname[f] = a.name;
    return f;
  });
  aufzug.forEach((f) => {
    wegname[felder[f].nach[0]] = b.hauptName || "➡️ Hauptweg";
    aufzug.forEach((z) => { if (z !== f) felder[f].nach.push(z); });
  });
  const laeden = {};
  // ein Laden hat zwei Eingaenge auf verschiedenen Etagen; der Stempel zaehlt je Laden, nicht je Eingang
  (b.laeden || []).forEach((l, nr) => l.eingaenge.forEach(([ring, punkt]) => {
    const f = feldAuf(ring, punkt);
    felder[f].art = "l";
    laeden[f] = { nr, name: l.name, emo: l.emo, waren: l.waren };
  }));
  const lava = (b.lava || []).map((g) => g.map((i) => ringe[b.wege[0].id][i]));
  // Bank (Runde C, Punkt 25): auf ein Muenzfeld des Rings nahe dem Punkt, nie auf Lava
  const lavaSet = new Set(lava.flat());
  (b.bank || []).forEach(([ring, punkt]) => {
    const f = naechstes(punkt, ringe[ring].filter((x) => felder[x].art === "m" && !lavaSet.has(x)));
    if (f >= 0) felder[f].art = "b";
  });
  return fertig({ ...b, felder, nh, wegname, sperren, aufzug, laeden, lava, rolltreppen: (b.kanten || []).length });
}

// Abgeleitete Listen, die Spiel und Zeichnung brauchen
function fertig(k) {
  const felder = k.felder, n = felder.length;
  const next = felder.map((f) => f.nach);
  const prev = Array.from({ length: n }, () => []);
  next.forEach((nx, i) => nx.forEach((j) => prev[j].push(i)));
  // zurueck immer ueber den Hauptweg der Hauptrunde
  const rang = (x, f) => (x < k.nh ? 0 : 2) + (next[x][0] === f ? 0 : 1);
  prev.forEach((p, f) => p.sort((x, y) => rang(x, f) - rang(y, f)));
  const muster = felder.map((f) => f.art).join("");
  return { nr: k.nr, name: k.name, emo: k.emo, welt: k.welt, text: k.text, kurz: k.kurz, trick: k.trick || null, radius: k.radius, burg: k.burg, burgGroesse: k.burgGroesse || 1, podest: k.podest,
    teiche: k.teiche || [], etagen: k.etagen || [], felder, muster, ohne: muster.replace(/t/g, "a"), next, prev, nh: k.nh, wegname: k.wegname, sperren: k.sperren || {}, portale: k.portale || {},
    lage: felder.map((f) => ({ x: f.x, z: f.z, h: f.h })), aufzug: k.aufzug || [], laeden: k.laeden || {}, lava: k.lava || [], rolltreppen: k.rolltreppen || 0, soll: k.soll };
}

// ---------------------------------------------------------------- Inselbrett (die bisherige Karte, Feld fuer Feld)
const INSEL_FELDER = [
  [9.600, 0.000, 0, "m", [1]], [9.785, 1.407, 0, "m", [2]], [9.568, 2.739, 0, "t", [3]], [8.896, 3.933, 0, "e", [4]], [7.800, 4.945, 0, "m", [5]],
  [6.387, 5.751, 0, "v", [6]], [4.800, 6.351, 0, "l", [7]], [3.168, 6.759, 0, "m", [8]], [1.566, 6.992, 0, "e", [9, 36]], [0.000, 7.068, 0, "m", [10]],
  [-1.566, 6.992, 0, "d", [11]], [-3.168, 6.759, 0, "t", [12]], [-4.800, 6.351, 0, "k", [13]], [-6.387, 5.751, 0, "e", [14]], [-7.800, 4.945, 0, "v", [15]],
  [-8.896, 3.933, 0, "s", [16]], [-9.568, 2.739, 0, "l", [17]], [-9.785, 1.407, 0, "m", [18]], [-9.600, 0.000, 0, "e", [19]], [-9.123, -1.407, 0, "t", [20]],
  [-8.474, -2.739, 0, "b", [21]], [-7.732, -3.933, 0, "v", [22]], [-6.908, -4.945, 0, "h", [23]], [-5.955, -5.751, 0, "e", [24]], [-4.800, -6.351, 0, "m", [25, 41]],
  [-3.398, -6.759, 0, "d", [26]], [-1.768, -6.992, 0, "k", [27]], [0.000, -7.068, 0, "t", [28]], [1.768, -6.992, 0, "e", [29]], [3.398, -6.759, 0, "m", [30]],
  [4.800, -6.351, 0, "s", [31]], [5.955, -5.751, 0, "l", [32]], [6.908, -4.945, 0, "m", [33]], [7.732, -3.933, 0, "e", [34]], [8.474, -2.739, 0, "d", [35]],
  [9.123, -1.407, 0, "m", [0]],
  [-0.257, 4.788, 0, "v", [37]], [-1.411, 3.264, 0, "s", [38]], [-2.384, 2.436, 0, "d", [39]], [-3.818, 2.080, 0, "k", [40]], [-6.236, 1.847, 0, "m", [17]],
  [-3.532, -7.189, 0, "m", [42]], [-1.810, -7.753, 0, "l", [43]], [0.142, -7.850, 0, "h", [44]], [1.965, -7.462, 0, "m", [29]],
].map(([x, z, h, art, nach]) => ({ x, z, h, art, nach }));

const inselbrett = fertig({ nr: 1, name: "Inselbrett", emo: "🏝️", welt: "insel", kurz: "die kleine Karte", text: "Die kleine Karte: Abkürzung, Umweg mit Laden und Heilquelle",
  radius: 14.6, burg: [1.6, -1.4], podest: [2.5, 2.1, 0], felder: INSEL_FELDER, nh: 36,
  wegname: { 9: "➡️ Hauptweg", 36: "⚡ Abkürzung – kurz, aber gefährlich", 25: "➡️ Hauptweg", 41: "🌿 Umweg – mit Laden und Heilquelle" },
  soll: { felder: 45, abzweige: 2 } });

// ---------------------------------------------------------------- Hafeninsel
// Zwei Teiche liegen wie Buchten in der Insel. Der Hauptweg geht am Ufer entlang, die Sandbank mitten hindurch.
const TEICH_W = [-13, 3], TEICH_O = [13, 3];
const hafeninsel = karteBauen({ nr: 3, name: "Hafeninsel", emo: "⚓", welt: "hafen", trick: "gezeiten", kurz: "Ebbe und Flut",
  text: "Ebbe und Flut alle 2 Runden: bei Flut sind die zwei Sandbänke gesperrt. Das Muschelhorn schaltet um.",
  radius: 27.5, burg: [0, -6], burgGroesse: 1.5, podest: [0, 4, 0], teiche: [{ x: TEICH_W[0], z: TEICH_W[1], r: 6.1 }, { x: TEICH_O[0], z: TEICH_O[1], r: 6.1 }],
  soll: { felder: 100, abzweige: 4 }, bank: [["ring", [0, -20.5]]],
  wege: [
    { id: "ring", arten: "mmtem" + "vlmem" + "dtkev" + "smmet" + "mvhem" + "dktem" + "slmed" + "mmtem" + "vmdem" + "tkmvm" + "lemdm" + "tsmem" + "hvdme" + "mtmem" + "kmemm",
      punkte: [[0, 21], [-7, 20.5], [-13, 18], [-10.5, 14], [-13, 10.4], [-18.2, 8.2], [-20.4, 3], [-18.2, -2.2], [-13, -4.4], [-10.5, -9], [-14, -14], [-8, -19], [0, -20.5],
        [8, -19], [14, -14], [10.5, -9], [13, -4.4], [18.2, -2.2], [20.4, 3], [18.2, 8.2], [13, 10.4], [10.5, 14], [13, 18], [7, 20.5]] },
    { von: ["ring", [-13, 10.4]], nach: ["ring", [-13, -4.4]], arten: "mkemdm", sperre: "flut", name: "🏖️ Sandbank – kurz, aber nur bei Ebbe" },
    { von: ["ring", [13, -4.4]], nach: ["ring", [13, 10.4]], arten: "memkdm", sperre: "flut", name: "🏖️ Sandbank – kurz, aber nur bei Ebbe" },
    { von: ["ring", [10, 19.5]], nach: ["ring", [-10, 19.5]], ueber: [[7, 23.4], [0, 24.4], [-7, 23.4]], arten: "mlhmem", name: "⚓ Hafenmole – mit Laden und Heilquelle" },
    { von: ["ring", [-11, -17]], nach: ["ring", [11, -17]], ueber: [[-7, -23], [0, -24.4], [7, -23]], arten: "smkdmes", name: "🪨 Klippenpfad – Truhe, aber Stacheln" },
  ] });

// ---------------------------------------------------------------- Vulkaninsel
const VULKAN_RING = Array.from({ length: 30 }, (_, i) => { const a = i * 12; return polar(20 + 2.6 * Math.sin(((a * 5 + 34) * Math.PI) / 180), a + 90); });
const vulkaninsel = karteBauen({ nr: 2, name: "Vulkaninsel", emo: "🌋", welt: "vulkan", trick: "ausbruch", kurz: "Lava und Portale",
  text: "Alle 3 Runden bricht der Vulkan aus und legt neue Lavafelder. Die alte Lava wird für 1 Runde zur Abkürzung. Dazu 2 Portalpaare.",
  radius: 27, burg: [0, 0], burgGroesse: 2.2, podest: [0, 9.5, 0], soll: { felder: 95, abzweige: 3 },
  portale: { 3: 47, 47: 3, 22: 66, 66: 22 }, bank: [["ring", polar(20, 270)]],
  lava: [[6, 7, 9, 10, 12, 13, 15, 16], [30, 31, 33, 34, 36, 37, 39, 40], [52, 53, 55, 56, 58, 59, 61, 62]],
  wege: [
    { id: "ring", arten: "mmepmvmemt" + "mvmekmmdle" + "mhpmtedmvk" + "mmletmvmem" + "mdsemhtpme" + "lmmvkemtmv" + "emmdsepmtm" + "mvme", punkte: VULKAN_RING },
    { von: ["ring", polar(20, 110)], nach: ["ring", polar(20, 175)], ueber: [polar(12.5, 142)], arten: "ggkgmgm", name: "🔥 Lavapfad – kurz, heiß, mit Truhe" },
    { von: ["ring", polar(20, 225)], nach: ["ring", polar(20, 285)], ueber: [polar(15, 227), polar(13.5, 255), polar(15, 283)], arten: "mlhmemkm", name: "🌿 Aschepfad – mit Laden und Heilquelle" },
    // kurz genug, dass ein guter Wurf in der einen offenen Runde hinueberreicht
    { von: ["ring", polar(20, 330)], nach: ["ring", polar(20, 30)], ueber: [polar(15, 332), polar(13, 0), polar(15, 28)], arten: "mkmdmk", sperre: "kruste", name: "🪨 Erkaltete Lava – nur diese Runde offen" },
  ] });

// ---------------------------------------------------------------- Glitzerpassage
// Die drei Etagen liegen als Terrassen uebereinander (wie ein Lichthof): von oben sieht man alle Felder, nichts verdeckt etwas.
const EG = 18, OG1 = 12, OG2 = 6.6, H1 = 3, H2 = 6;
const SPIELWAREN = ["doppel", "dreifach", "mini", "wunder", "rakete", "tausch", "aufkleber"];
const WERKZEUG = ["falle", "sperre", "bombe", "dieb", "handschuh", "schild", "aufkleber"];
const DROGERIE = ["heil", "gift", "fluch", "blitz", "schild", "wunder", "aufkleber"];
const SPORT = ["faust", "bogen", "rohr", "rakete", "doppel", "heil", "aufkleber"];
const glitzerpassage = karteBauen({ nr: 4, name: "Glitzerpassage", emo: "🛍️", welt: "kaufhaus", trick: "kaufhaus", kurz: "Kaufhaus, 3 Etagen",
  text: "Kaufhaus mit 3 Etagen, Rolltreppen und Aufzug: du wählst die Etage. Nach 4 verschiedenen Läden wird der Stern billiger. Der Preisaufkleber macht es Gegnern teuer.",
  radius: 24, burg: [0, -3.2, H2], burgGroesse: 0.6, podest: [0, 1.4, H2], etagen: [{ r: OG1 + 1.2, h: H1 }, { r: OG2 + 1.2, h: H2 }], hauptName: "➡️ Auf dieser Etage bleiben", soll: { felder: 105, abzweige: 9 }, bank: [["eg", polar(EG, 200)]],
  wege: [
    { id: "eg", kreis: { r: EG, start: 90 }, h: 0, arten: "mmemtmvdmemkmtmemvmhmemmtmvemdmemsmkmemtmvmmmemme" },
    { id: "og1", kreis: { r: OG1, start: 90 }, h: H1, arten: "memtmvmmmkmemhmtmemdmvmemkmsmtmemmmm" },
    { id: "og2", kreis: { r: OG2, start: 90 }, h: H2, arten: "mkmemdmhmtmkmemmmvme" },
  ],
  kanten: [
    { von: ["eg", polar(EG, 30)], nach: ["og1", polar(OG1, 30)], name: "🔼 Rolltreppe hoch" },
    { von: ["eg", polar(EG, 150)], nach: ["og1", polar(OG1, 150)], name: "🔼 Rolltreppe hoch" },
    { von: ["og1", polar(OG1, 330)], nach: ["eg", polar(EG, 330)], name: "🔽 Rolltreppe runter" },
    { von: ["og1", polar(OG1, 210)], nach: ["eg", polar(EG, 210)], name: "🔽 Rolltreppe runter" },
    { von: ["og1", polar(OG1, 90)], nach: ["og2", polar(OG2, 90)], name: "🔼 Rolltreppe hoch" },
    { von: ["og2", polar(OG2, 0)], nach: ["og1", polar(OG1, 0)], name: "🔽 Rolltreppe runter" },
  ],
  aufzug: [{ ring: "eg", punkt: polar(EG, 270), name: "🛗 Aufzug: Erdgeschoss" }, { ring: "og1", punkt: polar(OG1, 270), name: "🛗 Aufzug: 1. Etage" }, { ring: "og2", punkt: polar(OG2, 270), name: "🛗 Aufzug: 2. Etage" }],
  laeden: [
    // so verteilt, dass wer es drauf anlegt alle vier in 24 Schritten schafft (rund 7 von 12 Runden, test_karten.py)
    { eingaenge: [["eg", polar(EG, 120)], ["og1", polar(OG1, 300)]], name: "Spielwarenland", emo: "🧸", waren: SPIELWAREN },
    { eingaenge: [["og1", polar(OG1, 240)], ["og2", polar(OG2, 54)]], name: "Werkzeugecke", emo: "🔧", waren: WERKZEUG },
    { eingaenge: [["og1", polar(OG1, 170)], ["eg", polar(EG, 12)]], name: "Drogerie", emo: "🧴", waren: DROGERIE },
    { eingaenge: [["og2", polar(OG2, 306)], ["eg", polar(EG, 300)]], name: "Sportwelt", emo: "🥊", waren: SPORT },
  ] });

export const KARTEN = { 1: inselbrett, 2: vulkaninsel, 3: hafeninsel, 4: glitzerpassage };
export const KARTEN_REIHE = [3, 2, 4, 1];   // so stehen sie in der Wahl

// ---------------------------------------------------------------- Lage im Spiel
export const istGesperrt = (s, k, f) => {
  const art = k.sperren[f];
  if (art === "flut") return !!s.flut;
  if (art === "kruste") return s.krusteRunde !== s.runde;
  return false;
};
// Wege von f aus: gesperrte Felder betritt man nicht; wer selbst auf einem steht, laeuft auf seinem Weg weiter
export function wegeVon(s, k, f) {
  if (istGesperrt(s, k, f)) return k.next[f];
  const frei = k.next[f].filter((z) => !istGesperrt(s, k, z));
  return frei.length ? frei : k.next[f];
}
// Feldart jetzt: Lavafelder der Vulkaninsel wechseln mit jedem Ausbruch
export const lavaFelder = (s, k) => (k.lava.length && s.lavaGruppe >= 0 ? k.lava[s.lavaGruppe % k.lava.length] : []);
export function feldArt(s, k, f, muster) { return lavaFelder(s, k).includes(f) ? "g" : muster[f]; }
// erstes Feld hinter einer Sperre (wer dort steht, wird ans Ufer gespuelt)
export function ausweg(k, f) {
  let x = f;
  for (let i = 0; i < k.next.length && k.sperren[x]; i++) x = k.next[x][0];
  return x;
}
// fuer die Zeichnung: was gerade gesperrt oder Lava ist
export function kartenZustand(s, k) {
  return { flut: !!s.flut, gesperrt: Object.keys(k.sperren).map(Number).filter((f) => istGesperrt(s, k, f)), lava: lavaFelder(s, k) };
}
// Eine Zeile fuer alle: was die Karte gerade macht
export function kartenInfo(s, k) {
  if (k.trick === "gezeiten") {
    const rest = GEZEITEN_ALLE - ((s.runde - 1) % GEZEITEN_ALLE);
    return s.flut ? `🌊 Flut: Sandbänke gesperrt · Ebbe in ${rest} ${rest === 1 ? "Runde" : "Runden"}` : `🏖️ Ebbe: Sandbänke offen · Flut in ${rest} ${rest === 1 ? "Runde" : "Runden"}`;
  }
  if (k.trick === "ausbruch") {
    const rest = AUSBRUCH_ALLE - (s.runde % AUSBRUCH_ALLE);
    const offen = s.krusteRunde === s.runde ? "🪨 Erkaltete Lava offen · " : "";
    return `${offen}🌋 Ausbruch ${rest === 1 ? "nächste Runde" : `in ${rest} Runden`}`;
  }
  return "";
}

// ---------------------------------------------------------------- Pruefprogramm (Plan: jedes Feld erreichbar, keine Sackgasse)
// Alle Lagen einer Karte: was offen oder zu sein kann. Gibt die gefundenen Fehler als Text zurueck.
export function kartenLagen(k) {
  if (k.trick === "gezeiten") return [{ name: "Ebbe", s: { flut: false, runde: 1, krusteRunde: 0 } }, { name: "Flut", s: { flut: true, runde: 1, krusteRunde: 0 } }];
  if (k.trick === "ausbruch") return [{ name: "Kruste zu", s: { flut: false, runde: 1, krusteRunde: 0 } }, { name: "Kruste offen", s: { flut: false, runde: 3, krusteRunde: 3 } }];
  return [{ name: "immer", s: { flut: false, runde: 1, krusteRunde: 0 } }];
}
function erreichbar(start, nachbarn) {
  const da = new Set([start]), q = [start];
  while (q.length) nachbarn(q.pop()).forEach((y) => { if (!da.has(y)) { da.add(y); q.push(y); } });
  return da;
}
export function kartePruefen(k) {
  const fehler = [], n = k.next.length, jemals = new Set([0]);
  k.next.forEach((nx, f) => {
    if (!nx.length) fehler.push(`${k.name}: Feld ${f} hat keinen Nachbarn`);
    nx.forEach((z) => { if (!(z >= 0 && z < n)) fehler.push(`${k.name}: Feld ${f} zeigt ins Leere (${z})`); });
    if (new Set(nx).size !== nx.length) fehler.push(`${k.name}: Feld ${f} hat doppelte Nachbarn`);
    if (nx.some((z) => z === f)) fehler.push(`${k.name}: Feld ${f} zeigt auf sich selbst`);
    if (!k.sperren[f] && k.sperren[nx[0]]) fehler.push(`${k.name}: Hauptweg von Feld ${f} kann gesperrt sein`);
    if (nx.length > 1) nx.forEach((z) => { if (!k.wegname[z]) fehler.push(`${k.name}: Weg von ${f} nach ${z} hat keinen Namen`); });
  });
  for (const lage of kartenLagen(k)) {
    const wege = (f) => wegeVon(lage.s, k, f);
    const rueck = Array.from({ length: n }, () => []);
    k.next.forEach((_, f) => wege(f).forEach((z) => rueck[z].push(f)));
    const hin = erreichbar(0, wege), zurueck = erreichbar(0, (f) => rueck[f]);
    for (let f = 0; f < n; f++) {
      if (!wege(f).length) fehler.push(`${k.name} (${lage.name}): Feld ${f} ist eine Sackgasse`);
      if (!zurueck.has(f)) fehler.push(`${k.name} (${lage.name}): von Feld ${f} kommt man nicht zum Start`);
      if (!hin.has(f) && !istGesperrt(lage.s, k, f)) fehler.push(`${k.name} (${lage.name}): Feld ${f} ist nicht erreichbar`);
    }
    hin.forEach((f) => jemals.add(f));
  }
  for (let f = 0; f < n; f++) if (!jemals.has(f)) fehler.push(`${k.name}: Feld ${f} ist in keiner Lage erreichbar`);
  Object.entries(k.portale).forEach(([a, b]) => {
    if (k.portale[b] !== Number(a)) fehler.push(`${k.name}: Portal ${a} hat keinen Partner`);
    if (k.muster[a] !== "p") fehler.push(`${k.name}: Portal ${a} liegt nicht auf einem Portalfeld`);
  });
  k.lava.flat().forEach((f) => { if ("lpdzb".includes(k.muster[f]) || k.sperren[f]) fehler.push(`${k.name}: Lavafeld ${f} überdeckt ${k.muster[f]}`); });
  // Bank (Runde C): genau eine je Karte, auf dem Hauptweg erreichbar (gilt mit dem Erreichbarkeits-Check oben)
  const banken = [...k.muster].filter((a) => a === "b").length;
  if (banken !== 1) fehler.push(`${k.name}: ${banken} statt 1 Bank`);
  // Felder duerfen sich nicht ueberlappen (Durchmesser der Platte 1,6), ausser Etagen uebereinander
  if (k.nr !== 1) for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const p = k.lage[a], q = k.lage[b];
    if (p.h === q.h && Math.hypot(p.x - q.x, p.z - q.z) < 1.62) fehler.push(`${k.name}: Felder ${a} und ${b} liegen zu dicht (${Math.hypot(p.x - q.x, p.z - q.z).toFixed(2)})`);
  }
  k.lage.forEach((p, f) => { if (Math.hypot(p.x, p.z) > k.radius * 0.93 - 0.8) fehler.push(`${k.name}: Feld ${f} ragt über den Rand`); });
  const abzweige = k.next.filter((x) => x.length > 1).length;
  if (k.soll) {
    if (n !== k.soll.felder) fehler.push(`${k.name}: ${n} statt ${k.soll.felder} Felder`);
    if (abzweige !== k.soll.abzweige) fehler.push(`${k.name}: ${abzweige} statt ${k.soll.abzweige} Abzweige`);
  }
  return { fehler, felder: n, abzweige, lagen: kartenLagen(k).map((l) => l.name) };
}
