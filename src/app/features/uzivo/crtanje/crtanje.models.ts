/*
 * Crtanje u izvođenju (spec `2026-11-23-crtanje-uzivo-design.md`, plan sa ugovorom backend ↔ front): modeli i konstante.
 * Crtež pripada strani (slajd + pozadina); koordinate su jedinice scene 960 × 540 (kao PLATNO), na jednu decimalu.
 */

export type PozadinaCrteza = 'SLAJD' | 'BELA';
export type TipElementa = 'OLOVKA' | 'LINIJA' | 'ISPREKIDANA' | 'STRELICA' | 'PRAVOUGAONIK' | 'KRUG' | 'ELIPSA';

/** Jedan element strane: `OLOVKA` ima niz tačaka (`x0, y0, x1, y1, …`), ostali tačno 4 broja (početak i kraj prevlačenja). */
export interface ElementCrteza { tip: TipElementa; boja: string; debljina: number; tacke: number[]; }
/** Strana sa servera; `verzija` 0 = strana još ne postoji. */
export interface StranaCrteza { elementi: ElementCrteza[]; verzija: number; }
/** Ne-prazna strana izvođenja (pregled); `slajdBroj` je 1-based, `null` kad je slajd obrisan. */
export interface CrtezIzvodjenja {
  slajdId: number | null; slajdBroj: number | null; pozadina: PozadinaCrteza; elementi: ElementCrteza[]; verzija: number; izmenjeno: string;
}
/** Crtež drugog izvođenja iste prezentacije na istom slajdu („Ranije ovde”). */
export interface RanijiCrtez { izvodjenjeId: number; pocetak: string; grupa: string | null; pozadina: PozadinaCrteza; elementi: ElementCrteza[]; }
/** `NastavnickoStanje.crtez`: trenutna strana izvođenja (`null` na prijavi i kraju bez belog ekrana). */
export interface CrtezTrenutni { slajdId: number | null; pozadina: PozadinaCrteza; verzija: number; }

/** Strana: slajd i pozadina. Tabla predavanja ima jednu stranu (`slajdId: null`, `BELA`). */
export interface KljucStrane { slajdId: number | null; pozadina: PozadinaCrteza; }

/** Ključ strane kao niz (mapa strana, poruke kanala). */
export function kljucNiz(k: KljucStrane): string {
  return `${k.pozadina}:${k.slajdId ?? '-'}`;
}

export const SIRINA_SCENE = 960;
export const VISINA_SCENE = 540;

export interface Boja { ime: string; hex: string; }
/** Šest boja (maketa): crna je tamno plava kao tekst aplikacije. */
export const BOJE: readonly Boja[] = [
  { ime: 'Crna', hex: '#121A2A' }, { ime: 'Plava', hex: '#2456A6' }, { ime: 'Crvena', hex: '#C62828' },
  { ime: 'Zelena', hex: '#1D7A55' }, { ime: 'Narandžasta', hex: '#E07B00' }, { ime: 'Ljubičasta', hex: '#6A4BB5' },
];
export const POCETNA_BOJA = '#C62828';

export interface Debljina { debljina: number; ime: string; }
export const DEBLJINE: readonly Debljina[] = [{ debljina: 3, ime: 'Tanko' }, { debljina: 6, ime: 'Srednje' }, { debljina: 12, ime: 'Debelo' }];
export const POCETNA_DEBLJINA = 6;

export interface Alat { tip: TipElementa; ime: string; taster: string; }
/** Sedam alata redom tastera `1`–`7`. */
export const ALATI: readonly Alat[] = [
  { tip: 'OLOVKA', ime: 'Olovka (slobodno)', taster: '1' }, { tip: 'LINIJA', ime: 'Linija', taster: '2' },
  { tip: 'ISPREKIDANA', ime: 'Isprekidana linija', taster: '3' }, { tip: 'STRELICA', ime: 'Strelica', taster: '4' },
  { tip: 'PRAVOUGAONIK', ime: 'Pravougaonik', taster: '5' }, { tip: 'KRUG', ime: 'Krug', taster: '6' },
  { tip: 'ELIPSA', ime: 'Elipsa', taster: '7' },
];

/** Ograničenja servera (400), front ih poštuje unapred. */
export const MAX_TACAKA_OLOVKE = 5000;
export const MAX_ELEMENATA = 2000;
export const MAX_BAJTOVA = 1_000_000;
export const MAX_KOORDINATA = 2000;
export const MIN_DEBLJINA = 1;
export const MAX_DEBLJINA = 40;

/** Alati koje konzola šalje publici (kanal): publika ih crta samo dok konzola crta i nastavnik je uključio „oko”. */
export interface StanjeAlata { ukljuceno: boolean; alat: TipElementa; boja: string; publikaVidi: boolean; }
