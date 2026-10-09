import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NesacuvaneIzmene } from './nesacuvane-izmene';

/** `beforeunload` kao što ga šalje pregledač; `defaultPrevented` = pregledač pita "Napustiti sajt?". */
function zatvaranje(): Event {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e;
}

describe('NesacuvaneIzmene', () => {
  let servis: NesacuvaneIzmene;

  beforeEach(() => {
    servis = TestBed.inject(NesacuvaneIzmene);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('pita pre zatvaranja samo dok neki izvor ima nesačuvanih izmena', () => {
    let n = 0;
    const izvor = { nesacuvano: () => n };
    servis.prijavi(izvor);
    expect(zatvaranje().defaultPrevented).toBe(false);
    n = 2;
    expect(servis.broj()).toBe(2);
    expect(zatvaranje().defaultPrevented).toBe(true);
    n = 0;
    expect(zatvaranje().defaultPrevented).toBe(false);
  });

  it('sabira sve izvore; odjavljen izvor se ne računa', () => {
    const a = { nesacuvano: () => 1 };
    const b = { nesacuvano: () => 3 };
    servis.prijavi(a);
    servis.prijavi(b);
    expect(servis.broj()).toBe(4);
    servis.odjavi(b);
    expect(servis.broj()).toBe(1);
    expect(zatvaranje().defaultPrevented).toBe(true);
    servis.odjavi(a);
    expect(zatvaranje().defaultPrevented).toBe(false);
  });

  it('slušalac postoji samo dok ima prijavljenih izvora; uklanja se i pri uništenju injektora', () => {
    const dodaj = vi.spyOn(window, 'addEventListener');
    const ukloni = vi.spyOn(window, 'removeEventListener');
    const izvor = { nesacuvano: () => 1 };
    servis.prijavi(izvor);
    servis.prijavi({ nesacuvano: () => 0 });
    expect(dodaj.mock.calls.filter(([tip]) => tip === 'beforeunload')).toHaveLength(1);
    servis.odjavi(izvor);
    expect(ukloni.mock.calls.filter(([tip]) => tip === 'beforeunload')).toHaveLength(0); // još jedan izvor
    TestBed.resetTestingModule(); // root injektor uništen
    expect(ukloni.mock.calls.filter(([tip]) => tip === 'beforeunload')).toHaveLength(1);
    expect(zatvaranje().defaultPrevented).toBe(false);
    dodaj.mockRestore();
    ukloni.mockRestore();
  });
});
