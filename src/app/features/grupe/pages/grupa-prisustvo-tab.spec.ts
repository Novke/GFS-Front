import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tekucaSkolskaGodina } from '../../../shared/util/skolska-godina';
import { GrupaPregledInfo, PrisustvoMatricaInfo } from '../../../core/api/grupe.models';
import { GRUPE_RUTE } from '../grupe.routes';

const PREDMETI = [
  { id: 1, naziv: 'Uvod u primenu računara' },
  { id: 2, naziv: 'Nacrtna geometrija' },
  { id: 3, naziv: 'Statika' },
];

const pregled: GrupaPregledInfo = {
  grupa: { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 1 },
  brojStudenata: 1,
  brojPredavanja: 3,
  prosecnaPrisutnost: 0.5,
  otvorenOnboarding: null,
  studenti: [],
};

/** Predavanja grupe u godini: predmeti 1 i 2 (redom 1, 2, 1), pa je podrazumevani "Nacrtna geometrija" (prvi po nazivu). */
const predavanja = [1, 2, 1].map((p, i) => ({
  id: 10 + i,
  rb: i + 1,
  datum: '2025-10-07',
  tema: null,
  zavrseno: true,
  predmet: PREDMETI.find(x => x.id === p),
  grupa: pregled.grupa,
  brojPrisutnih: 1,
  brojStarijihPrisutnih: 0,
  brojStudenata: 1,
}));

const matrica: PrisustvoMatricaInfo = {
  predavanja: [{ id: 11, rb: 2, datum: '2025-10-14', tema: 'Projekcije' }],
  studenti: [
    {
      student: { id: 7, ime: 'Ana', prezime: 'Anić', godina: 2025, indeks: 'GD1', email: null, brojTelefona: null, datumRodjenja: null, opstina: null },
      tip: { '11': 'ZADATAK' },
    },
  ],
};

describe('GrupaPrisustvoTab', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'grupe', children: GRUPE_RUTE }], withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  const el = () => harness.fixture.nativeElement as HTMLElement;
  const stabilno = async () => {
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  };

  /** Otvara tab, odgovara na pregled, referentne podatke i listu predavanja; vraća zahtev za predavanja. */
  async function otvori(url: string): Promise<TestRequest> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    http.expectOne('api/grupe/4/pregled').flush(pregled);
    await stabilno();
    http.expectOne('api/predmeti').flush(PREDMETI);
    http.expectOne('api/grupe').flush([pregled.grupa]);
    const lista = http.expectOne(r => r.url === 'api/predavanja/pretraga');
    lista.flush({ content: predavanja, page: { size: 100, number: 0, totalElements: 3, totalPages: 1 } });
    await stabilno();
    return lista;
  }

  const zahtevMatrice = () => http.expectOne(r => r.url === 'api/grupe/4/prisustvo');

  it('uvek šalje školsku godinu: predavanja grupe u godini, pa prisustvo?predmetId=<prvi po nazivu>&godina=<godina>', { timeout: 15_000 }, async () => {
    const lista = await otvori('/grupe/4/prisustvo?godina=2024');
    expect(lista.request.params.get('grupaId')).toBe('4');
    expect(lista.request.params.get('godina')).toBe('2024');
    expect(lista.request.params.get('size')).toBe('100');

    const m = zahtevMatrice();
    expect(m.request.params.get('predmetId')).toBe('2');
    expect(m.request.params.get('godina')).toBe('2024');
    m.flush(matrica);
    // zoneless: prikaz matrice stiže posle mikrotaskova koje whenStable ne prati
    await vi.waitFor(() => {
      harness.fixture.detectChanges();
      expect(el().textContent).toContain('Predmet: Nacrtna geometrija');
      expect(el().querySelector('app-heatmap td.ukupno')?.textContent).toBe('1/1'); // ZADATAK je prisustvo
    });
  });

  it('bez ?godina šalje tekuću školsku godinu', { timeout: 15_000 }, async () => {
    const lista = await otvori('/grupe/4/prisustvo');
    expect(lista.request.params.get('godina')).toBe(String(tekucaSkolskaGodina()));
    const m = zahtevMatrice();
    expect(m.request.params.get('godina')).toBe(String(tekucaSkolskaGodina()));
    m.flush(matrica);
  });

  it('predmet iz linka se poštuje ako postoji', { timeout: 15_000 }, async () => {
    await otvori('/grupe/4/prisustvo?godina=2024&predmet=1');
    const m = zahtevMatrice();
    expect(m.request.params.get('predmetId')).toBe('1');
    m.flush(matrica);
  });

  it.each(['999', 'abc', '0'])('nepoznat ili neispravan predmet (%s) pada na podrazumevani, bez navigacije (URL ostaje)', { timeout: 15_000 }, async predmet => {
    await otvori(`/grupe/4/prisustvo?godina=2024&predmet=${predmet}`);
    const m = zahtevMatrice();
    expect(m.request.params.get('predmetId')).toBe('2');
    m.flush(matrica);
    await stabilno();
    expect(router.url).toBe(`/grupe/4/prisustvo?godina=2024&predmet=${predmet}`);
    http.expectNone(r => r.url === 'api/grupe/4/prisustvo');
  });

  it('grupa bez predavanja u godini: poruka, bez zahteva za prisustvo', { timeout: 15_000 }, async () => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/grupe/4/prisustvo?godina=2023');
    http.expectOne('api/grupe/4/pregled').flush(pregled);
    await stabilno();
    http.expectOne('api/predmeti').flush(PREDMETI);
    http.expectOne('api/grupe').flush([pregled.grupa]);
    http.expectOne(r => r.url === 'api/predavanja/pretraga').flush({ content: [], page: { size: 100, number: 0, totalElements: 0, totalPages: 0 } });
    await stabilno();
    http.expectNone(r => r.url === 'api/grupe/4/prisustvo');
    expect(el().textContent).toContain('Grupa nema nijedno predavanje u školskoj godini 2023/24');
  });
});
