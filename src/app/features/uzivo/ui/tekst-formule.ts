// Formule u tekstu pitanja i opcija (spec 16.1): `$...$` po pravilu pandoc-a (`tex_math_dollars`, odluka 2 plana
// faze 5). Bez Angular-a i bez uvoza osim tipova iz `marked` (brišu se pri prevođenju): javni deo ga sme uvoziti
// (DOZVOLJENO_PO_FEATURE, odluka 4). Crtanje formula je u `tekst-formule.component.ts` (kroz `ui/formula-markup.ts`).
import type { MarkedExtension, Token, Tokens } from 'marked';

/** Klasa mesta formule: `<span class="uz-formula">$izvor$</span>` (izvor je i rezervni prikaz). */
export const KLASA_FORMULE = 'uz-formula';
export type DeoTeksta = { vrsta: 'TEKST'; tekst: string } | { vrsta: 'FORMULA'; latex: string };
export interface PripremljenTekst {
  html: string;
  formula: boolean;
}

/**
 * Formula na početku teksta: `$`, pa znak koji nije razmak ni `$`; sadržaj bez novog reda i bez neizbegnutog `$`
 * (`\$` i bilo koji `\x` su deo LaTeX-a); poslednji znak nije razmak ni `\`; posle zatvarajućeg `$` ne sledi cifra.
 * Izuzetak od pandoc-a: otvarajući `$` koji neposredno sledi cifru ne otvara formulu (iznosi: `5$, a sa popustom 4$.`,
 * `10$-20$`), pa je `2$x$` tekst; to proveravaju pozivaoci jer ovde nema znaka ispred (`podeliFormule`, tokenizer ekstenzije).
 * Dve grane sadržaja počinju različitim znakom (`\` ili ne-`\`), pa je pretraga linearna (bez eksplozije vraćanja).
 */
const FORMULA = /^\$(?=[^\s$])((?:\\[^\n]|[^\\$\n])+?)(?<=[^\s\\])\$(?!\d)/;

/** Isti izraz bez `^`, lepljiv (`y`): proba na poziciji `lastIndex` bez sečenja niza. */
const FORMULA_NA = new RegExp(FORMULA.source.slice(1), 'y');

/**
 * Maska za `hooks.emStrongMask` (`marked` 18): unutrašnjost svake formule postaje `a`, pa `*`, `_` i `~` u njoj nisu
 * graničnici naglašavanja ni precrtavanja (`*x $a*b$ y*` je kurziv oko cele formule, kao u pandoc-u). `marked` je već
 * zamenio izbegnute znakove (`\$` -> `++`) i kod u redu (`[aaa]`), pa ih maska ne vidi kao formulu; ostala pravila su ista
 * kao u `podeliFormule` (i `$` posle cifre). Dužina ostaje ista; jedan prolaz.
 */
export function maskirajFormule(src: string): string {
  let izlaz = '';
  let i = 0;
  while (i < src.length) {
    const j = src.indexOf('$', i);
    if (j < 0) {
      break;
    }
    FORMULA_NA.lastIndex = j;
    const m = j > 0 && /\d/.test(src[j - 1]) ? null : FORMULA_NA.exec(src);
    izlaz += src.slice(i, j) + (m ? '$' + 'a'.repeat(m[0].length - 2) + '$' : '$');
    i = j + (m ? m[0].length : 1);
  }
  return izlaz + src.slice(i);
}

/** Formula na POČETKU `src` (za `marked` i za `podeliFormule`); `duzina` uključuje oba `$`. */
export function nadjiFormulu(src: string): { latex: string; duzina: number } | null {
  const m = FORMULA.exec(src);
  return m ? { latex: m[1], duzina: m[0].length } : null;
}

/** Običan tekst (opcija) u delove; `\$` van formule je znak dolara, ostale kose crte ostaju. */
export function podeliFormule(tekst: string | null | undefined): DeoTeksta[] {
  const s = tekst ?? '';
  const delovi: DeoTeksta[] = [];
  let tekuci = '';
  for (let i = 0; i < s.length; ) {
    if (s[i] === '\\' && s[i + 1] === '$') {
      tekuci += '$';
      i += 2;
      continue;
    }
    if (s[i] === '$' && !(i > 0 && /\d/.test(s[i - 1]))) {
      const f = nadjiFormulu(s.slice(i));
      if (f) {
        if (tekuci) {
          delovi.push({ vrsta: 'TEKST', tekst: tekuci });
        }
        tekuci = '';
        delovi.push({ vrsta: 'FORMULA', latex: f.latex });
        i += f.duzina;
        continue;
      }
    }
    tekuci += s[i++];
  }
  if (tekuci) {
    delovi.push({ vrsta: 'TEKST', tekst: tekuci });
  }
  return delovi;
}

export const imaFormulu = (tekst: string | null | undefined): boolean =>
  podeliFormule(tekst).some((d) => d.vrsta === 'FORMULA');

/** Za `aria-label`: formula kao LaTeX izvor bez `$`, `\$` kao `$`. */
export function tekstZaCitac(tekst: string | null | undefined): string {
  return podeliFormule(tekst)
    .map((d) => (d.vrsta === 'TEKST' ? d.tekst : d.latex))
    .join('');
}

const ZNACI: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (z) => ZNACI[z]);
const mesto = (latex: string): string => `<span class="${KLASA_FORMULE}">${escapeHtml(`$${latex}$`)}</span>`;

/** Običan tekst -> HTML (sve escape-ovano) sa mestom za svaku formulu; izvor u mestu je i rezervni prikaz. */
export function tekstSaFormulama(tekst: string | null | undefined): PripremljenTekst {
  const delovi = podeliFormule(tekst);
  return {
    html: delovi.map((d) => (d.vrsta === 'TEKST' ? escapeHtml(d.tekst) : mesto(d.latex))).join(''),
    formula: delovi.some((d) => d.vrsta === 'FORMULA'),
  };
}

/** Običan tekst tokena (za `alt` slike): formula je LaTeX izvor, ne tekst markupa mesta. */
export function tekstTokena(t: Tokens.Generic): string {
  if (t.type === 'formula') {
    return (t as FormulaToken).latex;
  }
  if (t.tokens) {
    return t.tokens.map((p) => tekstTokena(p as Tokens.Generic)).join('');
  }
  return t.type === 'escape' ? t['raw'].slice(1) : (t['raw'] as string); // `text` je već HTML-escape-ovan, `raw` je izvor
}

interface FormulaToken extends Tokens.Generic {
  type: 'formula';
  raw: string;
  latex: string;
}

/**
 * `marked` ekstenzija za formulu u redu. Kod u redu i blokovi koda se tokenizuju pre nje (ostaju doslovni), a `\$`
 * hvata `escape` tokenizer (zato `start` preskače izbegnut `$`). `emStrongMask` krije formule od naglašavanja.
 */
export const formulaMarked: MarkedExtension = {
  hooks: { emStrongMask: maskirajFormule },
  extensions: [
    {
      name: 'formula',
      level: 'inline',
      start(src: string) {
        const m = /(?<!\\)\$/.exec(src);
        return m ? m.index : undefined;
      },
      tokenizer(src: string, tokeni: Token[]) {
        // `marked` poziva `start` nad `src.slice(1)`, pa tu nema znaka ispred; zato cifru ispred proverava tokenizer
        if (/\d$/.test(tokeni.at(-1)?.raw ?? '')) {
          return undefined;
        }
        const f = nadjiFormulu(src);
        return f ? ({ type: 'formula', raw: src.slice(0, f.duzina), latex: f.latex } as FormulaToken) : undefined;
      },
      renderer(t: Tokens.Generic) {
        return mesto((t as FormulaToken).latex);
      },
    },
  ],
};
