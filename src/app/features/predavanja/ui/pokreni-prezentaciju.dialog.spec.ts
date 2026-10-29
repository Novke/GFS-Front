import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IzborPrezentacija, IzvodjenjeNaPredavanju, PrezentacijaZaIzbor, PrezentacijePredavanjaApi,
} from '../../../core/api/prezentacije-predavanja.api';
import type { VrstaPrezentacije } from '../../../core/api/redosled-prezentacija';
import { PRAG_PRETRAGE } from '../../../shared/ui/izbor-prezentacije';
import { PokreniPrezentacijuDialog, stanjeStavke, urlKonzole } from './pokreni-prezentaciju.dialog';

const prez = (id: number, naziv: string, vezba: number | null = null, aktivno: number | null = null,
  vrsta: VrstaPrezentacije = 'PITANJA'): PrezentacijaZaIzbor => ({
  id, naziv, brojSlajdova: 4, brojPitanja: vrsta === 'GRADIVO' ? 0 : 2, izmenjeno: '2026-10-20T10:00:00', aktivnoIzvodjenjeId: aktivno,
  vezba, vrsta, brojZadataka: vrsta === 'ZADACI' ? 2 : 0, kreirano: '2026-10-01T10:00:00', poslednjePustanje: null,
});
const izbor = (lista: PrezentacijaZaIzbor[], predlog: number[] = [], pusteno: Record<number, string> = {}): IzborPrezentacija => ({
  stavke: lista.map(p => ({ prezentacija: p, pustenoGrupi: pusteno[p.id] ?? null })), predlog,
});
const izv = (id: number, prezentacijaId: number, status: 'AKTIVNO' | 'ZAVRSENO' = 'AKTIVNO'): IzvodjenjeNaPredavanju => ({
  id, prezentacija: { id: prezentacijaId, naziv: 'x' }, status, pocetak: '2026-10-27T10:00:00', kraj: null, brojUcesnika: 0, brojPitanja: 0, cuvanje: true,
});

describe('izbor prezentacije za predavanje (čista logika)', () => {
  it('stanje stavke: slobodna, "nastavi" za izvođenje ovog predavanja, zauzeta kad je u toku drugde', () => {
    expect(stanjeStavke(prez(1, 'A'), [])).toEqual({ vrsta: 'slobodna' });
    expect(stanjeStavke(prez(1, 'A', null, 55), [izv(55, 1)])).toEqual({ vrsta: 'nastavi', izvodjenjeId: 55 });
    expect(stanjeStavke(prez(1, 'A', null, 56), [izv(55, 1)])).toEqual({ vrsta: 'zauzeta' });
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

  let izborApi: ReturnType<typeof vi.fn>;

  function otvori(prezentacije: PrezentacijaZaIzbor[] | IzborPrezentacija, izvodjenja: IzvodjenjeNaPredavanju[] = [],
    grupa: { id: number; naziv: string } | null = { id: 9, naziv: 'GD-2025' }): ComponentFixture<PokreniPrezentacijuDialog> {
    pokreni = vi.fn(() => of(izv(70, 3)));
    zatvori = vi.fn();
    const odgovor = Array.isArray(prezentacije) ? izbor(prezentacije) : prezentacije;
    izborApi = vi.fn(() => of(odgovor));
    TestBed.configureTestingModule({
      providers: [
        { provide: PrezentacijePredavanjaApi, useValue: { izbor: izborApi, izvodjenja: vi.fn(() => of(izvodjenja)), pokreni } },
        { provide: MAT_DIALOG_DATA, useValue: { predavanjeId: 40, predmetId: 4, grupa } },
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

  const redosled = (f: ComponentFixture<unknown>) =>
    Array.from(el(f).querySelectorAll('[data-prezentacija]')).map(x => Number(x.getAttribute('data-prezentacija')));

  it('predlog "Sledeće za <grupa>" je na vrhu, prvi istaknut; lista po vežbama kao sa servera, grupe sa naslovom', () => {
    const lista = [prez(1, 'Uvod', 0, null, 'GRADIVO'), prez(2, 'Vežbe 1', 1, null, 'GRADIVO'), prez(3, 'Vežbe 1 – zadaci', 1, null, 'ZADACI')];
    const f = otvori(izbor(lista, [3, 2], { 1: '2026-10-08T10:00:00' }));
    expect(izborApi).toHaveBeenCalledWith(4, 9);
    expect(el(f).querySelector('[data-predlog] h3')?.textContent).toContain('Sledeće za GD-2025');
    expect(Array.from(el(f).querySelectorAll('[data-predlog-stavka]')).map(x => x.getAttribute('data-predlog-stavka'))).toEqual(['3', '2']);
    expect(el(f).querySelector('[data-predlog-stavka="3"] [data-pokreni]')?.className).toContain('unelevated');
    expect(el(f).querySelector('[data-predlog-stavka="2"] [data-pokreni]')?.className).not.toContain('unelevated');
    expect(redosled(f)).toEqual([1, 2, 3]);
    expect(Array.from(el(f).querySelectorAll('h4')).map(h => h.textContent?.trim())).toEqual(['Uvod', 'Vežbe 1']);
    expect(el(f).querySelector('[data-prezentacija="1"]')?.textContent).toContain('puštano 8.10.');
    expect(el(f).querySelector('[data-prezentacija="2"]')?.textContent).toContain('nije puštano');
  });

  it('predavanje bez grupe: nema predloga', () => {
    const f = otvori(izbor([prez(1, 'A', 1)], [1]), [], null);
    expect(izborApi).toHaveBeenCalledWith(4, null);
    expect(el(f).querySelector('[data-predlog]')).toBeNull();
    expect(redosled(f)).toEqual([1]);
  });

  it('filter vrste sužava listu (predlog ostaje)', () => {
    const f = otvori(izbor([prez(1, 'Gradivo', 1, null, 'GRADIVO'), prez(2, 'Zadaci', 1, null, 'ZADACI')], [2]));
    el(f).querySelector<HTMLButtonElement>('[data-filter-vrste="ZADACI"]')!.click();
    f.detectChanges();
    expect(redosled(f)).toEqual([2]);
    expect(el(f).querySelector('[data-filter-vrste="ZADACI"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(el(f).querySelector('[data-predlog-stavka="2"]')).not.toBeNull();
  });

  it('pretraga se vidi tek kad je prezentacija više od praga i ne gleda dijakritike', () => {
    const malo = otvori([prez(1, 'Stara'), prez(2, 'Nova')]);
    expect(el(malo).querySelector('[data-pretraga]')).toBeNull();
    TestBed.resetTestingModule();

    const mnogo = otvori(Array.from({ length: PRAG_PRETRAGE + 1 }, (_, i) => prez(i + 1, i === 3 ? 'Statika grede' : `P${i}`, i)));
    const polje = el(mnogo).querySelector<HTMLInputElement>('[data-pretraga]')!;
    polje.value = 'GREDE';
    polje.dispatchEvent(new Event('input'));
    mnogo.detectChanges();
    expect(redosled(mnogo)).toEqual([4]);
    polje.value = 'statiká';
    polje.dispatchEvent(new Event('input'));
    mnogo.detectChanges();
    expect(redosled(mnogo)).toEqual([4]);
    polje.value = 'nema';
    polje.dispatchEvent(new Event('input'));
    mnogo.detectChanges();
    expect(el(mnogo).querySelector('[data-bez-rezultata]')).not.toBeNull();
  });

  it('predmet bez prezentacija kaže da ih nema', () => {
    expect(el(otvori([])).querySelector('[data-prazno]')?.textContent).toContain('nema prezentacija');
  });

  it('"Pokreni": kartica se otvara sinhrono iz klika, server dobija predavanje, adresa kartice je konzola novog izvođenja', () => {
    const f = otvori([prez(3, 'Konverzije', 1)]);
    dugmeZa(f, 3).click();
    expect(otvoriProzor).toHaveBeenCalledWith('about:blank', '_blank');
    expect(kartica.opener).toBeNull();
    expect(pokreni).toHaveBeenCalledWith(3, 40);
    expect(kartica.location.href).toBe(new URL('izvodjenja/70/konzola', document.baseURI).href);
    expect(zatvori).toHaveBeenCalledWith({ izvodjenjeId: 70, otvorena: true });
  });

  it('blokirana kartica: izvođenje je ipak pokrenuto, ishod kaže da konzola nije otvorena', () => {
    otvoriProzor.mockReturnValue(null);
    const f = otvori([prez(3, 'Konverzije', 1)]);
    dugmeZa(f, 3).click();
    expect(pokreni).toHaveBeenCalledWith(3, 40);
    expect(zatvori).toHaveBeenCalledWith({ izvodjenjeId: 70, otvorena: false });
  });

  it('greška servera zatvara praznu karticu i ostaje u dijalogu sa razlogom', () => {
    const f = otvori([prez(3, 'Konverzije', 1)]);
    pokreni.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { reason: 'Prezentacija je već u toku.', time: 't' } })));
    dugmeZa(f, 3).click();
    f.detectChanges();
    expect(kartica.close).toHaveBeenCalled();
    expect(zatvori).not.toHaveBeenCalled();
    expect(el(f).querySelector('[data-greska]')?.textContent).toContain('Prezentacija je već u toku.');
    expect(dugmeZa(f, 3).disabled).toBe(false);
  });

  it('izvođenje u toku za ovo predavanje nudi "Nastavi" (link na konzolu, nema drugog starta); u toku drugde je zaključano', () => {
    const f = otvori([prez(1, 'Ovde', 1, 55), prez(2, 'Drugde', 2, 66)], [izv(55, 1)]);
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
          izbor: () => throwError(() => new HttpErrorResponse({ status: 0 })), izvodjenja: () => of([]), pokreni: vi.fn() } },
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
