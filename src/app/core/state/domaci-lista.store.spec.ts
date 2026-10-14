import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_ERRORS } from '../api/api-error';
import { tekucaSkolskaGodina } from '../../shared/util/skolska-godina';
import { DomaciListaStore } from './domaci-lista.store';

@Component({ template: '', providers: [DomaciListaStore], changeDetection: ChangeDetectionStrategy.OnPush })
class Lista {
  readonly store = inject(DomaciListaStore);
}

const prazna = { content: [], page: { size: 25, number: 0, totalElements: 0, totalPages: 0 } };

describe('DomaciListaStore', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'domaci', component: Lista }]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function otvori(url: string) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, Lista);
    return http.expectOne(r => r.url === 'api/domaci/pretraga');
  }

  it('šalje predmetId, grupaId, godina, pregledan, q, od, do, page, size i sort', async () => {
    const zahtev = await otvori('/domaci?predmet=3&grupa=4&godina=2025&status=pregledan&q=petlje&od=2025-10-01&do=2025-10-31&sort=naslov,asc&strana=2&velicina=10');
    const p = zahtev.request.params;
    expect(p.get('predmetId')).toBe('3');
    expect(p.get('grupaId')).toBe('4');
    expect(p.get('godina')).toBe('2025');
    expect(p.get('pregledan')).toBe('true');
    expect(p.get('q')).toBe('petlje');
    expect(p.get('od')).toBe('2025-10-01');
    expect(p.get('do')).toBe('2025-10-31');
    expect(p.get('page')).toBe('1');
    expect(p.get('size')).toBe('10');
    expect(p.get('sort')).toBe('naslov,asc');
    expect(p.has('status')).toBe(false);
    zahtev.flush(prazna);
  });

  it('status za-pregled je pregledan=false, nepoznat status (ručno izmenjen URL) je bez filtera', async () => {
    const zahtev = await otvori('/domaci?status=za-pregled');
    expect(zahtev.request.params.get('pregledan')).toBe('false');
    zahtev.flush(prazna);
  });

  it('podrazumevano: tekuća školska godina, datum,desc, strana 1 od 25; greška je tiha', async () => {
    const zahtev = await otvori('/domaci?status=nesto');
    expect(zahtev.request.params.get('godina')).toBe(String(tekucaSkolskaGodina()));
    expect(zahtev.request.params.get('sort')).toBe('datum,desc');
    expect(zahtev.request.params.get('page')).toBe('0');
    expect(zahtev.request.params.get('size')).toBe('25');
    expect(zahtev.request.params.has('pregledan')).toBe(false);
    expect(zahtev.request.context.get(LOCAL_ERRORS)).toBe(true);
    zahtev.flush(prazna);
  });

  it('sort po nepoznatom polju pada na podrazumevani (server bi vratio 400)', async () => {
    const zahtev = await otvori('/domaci?sort=lozinka,asc');
    expect(zahtev.request.params.get('sort')).toBe('datum,desc');
    zahtev.flush(prazna);
  });
});
