import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { routes } from '../../app.routes';
import { LivePredavanjeComponent } from '../../predavanje/live-predavanje/live-predavanje.component';
import { PredavanjeListComponent } from '../../predavanje/predavanje-list/predavanje-list.component';
import { PredavanjeSelectComponent } from '../../predavanje/predavanje-select/predavanje-select.component';
import { PregledPredavanjaComponent } from '../../predavanje/pregled-predavanja/pregled-predavanja.component';
import { TestEvidentiranjeComponent } from '../../test/test-evidentiranje/test-evidentiranje.component';
import { TestPregledComponent } from '../../test/test-pregled/test-pregled.component';
import { AppRoutes } from './app-putanje';

function list(router: Router): unknown {
  let s: ActivatedRouteSnapshot = router.routerState.snapshot.root;
  while (s.firstChild) {
    s = s.firstChild;
  }
  return s.component;
}

describe('privremeni izbor starih ekrana na novim rutama', () => {
  let router: Router;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()] });
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpTestingController);
  });

  it('lista: bez ?grupa&predmet stari izbor, sa njima stara lista', async () => {
    await router.navigateByUrl('/predavanja');
    expect(list(router)).toBe(PredavanjeSelectComponent);
    await router.navigateByUrl(AppRoutes.predavanjeGrupaPredmet(1, 2));
    expect(router.url).toBe('/predavanja?grupa=1&predmet=2');
    expect(list(router)).toBe(PredavanjeListComponent);
    await router.navigateByUrl('/predavanja?grupa=abc&predmet=2');
    expect(list(router)).toBe(PredavanjeSelectComponent);
  });

  it('detalj sa ?prikaz bira stranicu bez poziva API-ja', async () => {
    await router.navigateByUrl(AppRoutes.predavanjePregled(5));
    expect(list(router)).toBe(PregledPredavanjaComponent);
    await router.navigateByUrl(AppRoutes.predavanjeLive(5));
    expect(list(router)).toBe(LivePredavanjeComponent);
    await router.navigateByUrl(AppRoutes.testPregled(3));
    expect(list(router)).toBe(TestPregledComponent);
    await router.navigateByUrl(AppRoutes.testEvidentiranje(3));
    expect(list(router)).toBe(TestEvidentiranjeComponent);
    http.expectNone(() => true);
  });

  it.each([
    [{ zavrseno: true }, PregledPredavanjaComponent],
    [{ zavrseno: false }, LivePredavanjeComponent],
  ])('detalj bez ?prikaz bira po stanju (%o)', async (dto, ocekivana) => {
    const gotovo = router.navigateByUrl('/predavanja/5');
    await vi.waitFor(() => http.expectOne('api/predavanja/5').flush(dto));
    await gotovo;
    expect(list(router)).toBe(ocekivana);
  });

  it('greška pri čitanju stanja otvara beleženje (ono samo prikazuje grešku)', async () => {
    const gotovo = router.navigateByUrl('/predavanja/5');
    await vi.waitFor(() => http.expectOne('api/predavanja/5').flush(null, { status: 404, statusText: 'Not Found' }));
    await gotovo;
    expect(list(router)).toBe(LivePredavanjeComponent);
  });

  it('stara stranica na istoj ruti prelazi na drugu (Završi -> pregled, Nastavi -> beleženje)', async () => {
    await router.navigateByUrl(AppRoutes.predavanjeLive(5));
    await router.navigateByUrl(AppRoutes.predavanjePregled(5));
    expect(list(router)).toBe(PregledPredavanjaComponent);
    await router.navigateByUrl(AppRoutes.predavanjeLive(5));
    expect(list(router)).toBe(LivePredavanjeComponent);
  });
});
