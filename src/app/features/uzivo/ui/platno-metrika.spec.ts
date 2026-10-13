import { describe, expect, it } from 'vitest';
import { METRIKA, pomerajPrveLinije, pomerajProreda, visinaReda } from './platno-metrika';

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

  it('kalibrisane vrednosti (F19, PowerPointov PDF izvoz): regresija', () => {
    expect(METRIKA.prostiProred['*']).toBe(1.2);
    expect(pomerajPrveLinije('Carlito')).toBe(0);
    expect(pomerajPrveLinije('nepoznat')).toBe(0);
    // telo sa spcBef 12 pt: prva linija u PDF-u je 12 + 0,062 em više nego u CSS-u faze 1
    expect(METRIKA.razmakPrePrvogPasusa).toBe(false);
    expect(METRIKA.razlikaProredaIznad).toBe(1);
    expect(METRIKA.kerning).toBe('normal');
    expect(METRIKA.ligature).toBe('normal');
    expect(METRIKA.marginaCelije).toEqual({ levo: 7.2, gore: 3.6, desno: 7.2, dole: 3.6 });
  });

  it('pomerajProreda: (udeo - 0,5) * (visina reda - prosti prored), u em; 100% -> 0', () => {
    expect(pomerajProreda('Carlito', 90, 1)).toBe(-0.06);
    expect(pomerajProreda('Carlito', 85, 1)).toBe(-0.09);
    expect(pomerajProreda('Carlito', 100, 1)).toBe(0);
    expect(pomerajProreda('Carlito', 150, 1)).toBe(0.3);
    expect(pomerajProreda('Carlito', 90, 1, { ...METRIKA, razlikaProredaIznad: 0.5 })).toBe(0);
  });
});
