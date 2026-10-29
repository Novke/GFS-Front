import { platno } from './platno-podaci.testing';
import { infoSlajd, naPitanju, naZadatku, pitanjeSlajd, platnoSlajd, stanje, varijantaRunde } from './izvodjenje-podaci.testing';
import {
  datumKratko, dozvoljeneKomande, imaBrojeve, imaTacanOdgovor, imaTacanOdgovorZadatka, ispravanIndeks, mozePregled, odgovorili,
  opisVeze, naslovSledeceg, oznakaDalje, oznakaPolozaja, oznakaPolozajaKratko, oznakaTajmera, sledeciKlik, SledeciKlik,
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

  it('rang izvođenja uvek; rang predavanja kad predavanje ima još izvođenja (ili da se sakrije)', () => {
    expect(dozvoljeneKomande(stanje()).has('RANG_LISTA')).toBe(true);
    expect(dozvoljeneKomande(stanje()).has('RANG_PREDAVANJA')).toBe(false);
    expect(dozvoljeneKomande(stanje({ imaRangPredavanja: true })).has('RANG_PREDAVANJA')).toBe(true);
    expect(dozvoljeneKomande(stanje({ rangListaPrikazana: true, rangPrikaz: 'PREDAVANJE' })).has('RANG_PREDAVANJA')).toBe(true);
  });
});

describe('dozvoljeneKomande na Zadatak slajdu', () => {
  it('CEKA: otvori i broj različitih da; rešenje, tačan, ponovi, rezultati i tajmer ne', () => {
    const d = dozvoljeneKomande(naZadatku('CEKA'));
    expect(d.has('OTVORI_ZATVORI')).toBe(true);
    expect(d.has('BROJ_VARIJANTI')).toBe(true);
    expect(d.has('RESENJE')).toBe(false);
    expect(d.has('TACAN')).toBe(false);
    expect(d.has('PONOVI')).toBe(false);
    expect(d.has('REZULTATI')).toBe(false);
    expect(d.has('TAJMER')).toBe(false);
  });

  it('OTVORENO: zatvori, ponovi, rezultati i tajmer kao pitanje; broj različitih, rešenje i tačan ne', () => {
    let d = dozvoljeneKomande(naZadatku('OTVORENO'));
    expect(d.has('OTVORI_ZATVORI')).toBe(true);
    expect(d.has('PONOVI')).toBe(true);
    expect(d.has('REZULTATI')).toBe(true);
    expect(d.has('TAJMER')).toBe(true);
    expect(d.has('TAJMER_PLUS')).toBe(false);
    expect(d.has('BROJ_VARIJANTI')).toBe(false);
    expect(d.has('RESENJE')).toBe(false);
    expect(d.has('TACAN')).toBe(false);
    d = dozvoljeneKomande(naZadatku('OTVORENO', { stanje: { runda: { id: 9, redniBroj: 1, rokMs: 5, preostaloMs: null, tajmerRadi: true } } }));
    expect(d.has('TAJMER_PLUS')).toBe(true);
    expect(d.has('TAJMER_MINUS')).toBe(true);
  });

  it('ZATVORENO sa rešenjem: rešenje i tačan da; bez ijednog rešenja rešenje ne', () => {
    let d = dozvoljeneKomande(naZadatku('ZATVORENO'));
    expect(d.has('RESENJE')).toBe(true);
    expect(d.has('TACAN')).toBe(true);
    expect(d.has('PONOVI')).toBe(true);
    expect(d.has('REZULTATI')).toBe(true);
    expect(d.has('BROJ_VARIJANTI')).toBe(false);
    expect(d.has('TAJMER')).toBe(false);
    d = dozvoljeneKomande(naZadatku('ZATVORENO', { varijante: [varijantaRunde(11, false), varijantaRunde(12, false)] }));
    expect(d.has('RESENJE')).toBe(false);
    // bar jedna varijanta sa rešenjem je dovoljna (server: "Nijedna varijanta nema rešenje." tek kad nema nijedne)
    d = dozvoljeneKomande(naZadatku('ZATVORENO', { varijante: [varijantaRunde(11, false), varijantaRunde(12)] }));
    expect(d.has('RESENJE')).toBe(true);
  });

  it('rad na papiru (šema bez polja): tačan ne, rešenje da', () => {
    const d = dozvoljeneKomande(naZadatku('ZATVORENO', { polja: [] }));
    expect(d.has('TACAN')).toBe(false);
    expect(d.has('RESENJE')).toBe(true);
  });

  it('uključeno rešenje i prikazan tačan mogu uvek da se isključe', () => {
    const d = dozvoljeneKomande(naZadatku('CEKA', { zadatak: { resenjePrikazano: true }, stanje: { tacanPrikazan: true } }));
    expect(d.has('RESENJE')).toBe(true);
    expect(d.has('TACAN')).toBe(true);
    expect(dozvoljeneKomande(naZadatku('ZATVORENO', { polja: [], stanje: { tacanPrikazan: true } })).has('TACAN')).toBe(true);
  });

  it('pitanje i INFO nemaju rešenje ni broj različitih', () => {
    for (const s of [naPitanju('CEKA'), naPitanju('ZATVORENO'), stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd() })]) {
      expect(dozvoljeneKomande(s).has('RESENJE')).toBe(false);
      expect(dozvoljeneKomande(s).has('BROJ_VARIJANTI')).toBe(false);
    }
  });

  it('Zadatak slajd se ne računa dok je prikaz prijava', () => {
    const naPrijavi = naZadatku('CEKA', { stanje: { prikaz: 'PRIJAVA', indeks: -1 } });
    expect(dozvoljeneKomande(naPrijavi).has('OTVORI_ZATVORI')).toBe(false);
    expect(dozvoljeneKomande(naPrijavi).has('BROJ_VARIJANTI')).toBe(false);
  });

  it('imaTacanOdgovorZadatka: bar jedna izvučena varijanta ima polje (kao ZadatakSnimak.imaTacanOdgovor)', () => {
    expect(imaTacanOdgovorZadatka(naZadatku('ZATVORENO').zadatak)).toBe(true);
    expect(imaTacanOdgovorZadatka(naZadatku('ZATVORENO', { polja: [] }).zadatak)).toBe(false);
    expect(imaTacanOdgovorZadatka(naZadatku('CEKA').zadatak)).toBe(false);
    expect(imaTacanOdgovorZadatka(null)).toBe(false);
    expect(imaTacanOdgovorZadatka(undefined)).toBe(false);
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

  it('broji i nepovezane učesnike: 18 učesnika, 15 povezanih, 15 odgovora je 15 od 18', () => {
    const ucesnici = Array.from({ length: 18 }, (_, i) => u(i + 1, i < 15, false));
    const s = naPitanju('OTVORENO', { ucesnici, brojOdgovora: 15, brojPovezanih: 15 });
    expect(odgovorili(s)).toEqual({ broj: 15, od: 18, svi: false });
  });

  it('brojOcekivanih sa servera (čekirani koji nisu ušli): 15 učesnika, 15 odgovora, 18 očekivanih je 15 od 18', () => {
    const ucesnici = Array.from({ length: 15 }, (_, i) => u(i + 1, true, true));
    const s = naPitanju('OTVORENO', { ucesnici, brojOdgovora: 15, brojPovezanih: 15, brojOcekivanih: 18, brojCekiranih: 18 });
    expect(odgovorili(s)).toEqual({ broj: 15, od: 18, svi: false });
  });

  it('bez brojOcekivanih (stari backend) imenilac su učesnici', () => {
    const s = naPitanju('OTVORENO', { ucesnici: [u(1, true, true), u(2, false, false)], brojOdgovora: 1, brojPovezanih: 1 });
    expect(s.brojOcekivanih).toBeUndefined();
    expect(odgovorili(s)).toEqual({ broj: 1, od: 2, svi: false });
  });

  it('odgovorio pa izgubio vezu: ostaje u imeniocu, nema 3/2', () => {
    const s = naPitanju('OTVORENO', {
      ucesnici: [u(1, true, true), u(2, true, true), u(3, false, true), u(4, false, false)],
      brojOdgovora: 3, brojPovezanih: 2,
    });
    expect(odgovorili(s)).toEqual({ broj: 3, od: 4, svi: false });
  });

  it('"svi odgovorili" pali tek kad su odgovorili svi učesnici, povezani ili ne', () => {
    const s = naPitanju('OTVORENO', {
      ucesnici: [u(1, true, true), u(2, false, true), u(3, false, true)],
      brojOdgovora: 3, brojPovezanih: 1,
    });
    expect(odgovorili(s)).toEqual({ broj: 3, od: 3, svi: true });
  });

  it('bez učesnika: 0/0 bez isticanja', () => {
    const s = naPitanju('OTVORENO', { ucesnici: [], brojOdgovora: 0, brojPovezanih: 0 });
    expect(odgovorili(s)).toEqual({ broj: 0, od: 0, svi: false });
  });

  it('imenilac nikad manji od broja odgovora (nikad 31/30)', () => {
    const s = naPitanju('OTVORENO', { ucesnici: [u(1, true, true)], brojOdgovora: 4, brojPovezanih: 1 });
    expect(odgovorili(s)).toEqual({ broj: 4, od: 4, svi: true });
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

  it('dalje na Zadatak slajdu: otvori, zatvori, pa sledeći slajd', () => {
    expect(oznakaDalje(naZadatku('CEKA'))).toBe('Otvori zadatak');
    expect(oznakaDalje(naZadatku('OTVORENO'))).toBe('Zatvori zadatak');
    expect(oznakaDalje(naZadatku('ZATVORENO'))).toBe('Sledeći slajd');
    expect(oznakaDalje(naZadatku('ZATVORENO', { stanje: { indeks: 2 } }))).toBe('Na kraj');
  });

  it('dalje na PLATNO slajdu: koraci, pa sledeći slajd', () => {
    const naPlatnu = (korak: number, indeks = 0) =>
      stanje({ prikaz: 'SLAJD', indeks, trenutniSlajd: platnoSlajd(), korak, brojStavki: 2 });
    expect(oznakaDalje(naPlatnu(0))).toBe('Sledeći korak');
    expect(oznakaDalje(naPlatnu(1))).toBe('Sledeći korak');
    expect(oznakaDalje(naPlatnu(2))).toBe('Sledeći slajd');
    expect(oznakaDalje(naPlatnu(2, 2))).toBe('Na kraj');
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

describe('oznakaPolozaja i oznakaPolozajaKratko', () => {
  it.each([
    [stanje(), 'Prijava', 'Prijava'],
    [stanje({ prikaz: 'KRAJ', indeks: 3 }), 'Kraj', 'Kraj'],
    [naPitanju('CEKA'), 'Slajd 2/3', '2/3'],
    [stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd({ postepeno: true }), korak: 0, brojStavki: 2 }), 'Slajd 1/3 · korak 0/2', '1/3 · 0/2'],
    [stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd({ postepeno: true }), korak: 2, brojStavki: 2 }), 'Slajd 1/3 · korak 2/2', '1/3 · 2/2'],
  ])('%#', (s, duga, kratka) => {
    expect(oznakaPolozaja(s)).toBe(duga);
    expect(oznakaPolozajaKratko(s)).toBe(kratka);
  });
});

describe('sledeciKlik', () => {
  const info = infoSlajd({ postepeno: true });
  const sledeci = infoSlajd({ id: 30, rb: 3, naslov: 'Dalje' });
  it('prijava -> prvi slajd na koraku 0', () => {
    expect(sledeciKlik(stanje())).toEqual({ vrsta: 'SLAJD', slajd: infoSlajd(), indeks: 0 });
  });
  it('slajd sa preostalim koracima -> isti slajd, korak k+1', () => {
    const s = stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: info, sledeciSlajd: sledeci, korak: 1, brojStavki: 3 });
    expect(sledeciKlik(s)).toEqual({ vrsta: 'KORAK', slajd: info, indeks: 0, korak: 2, brojKoraka: 3 });
  });
  it('poslednji korak -> sledeći slajd na koraku 0', () => {
    const s = stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: info, sledeciSlajd: sledeci, korak: 3, brojStavki: 3 });
    expect(sledeciKlik(s)).toEqual({ vrsta: 'SLAJD', slajd: sledeci, indeks: 1 });
  });
  it('pitanje CEKA/OTVORENO -> radnja i slajd posle pitanja; ZATVORENO -> sledeći slajd', () => {
    expect(sledeciKlik(naPitanju('CEKA', { sledeciSlajd: sledeci }))).toEqual({ vrsta: 'PITANJE', radnja: 'OTVARA', potom: sledeci, indeksPotom: 2 });
    expect(sledeciKlik(naPitanju('OTVORENO', { sledeciSlajd: null }))).toEqual({ vrsta: 'PITANJE', radnja: 'ZATVARA', potom: null, indeksPotom: 2 });
    expect(sledeciKlik(naPitanju('ZATVORENO', { sledeciSlajd: sledeci }))).toEqual({ vrsta: 'SLAJD', slajd: sledeci, indeks: 2 });
  });
  it('Zadatak kao pitanje: CEKA otvara, OTVORENO zatvara, ZATVORENO -> sledeći slajd', () => {
    expect(sledeciKlik(naZadatku('CEKA', { stanje: { sledeciSlajd: sledeci } })))
      .toEqual({ vrsta: 'PITANJE', radnja: 'OTVARA', potom: sledeci, indeksPotom: 2 });
    expect(sledeciKlik(naZadatku('OTVORENO', { stanje: { sledeciSlajd: null } })))
      .toEqual({ vrsta: 'PITANJE', radnja: 'ZATVARA', potom: null, indeksPotom: 2 });
    expect(sledeciKlik(naZadatku('ZATVORENO', { stanje: { sledeciSlajd: sledeci } }))).toEqual({ vrsta: 'SLAJD', slajd: sledeci, indeks: 2 });
  });
  it('poslednji slajd bez koraka -> KRAJ; prikaz KRAJ -> NISTA', () => {
    expect(sledeciKlik(naPitanju('ZATVORENO', { indeks: 2, sledeciSlajd: null }))).toEqual({ vrsta: 'KRAJ' });
    expect(sledeciKlik(stanje({ prikaz: 'KRAJ', indeks: 3, sledeciSlajd: null }))).toEqual({ vrsta: 'NISTA' });
  });
  it('PLATNO sa koracima se ponaša kao INFO postepeno (brojStavki = broj KLIK animacija)', () => {
    const pl = { ...infoSlajd(), tip: 'PLATNO' as const, platno: platno() };
    const s = stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: pl, korak: 0, brojStavki: 2 });
    expect(sledeciKlik(s)).toMatchObject({ vrsta: 'KORAK', korak: 1, brojKoraka: 2 });
  });
});

describe('naslovSledeceg', () => {
  it.each<[SledeciKlik, string]>([
    [{ vrsta: 'KORAK', slajd: infoSlajd(), indeks: 0, korak: 4, brojKoraka: 6 }, 'Sledeće · korak 4/6'],
    [{ vrsta: 'SLAJD', slajd: infoSlajd(), indeks: 12 }, 'Sledeće · slajd 13/48'],
    [{ vrsta: 'PITANJE', radnja: 'OTVARA', potom: null, indeksPotom: 5 }, 'Sledeće'],
    [{ vrsta: 'PITANJE', radnja: 'ZATVARA', potom: null, indeksPotom: 5 }, 'Sledeće'],
    [{ vrsta: 'KRAJ' }, 'Sledeće · kraj prezentacije'],
    [{ vrsta: 'NISTA' }, 'Sledeće'],
  ])('%#', (k, tekst) => expect(naslovSledeceg(k, 48)).toBe(tekst));
});
