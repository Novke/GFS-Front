import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { BreadcrumbService, Mrvica } from './breadcrumbs';

@Component({ template: '', changeDetection: ChangeDetectionStrategy.OnPush })
class Prazna {}

describe('BreadcrumbService', () => {
  let router: Router;
  let svc: BreadcrumbService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'testovi',
            data: { mrvice: () => [{ label: 'Nastava' }, { label: 'Testovi' }] satisfies Mrvica[] },
            children: [
              { path: '', component: Prazna },
              {
                path: ':id/statistika',
                component: Prazna,
                data: { mrvice: (p: Record<string, string>) => [{ label: 'Test', url: `/testovi/${p['id']}` }, { label: 'Statistika' }] },
              },
            ],
          },
          { path: 'bez', component: Prazna },
        ]),
      ],
    });
    router = TestBed.inject(Router);
    svc = TestBed.inject(BreadcrumbService);
  });

  it('uzima mrvice najdublje rute; prazna child ruta nasleđuje roditeljeve', async () => {
    await router.navigateByUrl('/testovi');
    expect(svc.mrvice()).toEqual([{ label: 'Nastava' }, { label: 'Testovi' }]);
  });

  it('prosleđuje parametre rute', async () => {
    await router.navigateByUrl('/testovi/7/statistika');
    expect(svc.mrvice()).toEqual([{ label: 'Test', url: '/testovi/7' }, { label: 'Statistika' }]);
  });

  it('postavi() menja labelu poslednje mrvice do sledeće navigacije', async () => {
    await router.navigateByUrl('/testovi/7/statistika');
    svc.postavi('Kolokvijum 1');
    expect(svc.mrvice().at(-1)).toEqual({ label: 'Kolokvijum 1' });
    expect(svc.mrvice()[0]).toEqual({ label: 'Test', url: '/testovi/7' });
    await router.navigateByUrl('/testovi');
    expect(svc.mrvice().at(-1)).toEqual({ label: 'Testovi' });
  });

  it('postavi(labela, prethodna) menja i pretposlednju mrvicu, zadržava njen link, i važi do sledeće navigacije', async () => {
    await router.navigateByUrl('/testovi/7/statistika');
    svc.postavi('Statistika kolokvijuma', 'Kolokvijum 1');
    expect(svc.mrvice()).toEqual([{ label: 'Kolokvijum 1', url: '/testovi/7' }, { label: 'Statistika kolokvijuma' }]);
    await router.navigateByUrl('/testovi/8/statistika');
    expect(svc.mrvice()).toEqual([{ label: 'Test', url: '/testovi/8' }, { label: 'Statistika' }]);
  });

  it('ruta bez mrvica daje praznu listu', async () => {
    await router.navigateByUrl('/bez');
    expect(svc.mrvice()).toEqual([]);
  });
});
