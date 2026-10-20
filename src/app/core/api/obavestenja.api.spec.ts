import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_ERRORS } from './api-error';
import { NAJVISE_OTVORENIH, ObavestenjaApi, ObavestenjeInfo, tekstObavestenja } from './obavestenja.api';

const obavestenje = (izmene: Partial<ObavestenjeInfo> = {}): ObavestenjeInfo => ({
  id: 1, vrsta: 'NE_STIZE_KOD', studentId: 4, studentIme: 'Ana Primerović', indeks: 'GD1/2025',
  podaci: { indeks: 'GD1/2025', imaMejl: true, uredjaj: 'ZAPAMCEN' }, kreirano: '2026-10-19T10:00:00', procitano: null, reseno: null,
  ...izmene,
});

describe('tekstObavestenja', () => {
  it('NE_STIZE_KOD: ime studenta', () => {
    expect(tekstObavestenja(obavestenje())).toBe('Ne stiže kod: Ana Primerović');
  });

  it('NE_STIZE_KOD: "nema mejl" i "nepoznat uređaj"', () => {
    expect(tekstObavestenja(obavestenje({ podaci: { imaMejl: false, uredjaj: 'NEPOZNAT' } })))
      .toBe('Ne stiže kod: Ana Primerović · nema mejl · nepoznat uređaj');
    expect(tekstObavestenja(obavestenje({ podaci: { imaMejl: false } }))).toBe('Ne stiže kod: Ana Primerović · nema mejl');
    expect(tekstObavestenja(obavestenje({ podaci: { uredjaj: 'NEPOZNAT' } }))).toBe('Ne stiže kod: Ana Primerović · nepoznat uređaj');
  });

  it('bez studenta (nepostojeći indeks): indeks, pa indeks iz podataka', () => {
    expect(tekstObavestenja(obavestenje({ studentId: null, studentIme: null, indeks: 'XX9/2025', podaci: null })))
      .toBe('Ne stiže kod: XX9/2025');
    expect(tekstObavestenja(obavestenje({ studentId: null, studentIme: null, indeks: null, podaci: { indeks: 'YY1' } })))
      .toBe('Ne stiže kod: YY1');
    expect(tekstObavestenja(obavestenje({ studentId: null, studentIme: '  ', indeks: null, podaci: {} }))).toBe('Ne stiže kod: —');
  });

  it('PREVISE_KODOVA', () => {
    expect(tekstObavestenja(obavestenje({ vrsta: 'PREVISE_KODOVA', podaci: { imaMejl: false } }))).toBe('Previše zahteva za kod: Ana Primerović');
  });
});

describe('ObavestenjaApi', () => {
  let api: ObavestenjaApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ObavestenjaApi);
    http = TestBed.inject(HttpTestingController);
  });

  it('otvorena: prvih 10, tiho', () => {
    api.otvorena({ tiho: true }).subscribe();
    const req = http.expectOne(r => r.url === 'api/obavestenja');
    expect(req.request.params.get('stanje')).toBe('otvorena');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe(String(NAJVISE_OTVORENIH));
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush({ content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } });
  });

  it('broj i akcije', () => {
    api.broj({ tiho: true }).subscribe();
    expect(http.expectOne('api/obavestenja/broj').request.context.get(LOCAL_ERRORS)).toBe(true);
    api.procitano(3).subscribe();
    const procitano = http.expectOne('api/obavestenja/3/procitano');
    expect(procitano.request.method).toBe('POST');
    expect(procitano.request.context.get(LOCAL_ERRORS)).toBe(false);
    api.reseno(3).subscribe();
    expect(http.expectOne('api/obavestenja/3/reseno').request.method).toBe('POST');
    api.procitajSve().subscribe();
    expect(http.expectOne('api/obavestenja/procitaj-sve').request.method).toBe('POST');
    http.verify();
  });
});
