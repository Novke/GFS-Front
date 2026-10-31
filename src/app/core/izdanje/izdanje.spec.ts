import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { NesacuvaneIzmene } from '../state/nesacuvane-izmene';
import {
  DOHVATI_IZDANJE, Izdanje, KLJUC_OSVEZAVANJA, META_IZDANJA, PERIOD_MS, RAZMAK_HITNO_MS, RAZMAK_MS, UCITAVANJE_STRANE,
  ZASTITA_MS,
} from './izdanje';

@Component({ template: '' })
class Prazna {}

const GRESKA_CHUNKA = () => new TypeError('Failed to fetch dynamically imported module: https://gfs.trif.rs/chunk-Bc1bQlpj.js');

describe('Izdanje', () => {
  let server: string | null;
  let dohvati: ReturnType<typeof vi.fn>;
  let ucitaj: ReturnType<typeof vi.fn>;
  let osvezi: ReturnType<typeof vi.fn>;
  let nesacuvano: number;

  function postaviMeta(izdanje: string | null) {
    document.head.querySelector(`meta[name="${META_IZDANJA}"]`)?.remove();
    if (izdanje !== null) {
      const m = document.createElement('meta');
      m.name = META_IZDANJA;
      m.content = izdanje;
      document.head.appendChild(m);
    }
  }

  function napravi(ucitano: string | null = 'A') {
    postaviMeta(ucitano);
    dohvati = vi.fn(() => Promise.resolve(server));
    ucitaj = vi.fn();
    osvezi = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'a', component: Prazna },
          { path: 'b', component: Prazna },
          { path: 'zakljucano', component: Prazna, canActivate: [() => false] },
          { path: 'lenja', loadComponent: () => Promise.reject(GRESKA_CHUNKA()) },
        ]),
        { provide: DOHVATI_IZDANJE, useValue: dohvati },
        { provide: UCITAVANJE_STRANE, useValue: { ucitaj, osvezi } },
        { provide: NesacuvaneIzmene, useValue: { broj: () => nesacuvano } },
      ],
    });
    return { izdanje: TestBed.inject(Izdanje), router: TestBed.inject(Router) };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-10-28T09:00:00'));
    server = 'A';
    nesacuvano = 0;
    sessionStorage.clear();
    // jsdom kartica nije "vidljiva" (prerender); provera po periodu i povratku na karticu traži vidljivu.
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });

  afterEach(() => {
    delete (document as { visibilityState?: unknown }).visibilityState;
    TestBed.resetTestingModule();
    postaviMeta(null);
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('bez meta oznake (ng serve, testovi) ne pita server i ne sluša ništa', async () => {
    const { izdanje } = napravi(null);
    expect(izdanje.ucitano).toBeNull();
    expect(await izdanje.proveri(true)).toBe('nepoznato');
    vi.advanceTimersByTime(PERIOD_MS * 3);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(dohvati).not.toHaveBeenCalled();
  });

  it('isto izdanje: ništa; novo izdanje na serveru: novo()', async () => {
    const { izdanje } = napravi();
    expect(await izdanje.proveri()).toBe('isto');
    expect(izdanje.novo()).toBeNull();
    server = 'B';
    vi.advanceTimersByTime(RAZMAK_MS);
    expect(await izdanje.proveri()).toBe('novo');
    expect(izdanje.novo()).toBe('B');
  });

  it('rollback na izdanje kartice briše novo(); nepoznato (mreža) ga ne dira', async () => {
    const { izdanje } = napravi();
    server = 'B';
    await izdanje.proveri();
    server = null;
    vi.advanceTimersByTime(RAZMAK_MS);
    expect(await izdanje.proveri()).toBe('nepoznato');
    expect(izdanje.novo()).toBe('B');
    server = 'A';
    vi.advanceTimersByTime(RAZMAK_MS);
    await izdanje.proveri();
    expect(izdanje.novo()).toBeNull();
  });

  it('istovremene provere dele jedan zahtev; obična najviše jednom u RAZMAK_MS, hitna u RAZMAK_HITNO_MS', async () => {
    const { izdanje } = napravi();
    await Promise.all([izdanje.proveri(), izdanje.proveri(), izdanje.proveri(true)]);
    expect(dohvati).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(RAZMAK_HITNO_MS - 1);
    await izdanje.proveri(true);
    expect(dohvati).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await izdanje.proveri(true);
    expect(dohvati).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(RAZMAK_MS - 1);
    await izdanje.proveri();
    expect(dohvati).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    await izdanje.proveri();
    expect(dohvati).toHaveBeenCalledTimes(3);
  });

  it('proverava svakih PERIOD_MS dok je kartica vidljiva, i pri povratku na karticu i mrežu', async () => {
    napravi();
    await vi.advanceTimersByTimeAsync(PERIOD_MS);
    expect(dohvati).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RAZMAK_MS);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(dohvati).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(RAZMAK_MS);
    window.dispatchEvent(new Event('online'));
    expect(dohvati).toHaveBeenCalledTimes(3);
  });

  it('neuhvaćeno odbijanje sa greškom učitavanja chunk-a pokreće hitnu proveru, druga odbijanja ne', async () => {
    const { izdanje } = napravi();
    await izdanje.proveri();
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('nešto drugo') }));
    vi.advanceTimersByTime(RAZMAK_HITNO_MS);
    expect(dohvati).toHaveBeenCalledTimes(1);
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: GRESKA_CHUNKA() }));
    expect(dohvati).toHaveBeenCalledTimes(2);
  });

  it('osvezi() iz trake osvežava stranu', () => {
    const { izdanje } = napravi();
    izdanje.osvezi();
    expect(osvezi).toHaveBeenCalledTimes(1);
  });

  describe('prelazak na drugu stranu kad je novo izdanje poznato', () => {
    async function saNovim() {
      const r = napravi();
      await r.router.navigateByUrl('/a?x=1');
      server = 'B';
      await r.izdanje.proveri();
      return r;
    }

    it('druga putanja: puno učitavanje te adrese i zapis zaštite', async () => {
      const { router } = await saNovim();
      await router.navigateByUrl('/b?strana=2');
      expect(ucitaj).toHaveBeenCalledWith('/b?strana=2');
      expect(JSON.parse(sessionStorage.getItem(KLJUC_OSVEZAVANJA)!)).toEqual({ cilj: 'B', vreme: Date.now() });
    });

    it('ista putanja, drugi query (filter liste): bez učitavanja', async () => {
      const { router } = await saNovim();
      await router.navigateByUrl('/a?x=2');
      expect(ucitaj).not.toHaveBeenCalled();
    });

    it('čuvar ne pušta prelazak: bez učitavanja', async () => {
      const { router } = await saNovim();
      await router.navigateByUrl('/zakljucano');
      expect(ucitaj).not.toHaveBeenCalled();
    });

    it('nesačuvane izmene: bez automatskog učitavanja (traka ostaje)', async () => {
      const { router, izdanje } = await saNovim();
      nesacuvano = 1;
      await router.navigateByUrl('/b');
      expect(ucitaj).not.toHaveBeenCalled();
      expect(izdanje.novo()).toBe('B');
    });

    it('bez poznatog novog izdanja prelazak je običan', async () => {
      const { router } = napravi();
      await router.navigateByUrl('/a');
      await router.navigateByUrl('/b');
      expect(ucitaj).not.toHaveBeenCalled();
    });
  });

  describe('ruta čiji chunk ne može da se učita', () => {
    it('novo izdanje na serveru: puno učitavanje ciljne adrese', async () => {
      const { router } = napravi();
      server = 'B';
      await router.navigateByUrl('/lenja?q=1').catch(() => undefined);
      await vi.waitFor(() => expect(ucitaj).toHaveBeenCalledWith('/lenja?q=1'));
    });

    it('isto izdanje (stvarna greška ili mreža): bez učitavanja, nema petlje', async () => {
      const { router, izdanje } = napravi();
      await router.navigateByUrl('/lenja').catch(() => undefined);
      await vi.waitFor(() => expect(dohvati).toHaveBeenCalledTimes(1));
      await izdanje.proveri();
      expect(ucitaj).not.toHaveBeenCalled();
    });
  });

  describe('zaštita od petlje (sessionStorage)', () => {
    it('kartica nastala osvežavanjem ka B, a učitano je A: bez novog automatskog učitavanja, traka da', async () => {
      sessionStorage.setItem(KLJUC_OSVEZAVANJA, JSON.stringify({ cilj: 'B', vreme: Date.now() - 1000 }));
      const { router, izdanje } = napravi('A');
      await router.navigateByUrl('/a');
      server = 'B';
      await izdanje.proveri();
      await router.navigateByUrl('/b');
      expect(izdanje.novo()).toBe('B');
      expect(ucitaj).not.toHaveBeenCalled();
    });

    it('zaštita ističe posle ZASTITA_MS, a zapis cilja koji je dobijen se briše', async () => {
      sessionStorage.setItem(KLJUC_OSVEZAVANJA, JSON.stringify({ cilj: 'B', vreme: Date.now() - ZASTITA_MS }));
      const { router, izdanje } = napravi('A');
      await router.navigateByUrl('/a');
      server = 'B';
      await izdanje.proveri();
      await router.navigateByUrl('/b');
      expect(ucitaj).toHaveBeenCalledWith('/b');
      TestBed.resetTestingModule();

      sessionStorage.setItem(KLJUC_OSVEZAVANJA, JSON.stringify({ cilj: 'C', vreme: Date.now() }));
      napravi('C');
      expect(sessionStorage.getItem(KLJUC_OSVEZAVANJA)).toBeNull();
    });
  });
});
