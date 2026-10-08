import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EmptyState, ErrorPanel, SKELETON_KASNJENJE_MS, SkeletonRows } from './list-states';

@Component({
  imports: [EmptyState, ErrorPanel, SkeletonRows],
  template: `
    <app-empty-state naslov="Nema predavanja za izabrane filtere" tekst="Promeni ili očisti filtere.">
      <button type="button" class="akcija">Očisti filtere</button>
    </app-empty-state>
    <app-error-panel [poruka]="poruka()" (ponovo)="ponovo()" />
    @if (ucitava()) {
      <app-skeleton-rows [redovi]="3" />
    }
  `,
})
class Host {
  poruka = signal('Sistemska greška. Pokušaj ponovo.');
  ucitava = signal(false);
  ponovo = vi.fn();
}

describe('stanja liste', () => {
  afterEach(() => vi.useRealTimers());

  function napravi() {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement, h: f.componentInstance };
  }

  it('EmptyState: naslov, tekst i projektovana akcija', () => {
    const { el } = napravi();
    const prazno = el.querySelector('app-empty-state')!;
    expect(prazno.querySelector('h2')!.textContent).toContain('Nema predavanja za izabrane filtere');
    expect(prazno.textContent).toContain('Promeni ili očisti filtere.');
    expect(prazno.querySelector('.akcija')).not.toBeNull();
  });

  it('ErrorPanel: poruka kao alert i "Pokušaj ponovo" emituje ponovo', () => {
    const { el, h } = napravi();
    const panel = el.querySelector('app-error-panel [role=alert]')!;
    expect(panel.textContent).toContain('Sistemska greška. Pokušaj ponovo.');
    el.querySelector<HTMLButtonElement>('app-error-panel button')!.click();
    expect(h.ponovo).toHaveBeenCalledTimes(1);
  });

  it(`SkeletonRows se pojavljuje tek posle ${SKELETON_KASNJENJE_MS} ms (brzo učitavanje ne trepće)`, () => {
    vi.useFakeTimers();
    const { f, el, h } = napravi();
    h.ucitava.set(true);
    f.detectChanges();
    const kostur = () => el.querySelectorAll('app-skeleton-rows .red');
    expect(kostur()).toHaveLength(0);
    expect(el.querySelector('app-skeleton-rows [role=status]')!.textContent).toContain('Učitavanje');
    vi.advanceTimersByTime(SKELETON_KASNJENJE_MS);
    f.detectChanges();
    expect(kostur()).toHaveLength(3);
  });
});
