import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnketeStudentaStore } from '../data-access/ankete-studenta.store';
import { anketaStudentu as a } from '../data-access/ankete-studenta.testing';
import { AnketaListComponent } from './anketa-list.component';

describe('AnketaListComponent', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof AnketeStudentaStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AnketeStudentaStore);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  function napravi(izvor: 'nalog' | 'uzivo' = 'nalog'): ComponentFixture<AnketaListComponent> {
    const f = TestBed.createComponent(AnketaListComponent);
    f.componentRef.setInput('izvor', izvor);
    f.detectChanges();
    return f;
  }
  const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
  const crtaj = async (f: ComponentFixture<unknown>) => {
    f.detectChanges();
    await f.whenStable();
  };

  it('bez ankete ne crta ništa; nalog ne pita server', () => {
    const f = napravi();
    expect(el(f).querySelector('[data-anketa-list]')).toBeNull();
    http.expectNone('api/public/nalog/ankete');
  });

  it('jedan odgovor: oznake, dugmad sa aria-pressed, dodir glasa; posle glasa poruka i "Zatvori"', async () => {
    store.primi([a(1)]);
    const f = napravi();
    const list = el(f).querySelector('[data-anketa-list]')!;
    expect(list.textContent).toContain('Anketa');
    expect(list.textContent).toContain('anonimno');
    expect(list.querySelector('h2')?.textContent).toBe('Da li vam treba pauza?');
    expect(list.querySelector('[data-anketa-skloni]')?.textContent?.trim()).toBe('Kasnije');
    const dugmad = [...list.querySelectorAll<HTMLButtonElement>('[data-anketa-odgovor]')];
    expect(dugmad.map(d => d.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false']);
    dugmad[1].click();
    http.expectOne('api/public/nalog/ankete/1/glas').flush(a(1, { mojGlas: [1] }));
    await crtaj(f);
    const posle = el(f).querySelector('[data-anketa-list]')!;
    expect([...posle.querySelectorAll('[data-anketa-odgovor]')].map(d => d.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(posle.querySelector('[data-anketa-stanje]')?.textContent).toContain('Glas je zabeležen ✓ · možeš da ga promeniš dok je otvoreno');
    expect(posle.querySelector('[data-anketa-skloni]')?.textContent?.trim()).toBe('Zatvori');
    // promena glasa
    posle.querySelectorAll<HTMLButtonElement>('[data-anketa-odgovor]')[2].click();
    expect(http.expectOne('api/public/nalog/ankete/1/glas').request.body).toEqual({ opcije: [2] });
  });

  it('više odgovora: kućice pa "Pošalji" (onemogućeno bez izbora), posle glasa "Promeni glas"', async () => {
    store.primi([a(2, { viseOdgovora: true })]);
    const f = napravi();
    const posalji = () => el(f).querySelector<HTMLButtonElement>('[data-anketa-posalji]')!;
    expect(posalji().disabled).toBe(true);
    const kucice = [...el(f).querySelectorAll<HTMLInputElement>('[data-anketa-odgovor]')];
    kucice[0].click();
    kucice[2].click();
    await crtaj(f);
    expect(posalji().disabled).toBe(false);
    expect(posalji().textContent?.trim()).toBe('Pošalji');
    posalji().click();
    const req = http.expectOne('api/public/nalog/ankete/2/glas');
    expect(req.request.body).toEqual({ opcije: [0, 2] });
    req.flush(a(2, { viseOdgovora: true, mojGlas: [0, 2] }));
    await crtaj(f);
    expect(posalji().textContent?.trim()).toBe('Promeni glas');
    // isti izbor kao poslat: dugme ništa ne šalje
    posalji().click();
    http.expectNone('api/public/nalog/ankete/2/glas');
  });

  it('odbrojavanje kad ima rok; pokazan rezultat crta trake; zatvorena bez dugmadi za glas', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const sada = new Date(2026, 10, 24, 10, 40).getTime();
    vi.setSystemTime(sada);
    store.primi([a(3, { rokMs: sada + 42_000, sadaMs: sada, mojGlas: [0], rezultat: { glasovi: [14, 6, 3], brojGlasalo: 23 } })]);
    store.otvori(3);
    const f = napravi();
    expect(el(f).querySelector('[data-anketa-rok]')?.textContent).toBe('0:42');
    vi.advanceTimersByTime(2000);
    await crtaj(f);
    expect(el(f).querySelector('[data-anketa-rok]')?.textContent).toBe('0:40');
    expect(el(f).querySelectorAll('[data-traka-ankete]').length).toBe(3);
    expect(el(f).querySelector('[data-anketa-rezultat]')?.textContent).toContain('Rezultat · 23 glasa');

    store.primi([a(3, { otvorena: false, sadaMs: sada, mojGlas: [0], rezultat: { glasovi: [14, 6, 3], brojGlasalo: 23 } })]);
    await crtaj(f);
    expect(el(f).querySelector('[data-anketa-rok]')).toBeNull();
    expect(el(f).querySelector('[data-anketa-stanje]')?.textContent).toContain('Anketa je zatvorena.');
    expect([...el(f).querySelectorAll<HTMLButtonElement>('[data-anketa-odgovor]')].every(d => d.disabled)).toBe(true);
  });

  it('"Kasnije" sklanja list; greška servera se vidi u listu', async () => {
    store.primi([a(4)]);
    const f = napravi();
    el(f).querySelector<HTMLButtonElement>('[data-anketa-odgovor]')!.click();
    http.expectOne('api/public/nalog/ankete/4/glas').flush({ reason: 'Ova anketa nije za tebe.' }, { status: 403, statusText: 'Forbidden' });
    http.expectOne('api/public/nalog/ankete').flush([a(4)]);
    await crtaj(f);
    expect(el(f).querySelector('[data-anketa-stanje]')?.textContent).toContain('Ova anketa nije za tebe.');
    el(f).querySelector<HTMLButtonElement>('[data-anketa-skloni]')!.click();
    await crtaj(f);
    expect(el(f).querySelector('[data-anketa-list]')).toBeNull();
  });

  describe('izvor="uzivo" (telefon u prezentaciji)', () => {
    beforeEach(() => vi.useFakeTimers());

    it('pita odmah i na 10 s ± 2 s; skrivena stranica ne pita, povratak pita odmah', async () => {
      const f = napravi('uzivo');
      http.expectOne('api/public/nalog/ankete').flush([a(7)]);
      await crtaj(f);
      expect(el(f).querySelector('[data-anketa-list]')).not.toBeNull();
      await vi.advanceTimersByTimeAsync(7_999);
      http.expectNone('api/public/nalog/ankete');
      await vi.advanceTimersByTimeAsync(4_001);
      http.expectOne('api/public/nalog/ankete').flush([]);

      let vidljivost: DocumentVisibilityState = 'hidden';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vidljivost });
      try {
        await vi.advanceTimersByTimeAsync(12_000);
        http.expectNone('api/public/nalog/ankete');
        vidljivost = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        http.expectOne('api/public/nalog/ankete').flush([]);
      } finally {
        delete (document as unknown as Record<string, unknown>)['visibilityState'];
      }
      f.destroy();
    });

    it('401 zaustavlja upite; 429 odlaže', async () => {
      const f = napravi('uzivo');
      http.expectOne('api/public/nalog/ankete').flush(null, { status: 429, statusText: 'Too Many Requests' });
      await vi.advanceTimersByTimeAsync(12_000);
      http.expectNone('api/public/nalog/ankete');
      await vi.advanceTimersByTimeAsync(10_000);
      http.expectOne('api/public/nalog/ankete').flush(null, { status: 401, statusText: 'Unauthorized' });
      await vi.advanceTimersByTimeAsync(120_000);
      http.expectNone('api/public/nalog/ankete');
      f.destroy();
    });
  });
});
