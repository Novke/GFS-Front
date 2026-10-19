import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { NesacuvaneIzmene } from '../state/nesacuvane-izmene';
import { NotificationStore } from '../state/notification.store';
import { sesijaInterceptor } from './sesija.interceptor';
import { SesijaStore } from './sesija.store';

@Component({ template: '' })
class Prazna {}

const neovlascen = { status: 401, statusText: 'Unauthorized' };
const POTREBNA = { reason: 'Potrebna je prijava.' };

describe('sesijaInterceptor', () => {
  // lenji modul (`import()` u interceptoru) se učita jednom unapred: prvo učitavanje bi inače trajalo duže od `smiri`
  beforeAll(async () => {
    await import('./istek-sesije');
  });

  let http: HttpClient;
  let kontrola: HttpTestingController;
  let router: Router;
  let ponisti: ReturnType<typeof vi.fn>;
  let greska: ReturnType<typeof vi.fn>;
  let otvori: ReturnType<typeof vi.fn>;
  let odgovorDijaloga: Subject<boolean>;
  let nesacuvano: number;
  let pustiNapustanje: boolean;

  beforeEach(async () => {
    ponisti = vi.fn();
    greska = vi.fn();
    nesacuvano = 0;
    pustiNapustanje = true;
    odgovorDijaloga = new Subject<boolean>();
    otvori = vi.fn(() => ({ afterClosed: () => odgovorDijaloga.asObservable() }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([sesijaInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'prijava', component: Prazna },
          { path: 'studenti', component: Prazna },
          { path: 'testovi', component: Prazna },
          { path: 'forma', component: Prazna, canDeactivate: [() => pustiNapustanje] },
        ]),
        { provide: SesijaStore, useValue: { ponisti } },
        { provide: NotificationStore, useValue: { greska, info: vi.fn(), uspeh: vi.fn() } },
        { provide: MatDialog, useValue: { open: otvori } },
        { provide: NesacuvaneIzmene, useValue: { broj: () => nesacuvano } },
      ],
    });
    http = TestBed.inject(HttpClient);
    kontrola = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    await router.navigateByUrl('/studenti?q=ana');
  });

  /** Sačeka da se navigacija (ako je pokrenuta) završi. */
  const smiri = async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r));
    }
  };

  function odbij(url: string, status = neovlascen, telo: object | string = POTREBNA): ReturnType<typeof vi.fn> {
    const onError = vi.fn();
    http.get(url).subscribe({ error: onError });
    kontrola.expectOne(url).flush(telo, status);
    return onError;
  }

  it('401 sa nastavničkog API-ja: poništi sesiju i vodi na /prijava?nazad=<trenutni URL>; greška ide dalje', async () => {
    const onError = odbij('api/studenti/pretraga');
    await smiri();
    expect(ponisti).toHaveBeenCalledOnce();
    expect(router.parseUrl(router.url).queryParams).toEqual({ nazad: 'studenti?q=ana' });
    expect(router.url.startsWith('/prijava?')).toBe(true);
    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0][0] as HttpErrorResponse).status).toBe(401);
  });

  it('401 sa api/public/* ne dira sesiju ni rutu', async () => {
    odbij('api/public/x');
    await smiri();
    expect(ponisti).not.toHaveBeenCalled();
    expect(router.url).toBe('/studenti?q=ana');
  });

  it('401 sa api/auth/prijava i api/auth/ja ne preusmerava (stranica i čuvar ga obrađuju sami)', async () => {
    odbij('api/auth/prijava');
    odbij('api/auth/ja');
    await smiri();
    expect(ponisti).not.toHaveBeenCalled();
    expect(router.url).toBe('/studenti?q=ana');
  });

  it('ostale greške (403, 500, mreža) i zahtevi van api/ ne preusmeravaju', async () => {
    odbij('api/studenti/1', { status: 403, statusText: 'Forbidden' }, { reason: 'Nemaš pristup.' });
    odbij('api/studenti/2', { status: 500, statusText: 'Server Error' }, 'x');
    odbij('assets/x.json');
    await smiri();
    expect(ponisti).not.toHaveBeenCalled();
    expect(router.url).toBe('/studenti?q=ana');
  });

  it('dva istovremena 401: jedna navigacija', async () => {
    const navigacija = vi.spyOn(router, 'navigateByUrl');
    http.get('api/a').subscribe({ error: () => undefined });
    http.get('api/b').subscribe({ error: () => undefined });
    kontrola.expectOne('api/a').flush(POTREBNA, neovlascen);
    kontrola.expectOne('api/b').flush(POTREBNA, neovlascen);
    await smiri();
    expect(navigacija).toHaveBeenCalledOnce();
    expect(ponisti).toHaveBeenCalledOnce();
    expect(router.parseUrl(router.url).queryParams).toEqual({ nazad: 'studenti?q=ana' });
  });

  it('zakasneli 401 kad je stranica prijave već otvorena ne pravi novu navigaciju', async () => {
    odbij('api/a');
    await smiri();
    const navigacija = vi.spyOn(router, 'navigateByUrl');
    odbij('api/b');
    await smiri();
    expect(navigacija).not.toHaveBeenCalled();
    expect(router.parseUrl(router.url).queryParams).toEqual({ nazad: 'studenti?q=ana' });
  });

  it('posle uspešnog povratka sledeći istek ponovo preusmerava', async () => {
    odbij('api/a');
    await smiri();
    await router.navigateByUrl('/testovi');
    odbij('api/b');
    await smiri();
    expect(ponisti).toHaveBeenCalledTimes(2);
    expect(router.parseUrl(router.url).queryParams).toEqual({ nazad: 'testovi' });
  });

  describe('nesačuvan rad', () => {
    it('ekran sa čuvarom napuštanja: navigacija ide kroz ruter, a "Ostani" ostavlja ekran i javlja poruku', async () => {
      await router.navigateByUrl('/forma');
      pustiNapustanje = false;
      odbij('api/testovi');
      await smiri();
      expect(otvori).not.toHaveBeenCalled(); // pita čuvar rute, ne ovaj kod (jedno pitanje)
      expect(router.url).toBe('/forma');
      expect(greska).toHaveBeenCalledOnce();
      expect(greska.mock.calls[0][0]).toContain('Prijava je istekla');

      // isti ekran: sledeći 401 ne pita ponovo (nastavnik je odlučio da ostane)
      const navigacija = vi.spyOn(router, 'navigateByUrl');
      odbij('api/testovi');
      await smiri();
      expect(navigacija).not.toHaveBeenCalled();
    });

    it('ekran koji čuva red po red (bez čuvara rute) sa nesačuvanim: pita pre odlaska; "Odustani" ostaje', async () => {
      nesacuvano = 3;
      odbij('api/domaci/evidentiraj');
      await smiri();
      expect(otvori).toHaveBeenCalledOnce();
      const cfg = otvori.mock.calls[0][1].data;
      expect(cfg.naslov).toBe('Prijava je istekla');
      expect(cfg.tekst.join(' ')).toContain('3 izmene');
      expect(cfg.potvrdi).toBe('Idi na prijavu');

      odgovorDijaloga.next(false);
      odgovorDijaloga.complete();
      await smiri();
      expect(router.url).toBe('/studenti?q=ana');
      expect(greska).toHaveBeenCalledOnce();

      // dok je dijalog bio otvoren i posle "Odustani" na istom ekranu: nema drugog dijaloga
      odbij('api/domaci/evidentiraj');
      await smiri();
      expect(otvori).toHaveBeenCalledOnce();
    });

    it('"Idi na prijavu" vodi na /prijava sa nazad', async () => {
      nesacuvano = 1;
      odbij('api/domaci/evidentiraj');
      await smiri();
      odgovorDijaloga.next(true);
      odgovorDijaloga.complete();
      await smiri();
      expect(router.parseUrl(router.url).queryParams).toEqual({ nazad: 'studenti?q=ana' });
    });

    it('bez nesačuvanog nema dijaloga', async () => {
      odbij('api/a');
      await smiri();
      expect(otvori).not.toHaveBeenCalled();
      expect(router.url.startsWith('/prijava')).toBe(true);
    });
  });
});
