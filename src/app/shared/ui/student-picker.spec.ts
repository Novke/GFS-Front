import { OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../../core/api/api-error';
import { StudentListItem } from '../../core/api/studenti.api';
import { IKONE } from '../../core/layout/icons';
import { Strana } from '../models/strana';
import { StudentPicker } from './student-picker';

const GD25 = { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: null };
const GD24 = { id: 3, naziv: 'GD-2024', godinaUpisa: 2024, brojStudenata: null };

function student(id: number, ime: string, prezime: string, indeks: string, grupa = GD25): StudentListItem {
  return { id, ime, prezime, indeks, godina: grupa.godinaUpisa, email: null, brojTelefona: null, grupa };
}

const IZ_GRUPE = [student(1, 'Andrej', 'Radić', 'GD2'), student(2, 'Danica', 'Vuković', 'GD3'), student(5, 'Marko', 'Ilić', 'GD6')];
const STARIJI = [student(7, 'Ivana', 'Kostić', 'GD14', GD24)];

function strana(content: StudentListItem[]): Strana<StudentListItem> {
  return { content, page: { size: 100, number: 0, totalElements: content.length, totalPages: 1 } };
}

describe('StudentPicker', () => {
  let http: HttpTestingController;
  let dialog: MatDialog;
  let overlay: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    dialog = TestBed.inject(MatDialog);
    overlay = TestBed.inject(OverlayContainer).getContainerElement();
    // Ikone bez HTTP-a i bez grešaka "Error retrieving icon" u izlazu testa.
    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    for (const ime of IKONE) {
      registry.addSvgIconLiteral(ime, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
    }
  });

  afterEach(() => {
    dialog.closeAll();
    vi.useRealTimers();
  });

  const tick = () => new Promise(r => setTimeout(r));
  /** Posle odgovora ili klika: sačekaj makrotask pa eksplicitno osveži prikaz (dijalog je OnPush, zahtev je van zone). */
  const osvezi = async () => {
    await tick();
    TestBed.tick();
  };
  const zahtev = (): TestRequest => http.expectOne(r => r.url === 'api/studenti/pretraga');
  const redovi = () => [...overlay.querySelectorAll<HTMLElement>('[data-student]')];
  const dodaj = () => overlay.querySelector<HTMLButtonElement>('[data-dodaj]')!;

  async function otvori(iskljuci: number[] = []) {
    const rez = vi.fn();
    StudentPicker.otvori(dialog, { grupaId: 4, iskljuci, naslov: 'Dodaj ispitanike' }).subscribe(rez);
    await osvezi();
    return rez;
  }

  it('"Iz grupe" traži studente grupe (grupaId), tiho (LOCAL_ERRORS), do 100 po strani', async () => {
    await otvori();
    const req = zahtev();
    expect(req.request.params.get('grupaId')).toBe('4');
    expect(req.request.params.has('starijiOdGrupe')).toBe(false);
    expect(req.request.params.get('size')).toBe('100');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush(strana(IZ_GRUPE));
    await osvezi();
    expect(overlay.textContent).toContain('Dodaj ispitanike');
    expect(redovi()).toHaveLength(3);
  });

  it('ne nudi studente iz `iskljuci`', async () => {
    await otvori([2, 5]);
    zahtev().flush(strana(IZ_GRUPE));
    await osvezi();
    expect(redovi().map(r => r.dataset['student'])).toEqual(['1']);
    expect(overlay.textContent).not.toContain('Vuković');
  });

  it('kad su svi iz grupe već dodati, prikazuje prazno stanje', async () => {
    await otvori([1, 2, 5]);
    zahtev().flush(strana(IZ_GRUPE));
    await osvezi();
    expect(redovi()).toHaveLength(0);
    expect(overlay.textContent).toContain('Svi studenti su već dodati.');
  });

  it('"Stariji studenti" traži starijiOdGrupe i označava redove "stariji"', async () => {
    await otvori();
    zahtev().flush(strana(IZ_GRUPE));
    await osvezi();
    overlay.querySelector<HTMLElement>('[data-rezim=stariji] button')!.click();
    await osvezi();
    const req = zahtev();
    expect(req.request.params.get('starijiOdGrupe')).toBe('4');
    expect(req.request.params.has('grupaId')).toBe(false);
    req.flush(strana(STARIJI));
    await osvezi();
    expect(redovi()).toHaveLength(1);
    expect(redovi()[0].textContent).toContain('stariji');
    expect(redovi()[0].textContent).toContain('GD14/2024');
  });

  it('pocetniRezim "stariji" otvara tab "Stariji studenti" bez zahteva za grupu', async () => {
    StudentPicker.otvori(dialog, { grupaId: 4, iskljuci: [], naslov: 'Stariji', pocetniRezim: 'stariji' }).subscribe();
    await osvezi();
    const req = zahtev();
    expect(req.request.params.get('starijiOdGrupe')).toBe('4');
    expect(req.request.params.has('grupaId')).toBe(false);
    req.flush(strana(STARIJI));
    await osvezi();
    expect(redovi()).toHaveLength(1);
  });

  it('višestruki izbor: "Dodaj (n)" vraća izabrane, i preko tabova', async () => {
    const rez = await otvori();
    expect(dodaj().disabled).toBe(true);
    zahtev().flush(strana(IZ_GRUPE));
    await osvezi();
    redovi()[0].querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    await osvezi();
    overlay.querySelector<HTMLElement>('[data-rezim=stariji] button')!.click();
    await osvezi();
    zahtev().flush(strana(STARIJI));
    await osvezi();
    redovi()[0].querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    await osvezi();
    expect(dodaj().textContent).toContain('Dodaj (2)');
    dodaj().click();
    await vi.waitFor(() => expect(rez).toHaveBeenCalled());
    expect(rez.mock.calls[0][0].map((s: StudentListItem) => s.id)).toEqual([1, 7]);
  });

  it('pretraga po imenu ili indeksu šalje q posle debounce-a', async () => {
    await otvori();
    zahtev().flush(strana(IZ_GRUPE));
    await osvezi();
    const polje = overlay.querySelector<HTMLInputElement>('input[type=search]')!;
    polje.value = 'gd1';
    polje.dispatchEvent(new Event('input'));
    http.expectNone(r => r.url === 'api/studenti/pretraga');
    await vi.waitFor(() => {
      const req = zahtev();
      expect(req.request.params.get('q')).toBe('gd1');
      req.flush(strana([]));
    });
    await osvezi();
    expect(overlay.textContent).toContain('Nema studenata za „gd1“.');
  });

  it('skraćen rezultat: napomena broji ponuđene redove (posle isključenja)', async () => {
    await otvori([2, 5]);
    zahtev().flush({ ...strana(IZ_GRUPE), page: { size: 100, number: 0, totalElements: 150, totalPages: 2 } });
    await osvezi();
    expect(overlay.textContent).toContain('Prikazano 1 od 150 pronađenih. Suzi pretragu.');
  });

  it('skraćen rezultat u kome su svi ponuđeni već dodati: prazno stanje i napomena', async () => {
    await otvori([1, 2, 5]);
    zahtev().flush({ ...strana(IZ_GRUPE), page: { size: 100, number: 0, totalElements: 150, totalPages: 2 } });
    await osvezi();
    expect(redovi()).toHaveLength(0);
    expect(overlay.textContent).toContain('Svi prikazani studenti su već dodati.');
    expect(overlay.textContent).toContain('Prikazano 0 od 150 pronađenih. Suzi pretragu.');
  });

  it('Odustani vraća prazan niz', async () => {
    const rez = await otvori();
    zahtev().flush(strana(IZ_GRUPE));
    await osvezi();
    overlay.querySelector<HTMLButtonElement>('[data-odustani]')!.click();
    await vi.waitFor(() => expect(rez).toHaveBeenCalledExactlyOnceWith([]));
  });

  it('greška prikazuje panel sa "Pokušaj ponovo" koji ponavlja zahtev', async () => {
    await otvori();
    zahtev().flush({ reason: 'Grupa ne postoji.' }, { status: 404, statusText: 'Not Found' });
    await osvezi();
    expect(overlay.textContent).toContain('Grupa ne postoji.');
    overlay.querySelector<HTMLButtonElement>('[data-ponovo]')!.click();
    await osvezi();
    zahtev().flush(strana(IZ_GRUPE));
    await osvezi();
    expect(redovi()).toHaveLength(3);
  });
});
