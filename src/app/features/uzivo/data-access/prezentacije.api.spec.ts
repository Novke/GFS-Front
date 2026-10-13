import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { platno } from './platno-podaci.testing';
import { PrezentacijeApi } from './prezentacije.api';
import type { PrezentacijaDetails, UvozSlajdovaCmd } from './uzivo.models';

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
