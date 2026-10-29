import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StudentJa } from '../data-access/nalog.models';
import { JaPage } from './ja.page';

const JA = 'api/public/nalog/ja';

const JA_ODGOVOR: StudentJa = {
  indeks: 'GD12',
  ime: 'Ana',
  prezime: 'Primerović',
  maskaMejla: 'a***@example.test',
  moodlePovezan: true,
  godina: 2025,
  grupa: 'GD-2025',
  generacija: 2025,
  uredjaji: [
    { id: 1, opis: 'Android · Chrome', nacin: 'KOD', prviUlaz: '2026-10-01T10:00:00', poslednjiUlaz: '2026-10-19T08:30:00', trenutni: true },
    { id: 2, opis: 'Windows · Firefox', nacin: 'LTI', prviUlaz: '2026-09-20T12:00:00', poslednjiUlaz: '2026-10-02T09:15:00', trenutni: false },
  ],
};

/** Tab Ja (spec studentskog dela 12.5): profil, uređaji i odjava; posle odjave strana prijave sa porukom kroz stanje istorije. */
describe('JaPage', () => {
  let fixture: ComponentFixture<JaPage>;
  let http: HttpTestingController;
  let navigacija: ReturnType<typeof vi.spyOn>;
  let otvori: ReturnType<typeof vi.fn>;
  let potvrda: boolean;

  const el = () => fixture.nativeElement as HTMLElement;
  const dugme = (tekst: string) =>
    [...el().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim().startsWith(tekst));
  const banner = () => el().querySelector('app-form-error-banner [role="alert"]')?.textContent?.trim() ?? null;

  async function stabilno(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function otvoriStranu(): Promise<void> {
    fixture = TestBed.createComponent(JaPage);
    fixture.detectChanges();
    http.expectOne(JA).flush(JA_ODGOVOR);
    await stabilno();
  }

  const odjava = (poruka: string) => ['nalog', { replaceUrl: true, state: { info: poruka } }];

  beforeEach(() => {
    potvrda = true;
    otvori = vi.fn(() => ({ afterClosed: () => of(potvrda) }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialog, useValue: { open: otvori } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigacija = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => {
    http.verify();
    fixture?.destroy();
  });

  it('profil: ime, indeks, grupa i generacija, mejl, Moodle, uređaji', async () => {
    await otvoriStranu();
    const tekst = el().textContent!;
    expect(tekst).toContain('Ana Primerović');
    expect(tekst).toContain('GD12/2025');
    expect(tekst).toContain('GD-2025 · generacija 2025');
    expect(tekst).toContain('a***@example.test');
    expect(tekst).toContain('povezan');
    expect(tekst).toContain('Android · Chrome');
    expect(tekst).toContain('Windows · Firefox');
    expect(tekst).toContain('Ovaj uređaj');
  });

  it('GET ja 401: prijava sa povratkom na tab Ja', async () => {
    fixture = TestBed.createComponent(JaPage);
    fixture.detectChanges();
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/nalog/ja');
    http.expectOne(JA).flush({ reason: 'Potrebna je prijava.' }, { status: 401, statusText: 'Unauthorized' });
    await stabilno();
    expect(navigacija).toHaveBeenCalledExactlyOnceWith('nalog?nazad=nalog/ja');
  });

  it('greška mreže: poruka i "Pokušaj ponovo"', async () => {
    fixture = TestBed.createComponent(JaPage);
    fixture.detectChanges();
    http.expectOne(JA).error(new ProgressEvent('error'));
    await stabilno();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Nema veze sa serverom.');
    dugme('Pokušaj ponovo')!.click();
    http.expectOne(JA).flush(JA_ODGOVOR);
    await stabilno();
    expect(el().textContent).toContain('Ana Primerović');
  });

  it('"Odjavi se": POST odjava, pa strana prijave sa porukom', async () => {
    await otvoriStranu();
    dugme('Odjavi se')!.click();
    http.expectOne('api/public/nalog/odjava').flush(null, { status: 204, statusText: 'No Content' });
    await stabilno();
    expect(navigacija).toHaveBeenCalledExactlyOnceWith(...odjava('Odjavljen si sa ovog uređaja.'));
  });

  it('"Odjavi se" 401 (sesije već nema): za odjavu uspeh', async () => {
    await otvoriStranu();
    dugme('Odjavi se')!.click();
    http.expectOne('api/public/nalog/odjava').flush(null, { status: 401, statusText: 'Unauthorized' });
    await stabilno();
    expect(navigacija).toHaveBeenCalledExactlyOnceWith(...odjava('Odjavljen si sa ovog uređaja.'));
  });

  it('"Odjavi sve uređaje": ConfirmDialog (destruktivno), pa POST odjava-svuda i poruka sa brojem', async () => {
    await otvoriStranu();
    dugme('Odjavi sve uređaje')!.click();
    expect(otvori).toHaveBeenCalledOnce();
    const cfg = (otvori.mock.calls[0] as unknown[])[1] as { data: { naslov: string; destruktivno: boolean } };
    expect(cfg.data.naslov).toBe('Odjaviti sve uređaje?');
    expect(cfg.data.destruktivno).toBe(true);
    http.expectOne('api/public/nalog/odjava-svuda').flush({ odjavljeno: 2 });
    await stabilno();
    expect(navigacija).toHaveBeenCalledExactlyOnceWith(...odjava('Odjavljeno: 2 uređaja.'));
  });

  it('drugi klik na "Odjavi sve uređaje" dok je potvrda otvorena ne otvara drugi dijalog', async () => {
    const zatvaranje = new Subject<boolean>();
    otvori.mockImplementation(() => ({ afterClosed: () => zatvaranje }));
    await otvoriStranu();
    dugme('Odjavi sve uređaje')!.click();
    dugme('Odjavi sve uređaje')!.click();
    expect(otvori).toHaveBeenCalledOnce();
    zatvaranje.next(false);
    zatvaranje.complete();
    dugme('Odjavi sve uređaje')!.click();
    expect(otvori).toHaveBeenCalledTimes(2);
  });

  it('"Odjavi sve uređaje" pa "Odustani": bez zahteva', async () => {
    potvrda = false;
    await otvoriStranu();
    dugme('Odjavi sve uređaje')!.click();
    http.expectNone('api/public/nalog/odjava-svuda');
    expect(navigacija).not.toHaveBeenCalled();
  });

  it('greška odjave: tekst u baneru, ostaje na tabu', async () => {
    await otvoriStranu();
    dugme('Odjavi se')!.click();
    http.expectOne('api/public/nalog/odjava').error(new ProgressEvent('error'));
    await stabilno();
    expect(banner()).toBe('Nema veze sa serverom.');
    expect(el().textContent).toContain('Ana Primerović');
    expect(navigacija).not.toHaveBeenCalled();
  });
});
