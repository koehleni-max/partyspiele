// Farbchaos - eigenes Ablegespiel in der Art der bekannten Farb-Kartenspiele, mit Extrem-Regeln:
// +2/+4 stapeln, die 7 tauscht Haende, die 0 laesst alle Haende weiterwandern, Strafkarten = Schlucke.
import { esc, knopf, mischen } from "./hilfe.js";

const FARBEN = ["rot", "gelb", "gruen", "blau"];
const FARBNAME = { rot: "Rot", gelb: "Gelb", gruen: "Grün", blau: "Blau" };
const SYMBOL = { aus: "⊘", dreh: "⇄", p2: "+2", wahl: "★", p4: "+4" };

function neuesDeck() {
  const d = [];
  for (const f of FARBEN) {
    d.push({ f, w: 0 });
    for (let n = 1; n <= 9; n++) d.push({ f, w: n }, { f, w: n });
    for (const s of ["aus", "dreh", "p2"]) d.push({ f, w: s }, { f, w: s });
  }
  for (let i = 0; i < 4; i++) d.push({ f: "schwarz", w: "wahl" }, { f: "schwarz", w: "p4" });
  return mischen(d);
}

const anzeige = (k) => (typeof k.w === "number" ? String(k.w) : SYMBOL[k.w]);
const karteHtml = (k, extra = "") => `<span class="fc ${k.f} ${extra}">${anzeige(k)}</span>`;

function ziehen(s, n) {
  const neu = [];
  for (let i = 0; i < n; i++) {
    if (!s.stapel.length) {
      const oben = s.ablage.pop();
      s.stapel = mischen(s.ablage.map((k) => (k.f === "schwarz" || k.gewaehlt ? { f: "schwarz", w: k.w } : k)));
      s.ablage = [oben];
      if (!s.stapel.length) break;
    }
    neu.push(s.stapel.pop());
  }
  return neu;
}

function weiter(s, schritte = 1) {
  const n = s.haende.length;
  s.dran = (((s.dran + s.richtung * schritte) % n) + n) % n;
  s.gezogen = false;
}

function spielbar(s, k) {
  const oben = s.ablage[s.ablage.length - 1];
  if (s.strafe > 0) return (k.w === "p2" && oben.w === "p2") || k.w === "p4";
  if (k.f === "schwarz") return true;
  return k.f === s.farbe || k.w === oben.w;
}

export const farbchaos = {
  id: "farbchaos", name: "Farbchaos Extrem", emoji: "🌈", kurz: "Ablegen nach Farbe oder Zahl – mit Stapeln, Tauschen, Schlucken",
  start(namen) {
    const s = { stapel: neuesDeck(), ablage: [], haende: [], dran: 0, richtung: 1, strafe: 0, farbe: null,
      warte: null, gerufen: {}, gezogen: false, sieger: null, meldung: "Los geht's!" };
    s.haende = namen.map(() => ziehen(s, 7));
    let erste;
    do { erste = s.stapel.pop(); if (typeof erste.w !== "number") s.stapel.unshift(erste); } while (typeof erste.w !== "number");
    s.ablage.push(erste); s.farbe = erste.f;
    return s;
  },

  aktion(s, i, a, namen) {
    const n = s.haende.length;
    if (a.typ === "neustart") return Object.assign(s, farbchaos.start(namen));
    if (s.sieger !== null) return;
    if (a.typ === "rufen") { s.gerufen[i] = true; s.meldung = `${namen[i]} ruft: LETZTE KARTE!`; return; }
    if (a.typ === "erwischt") {
      const z = a.ziel;
      if (s.haende[z].length === 1 && !s.gerufen[z]) {
        s.haende[z].push(...ziehen(s, 2));
        s.meldung = `${namen[i]} hat ${namen[z]} erwischt: 2 Karten + 1 Schluck!`;
      }
      return;
    }
    if (s.warte) {
      if (i !== s.warte.wer) return;
      if (s.warte.art === "farbe" && FARBEN.includes(a.f)) {
        s.farbe = a.f; s.ablage[s.ablage.length - 1].gewaehlt = a.f;
        s.meldung += ` → ${FARBNAME[a.f]}`;
        const p4 = s.warte.p4; s.warte = null;
        weiter(s, 1);
        if (p4) s.meldung += ` – ${namen[s.dran]} muss reagieren!`;
      } else if (s.warte.art === "tausch" && a.typ === "tausch" && a.ziel !== i && a.ziel < n) {
        [s.haende[i], s.haende[a.ziel]] = [s.haende[a.ziel], s.haende[i]];
        s.meldung = `${namen[i]} tauscht die Hand mit ${namen[a.ziel]}!`;
        s.warte = null; weiter(s, 1);
      }
      return;
    }
    if (i !== s.dran) return;
    const hand = s.haende[i];
    if (a.typ === "ziehen") {
      if (s.strafe > 0) {
        hand.push(...ziehen(s, s.strafe));
        s.meldung = `${namen[i]} zieht ${s.strafe} Karten und trinkt ${Math.ceil(s.strafe / 2)} Schlucke!`;
        s.strafe = 0; weiter(s, 1);
      } else if (!s.gezogen) {
        hand.push(...ziehen(s, 1)); s.gezogen = true; s.gerufen[i] = false;
        s.meldung = `${namen[i]} zieht eine Karte.`;
      }
      return;
    }
    if (a.typ === "passen" && s.gezogen) { s.meldung = `${namen[i]} passt.`; weiter(s, 1); return; }
    if (a.typ === "spielen") {
      const k = hand[a.k];
      if (!k || !spielbar(s, k)) return;
      if (s.gezogen && a.k !== hand.length - 1) return; // nach dem Ziehen nur die gezogene Karte
      hand.splice(a.k, 1);
      s.ablage.push({ ...k });
      if (hand.length > 1) s.gerufen[i] = false;
      s.meldung = `${namen[i]} legt ${k.f === "schwarz" ? "" : FARBNAME[k.f] + " "}${anzeige(k)}`;
      if (!hand.length) {
        s.sieger = i;
        s.meldung = `${namen[i]} gewinnt!`;
        return;
      }
      if (k.f !== "schwarz") s.farbe = k.f;
      if (k.w === "p2") s.strafe += 2;
      if (k.w === "p4") s.strafe += 4;
      if (k.f === "schwarz") { s.warte = { art: "farbe", wer: i, p4: k.w === "p4" }; return; }
      if (k.w === 7 && n > 1) { s.warte = { art: "tausch", wer: i }; s.meldung += " – Tauschpartner wählen!"; return; }
      if (k.w === 0) {
        const alt = s.haende.map((h) => h);
        s.haende = alt.map((_, j) => alt[(((j - s.richtung) % n) + n) % n]);
        s.meldung += " – alle Hände wandern weiter!";
      }
      if (k.w === "dreh") { s.richtung *= -1; if (n === 2) { weiter(s, 2); return; } }
      if (k.w === "aus") { weiter(s, 2); return; }
      weiter(s, 1);
    }
  },

  render(s, ich, namen) {
    const n = s.haende.length;
    const oben = s.ablage[s.ablage.length - 1];
    const gegner = namen.map((nm, j) => `<div class="gegner ${j === s.dran ? "dran" : ""}">
        <b>${esc(nm)}${j === ich ? " (du)" : ""}</b><span>🂠 × ${s.haende[j].length}</span>
        ${s.haende[j].length === 1 && !s.gerufen[j] && j !== ich ? knopf("Erwischt!", { typ: "erwischt", ziel: j }, "klein2 rot") : ""}
        ${s.gerufen[j] && s.haende[j].length === 1 ? "<em>letzte!</em>" : ""}</div>`).join("");
    const tisch = `<div class="tisch"><div class="stapel">🂠<small>${s.stapel.length}</small></div>
      ${karteHtml({ f: oben.gewaehlt || oben.f, w: oben.w }, "gross")}
      <div class="info">Farbe: <b class="t-${s.farbe}">${FARBNAME[s.farbe]}</b><br>Richtung: ${s.richtung > 0 ? "⟳" : "⟲"}${s.strafe ? `<br><b class="rotk">Strafe: +${s.strafe}</b>` : ""}</div></div>`;
    const meldung = `<div class="meldung">${esc(s.meldung)}</div>`;
    if (s.sieger !== null) {
      const rest = namen.map((nm, j) => (j === s.sieger ? "" : `${esc(nm)} trinkt ${Math.max(1, Math.ceil(s.haende[j].length / 3))}`)).filter(Boolean).join(" · ");
      return `${meldung}<div class="urteil">🏆 ${esc(namen[s.sieger])} gewinnt!<br><small>${rest}</small></div>${knopf("Neue Runde", { typ: "neustart" }, "gross")}`;
    }
    let steuerung = "";
    if (s.warte && s.warte.wer === ich) {
      if (s.warte.art === "farbe") steuerung = `<p class="mitte">Wähle die neue Farbe:</p><div class="raster">${FARBEN.map((f) => knopf(FARBNAME[f], { typ: "farbe", f }, `gross fb-${f}`)).join("")}</div>`;
      else steuerung = `<p class="mitte">Mit wem tauschst du die Hand?</p><div class="raster">${namen.map((nm, j) => (j === ich ? "" : knopf(esc(nm), { typ: "tausch", ziel: j }, "gross"))).join("")}</div>`;
    } else if (s.warte) steuerung = `<p class="mitte leise">${esc(namen[s.warte.wer])} entscheidet …</p>`;
    else if (s.dran === ich) {
      steuerung = `<div class="zeile-knoepfe">${knopf(s.strafe ? `+${s.strafe} ziehen 🍺` : s.gezogen ? "" : "Karte ziehen", { typ: "ziehen" }, `${s.gezogen && !s.strafe ? "versteckt" : ""}`)}
        ${s.gezogen && !s.strafe ? knopf("Passen", { typ: "passen" }) : ""}</div>`;
    } else steuerung = `<p class="mitte leise">${esc(namen[s.dran])} ist dran</p>`;
    const hand = s.haende[ich];
    const meineHand = `<div class="fc-hand">${hand.map((k, j) => {
      const ok = s.dran === ich && !s.warte && spielbar(s, k) && (!s.gezogen || j === hand.length - 1);
      return `<button class="fc-knopf ${ok ? "ok" : "nein"}" data-a='${JSON.stringify({ typ: "spielen", k: j })}'>${karteHtml(k)}</button>`;
    }).join("")}</div>`;
    const rufen = hand.length <= 2 && !s.gerufen[ich] ? knopf("📣 Letzte Karte!", { typ: "rufen" }, "gross gelb") : "";
    return `<div class="gegnerliste">${gegner}</div>${tisch}${meldung}${steuerung}${meineHand}${rufen}
      <details class="grundregeln"><summary>Regeln</summary><ul>
        <li>Lege gleiche Farbe oder gleiche Zahl/Symbol. ★ und +4 gehen immer.</li>
        <li>+2 auf +2 und +4 auf alles stapeln – wer nicht kann, zieht alles und trinkt die Hälfte als Schlucke.</li>
        <li>7: Hand mit jemandem tauschen. 0: alle Hände wandern in Spielrichtung weiter.</li>
        <li>Bei der vorletzten Karte „Letzte Karte!“ drücken – sonst kann man dich erwischen (2 Karten + Schluck).</li>
        <li>Am Ende trinkt jeder einen Schluck pro 3 Restkarten.</li></ul></details>`;
  },
};
