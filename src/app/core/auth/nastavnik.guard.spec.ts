import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { nastavnikGuard } from './nastavnik.guard';
import { SesijaStore } from './sesija.store';

@Component({ template: '' })
class Prazna {}

describe('nastavnikGuard', () => {
  let proveri: ReturnType<typeof vi.fn>;
  let router: Router;

  beforeEach(() => {
    proveri = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'prijava', component: Prazna },
          { path: '', canMatch: [nastavnikGuard], children: [
            { path: '', pathMatch: 'full', component: Prazna },
            { path: 'predavanja', component: Prazna },
            { path: 'testovi', component: Prazna },
          ] },
        ]),
        { provide: SesijaStore, useValue: { proveri } },
      ],
    });
    router = TestBed.inject(Router);
  });

  it('prijavljen: ruta se otvara', async () => {
    proveri.mockResolvedValue(true);
    expect(await router.navigateByUrl('/predavanja')).toBe(true);
    expect(router.url).toBe('/predavanja');
  });

  it('odjavljen: UrlTree na /prijava sa nazad = tražena putanja (sa query-jem, bez vodeće /)', async () => {
    proveri.mockResolvedValue(false);
    await router.navigateByUrl('/predavanja?grupa=1&predmet=2');
    const stablo = router.parseUrl(router.url);
    expect(stablo.root.children['primary'].segments.map(s => s.path)).toEqual(['prijava']);
    expect(stablo.queryParams).toEqual({ nazad: 'predavanja?grupa=1&predmet=2' });
  });

  it('odjavljen: zarez iz sorta je kodiran, pa nazad prolazi proveru na stranici prijave', async () => {
    proveri.mockResolvedValue(false);
    await router.navigateByUrl('/testovi?sort=datum,desc');
    expect(router.parseUrl(router.url).queryParams).toEqual({ nazad: 'testovi?sort=datum%2Cdesc' });
  });

  it('odjavljen na početnoj: /prijava bez nazad', async () => {
    proveri.mockResolvedValue(false);
    await router.navigateByUrl('/');
    expect(router.url).toBe('/prijava');
  });
});
