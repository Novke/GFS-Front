import { convertLatexToMarkup, validateLatex } from 'mathlive/ssr';
import { ZABRANJENE_KOMANDE, preTeskaFormula } from './formula-komande';
import { MAX_MARKUP, ocistiMarkup } from './formula-sanitizer';

/*
 * Statički prikaz formule (odluka 5 i 6 plana editora): LaTeX -> markup MathLive-a, očišćen po dozvoljenoj listi. LaTeX
 * dolazi iz dokumenta (uvezen PPTX ili otkucan), pa je nepouzdan ulaz: MathLive za `\href`, `\htmlStyle`, `\cssId`,
 * `\htmlData`, ... piše `href`, spoljni `url(...)` u stilu, `id`, `data-*`. Tri sloja: (a) formula sa komandom koja pravi
 * atribute ili stil se ne pretvara (crta se izvor), (b) izuzetak MathLive-a = izvor, (c) markup prolazi sanitizer sa
 * dozvoljenom listom elemenata, atributa i deklaracija stila (`formula-sanitizer.ts`). Ovaj modul učitava SAMO
 * `formula-ucitavanje.ts`, dinamički.
 */

// spisak zabranjenih komandi (odluka 5a) je u `formula-komande.ts`: deli ga i editor (dijalog formule, F16) bez mathlive/ssr
export { ZABRANJENE_KOMANDE } from './formula-komande';

export { markupNepromenjen, ocistiMarkup, ocistiStil } from './formula-sanitizer';

/** `convertLatexToMarkup` u try/catch (izuzetak -> null), pa `ocistiMarkup`; `f` je zamenljiv radi testa grane catch. */
export function konvertuj(latex: string, f: typeof convertLatexToMarkup = convertLatexToMarkup): DocumentFragment | null {
  try {
    const html = f(latex, { defaultMode: 'math' });
    // preveliki markup (npr. duboko ugnježdeni koreni) se ne parsira: izvor
    return html.length > MAX_MARKUP ? null : ocistiMarkup(html);
  } catch {
    // npr. \href{javascript:...} baca iz MathLive-a; projektor (afterRenderEffect) ne sme da padne (Review Focus 5)
    return null;
  }
}

/** Markup za LaTeX (prikaz "math"), očišćen; null kad LaTeX nije ispravan, ima zabranjenu komandu ili konverzija baci. */
export function latexUMarkup(latex: string): DocumentFragment | null {
  if (!latex.trim() || ZABRANJENE_KOMANDE.test(latex) || preTeskaFormula(latex)) return null;
  try {
    if (validateLatex(latex).length > 0) return null;
  } catch {
    return null;
  }
  return konvertuj(latex);
}
