/**
 * Redosled i grupisanje prezentacija po vežbama (spec redosled prezentacija). Isto pravilo redosleda kao backend
 * `RedosledPrezentacija.REDOSLED` (menjaju se zajedno): broj vežbe rastuće (bez broja na kraju), u istoj vežbi gradivo,
 * pa pitanja, pa zadaci, zatim naziv i id. Bez uvoza: koriste ga lista prezentacija, dijalog na predavanju i konzola.
 */

/** Vrsta prezentacije, izračunata na serveru iz slajdova. */
export type VrstaPrezentacije = 'GRADIVO' | 'PITANJA' | 'ZADACI';

export const VRSTE_PREZENTACIJE: readonly VrstaPrezentacije[] = ['GRADIVO', 'PITANJA', 'ZADACI'];

/** Oznaka na čipu u listi (malim slovom, uz naziv). */
export const OZNAKA_VRSTE: Record<VrstaPrezentacije, string> = { GRADIVO: 'gradivo', PITANJA: 'pitanja', ZADACI: 'zadaci' };

/** Naziv filtera vrste. */
export const FILTER_VRSTE: Record<VrstaPrezentacije, string> = { GRADIVO: 'Gradivo', PITANJA: 'Sa pitanjima', ZADACI: 'Zadaci' };

export interface SaVezbom {
  id: number;
  naziv: string;
  vezba: number | null;
  vrsta: VrstaPrezentacije;
}

export const MIN_VEZBA = 0;
export const MAX_VEZBA = 99;
/** Ista poruka kao server (`Vezba.GRANICE`). */
export const PORUKA_VEZBE = 'Broj vežbe mora biti od 0 do 99.';

const RANG: Record<VrstaPrezentacije, number> = { GRADIVO: 0, PITANJA: 1, ZADACI: 2 };

/** Comparator po vežbama (kao server). */
export function porediPoVezbi(a: SaVezbom, b: SaVezbom): number {
  const va = a.vezba ?? Number.POSITIVE_INFINITY;
  const vb = b.vezba ?? Number.POSITIVE_INFINITY;
  if (va !== vb) return va < vb ? -1 : 1;
  const r = (RANG[a.vrsta] ?? 0) - (RANG[b.vrsta] ?? 0);
  if (r) return r;
  const n = a.naziv.toLocaleLowerCase('sr-Latn').localeCompare(b.naziv.toLocaleLowerCase('sr-Latn'), 'sr-Latn');
  return n || a.id - b.id;
}

export function poVezbama<T extends SaVezbom>(lista: readonly T[]): T[] {
  return [...lista].sort(porediPoVezbi);
}

/** Naslov grupe: 0 = "Uvod", n = "Vežbe n", bez broja = "Bez broja vežbe". */
export function nazivVezbe(vezba: number | null): string {
  if (vezba === null || vezba === undefined) return 'Bez broja vežbe';
  return vezba === 0 ? 'Uvod' : `Vežbe ${vezba}`;
}

export interface GrupaVezbe<T> {
  vezba: number | null;
  naziv: string;
  stavke: T[];
}

/** Uzastopne stavke iste vežbe u grupu; redosled ulaza ostaje (očekuje se `poVezbama`). */
export function grupisiPoVezbi<T extends { vezba: number | null }>(lista: readonly T[]): GrupaVezbe<T>[] {
  const grupe: GrupaVezbe<T>[] = [];
  for (const s of lista) {
    const v = s.vezba ?? null;
    const poslednja = grupe[grupe.length - 1];
    if (poslednja && poslednja.vezba === v) poslednja.stavke.push(s);
    else grupe.push({ vezba: v, naziv: nazivVezbe(v), stavke: [s] });
  }
  return grupe;
}

/** Predlog broja iz naziva "Vežbe N ..." (prvi broj), kao server (`Vezba.izNaziva`) i popuna u V21. */
export function vezbaIzNaziva(naziv: string | null | undefined): number | null {
  const m = /^\s*ve[zž]be\s+(\d{1,2})(?!\d)/iu.exec(naziv ?? '');
  return m ? Number(m[1]) : null;
}

/** Broj vežbe iz polja: prazno = `null`, ceo broj 0-99 = broj, ostalo = `undefined` (neispravno). */
export function vezbaIzPolja(v: string | number | null | undefined): number | null | undefined {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (!t) return null;
  if (!/^\d{1,2}$/.test(t)) return undefined;
  return Number(t);
}

/** Za pretragu po nazivu (mala slova, bez dijakritika: "vezbe" nalazi "Vežbe"). */
export function zaPretragu(t: string): string {
  return t.toLocaleLowerCase('sr-Latn').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'dj').trim();
}
