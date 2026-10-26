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
