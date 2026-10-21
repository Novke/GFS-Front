// Vremenske granice specova formula (recenzija 4b B, Important 2): CI je deljen i 2-3 puta sporiji od lokalne mašine, pa
// nijedna granica ne sme da bude blizu izmerenog vremena. Dve klase, jedno mesto:
// - odbijen ulaz (linearna provera ili regex nad kratkom vrednošću, MathLive se ni ne zove): lokalno ~0-5 ms;
// - ulaz koji prolazi proveru (pravi `convertLatexToMarkup` + sanitizer u jsdom-u, i najveći dozvoljeni markup): lokalno
//   najviše ~320 ms. Greška koju ovi testovi hvataju (kvadratno ili eksponencijalno vreme) je reda sekundi do minuta.

/** Odbijen ulaz: provera pre MathLive-a ili regex sa granicom dužine. */
export const GRANICA_ODBIJENE_MS = 100;
/** Ulaz koji prolazi proveru i ide kroz MathLive i sanitizer (jsdom), uklj. linearne ulaze tik ispod `MAX_MARKUP`. */
export const GRANICA_PROLAZI_MS = 1500;
/**
 * Ulaz tik ispod granice dužine koji NE zove MathLive (samo sanitizer): granica 100 ms hvata kvadratnu regresiju (stari
 * kvadratni regex na 19 999 znakova traje ~178 ms), a linearni prolaz traje par ms, pa je rezerva za CI velika.
 */
export const GRANICA_TIK_ISPOD_MS = 100;
/**
 * Ceo Markdown sa formulama (`marked` + maska formula, bez MathLive-a) za najgori ulaz do 2000 znakova: lokalno ~20-60 ms, a
 * pod opterećenjem servera izmereno i 114 ms (F16), pa 100 ms nije bilo dovoljno za CI (2-3x sporiji). Greška koju test hvata
 * je katastrofalno (eksponencijalno) vraćanje regexa: sekunde i više, daleko iznad ove granice.
 */
export const GRANICA_MARKDOWN_MS = 400;
