import { describe, expect, it } from 'vitest';

import { koloneTipova, ocenaTekst, poeniZaTip, raspodelaOcena, RezultatiStudentaInfo, sortirajPoUkupnom } from './ocene.models';

function rez(id: number, prezime: string, ukupno: number | null, predlogOcene: number | null, rezultati: RezultatiStudentaInfo['rezultati'] = []): RezultatiStudentaInfo {
  return {
    studentInfo: { id, ime: 'Ana', prezime, indeks: `GD${id}`, godina: 2025 },
    rezultati,
    poeniDomaci: 0,
    poeniAktivnost: 0,
    poeniPredispitne: 0,
    ukupno,
    predlogOcene,
  };
}

describe('raspodela ocena (H2)', () => {
  it('null se broji kao "nije položio" (kategorija 5); kategorije su 5-10', () => {
    const r = raspodelaOcena([{ predlogOcene: null }, { predlogOcene: null }, { predlogOcene: 6 }, { predlogOcene: 10 }, { predlogOcene: 10 }]);
    expect(r).toEqual([
      { labela: '5', broj: 2 },
      { labela: '6', broj: 1 },
      { labela: '7', broj: 0 },
      { labela: '8', broj: 0 },
      { labela: '9', broj: 0 },
      { labela: '10', broj: 2 },
    ]);
  });

  it('5 je takođe "nije položio"; neočekivane vrednosti se ne broje; prazno daje sve nule', () => {
    const r = raspodelaOcena([{ predlogOcene: 5 }, { predlogOcene: 11 }, { predlogOcene: 7.5 }, { predlogOcene: 3 }]);
    expect(r.find(s => s.labela === '5')?.broj).toBe(1);
    expect(r.reduce((z, s) => z + s.broj, 0)).toBe(1);
    expect(raspodelaOcena([]).every(s => s.broj === 0)).toBe(true);
  });

  it('tekst ocene', () => {
    expect(ocenaTekst(8)).toBe('8');
    expect(ocenaTekst(null)).toBe('nije položio');
  });
});

describe('tabela predloga', () => {
  it('sort po ukupnom: od najvećeg, jednaki po prezimenu, bez broja na kraju; ne menja ulaz', () => {
    const ulaz = [rez(1, 'Zec', 60, 6), rez(2, 'Anić', 91, 10), rez(3, 'Bek', null, null), rez(4, 'Bobić', 60, 6)];
    expect(sortirajPoUkupnom(ulaz).map(r => r.studentInfo?.id)).toEqual([2, 4, 1, 3]);
    expect(sortirajPoUkupnom(ulaz, 'asc').map(r => r.studentInfo?.id)).toEqual([3, 4, 1, 2]);
    expect(ulaz.map(r => r.studentInfo?.id)).toEqual([1, 2, 3, 4]);
  });

  it('kolone tipova: redom iz koeficijenata, samo tipovi koje server računa, pa ostali', () => {
    const koef = {
      koeficijentiTipova: [
        { tipTestaId: 8, tipTestaNaziv: 'K2', maxPoena: null },
        { tipTestaId: 7, tipTestaNaziv: 'K1', maxPoena: 30 },
        { tipTestaId: 5, tipTestaNaziv: 'Stari (isključen)', maxPoena: 10 },
      ],
    };
    const redovi = [
      rez(1, 'A', 10, null, [
        { tipTesta: { id: 7, naziv: 'Kolokvijum 1' }, ostvarenoPoena: 12.5 },
        { tipTesta: { id: 9, naziv: null }, ostvarenoPoena: 0 },
        { tipTesta: { id: 8, naziv: 'Kolokvijum 2' }, ostvarenoPoena: null },
      ]),
    ];
    expect(koloneTipova(koef, redovi)).toEqual([
      { id: 8, naziv: 'Kolokvijum 2' },
      { id: 7, naziv: 'Kolokvijum 1' },
      { id: 9, naziv: 'Tip 9' },
    ]);
    expect(koloneTipova(koef, []).map(k => k.id)).toEqual([8, 7, 5]);
    expect(koloneTipova(null, [])).toEqual([]);
    expect(poeniZaTip(redovi[0], 7)).toBe(12.5);
    expect(poeniZaTip(redovi[0], 8)).toBeNull();
    expect(poeniZaTip(redovi[0], 99)).toBeNull();
  });
});
