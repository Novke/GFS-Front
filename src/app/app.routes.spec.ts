import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { routes } from './app.routes';
import { NotFound } from './core/layout/not-found';
import { PublicLayout } from './core/layout/public-layout';
import { Shell } from './core/layout/shell';

const tick = () => new Promise(r => setTimeout(r));

/** Prva komponenta od korena (layout), bez outleta: ruta se samo prepoznaje. */
function layout(router: Router): unknown {
  for (let s: ActivatedRouteSnapshot | null = router.routerState.snapshot.root; s; s = s.firstChild) {
    if (s.component) {
      return s.component;
    }
  }
  return null;
}

/**
 * Čuvar `nastavnikGuard` po rutama (spec prijave, sekcija 10): ljuska i sve nastavničke rute van nje (ProjectorLayout,
 * stari link na onboarding) bez sesije vode na `/prijava?nazad=...`; javne rute i sama `/prijava` ne pitaju za sesiju.
 */
describe('rute i sesija nastavnika', () => {
  let router: Router;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpTestingController);
  });

  /** Navigira bez sesije: svaki `GET api/auth/ja` dobija 401. */
  async function idiBezSesije(url: string): Promise<void> {
    const gotovo = router.navigateByUrl(url);
    for (let i = 0; i < 5; i++) {
      await tick();
      for (const req of http.match('api/auth/ja')) {
        req.flush({ reason: 'Potrebna je prijava.' }, { status: 401, statusText: 'Unauthorized' });
      }
    }
    await gotovo;
  }

  it.each([
    ['/', null],
    ['/predavanja?grupa=1', 'predavanja?grupa=1'],
    ['/studenti/4/pregled', 'studenti/4/pregled'],
    ['/nepostoji', 'nepostoji'],
    ['/predavanja/5/projektor', 'predavanja/5/projektor'],
    ['/grupe/3/onboarding/7/qr', 'grupe/3/onboarding/7/qr'],
    ['/izvodjenja/7/publika', 'izvodjenja/7/publika'],
    ['/izvodjenja/7/konzola?telefon=1', 'izvodjenja/7/konzola?telefon=1'],
    ['/izvodjenja/7/daljinski', 'izvodjenja/7/daljinski'],
    ['/onboarding/7', 'onboarding/7'],
    ['/onboarding/7/qr', 'onboarding/7/qr'],
    ['/predavanje/5', 'predavanje/5'],
  ])('nastavnička ruta %s bez sesije -> /prijava (nazad=%s), bez učitavanja ekrana', async (url, nazad) => {
    await idiBezSesije(url);
    const stablo = router.parseUrl(router.url);
    expect(stablo.root.children['primary'].segments.map(s => s.path)).toEqual(['prijava']);
    expect(stablo.queryParams).toEqual(nazad === null ? {} : { nazad });
    expect(layout(router)).toBe(PublicLayout);
    http.expectNone(() => true);
  });

  it.each(['/upis/abc', '/uzivo', '/uzivo/123456', '/prijava', '/prijava?nazad=studenti', '/nalog', '/nalog?nazad=uzivo%2FABC123'])(
    'javna ruta %s ne pita za sesiju',
    async url => {
      await router.navigateByUrl(url);
      expect(router.url).toBe(url);
      expect(layout(router)).toBe(PublicLayout);
      http.expectNone('api/auth/ja');
    },
  );

  it.each(['/nalog/nepostoji', '/nalog/a/b'])('pogrešan link pod /nalog (%s) ostaje javni 404 u PublicLayout-u', async url => {
    await router.navigateByUrl(url);
    expect(router.url).toBe(url);
    expect(layout(router)).toBe(PublicLayout);
    let list = router.routerState.snapshot.root;
    while (list.firstChild) {
      list = list.firstChild;
    }
    expect(list.component).toBe(NotFound);
    expect(list.data['javna']).toBe(true);
    http.expectNone(() => true);
  });

  it('sa sesijom ljuska se otvara (jedan GET ja za više navigacija)', async () => {
    const prva = router.navigateByUrl('/grupe');
    await tick();
    http.expectOne('api/auth/ja').flush({ uloga: 'NASTAVNIK', korisnik: 'nastavnik' });
    await prva;
    expect(layout(router)).toBe(Shell);
    await router.navigateByUrl('/izvodjenja/7/konzola');
    await router.navigateByUrl('/predavanja');
    http.expectNone('api/auth/ja');
    expect(router.url).toBe('/predavanja');
  });
});
