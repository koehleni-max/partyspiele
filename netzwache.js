// Netzwache der Spielleitung (Geburtstags-Runde A, Vorschlaege 122, 126, 130): wer ist wie gut verbunden, wessen Akku geht
// zu Ende, wer hat "Geht nicht" gedrueckt. Liest puls/, da/ und meldungen/ (net.js) - am Handy der Spielleitung, am Pult
// und beim Gastgeber (der braucht den Puls fuer den Wiedereinstieg). Gaeste lesen das alles nicht, das spart Hotspot.
import { esc } from "./hilfe.js";

export const PULS_GELB = 15000;   // so lange ohne Lebenszeichen: wackelt (der Puls kommt alle 6 s, zwei duerfen ausfallen)
export const PULS_ROT = 30000;    // so lange: weg
export const LANGSAM_MS = 2000;   // braucht ein Puls so lange bis zur Bestaetigung, ist die Leitung schlecht
export const AKKU_GRENZE = 0.15;
const AKKU_WIEDER = 0.2;          // erst ab hier gilt der Akku wieder als erholt (sonst meldet er sich um die Grenze herum dauernd)

const basis = (id) => String(id).replace(/-pad\d+$/, "");   // Controller haengen am Puls ihres Geraets

// -> "gruen" | "gelb" | "rot"
export function ampel(da, puls, jetzt) {
  if (!da) return "rot";
  if (!puls || !puls.t) return "gelb";
  const alter = jetzt - puls.t;
  if (alter > PULS_ROT) return "rot";
  return alter > PULS_GELB || (puls.ms || 0) > LANGSAM_MS ? "gelb" : "gruen";
}
export const akkuKnapp = (puls) => !!puls && typeof puls.akku === "number" && puls.akku < AKKU_GRENZE && !puls.laedt;
export const ampelText = { gruen: "gut verbunden", gelb: "Verbindung wackelt", rot: "nicht verbunden", ohne: "ohne Handy" };

// Akku fuer den Puls. Nur Chrome am Android und am PC geben ihn heraus - Safari am iPhone und Firefox nicht, dann bleibt die
// Anzeige ehrlich leer. Die Spielleitung sieht nur Zahlen, die wirklich vom Handy kommen.
let batterie = null;
export function akkuStarten() {
  if (!navigator.getBattery) return;
  navigator.getBattery().then((b) => { batterie = b; }).catch(() => { batterie = null; });
}
// Manche Browser liefern ein Akku-Objekt ohne echten Wert (keine Zahl): das gilt wie "kein Akku"
export const akkuWerte = () => (batterie && Number.isFinite(batterie.level) ? { akku: Math.round(batterie.level * 100) / 100, laedt: !!batterie.charging } : {});

export class Wache {
  // netz: Verbindung; beiNeu(): Liste hat sich geaendert; melden(text): kurze Nachricht an die Spielleitung
  constructor(netz, { beiNeu, melden } = {}) {
    this.netz = netz; this.beiNeu = beiNeu || (() => {}); this.melden = melden || (() => {});
    this.da = {}; this.puls = {}; this.meldungen = {}; this.protokoll = {};
    this.erstesLesen = true;
    this.akkuGemeldet = new Set();
    this.namen = () => ({});
    netz.beobachten("da", (d) => { this.da = d || {}; this.beiNeu(); });
    netz.beobachten("puls", (p) => { this.puls = p || {}; this.akkuPruefen(); });
    netz.beobachten("meldungen", (m) => this.meldungenLesen(m || {}));
    netz.beobachten("protokoll", (p) => { this.protokoll = p || {}; this.beiNeu(); });
  }
  // Spielprotokoll, neueste zuerst
  protokollListe() { return Object.values(this.protokoll).sort((a, b) => (b.t || 0) - (a.t || 0)); }
  jetzt() { return Date.now() + this.netz.versatz; }
  // Lebenszeichen zu alt: Wiedereinstieg darf den Platz uebernehmen, auch wenn der Server das Handy noch fuer da haelt
  stumm(id) { const p = this.puls[basis(id)]; return !p || !p.t || this.jetzt() - p.t > PULS_ROT; }
  stand(sp) { return sp.stv && !this.da[sp.id] ? "ohne" : ampel(this.da[sp.id], this.puls[basis(sp.id)], this.jetzt()); }
  akkuPruefen() {
    const namen = this.namen();
    Object.entries(this.puls).forEach(([id, p]) => {
      if (akkuKnapp(p)) {
        if (!this.akkuGemeldet.has(id) && namen[id]) { this.akkuGemeldet.add(id); this.melden(`🔋 ${namen[id]}: nur noch ${Math.round(p.akku * 100)} % Akku`); this.beiNeu(); }
      } else if (typeof p.akku !== "number" || p.akku >= AKKU_WIEDER || p.laedt) this.akkuGemeldet.delete(id);
    });
  }
  meldungenLesen(m) {
    const alt = this.meldungen;
    this.meldungen = m;
    if (!this.erstesLesen) Object.entries(m).forEach(([k, x]) => { if (!alt[k] && !x.erledigt) this.melden(`⚠️ ${x.name || "Ein Gast"}: geht nicht${x.spiel ? ` (${x.spiel})` : ""}`); });
    this.erstesLesen = false;
    this.beiNeu();
  }
  offen() { return Object.entries(this.meldungen).filter(([, x]) => !x.erledigt).sort((a, b) => (b[1].t || 0) - (a[1].t || 0)); }
  erledigen(key) { this.netz.schreiben(`meldungen/${key}/erledigt`, true).catch((e) => console.warn(e)); }

  // Punkte alle paar Sekunden nachziehen, ohne die Seite neu zu zeichnen
  auffrischen(wurzel) {
    wurzel.querySelectorAll("[data-ampel]").forEach((el) => {
      const s = this.stand({ id: el.dataset.ampel, stv: el.dataset.stv !== undefined });
      if (el.dataset.stand !== s) { el.dataset.stand = s; el.title = ampelText[s]; }
    });
  }
  // Gaesteliste (Steuerseite und Pult); knoepfe(sp) haengt je Gast eigene Knoepfe an
  gaesteHTML(raum, knoepfe = () => "") {
    return `<div class="gaeste">${raum.spieler.map((sp) => {
      const s = this.stand(sp), p = this.puls[basis(sp.id)], knapp = akkuKnapp(p);
      const akku = typeof (p && p.akku) === "number" ? `<span class="gz-akku ${knapp ? "knapp" : ""}">🔋 ${Math.round(p.akku * 100)} %${p.laedt ? " ⚡" : ""}</span>` : "";
      return `<div class="gz" data-gast="${esc(sp.name)}"><span class="ampel" data-ampel="${esc(sp.id)}" ${sp.stv ? "data-stv" : ""} data-stand="${s}" title="${ampelText[s]}"></span>
        <span class="gz-name">${esc(sp.name)}</span>${akku}<span class="gz-knoepfe">${knoepfe(sp)}</span></div>`;
    }).join("")}</div>`;
  }
  meldungenHTML(attr) {
    const l = this.offen();
    if (!l.length) return "";
    return `<div class="gm-liste">${l.map(([k, x]) => `<div class="gm" data-meldung="${esc(k)}"><span class="gm-text"><b>⚠️ ${esc(x.name || "Gast")}</b> – ${esc(x.spiel || "Übersicht")}<small>${uhrzeit(x.t)}</small></span>
      <button class="klein2" ${attr}="${esc(k)}">✓ Erledigt</button></div>`).join("")}</div>`;
  }
}
const uhrzeit = (t) => (t ? new Date(t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "");
