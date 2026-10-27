import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { NivoComponent, opisNivoa, zvezdiceNivoa } from './nivo.component';

@Component({
  imports: [NivoComponent],
  template: `<app-nivo [nivo]="nivo()" [izbor]="izbor()" [saSvima]="saSvima()" [natpis]="natpis()" [onemoguceno]="onemoguceno()"
    (promena)="promena($event)" />`,
})
class Host {
  nivo = signal<number | null>(2);
  izbor = signal(false);
  saSvima = signal(false);
  natpis = signal(true);
  onemoguceno = signal(false);
  promena = vi.fn();
}

function napravi(podesi: (h: Host) => void = () => undefined) {
  const f = TestBed.createComponent(Host);
  podesi(f.componentInstance);
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  return { f, el, h: f.componentInstance };
}

const radio = (el: HTMLElement, n: number | 'svi') => el.querySelector<HTMLButtonElement>(`[role="radio"][data-nivo="${n}"]`)!;
const kljuc = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe('NivoComponent: prikaz', () => {
  it.each([[1, 'lakši'], [2, 'srednji'], [3, 'teži']])('nivo %i ima aria-label sa opisom "%s"', (n, opis) => {
    const { el } = napravi(h => h.nivo.set(n));
    const slika = el.querySelector('[data-nivo-prikaz]')!;
    expect(slika.getAttribute('role')).toBe('img');
    expect(slika.getAttribute('aria-label')).toBe(`Nivo ${n} od 3 (${opis})`);
    expect(el.textContent).toContain('Nivo');
  });

  it('popunjava zvezdice do nivoa, prazne do tri', () => {
    const { el } = napravi(h => h.nivo.set(2));
    const zvezde = [...el.querySelectorAll('svg')];
    expect(zvezde.map(z => z.classList.contains('puna'))).toEqual([true, true, false]);
  });

  it('nivo null je "Svi nivoi" bez zvezdica', () => {
    const { el } = napravi(h => h.nivo.set(null));
    expect(el.querySelector('[data-nivo-prikaz]')!.getAttribute('aria-label')).toBe('Svi nivoi');
    expect(el.querySelectorAll('svg')).toHaveLength(0);
  });

  it('natpis se može sakriti', () => {
    const { el } = napravi(h => h.natpis.set(false));
    expect(el.querySelector('.nivo-natpis')).toBeNull();
  });

  it('pomoćne funkcije', () => {
    expect(opisNivoa(3)).toBe('Nivo 3 od 3 (teži)');
    expect(zvezdiceNivoa(2)).toBe('★★');
    expect(zvezdiceNivoa(9)).toBe('★★★');
  });
});

describe('NivoComponent: izbor', () => {
  const izbor = (h: Host) => h.izbor.set(true);

  it('radio grupa sa tri opcije, izabrana je aria-checked, roving tabindex', () => {
    const { el } = napravi(izbor);
    expect(el.querySelector('[role="radiogroup"]')!.getAttribute('aria-labelledby')).toBeTruthy();
    expect([1, 2, 3].map(n => radio(el, n).getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect([1, 2, 3].map(n => radio(el, n).tabIndex)).toEqual([-1, 0, -1]);
    expect(radio(el, 3).getAttribute('aria-label')).toBe('Nivo 3 od 3 (teži)');
    expect(el.querySelector('[data-nivo="svi"]')).toBeNull();
  });

  it('klik emituje nivo, a isti nivo ne emituje ništa', () => {
    const { el, h } = napravi(izbor);
    radio(el, 3).click();
    expect(h.promena).toHaveBeenCalledExactlyOnceWith(3);
    h.promena.mockClear();
    radio(el, 2).click();
    expect(h.promena).not.toHaveBeenCalled();
  });

  it('strelice kruže, Home i End idu na kraj, fokus prati izbor', () => {
    const { f, el, h } = napravi(h => { izbor(h); h.nivo.set(3); });
    radio(el, 3).focus();
    kljuc(radio(el, 3), 'ArrowRight');
    expect(h.promena).toHaveBeenLastCalledWith(1);
    expect(document.activeElement).toBe(radio(el, 1));
    h.nivo.set(1);
    f.detectChanges();
    kljuc(radio(el, 1), 'ArrowLeft');
    expect(h.promena).toHaveBeenLastCalledWith(3);
    kljuc(radio(el, 1), 'End');
    expect(h.promena).toHaveBeenLastCalledWith(3);
    kljuc(radio(el, 1), 'ArrowDown');
    expect(h.promena).toHaveBeenLastCalledWith(2);
    h.nivo.set(2);
    f.detectChanges();
    kljuc(radio(el, 2), 'Home');
    expect(h.promena).toHaveBeenLastCalledWith(1);
  });

  it('obrađena strelica ne ide dalje (prečice konzole), ostali tasteri da', () => {
    const { el } = napravi(izbor);
    const nadgledaj = vi.fn();
    document.addEventListener('keydown', nadgledaj);
    kljuc(radio(el, 2), 'ArrowRight');
    kljuc(radio(el, 2), 'x');
    document.removeEventListener('keydown', nadgledaj);
    expect(nadgledaj).toHaveBeenCalledOnce();
    expect((nadgledaj.mock.calls[0][0] as KeyboardEvent).key).toBe('x');
  });

  it('sa "Svi": prva opcija emituje null, a nivo null je izabran i fokusiran', () => {
    const { f, el, h } = napravi(h => { izbor(h); h.saSvima.set(true); h.nivo.set(null); });
    const svi = radio(el, 'svi');
    expect(svi.textContent!.trim()).toBe('Svi');
    expect(svi.getAttribute('aria-checked')).toBe('true');
    expect(svi.tabIndex).toBe(0);
    radio(el, 1).click();
    expect(h.promena).toHaveBeenLastCalledWith(1);
    h.nivo.set(1);
    f.detectChanges();
    svi.click();
    expect(h.promena).toHaveBeenLastCalledWith(null);
    kljuc(radio(el, 1), 'ArrowLeft');
    expect(h.promena).toHaveBeenLastCalledWith(null);
  });

  it('onemogućeno ništa ne emituje', () => {
    const { el, h } = napravi(h => { izbor(h); h.onemoguceno.set(true); });
    radio(el, 3).click();
    kljuc(radio(el, 2), 'ArrowRight');
    expect(h.promena).not.toHaveBeenCalled();
  });
});
