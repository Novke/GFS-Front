import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { StudentListItem, StudentPregledDetails, StudentPredmetKartica } from '../../../core/api/studenti.api';
import { IKONE } from '../../../core/layout/icons';
import { STUDENTI_RUTE } from '../studenti.routes';

function student(izmene: Partial<StudentPregledDetails> = {}): StudentPregledDetails {
  return {
    id: 5,
    ime: 'Ana',
    prezime: 'Radić',
    indeks: 'GD12',
    grupa: 'GD-2025',
    aktivnosti: [
      { id: 1, predavanjeId: 11, tip: 'ZADATAK', napomene: null, datum: '2025-10-14', tema: 'Petlje' },
      { id: 2, predavanjeId: 12, tip: 'PRISUSTVO', napomene: 'kasnila', datum: '2025-10-21', tema: 'Nizovi' },
    ],
    uradjeniDomaci: [{ id: 1, domaciId: 21, bodovi: 8, napomene: null, prepisivanje: false, oslobodjen: false, datum: '2025-10-18', naslov: 'Domaći 1' }],
    polaganja: [{ id: 1, testId: 31, ostvareniPoeni: 40, polozio: true, prepisivao: false, napomene: null, datum: '2025-11-20', tipTesta: { id: 1, naziv: 'Kolokvijum 1' } }],
    ...izmene,
  };
}

function red(id: number, izmene: Partial<StudentListItem> = {}): StudentListItem {
  return {
    id, ime: 'Ana', prezime: 'Radić', indeks: 'GD12', godina: 2025, email: 'ana@gf.uns.ac.rs', brojTelefona: '064 123 456',
    grupa: { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 3 }, ...izmene,
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

  /** Otvara profil i odgovara na zahteve: student, zaglavlje (pretraga po indeksu), grupa, kartice taba Pregled. */
  async function otvori(opcije: { d?: StudentPregledDetails; zaglavlje?: StudentListItem | null; ids?: number[]; url?: string } = {}) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(opcije.url ?? '/studenti/5');
    http.expectOne('api/studenti/5').flush(opcije.d ?? student());
    const z = opcije.zaglavlje === undefined ? red(5) : opcije.zaglavlje;
    const pretraga = http.expectOne(r => r.url === 'api/studenti/pretraga');
    expect(pretraga.request.params.get('q')).toBe((opcije.d ?? student()).indeks);
    expect(pretraga.request.params.get('size')).toBe('100');
    pretraga.flush({ content: z ? [red(99, { indeks: 'GD12' }), z] : [], page: { size: 100, number: 0, totalElements: 2, totalPages: 1 } });
    if (z?.grupa) {
      http.expectOne(`api/grupe/${z.grupa.id}`).flush(grupa(opcije.ids ?? [3, 5, 9]));
    }
    await stani();
  }

  const kartice = (zahtev: TestRequest, k: StudentPredmetKartica[] = [kartica]) => zahtev.flush(k);

  it('zaglavlje: ime, indeks sa godinom upisa, grupa kao link, godina, mailto i tel linkovi', async () => {
    await otvori();
    kartice(http.expectOne('api/studenti/5/predmeti'));
    await stani();
    expect(el().querySelector('h1')!.textContent).toBe('Ana Radić');
    expect(el().querySelector('[data-indeks]')!.textContent).toBe('GD12/2025');
    expect(el().querySelector('a[data-grupa]')!.getAttribute('href')).toBe('/grupe/4');
    expect(el().querySelector('[data-godina]')!.textContent).toContain('2025');
    expect(el().querySelector('a[data-mail]')!.getAttribute('href')).toBe('mailto:ana@gf.uns.ac.rs');
    expect(el().querySelector('a[data-tel]')!.getAttribute('href')).toBe('tel:064123456');
  });

  it('student bez emaila (i telefona) nema mailto ni tel link, nego "—"', async () => {
    await otvori({ zaglavlje: red(5, { email: null, brojTelefona: '' }) });
    http.expectOne('api/studenti/5/predmeti').flush([]);
    await stani();
    expect(el().querySelector('a[data-mail]')).toBeNull();
    expect(el().querySelector('a[href^="mailto:"]')).toBeNull();
    expect(el().querySelector('[data-bez-maila]')!.textContent).toContain('—');
    expect(el().querySelector('a[data-tel]')).toBeNull();
    expect(el().querySelector('[data-bez-telefona]')!.textContent).toContain('—');
  });

  it('student bez godine i grupe (stari red): indeks bez godine, "Bez grupe", godina "—", bez izuzetaka', async () => {
    await otvori({ d: student({ grupa: null }), zaglavlje: red(5, { godina: null, grupa: null }) });
    http.expectOne('api/studenti/5/predmeti').flush([]);
    await stani();
    expect(el().querySelector('[data-indeks]')!.textContent).toBe('GD12');
    expect(el().querySelector('[data-grupa]')!.textContent).toBe('Bez grupe');
    expect(el().querySelector('a[data-grupa]')).toBeNull();
    expect(el().querySelector('[data-godina]')!.textContent).toContain('—');
    expect(el().querySelector('[data-susedi]')).toBeNull();
  });

  it('zaglavlje koje se ne učita ne ruši profil: ime i tabovi ostaju, godina i kontakt "—"', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/studenti/5');
    http.expectOne('api/studenti/5').flush(student());
    http.expectOne(r => r.url === 'api/studenti/pretraga').flush('greška', { status: 500, statusText: 'Server Error' });
    await stani();
    http.expectOne('api/studenti/5/predmeti').flush([]);
    await stani();
    expect(el().querySelector('h1')!.textContent).toBe('Ana Radić');
    expect(el().querySelector('[data-indeks]')!.textContent).toBe('GD12');
    expect(el().querySelector('[data-grupa]')!.textContent).toBe('GD-2025');
    expect(el().querySelector('[data-bez-maila]')).not.toBeNull();
  });

  it('prethodni/sledeći: u sredini su linkovi na susede, mesto u grupi je "2 / 3"', async () => {
    await otvori({ ids: [3, 5, 9] });
    http.expectOne('api/studenti/5/predmeti').flush([]);
    await stani();
    expect(el().querySelector('[data-prethodni]')!.getAttribute('href')).toBe('/studenti/3');
    expect(el().querySelector('[data-sledeci]')!.getAttribute('href')).toBe('/studenti/9');
    expect(el().querySelector('.mesto')!.textContent!.trim()).toBe('2 / 3');
  });

  it('prethodni je onemogućen za prvog, a sledeći za poslednjeg studenta grupe', async () => {
    await otvori({ ids: [5, 8, 9] });
    http.expectOne('api/studenti/5/predmeti').flush([]);
    await stani();
    const prethodni = el().querySelector<HTMLButtonElement>('[data-prethodni]')!;
    expect(prethodni.tagName).toBe('BUTTON');
    expect(prethodni.disabled).toBe(true);
    expect(el().querySelector('[data-sledeci]')!.getAttribute('href')).toBe('/studenti/8');
  });

  it('poslednji student: sledeći je onemogućen', async () => {
    await otvori({ ids: [1, 3, 5] });
    http.expectOne('api/studenti/5/predmeti').flush([]);
    await stani();
    const sledeci = el().querySelector<HTMLButtonElement>('[data-sledeci]')!;
    expect(sledeci.tagName).toBe('BUTTON');
    expect(sledeci.disabled).toBe(true);
    expect(el().querySelector('[data-prethodni]')!.getAttribute('href')).toBe('/studenti/3');
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
    http.expectOne('api/studenti/5').flush(student());
    http.expectOne(r => r.url === 'api/studenti/pretraga').flush({ content: [], page: { size: 100, number: 0, totalElements: 0, totalPages: 0 } });
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
    http.expectOne(r => r.url === 'api/studenti/pretraga').flush({ content: [red(9, { ime: 'Marko', indeks: 'GD9' })], page: { size: 100, number: 0, totalElements: 1, totalPages: 1 } });
    http.expectOne('api/grupe/4').flush(grupa([3, 5, 9]));
    await stani();
    http.expectOne('api/studenti/9/predmeti').flush([]);
    await stani();
    expect(el().querySelector('h1')!.textContent).toBe('Marko Ilić');
    expect(el().querySelector<HTMLButtonElement>('[data-sledeci]')!.disabled).toBe(true);
  });
});
