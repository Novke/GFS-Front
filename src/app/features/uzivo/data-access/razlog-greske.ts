import { HttpErrorResponse } from '@angular/common/http';

export const PORUKA_VEZA = 'Server nije dostupan. Proveri vezu i pokušaj ponovo.';

/** Poruka za korisnika iz odgovora `{reason, time}` backenda; bez nje opšta poruka. */
export function razlogGreske(greska: unknown, podrazumevano = 'Nešto nije u redu. Pokušaj ponovo.'): string {
  if (greska instanceof HttpErrorResponse) {
    const reason = (greska.error as { reason?: unknown } | null)?.reason;
    if (typeof reason === 'string' && reason.trim()) {
      return reason;
    }
    if (greska.status === 0) {
      return PORUKA_VEZA;
    }
  }
  return podrazumevano;
}
