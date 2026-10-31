import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NalogTabovi, tabIzUrla } from './tabovi.page';

const CAS = 'api/public/nalog/cas';
/** Zvono u zaglavlju (`ZvonoNaloga`, svoj spec) pita samo za sebe; ovde se prazno odgovara na kraju testa. */
const ZVONO = 'api/public/nalog/obavestenja';

@Component({ template: '<h2>strana</h2>' })
class Strana {}

const NA_CASU = {
  predavanje: { id: 17, predmet: 'Uvod', datum: '2026-10-29', rb: 3, tema: null, zavrseno: false },
  cekiranU: '2026-10-29T10:00:00',
  izvodjenje: { kod: '123456', naziv: 'Petlje' },
};

/** Ljuska tabova (spec studentskog dela 12.1): tabovi, trake "Prezentacija je počela" i "Predavanje je u toku", ritam upita. */
describe('NalogTabovi', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  const el = () => harness.routeNativeElement!.closest('app-nalog-tabovi') ?? document.querySelector('app-nalog-tabovi')!;
  const traka = () => document.querySelector('[data-traka]');
  const trakaUToku = () => document.querySelector('[data-traka-u-toku]');
  const tacka = () => document.querySelector('nav.tabovi a[data-tab="cas"] [data-tacka]');
  const aktivan = () => document.querySelector('nav.tabovi a[aria-current="page"]')?.getAttribute('data-tab');

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          {
            path: 'nalog',
            component: NalogTabovi,
            children: [
              { path: 'pocetna', component: Strana },
              { path: 'cas', component: Strana },
              { path: 'predmeti', component: Strana },
              { path: 'predmet/:id', component: Strana },
              { path: 'ja', component: Strana },
            ],
          },
          { path: 'uzivo/:kod', component: Strana },
        ]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    vi.useRealTimers();
    http.match(ZVONO).forEach(r => r.flush({ novo: false, stavke: [] }));
    http.verify();
  });

  it.each([
    ['/nalog/cas', 'cas'],
    ['/nalog/cas/abc.def', 'cas'],
    ['/nalog/predmeti', 'predmeti'],
    ['/nalog/predmet/3?k=istorija', 'predmeti'],
    ['/nalog/prezentacija/7', 'predmeti'],
    ['/nalog/predmet/3/vezbanje/5', 'predmeti'],
    ['/nalog/ja', 'ja'],
    ['/nalog/pocetna', 'pocetna'],
    ['/nalog/pocetna?x=1', 'pocetna'],
  ] as const)('tabIzUrla(%s) = %s', (url, tab) => {
    expect(tabIzUrla(url)).toBe(tab);
  });

  it('tab Čas: ljuska ne pita server i nema trake (Čas pita sam)', async () => {
    await harness.navigateByUrl('/nalog/cas');
    http.expectNone(CAS);
    expect(aktivan()).toBe('cas');
    expect(traka()).toBeNull();
    expect([...el().querySelectorAll('nav.tabovi a')].map(a => a.getAttribute('data-tab'))).toEqual(['pocetna', 'cas', 'predmeti', 'ja']);
    expect(tacka()).toBeNull();
    // zvono je u ljusci na svakom tabu
    expect(el().querySelector('app-zvono-naloga')).not.toBeNull();
    http.expectOne(ZVONO).flush({ novo: false, stavke: [] });
  });

  it('Početna: aktivan tab, traka i tačka na tabu Čas dok traje izvođenje', async () => {
    await harness.navigateByUrl('/nalog/pocetna');
    expect(aktivan()).toBe('pocetna');
    expect(tacka()).toBeNull();
    http.expectOne(CAS).flush(NA_CASU);
    harness.detectChanges();
    expect(traka()).not.toBeNull();
    expect(tacka()).not.toBeNull();
    expect(document.querySelector('nav.tabovi a[data-tab="cas"]')?.textContent).toContain('(čas je u toku)');
  });

  it('predavanje grupe u toku (nije čekiran): traka "Predavanje je u toku · Čekiraj se" vodi na tab Čas, ritam 30 s', async () => {
    await harness.navigateByUrl('/nalog/pocetna');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    http.expectOne(CAS).flush({ uToku: { predmet: 'Uvod u primenu računara', tema: 'Petlje' } });
    harness.detectChanges();
    expect(traka()).toBeNull();
    expect(trakaUToku()?.textContent).toContain('Predavanje je u toku');
    expect(trakaUToku()?.textContent).toContain('Uvod u primenu računara · Petlje');
    expect(trakaUToku()?.querySelector('a')?.getAttribute('href')).toBe('/nalog/cas');
    expect(tacka()).not.toBeNull();
    vi.advanceTimersByTime(29_999);
    http.expectNone(CAS);
    vi.advanceTimersByTime(1);
    http.expectOne(CAS).flush({});
    harness.detectChanges();
    expect(trakaUToku()).toBeNull();
    expect(tacka()).toBeNull();
  });

  it('tab Predmeti dok traje izvođenje sa časa: traka "Prezentacija je počela · Uđi" (samo dugme, bez skoka)', async () => {
    const router = TestBed.inject(Router);
    await harness.navigateByUrl('/nalog/predmeti');
    expect(aktivan()).toBe('predmeti');
    http.expectOne(CAS).flush(NA_CASU);
    harness.detectChanges();
    expect(traka()?.textContent).toContain('Prezentacija je počela');
    expect(traka()?.textContent).toContain('Petlje');
    expect(traka()?.querySelector('a')?.getAttribute('href')).toBe('/uzivo/123456?sa=cas');
    expect(router.url).toBe('/nalog/predmeti');
  });

  it('bez izvođenja nema trake; prelaz na Čas sklanja traku, povratak odmah pita', async () => {
    await harness.navigateByUrl('/nalog/ja');
    http.expectOne(CAS).flush(NA_CASU);
    harness.detectChanges();
    expect(traka()).not.toBeNull();
    await harness.navigateByUrl('/nalog/cas');
    expect(traka()).toBeNull();
    http.expectNone(CAS);
    await harness.navigateByUrl('/nalog/predmeti');
    http.expectOne(CAS).flush({ predavanje: null, izvodjenje: null });
    harness.detectChanges();
    expect(traka()).toBeNull();
  });

  it('ritam: na času 10 s ± 2 s, van časa 60 s', async () => {
    await harness.navigateByUrl('/nalog/predmeti');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    http.expectOne(CAS).flush(NA_CASU);
    vi.advanceTimersByTime(9_999);
    http.expectNone(CAS);
    vi.advanceTimersByTime(1);
    http.expectOne(CAS).flush({ predavanje: null, izvodjenje: null });
    vi.advanceTimersByTime(59_999);
    http.expectNone(CAS);
    vi.advanceTimersByTime(1);
    http.expectOne(CAS).flush({ predavanje: null, izvodjenje: null });
  });

  it('401: prijava sa povratkom na trenutnu stranu', async () => {
    await harness.navigateByUrl('/nalog/predmet/3?k=ocena');
    const navigacija = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    http.expectOne(CAS).flush({ reason: 'Potrebna je prijava.' }, { status: 401, statusText: 'Unauthorized' });
    expect(navigacija).toHaveBeenCalledExactlyOnceWith('nalog?nazad=nalog/predmet/3?k=ocena');
  });
});
