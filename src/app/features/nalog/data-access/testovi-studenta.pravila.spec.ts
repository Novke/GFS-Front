import { describe, expect, it } from 'vitest';

import {
  formatPoena, formatSata, istiUnos, odlaganjePonovo, popunjenost, popunjenoPolje, praznihPolja, preostaloMs, vremeIzIso,
} from './testovi-studenta.pravila';

describe('testovi-studenta.pravila', () => {
  it('popunjenost polja po tipu', () => {
    expect(popunjenoPolje({ tip: 'BROJ' }, '  ')).toBe(false);
    expect(popunjenoPolje({ tip: 'BROJ' }, '0')).toBe(true);
    expect(popunjenoPolje({ tip: 'JEDAN_TACAN' }, 3)).toBe(true);
    expect(popunjenoPolje({ tip: 'VISE_TACNIH' }, [])).toBe(false);
    expect(popunjenoPolje({ tip: 'VISE_TACNIH' }, [1])).toBe(true);
  });

  it('popunjenost zadatka i broj praznih polja', () => {
    const z = { zadatakId: 1, polja: [{ kljuc: 'a', tip: 'BROJ' }, { kljuc: 'b', tip: 'TEKST' }] } as never;
    expect(popunjenost(z, null)).toBe('prazno');
    expect(popunjenost(z, { a: '1' })).toBe('zapoceto');
    expect(popunjenost(z, { a: '1', b: 'x' })).toBe('popunjeno');
    expect(praznihPolja([z], () => ({ a: '1' }))).toBe(1);
  });

  it('istiUnos ne gleda redosled ni prazne vrednosti', () => {
    expect(istiUnos({ a: '1', b: '' }, { a: '1' })).toBe(true);
    expect(istiUnos({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(istiUnos(null, {})).toBe(true);
  });

  it('sat po pomaku servera, nikad negativan', () => {
    expect(preostaloMs(null, 0, 0)).toBeNull();
    expect(preostaloMs(10_000, 2_000, 5_000)).toBe(3_000);
    expect(preostaloMs(10_000, 0, 20_000)).toBe(0);
    expect(formatSata(61_000)).toBe('1:01');
    expect(formatSata(3_725_000)).toBe('1:02:05');
    expect(formatSata(0)).toBe('0:00');
  });

  it('ponavljanje 2, 4, 8, 15 s; vreme i poeni za prikaz', () => {
    expect([1, 2, 3, 4, 9].map(odlaganjePonovo)).toEqual([2_000, 4_000, 8_000, 15_000, 15_000]);
    expect(vremeIzIso('2026-12-09T10:41:07.123')).toBe('10:41:07');
    expect(vremeIzIso('2026-12-09T10:41', false)).toBe('10:41');
    expect(formatPoena(2.5)).toBe('2,5');
    expect(formatPoena(null)).toBe('—');
  });
});
