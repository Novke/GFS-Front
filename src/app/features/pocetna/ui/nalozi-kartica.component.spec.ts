import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ObavestenjeInfo } from '../../../core/api/obavestenja.api';
import { NaloziKartica } from './nalozi-kartica.component';

@Component({ template: '' })
class Prazna {}

const obavestenje = (id: number, izmene: Partial<ObavestenjeInfo> = {}): ObavestenjeInfo => ({
  id, vrsta: 'NE_STIZE_KOD', studentId: id, studentIme: `Student ${id}`, indeks: `GD${id}`, podaci: { imaMejl: true },
  kreirano: '2026-10-19T10:05:00', procitano: null, reseno: null, ...izmene,
});

@Component({
  imports: [NaloziKartica],
  template: `<app-nalozi-kartica [stavke]="stavke()" [ukupno]="ukupno()" (procitano)="procitano($event)" (reseno)="reseno($event)" />`,
})
class Domacin {
  readonly stavke = signal<ObavestenjeInfo[]>([]);
  readonly ukupno = signal(0);
  readonly procitano = vi.fn();
  readonly reseno = vi.fn();
}

describe('NaloziKartica (Čeka na tebe: nalozi)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'studenti/:id', component: Prazna }])] });
  });

  function napravi(stavke: ObavestenjeInfo[], ukupno = stavke.length) {
    const f = TestBed.createComponent(Domacin);
    f.componentInstance.stavke.set(stavke);
    f.componentInstance.ukupno.set(ukupno);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    return { f, el, red: (id: number) => el.querySelector(`[data-nalog="${id}"]`) as HTMLElement | null };
  }

  it('naslov "Obaveštenja" i stavke sa tekstom obaveštenja i vremenom', () => {
    const { el, red } = napravi([
      obavestenje(1, { podaci: { imaMejl: false } }),
      obavestenje(2, { vrsta: 'PREVISE_KODOVA', procitano: '2026-10-19T11:00:00' }),
    ]);
    expect(el.querySelector('h2')?.textContent?.trim()).toBe('Obaveštenja');
    expect(red(1)?.textContent).toContain('Ne stiže kod: Student 1 · nema mejl');
    expect(red(1)?.textContent).toContain('19. 10. 2026. 10:05');
    expect(red(1)?.textContent).toContain('nepročitano');
    expect(red(2)?.textContent).toContain('Previše zahteva za kod: Student 2');
    expect(red(2)?.textContent).not.toContain('nepročitano');
  });

  it('veza na karticu studenta (i označi pročitano); bez studenta nema veze', async () => {
    const { f, red } = napravi([obavestenje(1), obavestenje(2, { studentId: null, studentIme: null, indeks: 'XX9' }), obavestenje(3, { procitano: 'x' })]);
    const veza = red(1)!.querySelector('a')!;
    expect(veza.getAttribute('href')).toBe('/studenti/1');
    expect(red(2)!.querySelector('a')).toBeNull();
    expect(red(2)!.textContent).toContain('Ne stiže kod: XX9');
    veza.click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/studenti/1'));
    expect(f.componentInstance.procitano).toHaveBeenCalledExactlyOnceWith(1);
    red(3)!.querySelector('a')!.click();
    expect(f.componentInstance.procitano).toHaveBeenCalledOnce();
  });

  it('"Rešeno" javlja id', () => {
    const { f, red } = napravi([obavestenje(1), obavestenje(2, { studentId: null })]);
    const dugme = red(2)!.querySelector<HTMLButtonElement>('button[data-reseno]')!;
    expect(dugme.textContent).toContain('Rešeno');
    dugme.click();
    expect(f.componentInstance.reseno).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('najviše 5 redova, ostalo kao "+N još"', () => {
    const { el } = napravi(Array.from({ length: 10 }, (_, i) => obavestenje(i + 1)), 23);
    expect(el.querySelectorAll('[data-nalog]').length).toBe(5);
    expect(el.querySelector('[data-jos]')?.textContent).toContain('+18 još');
  });
});
