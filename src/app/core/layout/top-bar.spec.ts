import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { TopBar } from './top-bar';

describe('TopBar', () => {
  function napravi() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
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
});
