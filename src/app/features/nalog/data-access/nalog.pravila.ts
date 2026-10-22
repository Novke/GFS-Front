import { HttpErrorResponse } from '@angular/common/http';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';

/*
 * Čista pravila naloga studenta (bez Angular servisa): normalizacija koda (indeks: `shared/util/indeks`), `nazad` javnih ruta, tekst greške za ekran.
 */

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
  return (e.status === 503 ? razlogServera(e) : null) ?? toApiError(e).reason;
}

/** Neprazan `reason` iz tela greške servera, inače `null`. */
export function razlogServera(e: unknown): string | null {
  const reason = e instanceof HttpErrorResponse ? (e.error as { reason?: unknown } | null)?.reason : null;
  return typeof reason === 'string' && reason.trim() !== '' ? reason : null;
}

/** `javnoNazad` živi u `shared/util/nazad` (koristi ga i veza za studente na `/prijava`); ovde ostaje izvoz zbog postojećih uvoza. */
export { javnoNazad } from '../../../shared/util/nazad';

/** Putanja cilja bez query-ja i završne `/` (`nalog/?x=1` -> `nalog`): da li `nazad` vodi na istu stranicu. */
export function putanjaCilja(cilj: string): string {
  return cilj.split('?', 1)[0].replace(/\/+$/u, '');
}
