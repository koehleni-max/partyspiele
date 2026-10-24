// Gemeinschaftsspiele ohne Trinkzwang: Begriffe erklaeren, Pantomime, Wer bin ich, Spion, Stadt-Land-Fluss, Quiz-Duell.
import { spiele as klang } from "./ton.js";
import { esc, knopf, zufall, mischen, name } from "./hilfe.js";
import { BEGRIFFE, PANTOMIME, FIGUREN, ORTE, SLF_KAT, QUIZ } from "./inhalte2.js";

const punkteTafel = (namen, punkte) => `<div class="tafel">${namen.map((nm, j) => `<div><span class="farbe f${j}"></span><b>${esc(nm)}</b><span>🏅 ${punkte[j] || 0}</span></div>`).join("")}</div>`;
function stapelZiehen(s, liste) {
  if (!s.rest || !s.rest.length) s.rest = mischen(liste.map((_, i) => i));
  return s.rest.pop();
}

// lokaler Countdown, je Handy selbst gezaehlt (keine Uhren-Abgleiche noetig)
const uhren = {};
function countdown(schluessel, sekunden, beiEnde) {
  if (!uhren[schluessel]) uhren[schluessel] = { ende: performance.now() + sekunden * 1000, gemeldet: false };
  const u = uhren[schluessel];
  const zeichne = () => {
    const rest = Math.max(0, Math.ceil((u.ende - performance.now()) / 1000));
    document.querySelectorAll(`[data-uhr="${schluessel}"]`).forEach((el) => { el.textContent = `⏱️ ${rest}`; el.classList.toggle("knapp", rest <= 10); });
    if (rest > 0 && rest <= 5 && u.tick !== rest) { u.tick = rest; klang("tick"); }
    if (rest <= 0 && !u.gong) { u.gong = true; klang("gong"); }
    if (rest <= 0) { if (!u.gemeldet && beiEnde) { u.gemeldet = true; beiEnde(); } return; }
    requestAnimationFrame(() => setTimeout(zeichne, 200));
  };
  if (!u.laeuft) { u.laeuft = true; zeichne(); } else {
    const rest = Math.max(0, Math.ceil((u.ende - performance.now()) / 1000));
    document.querySelectorAll(`[data-uhr="${schluessel}"]`).forEach((el) => (el.textContent = `⏱️ ${rest}`));
  }
}

// ================================================================ Begriffe erklaeren / Pantomime
function erklaerSpiel(id, titel, emoji, kurz, farben, liste, mitVerboten, sekunden) {
  const spiel = {
    id, name: titel, emoji, kurz, farben,
    start: (namen) => ({ dran: 0, phase: "bereit", punkte: namen.map(() => 0), runde: 0, wort: null, geschafft: 0 }),
    aktion(s, i, a, namen) {
      if (a.typ === "start" && i === s.dran && s.phase === "bereit") { s.phase = "laeuft"; s.runde++; s.geschafft = 0; s.wort = stapelZiehen(s, liste); }
      else if (s.phase === "laeuft" && i === s.dran) {
        if (a.typ === "richtig") { s.punkte[i]++; if (a.wer !== undefined && a.wer !== i) s.punkte[a.wer]++; s.geschafft++; s.wort = stapelZiehen(s, liste); }
        if (a.typ === "skip") s.wort = stapelZiehen(s, liste);
        if (a.typ === "verboten") { s.punkte[i] = Math.max(0, s.punkte[i] - 1); s.wort = stapelZiehen(s, liste); }
        if (a.typ === "zeit") { s.phase = "pause"; }
      } else if (a.typ === "weiter" && s.phase === "pause") { s.dran = (s.dran + 1) % namen.length; s.phase = "bereit"; }
    },
    render(s, ich, namen) {
      const istDran = ich === s.dran;
      const tafel = punkteTafel(namen, s.punkte);
      if (s.phase === "bereit") return `${tafel}<div class="frage">${name(namen, s.dran)} ist dran mit ${mitVerboten ? "Erklären" : "Vorspielen"}</div>
        <p class="mitte leise">${sekunden} Sekunden. Die anderen raten laut. Wer richtig rät, bekommt auch einen Punkt.</p>
        ${istDran ? knopf("▶️ Los – Zeit starten", { typ: "start" }, "gross gruen") : `<div class="hinweisbox warten">${esc(namen[s.dran])} startet gleich …</div>`}`;
      if (s.phase === "pause") return `${tafel}<div class="urteil gut">⏰ Zeit um! ${esc(namen[s.dran])} hat ${s.geschafft} Begriff${s.geschafft === 1 ? "" : "e"} geschafft.</div>
        ${knopf("Nächster Spieler ➜", { typ: "weiter" }, "gross")}`;
      const uhr = `<div class="uhr" data-uhr="${id}-${s.runde}">⏱️ ${sekunden}</div>`;
      if (!istDran) return `${tafel}${uhr}<div class="fragekarte" style="--k1:${farben[0]};--k2:${farben[1]}"><div class="vor">${esc(namen[s.dran])} ${mitVerboten ? "erklärt" : "spielt vor"}</div>
        <div class="text">Ratet laut mit! 🗣️</div></div><p class="mitte leise">Geschafft: ${s.geschafft}</p>`;
      const w = liste[s.wort];
      const [wort, ...verboten] = Array.isArray(w) ? w : [w];
      return `${tafel}${uhr}<div class="fragekarte" data-key="${esc(wort)}" style="--k1:${farben[0]};--k2:${farben[1]}"><div class="vor">${mitVerboten ? "Erkläre ohne die roten Wörter:" : "Spiel vor – ohne Worte:"}</div>
        <div class="text">${esc(wort)}</div>${verboten.length ? `<div class="verboten">${verboten.map((v) => `<span>${esc(v)}</span>`).join("")}</div>` : ""}</div>
        <p class="mitte leise">Wer hat's erraten?</p>
        <div class="raster">${namen.map((nm, j) => (j === ich ? "" : knopf(`✅ ${esc(nm)}`, { typ: "richtig", wer: j }, "gruen"))).join("")}</div>
        <div class="raster2" style="margin-top:10px">${knopf("⏭️ Überspringen", { typ: "skip" })}${mitVerboten ? knopf("⛔ Verbotenes Wort", { typ: "verboten" }, "rot") : knopf("✅ Richtig", { typ: "richtig" }, "gruen")}</div>`;
    },
    nach(s, ich, senden) {
      if (s.phase === "laeuft") countdown(`${id}-${s.runde}`, sekunden, ich === s.dran ? () => senden({ typ: "zeit" }) : null);
    },
  };
  return spiel;
}
export const begriffe = erklaerSpiel("begriffe", "Begriffe-Rallye", "🗣️", "Erklären ohne die verbotenen Wörter – 60 Sekunden", ["#00b894", "#0a5e57"], BEGRIFFE, true, 60);
export const pantomime = erklaerSpiel("pantomime", "Pantomime", "🤹", "Vorspielen ohne Worte – die anderen raten", ["#fd79a8", "#8e2d6b"], PANTOMIME, false, 60);

// ================================================================ Wer bin ich?
export const werbinich = {
  id: "werbinich", name: "Wer bin ich?", emoji: "🎭", kurz: "Alle sehen deine Figur – nur du nicht. Ja/Nein-Fragen stellen!", farben: ["#a29bfe", "#4834d4"],
  start: (namen) => { const f = mischen(FIGUREN.map((_, i) => i)).slice(0, namen.length); return { figur: f, erraten: namen.map(() => 0), dran: 0, nr: 0 }; },
  aktion(s, i, a, namen) {
    if (a.typ === "erraten" && !s.erraten[i]) { s.nr++; s.erraten[i] = s.nr; }
    if (a.typ === "naechster") s.dran = (s.dran + 1) % namen.length;
    if (a.typ === "neu") Object.assign(s, werbinich.start(namen));
  },
  render(s, ich, namen) {
    const alle = s.erraten.every((x) => x);
    return `<div class="frage">${name(namen, s.dran)} stellt eine Ja/Nein-Frage über sich</div>
      <div class="figurenliste">${namen.map((nm, j) => `<div class="figurkarte ${j === ich ? "ich" : ""} ${s.erraten[j] ? "geschafft" : ""}">
        <small>${esc(nm)}${j === ich ? " (du)" : ""}</small><b>${j === ich && !s.erraten[j] ? "❓ ??? ❓" : esc(FIGUREN[s.figur[j]])}</b>${s.erraten[j] ? `<em>#${s.erraten[j]} erraten</em>` : ""}</div>`).join("")}</div>
      ${!s.erraten[ich] ? knopf("🎉 Ich weiß, wer ich bin!", { typ: "erraten" }, "gross gruen") : ""}
      ${knopf("➜ Nächster fragt", { typ: "naechster" }, "zweit")}
      ${alle ? `<div class="urteil">🏆 Alle erraten! Sieger: ${name(namen, s.erraten.indexOf(1))}</div>${knopf("Neue Figuren", { typ: "neu" }, "gross")}` : ""}
      <p class="mitte leise klein">Tipp: Wer mit „Nein“ antwortet bekommt, ist der Nächste dran.</p>`;
  },
};

// ================================================================ Spion
export const spion = {
  id: "spion", name: "Der Spion", emoji: "🕵️", kurz: "Alle kennen den Ort – bis auf einen. Findet den Spion!", farben: ["#2d3436", "#6c5ce7"],
  start: (namen) => ({ ort: zufall(ORTE.length), spion: zufall(namen.length), phase: "fragen", runde: Date.now() % 100000, stimmen: {}, tipp: null }),
  aktion(s, i, a, namen) {
    if (a.typ === "abstimmen" && s.phase === "fragen") s.phase = "wahl";
    if (a.typ === "stimme" && s.phase === "wahl") { s.stimmen[i] = a.ziel; if (Object.keys(s.stimmen).length >= namen.length) s.phase = "aufloesung"; }
    if (a.typ === "ortraten" && i === s.spion && s.phase !== "ende") { s.tipp = a.ort; s.phase = "ende"; }
    if (a.typ === "aufloesen" && s.phase === "aufloesung") s.phase = "ende";
    if (a.typ === "neu") Object.assign(s, spion.start(namen));
  },
  render(s, ich, namen) {
    const binSpion = ich === s.spion;
    const karteHtml = binSpion
      ? `<div class="fragekarte" style="--k1:#d63031;--k2:#4a0d0d"><div class="vor">Du bist …</div><div class="text">🕵️ DER SPION</div><div class="vor">Finde heraus, wo ihr seid – ohne aufzufliegen!</div></div>`
      : `<div class="fragekarte" style="--k1:#00b894;--k2:#0a5e57"><div class="vor">Ihr seid alle hier:</div><div class="text">📍 ${esc(ORTE[s.ort])}</div><div class="vor">Einer von euch weiß es nicht …</div></div>`;
    const verdeckt = `<details class="verdeckt"><summary>👁️ Antippen zum Ansehen (Handy abschirmen!)</summary>${karteHtml}</details>`;
    if (s.phase === "fragen") return `${verdeckt}<div class="uhr" data-uhr="spion-${s.runde}">⏱️ 360</div>
      <p class="mitte">Reihum stellt jeder jemandem eine Frage zum Ort. Nicht zu deutlich – sonst weiß der Spion Bescheid!</p>
      ${knopf("🗳️ Jetzt abstimmen", { typ: "abstimmen" }, "gross")}
      ${binSpion ? `<details class="grundregeln"><summary>🕵️ Ort raten (beendet das Spiel)</summary><div class="raster">${ORTE.map((o, k) => knopf(esc(o), { typ: "ortraten", ort: k }, "klein2")).join("")}</div></details>` : ""}`;
    if (s.phase === "wahl") return `${verdeckt}<div class="frage">Wer ist der Spion?</div>
      <div class="raster">${namen.map((nm, j) => (j === ich ? "" : knopf(esc(nm), { typ: "stimme", ziel: j }, `wahl ${s.stimmen[ich] === j ? "gewaehlt" : ""}`))).join("")}</div>
      <p class="mitte leise">${Object.keys(s.stimmen).length}/${namen.length} abgestimmt</p>`;
    const zaehl = namen.map((_, j) => Object.values(s.stimmen).filter((z) => z === j).length);
    const verdacht = zaehl.indexOf(Math.max(...zaehl));
    let ergebnis;
    if (s.tipp !== null) ergebnis = s.tipp === s.ort ? `🕵️ ${name(namen, s.spion)} hat den Ort erraten – der Spion gewinnt!` : `🕵️ ${name(namen, s.spion)} hat falsch geraten – die anderen gewinnen!`;
    else ergebnis = verdacht === s.spion ? `🎉 Erwischt! ${name(namen, s.spion)} war der Spion – das Dorf gewinnt!` : `😈 Falsch verdächtigt! ${name(namen, s.spion)} war der Spion und gewinnt!`;
    return `<div class="urteil">${ergebnis}</div><p class="mitte">Der Ort war: <b>${esc(ORTE[s.ort])}</b></p>${knopf("Neue Runde", { typ: "neu" }, "gross")}`;
  },
  nach(s) { if (s.phase === "fragen") countdown(`spion-${s.runde}`, 360, null); },
};

// ================================================================ Stadt-Land-Fluss
const BUCHSTABEN = "ABDEFGHIKLMNOPRSTUVW";
const norm = (t) => String(t || "").trim().toLowerCase().replace(/\s+/g, " ");
export const slf = {
  id: "slf", name: "Stadt-Land-Fluss", emoji: "✏️", kurz: "Ein Buchstabe, sechs Kategorien – wer zuerst fertig ist, ruft Stopp", farben: ["#fdcb6e", "#e17055"],
  start: (namen) => ({ runde: 0, phase: "bereit", punkte: namen.map(() => 0) }),
  aktion(s, i, a, namen) {
    if (a.typ === "start" && (s.phase === "bereit" || s.phase === "wertung")) {
      s.runde++; s.phase = "schreiben"; s.buchstabe = BUCHSTABEN[zufall(BUCHSTABEN.length)]; s.kats = mischen([...SLF_KAT]).slice(0, 6); s.antworten = {}; s.stopp = null;
    } else if (a.typ === "stopp" && s.phase === "schreiben") { s.phase = "stopp"; s.stopp = i; s.antworten[i] = a.liste; }
    else if (a.typ === "abgabe" && (s.phase === "schreiben" || s.phase === "stopp") && !s.antworten[i]) {
      s.antworten[i] = a.liste;
      if (Object.keys(s.antworten).length >= namen.length) {
        s.phase = "wertung"; s.wertung = {};
        s.kats.forEach((_, k) => {
          const werte = namen.map((_, j) => norm((s.antworten[j] || [])[k]));
          namen.forEach((_, j) => {
            const w = werte[j];
            const ok = w && w[0] === s.buchstabe.toLowerCase();
            const p = !ok ? 0 : werte.filter((x) => x === w).length > 1 ? 5 : 10;
            s.wertung[`${j}-${k}`] = p; s.punkte[j] += p;
          });
        });
      }
    }
  },
  render(s, ich, namen) {
    const tafel = punkteTafel(namen, s.punkte);
    if (s.phase === "bereit") return `${tafel}<p class="mitte">Gleich wird ein Buchstabe gezogen. Schreibt zu jeder Kategorie ein Wort mit diesem Anfangsbuchstaben.</p>${knopf("🎲 Buchstaben ziehen", { typ: "start" }, "gross")}`;
    if (s.phase === "wertung") return `${tafel}<div class="frage">Buchstabe <span class="buchstabe">${s.buchstabe}</span></div>
      <div class="slf-tabelle"><table><tr><th></th>${namen.map((n) => `<th>${esc(n)}</th>`).join("")}</tr>
      ${s.kats.map((k, ki) => `<tr><td><b>${esc(k)}</b></td>${namen.map((_, j) => `<td>${esc((s.antworten[j] || [])[ki] || "–")}<small>${s.wertung[`${j}-${ki}`]}</small></td>`).join("")}</tr>`).join("")}</table></div>
      <p class="mitte leise klein">10 Punkte = einzigartig, 5 = doppelt, 0 = leer oder falscher Buchstabe</p>${knopf("Nächste Runde ➜", { typ: "start" }, "gross")}`;
    const fertig = !!s.antworten[ich];
    return `${tafel}<div class="frage">Buchstabe <span class="buchstabe" data-key="b${s.runde}">${s.buchstabe}</span></div>
      ${s.phase === "stopp" ? `<div class="urteil">✋ STOPP! ${esc(namen[s.stopp])} ist fertig – Stifte weg!</div>` : ""}
      ${fertig ? `<div class="hinweisbox warten">Abgegeben – warte auf die anderen</div>` : `<div class="slf-felder">${s.kats.map((k, ki) => `<label>${esc(k)}<input id="slf${ki}" autocomplete="off" placeholder="${s.buchstabe}…"></label>`).join("")}</div>
      <button class="gross rot" id="slf-stopp">✋ Fertig – STOPP!</button>`}`;
  },
  nach(s, ich, senden) {
    if (s.phase !== "schreiben" && s.phase !== "stopp") return;
    const liste = () => s.kats.map((_, k) => { const f = document.getElementById(`slf${k}`); return f ? f.value : ""; });
    // Eingaben ueber Neuzeichnungen retten
    window.__slf = window.__slf || {};
    s.kats.forEach((_, k) => { const f = document.getElementById(`slf${k}`); if (!f) return; const key = `${s.runde}-${k}`; if (window.__slf[key]) f.value = window.__slf[key]; f.oninput = () => (window.__slf[key] = f.value); });
    const b = document.getElementById("slf-stopp");
    if (b) b.onclick = () => senden({ typ: "stopp", liste: liste() });
    if (s.phase === "stopp" && !s.antworten[ich]) setTimeout(() => senden({ typ: "abgabe", liste: liste() }), 2500);
  },
};

// ================================================================ Quiz-Duell
export const quiz = {
  id: "quiz", name: "Quiz-Duell", emoji: "🧠", kurz: "Alle antworten gleichzeitig – schnell und richtig gibt Punkte", farben: ["#0984e3", "#2d1e8a"],
  start: (namen) => { const s = { nr: 0, punkte: namen.map(() => 0), antworten: {}, phase: "frage" }; s.frage = stapelZiehen(s, QUIZ); s.reihe = mischen([0, 1, 2, 3]); return s; },
  botPause: () => 4500,
  bot(s, i) {
    if (s.phase !== "frage" || s.antworten[i] !== undefined) return null;
    const w = Math.random() < 0.55 ? 0 : 1 + Math.floor(Math.random() * 3);
    return { typ: "antwort", w, ms: 2500 + Math.floor(Math.random() * 7000) };
  },
  aktion(s, i, a, namen) {
    if (a.typ === "antwort" && s.phase === "frage" && s.antworten[i] === undefined) {
      s.antworten[i] = { w: a.w, ms: Number(a.ms) || 9999 };
      if (Object.keys(s.antworten).length >= namen.length) {
        s.phase = "aufloesung";
        const richtige = Object.entries(s.antworten).filter(([, x]) => x.w === 0).sort((x, y) => x[1].ms - y[1].ms);
        richtige.forEach(([j], p) => (s.punkte[j] += p === 0 ? 3 : 2));
      }
    } else if (a.typ === "weiter" && s.phase === "aufloesung") {
      s.nr++; s.antworten = {}; s.phase = "frage"; s.frage = stapelZiehen(s, QUIZ); s.reihe = mischen([0, 1, 2, 3]);
    }
  },
  render(s, ich, namen) {
    const q = QUIZ[s.frage];
    const tafel = punkteTafel(namen, s.punkte);
    const knoepfe = s.reihe.map((k) => {
      let kl = "quizknopf";
      if (s.phase === "aufloesung") kl += k === 0 ? " richtig" : s.antworten[ich] && s.antworten[ich].w === k ? " falsch" : " aus";
      else if (s.antworten[ich] && s.antworten[ich].w === k) kl += " gewaehlt";
      const wer = s.phase === "aufloesung" ? namen.map((n, j) => (s.antworten[j] && s.antworten[j].w === k ? `<i class="farbe f${j}"></i>` : "")).join("") : "";
      return `<button class="${kl}" ${s.phase === "frage" && s.antworten[ich] === undefined ? `data-quiz="${k}"` : ""}>${esc(q[1 + k])}<span>${wer}</span></button>`;
    }).join("");
    return `${tafel}<div class="fragekarte" data-key="q${s.nr}" style="--k1:#0984e3;--k2:#2d1e8a"><span class="kat">Frage ${s.nr + 1}</span><div class="text" style="font-size:21px">${esc(q[0])}</div></div>
      <div class="quizraster">${knoepfe}</div>
      ${s.phase === "aufloesung" ? `<i hidden data-key="qa${s.nr}" data-ton="${s.antworten[ich] && s.antworten[ich].w === 0 ? "richtig" : "falsch"}"></i>` : ""}
      ${s.phase === "aufloesung" ? knopf("Nächste Frage ➜", { typ: "weiter" }, "gross") : `<p class="mitte leise">${Object.keys(s.antworten).length}/${namen.length} haben geantwortet</p>`}`;
  },
  nach(s, ich, senden) {
    window.__quiz = window.__quiz || {};
    if (!window.__quiz[s.nr]) window.__quiz[s.nr] = performance.now();
    document.querySelectorAll("[data-quiz]").forEach((b) => (b.onclick = () => senden({ typ: "antwort", w: Number(b.dataset.quiz), ms: Math.round(performance.now() - window.__quiz[s.nr]) })));
  },
};

export const ELTERNSPIELE = [begriffe, pantomime, quiz, werbinich, spion, slf];
