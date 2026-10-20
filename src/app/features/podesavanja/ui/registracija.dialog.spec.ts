import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import type { LtiRegistracijaInfo } from '../data-access/lti.models';
import { RegistracijaDialog, RegistracijaDialogCfg } from './registracija.dialog';

const POSTOJECA: LtiRegistracijaInfo = {
  id: 3,
  naziv: 'Uvod u primenu računara',
  izdavac: 'https://moodle.example.test',
  clientId: 'klijent-1',
  deploymentId: '5',
  authUrl: 'https://moodle.example.test/mod/lti/auth.php',
  jwksUrl: 'https://sso.example.test/certs',
  aktivna: true,
  kreirano: '2026-10-19T10:00:00',
};

/** Forma registracije alata (nastavnik): tipizovana reaktivna forma, izvedene adrese, greška servera u traci. */
describe('RegistracijaDialog', () => {
  let http: HttpTestingController;
  let f: ComponentFixture<RegistracijaDialog>;
  const zatvori = vi.fn();

  const el = () => f.nativeElement as HTMLElement;
  const polje = (ime: string) => el().querySelector<HTMLInputElement>(`[formcontrolname="${ime}"]`)!;
  const sacuvaj = () => el().querySelector<HTMLButtonElement>('[data-sacuvaj]')!;
  const banner = () => el().querySelector('app-form-error-banner [role="alert"]')?.textContent?.trim() ?? null;

  async function osvezi(): Promise<void> {
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
  }

  function napravi(cfg: RegistracijaDialogCfg = { registracija: null }): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: cfg },
        { provide: MatDialogRef, useValue: { close: zatvori } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    f = TestBed.createComponent(RegistracijaDialog);
    f.detectChanges();
  }

  async function upisi(ime: string, vrednost: string): Promise<void> {
    polje(ime).value = vrednost;
    polje(ime).dispatchEvent(new Event('input'));
    await osvezi();
  }

  async function popuniObavezna(): Promise<void> {
    await upisi('naziv', ' Uvod u primenu računara ');
    await upisi('izdavac', 'https://moodle.example.test/');
    await upisi('clientId', 'klijent-1');
    await upisi('deploymentId', '5');
  }

  beforeEach(() => zatvori.mockReset());
  afterEach(() => http.verify());

  it('nova: naslov, prazna polja, aktivna uključena', () => {
    napravi();
    expect(el().querySelector('h2')?.textContent).toContain('Nova registracija');
    expect(polje('naziv').value).toBe('');
    expect(el().querySelector<HTMLInputElement>('[formcontrolname="aktivna"] input, input[formcontrolname="aktivna"]')?.checked)
      .toBe(true);
  });

  it('prazna obavezna polja: poruke ispod polja, bez zahteva', async () => {
    napravi();
    sacuvaj().click();
    await osvezi();
    const tekst = el().textContent!;
    expect(tekst).toContain('Unesi naziv.');
    expect(tekst).toContain('Unesi issuer (Platform ID).');
    expect(tekst).toContain('Unesi Client ID.');
    expect(tekst).toContain('Unesi Deployment ID.');
    http.expectNone(() => true);
  });

  it('issuer i adrese moraju početi sa https://', async () => {
    napravi();
    await popuniObavezna();
    await upisi('izdavac', 'http://moodle.example.test');
    await upisi('authUrl', 'moodle.example.test/auth');
    sacuvaj().click();
    await osvezi();
    expect(el().textContent).toContain('Adresa mora da počne sa https://.');
    http.expectNone(() => true);
  });

  it('prazne adrese: pomoć pokazuje izvedenu adresu iz issuer-a i prati njegovu izmenu', async () => {
    napravi();
    expect(el().textContent).toContain('Prazno: izvodi se iz issuer-a.');
    await upisi('izdavac', 'https://moodle.example.test/');
    expect(el().textContent).toContain('Prazno: https://moodle.example.test/mod/lti/auth.php');
    expect(el().textContent).toContain('Prazno: https://moodle.example.test/mod/lti/certs.php');
    await upisi('izdavac', 'https://lms.example.test');
    expect(el().textContent).toContain('Prazno: https://lms.example.test/mod/lti/auth.php');
  });

  it('"Sačuvaj" (nova): POST sa tihim greškama, prazne adrese ostaju prazne, zatvara sa sačuvanom', async () => {
    napravi();
    await popuniObavezna();
    sacuvaj().click();
    const req = http.expectOne('api/lti/registracije');
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    expect(req.request.body).toEqual({
      naziv: 'Uvod u primenu računara', izdavac: 'https://moodle.example.test/', clientId: 'klijent-1', deploymentId: '5',
      authUrl: '', jwksUrl: '', aktivna: true,
    });
    req.flush({ ...POSTOJECA, id: 9 });
    expect(zatvori).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });

  it('izmena: popunjena polja (izvedena adresa prazna, ručna ostaje), PUT na id', async () => {
    napravi({ registracija: POSTOJECA });
    await osvezi();
    expect(el().querySelector('h2')?.textContent).toContain('Izmena registracije');
    expect(polje('naziv').value).toBe('Uvod u primenu računara');
    expect(polje('authUrl').value).toBe('');
    expect(polje('jwksUrl').value).toBe('https://sso.example.test/certs');
    await upisi('deploymentId', '6');
    sacuvaj().click();
    const req = http.expectOne('api/lti/registracije/3');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toMatchObject({ deploymentId: '6', authUrl: '', jwksUrl: 'https://sso.example.test/certs' });
    req.flush({ ...POSTOJECA, deploymentId: '6' });
    expect(zatvori).toHaveBeenCalledWith(expect.objectContaining({ deploymentId: '6' }));
  });

  it.each([
    [409, 'Conflict', 'Registracija za ovaj Moodle, Client ID i Deployment ID već postoji.'],
    [400, 'Bad Request', 'Izdavač (issuer) mora biti adresa koja počinje sa https://.'],
  ])('greška %i: tekst servera u traci, dijalog ostaje otvoren', async (status, statusText, reason) => {
    napravi();
    await popuniObavezna();
    sacuvaj().click();
    http.expectOne('api/lti/registracije').flush({ reason }, { status, statusText });
    await osvezi();
    expect(banner()).toBe(reason);
    expect(zatvori).not.toHaveBeenCalled();
    expect(sacuvaj().disabled).toBe(false);
  });
});
