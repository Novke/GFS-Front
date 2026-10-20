import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { DestroyRef, DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../api/api-error';
import { ObavestenjeInfo } from '../api/obavestenja.api';
import { ObavestenjaStore } from './obavestenja.store';
import { PERIOD_MS, RAZMAK_NAVIGACIJA_MS } from './periodicno-osvezavanje';

const BROJ = 'api/obavestenja/broj';
const LISTA = (r: { url: string }) => r.url === 'api/obavestenja';

const obavestenje = (id: number, izmene: Partial<ObavestenjeInfo> = {}): ObavestenjeInfo => ({
  id, vrsta: 'NE_STIZE_KOD', studentId: id, studentIme: `Student ${id}`, indeks: `GD${id}`, podaci: { imaMejl: true },
  kreirano: '2026-10-19T10:00:00', procitano: null, reseno: null, ...izmene,
});
const strana = (stavke: ObavestenjeInfo[]) => ({ content: stavke, page: { size: 10, number: 0, totalElements: stavke.length, totalPages: 1 } });

/** DestroyRef kojim test sam završava "život" ljuske. */
function lazniDestroyRef(): DestroyRef & { unisti(): void } {
  const kraj: (() => void)[] = [];
  return {
    destroyed: false,
    onDestroy: (fn: () => void) => {
      kraj.push(fn);
      return () => undefined;
    },
    unisti: () => kraj.splice(0).forEach(fn => fn()),
  } as unknown as DestroyRef & { unisti(): void };
}

describe('ObavestenjaStore', () => {
  let http: HttpTestingController;
  let dogadjaji: Subject<unknown>;
  let vidljivost: DocumentVisibilityState;
  let store: ObavestenjaStore;

  beforeEach(() => {
    vi.useFakeTimers();
    dogadjaji = new Subject();
    vidljivost = 'visible';
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const router = TestBed.inject(Router);
    Object.defineProperty(router, 'events', { value: dogadjaji.asObservable() });
    vi.spyOn(TestBed.inject(DOCUMENT), 'visibilityState', 'get').mockImplementation(() => vidljivost);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ObavestenjaStore);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const navigacija = () => dogadjaji.next(new NavigationEnd(1, '/a', '/a'));

  /** Učitana lista (i broj) sa datim stavkama. */
  function ucitano(stavke: ObavestenjeInfo[], broj = { neprocitana: stavke.filter(o => !o.procitano).length, otvorena: stavke.length }) {
    store.ucitaj();
    http.expectOne(LISTA).flush(strana(stavke));
    http.expectOne(BROJ).flush(broj);
  }

  it('sam od sebe ne zove ništa (na javnim rutama ga niko ne pokreće)', () => {
    vi.advanceTimersByTime(PERIOD_MS * 3);
    navigacija();
    http.expectNone(() => true);
    expect(store.broj()).toEqual({ neprocitana: 0, otvorena: 0 });
  });

  it('pokreni: broj odmah (tiho), pa na isti interval kao kontrolna tabla; kraj ljuske ga zaustavlja', () => {
    const ljuska = lazniDestroyRef();
    store.pokreni(ljuska);
    const req = http.expectOne(BROJ);
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush({ neprocitana: 3, otvorena: 5 });
    expect(store.broj()).toEqual({ neprocitana: 3, otvorena: 5 });

    // navigacija najviše jednom u 15 s
    navigacija();
    http.expectNone(BROJ);
    vi.advanceTimersByTime(RAZMAK_NAVIGACIJA_MS);
    navigacija();
    http.expectOne(BROJ).flush({ neprocitana: 3, otvorena: 5 });

    // na 60 s, samo dok je tab vidljiv
    vi.advanceTimersByTime(PERIOD_MS);
    http.expectOne(BROJ).flush({ neprocitana: 2, otvorena: 5 });
    expect(store.broj().neprocitana).toBe(2);
    vidljivost = 'hidden';
    vi.advanceTimersByTime(PERIOD_MS);
    http.expectNone(BROJ);

    ljuska.unisti();
    vidljivost = 'visible';
    vi.advanceTimersByTime(PERIOD_MS * 2);
    vi.advanceTimersByTime(RAZMAK_NAVIGACIJA_MS);
    navigacija();
    http.expectNone(() => true);
  });

  it('dvostruko pokretanje ne pravi dva tajmera', () => {
    const ljuska = lazniDestroyRef();
    store.pokreni(ljuska);
    store.pokreni(ljuska);
    http.expectOne(BROJ).flush({ neprocitana: 0, otvorena: 0 });
    vi.advanceTimersByTime(PERIOD_MS);
    http.expectOne(BROJ).flush({ neprocitana: 0, otvorena: 0 });
  });

  it('greška broja je tiha i broj ostaje; neispravne vrednosti su 0', () => {
    store.pokreni(lazniDestroyRef());
    http.expectOne(BROJ).flush({ neprocitana: 4, otvorena: 'x' });
    expect(store.broj()).toEqual({ neprocitana: 4, otvorena: 0 });
    vi.advanceTimersByTime(PERIOD_MS);
    http.expectOne(BROJ).flush({ reason: 'x' }, { status: 500, statusText: 'Server Error' });
    expect(store.broj()).toEqual({ neprocitana: 4, otvorena: 0 });
  });

  it('ucitaj: prvih 10 otvorenih (tiho) i broj', () => {
    store.ucitaj();
    const req = http.expectOne(LISTA);
    expect(req.request.params.get('stanje')).toBe('otvorena');
    expect(req.request.params.get('size')).toBe('10');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    expect(store.status()).toBe('loading');
    req.flush(strana(Array.from({ length: 12 }, (_, i) => obavestenje(i + 1))));
    http.expectOne(BROJ).flush({ neprocitana: 12, otvorena: 12 });
    expect(store.status()).toBe('loaded');
    expect(store.otvorena().map(o => o.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('greška liste: status error sa porukom servera', () => {
    store.ucitaj();
    http.expectOne(LISTA).flush({ reason: 'Nemaš pristup.' }, { status: 403, statusText: 'Forbidden' });
    http.expectOne(BROJ).flush({ neprocitana: 0, otvorena: 0 });
    expect(store.status()).toBe('error');
    expect(store.greska()).toBe('Nemaš pristup.');
  });

  it('kad se broj promeni a lista je učitana, lista se osvežava', () => {
    store.pokreni(lazniDestroyRef());
    http.expectOne(BROJ).flush({ neprocitana: 1, otvorena: 1 });
    ucitano([obavestenje(1)]);
    vi.advanceTimersByTime(PERIOD_MS);
    http.expectOne(BROJ).flush({ neprocitana: 1, otvorena: 1 });
    http.expectNone(LISTA); // isti broj: bez liste
    vi.advanceTimersByTime(PERIOD_MS);
    http.expectOne(BROJ).flush({ neprocitana: 2, otvorena: 2 });
    http.expectOne(LISTA).flush(strana([obavestenje(2), obavestenje(1)]));
    expect(store.otvorena().map(o => o.id)).toEqual([2, 1]);
  });

  function osvezenoPosleAkcije(stavke: ObavestenjeInfo[], broj: { neprocitana: number; otvorena: number }): void {
    http.expectOne(LISTA).flush(strana(stavke));
    http.expectOne(BROJ).flush(broj);
  }

  it('procitano: odmah u prikazu (manje nepročitanih), POST bez LOCAL_ERRORS (snackbar), pa osvežavanje', () => {
    ucitano([obavestenje(1), obavestenje(2)]);
    store.procitano(1);
    expect(store.otvorena()[0].procitano).not.toBeNull();
    expect(store.broj()).toEqual({ neprocitana: 1, otvorena: 2 });
    const req: TestRequest = http.expectOne('api/obavestenja/1/procitano');
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(false);
    req.flush(null, { status: 204, statusText: 'No Content' });
    osvezenoPosleAkcije([obavestenje(1, { procitano: '2026-10-19T11:00:00' }), obavestenje(2)], { neprocitana: 1, otvorena: 2 });
    expect(store.otvorena()[0].procitano).toBe('2026-10-19T11:00:00');
  });

  it('procitano na već pročitanom ne šalje ništa', () => {
    ucitano([obavestenje(1, { procitano: '2026-10-19T11:00:00' })]);
    store.procitano(1);
    http.expectNone(() => true);
  });

  it('reseno: stavka nestaje iz liste, brojevi se smanjuju; posle greške osvežavanje vraća stanje servera', () => {
    ucitano([obavestenje(1), obavestenje(2, { procitano: '2026-10-19T11:00:00' })]);
    store.reseno(1);
    expect(store.otvorena().map(o => o.id)).toEqual([2]);
    expect(store.broj()).toEqual({ neprocitana: 0, otvorena: 1 });
    http.expectOne('api/obavestenja/1/reseno').flush({ reason: 'Ne postoji.' }, { status: 404, statusText: 'Not Found' });
    osvezenoPosleAkcije([obavestenje(1), obavestenje(2, { procitano: '2026-10-19T11:00:00' })], { neprocitana: 1, otvorena: 2 });
    expect(store.otvorena().map(o => o.id)).toEqual([1, 2]);
    expect(store.broj()).toEqual({ neprocitana: 1, otvorena: 2 });
  });

  it('procitajSve: sve pročitano, 0 nepročitanih; prihvata 204 i {procitano: n}', () => {
    ucitano([obavestenje(1), obavestenje(2)]);
    store.procitajSve();
    expect(store.otvorena().every(o => o.procitano !== null)).toBe(true);
    expect(store.broj()).toEqual({ neprocitana: 0, otvorena: 2 });
    http.expectOne('api/obavestenja/procitaj-sve').flush({ procitano: 2 });
    osvezenoPosleAkcije([obavestenje(1, { procitano: 'x' }), obavestenje(2, { procitano: 'x' })], { neprocitana: 0, otvorena: 2 });
    store.procitajSve();
    http.expectOne('api/obavestenja/procitaj-sve').flush(null, { status: 204, statusText: 'No Content' });
    osvezenoPosleAkcije([], { neprocitana: 0, otvorena: 0 });
    expect(store.otvorena()).toEqual([]);
  });
});
