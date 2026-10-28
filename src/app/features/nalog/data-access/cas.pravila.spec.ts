import { describe, expect, it } from 'vitest';

import { danIDatum, odlaganjeKoraka429, odlaganjePosle429, opisCasa, putanjaUzivo, sledeciUpitMs } from './cas.pravila';

describe('cas.pravila', () => {
  it('sledeciUpitMsUGranicama: 10 s ± 2 s', () => {
    expect(sledeciUpitMs(0)).toBe(8_000);
    expect(sledeciUpitMs(0.5)).toBe(10_000);
    expect(sledeciUpitMs(0.999999)).toBe(12_000);
    for (let i = 0; i < 200; i++) {
      const ms = sledeciUpitMs(Math.random());
      expect(ms).toBeGreaterThanOrEqual(8_000);
      expect(ms).toBeLessThanOrEqual(12_000);
    }
    expect(sledeciUpitMs(Number.NaN)).toBe(10_000);
    expect(sledeciUpitMs(7)).toBe(12_000);
  });

  it('odlaganjeKoraka429: kratko (token živi 20-30 s), 1, 2, 4, pa najviše 8 s plus do 1 s pomeranja', () => {
    expect([1, 2, 3, 4, 5, 9].map(n => odlaganjeKoraka429(n, 0))).toEqual([1_000, 2_000, 4_000, 8_000, 8_000, 8_000]);
    expect(odlaganjeKoraka429(1, 0.999999)).toBeLessThan(2_000);
    expect(odlaganjeKoraka429(0, Number.NaN)).toBe(1_000);
  });

  it('odlaganjePosle429: 20 s, 40 s, pa najviše 60 s', () => {
    expect(odlaganjePosle429(1)).toBe(20_000);
    expect(odlaganjePosle429(2)).toBe(40_000);
    expect(odlaganjePosle429(3)).toBe(60_000);
    expect(odlaganjePosle429(10)).toBe(60_000);
  });

  it('putanjaUzivo nosi sa=cas', () => {
    expect(putanjaUzivo('AB12CD')).toBe('uzivo/AB12CD?sa=cas');
  });

  it('opisCasa: predmet · dan datum · tema', () => {
    expect(danIDatum('2026-10-28')).toBe('sreda 28.10.');
    expect(opisCasa({ id: 1, predmet: 'Uvod u primenu računara', datum: '2026-10-28', rb: 3, tema: 'Petlje', zavrseno: false }))
      .toBe('Uvod u primenu računara · sreda 28.10. · Petlje');
    expect(opisCasa({ id: 1, predmet: null, datum: '2026-11-02', rb: 3, tema: ' ', zavrseno: false })).toBe('ponedeljak 2.11.');
  });
});
