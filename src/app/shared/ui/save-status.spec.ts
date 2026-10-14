import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { SaveStatus, StanjeCuvanja } from './save-status';

@Component({
  imports: [SaveStatus],
  template: `<app-save-status [stanje]="stanje()" (ponovo)="ponovo()" />`,
})
class Host {
  stanje = signal<StanjeCuvanja | null>(null);
  ponovo = vi.fn();
}

describe('SaveStatus', () => {
  function napravi() {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const el = f.nativeElement.querySelector('app-save-status') as HTMLElement;
    return { f, el, h: f.componentInstance };
  }

  it('je aria-live="polite" region i bez stanja je prazan', () => {
    const { el } = napravi();
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.textContent!.trim()).toBe('');
  });

  it('svako stanje ima tekst (ne samo ikonu)', () => {
    const { f, el, h } = napravi();
    const tekstovi: [StanjeCuvanja, string][] = [['cuva', 'Čuva se…'], ['sacuvano', 'Sačuvano'], ['greska', 'Nije sačuvano']];
    for (const [stanje, tekst] of tekstovi) {
      h.stanje.set(stanje);
      f.detectChanges();
      expect(el.textContent).toContain(tekst);
    }
  });

  it('greška nudi "Pokušaj ponovo"', () => {
    const { f, el, h } = napravi();
    h.stanje.set('sacuvano');
    f.detectChanges();
    expect(el.querySelector('button')).toBeNull();
    h.stanje.set('greska');
    f.detectChanges();
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(h.ponovo).toHaveBeenCalledTimes(1);
  });
});
