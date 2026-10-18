import { HttpErrorResponse } from '@angular/common/http';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';

/** Greške banke prikazuje pozivalac (traka, panel, `NotificationStore`), pa globalni snackbar ne sme da ih udvostruči. */
export const TIHO = { tiho: true } as const;

export const PORUKA_RENDER_NEDOSTUPAN = 'Render servis nije dostupan.';
export const PORUKA_ISTEKAO = 'Zahtev je istekao. Proveri u banci da li je sačuvano pre ponovnog pokušaja.';

/**
 * Poruka za korisnika iz greške zahteva banke: 503 je render servis koji ne radi (poruka servera, inače
 * {@link PORUKA_RENDER_NEDOSTUPAN}), 504 je istek posle 120 s proxy-ja ({@link PORUKA_ISTEKAO}: kreiranje i dupliranje nisu
 * idempotentni, pa "pokušaj ponovo" pravi duplikat), ostalo kao `toApiError` (4xx razlog servera, 5xx opšta poruka).
 */
export function razlogBanke(e: unknown): string {
  if (!(e instanceof HttpErrorResponse)) {
    return PORUKA_SISTEM;
  }
  if (e.status === 503) {
    const reason: unknown = typeof e.error === 'object' && e.error !== null ? (e.error as Record<string, unknown>)['reason'] : null;
    return typeof reason === 'string' && reason.trim() !== '' ? reason : PORUKA_RENDER_NEDOSTUPAN;
  }
  return e.status === 504 ? PORUKA_ISTEKAO : toApiError(e).reason;
}
