import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from './api-error';
import { BankaIzborApi, CvorIzbora } from './banka-izbor.api';

describe('BankaIzborApi.stablo', () => {
  let http: HttpTestingController;
  let api: BankaIzborApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(BankaIzborApi);
  });

  afterEach(() => http.verify());

  it('GET banka/stablo?predmetId=1&namena=PREDAVANJE (samo banka predavanja)', () => {
    api.stablo(1).subscribe();
    const req = http.expectOne(r => r.url === 'api/banka/stablo');
    expect(req.request.method).toBe('GET');
    expect(req.request.urlWithParams).toBe('api/banka/stablo?predmetId=1&namena=PREDAVANJE');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(false);
    req.flush([]);
  });

  it('čvor stabla banke (GrupaCvor) svodi na ono što izbor koristi, rekurzivno kroz decu', () => {
    const rez = vi.fn();
    api.stablo(1).subscribe(rez);
    // server šalje ceo GrupaCvor (brojači, izvor, iskljucenjeId...); izbor vidi samo svoja polja
    const cvor = (id: number, naziv: string, deca: unknown[], izmene: Record<string, unknown> = {}) => ({
      id, naziv, rb: 1, tezina: null, list: deca.length === 0, brojVarijanti: 5, brojAktivnih: 3, brojNacrta: 1,
      brojGresaka: 0, deca, izvor: 'RUCNO', brojClaudeNacrta: 0, iskljucena: false, iskljucenjeId: null, ...izmene,
    });
    http.expectOne(r => r.url === 'api/banka/stablo').flush([
      cvor(1, 'Konverzije brojeva (demo)', [cvor(2, '2 → 10', []), cvor(3, 'Razlomljeni brojevi (demo)', [], { iskljucena: true, iskljucenjeId: 7, brojAktivnih: 0 })]),
    ]);
    const ocekivano: CvorIzbora[] = [{
      id: 1, naziv: 'Konverzije brojeva (demo)', list: false, brojAktivnih: 3, iskljucena: false, deca: [
        { id: 2, naziv: '2 → 10', list: true, brojAktivnih: 3, iskljucena: false, deca: [] },
        { id: 3, naziv: 'Razlomljeni brojevi (demo)', list: true, brojAktivnih: 0, iskljucena: true, deca: [] },
      ],
    }];
    expect(rez).toHaveBeenCalledWith(ocekivano);
  });

  it('tiho: greška ne ide u snackbar (LOCAL_ERRORS)', () => {
    api.stablo(4, { tiho: true }).subscribe({ error: () => undefined });
    const req = http.expectOne(r => r.url === 'api/banka/stablo');
    expect(req.request.params.get('predmetId')).toBe('4');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush({ reason: 'x' }, { status: 500, statusText: 'Server Error' });
  });
});
