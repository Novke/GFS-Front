import { Marked } from 'marked';
import { formulaMarked, KLASA_FORMULE, type PripremljenTekst } from './tekst-formule';

/**
 * Sopstvena instanca `marked`-a (globalna ostaje netaknuta). HTML iz izvora se izbacuje u celosti (blokovi i tagovi u
 * redu), a ono što prođe još jednom čisti Angularov sanitizer kroz `[innerHTML]` (spec 2.15).
 */
const parser = new Marked({ gfm: true, breaks: true });
parser.use({ renderer: { html: () => '' } });

/** Markdown -> HTML za `[innerHTML]`; prazan izvor daje prazan string. INFO slajdovi: `$` se ne tumači. */
export function renderMarkdown(src: string | null | undefined): string {
  if (!src) {
    return '';
  }
  return parser.parse(src, { async: false });
}

/**
 * Druga instanca, samo za tekst pitanja: ista pravila i isti HTML filter, plus formula u redu (`$...$`, odluka 2 plana
 * faze 5). Sirov HTML iz izvora se briše, pa niz `<span class="uz-formula">` u izlazu može doći samo iz ekstenzije.
 */
const parserSaFormulama = new Marked({ gfm: true, breaks: true }, formulaMarked);
parserSaFormulama.use({ renderer: { html: () => '' } });

/** Markdown teksta pitanja sa mestima formula (`$...$`); isti HTML filter kao `renderMarkdown`. */
export function markdownSaFormulama(src: string | null | undefined): PripremljenTekst {
  if (!src) {
    return { html: '', formula: false };
  }
  const html = parserSaFormulama.parse(src, { async: false });
  return { html, formula: html.includes(`<span class="${KLASA_FORMULE}">`) };
}
