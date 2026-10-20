import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../api/api-error';
import { AuthApi } from './auth.api';

describe('AuthApi', () => {
  let http: HttpTestingController;
  let api: AuthApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(AuthApi);
  });

  afterEach(() => http.verify());

  it('ja: GET api/auth/ja, uvek tiho (čuvar i stranica prijave sami obrađuju 401)', () => {
    const rez = vi.fn();
    api.ja().subscribe(rez);
    const req = http.expectOne('api/auth/ja');
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush({ uloga: 'NASTAVNIK', korisnik: 'nastavnik' });
    expect(rez).toHaveBeenCalledWith({ uloga: 'NASTAVNIK', korisnik: 'nastavnik' });
  });

  it('prijavi: POST api/auth/prijava sa {korisnik, lozinka}, tiho (greška ide u baner forme)', () => {
    const gotovo = vi.fn();
    api.prijavi('nastavnik', 'tajna lozinka').subscribe({ complete: gotovo });
    const req = http.expectOne('api/auth/prijava');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ korisnik: 'nastavnik', lozinka: 'tajna lozinka' });
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(gotovo).toHaveBeenCalledOnce();
  });

  it('odjavi: POST api/auth/odjava, tiho', () => {
    api.odjavi().subscribe();
    const req = http.expectOne('api/auth/odjava');
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('sesije, opozovi i odjaviSveOstale: putanje i metode iz ugovora; tiho samo na zahtev', () => {
    api.sesije().subscribe();
    const s = http.expectOne('api/auth/sesije');
    expect(s.request.method).toBe('GET');
    expect(s.request.context.get(LOCAL_ERRORS)).toBe(false);
    s.flush([]);

    api.opozovi(7, { tiho: true }).subscribe();
    const o = http.expectOne('api/auth/sesije/7');
    expect(o.request.method).toBe('DELETE');
    expect(o.request.context.get(LOCAL_ERRORS)).toBe(true);
    o.flush(null, { status: 204, statusText: 'No Content' });

    const rez = vi.fn();
    api.odjaviSveOstale().subscribe(rez);
    const sve = http.expectOne('api/auth/sesije/odjavi-sve');
    expect(sve.request.method).toBe('POST');
    sve.flush({ odjavljeno: 2 });
    expect(rez).toHaveBeenCalledWith({ odjavljeno: 2 });
  });
});
