/**
 * Naslov ličnog ishoda na telefonu. Uvoze ga samo lenji ekrani (`app-ishod-ekran`, `app-zadatak-ekran`), pa nije u
 * zatvorenju studentske stranice (budžet u `e2e/lenji-formule.spec.ts`).
 */

import { grupisiCifre } from '../ui/format';
import type { IshodPitanja } from './student.store';

/**
 * Naslov ličnog ishoda posle `C` (i svog zadatka posle zatvaranja): "Tačno! +850", "Delimično tačno +425" (0 < udeo < 1),
 * "Netačno", "Nisi odgovorio". Bez `udeo` (zadatak, stari backend) odlučuje samo `tacno`.
 */
export function naslovIshoda(ishod: IshodPitanja, takmicenje: boolean): string {
  if (!ishod.odgovorio) return 'Nisi odgovorio';
  if (ishod.tacno === null) return 'Odgovor primljen';
  const u = ishod.udeo ?? +ishod.tacno;
  if (!(u > 0)) return 'Netačno';
  return (u < 1 ? 'Delimično tačno' : 'Tačno!') + (takmicenje && ishod.poeni ? ` +${grupisiCifre(ishod.poeni)}` : '');
}
