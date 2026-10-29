import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationStore } from '../../../core/state/notification.store';
import type { TerminInfo } from '../data-access/raspored.models';
import { OtkazivanjeDialog } from '../ui/otkazivanje.dialog';
import { VracanjeDialog } from '../ui/vracanje.dialog';
import { tekstMejla, TerminiPage } from './termini.page';

const TERMINI = 'api/rasporedi/termini';
const PREDMET = { id: 1, naziv: 'Geodezija 1' };
const GRUPA = { id: 4, naziv: 'GD-2030', godinaUpisa: 2030, brojStudenata: 30 };

const termin = (izmene: Partial<TerminInfo> = {}): TerminInfo => ({
  stavkaId: 7, rasporedId: 3, datum: '2030-11-06', pocetak: '10:00:00', kraj: '13:00:00', predmet: PREDMET, grupa: GRUPA,
  otkazan: false, napomena: null, poceo: false, brojNajava: 0, prag: 5, najave: [], predavanjeId: null, ...izmene,
});

const najava = (studentId: number, razlog: string | null = null) => ({
  studentId, ime: 'Ana', prezime: `Primerović ${studentId}`, indeks: `GD${studentId}`, godina: 2030, razlog, vreme: '2030-11-05T18:00:00',
});

/** Naredni termini (nastavnik): po danu, broj najava i ko ne dolazi, otkazivanje i vraćanje. */
describe('TerminiPage', () => {
  let fixture: ComponentFixture<TerminiPage>;
  let http: HttpTestingController;
  let router: Router;
  let otvori: ReturnType<typeof vi.fn>;
  let odgovor: Map<unknown, unknown>;
  let poruke: NotificationStore;

  const el = () => fixture.nativeElement as HTMLElement;
  const red = (k: string) => el().querySelector<HTMLElement>(`[data-termin="${k}"]`)!;

  async function stabilno(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function otvoriStranu(lista: TerminInfo[], od?: string): Promise<void> {
    fixture = TestBed.createComponent(TerminiPage);
    if (od !== undefined) {
      fixture.componentRef.setInput('od', od);
    }
    fixture.detectChanges();
    await fixture.whenStable();
    const req = http.expectOne(r => r.url === TERMINI);
    expect(req.request.params.get('od')).toBe(od && /^\d{4}-\d{2}-\d{2}$/.test(od) ? od : '2030-11-06');
    expect(req.request.params.get('dana')).toBe('28');
    req.flush(lista);
    await stabilno();
  }

  beforeEach(() => {
    // sreda 6. 11. 2030. u 9:00; samo Date je lažan
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 10, 6, 9, 0));
    odgovor = new Map();
    otvori = vi.fn((komponenta: unknown) => ({ afterClosed: () => of(odgovor.get(komponenta)) }));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: MatDialog, useValue: { open: otvori } }],
    });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon')
      .mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    poruke = TestBed.inject(NotificationStore);
    vi.spyOn(poruke, 'uspeh');
    vi.spyOn(poruke, 'greska');
  });

  afterEach(() => {
    http.verify();
    fixture?.destroy();
    vi.useRealTimers();
  });

  it('termini po danu: danas prvi, vreme, predmet i grupa, predavanje tog dana', async () => {
    await otvoriStranu([
      termin({ predavanjeId: 40 }),
      termin({ stavkaId: 8, datum: '2030-11-08', pocetak: '08:15:00', kraj: '09:45:00' }),
    ]);
    const dani = [...el().querySelectorAll<HTMLElement>('[data-dan]')];
    expect(dani.map(d => d.querySelector('h2')!.textContent)).toEqual(['Danas, sreda 6. 11.', 'Petak 8. 11.']);
    expect(red('7:2030-11-06').textContent).toContain('10:00–13:00');
    expect(red('7:2030-11-06').textContent).toContain('Geodezija 1 · GD-2030');
    expect(red('7:2030-11-06').querySelector('a[href="/predavanja/40"]')).not.toBeNull();
    expect(el().querySelector('[data-opseg]')!.textContent).toContain('6. 11.');
  });

  it('najave: broj (istaknut iznad praga), ko ne dolazi sa razlogom i vezom na karticu', async () => {
    const najave = [najava(1, 'bolnica'), najava(2), ...[3, 4, 5, 6].map(i => najava(i))];
    await otvoriStranu([termin({ brojNajava: 6, najave }), termin({ stavkaId: 8, brojNajava: 2, najave: [najava(1), najava(2)] })]);
    const prvi = red('7:2030-11-06');
    expect(prvi.querySelector('[data-broj-najava]')!.textContent).toContain('Ne dolazi: 6');
    expect(prvi.querySelector('[data-broj-najava] span')!.className).toContain('warn');
    expect(red('8:2030-11-06').querySelector('[data-broj-najava] span')!.className).not.toContain('warn');
    expect(prvi.querySelector('summary')!.textContent).toBe('Ko ne dolazi (6)');
    const prva = prvi.querySelector('details li')!;
    expect(prva.textContent).toContain('bolnica');
    expect(prva.querySelector('a')!.getAttribute('href')).toBe('/studenti/1');
  });

  it('počeo termin nema akcija; otkazan pokazuje napomenu, „Vrati čas“ i „Izmeni napomenu“', async () => {
    await otvoriStranu([
      termin({ poceo: true }),
      termin({ stavkaId: 8, otkazan: true, napomena: 'sednica veća' }),
    ]);
    expect(red('7:2030-11-06').querySelector('button')).toBeNull();
    const otkazan = red('8:2030-11-06');
    expect(otkazan.classList).toContain('otkazan');
    expect(otkazan.textContent).toContain('Otkazano');
    expect(otkazan.textContent).toContain('Napomena: sednica veća');
    expect(otkazan.querySelector('[data-vrati]')).not.toBeNull();
    expect(otkazan.querySelector('[data-otkazi]')).toBeNull();
  });

  it('Otkaži čas: dijalog napomene, POST otkazi, red se menja, poruka sa brojem mejlova', async () => {
    odgovor.set(OtkazivanjeDialog, { napomena: 'sednica veća', posaljiMejl: true });
    await otvoriStranu([termin()]);
    red('7:2030-11-06').querySelector<HTMLButtonElement>('[data-otkazi]')!.click();
    expect(otvori.mock.calls[0][0]).toBe(OtkazivanjeDialog);
    const req = http.expectOne('api/rasporedi/termini/otkazi');
    expect(req.request.body).toEqual({ stavkaId: 7, datum: '2030-11-06', napomena: 'sednica veća', posaljiMejl: true });
    req.flush({ termin: termin({ otkazan: true, napomena: 'sednica veća' }), obavesteno: 12, neposlato: 0 });
    await stabilno();
    expect(red('7:2030-11-06').textContent).toContain('Napomena: sednica veća');
    expect(poruke.uspeh).toHaveBeenCalledWith('Čas je otkazan. Mejl je poslat: 12 studenata.');
  });

  it('Otkaži čas bez napomene šalje null; Odustani ne šalje ništa', async () => {
    await otvoriStranu([termin()]);
    red('7:2030-11-06').querySelector<HTMLButtonElement>('[data-otkazi]')!.click();
    await stabilno();
    http.expectNone('api/rasporedi/termini/otkazi');
    odgovor.set(OtkazivanjeDialog, { napomena: '', posaljiMejl: true });
    red('7:2030-11-06').querySelector<HTMLButtonElement>('[data-otkazi]')!.click();
    const req = http.expectOne('api/rasporedi/termini/otkazi');
    expect(req.request.body.napomena).toBeNull();
    req.flush({ termin: termin({ otkazan: true }), obavesteno: 0, neposlato: 0 });
    await stabilno();
    expect(poruke.uspeh).toHaveBeenCalledWith('Čas je otkazan. Mejl nije poslat nikome.');
  });

  it('Vrati čas: potvrda, POST vrati, poruka; greška (409) učitava listu iznova', async () => {
    odgovor.set(VracanjeDialog, { posaljiMejl: true });
    await otvoriStranu([termin({ otkazan: true }), termin({ stavkaId: 8, otkazan: true })]);
    red('7:2030-11-06').querySelector<HTMLButtonElement>('[data-vrati]')!.click();
    expect(otvori.mock.calls[0][0]).toBe(VracanjeDialog);
    const req = http.expectOne('api/rasporedi/termini/vrati');
    expect(req.request.body).toEqual({ stavkaId: 7, datum: '2030-11-06', posaljiMejl: true });
    req.flush({ termin: termin(), obavesteno: 1, neposlato: 0 });
    await stabilno();
    expect(poruke.uspeh).toHaveBeenCalledWith('Čas se ipak održava. Mejl je poslat: 1 student.');
    expect(red('7:2030-11-06').querySelector('[data-otkazi]')).not.toBeNull();
    red('8:2030-11-06').querySelector<HTMLButtonElement>('[data-vrati]')!.click();
    http.expectOne('api/rasporedi/termini/vrati').flush({ reason: 'Termin je već počeo.' }, { status: 409, statusText: 'Conflict' });
    await stabilno();
    http.expectOne(r => r.url === TERMINI).flush([termin({ stavkaId: 8, otkazan: true, poceo: true })]);
    await stabilno();
    expect(red('8:2030-11-06').querySelector('button')).toBeNull();
  });

  it('bez mejla: posaljiMejl false ide serveru i poruka to kaže', async () => {
    odgovor.set(OtkazivanjeDialog, { napomena: '', posaljiMejl: false });
    odgovor.set(VracanjeDialog, { posaljiMejl: false });
    await otvoriStranu([termin(), termin({ stavkaId: 8, otkazan: true })]);
    red('7:2030-11-06').querySelector<HTMLButtonElement>('[data-otkazi]')!.click();
    const otkaz = http.expectOne('api/rasporedi/termini/otkazi');
    expect(otkaz.request.body.posaljiMejl).toBe(false);
    otkaz.flush({ termin: termin({ otkazan: true }), obavesteno: 0, neposlato: 0 });
    await stabilno();
    expect(poruke.uspeh).toHaveBeenCalledWith('Čas je otkazan. Mejl studentima nije slat.');
    red('8:2030-11-06').querySelector<HTMLButtonElement>('[data-vrati]')!.click();
    const vrati = http.expectOne('api/rasporedi/termini/vrati');
    expect(vrati.request.body).toEqual({ stavkaId: 8, datum: '2030-11-06', posaljiMejl: false });
    vrati.flush({ termin: termin({ stavkaId: 8 }), obavesteno: 0, neposlato: 0 });
    await stabilno();
    expect(poruke.uspeh).toHaveBeenCalledWith('Čas se ipak održava. Mejl studentima nije slat.');
  });

  it('deo mejlova nije stavljen u red: poruka je greška i kaže kome nije poslat', async () => {
    odgovor.set(OtkazivanjeDialog, { napomena: '', posaljiMejl: true });
    await otvoriStranu([termin()]);
    red('7:2030-11-06').querySelector<HTMLButtonElement>('[data-otkazi]')!.click();
    http.expectOne('api/rasporedi/termini/otkazi').flush({ termin: termin({ otkazan: true }), obavesteno: 10, neposlato: 2 });
    await stabilno();
    expect(poruke.uspeh).not.toHaveBeenCalled();
    expect(poruke.greska).toHaveBeenCalledWith('Čas je otkazan. Mejl je poslat: 10 studenata. Mejl nije poslat: 2 studenta '
      + '(red za slanje je pun ili slanje nije podešeno); javi im drugim putem.');
  });

  it('tekstMejla: stari server bez neposlato, nijedan u redu, samo neposlati', () => {
    expect(tekstMejla({ termin: termin(), obavesteno: 3 }, true)).toBe('Mejl je poslat: 3 studenta.');
    expect(tekstMejla({ termin: termin(), obavesteno: 0, neposlato: 0 }, true)).toBe('Mejl nije poslat nikome.');
    expect(tekstMejla({ termin: termin(), obavesteno: 0, neposlato: 1 }, true))
      .toBe('Mejl nije poslat: 1 student (red za slanje je pun ili slanje nije podešeno); javi im drugim putem.');
    expect(tekstMejla({ termin: termin(), obavesteno: 5, neposlato: 0 }, false)).toBe('Mejl studentima nije slat.');
  });

  it('od iz putanje (veza iz obaveštenja); „Kasnije“ i „Od danas“ menjaju samo query', async () => {
    await otvoriStranu([termin({ datum: '2030-11-13' })], '2030-11-13');
    expect(el().querySelector('h2')!.textContent).toBe('Sreda 13. 11.');
    el().querySelector<HTMLButtonElement>('[data-kasnije]')!.click();
    expect(router.navigate).toHaveBeenLastCalledWith([], { queryParams: { od: '2030-12-11' }, queryParamsHandling: 'merge' });
    el().querySelector<HTMLButtonElement>('[data-danas]')!.click();
    expect(router.navigate).toHaveBeenLastCalledWith([], { queryParams: { od: null }, queryParamsHandling: 'merge' });
  });

  it('neispravan od = danas; prazan period: objašnjenje sa vezom na raspored', async () => {
    await otvoriStranu([], 'juče');
    expect(el().querySelector('[data-danas]')).toBeNull();
    expect(el().querySelector('app-empty-state')!.textContent).toContain('Nema termina u ovom periodu');
  });
});
