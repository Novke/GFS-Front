import { OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationStore, Poruka } from '../../../core/state/notification.store';
import { StudentNalogInfo } from '../data-access/student-nalog.api';
import { StudentNalogComponent } from './student-nalog.component';

const NALOG: StudentNalogInfo = {
  imaMejl: true,
  uredjaji: [
    { id: 11, opis: 'Android · Chrome', nacin: 'KOD', prviUlaz: '2026-10-01T08:00:00', poslednjiUlaz: '2026-10-18T19:45:00' },
    { id: 12, opis: 'Windows · Firefox', nacin: 'LTI', prviUlaz: '2026-09-20T12:30:00', poslednjiUlaz: '2026-10-02T07:10:00' },
  ],
  moodle: { povezan: true, poslednjiUlaz: '2026-10-02T07:10:00' },
  poslednjaPrijava: '2026-10-18T19:45:00',
};
const BEZ_NALOGA: StudentNalogInfo = { imaMejl: false, uredjaji: [], moodle: { povezan: false, poslednjiUlaz: null }, poslednjaPrijava: null };
const NEMA_MEJL = 'Student nema mejl: upiši ga da bi mogao da dobije kod.';

describe('StudentNalogComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<StudentNalogComponent>;
  let poruke: Poruka[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe(p => poruke.push(p));
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    http.verify();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const overlay = () => TestBed.inject(OverlayContainer).getContainerElement();
  const tick = () => new Promise(r => setTimeout(r));
  const stani = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const dugme = (ime: string) => el().querySelector<HTMLButtonElement>(`[data-${ime}]`)!;
  const nalog = (id = 5) => http.expectOne(`api/studenti/${id}/nalog`);

  /** Otvara sekciju i odgovara na `GET nalog`. */
  async function otvori(odgovor: StudentNalogInfo | null = NALOG, email: string | null = 'ana@example.test'): Promise<TestRequest> {
    fixture = TestBed.createComponent(StudentNalogComponent);
    fixture.componentRef.setInput('studentId', 5);
    fixture.componentRef.setInput('email', email);
    fixture.detectChanges();
    const z = nalog();
    expect(z.request.method).toBe('GET');
    if (odgovor) {
      z.flush(odgovor);
      await stani();
    }
    return z;
  }

  async function potvrdi(da: boolean) {
    await tick();
    overlay().querySelector<HTMLButtonElement>(da ? '[data-potvrdi]' : '[data-odustani]')!.click();
    await tick();
  }

  it('učitavanje pokazuje stanje, pa mejl, uređaje (opis, način, poslednji ulaz) i Moodle', async () => {
    const z = await otvori(null);
    expect(el().querySelector('[role="status"]')!.textContent).toContain('Učitavanje');
    z.flush(NALOG);
    await stani();
    expect(el().querySelector('h2')!.textContent).toBe('Nalog');
    expect(el().querySelector('[data-bez-mejla]')).toBeNull();
    const redovi = [...el().querySelectorAll('[data-uredjaj]')];
    expect(redovi.length).toBe(2);
    expect(redovi[0].textContent).toContain('Android · Chrome');
    expect(redovi[0].textContent).toContain('Kod');
    expect(redovi[0].textContent).toContain('18. 10. 2026. 19:45');
    expect(redovi[1].textContent).toContain('Windows · Firefox');
    expect(redovi[1].textContent).toContain('Moodle');
    expect(el().querySelector('[data-moodle]')!.textContent).toContain('povezan');
    expect(el().querySelector('[data-moodle]')!.textContent).toContain('2. 10. 2026. 07:10');
    expect(el().querySelector('[data-poslednja-prijava]')!.textContent).toContain('18. 10. 2026. 19:45');
    expect(dugme('posalji-kod').disabled).toBe(false);
    expect(dugme('opozovi').disabled).toBe(false);
    expect(dugme('raskini-moodle').disabled).toBe(false);
  });

  it('student bez mejla: objašnjenje, "Pošalji kod" onemogućeno; bez uređaja i Moodle-a ostala dugmad su onemogućena', async () => {
    await otvori(BEZ_NALOGA, null);
    expect(el().querySelector('[data-bez-mejla]')!.textContent).toContain(NEMA_MEJL);
    expect(dugme('posalji-kod').disabled).toBe(true);
    expect(dugme('posalji-kod').getAttribute('aria-describedby')).toBe(el().querySelector('[data-bez-mejla]')!.id);
    expect(el().querySelectorAll('[data-uredjaj]').length).toBe(0);
    expect(el().querySelector('[data-bez-uredjaja]')).not.toBeNull();
    expect(dugme('opozovi').disabled).toBe(true);
    expect(el().querySelector('[data-moodle]')!.textContent).toContain('nije povezan');
    expect(dugme('raskini-moodle').disabled).toBe(true);
    expect(el().querySelector('[data-poslednja-prijava]')).toBeNull();
  });

  it('greška učitavanja: razlog servera i "Pokušaj ponovo"', async () => {
    const z = await otvori(null);
    z.flush({ reason: 'Ne postoji.' }, { status: 404, statusText: 'Not Found' });
    await stani();
    expect(el().querySelector('[role="alert"]')!.textContent).toContain('Ne postoji.');
    expect(poruke).toEqual([]); // zahtev je tih: greška je u sekciji, ne u snackbaru
    dugme('ponovo').click();
    nalog().flush(NALOG);
    await stani();
    expect(el().querySelectorAll('[data-uredjaj]').length).toBe(2);
  });

  it('"Pošalji kod": POST, poruka uspeha i osvežena značka obaveštenja (rešena "Ne stiže mi kod")', async () => {
    await otvori();
    dugme('posalji-kod').click();
    const z = http.expectOne('api/studenti/5/nalog/posalji-kod');
    expect(z.request.method).toBe('POST');
    z.flush(null, { status: 204, statusText: 'No Content' });
    expect(poruke.map(p => p.tekst)).toEqual(['Kod je poslat na mejl studenta.']);
    http.expectOne('api/obavestenja/broj').flush({ neprocitana: 0, otvorena: 0 });
    await stani();
  });

  it('"Pošalji kod" tokom slanja ne može dvaput', async () => {
    await otvori();
    dugme('posalji-kod').click();
    fixture.detectChanges();
    expect(dugme('posalji-kod').disabled).toBe(true);
    dugme('posalji-kod').click();
    http.expectOne('api/studenti/5/nalog/posalji-kod').flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('api/obavestenja/broj').flush({ neprocitana: 0, otvorena: 0 });
    await stani();
    expect(dugme('posalji-kod').disabled).toBe(false);
  });

  it('409 "Student nema mejl.": razlog servera ide u snackbar, a nalog se učitava ponovo', async () => {
    await otvori();
    dugme('posalji-kod').click();
    http.expectOne('api/studenti/5/nalog/posalji-kod').flush({ reason: 'Student nema mejl.' }, { status: 409, statusText: 'Conflict' });
    // greške prikazuje interceptor aplikacije (ovde ga nema): sekcija ne prikazuje poruku uspeha i osvežava stanje
    expect(poruke.map(p => p.tekst)).not.toContain('Kod je poslat na mejl studenta.');
    nalog().flush(BEZ_NALOGA);
    await stani();
    expect(el().querySelector('[data-bez-mejla]')).not.toBeNull();
    expect(dugme('posalji-kod').disabled).toBe(true);
  });

  it('429: bez poruke uspeha, bez ponovnog učitavanja naloga, dugme je ponovo dostupno', async () => {
    await otvori();
    dugme('posalji-kod').click();
    http.expectOne('api/studenti/5/nalog/posalji-kod').flush(
      { reason: 'Previše pokušaja. Pokušaj ponovo kasnije.' }, { status: 429, statusText: 'Too Many Requests' });
    await stani();
    expect(poruke.map(p => p.tekst)).toEqual([]);
    expect(dugme('posalji-kod').disabled).toBe(false);
  });

  it('"Opozovi uređaje": potvrda, POST, "Opozvano uređaja: N.", pa novo učitavanje', async () => {
    await otvori();
    dugme('opozovi').click();
    await potvrdi(true);
    const z = await vi.waitFor(() => http.expectOne('api/studenti/5/nalog/opozovi-uredjaje'));
    expect(z.request.method).toBe('POST');
    z.flush({ opozvano: 2 });
    expect(poruke.map(p => p.tekst)).toEqual(['Opozvano uređaja: 2.']);
    nalog().flush({ ...NALOG, uredjaji: [] });
    await stani();
    expect(el().querySelectorAll('[data-uredjaj]').length).toBe(0);
    expect(dugme('opozovi').disabled).toBe(true);
  });

  it('"Opozovi uređaje": Odustani ne šalje ništa', async () => {
    await otvori();
    dugme('opozovi').click();
    await potvrdi(false);
    expect(poruke).toEqual([]);
  });

  it('"Opozovi uređaje" bez uređaja na serveru (0): informativna poruka', async () => {
    await otvori();
    dugme('opozovi').click();
    await potvrdi(true);
    (await vi.waitFor(() => http.expectOne('api/studenti/5/nalog/opozovi-uredjaje'))).flush({ opozvano: 0 });
    expect(poruke.map(p => p.tekst)).toEqual(['Nijedan uređaj nije bio zapamćen.']);
    nalog().flush({ ...NALOG, uredjaji: [] });
    await stani();
  });

  it('"Raskini Moodle vezu": potvrda, DELETE, poruka, novo učitavanje', async () => {
    await otvori();
    dugme('raskini-moodle').click();
    await potvrdi(true);
    const z = await vi.waitFor(() => http.expectOne('api/studenti/5/nalog/moodle'));
    expect(z.request.method).toBe('DELETE');
    z.flush(null, { status: 204, statusText: 'No Content' });
    expect(poruke.map(p => p.tekst)).toEqual(['Moodle veza je raskinuta.']);
    nalog().flush({ ...NALOG, moodle: { povezan: false, poslednjiUlaz: null } });
    await stani();
    expect(el().querySelector('[data-moodle]')!.textContent).toContain('nije povezan');
    expect(dugme('raskini-moodle').disabled).toBe(true);
  });

  it('promena mejla studenta (ulaz email) ponovo učitava nalog, pa "Pošalji kod" postaje dostupno', async () => {
    await otvori(BEZ_NALOGA, null);
    expect(dugme('posalji-kod').disabled).toBe(true);
    fixture.componentRef.setInput('email', 'novi@example.test');
    fixture.detectChanges();
    nalog().flush({ ...BEZ_NALOGA, imaMejl: true });
    await stani();
    expect(el().querySelector('[data-bez-mejla]')).toBeNull();
    expect(dugme('posalji-kod').disabled).toBe(false);
  });

  it('drugi student: ponovo učitava, sa učitavanjem umesto podataka prethodnog', async () => {
    await otvori();
    fixture.componentRef.setInput('studentId', 6);
    fixture.detectChanges();
    expect(el().querySelectorAll('[data-uredjaj]').length).toBe(0);
    expect(el().querySelector('[role="status"]')).not.toBeNull();
    nalog(6).flush(BEZ_NALOGA);
    await stani();
    expect(el().querySelector('[data-bez-mejla]')).not.toBeNull();
  });
});
