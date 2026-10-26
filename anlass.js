// Anlass und Aussehen eines Raums (Nico 26.10.2026: "Anlass frei waehlbar", "Aussehen je Anlass").
// Der Anlass wird beim Oeffnen gewaehlt (Halloween, Geburtstag oder frei eingetippt) und steht im Raum - nirgends ist
// ein fester Anlass eingebaut. Das Aussehen folgt dem Anlass und laesst sich von der Spielleitung umschalten.
// Stromsparend: keine Dauer-Animationen auf den Handys; Effekte laufen einmal (Eingang, Meldung) und sind dann still.
import { esc } from "./hilfe.js";

export const ANLAESSE = {
  halloween: { emoji: "🎃", name: "Halloween", titel: "Halloween-Party", look: "halloween" },
  geburtstag: { emoji: "🎂", name: "Geburtstag", titel: "Geburtstagsparty", look: "geburtstag" },
  frei: { emoji: "✨", name: "Eigener Anlass", titel: "", look: "edel" },
};
export const LOOKS = {
  halloween: { emoji: "🎃", name: "Halloween", farbe: "#0a0604", kurz: "Kürbisse, Nebel, Orange und Schwarz" },
  geburtstag: { emoji: "🎉", name: "Geburtstag", farbe: "#0d0e1a", kurz: "Konfetti und Party-Farben" },
  edel: { emoji: "✨", name: "Schlicht", farbe: "#08090d", kurz: "dunkel, ruhig, edel" },
};

export const TEXT_MAX = 30;
export function anlassNeu(art, text = "") {
  if (!ANLAESSE[art]) return null;
  const t = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, TEXT_MAX);
  if (art === "frei" && !t) return null;
  return { art, text: art === "frei" ? t : "" };
}
export const lookZu = (anlass) => (anlass && ANLAESSE[anlass.art] ? ANLAESSE[anlass.art].look : "geburtstag");
export const lookGueltig = (look) => Object.prototype.hasOwnProperty.call(LOOKS, look);

// "🎃 Halloween-Party" / "✨ Hüttenabend" (Text, nicht HTML)
export function titel(anlass) {
  if (!anlass || !ANLAESSE[anlass.art]) return "Partyspiele";
  const a = ANLAESSE[anlass.art];
  return `${a.emoji} ${anlass.art === "frei" ? anlass.text : a.titel}`;
}

export function lookAnwenden(look) {
  const l = lookGueltig(look) ? look : "";
  if (document.body.dataset.look !== l) {
    if (l) document.body.dataset.look = l; else delete document.body.dataset.look;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = l ? LOOKS[l].farbe : "#14102a";
  }
}

// Kleine, ruhige Verzierung im Raumkopf (keine Bewegung)
export function deko(look) {
  if (look === "halloween") return `<div class="deko" aria-hidden="true">🦇 🕸️ 🎃 👻 🕯️</div>`;
  if (look === "geburtstag") return `<div class="deko" aria-hidden="true">🎈 🎉 🎂 🎁 🎈</div>`;
  return `<div class="deko edel" aria-hidden="true">✦ ✦ ✦</div>`;
}
export const logo = (look) => (look === "halloween" ? "🎃" : look === "edel" ? "✨" : "🎉");

// Welcher Klang zu welchem Moment passt
const KLAENGE = {
  halloween: { eingang: "grusel", meldung: "geist", beitritt: "knarzen", los: "kichern" },
  geburtstag: { eingang: "sieg", meldung: "dran", beitritt: "pop", los: "los" },
  edel: { eingang: "gong", meldung: "dran", beitritt: "pop", los: "los" },
};
export const klang = (look, moment) => (KLAENGE[look] || KLAENGE.geburtstag)[moment] || "pop";

// Einmaliger Eingangs-Effekt (je Raum und Tab einmal): Fledermaeuse, Konfetti oder nur ein Ton
export function eingang(look, konfetti, spiele) {
  if (look === "geburtstag") { konfetti(70); return; }
  spiele(klang(look, "eingang"));
  if (look !== "halloween") return;
  for (let i = 0; i < 4; i++) {
    const f = document.createElement("i");
    f.className = "fledermaus";
    f.textContent = "🦇";
    f.style.top = 8 + i * 13 + "vh";
    f.style.animationDelay = i * 0.35 + "s";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 4200 + i * 350);
  }
}

export const titelHTML = (anlass) => esc(titel(anlass));
