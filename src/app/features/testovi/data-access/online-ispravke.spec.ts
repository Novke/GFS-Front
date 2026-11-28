import { describe, expect, it } from 'vitest';

import { kljucIzTeksta } from './online-ispravke';

describe('kljucIzTeksta', () => {
  const opcije = [{ id: 10 }, { id: 20 }, { id: 30 }];
  it('BROJ i TEKST', () => {
    expect(kljucIzTeksta({ tip: 'BROJ', opcije: null }, '2,5')).toEqual({ broj: 2.5, prihvatljivi: null, tacna: null, tacne: null });
    expect(kljucIzTeksta({ tip: 'BROJ', opcije: null }, 'x')).toBeNull();
    expect(kljucIzTeksta({ tip: 'TEKST', opcije: null }, 'FF, ff ')?.prihvatljivi).toEqual(['FF', 'ff']);
  });
  it('opcije po rednom broju', () => {
    expect(kljucIzTeksta({ tip: 'JEDAN_TACAN', opcije }, '2')?.tacna).toBe(20);
    expect(kljucIzTeksta({ tip: 'JEDAN_TACAN', opcije }, '1, 2')).toBeNull();
    expect(kljucIzTeksta({ tip: 'VISE_TACNIH', opcije }, '3 1')?.tacne).toEqual([30, 10]);
    expect(kljucIzTeksta({ tip: 'VISE_TACNIH', opcije }, '4')).toBeNull();
  });
});
