import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { routes } from '../../app.routes';
import { NovoPredavanje } from '../predavanja/pages/novo-predavanje';
import { PredavanjaLista } from '../predavanja/pages/predavanja-lista';
import { PredavanjeDetalj } from '../predavanja/pages/predavanje-detalj';
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

  it('predavanja: lista (i sa ?grupa&predmet iz starih linkova) i "Novo" su na novim ekranima (Task 18)', async () => {
    await router.navigateByUrl('/predavanja');
    expect(list(router)).toBe(PredavanjaLista);
    await router.navigateByUrl(AppRoutes.predavanjeGrupaPredmet(1, 2));
    expect(router.url).toBe('/predavanja?grupa=1&predmet=2');
    expect(list(router)).toBe(PredavanjaLista);
    await router.navigateByUrl('/predavanja?grupa=abc&predmet=2');
    expect(list(router)).toBe(PredavanjaLista);
    await router.navigateByUrl('/predavanja/novo');
    expect(list(router)).toBe(NovoPredavanje);
  });

  it('predavanje: detalj je novi ekran (Task 19), i sa starim ?prikaz, bez poziva API-ja pri rutiranju', async () => {
    for (const url of ['/predavanja/5', AppRoutes.predavanjePregled(5), AppRoutes.predavanjeLive(5)]) {
      await router.navigateByUrl(url);
      expect(list(router)).toBe(PredavanjeDetalj);
    }
    http.expectNone(() => true);
  });

  it('test: detalj sa ?prikaz bira stranicu bez poziva API-ja', async () => {
    await router.navigateByUrl(AppRoutes.testPregled(3));
    expect(list(router)).toBe(TestPregledComponent);
    await router.navigateByUrl(AppRoutes.testEvidentiranje(3));
    expect(list(router)).toBe(TestEvidentiranjeComponent);
    http.expectNone(() => true);
  });

  it.each([
    [{ pregledan: true }, TestPregledComponent],
    [{ pregledan: false }, TestEvidentiranjeComponent],
  ])('test: detalj bez ?prikaz bira po stanju (%o)', async (dto, ocekivana) => {
    const gotovo = router.navigateByUrl('/testovi/3');
    await vi.waitFor(() => http.expectOne('api/test/3').flush(dto));
    await gotovo;
    expect(list(router)).toBe(ocekivana);
  });

  it('test: greška pri čitanju stanja otvara evidentiranje (ono samo prikazuje grešku)', async () => {
    const gotovo = router.navigateByUrl('/testovi/3');
    await vi.waitFor(() => http.expectOne('api/test/3').flush(null, { status: 404, statusText: 'Not Found' }));
    await gotovo;
    expect(list(router)).toBe(TestEvidentiranjeComponent);
  });

  it('test: stara stranica na istoj ruti prelazi na drugu (evidentiranje -> pregled -> evidentiranje)', async () => {
    await router.navigateByUrl(AppRoutes.testEvidentiranje(3));
    await router.navigateByUrl(AppRoutes.testPregled(3));
    expect(list(router)).toBe(TestPregledComponent);
    await router.navigateByUrl(AppRoutes.testEvidentiranje(3));
    expect(list(router)).toBe(TestEvidentiranjeComponent);
  });
});
