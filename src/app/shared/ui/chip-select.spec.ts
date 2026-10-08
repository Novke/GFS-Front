import { OverlayContainer } from '@angular/cdk/overlay';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ChipSelect, ChipOpcija } from './chip-select';

const OPCIJE: ChipOpcija<number>[] = [
  { vrednost: 1, labela: 'UPR' },
  { vrednost: 2, labela: 'NG' },
];

@Component({
  imports: [ChipSelect],
  template: `<app-chip-select labela="Predmet" [opcije]="opcije" [vrednost]="vrednost()" [zakljucano]="zakljucano()"
    (vrednostChange)="promena($event)" />`,
})
class Host {
  opcije = OPCIJE;
  vrednost = signal<number | null>(null);
  zakljucano = signal(false);
  promena = vi.fn();
}

function napravi(vrednost: number | null, zakljucano = false) {
  const f = TestBed.createComponent(Host);
  f.componentInstance.vrednost.set(vrednost);
  f.componentInstance.zakljucano.set(zakljucano);
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  return { f, el, promena: f.componentInstance.promena };
}

describe('ChipSelect', () => {
  it('bez vrednosti prikazuje samo labelu i nema dugme za uklanjanje', () => {
    const { el } = napravi(null);
    expect(el.querySelector('[data-otvori]')!.textContent).toContain('Predmet');
    expect(el.querySelector('[data-otvori]')!.textContent).not.toContain(':');
    expect(el.querySelector('[data-ukloni]')).toBeNull();
  });

  it('aktivan chip prikazuje "Labela: Vrednost"', () => {
    const { el } = napravi(2);
    expect(el.querySelector('[data-otvori]')!.textContent!.replace(/\s+/g, ' ')).toContain('Predmet: NG');
  });

  it('x emituje null', () => {
    const { el, promena } = napravi(1);
    const x = el.querySelector<HTMLButtonElement>('[data-ukloni]')!;
    expect(x.getAttribute('aria-label')).toBe('Ukloni filter Predmet');
    x.click();
    expect(promena).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('izbor opcije u meniju emituje njenu vrednost', async () => {
    const { f, el, promena } = napravi(null);
    el.querySelector<HTMLButtonElement>('[data-otvori]')!.click();
    f.detectChanges();
    await f.whenStable();
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    const stavke = [...overlay.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')];
    expect(stavke.map(s => s.textContent!.trim())).toEqual(['UPR', 'NG']);
    stavke[1].click();
    expect(promena).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('izbor već izabrane opcije ne emituje ništa', async () => {
    const { f, el, promena } = napravi(1);
    el.querySelector<HTMLButtonElement>('[data-otvori]')!.click();
    f.detectChanges();
    await f.whenStable();
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    const izabrana = overlay.querySelector<HTMLButtonElement>('[aria-checked=true]')!;
    expect(izabrana.textContent).toContain('UPR');
    izabrana.click();
    expect(promena).not.toHaveBeenCalled();
  });

  it('zaključan chip prikazuje vrednost, bez x i bez menija', () => {
    const { el } = napravi(1, true);
    expect(el.textContent!.replace(/\s+/g, ' ')).toContain('Predmet: UPR');
    expect(el.querySelector('[data-ukloni]')).toBeNull();
    expect(el.querySelector('button')).toBeNull();
  });

  it('vrednost koje nema među opcijama (obrisana grupa) prikazuje —', () => {
    const { el } = napravi(99);
    expect(el.querySelector('[data-otvori]')!.textContent!.replace(/\s+/g, ' ')).toContain('Predmet: —');
  });
});
