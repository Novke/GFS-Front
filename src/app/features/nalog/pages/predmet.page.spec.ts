import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MojZadatak, PredmetStudenta } from '../data-access/portal.models';
import { PredmetPage } from './predmet.page';

const PREDMETI = 'api/public/nalog/predmeti';
const P = 'api/public/nalog/predmeti/3';

const PREDMET: PredmetStudenta = { id: 3, naziv: 'Uvod u primenu računara', prisutan: 2, predavanja: 3, tipovaZaVezbanje: 1, ocenaObjavljena: false };

const MOJ: MojZadatak = {
  rundaId: 8, vreme: '2026-10-28T10:20:00', prezentacijaId: 4, prezentacija: 'Vežbe 3', slajdId: 30, slajd: 'Konverzija',
  tip: 'Binarni u dekadni', svgId: 'z-8', resenjeSvgId: 'r-8',
  polja: [{ kljuc: 'a', oznaka: 'a) vrednost', tip: 'BROJ', odstupanje: null, odstupanjeTip: null, jedinica: null,
    zanemariVelicinu: null, zanemariRazmake: null, opcije: null }],
  uneto: { a: '45' }, ishod: { a: true }, tacno: true,
  tacneVrednosti: { a: { broj: 45, prihvatljivi: null, tacna: null, tacne: null } }, tipId: 5, vezbanjeOtvoreno: true,
};

/** Strana predmeta (spec studentskog dela 12.2): kartice Materijali, Istorija, Ocena; ništa o oceni pre objave. */
describe('PredmetPage', () => {
  let fixture: ComponentFixture<PredmetPage>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;

  async function stabilno(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function otvori(k: string | null = null, id = '3'): Promise<void> {
    fixture = TestBed.createComponent(PredmetPage);
    fixture.componentRef.setInput('id', id);
    fixture.componentRef.setInput('k', k);
    fixture.detectChanges();
    await stabilno();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    fixture?.destroy();
  });

  it('Materijali: prezentacije sa časova i zadaci za vežbanje (broj po nivou, učinak); bez Istorije i Ocene', async () => {
    await otvori();
    http.expectOne(PREDMETI).flush([PREDMET]);
    await stabilno();
    http.expectOne(`${P}/prezentacije`).flush([{ id: 4, naziv: 'Vežbe 3', odrzana: '2026-10-28T11:30:00', slajdova: 12 }]);
    http.expectOne(`${P}/vezbanje`).flush([{ naziv: 'Konverzije', tipovi: [
      { tipId: 5, naziv: 'Binarni u dekadni', putanja: [], poNivou: [1, 2, 0], ukupno: 3, papir: false, provereno: 2, tacno: 1 }] }]);
    http.expectNone(`${P}/ocena`);
    http.expectNone(`${P}/prisustvo`);
    await stabilno();
    expect(el().querySelector('h1')?.textContent).toContain('Uvod u primenu računara');
    expect(el().querySelector('[data-prezentacija="4"]')?.getAttribute('href')).toBe('/nalog/prezentacija/4');
    const tip = el().querySelector('[data-tip="5"]')!;
    expect(tip.getAttribute('href')).toBe('/nalog/predmet/3/vezbanje/5');
    expect(tip.textContent).toContain('1 od 2 tačno');
    expect(el().textContent).not.toMatch(/banka/i);
  });

  it('Istorija: prisustvo (bez bodova) i moji zadaci sa časa sa "Vežbaj ovaj tip"', async () => {
    await otvori('istorija');
    http.expectOne(PREDMETI).flush([PREDMET]);
    await stabilno();
    http.expectOne(`${P}/prisustvo`).flush({ prisutan: 1, ukupno: 2, predavanja: [
      { id: 11, datum: '2026-10-28', redniBroj: 2, tema: 'Petlje', grupa: 'GD-2025', svojaGrupa: true, aktivnost: 'ZADATAK', cekiranU: null },
      { id: 10, datum: '2026-10-21', redniBroj: 1, tema: null, grupa: 'GD-2024', svojaGrupa: false, aktivnost: null, cekiranU: null },
    ] });
    http.expectOne(`${P}/moji-zadaci`).flush([MOJ]);
    await stabilno();
    expect(el().querySelector('[data-prisustvo]')?.textContent).toContain('Prisutan na 1 od 2');
    expect(el().querySelector('[data-predavanje="10"]')?.textContent).toContain('sa grupom GD-2024');
    expect(el().querySelector('[data-predavanje="10"]')?.textContent).toContain('Nije bio');
    const moj = el().querySelector('[data-moj-zadatak="8"]')!;
    expect(moj.textContent).toContain('45');
    expect(moj.querySelector('[data-tacno]')).toBeNull();
    expect(moj.querySelector('[data-vezbaj]')?.getAttribute('href')).toBe('/nalog/predmet/3/vezbanje/5');
    [...moj.querySelectorAll('button')].find(b => b.textContent?.includes('Prikaži rešenje'))!.click();
    fixture.detectChanges();
    expect(moj.querySelector('[data-tacno]')?.textContent).toContain('45');
    expect(moj.querySelector('img[data-svg="resenje"]')?.getAttribute('src')).toBe('api/public/mediji/r-8');
  });

  it('Ocena pre objave: samo poruka, nijedan broj', async () => {
    await otvori('ocena');
    http.expectOne(PREDMETI).flush([PREDMET]);
    await stabilno();
    http.expectOne(`${P}/ocena`).flush({ objavljeno: false, objavljenoU: null, ocena: null });
    await stabilno();
    expect(el().querySelector('[data-nije-objavljeno]')).not.toBeNull();
    expect(el().querySelector('[data-ocena]')).toBeNull();
  });

  it('Ocena posle objave: predlog, delovi i testovi iz snimka', async () => {
    await otvori('ocena');
    http.expectOne(PREDMETI).flush([{ ...PREDMET, ocenaObjavljena: true }]);
    await stabilno();
    http.expectOne(`${P}/ocena`).flush({ objavljeno: true, objavljenoU: '2026-10-29T10:00:00', ocena: {
      predlogOcene: 8, ukupno: 71.5, poeniPredispitne: 40, poeniAktivnost: 10, poeniDomaci: 30,
      testovi: [{ naziv: 'Kolokvijum 1', poeni: 31.5 }, { naziv: 'Kolokvijum 2', poeni: null }] } });
    await stabilno();
    expect(el().querySelector('[data-ocena]')?.textContent).toContain('8');
    const tekst = el().textContent!;
    expect(tekst).toContain('Kolokvijum 1');
    expect(tekst).toContain('31,5');
    expect(tekst).toContain('71,5');
  });

  it('predmet koji student ne sluša: "Predmet nije pronađen.", bez zahteva kartica', async () => {
    await otvori(null, '9');
    http.expectOne(PREDMETI).flush([PREDMET]);
    await stabilno();
    expect(el().querySelector('[data-nema]')).not.toBeNull();
    http.expectNone(`api/public/nalog/predmeti/9/prezentacije`);
  });

  it('404 kartice (predmet više nije dostupan): poruka; 401: prijava sa povratkom', async () => {
    await otvori('ocena');
    http.expectOne(PREDMETI).flush([PREDMET]);
    await stabilno();
    http.expectOne(`${P}/ocena`).flush({ reason: 'Nije pronađeno.' }, { status: 404, statusText: 'Not Found' });
    await stabilno();
    expect(el().querySelector('[data-nema]')).not.toBeNull();

    fixture.destroy();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/nalog/predmet/3?k=ocena');
    const navigacija = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    await otvori('ocena');
    http.expectOne(PREDMETI).flush({ reason: 'Potrebna je prijava.' }, { status: 401, statusText: 'Unauthorized' });
    await stabilno();
    expect(navigacija).toHaveBeenCalledExactlyOnceWith('nalog?nazad=nalog/predmet/3?k=ocena');
  });
});
