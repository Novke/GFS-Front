import { FONTOVI_PLATNA } from './platno-fontovi';

/**
 * Metrike teksta platna: jedino mesto za vrednosti koje kalibracija prema PowerPointovom PDF izvozu (F19) podešava.
 * Kalibrisano na uzorku od 77 slajdova (Calibri/Carlito): PowerPoint ne primenjuje `razmakPre` prvog pasusa okvira i
 * razliku proreda stavlja iznad bazne linije; prosti prored 1,2 i korak reda se poklapaju (faza 1 je imala CSS ponašanje:
 * `razmakPrePrvogPasusa: true`, `razlikaProredaIznad: 0,5`). Ključevi "po fontu" su nazivi iz kataloga (`FONTOVI_PLATNA`);
 * font van kataloga se prikazuje kao Carlito, pa i meri kao Carlito. Ključ `'*'` važi za font bez sopstvene vrednosti.
 */
export interface Metrika {
  /** Jednostruki prored kao udeo veličine slova (PowerPoint: oko 1,2), po fontu. */
  prostiProred: Readonly<Record<string, number>>;
  /** Dodatni pomeraj prve linije okvira naniže, u em fonta prvog dela prvog pasusa, po fontu (podrazumevano 0). */
  pomerajPrveLinijeEm: Readonly<Record<string, number>>;
  /** Da li se `razmakPre` prvog pasusa okvira (TEKST i ćelija) primenjuje (PowerPoint: ne). */
  razmakPrePrvogPasusa: boolean;
  /**
   * Udeo razlike proreda (visina reda - prosti prored) koji ide iznad bazne linije. CSS je deli pola-pola (0,5);
   * PowerPoint celu razliku stavlja iznad (1): kod proreda 90% bazna linija je za 0,06 em više nego u CSS-u.
   */
  razlikaProredaIznad: number;
  /** `'normal'` = ponašanje pregledača (CSS se ne postavlja), `'none'` isključuje. */
  kerning: 'normal' | 'none';
  ligature: 'normal' | 'none';
  /** Unutrašnje margine ćelije tabele u jedinicama (PowerPointove podrazumevane: 7,2 / 3,6 / 7,2 / 3,6 pt). */
  marginaCelije: Readonly<{ levo: number; gore: number; desno: number; dole: number }>;
}

export const METRIKA: Readonly<Metrika> = {
  prostiProred: { '*': 1.2 },
  pomerajPrveLinijeEm: {},
  razmakPrePrvogPasusa: false,
  razlikaProredaIznad: 1,
  kerning: 'normal',
  ligature: 'normal',
  marginaCelije: { levo: 7.2, gore: 3.6, desno: 7.2, dole: 3.6 },
};

const PODRAZUMEVANI_FONT = FONTOVI_PLATNA[0].naziv;

/** Naziv fonta pod kojim se prikazuje (van kataloga: Carlito). */
function prikazaniFont(font: string): string {
  return FONTOVI_PLATNA.some((f) => f.naziv === font) ? font : PODRAZUMEVANI_FONT;
}

function poFontu(tabela: Readonly<Record<string, number>>, font: string, podrazumevano: number): number {
  const naziv = prikazaniFont(font);
  if (Object.hasOwn(tabela, naziv)) return tabela[naziv];
  return Object.hasOwn(tabela, '*') ? tabela['*'] : podrazumevano;
}

/** Bez šuma pokretnog zareza (1.2 * 0.9 * 1 = 1.08, ne 1.0799999999999998); isto zaokruživanje kao `platno-tekst`. */
function zaokruzi(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** `line-height` (bez jedinice) za pasus ili deo: prosti prored fonta * prored% / 100 * skala proreda okvira. */
export function visinaReda(font: string, proredProcenat: number, skalaProreda: number, m: Metrika = METRIKA): number {
  return zaokruzi(poFontu(m.prostiProred, font, 1.2) * (proredProcenat / 100) * skalaProreda);
}

/** Pomeraj prve linije okvira u em za font prvog dela. */
export function pomerajPrveLinije(font: string, m: Metrika = METRIKA): number {
  return poFontu(m.pomerajPrveLinijeEm, font, 0);
}

/**
 * Pomeraj reda naniže (em fonta pasusa) koji razliku proreda stavlja iznad bazne linije u udelu `razlikaProredaIznad`
 * umesto CSS-ove polovine: (udeo - 0,5) * (visina reda - prosti prored). Isti za sve redove pasusa (korak se ne menja).
 */
export function pomerajProreda(font: string, proredProcenat: number, skalaProreda: number, m: Metrika = METRIKA): number {
  const prosti = poFontu(m.prostiProred, font, 1.2);
  return zaokruzi((m.razlikaProredaIznad - 0.5) * (visinaReda(font, proredProcenat, skalaProreda, m) - prosti)) || 0;
}
