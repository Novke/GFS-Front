// Jedini spisak komandi LaTeX-a koje se ne crtaju i ne čuvaju (odluka 5a). Bez uvoza: koriste ga i statički prikaz
// (`formula-markup`, sa `mathlive/ssr`) i editor (dijalog i pravila formule, F16), a editor ne sme da uvuče `mathlive/ssr`.

/** Komande koje prave atribute, stil ili link iz LaTeX-a (`\csname htmlStyle\endcsname` sastavlja komandu iz teksta). */
export const KOMANDE_ZABRANJENE: readonly string[] = ['href', 'url', 'style', 'class', 'cssId', 'csname'];
/** Cele porodice: `\html…` (`\htmlClass` je alias za `\class`, `\htmlStyle`, `\htmlId`, `\htmlData`, i buduće). */
export const PORODICE_ZABRANJENE: readonly string[] = ['html'];

/**
 * Komande sa spiskova gore, i zapis `^^` (TeX: `^^5c` je `\`; `\ce` i `\pu` (mhchem) ponovo parsiraju svoj argument, pa
 * bi `\ce{^^5chtmlClass{…}{…}}` sastavio zabranjenu komandu bez nje u izvoru; u ispravnoj formuli `^^` nema smisla).
 * Bez zastavice `g`: `.test` se zove više puta nad istim objektom (sa `g` bi pamtio `lastIndex`).
 * Ovo je samo prvo sito (i poruka korisniku); jedina garancija je sanitizer markup-a (`formula-sanitizer.ts`, sloj c).
 */
export const ZABRANJENE_KOMANDE = new RegExp(
  String.raw`\\(?:${[...PORODICE_ZABRANJENE.map((p) => `${p}[A-Za-z]*`), ...KOMANDE_ZABRANJENE].join('|')})(?![A-Za-z])|\^\^`,
);

/** Spisak za poruku korisniku (dijalog formule), građen iz istih spiskova: `\href, …, \csname, \html…`. */
export const OPIS_ZABRANJENIH_KOMANDI = [
  ...KOMANDE_ZABRANJENE.map((k) => `\\${k}`), ...PORODICE_ZABRANJENE.map((p) => `\\${p}…`),
].join(', ');
