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
import { WhatsAppDialog } from '../ui/whatsapp.dialog';
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

  it('termini po danu: blok datuma (danas, sutra, dan u nedelji), vreme, predmet i grupa, predavanje tog dana', async () => {
    await otvoriStranu([
      termin({ predavanjeId: 40 }),
      termin({ stavkaId: 8, datum: '2030-11-07' }),
      termin({ stavkaId: 9, datum: '2030-11-08', pocetak: '08:15:00', kraj: '09:45:00' }),
    ]);
    const dani = [...el().querySelectorAll<HTMLElement>('[data-dan]')];
    expect(dani.map(d => d.querySelector('h2 .sr-only')!.textContent)).toEqual([
      'Danas, sreda 6. 11.', 'Sutra, četvrtak 7. 11.', 'Petak 8. 11.',
    ]);
    const blok = (d: HTMLElement) => [...d.querySelectorAll('h2 [aria-hidden="true"]')].map(x => x.textContent);
    expect(blok(dani[0])).toEqual(['danas', '6', 'nov']);
    expect(blok(dani[2])).toEqual(['petak', '8', 'nov']);
    expect(dani[0].classList).toContain('danas');
    expect(dani[2].classList).not.toContain('danas');
    expect(red('7:2030-11-06').querySelector('[data-vreme]')!.textContent!.trim()).toBe('10:00–13:00');
    expect(red('7:2030-11-06').querySelector('h3')!.textContent).toBe('Geodezija 1');
    expect(red('7:2030-11-06').querySelector('[data-grupa]')!.textContent).toBe('GD-2030');
    expect(red('7:2030-11-06').querySelector('a[href="/predavanja/40"]')).not.toBeNull();
    expect(el().querySelector('[data-opseg]')!.textContent).toContain('6. 11.');
    expect(el().querySelector('[data-periodi]')!.getAttribute('href')).toBe('/raspored/periodi');
  });

  it('najave: krupan broj (istaknut iznad praga), klik rasklapa ko ne dolazi sa razlogom i vezom na karticu', async () => {
    const najave = [najava(1, 'bolnica'), najava(2), ...[3, 4, 5, 6].map(i => najava(i))];
    await otvoriStranu([
      termin({ brojNajava: 6, najave }),
      termin({ stavkaId: 8, brojNajava: 2, najave: [najava(1), najava(2)] }),
      termin({ stavkaId: 9 }),
    ]);
    const prvi = red('7:2030-11-06');
    const broj = prvi.querySelector<HTMLButtonElement>('button[data-broj-najava]')!;
    expect(broj.querySelector('[data-broj]')!.textContent).toBe('6');
    expect(broj.textContent).toContain('ne dolazi');
    expect(broj.classList).toContain('iznad');
    expect(broj.textContent).toContain('iznad praga 5');
    expect(red('8:2030-11-06').querySelector('[data-broj-najava]')!.classList).not.toContain('iznad');
    // nula: samo broj, bez dugmeta i liste
    const nula = red('9:2030-11-06').querySelector('[data-broj-najava]')!;
    expect(nula.tagName).toBe('P');
    expect(nula.querySelector('[data-broj]')!.textContent).toBe('0');

    const lista = prvi.querySelector<HTMLElement>('#ko-7\\:2030-11-06')!;
    expect(broj.getAttribute('aria-controls')).toBe('ko-7:2030-11-06');
    expect(broj.getAttribute('aria-expanded')).toBe('false');
    expect(lista.hidden).toBe(true);
    broj.click();
    await stabilno();
    expect(broj.getAttribute('aria-expanded')).toBe('true');
    expect(lista.hidden).toBe(false);
    expect(lista.querySelectorAll('li')).toHaveLength(6);
    const prva = lista.querySelector('li')!;
    expect(prva.textContent).toContain('bolnica');
    expect(prva.querySelector('a')!.getAttribute('href')).toBe('/studenti/1');
    // drugi termin ostaje sklopljen
    expect(red('8:2030-11-06').querySelector<HTMLElement>('ul.ko')!.hidden).toBe(true);
    broj.click();
    await stabilno();
    expect(lista.hidden).toBe(true);
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
    expect(poruke.uspeh).toHaveBeenCalledWith('Čas je otkazan. Mejl je poslat: 12 studenata.', expect.objectContaining({ label: 'WhatsApp' }));
  });

  it('posle otkazivanja red nudi „Pošalji u WhatsApp“ sa predlogom poruke; izmena napomene ne nudi', async () => {
    odgovor.set(OtkazivanjeDialog, { napomena: 'sednica', posaljiMejl: true });
    await otvoriStranu([termin(), termin({ stavkaId: 8, otkazan: true })]);
    expect(red('7:2030-11-06').querySelector('[data-wa]')).toBeNull();
    red('7:2030-11-06').querySelector<HTMLButtonElement>('[data-otkazi]')!.click();
    http.expectOne('api/rasporedi/termini/otkazi')
      .flush({ termin: termin({ otkazan: true, napomena: 'sednica' }), obavesteno: 0, neposlato: 0, pushPoslato: 4 });
    await stabilno();
    expect(poruke.uspeh).toHaveBeenCalledWith('Čas je otkazan. Mejl nije poslat nikome. Obaveštenje na telefon: 4.',
      expect.objectContaining({ label: 'WhatsApp' }));
    red('7:2030-11-06').querySelector<HTMLButtonElement>('[data-wa]')!.click();
    const poziv = otvori.mock.calls.at(-1)!;
    expect(poziv[0]).toBe(WhatsAppDialog);
    expect(poziv[1].data).toContain('nema časa: ');
    expect(poziv[1].data).toContain('\nsednica');
    red('8:2030-11-06').querySelectorAll<HTMLButtonElement>('button')[1].click();
    http.expectOne('api/rasporedi/termini/otkazi').flush({ termin: termin({ stavkaId: 8, otkazan: true }), obavesteno: 0 });
    await stabilno();
    expect(red('8:2030-11-06').querySelector('[data-wa]')).toBeNull();
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
    expect(poruke.uspeh).toHaveBeenCalledWith('Čas je otkazan. Mejl nije poslat nikome.', expect.objectContaining({ label: 'WhatsApp' }));
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
    expect(poruke.uspeh).toHaveBeenCalledWith('Čas se ipak održava. Mejl je poslat: 1 student.', expect.objectContaining({ label: 'WhatsApp' }));
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
    expect(poruke.uspeh).toHaveBeenCalledWith('Čas je otkazan. Mejl i obaveštenje na telefon nisu slati.', expect.anything());
    red('8:2030-11-06').querySelector<HTMLButtonElement>('[data-vrati]')!.click();
    const vrati = http.expectOne('api/rasporedi/termini/vrati');
    expect(vrati.request.body).toEqual({ stavkaId: 8, datum: '2030-11-06', posaljiMejl: false });
    vrati.flush({ termin: termin({ stavkaId: 8 }), obavesteno: 0, neposlato: 0 });
    await stabilno();
    expect(poruke.uspeh).toHaveBeenCalledWith('Čas se ipak održava. Mejl i obaveštenje na telefon nisu slati.', expect.anything());
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
    expect(tekstMejla({ termin: termin(), obavesteno: 5, neposlato: 0 }, false)).toBe('Mejl i obaveštenje na telefon nisu slati.');
    expect(tekstMejla({ termin: termin(), obavesteno: 2, neposlato: 0, pushPoslato: 3 }, true))
      .toBe('Mejl je poslat: 2 studenta. Obaveštenje na telefon: 3.');
  });

  it('od iz putanje (veza iz obaveštenja); „Kasnije“ i „Od danas“ menjaju samo query', async () => {
    await otvoriStranu([termin({ datum: '2030-11-13' })], '2030-11-13');
    expect(el().querySelector('h2 .sr-only')!.textContent).toBe('Sreda 13. 11.');
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
