import { Location } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CasPredavanje, CasStanje } from '../data-access/cas.models';
import { KLJUC_CEKANJA } from '../data-access/cas.pravila';
import { CasPage } from './cas.page';

const CAS = 'api/public/nalog/cas';
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
 * odmah kad se stranica vrati, 429 sa odlaganjem) i prelaz u Uživo izvođenje. Zove samo `api/public/nalog/cas*`.
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

  it('zavrsenCasPrikazujePoruku i ne prati dalje', async () => {
    await otvori();
    http.expectOne(CAS).flush({ predavanje: { ...PRED, zavrseno: true }, cekiranU: '2026-10-28T10:00:00' });
    await osvezi();
    expect(tekst()).toContain('Čas je završen.');
    await vi.advanceTimersByTimeAsync(UPIT * 3);
    http.expectNone(CAS);
  });

  it('aktivnoIzvodjenjeVodiNaUzivo (sa=cas)', async () => {
    await otvori();
    http.expectOne(CAS).flush(NA_CASU);
    await osvezi();
    await vi.advanceTimersByTimeAsync(UPIT);
    http.expectOne(CAS).flush({ ...NA_CASU, izvodjenje: { kod: 'AB12CD', naziv: 'Vežbe 3' } });
    await osvezi();
    expect(navigacija).toHaveBeenCalledWith('uzivo/AB12CD?sa=cas');
  });

  it('skeniranje dok izvođenje već traje vodi odmah u Uživo', async () => {
    await otvori(TOKEN);
    http.expectOne(SKENIRAJ).flush({ stanje: { ...NA_CASU, izvodjenje: { kod: 'AB12CD', naziv: 'Vežbe 3' } } });
    await osvezi();
    expect(navigacija).toHaveBeenCalledWith('uzivo/AB12CD?sa=cas');
  });

  it('uklonjenoPrisustvoPrekidaPracenje: "Nisi više na času."', async () => {
    await otvori();
    http.expectOne(CAS).flush(NA_CASU);
    await osvezi();
    await vi.advanceTimersByTimeAsync(UPIT);
    http.expectOne(CAS).flush({ predavanje: null, cekiranU: null, izvodjenje: null });
    await osvezi();
    expect(tekst()).toContain('Nisi više na času.');
    await vi.advanceTimersByTimeAsync(UPIT * 3);
    http.expectNone(CAS);
  });

  it('bez čekiranja: uputstvo da skenira QR', async () => {
    await otvori();
    http.expectOne(CAS).flush({});
    await osvezi();
    expect(tekst()).toContain('Nisi na času');
    expect(tekst()).toContain('Skeniraj QR sa table.');
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
