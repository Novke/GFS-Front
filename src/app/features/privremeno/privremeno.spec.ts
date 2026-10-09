import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { routes } from '../../app.routes';
import { NovoPredavanje } from '../predavanja/pages/novo-predavanje';
import { PredavanjaLista } from '../predavanja/pages/predavanja-lista';
import { PredavanjeDetalj } from '../predavanja/pages/predavanje-detalj';
import { NoviTest } from '../testovi/pages/novi-test';
import { TestDetalj } from '../testovi/pages/test-detalj';
import { TestStatistika } from '../testovi/pages/test-statistika';
import { TestoviLista } from '../testovi/pages/testovi-lista';
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

  it('testovi: lista (i sa ?grupa&predmet iz starih linkova), "Nov test", detalj i statistika su novi ekrani (Task 21)', async () => {
    await router.navigateByUrl(AppRoutes.testGrupaPredmet(1, 2));
    expect(router.url).toBe('/testovi?grupa=1&predmet=2');
    expect(list(router)).toBe(TestoviLista);
    await router.navigateByUrl('/testovi/novo');
    expect(list(router)).toBe(NoviTest);
    for (const url of ['/testovi/3', AppRoutes.testPregled(3), AppRoutes.testEvidentiranje(3)]) {
      await router.navigateByUrl(url);
      expect(list(router)).toBe(TestDetalj);
    }
    await router.navigateByUrl('/testovi/3/statistika');
    expect(list(router)).toBe(TestStatistika);
    http.expectNone(() => true); // rutiranje više ne čita stanje testa (stari `testPregledan`)
  });
});
