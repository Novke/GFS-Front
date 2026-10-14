import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { IKONE } from '../../../core/layout/icons';
import { Strana } from '../../../shared/models/strana';
import { DomaciListItem } from '../../../core/api/domaci.models';
import { brojDomacih, DomaciLista } from './domaci-lista';

@Component({ template: 'stub' })
class Stub {}

function domaci(id: number, izmene: Partial<DomaciListItem> = {}): DomaciListItem {
  return {
    id,
    naslov: `Domaći ${id}`,
    datum: '2025-10-14',
    pregledan: false,
    predmet: { id: 1, naziv: 'UPR' },
    grupa: { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 38 },
    predavanje: { id: 3, rb: 3 },
    brojUradjenih: 20,
    brojStudenata: 38,
    ...izmene,
  };
}

function strana(content: DomaciListItem[], ukupno = content.length): Strana<DomaciListItem> {
  return { content, page: { size: 25, number: 0, totalElements: ukupno, totalPages: Math.ceil(ukupno / 25) } };
}

describe('brojDomacih', () => {
  it('srpska množina', () => {
    expect(brojDomacih(1)).toBe('1 domaći');
    expect(brojDomacih(2)).toBe('2 domaća');
    expect(brojDomacih(5)).toBe('5 domaćih');
    expect(brojDomacih(11)).toBe('11 domaćih');
    expect(brojDomacih(12)).toBe('12 domaćih');
    expect(brojDomacih(21)).toBe('21 domaći');
    expect(brojDomacih(0)).toBe('0 domaćih');
  });
});

describe('DomaciLista', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'domaci', component: DomaciLista },
          { path: 'domaci/novo', component: Stub },
          { path: 'domaci/:id', component: Stub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    for (const ime of IKONE) {
      registry.addSvgIconLiteral(ime, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
    }
  });

  afterEach(() => http.verify());

  const el = () => harness.fixture.nativeElement as HTMLElement;
  const pretraga = () => http.expectOne(r => r.url === 'api/domaci/pretraga');

  async function otvori(url: string, odgovor: DomaciListItem[] | 'greska' = [], ukupno?: number) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    http.expectOne('api/predmeti').flush([{ id: 1, naziv: 'UPR' }]);
    http.expectOne('api/grupe').flush([{ id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 38 }]);
    if (odgovor === 'greska') {
      pretraga().flush({ reason: 'Nešto nije u redu.' }, { status: 400, statusText: 'Bad Request' });
    } else {
      pretraga().flush(strana(odgovor, ukupno));
    }
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  it('zaglavlje, redovi i broj rezultata sa aktivnim sortom', async () => {
    await otvori('/domaci', [domaci(2), domaci(1)], 2);
    expect(el().querySelector('h1')!.textContent).toBe('Domaći');
    expect(el().querySelectorAll('tbody tr')).toHaveLength(2);
    expect(el().querySelector('.lista-broj')!.textContent).toBe('2 domaća · sortirano po datumu, najnovije prvo');
  });

  it('"Nov domaći" nosi izabrani predmet i grupu', async () => {
    await otvori('/domaci?predmet=1&grupa=4', [domaci(1)]);
    const link = el().querySelector<HTMLAnchorElement>('a[data-novo]')!;
    expect(link.textContent).toContain('Nov domaći');
    expect(router.parseUrl(link.getAttribute('href')!).queryParams).toEqual({ predmet: '1', grupa: '4' });
    expect(link.getAttribute('href')).toContain('/domaci/novo');
  });

  it('domaći bez grupe, predavanja i naslova se prikazuje sa —, bez izuzetaka', async () => {
    await otvori('/domaci', [domaci(1, { grupa: null, predavanje: null, naslov: null, datum: null, brojStudenata: 0, brojUradjenih: 0 })]);
    const celije = [...el().querySelectorAll('tbody tr:first-child td')].map(td => td.textContent!.trim());
    expect(celije.slice(0, 6)).toEqual(['Domaći bez naslova', '—', 'UPR', '—', '—', '—']);
  });

  it('klik na red otvara detalj domaćeg', async () => {
    await otvori('/domaci', [domaci(5)]);
    el().querySelector<HTMLElement>('tbody tr')!.click();
    await harness.fixture.whenStable();
    expect(router.url).toBe('/domaci/5');
  });

  it('prazno bez filtera: objašnjenje i "Nov domaći"', async () => {
    await otvori('/domaci', []);
    expect(el().querySelector('app-empty-state h2')!.textContent).toBe('Još nema domaćih');
    expect(el().querySelector('app-empty-state a')!.textContent).toContain('Nov domaći');
    expect(el().querySelector('table')).toBeNull();
  });

  it('prazno sa filterima: "Nema domaćih za izabrane filtere", "Očisti filtere" vraća podrazumevani prikaz', async () => {
    await otvori('/domaci?predmet=1&status=za-pregled', []);
    expect(el().querySelector('app-empty-state h2')!.textContent).toBe('Nema domaćih za izabrane filtere');
    el().querySelector<HTMLButtonElement>('app-empty-state button[data-ocisti]')!.click();
    await harness.fixture.whenStable();
    expect(router.url).toBe('/domaci');
    pretraga().flush(strana([domaci(1)]));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('greška učitavanja: panel sa porukom', async () => {
    await otvori('/domaci', 'greska');
    expect(el().querySelector('app-error-panel')!.textContent).toContain('Nešto nije u redu.');
    expect(el().querySelector('table')).toBeNull();
  });
});
