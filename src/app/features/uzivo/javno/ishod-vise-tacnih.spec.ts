import { naslovUdela, opisUdela, stanjaOpcija } from './ishod-vise-tacnih';

/** Četiri opcije A-D (id 1-4); tačne su A i B. */
const OPCIJE = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
const TACNE = [1, 2];

describe('stanjaOpcija', () => {
  it.each([
    [[1], ['pogodjena', 'propustena', 'ostala', 'ostala']],
    [[1, 3], ['pogodjena', 'propustena', 'pogresna', 'ostala']],
    [[1, 2], ['pogodjena', 'pogodjena', 'ostala', 'ostala']],
    [[4], ['propustena', 'propustena', 'ostala', 'pogresna']],
    [[], ['propustena', 'propustena', 'ostala', 'ostala']],
  ] as const)('izabrane %j -> %j', (izabrane, ocekivano) => {
    expect(stanjaOpcija(OPCIJE, TACNE, izabrane)).toEqual(ocekivano);
  });
});

describe('naslovUdela', () => {
  it.each([
    [1, 'Tačno!'], [0.5, 'Delimično tačno'], [0.33, 'Delimično tačno'], [0, 'Netačno'],
  ] as const)('%d -> %s', (udeo, ocekivano) => {
    expect(naslovUdela(udeo)).toBe(ocekivano);
  });
});

describe('opisUdela', () => {
  it('četiri teksta: svi tačni, deo tačnih, deo tačnih uz pogrešan, nijedan tačan', () => {
    expect(opisUdela(TACNE, [1, 2])).toBe('Svi tačni odgovori.');
    expect(opisUdela(TACNE, [2])).toBe('Pogodio si 1 od 2 tačna.');
    expect(opisUdela(TACNE, [1, 3])).toBe('Pogodio si 1 od 2 tačna, ali pogrešan izbor poništava jedan tačan.');
    expect(opisUdela(TACNE, [3])).toBe('Nisi pogodio nijedan tačan.');
  });

  it('oba tačna uz pogrešan: deo tačnih uz pogrešan; više pogrešnih i oblik reči uz broj tačnih', () => {
    expect(opisUdela(TACNE, [1, 2, 3])).toBe('Pogodio si 2 od 2 tačna, ali pogrešan izbor poništava jedan tačan.');
    expect(opisUdela([1, 2, 3], [1, 4, 5])).toBe('Pogodio si 1 od 3 tačna, ali svaki pogrešan izbor poništava jedan tačan.');
    expect(opisUdela([1, 2, 3, 4, 5], [1])).toBe('Pogodio si 1 od 5 tačnih.');
  });
});
