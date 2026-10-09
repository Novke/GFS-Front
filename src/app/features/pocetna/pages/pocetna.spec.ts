import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KontrolnaTablaInfo } from '../../../core/api/pregled.api';
import { PREFS_KLJUC } from '../../../core/state/preferences.store';
import { DomaciListItem } from '../../domaci/data-access/domaci.models';
import { PredavanjeListItem } from '../../predavanja/data-access/predavanja.models';
import { TestListItem } from '../../testovi/data-access/testovi.models';
import { Pocetna } from './pocetna';

@Component({ template: 'stub' })
class Stub {}

const GRUPA = { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 38 };
const PREDMET = { id: 1, naziv: 'Uvod u primenu računara' };

const predavanje = (id: number, izmene: Partial<PredavanjeListItem> = {}): PredavanjeListItem => ({
  id, rb: id, datum: '2025-10-14', tema: null, zavrseno: false, predmet: PREDMET, grupa: GRUPA,
  brojPrisutnih: 31, brojStarijihPrisutnih: 0, brojStudenata: 38, ...izmene,
});
// `as`: lista testova je dobila `pragProlaza` (Task 21); fixture važi za oba oblika
const test = (id: number) => ({
  id, datum: '2025-10-09', tipTesta: { id: 1, naziv: `Kolokvijum ${id}` }, maxPoena: 30, pragProlaza: null, pregledan: false,
  predmet: PREDMET, grupa: GRUPA, brojPolaganja: 20, prosek: null, procenatProlaznosti: null,
}) as TestListItem;
const domaci = (id: number): DomaciListItem => ({
  id, naslov: `Domaći ${id}`, datum: '2025-10-08', pregledan: false, predmet: PREDMET, grupa: GRUPA, predavanje: null,
  brojUradjenih: 0, brojStudenata: 38,
});

const PRAZNA: KontrolnaTablaInfo = {
  sledece: null,
  uToku: [],
  nedelja: [],
  ceka: { testovi: [], domaci: [], prijave: [], nezavrsena: [], brojTestova: 0, brojDomacih: 0, brojPrijava: 0, brojNezavrsenih: 0 },
};

describe('Pocetna', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    // utorak 14. 10. 2025. u 9:30; samo Date je lažan, tajmeri rade normalno
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2025, 9, 14, 9, 30));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Pocetna },
          { path: 'predavanja/:id', component: Stub },
          { path: 'predavanja', component: Stub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  const el = () => harness.fixture.nativeElement as HTMLElement;

  async function otvori(odgovor: KontrolnaTablaInfo | 'greska' | object) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    const req = http.expectOne('api/pregled/kontrolna-tabla');
    if (odgovor === 'greska') {
      req.flush({ reason: 'Nešto nije u redu.' }, { status: 400, statusText: 'Bad Request' });
    } else {
      req.flush(odgovor);
    }
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  it('pozdrav po satu, datum i školska godina', async () => {
    await otvori(PRAZNA);
    expect(el().querySelector('h1')!.textContent).toBe('Dobro jutro');
    expect(el().textContent).toContain('Utorak, 14. oktobar · školska godina 2025/26');
  });

  it('popodne i uveče menja pozdrav', async () => {
    vi.setSystemTime(new Date(2025, 9, 14, 19, 0));
    await otvori(PRAZNA);
    expect(el().querySelector('h1')!.textContent).toBe('Dobro veče');
  });

  it('prazna tabla (sve prazno, sledece null) se renderuje bez grešaka: "Započni prvo predavanje", ništa ne čeka', async () => {
    await otvori(PRAZNA);
    expect(el().querySelector('[data-prvo]')!.textContent).toContain('Započni prvo predavanje');
    expect(el().querySelector('[data-prvo]')!.getAttribute('href')).toBe('/predavanja/novo');
    expect(el().querySelector('[data-nista]')).not.toBeNull();
    expect(el().querySelector('[data-u-toku]')).toBeNull();
    expect(el().querySelectorAll('.dan').length).toBe(5);
    expect(el().querySelector('[data-prazno]')).not.toBeNull(); // Nedavno
  });

  it('okrnjen odgovor (stari backend, prazan objekat) ne ruši ekran', async () => {
    await otvori({});
    expect(el().querySelector('[data-prvo]')).not.toBeNull();
    expect(el().querySelector('[data-nista]')).not.toBeNull();
  });

  it('greška učitavanja: panel sa "Pokušaj ponovo", a ponovni pokušaj učitava', async () => {
    await otvori('greska');
    expect(el().querySelector('[role=alert]')!.textContent).toContain('Nešto nije u redu.');
    el().querySelector<HTMLElement>('[data-ponovo]')!.click();
    http.expectOne('api/pregled/kontrolna-tabla').flush(PRAZNA);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelector('[role=alert]')).toBeNull();
  });

  it('sledeće predavanje: predmet, rb, grupa, studenti i stariji; "Drugi predmet ili grupa" vodi na formu', async () => {
    await otvori({ ...PRAZNA, sledece: { predmet: PREDMET, grupa: GRUPA, rb: 13, brojStudenata: 38, brojStarijih: 3 } });
    const hero = el().querySelector('app-sledece-predavanje')!;
    expect(hero.textContent).toContain('Uvod u primenu računara');
    expect(hero.textContent).toContain('Predavanje 13 · GD-2025');
    expect(hero.textContent).toContain('danas, 14. 10.');
    expect(hero.querySelector('[data-studenata]')!.textContent).toBe('38 studenata');
    expect(hero.querySelector('[data-starijih]')!.textContent).toBe('+ 3 starija');
    expect(hero.querySelector('[data-drugo]')!.getAttribute('href')).toBe('/predavanja/novo');
  });

  it('"Započni predavanje" odmah šalje start i otvara detalj; dvostruki klik šalje jedan zahtev', async () => {
    await otvori({ ...PRAZNA, sledece: { predmet: PREDMET, grupa: GRUPA, rb: 13, brojStudenata: 38, brojStarijih: 0 } });
    const dugme = el().querySelector<HTMLButtonElement>('[data-zapocni]')!;
    dugme.click();
    dugme.click();
    const req = http.expectOne('api/predavanja/start');
    expect(req.request.body).toEqual({ predmetId: 1, grupaId: 4 });
    req.flush({ id: 77 });
    await harness.fixture.whenStable();
    expect(router.url).toBe('/predavanja/77');
  });

  it('sledeće predavanje bez grupe: nema "Započni", nudi izbor grupe sa predizabranim predmetom', async () => {
    await otvori({ ...PRAZNA, sledece: { predmet: PREDMET, grupa: null, rb: 5, brojStudenata: 0, brojStarijih: 0 } });
    expect(el().querySelector('[data-zapocni]')).toBeNull();
    const link = el().querySelector<HTMLAnchorElement>('[data-drugo]')!;
    expect(link.textContent).toContain('Izaberi grupu');
    expect(link.getAttribute('href')).toBe('/predavanja/novo?predmet=1');
  });

  it('traka "U toku" po predavanju sa linkom "Nastavi"', async () => {
    await otvori({ ...PRAZNA, uToku: [predavanje(12, { tema: 'Petlje', grupa: null })] });
    const traka = el().querySelector('[data-u-toku]')!;
    expect(traka.textContent).toContain('Predavanje 12 · Petlje');
    expect(traka.textContent).toContain('31 prisutnih');
    expect(traka.querySelector('a')!.getAttribute('href')).toBe('/predavanja/12');
  });

  it('"Čeka na tebe": veze na filtrirane liste, prijave i detalj, i "+N još" iz ukupnih brojeva', async () => {
    await otvori({
      ...PRAZNA,
      ceka: {
        testovi: Array.from({ length: 10 }, (_, i) => test(i + 1)),
        domaci: [domaci(1), domaci(2)],
        prijave: [{ sesijaId: 9, grupa: GRUPA, brojNaCekanju: 4, istice: '2025-10-19T12:00:00' }],
        nezavrsena: [predavanje(9, { datum: '2025-09-30' })],
        brojTestova: 23,
        brojDomacih: 2,
        brojPrijava: 6,
        brojNezavrsenih: 1,
      },
    });
    const veza = (k: string) => el().querySelector<HTMLAnchorElement>(`[data-ceka="${k}"]`)!;
    expect(veza('testovi').getAttribute('href')).toBe('/testovi?status=za-evidentiranje');
    expect(veza('domaci').getAttribute('href')).toBe('/domaci?status=za-pregled');
    expect(veza('prijave-9').getAttribute('href')).toBe('/grupe/4/onboarding/9');
    expect(veza('nezavrsena').getAttribute('href')).toBe('/predavanja/9');
    expect(veza('nezavrsena').textContent).toContain('Završi');
    const ceka = el().querySelector('app-ceka-na-tebe')!.textContent!;
    expect(ceka).toContain('23'); // ukupno, ne 10
    expect(ceka).toContain('Kolokvijum 1 · GD-2025 · 9. 10., Kolokvijum 2');
    expect(ceka).toContain('+20 još'); // 23 - 3 prikazana imena
    expect(ceka).toContain('+2 prijave u drugim sesijama'); // 6 - 4
    expect(ceka).toContain('ističe 19. 10.');
  });

  it('"Ova nedelja": testovi su istaknuti, danas je označen, vikend se samo broji', async () => {
    await otvori({
      ...PRAZNA,
      nedelja: [
        { tip: 'PREDAVANJE', id: 5, datum: '2025-10-14', naslov: 'Predavanje 12', predmet: PREDMET, grupa: GRUPA },
        { tip: 'TEST', id: 3, datum: '2025-10-16', naslov: 'Kolokvijum 1', predmet: PREDMET, grupa: null },
        { tip: 'DOMACI', id: 8, datum: '2025-10-18', naslov: 'Domaći 4', predmet: PREDMET, grupa: GRUPA },
      ],
    });
    const danas = el().querySelector('.dan.danas')!;
    expect(danas.textContent).toContain('Uto 14. · danas');
    expect(danas.querySelector('a')!.getAttribute('href')).toBe('/predavanja/5');
    const t = el().querySelector<HTMLAnchorElement>('.ev.test')!;
    expect(t.getAttribute('href')).toBe('/testovi/3');
    expect(t.textContent).toContain('Uvod u primenu računara · —');
    expect(t.querySelector('mat-icon')).not.toBeNull();
    expect(el().querySelector('[data-vikend]')!.textContent).toContain('1 stavka');
  });

  it('"Nedavno" iz PreferencesStore', async () => {
    localStorage.setItem(PREFS_KLJUC, JSON.stringify({
      rezim: 'sistem',
      filteri: {},
      nedavno: [{ tip: 'grupa', id: 4, naslov: 'Grupa GD-2025', url: '/grupe/4' }],
    }));
    await otvori(PRAZNA);
    const a = el().querySelector<HTMLAnchorElement>('app-nedavno a')!;
    expect(a.textContent).toContain('Grupa GD-2025');
    expect(a.getAttribute('href')).toBe('/grupe/4');
  });
});
