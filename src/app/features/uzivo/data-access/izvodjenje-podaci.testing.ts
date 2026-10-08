import { NastavnickoStanje, PitanjeDetails, SlajdDetails, TipPitanja } from './uzivo.models';

/** Zajednički podaci za testove izvođenja (nije spec, nema `describe`). */
export function pitanjeSlajd(tip: TipPitanja = 'JEDAN_TACAN', izmene: Partial<PitanjeDetails> = {}): SlajdDetails {
  const pitanje: PitanjeDetails = {
    id: 51, tip, tekst: 'Koliko je 2 + 2?', slika: null, vremeSekunde: 20,
    opcije: [{ id: 1, rb: 1, tekst: '3', tacna: false }, { id: 2, rb: 2, tekst: '4', tacna: true }],
    brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
    prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null, ...izmene,
  };
  return { id: 21, rb: 2, tip: 'PITANJE', naslov: null, sadrzaj: null, slika: null, beleske: 'Pazi na vreme.', postepeno: false, pitanje };
}

export function infoSlajd(izmene: Partial<SlajdDetails> = {}): SlajdDetails {
  return { id: 20, rb: 1, tip: 'INFO', naslov: 'Uvod', sadrzaj: '- a\n- b', slika: null, beleske: null, postepeno: false, pitanje: null, ...izmene };
}

export function stanje(izmene: Partial<NastavnickoStanje> = {}): NastavnickoStanje {
  return {
    izvodjenje: {
      id: 5, prezentacija: { id: 3, naziv: 'Statika', predmetId: 7 }, kod: '123456', status: 'AKTIVNO', cuvanje: true,
      grupa: null, predavanje: null, pocetak: '2026-10-07T10:00:00', kraj: null, brojUcesnika: 2, brojPitanja: 1,
    },
    verzija: 1, serverVremeMs: 1_000_000, prikaz: 'PRIJAVA', korak: 0, brojStavki: 0, indeks: -1, brojSlajdova: 3,
    trenutniSlajd: null, sledeciSlajd: infoSlajd(), faza: null, runda: null, rezultatiPrikazani: false,
    tacanPrikazan: false, rangListaPrikazana: false, ekran: 'NORMALAN', qrPrikazan: false, telefonPrikaz: 'DUGMAD',
    detaljiDozvoljeni: true, takmicenje: false, rezultat: null, brojOdgovora: 0, brojPovezanih: 2,
    ucesnici: [
      { id: 1, ime: 'Ana', poeni: 0, povezan: true, odgovorio: false },
      { id: 2, ime: 'Bojan', poeni: 0, povezan: true, odgovorio: false },
    ],
    rangLista: [],
    ...izmene,
  };
}

/** Pitanje na slajdu 2 u zadatoj fazi (sa rundom kad nije CEKA). */
export function naPitanju(faza: 'CEKA' | 'OTVORENO' | 'ZATVORENO', izmene: Partial<NastavnickoStanje> = {},
                          slajd: SlajdDetails = pitanjeSlajd()): NastavnickoStanje {
  return stanje({
    prikaz: 'SLAJD', indeks: 1, trenutniSlajd: slajd, faza,
    runda: faza === 'CEKA' ? null : { id: 9, redniBroj: 1, rokMs: null, preostaloMs: null, tajmerRadi: false },
    ...izmene,
  });
}
