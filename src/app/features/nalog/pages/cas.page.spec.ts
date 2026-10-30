import { Location } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { zapamtiIzlazak } from '../../uzivo/izlaz-iz-izvodjenja';
import { CasPredavanje, CasStanje } from '../data-access/cas.models';
import { KLJUC_CEKANJA } from '../data-access/cas.pravila';
import { CasPage } from './cas.page';

const CAS = 'api/public/nalog/cas';
const CASOVI = 'api/public/nalog/casovi';
const SKENIRAJ = `${CAS}/skeniraj`;
const POTVRDI = `${CAS}/potvrdi`;
const TOKEN = '17.AAAAAAAAAAAAAAAAAAAAAA';
const KLJUC = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJ';
const PRED: CasPredavanje = { id: 17, predmet: 'Uvod u primenu računara', datum: '2026-10-28', rb: 3, tema: 'Petlje', zavrseno: false };
const NA_CASU: CasStanje = { predavanje: PRED, cekiranU: '2026-10-28T10:00:00', izvodjenje: null };
/** Najduži razmak redovnog upita (10 s + 2 s). */
const UPIT = 12_000;

const greska = (status: number, reason?: string) => ({ body: reason ? { reason } : null, opts: { status, statusText: 'x' } });

/**
 * `/nalog/cas` (spec studentskog portala 4.2): skeniranje QR-a, ključ čekanja kroz prijavu, praćenje časa (10 s ± 2 s,
 * odmah kad se stranica vrati, 429 sa odlaganjem), prelaz u Uživo izvođenje (zamena u istoriji; posle sopstvenog izlaska
 * "Uđi u prezentaciju") i van časa "Predavanje je u toku" (30 s) ili "Nisi na času" (60 s). Zove samo
 * `api/public/nalog/cas*`; "Naredni časovi" su na Početnoj.
 */
describe('CasPage', () => {
  let fixture: ComponentFixture<CasPage>;
  let http: HttpTestingController;
  let navigacija: ReturnType<typeof vi.spyOn>;
  let zamena: ReturnType<typeof vi.spyOn>;

  const tekst = () => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ?? '';

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    navigacija = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    zamena = vi.spyOn(TestBed.inject(Location), 'replaceState');
  });

  afterEach(() => {
    fixture?.destroy();
    http.verify();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  async function otvori(token: string | null = null): Promise<void> {
    fixture = TestBed.createComponent(CasPage);
    if (token) {
      fixture.componentRef.setInput('token', token);
    }
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
  }

  async function osvezi(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  }

  it('skeniranjePrijavljenogPrikazujeCas', async () => {
    await otvori(TOKEN);
    const r = http.expectOne(SKENIRAJ);
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ token: TOKEN });
    r.flush({ stanje: NA_CASU });
    await osvezi();
    expect(tekst()).toContain('Prisutan si: Uvod u primenu računara · sreda 28.10. · Petlje');
    expect(tekst()).toContain('Čeka se prezentacija');
    expect(navigacija).not.toHaveBeenCalled();
  });

  it('tokenSeBriseIzAdrese odmah, pre odgovora servera', async () => {
    await otvori(TOKEN);
    expect(zamena).toHaveBeenCalledWith('/nalog/cas');
    http.expectOne(SKENIRAJ).flush({ stanje: NA_CASU });
  });

  it('kljucIdeUSessionStorageINaPrijavu', async () => {
    await otvori(TOKEN);
    http.expectOne(SKENIRAJ).flush({ kljuc: KLJUC });
    await osvezi();
    expect(sessionStorage.getItem(KLJUC_CEKANJA)).toBe(KLJUC);
    expect(navigacija).toHaveBeenCalledWith('nalog?nazad=nalog/cas');
  });

  it('potvrdaPoslePrijave: ključ iz sessionStorage ide na potvrdu i briše se', async () => {
    sessionStorage.setItem(KLJUC_CEKANJA, KLJUC);
    await otvori();
    const r = http.expectOne(POTVRDI);
    expect(r.request.body).toEqual({ kljuc: KLJUC });
    r.flush(NA_CASU);
    await osvezi();
    expect(sessionStorage.getItem(KLJUC_CEKANJA)).toBeNull();
    expect(tekst()).toContain('Prisutan si');
  });

  it('potvrda bez sesije (401): ključ ostaje, ide na prijavu', async () => {
    sessionStorage.setItem(KLJUC_CEKANJA, KLJUC);
    await otvori();
    const g = greska(401, 'Potrebna je prijava.');
    http.expectOne(POTVRDI).flush(g.body, g.opts);
    await osvezi();
    expect(sessionStorage.getItem(KLJUC_CEKANJA)).toBe(KLJUC);
    expect(navigacija).toHaveBeenCalledWith('nalog?nazad=nalog/cas');
  });

  it('429 na skeniranju: kratko čeka i ponavlja isti token, bez poruke', async () => {
    await otvori(TOKEN);
    const g = greska(429, 'Previše zahteva.');
    http.expectOne(SKENIRAJ).flush(g.body, g.opts);
    await osvezi();
    expect(tekst()).not.toContain('Previše');
    await vi.advanceTimersByTimeAsync(2_000);
    const r = http.expectOne(SKENIRAJ);
    expect(r.request.body).toEqual({ token: TOKEN });
    r.flush({ stanje: NA_CASU });
    await osvezi();
    expect(tekst()).toContain('Prisutan si');
  });

  it('429 na potvrdi: ključ ostaje i potvrda se ponavlja; posle 5 pokušaja poruka sa "Pokušaj ponovo"', async () => {
    sessionStorage.setItem(KLJUC_CEKANJA, KLJUC);
    await otvori();
    const g = greska(429, 'Previše zahteva.');
    for (let i = 0; i < 6; i++) {
      http.expectOne(POTVRDI).flush(g.body, g.opts);
      await osvezi();
      expect(sessionStorage.getItem(KLJUC_CEKANJA)).toBe(KLJUC);
      await vi.advanceTimersByTimeAsync(9_000);
    }
    http.expectNone(POTVRDI);
    expect(tekst()).toContain('Previše zahteva.');
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')!.click();
    await osvezi();
    http.expectOne(POTVRDI).flush(NA_CASU);
    await osvezi();
    expect(sessionStorage.getItem(KLJUC_CEKANJA)).toBeNull();
    expect(tekst()).toContain('Prisutan si');
  });

  it('istekaoKljucPrikazujePoruku', async () => {
    sessionStorage.setItem(KLJUC_CEKANJA, KLJUC);
    await otvori();
    const g = greska(410, 'Čekiranje je isteklo. Skeniraj QR ponovo.');
    http.expectOne(POTVRDI).flush(g.body, g.opts);
    await osvezi();
    expect(sessionStorage.getItem(KLJUC_CEKANJA)).toBeNull();
    expect(tekst()).toContain('Čekiranje je isteklo. Skeniraj QR ponovo.');
    await vi.advanceTimersByTimeAsync(UPIT * 3);
    http.expectNone(CAS);
  });

  it('istekao QR (410 na skeniranju) prikazuje poruku servera', async () => {
    await otvori(TOKEN);
    const g = greska(410, 'QR je istekao. Skeniraj ponovo sa table.');
    http.expectOne(SKENIRAJ).flush(g.body, g.opts);
    await osvezi();
    expect(tekst()).toContain('QR je istekao. Skeniraj ponovo sa table.');
  });

  it('zavrsenCasPrikazujePoruku i prati dalje ređe (60 s)', async () => {
    await otvori();
    http.expectOne(CAS).flush({ predavanje: { ...PRED, zavrseno: true }, cekiranU: '2026-10-28T10:00:00' });
    await osvezi();
    expect(tekst()).toContain('Čas je završen.');
    expect(tekst()).toContain('Skeniraj QR sa table.');
    await vi.advanceTimersByTimeAsync(59_999);
    http.expectNone(CAS);
    await vi.advanceTimersByTimeAsync(1);
    http.expectOne(CAS).flush({ predavanje: { ...PRED, zavrseno: true }, cekiranU: '2026-10-28T10:00:00' });
  });

  it('aktivnoIzvodjenjeVodiNaUzivo (sa=cas), uz zamenu u istoriji (Nazad ne vraća na Čas)', async () => {
    await otvori();
    http.expectOne(CAS).flush(NA_CASU);
    await osvezi();
    await vi.advanceTimersByTimeAsync(UPIT);
    http.expectOne(CAS).flush({ ...NA_CASU, izvodjenje: { kod: 'AB12CD', naziv: 'Vežbe 3' } });
    await osvezi();
    expect(navigacija).toHaveBeenCalledWith('uzivo/AB12CD?sa=cas', { replaceUrl: true });
  });

  it('skeniranje dok izvođenje već traje vodi odmah u Uživo', async () => {
    await otvori(TOKEN);
    http.expectOne(SKENIRAJ).flush({ stanje: { ...NA_CASU, izvodjenje: { kod: 'AB12CD', naziv: 'Vežbe 3' } } });
    await osvezi();
    expect(navigacija).toHaveBeenCalledWith('uzivo/AB12CD?sa=cas', { replaceUrl: true });
  });

  it('student je sam izašao iz izvođenja: "Uđi u prezentaciju" bez ulaska, praćenje ide dalje; novo izvođenje ulazi samo', async () => {
    zapamtiIzlazak('AB12CD');
    await otvori();
    http.expectOne(CAS).flush({ ...NA_CASU, izvodjenje: { kod: 'AB12CD', naziv: 'Vežbe 3' } });
    await osvezi();
    expect(navigacija).not.toHaveBeenCalled();
    expect(tekst()).toContain('Prezentacija je u toku · Vežbe 3');
    const udji = (fixture.nativeElement as HTMLElement).querySelector('a[data-udji]');
    expect(udji?.getAttribute('href')).toBe('/uzivo/AB12CD?sa=cas');
    await vi.advanceTimersByTimeAsync(UPIT);
    http.expectOne(CAS).flush({ ...NA_CASU, izvodjenje: { kod: 'EF34GH', naziv: 'Vežbe 4' } });
    await osvezi();
    expect(navigacija).toHaveBeenCalledWith('uzivo/EF34GH?sa=cas', { replaceUrl: true });
  });

  it('uklonjenoPrisustvo: "Nisi više na času." i praćenje ide dalje', async () => {
    await otvori();
    http.expectOne(CAS).flush(NA_CASU);
    await osvezi();
    await vi.advanceTimersByTimeAsync(UPIT);
    http.expectOne(CAS).flush({ predavanje: null, cekiranU: null, izvodjenje: null });
    await osvezi();
    expect(tekst()).toContain('Nisi više na času.');
    await vi.advanceTimersByTimeAsync(60_000);
    http.expectOne(CAS).flush({});
  });

  it('bez čekiranja: uputstvo da skenira QR, mesto za skener, bez "Naredni časovi" (Početna)', async () => {
    await otvori();
    http.expectOne(CAS).flush({});
    await osvezi();
    expect(tekst()).toContain('Nisi na času');
    expect(tekst()).toContain('Skeniraj QR sa table.');
    expect(tekst()).not.toContain('Čas je završen.');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-skener-mesto]')).not.toBeNull();
    expect(el.querySelector('app-naredni-casovi')).toBeNull();
    http.expectNone(CASOVI);
  });

  it('predavanje grupe u toku, a student nije čekiran: predmet i tema, upit na 30 s', async () => {
    await otvori();
    http.expectOne(CAS).flush({ uToku: { predmet: 'Uvod u primenu računara', tema: 'Petlje' } });
    await osvezi();
    expect(tekst()).toContain('Predavanje je u toku');
    expect(tekst()).toContain('Uvod u primenu računara · Petlje');
    expect(tekst()).toContain('Skeniraj QR sa table da te nastavnik vidi na času.');
    expect(tekst()).not.toContain('Nisi na času');
    await vi.advanceTimersByTimeAsync(29_999);
    http.expectNone(CAS);
    await vi.advanceTimersByTimeAsync(1);
    // čas se završio: nazad na "Nisi na času"
    http.expectOne(CAS).flush({});
    await osvezi();
    expect(tekst()).toContain('Nisi na času');
  });

  it('predavanje u toku bez predmeta i teme: samo uputstvo', async () => {
    await otvori();
    http.expectOne(CAS).flush({ uToku: { predmet: null, tema: '  ' } });
    await osvezi();
    expect(tekst()).toContain('Predavanje je u toku');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-u-toku] strong')).toBeNull();
  });

  it('van časa skrivena stranica ne pita; povratak pita odmah', async () => {
    await otvori();
    http.expectOne(CAS).flush({});
    await osvezi();
    const skriven = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const vidljivost = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      await vi.advanceTimersByTimeAsync(60_000);
      http.expectNone(CAS);
      skriven.mockReturnValue(false);
      vidljivost.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
      http.expectOne(CAS).flush({});
    } finally {
      skriven.mockRestore();
      vidljivost.mockRestore();
    }
  });

  it('bez sesije (401 na stanju) ide na prijavu', async () => {
    await otvori();
    const g = greska(401, 'Potrebna je prijava.');
    http.expectOne(CAS).flush(g.body, g.opts);
    await osvezi();
    expect(navigacija).toHaveBeenCalledWith('nalog?nazad=nalog/cas');
  });

  it('odlaganjePosle429: 20 s, pa 40 s, bez poruke', async () => {
    await otvori();
    http.expectOne(CAS).flush(NA_CASU);
    await osvezi();
    await vi.advanceTimersByTimeAsync(UPIT);
    let g = greska(429, 'Previše zahteva.');
    http.expectOne(CAS).flush(g.body, g.opts);
    await vi.advanceTimersByTimeAsync(19_999);
    http.expectNone(CAS);
    await vi.advanceTimersByTimeAsync(1);
    g = greska(429, 'Previše zahteva.');
    http.expectOne(CAS).flush(g.body, g.opts);
    await vi.advanceTimersByTimeAsync(39_999);
    http.expectNone(CAS);
    await vi.advanceTimersByTimeAsync(1);
    http.expectOne(CAS).flush(NA_CASU);
    await osvezi();
    expect(tekst()).toContain('Prisutan si');
    expect(tekst()).not.toContain('Previše');
  });

  it('povratak na stranicu (visibilitychange) pita odmah', async () => {
    await otvori();
    http.expectOne(CAS).flush(NA_CASU);
    await osvezi();
    await vi.advanceTimersByTimeAsync(1_000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne(CAS).flush(NA_CASU);
    // redovni upit se pomera: sledeći tek posle novog razmaka
    await vi.advanceTimersByTimeAsync(7_000);
    http.expectNone(CAS);
    await vi.advanceTimersByTimeAsync(UPIT);
    http.expectOne(CAS).flush(NA_CASU);
  });

  it('mreža pala tokom praćenja: ostaje prikaz i pita ponovo', async () => {
    await otvori();
    http.expectOne(CAS).flush(NA_CASU);
    await osvezi();
    await vi.advanceTimersByTimeAsync(UPIT);
    http.expectOne(CAS).flush(null, { status: 0, statusText: 'Mreža' });
    await osvezi();
    expect(tekst()).toContain('Prisutan si');
    await vi.advanceTimersByTimeAsync(UPIT);
    http.expectOne(CAS).flush(NA_CASU);
  });
});
