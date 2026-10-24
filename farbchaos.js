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
  id: "farbchaos", name: "Farbchaos Extrem", emoji: "🌈", farben: ["#e11d48","#2563eb"], kurz: "Ablegen nach Farbe oder Zahl – mit Stapeln, Tauschen, Schlucken",
  start(namen) {
    const s = { stapel: neuesDeck(), ablage: [], haende: [], dran: 0, richtung: 1, strafe: 0, farbe: null,
      warte: null, gerufen: {}, gezogen: false, sieger: null, meldung: "Los geht's!" };
    s.haende = namen.map(() => ziehen(s, 7));
    let erste;
    do { erste = s.stapel.pop(); if (typeof erste.w !== "number") s.stapel.unshift(erste); } while (typeof erste.w !== "number");
    s.ablage.push(erste); s.farbe = erste.f;
    return s;
  },

  // Computer-Mitspieler: spielt nach einfachen, menschlichen Faustregeln
  botPause: () => 1500,
  bot(s, i) {
    if (s.sieger !== null) return null;
    const n = s.haende.length, hand = s.haende[i];
    const lieblingsfarbe = () => { const z = {}; hand.forEach((k) => k.f !== "schwarz" && (z[k.f] = (z[k.f] || 0) + 1)); return Object.keys(z).sort((a, b) => z[b] - z[a])[0] || FARBEN[Math.floor(Math.random() * 4)]; };
    if (s.warte) {
      if (s.warte.wer !== i) return null;
      if (s.warte.art === "farbe") return { typ: "farbe", f: lieblingsfarbe() };
      const andere = s.haende.map((h, j) => [j, h.length]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]);
      return { typ: "tausch", ziel: andere[0][0] };
    }
    // jemanden erwischen, der die letzte Karte nicht angesagt hat
    const ertappt = s.haende.findIndex((h, j) => j !== i && h.length === 1 && !s.gerufen[j]);
    if (ertappt >= 0 && Math.random() < 0.3) return { typ: "erwischt", ziel: ertappt };
    if (s.dran !== i) return null;
    const moeglich = hand.map((k, idx) => ({ k, idx })).filter(({ k, idx }) => spielbar(s, k) && (!s.gezogen || idx === hand.length - 1));
    if (!moeglich.length) return s.gezogen ? { typ: "passen" } : { typ: "ziehen" };
    const naechster = s.haende[(((s.dran + s.richtung) % n) + n) % n];
    const wert = ({ k }) => (k.f === "schwarz" ? (naechster.length <= 2 ? 50 : -20) : typeof k.w === "number" ? k.w : naechster.length <= 2 ? 40 : 10) + Math.random() * 3;
    moeglich.sort((a, b) => wert(b) - wert(a));
    return { typ: "spielen", k: moeglich[0].idx };
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
        const neu = ziehen(s, 1);
        hand.push(...neu); s.gerufen[i] = false;
        if (neu.length && spielbar(s, neu[0])) { s.gezogen = true; s.meldung = `${namen[i]} zieht eine Karte – sie passt!`; }
        else { s.meldung = `${namen[i]} zieht eine Karte – passt nicht, weiter.`; weiter(s, 1); }
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
      if (hand.length === 1) s.gerufen[i] = true;
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
    const oben = s.ablage[s.ablage.length - 1];
    const gegner = namen.map((nm, j) => `<div class="gegner ${j === s.dran ? "dran" : ""}">
        <b>${j === s.dran ? "👉 " : ""}${esc(nm)}${j === ich ? " (du)" : ""}</b>
        <span class="minikarten">${"<i></i>".repeat(Math.min(s.haende[j].length, 10))}<small>${s.haende[j].length}</small></span>
        ${s.haende[j].length === 1 ? "<em>LETZTE KARTE!</em>" : ""}</div>`).join("");
    const farbeOben = oben.gewaehlt || oben.f;
    const tisch = `<div class="tisch">
      <button class="stapel-knopf" ${s.dran === ich && !s.warte && !s.gezogen ? `data-a='{"typ":"ziehen"}'` : "disabled"}>🂠<small>${s.strafe ? `+${s.strafe} ziehen` : "ziehen"}</small></button>
      ${karteHtml({ f: farbeOben, w: oben.w }, "gross")}
      <div class="info"><span class="farbpunkt fp-${s.farbe}"></span><b class="t-${s.farbe}">${FARBNAME[s.farbe]}</b><br>${s.richtung > 0 ? "⟳ im Uhrzeigersinn" : "⟲ gegen die Uhr"}</div></div>`;
    const meldung = `<div class="meldung">${esc(s.meldung)}</div>`;
    if (s.sieger !== null) {
      const rest = namen.map((nm, j) => (j === s.sieger ? "" : `${esc(nm)}: ${Math.max(1, Math.ceil(s.haende[j].length / 3))} 🍺`)).filter(Boolean).join(" · ");
      return `<div class="urteil">🏆 ${esc(namen[s.sieger])} gewinnt!<br><small>${rest}</small></div>${knopf("Neue Runde 🔄", { typ: "neustart" }, "gross gruen")}`;
    }
    const hand = s.haende[ich];
    const spielbare = hand.filter((k, j) => s.dran === ich && !s.warte && spielbar(s, k) && (!s.gezogen || j === hand.length - 1)).length;
    let hinweis = "", steuerung = "";
    if (s.warte && s.warte.wer === ich) {
      if (s.warte.art === "farbe") { hinweis = "🎨 Wähle die neue Farbe"; steuerung = `<div class="raster">${FARBEN.map((f) => knopf(FARBNAME[f], { typ: "farbe", f }, `gross fb-${f}`)).join("")}</div>`; }
      else { hinweis = "🔄 Mit wem tauschst du deine Karten?"; steuerung = `<div class="raster">${namen.map((nm, j) => (j === ich ? "" : knopf(esc(nm), { typ: "tausch", ziel: j }, "gross"))).join("")}</div>`; }
    } else if (s.warte) hinweis = `⏳ ${esc(namen[s.warte.wer])} entscheidet …`;
    else if (s.dran === ich) {
      if (s.strafe) hinweis = spielbare ? `⚠️ Leg eine ${s.strafe >= 4 ? "+4" : "+2 oder +4"} drauf – oder tippe auf den Stapel (+${s.strafe})` : `😬 Keine passende Karte – tippe auf den Stapel und zieh ${s.strafe}`;
      else if (s.gezogen) { hinweis = "✨ Die gezogene Karte passt – ausspielen oder behalten?"; steuerung = knopf("Behalten & weiter", { typ: "passen" }, "zweit"); }
      else hinweis = spielbare ? "👆 DU BIST DRAN – tippe eine leuchtende Karte" : "👆 DU BIST DRAN – nichts passt: tippe auf den Stapel";
    } else hinweis = `⏳ ${esc(namen[s.dran])} ist dran`;
    const meineHand = `<div class="fc-hand">${hand.map((k, j) => {
      const ok = s.dran === ich && !s.warte && spielbar(s, k) && (!s.gezogen || j === hand.length - 1);
      return `<button class="fc-knopf ${ok ? "ok" : "nein"}" ${ok ? `data-a='${JSON.stringify({ typ: "spielen", k: j })}'` : ""}>${karteHtml(k)}</button>`;
    }).join("")}</div>`;
    const istDran = (s.dran === ich && !s.warte) || (s.warte && s.warte.wer === ich);
    return `<div class="gegnerliste">${gegner}</div>${tisch}${meldung}
      <div class="hinweisbox ${istDran ? "" : "warten"}" data-key="h${s.ablage.length}-${s.dran}-${ich}" data-ton="${istDran ? "dran" : "karte"}">${hinweis}</div>${steuerung}
      <div class="handtitel">Deine Karten (${hand.length})</div>${meineHand}
      <details class="grundregeln" ${s.ablage.length < 4 ? "open" : ""}><summary>📖 So geht's (30 Sekunden)</summary><ul>
        <li>Leg eine Karte mit <b>gleicher Farbe</b> oder <b>gleicher Zahl/Zeichen</b>. Passende Karten leuchten.</li>
        <li>Nichts passt? <b>Tippe auf den Stapel</b>. Passt die neue Karte, darfst du sie legen.</li>
        <li>★ = Farbe wünschen. +2 / +4 = der Nächste zieht – außer er legt auch +2/+4 drauf.</li>
        <li>⊘ = Nächster setzt aus. ⇄ = Richtung dreht. 7 = Karten tauschen. 0 = alle geben ihre Karten weiter.</li>
        <li>Wer ziehen muss, trinkt halb so viele Schlucke. Wer zuerst keine Karten hat, gewinnt.</li></ul></details>`;
  },
};
