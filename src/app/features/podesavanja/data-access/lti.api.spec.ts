import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { LtiApi } from './lti.api';
import type { LtiRegistracijaCmd } from './lti.models';

const CMD: LtiRegistracijaCmd = {
  naziv: 'Uvod u primenu računara',
  izdavac: 'https://moodle.example.test',
  clientId: 'klijent-1',
  deploymentId: '5',
  authUrl: '',
  jwksUrl: '',
  aktivna: true,
};

/** Registracije alata na Moodle-u (nastavnik, `api/lti/registracije`, iza sesije nastavnika). */
describe('LtiApi', () => {
  let api: LtiApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(LtiApi);
    http = TestBed.inject(HttpTestingController);
  });

  it.each([
    ['lista', () => api.lista(), 'GET', 'api/lti/registracije', null],
    ['vrednosti', () => api.vrednosti(), 'GET', 'api/lti/registracije/vrednosti', null],
    ['dodaj', () => api.dodaj(CMD), 'POST', 'api/lti/registracije', CMD],
    ['izmeni', () => api.izmeni(3, CMD), 'PUT', 'api/lti/registracije/3', CMD],
    ['obrisi', () => api.obrisi(3), 'DELETE', 'api/lti/registracije/3', null],
  ] as const)('%s -> %s %s', (_ime, poziv, metod, url, telo) => {
    (poziv() as Observable<unknown>).subscribe();
    const req = http.expectOne(url);
    expect(req.request.method).toBe(metod);
    expect(req.request.body).toEqual(telo);
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(false);
    req.flush(null);
    http.verify();
  });

  it('tiho: LOCAL_ERRORS (greška ide u formu ili panel, ne u snackbar)', () => {
    api.lista({ tiho: true }).subscribe();
    api.dodaj(CMD, { tiho: true }).subscribe();
    for (const req of http.match(() => true)) {
      expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
      req.flush(null);
    }
    http.verify();
  });
});
