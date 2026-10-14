// Vremenske granice specova formula (recenzija 4b B, Important 2): CI je deljen i 2-3 puta sporiji od lokalne mašine, pa
// nijedna granica ne sme da bude blizu izmerenog vremena. Dve klase, jedno mesto:
// - odbijen ulaz (linearna provera ili regex nad kratkom vrednošću, MathLive se ni ne zove): lokalno ~0-5 ms;
// - ulaz koji prolazi proveru (pravi `convertLatexToMarkup` + sanitizer u jsdom-u, i najveći dozvoljeni markup): lokalno
//   najviše ~320 ms. Greška koju ovi testovi hvataju (kvadratno ili eksponencijalno vreme) je reda sekundi do minuta.

/** Odbijen ulaz: provera pre MathLive-a ili regex sa granicom dužine. */
export const GRANICA_ODBIJENE_MS = 100;
/** Ulaz koji prolazi proveru i ide kroz MathLive i sanitizer (jsdom), uklj. linearne ulaze tik ispod `MAX_MARKUP`. */
export const GRANICA_PROLAZI_MS = 1500;
