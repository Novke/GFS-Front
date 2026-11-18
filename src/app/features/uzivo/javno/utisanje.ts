import type { Utisanje } from '../data-access/uzivo.models';

/**
 * Poruka telefona utišanog učesnika (moderacija): umesto polja za odgovor. `PITALICE` gasi samo pitanja (zadatak se i
 * dalje predaje), `SVE` i zadatke; `null` = sme da odgovara.
 */
export function porukaUtisanja(utisan: Utisanje | null | undefined, zadatak: boolean): string | null {
  if (utisan === 'SVE') return 'Nastavnik ti je isključio odgovaranje na pitalice i zadatke.';
  if (utisan === 'PITALICE' && !zadatak) return 'Nastavnik ti je isključio odgovaranje na pitalice.';
  return null;
}
