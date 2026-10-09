import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { StudentiListaStore } from './studenti-lista.store';

@Component({ template: '', providers: [StudentiListaStore], changeDetection: ChangeDetectionStrategy.OnPush })
class Lista {
  readonly store = inject(StudentiListaStore);
}

const prazna = { content: [], page: { size: 25, number: 0, totalElements: 0, totalPages: 0 } };

describe('StudentiListaStore', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'studenti', component: Lista }]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function otvori(url: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, Lista);
    return http.expectOne(r => r.url === 'api/studenti/pretraga');
  }

  it('šalje grupaId, starijiOdGrupe, q, page, size i sort', async () => {
    const zahtev = await otvori('/studenti?grupa=4&stariji=7&q=ana&sort=indeks,desc&strana=2&velicina=10');
    const p = zahtev.request.params;
    expect(p.get('grupaId')).toBe('4');
    expect(p.get('starijiOdGrupe')).toBe('7');
    expect(p.get('q')).toBe('ana');
    expect(p.get('page')).toBe('1');
    expect(p.get('size')).toBe('10');
    expect(p.get('sort')).toBe('indeks,desc');
    expect(p.has('grupa')).toBe(false);
    zahtev.flush(prazna);
  });

  it('podrazumevano: bez filtera, prezime,asc, strana 1 od 25; greška je tiha', async () => {
    const zahtev = await otvori('/studenti');
    const p = zahtev.request.params;
    expect(p.has('grupaId')).toBe(false);
    expect(p.has('starijiOdGrupe')).toBe(false);
    expect(p.has('q')).toBe(false);
    expect(p.get('sort')).toBe('prezime,asc');
    expect(p.get('page')).toBe('0');
    expect(p.get('size')).toBe('25');
    expect(zahtev.request.context.get(LOCAL_ERRORS)).toBe(true);
    zahtev.flush(prazna);
  });

  it('neispravni parametri (grupa=abc, sort po nepoznatom polju) padaju na podrazumevano', async () => {
    const zahtev = await otvori('/studenti?grupa=abc&stariji=-1&sort=lozinka,asc');
    expect(zahtev.request.params.has('grupaId')).toBe(false);
    expect(zahtev.request.params.has('starijiOdGrupe')).toBe(false);
    expect(zahtev.request.params.get('sort')).toBe('prezime,asc');
    zahtev.flush(prazna);
  });
});
