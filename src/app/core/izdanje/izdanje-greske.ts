import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { ErrorHandler, inject, Injectable, Injector } from '@angular/core';
import { tap } from 'rxjs';

import { jeGreskaUcitavanja } from './greska-ucitavanja';
import { Izdanje } from './izdanje';

/**
 * `ErrorHandler` aplikacije: neuspelo učitavanje lenjog modula (dijalog, `@defer`, uvoz) odmah pokreće proveru izdanja, pa
 * zastarela kartica dobije traku "Osveži"; sve greške i dalje idu u podrazumevani handler (konzola).
 * `Izdanje` se uzima tek pri grešci: `ErrorHandler` nastaje pre rutera.
 */
@Injectable()
export class GfsErrorHandler extends ErrorHandler {
  private readonly injector = inject(Injector);

  override handleError(greska: unknown): void {
    if (jeGreskaUcitavanja(greska)) {
      void this.injector.get(Izdanje).proveri(true);
    }
    super.handleError(greska);
  }
}

/**
 * 4xx bez poslovnog značenja (400, 404, 405, 410, 415, ...) može biti zastarela kartica čiji zahtev novi backend više ne
 * prima: obična provera izdanja (najviše jednom u minutu). 401, 403, 409 i 429 su uobičajeni odgovori i ne proveravaju.
 */
const OBICNI_4XX = new Set([401, 403, 409, 429]);

export const izdanjeInterceptor: HttpInterceptorFn = (req, next) => {
  const izdanje = inject(Izdanje);
  return next(req).pipe(
    tap({
      error: (e: unknown) => {
        if (e instanceof HttpErrorResponse && e.status >= 400 && e.status < 500 && !OBICNI_4XX.has(e.status)) {
          void izdanje.proveri();
        }
      },
    }),
  );
};
