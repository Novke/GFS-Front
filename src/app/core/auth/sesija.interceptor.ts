import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { jeIstekSesije } from './nastavnicki-api';

/**
 * 401 sa nastavničkog API-ja (sve pod `api/` osim `api/public/*`, `api/auth/prijava` i `api/auth/ja`) -> `IstekSesije`
 * (`./istek-sesije`: jednom za sve paralelne zahteve, pitanje za nesačuvan rad, navigacija na `/prijava?nazad=...`). Taj
 * modul se učitava dinamički tek na prvi takav 401, pa početni bundle nosi samo ovu proveru putanje. Greška uvek ide dalje
 * (pozivalac i dalje vidi neuspeh, npr. red ostaje "nije sačuvano"). U `app.config.ts` stoji pre `errorInterceptor`, koji
 * takav 401 ne šalje u snackbar.
 */
export const sesijaInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);
  return next(req).pipe(
    catchError((e: unknown) => {
      if (e instanceof HttpErrorResponse && e.status === 401 && jeIstekSesije(req.url)) {
        void import('./istek-sesije').then(m => injector.get(m.IstekSesije).obradi());
      }
      return throwError(() => e);
    }),
  );
};
