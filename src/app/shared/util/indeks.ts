/*
 * Indeks studenta u tri dela (smer + broj + godina upisa), isto kao backend `IndeksUtil`. Broj indeksa se ponavlja iz
 * generacije u generaciju, pa je student jednoznačan tek po paru (indeks, godina). Čiste funkcije bez uvoza: koriste ih javne
 * forme (`nalog`, `upis`; allow-lista `gfs/javna-ruta-uvozi`) i `shared/forms/indeks-polja`.
 */

/**
 * Smerovi koje forma nudi kao prvi deo indeksa. Za sada samo geodezija (prikazan je i ne menja se); novi smer se dodaje ovde
 * i na backendu (`IndeksUtil.SMEROVI`). Kad ih bude više, `IndeksPolja` dobija izbor.
 */
export const SMEROVI: readonly string[] = ['GD'];
export const PODRAZUMEVANI_SMER = SMEROVI[0];

/** Broj indeksa: 1-3 cifre (prvih devet studenata ima jednocifren broj); `05` je isto što `5`. */
export const MAX_CIFARA_BROJA = 3;
const BROJ = /^\d{1,3}$/;
/** Najmanja godina upisa (isto kao backend `PrijavaPP.MIN_GODINA`). */
export const MIN_GODINA = 2000;

/** Samo cifre (nalepljeno `GD 05`, `5/2026` daje prve cifre), najviše {@link MAX_CIFARA_BROJA}. */
export function samoCifreBroja(v: string): string {
  return v.replace(/\D+/gu, '').slice(0, MAX_CIFARA_BROJA);
}

/** Da li je unos broja ispravan: 1-3 cifre, ne sve nule. */
export function ispravanBroj(v: string): boolean {
  const s = v.trim();
  return BROJ.test(s) && Number(s) > 0;
}

/** Kanonski indeks iz smera i broja: `GD` + `05` -> `GD5` (kao backend `IndeksUtil.kanonski`). */
export function sastaviIndeks(smer: string, broj: string): string {
  return `${smer}${Number(broj.trim())}`;
}

/** Indeks za prikaz: `GD5/2026`. */
export function prikazIndeksa(indeks: string, godina: number | null): string {
  return godina === null ? indeks : `${indeks}/${godina}`;
}

/** Početna godina tekuće školske godine: 1. 10. `Y` do 30. 9. `Y+1` je `Y` (kao `shared/util/skolska-godina`, bez uvoza). */
export function tekucaSkolska(sada: Date = new Date()): number {
  return sada.getMonth() >= 9 ? sada.getFullYear() : sada.getFullYear() - 1;
}

/** Najveća godina upisa u formi: tekuća školska + 1 (kao backend `PrijavaPP.maxGodina`). */
export function maxGodina(sada: Date = new Date()): number {
  return tekucaSkolska(sada) + 1;
}

/** Da li je godina upisa ispravna: ceo broj od {@link MIN_GODINA} do {@link maxGodina}. */
export function ispravnaGodina(v: unknown, sada: Date = new Date()): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= MIN_GODINA && v <= maxGodina(sada);
}

/**
 * Godina iz URL-a (`?godina=2026`): tačno četiri cifre i ispravna godina, inače `null` (nevalidna vrednost se ignoriše i
 * forma predlaže tekuću školsku godinu).
 */
export function godinaIzUpita(v: unknown, sada: Date = new Date()): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') {
    return null;
  }
  const s = String(v).trim();
  if (!/^\d{4}$/u.test(s)) {
    return null;
  }
  const g = Number(s);
  return ispravnaGodina(g, sada) ? g : null;
}

/** Predlog godine za formu: ispravna godina iz URL-a, inače početna godina tekuće školske godine. */
export function predlogGodine(izUpita: unknown, sada: Date = new Date()): number {
  return godinaIzUpita(izUpita, sada) ?? tekucaSkolska(sada);
}
