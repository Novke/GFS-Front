import { describe, expect, it } from 'vitest';

import {
  ishodRezultata, istiIzbor, izborZaSlanje, kartice, oznakaKartice, prebaciIzbor, zaIskakanje,
} from './ankete-studenta.pravila';
import { anketaStudentu as a } from './ankete-studenta.testing';

describe('brza anketa: pravila studenta', () => {
  it('iskače prva otvorena anketa bez glasa koja nije sklonjena', () => {
    const lista = [a(1, { mojGlas: [0] }), a(2, { otvorena: false }), a(3), a(4)];
    expect(zaIskakanje(lista, [])?.id).toBe(3);
    expect(zaIskakanje(lista, [3])?.id).toBe(4);
    expect(zaIskakanje(lista, [3, 4])).toBeNull();
    expect(zaIskakanje([], [])).toBeNull();
  });

  it('kartice: Čas sve otvorene i pokazane (rezultati prvo), Početna samo grupa', () => {
    const rez = { glasovi: [3, 1, 0], brojGlasalo: 4 };
    const lista = [
      a(1), a(2, { publika: 'GRUPA' }), a(3, { otvorena: false, rezultat: rez }), a(4, { otvorena: false }),
      a(5, { publika: 'GRUPA', otvorena: false, rezultat: rez }),
    ];
    expect(kartice(lista, 'cas').map(x => x.id)).toEqual([3, 5, 1, 2]);
    expect(kartice(lista, 'pocetna').map(x => x.id)).toEqual([5, 2]);
  });

  it('oznaka kartice: rezultat, grupa sa rokom, na času', () => {
    const sada = new Date(2026, 10, 24, 10, 0).getTime();
    expect(oznakaKartice(a(1, { otvorena: false, rezultat: { glasovi: [1, 0, 0], brojGlasalo: 1 } }))).toBe('Rezultat ankete');
    expect(oznakaKartice(a(2, { publika: 'GRUPA', sadaMs: sada, rokMs: new Date(2026, 10, 25, 20, 0).getTime() })))
      .toBe('Anketa za grupu · do sutra u 20:00');
    expect(oznakaKartice(a(3, { publika: 'GRUPA' }))).toBe('Anketa za grupu');
    expect(oznakaKartice(a(4))).toBe('Anketa na času');
    // otvorena sa pokazanim rezultatom je i dalje anketa (može da se glasa)
    expect(oznakaKartice(a(5, { rezultat: { glasovi: [1, 0, 0], brojGlasalo: 1 } }))).toBe('Anketa na času');
  });

  it('ishod: pobednik sa brojem, nerešeno, bez glasova, bez rezultata', () => {
    expect(ishodRezultata(a(1, { rezultat: { glasovi: [14, 6, 3], brojGlasalo: 23 } }))).toBe('Da, 10 min · 14 od 23 glasa');
    expect(ishodRezultata(a(2, { rezultat: { glasovi: [2, 2, 0], brojGlasalo: 4 } }))).toBe('Nerešeno · 4 glasa');
    expect(ishodRezultata(a(3, { rezultat: { glasovi: [0, 0, 0], brojGlasalo: 0 } }))).toBe('Još nema glasova');
    expect(ishodRezultata(a(4))).toBeNull();
  });

  it('kućice: uključi i isključi, rastuće', () => {
    expect(prebaciIzbor([], 2)).toEqual([2]);
    expect(prebaciIzbor([2], 0)).toEqual([0, 2]);
    expect(prebaciIzbor([0, 2], 2)).toEqual([0]);
  });

  it('šta se šalje: jedan odgovor tačno jedan, više bar jedan, van opsega i duplikati otpadaju', () => {
    const jedan = { viseOdgovora: false, opcije: ['a', 'b', 'c'] };
    const vise = { viseOdgovora: true, opcije: ['a', 'b', 'c'] };
    expect(izborZaSlanje([1], jedan)).toEqual([1]);
    expect(izborZaSlanje([0, 1], jedan)).toBeNull();
    expect(izborZaSlanje([], vise)).toBeNull();
    expect(izborZaSlanje([2, 0, 2, 7, -1], vise)).toEqual([0, 2]);
  });

  it('isti izbor', () => {
    expect(istiIzbor([0, 2], [0, 2])).toBe(true);
    expect(istiIzbor([0], [0, 2])).toBe(false);
    expect(istiIzbor(null, [0])).toBe(false);
  });
});
