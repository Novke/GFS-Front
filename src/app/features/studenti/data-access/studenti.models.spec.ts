import { describe, expect, it } from 'vitest';

import {
  StudentPregledAktivnostInfo,
  StudentPregledDomaciInfo,
  StudentPregledTestInfo,
} from '../../../core/api/studenti.api';
import {
  brojIzIndeksa,
  brojStudenataTekst,
  formatBroj,
  hronologija,
  mailtoHref,
  pretragaZaUpit,
  punoIme,
  redosledStudenata,
  sortirajPolaganja,
  susedi,
  telHref,
} from './studenti.models';
import { podrazumevanaListaStudenata } from './studenti-lista.store';

const akt = (id: number, datum: string | null, izmene: Partial<StudentPregledAktivnostInfo> = {}): StudentPregledAktivnostInfo => ({
  id, predavanjeId: 100 + id, tip: 'ZADATAK', napomene: null, datum, tema: `Tema ${id}`, ...izmene,
});
const dom = (id: number, datum: string | null, izmene: Partial<StudentPregledDomaciInfo> = {}): StudentPregledDomaciInfo => ({
  id, domaciId: 200 + id, bodovi: 7, napomene: null, prepisivanje: false, oslobodjen: false, datum, naslov: `Domaći ${id}`, ...izmene,
});
const test = (id: number, datum: string | null, izmene: Partial<StudentPregledTestInfo> = {}): StudentPregledTestInfo => ({
  id, testId: 300 + id, ostvareniPoeni: 40, polozio: true, prepisivao: false, napomene: null, datum, tipTesta: { id: 1, naziv: 'Kolokvijum' }, ...izmene,
});

describe('hronologija', () => {
  it('spaja aktivnosti, domaće i polaganja i sortira po datumu, najnovije prvo', () => {
    const stavke = hronologija({
      aktivnosti: [akt(1, '2025-10-14'), akt(2, '2025-12-02')],
      uradjeniDomaci: [dom(1, '2025-11-05')],
      polaganja: [test(1, '2025-11-20'), test(2, '2025-09-30')],
    });
    expect(stavke.map(s => s.kljuc)).toEqual(['a2', 't1', 'd1', 'a1', 't2']);
    expect(stavke.map(s => s.tip)).toEqual(['aktivnost', 'test', 'domaci', 'aktivnost', 'test']);
  });

  it('isti dan: test, pa domaći, pa aktivnost, pa veći id prvi; stavke bez datuma idu na kraj', () => {
    const stavke = hronologija({
      aktivnosti: [akt(1, '2025-10-14'), akt(2, '2025-10-14'), akt(3, null)],
      uradjeniDomaci: [dom(1, '2025-10-14'), dom(2, 'nije-datum')],
      polaganja: [test(1, '2025-10-14')],
    });
    expect(stavke.map(s => s.kljuc)).toEqual(['t1', 'd1', 'a2', 'a1', 'd2', 'a3']);
  });

  it('redosled ne zavisi od redosleda iz servera (polaganja iz skupa)', () => {
    const p = [test(5, '2025-10-01'), test(9, '2025-10-01'), test(7, '2025-11-01')];
    const a = hronologija({ aktivnosti: [], uradjeniDomaci: [], polaganja: p });
    const b = hronologija({ aktivnosti: [], uradjeniDomaci: [], polaganja: [...p].reverse() });
    expect(a.map(s => s.kljuc)).toEqual(['t7', 't9', 't5']);
    expect(b.map(s => s.kljuc)).toEqual(a.map(s => s.kljuc));
  });

  it('linkuje na predavanje, domaći i test, a stavku bez veze prikazuje bez linka', () => {
    const [a, d, t, bez] = [
      ...hronologija({ aktivnosti: [akt(1, '2025-10-04')], uradjeniDomaci: [dom(1, '2025-10-03')], polaganja: [test(1, '2025-10-02')] }),
      ...hronologija({ aktivnosti: [akt(2, '2025-10-01', { predavanjeId: null })], uradjeniDomaci: [], polaganja: [] }),
    ];
    expect(a.link).toEqual(['/predavanja', 101]);
    expect(d.link).toEqual(['/domaci', 201]);
    expect(t.link).toEqual(['/testovi', 301]);
    expect(bez.link).toBeNull();
  });

  it('tekstovi: rupe u podacima su rečima, bez izuzetaka', () => {
    const [d, t, a] = hronologija({
      aktivnosti: [akt(1, '2025-10-01', { tema: null, tip: null })],
      uradjeniDomaci: [dom(1, '2025-10-03', { naslov: null, bodovi: null, prepisivanje: true, napomene: 'kasno' })],
      polaganja: [test(1, '2025-10-02', { tipTesta: null, ostvareniPoeni: null, polozio: null })],
    });
    expect(d.naslov).toBe('Domaći bez naslova');
    expect(d.detalj).toBe('Bez bodova · prepisivao · kasno');
    expect(t.naslov).toBe('Test');
    expect(t.detalj).toBe('Bez poena');
    expect(a.naslov).toBe('Predavanje bez teme');
    expect(a.detalj).toBe('Prisustvo');
  });

  it('domaći: bodovi, oslobođen; test: poeni sa zarezom, položio, prepisivao', () => {
    const stavke = hronologija({
      aktivnosti: [],
      uradjeniDomaci: [dom(1, '2025-10-03', { bodovi: 7.5 }), dom(2, '2025-10-02', { oslobodjen: true, bodovi: 10 })],
      polaganja: [test(1, '2025-10-01', { ostvareniPoeni: 45.5, polozio: false, prepisivao: true })],
    });
    expect(stavke.map(s => s.detalj)).toEqual(['7,5 / 10 bodova', 'Oslobođen', '45,5 poena · nije položio · prepisivao']);
  });

  it('prazan student daje praznu hronologiju', () => {
    expect(hronologija({ aktivnosti: [], uradjeniDomaci: [], polaganja: [] })).toEqual([]);
  });
});

describe('sortirajPolaganja', () => {
  it('najnovije prvo, istog dana veći id prvi, bez menjanja ulaza', () => {
    const ulaz = [test(1, '2025-10-01'), test(3, '2025-10-01'), test(2, '2025-11-01'), test(4, null)];
    expect(sortirajPolaganja(ulaz).map(p => p.id)).toEqual([2, 3, 1, 4]);
    expect(ulaz.map(p => p.id)).toEqual([1, 3, 2, 4]);
  });
});

describe('susedi', () => {
  const redosled = [{ id: 7 }, { id: 3 }, { id: 9 }];

  it('u sredini ima prethodnog i sledećeg', () => {
    expect(susedi(redosled, 3)).toEqual({ prethodni: 7, sledeci: 9, mesto: 2, ukupno: 3 });
  });

  it('na početku nema prethodnog, na kraju nema sledećeg', () => {
    expect(susedi(redosled, 7)).toEqual({ prethodni: null, sledeci: 3, mesto: 1, ukupno: 3 });
    expect(susedi(redosled, 9)).toEqual({ prethodni: 3, sledeci: null, mesto: 3, ukupno: 3 });
  });

  it('student van grupe (ili bez grupe) nema suseda ni mesta', () => {
    expect(susedi(redosled, 42)).toEqual({ prethodni: null, sledeci: null, mesto: null, ukupno: 3 });
    expect(susedi([], 1).mesto).toBeNull();
  });
});

describe('redosledStudenata', () => {
  it('po broju iz indeksa (GD2 pre GD10), pa po indeksu i id-u; bez broja na kraj', () => {
    const r = redosledStudenata([
      { id: 1, indeks: 'GD10' },
      { id: 2, indeks: 'GD2' },
      { id: 3, indeks: null },
      { id: 5, indeks: 'GD2' },
      { id: 4, indeks: 'AR2' },
    ]);
    expect(r.map(s => s.id)).toEqual([4, 2, 5, 1, 3]);
  });

  it('brojIzIndeksa: broj na kraju; bez broja ili preveliki ide na kraj', () => {
    expect(brojIzIndeksa('GD12')).toBe(12);
    expect(brojIzIndeksa('GD')).toBe(Number.MAX_SAFE_INTEGER);
    expect(brojIzIndeksa('1'.repeat(30))).toBe(Number.MAX_SAFE_INTEGER);
    expect(brojIzIndeksa(undefined)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('kontakt linkovi', () => {
  it('student bez emaila nema mailto link', () => {
    expect(mailtoHref(null)).toBeNull();
    expect(mailtoHref('   ')).toBeNull();
    expect(mailtoHref(' ana@gf.uns.ac.rs ')).toBe('mailto:ana@gf.uns.ac.rs');
  });

  it('telefon: tel link bez razmaka i crtica, bez cifara nema linka', () => {
    expect(telHref('064 123-456')).toBe('tel:064123456');
    expect(telHref('+381 64 123 456')).toBe('tel:+38164123456');
    expect(telHref('nema')).toBeNull();
    expect(telHref(null)).toBeNull();
  });
});

describe('pomoćne funkcije', () => {
  it('pretragaZaUpit: grupa -> grupaId, stariji -> starijiOdGrupe, strana je 0-based', () => {
    const q = podrazumevanaListaStudenata();
    expect(pretragaZaUpit({ ...q, filteri: { grupa: 4, q: 'ana', stariji: 7 }, strana: 3, velicina: 10, sort: 'indeks,desc' })).toEqual({
      grupaId: 4, starijiOdGrupe: 7, q: 'ana', page: 2, size: 10, sort: 'indeks,desc',
    });
  });

  it('punoIme, formatBroj i brojStudenataTekst', () => {
    expect(punoIme({ ime: ' Ana ', prezime: 'Radić' })).toBe('Ana Radić');
    expect(punoIme({ ime: null, prezime: null })).toBe('—');
    expect(formatBroj(72.633)).toBe('72,6');
    expect(formatBroj(7)).toBe('7');
    expect(formatBroj(null)).toBe('—');
    expect(formatBroj(Number.NaN)).toBe('—');
    expect(brojStudenataTekst(1)).toBe('1 student');
    expect(brojStudenataTekst(3)).toBe('3 studenta');
    expect(brojStudenataTekst(12)).toBe('12 studenata');
    expect(brojStudenataTekst(21)).toBe('21 student');
  });
});
