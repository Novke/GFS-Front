import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { Strana } from '../../../shared/models/strana';
import { PredavanjeListItem } from '../data-access/predavanja.models';
import { NovoPredavanje } from './novo-predavanje';

@Component({ template: 'detalj' })
class Stub {}

function strana(content: Partial<PredavanjeListItem>[]): Strana<PredavanjeListItem> {
  return { content: content as PredavanjeListItem[], page: { size: 1, number: 0, totalElements: content.length, totalPages: content.length } };
}

describe('NovoPredavanje', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'predavanja/novo', component: NovoPredavanje },
            { path: 'predavanja/:id', component: Stub },
          ],
          withComponentInputBinding(), // kao u app.config: ?predmet=&grupa= postaju ulazi komponente
        ),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  const el = () => harness.fixture.nativeElement as HTMLElement;
  const rbZahtev = () => http.expectOne(r => r.url === 'api/predavanja/pretraga');

  async function otvori(url = '/predavanja/novo') {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    http.expectOne('api/predmeti').flush([{ id: 1, naziv: 'UPR' }, { id: 2, naziv: 'Informatika' }]);
    http.expectOne('api/grupe').flush([{ id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 38 }, { id: 5, naziv: 'AR-2025', godinaUpisa: 2025, brojStudenata: 20 }]);
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  const posalji = async () => {
    el().querySelector<HTMLButtonElement>('button[data-zapocni]')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
  };

  const komponenta = () => harness.routeDebugElement!.componentInstance as unknown as {
    forma: { controls: { predmet: { setValue(v: number | null): void }; grupa: { setValue(v: number | null): void } } };
  };

  async function izaberi(predmet: number, grupa: number) {
    komponenta().forma.controls.predmet.setValue(predmet);
    komponenta().forma.controls.grupa.setValue(grupa);
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  it('bez predmeta i grupe ne šalje zahtev i prikazuje poruke "obavezno"', async () => {
    await otvori();
    await posalji();
    http.expectNone('api/predavanja/start');
    expect(el().textContent).toContain('Predmet je obavezno.');
    expect(el().textContent).toContain('Grupa je obavezno.');
  });

  it('samo predmet bez grupe: ne šalje', async () => {
    await otvori();
    komponenta().forma.controls.predmet.setValue(1);
    await posalji();
    http.expectNone('api/predavanja/start');
    expect(el().textContent).toContain('Grupa je obavezno.');
  });

  it('predlaže sledeći redni broj iz poslednjeg predavanja za par (size=1, sort=rb,desc)', async () => {
    await otvori();
    await izaberi(1, 4);
    const z = rbZahtev();
    expect(z.request.params.get('predmetId')).toBe('1');
    expect(z.request.params.get('grupaId')).toBe('4');
    expect(z.request.params.get('size')).toBe('1');
    expect(z.request.params.get('sort')).toBe('rb,desc');
    expect(z.request.params.has('godina')).toBe(false);
    expect(z.request.context.get(LOCAL_ERRORS)).toBe(true);
    z.flush(strana([{ id: 9, rb: 11 }]));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelector('[data-rb]')!.textContent).toContain('Biće predavanje broj 12');
  });

  it('par bez predavanja počinje od 1; greška predloga je tiha i ne sprečava započinjanje', async () => {
    await otvori();
    await izaberi(1, 4);
    rbZahtev().flush(strana([]));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelector('[data-rb]')!.textContent).toContain('Biće predavanje broj 1');

    await izaberi(2, 5);
    rbZahtev().flush({ reason: 'x' }, { status: 500, statusText: 'Server Error' });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelector('[data-rb]')).toBeNull();
    expect(el().querySelector('[role=alert]')).toBeNull();
  });

  it('"Započni" šalje predmetId i grupaId i vodi na detalj predavanja', async () => {
    await otvori();
    await izaberi(1, 4);
    rbZahtev().flush(strana([]));
    await posalji();
    const z = http.expectOne('api/predavanja/start');
    expect(z.request.body).toEqual({ predmetId: 1, grupaId: 4 });
    expect(z.request.context.get(LOCAL_ERRORS)).toBe(true);
    z.flush({ id: 77, rb: 1 });
    await harness.fixture.whenStable();
    expect(router.url).toBe('/predavanja/77');
  });

  it('dvostruki klik ne šalje dva zahteva (dugme je onemogućeno dok zahtev traje)', async () => {
    await otvori();
    await izaberi(1, 4);
    rbZahtev().flush(strana([]));
    await posalji();
    await posalji();
    http.expectOne('api/predavanja/start').flush({ id: 77, rb: 1 });
    await harness.fixture.whenStable();
  });

  it('greška servera ide u traku iznad forme, ne u snackbar; dugme se vraća', async () => {
    await otvori();
    await izaberi(1, 4);
    rbZahtev().flush(strana([]));
    await posalji();
    http.expectOne('api/predavanja/start').flush({ reason: 'Grupa nije pronadjena! ID = 4' }, { status: 404, statusText: 'Not Found' });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelector('app-form-error-banner [role=alert]')!.textContent).toContain('Grupa nije pronadjena! ID = 4');
    expect(el().querySelector<HTMLButtonElement>('button[data-zapocni]')!.disabled).toBe(false);
    expect(router.url).toBe('/predavanja/novo');
  });

  it('predizbor iz linka (?predmet=&grupa=) samo za postojeće stavke; smeće se ignoriše', async () => {
    await otvori('/predavanja/novo?predmet=2&grupa=4');
    const z = rbZahtev();
    expect(z.request.params.get('predmetId')).toBe('2');
    z.flush(strana([]));
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelector('[data-predmet]')!.textContent).toContain('Informatika');
    expect(el().querySelector('[data-grupa]')!.textContent).toContain('GD-2025');
  });

  it('neispravan ili nepostojeći predizbor se ignoriše', async () => {
    await otvori('/predavanja/novo?predmet=abc&grupa=999');
    http.expectNone(r => r.url === 'api/predavanja/pretraga');
    expect(komponenta().forma.controls.predmet).toBeDefined();
    expect(el().querySelector('[data-predmet]')!.textContent).not.toContain('UPR');
  });
});
