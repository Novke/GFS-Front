import { describe, expect, it } from 'vitest';

import { AgendaStavkaInfo } from '../../../core/api/pregled.api';
import { agendaNedelje, isoDan, mnozina, naslovDatuma, oblik, pozdravZaSat } from './pocetna.vreme';

const stavka = (id: number, datum: string | null, tip: AgendaStavkaInfo['tip'] = 'PREDAVANJE'): AgendaStavkaInfo => ({
  tip,
  id,
  datum,
  naslov: `Stavka ${id}`,
  predmet: { id: 1, naziv: 'UPR' },
  grupa: null,
});

describe('pozdravZaSat', () => {
  it('jutro do 12, dan do 18, posle toga veče', () => {
    expect(pozdravZaSat(0)).toBe('Dobro jutro');
    expect(pozdravZaSat(11)).toBe('Dobro jutro');
    expect(pozdravZaSat(12)).toBe('Dobar dan');
    expect(pozdravZaSat(17)).toBe('Dobar dan');
    expect(pozdravZaSat(18)).toBe('Dobro veče');
    expect(pozdravZaSat(23)).toBe('Dobro veče');
  });
});

describe('naslovDatuma i isoDan', () => {
  it('dan u nedelji i mesec po srpski, lokalni ISO dan', () => {
    const d = new Date(2025, 9, 14, 23, 59);
    expect(naslovDatuma(d)).toBe('Utorak, 14. oktobar');
    expect(isoDan(d)).toBe('2025-10-14');
    expect(isoDan(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('oblik i mnozina', () => {
  it('srpska množina', () => {
    expect(mnozina(1, 'student', 'studenta', 'studenata')).toBe('1 student');
    expect(mnozina(3, 'student', 'studenta', 'studenata')).toBe('3 studenta');
    expect(mnozina(5, 'student', 'studenta', 'studenata')).toBe('5 studenata');
    expect(mnozina(11, 'student', 'studenta', 'studenata')).toBe('11 studenata');
    expect(mnozina(12, 'student', 'studenta', 'studenata')).toBe('12 studenata');
    expect(mnozina(21, 'student', 'studenta', 'studenata')).toBe('21 student');
    expect(mnozina(0, 'student', 'studenta', 'studenata')).toBe('0 studenata');
    expect(oblik(22, 'a', 'b', 'c')).toBe('b');
  });
});

describe('agendaNedelje', () => {
  // utorak 14. 10. 2025.
  const sada = new Date(2025, 9, 14, 9, 0);

  it('pon-pet sa stavkama po danu, danas istaknut', () => {
    const a = agendaNedelje([stavka(1, '2025-10-13'), stavka(2, '2025-10-14'), stavka(3, '2025-10-14', 'TEST'), stavka(4, '2025-10-17')], sada);
    expect(a.dani.map(d => d.oznaka)).toEqual(['Pon 13.', 'Uto 14.', 'Sre 15.', 'Čet 16.', 'Pet 17.']);
    expect(a.dani.map(d => d.stavke.map(s => s.id))).toEqual([[1], [2, 3], [], [], [4]]);
    expect(a.dani.map(d => d.jeDanas)).toEqual([false, true, false, false, false]);
    expect(a.brojVikend).toBe(0);
  });

  it('vikend se ne prikazuje po danima, ali se broji; stavke bez datuma ili iz druge nedelje se ignorišu', () => {
    const a = agendaNedelje([stavka(1, '2025-10-18'), stavka(2, '2025-10-19'), stavka(3, null), stavka(4, '2025-10-20')], sada);
    expect(a.dani.flatMap(d => d.stavke)).toEqual([]);
    expect(a.brojVikend).toBe(2);
  });

  it('u nedelju je nedelja pon-pet koja je upravo prošla; danas nije istaknut', () => {
    const a = agendaNedelje([], new Date(2025, 9, 19, 20, 0));
    expect(a.dani[0].oznaka).toBe('Pon 13.');
    expect(a.dani.some(d => d.jeDanas)).toBe(false);
  });

  it('prelazak meseca', () => {
    const a = agendaNedelje([], new Date(2025, 10, 2)); // nedelja 2. 11.
    expect(a.dani.map(d => d.iso)).toEqual(['2025-10-27', '2025-10-28', '2025-10-29', '2025-10-30', '2025-10-31']);
  });
});
