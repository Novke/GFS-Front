import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { Strana } from '../../../shared/models/strana';
import { TestListItem } from '../data-access/testovi.models';
import { TestoviLista } from './testovi-lista';

const red: TestListItem = {
  id: 3,
  datum: '2025-10-16',
  tipTesta: { id: 2, naziv: 'Kolokvijum 1', aktivan: true },
  maxPoena: 30,
  pregledan: false,
  predmet: { id: 1, naziv: 'UPR' },
  grupa: { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 30 },
  brojPolaganja: 12,
  prosek: 18.456,
  procenatProlaznosti: 66.6667,
};

const bezPolaganja: TestListItem = { ...red, id: 4, datum: null, grupa: null, brojPolaganja: 0, prosek: null, procenatProlaznosti: null, pregledan: null };

const strana = (content: TestListItem[]): Strana<TestListItem> => ({
  content,
  page: { size: 25, number: 0, totalElements: content.length, totalPages: 1 },
});

describe('TestoviLista', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'testovi', component: TestoviLista }]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('šalje predmetId, grupaId, tipTestaId, pregledan, godinu i datume; prikazuje redove (bez podataka "—")', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/testovi?predmet=1&grupa=4&tip=2&status=za-evidentiranje&godina=2025&od=2025-10-01&do=2025-10-31&sort=maxPoena,asc');
    const req = http.expectOne(r => r.url === 'api/test/pretraga');
    const p = req.request.params;
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    expect([p.get('predmetId'), p.get('grupaId'), p.get('tipTestaId'), p.get('pregledan'), p.get('godina')]).toEqual(['1', '4', '2', 'false', '2025']);
    expect([p.get('od'), p.get('do'), p.get('sort'), p.get('page'), p.get('size')]).toEqual(['2025-10-01', '2025-10-31', 'maxPoena,asc', '0', '25']);
    expect(p.has('status')).toBe(false);
    req.flush(strana([red, bezPolaganja]));
    harness.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    const redovi = el.querySelectorAll('tbody tr');
    expect(redovi).toHaveLength(2);
    expect(redovi[0].textContent).toContain('Kolokvijum 1');
    expect(redovi[0].textContent).toContain('18,46 / 30');
    expect(redovi[0].textContent).toContain('67 %');
    expect(redovi[0].textContent).toContain('Za evidentiranje');
    expect(redovi[0].querySelector('.c-meta')?.textContent).toContain('prolaz 67 %');
    expect(redovi[1].textContent).toContain('—');
    // zaglavlje koje sortira po max poena se tako i zove (prosek nije sortabilan)
    expect(el.querySelector('th[aria-sort="ascending"] [data-sort="maxPoena"]')?.textContent).toContain('Max');
    expect(el.textContent).toContain('2 testa');
  });

  it('status "evidentiran" -> pregledan=true; nepoznat status je bez filtera', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/testovi?status=evidentiran');
    expect(http.expectOne(r => r.url === 'api/test/pretraga').request.params.get('pregledan')).toBe('true');
    await harness.navigateByUrl('/testovi?status=lozinka');
    expect(http.expectOne(r => r.url === 'api/test/pretraga').request.params.has('pregledan')).toBe(false);
  });
});
