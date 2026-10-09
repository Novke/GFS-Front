import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TestDetails, TestPolaganjeInfo } from '../data-access/testovi.models';
import { TestStatistika } from './test-statistika';

const polaganje = (id: number, poeni: number | null, grupa: 'A' | 'B' | null, prepisivao = false): TestPolaganjeInfo => ({
  id: 100 + id,
  student: { id, ime: 'S' + id, prezime: 'P', indeks: 'GD' + id, godina: 2025 },
  grupa,
  ostvareniPoeni: poeni,
  prepisivao,
  polozio: null, // server ga ne postavlja: prolaz računa front
  napomene: null,
});

function test(polaganja: TestPolaganjeInfo[], statistika: TestDetails['statistika'], pragProlaza: number | null = 15): TestDetails {
  return {
    id: 5,
    tipTesta: { id: 2, naziv: 'Kolokvijum 1', aktivan: true },
    predmet: { id: 1, naziv: 'UPR' },
    grupa: null, // stari podaci sa rupama: bez grupe
    datum: null,
    maxPoena: 30,
    pragProlaza,
    pregledan: true,
    grupe: ['A', 'B'],
    polaganja,
    statistika,
  };
}

describe('TestStatistika', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(() => {
    TestBed.configureTestingModule({
      // @defer (on viewport) treba IntersectionObserver, kog test okruženje nema: blok se prikazuje ručno
      deferBlockBehavior: DeferBlockBehavior.Manual,
      providers: [
        provideRouter([{ path: 'testovi/:id/statistika', component: TestStatistika }], withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const el = () => harness.fixture.nativeElement as HTMLElement;

  async function otvori(det: TestDetails) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/testovi/5/statistika');
    http.expectOne('api/test/5').flush(det);
    harness.detectChanges();
    await harness.fixture.whenStable();
  }

  it('serverska statistika, prolaz iz poena (bez prepisivanja), tabela po varijantama i "—" za podatke koji fale', async () => {
    await otvori(
      test([polaganje(1, 20, 'A'), polaganje(2, 10, 'B'), polaganje(3, 15, 'A', true), polaganje(4, null, null)], {
        ukupnoPolaganja: 4,
        prosecniPoeni: 15,
        minPoeni: 10,
        maxPoeni: 20,
        standardnaDevijacija: 4.08,
        brojPolozenih: 0,
        brojPalih: 3,
        procenatProlaznosti: 0,
        statistikaPoGrupi: [],
      }),
    );
    expect(el().querySelector('[data-kpi-ispitanika]')?.textContent).toContain('3 sa poenima');
    expect(el().querySelector('[data-kpi-prosek]')?.textContent).toContain('15');
    // prag 15: 20 prolazi, 10 ne, 15 je prepisivao: 1 od 3
    expect(el().querySelector('[data-kpi-prolaz]')?.textContent).toContain('33 %');
    expect(el().textContent).toContain('4,08');
    expect(el().textContent).toContain('—'); // datum i grupa testa ne postoje
    const redovi = [...el().querySelectorAll('table.varijante tbody tr')].map(r =>
      [...r.children].map(c => c.textContent?.trim()).join(' '),
    );
    expect(redovi).toEqual(['A 2 17,5 50 % 15 20', 'B 1 10 0 % 10 10']);
  });

  it('histogram (učitan sa @defer) ima korpe po 10 % max poena', async () => {
    await otvori(test([polaganje(1, 0, 'A'), polaganje(2, 30, 'A'), polaganje(3, 3, 'B')], null));
    const [blok] = await harness.fixture.getDeferBlocks();
    await blok.render(DeferBlockState.Complete);
    const opis = el().querySelector('app-histogram svg')?.getAttribute('aria-label') ?? '';
    expect(opis).toContain('0–3: 1');
    expect(opis).toContain('3–6: 1');
    expect(opis).toContain('27–30: 1');
    expect(opis).toContain('Ukupno 3.');
  });

  it('bez unetih poena: prazno stanje sa linkom na unos', async () => {
    await otvori(test([polaganje(1, null, null)], null));
    expect(el().querySelector('app-empty-state')?.textContent).toContain('Još nema unetih poena');
    expect(el().querySelector('app-histogram')).toBeNull();
  });

  it('bez praga: prolaz "—" u pločici i po varijantama; serverska prolaznost null ne smeta', async () => {
    await otvori(
      test(
        [polaganje(1, 20, 'A'), polaganje(2, 10, 'B')],
        {
          ukupnoPolaganja: 2,
          prosecniPoeni: 15,
          minPoeni: 10,
          maxPoeni: 20,
          standardnaDevijacija: 5,
          brojPolozenih: null,
          brojPalih: null,
          procenatProlaznosti: null,
          statistikaPoGrupi: [{ grupa: 'A', brojPolaganja: 1, prosecniPoeni: 20, procenatProlaznosti: null }],
        },
        null,
      ),
    );
    expect(el().querySelector('[data-kpi-prolaz]')?.textContent).toContain('—');
    expect(el().textContent).toContain('Bez praga test nema prolaznost.');
    const prolaz = [...el().querySelectorAll('table.varijante tbody tr')].map(r => r.children[3].textContent?.trim());
    expect(prolaz).toEqual(['—', '—']);
  });

  it('prag se menja i ovde (PATCH prag-prolaza), prolaz se odmah preračunava', async () => {
    await otvori(test([polaganje(1, 20, 'A'), polaganje(2, 10, 'B')], null, null));
    const polje = el().querySelector<HTMLInputElement>('input[data-prag]')!;
    polje.value = '10';
    polje.dispatchEvent(new Event('input'));
    polje.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    const req = http.expectOne('api/test/5/prag-prolaza');
    expect(req.request.body).toEqual({ pragProlaza: 10 });
    req.flush({ ...test([], null, 10), polaganja: null });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el().querySelector('[data-kpi-prolaz]')?.textContent).toContain('100 %');
  });
});
