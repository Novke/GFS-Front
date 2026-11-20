import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { fajlInfo } from './fajlovi.testing';
import { FajloviPrezentacijeApi, urlFajlaPrezentacije } from './fajlovi-prezentacije.api';

describe('FajloviPrezentacijeApi', () => {
  let http: HttpTestingController;
  let api: FajloviPrezentacijeApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(FajloviPrezentacijeApi);
  });

  afterEach(() => http.verify());

  it('GET api/prezentacije/7/fajlovi sa LOCAL_ERRORS', () => {
    const rez = vi.fn();
    api.lista(7).subscribe(rez);
    const req = http.expectOne('api/prezentacije/7/fajlovi');
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush([fajlInfo()]);
    expect(rez).toHaveBeenCalledWith([fajlInfo()]);
  });

  it('POST multipart: deo "fajl" i slajdId samo kad je zadat', () => {
    const fajl = new File(['abc'], 'a.pdf', { type: 'application/pdf' });
    api.dodaj(7, fajl, 55).subscribe();
    const req = http.expectOne('api/prezentacije/7/fajlovi');
    expect(req.request.method).toBe('POST');
    const telo = req.request.body as FormData;
    expect((telo.get('fajl') as File).name).toBe('a.pdf');
    expect(telo.get('slajdId')).toBe('55');
    req.flush(fajlInfo(), { status: 201, statusText: 'Created' });

    api.dodaj(7, fajl, null).subscribe();
    const req2 = http.expectOne('api/prezentacije/7/fajlovi');
    expect((req2.request.body as FormData).has('slajdId')).toBe(false);
    req2.flush(fajlInfo());
  });

  it('PUT api/fajlovi-prezentacije/3 sa {naziv, slajdId}', () => {
    api.izmeni(3, { naziv: 'novo.docx', slajdId: null }).subscribe();
    const req = http.expectOne('api/fajlovi-prezentacije/3');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ naziv: 'novo.docx', slajdId: null });
    req.flush(fajlInfo());
  });

  it('PUT api/prezentacije/7/fajlovi/redosled sa {ids}', () => {
    api.redosled(7, [3, 1, 2]).subscribe();
    const req = http.expectOne('api/prezentacije/7/fajlovi/redosled');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ ids: [3, 1, 2] });
    req.flush([]);
  });

  it('DELETE api/fajlovi-prezentacije/3 i putanja preuzimanja', () => {
    api.obrisi(3).subscribe();
    const req = http.expectOne('api/fajlovi-prezentacije/3');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(urlFajlaPrezentacije(3)).toBe('api/fajlovi-prezentacije/3/sadrzaj');
  });
});
