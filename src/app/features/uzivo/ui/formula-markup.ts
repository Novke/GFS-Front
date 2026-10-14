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

/** Ishod jedne konverzije: očišćen fragment (null = crta se izvor) i veličina za keš (znakovi markup-a ili LaTeX-a). */
export interface Konverzija { fragment: DocumentFragment | null; velicina: number; }

function pretvori(latex: string, f: typeof convertLatexToMarkup): Konverzija {
  try {
    const html = f(latex, { defaultMode: 'math' });
    // preveliki markup (npr. duboko ugnježdeni koreni) se ne parsira: izvor
    return html.length > MAX_MARKUP ? { fragment: null, velicina: latex.length } : { fragment: ocistiMarkup(html), velicina: html.length };
  } catch {
    // npr. \href{javascript:...} baca iz MathLive-a; projektor (afterRenderEffect) ne sme da padne (Review Focus 5)
    return { fragment: null, velicina: latex.length };
  }
}

/** `convertLatexToMarkup` u try/catch (izuzetak -> null), pa `ocistiMarkup`; `f` je zamenljiv radi testa grane catch. */
export function konvertuj(latex: string, f: typeof convertLatexToMarkup = convertLatexToMarkup): DocumentFragment | null {
  return pretvori(latex, f).fragment;
}

/** Provere pre MathLive-a (prazno, zabranjena komanda, strukturni trošak, `validateLatex`), pa konverzija; bez keša. */
export function konverzija(latex: string, f: typeof convertLatexToMarkup = convertLatexToMarkup): Konverzija {
  const odbijena = { fragment: null, velicina: latex.length };
  if (!latex.trim() || ZABRANJENE_KOMANDE.test(latex) || preTeskaFormula(latex)) return odbijena;
  try {
    if (validateLatex(latex).length > 0) return odbijena;
  } catch {
    return odbijena;
  }
  return pretvori(latex, f);
}

/** Najviše formula u kešu (= najviše slojeva jednog slajda na serveru) i ukupno znakova njihovog markup-a. */
export const MAX_KES_FORMULA = 300;
export const MAX_KES_ZNAKOVA = 4_000_000;

/**
 * Keš LaTeX -> očišćen fragment (posle sanitizera), LRU po broju stavki i zbiru veličina. Jedan po prozoru (modul se učitava
 * jednom), pa ga dele projektor, konzola (trenutni i sledeći slajd, više prikaza istog slajda) i editor: ista formula se ne
 * pretvara ponovo (zbirni trošak slajda sa mnogo formula, recenzija 4b B Minor 1). Vraća kopiju, pa pozivalac ne može da
 * pokvari keširan fragment.
 */
export class KesFormula {
  private readonly stavke = new Map<string, Konverzija>();
  private zbir = 0;

  constructor(
    private readonly pretvoriLatex: (latex: string) => Konverzija,
    private readonly maxStavki = MAX_KES_FORMULA,
    private readonly maxZnakova = MAX_KES_ZNAKOVA,
  ) {}

  markup(latex: string): DocumentFragment | null {
    let k = this.stavke.get(latex);
    if (k) {
      // poslednja upotreba na kraj (Map čuva redosled umetanja)
      this.stavke.delete(latex);
      this.stavke.set(latex, k);
    } else {
      k = this.pretvoriLatex(latex);
      this.stavke.set(latex, k);
      this.zbir += k.velicina;
      for (const [stari, s] of this.stavke) {
        if (this.stavke.size <= this.maxStavki && this.zbir <= this.maxZnakova) break;
        this.stavke.delete(stari);
        this.zbir -= s.velicina;
      }
    }
    return k.fragment ? (k.fragment.cloneNode(true) as DocumentFragment) : null;
  }

  get broj(): number {
    return this.stavke.size;
  }
}

const kes = new KesFormula((latex) => konverzija(latex));

/** Markup za LaTeX (prikaz "math"), očišćen; null kad LaTeX nije ispravan, ima zabranjenu komandu ili konverzija baci. */
export function latexUMarkup(latex: string): DocumentFragment | null {
  return kes.markup(latex);
}
