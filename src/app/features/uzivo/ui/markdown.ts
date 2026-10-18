import { Marked, type Tokens } from 'marked';
import { formulaMarked, KLASA_FORMULE, tekstTokena, type PripremljenTekst } from './tekst-formule';

/**
 * Jedini cilj slike u Markdown-u: medij otpremljen u GFS (`api/public/mediji/<uuid>`, relativno na `<base href>`), isto
 * pravilo kao backend (`SlajdPP`, MCP spec 6.5). Slika sa bilo kog drugog cilja (spoljni URL, `data:`, druga putanja,
 * referentni oblik `![a][r]`) se izbacuje u obe instance ispod, pre CSP-a (`img-src`), pa nema ni zahteva ni poruke u
 * konzoli. Bez uvoza: fajl je na javnoj allow-listi (`gfs/javna-ruta-uvozi`).
 */
const DOZVOLJENA_SLIKA = /^api\/public\/mediji\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Sopstvena instanca `marked`-a (globalna ostaje netaknuta). HTML iz izvora se izbacuje u celosti (blokovi i tagovi u
 * redu), slika samo iz GFS-a (`DOZVOLJENA_SLIKA`), a ono što prođe još jednom čisti Angularov sanitizer kroz `[innerHTML]`
 * (spec 2.15).
 */
const parser = new Marked({ gfm: true, breaks: true });
// `''` = nema slike; `false` = podrazumevani renderer slike `marked`-a
parser.use({ renderer: { html: () => '', image: (token) => (DOZVOLJENA_SLIKA.test(token.href) ? false : '') } });

/** Markdown -> HTML za `[innerHTML]`; prazan izvor daje prazan string. INFO slajdovi: `$` se ne tumači. */
export function renderMarkdown(src: string | null | undefined): string {
  if (!src) {
    return '';
  }
  return parser.parse(src, { async: false });
}

/**
 * Druga instanca, samo za tekst pitanja: ista pravila, isti HTML filter i isto pravilo slika, plus formula u redu
 * (`$...$`, odluka 2 plana faze 5). Sirov HTML iz izvora se briše, pa niz `<span class="uz-formula">` u izlazu može doći
 * samo iz ekstenzije.
 */
const parserSaFormulama = new Marked({ gfm: true, breaks: true }, formulaMarked);
parserSaFormulama.use({
  renderer: {
    html: () => '',
    // slika samo iz GFS-a; `alt` slike sa formulom: LaTeX izvor kao tekst (inače bi u atributu završio escape-ovan markup
    // mesta formule).
    image(token) {
      if (!DOZVOLJENA_SLIKA.test(token.href)) {
        return '';
      }
      const delovi = token.tokens as Tokens.Generic[] | undefined;
      if (delovi?.some((t) => t.type === 'formula' || t.tokens)) {
        // izvorni renderer slike sam gradi `alt` iz `tokens` (textRenderer) i escape-uje ga jednom
        const tekst = delovi.map(tekstTokena).join('');
        token.tokens = [{ type: 'text', raw: tekst, text: tekst }];
      }
      return false;
    },
  },
});

/**
 * Najduži tekst pitanja čije se formule tumače: 2x granica servera (2000). Maska formula za naglašavanje (`emStrongMask`)
 * se zove pri svakom `inlineTokens`, pa je oko mnogo graničnika i formula superlinearna (na ~15 500 znakova
 * `Maximum call stack size exceeded`, završna re-recenzija 5a, A M1). Duži tekst (npr. stari podaci, uvoz) je običan
 * Markdown, kao INFO; forma pitanja koristi istu funkciju, pa ni ne upozorava na formule koje prikaz ne crta.
 */
export const MAX_TEKST_SA_FORMULAMA = 4000;

/** Markdown teksta pitanja sa mestima formula (`$...$`); isti HTML filter i pravilo slika kao `renderMarkdown`. */
export function markdownSaFormulama(src: string | null | undefined): PripremljenTekst {
  if (!src) {
    return { html: '', formula: false };
  }
  if (src.length > MAX_TEKST_SA_FORMULAMA) {
    return { html: renderMarkdown(src), formula: false };
  }
  const html = parserSaFormulama.parse(src, { async: false });
  return { html, formula: html.includes(`<span class="${KLASA_FORMULE}">`) };
}
