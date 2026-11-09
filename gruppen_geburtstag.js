// Geburtstags-Runde F: neue Gruppenspiele (Nico 06.11.2026, Vorschlaege 132, 135, 87, 137, 83). Inhalte: fragen_gruppen.js.
//
//   Wer wird Millionaer (132)  reihum ein Kandidat, 15 Fragen, Sicherheitsstufen, drei Joker (50:50, Publikum, Telefon).
//                              Die anderen raten am Handy mit (Mitrate-Punkte) - daraus wird auch der Publikumsjoker.
//                              Ansicht fuer den Beamer: mioAuszug/mioHTML (beamer_spiele.js haengt sie ein).
//   Wortkette (135)            reihum, Wort muss mit dem letzten Buchstaben des vorigen anfangen, Zeitlimit; bei Zweifel
//                              stimmt die Gruppe ab. Wer scheitert, ist raus - der Letzte gewinnt.
//   Activity (87)              zwei Teams, Erklaeren/Zeichnen/Pantomime, den Begriff sieht nur der Darsteller am Handy.
//   Bilderraetsel (137)        Emoji-Raetsel, alle tippen am Handy; wer zuerst richtig liegt, bekommt mehr.
//   Quiz "Damals" (83)         Fragen zu den 90ern und 2000ern, gleicher Ablauf wie das Bilderraetsel.
// Alles ohne Alkohol, keine Computer-Mitspieler. Zustand und Zufall nur beim Gastgeber.
import { esc, knopf, mischen, name } from "./hilfe.js";
import { MILLIONAER, ACTIVITY, BILDER, DAMALS } from "./fragen_gruppen.js";
import { mio3dZeigen } from "./mio3d.js";   // Millionaer-Buehne in 3D (09.11.2026)
import { MINISPIELE } from "./minispiele.js";   // Activity "Zeichnen" nutzt die Malflaeche von Malen & Raten (Restpaket 3c)
const MALEN = MINISPIELE.find((x) => x.id === "malen");

const offen = (n) => Array.from({ length: n }, (_, j) => j);
const uhr = (bis) => `<b class="gg-uhr" data-countdown="${bis}"></b>`;
// Fragen ohne Wiederholung ziehen (Index-Stapel im Zustand)
function zieh(s, schl, laenge) {
  s.stapel = s.stapel || {};
  if (!s.stapel[schl] || !s.stapel[schl].length) s.stapel[schl] = mischen(offen(laenge));
  return s.stapel[schl].pop();
}
// [Frage, richtig, f, f, f] -> { f, a: [4 gemischt], r }
function mischFrage(q) {
  const reihe = mischen([0, 1, 2, 3]);
  return { f: q[0], a: reihe.map((k) => q[1 + k]), r: reihe.indexOf(0) };
}
const BUCH = ["A", "B", "C", "D"];

// ================================================================ Wer wird Millionaer
export const MIO_GELD = [50, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 500000, 1000000];
export const MIO_SICHER = [4, 9];   // nach Frage 5 (500 €) und Frage 10 (16.000 €)
const euro = (n) => `${Number(n || 0).toLocaleString("de-DE")} €`;
// was der Kandidat beim Fehler behaelt (stufe = Index der falsch beantworteten Frage)
export const mioSicher = (stufe) => { let g = 0; MIO_SICHER.forEach((k) => { if (stufe > k) g = MIO_GELD[k]; }); return g; };
function mioFrage(s) {
  const st = s.stufe < 5 ? 0 : s.stufe < 10 ? 1 : 2;
  s.q = mischFrage(MILLIONAER[st][zieh(s, `m${st}`, MILLIONAER[st].length)]);
  Object.assign(s, { wahl: null, weg: [], tipps: {}, pub: false, tel: null, telTipp: null });
}
function mioNaechster(s, n) {
  s.gespielt[s.kand] = true;
  const rest = offen(n).filter((j) => !s.gespielt[j]);
  if (!rest.length) { s.phase = "ende"; return; }
  s.kand = rest[0]; s.stufe = 0; s.joker = { fifty: false, pub: false, tel: false }; s.phase = "frage"; mioFrage(s);
}
export const millionaer = {
  id: "millionaer", name: "Wer wird Millionär?", emoji: "💰", farben: ["#1e3a8a", "#7c3aed"], kurz: "15 Fragen, drei Joker – die anderen raten mit",
  start(namen) {
    const s = { phase: "frage", kand: 0, stufe: 0, joker: { fifty: false, pub: false, tel: false }, gewinn: namen.map(() => null), mit: namen.map(() => 0), gespielt: {}, runde: 1 };
    mioFrage(s); return s;
  },
  ergebnis(s) {
    if (s.phase !== "ende") return null;
    const max = Math.max(...s.gewinn.map((g) => g || 0));
    return max > 0 ? { nr: String(s.runde), sieger: s.gewinn.map((g, j) => ((g || 0) === max ? j : -1)).filter((j) => j >= 0) } : null;
  },
  aktion(s, i, a, namen) {
    const n = namen.length, kand = i === s.kand;
    if (s.gewinn.length < n) { s.gewinn = namen.map((_, j) => s.gewinn[j] ?? null); s.mit = namen.map((_, j) => s.mit[j] || 0); }
    if (s.phase === "frage") {
      if (a.typ === "antwort" && kand && a.k >= 0 && a.k < 4 && !s.weg.includes(a.k)) {
        s.wahl = a.k; s.phase = "aufgeloest";
        Object.entries(s.tipps).forEach(([j, k]) => { if (k === s.q.r) s.mit[j] = (s.mit[j] || 0) + 1; });
        if (a.k !== s.q.r) s.gewinn[i] = mioSicher(s.stufe);
        else if (s.stufe === 14) s.gewinn[i] = MIO_GELD[14];
      } else if (a.typ === "tipp" && !kand && a.k >= 0 && a.k < 4) s.tipps[i] = a.k;
      else if (a.typ === "fifty" && kand && !s.joker.fifty) {
        s.joker.fifty = true; s.weg = mischen([0, 1, 2, 3].filter((k) => k !== s.q.r)).slice(0, 2);
      } else if (a.typ === "pub" && kand && !s.joker.pub) { s.joker.pub = true; s.pub = true; }
      else if (a.typ === "tel" && kand && !s.joker.tel && a.j !== i && a.j >= 0 && a.j < n) { s.joker.tel = true; s.tel = a.j; }
      else if (a.typ === "teltipp" && i === s.tel && a.k >= 0 && a.k < 4) s.telTipp = a.k;
      else if (a.typ === "aufhoeren" && kand) { s.gewinn[i] = s.stufe ? MIO_GELD[s.stufe - 1] : 0; s.wahl = null; s.phase = "aufgehoert"; }
    } else if (a.typ === "weiter" && (s.phase === "aufgeloest" || s.phase === "aufgehoert")) {
      if (s.phase === "aufgeloest" && s.wahl === s.q.r && s.stufe < 14) { s.stufe++; s.phase = "frage"; mioFrage(s); }
      else mioNaechster(s, n);
    } else if (a.typ === "neustart" && s.phase === "ende") Object.assign(s, millionaer.start(namen), { runde: (s.runde || 1) + 1 });
  },
  render(s, ich, namen) {
    const kand = ich === s.kand, q = s.q;
    const stand = `<div class="punkte">${namen.map((nm, j) => `<span>${esc(nm)}: ${s.gewinn[j] === null || s.gewinn[j] === undefined ? "–" : euro(s.gewinn[j])} · ${s.mit[j] || 0} ✔</span>`).join("")}</div>`;
    const regel = `<details class="grundregeln"><summary>📜 So geht's</summary><ul><li>Reihum ist eine Person Kandidat und beantwortet bis zu 15 Fragen.</li>
      <li>Sicher sind 500 € (nach Frage 5) und 16.000 € (nach Frage 10). Aufhören behält den Stand.</li>
      <li>Joker: 50:50, Publikum (die Tipps der anderen), Telefon (eine Person darf heimlich tippen).</li>
      <li>Alle anderen raten am Handy mit – jeder richtige Tipp ist ein ✔.</li></ul></details>`;
    // 3D-Buehne (mio3d.js, 09.11.2026): steht sie, weicht die flache Frage samt Antworten (.mio-flach); Joker, Tipps der anderen,
    // Aufhoeren und Weiter bleiben als Knoepfe darunter
    const buehne = `<div class="t3d mio3d" data-key="mio3d" data-mio3d data-eigen></div>`;
    if (s.phase === "ende") {
      return `${buehne}<div class="frage mio-flach">🏆 Alle waren dran!</div>${stand}<i hidden data-ergebnis="mio${s.runde}"></i>${knopf("Neue Runde", { typ: "neustart" }, "gross")}`;
    }
    const kopf = `<div class="frage klein3">${name(namen, s.kand)} · Frage ${s.stufe + 1} um <b>${euro(MIO_GELD[s.stufe])}</b></div><div class="frage">${esc(q.f)}</div>`;
    const zaehl = [0, 1, 2, 3].map((k) => Object.values(s.tipps).filter((x) => x === k).length), alle = Object.keys(s.tipps).length;
    const pub = s.pub ? `<div class="balken">${q.a.map((t, k) => `<div class="zeile"><span>${BUCH[k]}</span><div class="b" style="width:${alle ? (zaehl[k] / alle) * 100 : 0}%"></div><b>${zaehl[k]}</b></div>`).join("")}</div>
      ${alle ? "" : "<p class='leise mitte'>Noch hat niemand aus dem Publikum getippt …</p>"}` : "";
    if (s.phase === "frage") {
      const tel = s.tel !== null ? `<p class="mitte">📞 ${name(namen, s.tel)}${s.telTipp !== null ? ` meint: <b>${BUCH[s.telTipp]}</b>` : " überlegt …"}</p>` : "";
      if (kand) {
        const ant = `<div class="raster2">${q.a.map((t, k) => (s.weg.includes(k) ? `<button class="wahl" disabled>${BUCH[k]}: –</button>` : knopf(`${BUCH[k]}: ${esc(t)}`, { typ: "antwort", k }, "wahl gg-antwort"))).join("")}</div>`;
        const tels = !s.joker.tel ? `<details class="gg-tel"><summary>📞 Telefonjoker – wen anrufen?</summary><div class="raster">${namen.map((nm, j) => (j === ich ? "" : knopf(esc(nm), { typ: "tel", j }, "zweit"))).join("")}</div></details>` : "";
        const jk = `<div class="raster2">${s.joker.fifty ? "" : knopf("✂️ 50:50", { typ: "fifty" }, "zweit")}${s.joker.pub ? "" : knopf("👥 Publikum", { typ: "pub" }, "zweit")}</div>${tels}`;
        const sicher = `<p class="mitte leise">Sicher: ${euro(mioSicher(s.stufe))} · Aufhören: ${euro(s.stufe ? MIO_GELD[s.stufe - 1] : 0)}</p>`;
        return `${buehne}<div class="mio-flach">${kopf}${ant}</div>${pub}${tel}${jk}${knopf(`🛑 Aufhören mit ${euro(s.stufe ? MIO_GELD[s.stufe - 1] : 0)}`, { typ: "aufhoeren" }, "zweit")}${sicher}${regel}`;
      }
      if (ich === s.tel && s.telTipp === null) {
        return `${buehne}<p class="mitte">📞 <b>${esc(namen[s.kand])} ruft dich an!</b> Was meinst du?</p><div class="mio-flach">${kopf}
          <div class="raster2">${q.a.map((t, k) => (s.weg.includes(k) ? "" : knopf(`${BUCH[k]}: ${esc(t)}`, { typ: "teltipp", k }, "wahl"))).join("")}</div></div>${stand}`;
      }
      const meins = s.tipps[ich];
      return `${buehne}<div class="mio-flach">${kopf}<p class="mitte leise">Rate mit – ${esc(namen[s.kand])} sieht deinen Tipp nur über den Publikumsjoker.</p>
        <div class="raster2">${q.a.map((t, k) => (s.weg.includes(k) ? `<button class="wahl" disabled>${BUCH[k]}: –</button>` : knopf(`${BUCH[k]}: ${esc(t)}`, { typ: "tipp", k }, `wahl ${meins === k ? "gewaehlt" : ""}`))).join("")}</div></div>
        <p class="mitte leise mio-3d-nur">Rate mit – ${esc(namen[s.kand])} sieht deinen Tipp nur über den Publikumsjoker.</p>${pub}${tel}${stand}`;
    }
    const richtig = s.wahl === s.q.r;
    const urteil = s.phase === "aufgehoert" ? `🛑 ${name(namen, s.kand)} hört auf und nimmt <b>${euro(s.gewinn[s.kand])}</b> mit`
      : richtig ? (s.stufe === 14 ? `🎉 ${name(namen, s.kand)} ist MILLIONÄR!` : `✅ Richtig! ${euro(MIO_GELD[s.stufe])}`)
      : `❌ Leider falsch – ${name(namen, s.kand)} geht mit <b>${euro(s.gewinn[s.kand])}</b> nach Hause`;
    return `${buehne}<div class="mio-flach">${kopf}<div class="raster2">${q.a.map((t, k) => `<button class="wahl ${k === q.r ? "gewaehlt" : ""}" disabled>${k === q.r ? "✅" : k === s.wahl ? "❌" : ""} ${BUCH[k]}: ${esc(t)}</button>`).join("")}</div>
      <div class="urteil ${richtig ? "gut" : ""}">${urteil}</div></div><i hidden data-ergebnis="mio${s.runde}-${s.kand}-${s.stufe}"></i>
      ${knopf(richtig && s.stufe < 14 && s.phase === "aufgeloest" ? "Nächste Frage" : "Nächster Kandidat", { typ: "weiter" }, "gross")}${stand}`;
  },
  // nach dem Einsetzen: 3D-Buehne in den Kasten (bleibt ueber Neuzeichnungen erhalten). Tafel antippen = derselbe Knopf wie flach
  nach(s, ich, senden, namen) {
    const c = document.querySelector("#app [data-mio3d]");
    if (!c) return;
    const rolle = ich === s.kand ? "kand" : ich === s.tel && s.telTipp === null ? "tel" : ich < namen.length ? "tipp" : "zu";
    const waehlen = (typ, k) => {
      const kn = document.querySelector(`#app button[data-a='${JSON.stringify({ typ, k })}']`);
      if (kn && !kn.disabled) kn.click(); else if (!kn) senden({ typ, k });
    };
    try { mio3dZeigen(c, { ...mioAuszug(s), namen, ich, rolle, meinTipp: s.tipps ? s.tipps[ich] : null, waehlen, beamer: false, ton: true }); } catch (e) { console.error(e); }
  },
};
// an der Wand: 3D-Buehne in den Kasten aus mioHTML (beamer_spiele.js ruft das auf)
let mioWandNamen = [];
export function mioWandNach(el, d) {
  const c = el && el.querySelector("[data-mio3d-wand]");
  if (!c || !d) return;
  const inhalt = c.closest(".bm-inhalt") || el, ri = inhalt.getBoundingClientRect(), skala = inhalt.offsetHeight ? ri.height / inhalt.offsetHeight || 1 : 1;
  const oben = (c.getBoundingClientRect().top - ri.top) / skala;
  const h = Math.round(Math.max(window.innerHeight * 0.5, Math.min(window.innerHeight * 0.85, (inhalt.clientHeight || window.innerHeight) - oben - 30)));
  if (c.style.height !== `${h}px`) c.style.height = `${h}px`;
  try { const an = mio3dZeigen(c, { ...d, namen: mioWandNamen, ich: -1, rolle: "zu", beamer: true, ton: false }); c.closest(".bsmio") && c.closest(".bsmio").classList.toggle("mit-3d", !!an); } catch (e) { console.error(e); }
}

// Beamer: nur, was ohnehin alle sehen (Telefon-Tipp bleibt beim Kandidaten)
export function mioAuszug(s) {
  const auf = s.phase !== "frage";
  return { phase: s.phase, kand: s.kand, stufe: s.stufe, frage: s.q ? s.q.f : "", a: s.q ? s.q.a.slice() : [], weg: (s.weg || []).slice(), joker: { ...s.joker },
    richtig: auf && s.q ? s.q.r : null, wahl: s.wahl, gewinn: (s.gewinn || []).slice(), mit: (s.mit || []).slice(), getippt: Object.keys(s.tipps || {}).length };
}
let mioStilDa = false;
function mioStil() {
  if (mioStilDa || typeof document === "undefined") return;
  mioStilDa = true;
  document.head.insertAdjacentHTML("beforeend", `<style id="gg-mio-stil">
    .ggm{display:grid;grid-template-columns:3fr 1fr;gap:2vw;align-items:start}
    .ggm-frage{background:linear-gradient(#1e1b4b,#312e81);border:.3vw solid #a5b4fc;border-radius:3vw;padding:2vh 2vw;font-size:2.8vw;font-weight:800;text-align:center;color:#fff}
    .ggm-ant{display:grid;grid-template-columns:1fr 1fr;gap:1.2vw;margin-top:2vh}
    .ggm-ant div{background:#1e1b4b;border:.25vw solid #a5b4fc;border-radius:3vw;padding:1.4vh 1.5vw;font-size:2vw;color:#fff}
    .ggm-ant div.weg{opacity:.25}.ggm-ant div.gewaehlt{background:#d97706}.ggm-ant div.ok{background:#15803d}.ggm-ant div.falsch{background:#b91c1c}
    .ggm-ant b{color:#facc15;margin-right:.6vw}
    .ggm-leiter{display:flex;flex-direction:column;gap:.3vh;font-size:1.3vw;color:#fde68a}
    .ggm-leiter span{padding:.2vh .8vw;border-radius:.6vw}.ggm-leiter span.sicher{color:#fff;font-weight:800}
    .ggm-leiter span.an{background:#d97706;color:#fff;font-weight:800}.ggm-leiter span.fertig{opacity:.55}
    .ggm-joker{display:flex;gap:1vw;justify-content:center;margin-top:1.5vh;font-size:1.8vw}.ggm-joker span.weg{opacity:.25;text-decoration:line-through}
    .bsmio.mit-3d .ggm{display:none}
  </style>`);
}
export function mioHTML(d, nm, sp, kopf) {
  mioStil();
  mioWandNamen = nm.slice();
  const wer = esc(nm[d.kand] || "");
  const buehne = `<div class="t3d t3-wand" data-mio3d-wand></div>`;   // 3D-Buehne (09.11.2026); steht sie, weicht die flache Tafel (.bsmio.mit-3d)
  if (d.phase === "ende") {
    const tafel = nm.map((n, j) => [j, (d.gewinn || [])[j] || 0]).sort((x, y) => y[1] - x[1]);
    return `<div class="bsmio">${kopf(sp, "Alle waren dran")}${buehne}<div class="bm-pillen mitte">${tafel.map(([j, g]) => `<span class="bm-pille">${esc(nm[j] || "")}: ${euro(g)}</span>`).join("")}</div></div>`;
  }
  const ant = d.a.map((t, k) => {
    const kl = d.weg.includes(k) ? "weg" : d.richtig === k ? "ok" : d.richtig !== null && d.wahl === k ? "falsch" : "";
    return `<div class="${kl}"><b>${BUCH[k]}:</b>${d.weg.includes(k) ? "" : esc(t)}</div>`;
  }).join("");
  const leiter = MIO_GELD.map((g, k) => `<span class="${k === d.stufe ? "an" : ""} ${MIO_SICHER.includes(k) ? "sicher" : ""} ${k < d.stufe ? "fertig" : ""}">${k + 1} · ${euro(g)}</span>`).reverse().join("");
  const jk = `<div class="ggm-joker"><span class="${d.joker.fifty ? "weg" : ""}">✂️ 50:50</span><span class="${d.joker.pub ? "weg" : ""}">👥 Publikum</span><span class="${d.joker.tel ? "weg" : ""}">📞 Telefon</span></div>`;
  return `<div class="bsmio">${kopf(sp, `${wer} spielt um ${euro(MIO_GELD[d.stufe])} · ${d.getippt} raten mit`)}${buehne}
    <div class="ggm"><div><div class="ggm-frage">${esc(d.frage)}</div><div class="ggm-ant">${ant}</div>${jk}</div><div class="ggm-leiter">${leiter}</div></div></div>`;
}

// ================================================================ Wortkette
export const WK_ZEIT = 20000;
// Buchstaben vergleichbar machen: Umlaute wie Grundbuchstaben, nur a-z
export const wkSauber = (w) => String(w || "").toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "s").replace(/[^a-z]/g, "");
export const wkPasst = (vorher, wort) => !vorher || (wkSauber(wort)[0] || "") === wkSauber(vorher).slice(-1);
function wkWeiter(s, n, ab) {
  const lebt = offen(n).filter((j) => !s.raus[j]);
  if (lebt.length <= 1) { s.phase = "ende"; s.sieger = lebt[0] ?? null; return; }
  let j = ab; do { j = (j + 1) % n; } while (s.raus[j]);
  s.dran = j; s.bis = Date.now() + WK_ZEIT; s.phase = "zug";
}
export const wortkette = {
  id: "wortkette", name: "Wortkette", emoji: "🔗", farben: ["#0d9488", "#155e75"], kurz: "Reihum – nächstes Wort mit dem letzten Buchstaben",
  start: (namen) => ({ phase: "zug", dran: 0, kette: [], raus: namen.map(() => false), bis: Date.now() + WK_ZEIT, hinweis: null, stimmen: {}, sieger: null, runde: 1 }),
  ergebnis: (s) => (s.phase === "ende" && s.sieger !== null ? { nr: String(s.runde), sieger: [s.sieger] } : null),
  aktion(s, i, a, namen) {
    const n = namen.length;
    if (s.raus.length < n) s.raus = namen.map((_, j) => !!s.raus[j]);
    const letzt = s.kette[s.kette.length - 1];
    if (s.phase === "zug") {
      if (a.typ === "wort" && i === s.dran) {
        const w = String(a.wert || "").trim().slice(0, 30), sw = wkSauber(w);
        if (sw.length < 2) { s.hinweis = { i, t: "Bitte ein richtiges Wort eintippen." }; return; }
        if (letzt && !wkPasst(letzt.w, w)) { s.hinweis = { i, t: `Das Wort muss mit „${wkSauber(letzt.w).slice(-1).toUpperCase()}“ anfangen.` }; return; }
        if (s.kette.some((x) => wkSauber(x.w) === sw)) { s.hinweis = { i, t: "Das Wort gab es schon." }; return; }
        s.kette.push({ w, von: i }); s.hinweis = null; wkWeiter(s, n, i);
      } else if (a.typ === "aufgeben" && i === s.dran) { s.raus[i] = true; s.hinweis = null; wkWeiter(s, n, i); }
      else if (a.typ === "zeitum" && Date.now() >= s.bis) { s.raus[s.dran] = true; wkWeiter(s, n, s.dran); }
      else if (a.typ === "zweifel" && letzt && i !== letzt.von && !s.raus[i]) { s.phase = "abstimmung"; s.stimmen = {}; s.zweifler = i; }
    } else if (s.phase === "abstimmung" && a.typ === "stimme" && letzt && i !== letzt.von && !s.raus[i]) {
      s.stimmen[i] = !!a.gilt;
      const waehler = offen(n).filter((j) => !s.raus[j] && j !== letzt.von);
      if (waehler.every((j) => s.stimmen[j] !== undefined)) {
        const nein = waehler.filter((j) => !s.stimmen[j]).length;
        if (nein > waehler.length / 2) {   // Mehrheit: gilt nicht -> wer es gesagt hat, ist raus
          s.kette.pop(); s.raus[letzt.von] = true; s.urteil = { w: letzt.w, von: letzt.von, gilt: false }; wkWeiter(s, n, letzt.von);
        } else { s.urteil = { w: letzt.w, von: letzt.von, gilt: true }; s.phase = "zug"; s.bis = Date.now() + WK_ZEIT; }
      }
    } else if (a.typ === "neustart" && s.phase === "ende") Object.assign(s, wortkette.start(namen), { runde: (s.runde || 1) + 1 });
  },
  render(s, ich, namen) {
    const n = namen.length, letzt = s.kette[s.kette.length - 1];
    const kette = `<div class="gg-kette">${s.kette.slice(-8).map((x) => `<span>${esc(x.w)}</span>`).join(" → ") || "<span class='leise'>Noch kein Wort – fang mit irgendwas an!</span>"}</div>`;
    const leute = `<div class="punkte">${namen.map((nm, j) => `<span class="${s.raus[j] ? "leise" : ""}">${s.raus[j] ? "❌" : j === s.dran ? "👉" : "✅"} ${esc(nm)}</span>`).join("")}</div>`;
    const urteil = s.urteil ? `<p class="mitte klein3">Abstimmung über „${esc(s.urteil.w)}“: ${s.urteil.gilt ? "gilt ✅" : `gilt nicht – ${esc(namen[s.urteil.von])} ist raus ❌`}</p>` : "";
    if (s.phase === "ende") {
      return `${kette}<div class="urteil gut">🏆 ${s.sieger !== null ? `${name(namen, s.sieger)} gewinnt die Wortkette!` : "Keiner mehr übrig!"}</div>${leute}
        <p class="mitte leise">${s.kette.length} Wörter geschafft.</p>${knopf("Neue Runde", { typ: "neustart" }, "gross")}`;
    }
    if (s.phase === "abstimmung") {
      const waehler = offen(n).filter((j) => !s.raus[j] && j !== letzt.von), darf = waehler.includes(ich);
      return `${kette}<div class="frage">${name(namen, s.zweifler)} zweifelt an<br><span class="gross2">„${esc(letzt.w)}“</span></div>
        ${darf ? `<div class="raster2">${knopf("✅ Gilt", { typ: "stimme", gilt: true }, `gross blau ${s.stimmen[ich] === true ? "gewaehlt" : ""}`)}${knopf("❌ Gilt nicht", { typ: "stimme", gilt: false }, `gross rot ${s.stimmen[ich] === false ? "gewaehlt" : ""}`)}</div>`
          : `<p class="mitte leise">Die anderen stimmen ab …</p>`}
        <p class="mitte leise">${Object.keys(s.stimmen).length}/${waehler.length} haben abgestimmt</p>${leute}`;
    }
    const buch = letzt ? wkSauber(letzt.w).slice(-1).toUpperCase() : "";
    const zweifel = letzt && ich !== letzt.von && !s.raus[ich] ? knopf(`🤨 Zweifel an „${esc(letzt.w)}“`, { typ: "zweifel" }, "zweit") : "";
    const hinweis = s.hinweis && s.hinweis.i === ich ? `<p class="mitte rotk">${esc(s.hinweis.t)}</p>` : "";
    const regel = `<details class="grundregeln"><summary>📜 So geht's</summary><ul><li>Wer dran ist, tippt ein Wort, das mit dem letzten Buchstaben des vorigen anfängt.</li>
      <li>${WK_ZEIT / 1000} Sekunden Zeit. Kein Wort doppelt. Umlaute zählen wie a, o, u.</li><li>Zweifel? Dann stimmen alle anderen ab – gilt es nicht, ist der Sager raus.</li>
      <li>Wer keins findet, ist raus. Der Letzte gewinnt.</li></ul></details>`;
    const zeit = `<p class="mitte">⏱️ ${uhr(s.bis)}</p>${knopf("⏰ Zeit ist um", { typ: "zeitum" }, "zweit klein2")}`;
    if (ich === s.dran) {
      return `${kette}<div class="frage">Du bist dran${buch ? `: Wort mit <span class="gross2">${buch}</span>` : ""}</div>${zeit}
        <input id="gg-wort" maxlength="30" autocomplete="off" placeholder="Dein Wort">${hinweis}
        ${knopf("➡️ Wort abgeben", { typ: "wort" }, "gross", `data-feld="gg-wort" data-leeren="gg-wort"`)}${knopf("🏳️ Mir fällt nichts ein", { typ: "aufgeben" }, "zweit")}${urteil}${leute}${regel}`;
    }
    return `${kette}<div class="frage">${name(namen, s.dran)} sucht ein Wort${buch ? ` mit <b>${buch}</b>` : ""}</div>${zeit}${zweifel}${urteil}${leute}${regel}`;
  },
};

// ================================================================ Activity
export const ACT_ZEIT = 60000, ACT_ZIEL = 30;
export const ACT_ARTEN = [["erklaeren", "🗣️ Erklären"], ["zeichnen", "✏️ Zeichnen"], ["pantomime", "🤸 Pantomime"]];
export const TEAMS = ["Team Rot", "Team Blau"];
export const actTeam = (j) => j % 2;
// Darsteller abwechselnd aus beiden Teams, innerhalb des Teams reihum
function actNaechster(s, n) {
  const team = s.zug % 2, leute = offen(n).filter((j) => actTeam(j) === team);
  const ziel = leute.length ? leute : offen(n);
  s.dar = ziel[Math.floor(s.zug / 2) % ziel.length];
  s.art = ACT_ARTEN[s.zug % 3][0]; s.begriff = null; s.wert = null; s.phase = "wahl"; s.geschafft = null; s.striche = [];
}
export const actMalt = (s) => s.art === "zeichnen" && s.phase === "laeuft";
export const activity = {
  id: "activity", name: "Activity", emoji: "🎨", farben: ["#dc2626", "#2563eb"], kurz: "Erklären, Zeichnen, Pantomime – im Team raten",
  start(namen) { const s = { zug: 0, punkte: [0, 0], phase: "wahl", runde: 1 }; actNaechster(s, namen.length); return s; },
  ergebnis(s) {
    if (s.phase !== "ende") return null;
    const t = s.punkte[0] >= s.punkte[1] ? 0 : 1;
    return { nr: String(s.runde), sieger: s.anzahl ? offen(s.anzahl).filter((j) => actTeam(j) === t) : [] };
  },
  aktion(s, i, a, namen) {
    const n = namen.length; s.anzahl = n;
    if (a.typ === "wert" && s.phase === "wahl" && i === s.dar && ACTIVITY[a.w]) {
      const liste = ACTIVITY[a.w];
      s.wert = Number(a.w); s.begriff = liste[zieh(s, `a${a.w}`, liste.length)]; s.phase = "laeuft"; s.bis = Date.now() + ACT_ZEIT;
    } else if (a.typ === "strich" && actMalt(s) && i === s.dar && Array.isArray(a.pfad) && a.pfad.length < 400) {
      s.striche = s.striche || []; if (s.striche.length < 300) s.striche.push(a.pfad);   // Restpaket 3c: Zeichnen am Handy
    } else if (a.typ === "loeschen" && actMalt(s) && i === s.dar) { s.striche = []; }
    else if (a.typ === "erraten" && s.phase === "laeuft" && i === s.dar) {
      s.geschafft = true; s.punkte[actTeam(s.dar)] += s.wert; s.phase = "ergebnis";
    } else if (a.typ === "nicht" && s.phase === "laeuft" && (i === s.dar || Date.now() >= s.bis)) { s.geschafft = false; s.phase = "ergebnis"; }
    else if (a.typ === "weiter" && s.phase === "ergebnis") {
      if (s.punkte.some((p) => p >= ACT_ZIEL)) { s.phase = "ende"; return; }
      s.zug++; actNaechster(s, n);
    } else if (a.typ === "neustart" && s.phase === "ende") Object.assign(s, activity.start(namen), { runde: (s.runde || 1) + 1 });
  },
  render(s, ich, namen) {
    s.anzahl = namen.length;
    const artText = (ACT_ARTEN.find(([k]) => k === s.art) || ["", ""])[1];
    // Schritt 4b: Spielstand als Duell-Tafel - Rot gegen Blau, Fortschritt bis zum Ziel, Punkte zaehlen hoch
    const teams = `<div class="punkte act-teams">${TEAMS.map((t, k) => `<span class="act-team ${k ? "blau" : "rot"} ${actTeam(s.dar) === k && s.phase !== "ende" ? "am-zug" : ""}" style="--anteil:${Math.min(1, s.punkte[k] / ACT_ZIEL)}">${k ? "🔵" : "🔴"} ${t}: <b data-zahl="${s.punkte[k]}">${s.punkte[k]}</b>/${ACT_ZIEL} <small>(${namen.filter((_, j) => actTeam(j) === k).map(esc).join(", ") || "–"})</small></span>`).join("")}</div>`;
    const dar = s.dar === ich, team = TEAMS[actTeam(s.dar)];
    const regel = `<details class="grundregeln"><summary>📜 So geht's</summary><ul><li>Abwechselnd stellt jemand aus Team Rot und Team Blau dar.</li>
      <li>Den Begriff sieht nur die Person, die darstellt. Das eigene Team rät.</li><li>Erklären: das Wort selbst ist verboten. Zeichnen: keine Buchstaben. Pantomime: kein Ton.</li>
      <li>3, 4 oder 5 Punkte je nach Schwierigkeit, ${ACT_ZEIT / 1000} Sekunden Zeit. Wer zuerst ${ACT_ZIEL} hat, gewinnt.</li></ul></details>`;
    if (s.phase === "ende") {
      const t = s.punkte[0] >= s.punkte[1] ? 0 : 1;
      return `<div class="urteil gut">🏆 ${TEAMS[t]} gewinnt!</div>${teams}<i hidden data-ergebnis="act${s.runde}"></i>${knopf("Neue Runde", { typ: "neustart" }, "gross")}`;
    }
    const kopf = `<div class="frage">${name(namen, s.dar)} (${team}): <span class="gross2">${artText}</span></div>`;
    if (s.phase === "wahl") {
      return `${kopf}${dar ? `<p class="mitte">Wie schwer soll dein Begriff sein?</p><div class="raster">${[3, 4, 5].map((w) => knopf(`${w} Punkte`, { typ: "wert", w }, "gross")).join("")}</div>`
        : `<p class="mitte leise">${esc(namen[s.dar])} wählt die Schwierigkeit …</p>`}${teams}${regel}`;
    }
    if (s.phase === "laeuft") {
      const zeit = `<p class="mitte">⏱️ ${uhr(s.bis)} · ${s.wert} Punkte</p>`;
      // Zeichnen: Malflaeche am Handy des Darstellers, das Bild steht live am Beamer (und bei den anderen am Handy)
      const malt = actMalt(s);
      const flaeche = malt ? `<canvas id="leinwand" class="leinwand ${dar ? "aktiv" : ""}" width="600" height="600"></canvas>` : "";
      if (dar) {
        return `${kopf}${zeit}<div class="karte-gross blau" data-key="actb${s.zug || 0}-${esc(s.begriff)}" data-ton="karte"><small>DEIN BEGRIFF – nicht zeigen!</small><div>${esc(s.begriff)}</div></div>
          ${malt ? `${flaeche}<p class="mitte leise klein">Mit dem Finger malen – das Bild erscheint sofort am Beamer.</p>${knopf("Alles löschen", { typ: "loeschen" }, "zweit klein2")}` : ""}
          <div class="raster2">${knopf("✅ Erraten!", { typ: "erraten" }, "gross gruen")}${knopf("❌ Nicht geschafft", { typ: "nicht" }, "gross rot")}</div>${teams}`;
      }
      const rat = actTeam(ich) === actTeam(s.dar) ? "Dein Team rät – ruft laut!" : "Das andere Team rät – ihr schaut zu.";
      return `${kopf}${zeit}<p class="mitte">${rat}</p>${flaeche}${knopf("⏰ Zeit ist um", { typ: "nicht" }, "zweit klein2")}${teams}`;
    }
    return `${kopf}<div class="karte-gross ${s.geschafft ? "blau" : "rot"}"><small>Der Begriff war</small><div>${esc(s.begriff)}</div></div>
      <div class="urteil ${s.geschafft ? "gut" : ""}" data-key="actu${s.zug || 0}-${esc(s.begriff)}" data-ton="${s.geschafft ? "richtig" : "falsch"}">${s.geschafft ? `✅ ${team} bekommt ${s.wert} Punkte` : "❌ Nicht geschafft – keine Punkte"}</div>
      ${knopf("Weiter", { typ: "weiter" }, "gross")}${teams}`;
  },
  // Zeichnen: dieselbe Malflaeche wie Malen & Raten (Striche 0-100, Darsteller malt, alle anderen sehen zu)
  nach(s, ich, senden) {
    if (!actMalt(s) || typeof document === "undefined" || !document.getElementById("leinwand")) return;
    MALEN.nach({ striche: s.striche || [], maler: s.dar, geloest: null }, ich, senden);
  },
};

// ---- Activity an der Wand: Teams, wer dran ist; beim Zeichnen das Bild live. Den Begriff nie vor dem Ergebnis.
export function actAuszug(s, namen) {
  return { phase: s.phase, dar: s.dar, art: s.art, wert: s.wert, bis: s.bis || 0, punkte: s.punkte.slice(), n: namen.length, runde: s.runde,
    striche: actMalt(s) || (s.phase === "ergebnis" && s.art === "zeichnen") ? (s.striche || []).slice() : null,
    begriff: s.phase === "ergebnis" ? s.begriff : null, geschafft: s.geschafft };
}
export function actHTML(d, nm, sp, kopf) {
  const art = (ACT_ARTEN.find(([k]) => k === d.art) || ["", ""])[1], team = TEAMS[actTeam(d.dar)];
  const teams = `<div class="bm-pillen mitte">${TEAMS.map((t, k) => `<span class="bm-pille" style="font-size:2.4vw">${k ? "🔵" : "🔴"} ${t}: <b>${d.punkte[k]}</b> / ${ACT_ZIEL}</span>`).join("")}</div>`;
  if (d.phase === "ende") return `<div class="bsact">${kopf(sp, "Spielende")}<div class="bs-sieg">🏆 ${TEAMS[d.punkte[0] >= d.punkte[1] ? 0 : 1]} gewinnt!</div>${teams}</div>`;
  const wer = `${esc(nm[d.dar] || "")} (${team})`;
  let info;
  if (d.phase === "wahl") info = `<p class="bm-gross">${wer} ist dran: ${art}</p><p class="bm-leise">wählt gerade die Schwierigkeit …</p>`;
  else if (d.phase === "laeuft") info = `<p class="bm-gross">${wer}: ${art}</p><p class="bm-zeile">⏱️ <b data-bsek="${d.bis}" data-bende="⏰ Zeit um!"></b> · ${d.wert} Punkte · ${team} rät</p>`;
  else info = `<p class="bm-zeile">Der Begriff war</p><p class="bm-gross">${esc(d.begriff || "")}</p><div class="bs-sieg">${d.geschafft ? `✅ ${team} bekommt ${d.wert} Punkte` : "❌ Nicht geschafft"}</div>`;
  const bild = d.striche ? `<div class="bsm-blatt"><canvas class="bsm-lw" width="900" height="900" data-bs-leinwand data-striche="${d.striche.length}"></canvas></div>` : "";
  return `<div class="bsact">${kopf(sp, `Runde ${d.runde}`)}${bild ? `<div class="bsm-reihe">${bild}<div class="bsm-text">${info}</div></div>` : `<div class="mitte">${info}</div>`}${teams}</div>`;
}

// ================================================================ Bilderraetsel und Quiz "Damals" (gleicher Ablauf)
export const QR_ANZAHL = 10;
// Bilderraetsel als Frage: drei falsche Loesungen moeglichst aus derselben Kategorie
export function bildFrage(k) {
  const [emo, los, kat] = BILDER[k];
  const gleich = BILDER.filter((b, j) => j !== k && b[2] === kat).map((b) => b[1]);
  const sonst = BILDER.filter((b, j) => j !== k && b[2] !== kat).map((b) => b[1]);
  const falsch = [...mischen(gleich), ...mischen(sonst)].slice(0, 3);
  return [emo, los, ...falsch];
}
function quizSpiel({ id, name: nm, emoji, farben, kurz, liste, frage, gross }) {
  const neu = (s) => { s.nr++; s.q = mischFrage(frage(zieh(s, "q", liste.length))); s.antw = {}; s.phase = "frage"; s.seit = Date.now(); };
  const sp = {
    id, name: nm, emoji, farben, kurz,
    start(namen) { const s = { nr: 0, punkte: namen.map(() => 0), runde: 1 }; neu(s); return s; },
    ergebnis(s) {
      if (s.phase !== "ende") return null;
      const max = Math.max(...s.punkte);
      return max > 0 ? { nr: String(s.runde), sieger: s.punkte.map((p, j) => (p === max ? j : -1)).filter((j) => j >= 0) } : null;
    },
    aktion(s, i, a, namen) {
      const n = namen.length;
      if (s.punkte.length < n) s.punkte = namen.map((_, j) => s.punkte[j] || 0);
      if (a.typ === "antwort" && s.phase === "frage" && s.antw[i] === undefined && a.k >= 0 && a.k < 4) {
        s.antw[i] = { k: a.k, o: Object.keys(s.antw).length };   // Reihenfolge des Eingangs beim Gastgeber
        if (Object.keys(s.antw).length >= n) sp.aufloesen(s);
      } else if (a.typ === "aufloesen" && s.phase === "frage") sp.aufloesen(s);
      else if (a.typ === "weiter" && s.phase === "aufloesung") { if (s.nr >= QR_ANZAHL) s.phase = "ende"; else neu(s); }
      else if (a.typ === "neustart" && s.phase === "ende") Object.assign(s, sp.start(namen), { runde: (s.runde || 1) + 1 });
    },
    aufloesen(s) {
      const gut = Object.entries(s.antw).filter(([, x]) => x.k === s.q.r).sort((x, y) => x[1].o - y[1].o).map(([j]) => Number(j));
      gut.forEach((j, r) => { s.punkte[j] = (s.punkte[j] || 0) + (r === 0 ? 2 : 1); });
      s.erster = gut.length ? gut[0] : null; s.phase = "aufloesung";
    },
    render(s, ich, namen) {
      const stand = `<div class="punkte">${namen.map((x, j) => `<span>${esc(x)}: ${s.punkte[j] || 0}</span>`).join("")}</div>`;
      if (s.phase === "ende") {
        const max = Math.max(...s.punkte), sieger = namen.map((_, j) => j).filter((j) => s.punkte[j] === max && max > 0);
        return `<div class="urteil gut">🏆 ${sieger.length ? sieger.map((j) => name(namen, j)).join(" & ") : "Niemand"} ${sieger.length > 1 ? "gewinnen" : "gewinnt"}!</div>${stand}
          <i hidden data-ergebnis="${id}${s.runde}"></i>${knopf("Neue Runde", { typ: "neustart" }, "gross")}`;
      }
      const kopf = `<p class="mitte leise">Frage ${s.nr} von ${QR_ANZAHL}</p><div class="frage">${gross ? `<span class="gg-emoji">${esc(s.q.f)}</span>` : esc(s.q.f)}</div>`;
      if (s.phase === "frage") {
        const meins = s.antw[ich];
        return `${kopf}<div class="raster2">${s.q.a.map((t, k) => knopf(`${BUCH[k]}: ${esc(t)}`, { typ: "antwort", k }, `wahl ${meins && meins.k === k ? "gewaehlt" : ""}`, meins ? "disabled" : "")).join("")}</div>
          <p class="mitte leise">${meins ? "Abgegeben – warte auf die anderen" : "Wer zuerst richtig tippt, bekommt 2 Punkte, alle anderen Richtigen 1"} (${Object.keys(s.antw).length}/${namen.length})</p>
          ${knopf("Auflösen", { typ: "aufloesen" }, "zweit klein2")}${stand}`;
      }
      return `${kopf}<div class="raster2">${s.q.a.map((t, k) => `<button class="wahl ${k === s.q.r ? "gewaehlt" : ""}" disabled>${k === s.q.r ? "✅ " : ""}${BUCH[k]}: ${esc(t)}</button>`).join("")}</div>
        <i hidden data-ergebnis="${id}${s.runde}-${s.nr}"></i><div class="urteil ${s.erster !== null ? "gut" : ""}">${s.erster !== null ? `⚡ ${name(namen, s.erster)} war am schnellsten richtig` : "Diesmal lag niemand richtig"}</div>
        ${knopf(s.nr >= QR_ANZAHL ? "Zum Ergebnis" : "Nächste Frage", { typ: "weiter" }, "gross")}${stand}`;
    },
  };
  return sp;
}
export const bilder = quizSpiel({ id: "bilder", name: "Bilderrätsel", emoji: "🧩", farben: ["#f59e0b", "#be185d"], kurz: "Emoji-Rätsel: Film, Sprichwort, Märchen …",
  liste: BILDER, frage: bildFrage, gross: true });
export const damals = quizSpiel({ id: "damals", name: "Quiz „Damals“", emoji: "📼", farben: ["#a855f7", "#0ea5e9"], kurz: "90er und 2000er – weißt du's noch?",
  liste: DAMALS, frage: (k) => DAMALS[k] });

// Stil fuers Handy (einmal)
if (typeof document !== "undefined" && !document.getElementById("gg-stil")) {
  document.head.insertAdjacentHTML("beforeend", `<style id="gg-stil">
    .gg-antwort,.gg-kette{overflow-wrap:anywhere}.gg-kette{text-align:center;margin:.5em 0;line-height:1.6}
    .gg-kette span{display:inline-block;padding:1px 8px;border-radius:8px;background:#ffffff1a}
    .gg-emoji{font-size:2.6em;line-height:1.2;display:block}#gg-wort{width:100%;box-sizing:border-box;font-size:1.2em;padding:.5em}
  </style>`);
}
export const GRUPPENSPIELE = [millionaer, wortkette, activity, bilder, damals];
