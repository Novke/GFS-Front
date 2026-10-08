import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEBOUNCE_PRETRAGE_MS, FilterBar } from './filter-bar';

@Component({
  imports: [FilterBar],
  template: `
    <app-filter-bar [pretraga]="pretraga()" [imaFiltera]="imaFiltera()" pretragaLabela="Pretraži po temi…"
      (pretragaChange)="promena($event)" (ocisti)="ocisti()">
      <span class="moj-chip">Predmet</span>
    </app-filter-bar>
  `,
})
class Host {
  pretraga = signal<string | null | undefined>(null);
  imaFiltera = signal(false);
  promena = vi.fn();
  ocisti = vi.fn();
}

function napravi() {
  const f = TestBed.createComponent(Host);
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const polje = () => el.querySelector<HTMLInputElement>('input[type=search]');
  const kucaj = (tekst: string) => {
    polje()!.value = tekst;
    polje()!.dispatchEvent(new Event('input'));
  };
  return { f, el, polje, kucaj, h: f.componentInstance };
}

describe('FilterBar', () => {
  afterEach(() => vi.useRealTimers());

  it(`pretraga se emituje jednom, ${DEBOUNCE_PRETRAGE_MS} ms posle poslednjeg otkucaja`, () => {
    vi.useFakeTimers();
    const { kucaj, h } = napravi();
    kucaj('p');
    vi.advanceTimersByTime(200);
    kucaj('pe');
    vi.advanceTimersByTime(200);
    kucaj('pet');
    vi.advanceTimersByTime(DEBOUNCE_PRETRAGE_MS - 1);
    expect(h.promena).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(h.promena).toHaveBeenCalledExactlyOnceWith('pet');
  });

  it('prazna pretraga (samo razmaci) se emituje kao null', () => {
    vi.useFakeTimers();
    const { f, kucaj, h } = napravi();
    h.pretraga.set('pet');
    f.detectChanges();
    kucaj('   ');
    vi.advanceTimersByTime(DEBOUNCE_PRETRAGE_MS);
    expect(h.promena).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('ne emituje ako se tekst nije promenio u odnosu na ulaz', () => {
    vi.useFakeTimers();
    const { f, kucaj, h } = napravi();
    h.pretraga.set('pet');
    f.detectChanges();
    kucaj('pet ');
    vi.advanceTimersByTime(DEBOUNCE_PRETRAGE_MS);
    expect(h.promena).not.toHaveBeenCalled();
  });

  it('spoljašnja promena (Očisti, URL) upisuje se u polje, ali ne dok korisnik kuca', () => {
    vi.useFakeTimers();
    const { f, polje, kucaj, h } = napravi();
    h.pretraga.set('funkcije');
    f.detectChanges();
    expect(polje()!.value).toBe('funkcije');
    kucaj('petlje');
    h.pretraga.set('funkcije i');
    f.detectChanges();
    expect(polje()!.value).toBe('petlje');
    vi.advanceTimersByTime(DEBOUNCE_PRETRAGE_MS);
    expect(h.promena).toHaveBeenCalledExactlyOnceWith('petlje');
  });

  it('bez ulaza pretraga (undefined) nema polja za pretragu', () => {
    const { f, polje, h } = napravi();
    h.pretraga.set(undefined);
    f.detectChanges();
    expect(polje()).toBeNull();
  });

  it('polje ima labelu, chipovi se projektuju', () => {
    const { el, polje } = napravi();
    expect(polje()!.getAttribute('aria-label')).toBe('Pretraži po temi…');
    expect(el.querySelector('.moj-chip')).not.toBeNull();
  });

  it('"Očisti filtere" samo kad ima filtera; klik emituje ocisti i odbacuje kucanje na čekanju', () => {
    vi.useFakeTimers();
    const { f, el, kucaj, h } = napravi();
    const dugme = () => el.querySelector<HTMLButtonElement>('[data-ocisti]');
    expect(dugme()).toBeNull();
    h.imaFiltera.set(true);
    f.detectChanges();
    kucaj('abc');
    dugme()!.click();
    vi.advanceTimersByTime(DEBOUNCE_PRETRAGE_MS);
    expect(h.ocisti).toHaveBeenCalledTimes(1);
    expect(h.promena).not.toHaveBeenCalled();
  });
});
