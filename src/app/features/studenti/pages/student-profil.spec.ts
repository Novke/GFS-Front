import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { StudentPregledDetails, StudentPredmetKartica } from '../../../core/api/studenti.api';
import { BreadcrumbService } from '../../../core/layout/breadcrumbs';
import { IKONE } from '../../../core/layout/icons';
import { STUDENTI_RUTE } from '../studenti.routes';

function student(izmene: Partial<StudentPregledDetails> = {}): StudentPregledDetails {
  return {
    id: 5,
    ime: 'Ana',
    prezime: 'Radić',
    indeks: 'GD12',
    godina: 2025,
    email: 'ana@gf.uns.ac.rs',
    brojTelefona: '064 123 456',
    datumRodjenja: '2006-03-04',
    opstina: 'Subotica',
    grupa: 'GD-2025',
    grupaId: 4,
    aktivnosti: [
      { id: 1, predavanjeId: 11, tip: 'ZADATAK', napomene: null, datum: '2025-10-14', tema: 'Petlje' },
      { id: 2, predavanjeId: 12, tip: 'PRISUSTVO', napomene: 'kasnila', datum: '2025-10-21', tema: 'Nizovi' },
    ],
    uradjeniDomaci: [{ id: 1, domaciId: 21, bodovi: 8, napomene: null, prepisivanje: false, oslobodjen: false, datum: '2025-10-18', naslov: 'Domaći 1' }],
    polaganja: [{ id: 1, testId: 31, ostvareniPoeni: 40, pragProlaza: 25, polozeno: true, prepisivao: false, napomene: null, datum: '2025-11-20', tipTesta: { id: 1, naziv: 'Kolokvijum 1' } }],
    ...izmene,
  };
}

const grupa = (ids: number[]) => ({
  id: 4, naziv: 'GD-2025', godinaUpisa: 2025,
  studenti: ids.map(id => ({ id, ime: 'S', prezime: String(id), indeks: `GD${id}`, godina: 2025, brojTelefona: null, email: null })),
});

const kartica: StudentPredmetKartica = {
  predmet: { id: 2, naziv: 'UPR' }, prisutan: 12, predavanja: 14, zadaci: 5, zvezdice: 2, domaciUradjeno: 6, domaciUkupno: 8,
  domaciProsek: 7.4, testovi: [{ tipTesta: { id: 1, naziv: 'Kolokvijum 1' }, ostvarenoPoena: 40 }], ukupno: 72.633, predlogOcene: 8, doSledeceOcene: 8.367,
};

describe('StudentProfil', () => {
  // rute učitavaju komponente lenjo: prvi uvoz u hladnom testu zna da potraje duže od podrazumevanih 5 s
  beforeAll(async () => {
    await Promise.all([
      import('./student-profil'),
      import('./student-pregled-tab'),
      import('./student-hronologija-tab'),
      import('./student-beleske-tab'),
    ]);
  }, 60_000);

  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'studenti', children: STUDENTI_RUTE }], withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
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
    harness.detectChanges();
  };

  /** Otvara profil i odgovara na zahteve: student (sa zaglavljem) i, ako ima grupu, studenti grupe. Nema `pretraga` poziva. */
  async function otvori(opcije: { d?: StudentPregledDetails; ids?: number[]; url?: string } = {}) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(opcije.url ?? '/studenti/5');
    const d = opcije.d ?? student();
    http.expectOne('api/studenti/5').flush(d);
    if (d.grupaId) {
      http.expectOne(`api/grupe/${d.grupaId}`).flush(grupa(opcije.ids ?? [3, 5, 9]));
    }
    http.expectNone(r => r.url === 'api/studenti/pretraga');
    await stani();
  }

  const kartice = (zahtev: TestRequest, k: StudentPredmetKartica[] = [kartica]) => zahtev.flush(k);

  it('zaglavlje: ime, indeks sa godinom upisa, grupa kao link, godina, mailto i tel linkovi', async () => {
    await otvori();
    kartice(http.expectOne('api/studenti/5/predmeti'));
    await stani();
    expect(el().querySelector('h1')!.textContent).toBe('Ana Radić');
    expect(el().querySelector('[data-indeks]')!.textContent).toBe('Indeks: GD12/2025');
    expect(el().querySelector('a[data-grupa]')!.getAttribute('href')).toBe('/grupe/4');
    expect(el().querySelector('[data-godina]')!.textContent).toContain('2025');
    expect(el().querySelector('a[data-mail]')!.getAttribute('href')).toBe('mailto:ana@gf.uns.ac.rs');
    expect(el().querySelector('a[data-tel]')!.getAttribute('href')).toBe('tel:064123456');
  });

  it('student bez emaila (i telefona) nema mailto ni tel link, nego "—"', async () => {
    await otvori({ d: student({ email: null, brojTelefona: '' }) });
    http.expectOne('api/studenti/5/predmeti').flush([]);
    await stani();
    expect(el().querySelector('a[data-mail]')).toBeNull();
    expect(el().querySelector('a[href^="mailto:"]')).toBeNull();
    expect(el().querySelector('[data-bez-maila]')!.textContent).toContain('—');
    expect(el().querySelector('a[data-tel]')).toBeNull();
    expect(el().querySelector('[data-bez-telefona]')!.textContent).toContain('—');
  });

  it('student bez godine i grupe (stari red): indeks bez godine, "Bez grupe", godina "—", bez izuzetaka', async () => {
    await otvori({ d: student({ grupa: null, grupaId: null, godina: null }) });
    http.expectOne('api/studenti/5/predmeti').flush([]);
    await stani();
    expect(el().querySelector('[data-indeks]')!.textContent).toBe('Indeks: GD12');
    expect(el().querySelector('[data-grupa]')!.textContent).toBe('Grupa: Bez grupe');
    expect(el().querySelector('a[data-grupa]')).toBeNull();
    expect(el().querySelector('[data-godina]')!.textContent).toContain('—');
    expect(el().querySelector('[data-susedi]')).toBeNull();
  });

  it('zaglavlje je iz GET studenti/{id}: student čiji indeks ima mnogo istih (preko 100 rezultata pretrage) ima podatke, bez pretrage', async () => {
    await otvori({ d: student({ indeks: 'GD1' }) });
    http.expectOne('api/studenti/5/predmeti').flush([]);
    await stani();
    expect(el().querySelector('[data-indeks]')!.textContent).toContain('GD1/2025');
    expect(el().querySelector('a[data-mail]')!.getAttribute('href')).toBe('mailto:ana@gf.uns.ac.rs');
    expect(el().querySelector('a[data-grupa]')!.getAttribute('href')).toBe('/grupe/4');
  });

  it('studenti grupe se ne učitaju: profil radi, bez strelica prethodni/sledeći', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/studenti/5');
    http.expectOne('api/studenti/5').flush(student());
    http.expectOne('api/grupe/4').flush('greška', { status: 500, statusText: 'Server Error' });
    await stani();
    http.expectOne('api/studenti/5/predmeti').flush([]);
    await stani();
    expect(el().querySelector('h1')!.textContent).toBe('Ana Radić');
    expect(el().querySelector('a[data-grupa]')).not.toBeNull();
    expect(el().querySelector('[data-susedi]')).toBeNull();
  });

  it('prethodni/sledeći: u sredini su linkovi na susede, mesto u grupi je "2 / 3"', async () => {
    await otvori({ ids: [3, 5, 9] });
    http.expectOne('api/studenti/5/predmeti').flush([]);
    await stani();
    expect(el().querySelector('[data-prethodni]')!.getAttribute('href')).toBe('/studenti/3/pregled');
    expect(el().querySelector('[data-sledeci]')!.getAttribute('href')).toBe('/studenti/9/pregled');
    expect(el().querySelector('.mesto')!.textContent!.trim()).toBe('2 / 3');
  });

  it('prethodni je onemogućen za prvog, a sledeći za poslednjeg studenta grupe', async () => {
    await otvori({ ids: [5, 8, 9] });
    http.expectOne('api/studenti/5/predmeti').flush([]);
    await stani();
    const prethodni = el().querySelector<HTMLButtonElement>('[data-prethodni]')!;
    expect(prethodni.tagName).toBe('BUTTON');
    expect(prethodni.disabled).toBe(true);
    expect(el().querySelector('[data-sledeci]')!.getAttribute('href')).toBe('/studenti/8/pregled');
  });

  it('poslednji student: sledeći je onemogućen', async () => {
    await otvori({ ids: [1, 3, 5] });
    http.expectOne('api/studenti/5/predmeti').flush([]);
    await stani();
    const sledeci = el().querySelector<HTMLButtonElement>('[data-sledeci]')!;
    expect(sledeci.tagName).toBe('BUTTON');
    expect(sledeci.disabled).toBe(true);
    expect(el().querySelector('[data-prethodni]')!.getAttribute('href')).toBe('/studenti/3/pregled');
  });

  it('prethodni/sledeći čuvaju otvoreni tab', async () => {
    await otvori({ url: '/studenti/5/hronologija', ids: [3, 5, 9] });
    expect(el().querySelector('[data-prethodni]')!.getAttribute('href')).toBe('/studenti/3/hronologija');
    expect(el().querySelector('[data-sledeci]')!.getAttribute('href')).toBe('/studenti/9/hronologija');
    await harness.navigateByUrl('/studenti/5/beleske');
    await stani();
    http.expectOne('api/studenti/5/beleske').flush([]);
    await stani();
    expect(el().querySelector('[data-sledeci]')!.getAttribute('href')).toBe('/studenti/9/beleske');
  });

  it('mrvice nose ime studenta i posle prelaska na drugi tab (profil se ne pravi ponovo)', async () => {
    const mrvice = TestBed.inject(BreadcrumbService);
    await otvori({ url: '/studenti/5/hronologija' });
    const ime = mrvice.mrvice().at(-1)?.label;
    expect(ime).toBeTruthy();
    expect(ime).toBe(el().querySelector('h1')?.textContent?.trim());
    await harness.navigateByUrl('/studenti/5/beleske');
    await stani();
    http.expectOne('api/studenti/5/beleske').flush([]);
    await stani();
    expect(mrvice.mrvice().at(-1)?.label).toBe(ime);
  });

  it('/studenti/5 ide na tab Pregled i prikazuje kartice po predmetu', async () => {
    await otvori();
    kartice(http.expectOne('api/studenti/5/predmeti'));
    await stani();
    expect(TestBed.inject(Router).url).toBe('/studenti/5/pregled');
    expect(el().querySelector('[data-tab="pregled"]')!.getAttribute('aria-current')).toBe('page');
    expect(el().querySelectorAll('app-predmet-kartica').length).toBe(1);
    expect(el().querySelector('[data-predmet]')!.getAttribute('href')).toBe('/studenti/5/predmeti/2');
  });

  it('tab Hronologija spaja tri izvora, najnovije prvo, bez novih zahteva', async () => {
    await otvori({ url: '/studenti/5/hronologija' });
    expect(el().querySelectorAll('[data-hronologija] li').length).toBe(4);
    const tipovi = [...el().querySelectorAll('[data-hronologija] li')].map(li => li.getAttribute('data-tip'));
    expect(tipovi).toEqual(['test', 'aktivnost', 'domaci', 'aktivnost']);
    const veze = [...el().querySelectorAll('[data-veza]')].map(a => a.getAttribute('href'));
    expect(veze).toEqual(['/testovi/31', '/predavanja/12', '/domaci/21', '/predavanja/11']);
  });

  it('prazna hronologija ima objašnjenje', async () => {
    await otvori({ d: student({ aktivnosti: [], uradjeniDomaci: [], polaganja: [] }), url: '/studenti/5/hronologija' });
    expect(el().querySelector('[data-hronologija]')).toBeNull();
    expect(el().textContent).toContain('Još nema zabeleženog rada');
  });

  it('greška glavnog zahteva: panel sa "Pokušaj ponovo" i link na listu', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/studenti/5');
    http.expectOne('api/studenti/5').flush({ reason: 'Student ne postoji! ID = 5' }, { status: 404, statusText: 'Not Found' });
    await stani();
    expect(el().querySelector('app-error-panel')!.textContent).toContain('Student ne postoji! ID = 5');
    el().querySelector<HTMLButtonElement>('[data-ponovo]')!.click();
    await stani();
    expect(el().querySelector('app-error-panel')).toBeNull();
    expect(el().querySelector('app-skeleton-rows')).not.toBeNull();
    http.expectOne('api/studenti/5').flush(student());
    http.expectOne('api/grupe/4').flush(grupa([3, 5, 9]));
    await stani();
    http.expectOne('api/studenti/5/predmeti').flush([]);
    await stani();
    expect(el().querySelector('h1')!.textContent).toBe('Ana Radić');
  });

  it('prelazak na drugog studenta učitava njega, ne starog', async () => {
    await otvori({ ids: [3, 5, 9] });
    http.expectOne('api/studenti/5/predmeti').flush([]);
    await stani();
    await harness.navigateByUrl('/studenti/9/pregled');
    http.expectOne('api/studenti/9').flush(student({ id: 9, ime: 'Marko', prezime: 'Ilić', indeks: 'GD9' }));
    http.expectOne('api/grupe/4').flush(grupa([3, 5, 9]));
    await stani();
    http.expectOne('api/studenti/9/predmeti').flush([]);
    await stani();
    expect(el().querySelector('h1')!.textContent).toBe('Marko Ilić');
    expect(el().querySelector<HTMLButtonElement>('[data-sledeci]')!.disabled).toBe(true);
  });
});
