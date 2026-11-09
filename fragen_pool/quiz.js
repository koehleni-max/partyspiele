// Fragen-Pool Quiz (DUM-E, 09.11.2026, Nico: "tausende Fragen unterschiedlich"): alle neuen Quizfragen in einer Liste.
// Format wie inhalte2.js QUIZ: [Frage, richtig, falsch, falsch, falsch] - die richtige steht vorn, das Spiel mischt.
// Keine Dublette zu den alten Listen (QUIZ, QUIZ_HALLOWEEN, MILLIONAER, DAMALS) und untereinander - prueft
// test_fragen_pool.py. Fuer Wiederholungsschutz ueber Abende: fragen_gedaechtnis.js.
import { QUIZ_1 } from "./quiz_1.js";
import { QUIZ_2 } from "./quiz_2.js";
import { QUIZ_3 } from "./quiz_3.js";
import { QUIZ_4 } from "./quiz_4.js";
import { QUIZ_5 } from "./quiz_5.js";
import { QUIZ_6 } from "./quiz_6.js";

// Themen fuer eine spaetere Auswahl im Spiel (Name, Liste)
export const QUIZ_THEMEN = {
  deutschland_geschichte: ["🇩🇪 Deutschland & Geschichte", QUIZ_1],
  welt: ["🌍 Welt & Geografie", QUIZ_2],
  natur: ["🌿 Natur, Körper & Weltall", QUIZ_3],
  essen_sport: ["🍕 Essen & Sport", QUIZ_4],
  popkultur: ["🎬 Musik, Film & Spiele", QUIZ_5],
  wissen: ["💡 Technik, Sprache & Kurioses", QUIZ_6],
};

export const QUIZ_POOL = [].concat(QUIZ_1, QUIZ_2, QUIZ_3, QUIZ_4, QUIZ_5, QUIZ_6);
