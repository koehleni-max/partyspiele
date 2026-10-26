// Klang fuer die Partyspiele: alle Geraeusche und die Hintergrundmusik werden live im Browser erzeugt (WebAudio),
// keine Tondateien, nichts aus dem Netz. Schalter unten links: alles an -> nur Effekte -> stumm (je Handy gemerkt).

let ctx = null, haupt = null, hall = null, musikBus = null;
let modus = localStorage.getItem("pa_ton") || "an"; // "an" | "effekte" | "aus"
let musikName = null, musikLauf = null;

function bereit() {
  if (ctx) return ctx.state === "running";
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  const komp = ctx.createDynamicsCompressor();
  komp.threshold.value = -14; komp.ratio.value = 4;
  haupt = ctx.createGain(); haupt.gain.value = 0.55;
  haupt.connect(komp).connect(ctx.destination);
  // kleiner Raumhall ueber eine Rueckkopplungs-Verzoegerung
  hall = ctx.createGain(); hall.gain.value = 0.22;
  const v = ctx.createDelay(); v.delayTime.value = 0.13;
  const fb = ctx.createGain(); fb.gain.value = 0.35;
  const tp = ctx.createBiquadFilter(); tp.type = "lowpass"; tp.frequency.value = 2400;
  hall.connect(v).connect(tp).connect(fb).connect(v); tp.connect(haupt);
  musikBus = ctx.createGain(); musikBus.gain.value = 0.0; musikBus.connect(haupt);
  return ctx.state === "running";
}
// Browser erlauben Ton erst nach dem ersten Antippen
["pointerdown", "keydown", "touchstart"].forEach((e) => document.addEventListener(e, () => {
  bereit(); if (ctx && ctx.state !== "running") ctx.resume().then(() => musikNeu());
}, { passive: true }));

// ---------------------------------------------------------------- Bausteine
function ton(freq, dauer, { typ = "sine", laut = 0.3, ab = null, start = 0, angriff = 0.005, hallAnteil = 0.4, ziel = null, filter = null } = {}) {
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = typ; o.frequency.setValueAtTime(freq, t);
  if (ab) o.frequency.exponentialRampToValueAtTime(ab, t + dauer);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(laut, t + angriff);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  let kette = o;
  if (filter) { const f = ctx.createBiquadFilter(); f.type = filter.typ || "lowpass"; f.frequency.value = filter.f; f.Q.value = filter.q || 1; kette.connect(f); kette = f; }
  kette.connect(g);
  const aus = ziel || haupt;
  g.connect(aus);
  if (!ziel && hallAnteil) { const h = ctx.createGain(); h.gain.value = hallAnteil; g.connect(h).connect(hall); }
  o.start(t); o.stop(t + dauer + 0.05);
  return o;
}
let rauschPuffer = null;
function rauschen(dauer, { laut = 0.25, start = 0, f = 3000, typ = "bandpass", q = 1, ziel = null, ab = null } = {}) {
  if (!rauschPuffer) {
    rauschPuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = rauschPuffer.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + start;
  const q0 = ctx.createBufferSource(); q0.buffer = rauschPuffer; q0.loop = true;
  const fi = ctx.createBiquadFilter(); fi.type = typ; fi.frequency.setValueAtTime(f, t); fi.Q.value = q;
  if (ab) fi.frequency.exponentialRampToValueAtTime(ab, t + dauer);
  const g = ctx.createGain();
  g.gain.setValueAtTime(laut, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  q0.connect(fi).connect(g).connect(ziel || haupt);
  q0.start(t); q0.stop(t + dauer + 0.05);
}
const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI-Nummer -> Hz

// ---------------------------------------------------------------- Geraeusche
const EFFEKTE = {
  klick: () => ton(720, 0.06, { typ: "triangle", laut: 0.16, ab: 980, hallAnteil: 0 }),
  pop: () => { ton(400, 0.09, { typ: "sine", laut: 0.3, ab: 1100 }); },
  karte: () => { rauschen(0.07, { laut: 0.35, f: 4200, typ: "highpass" }); ton(300, 0.05, { typ: "triangle", laut: 0.12, ab: 180, start: 0.02, hallAnteil: 0 }); },
  dran: () => { ton(N(88), 0.35, { typ: "triangle", laut: 0.22 }); ton(N(93), 0.5, { typ: "triangle", laut: 0.22, start: 0.12 }); },
  richtig: () => [72, 76, 79, 84].forEach((n, i) => ton(N(n), 0.25, { typ: "triangle", laut: 0.22, start: i * 0.07 })),
  falsch: () => { ton(170, 0.32, { typ: "sawtooth", laut: 0.2, ab: 90, filter: { f: 900 } }); ton(160, 0.32, { typ: "square", laut: 0.08, ab: 85, start: 0.02, filter: { f: 700 } }); },
  sieg: () => {
    [[60, 0], [64, 0.13], [67, 0.26], [72, 0.39]].forEach(([n, s]) => { ton(N(n), 0.22, { typ: "square", laut: 0.12, start: s, filter: { f: 3000 } }); ton(N(n + 12), 0.22, { typ: "triangle", laut: 0.12, start: s }); });
    [72, 76, 79].forEach((n) => ton(N(n), 1.1, { typ: "triangle", laut: 0.16, start: 0.55 }));
    for (let i = 0; i < 10; i++) ton(N(96 + Math.floor(Math.random() * 12)), 0.12, { laut: 0.06, start: 0.6 + i * 0.06 });
  },
  wuerfel: () => { let s = 0; for (let i = 0; i < 9; i++) { rauschen(0.04, { laut: 0.4, f: 1800 + Math.random() * 1500, q: 3, start: s }); ton(220 + Math.random() * 200, 0.03, { typ: "square", laut: 0.05, start: s, hallAnteil: 0 }); s += 0.035 + i * 0.012; } },
  schritt: () => ton(330, 0.12, { typ: "sine", laut: 0.25, ab: 620 }),
  stern: () => [84, 88, 91, 96, 100].forEach((n, i) => ton(N(n), 0.3, { typ: "sine", laut: 0.14, start: i * 0.05 })),
  tick: () => { ton(1300, 0.04, { typ: "sine", laut: 0.25, hallAnteil: 0 }); },
  tack: () => { ton(1700, 0.06, { typ: "square", laut: 0.12, hallAnteil: 0, filter: { f: 2500 } }); },
  los: () => { ton(N(72), 0.12, { typ: "square", laut: 0.1, filter: { f: 2500 } }); ton(N(79), 0.3, { typ: "square", laut: 0.12, start: 0.1, filter: { f: 2500 } }); },
  sprung: () => ton(260, 0.16, { typ: "square", laut: 0.08, ab: 700, filter: { f: 2200 }, hallAnteil: 0.1 }),
  aua: () => { rauschen(0.25, { laut: 0.35, f: 900, ab: 200, typ: "lowpass" }); ton(200, 0.3, { typ: "sawtooth", laut: 0.12, ab: 60, filter: { f: 800 } }); },
  ziel: () => [67, 72, 76, 79, 84].forEach((n, i) => ton(N(n), 0.3, { typ: "square", laut: 0.08, start: i * 0.08, filter: { f: 3000 } })),
  gong: () => { [110, 220.7, 331, 452].forEach((f, i) => ton(f, 3.2 - i * 0.5, { typ: "sine", laut: 0.22 / (i + 1), angriff: 0.01, hallAnteil: 0.8 })); },
  heulen: () => {
    const t = ctx.currentTime, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), vib = ctx.createOscillator(), vg = ctx.createGain();
    o.type = "sawtooth"; o2.type = "triangle"; f.type = "bandpass"; f.Q.value = 6;
    [o, o2].forEach((x, i) => { x.frequency.setValueAtTime(330 * (i ? 2.003 : 1), t); x.frequency.linearRampToValueAtTime(560 * (i ? 2.003 : 1), t + 0.7); x.frequency.linearRampToValueAtTime(520 * (i ? 2.003 : 1), t + 1.8); x.frequency.linearRampToValueAtTime(380 * (i ? 2.003 : 1), t + 2.6); });
    f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1200, t + 0.8); f.frequency.linearRampToValueAtTime(800, t + 2.6);
    vib.frequency.value = 5.5; vg.gain.value = 9; vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.4); g.gain.setValueAtTime(0.25, t + 1.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(haupt); const h = ctx.createGain(); h.gain.value = 0.9; g.connect(h).connect(hall);
    [o, o2, vib].forEach((x) => { x.start(t); x.stop(t + 2.9); });
  },
  morgen: () => { [67, 71, 74, 79, 83, 86].forEach((n, i) => ton(N(n), 0.9, { typ: "triangle", laut: 0.13, start: i * 0.11 })); rauschen(1.4, { laut: 0.04, f: 6000, typ: "highpass", start: 0.1 }); },
  tod: () => { [[57, 0], [53, 0.35], [50, 0.7]].forEach(([n, s]) => ton(N(n), 0.9, { typ: "sawtooth", laut: 0.1, start: s, filter: { f: 900 } })); ton(55, 1.6, { typ: "sine", laut: 0.3, start: 0.7 }); },
  spannung: () => { for (let i = 0; i < 6; i++) ton(N(45), 0.18, { typ: "sawtooth", laut: 0.07 + i * 0.02, start: i * 0.22, filter: { f: 600 } }); },
  magie: () => { for (let i = 0; i < 14; i++) ton(N(84 + (i * 5) % 19), 0.25, { typ: "sine", laut: 0.08, start: i * 0.04 }); rauschen(0.8, { laut: 0.05, f: 7000, typ: "highpass" }); },
  herz: () => { ton(70, 0.12, { laut: 0.5, hallAnteil: 0 }); ton(65, 0.14, { laut: 0.4, start: 0.18, hallAnteil: 0 }); },
  schuss: () => { rauschen(0.5, { laut: 0.7, f: 2500, ab: 150, typ: "lowpass" }); ton(120, 0.4, { typ: "sine", laut: 0.5, ab: 40, hallAnteil: 0.6 }); },
  fanfare: () => EFFEKTE.sieg(),
  // Gruselklaenge fuer das Halloween-Aussehen (26.10.2026): Geist, knarzende Tuer, Hexenkichern, schiefer Akkord
  geist: () => {
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(420, t); o.frequency.linearRampToValueAtTime(760, t + 0.7); o.frequency.linearRampToValueAtTime(380, t + 1.8);
    vib.frequency.value = 6.5; vg.gain.value = 14; vib.connect(vg); vg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    o.connect(g); g.connect(haupt); const h = ctx.createGain(); h.gain.value = 1; g.connect(h).connect(hall);
    [o, vib].forEach((x) => { x.start(t); x.stop(t + 2); });
  },
  knarzen: () => {
    for (let i = 0; i < 9; i++) ton(70 + Math.random() * 40, 0.09, { typ: "sawtooth", laut: 0.14, ab: 55 + Math.random() * 30, start: i * 0.075, filter: { f: 900, q: 6, typ: "bandpass" }, hallAnteil: 0.2 });
    rauschen(0.7, { laut: 0.05, f: 700, q: 4 });
  },
  kichern: () => [0, 1, 2, 3, 4, 5].forEach((i) => { ton(N(84 - i * 2), 0.11, { typ: "square", laut: 0.06, start: i * 0.12, filter: { f: 2600 } }); ton(N(91 - i * 2), 0.08, { typ: "triangle", laut: 0.05, start: i * 0.12 + 0.04 }); }),
  grusel: () => { [45, 46, 51, 52].forEach((n, i) => ton(N(n), 2.4, { typ: "sawtooth", laut: 0.05, angriff: 0.5 + i * 0.1, filter: { f: 600 }, hallAnteil: 0.9 })); ton(55, 2.2, { typ: "sine", laut: 0.22, angriff: 0.3 }); },
  // Begruessung am Beamer (Schritt B, 26.10.2026): kurze, lustige Klaenge - einer davon zufaellig je neuem Gast
  techno: () => {
    const d = 60 / 140 / 2;
    for (let i = 0; i < 8; i++) {
      if (i % 2 === 0) ton(150, 0.2, { typ: "sine", laut: 0.6, ab: 42, start: i * d, hallAnteil: 0 });
      else rauschen(0.05, { laut: 0.12, f: 9000, typ: "highpass", start: i * d });
      ton(N([45, 45, 57, 45, 48, 45, 60, 52][i]), d * 0.8, { typ: "sawtooth", laut: 0.09, start: i * d, filter: { f: 700 + i * 260, q: 6 }, hallAnteil: 0.1 });
    }
    rauschen(0.9, { laut: 0.18, f: 800, ab: 9000, typ: "bandpass", q: 2, start: 8 * d - 0.45 });
    ton(N(57), 0.6, { typ: "square", laut: 0.12, start: 8 * d, filter: { f: 2200 } });
  },
  troete: () => [0, 0.2, 0.4].forEach((s, k) => [1, 1.007, 0.993].forEach((v) => ton(N(k === 2 ? 70 : 69) * v, k === 2 ? 0.6 : 0.15, { typ: "sawtooth", laut: 0.09, start: s, angriff: 0.01, filter: { f: 2800 } }))),
  boing: () => {
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(520, t + 0.08); o.frequency.exponentialRampToValueAtTime(140, t + 0.7);
    vib.frequency.setValueAtTime(18, t); vib.frequency.linearRampToValueAtTime(5, t + 0.7); vg.gain.value = 40; vib.connect(vg); vg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(g); g.connect(haupt);
    [o, vib].forEach((x) => { x.start(t); x.stop(t + 0.85); });
  },
  wirbel: () => { for (let i = 0; i < 22; i++) rauschen(0.05, { laut: 0.1 + i * 0.012, f: 2400, q: 1.5, start: i * 0.045 }); rauschen(1.2, { laut: 0.3, f: 6000, typ: "highpass", start: 1.0 }); ton(110, 0.4, { laut: 0.5, ab: 50, start: 1.0 }); },
  wobble: () => { for (let i = 0; i < 6; i++) ton(N(33), 0.16, { typ: "sawtooth", laut: 0.2, start: i * 0.16, filter: { f: i % 2 ? 1400 : 260, q: 8 }, hallAnteil: 0 }); ton(N(69), 0.4, { typ: "square", laut: 0.08, start: 0.96, filter: { f: 2500 } }); },
  tada: () => { ton(N(67), 0.12, { typ: "square", laut: 0.1, filter: { f: 3000 } }); [67, 71, 74, 79].forEach((n) => ton(N(n), 0.9, { typ: "triangle", laut: 0.12, start: 0.16 })); },
  // Schreckmoment (nur im Halloween-Aussehen): greller Schrei, ca. 2 s - Stimme aus verstimmten Saegezaehnen + Rauschen
  schrei: () => {
    const t = ctx.currentTime, g = ctx.createGain(), f = ctx.createBiquadFilter(), vib = ctx.createOscillator(), vg = ctx.createGain();
    f.type = "bandpass"; f.Q.value = 2.5; f.frequency.setValueAtTime(1400, t); f.frequency.linearRampToValueAtTime(2600, t + 0.4); f.frequency.linearRampToValueAtTime(900, t + 2);
    vib.frequency.value = 11; vg.gain.value = 45; vib.connect(vg);
    const stimmen = [1, 1.012, 0.987, 1.5].map((v) => {
      const o = ctx.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(520 * v, t); o.frequency.exponentialRampToValueAtTime(1250 * v, t + 0.25); o.frequency.linearRampToValueAtTime(1100 * v, t + 1.3); o.frequency.exponentialRampToValueAtTime(380 * v, t + 2);
      vg.connect(o.frequency); o.connect(f); return o;
    });
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.04); g.gain.setValueAtTime(0.45, t + 1.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    f.connect(g); g.connect(haupt); const h = ctx.createGain(); h.gain.value = 0.7; g.connect(h).connect(hall);
    [...stimmen, vib].forEach((x) => { x.start(t); x.stop(t + 2.2); });
    rauschen(0.5, { laut: 0.5, f: 3000, ab: 800, q: 0.8 });
    ton(70, 1.2, { typ: "sine", laut: 0.5, ab: 35 });
  },
};
// Zufallsauswahl fuer die Begruessung am Beamer
export const GRUSS_KLAENGE = ["techno", "troete", "boing", "wirbel", "wobble", "tada"];

export function spiele(name) {
  if (modus === "aus" || !bereit() || !EFFEKTE[name]) return;
  try { EFFEKTE[name](); } catch (e) { /* Ton ist Beiwerk */ }
}

// ---------------------------------------------------------------- Hintergrundmusik
// Kleine Sequenzer-Stuecke; jede Takt-Achtel wird kurz vor der Zeit eingeplant.
const STUECKE = {
  brett: { bpm: 116, laut: 0.5, takte: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], schritt(i, akk, t, d) {
    const p = i % 8;
    ton(N(akk[0] - 24), d * 1.6, { typ: "triangle", laut: p % 4 === 0 ? 0.32 : 0.0001, start: t, ziel: musikBus });
    if (p === 2 || p === 6) ton(N(akk[0] - 12), d * 0.9, { typ: "triangle", laut: 0.18, start: t, ziel: musikBus });
    const melodie = [0, 1, 2, 1, 2, 0, 1, 2];
    ton(N(akk[melodie[p]] + 12), d * 0.8, { typ: "square", laut: 0.05, start: t, ziel: musikBus, filter: { f: 1800 } });
    if (p % 2 === 1) rauschen(0.04, { laut: 0.05, f: 8000, typ: "highpass", start: t, ziel: musikBus });
  } },
  fiesbau: { bpm: 138, laut: 0.45, takte: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62]], schritt(i, akk, t, d) {
    const p = i % 8;
    if (p % 2 === 0) { ton(150, 0.18, { typ: "sine", laut: 0.55, ab: 45, start: t, ziel: musikBus }); }
    ton(N(akk[0] - 24), d * 0.8, { typ: "sawtooth", laut: 0.12, start: t, ziel: musikBus, filter: { f: 500 + (p % 4) * 120 } });
    if (p % 2 === 1) rauschen(0.05, { laut: 0.08, f: 9000, typ: "highpass", start: t, ziel: musikBus });
    if (p === 4) rauschen(0.12, { laut: 0.12, f: 1800, typ: "bandpass", start: t, ziel: musikBus });
    if (p === 3 || p === 7) ton(N(akk[2] + 12), d * 0.6, { typ: "square", laut: 0.04, start: t, ziel: musikBus, filter: { f: 2200 } });
  } },
  nacht: { bpm: 50, laut: 0.9, takte: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]], schritt(i, akk, t, d) {
    const p = i % 8;
    if (p === 0) akk.forEach((n, k) => { ton(N(n - 12) * (k ? 1.003 : 0.997), d * 8.5, { typ: "sawtooth", laut: 0.035, angriff: d * 2, start: t, ziel: musikBus, filter: { f: 520 } }); });
    if (p === 0) ton(N(akk[0] - 24), d * 8, { typ: "sine", laut: 0.18, angriff: d, start: t, ziel: musikBus });
    if (Math.random() < 0.35) for (let k = 0; k < 3; k++) ton(4200 + Math.random() * 300, 0.03, { typ: "sine", laut: 0.025, start: t + k * 0.06, ziel: musikBus });
    if (p === 5 && Math.random() < 0.5) ton(N(akk[2] + 12), d * 3, { typ: "sine", laut: 0.05, angriff: 0.3, start: t, ziel: musikBus });
  } },
  dorf: { bpm: 92, laut: 0.45, takte: [[62, 65, 69], [60, 64, 67], [58, 62, 65], [60, 64, 67]], schritt(i, akk, t, d) {
    const p = i % 8;
    const folge = [0, 2, 1, 2, 0, 2, 1, 2];
    ton(N(akk[folge[p]]), d * 1.8, { typ: "triangle", laut: 0.11, angriff: 0.003, start: t, ziel: musikBus });
    if (p === 0 || p === 4) ton(N(akk[0] - 24), d * 3, { typ: "sine", laut: 0.22, start: t, ziel: musikBus });
    if (p === 6 && Math.random() < 0.4) ton(N(akk[2] + 12), d * 1.5, { typ: "sine", laut: 0.06, start: t, ziel: musikBus });
  } },
  spannung: { bpm: 100, laut: 0.4, takte: [[45, 48, 52], [45, 48, 52], [46, 49, 53], [44, 47, 51]], schritt(i, akk, t, d) {
    const p = i % 8;
    if (p % 2 === 0) ton(N(akk[0]), d * 0.7, { typ: "sawtooth", laut: 0.08, start: t, ziel: musikBus, filter: { f: 700 } });
    if (p === 0) ton(60, 0.25, { typ: "sine", laut: 0.4, ab: 40, start: t, ziel: musikBus });
    if (p === 7) ton(N(akk[2] + 24), d * 0.5, { typ: "sine", laut: 0.04, start: t, ziel: musikBus });
  } },
};

function musikNeu() {
  if (musikLauf) { clearInterval(musikLauf.timer); musikLauf = null; }
  if (!ctx || ctx.state !== "running") return;
  const st = musikName && modus === "an" ? STUECKE[musikName] : null;
  musikBus.gain.cancelScheduledValues(ctx.currentTime);
  musikBus.gain.setTargetAtTime(st ? st.laut * 1.3 : 0, ctx.currentTime, 0.6);
  if (!st) return;
  const d = 60 / st.bpm / 2; // Achtel
  const lauf = { i: 0, naechste: ctx.currentTime + 0.1 };
  lauf.timer = setInterval(() => {
    while (lauf.naechste < ctx.currentTime + 0.25) {
      const akk = st.takte[Math.floor(lauf.i / 8) % st.takte.length];
      try { st.schritt(lauf.i, akk, lauf.naechste - ctx.currentTime, d); } catch (e) { /* weiter */ }
      lauf.i++; lauf.naechste += d;
    }
  }, 90);
  musikLauf = lauf;
}
export function musik(name) {
  name = name || null;
  if (name === musikName) return;
  musikName = name;
  if (bereit() || ctx) musikNeu();
}
document.addEventListener("visibilitychange", () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume().then(() => musikNeu()); });

// ---------------------------------------------------------------- Schalter
const SYMBOL = { an: "🔊", effekte: "🔉", aus: "🔇" };
const TEXT = { an: "Ton + Musik an", effekte: "Nur Geräusche", aus: "Stumm" };
export function schalterHTML() {
  return `<button class="ton-schalter" data-ton-schalter title="${TEXT[modus]}" aria-label="Ton: ${TEXT[modus]}">${SYMBOL[modus]}</button>`;
}
export function umschalten() {
  modus = modus === "an" ? "effekte" : modus === "effekte" ? "aus" : "an";
  localStorage.setItem("pa_ton", modus);
  bereit(); if (ctx && ctx.state !== "running") ctx.resume();
  musikNeu();
  if (modus !== "aus") spiele("pop");
  return TEXT[modus];
}
export function tonModus() { return modus; }

// Handy still (Schritt D, 26.10.2026): zeigt der Beamer gerade das Spiel dieses Handys, kommen Musik, Spielgeraeusche und
// der Werwolf-Erzaehler von der Wand - das Handy bleibt leise (app.js setzt es, werwolf.js fragt es ab).
let handyStill = false;
export function still(an) { if (an !== undefined) handyStill = !!an; return handyStill; }
