import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StudentInfo } from '../data-access/grupe.models';
import { StudentDialog, StudentDialogCfg } from './student-dialog';

const student: StudentInfo = {
  id: 7,
  ime: 'Ana',
  prezime: 'Anić',
  godina: 2025,
  indeks: 'GD12',
  brojTelefona: '064 111 222',
  email: 'ana@example.com',
  datumRodjenja: '2004-05-06',
  opstina: 'Subotica',
};

const grupe = [
  { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 30 },
  { id: 5, naziv: 'AR-2025', godinaUpisa: 2025, brojStudenata: 20 },
  { id: 6, naziv: 'GD-2024', godinaUpisa: 2024, brojStudenata: 25 },
];

describe('StudentDialog', () => {
  let http: HttpTestingController;
  const zatvori = vi.fn();

  function napravi(cfg: StudentDialogCfg) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: cfg },
        { provide: MatDialogRef, useValue: { close: zatvori } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(StudentDialog);
    f.detectChanges();
    return f;
  }

  beforeEach(() => zatvori.mockReset());
  afterEach(() => http.verify());

  it('premeštanje ne nudi trenutnu grupu i šalje pun zapis sa novom grupom', { timeout: 15_000 }, async () => {
    const f = napravi({ nacin: 'premesti', grupa: { id: 4, naziv: 'GD-2025', godinaUpisa: 2025 }, student });
    http.expectOne('api/predmeti').flush([]);
    http.expectOne('api/grupe').flush(grupe);
    f.detectChanges();
    await f.whenStable();

    const el = f.nativeElement as HTMLElement;
    (el.querySelector('[data-grupa] .mat-mdc-select-trigger') as HTMLElement).click();
    f.detectChanges();
    const opcije = [...document.querySelectorAll('mat-option')].map(o => o.textContent?.trim());
    expect(opcije).toEqual(['AR-2025', 'GD-2024']);
    expect(opcije).not.toContain('GD-2025');

    (document.querySelectorAll('mat-option')[0] as HTMLElement).click();
    f.detectChanges();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const req = http.expectOne('api/studenti/7');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      grupaId: 5,
      ime: 'Ana',
      prezime: 'Anić',
      indeks: 'GD12',
      godina: 2025,
      email: 'ana@example.com',
      brojTelefona: '064 111 222',
      datumRodjenja: '2004-05-06',
      opstina: 'Subotica',
    });
    req.flush({ ...student, id: 7 });
    expect(zatvori).toHaveBeenCalledWith({ ...student, id: 7 });
  });

  it('dodavanje ide u grupu dijaloga sa godinom upisa grupe; greška servera ostaje u dijalogu', () => {
    const f = napravi({ nacin: 'dodaj', grupa: { id: 4, naziv: 'GD-2025', godinaUpisa: 2023 } });
    const el = f.nativeElement as HTMLElement;
    const upisi = (sel: string, v: string) => {
      const i = el.querySelector(sel) as HTMLInputElement;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    };
    expect((el.querySelector('[data-godina]') as HTMLInputElement).value).toBe('2023');
    upisi('[data-ime]', ' Marko ');
    upisi('[data-prezime]', 'Ručni');
    upisi('[data-indeks]', 'GD99');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const req = http.expectOne('api/studenti');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({ grupaId: 4, ime: 'Marko', prezime: 'Ručni', indeks: 'GD99', godina: 2023, email: null });
    req.flush({ reason: 'Student sa ovim indeksom već postoji.' }, { status: 400, statusText: 'Bad Request' });
    f.detectChanges();
    expect(el.textContent).toContain('Student sa ovim indeksom već postoji.');
    expect(zatvori).not.toHaveBeenCalled();
  });
});
