import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { Paginator, SrPaginatorIntl } from './paginator';

@Component({
  imports: [Paginator],
  template: `<app-paginator [ukupno]="ukupno()" [strana]="strana()" [velicina]="velicina()"
    (stranaChange)="strana$($event)" (velicinaChange)="velicina$($event)" />`,
})
class Host {
  ukupno = signal(120);
  strana = signal(1);
  velicina = signal(25);
  strana$ = vi.fn();
  velicina$ = vi.fn();
}

describe('SrPaginatorIntl', () => {
  const intl = new SrPaginatorIntl();

  it('srpske labele', () => {
    expect(intl.itemsPerPageLabel).toBe('Po strani');
    expect(intl.nextPageLabel).toBe('Sledeća strana');
    expect(intl.previousPageLabel).toBe('Prethodna strana');
    expect(intl.firstPageLabel).toBe('Prva strana');
    expect(intl.lastPageLabel).toBe('Poslednja strana');
  });

  it('opseg "1–25 od 120", poslednja nepuna strana i prazna lista', () => {
    expect(intl.getRangeLabel(0, 25, 120)).toBe('1–25 od 120');
    expect(intl.getRangeLabel(4, 25, 120)).toBe('101–120 od 120');
    expect(intl.getRangeLabel(0, 25, 0)).toBe('0 od 0');
  });
});

describe('Paginator', () => {
  function napravi() {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement, h: f.componentInstance };
  }

  it('prikazuje srpski opseg i strana je 1-based', () => {
    const { f, el, h } = napravi();
    expect(el.textContent).toContain('1–25 od 120');
    h.strana.set(2);
    f.detectChanges();
    expect(el.textContent).toContain('26–50 od 120');
  });

  it('Sledeća strana emituje stranaChange(2), ne velicinaChange', () => {
    const { el, h } = napravi();
    el.querySelector<HTMLButtonElement>('button[aria-label="Sledeća strana"]')!.click();
    expect(h.strana$).toHaveBeenCalledExactlyOnceWith(2);
    expect(h.velicina$).not.toHaveBeenCalled();
  });

  it('nema paginatora kad je lista prazna', () => {
    const { f, el, h } = napravi();
    h.ukupno.set(0);
    f.detectChanges();
    expect(el.querySelector('mat-paginator')).toBeNull();
  });
});
