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
    expect(d.has('SLEDECI')).toBe(true);
    expect(d.has('PRETHODNI')).toBe(false);
    expect(d.has('OTVORI_ZATVORI')).toBe(false);
    expect(d.has('REZULTATI')).toBe(false);
    expect(d.has('QR')).toBe(true);
    expect(d.has('ZAVRSI')).toBe(true);
  });

  it('kraj: dalje ne, nazad da', () => {
    const d = dozvoljeneKomande(stanje({ prikaz: 'KRAJ', indeks: 3 }));
    expect(d.has('SLEDECI')).toBe(false);
    expect(d.has('PRETHODNI')).toBe(true);
  });

  it('CEKA: otvori da; rezultati, tačan, ponovi i tajmer ne', () => {
    const d = dozvoljeneKomande(naPitanju('CEKA'));
    expect(d.has('OTVORI_ZATVORI')).toBe(true);
    expect(d.has('REZULTATI')).toBe(false);
    expect(d.has('TACAN')).toBe(false);
    expect(d.has('PONOVI')).toBe(false);
    expect(d.has('TAJMER')).toBe(false);
  });

  it('OTVORENO: rezultati, ponovi i tajmer da; tačan ne; ± samo kad tajmer postoji', () => {
    let d = dozvoljeneKomande(naPitanju('OTVORENO'));
    expect(d.has('REZULTATI')).toBe(true);
    expect(d.has('PONOVI')).toBe(true);
    expect(d.has('TAJMER')).toBe(true);
    expect(d.has('TACAN')).toBe(false);
    expect(d.has('TAJMER_PLUS')).toBe(false);
    d = dozvoljeneKomande(naPitanju('OTVORENO', { runda: { id: 9, redniBroj: 1, rokMs: 5, preostaloMs: null, tajmerRadi: true } }));
    expect(d.has('TAJMER_PLUS')).toBe(true);
    expect(d.has('TAJMER_MINUS')).toBe(true);
    d = dozvoljeneKomande(naPitanju('OTVORENO', { runda: { id: 9, redniBroj: 1, rokMs: null, preostaloMs: 4000, tajmerRadi: false } }));
    expect(d.has('TAJMER_MINUS')).toBe(true);
  });

  it('ZATVORENO: tačan samo kad pitanje ima tačan odgovor; tajmer ne', () => {
    expect(dozvoljeneKomande(naPitanju('ZATVORENO')).has('TACAN')).toBe(true);
    expect(dozvoljeneKomande(naPitanju('ZATVORENO')).has('TAJMER')).toBe(false);
    expect(dozvoljeneKomande(naPitanju('ZATVORENO', {}, pitanjeSlajd('ANKETA'))).has('TACAN')).toBe(false);
    expect(dozvoljeneKomande(naPitanju('ZATVORENO', {}, pitanjeSlajd('SKALA'))).has('TACAN')).toBe(false);
    expect(dozvoljeneKomande(naPitanju('ZATVORENO', {}, pitanjeSlajd('BROJ', { brojTacno: null }))).has('TACAN')).toBe(false);
    expect(dozvoljeneKomande(naPitanju('ZATVORENO', {}, pitanjeSlajd('BROJ', { brojTacno: 4 }))).has('TACAN')).toBe(true);
    expect(dozvoljeneKomande(naPitanju('ZATVORENO', {}, pitanjeSlajd('KRATAK_TEKST', { prihvatljiviOdgovori: [] }))).has('TACAN')).toBe(false);
  });

  it('prikazan tačan odgovor i rezultati mogu uvek da se sakriju', () => {
    const d = dozvoljeneKomande(stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd(), tacanPrikazan: true, rezultatiPrikazani: true }));
    expect(d.has('TACAN')).toBe(true);
    expect(d.has('REZULTATI')).toBe(true);
  });

  it('rang-lista samo uz takmičenje (ili da se sakrije)', () => {
    expect(dozvoljeneKomande(stanje()).has('RANG_LISTA')).toBe(false);
    expect(dozvoljeneKomande(stanje({ takmicenje: true })).has('RANG_LISTA')).toBe(true);
    expect(dozvoljeneKomande(stanje({ rangListaPrikazana: true })).has('RANG_LISTA')).toBe(true);
  });
});

describe('imaTacanOdgovor i ispravanIndeks', () => {
  it('tipovi bez tačnog', () => {
    expect(imaTacanOdgovor(pitanjeSlajd('TACNO_NETACNO').pitanje)).toBe(true);
    expect(imaTacanOdgovor(pitanjeSlajd('KRATAK_TEKST', { prihvatljiviOdgovori: ['beton'] }).pitanje)).toBe(true);
    expect(imaTacanOdgovor(null)).toBe(false);
  });

  it('IDI_NA od -1 do broja slajdova', () => {
    expect(ispravanIndeks(-1, 3)).toBe(true);
    expect(ispravanIndeks(3, 3)).toBe(true);
    expect(ispravanIndeks(4, 3)).toBe(false);
    expect(ispravanIndeks(-2, 3)).toBe(false);
    expect(ispravanIndeks(undefined, 3)).toBe(false);
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
    expect(javniRezultat(r, true)!.tekstovi![0].tacan).toBe(true);
    expect(javniRezultat(null, true)).toBeNull();
  });

  it('opcije bez tačnosti dok tačan nije prikazan', () => {
    const o: Rezultat = { tip: 'JEDAN_TACAN', ukupno: 1, brojevi: null, skala: null, tekstovi: null,
      opcije: [{ id: 1, tekst: '4', broj: 1, tacna: true }] };
    expect(javniRezultat(o, false)!.opcije![0].tacna).toBeNull();
    expect(javniRezultat(o, true)!.opcije![0].tacna).toBe(true);
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
    expect(oznakaTajmera(naPitanju('ZATVORENO', { runda: { id: 9, redniBroj: 1, rokMs: 5, preostaloMs: null, tajmerRadi: false } }))).toBe('Pokreni tajmer 30 s');
    expect(oznakaTajmera(naPitanju('OTVORENO', { runda: { id: 9, redniBroj: 1, rokMs: 5, preostaloMs: null, tajmerRadi: true } }))).toBe('Pauziraj tajmer');
    expect(oznakaTajmera(naPitanju('OTVORENO', { runda: { id: 9, redniBroj: 1, rokMs: null, preostaloMs: 5, tajmerRadi: false } }))).toBe('Nastavi tajmer');
  });
});
