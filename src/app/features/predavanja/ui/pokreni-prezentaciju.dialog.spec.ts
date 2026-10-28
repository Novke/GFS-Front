import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IzvodjenjeNaPredavanju, PrezentacijaZaIzbor, PrezentacijePredavanjaApi } from '../../../core/api/prezentacije-predavanja.api';
import { PokreniPrezentacijuDialog, PRAG_FILTERA, poRedosledu, stanjeStavke, urlKonzole } from './pokreni-prezentaciju.dialog';

const prez = (id: number, naziv: string, izmenjeno: string, aktivno: number | null = null): PrezentacijaZaIzbor =>
  ({ id, naziv, brojSlajdova: 4, brojPitanja: 2, izmenjeno, aktivnoIzvodjenjeId: aktivno });
const izv = (id: number, prezentacijaId: number, status: 'AKTIVNO' | 'ZAVRSENO' = 'AKTIVNO'): IzvodjenjeNaPredavanju => ({
  id, prezentacija: { id: prezentacijaId, naziv: 'x' }, status, pocetak: '2026-10-27T10:00:00', kraj: null, brojUcesnika: 0, brojPitanja: 0, cuvanje: true,
});

describe('izbor prezentacije za predavanje (čista logika)', () => {
  it('najskorije izmenjena prva, pri istom trenutku veći id', () => {
    const lista = [prez(1, 'A', '2026-10-01T10:00:00'), prez(3, 'C', '2026-10-20T08:00:00'), prez(2, 'B', '2026-10-20T08:00:00')];
    expect(poRedosledu(lista).map(p => p.id)).toEqual([3, 2, 1]);
  });

  it('stanje stavke: slobodna, "nastavi" za izvođenje ovog predavanja, zauzeta kad je u toku drugde', () => {
    expect(stanjeStavke(prez(1, 'A', 'x'), [])).toEqual({ vrsta: 'slobodna' });
    expect(stanjeStavke(prez(1, 'A', 'x', 55), [izv(55, 1)])).toEqual({ vrsta: 'nastavi', izvodjenjeId: 55 });
    expect(stanjeStavke(prez(1, 'A', 'x', 56), [izv(55, 1)])).toEqual({ vrsta: 'zauzeta' });
  });

  it('URL konzole je apsolutan prema <base href>', () => {
    const doc = { baseURI: 'https://gfs.trif.rs/' } as Document;
    expect(urlKonzole(doc, 7)).toBe('https://gfs.trif.rs/izvodjenja/7/konzola');
  });
});

describe('PokreniPrezentacijuDialog', () => {
  let pokreni: ReturnType<typeof vi.fn>;
  let zatvori: ReturnType<typeof vi.fn>;
  let otvoriProzor: ReturnType<typeof vi.spyOn>;
  let kartica: { location: { href: string }; close: ReturnType<typeof vi.fn>; opener: unknown };

  function otvori(prezentacije: PrezentacijaZaIzbor[], izvodjenja: IzvodjenjeNaPredavanju[] = []): ComponentFixture<PokreniPrezentacijuDialog> {
    pokreni = vi.fn(() => of(izv(70, 3)));
    zatvori = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: PrezentacijePredavanjaApi, useValue: { prezentacije: vi.fn(() => of(prezentacije)), izvodjenja: vi.fn(() => of(izvodjenja)), pokreni } },
        { provide: MAT_DIALOG_DATA, useValue: { predavanjeId: 40, predmetId: 4 } },
        { provide: MatDialogRef, useValue: { close: zatvori } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    const f = TestBed.createComponent(PokreniPrezentacijuDialog);
    f.detectChanges();
    return f;
  }

  const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
  const dugmeZa = (f: ComponentFixture<unknown>, id: number) =>
    el(f).querySelector<HTMLButtonElement>(`[data-prezentacija="${id}"] [data-pokreni]`)!;

  beforeEach(() => {
    kartica = { location: { href: 'about:blank' }, close: vi.fn(), opener: 'roditelj' };
    otvoriProzor = vi.spyOn(window, 'open').mockReturnValue(kartica as unknown as Window);
  });
  afterEach(() => otvoriProzor.mockRestore());

  it('lista je od najskorije izmenjene; filter se vidi tek kad je prezentacija više od praga', () => {
    const malo = otvori([prez(1, 'Stara', '2026-10-01T10:00:00'), prez(2, 'Nova', '2026-10-20T10:00:00')]);
    expect(Array.from(el(malo).querySelectorAll('[data-prezentacija]')).map(x => x.getAttribute('data-prezentacija'))).toEqual(['2', '1']);
    expect(el(malo).querySelector('[data-filter]')).toBeNull();
    TestBed.resetTestingModule();

    const mnogo = otvori(Array.from({ length: PRAG_FILTERA + 1 }, (_, i) => prez(i + 1, i === 3 ? 'Statika grede' : `P${i}`, `2026-10-${10 + i}T10:00:00`)));
    const polje = el(mnogo).querySelector<HTMLInputElement>('[data-filter]')!;
    polje.value = 'GREDE';
    polje.dispatchEvent(new Event('input'));
    mnogo.detectChanges();
    expect(Array.from(el(mnogo).querySelectorAll('[data-prezentacija]')).map(x => x.getAttribute('data-prezentacija'))).toEqual(['4']);
    polje.value = 'nema';
    polje.dispatchEvent(new Event('input'));
    mnogo.detectChanges();
    expect(el(mnogo).querySelector('[data-bez-rezultata]')).not.toBeNull();
  });

  it('predmet bez prezentacija kaže da ih nema', () => {
    expect(el(otvori([])).querySelector('[data-prazno]')?.textContent).toContain('nema prezentacija');
  });

  it('"Pokreni": kartica se otvara sinhrono iz klika, server dobija predavanje, adresa kartice je konzola novog izvođenja', () => {
    const f = otvori([prez(3, 'Konverzije', '2026-10-20T10:00:00')]);
    dugmeZa(f, 3).click();
    expect(otvoriProzor).toHaveBeenCalledWith('about:blank', '_blank');
    expect(kartica.opener).toBeNull();
    expect(pokreni).toHaveBeenCalledWith(3, 40);
    expect(kartica.location.href).toBe(new URL('izvodjenja/70/konzola', document.baseURI).href);
    expect(zatvori).toHaveBeenCalledWith({ izvodjenjeId: 70, otvorena: true });
  });

  it('blokirana kartica: izvođenje je ipak pokrenuto, ishod kaže da konzola nije otvorena', () => {
    otvoriProzor.mockReturnValue(null);
    const f = otvori([prez(3, 'Konverzije', '2026-10-20T10:00:00')]);
    dugmeZa(f, 3).click();
    expect(pokreni).toHaveBeenCalledWith(3, 40);
    expect(zatvori).toHaveBeenCalledWith({ izvodjenjeId: 70, otvorena: false });
  });

  it('greška servera zatvara praznu karticu i ostaje u dijalogu sa razlogom', () => {
    const f = otvori([prez(3, 'Konverzije', '2026-10-20T10:00:00')]);
    pokreni.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { reason: 'Prezentacija je već u toku.', time: 't' } })));
    dugmeZa(f, 3).click();
    f.detectChanges();
    expect(kartica.close).toHaveBeenCalled();
    expect(zatvori).not.toHaveBeenCalled();
    expect(el(f).querySelector('[data-greska]')?.textContent).toContain('Prezentacija je već u toku.');
    expect(dugmeZa(f, 3).disabled).toBe(false);
  });

  it('izvođenje u toku za ovo predavanje nudi "Nastavi" (link na konzolu, nema drugog starta); u toku drugde je zaključano', () => {
    const f = otvori([prez(1, 'Ovde', '2026-10-20T10:00:00', 55), prez(2, 'Drugde', '2026-10-19T10:00:00', 66)], [izv(55, 1)]);
    const nastavi = el(f).querySelector<HTMLAnchorElement>('[data-prezentacija="1"] [data-nastavi]')!;
    expect(nastavi.getAttribute('href')).toBe(new URL('izvodjenja/55/konzola', document.baseURI).href);
    expect(nastavi.target).toBe('_blank');
    expect(el(f).querySelector('[data-prezentacija="1"] [data-pokreni]')).toBeNull();
    expect(dugmeZa(f, 2).disabled).toBe(true);
    expect(el(f).querySelector('[data-prezentacija="2"] [data-zauzeta]')).not.toBeNull();
    expect(pokreni).not.toHaveBeenCalled();
  });

  it('neuspelo učitavanje prikazuje razlog, bez poruke da nema prezentacija', () => {
    zatvori = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: PrezentacijePredavanjaApi, useValue: {
          prezentacije: () => throwError(() => new HttpErrorResponse({ status: 0 })), izvodjenja: () => of([]), pokreni: vi.fn() } },
        { provide: MAT_DIALOG_DATA, useValue: { predavanjeId: 40, predmetId: 4 } },
        { provide: MatDialogRef, useValue: { close: zatvori } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    const f = TestBed.createComponent(PokreniPrezentacijuDialog);
    f.detectChanges();
    expect(el(f).querySelector('[data-greska]')).not.toBeNull();
    expect(el(f).querySelector('[data-prazno]')).toBeNull();
  });
});
