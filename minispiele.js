// Geschicklichkeits- und Kreativspiele
import { spiele as klang } from "./ton.js";
import { esc, knopf, zufall, ziehe, mischen, name, schlucke } from "./hilfe.js";
import * as T from "./texte.js";

// ================================================================ Reaktion
// Jedes Handy misst selbst (keine Uhrenabgleich-Probleme): Start kommt vom Gastgeber, Gruen nach eigener Wartezeit.
let reaktionLokal = { runde: -1, gruen: 0, timer: null, gesendet: false };
const reaktion = {
  id: "reaktion", name: "Blitzreaktion", emoji: "⚡", farben: ["#22d3ee","#1e3a8a"], kurz: "Tippen, sobald es grün wird – der Langsamste trinkt",
  start: () => ({ runde: 0, phase: "bereit", warte: 0, zeiten: {} }),
  // Gesamtwertung: je Runde der Schnellste (zu frueh zaehlt nicht)
  ergebnis(s) {
    if (s.phase !== "ergebnis") return null;
    const gut = Object.entries(s.zeiten).filter(([, ms]) => ms >= 0);
    if (!gut.length) return null;
    const min = Math.min(...gut.map(([, ms]) => ms));
    return { nr: `r${s.runde}`, sieger: gut.filter(([, ms]) => ms === min).map(([j]) => Number(j)) };
  },
  aktion(s, i, a, namen) {
    if (a.typ === "los" && s.phase !== "laeuft") { s.runde++; s.phase = "laeuft"; s.warte = 1500 + zufall(4000); s.zeiten = {}; }
    if (a.typ === "zeit" && s.phase === "laeuft" && s.zeiten[i] === undefined) {
      s.zeiten[i] = a.ms;
      if (Object.keys(s.zeiten).length >= s.anzahl) s.phase = "ergebnis";
    }
  },
  render(s, ich, namen) {
    if (s.phase === "bereit") return `<div class="frage">Wer ist am schnellsten?</div><p class="mitte">Tippe auf die Fläche, sobald sie <b>grün</b> wird. Zu früh = 2 Schlucke.</p>${knopf("Runde starten", { typ: "los" }, "gross")}`;
    if (s.phase === "laeuft") {
      const fertig = s.zeiten[ich] !== undefined;
      return `<div id="reaktionsflaeche" class="reaktion ${fertig ? "fertig" : "rot"}">${fertig ? (s.zeiten[ich] < 0 ? "Zu früh! 😬" : `${s.zeiten[ich]} ms`) : "Warte …"}</div>
        <p class="mitte leise">${Object.keys(s.zeiten).length}/${namen.length} fertig</p>`;
    }
    // wer mittendrin dazukam, hat in dieser Runde noch keine Zeit
    const liste = namen.map((n, j) => [j, s.zeiten[j]]).filter(([, ms]) => ms !== undefined).sort((x, y) => (x[1] < 0 ? 1e9 : x[1]) - (y[1] < 0 ? 1e9 : y[1]));
    const letzter = liste[liste.length - 1];
    return `<div class="frage">Ergebnis</div><ol class="rangliste">${liste.map(([j, ms]) => `<li>${name(namen, j)}: ${ms < 0 ? "zu früh" : ms + " ms"}</li>`).join("")}</ol>
      <div class="urteil">${name(namen, letzter[0])} trinkt ${schlucke(letzter[1] < 0 ? 2 : 1)} · ${name(namen, liste[0][0])} verteilt 1</div>
      ${knopf("Nächste Runde", { typ: "los" }, "gross")}`;
  },
  nach(s, ich, senden) {
    if (s.phase !== "laeuft" || s.zeiten[ich] !== undefined) return;
    const fl = document.getElementById("reaktionsflaeche");
    if (reaktionLokal.runde !== s.runde) {
      clearTimeout(reaktionLokal.timer);
      reaktionLokal = { runde: s.runde, gruen: 0, gesendet: false, timer: setTimeout(() => {
        reaktionLokal.gruen = performance.now();
        const f = document.getElementById("reaktionsflaeche");
        if (f) { f.className = "reaktion gruen"; f.textContent = "JETZT!"; klang("los"); }
      }, s.warte) };
    } else if (reaktionLokal.gruen) { fl.className = "reaktion gruen"; fl.textContent = "JETZT!"; }
    fl.onpointerdown = () => {
      if (reaktionLokal.gesendet) return;
      reaktionLokal.gesendet = true;
      const ms = reaktionLokal.gruen ? Math.round(performance.now() - reaktionLokal.gruen) : -1;
      clearTimeout(reaktionLokal.timer);
      senden({ typ: "zeit", ms });
    };
  },
};

// ================================================================ Schaetzen
const schaetzen = {
  id: "schaetzen", name: "Schätzmeister", emoji: "🎯", farben: ["#f97316","#7c2d12"], kurz: "Zahlen schätzen – wer am weitesten weg liegt, trinkt",
  start: () => { const s = { tipps: {}, phase: "tippen" }; s.rest = mischen(T.SCHAETZ.map((_, i) => i)); s.nr = s.rest.pop(); return s; },
  // Gesamtwertung: je Frage, wer am naechsten dran war
  ergebnis(s) {
    if (s.phase !== "aufloesung") return null;
    const loesung = T.SCHAETZ[s.nr][1];
    const abst = Object.entries(s.tipps).map(([j, t]) => [Number(j), Math.abs(t - loesung)]);
    if (!abst.length) return null;
    const min = Math.min(...abst.map((x) => x[1]));
    return { nr: `s${s.nr}-${s.rest.length}`, sieger: abst.filter((x) => x[1] === min).map((x) => x[0]) };
  },
  aktion(s, i, a) {
    if (a.typ === "tipp" && s.phase === "tippen" && a.wert !== "" && !isNaN(Number(a.wert))) {
      s.tipps[i] = Number(a.wert);
      if (Object.keys(s.tipps).length >= s.anzahl) s.phase = "aufloesung";
    }
    if (a.typ === "weiter") { if (!s.rest.length) s.rest = mischen(T.SCHAETZ.map((_, k) => k)); s.nr = s.rest.pop(); s.tipps = {}; s.phase = "tippen"; }
  },
  render(s, ich, namen) {
    const [frage, loesung] = T.SCHAETZ[s.nr];
    if (s.phase === "tippen") return `<div class="frage">${esc(frage)}</div>
      ${s.tipps[ich] === undefined ? `<input id="tipp" type="number" inputmode="decimal" placeholder="Deine Schätzung">${knopf("Abgeben", { typ: "tipp" }, "gross", `data-feld="tipp"`)}`
                                   : `<p class="mitte">Abgegeben: <b>${s.tipps[ich]}</b></p>`}
      <p class="mitte leise">${Object.keys(s.tipps).length}/${namen.length} abgegeben</p>`;
    const abst = namen.map((_, j) => [j, Math.abs(s.tipps[j] - loesung)]).filter(([j]) => s.tipps[j] !== undefined).sort((x, y) => x[1] - y[1]);
    return `<div class="frage">${esc(frage)}<br><span class="gross2">${loesung}</span></div>
      <ol class="rangliste">${abst.map(([j]) => `<li>${name(namen, j)}: ${s.tipps[j]}</li>`).join("")}</ol>
      <div class="urteil">${name(namen, abst[abst.length - 1][0])} trinkt 2 · ${name(namen, abst[0][0])} verteilt 2</div>
      ${knopf("Nächste Frage", { typ: "weiter" }, "gross")}`;
  },
};

// ================================================================ Malen & Raten
let malLokal = { pfad: null };
const malen = {
  id: "malen", name: "Malen & Raten", emoji: "🎨", farben: ["#ec4899","#6d28d9"], kurz: "Einer malt, die anderen raten – reihum",
  start: () => ({ maler: 0, wort: ziehe(T.MALEN), striche: [], tipps: [], geloest: null, runde: 1 }),
  // Gesamtwertung: wer es erraten hat und wer es gemalt hat
  ergebnis: (s) => (s.geloest !== null && s.geloest >= 0 ? { nr: `m${s.runde}`, sieger: [s.geloest, s.maler] } : null),
  aktion(s, i, a, namen) {
    if (a.typ === "strich" && i === s.maler && !s.geloest && Array.isArray(a.p) && a.p.length < 400) s.striche.push(a.p);
    if (a.typ === "loeschen" && i === s.maler) s.striche = [];
    if (a.typ === "rate" && i !== s.maler && !s.geloest && a.wert && a.wert.trim()) {
      const t = a.wert.trim().slice(0, 40);
      s.tipps.push({ von: i, t });
      if (t.toLowerCase().replace(/[^a-zäöüß]/g, "") === s.wort.toLowerCase().replace(/[^a-zäöüß]/g, "")) s.geloest = i;
    }
    if (a.typ === "aufgeben" && i === s.maler) s.geloest = -1;
    if (a.typ === "weiter") { s.maler = (s.maler + 1) % s.anzahl; s.wort = ziehe(T.MALEN); s.striche = []; s.tipps = []; s.geloest = null; s.runde++; }
  },
  render(s, ich, namen) {
    const istMaler = ich === s.maler;
    const kopf = istMaler ? `<div class="frage">Male: <span class="gross2">${esc(s.wort)}</span></div>` : `<div class="frage">${name(namen, s.maler)} malt – was ist es?</div>`;
    const tipps = `<div class="tipps">${s.tipps.slice(-6).map((x) => `<span>${esc(namen[x.von])}: ${esc(x.t)}</span>`).join("")}</div>`;
    let unten = "";
    if (s.geloest !== null) {
      unten = `<div class="urteil">${s.geloest >= 0 ? `${name(namen, s.geloest)} hat es: <b>${esc(s.wort)}</b>! Alle anderen trinken 1, ${esc(namen[s.maler])} verteilt 2.` : `Aufgegeben – es war <b>${esc(s.wort)}</b>. ${esc(namen[s.maler])} trinkt 2.`}</div>${knopf("Nächster Maler", { typ: "weiter" }, "gross")}`;
    } else if (istMaler) unten = `<div class="zeile-knoepfe">${knopf("Alles löschen", { typ: "loeschen" })}${knopf("Aufgeben", { typ: "aufgeben" }, "rot")}</div>`;
    else unten = `<div class="zeile-knoepfe"><input id="raten" placeholder="Dein Tipp" autocomplete="off">${knopf("Raten", { typ: "rate" }, "", `data-feld="raten" data-leeren`)}</div>`;
    return `${kopf}<canvas id="leinwand" class="leinwand ${istMaler && s.geloest === null ? "aktiv" : ""}" width="600" height="600"></canvas>${tipps}${unten}`;
  },
  nach(s, ich, senden) {
    const c = document.getElementById("leinwand");
    const g = c.getContext("2d");
    g.lineCap = g.lineJoin = "round"; g.lineWidth = 7; g.strokeStyle = "#1b1f2a";
    const linie = (p) => { if (p.length < 2) return; g.beginPath(); g.moveTo(p[0][0] * 6, p[0][1] * 6); p.forEach(([x, y]) => g.lineTo(x * 6, y * 6)); g.stroke(); };
    s.striche.forEach(linie);
    if (malLokal.pfad) linie(malLokal.pfad);
    if (ich !== s.maler || s.geloest !== null) return;
    const punkt = (ev) => { const r = c.getBoundingClientRect(); return [Math.round(((ev.clientX - r.left) / r.width) * 100), Math.round(((ev.clientY - r.top) / r.height) * 100)]; };
    c.onpointerdown = (ev) => { c.setPointerCapture(ev.pointerId); malLokal.pfad = [punkt(ev)]; };
    c.onpointermove = (ev) => {
      if (!malLokal.pfad) return;
      const p = punkt(ev); const l = malLokal.pfad[malLokal.pfad.length - 1];
      if (Math.abs(p[0] - l[0]) + Math.abs(p[1] - l[1]) < 1) return;
      malLokal.pfad.push(p);
      g.beginPath(); g.moveTo(l[0] * 6, l[1] * 6); g.lineTo(p[0] * 6, p[1] * 6); g.stroke();
    };
    c.onpointerup = c.onpointercancel = () => { if (malLokal.pfad && malLokal.pfad.length > 1) senden({ typ: "strich", p: malLokal.pfad }); malLokal.pfad = null; };
  },
};

export const MINISPIELE = [reaktion, schaetzen, malen];
