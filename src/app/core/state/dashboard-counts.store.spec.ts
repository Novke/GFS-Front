import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createEnvironmentInjector, DestroyRef, DOCUMENT, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DomaciListItem } from '../api/domaci.models';
import type { TestListItem } from '../api/testovi.models';
import { LOCAL_ERRORS } from '../api/api-error';
import { KontrolnaTablaInfo } from '../api/pregled.api';
import { DashboardCountsStore, PERIOD_MS, RAZMAK_NAVIGACIJA_MS, SVEZ_ZAHTEV_MS } from './dashboard-counts.store';

const URL = 'api/pregled/kontrolna-tabla';

/** Liste u `ceka` backend ograničava na 10 stavki; brojači dolaze iz ukupnih vrednosti `broj*`. */
function tabla(testovi: number, domaci: number, prijave: number[]): KontrolnaTablaInfo {
  return {
    sledece: null,
    uToku: [],
    nedelja: [],
    ceka: {
      testovi: Array.from({ length: Math.min(testovi, 10) }, (_, i) => ({ id: i }) as TestListItem),
      domaci: Array.from({ length: Math.min(domaci, 10) }, (_, i) => ({ id: i }) as DomaciListItem),
      prijave: prijave.slice(0, 10).map((brojNaCekanju, i) => ({ sesijaId: i + 1, grupa: null, brojNaCekanju, istice: null })),
      nezavrsena: [],
      brojTestova: testovi,
      brojDomacih: domaci,
      brojPrijava: prijave.reduce((a, b) => a + b, 0),
      brojNezavrsenih: 0,
    },
  };
}

describe('DashboardCountsStore', () => {
  let http: HttpTestingController;
  let dogadjaji: Subject<unknown>;
  let vidljivost: DocumentVisibilityState;
  /** Kao ljuska: osvežavanje traje dok ovaj injektor (njegov `DestroyRef`) živi. */
  let ljuska: EnvironmentInjector;

  beforeEach(() => {
    vi.useFakeTimers();
    dogadjaji = new Subject();
    vidljivost = 'visible';
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const router = TestBed.inject(Router);
    Object.defineProperty(router, 'events', { value: dogadjaji.asObservable() });
    const doc = TestBed.inject(DOCUMENT);
    vi.spyOn(doc, 'visibilityState', 'get').mockImplementation(() => vidljivost);
    http = TestBed.inject(HttpTestingController);
    ljuska = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const navigacija = () => dogadjaji.next(new NavigationEnd(1, '/a', '/a'));
  /** Store kako ga ljuska koristi: injektuje ga i pokrene sa svojim `DestroyRef`. */
  const pokrenut = () => {
    const store = TestBed.inject(DashboardCountsStore);
    store.pokreni(ljuska.get(DestroyRef));
    return store;
  };

  it('ne zove ništa dok ga niko ne injektuje', () => {
    http.expectNone(URL);
  });

  it('sam nastanak ne zove ništa (javna ruta posle odjave, npr. /nalog, ne sme da dobije nastavnički zahtev)', () => {
    TestBed.inject(DashboardCountsStore);
    http.expectNone(URL);
    navigacija();
    vi.advanceTimersByTime(PERIOD_MS * 2);
    http.expectNone(URL);
  });

  it('osvežavanje živi koliko i ljuska: posle uništenja nema ni navigacionog ni periodičnog zahteva, zahtev u toku se otkazuje', () => {
    const store = pokrenut();
    http.expectOne(URL).flush(tabla(1, 0, []));
    vi.advanceTimersByTime(PERIOD_MS);
    const uToku = http.expectOne(URL);
    ljuska.destroy();
    expect(uToku.cancelled).toBe(true);
    vi.advanceTimersByTime(RAZMAK_NAVIGACIJA_MS);
    navigacija();
    vi.advanceTimersByTime(PERIOD_MS * 3);
    http.expectNone(URL);
    expect(store.testovi()).toBe(1);
  });

  it('ponovo pokrenut (nova ljuska posle prijave): odmah učita i opet osvežava; drugi poziv ne pravi drugi tajmer', () => {
    const store = pokrenut();
    http.expectOne(URL).flush(tabla(1, 0, []));
    ljuska.destroy();
    ljuska = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    store.pokreni(ljuska.get(DestroyRef));
    store.pokreni(ljuska.get(DestroyRef));
    http.expectOne(URL).flush(tabla(2, 0, []));
    vi.advanceTimersByTime(PERIOD_MS);
    http.expectOne(URL).flush(tabla(3, 0, []));
    expect(store.testovi()).toBe(3);
  });

  it('pokreni učita brojače iz ukupnih vrednosti (ne iz dužine lista od najviše 10); zahtev je tih', () => {
    const store = pokrenut();
    const req = http.expectOne(URL);
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush(tabla(14, 2, [4, 1]));
    expect(store.testovi()).toBe(14);
    expect(store.domaci()).toBe(2);
    expect(store.prijave()).toBe(5);
  });

  it('navigacija osvežava najviše jednom u 15 s', () => {
    pokrenut();
    http.expectOne(URL).flush(tabla(0, 0, []));
    navigacija();
    http.expectNone(URL);
    vi.advanceTimersByTime(RAZMAK_NAVIGACIJA_MS);
    navigacija();
    http.expectOne(URL).flush(tabla(1, 0, []));
    navigacija();
    http.expectNone(URL);
  });

  it('na 60 s osvežava samo dok je tab vidljiv', () => {
    pokrenut();
    http.expectOne(URL).flush(tabla(0, 0, []));
    vi.advanceTimersByTime(PERIOD_MS);
    http.expectOne(URL).flush(tabla(0, 0, []));
    vidljivost = 'hidden';
    vi.advanceTimersByTime(PERIOD_MS * 3);
    http.expectNone(URL);
    vidljivost = 'visible';
    vi.advanceTimersByTime(PERIOD_MS);
    http.expectOne(URL).flush(tabla(0, 0, []));
  });

  it('greška (npr. 404 na starom backendu) je tiha i ostavlja poslednje brojače', () => {
    const store = pokrenut();
    http.expectOne(URL).flush(tabla(2, 2, [3]));
    vi.advanceTimersByTime(PERIOD_MS);
    http.expectOne(URL).flush(null, { status: 404, statusText: 'Not Found' });
    expect(store.testovi()).toBe(2);
    expect(store.prijave()).toBe(3);
  });

  it('neočekivan oblik odgovora daje nule umesto izuzetka', () => {
    const store = pokrenut();
    http.expectOne(URL).flush({});
    expect([store.testovi(), store.domaci(), store.prijave()]).toEqual([0, 0, 0]);
  });

  it('čuva ceo odgovor i status; greška se pamti, a stara tabla ostaje', () => {
    const store = pokrenut();
    expect(store.status()).toBe('loading');
    http.expectOne(URL).flush(tabla(2, 0, []));
    expect(store.status()).toBe('loaded');
    expect(store.tabla()?.ceka.brojTestova).toBe(2);
    vi.advanceTimersByTime(PERIOD_MS);
    http.expectOne(URL).flush({ reason: 'Nešto nije u redu.' }, { status: 400, statusText: 'Bad Request' });
    expect(store.status()).toBe('error');
    expect(store.greska()).toBe('Nešto nije u redu.');
    expect(store.tabla()?.ceka.brojTestova).toBe(2);
  });

  it('osveziSada ne pravi drugi zahtev dok je upravo počeo jedan; posle odgovora i greške šalje novi', () => {
    const store = pokrenut();
    store.osveziSada(); // zahtev iz `pokreni` je u toku
    store.osveziSada();
    http.expectOne(URL).flush(tabla(1, 0, []));
    store.osveziSada();
    http.expectOne(URL).flush(null, { status: 500, statusText: 'Server Error' });
    store.osveziSada(); // posle greške
    http.expectOne(URL).flush(tabla(3, 0, []));
    expect(store.testovi()).toBe(3);
  });

  it('osveziSada šalje novi zahtev ako je prethodni zapeo duže od SVEZ_ZAHTEV_MS', () => {
    const store = pokrenut();
    const prvi = http.expectOne(URL);
    vi.advanceTimersByTime(SVEZ_ZAHTEV_MS + 1);
    store.osveziSada();
    expect(prvi.cancelled).toBe(true);
    http.expectOne(URL).flush(tabla(0, 0, []));
  });
});
