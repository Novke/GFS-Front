import { opisPredavanja, pokreniCmd, pokretanjeBezDijaloga } from './pokreni.dialog';

describe('pokretanje (spec 6.3)', () => {
  it('?predavanje=ID pokreće odmah, vezano za predavanje, i kad nema pitanja', () => {
    expect(pokretanjeBezDijaloga('42', 3)).toEqual({ cuvanje: true, grupaId: null, predavanjeId: 42 });
    expect(pokretanjeBezDijaloga('42', 0)).toEqual({ cuvanje: true, grupaId: null, predavanjeId: 42 });
  });

  it('bez pitanja nema dijaloga i ne čuva se', () => {
    expect(pokretanjeBezDijaloga(null, 0)).toEqual({ cuvanje: false, grupaId: null, predavanjeId: null });
  });

  it('sa pitanjima i bez predavanja u ruti otvara dijalog', () => {
    expect(pokretanjeBezDijaloga(null, 2)).toBeNull();
    expect(pokretanjeBezDijaloga('abc', 2)).toBeNull();
    expect(pokretanjeBezDijaloga('0', 2)).toBeNull();
  });

  it('izbor u dijalogu daje komandu', () => {
    expect(pokreniCmd('predavanje', 5, null)).toEqual({ cuvanje: true, grupaId: null, predavanjeId: 5 });
    expect(pokreniCmd('grupa', null, 9)).toEqual({ cuvanje: true, grupaId: 9, predavanjeId: null });
    expect(pokreniCmd('bezGrupe', 5, 9)).toEqual({ cuvanje: true, grupaId: null, predavanjeId: null });
    expect(pokreniCmd('necuvaj', 5, 9)).toEqual({ cuvanje: false, grupaId: null, predavanjeId: null });
  });

  it('izbor bez izabranog predavanja ili grupe nije potpun', () => {
    expect(pokreniCmd('predavanje', null, 9)).toBeNull();
    expect(pokreniCmd('grupa', 5, null)).toBeNull();
  });

  it('opis predavanja: datum, redni broj, grupa i tema', () => {
    expect(opisPredavanja({ id: 1, rb: 3, datum: '2026-10-07', tema: 'Statika', zavrseno: false, grupa: { id: 2, naziv: 'GD-2025' } }))
      .toBe('7.10.2026. · 3. predavanje · GD-2025 · Statika');
    expect(opisPredavanja({ id: 1, rb: 1, datum: '2026-01-15', tema: null, zavrseno: null, grupa: null }))
      .toBe('15.1.2026. · 1. predavanje');
  });
});
