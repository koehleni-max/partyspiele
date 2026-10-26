// Werwolf - automatischer Spielleiter fuer 5 bis 20 Spieler.
// Nachts wird jeder Bildschirm dunkel; jeder bekommt eine Aufgabe (auch Dorfbewohner tippen Sterne), damit niemand
// am Handy des Nachbarn erkennt, wer gerade wirklich handelt. Erzaehler-Stimme optional auf dem Gastgeber-Handy.
import { esc, knopf, zufall, mischen, name } from "./hilfe.js";
import { still } from "./ton.js";

const ROLLEN = {
  wolf: { name: "Werwolf", emoji: "🐺", team: "wolf", text: "Nachts sucht ihr Wölfe gemeinsam ein Opfer aus. Tagsüber tut ihr unschuldig." },
  seherin: { name: "Seherin", emoji: "🔮", team: "dorf", text: "Jede Nacht darfst du die wahre Rolle eines Spielers sehen." },
  hexe: { name: "Hexe", emoji: "🧪", team: "dorf", text: "Du hast einen Heiltrank (rettet das Opfer der Nacht) und einen Gifttrank (tötet jemanden). Je einmal pro Spiel." },
  amor: { name: "Amor", emoji: "💘", team: "dorf", text: "In der ersten Nacht verliebst du zwei Spieler. Stirbt einer, stirbt der andere vor Kummer." },
  jaeger: { name: "Jäger", emoji: "🏹", team: "dorf", text: "Wenn du stirbst, nimmst du mit einem letzten Schuss jemanden mit ins Grab." },
  waechter: { name: "Wächter", emoji: "🛡️", team: "dorf", text: "Jede Nacht beschützt du einen Spieler vor den Wölfen – nicht zweimal hintereinander denselben." },
  dorf: { name: "Dorfbewohner", emoji: "🧑‍🌾", team: "dorf", text: "Du hast keine Sonderkraft – aber deine Stimme entscheidet tagsüber, wer gehängt wird." },
};

function vorschlag(n) {
  const w = n >= 16 ? 4 : n >= 11 ? 3 : n >= 7 ? 2 : 1;
  return { wolf: w, seherin: 1, hexe: n >= 6 ? 1 : 0, amor: n >= 8 ? 1 : 0, jaeger: n >= 7 ? 1 : 0, waechter: n >= 10 ? 1 : 0 };
}

const lebt = (s, j) => !s.tot.includes(j);
const lebende = (s) => s.rolle.map((_, j) => j).filter((j) => lebt(s, j));
const mitRolle = (s, r) => lebende(s).filter((j) => s.rolle[j] === r);

function sieger(s) {
  const l = lebende(s);
  const woelfe = l.filter((j) => s.rolle[j] === "wolf").length;
  if (s.liebe && l.length === 2 && s.liebe.every((j) => l.includes(j)) && s.rolle[s.liebe[0]] === "wolf" !== (s.rolle[s.liebe[1]] === "wolf")) return "liebe";
  if (!woelfe) return "dorf";
  if (woelfe >= l.length - woelfe) return "wolf";
  return null;
}

function toeten(s, j, grund, namen) {
  if (!lebt(s, j)) return;
  s.tot.push(j);
  s.tode.push({ j, grund });
  if (s.liebe && s.liebe.includes(j)) { const p = s.liebe.find((x) => x !== j); if (lebt(s, p)) { s.tot.push(p); s.tode.push({ j: p, grund: "ist aus Liebeskummer gestorben" }); } }
}

const NACHT_REIHE = ["amor", "wolf", "seherin", "waechter", "hexe"];

// Saetze des Erzaehlers - gleich wie in stimme_bauen.py; der Text dient nur als Ersatz, falls eine Aufnahme fehlt.
const SAETZE = {
  nacht: "Die Nacht bricht herein. Das ganze Dorf schläft ein.", amor: "Amor erwacht und verliebt zwei Menschen.",
  wolf: "Die Werwölfe erwachen und suchen sich ein Opfer.", seherin: "Die Seherin erwacht und blickt in die Seele eines Spielers.",
  waechter: "Der Wächter erwacht und beschützt jemanden.", hexe: "Die Hexe erwacht und betrachtet ihre Tränke.",
  morgen: "Die Sonne geht auf.", keiner: "Ein Wunder. Heute Nacht ist niemand gestorben.",
  t_wolf: "Die Werwölfe haben ein Opfer gefunden.", t_gift: "Jemand wurde vergiftet.", t_liebe: "Jemand ist aus Liebeskummer gestorben.",
  t_jaeger: "Der Jäger hat seinen letzten Schuss abgegeben.", t_dorf: "Das Dorf hat sein Urteil vollstreckt.",
  schauen: "Seht auf eure Bildschirme.", jaeger: "Der Jäger liegt im Sterben. Ihm bleibt ein letzter Schuss.",
  tag: "Das Dorf versammelt sich. Diskutiert, und stimmt dann ab, wer gehängt wird.",
  uneinig: "Das Dorf ist sich uneinig. Heute stirbt niemand.", entschieden: "Das Dorf hat entschieden.",
  sieg_dorf: "Das Dorf hat gewonnen. Alle Werwölfe sind besiegt.", sieg_wolf: "Die Werwölfe haben gewonnen. Das Dorf ist verloren.",
  sieg_liebe: "Das Liebespaar hat gewonnen.",
};
// Ein laufender Satz wird nie abgeschnitten; was davor noch wartete, ist durch den neuen Stand ueberholt und faellt weg.
const erzaehlerReihe = [];
let erzaehlerSpricht = false;
function erzaehlen(folge) {
  erzaehlerReihe.splice(0, erzaehlerReihe.length, ...folge);
  if (!erzaehlerSpricht) weitersprechen();
}
function weitersprechen() {
  const satz = erzaehlerReihe.shift();
  if (!satz) { erzaehlerSpricht = false; return; }
  erzaehlerSpricht = true;
  const weiter = () => setTimeout(weitersprechen, 350);
  const a = new Audio(`stimme/ww/${satz}.mp3`);
  let ersatz = false;
  a.onended = weiter;
  a.onerror = () => { // Aufnahme fehlt: Browserstimme als Ersatz
    if (ersatz) return; ersatz = true;
    try { const u = new SpeechSynthesisUtterance(SAETZE[satz] || ""); u.lang = "de-DE"; u.onend = weiter; u.onerror = weiter; speechSynthesis.speak(u); } catch (e) { weiter(); }
  };
  a.play().catch(() => a.onerror());
}
function naechsteNachtphase(s, ab) {
  for (let k = ab; k < NACHT_REIHE.length; k++) {
    const r = NACHT_REIHE[k];
    if (r === "amor" && (s.nacht > 1 || s.liebe)) continue;
    if (mitRolle(s, r).length) { s.nachtSchritt = k; s.aufgabe = {}; return; }
  }
  morgen(s);
}

function morgen(s) {
  s.tode = [];
  const opfer = s.wolfZiel;
  if (opfer !== null && opfer !== undefined && !(s.geheilt) && opfer !== s.geschuetzt) toeten(s, opfer, "wurde von den Werwölfen gefressen");
  if (s.giftZiel !== null && s.giftZiel !== undefined) toeten(s, s.giftZiel, "wurde vergiftet");
  s.phase = "morgen"; s.uebergang = "sonnenaufgang"; s.zug = (s.zug || 0) + 1;
  s.jaegerOffen = s.tode.find((d) => s.rolle[d.j] === "jaeger") ? s.tode.find((d) => s.rolle[d.j] === "jaeger").j : null;
  s.gewinner = s.jaegerOffen === null ? sieger(s) : null;
}

export const werwolf = {
  id: "werwolf", name: "Werwolf", emoji: "🐺", kurz: "Das Dorf gegen die Wölfe – automatischer Spielleiter, 5 bis 20 Spieler", farben: ["#2c3e50", "#8e44ad"],
  start: (namen) => ({ phase: "einstellen", rollenZahl: vorschlag(namen.length), stimme: true }),
  // Gesamtwertung: die ganze Siegerseite bekommt Punkte, auch wer unterwegs gestorben ist
  ergebnis(s) {
    if (!s.gewinner || !s.rolle) return null;
    if (s.gewinner === "liebe") return { nr: "1", sieger: [...(s.liebe || [])] };
    return { nr: "1", sieger: s.rolle.map((r, j) => (ROLLEN[r].team === s.gewinner ? j : -1)).filter((j) => j >= 0) };
  },
  aktion(s, i, a, namen) {
    const n = namen.length;
    if (a.typ === "neu") return Object.assign(s, werwolf.start(namen));
    if (s.phase === "einstellen") {
      if (i !== 0) return;
      if (a.typ === "plus" || a.typ === "minus") { const r = a.r; s.rollenZahl[r] = Math.max(r === "wolf" ? 1 : 0, (s.rollenZahl[r] || 0) + (a.typ === "plus" ? 1 : -1)); }
      if (a.typ === "stimme") s.stimme = !s.stimme;
      if (a.typ === "verteilen") {
        const karten = [];
        for (const [r, z] of Object.entries(s.rollenZahl)) for (let k = 0; k < z; k++) karten.push(r);
        if (karten.length > n) return;
        while (karten.length < n) karten.push("dorf");
        Object.assign(s, { phase: "rollen", rolle: mischen(karten), bereit: {}, tot: [], tode: [], nacht: 0, liebe: null, heiltrank: true, gifttrank: true, letzterSchutz: null, protokoll: [], zug: 0 });
      }
      return;
    }
    if (s.phase === "rollen" && a.typ === "bereit") { s.bereit[i] = true; if (Object.keys(s.bereit).length >= n) { s.phase = "nacht"; s.nacht = 1; s.uebergang = "sonnenuntergang"; s.wolfZiel = null; s.giftZiel = null; s.geheilt = false; s.geschuetzt = null; s.zug++; naechsteNachtphase(s, 0); } return; }
    if (s.phase === "nacht") {
      const r = NACHT_REIHE[s.nachtSchritt];
      if (a.typ === "dummy") return;
      if (s.rolle[i] !== r || !lebt(s, i)) return;
      if (r === "amor" && a.typ === "liebe" && a.ziele && a.ziele.length === 2 && a.ziele[0] !== a.ziele[1]) { s.liebe = a.ziele; naechsteNachtphase(s, s.nachtSchritt + 1); }
      else if (r === "wolf" && a.typ === "wahl" && lebt(s, a.ziel)) {
        s.aufgabe[i] = a.ziel;
        const woelfe = mitRolle(s, "wolf");
        if (woelfe.every((w) => s.aufgabe[w] !== undefined)) {
          const z = {}; woelfe.forEach((w) => (z[s.aufgabe[w]] = (z[s.aufgabe[w]] || 0) + 1));
          const max = Math.max(...Object.values(z)); const kand = Object.keys(z).filter((k) => z[k] === max);
          s.wolfZiel = Number(kand[zufall(kand.length)]);
          naechsteNachtphase(s, s.nachtSchritt + 1);
        }
      } else if (r === "seherin" && a.typ === "wahl" && s.aufgabe.gesehen === undefined) { s.aufgabe.gesehen = a.ziel; }
      else if (r === "seherin" && a.typ === "fertig") naechsteNachtphase(s, s.nachtSchritt + 1);
      else if (r === "waechter" && a.typ === "wahl" && a.ziel !== s.letzterSchutz) { s.geschuetzt = a.ziel; s.letzterSchutz = a.ziel; naechsteNachtphase(s, s.nachtSchritt + 1); }
      else if (r === "hexe") {
        if (a.typ === "heilen" && s.heiltrank && s.wolfZiel !== null) { s.geheilt = true; s.heiltrank = false; }
        if (a.typ === "gift" && s.gifttrank && lebt(s, a.ziel)) { s.giftZiel = a.ziel; s.gifttrank = false; }
        if (a.typ === "fertig") naechsteNachtphase(s, s.nachtSchritt + 1);
      }
      return;
    }
    if (s.phase === "morgen" || s.phase === "hinrichtung") {
      if (s.jaegerOffen !== null && i === s.jaegerOffen && a.typ === "schuss" && lebt(s, a.ziel)) {
        const jt = s.tode.length; toeten(s, a.ziel, "wurde vom Jäger erschossen"); s.jaegerOffen = null;
        const neuerJaeger = s.tode.slice(jt).find((d) => s.rolle[d.j] === "jaeger" && d.j !== i);
        if (neuerJaeger) s.jaegerOffen = neuerJaeger.j;
        s.gewinner = s.jaegerOffen === null ? sieger(s) : null;
        return;
      }
      if (a.typ === "weiter" && s.jaegerOffen === null && !s.gewinner) {
        if (s.phase === "morgen") { s.phase = "tag"; s.stimmen = {}; s.uebergang = null; }
        else { s.phase = "nacht"; s.nacht++; s.uebergang = "sonnenuntergang"; s.wolfZiel = null; s.giftZiel = null; s.geheilt = false; s.geschuetzt = null; s.zug++; naechsteNachtphase(s, 0); }
      }
      return;
    }
    if (s.phase === "tag" && a.typ === "stimme" && lebt(s, i) && lebt(s, a.ziel)) {
      s.stimmen[i] = a.ziel;
      const l = lebende(s);
      if (l.every((j) => s.stimmen[j] !== undefined)) {
        const z = {}; l.forEach((j) => (z[s.stimmen[j]] = (z[s.stimmen[j]] || 0) + 1));
        const max = Math.max(...Object.values(z)); const kand = Object.keys(z).filter((k) => z[k] === max).map(Number);
        s.tode = [];
        if (kand.length === 1) toeten(s, kand[0], "wurde vom Dorf gehängt");
        s.phase = "hinrichtung"; s.unentschieden = kand.length > 1; s.zug++;
        s.jaegerOffen = s.tode.find((d) => s.rolle[d.j] === "jaeger") ? s.tode.find((d) => s.rolle[d.j] === "jaeger").j : null;
        s.gewinner = s.jaegerOffen === null ? sieger(s) : null;
      }
    }
  },

  render(s, ich, namen) {
    const n = namen.length;
    if (s.phase === "einstellen") {
      const summe = Object.values(s.rollenZahl).reduce((x, y) => x + y, 0);
      const zeilen = Object.keys(ROLLEN).filter((r) => r !== "dorf").map((r) => `<div class="rollenzeile"><span>${ROLLEN[r].emoji} ${ROLLEN[r].name}</span>
        ${ich === 0 ? `${knopf("−", { typ: "minus", r }, "klein2")}<b>${s.rollenZahl[r] || 0}</b>${knopf("+", { typ: "plus", r }, "klein2")}` : `<b>${s.rollenZahl[r] || 0}</b>`}</div>`).join("");
      return `<div class="ww-himmel tag"><div class="ww-dorf"></div><div class="ww-titel">🐺 Werwolf</div></div>
        <p class="mitte">${n} Spieler. ${n < 5 ? "<b>Mit mindestens 5 macht es richtig Spaß – mit 8 bis 20 ist es perfekt.</b>" : ""}</p>
        <div class="rollenliste">${zeilen}<div class="rollenzeile"><span>🧑‍🌾 Dorfbewohner</span><b>${Math.max(0, n - summe)}</b></div></div>
        ${summe > n ? `<p class="fehler mitte">Zu viele Sonderrollen für ${n} Spieler!</p>` : ""}
        ${ich === 0 ? `<div class="schalter" data-a='{"typ":"stimme"}'><input type="checkbox" ${s.stimme ? "checked" : ""} tabindex="-1"><span>🗣️ Erzähler (Jarvis) auf diesem Handy</span></div>
          ${knopf("🃏 Rollen verteilen", { typ: "verteilen" }, "gross", summe > n ? "disabled" : "")}` : `<div class="hinweisbox warten">${esc(namen[0])} stellt die Rollen ein …</div>`}`;
    }
    if (s.phase === "rollen") {
      const r = ROLLEN[s.rolle[ich]];
      const woelfe = s.rolle[ich] === "wolf" ? s.rolle.map((x, j) => (x === "wolf" && j !== ich ? namen[j] : null)).filter(Boolean) : [];
      return `<div class="ww-himmel tag"><div class="ww-dorf"></div><div class="ww-titel">Deine Rolle</div></div>
        <details class="verdeckt"><summary>👁️ Antippen – Handy abschirmen!</summary>
          <div class="rollenkarte r-${s.rolle[ich]}"><div class="emo">${r.emoji}</div><b>${r.name}</b><p>${r.text}</p>${woelfe.length ? `<p>Deine Mitwölfe: <b>${woelfe.map(esc).join(", ")}</b></p>` : ""}</div></details>
        ${s.bereit[ich] ? `<div class="hinweisbox warten">Bereit – warte auf die anderen (${Object.keys(s.bereit).length}/${n})</div>` : knopf("✅ Rolle gemerkt – bereit", { typ: "bereit" }, "gross gruen")}`;
    }
    const tot = !lebt(s, ich);
    const geist = tot ? `<details class="grundregeln"><summary>👻 Du bist tot – alle Rollen ansehen</summary>${namen.map((nm, j) => `<div>${ROLLEN[s.rolle[j]].emoji} ${esc(nm)}${lebt(s, j) ? "" : " ✝"}</div>`).join("")}</details>` : "";
    const meineRolle = `<details class="meinerolle"><summary>Meine Rolle</summary>${ROLLEN[s.rolle[ich]].emoji} ${ROLLEN[s.rolle[ich]].name}${s.liebe && s.liebe.includes(ich) ? ` · 💘 verliebt in ${esc(namen[s.liebe.find((x) => x !== ich)])}` : ""}</details>`;
    const spielerKnoepfe = (typ, filter, extra = {}) => `<div class="raster">${namen.map((nm, j) => (filter(j) ? knopf(esc(nm), { typ, ziel: j, ...extra }, "wahl") : "")).join("")}</div>`;

    if (s.phase === "nacht") {
      const r = NACHT_REIHE[s.nachtSchritt];
      const aktiv = s.rolle[ich] === r && !tot;
      let inhalt;
      if (!aktiv) {
        inhalt = `<p class="nachttext">Das Dorf schläft … 😴<br><small>Damit niemand etwas merkt: tippe ein paar Sterne an.</small></p>
          <div class="sternenfeld">${Array.from({ length: 9 }, (_, k) => `<button class="stern" data-a='{"typ":"dummy"}'>✦</button>`).join("")}</div>`;
      } else if (r === "amor") {
        inhalt = `<p class="nachttext">💘 Amor, wähle zwei Verliebte</p><div class="raster">${namen.map((nm, j) => `<button class="wahl amorwahl" data-amor="${j}">${esc(nm)}</button>`).join("")}</div>
          <button class="gross pink" id="amor-ok">💘 Verlieben</button>`;
      } else if (r === "wolf") {
        const stimmen = mitRolle(s, "wolf").map((w) => (s.aufgabe[w] !== undefined ? `${esc(namen[w])} → ${esc(namen[s.aufgabe[w]])}` : `${esc(namen[w])} wählt …`)).join("<br>");
        inhalt = `<p class="nachttext">🐺 Wölfe, wen fresst ihr?</p>${spielerKnoepfe("wahl", (j) => lebt(s, j) && s.rolle[j] !== "wolf")}<p class="mitte leise">${stimmen}</p>`;
      } else if (r === "seherin") {
        inhalt = s.aufgabe.gesehen === undefined ? `<p class="nachttext">🔮 Seherin, wessen Rolle willst du sehen?</p>${spielerKnoepfe("wahl", (j) => lebt(s, j) && j !== ich)}`
          : `<div class="rollenkarte r-${s.rolle[s.aufgabe.gesehen]}"><div class="emo">${ROLLEN[s.rolle[s.aufgabe.gesehen]].emoji}</div><b>${esc(namen[s.aufgabe.gesehen])} ist ${ROLLEN[s.rolle[s.aufgabe.gesehen]].name}</b></div>${knopf("Gemerkt – weiterschlafen", { typ: "fertig" }, "gross")}`;
      } else if (r === "waechter") {
        inhalt = `<p class="nachttext">🛡️ Wächter, wen beschützt du?</p>${spielerKnoepfe("wahl", (j) => lebt(s, j) && j !== s.letzterSchutz)}`;
      } else if (r === "hexe") {
        inhalt = `<p class="nachttext">🧪 Hexe, ${s.wolfZiel !== null ? `die Wölfe haben <b>${esc(namen[s.wolfZiel])}</b> gewählt.` : "heute gibt es kein Opfer."}</p>
          ${s.heiltrank && s.wolfZiel !== null && !s.geheilt ? knopf("💚 Heiltrank: retten", { typ: "heilen" }, "gross gruen") : s.geheilt ? "<p class='mitte'>💚 Gerettet!</p>" : ""}
          ${s.gifttrank && s.giftZiel === null ? `<details class="grundregeln"><summary>☠️ Gifttrank benutzen</summary>${spielerKnoepfe("gift", (j) => lebt(s, j) && j !== ich)}</details>` : s.giftZiel !== null ? `<p class="mitte">☠️ ${esc(namen[s.giftZiel])} wird vergiftet.</p>` : ""}
          ${knopf("Fertig – weiterschlafen", { typ: "fertig" }, "gross")}`;
      }
      // Geraeusche klingen auf ALLEN Handys gleich - verraten also niemanden
      const klang = `<i hidden data-key="wwton-n${s.zug}-${s.nachtSchritt}" data-ton="${r === "wolf" ? "heulen" : r === "amor" ? "herz" : "magie"}"></i>`;
      return `${klang}<div class="ww-nacht ${s.uebergang === "sonnenuntergang" ? "anim-unter" : ""}" data-key="nacht${s.zug}" data-ton="gong"><div class="mond"></div><div class="sterne"></div><div class="ww-dorf nacht"></div>
        <div class="ww-titel">Nacht ${s.nacht}</div></div><div class="nachtpanel">${inhalt}</div>${meineRolle}${geist}`;
    }

    const himmel = (art) => `<i hidden data-key="wwton-${art}${s.zug}-${s.tode.length}-${s.gewinner || ""}" data-ton="${
      art === "morgen" ? (s.tode.length ? "tod" : "morgen") : art === "hinrichtung" ? (s.unentschieden ? "falsch" : "tod") : "tack"}"></i>${
      s.jaegerOffen === null && s.tode.some((d) => /erschossen|Jäger/i.test(d.grund)) ? `<i hidden data-key="wwschuss${s.zug}-${s.tode.length}" data-ton="schuss"></i>` : ""}<div class="ww-himmel tag ${s.uebergang === "sonnenaufgang" && art === "morgen" ? "anim-auf" : ""}" data-key="${art}${s.zug}"><div class="sonne"></div><div class="ww-dorf"></div>
      <div class="ww-titel">${art === "morgen" ? `☀️ Tag ${s.nacht}` : art === "tag" ? "⚖️ Abstimmung" : "🪢 Urteil"}</div></div>`;
    const todesliste = s.tode.length ? s.tode.map((d) => `<div class="todeskarte">✝ <b>${esc(namen[d.j])}</b> ${d.grund}.<br><small>Rolle: ${ROLLEN[s.rolle[d.j]].emoji} ${ROLLEN[s.rolle[d.j]].name}</small></div>`).join("") : "";
    let unten = "";
    if (s.jaegerOffen !== null) unten = s.jaegerOffen === ich ? `<p class="nachttext">🏹 Dein letzter Schuss – wen nimmst du mit?</p>${spielerKnoepfe("schuss", (j) => lebt(s, j))}` : `<div class="hinweisbox warten">🏹 ${esc(namen[s.jaegerOffen])} legt an …</div>`;
    else if (s.gewinner) {
      const text = { dorf: "🏡 Das Dorf hat gewonnen! Alle Wölfe sind tot.", wolf: "🐺 Die Werwölfe haben gewonnen!", liebe: "💘 Das Liebespaar hat gewonnen!" }[s.gewinner];
      unten = `<div class="urteil">🏆 ${text}</div><div class="rollenaufloesung">${namen.map((nm, j) => `<span>${ROLLEN[s.rolle[j]].emoji} ${esc(nm)}${lebt(s, j) ? "" : " ✝"}</span>`).join("")}</div>${knopf("Neues Spiel", { typ: "neu" }, "gross")}`;
    }
    if (s.phase === "morgen") return `${himmel("morgen")}${todesliste || `<div class="urteil gut">🌅 Wunder! Heute Nacht ist niemand gestorben.</div>`}${unten || knopf("Zur Abstimmung ➜", { typ: "weiter" }, "gross")}${meineRolle}${geist}`;
    if (s.phase === "hinrichtung") return `${himmel("hinrichtung")}${s.unentschieden ? `<div class="urteil gut">⚖️ Unentschieden – heute wird niemand gehängt.</div>` : todesliste}${unten || knopf("🌙 Die Nacht bricht herein ➜", { typ: "weiter" }, "gross")}${meineRolle}${geist}`;
    // Tag: Abstimmung
    const l = lebende(s);
    return `${himmel("tag")}<p class="mitte">Diskutiert! Wer ist ein Werwolf? Dann stimmt ab.</p>
      ${tot ? "<div class='hinweisbox warten'>👻 Tote dürfen nicht abstimmen.</div>" : `<div class="raster">${namen.map((nm, j) => (lebt(s, j) && j !== ich ? knopf(esc(nm), { typ: "stimme", ziel: j }, `wahl ${s.stimmen[ich] === j ? "gewaehlt" : ""}`) : "")).join("")}</div>`}
      <p class="mitte leise">${l.filter((j) => s.stimmen[j] !== undefined).length}/${l.length} haben abgestimmt</p>${meineRolle}${geist}`;
  },

  // Computer-Mitspieler: handeln nur ueber dieselben Aktionen wie Menschen, nachts mit Bedenkzeit
  botPause: (s) => (s.phase === "nacht" ? 3500 : s.phase === "tag" ? 2500 : 1200),
  bot(s, i) {
    const istWolf = s.rolle && s.rolle[i] === "wolf";
    const zufaellig = (liste) => (liste.length ? liste[zufall(liste.length)] : null);
    s.botWissen = s.botWissen || {};
    const wissen = (s.botWissen[i] = s.botWissen[i] || {});
    if (s.phase === "rollen") return s.bereit[i] ? null : { typ: "bereit" };
    if (!s.rolle || !lebt(s, i) && !(s.jaegerOffen === i)) return null;
    if (s.phase === "nacht") {
      const r = NACHT_REIHE[s.nachtSchritt];
      if (s.rolle[i] !== r) return null;
      const andere = lebende(s).filter((j) => j !== i);
      if (r === "amor") { const z = mischen(lebende(s)).slice(0, 2); return z.length === 2 ? { typ: "liebe", ziele: z } : null; }
      if (r === "wolf") {
        if (s.aufgabe[i] !== undefined) return null;
        const schonGewaehlt = mitRolle(s, "wolf").map((w) => s.aufgabe[w]).find((z) => z !== undefined);
        return { typ: "wahl", ziel: schonGewaehlt !== undefined ? schonGewaehlt : zufaellig(andere.filter((j) => s.rolle[j] !== "wolf")) };
      }
      if (r === "seherin") {
        if (s.aufgabe.gesehen === undefined) { const z = zufaellig(andere.filter((j) => !(j in (wissen.gesehen || {})))) ?? zufaellig(andere); return { typ: "wahl", ziel: z }; }
        wissen.gesehen = { ...(wissen.gesehen || {}), [s.aufgabe.gesehen]: s.rolle[s.aufgabe.gesehen] };
        return { typ: "fertig" };
      }
      if (r === "waechter") return { typ: "wahl", ziel: zufaellig(lebende(s).filter((j) => j !== s.letzterSchutz)) };
      if (r === "hexe") {
        if (s.heiltrank && s.wolfZiel !== null && !s.geheilt && (s.wolfZiel === i || Math.random() < 0.35)) return { typ: "heilen" };
        if (s.gifttrank && s.giftZiel === null && s.nacht > 1 && Math.random() < 0.2) return { typ: "gift", ziel: zufaellig(andere) };
        return { typ: "fertig" };
      }
      return null;
    }
    if ((s.phase === "morgen" || s.phase === "hinrichtung") && s.jaegerOffen === i) {
      const verdacht = Object.entries(wissen.gesehen || {}).filter(([j, r]) => r === "wolf" && lebt(s, Number(j))).map(([j]) => Number(j));
      return { typ: "schuss", ziel: verdacht[0] ?? zufaellig(lebende(s).filter((j) => j !== i && !(istWolf && s.rolle[j] === "wolf"))) };
    }
    if (s.phase === "tag" && s.stimmen[i] === undefined) {
      const andere = lebende(s).filter((j) => j !== i);
      const bekannteWoelfe = Object.entries(wissen.gesehen || {}).filter(([j, r]) => r === "wolf" && lebt(s, Number(j))).map(([j]) => Number(j));
      if (bekannteWoelfe.length && !istWolf) return { typ: "stimme", ziel: bekannteWoelfe[0] };
      // sonst der Mehrheit folgen, wenn es eine gibt - Woelfe schuetzen ihresgleichen
      const z = {}; Object.values(s.stimmen).forEach((v) => (z[v] = (z[v] || 0) + 1));
      const fuehrend = Object.keys(z).map(Number).filter((j) => j !== i && !(istWolf && s.rolle[j] === "wolf")).sort((a, b) => z[b] - z[a])[0];
      const ziel = fuehrend !== undefined && Math.random() < 0.6 ? fuehrend : zufaellig(andere.filter((j) => !(istWolf && s.rolle[j] === "wolf")));
      return ziel === null ? null : { typ: "stimme", ziel };
    }
    return null;
  },

  musik(s) { return s.phase === "nacht" ? "nacht" : ["morgen", "tag", "hinrichtung"].includes(s.phase) ? "dorf" : null; },

  nach(s, ich, senden, namen) {
    document.body.classList.toggle("nachtmodus", s.phase === "nacht");
    // Amor: zwei auswaehlen
    const amor = document.querySelectorAll("[data-amor]");
    if (amor.length) {
      window.__amor = window.__amor || [];
      amor.forEach((b) => { if (window.__amor.includes(Number(b.dataset.amor))) b.classList.add("gewaehlt");
        b.onclick = () => { const j = Number(b.dataset.amor); window.__amor = window.__amor.includes(j) ? window.__amor.filter((x) => x !== j) : [...window.__amor, j].slice(-2); amor.forEach((x) => x.classList.toggle("gewaehlt", window.__amor.includes(Number(x.dataset.amor)))); }; });
      const ok = document.getElementById("amor-ok"); if (ok) ok.onclick = () => { if (window.__amor.length === 2) senden({ typ: "liebe", ziele: window.__amor }); };
    }
    // Erzaehler mit Jarvis' Stimme (einmal aufgenommen, stimme_bauen.py), nur auf dem Gastgeber-Handy - zeigt der Beamer
    // das Spiel, spricht er dort (beamer_spiele.js) und das Handy bleibt still. Er nennt nie Namen oder Rollen von Spielern.
    if (ich !== 0 || !s.stimme || !s.rolle || still()) return;
    const folge = erzaehlerFolge(oeffentlich(s), handyMerk);
    if (folge) erzaehlen(folge);
  },
};

// ---------------------------------------------------------------- oeffentlicher Stand (fuer Erzaehler und Beamer)
// Nur, was ohnehin alle sehen oder hoeren: Phase, wer gerade gerufen wird (wie der Erzaehler), Todesursachen, ob ein
// letzter Schuss aussteht, Sieger. Keine Rolle einer Person, kein Ziel der Nacht, kein Liebespaar.
export function oeffentlich(s) {
  return { phase: s.phase, zug: s.zug || 0, wach: s.phase === "nacht" ? NACHT_REIHE[s.nachtSchritt] : null,
    tode: ["morgen", "hinrichtung"].includes(s.phase) ? (s.tode || []).map((d) => ({ j: d.j, grund: d.grund })) : [],
    schuss: s.jaegerOffen !== null && s.jaegerOffen !== undefined, unentschieden: !!s.unentschieden, gewinner: s.gewinner || null };
}
const handyMerk = {};
// Saetze fuer einen neuen Stand (null = schon gesagt). merk = Gedaechtnis des Geraets, das spricht.
export function erzaehlerFolge(z, merk) {
  const schluessel = `${z.phase}-${z.zug}-${z.wach}-${z.schuss}-${z.gewinner}-${z.tode.length}`;
  if (merk.stimme === schluessel) return null;
  merk.stimme = schluessel;
  const folge = [];
  const tod = (d) => (/Werwölfen/.test(d.grund) ? "t_wolf" : /vergiftet/.test(d.grund) ? "t_gift" : /Liebeskummer/.test(d.grund) ? "t_liebe" : /Jäger/.test(d.grund) ? "t_jaeger" : "t_dorf");
  const gesagt = merk.tode && merk.tode.zug === z.zug ? merk.tode.n : 0;
  const neueTode = z.tode.slice(gesagt);
  merk.tode = { zug: z.zug, n: z.tode.length };
  if (z.phase === "nacht") {
    if (merk.nacht !== z.zug) { merk.nacht = z.zug; folge.push("nacht"); }
    folge.push(z.wach);
  } else if (z.phase === "morgen") {
    if (!gesagt) folge.push("morgen");
    if (!gesagt && !neueTode.length) folge.push("keiner");
    neueTode.forEach((d) => folge.push(tod(d)));
    if (neueTode.length) folge.push(z.schuss ? "jaeger" : "schauen");
  } else if (z.phase === "tag") folge.push("tag");
  else if (z.phase === "hinrichtung") {
    if (!gesagt) folge.push(z.unentschieden ? "uneinig" : "entschieden");
    neueTode.forEach((d) => folge.push(tod(d)));
    if (neueTode.length) folge.push(z.schuss ? "jaeger" : "schauen");
  }
  if (z.gewinner) folge.push(`sieg_${z.gewinner}`);
  return folge.filter(Boolean);
}
export { erzaehlen, ROLLEN, NACHT_REIHE, lebende };
