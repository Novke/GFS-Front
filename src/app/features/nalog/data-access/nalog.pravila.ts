import { HttpErrorResponse } from '@angular/common/http';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';

/*
 * Čista pravila naloga studenta (bez Angular servisa): normalizacija indeksa i koda, tekst greške za ekran.
 */

/** Indeks kao na serveru i u upisu: bez razmaka, velika slova (`gd 12` -> `GD12`). */
export function normalizujIndeks(v: string): string {
  return v.replace(/\s+/gu, '').toUpperCase();
}

/** Samo cifre, najviše 6 (`123 456`, `123-456` -> `123456`): nalepljen ili automatski popunjen kod. */
export function samoCifreKoda(v: string): string {
  return v.replace(/\D+/gu, '').slice(0, 6);
}

export const KOD = /^\d{6}$/;

/**
 * Tekst greške za baner: poruka servera (`reason`) doslovno za 4xx i za 503 (npr. "Slanje koda trenutno nije moguće. Javi se
 * nastavniku."; `toApiError` bi ga, kao svaku 5xx, sakrio), mreža i ostale 5xx opšte poruke.
 */
export function porukaGreske(e: unknown): string {
  if (!(e instanceof HttpErrorResponse)) {
    return PORUKA_SISTEM;
  }
  const reason = e.status === 503 ? (e.error as { reason?: unknown } | null)?.reason : null;
  return typeof reason === 'string' && reason.trim() !== '' ? reason : toApiError(e).reason;
}
