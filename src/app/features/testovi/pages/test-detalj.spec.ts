import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StudentListItem } from '../../../core/api/studenti.api';
import { StudentPicker } from '../../../shared/ui/student-picker';
import { DEBOUNCE_REDA_MS } from '../data-access/test.store';
import { TestDetails, TestPolaganjeInfo } from '../../../core/api/testovi.models';
import { TestDetalj } from './test-detalj';

const GRUPA = { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 30 };

const ana: TestPolaganjeInfo = {
  id: 11,
  student: { id: 1, ime: 'Ana', prezime: 'Radić', indeks: 'GD2', godina: 2025 },
  grupa: null,
  ostvareniPoeni: null,
  prepisivao: false,
  polozio: null,
  napomene: null,
};

function test(polaganja: TestPolaganjeInfo[]): TestDetails {
  return {
    id: 5,
    tipTesta: { id: 2, naziv: 'Kolokvijum 1', aktivan: true },
    predmet: { id: 1, naziv: 'UPR' },
    grupa: GRUPA,
    datum: '2025-10-16',
    maxPoena: 30,
    pragProlaza: 15,
    pregledan: false,
    grupe: ['A', 'B'],
    polaganja,
    statistika: null,
  };
}

const ivana: StudentListItem = {
  id: 9,
  ime: 'Ivana',
  prezime: 'Kostić',
  indeks: 'GD14',
  godina: 2023,
  email: null,
  brojTelefona: null,
  grupa: { id: 2, naziv: 'GD-2023', godinaUpisa: 2023, brojStudenata: 25 },
};

describe('TestDetalj', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'testovi/:id', component: TestDetalj }], withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const el = () => harness.fixture.nativeElement as HTMLElement;

  async function otvori(polaganja: TestPolaganjeInfo[]) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/testovi/5');
    http.expectOne('api/test/5').flush(test(polaganja));
    http.match('api/predmeti/1/tipovi').forEach(r => r.flush([{ id: 2, naziv: 'Kolokvijum 1' }]));
    harness.detectChanges();
    await harness.fixture.whenStable();
  }

  it('poeni veći od max: poruka u redu, polje je neispravno i ništa se ne šalje', async () => {
    await otvori([ana]);
    vi.useFakeTimers();
    const polje = el().querySelector<HTMLInputElement>('tr[data-student="1"] input[data-kolona="poeni"]')!;
    polje.value = '45';
    polje.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(el().querySelector('tr[data-student="1"] [data-greska]')?.textContent).toContain('Najviše 30.');
    expect(polje.getAttribute('aria-invalid')).toBe('true');
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS * 2);
    http.expectNone('api/test/5/polaganje');
    expect(el().querySelector('[data-kpi-uneto]')?.textContent).toContain('0');
  });

  it('ispravni poeni ulaze u statistiku uživo pre odgovora servera', async () => {
    await otvori([ana, { ...ana, id: 12, student: { id: 2, ime: 'Bora', prezime: 'B', indeks: 'GD3', godina: 2025 }, grupa: 'A', ostvareniPoeni: 10 }]);
    const polje = el().querySelector<HTMLInputElement>('tr[data-student="1"] input[data-kolona="poeni"]')!;
    polje.value = '20';
    polje.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(el().querySelector('[data-kpi-prosek]')?.textContent).toContain('15');
    // Ana nema varijantu: red traži izbor i ne šalje se
    expect(el().querySelector('tr[data-student="1"] [data-greska]')?.textContent).toContain('Izaberi varijantu.');
  });

  it('stariji student izabran u biraču ulazi u tabelu sa oznakom "stariji"', async () => {
    await otvori([ana]);
    const otvoriBirac = vi.spyOn(StudentPicker, 'otvori').mockReturnValue(of([ivana]));
    el().querySelector<HTMLButtonElement>('button[data-dodaj]')!.click();
    harness.detectChanges();
    expect(otvoriBirac.mock.calls[0][1]).toMatchObject({ grupaId: 4, iskljuci: [1] });
    const req = http.expectOne('api/test/5/polaganje');
    expect(req.request.body).toEqual({ id: 9 });
    req.flush({ ...test([ana, { ...ana, id: 19, student: { id: 9, ime: 'Ivana', prezime: 'Kostić', indeks: 'GD14', godina: 2023 } }]) });
    harness.detectChanges();
    const red = el().querySelector('tr[data-student="9"]');
    expect(red?.textContent).toContain('Ivana Kostić');
    expect(red?.textContent).toContain('stariji');
    expect(red?.textContent).toContain('GD14/2023');
  });

  it('"Završi evidentiranje" je onemogućeno dok ima ispitanika bez poena, uz razlog', async () => {
    await otvori([ana]);
    expect(el().querySelector<HTMLButtonElement>('button[data-zavrsi]')!.disabled).toBe(true);
    expect(el().querySelector('[data-razlog]')?.textContent).toContain('još 1');
  });

  it('varijanta koja fali: aria-invalid i opis na izboru varijante, ne na poenima', async () => {
    await otvori([ana]);
    const polje = el().querySelector<HTMLInputElement>('tr[data-student="1"] input[data-kolona="poeni"]')!;
    polje.value = '12';
    polje.dispatchEvent(new Event('input'));
    harness.detectChanges();
    const varijanta = el().querySelector('tr[data-student="1"] mat-button-toggle-group')!;
    expect(varijanta.getAttribute('aria-invalid')).toBe('true');
    expect(varijanta.getAttribute('aria-describedby')).toBe('greska-reda-1');
    expect(polje.getAttribute('aria-invalid')).toBeNull();
  });

  it('greška servera se vidi u redu (uneto ostaje) do sledeće izmene', async () => {
    await otvori([ana]);
    vi.useFakeTimers();
    el().querySelector<HTMLElement>('tr[data-student="1"] [data-varijanta="A"] button')!.click();
    const polje = el().querySelector<HTMLInputElement>('tr[data-student="1"] input[data-kolona="poeni"]')!;
    polje.value = '12';
    polje.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    http.expectOne('api/test/5/polaganje').flush({ reason: 'Test je oznacen kao pregledan!' }, { status: 400, statusText: 'Bad Request' });
    http.expectOne('api/test/5').flush(test([ana]));
    harness.detectChanges();
    expect(el().querySelector('tr[data-student="1"] [data-greska-servera]')?.textContent).toContain('Test je oznacen kao pregledan!');
    expect(polje.value).toBe('12');
    expect(polje.getAttribute('aria-invalid')).toBe('true');
    polje.value = '13';
    polje.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(el().querySelector('tr[data-student="1"] [data-greska-servera]')).toBeNull();
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    http.expectOne('api/test/5/polaganje').flush(test([{ ...ana, grupa: 'A', ostvareniPoeni: 13 }]));
  });

  it('ista komponenta, drugi test (/testovi/5 -> /testovi/6): izmena ide na test 5, pa se učitava test 6', async () => {
    await otvori([ana]);
    vi.useFakeTimers();
    el().querySelector<HTMLElement>('tr[data-student="1"] [data-varijanta="B"] button')!.click();
    const polje = el().querySelector<HTMLInputElement>('tr[data-student="1"] input[data-kolona="poeni"]')!;
    polje.value = '9';
    polje.dispatchEvent(new Event('input'));
    vi.useRealTimers();
    const komponenta = harness.routeDebugElement!.componentInstance;
    await harness.navigateByUrl('/testovi/6');
    expect(harness.routeDebugElement!.componentInstance).toBe(komponenta); // komponenta je ponovo upotrebljena
    http.expectNone('api/test/6');
    const req = http.expectOne('api/test/5/polaganje');
    expect(req.request.body).toMatchObject({ studentId: 1, grupa: 'B', ostvareniPoeni: 9 });
    req.flush(test([{ ...ana, grupa: 'B', ostvareniPoeni: 9 }]));
    http.expectOne('api/test/6').flush({ ...test([]), id: 6, tipTesta: { id: 3, naziv: 'Popravni', aktivan: true } });
    harness.detectChanges();
    expect(el().querySelector('h1')?.textContent).toContain('Popravni');
    expect(el().querySelector('tr[data-student="1"]')).toBeNull();
  });

  it('prag prolaza u zaglavlju: prazno briše prag, prag iznad max je greška ispod polja (ne šalje se)', async () => {
    await otvori([ana]);
    const polje = el().querySelector<HTMLInputElement>('input[data-prag]')!;
    expect(polje.value).toBe('15');
    polje.value = '31';
    polje.dispatchEvent(new Event('input'));
    polje.dispatchEvent(new Event('blur'));
    harness.detectChanges();
    expect(el().querySelector('[data-prag-opis]')?.textContent).toContain('Prag prolaza mora biti između 0 i maksimalnog broja poena.');
    http.expectNone('api/test/5/prag-prolaza');
    polje.value = '';
    polje.dispatchEvent(new Event('input'));
    polje.dispatchEvent(new Event('blur'));
    const req = http.expectOne('api/test/5/prag-prolaza');
    expect(req.request.body).toEqual({ pragProlaza: null });
    req.flush({ ...test([ana]), pragProlaza: null });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelector('[data-kpi-prolaz]')?.textContent).toContain('—');
    expect(el().textContent).toContain('Bez praga test nema prolaznost.');
  });
});
