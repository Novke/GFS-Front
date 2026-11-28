import type { OdgovorPolja, PoljeZadatka, TipPoljaZadatka } from '../../uzivo/ui/polja-zadatka';

/*
 * Online testovi, student (plan `2026-11-28-online-testovi-faze-1-2.md`, odeljak 5 u `Novke/GFS-deploy`): DTO-i tačno po
 * ugovoru (`api/public/nalog/testovi/*`, `api/public/nalog/predmeti/{id}/testovi`, `api/public/nalog/racunar/*`). Odgovori
 * tokom testa nikad ne nose tačne vrednosti ni sliku rešenja; tek rezultat posle objave sa „Pokaži tačne odgovore“.
 */

export type { OdgovorPolja, PoljeZadatka, TipPoljaZadatka };

export type FazaTesta = 'ULAZ' | 'CEKANJE' | 'U_TOKU' | 'PREDATO' | 'ZAVRSEN';

/** Otvoren za ulaz ili započet test (kartica na Početnoj i u tabu Čas). `naziv` je tip testa. */
export interface TestNaNalogu {
  testId: number;
  naziv: string;
  predmet: string;
  datum: string;
  trajanjeMin: number;
  faza: FazaTesta;
  trebaKod: boolean;
}

/** `poeniPolja`: deo poena zadatka koji polje nosi (2 decimale). */
export interface PoljeTesta extends PoljeZadatka { poeniPolja: number; }

/** Vrednost polja: BROJ i TEKST string (do 200 znakova), JEDAN_TACAN id opcije, VISE_TACNIH lista id-jeva. */
export type UnetoPolja = string | number | number[];

export interface ZadatakTesta {
  zadatakId: number;
  rb: number;
  naziv: string;
  maxPoena: number;
  svgId: string;
  rucno: boolean;
  polja: PoljeTesta[];
  uneto: Record<string, UnetoPolja> | null;
  rev: number;
  sacuvano: string | null;
}

export interface PolaganjeStudenta {
  testId: number;
  naziv: string;
  predmet: string;
  faza: FazaTesta;
  ime: string;
  prezime: string;
  indeks: string;
  grupaTesta: string | null;
  rokMs: number | null;
  serverVremeMs: number;
  maxPoena: number;
  /** `null` pre U_TOKU */
  zadaci: ZadatakTesta[] | null;
  predato: string | null;
  /** sesija je RACUNAR: posle predaje ponudi „Odjavi se“ i sam odjavi posle 2 min */
  racunar: boolean;
}

export interface UlazCmd { kod: string | null; preuzmi: boolean; }
export interface CuvanjeCmd { rev: number; uneto: Record<string, UnetoPolja>; }
export interface CuvanjeOdgovor { rev: number; sacuvano: string; }
export type VrstaDogadjaja = 'NAPUSTIO' | 'VRATIO';
export interface DogadjajCmd { vrsta: VrstaDogadjaja; trajanjeMs: number | null; }

export interface RezultatTestaKratko {
  testId: number;
  datum: string;
  tipTesta: string;
  poeni: number | null;
  maxPoena: number;
  polozio: boolean | null;
  racunaSe: boolean;
  online: boolean;
}

export interface PoljeRezultata {
  kljuc: string;
  oznaka: string;
  tip: TipPoljaZadatka;
  opcije: PoljeZadatka['opcije'];
  jedinica: string | null;
  uneto: unknown;
  udeo: number;
  /** samo uz objavu sa tacni */
  tacno: OdgovorPolja | null;
}

export interface ZadatakRezultataStudenta {
  rb: number;
  naziv: string;
  svgId: string;
  /** samo uz tacni */
  resenjeSvgId: string | null;
  poeni: number | null;
  maxPoena: number;
  polja: PoljeRezultata[];
}

export interface RezultatTestaStudenta {
  testId: number;
  tipTesta: string;
  predmet: string;
  datum: string;
  poeni: number | null;
  maxPoena: number;
  polozio: boolean | null;
  tacniPrikazani: boolean;
  /** prazno za test na papiru */
  zadaci: ZadatakRezultataStudenta[];
}

// ------------------------------------------------------------------------------------------------ prijava računara (faza 2)

/** `POST racunar/zahtev` (anonimno) + kolačić `gfs_racunar` (tajna, 300 s). */
export interface ZahtevRacunara { token: string; broj: string; isticeMs: number; serverVremeMs: number; }
export type StanjeZahteva = 'CEKA' | 'ODOBREN' | 'ISTEKAO';
/** `GET racunar/zahtev`: ODOBREN postavlja `gfs_student` (RACUNAR) i troši zahtev. */
export interface CekanjeZahteva { stanje: StanjeZahteva; broj: string; }
/** `GET racunar/{token}` (telefon studenta): šta se odobrava. */
export interface RacunarZaOdobrenje { broj: string; ime: string; prezime: string; indeks: string; }

/** Tekstovi servera koje front koristi kad odgovor nema svoj tekst. */
export const PORUKA_ZAHTEV_ISTEKAO = 'Prijava je istekla. Osveži stranu na računaru.';
export const PORUKA_DRUGI_UREDJAJ = 'Test je otvoren na drugom uređaju.';
export const PORUKA_ZASTARELA = 'Zastarela izmena.';
export const PORUKA_ISTEKLO = 'Vreme je isteklo.';
export const PORUKA_PREDAT = 'Test je predat.';
