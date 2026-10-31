import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { PregledPrezentacije, SlajdPregleda } from '../data-access/portal.models';
import { PregledPrezentacijePage, tacanTekst } from './pregled-prezentacije.page';

const URL = 'api/public/nalog/prezentacije/4';

const slajd = (s: Partial<SlajdPregleda> & Pick<SlajdPregleda, 'id' | 'rb' | 'tip'>): SlajdPregleda => ({
  naslov: null, sadrzaj: null, slika: null, pitanje: null, platno: null, zadatak: null, mojOdgovor: null, tacanPoznat: false,
  ...s,
});

const PREGLED: PregledPrezentacije = {
  id: 4, naziv: 'Vežbe 3', tema: 'NACRT', predmetId: 3,
  slajdovi: [
    slajd({ id: 30, rb: 1, tip: 'INFO', naslov: 'Uvod', sadrzaj: 'Tekst slajda' }),
    slajd({
      id: 31, rb: 2, tip: 'PITANJE',
      pitanje: { id: 9, tip: 'JEDAN_TACAN', tekst: 'Koliko je 2+2?', slika: null, vremeSekunde: null,
        opcije: [{ id: 1, rb: 1, tekst: '3', tacna: false }, { id: 2, rb: 2, tekst: '4', tacna: true }],
        brojTacno: null, brojOdstupanje: null, odstupanjeTip: null, jedinica: null, tekstPrikaz: null,
        prihvatljiviOdgovori: null, skalaMinOznaka: null, skalaMaxOznaka: null },
      mojOdgovor: { tekst: '3', tacno: false },
      tacanPoznat: true,
    }),
    slajd({ id: 32, rb: 3, tip: 'ZADATAK', naslov: 'Konverzija', zadatak: { naziv: 'Binarni u dekadni', moji: [], tipovi: [{ tipId: 5, naziv: 'Binarni u dekadni' }] } }),
  ],
};

/** Pregled prezentacije (spec studentskog dela 6.1, 12.9 tačke 8 i 11). */
describe('PregledPrezentacijePage', () => {
  let fixture: ComponentFixture<PregledPrezentacijePage>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;

  async function stabilno(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function otvori(id = '4'): Promise<void> {
    fixture = TestBed.createComponent(PregledPrezentacijePage);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    await stabilno();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
      deferBlockBehavior: DeferBlockBehavior.Manual,
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    fixture?.destroy();
  });

  it('slajdovi redom; renderer tek kad slajd uđe u vidno polje (placeholder do tada)', async () => {
    await otvori();
    http.expectOne(URL).flush(PREGLED);
    await stabilno();
    expect(el().querySelectorAll('li.slajd').length).toBe(3);
    expect(el().querySelectorAll('app-slajd-prikaz').length).toBe(0);
    const blokovi = await fixture.getDeferBlocks();
    await blokovi[0].render(DeferBlockState.Complete);
    fixture.detectChanges();
    expect(el().querySelector('app-slajd-prikaz')?.textContent).toContain('Uvod');
  });

  it('PITANJE: "Tvoj odgovor" i prekidač tačnog odgovora (samo prikaz, bez zahteva)', async () => {
    await otvori();
    http.expectOne(URL).flush(PREGLED);
    await stabilno();
    expect(el().querySelector('[data-moj-odgovor]')?.textContent).toContain('netačno');
    const dugme = el().querySelector<HTMLButtonElement>('[data-tacan]')!;
    expect(dugme.getAttribute('aria-pressed')).toBe('false');
    dugme.click();
    fixture.detectChanges();
    expect(dugme.getAttribute('aria-pressed')).toBe('true');
    expect(dugme.textContent).toContain('Sakrij');
  });

  it('PITANJE bez snimka runde (tacanPoznat: false): nema prekidača tačnog odgovora', async () => {
    await otvori();
    const bezSnimka = structuredClone(PREGLED);
    bezSnimka.slajdovi[1] = { ...bezSnimka.slajdovi[1], tacanPoznat: false, mojOdgovor: null };
    http.expectOne(URL).flush(bezSnimka);
    await stabilno();
    expect(el().querySelector('[data-slajd="31"]')).not.toBeNull();
    expect(el().querySelector('[data-tacan]')).toBeNull();
  });

  it('ZADATAK: tip i "Vežbaj", bez projektorske kartice', async () => {
    await otvori();
    http.expectOne(URL).flush(PREGLED);
    await stabilno();
    const z = el().querySelector('[data-slajd="32"]')!;
    expect(z.textContent).toContain('Tip: Binarni u dekadni');
    expect(z.textContent).toContain('Na ovom slajdu nisi dobio zadatak.');
    expect(z.querySelector('[data-vezbaj]')?.getAttribute('href')).toBe('/nalog/predmet/3/vezbanje/5');
    expect(z.querySelector('app-zadatak-prikaz')).toBeNull();
  });

  it('404 (tuđa ili neodržana prezentacija): "Prezentacija nije pronađena."', async () => {
    await otvori();
    http.expectOne(URL).flush({ reason: 'Nije pronađeno.' }, { status: 404, statusText: 'Not Found' });
    await stabilno();
    expect(el().querySelector('[data-nema]')).not.toBeNull();
  });

  it('tačan odgovor BROJ i KRATAK_TEKST kao tekst', () => {
    const p = PREGLED.slajdovi[1].pitanje!;
    expect(tacanTekst({ ...p, tip: 'BROJ', brojTacno: 12.5, jedinica: 'm', brojOdstupanje: 0.5, odstupanjeTip: 'APSOLUTNO' }))
      .toBe('12,5 m (± 0,5)');
    expect(tacanTekst({ ...p, tip: 'KRATAK_TEKST', prihvatljiviOdgovori: ['for', 'petlja for'] })).toBe('for, petlja for');
    expect(tacanTekst(p)).toBeNull();
  });
});
