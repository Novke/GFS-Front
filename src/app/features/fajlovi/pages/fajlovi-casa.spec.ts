import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FajloviCasa } from '../../../shared/util/fajlovi';
import { datumZaPrikaz, FajloviCasaPage, OSVEZI_MS, PORUKA_NEVAZI } from './fajlovi-casa';

@Component({ template: '' })
class Prazno {}

const odgovor = (izmene: Partial<FajloviCasa> = {}): FajloviCasa => ({
  kod: '1234', predmet: 'Uvod u primenu računara', tema: 'Vežbe 5', datum: '2026-11-20',
  fajlovi: [
    { id: 5, naziv: 'vezba.docx', vrsta: 'DOCX', velicina: 1536 * 1024, prezentacija: 'Vežbe 5' },
    { id: 6, naziv: 'podaci.xlsx', vrsta: 'XLSX', velicina: 2048, prezentacija: 'Vežbe 5' },
  ], ...izmene,
});

describe('FajloviCasaPage', () => {
  let http: HttpTestingController;
  let f: ComponentFixture<FajloviCasaPage>;
  const el = () => f.nativeElement as HTMLElement;

  function otvori(kod?: string) {
    f = TestBed.createComponent(FajloviCasaPage);
    if (kod !== undefined) f.componentRef.setInput('kod', kod);
    f.detectChanges();
  }
  const sinhrono = async () => { f.detectChanges(); await f.whenStable(); f.detectChanges(); };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: 'f', children: [{ path: '**', component: Prazno }] }])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    f?.destroy();
    http.verify();
  });

  it('bez koda: polje za 4 cifre i dugme, nijedan zahtev', () => {
    otvori();
    expect(el().textContent).toContain('Upiši broj sa table');
    expect(el().querySelector('[data-kod-polje]')).not.toBeNull();
    http.expectNone(() => true);
  });

  it('neispravan unos (nije 4 cifre) ne ide na server', async () => {
    otvori();
    const polje = el().querySelector<HTMLInputElement>('[data-kod-polje]')!;
    polje.value = '12a';
    polje.dispatchEvent(new Event('input'));
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await sinhrono();
    expect(el().textContent).toContain('Kod ima tačno 4 cifre.');
    http.expectNone(() => true);
  });

  it('ispravan unos vodi na f/<kod>', async () => {
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    otvori();
    const polje = el().querySelector<HTMLInputElement>('[data-kod-polje]')!;
    polje.value = '1234';
    polje.dispatchEvent(new Event('input'));
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(nav).toHaveBeenCalledWith(['/f', '1234']);
  });

  it('uspeh: predmet, tema, datum i dugmad za preuzimanje sa tačnim href-om', async () => {
    otvori('1234');
    const req = http.expectOne('api/public/fajlovi/1234');
    expect(req.request.method).toBe('GET');
    req.flush(odgovor());
    await sinhrono();
    expect(el().querySelector('h1')?.textContent).toBe('Uvod u primenu računara');
    expect(el().textContent).toContain('Vežbe 5 · 20.11.2026.');
    const veze = Array.from(el().querySelectorAll<HTMLAnchorElement>('[data-fajl] a[download]'));
    expect(veze.map(a => a.getAttribute('href'))).toEqual(['api/public/fajlovi/1234/5', 'api/public/fajlovi/1234/6']);
    expect(el().querySelector('[data-fajl]')?.textContent).toContain('Word · 1,5 MB');
  });

  it('pogrešan kod (404): poruka, polje ponovo, osvežavanje staje', async () => {
    vi.useFakeTimers();
    otvori('9999');
    http.expectOne('api/public/fajlovi/9999').flush({ reason: PORUKA_NEVAZI }, { status: 404, statusText: 'Not Found' });
    await sinhrono();
    expect(el().querySelector('[data-poruka]')?.textContent).toBe('Kod ne važi. Proveri broj sa table.');
    expect(el().querySelector('[data-kod-polje]')).not.toBeNull();
    vi.advanceTimersByTime(OSVEZI_MS * 3);
    http.expectNone('api/public/fajlovi/9999');
  });

  it('kod koji nije 4 cifre u adresi: ista poruka bez poziva', async () => {
    otvori('abc');
    await sinhrono();
    expect(el().querySelector('[data-poruka]')?.textContent).toBe(PORUKA_NEVAZI);
    http.expectNone(() => true);
  });

  it('429: poruka sa servera, bez daljeg osvežavanja', async () => {
    vi.useFakeTimers();
    otvori('1234');
    http.expectOne('api/public/fajlovi/1234').flush({ reason: 'Previše pogrešnih kodova. Pokušaj ponovo za 15 minuta.' }, { status: 429, statusText: 'Too Many Requests' });
    await sinhrono();
    expect(el().querySelector('[data-poruka]')?.textContent).toContain('Pokušaj ponovo za 15 minuta');
    vi.advanceTimersByTime(OSVEZI_MS * 2);
    http.expectNone(() => true);
  });

  it('osvežava na 20 s dok je kartica vidljiva (novi fajl se pojavi), a skrivena kartica ne zove server', async () => {
    vi.useFakeTimers();
    let vidljivo: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => vidljivo);
    otvori('1234');
    http.expectOne('api/public/fajlovi/1234').flush(odgovor());
    await sinhrono();
    expect(el().querySelectorAll('[data-fajl]').length).toBe(2);

    vidljivo = 'hidden';
    vi.advanceTimersByTime(OSVEZI_MS);
    http.expectNone('api/public/fajlovi/1234');

    vidljivo = 'visible';
    document.dispatchEvent(new Event('visibilitychange')); // povratak na karticu osvežava odmah
    const novo = odgovor();
    novo.fajlovi = [...novo.fajlovi, { id: 7, naziv: 'novo.pdf', vrsta: 'PDF', velicina: 10, prezentacija: 'Vežbe 5' }];
    http.expectOne('api/public/fajlovi/1234').flush(novo);
    await sinhrono();
    expect(el().querySelectorAll('[data-fajl]').length).toBe(3);

    vi.advanceTimersByTime(OSVEZI_MS);
    http.expectOne('api/public/fajlovi/1234').flush(novo);
  });

  it('prekid mreže pri osvežavanju: spisak ostaje, uz upozorenje', async () => {
    vi.useFakeTimers();
    otvori('1234');
    http.expectOne('api/public/fajlovi/1234').flush(odgovor());
    await sinhrono();
    vi.advanceTimersByTime(OSVEZI_MS);
    http.expectOne('api/public/fajlovi/1234').flush(null, { status: 500, statusText: 'Server Error' });
    await sinhrono();
    expect(el().querySelectorAll('[data-fajl]').length).toBe(2);
    expect(el().querySelector('[data-bez-veze]')).not.toBeNull();
  });

  it('ispis datuma', () => {
    expect(datumZaPrikaz('2026-11-20')).toBe('20.11.2026.');
    expect(datumZaPrikaz(null)).toBeNull();
    expect(datumZaPrikaz('juče')).toBeNull();
  });
});
