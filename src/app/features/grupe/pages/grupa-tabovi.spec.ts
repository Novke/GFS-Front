import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GrupaPregledInfo, GrupaStudentStat } from '../data-access/grupe.models';
import { GrupaStore } from '../data-access/grupa.store';
import { GRUPE_RUTE } from '../grupe.routes';
import { GrupaDetalj } from './grupa-detalj';
import { parseVrsta } from './grupa-nastava-tab';
import { sortirajSesije } from './grupa-onboarding-tab';
import { parseGodina, predmetiSaPredavanja, uHeatmapu, vrednostCelije } from './grupa-prisustvo-tab';
import { filtrirajStudente, parseSortStudenata, sortirajStudente } from './grupa-studenti-tab';

function red(id: number, ime: string, prezime: string, indeks: string, prisutan: number, predavanja: number, izmene: Partial<GrupaStudentStat> = {}): GrupaStudentStat {
  return {
    student: { id, ime, prezime, indeks, godina: 2025, email: `${ime.toLowerCase()}@example.com`, brojTelefona: null, datumRodjenja: null, opstina: null },
    prisutan,
    predavanja,
    domaciUradjeno: 0,
    domaciUkupno: 0,
    poslednjiTest: null,
    ...izmene,
  };
}

describe('parametri tabova (zastareli i neispravni linkovi padaju na podrazumevano)', () => {
  it('sort studenata', () => {
    expect(parseSortStudenata('prisutnost,desc')).toEqual({ polje: 'prisutnost', smer: 'desc' });
    for (const los of [undefined, '', 'lozinka,asc', 'ime', 'ime,gore', 'IME,asc']) {
      expect(parseSortStudenata(los)).toEqual({ polje: 'indeks', smer: 'asc' });
    }
  });

  it('vrsta nastave', () => {
    expect(parseVrsta('testovi')).toBe('testovi');
    expect(parseVrsta('xyz')).toBe('predavanja');
    expect(parseVrsta(undefined)).toBe('predavanja');
  });

  it('školska godina prisustva', () => {
    const sada = new Date(2025, 10, 1);
    expect(parseGodina('2024', sada)).toBe(2024);
    expect(parseGodina('abc', sada)).toBe(2025);
    expect(parseGodina('1999', sada)).toBe(2025);
    expect(parseGodina('20240', sada)).toBe(2025);
  });
});

describe('studenti grupe: filter i sort', () => {
  const redovi = [red(1, 'Đorđe', 'Zec', 'GD10', 1, 4), red(2, 'Ana', 'Anić', 'GD2', 4, 4), red(3, 'Bojan', 'Bek', 'GD3', 0, 0)];

  it('pretraga bez dijakritika, po imenu, prezimenu i indeksu', () => {
    expect(filtrirajStudente(redovi, 'djordje').map(r => r.student.id)).toEqual([1]);
    expect(filtrirajStudente(redovi, 'gd2').map(r => r.student.id)).toEqual([2]);
    expect(filtrirajStudente(redovi, '  ')).toHaveLength(3);
  });

  it('indeks prirodno, prisutnost sa praznim na kraju u oba smera', () => {
    expect(sortirajStudente(redovi, { polje: 'indeks', smer: 'asc' }).map(r => r.student.id)).toEqual([2, 3, 1]);
    expect(sortirajStudente(redovi, { polje: 'prisutnost', smer: 'desc' }).map(r => r.student.id)).toEqual([2, 1, 3]);
    expect(sortirajStudente(redovi, { polje: 'prisutnost', smer: 'asc' }).map(r => r.student.id)).toEqual([1, 2, 3]);
    expect(sortirajStudente(redovi, { polje: 'ime', smer: 'asc' }).map(r => r.student.id)).toEqual([2, 3, 1]);
  });
});

describe('prisustvo: heatmap', () => {
  it('ćelije po predavanju; ZADATAK i zvezdica se broje kao prisutni', () => {
    const { redovi, kolone } = uHeatmapu({
      predavanja: [
        { id: 10, rb: 1, datum: '2025-10-07', tema: 'Uvod' },
        { id: 11, rb: 2, datum: '2025-10-14', tema: null },
        { id: 12, rb: 3, datum: null, tema: null },
      ],
      studenti: [{ student: red(1, 'Ana', 'Anić', 'GD2', 0, 0).student, tip: { '10': 'PRISUSTVO', '11': 'SA_ZVEZDICOM' } }],
    });
    expect(kolone.map(k => k.labela)).toEqual(['1', '2', '3']);
    expect(kolone[0].naslov).toBe('Predavanje 1 · 7. 10. 2025. · Uvod');
    expect(kolone[2].naslov).toBe('Predavanje 3 · —');
    expect(redovi[0].podlabela).toBe('GD2/2025');
    expect(kolone.map(k => vrednostCelije(redovi[0], k))).toEqual([1, 3, 0]);
    expect(uHeatmapu(null)).toEqual({ redovi: [], kolone: [] });
  });

  it('predmeti sa predavanja: bez duplikata, po nazivu', () => {
    const p = (id: number, naziv: string) => ({ predmet: { id, naziv } }) as never;
    expect(predmetiSaPredavanja([p(2, 'Statika'), p(1, 'Beton'), p(2, 'Statika')]).map(x => x.id)).toEqual([1, 2]);
  });
});

describe('sesije onboardinga', () => {
  it('najnovija prva', () => {
    const s = (id: number, kreirano: string) => ({ id, kreirano }) as never;
    expect(sortirajSesije([s(1, '2025-10-01T10:00:00'), s(3, '2025-10-02T10:00:00'), s(2, '2025-10-02T10:00:00')]).map((x: { id: number }) => x.id)).toEqual([3, 2, 1]);
  });
});

@Component({ template: '404' })
class NijePronadjeno {}

describe('rute grupe', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'grupe', children: GRUPE_RUTE }, { path: '**', component: NijePronadjeno }], withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const pregled: GrupaPregledInfo = {
    grupa: { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 1 },
    brojStudenata: 1,
    brojPredavanja: 0,
    prosecnaPrisutnost: null,
    otvorenOnboarding: null,
    studenti: [red(1, 'Ana', 'Anić', 'GD2', 0, 0)],
  };

  it('/grupe/:id ide na Pregled; nepoznat tab i neispravan id su 404 bez preusmeravanja', { timeout: 15_000 }, async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    await harness.navigateByUrl('/grupe/4');
    expect(router.url).toBe('/grupe/4/pregled');
    http.expectOne('api/grupe/4/pregled').flush(pregled);
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    http.match(r => r.url === 'api/predavanja/pretraga').forEach(r => r.flush({ content: [], page: { size: 5, number: 0, totalElements: 0, totalPages: 0 } }));

    await harness.navigateByUrl('/grupe/4/xyz');
    expect(router.url).toBe('/grupe/4/xyz');
    expect(harness.fixture.nativeElement.textContent).toContain('404');

    await harness.navigateByUrl('/grupe/abc');
    expect(harness.fixture.nativeElement.textContent).toContain('404');
  });

  it('tab Studenti: neispravan sort iz linka je podrazumevan, bez navigacije; "Novo predavanje" u Pregledu nosi grupu', { timeout: 15_000 }, async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    await harness.navigateByUrl('/grupe/4/studenti?sort=lozinka,asc');
    http.expectOne('api/grupe/4/pregled').flush(pregled);
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    expect(router.url).toBe('/grupe/4/studenti?sort=lozinka,asc');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(el.querySelector('th[aria-sort="ascending"] [data-sort="indeks"]')).not.toBeNull();

    await harness.navigateByUrl('/grupe/4/pregled');
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    http.match(r => r.url === 'api/predavanja/pretraga').forEach(r => r.flush({ content: [], page: { size: 5, number: 0, totalElements: 0, totalPages: 0 } }));
    harness.fixture.detectChanges();
    const novo = el.querySelector('[data-novo-predavanje]') as HTMLAnchorElement;
    expect(novo.getAttribute('href')).toBe('/predavanja/novo?grupa=4');
  });

  it('neuspelo osvežavanje učitane grupe: prikaz ostaje, iznad tabova je panel greške', { timeout: 15_000 }, async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/grupe/4/studenti');
    http.expectOne('api/grupe/4/pregled').flush(pregled);
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    const store = harness.fixture.debugElement.query(By.directive(GrupaDetalj)).injector.get(GrupaStore);
    store.osvezi();
    http.expectOne('api/grupe/4/pregled').flush({ reason: 'x' }, { status: 500, statusText: 'Server Error' });
    harness.fixture.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-greska-osvezavanja]')?.textContent).toContain('Osvežavanje grupe nije uspelo');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
  });
});
