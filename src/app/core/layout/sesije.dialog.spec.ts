import { OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../api/api-error';
import { SesijaInfo } from '../auth/auth.api';
import { NotificationStore } from '../state/notification.store';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { SesijeDialog } from './sesije.dialog';

const SESIJE: SesijaInfo[] = [
  { id: 1, opis: 'Firefox, Linux', kreirano: '2026-10-01T08:00:00', poslednjiUlaz: '2026-10-19T10:00:00', trenutna: true },
  { id: 2, opis: 'Chrome, Android', kreirano: '2026-09-20T12:30:00', poslednjiUlaz: '2026-10-18T19:45:00', trenutna: false },
  { id: 3, opis: 'Safari, iOS', kreirano: '2026-09-02T07:00:00', poslednjiUlaz: '2026-09-03T07:10:00', trenutna: false },
];

describe('SesijeDialog (prijavljeni uređaji)', () => {
  let http: HttpTestingController;
  let dialog: MatDialog;
  let overlay: HTMLElement;
  let uspeh: ReturnType<typeof vi.fn>;
  let info: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    uspeh = vi.fn();
    info = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotificationStore, useValue: { uspeh, info, greska: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    dialog = TestBed.inject(MatDialog);
    overlay = TestBed.inject(OverlayContainer).getContainerElement();
  });

  afterEach(() => {
    dialog.closeAll();
    vi.restoreAllMocks();
  });

  const tick = () => new Promise(r => setTimeout(r));
  const red = (id: number) => overlay.querySelector(`[data-sesija="${id}"]`) as HTMLElement;
  const dugme = (sel: string) => overlay.querySelector<HTMLButtonElement>(sel)!;

  async function otvori(sesije = SESIJE) {
    SesijeDialog.otvori(dialog);
    await tick();
    const req = http.expectOne('api/auth/sesije');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush(sesije);
    await tick();
  }

  it('lista uređaja: opis, "Ovaj uređaj", prva prijava i poslednji ulaz; ovaj uređaj nema "Odjavi"', async () => {
    await otvori();
    expect(overlay.querySelector('h2')?.textContent?.trim()).toBe('Prijavljeni uređaji');
    expect(red(1).textContent).toContain('Firefox, Linux');
    expect(red(1).textContent).toContain('Ovaj uređaj');
    expect(red(2).textContent).toContain('Chrome, Android');
    expect(red(2).textContent).toContain('20. 9. 2026. 12:30');
    expect(red(2).textContent).toContain('18. 10. 2026. 19:45');
    expect(red(2).textContent).not.toContain('Ovaj uređaj');
    expect(red(1).querySelector('[data-odjavi]')).toBeNull();
    expect(red(2).querySelector('[data-odjavi]')?.getAttribute('aria-label')).toBe('Odjavi uređaj: Chrome, Android');
  });

  it('"Odjavi sve ostale" pita (ConfirmDialog), šalje zahtev, javlja rezultat i osvežava listu', async () => {
    const potvrda = vi.spyOn(ConfirmDialog, 'otvori').mockReturnValue(of(true));
    await otvori();
    dugme('[data-odjavi-sve]').click();
    expect(potvrda).toHaveBeenCalledOnce();
    expect(potvrda.mock.calls[0][1]).toMatchObject({ naslov: 'Odjaviti sve ostale uređaje?', potvrdi: 'Odjavi sve ostale', destruktivno: true });
    expect(String(potvrda.mock.calls[0][1].tekst)).toContain('2 uređaja');
    const req = http.expectOne('api/auth/sesije/odjavi-sve');
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(false);
    req.flush({ odjavljeno: 2 });
    await tick();
    expect(uspeh).toHaveBeenCalledExactlyOnceWith('Odjavljeno: 2 uređaja.');
    http.expectOne('api/auth/sesije').flush([SESIJE[0]]);
    await tick();
    expect(red(2)).toBeNull();
    expect(dugme('[data-odjavi-sve]').disabled).toBe(true);
  });

  it('"Odjavi sve ostale" i "Odustani": ništa se ne šalje', async () => {
    vi.spyOn(ConfirmDialog, 'otvori').mockReturnValue(of(false));
    await otvori();
    dugme('[data-odjavi-sve]').click();
    await tick();
    http.expectNone('api/auth/sesije/odjavi-sve');
    expect(uspeh).not.toHaveBeenCalled();
  });

  it('nijedan drugi uređaj: "Odjavi sve ostale" je isključeno', async () => {
    await otvori([SESIJE[0]]);
    expect(dugme('[data-odjavi-sve]').disabled).toBe(true);
  });

  it('odjava jednog uređaja: potvrda, DELETE, poruka i osvežavanje', async () => {
    const potvrda = vi.spyOn(ConfirmDialog, 'otvori').mockReturnValue(of(true));
    await otvori();
    red(3).querySelector<HTMLButtonElement>('[data-odjavi]')!.click();
    expect(potvrda.mock.calls[0][1]).toMatchObject({ naslov: 'Odjaviti uređaj?', potvrdi: 'Odjavi', destruktivno: true });
    const req = http.expectOne('api/auth/sesije/3');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await tick();
    expect(uspeh).toHaveBeenCalledExactlyOnceWith('Uređaj je odjavljen.');
    http.expectOne('api/auth/sesije').flush(SESIJE.slice(0, 2));
    await tick();
    expect(red(3)).toBeNull();
  });

  it('drugi klik dok je potvrda otvorena ne otvara drugu potvrdu', async () => {
    const zatvaranje = new Subject<boolean>();
    const potvrda = vi.spyOn(ConfirmDialog, 'otvori').mockReturnValue(zatvaranje);
    await otvori();
    dugme('[data-odjavi-sve]').click();
    dugme('[data-odjavi-sve]').click();
    red(3).querySelector<HTMLButtonElement>('[data-odjavi]')!.click();
    expect(potvrda).toHaveBeenCalledOnce();
    zatvaranje.next(false);
    zatvaranje.complete();
    dugme('[data-odjavi-sve]').click();
    expect(potvrda).toHaveBeenCalledTimes(2);
  });

  it('greška učitavanja: poruka u dijalogu i "Pokušaj ponovo"', async () => {
    SesijeDialog.otvori(dialog);
    await tick();
    http.expectOne('api/auth/sesije').flush({ reason: 'Sistemska greška.' }, { status: 503, statusText: 'Unavailable' });
    await tick();
    expect(overlay.querySelector('[role=alert]')).not.toBeNull();
    dugme('[data-ponovo]').click();
    http.expectOne('api/auth/sesije').flush(SESIJE);
    await tick();
    expect(red(1)).not.toBeNull();
  });
});
