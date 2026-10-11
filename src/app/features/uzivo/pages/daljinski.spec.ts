import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BravaEkrana } from '../data-access/budan-ekran';
import { dozvoljeneKomande } from '../data-access/izvodjenje-pravila';
import { infoSlajd, naPitanju, platnoSlajd, stanje } from '../data-access/izvodjenje-podaci.testing';
import { IzvodjenjeStore } from '../data-access/izvodjenje.store';
import { ServerskiSat } from '../data-access/sat';
import { NastavnickoStanje } from '../data-access/uzivo.models';
import { isprazniMikrozadatke, pomeriSat, saLaznimSatom } from '../lazni-sat.testing';
import { DaljinskiPage, OSVEZI_BEZ_VEZE_MS, PRIKAZ_GRESKE_MS } from './daljinski.page';

class LaznaBrava extends EventTarget implements BravaEkrana {
  released = false;
  async release(): Promise<void> {
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}

const naInfo = (izmene: Partial<NastavnickoStanje> = {}) => stanje({
  prikaz: 'SLAJD', indeks: 0, korak: 1, brojStavki: 3,
  trenutniSlajd: infoSlajd({ postepeno: true, beleske: 'Reci uvod.' }), sledeciSlajd: platnoSlajd({ id: 31 }), ...izmene,
});

describe('DaljinskiPage', () => {
  const stanjeS = signal<NastavnickoStanje | null>(null);
  const lazniStore = {
    stanje: stanjeS,
    greska: signal<string | null>(null),
    veza: signal<'povezivanje' | 'povezan' | 'prekinut'>('povezan'),
    salje: signal(false),
    sat: signal(new ServerskiSat()),
    dozvoljene: computed(() => dozvoljeneKomande(stanjeS())),
    init: vi.fn(),
    komanda: vi.fn(),
    osvezi: vi.fn(),
    posleVracanja: vi.fn(),
    zatvori: vi.fn(),
  };
  let brave: LaznaBrava[];
  let request: ReturnType<typeof vi.fn>;
  let vibrate: ReturnType<typeof vi.fn>;

  const postaviWakeLock = (api: unknown) =>
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: api });
  const vidljivost = (v: 'hidden' | 'visible', dogadjaj = true) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    if (dogadjaj) document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(() => {
    sessionStorage.clear();
    brave = [];
    request = vi.fn(async () => {
      const b = new LaznaBrava();
      brave.push(b);
      return b;
    });
    postaviWakeLock({ request });
    vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    for (const f of [lazniStore.init, lazniStore.komanda, lazniStore.osvezi, lazniStore.posleVracanja, lazniStore.zatvori]) f.mockClear();
    lazniStore.greska.set(null);
    lazniStore.veza.set('povezan');
    lazniStore.salje.set(false);
    stanjeS.set(naInfo());
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '5' })) } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    TestBed.overrideComponent(DaljinskiPage, { set: { providers: [{ provide: IzvodjenjeStore, useValue: lazniStore }] } });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    Reflect.deleteProperty(navigator, 'vibrate');
    Reflect.deleteProperty(document, 'visibilityState');
    stanjeS.set(null);
  });

  async function prikazi(): Promise<ComponentFixture<DaljinskiPage>> {
    const f = TestBed.createComponent(DaljinskiPage);
    f.detectChanges();
    await isprazniMikrozadatke();
    f.detectChanges();
    return f;
  }
  const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
  const napred = (f: ComponentFixture<unknown>) => el(f).querySelector<HTMLButtonElement>('.uz-dalj-napred');
  const nazad = (f: ComponentFixture<unknown>) => el(f).querySelector<HTMLButtonElement>('.uz-dalj-nazad');
  const dugme = (f: ComponentFixture<unknown>, tekst: string) =>
    Array.from(el(f).querySelectorAll<HTMLButtonElement>('.uz-dalj-pitanje button')).find(b => b.textContent?.trim() === tekst);
  /** Kraj testa: dodiri i događaji zakazuju detekciju promena (tajmer), pa se ona izvrši pre uništenja. */
  const zavrsi = async (f: ComponentFixture<unknown>) => {
    await pomeriSat(50);
    f.destroy();
  };
  const osvezi = (f: ComponentFixture<unknown>) => {
    f.detectChanges();
    return isprazniMikrozadatke();
  };

  it('init sa id-em iz rute; INFO postepeno: položaj, beleške, Napred sa oznakom, bez reda pitanja', saLaznimSatom(async () => {
    const f = await prikazi();
    expect(lazniStore.init).toHaveBeenCalledWith(5);
    expect(el(f).querySelector('.uz-dalj-polozaj')?.textContent?.trim()).toBe('1/3 · 1/3');
    expect(el(f).querySelector('app-beleske-panel')?.textContent).toContain('Reci uvod.');
    expect(el(f).querySelector('app-vreme-izvodjenja')?.classList).toContain('uz-vreme--kompaktno');
    expect(napred(f)?.getAttribute('aria-label')).toBe('Napred: Sledeća stavka');
    expect(napred(f)?.textContent).toContain('Sledeća stavka');
    expect(nazad(f)?.textContent?.trim()).toContain('Nazad');
    expect(el(f).querySelector('.uz-dalj-pitanje')).toBeNull();
    expect(el(f).querySelector('.uz-dalj-veza')?.textContent?.trim()).toBe('Povezano');
    await zavrsi(f);
  }));

  it('dodir: komanda i vibracija; odskok u 300 ms se ignoriše, drugo dugme ima svoj brojač', saLaznimSatom(async () => {
    const f = await prikazi();
    napred(f)!.click();
    expect(lazniStore.komanda).toHaveBeenCalledWith('SLEDECI');
    expect(vibrate).toHaveBeenCalledWith(12);
    await pomeriSat(100);
    napred(f)!.click();
    expect(lazniStore.komanda).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledTimes(1);
    await pomeriSat(300);
    napred(f)!.click();
    expect(lazniStore.komanda).toHaveBeenCalledTimes(2);
    nazad(f)!.click();
    expect(lazniStore.komanda).toHaveBeenCalledTimes(3);
    expect(lazniStore.komanda).toHaveBeenLastCalledWith('PRETHODNI');
    await zavrsi(f);
  }));

  it('prijava: Nazad onemogućen i opis prijave; KRAJ: Napred onemogućen i opis kraja', saLaznimSatom(async () => {
    stanjeS.set(stanje());
    const f = await prikazi();
    expect(nazad(f)!.disabled).toBe(true);
    expect(napred(f)!.disabled).toBe(false);
    expect(el(f).querySelector('app-beleske-panel')?.textContent).toContain('Prijava studenata. „Napred“ prikazuje prvi slajd.');
    stanjeS.set(stanje({ prikaz: 'KRAJ', indeks: 3 }));
    await osvezi(f);
    expect(napred(f)!.disabled).toBe(true);
    expect(el(f).querySelector('app-beleske-panel')?.textContent).toContain('Kraj prezentacije.');
    await zavrsi(f);
  }));

  it('pitanje: CEKA ima Otvori, Rezultati i Tačan su onemogućeni; ZATVORENO ih omogućava, aria-pressed prati stanje',
    saLaznimSatom(async () => {
      stanjeS.set(naPitanju('CEKA'));
      const f = await prikazi();
      expect(dugme(f, 'Otvori')?.disabled).toBe(false);
      expect(dugme(f, 'Rezultati')?.disabled).toBe(true);
      expect(dugme(f, 'Tačan')?.disabled).toBe(true);
      expect(el(f).querySelector('.uz-dalj-odgovorili')).toBeNull();
      expect(napred(f)?.getAttribute('aria-label')).toBe('Napred: Otvori pitanje');

      stanjeS.set(naPitanju('ZATVORENO', { rezultatiPrikazani: true }));
      await osvezi(f);
      expect(dugme(f, 'Otvori')).toBeDefined();
      expect(dugme(f, 'Rezultati')?.disabled).toBe(false);
      expect(dugme(f, 'Rezultati')?.getAttribute('aria-pressed')).toBe('true');
      expect(dugme(f, 'Tačan')?.disabled).toBe(false);
      expect(dugme(f, 'Tačan')?.getAttribute('aria-pressed')).toBe('false');
      expect(el(f).querySelector('.uz-dalj-odgovorili')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Odgovorili 0/2');
      dugme(f, 'Tačan')!.click();
      expect(lazniStore.komanda).toHaveBeenCalledWith('TACAN');
      await zavrsi(f);
    }));

  it('greška komande se vidi u traci (role=alert) 6 s; ista greška posle nove komande se ponovo prikaže', saLaznimSatom(async () => {
    const f = await prikazi();
    const alert = () => el(f).querySelector('.uz-dalj-greska[role="alert"]');
    lazniStore.greska.set('Prvo zatvori pitanje.');
    await osvezi(f);
    expect(alert()?.textContent).toContain('Prvo zatvori pitanje.');
    await pomeriSat(PRIKAZ_GRESKE_MS);
    await osvezi(f);
    expect(alert()).toBeNull();
    // nova komanda ne uspe sa istim razlogom: store ne menja `greska`, ali `salje` prođe true -> false
    lazniStore.salje.set(true);
    await osvezi(f);
    lazniStore.salje.set(false);
    await osvezi(f);
    expect(alert()?.textContent).toContain('Prvo zatvori pitanje.');
    lazniStore.greska.set(null);
    await osvezi(f);
    expect(alert()).toBeNull();
    await zavrsi(f);
  }));

  it('bez veze osvežava stanje na 5 s (samo dok je stranica vidljiva), a povezan zaustavlja', saLaznimSatom(async () => {
    const f = await prikazi();
    lazniStore.veza.set('prekinut');
    await osvezi(f);
    expect(el(f).querySelector('.uz-dalj-veza')?.textContent?.trim()).toBe('Veza prekinuta, povezujem…');
    await pomeriSat(OSVEZI_BEZ_VEZE_MS);
    expect(lazniStore.osvezi).toHaveBeenCalledTimes(1);
    await pomeriSat(OSVEZI_BEZ_VEZE_MS);
    expect(lazniStore.osvezi).toHaveBeenCalledTimes(2);
    vidljivost('hidden', false);
    await pomeriSat(OSVEZI_BEZ_VEZE_MS);
    expect(lazniStore.osvezi).toHaveBeenCalledTimes(2);
    vidljivost('visible', false);
    lazniStore.veza.set('povezan');
    await osvezi(f);
    await pomeriSat(2 * OSVEZI_BEZ_VEZE_MS);
    expect(lazniStore.osvezi).toHaveBeenCalledTimes(2);
    await zavrsi(f);
  }));

  it('stanje nije učitano (404 pri otvaranju): poruka greške, bez osvežavanja na 5 s', saLaznimSatom(async () => {
    stanjeS.set(null);
    lazniStore.greska.set('Izvođenje ne postoji.');
    lazniStore.veza.set('povezivanje');
    const f = await prikazi();
    expect(el(f).querySelector('.uz-dalj-kraj[role="alert"]')?.textContent).toContain('Izvođenje ne postoji.');
    await pomeriSat(3 * OSVEZI_BEZ_VEZE_MS);
    expect(lazniStore.osvezi).not.toHaveBeenCalled();
    // stanje stiglo (npr. drugi pokušaj): bez veze se osvežava kao inače
    stanjeS.set(naInfo());
    await osvezi(f);
    await pomeriSat(OSVEZI_BEZ_VEZE_MS);
    expect(lazniStore.osvezi).toHaveBeenCalledTimes(1);
    await zavrsi(f);
  }));

  it('završeno izvođenje zatvara vezu (jednom); aktivno je ne dira', saLaznimSatom(async () => {
    const f = await prikazi();
    expect(lazniStore.zatvori).not.toHaveBeenCalled();
    const s = naInfo();
    stanjeS.set({ ...s, verzija: s.verzija + 1, izvodjenje: { ...s.izvodjenje, status: 'ZAVRSENO' } });
    await osvezi(f);
    expect(lazniStore.zatvori).toHaveBeenCalledTimes(1);
    await zavrsi(f);
  }));

  it('povratak na stranicu zove store.posleVracanja', saLaznimSatom(async () => {
    const f = await prikazi();
    vidljivost('hidden');
    await pomeriSat(1_000);
    vidljivost('visible');
    expect(lazniStore.posleVracanja).toHaveBeenCalledTimes(1);
    expect(lazniStore.posleVracanja.mock.calls[0][0]).toBeGreaterThanOrEqual(0);
    await zavrsi(f);
    vidljivost('hidden');
    vidljivost('visible');
    expect(lazniStore.posleVracanja).toHaveBeenCalledTimes(1);
  }));

  it('ekran ostaje budan dok je izvođenje aktivno; ZAVRSENO: poruka, bez dugmadi, brava puštena', saLaznimSatom(async () => {
    const f = await prikazi();
    expect(request).toHaveBeenCalledTimes(1);
    expect(brave[0].released).toBe(false);
    const s = stanjeS()!;
    stanjeS.set({ ...s, verzija: s.verzija + 1, izvodjenje: { ...s.izvodjenje, status: 'ZAVRSENO' } });
    await osvezi(f);
    expect(el(f).querySelector('.uz-dalj-kraj[role="status"]')?.textContent).toContain('Izvođenje je završeno.');
    expect(napred(f)).toBeNull();
    expect(nazad(f)).toBeNull();
    expect(brave[0].released).toBe(true);
    await zavrsi(f);
  }));

  it('nova verzija stanja ne traži bravu ponovo', saLaznimSatom(async () => {
    const f = await prikazi();
    stanjeS.set(naInfo({ verzija: 2, korak: 2 }));
    await osvezi(f);
    expect(request).toHaveBeenCalledTimes(1);
    await zavrsi(f);
  }));

  it('bez Wake Lock API-ja: upozorenje', saLaznimSatom(async () => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    const f = await prikazi();
    expect(el(f).querySelector('.uz-dalj-budnost')?.textContent)
      .toContain('Ovaj pregledač ne može da drži ekran upaljenim. Produži vreme gašenja ekrana u podešavanjima telefona.');
    await zavrsi(f);
  }));

  it('odbijen Wake Lock: upozorenje i "Pokušaj ponovo" traži ponovo', saLaznimSatom(async () => {
    request.mockRejectedValueOnce(new DOMException('ne', 'NotAllowedError'));
    const f = await prikazi();
    const budnost = () => el(f).querySelector('.uz-dalj-budnost');
    expect(budnost()?.textContent).toContain('Ekran može da se ugasi: pregledač nije dozvolio da ostane upaljen.');
    const ponovo = budnost()!.querySelector('button')!;
    expect(ponovo.textContent?.trim()).toBe('Pokušaj ponovo');
    ponovo.click();
    await osvezi(f);
    expect(request).toHaveBeenCalledTimes(2);
    expect(budnost()).toBeNull();
    await zavrsi(f);
  }));

  it('promena slajda vraća skrol beležaka na vrh', saLaznimSatom(async () => {
    const f = await prikazi();
    const telo = el(f).querySelector<HTMLElement>('.uz-beleske-telo')!;
    telo.scrollTop = 400;
    stanjeS.set(naInfo({ verzija: 2, indeks: 1, korak: 0, trenutniSlajd: infoSlajd({ id: 99, beleske: 'Drugi.' }) }));
    await osvezi(f);
    expect(telo.scrollTop).toBe(0);
    await zavrsi(f);
  }));
});
