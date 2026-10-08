import { infoSlajd, naPitanju, pitanjeSlajd, stanje } from './izvodjenje-podaci.testing';
import {
  dozvoljeneKomande, imaTacanOdgovor, ispravanIndeks, javniRezultat, oznakaDalje, oznakaTajmera,
} from './izvodjenje-pravila';
import { Rezultat } from './uzivo.models';

describe('dozvoljeneKomande', () => {
  it('završeno izvođenje: ništa', () => {
    const s = stanje();
    s.izvodjenje = { ...s.izvodjenje, status: 'ZAVRSENO' };
    expect(dozvoljeneKomande(s).size).toBe(0);
    expect(dozvoljeneKomande(null).size).toBe(0);
  });

  it('prijava: dalje da, nazad i pitanje ne', () => {
    const d = dozvoljeneKomande(stanje());
    expect(d.has('SLEDECI')).toBeTrue();
    expect(d.has('PRETHODNI')).toBeFalse();
    expect(d.has('OTVORI_ZATVORI')).toBeFalse();
    expect(d.has('REZULTATI')).toBeFalse();
    expect(d.has('QR')).toBeTrue();
    expect(d.has('ZAVRSI')).toBeTrue();
  });

  it('kraj: dalje ne, nazad da', () => {
    const d = dozvoljeneKomande(stanje({ prikaz: 'KRAJ', indeks: 3 }));
    expect(d.has('SLEDECI')).toBeFalse();
    expect(d.has('PRETHODNI')).toBeTrue();
  });

  it('CEKA: otvori da; rezultati, tačan, ponovi i tajmer ne', () => {
    const d = dozvoljeneKomande(naPitanju('CEKA'));
    expect(d.has('OTVORI_ZATVORI')).toBeTrue();
    expect(d.has('REZULTATI')).toBeFalse();
    expect(d.has('TACAN')).toBeFalse();
    expect(d.has('PONOVI')).toBeFalse();
    expect(d.has('TAJMER')).toBeFalse();
  });

  it('OTVORENO: rezultati, ponovi i tajmer da; tačan ne; ± samo kad tajmer postoji', () => {
    let d = dozvoljeneKomande(naPitanju('OTVORENO'));
    expect(d.has('REZULTATI')).toBeTrue();
    expect(d.has('PONOVI')).toBeTrue();
    expect(d.has('TAJMER')).toBeTrue();
    expect(d.has('TACAN')).toBeFalse();
    expect(d.has('TAJMER_PLUS')).toBeFalse();
    d = dozvoljeneKomande(naPitanju('OTVORENO', { runda: { id: 9, redniBroj: 1, rokMs: 5, preostaloMs: null, tajmerRadi: true } }));
    expect(d.has('TAJMER_PLUS')).toBeTrue();
    expect(d.has('TAJMER_MINUS')).toBeTrue();
    d = dozvoljeneKomande(naPitanju('OTVORENO', { runda: { id: 9, redniBroj: 1, rokMs: null, preostaloMs: 4000, tajmerRadi: false } }));
    expect(d.has('TAJMER_MINUS')).toBeTrue();
  });

  it('ZATVORENO: tačan samo kad pitanje ima tačan odgovor; tajmer ne', () => {
    expect(dozvoljeneKomande(naPitanju('ZATVORENO')).has('TACAN')).toBeTrue();
    expect(dozvoljeneKomande(naPitanju('ZATVORENO')).has('TAJMER')).toBeFalse();
    expect(dozvoljeneKomande(naPitanju('ZATVORENO', {}, pitanjeSlajd('ANKETA'))).has('TACAN')).toBeFalse();
    expect(dozvoljeneKomande(naPitanju('ZATVORENO', {}, pitanjeSlajd('SKALA'))).has('TACAN')).toBeFalse();
    expect(dozvoljeneKomande(naPitanju('ZATVORENO', {}, pitanjeSlajd('BROJ', { brojTacno: null }))).has('TACAN')).toBeFalse();
    expect(dozvoljeneKomande(naPitanju('ZATVORENO', {}, pitanjeSlajd('BROJ', { brojTacno: 4 }))).has('TACAN')).toBeTrue();
    expect(dozvoljeneKomande(naPitanju('ZATVORENO', {}, pitanjeSlajd('KRATAK_TEKST', { prihvatljiviOdgovori: [] }))).has('TACAN')).toBeFalse();
  });

  it('prikazan tačan odgovor i rezultati mogu uvek da se sakriju', () => {
    const d = dozvoljeneKomande(stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd(), tacanPrikazan: true, rezultatiPrikazani: true }));
    expect(d.has('TACAN')).toBeTrue();
    expect(d.has('REZULTATI')).toBeTrue();
  });

  it('rang-lista samo uz takmičenje (ili da se sakrije)', () => {
    expect(dozvoljeneKomande(stanje()).has('RANG_LISTA')).toBeFalse();
    expect(dozvoljeneKomande(stanje({ takmicenje: true })).has('RANG_LISTA')).toBeTrue();
    expect(dozvoljeneKomande(stanje({ rangListaPrikazana: true })).has('RANG_LISTA')).toBeTrue();
  });
});

describe('imaTacanOdgovor i ispravanIndeks', () => {
  it('tipovi bez tačnog', () => {
    expect(imaTacanOdgovor(pitanjeSlajd('TACNO_NETACNO').pitanje)).toBeTrue();
    expect(imaTacanOdgovor(pitanjeSlajd('KRATAK_TEKST', { prihvatljiviOdgovori: ['beton'] }).pitanje)).toBeTrue();
    expect(imaTacanOdgovor(null)).toBeFalse();
  });

  it('IDI_NA od -1 do broja slajdova', () => {
    expect(ispravanIndeks(-1, 3)).toBeTrue();
    expect(ispravanIndeks(3, 3)).toBeTrue();
    expect(ispravanIndeks(4, 3)).toBeFalse();
    expect(ispravanIndeks(-2, 3)).toBeFalse();
    expect(ispravanIndeks(undefined, 3)).toBeFalse();
  });
});

describe('javniRezultat', () => {
  const r: Rezultat = {
    tip: 'KRATAK_TEKST', ukupno: 3, opcije: null, brojevi: null, skala: null,
    tekstovi: [
      { kljuc: 'beton', tekst: 'Beton', broj: 2, sakriven: false, tacan: true },
      { kljuc: 'glupost', tekst: 'Glupost', broj: 1, sakriven: true, tacan: false },
    ],
  };

  it('sakriveni tekstovi se ne vide, tačnost tek posle C', () => {
    expect(javniRezultat(r, false)!.tekstovi).toEqual([{ kljuc: 'beton', tekst: 'Beton', broj: 2, sakriven: false, tacan: null }]);
    expect(javniRezultat(r, true)!.tekstovi![0].tacan).toBeTrue();
    expect(javniRezultat(null, true)).toBeNull();
  });

  it('opcije bez tačnosti dok tačan nije prikazan', () => {
    const o: Rezultat = { tip: 'JEDAN_TACAN', ukupno: 1, brojevi: null, skala: null, tekstovi: null,
      opcije: [{ id: 1, tekst: '4', broj: 1, tacna: true }] };
    expect(javniRezultat(o, false)!.opcije![0].tacna).toBeNull();
    expect(javniRezultat(o, true)!.opcije![0].tacna).toBeTrue();
  });
});

describe('oznake', () => {
  it('dalje po fazi', () => {
    expect(oznakaDalje(stanje())).toBe('Počni');
    expect(oznakaDalje(naPitanju('CEKA'))).toBe('Otvori pitanje');
    expect(oznakaDalje(naPitanju('OTVORENO'))).toBe('Zatvori pitanje');
    expect(oznakaDalje(naPitanju('ZATVORENO'))).toBe('Sledeći slajd');
    expect(oznakaDalje(naPitanju('ZATVORENO', { indeks: 2 }))).toBe('Na kraj');
    expect(oznakaDalje(stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd(), korak: 0, brojStavki: 2 }))).toBe('Sledeća stavka');
  });

  it('tajmer', () => {
    expect(oznakaTajmera(naPitanju('OTVORENO'))).toBe('Pokreni tajmer 30 s');
    expect(oznakaTajmera(naPitanju('OTVORENO', { runda: { id: 9, redniBroj: 1, rokMs: 5, preostaloMs: null, tajmerRadi: true } }))).toBe('Pauziraj tajmer');
    expect(oznakaTajmera(naPitanju('OTVORENO', { runda: { id: 9, redniBroj: 1, rokMs: null, preostaloMs: 5, tajmerRadi: false } }))).toBe('Nastavi tajmer');
  });
});
