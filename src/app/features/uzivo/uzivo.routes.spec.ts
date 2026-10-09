import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { routes } from '../../app.routes';
import { NotFound } from '../../core/layout/not-found';
import { ProjectorLayout } from '../../core/layout/projector-layout';
import { PublicLayout } from '../../core/layout/public-layout';
import { Shell } from '../../core/layout/shell';

/** Snimci od korena do lista koji imaju komponentu (komponente se ne prave: nema outleta). */
function lanac(router: Router): ActivatedRouteSnapshot[] {
  const rez: ActivatedRouteSnapshot[] = [];
  for (let s: ActivatedRouteSnapshot | null = router.routerState.snapshot.root; s; s = s.firstChild) {
    if (s.component) {
      rez.push(s);
    }
  }
  return rez;
}

const komponente = (router: Router) => lanac(router).map(s => s.component);
const list = (router: Router) => lanac(router).at(-1)!;

/**
 * Uživo rute posle redizajna: iste putanje kao pre (QR kodovi i linkovi su već podeljeni), ali nastavnički ekrani su u
 * ljusci, publika i konzola u projektorskom layoutu, studentske strane u javnom (bez ljuske, koja zove zaključan API).
 */
describe('uživo rute', () => {
  let router: Router;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpTestingController);
  });

  async function idi(url: string): Promise<string> {
    await router.navigateByUrl(url);
    return router.url;
  }

  it.each(['/prezentacije', '/prezentacije?predmet=2', '/prezentacije/3', '/prezentacije/3/izvodjenja', '/izvodjenja/7/pregled'])(
    '%s je u ljusci',
    async url => {
      expect(await idi(url)).toBe(url);
      const k = komponente(router);
      expect(k[0]).toBe(Shell);
      expect(k).not.toContain(NotFound);
    },
  );

  it('editor i lista izvođenja dobijaju id iz putanje', async () => {
    await idi('/prezentacije/3');
    expect(list(router).paramMap.get('id')).toBe('3');
    await idi('/prezentacije/3/izvodjenja');
    expect(list(router).paramMap.get('id')).toBe('3');
    await idi('/izvodjenja/7/pregled');
    expect(list(router).paramMap.get('id')).toBe('7');
  });

  it.each(['/izvodjenja/7/publika', '/izvodjenja/7/konzola', '/izvodjenja/7/konzola?telefon=1'])(
    '%s je u projektorskom layoutu (cela strana), bez ljuske',
    async url => {
      expect(await idi(url)).toBe(url);
      const l = lanac(router);
      expect(l[0].component).toBe(ProjectorLayout);
      expect(l[0].data['celaStrana']).toBe(true);
      expect(l.map(s => s.component)).not.toContain(Shell);
      expect(list(router).paramMap.get('id')).toBe('7');
    },
  );

  it.each(['/uzivo', '/uzivo/123456'])('%s je u javnom layoutu (cela strana), bez ljuske', async url => {
    expect(await idi(url)).toBe(url);
    const l = lanac(router);
    expect(l[0].component).toBe(PublicLayout);
    expect(l[0].data['celaStrana']).toBe(true);
    expect(l.map(s => s.component)).not.toContain(Shell);
    expect(l.map(s => s.component)).not.toContain(NotFound);
    http.expectNone(() => true);
  });

  it('kod studenta stiže kao parametar `kod`', async () => {
    await idi('/uzivo/123456');
    expect(list(router).paramMap.get('kod')).toBe('123456');
  });

  it('pogrešna putanja pod /uzivo ostaje u javnom layoutu (404 bez ljuske)', async () => {
    await idi('/uzivo/123456/visak');
    expect(komponente(router)).toEqual([PublicLayout, NotFound]);
    expect(list(router).data['javna']).toBe(true);
  });

  it.each(['/izvodjenja/abc/konzola', '/izvodjenja/7/konzola2', '/izvodjenja/0/publika', '/prezentacije/abc', '/uzivo-test',
    '/izvodjenja/7/publika/visak', '/izvodjenja/7'])(
    '%s -> 404 u ljusci, bez poziva API-ja',
    async url => {
      await idi(url);
      expect(komponente(router)).toEqual([Shell, NotFound]);
      http.expectNone(() => true);
    },
  );
});
