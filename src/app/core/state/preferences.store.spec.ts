import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_NEDAVNO, NedavnoStavka, PREFS_KLJUC, PreferencesStore } from './preferences.store';

type Slusalac = (e: { matches: boolean }) => void;

/** Lažni matchMedia: `postavi(true)` simulira prelazak sistema na tamnu temu. */
function lazniMatchMedia(pocetno: boolean) {
  let matches = pocetno;
  const slusaoci = new Set<Slusalac>();
  const mql = {
    get matches() { return matches; },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, l: Slusalac) => slusaoci.add(l),
    removeEventListener: (_: string, l: Slusalac) => slusaoci.delete(l),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mql));
  return {
    postavi(v: boolean) {
      matches = v;
      slusaoci.forEach(l => l({ matches: v }));
    },
  };
}

function napraviStore() {
  const store = TestBed.inject(PreferencesStore);
  TestBed.tick();
  return store;
}

function stavka(id: number, tip: NedavnoStavka['tip'] = 'predavanje'): NedavnoStavka {
  return { tip, id, naslov: `Stavka ${id}`, url: `/${tip}/${id}` };
}

describe('PreferencesStore', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['mode'];
    document.documentElement.style.colorScheme = '';
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('podrazumevano je režim sistem, bez filtera i nedavnih', () => {
    lazniMatchMedia(false);
    const store = napraviStore();
    expect(store.rezim()).toBe('sistem');
    expect(store.nedavno()).toEqual([]);
    expect(store.filteri('predavanja')).toBeNull();
  });

  it('store nema konflikt članova (signalStore ne upozorava na override)', () => {
    lazniMatchMedia(false);
    const upozorenje = vi.spyOn(console, 'warn');
    napraviStore();
    expect(upozorenje).not.toHaveBeenCalled();
  });

  it('sistem prati prefers-color-scheme i reaguje na promenu', () => {
    const mm = lazniMatchMedia(false);
    const store = napraviStore();
    expect(store.efektivniRezim()).toBe('dan');
    expect(document.documentElement.dataset['mode']).toBe('dan');

    mm.postavi(true);
    TestBed.tick();
    expect(store.efektivniRezim()).toBe('noc');
    expect(document.documentElement.dataset['mode']).toBe('noc');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('bez matchMedia (stari browser) sistem znači dan', () => {
    vi.stubGlobal('matchMedia', undefined);
    const store = napraviStore();
    expect(store.efektivniRezim()).toBe('dan');
  });

  it("postaviRezim('noc') upisuje localStorage, data-mode i color-scheme", () => {
    lazniMatchMedia(false);
    const store = napraviStore();
    store.postaviRezim('noc');
    TestBed.tick();

    expect(store.rezim()).toBe('noc');
    expect(store.efektivniRezim()).toBe('noc');
    expect(JSON.parse(localStorage.getItem(PREFS_KLJUC) ?? '{}').rezim).toBe('noc');
    expect(document.documentElement.dataset['mode']).toBe('noc');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    store.postaviRezim('dan');
    TestBed.tick();
    expect(document.documentElement.dataset['mode']).toBe('dan');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('izabran režim ima prednost nad sistemom', () => {
    lazniMatchMedia(true);
    localStorage.setItem(PREFS_KLJUC, JSON.stringify({ rezim: 'dan' }));
    const store = napraviStore();
    expect(store.rezim()).toBe('dan');
    expect(store.efektivniRezim()).toBe('dan');
  });

  it('učitava sačuvano stanje iz localStorage', () => {
    lazniMatchMedia(false);
    localStorage.setItem(PREFS_KLJUC, JSON.stringify({
      rezim: 'noc',
      filteri: { predavanja: { grupa: '3', strana: '2' } },
      nedavno: [stavka(5)],
    }));
    const store = napraviStore();
    expect(store.rezim()).toBe('noc');
    expect(store.filteri('predavanja')).toEqual({ grupa: '3', strana: '2' });
    expect(store.nedavno()).toEqual([stavka(5)]);
  });

  it('oštećen localStorage ne ruši store, vraća podrazumevano stanje', () => {
    lazniMatchMedia(false);
    localStorage.setItem(PREFS_KLJUC, '{ovo nije json');
    const store = napraviStore();
    expect(store.rezim()).toBe('sistem');
    expect(store.nedavno()).toEqual([]);
    expect(store.filteri('predavanja')).toBeNull();
  });

  it('pogrešan oblik sačuvanog stanja se odbacuje po polju', () => {
    lazniMatchMedia(false);
    localStorage.setItem(PREFS_KLJUC, JSON.stringify({ rezim: 'ljubicasto', filteri: [1, 2], nedavno: 'x' }));
    const store = napraviStore();
    expect(store.rezim()).toBe('sistem');
    expect(store.filteri('0')).toBeNull();
    expect(store.nedavno()).toEqual([]);
  });

  it('localStorage koji baca izuzetak (privatni režim) ne ruši store', () => {
    lazniMatchMedia(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    const store = napraviStore();
    expect(store.rezim()).toBe('sistem');
    expect(() => { store.postaviRezim('noc'); TestBed.tick(); }).not.toThrow();
    expect(store.rezim()).toBe('noc');
  });

  it("filteri('nepostojeci') vraća null, sacuvajFiltere pamti i upisuje", () => {
    lazniMatchMedia(false);
    const store = napraviStore();
    expect(store.filteri('nepostojeci')).toBeNull();

    store.sacuvajFiltere('testovi', { predmet: '7', sort: 'datum,desc' });
    expect(store.filteri('testovi')).toEqual({ predmet: '7', sort: 'datum,desc' });
    expect(JSON.parse(localStorage.getItem(PREFS_KLJUC) ?? '{}').filteri.testovi).toEqual({ predmet: '7', sort: 'datum,desc' });
  });

  it('zabeleziNedavno: najnovije na vrhu, isti tip+id bez duplikata', () => {
    lazniMatchMedia(false);
    const store = napraviStore();
    store.zabeleziNedavno(stavka(1));
    store.zabeleziNedavno(stavka(1, 'test'));
    store.zabeleziNedavno(stavka(2));
    store.zabeleziNedavno({ ...stavka(1), naslov: 'Novi naslov' });

    expect(store.nedavno().map(s => `${s.tip}:${s.id}`)).toEqual(['predavanje:1', 'predavanje:2', 'test:1']);
    expect(store.nedavno()[0].naslov).toBe('Novi naslov');
    expect(JSON.parse(localStorage.getItem(PREFS_KLJUC) ?? '{}').nedavno).toHaveLength(3);
  });

  it(`zabeleziNedavno čuva najviše ${MAX_NEDAVNO} stavki`, () => {
    lazniMatchMedia(false);
    const store = napraviStore();
    for (let i = 1; i <= 12; i++) {
      store.zabeleziNedavno(stavka(i));
    }
    expect(MAX_NEDAVNO).toBe(8);
    expect(store.nedavno()).toHaveLength(8);
    expect(store.nedavno()[0].id).toBe(12);
    expect(store.nedavno()[7].id).toBe(5);
  });
});
