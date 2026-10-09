import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { StudentNaPredmetuDetails, StudentPregledTestInfo } from '../../../core/api/studenti.api';
import { BreadcrumbService } from '../../../core/layout/breadcrumbs';
import { IKONE } from '../../../core/layout/icons';
import { STUDENTI_RUTE } from '../studenti.routes';
import { redoviTestova } from './student-predmet';

const polaganje = (id: number, datum: string | null, izmene: Partial<StudentPregledTestInfo> = {}): StudentPregledTestInfo => ({
  id, testId: 300 + id, ostvareniPoeni: 30, polozio: true, prepisivao: false, napomene: null, datum, tipTesta: { id: 1, naziv: 'Kolokvijum' }, ...izmene,
});

function detalji(izmene: Partial<StudentNaPredmetuDetails> = {}): StudentNaPredmetuDetails {
  return {
    student: { id: 5, ime: 'Ana', prezime: 'Radić', godina: 2025, indeks: 'GD12', brojTelefona: null, email: null, datumRodjenja: null, opstina: null },
    predmet: { id: 2, naziv: 'UPR' },
    grupaNaziv: 'GD-2025',
    aktivnosti: [
      { id: 1, predavanjeId: 11, tip: 'ZADATAK', napomene: null, datum: '2025-10-14', tema: 'Petlje' },
      { id: 2, predavanjeId: 12, tip: 'SA_ZVEZDICOM', napomene: 'odlično', datum: '2025-10-21', tema: 'Nizovi' },
    ],
    domaci: [
      { id: 1, domaciId: 21, bodovi: 8, napomene: null, prepisivanje: false, oslobodjen: false, datum: '2025-10-18', naslov: 'Domaći 1' },
      { id: 2, domaciId: 22, bodovi: 10, napomene: null, prepisivanje: false, oslobodjen: true, datum: '2025-10-25', naslov: null },
    ],
    testoviPoTipu: [
      {
        tipTesta: { id: 1, naziv: 'Kolokvijum' },
        polaganja: [polaganje(1, '2025-11-01', { ostvareniPoeni: 20, polozio: false }), polaganje(3, '2025-12-01', { ostvareniPoeni: 45 }), polaganje(2, '2025-11-15', { prepisivao: true })],
        najboljePolaganje: polaganje(3, '2025-12-01', { ostvareniPoeni: 45 }),
      },
      { tipTesta: { id: 2, naziv: 'Završni' }, polaganja: [], najboljePolaganje: null },
    ],
    ukupnoPoenaAktivnost: 12.5,
    ukupnoPoenaDomaci: 18,
    ...izmene,
  };
}

describe('redoviTestova', () => {
  it('polaganja tipa idu najnovije prva (redosled iz servera je nasumičan); tip bez polaganja ima jedan prazan red', () => {
    const redovi = redoviTestova(detalji().testoviPoTipu);
    expect(redovi.map(r => r.kljuc)).toEqual(['p3', 'p2', 'p1', 'tip2']);
    expect(redovi.map(r => r.najbolje)).toEqual([true, false, false, false]);
    expect(redovi[3]).toMatchObject({ tip: 'Završni', polaganje: null });
  });
});

describe('StudentPredmet', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeAll(async () => {
    await import('./student-predmet');
  }, 60_000);

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
    await new Promise(r => setTimeout(r));
    harness.detectChanges();
  };

  async function otvori(d: StudentNaPredmetuDetails = detalji()) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/studenti/5/predmeti/2');
    http.expectOne('api/studenti/5/predmet/2').flush(d);
    await stani();
  }

  it('zaglavlje: student, indeks, predmet, grupa, poeni i link na profil', async () => {
    await otvori();
    expect(el().querySelector('h1')!.textContent).toBe('Ana Radić');
    expect(el().querySelector('[data-indeks]')!.textContent).toBe('Indeks: GD12/2025');
    expect(el().querySelector('[data-predmet]')!.textContent).toBe('Predmet: UPR');
    expect(el().querySelector('[data-grupa]')!.textContent).toBe('Grupa: GD-2025');
    expect(el().querySelector('[data-kpi-aktivnost]')!.textContent).toContain('12,5');
    expect(el().querySelector('[data-kpi-domaci]')!.textContent).toContain('18');
    expect(el().querySelector('[data-profil]')!.getAttribute('href')).toBe('/studenti/5');
  });

  it('mrvice: ime studenta (sa linkom na profil) i naziv predmeta', async () => {
    await otvori();
    expect(TestBed.inject(BreadcrumbService).mrvice()).toEqual([
      { label: 'Studenti', url: '/studenti' },
      { label: 'Ana Radić', url: '/studenti/5' },
      { label: 'UPR' },
    ]);
  });

  it('aktivnosti i domaći: najnovije prvo, sa linkovima; domaći bez naslova i oslobođen su označeni', async () => {
    await otvori();
    const akt = [...el().querySelectorAll('[data-aktivnosti] tbody tr .c-glavno a')];
    expect(akt.map(a => a.textContent)).toEqual(['Nizovi', 'Petlje']);
    expect(akt.map(a => a.getAttribute('href'))).toEqual(['/predavanja/12', '/predavanja/11']);
    const dom = [...el().querySelectorAll('[data-domaci] tbody tr')];
    expect(dom[0].querySelector('.c-glavno')!.textContent).toContain('Domaći bez naslova');
    expect(dom[0].textContent).toContain('Oslobođen');
    expect(dom[1].querySelector('.c-glavno a')!.getAttribute('href')).toBe('/domaci/21');
  });

  it('testovi po tipu kao tabela: najbolje polaganje je označeno, tip bez polaganja ima red sa "—"', async () => {
    await otvori();
    const redovi = [...el().querySelectorAll('[data-testovi] tbody tr')];
    expect(redovi.length).toBe(4);
    expect(redovi[0].hasAttribute('data-najbolji')).toBe(true);
    expect(redovi[0].textContent).toContain('Najbolji');
    expect(redovi[0].textContent).toContain('45');
    expect(redovi[1].hasAttribute('data-najbolji')).toBe(false);
    expect(redovi[1].textContent).toContain('Da');
    expect(redovi[2].textContent).toContain('Ne');
    expect(redovi[3].textContent).toContain('Završni');
    expect(redovi[3].querySelector('.c-meta')!.textContent).toBe('nema polaganja');
    expect([...el().querySelectorAll('[data-testovi] thead th')].map(t => t.textContent)).toEqual(['Tip testa', 'Datum', 'Poeni', 'Položio', 'Prepisivao']);
  });

  it('student bez aktivnosti, domaćih i tipova testa: objašnjenja umesto tabela', async () => {
    await otvori(detalji({ aktivnosti: [], domaci: [], testoviPoTipu: [], grupaNaziv: null, predmet: null }));
    expect(el().textContent).toContain('Nema zabeleženih aktivnosti na ovom predmetu.');
    expect(el().textContent).toContain('Nema urađenih domaćih na ovom predmetu.');
    expect(el().textContent).toContain('Predmet nema tipove testa.');
    expect(el().querySelector('[data-grupa]')!.textContent).toBe('Grupa: Bez grupe');
    expect(el().querySelector('[data-predmet]')!.textContent).toBe('Predmet: —');
  });

  it('greška: panel sa "Pokušaj ponovo"', async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/studenti/5/predmeti/2');
    http.expectOne('api/studenti/5/predmet/2').flush({ reason: 'Predmet ne postoji! ID = 2' }, { status: 404, statusText: 'Not Found' });
    await stani();
    expect(el().querySelector('app-error-panel')!.textContent).toContain('Predmet ne postoji! ID = 2');
    el().querySelector<HTMLButtonElement>('[data-ponovo]')!.click();
    http.expectOne('api/studenti/5/predmet/2').flush(detalji());
    await stani();
    expect(el().querySelector('h1')!.textContent).toBe('Ana Radić');
  });
});
