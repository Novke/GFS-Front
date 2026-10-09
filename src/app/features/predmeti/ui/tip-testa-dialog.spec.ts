import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PredmetDialog } from './predmet-dialog';
import { TipTestaDialog } from './tip-testa-dialog';

describe('dijalozi predmeta', () => {
  let http: HttpTestingController;
  const zatvori = vi.fn();

  beforeEach(() => {
    zatvori.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: { predmetId: 3 } },
        { provide: MatDialogRef, useValue: { close: zatvori } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function upisi(f: ComponentFixture<unknown>, v: string): void {
    const el = f.nativeElement as HTMLElement;
    const i = el.querySelector<HTMLInputElement>('[data-naziv]')!;
    i.value = v;
    i.dispatchEvent(new Event('input'));
    el.querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    f.detectChanges();
  }

  it('nov tip: kraći od 2 znaka se ne šalje; ispravan ide na POST test/tip sa predmetom', () => {
    const f = TestBed.createComponent(TipTestaDialog);
    f.detectChanges();
    upisi(f, ' X ');
    http.expectNone(() => true);
    expect((f.nativeElement as HTMLElement).textContent).toContain('Najmanje 2 znakova.');

    upisi(f, '  Popravni ');
    const req = http.expectOne('api/test/tip');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ naziv: 'Popravni', predmetId: 3 });
    req.flush({ id: 9, naziv: 'Popravni', aktivan: true });
    expect(zatvori).toHaveBeenCalledWith({ id: 9, naziv: 'Popravni', aktivan: true });
  });

  it('nov predmet: prazan naziv se ne šalje; greška servera ostaje u dijalogu', () => {
    const f = TestBed.createComponent(PredmetDialog);
    f.detectChanges();
    upisi(f, '   ');
    http.expectNone(() => true);

    upisi(f, 'Statika');
    const req = http.expectOne('api/predmeti');
    expect(req.request.body).toEqual({ naziv: 'Statika' });
    req.flush({ reason: 'Predmet već postoji.' }, { status: 400, statusText: 'Bad Request' });
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Predmet već postoji.');
    expect(zatvori).not.toHaveBeenCalled();
  });
});
