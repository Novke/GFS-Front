import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { IzvodjenjaApi } from '../data-access/izvodjenja.api';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { PokreniCmd, PredavanjeZaPokretanje } from '../data-access/uzivo.models';
import { PokreniDialog, opisPredavanja, pokreniCmd, pokretanjeBezDijaloga } from './pokreni.dialog';

describe('pokretanje (spec 6.3)', () => {
  it('?predavanje=ID pokreće odmah, vezano za predavanje, i kad nema pitanja', () => {
    expect(pokretanjeBezDijaloga('42', 3)).toEqual({ cuvanje: true, grupaId: null, predavanjeId: 42 });
    expect(pokretanjeBezDijaloga('42', 0)).toEqual({ cuvanje: true, grupaId: null, predavanjeId: 42 });
  });

  it('bez pitanja nema dijaloga i ne čuva se', () => {
    expect(pokretanjeBezDijaloga(null, 0)).toEqual({ cuvanje: false, grupaId: null, predavanjeId: null });
  });

  it('sa pitanjima i bez predavanja u ruti otvara dijalog', () => {
    expect(pokretanjeBezDijaloga(null, 2)).toBeNull();
    expect(pokretanjeBezDijaloga('abc', 2)).toBeNull();
    expect(pokretanjeBezDijaloga('0', 2)).toBeNull();
  });

  it('izbor u dijalogu daje komandu', () => {
    expect(pokreniCmd('predavanje', 5, null, false)).toEqual({ cuvanje: true, grupaId: null, predavanjeId: 5, boduje: false });
    expect(pokreniCmd('grupa', null, 9, false)).toEqual({ cuvanje: true, grupaId: 9, predavanjeId: null, boduje: false });
    expect(pokreniCmd('bezGrupe', 5, 9, false)).toEqual({ cuvanje: true, grupaId: null, predavanjeId: null, boduje: false });
    expect(pokreniCmd('necuvaj', 5, 9, false)).toEqual({ cuvanje: false, grupaId: null, predavanjeId: null, boduje: false });
  });

  it('boduje se samo uz predavanje', () => {
    expect(pokreniCmd('predavanje', 5, null, true)).toEqual({ cuvanje: true, grupaId: null, predavanjeId: 5, boduje: true });
    expect(pokreniCmd('grupa', null, 9, true)).toEqual({ cuvanje: true, grupaId: 9, predavanjeId: null, boduje: false });
    expect(pokreniCmd('bezGrupe', null, null, true)?.boduje).toBe(false);
    expect(pokreniCmd('necuvaj', null, null, true)?.boduje).toBe(false);
  });

  it('izbor bez izabranog predavanja ili grupe nije potpun', () => {
    expect(pokreniCmd('predavanje', null, 9, true)).toBeNull();
    expect(pokreniCmd('grupa', 5, null, false)).toBeNull();
  });

  it('opis predavanja: datum, redni broj, grupa i tema', () => {
    expect(opisPredavanja({ id: 1, rb: 3, datum: '2026-10-07', tema: 'Statika', zavrseno: false, grupa: { id: 2, naziv: 'GD-2025' } }))
      .toBe('7.10.2026. · 3. predavanje · GD-2025 · Statika');
    expect(opisPredavanja({ id: 1, rb: 1, datum: '2026-01-15', tema: null, zavrseno: null, grupa: null }))
      .toBe('15.1.2026. · 1. predavanje');
  });
});

describe('PokreniDialog (bodovanje)', () => {
  const predavanje: PredavanjeZaPokretanje = {
    id: 5, rb: 3, datum: '2026-10-07', tema: 'Statika', zavrseno: false, grupa: { id: 2, naziv: 'GD-2025' },
  };
  let pokreni: ReturnType<typeof vi.fn>;
  let zatvori: ReturnType<typeof vi.fn>;

  function otvori(predavanja: PredavanjeZaPokretanje[] = [predavanje]): ComponentFixture<PokreniDialog> {
    pokreni = vi.fn(() => of({ id: 70 }));
    zatvori = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: PrezentacijeApi, useValue: { predavanja: () => of(predavanja), grupe: () => of([{ id: 9, naziv: 'GD-2025' }]) } },
        { provide: IzvodjenjaApi, useValue: { pokreni } },
        { provide: MAT_DIALOG_DATA, useValue: { prezentacijaId: 3, naziv: 'Konverzije' } },
        { provide: MatDialogRef, useValue: { close: zatvori } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    const f = TestBed.createComponent(PokreniDialog);
    f.detectChanges();
    return f;
  }

  const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
  const boduje = (f: ComponentFixture<unknown>) => el(f).querySelector<HTMLInputElement>('mat-checkbox input[type="checkbox"]')!;
  const dugme = (f: ComponentFixture<unknown>, tekst: string) =>
    Array.from(el(f).querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim() === tekst)!;
  const radio = (f: ComponentFixture<unknown>, vrednost: string) =>
    el(f).querySelector<HTMLInputElement>(`mat-radio-button[value="${vrednost}"] input`)!;

  it('"Boduje se" je aktivno samo uz predavanje, sa napomenom da traži prijavu studenata', () => {
    const f = otvori();
    expect(el(f).textContent).toContain('Boduje se (upisuje prisustvo i rešene zadatke studentima)');
    expect(boduje(f).disabled).toBe(false);
    const opis = boduje(f).getAttribute('aria-describedby');
    expect(opis && el(f).querySelector(`#${opis}`)?.textContent).toContain('Traži prijavu studenata.');

    radio(f, 'grupa').click();
    f.detectChanges();
    expect(boduje(f).disabled).toBe(true);
  });

  it('uključeno "Boduje se" šalje boduje: true; posle prelaska na grupu više ne', () => {
    const f = otvori();
    boduje(f).click();
    f.detectChanges();
    dugme(f, 'Pokreni').click();
    expect(pokreni).toHaveBeenCalledWith(3, { cuvanje: true, grupaId: null, predavanjeId: 5, boduje: true } satisfies PokreniCmd);
    expect(zatvori).toHaveBeenCalledWith({ id: 70 });
  });

  it('za grupu boduje je false i kad je polje bilo uključeno; povratak na predavanje ga ne uključuje sam', () => {
    const f = otvori();
    boduje(f).click();
    f.detectChanges();
    radio(f, 'grupa').click();
    f.detectChanges();
    expect(boduje(f).checked).toBe(false);
    // grupa se bira u mat-select-u; ovde je dovoljno da komanda bez izabrane grupe nije potpuna
    expect(dugme(f, 'Pokreni').disabled).toBe(true);
    radio(f, 'bezGrupe').click();
    f.detectChanges();
    dugme(f, 'Pokreni').click();
    expect(pokreni).toHaveBeenCalledWith(3, { cuvanje: true, grupaId: null, predavanjeId: null, boduje: false });
    radio(f, 'predavanje').click();
    f.detectChanges();
    expect(boduje(f).disabled).toBe(false);
    expect(boduje(f).checked).toBe(false);
  });

  it('409 servera ("Prijava studenata još nije dostupna.") ostaje u traci dijaloga, dijalog otvoren', () => {
    const f = otvori();
    pokreni.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 409, error: { reason: 'Prijava studenata još nije dostupna.', time: '2026-10-19T10:00:00' },
    })));
    boduje(f).click();
    f.detectChanges();
    dugme(f, 'Pokreni').click();
    f.detectChanges();
    expect(el(f).querySelector('[role="alert"]')?.textContent).toContain('Prijava studenata još nije dostupna.');
    expect(zatvori).not.toHaveBeenCalled();
    expect(dugme(f, 'Pokreni').disabled).toBe(false);
  });

  it('bez predavanja "Boduje se" nije dostupno', () => {
    const f = otvori([]);
    expect(boduje(f).disabled).toBe(true);
  });
});
