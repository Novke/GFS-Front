import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationStore } from '../../../core/state/notification.store';
import type { RasporedInfo } from '../data-access/raspored.models';
import { RasporediPage } from './rasporedi.page';

const LISTA = 'api/rasporedi';

const ZIMSKI: RasporedInfo = { id: 3, naziv: 'Zimski semestar 2030/31', vaziOd: '2030-10-01', vaziDo: '2031-01-31', pragNajava: 5, brojStavki: 4 };
const STARI: RasporedInfo = { id: 1, naziv: 'Letnji 2030', vaziOd: '2030-02-20', vaziDo: '2030-06-10', pragNajava: 8, brojStavki: 1 };

/** Raspored časova (nastavnik): periodi, „Važi danas“, Izmeni, Kopiraj u novi, Obriši uz potvrdu. */
describe('RasporediPage', () => {
  let fixture: ComponentFixture<RasporediPage>;
  let http: HttpTestingController;
  let otvori: ReturnType<typeof vi.fn>;
  let potvrda: boolean;
  let poruke: NotificationStore;

  const el = () => fixture.nativeElement as HTMLElement;
  const red = (id: number) => el().querySelector<HTMLElement>(`[data-raspored="${id}"]`)!;

  async function stabilno(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function otvoriStranu(lista: RasporedInfo[] | 'greska' = [ZIMSKI, STARI]): Promise<void> {
    fixture = TestBed.createComponent(RasporediPage);
    fixture.detectChanges();
    const req = http.expectOne(LISTA);
    expect(req.request.method).toBe('GET');
    if (lista === 'greska') {
      req.flush({ reason: 'Server ne radi.' }, { status: 400, statusText: 'Bad Request' });
    } else {
      req.flush(lista);
    }
    await stabilno();
  }

  beforeEach(() => {
    // sreda 6. 11. 2030; samo Date je lažan
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 10, 6, 9, 0));
    potvrda = true;
    otvori = vi.fn(() => ({ afterClosed: () => of(potvrda) }));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: MatDialog, useValue: { open: otvori } }],
    });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon')
      .mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
    http = TestBed.inject(HttpTestingController);
    poruke = TestBed.inject(NotificationStore);
    vi.spyOn(poruke, 'uspeh');
  });

  afterEach(() => {
    http.verify();
    fixture?.destroy();
    vi.useRealTimers();
  });

  it('lista: naziv, period, broj termina, prag; „Važi danas“ samo na periodu koji pokriva danas', async () => {
    await otvoriStranu();
    expect(el().querySelector('h1')!.textContent).toBe('Raspored časova');
    const zimski = red(3).textContent!;
    expect(zimski).toContain('Zimski semestar 2030/31');
    expect(zimski).toContain('4 termina');
    expect(zimski).toContain('prag najava 5');
    expect(zimski).toContain('Važi danas');
    expect(red(1).textContent).toContain('1 termin ');
    expect(red(1).textContent).not.toContain('Važi danas');
  });

  it('Izmeni vodi na /raspored/:id, „Kopiraj u novi“ na /raspored/novi?kopija=<id>', async () => {
    await otvoriStranu();
    expect(red(3).querySelector('h3 a')!.getAttribute('href')).toBe('/raspored/3');
    expect(red(3).querySelector('[data-kopiraj]')!.getAttribute('href')).toBe('/raspored/novi?kopija=3');
    expect(el().querySelector('[data-novi]')!.getAttribute('href')).toBe('/raspored/novi');
  });

  it('prazna lista: objašnjenje i „Nov raspored“', async () => {
    await otvoriStranu([]);
    expect(el().querySelector('app-empty-state')!.textContent).toContain('Nema rasporeda');
  });

  it('greška: panel i ponovni pokušaj', async () => {
    await otvoriStranu('greska');
    expect(el().querySelector('app-error-panel')!.textContent).toContain('Server ne radi.');
    el().querySelector<HTMLButtonElement>('app-error-panel [data-ponovo]')!.click();
    http.expectOne(LISTA).flush([STARI]);
    await stabilno();
    expect(el().querySelectorAll('[data-raspored]')).toHaveLength(1);
  });

  it('Obriši: potvrda kaže šta nestaje; posle potvrde DELETE i red nestaje', async () => {
    await otvoriStranu();
    red(3).querySelector<HTMLButtonElement>('[data-obrisi]')!.click();
    const cfg = otvori.mock.calls[0][1].data as { naslov: string; tekst: string[]; destruktivno: boolean };
    expect(cfg.naslov).toBe('Obrisati raspored „Zimski semestar 2030/31“?');
    expect(cfg.tekst.join(' ')).toContain('najave odsustva');
    expect(cfg.destruktivno).toBe(true);
    const req = http.expectOne('api/rasporedi/3');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await stabilno();
    expect(el().querySelector('[data-raspored="3"]')).toBeNull();
    expect(poruke.uspeh).toHaveBeenCalledWith('Raspored je obrisan.');
  });

  it('Obriši pa Odustani: nema zahteva', async () => {
    potvrda = false;
    await otvoriStranu();
    red(1).querySelector<HTMLButtonElement>('[data-obrisi]')!.click();
    await stabilno();
    http.expectNone('api/rasporedi/1');
    expect(red(1)).not.toBeNull();
  });
});
