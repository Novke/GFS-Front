import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { platno } from './platno-podaci.testing';
import { PrezentacijeApi } from './prezentacije.api';
import type { PoteziSloja, PrezentacijaDetails, UvozSlajdovaCmd } from './uzivo.models';

describe('PrezentacijeApi.uvezi', () => {
  let http: HttpTestingController;
  let api: PrezentacijeApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(PrezentacijeApi);
  });

  afterEach(() => http.verify());

  it('šalje POST api/prezentacije/3/slajdovi/uvoz sa telom cmd i LOCAL_ERRORS', () => {
    const cmd: UvozSlajdovaCmd = {
      posle: 41,
      slajdovi: [{ tip: 'PLATNO', naslov: null, sadrzaj: null, slikaId: null, beleske: 'b', postepeno: false, pitanje: null, platno: platno() }],
    };
    const rez = vi.fn();
    api.uvezi(3, cmd).subscribe(rez);
    const req = http.expectOne('api/prezentacije/3/slajdovi/uvoz');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBe(cmd);
    expect(req.request.params.keys()).toEqual([]);
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    const detalji = { id: 3, slajdovi: [] } as unknown as PrezentacijaDetails;
    req.flush(detalji, { status: 201, statusText: 'Created' });
    expect(rez).toHaveBeenCalledWith(detalji);
  });
});

describe('PrezentacijeApi.potezi', () => {
  let http: HttpTestingController;
  let api: PrezentacijeApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(PrezentacijeApi);
  });

  afterEach(() => http.verify());

  it('šalje GET api/slajdovi/52/potezi sa LOCAL_ERRORS i vraća listu (potezi može biti null)', () => {
    const rez = vi.fn();
    api.potezi(52).subscribe(rez);
    const req = http.expectOne('api/slajdovi/52/potezi');
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    const lista: PoteziSloja[] = [
      { slojId: 'c1', medijId: 'm1', sirina: 100, visina: 50, potezi: [{ boja: '#000000', debljina: 2, tacke: [1, 2, 3, 4] }] },
      { slojId: 'c2', medijId: 'm2', sirina: 100, visina: 50, potezi: null },
    ];
    req.flush(lista);
    expect(rez).toHaveBeenCalledWith(lista);
  });
});
