import { describe, expect, it } from 'vitest';

import {
  grupisiPoVezbi, nazivVezbe, poVezbama, SaVezbom, VrstaPrezentacije, vezbaIzNaziva, vezbaIzPolja, zaPretragu,
} from './redosled-prezentacija';

const p = (id: number, naziv: string, vezba: number | null, vrsta: VrstaPrezentacije = 'GRADIVO'): SaVezbom => ({ id, naziv, vezba, vrsta });

describe('redosled prezentacija (isto pravilo kao server)', () => {
  it('vežba rastuće, bez broja na kraju; u vežbi gradivo, pitanja, zadaci; pa naziv i id', () => {
    const lista = [
      p(1, 'Bez broja', null), p(2, 'Vežbe 2 – zadaci', 2, 'ZADACI'), p(3, 'Vežbe 2', 2), p(4, 'Uvod', 0),
      p(5, 'Vežbe 2 – pitanja', 2, 'PITANJA'), p(6, 'b', 1), p(7, 'A', 1), p(8, 'A', 1),
    ];
    expect(poVezbama(lista).map(x => x.id)).toEqual([4, 7, 8, 6, 3, 5, 2, 1]);
  });

  it('grupiše uzastopne iste vežbe sa naslovom', () => {
    const g = grupisiPoVezbi(poVezbama([p(1, 'a', 1), p(2, 'b', 0), p(3, 'c', 1), p(4, 'd', null)]));
    expect(g.map(x => [x.naziv, x.stavke.map(s => s.id)])).toEqual([['Uvod', [2]], ['Vežbe 1', [1, 3]], ['Bez broja vežbe', [4]]]);
  });

  it('naziv vežbe', () => {
    expect([nazivVezbe(0), nazivVezbe(7), nazivVezbe(null)]).toEqual(['Uvod', 'Vežbe 7', 'Bez broja vežbe']);
  });

  it('broj iz naziva: prvi broj posle "Vežbe"/"Vezbe", dve cifre najviše', () => {
    expect(vezbaIzNaziva('Vežbe 3 i 4 – zadaci')).toBe(3);
    expect(vezbaIzNaziva('  vezbe 12')).toBe(12);
    expect(vezbaIzNaziva('VEŽBE 5: brojni sistemi')).toBe(5);
    expect(vezbaIzNaziva('Vežbe 123')).toBeNull();
    expect(vezbaIzNaziva('Uvodno predavanje')).toBeNull();
    expect(vezbaIzNaziva('Pred Vežbe 3')).toBeNull();
    expect(vezbaIzNaziva(null)).toBeNull();
  });

  it('broj iz polja: prazno je bez broja, 0-99 broj, ostalo neispravno', () => {
    expect(vezbaIzPolja('')).toBeNull();
    expect(vezbaIzPolja('  ')).toBeNull();
    expect(vezbaIzPolja(' 7 ')).toBe(7);
    expect(vezbaIzPolja('0')).toBe(0);
    for (const los of ['100', '-1', '3.5', '3,5', 'x']) expect(vezbaIzPolja(los)).toBeUndefined();
  });

  it('pretraga bez dijakritika i velikih slova', () => {
    expect(zaPretragu(' Vežbe Đak ')).toBe('vezbe djak');
  });
});
