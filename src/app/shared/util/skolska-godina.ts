import { parseDatum } from './datum.pipe';

/**
 * Školska godina `Y` traje od 1. 10. `Y` do 30. 9. `Y+1` (isto kao backend `utility/SkolskaGodina`); prikaz `2025/26`.
 * Filteri lista šalju godinu kao broj (`godina=2025`). Bez datuma ili sa neispravnim datumom `null` (stari redovi bez
 * datuma, Review Focus 4); `formatSkolskaGodina(null)` je `—`.
 */
export function skolskaGodinaZa(datum: Date | string | null | undefined): number | null {
  const d = parseDatum(datum);
  if (!d) {
    return null;
  }
  // getMonth(): oktobar je 9
  return d.getMonth() >= 9 ? d.getFullYear() : d.getFullYear() - 1;
}

/** Školska godina kojoj pripada `sada` (podrazumevano današnji dan po satu pregledača). */
export function tekucaSkolskaGodina(sada: Date = new Date()): number {
  const d = Number.isNaN(sada.getTime()) ? new Date() : sada; // neispravan `sada` -> sat pregledača
  return d.getMonth() >= 9 ? d.getFullYear() : d.getFullYear() - 1;
}

/** `2025` -> `2025/26`; bez godine `—`. */
export function formatSkolskaGodina(godina: number | null | undefined): string {
  if (godina === null || godina === undefined || !Number.isInteger(godina)) {
    return '—';
  }
  return `${godina}/${String((godina + 1) % 100).padStart(2, '0')}`;
}

/** Opcije za chip "Školska godina": tekuća i `broj - 1` prethodnih, najnovija prva. */
export function opcijeSkolskihGodina(broj = 5, sada: Date = new Date()): { vrednost: number; labela: string }[] {
  const tekuca = tekucaSkolskaGodina(sada);
  return Array.from({ length: broj }, (_, i) => ({ vrednost: tekuca - i, labela: formatSkolskaGodina(tekuca - i) }));
}
