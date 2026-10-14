import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { IKONE } from '../../../core/layout/icons';
import { NotificationStore, Poruka } from '../../../core/state/notification.store';
import { unsavedChangesGuard } from '../../../shared/forms/unsaved-changes.guard';
import { NoviDomaci } from './novi-domaci';

@Component({ template: 'detalj' })
class Stub {}

const PREDAVANJA = {
  content: [
    { id: 12, rb: 7, datum: '2025-10-14', tema: 'Petlje', zavrseno: true, predmet: { id: 1, naziv: 'UPR' }, grupa: null, brojPrisutnih: 0, brojStarijihPrisutnih: 0, brojStudenata: 0 },
    { id: 11, rb: 6, datum: '2025-10-07', tema: null, zavrseno: true, predmet: { id: 1, naziv: 'UPR' }, grupa: null, brojPrisutnih: 0, brojStarijihPrisutnih: 0, brojStudenata: 0 },
  ],
  page: { size: 100, number: 0, totalElements: 2, totalPages: 1 },
};

describe('NoviDomaci', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;
  let poruke: Poruka[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'domaci/novo', component: NoviDomaci, canDeactivate: [unsavedChangesGuard] },
            { path: 'domaci/:id', component: Stub },
          ],
          withComponentInputBinding(),
        ),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe(p => poruke.push(p));
    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    for (const ime of IKONE) {
      registry.addSvgIconLiteral(ime, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
    }
  });

  afterEach(() => http.verify());

  const el = () => harness.fixture.nativeElement as HTMLElement;
  const stabilno = async () => {
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  const komponenta = () => harness.routeDebugElement!.componentInstance as unknown as {
    forma: { controls: Record<'predmet' | 'grupa' | 'predavanje' | 'naslov' | 'opis', { setValue(v: unknown): void; markAsDirty(): void }>; value: Record<string, unknown> };
  };

  const BEZ_PREDAVANJA = { content: [], page: { size: 100, number: 0, totalElements: 0, totalPages: 0 } };

  /** `predavanja`: odgovor na učitavanje predavanja izabranog para (ako je par izabran iz linka); `null` = ne očekuje se zahtev. */
  async function otvori(url = '/domaci/novo', predavanja: object | null = null) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    http.expectOne('api/predmeti').flush([{ id: 1, naziv: 'UPR' }, { id: 2, naziv: 'Informatika' }]);
    http.expectOne('api/grupe').flush([{ id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 38 }]);
    harness.detectChanges();
    await Promise.resolve();
    TestBed.tick();
    if (predavanja !== null) {
      predavanjaZahtev().flush(predavanja);
    }
    await stabilno();
  }

  const predavanjaZahtev = () => http.expectOne(r => r.url === 'api/predavanja/pretraga');

  it('predizbor iz linka učitava predavanja izabranog para i bira predavanje iz linka', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/domaci/novo?predmet=1&grupa=4&predavanje=12');
    http.expectOne('api/predmeti').flush([{ id: 1, naziv: 'UPR' }]);
    http.expectOne('api/grupe').flush([{ id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 38 }]);
    harness.detectChanges();
    await Promise.resolve();
    TestBed.tick();
    const z = predavanjaZahtev();
    expect(z.request.params.get('predmetId')).toBe('1');
    expect(z.request.params.get('grupaId')).toBe('4');
    expect(z.request.params.get('size')).toBe('100');
    expect(z.request.context.get(LOCAL_ERRORS)).toBe(true);
    z.flush(PREDAVANJA);
    await stabilno();
    expect(komponenta().forma.value['predavanje']).toBe(12);
  });

  it('bez predmeta i grupe ne traži predavanja; neispravan predizbor se ignoriše', async () => {
    await otvori('/domaci/novo?predmet=abc&grupa=99');
    http.expectNone(r => r.url === 'api/predavanja/pretraga');
    expect(komponenta().forma.value['predmet']).toBeNull();
    expect(komponenta().forma.value['grupa']).toBeNull();
  });

  it('bez izabranog para submit ne šalje zahtev', async () => {
    await otvori();
    el().querySelector<HTMLButtonElement>('button[data-zadaj]')!.click();
    await stabilno();
    http.expectNone(r => r.url === 'api/domaci');
    expect(el().textContent).toContain('Predmet je obavezno.');
  });

  it('samo predmet i grupa: jedan POST bez predavanja, pa detalj', async () => {
    await otvori('/domaci/novo?predmet=1&grupa=4', BEZ_PREDAVANJA);
    el().querySelector<HTMLButtonElement>('button[data-zadaj]')!.click();
    const post = http.expectOne('api/domaci');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ predmetId: 1, grupaId: 4, predavanjeId: null });
    expect(post.request.context.get(LOCAL_ERRORS)).toBe(true);
    post.flush({ id: 21 });
    await stabilno();
    expect(router.url).toBe('/domaci/21');
  });

  it('naslov i opis idu naknadno kroz PUT; ako PUT ne uspe, domaći ipak postoji (detalj + poruka)', async () => {
    await otvori('/domaci/novo?predmet=1&grupa=4&predavanje=12', PREDAVANJA);
    komponenta().forma.controls.naslov.setValue('Domaći 4');
    komponenta().forma.controls.opis.setValue('Rekurzija');
    el().querySelector<HTMLButtonElement>('button[data-zadaj]')!.click();
    const post = http.expectOne('api/domaci');
    expect(post.request.body).toEqual({ predmetId: 1, grupaId: 4, predavanjeId: 12 });
    post.flush({ id: 22 });
    const put = http.expectOne('api/domaci/22');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toMatchObject({ naslov: 'Domaći 4', text: 'Rekurzija' });
    put.flush({ reason: 'x' }, { status: 500, statusText: 'Server Error' });
    await stabilno();
    expect(router.url).toBe('/domaci/22');
    expect(poruke[0]).toMatchObject({ tip: 'greska' });
    expect(poruke[0].tekst).toContain('Domaći je napravljen, ali naslov, opis i datum nisu sačuvani');
  });

  it('greška POST-a ostaje u formi u traci greške', async () => {
    await otvori('/domaci/novo?predmet=1&grupa=4', BEZ_PREDAVANJA);
    el().querySelector<HTMLButtonElement>('button[data-zadaj]')!.click();
    http.expectOne('api/domaci').flush({ reason: 'Grupa ne postoji! ID = 4' }, { status: 404, statusText: 'Not Found' });
    await stabilno();
    expect(el().querySelector('[role="alert"]')!.textContent).toContain('Grupa ne postoji! ID = 4');
    expect(router.url).toBe('/domaci/novo?predmet=1&grupa=4');
  });
});
