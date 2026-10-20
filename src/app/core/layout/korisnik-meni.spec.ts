import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SesijaStore } from '../auth/sesija.store';
import { NesacuvaneIzmene } from '../state/nesacuvane-izmene';
import { NotificationStore } from '../state/notification.store';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { KorisnikMeni } from './korisnik-meni';

@Component({ template: '' })
class Prazna {}

describe('KorisnikMeni', () => {
  let Dijalog: unknown;
  beforeAll(async () => {
    Dijalog = (await import('./sesije.dialog')).SesijeDialog;
  });

  let odjavi: ReturnType<typeof vi.fn>;
  let greska: ReturnType<typeof vi.fn>;
  let nesacuvano: number;
  let router: Router;
  let overlay: HTMLElement;

  beforeEach(async () => {
    odjavi = vi.fn(() => Promise.resolve());
    greska = vi.fn();
    nesacuvano = 0;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'prijava', component: Prazna },
          { path: 'studenti', component: Prazna },
        ]),
        { provide: SesijaStore, useValue: { korisnik: signal('nastavnik'), odjavi } },
        { provide: NotificationStore, useValue: { greska, uspeh: vi.fn(), info: vi.fn() } },
        { provide: NesacuvaneIzmene, useValue: { broj: () => nesacuvano } },
      ],
    });
    router = TestBed.inject(Router);
    overlay = TestBed.inject(OverlayContainer).getContainerElement();
    await router.navigateByUrl('/studenti');
  });

  afterEach(() => TestBed.inject(MatDialog).closeAll());

  const tick = () => new Promise(r => setTimeout(r));

  async function otvoriMeni() {
    const f = TestBed.createComponent(KorisnikMeni);
    f.detectChanges();
    const okidac = f.nativeElement.querySelector('button[data-korisnik]') as HTMLButtonElement;
    okidac.click();
    f.detectChanges();
    await tick();
    return { f, okidac };
  }
  const stavka = (sel: string) => overlay.querySelector<HTMLButtonElement>(sel)!;

  it('okidač nosi ime korisnika; meni ima "Prijavljeni uređaji" i "Odjava"', async () => {
    const { okidac } = await otvoriMeni();
    expect(okidac.getAttribute('aria-label')).toBe('Nalog: nastavnik');
    expect(stavka('[data-uredjaji]').textContent?.trim()).toBe('Prijavljeni uređaji');
    expect(stavka('[data-odjava]').textContent?.trim()).toBe('Odjava');
    expect(overlay.querySelectorAll('[role=menuitem]').length).toBe(2);
  });

  it('"Odjava" zove odjavi i vodi na /prijava (bez nazad)', async () => {
    await otvoriMeni();
    stavka('[data-odjava]').click();
    await vi.waitFor(() => expect(router.url).toBe('/prijava'));
    expect(odjavi).toHaveBeenCalledOnce();
  });

  it('odjava kad sesije već nema (store 401 tretira kao uspeh): opet /prijava', async () => {
    // `SesijaStore.odjavi` 401 ne prosleđuje; ovde se proverava da meni posle nje uvek ide na /prijava
    odjavi.mockImplementation(() => Promise.resolve());
    await otvoriMeni();
    stavka('[data-odjava]').click();
    await vi.waitFor(() => expect(router.url).toBe('/prijava'));
  });

  it('odjava nije uspela (mreža, 5xx): ostaje, poruka u snackbaru, jer sesija i dalje važi', async () => {
    odjavi.mockImplementation(() => Promise.reject(new HttpErrorResponse({ status: 0, url: 'api/auth/odjava' })));
    await otvoriMeni();
    stavka('[data-odjava]').click();
    await vi.waitFor(() => expect(greska).toHaveBeenCalledOnce());
    expect(greska.mock.calls[0][0]).toBe('Odjava nije uspela: Nema veze sa serverom.');
    expect(router.url).toBe('/studenti');
  });

  it('nesačuvane izmene: pita pre odjave; "Odustani" ne odjavljuje', async () => {
    nesacuvano = 2;
    const potvrda = vi.spyOn(ConfirmDialog, 'otvori').mockReturnValueOnce(of(false)).mockReturnValueOnce(of(true));
    await otvoriMeni();
    stavka('[data-odjava]').click();
    await vi.waitFor(() => expect(potvrda).toHaveBeenCalledOnce());
    expect(potvrda.mock.calls[0][1]).toMatchObject({ naslov: 'Odjaviti se?', potvrdi: 'Odjavi se', destruktivno: true });
    expect(String(potvrda.mock.calls[0][1].tekst)).toContain('2 izmene');
    await tick();
    expect(odjavi).not.toHaveBeenCalled();
    expect(router.url).toBe('/studenti');

    await otvoriMeni();
    stavka('[data-odjava]').click();
    await vi.waitFor(() => expect(router.url).toBe('/prijava'));
    expect(odjavi).toHaveBeenCalledOnce();
    potvrda.mockRestore();
  });

  it('"Prijavljeni uređaji" otvara lenji dijalog', async () => {
    const dialog = TestBed.inject(MatDialog);
    const otvori = vi.spyOn(dialog, 'open');
    await otvoriMeni();
    stavka('[data-uredjaji]').click();
    await vi.waitFor(() => expect(otvori).toHaveBeenCalled());
    expect(otvori.mock.calls[0][0]).toBe(Dijalog);
  });

  it('"Prijavljeni uređaji": neuspelo učitavanje chunka (npr. posle novog izdanja) javlja grešku u snackbaru, bez dijaloga', async () => {
    const dialog = TestBed.inject(MatDialog);
    const otvori = vi.spyOn(dialog, 'open');
    const neuspeh = vi
      .spyOn(KorisnikMeni.prototype as unknown as { ucitajSesijeDialog: () => Promise<unknown> }, 'ucitajSesijeDialog')
      .mockRejectedValue(new TypeError('Failed to fetch dynamically imported module'));
    await otvoriMeni();
    stavka('[data-uredjaji]').click();
    await vi.waitFor(() => expect(greska).toHaveBeenCalledExactlyOnceWith('Nije moguće otvoriti listu uređaja. Osveži stranicu.'));
    expect(otvori).not.toHaveBeenCalled();
    neuspeh.mockRestore();
  });
});
