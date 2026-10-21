// Plan puštanja režima "Pregled" (F18, odluka 22): grupa po grupa, svaka posle kraja prethodne i pauze. Koraci i
// trajanja dolaze iz istih funkcija koje koriste projektor i konzola (`platno-koraci`), bez Angulara.
import type { Platno } from '../data-access/platno.models';
import { brojKoraka } from '../data-access/platno-koraci';
import { brojeviGrupa, trajanjeGrupe } from './animacije';

export const PAUZA_IZMEDJU_GRUPA_MS = 400;
/** Posle koliko ms od prethodnog koraka prikazati `korak`. */
export interface KorakPustanja { korak: number; posleMs: number; }

/** Plan puštanja od `odKoraka` (početno stanje) do poslednjeg koraka: grupa po grupa, svaka posle kraja prethodne + pauza. */
export function planPustanja(p: Platno, odKoraka: number): KorakPustanja[] {
  const ukupno = brojKoraka(p);
  const plan: KorakPustanja[] = [];
  let pre = odKoraka === 0 ? trajanjeGrupe(p, 0) : 0; // grupa 0 se pušta sama pri ulasku na slajd
  for (let k = odKoraka + 1; k <= ukupno; k++) {
    plan.push({ korak: k, posleMs: pre + PAUZA_IZMEDJU_GRUPA_MS });
    pre = trajanjeGrupe(p, k);
  }
  return plan;
}

/** Korak od kog "Pusti od izabrane" kreće: stanje pre grupe izabrane animacije (grupa 0 i nepostojeća -> 0). */
export function korakPreAnimacije(p: Platno, animacijaId: string): number {
  return Math.max(0, (brojeviGrupa(p).get(animacijaId) ?? 0) - 1);
}
