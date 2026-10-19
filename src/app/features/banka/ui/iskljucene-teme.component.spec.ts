import { OverlayContainer } from '@angular/cdk/overlay';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IskljucenaTemaInfo } from '../data-access/banka.models';
import { IskljuceneTemeComponent } from './iskljucene-teme.component';

function tema(id: number, opis: string, izmena: Partial<IskljucenaTemaInfo> = {}): IskljucenaTemaInfo {
  return { id, predmetId: 1, opis, grupaId: null, putanja: [], izvor: 'CLAUDE', serija: 'uvoz-kol1-2024', kreirano: '2026-10-18T10:40:00', ...izmena };
}

const TEME: IskljucenaTemaInfo[] = [
  tema(1, 'Razlomljeni (decimalni) brojevi 10 → 2 i 2 → 10', {
    grupaId: 5, putanja: [{ id: 1, naziv: 'Konverzije brojeva' }, { id: 5, naziv: 'Razlomljeni brojevi (demo)' }],
  }),
  tema(2, 'Brojni sistemi sa osnovom 3 i 5', { izvor: 'RUCNO', serija: null }),
];

@Component({
  imports: [IskljuceneTemeComponent],
  template: `<app-iskljucene-teme [teme]="teme()" (ukljuci)="ukljuci($event)" />`,
})
class Host {
  teme = signal<IskljucenaTemaInfo[]>(TEME);
  ukljuci = vi.fn();
}

describe('IskljuceneTemeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }] });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
  });

  async function napravi() {
    const f = TestBed.createComponent(Host);
    document.body.appendChild(f.nativeElement);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const stabilno = async () => {
      await f.whenStable();
      await new Promise(r => setTimeout(r));
      await f.whenStable();
    };
    return { f, el, h: f.componentInstance, stabilno };
  }
  const overlay = () => TestBed.inject(OverlayContainer).getContainerElement();
  const tekst = (e: Element | null) => e!.textContent!.replace(/\s+/g, ' ').trim();

  it('sekcija sa naslovom: opis teme, putanja grupe ili "bez grupe", dugme "Uključi" sa imenom teme', async () => {
    const { el } = await napravi();
    const sekcija = el.querySelector('section')!;
    expect(sekcija.getAttribute('aria-labelledby')).toBe(sekcija.querySelector('h2')!.id);
    expect(tekst(sekcija.querySelector('h2'))).toBe('Isključene teme');
    const stavke = [...el.querySelectorAll<HTMLElement>('[data-tema]')];
    expect(stavke.map(s => s.dataset['tema'])).toEqual(['1', '2']);
    expect(tekst(stavke[0].querySelector('.bk-it-opis'))).toBe('Razlomljeni (decimalni) brojevi 10 → 2 i 2 → 10');
    expect(tekst(stavke[0].querySelector('.bk-it-grupa'))).toBe('Konverzije brojeva › Razlomljeni brojevi (demo)');
    expect(tekst(stavke[1].querySelector('.bk-it-grupa'))).toBe('bez grupe');
    const dugme = stavke[1].querySelector<HTMLButtonElement>('button[data-ukljuci]')!;
    expect(tekst(dugme)).toBe('Uključi');
    expect(dugme.getAttribute('aria-label')).toBe('Uključi temu Brojni sistemi sa osnovom 3 i 5');
  });

  it('prazna lista ne prikazuje sekciju', async () => {
    const { el, h, stabilno } = await napravi();
    h.teme.set([]);
    await stabilno();
    expect(el.querySelector('section')).toBeNull();
    expect(el.querySelector('app-iskljucene-teme')!.textContent!.trim()).toBe('');
  });

  it('"Uključi" pita pre nego što emituje: Odustani ne emituje ništa, potvrda emituje id teme', async () => {
    const { el, h, stabilno } = await napravi();
    const dugme = el.querySelector<HTMLButtonElement>('[data-tema="1"] button[data-ukljuci]')!;

    dugme.click();
    await stabilno();
    const dijalog = overlay().querySelector('[role=alertdialog]')!;
    expect(tekst(dijalog.querySelector('h2'))).toBe('Uključi temu ponovo?');
    expect(tekst(dijalog.querySelector('mat-dialog-content'))).toBe('Klod je opet može nuditi.');
    expect(h.ukljuci).not.toHaveBeenCalled();
    overlay().querySelector<HTMLButtonElement>('[data-odustani]')!.click();
    await stabilno();
    expect(h.ukljuci).not.toHaveBeenCalled();

    dugme.click();
    await stabilno();
    const potvrdi = overlay().querySelector<HTMLButtonElement>('[data-potvrdi]')!;
    expect(tekst(potvrdi)).toBe('Uključi');
    potvrdi.click();
    await stabilno();
    expect(h.ukljuci).toHaveBeenCalledExactlyOnceWith(1);
  });
});
