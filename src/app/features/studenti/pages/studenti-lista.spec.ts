import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StudentListItem } from '../../../core/api/studenti.api';
import { IKONE } from '../../../core/layout/icons';
import { Strana } from '../../../shared/models/strana';
import { StudentiLista } from './studenti-lista';

@Component({ template: 'stub' })
class Stub {}

function student(id: number, izmene: Partial<StudentListItem> = {}): StudentListItem {
  return {
    id, ime: 'Ana', prezime: 'Radić', indeks: 'GD12', godina: 2025, email: 'ana@gf.uns.ac.rs', brojTelefona: '064 123 456',
    grupa: { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 38 }, ...izmene,
  };
}

const strana = (content: StudentListItem[], ukupno = content.length): Strana<StudentListItem> => ({
  content, page: { size: 25, number: 0, totalElements: ukupno, totalPages: Math.ceil(ukupno / 25) },
});

describe('StudentiLista', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'studenti', component: StudentiLista }, { path: 'studenti/:id', component: Stub }]),
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
  const stani = async () => {
    await harness.fixture.whenStable();
    await new Promise(r => setTimeout(r));
    harness.detectChanges();
  };

  async function otvori(url: string, odgovor: Strana<StudentListItem>) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    http.expectOne(r => r.url === 'api/grupe').flush([{ id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 38 }]);
    http.expectOne(r => r.url === 'api/predmeti').flush([]);
    http.expectOne(r => r.url === 'api/studenti/pretraga').flush(odgovor);
    await stani();
  }

  it('prikazuje redove: ime, indeks sa godinom, grupa, godina, email i telefon kao linkovi', async () => {
    await otvori('/studenti', strana([student(1)]));
    const red = el().querySelector('tr[data-student="1"]')!;
    expect(red.querySelector('a.otvori')!.textContent).toBe('Radić Ana');
    expect(red.querySelector('a.otvori')!.getAttribute('href')).toBe('/studenti/1');
    expect(red.textContent).toContain('GD12/2025');
    expect(red.textContent).toContain('GD-2025');
    expect(red.querySelector('a[data-mail]')!.getAttribute('href')).toBe('mailto:ana@gf.uns.ac.rs');
    expect(red.querySelector('a[data-tel]')!.getAttribute('href')).toBe('tel:064123456');
    expect(el().querySelector('.lista-broj')!.textContent).toContain('1 student');
  });

  it('stari red bez emaila, telefona, godine i grupe: "—", bez linkova i bez izuzetaka', async () => {
    await otvori('/studenti', strana([student(2, { email: null, brojTelefona: null, godina: null, grupa: null })]));
    const red = el().querySelector('tr[data-student="2"]')!;
    expect(red.querySelector('a[data-mail]')).toBeNull();
    expect(red.querySelector('a[data-tel]')).toBeNull();
    expect(red.textContent).toContain('GD12');
    expect(red.textContent).not.toContain('GD12/');
    expect(red.querySelector('.c-meta')!.textContent).toBe('GD12 · bez grupe');
  });

  it('klik na red otvara profil', async () => {
    await otvori('/studenti', strana([student(7)]));
    el().querySelector<HTMLElement>('tr[data-student="7"]')!.click();
    await stani();
    expect(router.url).toBe('/studenti/7');
  });

  it('klik na zaglavlje menja sort, preko URL-a', async () => {
    await otvori('/studenti', strana([student(1)]));
    el().querySelector<HTMLButtonElement>('[data-sort="indeks"]')!.click();
    await stani();
    expect(router.url).toContain('sort=indeks,asc');
    http.expectOne(r => r.url === 'api/studenti/pretraga' && r.params.get('sort') === 'indeks,asc').flush(strana([student(1)]));
  });

  it('prazno sa filterom: "Nema studenata za izabrane filtere" i "Očisti filtere"', async () => {
    await otvori('/studenti?q=zzz', strana([]));
    expect(el().textContent).toContain('Nema studenata za izabrane filtere');
    expect(el().querySelector('[data-ocisti]')).not.toBeNull();
  });

  it('prazno bez filtera ima objašnjenje', async () => {
    await otvori('/studenti', strana([]));
    expect(el().textContent).toContain('Još nema studenata');
  });

  it('greška učitavanja: panel sa "Pokušaj ponovo"', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/studenti');
    http.expectOne(r => r.url === 'api/grupe').flush([]);
    http.expectOne(r => r.url === 'api/predmeti').flush([]);
    http.expectOne(r => r.url === 'api/studenti/pretraga').flush({ reason: 'Neispravan parametar: sort.' }, { status: 400, statusText: 'Bad Request' });
    await stani();
    expect(el().querySelector('app-error-panel')!.textContent).toContain('Neispravan parametar: sort.');
    el().querySelector<HTMLButtonElement>('[data-ponovo]')!.click();
    http.expectOne(r => r.url === 'api/studenti/pretraga').flush(strana([student(1)]));
    await stani();
    expect(el().querySelector('tr[data-student="1"]')).not.toBeNull();
  });
});
