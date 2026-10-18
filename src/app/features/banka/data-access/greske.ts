import { HttpErrorResponse } from '@angular/common/http';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';

/** Greške banke prikazuje pozivalac (traka, panel, `NotificationStore`), pa globalni snackbar ne sme da ih udvostruči. */
export const TIHO = { tiho: true } as const;

export const PORUKA_RENDER_NEDOSTUPAN = 'Render servis nije dostupan.';
/** Istek izmene: kreiranje i dupliranje nisu idempotentni, pa ponovni pokušaj naslepo pravi duplikat. */
export const PORUKA_ISTEKAO_UPIS = 'Zahtev je istekao. Proveri u banci da li je sačuvano pre ponovnog pokušaja.';
/** Istek čitanja (i ponovnog rendera): ponovni pokušaj je bezopasan. */
export const PORUKA_ISTEKAO = 'Zahtev je istekao, pokušaj ponovo.';

/** `upis`: greška izmene (kreiranje, čuvanje, promena statusa, dupliranje, brisanje), za poruku isteka. */
export interface OpcijeRazloga {
  upis?: boolean;
}

/**
 * Poruka za korisnika iz greške zahteva banke: 503 je render servis koji ne radi (poruka servera, inače
 * {@link PORUKA_RENDER_NEDOSTUPAN}), 504 je istek posle 120 s proxy-ja (izmena: {@link PORUKA_ISTEKAO_UPIS}, jer je možda
 * ipak upisana; čitanje: {@link PORUKA_ISTEKAO}), ostalo kao `toApiError` (4xx razlog servera, 5xx opšta poruka).
 */
export function razlogBanke(e: unknown, o: OpcijeRazloga = {}): string {
  if (!(e instanceof HttpErrorResponse)) {
    return PORUKA_SISTEM;
  }
  if (e.status === 503) {
    const reason: unknown = typeof e.error === 'object' && e.error !== null ? (e.error as Record<string, unknown>)['reason'] : null;
    return typeof reason === 'string' && reason.trim() !== '' ? reason : PORUKA_RENDER_NEDOSTUPAN;
  }
  if (e.status === 504) {
    return o.upis ? PORUKA_ISTEKAO_UPIS : PORUKA_ISTEKAO;
  }
  return toApiError(e).reason;
}

/** Opcije za greške izmena. */
export const UPIS: OpcijeRazloga = { upis: true };
