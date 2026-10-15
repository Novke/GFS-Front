import { animacija, platno, platnoSaAnimacijama } from './platno-podaci.testing';
import {
  animacijaPrelaza, brojKoraka, grupaZaKorak, grupe, kljucPasusa, napredNaSlajd, StanjePrelaza, stanjeSlojeva,
} from './platno-koraci';
import { Animacija } from './platno.models';

const P = (...a: Animacija[]) => platnoSaAnimacijama(a);
const vid = (p: ReturnType<typeof P>, k: number, kljuc: string) => stanjeSlojeva(p, k).get(kljuc) ?? true;

describe('grupe i brojKoraka', () => {
  it('grupa 0 su animacije pre prve KLIK', () => {
    const p = P(
      animacija('a', 'x', { okidac: 'SA_PRETHODNIM' }), animacija('b', 'y'), animacija('c', 'z', { okidac: 'SA_PRETHODNIM' }),
    );
    expect(grupe(p).map((g) => g.map((a) => a.id))).toEqual([['a'], ['b', 'c']]);
    expect(brojKoraka(p)).toBe(1);
  });

  it('bez animacija: jedna prazna grupa 0, nula koraka', () => {
    expect(grupe(P())).toEqual([[]]);
    expect(brojKoraka(P())).toBe(0);
  });

  it('brojKoraka = broj KLIK animacija', () => {
    expect(brojKoraka(platno())).toBe(2);
  });
});

describe('stanjeSlojeva', () => {
  it('grupa 0 se računa u korak 0; početno stanje (-1) je sakriveno', () => {
    const p = P(animacija('a', 'x', { okidac: 'SA_PRETHODNIM' }), animacija('b', 'y'));
    expect(vid(p, -1, 'x')).toBe(false);
    expect(vid(p, 0, 'x')).toBe(true);
    expect(vid(p, 0, 'y')).toBe(false);
    expect(vid(p, 1, 'y')).toBe(true);
  });

  it('ULAZ pa IZLAZ istog sloja u dve grupe', () => {
    const p = P(animacija('a', 'x'), animacija('b', 'x', { vrsta: 'IZLAZ' }));
    expect([-1, 0, 1, 2].map((k) => vid(p, k, 'x'))).toEqual([false, false, true, false]);
  });

  it('sloj bez animacija je uvek vidljiv', () => {
    const p = P(animacija('a', 'x'));
    expect([-1, 0, 1].map((k) => vid(p, k, 'drugi'))).toEqual([true, true, true]);
  });

  it('sloj čija je prva animacija IZLAZ je na početku vidljiv', () => {
    const p = P(animacija('a', 'x', { vrsta: 'IZLAZ' }));
    expect(vid(p, -1, 'x')).toBe(true);
    expect(vid(p, 1, 'x')).toBe(false);
  });

  it('pasusi su nezavisni od sloja i među sobom', () => {
    const p = P(animacija('a', 'x', { pasus: 0 }), animacija('b', 'x', { pasus: 1 }));
    expect(vid(p, 0, kljucPasusa('x', 0))).toBe(false);
    expect(vid(p, 1, kljucPasusa('x', 0))).toBe(true);
    expect(vid(p, 1, kljucPasusa('x', 1))).toBe(false);
    expect(vid(p, 1, 'x')).toBe(true);
    expect(kljucPasusa('x', 2)).toBe('x#2');
  });

  it('čista funkcija: korak nazad daje ranije stanje', () => {
    const p = P(animacija('a', 'x'), animacija('b', 'y'));
    const napred = stanjeSlojeva(p, 2);
    const nazad = stanjeSlojeva(p, 1);
    expect(napred.get('y')).toBe(true);
    expect(nazad.get('y')).toBe(false);
    expect(stanjeSlojeva(p, 2)).toEqual(napred);
  });
});

describe('grupaZaKorak', () => {
  const pocetci = (p: ReturnType<typeof P>, k: number, sm = false) => grupaZaKorak(p, k, sm).map((z) => z.pocetakMs);

  it.each([
    ['SA_PRETHODNIM kasni, POSLE_PRETHODNOG čeka najkasniji kraj', [
      animacija('a', 'x', { trajanjeMs: 500 }),
      animacija('b', 'y', { okidac: 'SA_PRETHODNIM', trajanjeMs: 300, kasnjenjeMs: 100 }),
      animacija('c', 'z', { okidac: 'POSLE_PRETHODNOG', trajanjeMs: 400 }),
    ], [0, 100, 500]],
    ['POSLE_PRETHODNOG pa SA_PRETHODNIM', [
      animacija('a', 'x', { trajanjeMs: 500 }),
      animacija('b', 'y', { okidac: 'POSLE_PRETHODNOG', trajanjeMs: 200 }),
      animacija('c', 'z', { okidac: 'SA_PRETHODNIM', trajanjeMs: 300 }),
    ], [0, 500, 500]],
  ])('%s', (_n, a, ocekivano) => {
    expect(pocetci(P(...a), 1)).toEqual(ocekivano);
  });

  it('grupa 0 i k-ta grupa; van opsega prazno', () => {
    const p = P(animacija('a', 'x', { okidac: 'SA_PRETHODNIM' }), animacija('b', 'y'));
    expect(grupaZaKorak(p, 0).map((z) => z.animacija.id)).toEqual(['a']);
    expect(grupaZaKorak(p, 1).map((z) => z.animacija.id)).toEqual(['b']);
    expect(grupaZaKorak(p, 2)).toEqual([]);
    expect(grupaZaKorak(p, -1)).toEqual([]);
  });

  it('ključ pasusa i trajanje', () => {
    const z = grupaZaKorak(P(animacija('a', 'x', { pasus: 1 })), 1)[0];
    expect(z.kljuc).toBe('x#1');
    expect(z.trajanjeMs).toBe(500);
  });

  it('smanjeno kretanje: trajanja 0, kašnjenje ostaje', () => {
    const p = P(animacija('a', 'x'), animacija('b', 'y', { okidac: 'SA_PRETHODNIM', kasnjenjeMs: 100 }),
      animacija('c', 'z', { okidac: 'POSLE_PRETHODNOG', trajanjeMs: 400 }));
    const g = grupaZaKorak(p, 1, true);
    expect(g.map((z) => z.trajanjeMs)).toEqual([0, 0, 0]);
    expect(g.map((z) => z.pocetakMs)).toEqual([0, 100, 100]);
  });
});

describe('animacijaPrelaza', () => {
  const s = (d: Partial<StanjePrelaza> = {}): StanjePrelaza => ({
    verzija: 5, prikaz: 'SLAJD', indeks: 2, slajdId: 20, tip: 'PLATNO', korak: 1, ...d,
  });
  const pre = s();

  it.each<[string, StanjePrelaza | null, StanjePrelaza, number | null]>([
    ['isti slajd k -> k+1', pre, s({ verzija: 6, korak: 2 }), 2],
    ['k -> k+2', pre, s({ verzija: 6, korak: 3 }), null],
    ['k -> k-1', pre, s({ verzija: 6, korak: 0 }), null],
    ['isti korak', pre, s({ verzija: 6 }), null],
    ['novi slajd napred, korak 0', pre, s({ verzija: 6, indeks: 3, slajdId: 21, korak: 0 }), 0],
    ['novi slajd napred, korak 1', pre, s({ verzija: 6, indeks: 3, slajdId: 21, korak: 1 }), null],
    ['skok +2', pre, s({ verzija: 6, indeks: 4, slajdId: 22, korak: 0 }), null],
    ['nazad', pre, s({ verzija: 6, indeks: 1, slajdId: 19, korak: 0 }), null],
    ['prvi snimak', null, s(), null],
    ['starija verzija', pre, s({ verzija: 4, korak: 2 }), null],
    ['ista verzija', pre, s({ korak: 2 }), null],
    ['INFO', pre, s({ verzija: 6, korak: 2, tip: 'INFO' }), null],
    ['tip null', pre, s({ verzija: 6, korak: 2, tip: null }), null],
    ['KRAJ', pre, s({ verzija: 6, prikaz: 'KRAJ' }), null],
    ['sa PRIJAVE na slajd 0', s({ prikaz: 'PRIJAVA', indeks: 0, slajdId: null, tip: null, korak: 0 }),
      s({ verzija: 6, indeks: 0, slajdId: 10, korak: 0 }), 0],
    ['sa PRIJAVE na slajd 1', s({ prikaz: 'PRIJAVA', indeks: 0, slajdId: null, tip: null, korak: 0 }),
      s({ verzija: 6, indeks: 1, slajdId: 11, korak: 0 }), null],
  ])('%s', (_n, p, sada, ocekivano) => {
    expect(animacijaPrelaza(p, sada)).toBe(ocekivano);
  });
});

/** Prelaz slajda (faza 5, odluka 12): isto pravilo kao grupa 0, za slajd bilo kog tipa. */
describe('napredNaSlajd', () => {
  const s = (d: Partial<StanjePrelaza> = {}): StanjePrelaza => ({
    verzija: 5, prikaz: 'SLAJD', indeks: 2, slajdId: 20, tip: 'INFO', korak: 0, ...d,
  });
  const pre = s({ korak: 1 });
  const prijava = s({ prikaz: 'PRIJAVA', indeks: -1, slajdId: null, tip: null });

  it.each<[string, StanjePrelaza | null, StanjePrelaza, boolean]>([
    ['i -> i+1, korak 0', pre, s({ verzija: 6, indeks: 3, slajdId: 21 }), true],
    ['i -> i+1, PLATNO', pre, s({ verzija: 6, indeks: 3, slajdId: 21, tip: 'PLATNO' }), true],
    ['i -> i-1', pre, s({ verzija: 6, indeks: 1, slajdId: 19 }), false],
    ['i -> i+2', pre, s({ verzija: 6, indeks: 4, slajdId: 22 }), false],
    ['isti slajd (korak nazad na 0)', pre, s({ verzija: 6 }), false],
    ['PRIJAVA -> 0', prijava, s({ verzija: 6, indeks: 0, slajdId: 10 }), true],
    ['PRIJAVA -> 1', prijava, s({ verzija: 6, indeks: 1, slajdId: 11 }), false],
    ['starija verzija', pre, s({ verzija: 4, indeks: 3, slajdId: 21 }), false],
    ['ista verzija', pre, s({ indeks: 3, slajdId: 21 }), false],
    ['korak 1', pre, s({ verzija: 6, indeks: 3, slajdId: 21, korak: 1 }), false],
    ['pre null', null, s({ verzija: 6, indeks: 3, slajdId: 21 }), false],
    ['KRAJ', pre, s({ verzija: 6, prikaz: 'KRAJ', indeks: 3, slajdId: null, tip: null }), false],
    ['KRAJ -> slajd', s({ prikaz: 'KRAJ', indeks: 2, slajdId: null, tip: null }), s({ verzija: 6, indeks: 3, slajdId: 21 }), false],
  ])('%s', (_n, p, sada, ocekivano) => {
    expect(napredNaSlajd(p, sada)).toBe(ocekivano);
  });
});
