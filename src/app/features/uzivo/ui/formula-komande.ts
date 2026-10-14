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


/**
 * Najveća dubina ugnježdavanja formule (F15 fix 3). MathLive kvadratno širi ugnježdene korene: `\sqrt{` 700 puta
 * (4201 znak) daje 36 MB HTML-a i 20 s crtanja na projektoru. Izmereno: dubina 32 i najteži legitimni oblici (`pmatrix`
 * 30x30, `\sqrt` 32 nivoa, verižni razlomak) ostaju ispod ~0,2 MB i par desetina ms; formula iz nastave ne prelazi ~6.
 */
export const MAX_DUBINA_FORMULE = 32;

/**
 * Dubina ugnježdavanja LaTeX-a bez MathLive-a (linearan prolaz, bez regexa): `{…}`, `\left…\right` i `\begin…\end`
 * (eksponenti i indeksi su ugnježdeni kroz `{`; bez zagrada se ne mogu ugnjezditi). `\{` i `\}` su znakovi, `\\` je
 * novi red. Višak zatvaranja ne spušta dubinu ispod nule.
 */
export function dubinaFormule(latex: string): number {
  let dubina = 0;
  let max = 0;
  const gore = () => { if (++dubina > max) max = dubina; };
  const dole = () => { if (dubina > 0) dubina--; };
  for (let i = 0; i < latex.length; i++) {
    const z = latex[i];
    if (z === '{') gore();
    else if (z === '}') dole();
    else if (z === '\\') {
      let j = i + 1;
      while (j < latex.length && /[A-Za-z]/.test(latex[j])) j++;
      if (j === i + 1) {
        i++; // `\{`, `\}`, `\\`, `\,` ...: jedan znak, ne zagrada
        continue;
      }
      const komanda = latex.slice(i + 1, j);
      if (komanda === 'left' || komanda === 'begin') gore();
      else if (komanda === 'right' || komanda === 'end') dole();
      i = j - 1;
    }
  }
  return max;
}

/** Formula dublja od `MAX_DUBINA_FORMULE`: ne crta se (izvor), dijalog je ne čuva. */
export const preDubokaFormula = (latex: string): boolean => dubinaFormule(latex) > MAX_DUBINA_FORMULE;
