import { parseDatum } from '../../../shared/util/datum.pipe';
import { CasPredavanje } from './cas.models';

/*
 * Čista pravila čekiranja (`/nalog/cas`): ključ čekanja, ritam upita i tekst časa. Bez Angular servisa.
 */

/** `sessionStorage` (ne `localStorage`): ključ čekanja živi samo u kartici koja je skenirala QR. */
export const KLJUC_CEKANJA = 'gfs-cas-kljuc';

/** Upit stanja na 10 s ± 2 s (`slucajno` iz `[0, 1)`), da se 30 telefona iza jedne NAT adrese ne poravna. */
export function sledeciUpitMs(slucajno: number): number {
  const r = Number.isFinite(slucajno) ? Math.min(Math.max(slucajno, 0), 1) : 0.5;
  return 10_000 + Math.round((r * 2 - 1) * 2_000);
}

/**
 * 429 na skeniranju ili potvrdi (cela učionica iza jedne NAT adrese skenira odjednom): kratko, jer token živi 20-30 s, a
 * nginx puni 10 zahteva u sekundi. Posle `n`-tog pokušaja 1, 2, 4, pa najviše 8 s, plus `r` (0-1) s pomeranja.
 */
export function odlaganjeKoraka429(n: number, r: number): number {
  const pomeranje = Number.isFinite(r) ? Math.min(Math.max(r, 0), 0.999) * 1_000 : 0;
  return Math.min(8_000, 1_000 * 2 ** Math.max(0, n - 1)) + Math.floor(pomeranje);
}

/** Posle `n`-tog uzastopnog 429: 20 s, 40 s, pa najviše 60 s (bez poruke studentu). */
export function odlaganjePosle429(n: number): number {
  return Math.min(60_000, 20_000 * 2 ** Math.max(0, n - 1));
}

/** Uživo izvođenje sa časa; `sa=cas` vraća telefon na `/nalog/cas` posle kraja izvođenja. */
export function putanjaUzivo(kod: string): string {
  return `uzivo/${encodeURIComponent(kod)}?sa=cas`;
}

const DANI = ['nedelja', 'ponedeljak', 'utorak', 'sreda', 'četvrtak', 'petak', 'subota'];

/** `sreda 28.10.` (dan iz lokalnog datuma, bez vremenske zone); neispravan datum je prazan string. */
export function danIDatum(datum: string | null | undefined): string {
  const d = parseDatum(datum);
  return d ? `${DANI[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.` : '';
}

/** `Uvod u primenu računara · sreda 28.10. · Petlje` (prazni delovi se izostavljaju). */
export function opisCasa(p: CasPredavanje): string {
  return [p.predmet?.trim(), danIDatum(p.datum), p.tema?.trim()].filter(Boolean).join(' · ');
}
