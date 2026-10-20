import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { NalogApi } from './nalog.api';

/** Javni nalog studenta: samo `api/public/nalog/*` i `api/public/lti/povezi*`, svaka greška lokalna (nikad nastavnički snackbar). */
describe('NalogApi', () => {
  let api: NalogApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(NalogApi);
    http = TestBed.inject(HttpTestingController);
  });

  it.each([
    ['posaljiKod', () => api.posaljiKod('GD12'), 'POST', 'api/public/nalog/kod', { indeks: 'GD12' }],
    ['prijavi', () => api.prijavi('GD12', '123456'), 'POST', 'api/public/nalog/prijava', { indeks: 'GD12', kod: '123456' }],
    ['stanje', () => api.stanje(), 'GET', 'api/public/nalog/stanje', null],
    ['ja', () => api.ja(), 'GET', 'api/public/nalog/ja', null],
    ['odjavi', () => api.odjavi(), 'POST', 'api/public/nalog/odjava', null],
    ['odjaviSvuda', () => api.odjaviSvuda(), 'POST', 'api/public/nalog/odjava-svuda', null],
    ['pomoc', () => api.pomoc('GD12'), 'POST', 'api/public/nalog/pomoc', { indeks: 'GD12' }],
    ['povezivanje', () => api.povezivanje(), 'GET', 'api/public/lti/povezivanje', null],
    ['poveziMoodle', () => api.poveziMoodle(), 'POST', 'api/public/lti/povezi', null],
  ] as const)('%s -> %s %s, LOCAL_ERRORS', (_ime, poziv, metod, url, telo) => {
    (poziv() as Observable<unknown>).subscribe();
    const req = http.expectOne(url);
    expect(req.request.method).toBe(metod);
    expect(req.request.body).toEqual(telo);
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush(null);
    http.verify();
  });
});
