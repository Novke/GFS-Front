import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PonudaInstalacije } from '../../../core/pwa/instalacija';
import { KLJUC_SKRIVENA_PONUDA, PrikazInstalacije } from '../../../core/pwa/instalacija.pravila';
import { InstalacijaKartica } from './instalacija-kartica.component';

/** „Instaliraj GFS na telefon“ (spec „Aplikacija i obaveštenja“ 4.3). */
describe('InstalacijaKartica', () => {
  const prikaz = signal<PrikazInstalacije>({ uredjaj: 'android', nacin: 'ponuda' });

  beforeEach(() => {
    localStorage.removeItem(KLJUC_SKRIVENA_PONUDA);
    TestBed.configureTestingModule({
      providers: [{ provide: PonudaInstalacije, useValue: { prikaz: computed(() => prikaz()), instaliraj: async () => 'prihvaceno' } }],
    });
  });

  afterEach(() => localStorage.removeItem(KLJUC_SKRIVENA_PONUDA));

  function napravi(mesto: 'pocetna' | 'ja') {
    const f = TestBed.createComponent(InstalacijaKartica);
    f.componentRef.setInput('mesto', mesto);
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement };
  }

  it('Android sa ponudom: dugme „Instaliraj“ bez uputstva; „Ne sada“ sakriva i pamti na uređaju', async () => {
    prikaz.set({ uredjaj: 'android', nacin: 'ponuda' });
    const { f, el } = napravi('pocetna');
    expect(el.querySelector('h3')?.textContent).toBe('Instaliraj GFS na telefon');
    expect(el.querySelector('[data-instaliraj]')).not.toBeNull();
    expect(el.querySelector('[data-uputstvo]')).toBeNull();
    el.querySelector<HTMLButtonElement>('[data-ne-sada]')!.click();
    await f.whenStable();
    expect(el.querySelector('[data-instalacija]')).toBeNull();
    expect(localStorage.getItem(KLJUC_SKRIVENA_PONUDA)).toBe('1');
    // na tabu Ja ostaje
    expect(napravi('ja').el.querySelector('[data-instalacija="ja"]')).not.toBeNull();
  });

  it('iPhone: uputstvo u 3 koraka (Safari), ručni izbor Androida; „Već sam dodao“ sakriva', async () => {
    prikaz.set({ uredjaj: 'iphone', nacin: 'ios-safari' });
    const { f, el } = napravi('pocetna');
    expect(el.querySelector('h3')?.textContent).toBe('Dodaj GFS na početni ekran');
    expect(el.querySelectorAll('[data-uputstvo="ios-safari"] li')).toHaveLength(3);
    expect(el.textContent).toContain('Add to Home Screen');
    el.querySelector<HTMLButtonElement>('[data-rucno="android"]')!.click();
    await f.whenStable();
    expect(el.querySelector('[data-uputstvo="android"]')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('[data-rucno="iphone"]')!.click();
    await f.whenStable();
    el.querySelector<HTMLButtonElement>('[data-dodao]')!.click();
    await f.whenStable();
    expect(el.querySelector('[data-instalacija]')).toBeNull();
  });

  it('računar i instalirana aplikacija: nema kartice na Početnoj; na Ja je tekst za računar ili potvrda', () => {
    prikaz.set({ uredjaj: 'racunar', nacin: 'racunar' });
    expect(napravi('pocetna').el.querySelector('[data-instalacija]')).toBeNull();
    expect(napravi('ja').el.textContent).toContain('Možeš da je instaliraš i na računar.');
    prikaz.set({ uredjaj: 'android', nacin: 'instalirano' });
    expect(napravi('pocetna').el.querySelector('[data-instalacija]')).toBeNull();
    expect(napravi('ja').el.querySelector('[data-instalirano]')).not.toBeNull();
  });
});
