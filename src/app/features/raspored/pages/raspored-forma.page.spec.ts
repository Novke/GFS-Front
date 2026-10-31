import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationStore } from '../../../core/state/notification.store';
import type { RasporedDetails } from '../data-access/raspored.models';
import { RasporedFormaPage } from './raspored-forma.page';

@Component({ template: 'stub' })
class Stub {}

const PREDMETI = [{ id: 1, naziv: 'Geodezija 1' }, { id: 2, naziv: 'Uvod u primenu računara' }];
const GRUPE = [{ id: 4, naziv: 'GD-2030', godinaUpisa: 2030, brojStudenata: 30 }];

const DETALJ: RasporedDetails = {
  id: 3, naziv: 'Zimski 2030/31', vaziOd: '2030-10-01', vaziDo: '2031-01-31', pragNajava: 7,
  stavke: [
    { id: 11, predmet: PREDMETI[0], grupa: GRUPE[0], dan: 3, pocetak: '10:00:00', kraj: '13:00:00' },
    { id: 12, predmet: PREDMETI[1], grupa: GRUPE[0], dan: 5, pocetak: '08:15:00', kraj: '09:45:00' },
  ],
};

/** Nov raspored, izmena i „Kopiraj u novi“: forma, provere, zahtev, poruka servera. */
describe('RasporedFormaPage', () => {
  let fixture: ComponentFixture<RasporedFormaPage>;
  let http: HttpTestingController;
  let router: Router;
  let poruke: NotificationStore;

  const el = () => fixture.nativeElement as HTMLElement;
  const ulaz = (sel: string, i = 0) => el().querySelectorAll<HTMLInputElement>(sel)[i];
  const stavke = () => el().querySelectorAll('[data-stavka]');

  async function stabilno(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function upisi(sel: string, vrednost: string, i = 0): void {
    const u = ulaz(sel, i);
    u.value = vrednost;
    u.dispatchEvent(new Event('input'));
    u.dispatchEvent(new Event('blur'));
  }

  async function izaberi(sel: string, tekst: string, i = 0): Promise<void> {
    el().querySelectorAll<HTMLElement>(`${sel} .mat-mdc-select-trigger`)[i].click();
    await stabilno();
    [...document.querySelectorAll<HTMLElement>('mat-option')].find(o => o.textContent!.trim() === tekst)!.click();
    await stabilno();
  }

  async function otvoriStranu(ulazi: { id?: string; kopija?: string } = {}, detalj?: RasporedDetails): Promise<void> {
    fixture = TestBed.createComponent(RasporedFormaPage);
    if (ulazi.id) {
      fixture.componentRef.setInput('id', ulazi.id);
    }
    if (ulazi.kopija) {
      fixture.componentRef.setInput('kopija', ulazi.kopija);
    }
    fixture.detectChanges();
    http.expectOne('api/predmeti').flush(PREDMETI);
    http.expectOne('api/grupe').flush(GRUPE);
    if (detalj) {
      http.expectOne(`api/rasporedi/${ulazi.id ?? ulazi.kopija}`).flush(detalj);
    }
    await stabilno();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'raspored', component: Stub }]),
      ],
    });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon')
      .mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    poruke = TestBed.inject(NotificationStore);
    vi.spyOn(poruke, 'uspeh');
  });

  afterEach(() => {
    http.verify();
    fixture?.destroy();
    document.querySelectorAll('.cdk-overlay-container').forEach(c => (c.innerHTML = ''));
  });

  it('nov: jedan prazan termin, prag 5; prazna forma se ne šalje i kaže šta fali', async () => {
    await otvoriStranu();
    expect(el().querySelector('h1')!.textContent).toBe('Nov raspored');
    expect(stavke()).toHaveLength(1);
    expect(ulaz('[data-prag]').value).toBe('5');
    expect(fixture.componentInstance.imaNesacuvanihIzmena()).toBe(false);
    el().querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    await stabilno();
    http.expectNone('api/rasporedi');
    expect(el().querySelector('app-form-error-banner')!.textContent).toContain('Proveri označena polja.');
  });

  it('nov: popunjen i sačuvan šalje POST sa terminom (vreme HH:mm) i vodi na listu', async () => {
    await otvoriStranu();
    upisi('[data-naziv]', '  Zimski 2030/31 ');
    upisi('[data-vazi-od]', '1. 10. 2030.');
    upisi('[data-vazi-do]', '31.1.2031');
    await izaberi('[data-dan]', 'sreda');
    upisi('[data-pocetak]', '10:00');
    upisi('[data-kraj]', '13:00');
    await izaberi('[data-predmet]', 'Geodezija 1');
    await izaberi('[data-grupa]', 'GD-2030');
    expect(fixture.componentInstance.imaNesacuvanihIzmena()).toBe(true);
    el().querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    const req = http.expectOne('api/rasporedi');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      naziv: 'Zimski 2030/31', vaziOd: '2030-10-01', vaziDo: '2031-01-31', pragNajava: 5, podsetnik: true, podsetnikVreme: '18:00',
      stavke: [{ id: null, predmetId: 1, grupaId: 4, dan: 3, pocetak: '10:00', kraj: '13:00' }],
    });
    req.flush(DETALJ);
    await stabilno();
    expect(poruke.uspeh).toHaveBeenCalledWith('Raspored je sačuvan.');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/raspored/periodi');
    expect(fixture.componentInstance.imaNesacuvanihIzmena()).toBe(false);
  });

  it('provere: početak posle kraja i period naopačke se vide pre slanja', async () => {
    await otvoriStranu();
    upisi('[data-vazi-od]', '2031-02-01');
    upisi('[data-vazi-do]', '2030-10-01');
    upisi('[data-pocetak]', '13:00');
    upisi('[data-kraj]', '10:00');
    await stabilno();
    expect(el().querySelector('[data-greska-perioda]')!.textContent).toBe('Raspored mora da počne pre nego što se završi.');
    expect(stavke()[0].textContent).toContain('Početak mora biti pre kraja.');
    upisi('[data-vazi-od]', '2029-01-01');
    await stabilno();
    expect(el().querySelector('[data-greska-perioda]')!.textContent).toBe('Raspored može da traje najviše 400 dana.');
  });

  it('kalendar: dugme „Otvori kalendar“ i klik na polje ga otvaraju; izabran dan je datum u polju', async () => {
    await otvoriStranu();
    const dugme = el().querySelector<HTMLButtonElement>('[data-vazi-od-kalendar] button')!;
    expect(dugme.getAttribute('aria-label')).toBe('Otvori kalendar: važi od');
    expect(stavke()[0].querySelector('mat-timepicker-toggle button')!.getAttribute('aria-label')).toBe('Izaberi početak termina 1');
    dugme.click();
    await stabilno();
    expect(document.querySelector('mat-calendar')).not.toBeNull();
    [...document.querySelectorAll<HTMLElement>('.mat-calendar-body-cell')].find(c => c.textContent!.trim() === '15')!.click();
    await stabilno();
    const danas = new Date();
    expect(ulaz('[data-vazi-od]').value).toBe(`15. ${danas.getMonth() + 1}. ${danas.getFullYear()}.`);

    // zatvaranje posle izbora čeka kraj animacije, koje u jsdom-u nema; proverava ga e2e
    const dugmeDo = el().querySelector<HTMLButtonElement>('[data-vazi-do-kalendar] button')!;
    expect(dugmeDo.getAttribute('aria-expanded')).toBe('false');
    ulaz('[data-vazi-do]').click();
    await stabilno();
    expect(dugmeDo.getAttribute('aria-expanded')).toBe('true');
  });

  it('vreme: klik na polje otvara listu 07:00-21:45 na 15 min; izabrano vreme ide u zahtev kao HH:mm', async () => {
    await otvoriStranu();
    upisi('[data-naziv]', 'Zimski 2030/31');
    upisi('[data-vazi-od]', '2030-10-01');
    upisi('[data-vazi-do]', '2031-01-31');
    await izaberi('[data-dan]', 'sreda');
    ulaz('[data-pocetak]').click();
    await stabilno();
    const opcije = [...document.querySelectorAll<HTMLElement>('.mat-timepicker-panel mat-option')];
    expect(opcije).toHaveLength(60);
    expect(opcije[0].textContent!.trim()).toBe('07:00');
    expect(opcije.at(-1)!.textContent!.trim()).toBe('21:45');
    opcije.find(o => o.textContent!.trim() === '10:15')!.click();
    await stabilno();
    expect(ulaz('[data-pocetak]').value).toBe('10:15');
    upisi('[data-kraj]', '13.40');
    await izaberi('[data-predmet]', 'Geodezija 1');
    await izaberi('[data-grupa]', 'GD-2030');
    el().querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    const req = http.expectOne('api/rasporedi');
    expect(req.request.body.stavke).toEqual([{ id: null, predmetId: 1, grupaId: 4, dan: 3, pocetak: '10:15', kraj: '13:40' }]);
    req.flush(DETALJ);
    await stabilno();
  });

  it('neispravno ukucan datum ili vreme: poruka kaže šta ne valja (ne „obavezno“) i forma se ne šalje', async () => {
    await otvoriStranu();
    upisi('[data-vazi-od]', '31. 2. 2030.');
    upisi('[data-pocetak]', '25:00');
    await stabilno();
    expect(el().textContent).toContain('Datum nije ispravan (npr. 29. 10. 2026.).');
    expect(el().textContent).toContain('Vreme nije ispravno (npr. 08:30).');
    expect(ulaz('[data-vazi-od]').value).toBe('31. 2. 2030.');
    el().querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    await stabilno();
    http.expectNone('api/rasporedi');
  });

  it('„Dodaj termin“ nasleđuje predmet, grupu i vreme poslednjeg; „Ukloni“ ga briše', async () => {
    await otvoriStranu({ id: '3' }, DETALJ);
    el().querySelector<HTMLButtonElement>('[data-dodaj]')!.click();
    await stabilno();
    expect(stavke()).toHaveLength(3);
    expect(ulaz('[data-pocetak]', 2).value).toBe('08:15');
    expect(stavke()[2].querySelector('[data-predmet]')!.textContent).toContain('Uvod u primenu računara');
    stavke()[2].querySelector<HTMLButtonElement>('[data-ukloni]')!.click();
    await stabilno();
    expect(stavke()).toHaveLength(2);
  });

  it('izmena: učitava raspored, upozorava na promenu predmeta ili grupe, šalje PUT sa id-jevima termina', async () => {
    await otvoriStranu({ id: '3' }, DETALJ);
    expect(el().querySelector('h1')!.textContent).toBe('Izmena rasporeda');
    expect(ulaz('[data-naziv]').value).toBe('Zimski 2030/31');
    expect(ulaz('[data-pocetak]', 1).value).toBe('08:15');
    expect(el().textContent).toContain('briše najave odsustva');
    upisi('[data-kraj]', '13:30');
    el().querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    const req = http.expectOne('api/rasporedi/3');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.pragNajava).toBe(7);
    expect(req.request.body.stavke).toEqual([
      { id: 11, predmetId: 1, grupaId: 4, dan: 3, pocetak: '10:00', kraj: '13:30' },
      { id: 12, predmetId: 2, grupaId: 4, dan: 5, pocetak: '08:15', kraj: '09:45' },
    ]);
    req.flush(DETALJ);
    await stabilno();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/raspored/periodi');
  });

  it('izmena koja ukida otkazane časove: upozorenje pre čuvanja i broj ukinutih posle', async () => {
    const detalj: RasporedDetails = {
      ...DETALJ,
      stavke: [{ ...DETALJ.stavke[0], otkazani: ['2030-11-13', '2030-11-06'] }, { ...DETALJ.stavke[1], otkazani: ['2030-11-08'] }],
    };
    await otvoriStranu({ id: '3' }, detalj);
    expect(el().querySelector('[data-izgubljena-otkazivanja]')).toBeNull();
    upisi('[data-kraj]', '13:30');
    await stabilno();
    expect(el().querySelector('[data-izgubljena-otkazivanja]')).toBeNull();
    await izaberi('[data-dan]', 'četvrtak');
    const upozorenje = el().querySelector('[data-izgubljena-otkazivanja]')!;
    expect(upozorenje.textContent).toContain('Čuvanje ukida otkazane časove (2)');
    expect([...upozorenje.querySelectorAll('li')].map(li => li.textContent!.trim()))
      .toEqual(['Geodezija 1 · GD-2030 · sreda 6. 11.', 'Geodezija 1 · GD-2030 · sreda 13. 11.']);
    await izaberi('[data-dan]', 'sreda');
    upisi('[data-vazi-do]', '2030-11-07');
    await stabilno();
    expect(el().querySelector('[data-izgubljena-otkazivanja]')!.textContent).toContain('Čuvanje ukida otkazane časove (2)');
    upisi('[data-vazi-do]', '2030-11-12');
    await stabilno();
    const jedan = el().querySelector('[data-izgubljena-otkazivanja]')!;
    expect(jedan.textContent).toContain('Čuvanje ukida jedan otkazan čas');
    expect(jedan.textContent).toContain('sreda 13. 11.');
    el().querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    http.expectOne('api/rasporedi/3').flush({ ...DETALJ, izgubljenaOtkazivanja: 1 });
    await stabilno();
    expect(poruke.uspeh).toHaveBeenCalledWith('Raspored je sačuvan. Ukinuto otkazanih časova: 1.');
  });

  it('kopija: termini i prag bez id-jeva, naziv „(kopija)“, prazan period; šalje se kao nov (POST)', async () => {
    await otvoriStranu({ kopija: '3' }, { ...DETALJ, stavke: [{ ...DETALJ.stavke[0], otkazani: ['2030-11-06'] }, DETALJ.stavke[1]] });
    expect(el().querySelector('h1')!.textContent).toBe('Nov raspored (kopija)');
    expect(ulaz('[data-naziv]').value).toBe('Zimski 2030/31 (kopija)');
    expect(ulaz('[data-vazi-od]').value).toBe('');
    expect(stavke()).toHaveLength(2);
    expect(el().textContent).not.toContain('briše najave odsustva');
    upisi('[data-vazi-od]', '2031-02-20');
    upisi('[data-vazi-do]', '2031-06-10');
    el().querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    const req = http.expectOne('api/rasporedi');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.pragNajava).toBe(7);
    expect(req.request.body.stavke.map((s: { id: number | null }) => s.id)).toEqual([null, null]);
    expect(el().querySelector('[data-izgubljena-otkazivanja]')).toBeNull();
    req.flush(DETALJ);
    await stabilno();
    expect(poruke.uspeh).toHaveBeenCalledWith('Raspored je sačuvan.');
  });

  it('poruka servera (400) ide u traku iznad forme; forma ostaje', async () => {
    await otvoriStranu({ id: '3' }, DETALJ);
    upisi('[data-naziv]', 'Zimski');
    el().querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    http.expectOne('api/rasporedi/3').flush({ reason: 'Termin 2 se ponavlja (isti predmet, grupa, dan i početak).' },
      { status: 400, statusText: 'Bad Request' });
    await stabilno();
    expect(el().querySelector('app-form-error-banner')!.textContent).toContain('Termin 2 se ponavlja');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(fixture.componentInstance.imaNesacuvanihIzmena()).toBe(true);
  });

  it('nepostojeći raspored: panel greške sa porukom servera', async () => {
    fixture = TestBed.createComponent(RasporedFormaPage);
    fixture.componentRef.setInput('id', '99');
    fixture.detectChanges();
    http.expectOne('api/predmeti').flush(PREDMETI);
    http.expectOne('api/grupe').flush(GRUPE);
    http.expectOne('api/rasporedi/99').flush({ reason: 'Raspored ne postoji.' }, { status: 404, statusText: 'Not Found' });
    await stabilno();
    expect(el().querySelector('app-error-panel')!.textContent).toContain('Raspored ne postoji.');
    expect(el().querySelector('form')).toBeNull();
  });
});
