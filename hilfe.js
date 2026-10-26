// Gemeinsame Helfer fuer alle Spiele
export const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const knopf = (text, a, kl = "", extra = "") => `<button class="${kl}" data-a='${JSON.stringify(a).replace(/'/g, "&#39;")}' ${extra}>${text}</button>`;
export const zufall = (n) => Math.floor(Math.random() * n);
export const ziehe = (liste) => liste[zufall(liste.length)];
export function mischen(a) { for (let i = a.length - 1; i > 0; i--) { const j = zufall(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export const name = (namen, i) => `<b class="n${i}">${esc(namen[i])}</b>`;
export const schlucke = (n) => `${n} ${n === 1 ? "Schluck" : "Schlucke"}`;
// Namen auf der Turniertafel und in der Gesamtwertung: Leerzeichen glatt, hoechstens 24 Zeichen
export const nameSauber = (n) => String(n ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
// "Ohne Alkohol": Trink-Woerter in fertigem HTML gegen Strafpunkte tauschen (Handy und Beamer gleich)
export function ohneAlkohol(h) {
  return h.replace(/trinkt das Klatschglas aus/g, "bekommt 5 Strafpunkte")
    .replace(/(\d+)\s*Schlucke/g, "$1 Strafpunkte").replace(/(\d+)\s*Schluck\b/g, "$1 Strafpunkt")
    .replace(/einen Schluck/g, "einen Strafpunkt").replace(/\btrinkt\b/g, "bekommt").replace(/\btrinken\b/g, "bekommen")
    .replace(/klatscht/g, "bekommt einen Strafpunkt").replace(/🍺|🍻|🥃/g, "⚡").replace(/Schlucke/g, "Strafpunkte").replace(/Schluck\b/g, "Strafpunkt");
}
