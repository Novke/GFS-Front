import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { PortalApi } from './portal.api';

/** Nalog studenta, faze 2 i 3: samo `api/public/nalog/*`, svaka greška lokalna (nikad nastavnički snackbar). */
describe('PortalApi', () => {
  let api: PortalApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(PortalApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it.each([
    ['predmeti', () => api.predmeti(), 'GET', 'api/public/nalog/predmeti', null],
    ['prisustvo', () => api.prisustvo(3), 'GET', 'api/public/nalog/predmeti/3/prisustvo', null],
    ['vezbanje', () => api.vezbanje(3), 'GET', 'api/public/nalog/predmeti/3/vezbanje', null],
    ['mojiZadaci', () => api.mojiZadaci(3), 'GET', 'api/public/nalog/predmeti/3/moji-zadaci', null],
    ['prezentacije', () => api.prezentacije(3), 'GET', 'api/public/nalog/predmeti/3/prezentacije', null],
    ['ocena', () => api.ocena(3), 'GET', 'api/public/nalog/predmeti/3/ocena', null],
    ['pregled', () => api.pregled(9), 'GET', 'api/public/nalog/prezentacije/9', null],
    ['noviZadatak', () => api.noviZadatak(5, 2), 'POST', 'api/public/nalog/vezbanje', { tipId: 5, nivo: 2 }],
    ['noviZadatak svi nivoi', () => api.noviZadatak(5, null), 'POST', 'api/public/nalog/vezbanje', { tipId: 5, nivo: null }],
    ['provera', () => api.provera(77, { a: '12', b: [3] }), 'POST', 'api/public/nalog/vezbanje/77/provera', { polja: { a: '12', b: [3] } }],
    ['resenje', () => api.resenje(77), 'POST', 'api/public/nalog/vezbanje/77/resenje', null],
  ] as const)('%s -> %s %s, LOCAL_ERRORS', (_ime, poziv, metod, url, telo) => {
    (poziv() as Observable<unknown>).subscribe();
    const req = http.expectOne(url);
    expect(req.request.method).toBe(metod);
    expect(req.request.body).toEqual(telo);
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    expect(req.request.url.startsWith('api/public/nalog/')).toBe(true);
    req.flush(null);
  });
});
