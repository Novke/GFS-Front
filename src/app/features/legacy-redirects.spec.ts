import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { routes } from '../app.routes';
import { NotFound } from '../core/layout/not-found';
import { ProjectorLayout } from '../core/layout/projector-layout';
import { PublicLayout } from '../core/layout/public-layout';
import { Shell } from '../core/layout/shell';
import { HomeComponent } from '../home/home.component';
import { OnboardingQrComponent } from '../onboarding/onboarding-qr/onboarding-qr.component';
import { AppRoutes } from './privremeno/app-putanje';

/** Lanac komponenti od korena do lista (bez outleta: komponente se ne prave, samo se ruta prepoznaje). */
function komponente(router: Router): unknown[] {
  const lanac: unknown[] = [];
  let s: ActivatedRouteSnapshot | null = router.routerState.snapshot.root;
  while (s) {
    if (s.component) {
      lanac.push(s.component);
    }
    s = s.firstChild;
  }
  return lanac;
}

const tick = () => new Promise(r => setTimeout(r));

describe('preusmerenja starih ruta', () => {
  let router: Router;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpTestingController);
  });

  /** Navigira; privremeni izbor stare stranice po stanju (GET predavanja/domaci/test) dobija "nije završeno". */
  async function idi(url: string): Promise<string> {
    const gotovo = router.navigateByUrl(url);
    for (let i = 0; i < 5; i++) {
      await tick();
      for (const req of http.match(r => /^api\/(predavanja|domaci|test)\/\d+$/.test(r.url))) {
        req.flush({ zavrseno: false, pregledan: false });
      }
    }
    await gotovo;
    return router.url;
  }

  it.each([
    ['/predavanje', '/predavanja'],
    ['/predavanje/grupa/1/predmet/2', '/predavanja?grupa=1&predmet=2'],
    ['/predavanje/live/5', '/predavanja/5'],
    ['/predavanje/5/pregled', '/predavanja/5'],
    ['/predavanje/5', '/predavanja/5'],
    ['/predavanje/start', '/predavanja/novo'],
    ['/domaci/new', '/domaci/novo'],
    ['/domaci/grupa/1/predmet/2', '/domaci?grupa=1&predmet=2'],
    ['/domaci/7/evidentiranje', '/domaci/7'],
    ['/domaci/7/pregled', '/domaci/7'],
    ['/test', '/testovi'],
    ['/test/new', '/testovi/novo'],
    ['/test/3/evidentiranje', '/testovi/3'],
    ['/test/3/pregled', '/testovi/3'],
    ['/test/3', '/testovi/3'],
    ['/test/grupa/1/predmet/2', '/testovi?grupa=1&predmet=2'],
    ['/student/4', '/studenti/4'],
    ['/student/4/predmet/2', '/studenti/4/predmeti/2'],
  ])('%s -> %s', async (staro, novo) => {
    expect(await idi(staro)).toBe(novo);
    expect(komponente(router)[0]).toBe(Shell);
  });

  it('ocene, grupe i domaći ostaju na istoj putanji', async () => {
    expect(await idi('/ocene')).toBe('/ocene');
    expect(await idi('/grupe')).toBe('/grupe');
    expect(await idi('/domaci')).toBe('/domaci');
  });

  it('/upis/abc ostaje i ide u javni layout, bez ljuske', async () => {
    expect(await idi('/upis/abc')).toBe('/upis/abc');
    const lanac = komponente(router);
    expect(lanac[0]).toBe(PublicLayout);
    expect(lanac).not.toContain(Shell);
  });

  it('/ je početna u ljusci', async () => {
    expect(await idi('/')).toBe('/');
    expect(komponente(router)).toEqual([Shell, HomeComponent]);
  });

  it('nepoznata putanja -> 404 u ljusci', async () => {
    expect(await idi('/nepostoji')).toBe('/nepostoji');
    expect(komponente(router)).toEqual([Shell, NotFound]);
  });

  it('nenumerički id u ruti detalja -> 404 bez poziva API-ja', async () => {
    await idi('/predavanja/abc');
    expect(komponente(router)).toEqual([Shell, NotFound]);
    await idi('/predavanje/live/abc');
    expect(komponente(router)).toEqual([Shell, NotFound]);
    await idi('/grupe/0/pregled');
    expect(komponente(router)).toEqual([Shell, NotFound]);
    http.expectNone(() => true);
  });

  it('pogrešna putanja pod /upis -> 404 u javnom layoutu (ne u ljusci, koja zove zaključan API)', async () => {
    await idi('/upis');
    expect(komponente(router)).toEqual([PublicLayout, NotFound]);
    await idi('/upis/abc/visak');
    expect(komponente(router)).toEqual([PublicLayout, NotFound]);
    await idi('/upis/');
    expect(komponente(router)).toEqual([PublicLayout, NotFound]);
  });

  it('projektorske rute idu u projektorski layout', async () => {
    await idi('/predavanja/5/projektor');
    expect(komponente(router)[0]).toBe(ProjectorLayout);
    await idi('/grupe/3/onboarding/7/qr');
    expect(komponente(router)).toEqual([ProjectorLayout, OnboardingQrComponent]);
    expect(router.routerState.snapshot.root.firstChild?.firstChild?.paramMap.get('sid')).toBe('7');
    await idi('/grupe/3/onboarding/7/qr/visak');
    expect(komponente(router)).toEqual([Shell, NotFound]);
  });

  it('grupe/:id vodi na tab pregled', async () => {
    expect(await idi('/grupe/3')).toBe('/grupe/3/pregled');
  });

  it.each([
    ['/onboarding/7', '/grupe/3/onboarding/7'],
    ['/onboarding/7/qr', '/grupe/3/onboarding/7/qr'],
  ])('%s učita sesiju i ode na %s', async (staro, novo) => {
    const harness = await RouterTestingHarness.create();
    const gotovo = harness.navigateByUrl(staro);
    await vi.waitFor(() => http.expectOne('api/onboarding/7').flush({ sesija: { id: 7, grupa: { id: 3 } }, prijave: [] }));
    await gotovo;
    await vi.waitFor(() => expect(router.url).toBe(novo));
    expect(router.currentNavigation()).toBeNull();
  });

  it('stari ekrani sa poznatom grupom vode direktno na grupe/:g/onboarding/:sid[/qr] (bez preusmerenja i GET-a sesije)', async () => {
    expect(await idi('/' + AppRoutes.onboardingPrijave(3, 7))).toBe('/grupe/3/onboarding/7');
    expect(await idi('/' + AppRoutes.onboardingQr(3, 7))).toBe('/grupe/3/onboarding/7/qr');
    expect(komponente(router)).toEqual([ProjectorLayout, OnboardingQrComponent]);
    http.expectNone('api/onboarding/7');
  });

  it('nepostojeća sesija: poruka i link na grupe, bez preusmerenja', async () => {
    const harness = await RouterTestingHarness.create();
    const gotovo = harness.navigateByUrl('/onboarding/9');
    await vi.waitFor(() => http.expectOne('api/onboarding/9').flush(null, { status: 404, statusText: 'Not Found' }));
    await gotovo;
    harness.detectChanges();
    expect(router.url).toBe('/onboarding/9');
    expect(harness.routeNativeElement?.textContent).toContain('Sesija ne postoji.');
  });
});
