import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { NOV_TIP, NoviTest } from './novi-test';

@Component({ template: 'detalj' })
class Stub {}

interface Forma {
  controls: Record<'predmet' | 'grupa' | 'tip' | 'maxPoena' | 'brojGrupa', { setValue(v: unknown): void }> & {
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
    expect(req.request.body).toMatchObject({ tipTestaId: 2, predmetId: 1, grupaId: 4, brojGrupa: 2, maxPoena: 30 });
    expect(req.request.body.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    req.flush({ id: 77 });
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/testovi/77');
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
    http.expectOne('api/test').flush({ reason: 'Grupa ne postoji!' }, { status: 404, statusText: 'Not Found' });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelector('[role=alert]')?.textContent).toContain('Grupa ne postoji!');

    await posalji();
    http.expectNone('api/test/tip');
    expect(http.expectOne('api/test').request.body.tipTestaId).toBe(8);
  });
});
