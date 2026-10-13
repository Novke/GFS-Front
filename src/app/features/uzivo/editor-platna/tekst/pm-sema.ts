import { Schema } from 'prosemirror-model';
import type { Deo, Pasus } from '../../data-access/platno.models';
import { type Stil, stilDela } from '../../ui/platno-tekst';

/** Atributi dela bez teksta (8 polja, spec 4.3): nosi ih mark `stil`. */
export type AtributiDela = Omit<Deo, 'tekst'>;
/**
 * Atributi čvora `pasus`: atributi pasusa iz modela, plus `prazanDeo` (stil praznog pasusa, jer pasus bez teksta nema
 * mark koji bi ga nosio) i `kljuc` (stabilan ključ pasusa za animacije, odluka 17; nije deo modela, `dokUPasuse` ga ne
 * prenosi).
 */
export type AtributiPasusa = Omit<Pasus, 'delovi'> & { prazanDeo: AtributiDela | null; kljuc: string | null };

/** Stil kao vrednost atributa `style` ("a: b; c: d"). */
export function uCss(stil: Stil): string {
  return Object.entries(stil).map(([k, v]) => `${k}: ${v}`).join('; ');
}

/**
 * Šema uređivača teksta (odluka 17): ravan niz pasusa (atributi pasusa iz modela + `prazanDeo` + `kljuc`), `prelom` =
 * `\n` unutar pasusa (PowerPointov `a:br`), jedan mark `stil` sa svih 8 atributa dela; tab ostaje znak `\t` u tekstu.
 * Stil pasusa (poravnanje, razmaci, oznaka liste) crta dekoracija (F12), jer zavisi od susednih pasusa; stil dela crta
 * mark kroz `stilDela`, istu funkciju kao prikaz (`uz-pl-*` klase, odluka 4). `skala` = `okvir.skala` sloja (autofit).
 */
export function napraviSemu(skala = 1): Schema {
  return new Schema({
    nodes: {
      doc: { content: 'pasus+' },
      pasus: {
        content: 'inline*',
        attrs: {
          poravnanje: { default: 'LEVO' },
          nivo: { default: 0 },
          lista: { default: null },
          uvlacenje: { default: { levo: 0, prviRed: 0 } },
          razmakPre: { default: 0 },
          razmakPosle: { default: 0 },
          proredProcenat: { default: 100 },
          tabulatori: { default: [] },
          prazanDeo: { default: null },
          kljuc: { default: null },
        },
        toDOM: () => ['p', { class: 'uz-pl-pasus' }, 0],
        parseDOM: [{ tag: 'p' }],
      },
      text: { group: 'inline' },
      prelom: {
        inline: true,
        group: 'inline',
        selectable: false,
        // `textContent` i `textBetween` vide prelom kao `\n` (isto kao tekst dela u modelu).
        leafText: () => '\n',
        toDOM: () => ['br'],
        parseDOM: [{ tag: 'br' }],
      },
    },
    marks: {
      stil: {
        attrs: {
          font: {}, velicina: {}, boja: {}, podebljano: {}, kurziv: {}, podvuceno: {}, precrtano: {}, polozaj: {},
        },
        toDOM: (m) => [
          'span',
          { class: 'uz-pl-deo', style: uCss(stilDela({ ...(m.attrs as AtributiDela), tekst: '' }, skala)) },
          0,
        ],
      },
    },
  });
}
