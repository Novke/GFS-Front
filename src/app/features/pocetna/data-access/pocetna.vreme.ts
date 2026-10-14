import { AgendaStavkaInfo } from '../../../core/api/pregled.api';

/** Pozdrav po dobu dana: do 12 h "Dobro jutro", do 18 h "Dobar dan", posle toga "Dobro veče". */
export function pozdravZaSat(sat: number): string {
  return sat < 12 ? 'Dobro jutro' : sat < 18 ? 'Dobar dan' : 'Dobro veče';
}

const DANI = ['Nedelja', 'Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota'] as const;
const DANI_KRATKO = ['Ned', 'Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub'] as const;
const MESECI = [
  'januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar',
] as const;

/** `Utorak, 14. oktobar` (bez zavisnosti od ICU podataka pregledača). */
export function naslovDatuma(d: Date): string {
  return `${DANI[d.getDay()]}, ${d.getDate()}. ${MESECI[d.getMonth()]}`;
}

const dvaMesta = (n: number) => String(n).padStart(2, '0');

/** Lokalni dan kao `YYYY-MM-DD` (isti oblik kao `LocalDate` sa servera). */
export function isoDan(d: Date): string {
  return `${d.getFullYear()}-${dvaMesta(d.getMonth() + 1)}-${dvaMesta(d.getDate())}`;
}

export interface DanAgende {
  iso: string;
  /** `Pon 13.` */
  oznaka: string;
  jeDanas: boolean;
  stavke: AgendaStavkaInfo[];
}

export interface AgendaNedelje {
  /** Ponedeljak-petak tekuće nedelje. */
  dani: DanAgende[];
  /** Stavke subote i nedelje (server ih šalje, prikaz je pon-pet): samo broj, da se ne izgube neprimećeno. */
  brojVikend: number;
}

/**
 * Ponedeljak-petak nedelje u kojoj je `sada`, sa stavkama po danu (redosled sa servera: predavanja, domaći, testovi).
 * Stavke van tih dana (vikend, ili bez ispravnog datuma) se ne prikazuju po danima; vikend se samo broji.
 */
export function agendaNedelje(nedelja: readonly AgendaStavkaInfo[], sada: Date): AgendaNedelje {
  const ponedeljak = new Date(sada.getFullYear(), sada.getMonth(), sada.getDate() - ((sada.getDay() + 6) % 7));
  const danas = isoDan(sada);
  const dani: DanAgende[] = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(ponedeljak.getFullYear(), ponedeljak.getMonth(), ponedeljak.getDate() + i);
    const iso = isoDan(d);
    return {
      iso,
      oznaka: `${DANI_KRATKO[d.getDay()]} ${d.getDate()}.`,
      jeDanas: iso === danas,
      stavke: nedelja.filter(s => s.datum === iso),
    };
  });
  const subota = isoDan(new Date(ponedeljak.getFullYear(), ponedeljak.getMonth(), ponedeljak.getDate() + 5));
  const nedeljaDan = isoDan(new Date(ponedeljak.getFullYear(), ponedeljak.getMonth(), ponedeljak.getDate() + 6));
  const brojVikend = nedelja.filter(s => s.datum === subota || s.datum === nedeljaDan).length;
  return { dani, brojVikend };
}

/** Oblik reči uz broj: 1 -> `jedan`, 2-4 -> `dva`, ostalo (5+, 11-14) -> `pet` (`oblik(3, 'test', 'testa', 'testova')` -> `testa`). */
export function oblik(n: number, jedan: string, dva: string, pet: string): string {
  const poslednja = n % 10;
  const poslednje2 = n % 100;
  return poslednja === 1 && poslednje2 !== 11 ? jedan : poslednja >= 2 && poslednja <= 4 && (poslednje2 < 12 || poslednje2 > 14) ? dva : pet;
}

/** Broj sa rečju: `mnozina(1, 'student', 'studenta', 'studenata')` -> `1 student`. */
export function mnozina(n: number, jedan: string, dva: string, pet: string): string {
  return `${n} ${oblik(n, jedan, dva, pet)}`;
}
