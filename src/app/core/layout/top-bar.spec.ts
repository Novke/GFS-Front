import { signal } from '@angular/core';
import { DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { SesijaStore } from '../auth/sesija.store';
import { ObavestenjaStore } from '../state/obavestenja.store';
import { TopBar } from './top-bar';

describe('TopBar', () => {
  function napravi() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SesijaStore, useValue: { korisnik: signal('nastavnik') } },
        { provide: ObavestenjaStore, useValue: { broj: signal({ neprocitana: 2, otvorena: 2 }), pokreni: vi.fn() } },
      ],
      // zvono i meni korisnika su `@defer`: spec ih pušta ručno
      deferBlockBehavior: DeferBlockBehavior.Manual,
    });
    const f = TestBed.createComponent(TopBar);
    const pretraga = vi.fn();
    f.componentInstance.pretraga.subscribe(pretraga);
    f.detectChanges();
    return { f, pretraga };
  }

  const pritisni = (init: KeyboardEventInit, cilj: EventTarget = document.body) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    cilj.dispatchEvent(e);
    return e;
  };

  it('Ctrl+K i / otvaraju pretragu (i sprečavaju podrazumevanu radnju pregledača)', () => {
    const { pretraga } = napravi();
    expect(pritisni({ key: 'k', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(pritisni({ key: '/' }).defaultPrevented).toBe(true);
    expect(pretraga).toHaveBeenCalledTimes(2);
  });

  it('/ u polju za unos piše kosu crtu', () => {
    const { pretraga } = napravi();
    const polje = document.createElement('input');
    document.body.appendChild(polje);
    expect(pritisni({ key: '/' }, polje).defaultPrevented).toBe(false);
    expect(pretraga).not.toHaveBeenCalled();
    polje.remove();
  });

  it('hamburger samo kad je navigacija drawer', () => {
    const { f } = napravi();
    expect(f.nativeElement.querySelector('[data-meni]')).toBeNull();
    f.componentRef.setInput('prikaziMeni', true);
    f.detectChanges();
    expect(f.nativeElement.querySelector('[data-meni]')).not.toBeNull();
  });

  it('zvono i meni korisnika su odloženi (@defer, van početnog paketa); dok se ne učitaju, mesto je rezervisano', async () => {
    const { f } = napravi();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('app-obavestenja-meni')).toBeNull();
    expect(el.querySelector('[data-mesto-naloga]')).not.toBeNull();
    const [blok] = await f.getDeferBlocks();
    await blok.render(DeferBlockState.Complete);
    expect(el.querySelector('[data-mesto-naloga]')).toBeNull();
    expect(el.querySelector('app-obavestenja-meni [data-znacka]')?.textContent?.trim()).toBe('2');
    expect(el.querySelector('app-korisnik-meni button[data-korisnik]')?.getAttribute('aria-label')).toBe('Nalog: nastavnik');
  });
});
