import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Strana } from '../../../shared/models/strana';
import { PredavanjeListItem } from '../data-access/predavanja.models';
import { brojPredavanja, PredavanjaLista } from './predavanja-lista';

@Component({ template: 'detalj' })
class Stub {}

function predavanje(id: number, izmene: Partial<PredavanjeListItem> = {}): PredavanjeListItem {
  return {
    id,
    rb: id,
    datum: '2025-10-14',
    tema: `Tema ${id}`,
    zavrseno: true,
    predmet: { id: 1, naziv: 'UPR' },
    grupa: { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 38 },
    brojPrisutnih: 30,
    brojStarijihPrisutnih: 0,
    brojStudenata: 38,
    ...izmene,
  };
}

function strana(content: PredavanjeListItem[], ukupno = content.length): Strana<PredavanjeListItem> {
  return { content, page: { size: 25, number: 0, totalElements: ukupno, totalPages: Math.ceil(ukupno / 25) } };
}

describe('brojPredavanja', () => {
  it('srpska množina', () => {
    expect(brojPredavanja(1)).toBe('1 predavanje');
    expect(brojPredavanja(2)).toBe('2 predavanja');
    expect(brojPredavanja(5)).toBe('5 predavanja');
    expect(brojPredavanja(11)).toBe('11 predavanja');
    expect(brojPredavanja(21)).toBe('21 predavanje');
    expect(brojPredavanja(0)).toBe('0 predavanja');
  });
});

describe('PredavanjaLista', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'predavanja', component: PredavanjaLista },
          { path: 'predavanja/novo', component: Stub },
          { path: 'predavanja/:id', component: Stub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  const el = () => harness.fixture.nativeElement as HTMLElement;
  const pretraga = () => http.expectOne(r => r.url === 'api/predavanja/pretraga');

  async function otvori(url: string, odgovor: PredavanjeListItem[] | 'greska' | null = [], ukupno?: number) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    // predmeti i grupe za chipove
    http.expectOne('api/predmeti').flush([{ id: 1, naziv: 'UPR' }]);
    http.expectOne('api/grupe').flush([{ id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 38 }]);
    if (odgovor === 'greska') {
      pretraga().flush({ reason: 'Nešto nije u redu.' }, { status: 400, statusText: 'Bad Request' });
    } else if (odgovor !== null) {
      pretraga().flush(strana(odgovor, ukupno));
    }
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  it('zaglavlje, redovi i broj rezultata sa aktivnim sortom', async () => {
    await otvori('/predavanja', [predavanje(2), predavanje(1)], 2);
    expect(el().querySelector('h1')!.textContent).toBe('Predavanja');
    expect(el().textContent).toContain('Sva predavanja, svih predmeta i grupa');
    expect(el().querySelectorAll('tbody tr').length).toBe(2);
    expect(el().querySelector('.lista-broj')!.textContent).toBe('2 predavanja · sortirano po datumu, najnovije prvo');
  });

  it('"Novo predavanje" nosi izabrani predmet i grupu', async () => {
    await otvori('/predavanja?predmet=1&grupa=4', [predavanje(1)]);
    const link = el().querySelector<HTMLAnchorElement>('a[data-novo]')!;
    expect(link.textContent).toContain('Novo predavanje');
    const url = router.parseUrl(link.getAttribute('href')!);
    expect(url.queryParams).toEqual({ predmet: '1', grupa: '4' });
    expect(link.getAttribute('href')).toContain('/predavanja/novo');
  });

  it('predavanje bez grupe se prikazuje sa — u koloni grupe', async () => {
    await otvori('/predavanja', [predavanje(1, { grupa: null, brojStudenata: 0, brojPrisutnih: 4, datum: null })]);
    const celije = [...el().querySelectorAll('tbody tr:first-child td')].map(td => td.textContent!.trim());
    expect(celije[4]).toBe('—');
    expect(celije[2]).toBe('—');
  });

  it('klik na red otvara detalj predavanja', async () => {
    await otvori('/predavanja', [predavanje(5)]);
    el().querySelector<HTMLElement>('tbody tr')!.click();
    await harness.fixture.whenStable();
    expect(router.url).toBe('/predavanja/5');
  });

  it('prazno bez filtera: objašnjenje i "Novo predavanje"', async () => {
    await otvori('/predavanja', []);
    expect(el().querySelector('app-empty-state h2')!.textContent).toBe('Još nema predavanja');
    expect(el().querySelector('app-empty-state a')!.textContent).toContain('Novo predavanje');
    expect(el().querySelector('table')).toBeNull();
  });

  it('prazno sa filterima: "Nema predavanja za izabrane filtere" i "Očisti filtere" vraća podrazumevani prikaz', async () => {
    await otvori('/predavanja?predmet=1&status=u-toku', []);
    expect(el().querySelector('app-empty-state h2')!.textContent).toBe('Nema predavanja za izabrane filtere');
    el().querySelector<HTMLButtonElement>('app-empty-state button[data-ocisti]')!.click();
    await harness.fixture.whenStable();
    expect(router.url).toBe('/predavanja');
    pretraga().flush(strana([predavanje(1)]));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelectorAll('tbody tr').length).toBe(1);
  });

  it('greška učitavanja: panel sa porukom i "Pokušaj ponovo" ponovo traži podatke', async () => {
    await otvori('/predavanja', 'greska');
    const panel = el().querySelector('app-error-panel')!;
    expect(panel.textContent).toContain('Nešto nije u redu.');
    panel.querySelector<HTMLButtonElement>('[data-ponovo]')!.click();
    pretraga().flush(strana([predavanje(1)]));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelector('app-error-panel')).toBeNull();
    expect(el().querySelectorAll('tbody tr').length).toBe(1);
  });

  it('dok se učitava prvi put: skeleton, bez tabele i bez praznog stanja', async () => {
    await otvori('/predavanja', null);
    expect(el().querySelector('app-skeleton-rows')).not.toBeNull();
    expect(el().querySelector('table')).toBeNull();
    expect(el().querySelector('app-empty-state')).toBeNull();
    pretraga().flush(strana([]));
  });

  it('klik na zaglavlje tabele menja sort u URL-u', async () => {
    await otvori('/predavanja', [predavanje(1)]);
    el().querySelector<HTMLButtonElement>('button[data-sort=tema]')!.click();
    await harness.fixture.whenStable();
    expect(router.parseUrl(router.url).queryParams['sort']).toBe('tema,asc');
    pretraga().flush(strana([predavanje(1)]));
  });
});
