import { describe, expect, it } from 'vitest';

import {
  PODRAZUMEVANI_SMER, SMEROVI, godinaIzUpita, ispravanBroj, ispravnaGodina, maxGodina, predlogGodine, prikazIndeksa,
  samoCifreBroja, sastaviIndeks, tekucaSkolska,
} from './indeks';

describe('indeks u tri dela (shared/util/indeks)', () => {
  const OKT = new Date(2026, 9, 1);
  const SEP = new Date(2026, 8, 30);

  it('smerovi: geodezija GD, isto kao backend enum Smer; šifra je 1-4 velika slova, jedinstvena', () => {
    expect(SMEROVI).toEqual([{ sifra: 'GD', naziv: 'Geodezija' }]);
    expect(PODRAZUMEVANI_SMER).toBe('GD');
    expect(new Set(SMEROVI.map(s => s.sifra)).size).toBe(SMEROVI.length);
    for (const s of SMEROVI) {
      expect(s.sifra).toMatch(/^[A-Z]{1,4}$/u);
      expect(s.naziv.trim()).not.toBe('');
    }
  });

  it('broj: samo cifre, najviše tri; vodeće nule se skidaju u kanonskom indeksu', () => {
    expect(samoCifreBroja('GD 05')).toBe('05');
    expect(samoCifreBroja('12345')).toBe('123');
    expect(ispravanBroj('05')).toBe(true);
    expect(ispravanBroj('000')).toBe(false);
    expect(ispravanBroj('1234')).toBe(false);
    expect(sastaviIndeks('GD', '05')).toBe('GD5');
    expect(prikazIndeksa('GD5', 2026)).toBe('GD5/2026');
    expect(prikazIndeksa('GD5', null)).toBe('GD5');
  });

  it('godina: školska počinje 1. oktobra; opseg 2000 do tekuća školska + 1; upit samo sa četiri cifre', () => {
    expect(tekucaSkolska(OKT)).toBe(2026);
    expect(tekucaSkolska(SEP)).toBe(2025);
    expect(maxGodina(OKT)).toBe(2027);
    expect(ispravnaGodina(2000, OKT)).toBe(true);
    expect(ispravnaGodina(1999, OKT)).toBe(false);
    expect(ispravnaGodina(2028, OKT)).toBe(false);
    expect(godinaIzUpita('2024', OKT)).toBe(2024);
    expect(godinaIzUpita('24', OKT)).toBeNull();
    expect(godinaIzUpita('abcd', OKT)).toBeNull();
    expect(predlogGodine('x', OKT)).toBe(2026);
    expect(predlogGodine('2023', OKT)).toBe(2023);
  });
});
