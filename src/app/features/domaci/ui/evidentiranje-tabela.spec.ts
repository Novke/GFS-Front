import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IKONE } from '../../../core/layout/icons';
import { StanjeCuvanja } from '../../../shared/ui/save-status';
import { RedStudenta, VrednostiReda } from '../data-access/domaci.store';
import { EvidentiranjeTabela, IzmenaReda } from './evidentiranje-tabela';

const student = (id: number, ime: string, prezime: string, indeks: string, izmene: Partial<RedStudenta> = {}): RedStudenta => ({
  id,
  ime,
  prezime,
  indeks,
  godina: 2025,
  tip: null,
  predavanjaNapomene: null,
  oslobodjen: false,
  ...izmene,
});

const prazno: VrednostiReda = { bodovi: null, prepisivanje: false, napomene: '' };

@Component({
  imports: [EvidentiranjeTabela],
  template: `<app-evidentiranje-tabela [studenti]="studenti()" [vrednosti]="vrednosti()" [statusi]="statusi()" [samoCitanje]="samoCitanje()"
    [imaPredavanje]="imaPredavanje()" (izmena)="izmena($event)" (sacuvajOdmah)="sacuvajOdmah($event)" (ponovo)="ponovo($event)" />`,
})
class Host {
  studenti = signal<RedStudenta[]>([
    student(1, 'Ana', 'Radić', 'GD2', { tip: 'ZADATAK' }),
    student(2, 'Marko', 'Ilić', 'GD10', { oslobodjen: true }),
    student(3, 'Jovana', 'Petrović', 'GD7', { tip: 'PRISUSTVO' }),
    student(4, 'Luka', 'Savić', 'GD11'),
  ]);
  vrednosti = signal<Record<number, VrednostiReda>>({
    1: { bodovi: 7, prepisivanje: false, napomene: 'dobro' },
    2: { bodovi: 10, prepisivanje: false, napomene: '' },
    3: { ...prazno },
    4: { ...prazno },
  });
  statusi = signal<Record<number, StanjeCuvanja | null>>({});
  samoCitanje = signal(false);
  imaPredavanje = signal(true);
  izmena = vi.fn<(i: IzmenaReda) => void>();
  sacuvajOdmah = vi.fn<(id: number) => void>();
  ponovo = vi.fn<(id: number) => void>();
}

function napravi() {
  const f = TestBed.createComponent(Host);
  document.body.appendChild(f.nativeElement as HTMLElement); // fokus radi samo u dokumentu
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const red = (id: number) => el.querySelector<HTMLElement>(`tr[data-student="${id}"]`)!;
  const polje = (id: number, ime: string) => red(id).querySelector<HTMLInputElement>(`input[data-polje="${ime}"]`);
  return { f, el, h: f.componentInstance, red, polje };
}

describe('EvidentiranjeTabela', () => {
  beforeEach(() => {
    // Ikone bez HTTP-a i bez grešaka "Error retrieving icon" u izlazu testa.
    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    for (const ime of IKONE) {
      registry.addSvgIconLiteral(ime, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
    }
  });

  it('red po studentu: ime, indeks sa godinom, aktivnost, bodovi, napomena', () => {
    const { red, polje } = napravi();
    expect(red(1).querySelector('.c-ime')!.textContent).toBe('Ana Radić');
    expect(red(1).querySelector('.c-indeks')!.textContent).toBe('GD2/2025');
    expect(red(1).querySelector('.c-aktivnost')!.textContent!.trim()).toBe('Zadatak');
    expect(red(3).querySelector('.c-aktivnost')!.textContent!.trim()).toBe('Prisutan');
    expect(red(4).querySelector('.c-aktivnost')!.textContent!.trim()).toBe('Odsutan');
    expect(polje(1, 'bodovi')!.value).toBe('7');
    expect(polje(1, 'napomene')!.value).toBe('dobro');
    expect(polje(3, 'bodovi')!.value).toBe('');
  });

  it('domaći bez predavanja: aktivnost je —', () => {
    const { f, red } = napravi();
    f.componentInstance.imaPredavanje.set(false);
    f.detectChanges();
    expect(red(1).querySelector('.c-aktivnost')!.textContent!.trim()).toBe('—');
  });

  it('oslobođeni red je zaključan sa oznakom, bez polja', () => {
    const { red, polje } = napravi();
    expect(polje(2, 'bodovi')).toBeNull();
    expect(polje(2, 'napomene')).toBeNull();
    expect(red(2).querySelector('[data-polje="prepisivanje"]')).toBeNull();
    expect(red(2).querySelector('[data-bodovi-tekst]')!.textContent).toBe('10');
    expect(red(2).querySelector('.c-status')!.textContent).toContain('Oslobođen');
  });

  it('pregledan domaći (samo za čitanje) nema polja ni status čuvanja', () => {
    const { f, el } = napravi();
    f.componentInstance.samoCitanje.set(true);
    f.detectChanges();
    expect(el.querySelectorAll('input')).toHaveLength(0);
    expect(el.querySelector('app-save-status')).toBeNull();
  });

  it('upis bodova, napomene i prepisivanja javlja izmenu reda', () => {
    const { h, polje } = napravi();
    const bodovi = polje(3, 'bodovi')!;
    bodovi.value = '9';
    bodovi.dispatchEvent(new Event('input'));
    expect(h.izmena).toHaveBeenLastCalledWith({ studentId: 3, izmena: { bodovi: 9 } });
    bodovi.value = '';
    bodovi.dispatchEvent(new Event('input'));
    expect(h.izmena).toHaveBeenLastCalledWith({ studentId: 3, izmena: { bodovi: null } });
    const napomena = polje(3, 'napomene')!;
    napomena.value = 'kasno predao';
    napomena.dispatchEvent(new Event('input'));
    expect(h.izmena).toHaveBeenLastCalledWith({ studentId: 3, izmena: { napomene: 'kasno predao' } });
    const prepisivanje = polje(3, 'prepisivanje')!;
    prepisivanje.click();
    expect(h.izmena).toHaveBeenLastCalledWith({ studentId: 3, izmena: { prepisivanje: true } });
  });

  it('bodovi van 0-10 ili razlomak se ne javljaju i dobijaju poruku', () => {
    const { f, h, polje, red } = napravi();
    const bodovi = polje(3, 'bodovi')!;
    for (const v of ['11', '-1', '2.5']) {
      bodovi.value = v;
      bodovi.dispatchEvent(new Event('input'));
    }
    expect(h.izmena).not.toHaveBeenCalled();
    f.detectChanges();
    expect(bodovi.getAttribute('aria-invalid')).toBe('true');
    expect(red(3).querySelector('[data-neispravno]')!.textContent).toContain('ceo broj od 0 do 10');
  });

  it('Enter ide u isto polje sledećeg reda koji ga ima (preskače oslobođenog) i traži čuvanje', () => {
    const { h, polje } = napravi();
    polje(1, 'bodovi')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(h.sacuvajOdmah).toHaveBeenCalledWith(1);
    expect(document.activeElement).toBe(polje(3, 'bodovi'));
    polje(3, 'napomene')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(h.sacuvajOdmah).toHaveBeenLastCalledWith(3);
    expect(document.activeElement).toBe(polje(4, 'napomene'));
    // poslednji red: fokus ostaje, red se čuva
    polje(4, 'napomene')!.focus();
    polje(4, 'napomene')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(h.sacuvajOdmah).toHaveBeenLastCalledWith(4);
    expect(document.activeElement).toBe(polje(4, 'napomene'));
  });

  it('status po redu: čuva se, sačuvano, greška sa "Pokušaj ponovo"', () => {
    const { f, red, h } = napravi();
    f.componentInstance.statusi.set({ 1: 'cuva', 3: 'sacuvano', 4: 'greska' });
    f.detectChanges();
    expect(red(1).querySelector('.c-status')!.textContent).toContain('Čuva se');
    expect(red(3).querySelector('.c-status')!.textContent).toContain('Sačuvano');
    expect(red(4).querySelector('.c-status')!.textContent).toContain('Nije sačuvano');
    red(4).querySelector<HTMLButtonElement>('button.ponovo')!.click();
    expect(h.ponovo).toHaveBeenCalledWith(4);
  });
});
