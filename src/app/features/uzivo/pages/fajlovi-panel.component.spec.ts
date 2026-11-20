import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FajlPrezentacijeInfo } from '../../../shared/util/fajlovi';
import { FajloviEditorStore } from '../data-access/fajlovi-editor.store';
import { fajlInfo } from '../data-access/fajlovi.testing';
import { FajloviPanelComponent } from './fajlovi-panel.component';

describe('FajloviPanelComponent', () => {
  const fajlovi = signal<FajlPrezentacijeInfo[]>([]);
  const store = {
    fajlovi, ucitano: signal(true), greska: signal<string | null>(null), radi: signal(false), punoFajlova: signal(false),
    ucitaj: vi.fn(), dodaj: vi.fn(), izmeni: vi.fn(), pomeri: vi.fn(), obrisi: vi.fn(),
  };
  const dijalog = { open: vi.fn() };
  let f: ComponentFixture<FajloviPanelComponent>;

  const el = () => f.nativeElement as HTMLElement;
  const stavke = () => Array.from(el().querySelectorAll<HTMLElement>('[data-fajl]'));

  beforeEach(() => {
    Object.values(store).forEach(x => typeof x === 'function' && 'mockReset' in x && (x as ReturnType<typeof vi.fn>).mockReset());
    dijalog.open.mockReset();
    fajlovi.set([
      fajlInfo({ id: 1, naziv: 'a.docx', slajdId: 11, slajdRb: 2 }),
      fajlInfo({ id: 2, naziv: 'b.xlsx', vrsta: 'XLSX', velicina: 1536 * 1024 }),
    ]);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: FajloviEditorStore, useValue: store },
        { provide: MatDialog, useValue: dijalog },
      ],
    });
    f = TestBed.createComponent(FajloviPanelComponent);
    f.componentRef.setInput('slajdovi', [{ id: 11, rb: 2, oznaka: 'Uvod' }, { id: 12, rb: 3, oznaka: 'Zadatak' }]);
    f.detectChanges();
  });

  it('prikazuje spisak sa veličinom, vrstom i izborom slajda (Cela prezentacija za fajl bez slajda)', () => {
    expect(stavke().length).toBe(2);
    expect(stavke()[0].textContent).toContain('Word');
    expect(stavke()[0].textContent).toContain('2 KB');
    expect(stavke()[1].textContent).toContain('1,5 MB');
    const izbor = stavke()[0].querySelector('select')!;
    expect(izbor.value).toBe('11');
    expect(stavke()[1].querySelector('select')!.value).toBe('');
    expect(el().textContent).toContain('2 fajlova');
  });

  it('preimenovanje i izbor slajda zovu store, preuzimanje vodi na api/fajlovi-prezentacije/<id>/sadrzaj', () => {
    const ime = stavke()[0].querySelector<HTMLInputElement>('input.fp-ime')!;
    ime.value = 'novo.docx';
    ime.dispatchEvent(new Event('change'));
    expect(store.izmeni).toHaveBeenCalledWith(fajlovi()[0], 'novo.docx', 11);

    const izbor = stavke()[1].querySelector('select')!;
    izbor.value = '12';
    izbor.dispatchEvent(new Event('change'));
    expect(store.izmeni).toHaveBeenCalledWith(fajlovi()[1], 'b.xlsx', 12);

    const preuzmi = stavke()[0].querySelector('a[download]')!;
    expect(preuzmi.getAttribute('href')).toBe('api/fajlovi-prezentacije/1/sadrzaj');
  });

  it('gore/dole: prvi nema "gore", poslednji nema "dole"; klik zove pomeri', () => {
    const dugmad = (i: number) => Array.from(stavke()[i].querySelectorAll<HTMLButtonElement>('.fp-akcije button'));
    expect(dugmad(0)[0].getAttribute('aria-disabled')).toBe('true');
    expect(dugmad(1)[1].getAttribute('aria-disabled')).toBe('true');
    expect(dugmad(0)[1].getAttribute('aria-disabled')).not.toBe('true');
    dugmad(0)[1].click();
    expect(store.pomeri).toHaveBeenCalledWith(1, 1);
  });

  it('brisanje ide kroz ConfirmDialog: bez potvrde ne briše, sa potvrdom briše', () => {
    dijalog.open.mockReturnValueOnce({ afterClosed: () => of(false) });
    stavke()[0].querySelector<HTMLButtonElement>('button[aria-label^="Obriši"]')!.click();
    expect(store.obrisi).not.toHaveBeenCalled();
    dijalog.open.mockReturnValueOnce({ afterClosed: () => of(true) });
    stavke()[0].querySelector<HTMLButtonElement>('button[aria-label^="Obriši"]')!.click();
    expect(store.obrisi).toHaveBeenCalledWith(1);
  });

  it('"Dodaj fajl": izabran fajl ide uz izabrani slajd, ili uz celu prezentaciju', () => {
    const ulaz = el().querySelector<HTMLInputElement>('[data-fajl-ulaz]')!;
    expect(ulaz.accept).toBe('.docx,.xlsx,.pptx,.pdf,.zip');
    const novi = el().querySelector<HTMLSelectElement>('[data-novi-slajd]')!;
    novi.value = '12';
    novi.dispatchEvent(new Event('change'));
    const fajl = new File(['x'], 'v.pdf');
    Object.defineProperty(ulaz, 'files', { value: [fajl], configurable: true });
    ulaz.dispatchEvent(new Event('change'));
    expect(store.dodaj).toHaveBeenCalledWith(fajl, 12);

    novi.value = '';
    novi.dispatchEvent(new Event('change'));
    Object.defineProperty(ulaz, 'files', { value: [fajl], configurable: true });
    ulaz.dispatchEvent(new Event('change'));
    expect(store.dodaj).toHaveBeenLastCalledWith(fajl, null);
  });

  it('prazan spisak daje poruku', () => {
    fajlovi.set([]);
    f.detectChanges();
    expect(el().querySelector('[data-fajlovi-prazno]')).not.toBeNull();
    expect(el().textContent).toContain('nema fajlova');
  });
});
