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

  /** `rb`: odgovor na predlog rednog broja (jedan zahtev pri otvaranju, bez obzira na izbor). */
  async function otvori(url = '/predavanja/novo', rb: Strana<PredavanjeListItem> | 'greska' = strana([])) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const z = rbZahtev();
    if (rb === 'greska') {
      z.flush({ reason: 'x' }, { status: 500, statusText: 'Server Error' });
    } else {
      z.flush(rb);
    }
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

  it('predlaže max(rb) + 1 kao server: jedan zahtev pri otvaranju, size=1, sort=rb,desc, bez ikakvih filtera', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/predavanja/novo');
    const z = rbZahtev();
    const p = z.request.params;
    expect(p.get('size')).toBe('1');
    expect(p.get('sort')).toBe('rb,desc');
    expect(p.get('page')).toBe('0');
    for (const k of ['predmetId', 'grupaId', 'godina', 'zavrseno', 'q', 'od', 'do']) {
      expect(p.has(k), k).toBe(false);
    }
    expect(z.request.context.get(LOCAL_ERRORS)).toBe(true);
    z.flush(strana([{ id: 9, rb: 41 }]));
    http.expectOne('api/predmeti').flush([{ id: 1, naziv: 'UPR' }]);
    http.expectOne('api/grupe').flush([{ id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 38 }]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelector('[data-rb]')!.textContent).toContain('Biće predavanje broj 42');
  });

  it('izbor predmeta i grupe ne pravi nove zahteve za predlog', async () => {
    await otvori('/predavanja/novo', strana([{ id: 9, rb: 41 }]));
    await izaberi(1, 4);
    await izaberi(2, 5);
    http.expectNone(r => r.url === 'api/predavanja/pretraga');
    expect(el().querySelector('[data-rb]')!.textContent).toContain('Biće predavanje broj 42');
  });

  it('bez ijednog predavanja predlog je 1', async () => {
    await otvori('/predavanja/novo', strana([]));
    expect(el().querySelector('[data-rb]')!.textContent).toContain('Biće predavanje broj 1');
  });

  it('greška predloga je tiha (bez poruke) i ne sprečava započinjanje', async () => {
    await otvori('/predavanja/novo', 'greska');
    expect(el().querySelector('[data-rb]')).toBeNull();
    expect(el().querySelector('[role=alert]')).toBeNull();
    await izaberi(1, 4);
    await posalji();
    http.expectOne('api/predavanja/start').flush({ id: 77, rb: 1 });
    await harness.fixture.whenStable();
    expect(router.url).toBe('/predavanja/77');
  });

  it('"Započni" šalje predmetId i grupaId i vodi na detalj predavanja', async () => {
    await otvori();
    await izaberi(1, 4);
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
    await posalji();
    await posalji();
    http.expectOne('api/predavanja/start').flush({ id: 77, rb: 1 });
    await harness.fixture.whenStable();
  });

  it('greška servera ide u traku iznad forme, ne u snackbar; dugme se vraća', async () => {
    await otvori();
    await izaberi(1, 4);
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
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelector('[data-predmet]')!.textContent).toContain('Informatika');
    expect(el().querySelector('[data-grupa]')!.textContent).toContain('GD-2025');
  });

  it('neispravan ili nepostojeći predizbor se ignoriše', async () => {
    await otvori('/predavanja/novo?predmet=abc&grupa=999');
    expect(komponenta().forma.controls.predmet).toBeDefined();
    expect(el().querySelector('[data-predmet]')!.textContent).not.toContain('UPR');
  });
});
