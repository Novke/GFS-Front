import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from './api-error';
import { StudentiApi } from './studenti.api';

describe('StudentiApi.pretraga', () => {
  let http: HttpTestingController;
  let api: StudentiApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(StudentiApi);
  });

  afterEach(() => http.verify());

  it('šalje parametre pod imenima iz StudentRest (grupaId, starijiOdGrupe, q, page, size, sort)', () => {
    const rez = vi.fn();
    api.pretraga({ grupaId: 4, starijiOdGrupe: 9, q: 'gd1', page: 2, size: 100, sort: 'indeks,asc' }).subscribe(rez);
    const req = http.expectOne(r => r.url === 'api/studenti/pretraga');
    expect(req.request.method).toBe('GET');
    const p = req.request.params;
    expect(p.get('grupaId')).toBe('4');
    expect(p.get('starijiOdGrupe')).toBe('9');
    expect(p.get('q')).toBe('gd1');
    expect(p.get('page')).toBe('2');
    expect(p.get('size')).toBe('100');
    expect(p.get('sort')).toBe('indeks,asc');
    const strana = { content: [], page: { size: 100, number: 2, totalElements: 0, totalPages: 0 } };
    req.flush(strana);
    expect(rez).toHaveBeenCalledWith(strana);
  });

  it('izostavlja prazne parametre (null, undefined, prazan tekst)', () => {
    api.pretraga({ grupaId: null, q: '  ' }).subscribe();
    const req = http.expectOne(r => r.url === 'api/studenti/pretraga');
    expect(req.request.params.keys()).toEqual([]);
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(false);
    req.flush({ content: [], page: { size: 25, number: 0, totalElements: 0, totalPages: 0 } });
  });

  it('tiho: greška ne ide u snackbar (LOCAL_ERRORS)', () => {
    api.pretraga({ grupaId: 1 }, { tiho: true }).subscribe({ error: () => undefined });
    const req = http.expectOne(r => r.url === 'api/studenti/pretraga');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush({ reason: 'x' }, { status: 404, statusText: 'Not Found' });
  });
});
