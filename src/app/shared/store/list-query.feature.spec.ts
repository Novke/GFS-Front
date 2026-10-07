import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { signalStore } from '@ngrx/signals';
import { Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PreferencesStore } from '../../core/state/preferences.store';
import { Strana } from '../models/strana';
import { DEBOUNCE_PRETRAGE_MS, withListQuery } from './list-query.feature';
import { ListQuery } from './list-params';

interface Stavka { id: number; naziv: string }

interface Filteri extends Record<string, string | number | boolean | null> {
  predmet: number | null;
  grupa: number | null;
  q: string | null;
}

const POD: ListQuery<Filteri> = {
  filteri: { predmet: null, grupa: null, q: null },
  sort: 'datum,desc',
  strana: 1,
  velicina: 25,
};

type Loader = (q: ListQuery<Filteri>) => Observable<Strana<Stavka>>;
const LOADER = new InjectionToken<Loader>('test loader');

const KLJUC = 'test-lista';

const ListaStore = signalStore(
  withListQuery<Stavka, Filteri>({
    kljuc: KLJUC,
    filteri: { predmet: { tip: 'broj' }, grupa: { tip: 'broj' }, q: { tip: 'tekst' } },
    podrazumevano: POD,
    sortPolja: ['datum', 'naziv'],
    loader: () => inject(LOADER),
  }),
);

const HubStore = signalStore(
  withListQuery<Stavka, Filteri>({
    kljuc: 'test-hub',
    filteri: { predmet: { tip: 'broj' }, grupa: { tip: 'broj' }, q: { tip: 'tekst' } },
    podrazumevano: POD,
    sortPolja: ['datum', 'naziv'],
    loader: () => inject(LOADER),
    zakljucano: () => {
      const route = inject(ActivatedRoute);
      return { predmet: Number(route.snapshot.paramMap.get('predmetId')) };
    },
  }),
);

@Component({ template: '', providers: [ListaStore], changeDetection: ChangeDetectionStrategy.OnPush })
class ListaComponent {
  readonly store = inject(ListaStore);
}

@Component({ template: '', providers: [HubStore], changeDetection: ChangeDetectionStrategy.OnPush })
class HubComponent {
  readonly store = inject(HubStore);
}

function strana(content: Stavka[], ukupno = content.length, velicina = 25, broj = 0): Strana<Stavka> {
  return { content, page: { size: velicina, number: broj, totalElements: ukupno, totalPages: Math.ceil(ukupno / velicina) } };
}

const A: Stavka = { id: 1, naziv: 'A' };
const B: Stavka = { id: 2, naziv: 'B' };
const C: Stavka = { id: 3, naziv: 'C' };

describe('withListQuery', () => {
  let loader: ReturnType<typeof vi.fn<Loader>>;
  let harness: RouterTestingHarness;
  let router: Router;

  const stabilno = () => harness.fixture.whenStable();
  const poslednjiUpit = () => loader.mock.lastCall?.[0];
  /** Trenutni URL kao putanja + query objekat (redosled parametara nije bitan). */
  const url = () => {
    const stablo = router.parseUrl(router.url);
    return { putanja: router.url.split('?')[0], ...stablo.queryParams };
  };

  async function otvori(url: string) {
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    const cmp = await harness.navigateByUrl(url);
    await stabilno();
    return cmp;
  }

  async function lista(url: string) {
    const cmp = (await otvori(url)) as ListaComponent;
    return cmp.store;
  }

  beforeEach(() => {
    localStorage.clear();
    loader = vi.fn<Loader>(() => of(strana([A, B], 2)));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'lista', component: ListaComponent },
          { path: 'predmeti/:predmetId/lista', component: HubComponent },
        ]),
        { provide: LOADER, useFactory: () => loader },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('početno učitavanje koristi parametre iz URL-a', async () => {
    const store = await lista('/lista?grupa=4&strana=2&sort=naziv,asc&velicina=10');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(poslednjiUpit()).toEqual({ filteri: { predmet: null, grupa: 4, q: null }, sort: 'naziv,asc', strana: 2, velicina: 10 });
    expect(store.upit().strana).toBe(2);
    expect(store.stavke()).toEqual([A, B]);
    expect(store.ukupno()).toBe(2);
    expect(store.status()).toBe('loaded');
    expect(store.imaFiltera()).toBe(true);
  });

  it('smeće u URL-u daje podrazumevani upit, bez navigacije i bez petlje', async () => {
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate');
    await harness.navigateByUrl('/lista?strana=abc&velicina=1000&grupa=-3&sort=lozinka,asc&q=%20%20');
    await stabilno();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(poslednjiUpit()).toEqual(POD);
    expect(nav).not.toHaveBeenCalled();
  });

  it('brojStrana se računa iz ukupnog broja i veličine strane', async () => {
    loader.mockReturnValue(of(strana([A], 51)));
    const store = await lista('/lista');
    expect(store.brojStrana()).toBe(3);
  });

  it('postaviFilter navigira, vraća stranu na 1, čuva filtere i učitava', async () => {
    const store = await lista('/lista?strana=3&sort=naziv,asc&q=x');
    store.postaviFilter('grupa', 5);
    await stabilno();
    expect(url()).toEqual({ putanja: '/lista', q: 'x', sort: 'naziv,asc', grupa: '5' });
    expect(poslednjiUpit()).toEqual({ filteri: { predmet: null, grupa: 5, q: 'x' }, sort: 'naziv,asc', strana: 1, velicina: 25 });
    expect(TestBed.inject(PreferencesStore).filteri(KLJUC)).toEqual({ grupa: '5', q: 'x', sort: 'naziv,asc' });
  });

  it('ne dira query parametre koji ne pripadaju listi', async () => {
    const store = await lista('/lista?tab=studenti&grupa=4');
    store.postaviFilter('grupa', null);
    await stabilno();
    expect(url()).toEqual({ putanja: '/lista', tab: 'studenti' });
  });

  it('postaviStranu, postaviVelicinu i postaviSort menjaju URL; neispravne vrednosti se ignorišu', async () => {
    const store = await lista('/lista');
    const nav = vi.spyOn(router, 'navigate');
    store.postaviStranu(0);
    store.postaviStranu(1.5);
    store.postaviVelicinu(1000);
    store.postaviSort('lozinka,asc');
    expect(nav).not.toHaveBeenCalled();

    store.postaviStranu(2);
    await stabilno();
    expect(url()).toEqual({ putanja: '/lista', strana: '2' });
    store.postaviVelicinu(50);
    await stabilno();
    expect(url()).toEqual({ putanja: '/lista', velicina: '50' });
    store.postaviStranu(2);
    await stabilno();
    store.postaviSort('naziv,asc');
    await stabilno();
    expect(url()).toEqual({ putanja: '/lista', velicina: '50', sort: 'naziv,asc' });
    expect(poslednjiUpit()).toMatchObject({ sort: 'naziv,asc', strana: 1, velicina: 50 });
  });

  it('ocistiFiltere vraća podrazumevane filtere i stranu 1, a zadržava sort i veličinu', async () => {
    const store = await lista('/lista?grupa=4&q=ana&strana=2&sort=naziv,asc&velicina=50');
    store.ocistiFiltere();
    await stabilno();
    expect(url()).toEqual({ putanja: '/lista', sort: 'naziv,asc', velicina: '50' });
    expect(store.imaFiltera()).toBe(false);
  });

  it('zaključan filter dolazi iz rute, ne može se promeniti, ne ulazi u imaFiltera ni u URL', async () => {
    const cmp = (await otvori('/predmeti/9/lista?predmet=3')) as HubComponent;
    const store = cmp.store;
    expect(poslednjiUpit()?.filteri.predmet).toBe(9);
    expect(store.imaFiltera()).toBe(false);

    const nav = vi.spyOn(router, 'navigate');
    store.postaviFilter('predmet', 2);
    expect(nav).not.toHaveBeenCalled();
    expect(store.upit().filteri.predmet).toBe(9);

    store.postaviFilter('grupa', 1);
    await stabilno();
    expect(url()).toEqual({ putanja: '/predmeti/9/lista', grupa: '1' });
    expect(poslednjiUpit()?.filteri).toEqual({ predmet: 9, grupa: 1, q: null });
    expect(store.imaFiltera()).toBe(true);
    expect(TestBed.inject(PreferencesStore).filteri('test-hub')).toEqual({ grupa: '1' });

    store.ocistiFiltere();
    await stabilno();
    expect(store.upit().filteri).toEqual({ predmet: 9, grupa: null, q: null });
  });

  it('promena parametra rute (isti ekran, drugi predmet) ponovo računa zaključan filter i učitava', async () => {
    await otvori('/predmeti/9/lista');
    await harness.navigateByUrl('/predmeti/10/lista');
    await stabilno();
    expect(poslednjiUpit()?.filteri.predmet).toBe(10);
  });

  it('sačuvani filteri se primene jednom kad URL nema parametre liste (navigate tačno jednom, replaceUrl)', async () => {
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    TestBed.inject(PreferencesStore).sacuvajFiltere(KLJUC, { grupa: '4', sort: 'naziv,asc', strana: '7' });
    const nav = vi.spyOn(router, 'navigate');
    const cmp = (await harness.navigateByUrl('/lista?tab=x')) as ListaComponent;
    await stabilno();
    expect(nav).toHaveBeenCalledTimes(1);
    expect(nav.mock.calls[0][1]).toMatchObject({ replaceUrl: true });
    expect(url()).toEqual({ putanja: '/lista', tab: 'x', grupa: '4', sort: 'naziv,asc' });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(poslednjiUpit()).toEqual({ filteri: { predmet: null, grupa: 4, q: null }, sort: 'naziv,asc', strana: 1, velicina: 25 });

    // ista ruta ponovo sa praznim URL-om (klik na stavku menija), sačuvani filteri i dalje postoje: ne primenjuju se opet
    await harness.navigateByUrl('/lista?tab=x');
    await stabilno();
    expect(nav).toHaveBeenCalledTimes(1);
    expect(cmp.store.upit()).toEqual(POD);
    await harness.navigateByUrl('/lista?tab=x&grupa=4&sort=naziv,asc');
    await stabilno();

    // kasniji prazan URL (korisnik je očistio sve) se više ne dopunjuje
    cmp.store.ocistiFiltere();
    await stabilno();
    cmp.store.postaviSort('datum,desc');
    await stabilno();
    expect(url()).toEqual({ putanja: '/lista', tab: 'x' });
    expect(nav).toHaveBeenCalledTimes(3);
  });

  it('sačuvani filteri se ne primenjuju kad URL već ima parametre liste, a sačuvano smeće se ignoriše', async () => {
    const prefs = () => TestBed.inject(PreferencesStore);
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    prefs().sacuvajFiltere(KLJUC, { grupa: '4' });
    const nav = vi.spyOn(router, 'navigate');
    await harness.navigateByUrl('/lista?strana=2');
    await stabilno();
    expect(nav).not.toHaveBeenCalled();
    expect(poslednjiUpit()?.filteri.grupa).toBeNull();

    TestBed.resetTestingModule();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'lista', component: ListaComponent }]), { provide: LOADER, useFactory: () => loader }],
    });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    prefs().sacuvajFiltere(KLJUC, { grupa: '-1', sort: 'lozinka,asc', velicina: '1000', '__proto__': 'x' });
    const nav2 = vi.spyOn(router, 'navigate');
    await harness.navigateByUrl('/lista');
    await stabilno();
    expect(nav2).not.toHaveBeenCalled();
    expect(poslednjiUpit()).toEqual(POD);
  });

  it('spori prvi i brzi drugi odgovor: važi drugi (switchMap otkazuje prvi)', async () => {
    const odgovori: Subject<Strana<Stavka>>[] = [];
    let otkazan = false;
    loader.mockImplementation(() => {
      const s = new Subject<Strana<Stavka>>();
      odgovori.push(s);
      return new Observable<Strana<Stavka>>(sub => {
        const veza = s.subscribe(sub);
        return () => {
          if (odgovori.indexOf(s) === 1 && !s.closed) {
            otkazan = true;
          }
          veza.unsubscribe();
        };
      });
    });
    const store = await lista('/lista');
    odgovori[0].next(strana([A], 1));
    odgovori[0].complete();

    store.postaviFilter('grupa', 1);
    await stabilno();
    store.postaviFilter('grupa', 2);
    await stabilno();
    expect(store.status()).toBe('loading');
    odgovori[2].next(strana([C], 1));
    odgovori[1].next(strana([B], 1));
    expect(otkazan).toBe(true);
    expect(store.stavke()).toEqual([C]);
    expect(store.upit().filteri.grupa).toBe(2);
    expect(store.status()).toBe('loaded');
  });

  it('greška učitavanja: status error sa porukom, stari entiteti ostaju', async () => {
    const store = await lista('/lista');
    expect(store.stavke()).toEqual([A, B]);
    loader.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { reason: 'Nepoznato polje sorta.' } })));
    store.osvezi();
    expect(store.status()).toBe('error');
    expect(store.imaGresku()).toBe(true);
    expect(store.greska()).toBe('Nepoznato polje sorta.');
    expect(store.stavke()).toEqual([A, B]);

    loader.mockReturnValue(throwError(() => new Error('bum')));
    store.osvezi();
    expect(store.greska()).toBe('Sistemska greška. Pokušaj ponovo.');

    loader.mockReturnValue(of(strana([C], 1)));
    store.osvezi();
    expect(store.status()).toBe('loaded');
    expect(store.greska()).toBeNull();
    expect(store.stavke()).toEqual([C]);
  });

  it('strana iza poslednje (zastareo link) prelazi na poslednju postojeću, jednom', async () => {
    loader.mockImplementation(q => (q.strana > 2 ? of(strana([], 30)) : of(strana([A], 30))));
    const nav = vi.fn();
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    const original = router.navigate.bind(router);
    vi.spyOn(router, 'navigate').mockImplementation((...a) => {
      nav(...a);
      return original(...a);
    });
    await harness.navigateByUrl('/lista?strana=9');
    await stabilno();
    expect(url()).toEqual({ putanja: '/lista', strana: '2' });
    expect(nav).toHaveBeenCalledTimes(1);
    expect(nav.mock.calls[0][1]).toMatchObject({ replaceUrl: true });
    expect(poslednjiUpit()?.strana).toBe(2);
  });

  it('pretraga (tekst) se debounsuje i menja URL sa replaceUrl', async () => {
    const store = await lista('/lista');
    vi.useFakeTimers();
    const nav = vi.spyOn(router, 'navigate');
    store.postaviFilter('q', 'A');
    store.postaviFilter('q', 'An');
    store.postaviFilter('q', 'Ana');
    expect(nav).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PRETRAGE_MS);
    expect(nav).toHaveBeenCalledTimes(1);
    expect(nav.mock.calls[0][1]).toMatchObject({ replaceUrl: true });
    vi.useRealTimers();
    await stabilno();
    expect(url()).toEqual({ putanja: '/lista', q: 'Ana' });
  });

  it('druga promena pre isteka debounce-a nosi i otkucan tekst; ocistiFiltere ga odbacuje', async () => {
    const store = await lista('/lista');
    vi.useFakeTimers();
    store.postaviFilter('q', 'Ana');
    store.postaviFilter('grupa', 3);
    vi.useRealTimers();
    await stabilno();
    expect(url()).toEqual({ putanja: '/lista', grupa: '3', q: 'Ana' });

    vi.useFakeTimers();
    store.postaviFilter('q', 'Marko');
    store.ocistiFiltere();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PRETRAGE_MS * 2);
    vi.useRealTimers();
    await stabilno();
    expect(url()).toEqual({ putanja: '/lista' });
  });
});
