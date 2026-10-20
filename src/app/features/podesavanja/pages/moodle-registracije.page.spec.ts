import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationStore } from '../../../core/state/notification.store';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import type { LtiRegistracijaInfo, LtiVrednostiZaMoodle } from '../data-access/lti.models';
import { RegistracijaDialog } from '../ui/registracija.dialog';
import { MoodleRegistracijePage } from './moodle-registracije.page';

const LISTA = 'api/lti/registracije';
const VREDNOSTI = 'api/lti/registracije/vrednosti';

const REG: LtiRegistracijaInfo = {
  id: 3,
  naziv: 'Uvod u primenu računara',
  izdavac: 'https://moodle.example.test',
  clientId: 'klijent-1',
  deploymentId: '5',
  authUrl: 'https://moodle.example.test/mod/lti/auth.php',
  jwksUrl: 'https://moodle.example.test/mod/lti/certs.php',
  aktivna: true,
  kreirano: '2026-10-19T10:00:00',
};
const ISKLJUCENA: LtiRegistracijaInfo = { ...REG, id: 4, naziv: 'Programiranje', deploymentId: '7', aktivna: false };

const VR: LtiVrednostiZaMoodle = {
  toolUrl: 'https://gfs.example.test/api/public/lti/start',
  initiateLoginUrl: 'https://gfs.example.test/api/public/lti/prijava',
  redirectionUri: 'https://gfs.example.test/api/public/lti/start',
  publicKeysetUrl: 'https://gfs.example.test/api/public/lti/jwks',
};

/** Podešavanja -> Moodle (nastavnik): registracije alata, vrednosti za Moodle formu sa "Kopiraj", kratko uputstvo. */
describe('MoodleRegistracijePage', () => {
  let fixture: ComponentFixture<MoodleRegistracijePage>;
  let http: HttpTestingController;
  let otvori: ReturnType<typeof vi.fn>;
  /** Odgovor dijaloga po komponenti (ConfirmDialog: boolean, RegistracijaDialog: sačuvana registracija ili undefined). */
  let odgovorDijaloga: Map<unknown, unknown>;
  let pisi: ReturnType<typeof vi.fn>;
  let poruke: NotificationStore;

  const el = () => fixture.nativeElement as HTMLElement;
  const dugme = (tekst: string, koren: ParentNode = el()) =>
    [...koren.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim().startsWith(tekst));
  const redovi = () => [...el().querySelectorAll<HTMLElement>('[data-registracija]')];

  async function stabilno(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function otvoriStranu(lista: LtiRegistracijaInfo[] = [REG, ISKLJUCENA]): Promise<void> {
    fixture = TestBed.createComponent(MoodleRegistracijePage);
    fixture.detectChanges();
    http.expectOne(LISTA).flush(lista);
    http.expectOne(VREDNOSTI).flush(VR);
    await stabilno();
  }

  beforeEach(() => {
    odgovorDijaloga = new Map();
    otvori = vi.fn((komponenta: unknown) => ({ afterClosed: () => of(odgovorDijaloga.get(komponenta)) }));
    pisi = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: pisi }, configurable: true });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialog, useValue: { open: otvori } },
      ],
    });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon')
      .mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
    http = TestBed.inject(HttpTestingController);
    poruke = TestBed.inject(NotificationStore);
    vi.spyOn(poruke, 'uspeh');
    vi.spyOn(poruke, 'greska');
  });

  afterEach(() => {
    http.verify();
    fixture?.destroy();
  });

  it('lista: naziv, issuer, Client ID, Deployment ID i stanje (isključena se vidi tekstom)', async () => {
    await otvoriStranu();
    expect(el().querySelector('h1')?.textContent).toBe('Moodle');
    expect(redovi()).toHaveLength(2);
    const prvi = redovi()[0].textContent!;
    expect(prvi).toContain('Uvod u primenu računara');
    expect(prvi).toContain('https://moodle.example.test');
    expect(prvi).toContain('klijent-1');
    expect(prvi).toContain('5');
    expect(prvi).toContain('Aktivna');
    expect(redovi()[1].textContent).toContain('Isključena');
  });

  it('prazna lista: objašnjenje i "Nova registracija"', async () => {
    await otvoriStranu([]);
    expect(redovi()).toHaveLength(0);
    expect(el().textContent).toContain('Nema registracija');
    expect(el().querySelector('app-empty-state')).not.toBeNull();
  });

  it('greška učitavanja liste: panel i "Pokušaj ponovo" učitava ponovo', async () => {
    fixture = TestBed.createComponent(MoodleRegistracijePage);
    fixture.detectChanges();
    http.expectOne(LISTA).flush({ reason: 'x' }, { status: 500, statusText: 'Server Error' });
    http.expectOne(VREDNOSTI).flush(VR);
    await stabilno();
    expect(el().querySelector('app-error-panel')).not.toBeNull();
    el().querySelector<HTMLButtonElement>('app-error-panel [data-ponovo]')!.click();
    http.expectOne(LISTA).flush([REG]);
    await stabilno();
    expect(redovi()).toHaveLength(1);
  });

  it('"Vrednosti za Moodle": četiri adrese sa "Kopiraj"; kopiranje kroz Clipboard API i potvrda u snackbar-u', async () => {
    await otvoriStranu();
    const blok = el().querySelector<HTMLElement>('[data-vrednosti]')!;
    const tekst = blok.textContent!;
    expect(tekst).toContain('Tool URL');
    expect(tekst).toContain('Initiate login URL');
    expect(tekst).toContain('Redirection URI(s)');
    expect(tekst).toContain('Public keyset');
    expect(tekst).toContain(VR.publicKeysetUrl);
    const kopiraj = [...blok.querySelectorAll<HTMLButtonElement>('button')].filter(b => b.textContent?.includes('Kopiraj'));
    expect(kopiraj).toHaveLength(4);
    expect(kopiraj[1].getAttribute('aria-label')).toBe('Kopiraj Initiate login URL');
    kopiraj[1].click();
    await stabilno();
    expect(pisi).toHaveBeenCalledExactlyOnceWith(VR.initiateLoginUrl);
    expect(poruke.uspeh).toHaveBeenCalledWith('Kopirano: Initiate login URL.');
  });

  it('kopiranje ne uspe ni rezervnim načinom: poruka o grešci', async () => {
    pisi.mockRejectedValue(new Error('nije dozvoljeno'));
    Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true });
    await otvoriStranu();
    dugme('Kopiraj', el().querySelector('[data-vrednosti]')!)!.click();
    await stabilno();
    await stabilno();
    expect(poruke.greska).toHaveBeenCalledWith('Kopiranje nije uspelo. Označi adresu i kopiraj je ručno.');
  });

  it('uputstvo: privatnost (ime Always, mejl Never), New window, LTI 1.3 i Keyset URL', async () => {
    await otvoriStranu();
    const uputstvo = el().querySelector('[data-uputstvo]')!.textContent!;
    expect(uputstvo).toContain('LTI External tools');
    expect(uputstvo).toContain('Moodle 4.3+');
    expect(uputstvo).toContain('Site administration → Plugins → Activity modules → External tool → Manage tools');
    expect(uputstvo).toContain('Show in activity chooser');
    expect(uputstvo).toContain('LTI 1.3');
    expect(uputstvo).toContain('Keyset URL');
    expect(uputstvo).toContain('New window');
    expect(uputstvo).toMatch(/Share launcher's name with tool.*Always/s);
    expect(uputstvo).toMatch(/Share launcher's email with tool.*Never/s);
  });

  it('"Nova registracija": dijalog forme, sačuvana registracija ulazi u listu i poruka', async () => {
    await otvoriStranu([REG]);
    odgovorDijaloga.set(RegistracijaDialog, { ...REG, id: 9, naziv: 'Nov predmet' });
    dugme('Nova registracija')!.click();
    await stabilno();
    expect(otvori).toHaveBeenCalledWith(RegistracijaDialog, expect.objectContaining({ data: { registracija: null } }));
    expect(redovi().map(r => r.textContent)).toEqual([expect.stringContaining('Nov predmet'), expect.stringContaining('Uvod')]);
    expect(poruke.uspeh).toHaveBeenCalledWith('Registracija je sačuvana.');
  });

  it('"Nova registracija" posle neuspelog učitavanja liste: lista se učitava iznova, ne prikazuje se samo nov red', async () => {
    fixture = TestBed.createComponent(MoodleRegistracijePage);
    fixture.detectChanges();
    http.expectOne(LISTA).flush({ reason: 'x' }, { status: 500, statusText: 'Server Error' });
    http.expectOne(VREDNOSTI).flush(VR);
    await stabilno();
    expect(el().querySelector('app-error-panel')).not.toBeNull();

    const nova = { ...REG, id: 9, naziv: 'Nov predmet' };
    odgovorDijaloga.set(RegistracijaDialog, nova);
    dugme('Nova registracija')!.click();
    http.expectOne(LISTA).flush([REG, nova]);
    await stabilno();
    expect(redovi()).toHaveLength(2);
    expect(poruke.uspeh).toHaveBeenCalledWith('Registracija je sačuvana.');
  });

  it('"Izmeni": dijalog sa registracijom, izmena zamenjuje red; "Odustani" ne menja ništa', async () => {
    await otvoriStranu([REG]);
    dugme('Izmeni', redovi()[0])!.click();
    await stabilno();
    expect(otvori).toHaveBeenLastCalledWith(RegistracijaDialog, expect.objectContaining({ data: { registracija: REG } }));
    expect(redovi()).toHaveLength(1);

    odgovorDijaloga.set(RegistracijaDialog, { ...REG, naziv: 'Promenjen naziv' });
    dugme('Izmeni', redovi()[0])!.click();
    await stabilno();
    expect(redovi()[0].textContent).toContain('Promenjen naziv');
  });

  it('"Obriši": ConfirmDialog (destruktivno), pa DELETE i red nestaje; "Odustani" bez zahteva', async () => {
    await otvoriStranu();
    odgovorDijaloga.set(ConfirmDialog, false);
    dugme('Obriši', redovi()[0])!.click();
    http.expectNone(`${LISTA}/3`);

    odgovorDijaloga.set(ConfirmDialog, true);
    dugme('Obriši', redovi()[0])!.click();
    const cfg = (otvori.mock.calls.at(-1) as unknown[])[1] as { data: { naslov: string; destruktivno: boolean } };
    expect(cfg.data.naslov).toBe('Obrisati registraciju „Uvod u primenu računara“?');
    expect(cfg.data.destruktivno).toBe(true);
    const req = http.expectOne(`${LISTA}/3`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await stabilno();
    expect(redovi()).toHaveLength(1);
    expect(poruke.uspeh).toHaveBeenCalledWith('Registracija je obrisana.');
  });
});
