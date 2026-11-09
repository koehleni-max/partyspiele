// Weiches Einsetzen (Partyspiele-Kritik Schritt 4b, Nico 08.11.2026: "bau einfach weiter" - weiche Zug-Animationen).
// Bisher setzte app.js bei jedem neuen Stand die ganze Seite neu ein: jedes Einblenden, Aufdecken und jeder Siegesmoment fing
// bei jedem fremden Tipp von vorn an (oder es gab sie deshalb gar nicht). Jetzt wird das neue HTML mit dem stehenden
// abgeglichen und nur ausgetauscht, was sich geaendert hat (wie morphdom/idiomorph):
//   - gleiche Stelle, gleiche Art -> Element bleibt stehen, nur Text und Merkmale werden angeglichen
//   - data-key (oder id) = Schluessel: ein Element mit gleichem Schluessel bleibt dasselbe, auch wenn es wandert; ein neuer
//     Schluessel ist ein neues Element (dann laeuft seine Einblend-Animation genau einmal)
//   - data-eigen: der Inhalt gehoert einem Skript (fertige Spiele, Malflaeche) - nur die Merkmale werden angeglichen
//   - Eingabefelder: was getippt ist, bleibt (wie bisher ueber felderZurueck); neue Runde (data-rk anders) = neues Feld
//   - aufgeklappte Regeln (<details>) bleiben auf, solange das neue HTML sie nicht ausdruecklich oeffnet/schliesst
//   - data-zahl="n": aendert sich die Zahl, zaehlt sie sichtbar hoch (bzw. runter) und hopst kurz (Klasse st-zahl-neu)
// Spiele, deren nach() bei jedem Zeichnen selbst Lauscher an ihre Elemente haengt, setzen weich: false (app.js).

const schluessel = (k) => (k.nodeType === 1 ? k.getAttribute("data-key") || k.id || null : null);
const FELD = /^(INPUT|TEXTAREA|SELECT)$/;

// Inhalt von ziel an das HTML angleichen. Gibt die Zahl der neu eingesetzten Elemente zurueck (fuer Tests).
export function einsetzenWeich(ziel, html) {
  const vorlage = document.createElement(ziel.tagName === "TBODY" ? "table" : "div");
  vorlage.innerHTML = html;
  const zaehler = { neu: 0, zahlen: [] };
  kinderAngleichen(ziel, vorlage, zaehler);
  zaehler.zahlen.forEach(([el, von]) => zahlLaufen(el, von));
  return zaehler.neu;
}

function kinderAngleichen(alt, neu, z) {
  const neuKinder = [...neu.childNodes];
  // alte Elemente mit Schluessel (koennen von anderer Stelle geholt werden)
  const mitSchluessel = new Map();
  alt.childNodes.forEach((k) => { const s = schluessel(k); if (s && !mitSchluessel.has(s)) mitSchluessel.set(s, k); });
  neuKinder.forEach((nk, i) => {
    const hier = alt.childNodes[i] || null, s = schluessel(nk);
    let treffer = null;
    if (s) { const k = mitSchluessel.get(s); if (k && k.nodeName === nk.nodeName && !feldNeu(k, nk)) treffer = k; }
    else treffer = ohneSchluesselSuchen(alt, i, nk);
    if (treffer) {
      if (s) mitSchluessel.delete(s);
      if (treffer !== hier) alt.insertBefore(treffer, hier);
      knotenAngleichen(treffer, nk, z);
    } else {
      alt.insertBefore(nk, hier);
      if (nk.nodeType === 1) z.neu++;
    }
  });
  while (alt.childNodes.length > neuKinder.length) alt.lastChild.remove();
}

// Partner ohne Schluessel: zuerst ein Element gleicher Art UND gleicher Klasse ein paar Stellen weiter (so verrutscht nichts,
// wenn davor etwas dazukommt oder wegfaellt - z. B. ein verstecktes Merkzeichen), sonst das Element genau an dieser Stelle
function ohneSchluesselSuchen(alt, i, nk) {
  const passt = (k) => k && !schluessel(k) && k.nodeType === nk.nodeType && k.nodeName === nk.nodeName && !feldNeu(k, nk);
  if (nk.nodeType === 1) {
    const kl = nk.getAttribute("class") || "";
    for (let j = i, n = 0; j < alt.childNodes.length && n < 8; j++) {
      const k = alt.childNodes[j];
      if (k.nodeType !== 1) continue;
      n++;
      if (passt(k) && (k.getAttribute("class") || "").replace(/\s*\bstill\b/, "") === kl) return k;
    }
  }
  const hier = alt.childNodes[i];
  return passt(hier) ? hier : null;
}

// neues Eingabefeld statt Angleichen: andere Runde (data-rk) oder andere Art (type)
function feldNeu(a, b) {
  if (a.nodeType !== 1 || !FELD.test(a.tagName)) return false;
  return (a.getAttribute("data-rk") || "") !== (b.getAttribute("data-rk") || "") || (a.getAttribute("type") || "") !== (b.getAttribute("type") || "");
}

function knotenAngleichen(a, b, z) {
  if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  const zahlVorher = a.getAttribute("data-zahl");
  const feld = FELD.test(a.tagName), details = a.tagName === "DETAILS", warOffen = details && a.open;
  merkmaleAngleichen(a, b, feld);
  if (details && warOffen && !b.hasAttribute("open")) a.open = true;   // vom Nutzer aufgeklappt: bleibt auf
  if (!a.hasAttribute("data-eigen")) kinderAngleichen(a, b, z);
  if (feld) feldAngleichen(a, b);
  const zahlNeu = a.getAttribute("data-zahl");
  if (zahlVorher !== null && zahlNeu !== null && zahlVorher !== zahlNeu) z.zahlen.push([a, Number(zahlVorher)]);
}

function merkmaleAngleichen(a, b, feld) {
  for (const x of [...a.attributes]) if (!b.hasAttribute(x.name) && !(feld && x.name === "value")) a.removeAttribute(x.name);
  const still = a.classList.contains("still");   // "still" setzt app.js nach dem Einsetzen: bleibt, sonst startete die Animation neu
  for (const x of b.attributes) {
    if (feld && x.name === "value") continue;
    const w = x.name === "class" && still && !/(^|\s)still(\s|$)/.test(x.value) ? `${x.value} still` : x.value;
    if (a.getAttribute(x.name) !== w) a.setAttribute(x.name, w);
  }
  if (still && !b.hasAttribute("class")) a.className = "still";
}

// Felder ohne id verhalten sich wie neu eingesetzt (Vorgabewert aus dem HTML); Felder mit id behalten, was getippt ist -
// genau wie bisher (felderMerken/felderZurueck in app.js arbeiten nur mit id). Haken und Auswahlknoepfe folgen dem HTML.
function feldAngleichen(a, b) {
  if (a.type === "checkbox" || a.type === "radio") { a.checked = b.defaultChecked; return; }
  if (a.tagName === "SELECT") { if (!a.id) a.selectedIndex = b.selectedIndex; return; }
  const vorgabe = b.getAttribute("value") ?? (a.tagName === "TEXTAREA" ? b.textContent : "");
  if (a.getAttribute("value") !== b.getAttribute("value")) { if (b.hasAttribute("value")) a.setAttribute("value", vorgabe); else a.removeAttribute("value"); }
  if (!a.id && a !== document.activeElement && a.value !== vorgabe) a.value = vorgabe;
}

// ---------------------------------------------------------------- Punkte zaehlen sichtbar hoch
const LAEUFT = new WeakMap();
export const ZAHL_DAUER = 650;
function zahlLaufen(el, von) {
  const bis = Number(el.getAttribute("data-zahl"));
  if (!Number.isFinite(von) || !Number.isFinite(bis)) return;
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Text des Elements (ohne Kinder-Elemente) ist die Zahl; Vor- und Nachsatz (z. B. "🍺") bleiben stehen
  const textKnoten = [...el.childNodes].find((k) => k.nodeType === 3 && /-?\d/.test(k.nodeValue));
  if (!textKnoten) return;
  const muster = textKnoten.nodeValue, start = performance.now(), lauf = {};
  LAEUFT.set(el, lauf);
  el.classList.remove("st-zahl-neu"); void el.offsetWidth; el.classList.add("st-zahl-neu", bis > von ? "st-zahl-hoch" : "st-zahl-runter");
  if (still) return;
  const schritt = () => {
    if (LAEUFT.get(el) !== lauf || !el.isConnected) return;
    const u = Math.min(1, (performance.now() - start) / ZAHL_DAUER), w = Math.round(von + (bis - von) * (1 - Math.pow(1 - u, 3)));
    if (textKnoten.parentNode === el) textKnoten.nodeValue = muster.replace(/-?\d+/, String(w));
    if (u < 1) requestAnimationFrame(schritt);
    else el.classList.remove("st-zahl-hoch", "st-zahl-runter");
  };
  schritt();
}
