import { HttpContextToken, HttpErrorResponse } from '@angular/common/http';

/** Greška API-ja u obliku koji UI prikazuje: `reason` je uvek tekst spreman za korisnika. */
export interface ApiError {
  status: number;
  reason: string;
}

/**
 * Zahtev sa `true` u kontekstu sam prikazuje svoju grešku (forma, javna ruta `/upis`);
 * interceptor tada ne šalje obaveštenje u NotificationStore.
 * Namerno bez uvoza store-a, da ga sme koristiti i javna ruta.
 */
export const LOCAL_ERRORS = new HttpContextToken<boolean>(() => false);

export const PORUKA_MREZA = 'Nema veze sa serverom.';
export const PORUKA_SISTEM = 'Sistemska greška. Pokušaj ponovo.';

function reasonIzTela(telo: unknown): string | null {
  if (typeof telo !== 'object' || telo === null) {
    return null;
  }
  const reason = (telo as Record<string, unknown>)['reason'];
  return typeof reason === 'string' && reason.trim() !== '' ? reason : null;
}

/** 0 -> mreža; 5xx -> opšta sistemska poruka (detalji servera se ne prikazuju); ostalo -> `reason` ili opšta poruka sa statusom. */
export function toApiError(e: HttpErrorResponse): ApiError {
  if (e.status === 0) {
    return { status: 0, reason: PORUKA_MREZA };
  }
  if (e.status >= 500) {
    return { status: e.status, reason: PORUKA_SISTEM };
  }
  return { status: e.status, reason: reasonIzTela(e.error) ?? `Zahtev nije uspeo (${e.status}).` };
}
