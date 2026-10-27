import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { IzvodjenjeNaPredavanju, PrezentacijePredavanjaApi } from '../../../core/api/prezentacije-predavanja.api';
import { PrezentacijePredavanjaStore } from '../data-access/prezentacije-predavanja.store';
import { PrezentacijeNaPredavanju } from './prezentacije-na-predavanju';

const izv = (id: number, status: 'AKTIVNO' | 'ZAVRSENO', naziv = 'Konverzije'): IzvodjenjeNaPredavanju => ({
  id, prezentacija: { id: 1, naziv }, status, pocetak: '2026-10-27T10:05:00', kraj: status === 'ZAVRSENO' ? '2026-10-27T10:50:00' : null,
  brojUcesnika: 12, brojPitanja: 3, cuvanje: true,
});

function napravi(lista: IzvodjenjeNaPredavanju[], zavrseno: boolean): { f: ComponentFixture<PrezentacijeNaPredavanju>; izvodjenja: ReturnType<typeof vi.fn> } {
  const izvodjenja = vi.fn(() => of(lista));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      PrezentacijePredavanjaStore,
      { provide: PrezentacijePredavanjaApi, useValue: { izvodjenja } },
      { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
    ],
  });
  TestBed.inject(PrezentacijePredavanjaStore).ucitaj(40);
  const f = TestBed.createComponent(PrezentacijeNaPredavanju);
  f.componentRef.setInput('predavanjeId', 40);
  f.componentRef.setInput('zavrseno', zavrseno);
  f.detectChanges();
  return { f, izvodjenja };
}

const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;

describe('PrezentacijeNaPredavanju', () => {
  it('predavanje u toku: u toku ima "Nastavi" u novoj kartici, završeno "Pregled"', () => {
    const { f } = napravi([izv(2, 'AKTIVNO', 'Druga'), izv(1, 'ZAVRSENO')], false);
    const nastavi = el(f).querySelector<HTMLAnchorElement>('[data-izvodjenje="2"] [data-nastavi]')!;
    expect(nastavi.getAttribute('href')).toBe('/izvodjenja/2/konzola');
    expect(nastavi.target).toBe('_blank');
    expect(el(f).querySelector('[data-izvodjenje="2"]')?.textContent).toContain('U toku');
    const pregled = el(f).querySelector<HTMLAnchorElement>('[data-izvodjenje="1"] [data-pregled]')!;
    expect(pregled.getAttribute('href')).toBe('/izvodjenja/1/pregled');
    expect(pregled.target).toBe('_blank');
    expect(el(f).querySelector('[data-izvodjenje="1"]')?.textContent).toContain('Završeno');
  });

  it('predavanje u toku bez izvođenja: odeljak se ne vidi', () => {
    const { f } = napravi([], false);
    expect(el(f).querySelector('[data-prezentacije]')).toBeNull();
  });

  it('završeno predavanje: odeljak je uvek tu, linkovi u istoj kartici, prazno stanje kaže da nije bilo prezentacija', () => {
    const { f } = napravi([izv(1, 'ZAVRSENO')], true);
    expect(el(f).querySelector<HTMLAnchorElement>('[data-pregled]')!.target).toBe('_self');
    TestBed.resetTestingModule();
    const prazno = napravi([], true).f;
    expect(el(prazno).querySelector('[data-prazno]')?.textContent).toContain('Nijedna prezentacija');
  });

  it('kad se kartica ponovo prikaže, lista se čita ponovo (konzola je zatvorena u drugoj kartici)', () => {
    const { izvodjenja } = napravi([izv(2, 'AKTIVNO')], false);
    expect(izvodjenja).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(izvodjenja).toHaveBeenCalledTimes(2);
    expect(izvodjenja).toHaveBeenLastCalledWith(40);
  });
});
