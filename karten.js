// Normales 52er-Blatt
const FARBEN = ["♠", "♥", "♦", "♣"];
const WERTE = [2, 3, 4, 5, 6, 7, 8, 9, 10, "B", "D", "K", "A"];

export function deck52() {
  const d = [];
  for (const f of FARBEN) for (const w of WERTE) d.push({ f, w });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
export const rot = (k) => k && (k.f === "♥" || k.f === "♦");
export const wert = (k) => ({ B: 11, D: 12, K: 13, A: 14 }[k.w] || Number(k.w));
export const zeige = (k) => `${k.w}${k.f}`;
