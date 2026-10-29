import { describe, expect, it } from 'vitest';

import { jeDanas, opisSadrzaja } from './izbor-prezentacije';

describe('izbor prezentacije: tekstovi', () => {
  it('sadržaj sa srpskom množinom; pitanja bez zadataka', () => {
    expect(opisSadrzaja({ brojSlajdova: 1, brojPitanja: 0, brojZadataka: 0, vrsta: 'GRADIVO' })).toBe('1 slajd');
    expect(opisSadrzaja({ brojSlajdova: 22, brojPitanja: 3, brojZadataka: 0, vrsta: 'PITANJA' })).toBe('22 slajda · 3 pitanja');
    expect(opisSadrzaja({ brojSlajdova: 12, brojPitanja: 7, brojZadataka: 6, vrsta: 'ZADACI' })).toBe('12 slajdova · 6 zadataka · 1 pitanje');
    expect(opisSadrzaja({ brojSlajdova: 5, brojPitanja: 21, brojZadataka: 21, vrsta: 'ZADACI' })).toBe('5 slajdova · 21 zadatak');
  });

  it('danas po kalendarskom danu lokalnog vremena', () => {
    const danas = new Date(2026, 9, 29, 9, 0);
    expect(jeDanas('2026-10-29T23:59:00', danas)).toBe(true);
    expect(jeDanas('2026-10-28T23:59:00', danas)).toBe(false);
  });
});
