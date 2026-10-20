import { platno } from './platno-podaci.testing';
import {
  NastavnickiZadatak, NastavnickoStanje, PitanjeDetails, PoljeZadatka, RezultatVarijante, SlajdDetails, TipPitanja, VarijantaRunde,
  ZadatakSlajdaInfo,
} from './uzivo.models';

/** Zajednički podaci za testove izvođenja (nije spec, nema `describe`). */
export function pitanjeSlajd(tip: TipPitanja = 'JEDAN_TACAN', izmene: Partial<PitanjeDetails> = {}): SlajdDetails {
  const pitanje: PitanjeDetails = {
    id: 51, tip, tekst: 'Koliko je 2 + 2?', slika: null, vremeSekunde: 20,
    opcije: [{ id: 1, rb: 1, tekst: '3', tacna: false }, { id: 2, rb: 2, tekst: '4', tacna: true }],
    brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
    prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null, ...izmene,
  };
  return { id: 21, rb: 2, tip: 'PITANJE', naslov: null, sadrzaj: null, slika: null, beleske: 'Pazi na vreme.', postepeno: false, pitanje, platno: null, prelaz: null };
}

export function infoSlajd(izmene: Partial<SlajdDetails> = {}): SlajdDetails {
  return { id: 20, rb: 1, tip: 'INFO', naslov: 'Uvod', sadrzaj: '- a\n- b', slika: null, beleske: null, postepeno: false, pitanje: null, platno: null, prelaz: null, ...izmene };
}

/** PLATNO slajd sa fabričkim platnom (`platno()`: 4 animacije, 2 KLIK koraka). */
export function platnoSlajd(izmene: Partial<SlajdDetails> = {}): SlajdDetails {
  return {
    id: 30, rb: 1, tip: 'PLATNO', naslov: null, sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje: null,
    platno: platno(), prelaz: null, ...izmene,
  };
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
    detaljiDozvoljeni: true, takmicenje: false, tema: 'NACRT', rezultat: null, brojOdgovora: 0, brojPovezanih: 2,
    ucesnici: [
      { id: 1, ime: 'Ana', poeni: 0, povezan: true, odgovorio: false },
      { id: 2, ime: 'Bojan', poeni: 0, povezan: true, odgovorio: false },
    ],
    rangLista: [],
    javniRezultat: null,
    javnaRangLista: null,
    pocetakMs: 400_000,
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

/** BROJ polje `a` šeme zadatka (lista `2 → 10`). */
export function poljeBroj(izmene: Partial<PoljeZadatka> = {}): PoljeZadatka {
  return {
    kljuc: 'a', oznaka: 'a', tip: 'BROJ', odstupanje: 0, odstupanjeTip: 'APSOLUTNO', jedinica: null, zanemariVelicinu: null,
    zanemariRazmake: null, opcije: null, ...izmene,
  };
}

/** Opis Zadatak slajda kao sa servera: list `2 → 10`, jedno BROJ polje, 2 aktivne varijante, bez upozorenja. */
export function zadatakInfo(izmene: Partial<ZadatakSlajdaInfo> = {}): ZadatakSlajdaInfo {
  return {
    grupaId: 2, vremeSekunde: 120, brojVarijanti: null, grupaNaziv: '2 → 10',
    putanja: [{ id: 1, naziv: 'Konverzije brojeva (demo)' }, { id: 2, naziv: '2 → 10' }], list: true, brojAktivnihVarijanti: 2,
    polja: [poljeBroj()], iskljucena: false, iskljucenePodgrupe: [], upozorenja: [], ...izmene,
  };
}

export function zadatakSlajd(izmene: Partial<ZadatakSlajdaInfo> = {}): SlajdDetails {
  return {
    id: 22, rb: 2, tip: 'ZADATAK', naslov: null, sadrzaj: null, slika: null, beleske: null, postepeno: false, pitanje: null,
    platno: null, prelaz: null, zadatak: zadatakInfo(izmene),
  };
}

/** Izvučena varijanta runde (`svg-V<id>`, rešenje `res-V<id>` ili bez njega). */
export function varijantaRunde(varijantaId: number, saResenjem = true): VarijantaRunde {
  return {
    varijantaId, naziv: `V${varijantaId}`, svgId: `svg-V${varijantaId}`, resenjeSvgId: saResenjem ? `res-V${varijantaId}` : null,
    dodeljeno: 1, odgovorilo: 0, tacnih: 0,
  };
}

/** Rezultat varijante za konzolu (sve vidljivo); `polja` = šema varijante (prazna = rad na papiru). */
export function rezultatVarijante(v: VarijantaRunde, polja: PoljeZadatka[] = [poljeBroj()]): RezultatVarijante {
  return {
    varijantaId: v.varijantaId, naziv: v.naziv, svgId: v.svgId, resenjeSvgId: v.resenjeSvgId, dodeljeno: v.dodeljeno,
    odgovorilo: v.odgovorilo, tacnih: v.tacnih,
    polja: polja.map(p => ({
      kljuc: p.kljuc, oznaka: p.oznaka, tip: p.tip, jedinica: p.jedinica, vrednosti: [], opcije: null,
      tacno: { broj: 45, prihvatljivi: null, tacna: null, tacne: null },
    })),
  };
}

/**
 * Zadatak slajd na mestu 2 u zadatoj fazi (sa rundom i dve izvučene varijante kad nije CEKA). `varijante` i `polja` menjaju
 * izvučene varijante i šemu (npr. bez rešenja, rad na papiru).
 */
export function naZadatku(faza: 'CEKA' | 'OTVORENO' | 'ZATVORENO', opcije: {
  zadatak?: Partial<NastavnickiZadatak>; varijante?: VarijantaRunde[]; polja?: PoljeZadatka[]; stanje?: Partial<NastavnickoStanje>;
} = {}): NastavnickoStanje {
  const slajd = zadatakSlajd(opcije.polja ? { polja: opcije.polja } : {});
  const varijante = faza === 'CEKA' ? null : (opcije.varijante ?? [varijantaRunde(11), varijantaRunde(12)]);
  const zadatak: NastavnickiZadatak = {
    slajd: slajd.zadatak!, izmenaBrojaVarijanti: null, brojZaOtvaranje: 2, resenjePrikazano: false, varijante,
    rezultat: varijante
      ? { ukupno: 0, varijante: varijante.map(v => rezultatVarijante(v, opcije.polja)), odgovoriPrikazani: true }
      : null,
    javniRezultat: null,
    ...opcije.zadatak,
  };
  return naPitanju(faza, { zadatak, ...opcije.stanje }, slajd);
}
