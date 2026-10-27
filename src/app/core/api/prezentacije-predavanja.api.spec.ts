import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_ERRORS } from './api-error';
import { PrezentacijePredavanjaApi } from './prezentacije-predavanja.api';

describe('PrezentacijePredavanjaApi', () => {
  let http: HttpTestingController;
  let api: PrezentacijePredavanjaApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(PrezentacijePredavanjaApi);
  });

  afterEach(() => http.verify());

  it('prezentacije predmeta: GET prezentacije?predmetId, greške prikazuje pozivalac', () => {
    api.prezentacije(4).subscribe();
    const req = http.expectOne(r => r.url === 'api/prezentacije');
    expect(req.request.method).toBe('GET');
    expect(req.request.urlWithParams).toBe('api/prezentacije?predmetId=4');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush([]);
  });

  it('izvođenja predavanja: GET izvodjenja?predavanjeId', () => {
    api.izvodjenja(40).subscribe();
    const req = http.expectOne(r => r.url === 'api/izvodjenja');
    expect(req.request.urlWithParams).toBe('api/izvodjenja?predavanjeId=40');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush([]);
  });

  it('pokretanje: POST prezentacije/{id}/izvodjenja sa čuvanjem, vezano za predavanje, bez bodovanja', () => {
    api.pokreni(3, 40).subscribe();
    const req = http.expectOne('api/prezentacije/3/izvodjenja');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ cuvanje: true, grupaId: null, predavanjeId: 40, boduje: false });
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush({});
  });
});
