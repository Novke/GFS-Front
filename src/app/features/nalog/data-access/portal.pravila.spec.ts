import { describe, expect, it } from 'vitest';

import {
  idIzRute, jeTabCas, karticaIzUpita, medijUrl, nivoIzUpita, opisAktivnosti, opisPredmeta, poeni, predlogOcene,
  putanjaPrijave, sledeciUpitTrakeMs, tipova, ucinak, zvezdice,
} from './portal.pravila';

describe('portal.pravila', () => {
  it('medijUrl: samo javni medij, id kodiran', () => {
    expect(medijUrl('ab-12')).toBe('api/public/mediji/ab-12');
    expect(medijUrl('../x')).toBe('api/public/mediji/..%2Fx');
  });

  it.each([
    ['/nalog/predmet/3?k=istorija', 'nalog?nazad=nalog/predmet/3?k=istorija'],
    ['/nalog/predmeti', 'nalog?nazad=nalog/predmeti'],
    ['/nalog/prezentacija/7', 'nalog?nazad=nalog/prezentacija/7'],
    // putanja koju javnoNazad ne pušta: samo prijava (posle nje tab Početna)
    ['/predavanja/3', 'nalog'],
    ['/nalog/predmet/3?q=a,b', 'nalog'],
    ['/', 'nalog'],
  ])('putanjaPrijave(%s) = %s', (url, cilj) => {
    expect(putanjaPrijave(url)).toBe(cilj);
  });

  it.each([
    ['/nalog/cas', true],
    ['/nalog/cas?sa=cas', true],
    ['/nalog/cas/abc.def', true],
    ['/nalog/casovi', false],
    ['/nalog/predmeti', false],
    ['/nalog/ja', false],
  ])('jeTabCas(%s) = %s', (url, da) => {
    expect(jeTabCas(url)).toBe(da);
  });

  it('upit trake: na času 10 s ± 2 s, inače 60 s', () => {
    expect(sledeciUpitTrakeMs(true, 0)).toBe(8_000);
    expect(sledeciUpitTrakeMs(true, 0.5)).toBe(10_000);
    expect(sledeciUpitTrakeMs(true, 1)).toBe(12_000);
    expect(sledeciUpitTrakeMs(false, 0.3)).toBe(60_000);
  });

  it('aktivnost bez bodova; null = nije bio', () => {
    expect(opisAktivnosti('PRISUSTVO')).toBe('Prisutan');
    expect(opisAktivnosti('ZADATAK')).toContain('rešio zadatak');
    expect(opisAktivnosti('SA_ZVEZDICOM')).toContain('zvezdicom');
    expect(opisAktivnosti(null)).toBe('Nije bio');
  });

  it('zvezdice i učinak', () => {
    expect(zvezdice(1)).toBe('★');
    expect(zvezdice(3)).toBe('★★★');
    expect(zvezdice(0)).toBe('');
    expect(zvezdice(4)).toBe('');
    expect(ucinak({ provereno: 5, tacno: 3 })).toBe('3 od 5 tačno');
    expect(ucinak({ provereno: 0, tacno: 0 })).toBe('još nisi proveravao');
  });

  it.each([[1, 'tip'], [2, 'tipa'], [4, 'tipa'], [5, 'tipova'], [11, 'tipova'], [12, 'tipova'], [21, 'tip'], [22, 'tipa']])(
    'tipova(%i) = %s', (n, rec) => {
      expect(tipova(n)).toBe(rec);
    },
  );

  it('opis predmeta: prisustvo, pa tipovi za vežbanje samo kad ih ima', () => {
    const p = { id: 1, naziv: 'X', prisutan: 5, predavanja: 7, tipovaZaVezbanje: 0, ocenaObjavljena: false };
    expect(opisPredmeta(p)).toBe('Prisutan na 5 od 7');
    expect(opisPredmeta({ ...p, tipovaZaVezbanje: 3 })).toBe('Prisutan na 5 od 7 · 3 tipa za vežbanje');
  });

  it('poeni i predlog ocene', () => {
    expect(poeni(12.5)).toBe('12,5');
    expect(poeni(null)).toBe('—');
    const objava = { objavljeno: true, objavljenoU: '2026-10-29T10:00:00', ocena: {
      predlogOcene: 8, ukupno: 71, poeniPredispitne: 40, poeniAktivnost: 10, poeniDomaci: 30, testovi: [] } };
    expect(predlogOcene(objava)).toBe('8');
    expect(predlogOcene({ ...objava, ocena: { ...objava.ocena, predlogOcene: null } })).toBe('—');
    expect(predlogOcene({ objavljeno: false, objavljenoU: null, ocena: null })).toBe('—');
  });

  it('kartica, id i nivo iz rute/upita: samo poznate vrednosti', () => {
    expect(karticaIzUpita('istorija')).toBe('istorija');
    expect(karticaIzUpita('ocena')).toBe('ocena');
    expect(karticaIzUpita('x')).toBe('materijali');
    expect(karticaIzUpita(null)).toBe('materijali');
    expect(idIzRute('12')).toBe(12);
    for (const v of ['0', '-1', '1.5', 'abc', '', '01', null, undefined]) {
      expect(idIzRute(v), String(v)).toBeNull();
    }
    expect(nivoIzUpita('2')).toBe(2);
    expect(nivoIzUpita('4')).toBeNull();
    expect(nivoIzUpita(null)).toBeNull();
  });
});
