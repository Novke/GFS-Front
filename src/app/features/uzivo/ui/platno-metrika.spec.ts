import { describe, expect, it } from 'vitest';
import { METRIKA, pomerajPrveLinije, visinaReda } from './platno-metrika';

describe('platno-metrika', () => {
  it('visinaReda = prosti prored fonta * procenat * skala', () => {
    expect(visinaReda('Carlito', 90, 1)).toBe(1.08);
    expect(visinaReda('Carlito', 100, 1)).toBe(1.2);
    expect(visinaReda('Carlito', 150, 0.9)).toBe(1.62);
  });

  it('font bez sopstvene vrednosti (i nepoznat font) koristi podrazumevanu "*"', () => {
    expect(visinaReda('Tinos', 100, 1)).toBe(METRIKA.prostiProred['*']);
    expect(visinaReda('Comic Sans MS', 100, 1)).toBe(visinaReda('Carlito', 100, 1));
    expect(visinaReda('constructor', 100, 1)).toBe(1.2);
  });

  it('podrazumevane vrednosti daju izgled faze 1', () => {
    expect(METRIKA.prostiProred['*']).toBe(1.2);
    expect(pomerajPrveLinije('Carlito')).toBe(0);
    expect(pomerajPrveLinije('nepoznat')).toBe(0);
    expect(METRIKA.razmakPrePrvogPasusa).toBe(true);
    expect(METRIKA.kerning).toBe('normal');
    expect(METRIKA.ligature).toBe('normal');
    expect(METRIKA.marginaCelije).toEqual({ levo: 7.2, gore: 3.6, desno: 7.2, dole: 3.6 });
  });
});
