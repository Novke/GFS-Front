import { infoSlajd, naPitanju, pitanjeSlajd, stanje } from './izvodjenje-podaci.testing';
import {
  datumKratko, dozvoljeneKomande, imaBrojeve, imaTacanOdgovor, ispravanIndeks, mozePregled, odgovorili, opisVeze,
  oznakaDalje, oznakaTajmera,
} from './izvodjenje-pravila';

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

describe('odgovorili (x/y u konzoli)', () => {
  const u = (id: number, povezan: boolean, odgovorio: boolean) => ({ id, ime: 'U' + id, poeni: 0, povezan, odgovorio });

  it('odgovorio pa izgubio vezu: ostaje u imeniocu, nema 3/2', () => {
    const s = naPitanju('OTVORENO', {
      ucesnici: [u(1, true, true), u(2, true, true), u(3, false, true), u(4, false, false)],
      brojOdgovora: 3, brojPovezanih: 2,
    });
    expect(odgovorili(s)).toEqual({ broj: 3, od: 3, svi: true });
  });

  it('"svi odgovorili" ne pali dok povezani nisu odgovorili', () => {
    // 2 povezana, oba bez odgovora; treći odgovorio pa otišao: 1/3, ne 1/2 pa 2/2 prerano
    const s = naPitanju('OTVORENO', {
      ucesnici: [u(1, true, false), u(2, true, false), u(3, false, true)],
      brojOdgovora: 1, brojPovezanih: 2,
    });
    expect(odgovorili(s)).toEqual({ broj: 1, od: 3, svi: false });
    const posle = naPitanju('OTVORENO', {
      ucesnici: [u(1, true, true), u(2, true, false), u(3, false, true)],
      brojOdgovora: 2, brojPovezanih: 2,
    });
    expect(odgovorili(posle)).toEqual({ broj: 2, od: 3, svi: false });
  });

  it('niko povezan i niko odgovorio: 0/0 bez isticanja', () => {
    const s = naPitanju('OTVORENO', { ucesnici: [u(1, false, false)], brojOdgovora: 0, brojPovezanih: 0 });
    expect(odgovorili(s)).toEqual({ broj: 0, od: 0, svi: false });
  });

  it('imenilac nikad manji od broja povezanih ni broja odgovora', () => {
    const s = naPitanju('OTVORENO', { ucesnici: [], brojOdgovora: 4, brojPovezanih: 5 });
    expect(odgovorili(s)).toEqual({ broj: 4, od: 5, svi: false });
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

describe('opisVeze i datumKratko', () => {
  it('datum bez vremena i bez vodećih nula', () => {
    expect(datumKratko('2026-10-07')).toBe('7.10.2026.');
    expect(datumKratko('2026-01-05T10:00:00')).toBe('5.1.2026.');
    expect(datumKratko(null)).toBe('');
    expect(datumKratko('nije datum')).toBe('nije datum');
  });

  it('predavanje sa grupom i temom', () => {
    expect(opisVeze({
      grupa: { id: 2, naziv: 'GD-2025' }, predavanje: { id: 4, rb: 3, datum: '2026-10-07', tema: 'Statika' },
    })).toBe('GD-2025 · 3. predavanje (7.10.2026.) · Statika');
  });

  it('predavanje bez grupe i teme', () => {
    expect(opisVeze({ grupa: null, predavanje: { id: 4, rb: 1, datum: '2026-10-07', tema: null } }))
      .toBe('1. predavanje (7.10.2026.)');
  });

  it('samo grupa', () => {
    expect(opisVeze({ grupa: { id: 2, naziv: 'AR-2025' }, predavanje: null })).toBe('AR-2025');
  });

  it('bez grupe i predavanja', () => {
    expect(opisVeze({ grupa: null, predavanje: null })).toBe('Bez grupe');
  });
});

describe('imaBrojeve i mozePregled', () => {
  it('završeno bez čuvanja nema brojeve ni pregled', () => {
    expect(imaBrojeve({ cuvanje: false, status: 'ZAVRSENO' })).toBe(false);
    expect(mozePregled({ cuvanje: false, status: 'ZAVRSENO' })).toBe(false);
  });

  it('aktivno bez čuvanja ima brojeve, ali još nema pregled', () => {
    expect(imaBrojeve({ cuvanje: false, status: 'AKTIVNO' })).toBe(true);
    expect(mozePregled({ cuvanje: true, status: 'AKTIVNO' })).toBe(false);
  });

  it('završeno sa čuvanjem ima oba', () => {
    expect(imaBrojeve({ cuvanje: true, status: 'ZAVRSENO' })).toBe(true);
    expect(mozePregled({ cuvanje: true, status: 'ZAVRSENO' })).toBe(true);
  });
});
