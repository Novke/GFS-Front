import { pasus } from '../data-access/platno-podaci.testing';
import { FormatBroja, Lista, Pasus } from '../data-access/platno.models';
import { oznakeListe, rimski } from './platno-tekst';

const broj = (format: FormatBroja | null = 'ARAPSKI_TACKA', pocetak: number | null = 1): Lista =>
  ({ vrsta: 'BROJ', znak: null, boja: null, format, pocetak });

function p(tekst: string, lista: Lista | null, nivo = 0): Pasus {
  return { ...pasus(tekst), lista, nivo };
}

describe('rimski', () => {
  it('pretvara u rimske brojeve', () => {
    expect([1, 2, 3, 4, 5, 9, 14, 40, 90, 400, 1994, 2026].map(rimski))
      .toEqual(['I', 'II', 'III', 'IV', 'V', 'IX', 'XIV', 'XL', 'XC', 'CD', 'MCMXCIV', 'MMXXVI']);
  });

  it('nula i negativni ostaju arapski', () => {
    expect(rimski(0)).toBe('0');
    expect(rimski(-3)).toBe('-3');
  });
});

describe('oznakeListe', () => {
  it('brojevi 1. 2. 3.', () => {
    expect(oznakeListe([p('a', broj()), p('b', broj()), p('c', broj())])).toEqual(['1.', '2.', '3.']);
  });

  it('nivo 1 u sredini ne prekida nivo 0', () => {
    const pasusi = [p('a', broj()), p('a1', broj('MALA_SLOVA_ZAGRADA'), 1), p('b', broj())];
    expect(oznakeListe(pasusi)).toEqual(['1.', 'a)', '2.']);
  });

  it('povratak na plići nivo ponovo počinje dublji', () => {
    const pasusi = [
      p('a', broj()), p('a1', broj('MALA_SLOVA_ZAGRADA'), 1), p('a2', broj('MALA_SLOVA_ZAGRADA'), 1),
      p('b', broj()), p('b1', broj('MALA_SLOVA_ZAGRADA'), 1),
    ];
    expect(oznakeListe(pasusi)).toEqual(['1.', 'a)', 'b)', '2.', 'a)']);
  });

  it('pocetak važi', () => {
    expect(oznakeListe([p('a', broj('ARAPSKI_TACKA', 4)), p('b', broj('ARAPSKI_TACKA', 4))])).toEqual(['4.', '5.']);
  });

  it('promena formata na istom nivou počinje novo brojanje', () => {
    expect(oznakeListe([p('a', broj()), p('b', broj('ARAPSKI_ZAGRADA')), p('c', broj('ARAPSKI_ZAGRADA'))]))
      .toEqual(['1.', '1)', '2)']);
  });

  it('pasus bez liste na istom nivou prekida brojanje', () => {
    expect(oznakeListe([p('a', broj()), p('tekst', null), p('b', broj())])).toEqual(['1.', null, '1.']);
  });

  it('prazan pasus nema oznaku i ne troši broj', () => {
    expect(oznakeListe([p('a', broj()), p('', broj()), p('b', broj())])).toEqual(['1.', null, '2.']);
    const bezDelova: Pasus = { ...p('x', broj()), delovi: [] };
    expect(oznakeListe([bezDelova, p('a', broj())])).toEqual([null, '1.']);
  });

  it('formati: rimski, slova, zagrade', () => {
    const niz = (format: FormatBroja, n: number) => oznakeListe(Array.from({ length: n }, (_, i) => p(`s${i}`, broj(format))));
    expect(niz('RIMSKI_VELIKI_TACKA', 4)).toEqual(['I.', 'II.', 'III.', 'IV.']);
    expect(niz('RIMSKI_MALI_TACKA', 3)).toEqual(['i.', 'ii.', 'iii.']);
    expect(niz('MALA_SLOVA_ZAGRADA', 2)).toEqual(['a)', 'b)']);
    expect(niz('VELIKA_SLOVA_TACKA', 2)).toEqual(['A.', 'B.']);
    expect(niz('ARAPSKI_ZAGRADA', 2)).toEqual(['1)', '2)']);
    expect(niz('ARAPSKI', 2)).toEqual(['1', '2']);
    expect(niz('MALA_SLOVA_ZAGRADA', 28).slice(25)).toEqual(['z)', 'aa)', 'bb)']);
  });

  it('BROJ bez formata i početka: 1.', () => {
    expect(oznakeListe([p('a', broj(null, null)), p('b', broj(null, null))])).toEqual(['1.', '2.']);
  });

  it('znak liste; bez znaka podrazumevani •', () => {
    const znak = (z: string | null): Lista => ({ vrsta: 'ZNAK', znak: z, boja: null, format: null, pocetak: null });
    expect(oznakeListe([p('a', znak('–')), p('b', znak(null)), p('c', null)])).toEqual(['–', '•', null]);
  });
});
