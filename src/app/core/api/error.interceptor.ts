import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { NotificationStore } from '../state/notification.store';
import { LOCAL_ERRORS, toApiError } from './api-error';

/** Statički resursi (ikone, env.json) otkazuju tiho: nastavnik ne treba da vidi snackbar zbog njih. */
function jeAsset(url: string): boolean {
  const baza = new URL(document.baseURI).pathname;
  return new URL(url, document.baseURI).pathname.startsWith(`${baza}assets/`);
}

/** Javna ruta (`/upis`) sama prikazuje svoje greške; nastavnički snackbar se tu nikad ne sme pojaviti. */
function jeJavniApi(url: string): boolean {
  const baza = new URL(document.baseURI).pathname;
  return new URL(url, document.baseURI).pathname.startsWith(`${baza}api/public/`);
}

/**
 * Greške šalje u NotificationStore (osim uz `LOCAL_ERRORS`, za `assets/` i `api/public/`) i uvek ih prosleđuje dalje.
 * Sam ne zove nijedan endpoint.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(NotificationStore);
  return next(req).pipe(
    catchError((e: unknown) => {
      if (e instanceof HttpErrorResponse && !req.context.get(LOCAL_ERRORS) && !jeAsset(req.url) && !jeJavniApi(req.url)) {
        store.greska(toApiError(e).reason);
      }
      return throwError(() => e);
    }),
  );
};
