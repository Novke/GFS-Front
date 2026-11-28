import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { NOV_TIP, NoviTest } from './novi-test';

@Component({ template: 'detalj' })
class Stub {}

interface Forma {
  controls: Record<'predmet' | 'grupa' | 'tip' | 'maxPoena' | 'brojGrupa' | 'pragProlaza', { setValue(v: unknown): void }> & {
    novTip: { setValue(v: string): void };
  };
}

describe('NoviTest', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'testovi/novo', component: NoviTest },
            { path: 'testovi/:id', component: Stub },
          ],
          withComponentInputBinding(),
        ),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const el = () => harness.fixture.nativeElement as HTMLElement;
  const forma = () => (harness.routeDebugElement!.componentInstance as unknown as { forma: Forma }).forma;

  async function otvori(url = '/testovi/novo?predmet=1&grupa=4') {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    http.expectOne('api/predmeti').flush([{ id: 1, naziv: 'UPR' }]);
    http.expectOne('api/grupe').flush([{ id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 30 }]);
    harness.detectChanges();
    await harness.fixture.whenStable();
    http.expectOne('api/predmeti/1/tipovi').flush([{ id: 2, naziv: 'Kolokvijum 1', aktivan: true }]);
    harness.detectChanges();
  }

  async function posalji() {
    el().querySelector<HTMLButtonElement>('button[data-sacuvaj]')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  it('postojeći tip: POST test sa varijantama i max poena, pa na detalj', async () => {
    await otvori();
    forma().controls.tip.setValue(2);
    forma().controls.brojGrupa.setValue(2);
    forma().controls.maxPoena.setValue(30);
    await posalji();
    const req = http.expectOne('api/test');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    expect(req.request.body).toMatchObject({ tipTestaId: 2, predmetId: 1, grupaId: 4, brojGrupa: 2, maxPoena: 30, pragProlaza: null });
    expect(req.request.body.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    req.flush({ id: 77 });
    // zoneless: obećanja i navigacija nisu praćeni u whenStable, pa se čeka ishod
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/testovi/77'));
  });

  it('max poena preko 100 ili 0 se ne šalje', async () => {
    await otvori();
    forma().controls.tip.setValue(2);
    forma().controls.maxPoena.setValue(101);
    await posalji();
    expect(el().textContent).toContain('Najviše 100.');
    forma().controls.maxPoena.setValue(0);
    await posalji();
    expect(el().textContent).toContain('Najmanje 1.');
    http.expectNone('api/test');
  });

  it('nov tip se pravi prvo; ako test ne uspe, ponovni pokušaj ne pravi tip ponovo', async () => {
    await otvori();
    forma().controls.tip.setValue(NOV_TIP);
    harness.detectChanges();
    forma().controls.novTip.setValue('Kolokvijum 2');
    forma().controls.maxPoena.setValue(20);
    await posalji();
    const tip = http.expectOne('api/test/tip');
    expect(tip.request.body).toEqual({ naziv: 'Kolokvijum 2', predmetId: 1 });
    tip.flush({ id: 8, naziv: 'Kolokvijum 2', aktivan: true });
    await harness.fixture.whenStable();
    http.expectOne('api/predmeti/1/tipovi').flush([]); // invalidacija keša tipova
    (await vi.waitFor(() => http.expectOne('api/test'))).flush({ reason: 'Grupa ne postoji!' }, { status: 404, statusText: 'Not Found' });
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(el().querySelector('[role=alert]')).not.toBeNull();
    });
    expect(el().querySelector('[role=alert]')?.textContent).toContain('Grupa ne postoji!');

    await posalji();
    http.expectNone('api/test/tip');
    expect(http.expectOne('api/test').request.body.tipTestaId).toBe(8);
  });

  it('prag prolaza: iznad max se ne šalje; greška servera za prag ide ispod polja praga', async () => {
    await otvori();
    forma().controls.tip.setValue(2);
    forma().controls.maxPoena.setValue(20);
    forma().controls.pragProlaza.setValue(25);
    await posalji();
    http.expectNone('api/test');
    expect(el().querySelector('mat-error')?.textContent).toContain('Prag prolaza mora biti između 0 i maksimalnog broja poena.');
    forma().controls.pragProlaza.setValue(11);
    await posalji();
    const req = http.expectOne('api/test');
    expect(req.request.body.pragProlaza).toBe(11);
    req.flush({ reason: 'Prag prolaza mora biti između 0 i maksimalnog broja poena.' }, { status: 400, statusText: 'Bad Request' });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelector('[role=alert]')).toBeNull(); // ne u traci iznad forme
    expect(el().querySelector('mat-error')?.textContent).toContain('Prag prolaza mora biti između 0 i maksimalnog broja poena.');
  });

  it('greška praga iznad max nestaje kad se max poveća', async () => {
    await otvori();
    forma().controls.tip.setValue(2);
    forma().controls.maxPoena.setValue(20);
    forma().controls.pragProlaza.setValue(25);
    await posalji();
    http.expectNone('api/test');
    expect(el().querySelector('mat-error')?.textContent).toContain('Prag prolaza mora biti između 0');
    forma().controls.maxPoena.setValue(30);
    harness.detectChanges();
    expect(el().querySelector('mat-error')).toBeNull();
    await posalji();
    expect(http.expectOne('api/test').request.body).toMatchObject({ maxPoena: 30, pragProlaza: 25 });
  });

  it('online: šablon tipa se bira sam, grupa čekirana, stariji nisu; Generiši šalje izabrane i vodi na test', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/testovi/novo?predmet=1&grupa=4&nacin=online');
    http.expectOne('api/predmeti').flush([{ id: 1, naziv: 'UPR' }]);
    http.expectOne('api/grupe').flush([{ id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 30 }]);
    harness.detectChanges();
    await harness.fixture.whenStable();
    http.expectOne('api/predmeti/1/tipovi').flush([{ id: 2, naziv: 'Kolokvijum 1', aktivan: true }]);
    http.expectOne(r => r.url === 'api/sabloni-testa' && r.params.get('predmetId') === '1').flush([
      { id: 8, predmetId: 1, tipTestaId: null, tipTesta: null, naziv: 'Stari', trajanjeMin: 30, rezim: 'POJEDINACNO', brojGrupa: 1,
        maxPoena: 10, brojStavki: 1, arhiviran: false, izmenjeno: '2026-10-01T10:00:00' },
      { id: 9, predmetId: 1, tipTestaId: 2, tipTesta: 'Kolokvijum 1', naziv: 'K1 online', trajanjeMin: 60, rezim: 'GRUPE', brojGrupa: 3,
        maxPoena: 30, brojStavki: 4, arhiviran: false, izmenjeno: '2026-11-20T10:00:00' },
    ]);
    http.expectOne(r => r.url === 'api/test/online/kandidati-studenti' && r.params.get('grupaId') === '4').flush({
      grupa: [{ id: 11, ime: 'Ana', prezime: 'Anić', indeks: 'GD1', godina: 2025, stariji: false }],
      stariji: [{ id: 12, ime: 'Bora', prezime: 'Borić', indeks: 'GD7', godina: 2024, stariji: true }],
    });
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelector('[data-online-forma]')).not.toBeNull();
    expect(el().querySelector('[data-sacuvaj]')).toBeNull();
    expect(el().querySelector<HTMLSelectElement>('[data-o-sablon]')!.value).toBe('9');
    expect(el().querySelector<HTMLInputElement>('[data-o-trajanje]')!.value).toBe('60');
    expect(el().textContent).toContain('Studenti (1)');
    expect(el().textContent).toContain('stariji');

    el().querySelector<HTMLButtonElement>('button[data-generisi]')!.click();
    harness.detectChanges();
    const req = http.expectOne('api/test/online');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    expect(req.request.body).toMatchObject({ sablonId: 9, grupaId: 4, tipTestaId: 2, trajanjeMin: 60, rezim: 'GRUPE', brojGrupa: 3, studentIds: [11] });
    req.flush({ testId: 90 });
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/testovi/90'));
  });
});
