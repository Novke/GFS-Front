import { describe, expect, it } from 'vitest';

import { glasovaTekst, odbrojavanje, opisRoka, preostaloMs } from './ankete';

describe('brza anketa (zajedničko)', () => {
  it('preostaloMs: po satu servera, pomereno za proteklo lokalno vreme; bez roka null, nikad ispod 0', () => {
    // server je rekao "sada = 1000" u lokalnom trenutku 50_000; posle 2 s lokalno ostaje rok - 3000
    expect(preostaloMs(6_000, 1_000, 50_000, 52_000)).toBe(3_000);
    expect(preostaloMs(6_000, 1_000, 50_000, 60_000)).toBe(0);
    expect(preostaloMs(null, 1_000, 0, 0)).toBeNull();
    expect(preostaloMs(undefined, 1_000, 0, 0)).toBeNull();
  });

  it('odbrojavanje: m:ss, pa sati i minuti, pa dani', () => {
    expect(odbrojavanje(42_000)).toBe('0:42');
    expect(odbrojavanje(41_200)).toBe('0:42');
    expect(odbrojavanje(725_000)).toBe('12:05');
    expect(odbrojavanje(3_900_000)).toBe('1 h 05 min');
    expect(odbrojavanje(3 * 86_400_000)).toBe('3 dana');
    expect(odbrojavanje(-5)).toBe('0:00');
  });

  it('opisRoka: danas, sutra, a dalje dan u nedelji i datum', () => {
    const sada = new Date(2026, 10, 24, 10, 0).getTime(); // utorak 24.11.2026.
    expect(opisRoka(new Date(2026, 10, 24, 20, 0).getTime(), sada)).toBe('danas u 20:00');
    expect(opisRoka(new Date(2026, 10, 25, 20, 0).getTime(), sada)).toBe('sutra u 20:00');
    expect(opisRoka(new Date(2026, 10, 27, 9, 5).getTime(), sada)).toBe('petak 27.11. u 09:05');
  });

  it('glasovaTekst: srpska množina', () => {
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101].map(glasovaTekst)).toEqual([
      '1 glas', '2 glasa', '4 glasa', '5 glasova', '11 glasova', '12 glasova', '14 glasova', '21 glas', '22 glasa', '25 glasova', '101 glas',
    ]);
  });
});
