import { OverlayContainer } from '@angular/cdk/overlay';
import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BreadcrumbService } from '../../../core/layout/breadcrumbs';
import { NotificationStore } from '../../../core/state/notification.store';
import { BANKA_RUTE } from '../banka.routes';
import { BankaApi } from '../data-access/banka.api';
import { GrupaDetails, Polje, VarijantaInfo } from '../data-access/banka.models';
import { novoPolje } from '../data-access/polja';
import { GrupaDetaljPage } from './grupa-detalj.page';

@Component({ template: 'druga' })
class Druga {}

const POLJE_A: Polje = { ...novoPolje('BROJ', []), kljuc: 'a', oznaka: 'Vrednost u dekadnom sistemu' };
const POLJE_B: Polje = {
  ...novoPolje('JEDAN_TACAN', []), kljuc: 'b', oznaka: 'Broj cifara', opcije: [{ id: 1, tekst: '4' }, { id: 2, tekst: '8' }, { id: 3, tekst: '12' }],
};

/** List "2 → 10" (2) u "Konverzije brojeva" (1): težina 2, polje `a`, tri varijante (jedna aktivna). */
function list(izmena: Partial<GrupaDetails> = {}): GrupaDetails {
  return {
    id: 2, predmetId: 7, roditeljId: 1, namena: 'PREDAVANJE', naziv: '2 → 10', opis: 'Binarni u dekadni.', rb: 1, tezina: 2,
    uputstvo: 'Do 8 cifara.', polja: [POLJE_A], putanja: [{ id: 1, naziv: 'Konverzije brojeva' }, { id: 2, naziv: '2 → 10' }], list: true,
    brojVarijanti: 3, brojAktivnih: 1, brojNacrta: 2, brojGresaka: 1, izmenjeno: '2026-10-17T10:00:00', ...izmena,
  };
}

const UNUTRASNJI: GrupaDetails = {
  ...list(), id: 1, roditeljId: null, naziv: 'Konverzije brojeva', opis: null, tezina: null, uputstvo: 'Staro uputstvo', polja: [],
  putanja: [{ id: 1, naziv: 'Konverzije brojeva' }], list: false, brojVarijanti: 4, brojAktivnih: 2,
};

function varijanta(id: number, status: VarijantaInfo['status']): VarijantaInfo {
  return {
    id, grupaId: 2, rb: id - 10, naziv: `Varijanta ${id}`, status, izvor: 'RUCNO', renderStatus: 'OK', svgId: `svg-${id}`,
    resenjeSvgId: null, izmenjeno: '2026-10-17T10:00:00',
  };
}

describe('GrupaDetaljPage', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  const api = {
    grupa: vi.fn(),
    varijante: vi.fn(),
    izmeniGrupu: vi.fn(),
    odobri: vi.fn(),
    arhiviraj: vi.fn(),
    vratiUNacrt: vi.fn(),
    dupliraj: vi.fn(),
    obrisiVarijantu: vi.fn(),
  };
  const el = () => harness.routeNativeElement as HTMLElement;

  async function stabilno(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await harness.fixture.whenStable();
      await new Promise(r => setTimeout(r));
    }
  }

  async function otvori(url: string): Promise<HTMLElement> {
    await harness.navigateByUrl(url);
    await stabilno();
    return el();
  }

  const stranica = () => harness.routeDebugElement!.componentInstance as GrupaDetaljPage;
  const sacuvaj = () => el().querySelector<HTMLButtonElement>('button[data-sacuvaj]')!;
  const odbaci = () => el().querySelector<HTMLButtonElement>('button[data-odbaci]')!;
  const onemoguceno = (b: HTMLButtonElement) => b.disabled || b.getAttribute('aria-disabled') === 'true';
  async function unesi(selektor: string, vrednost: string): Promise<void> {
    const polje = el().querySelector<HTMLInputElement | HTMLTextAreaElement>(selektor)!;
    polje.value = vrednost;
    polje.dispatchEvent(new Event('input', { bubbles: true }));
    await stabilno();
  }
  async function klik(e: HTMLElement): Promise<void> {
    e.click();
    await stabilno();
  }
  const telo = (i = 0) => api.izmeniGrupu.mock.calls[i][1];

  beforeEach(async () => {
    for (const f of Object.values(api)) {
      f.mockReset();
    }
    api.grupa.mockImplementation((id: number) => of(id === 1 ? UNUTRASNJI : list()));
    api.varijante.mockImplementation(() => of([varijanta(11, 'NACRT'), varijanta(12, 'AKTIVNA'), varijanta(13, 'NACRT')]));
    api.izmeniGrupu.mockImplementation((id: number, cmd: { naziv: string; opis: string | null; tezina: number | null; uputstvo: string | null; polja: Polje[] | null }) =>
      of({ ...(id === 1 ? UNUTRASNJI : list()), naziv: cmd.naziv, opis: cmd.opis, tezina: cmd.tezina, uputstvo: cmd.uputstvo, ...(cmd.polja ? { polja: cmd.polja } : {}) }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'banka', children: BANKA_RUTE }, { path: '**', component: Druga }], withComponentInputBinding()),
        { provide: BankaApi, useValue: api },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });

  it('list: zaglavlje sa putanjom do banke, forma iz grupe, šema polja i kartice varijanti', async () => {
    const e = await otvori('/banka/grupe/2');

    expect(api.grupa).toHaveBeenCalledWith(2, { tiho: true });
    expect(e.querySelector('h1')!.textContent).toBe('2 → 10');
    const veze = [...e.querySelectorAll<HTMLAnchorElement>('[data-putanja] a')];
    expect(veze.map(a => [a.textContent!.trim(), a.getAttribute('href')])).toEqual([
      ['Konverzije brojeva', '/banka?predmet=7&namena=PREDAVANJE&grupa=1'],
      ['2 → 10', '/banka?predmet=7&namena=PREDAVANJE&grupa=2'],
    ]);
    expect(TestBed.inject(BreadcrumbService).mrvice().at(-1)!.label).toBe('2 → 10');
    expect(e.querySelector<HTMLInputElement>('input[data-naziv]')!.value).toBe('2 → 10');
    expect(e.querySelector('mat-select[data-tezina]')!.textContent).toContain('2');
    expect(e.querySelector<HTMLTextAreaElement>('textarea[data-opis]')!.value).toBe('Binarni u dekadni.');
    expect(e.querySelector<HTMLTextAreaElement>('textarea[data-uputstvo]')!.value).toBe('Do 8 cifara.');
    expect(e.textContent).toContain('Claude ovo čita kao uputstvo za nove varijante');
    expect(e.querySelectorAll('app-polja-editor [data-polje]')).toHaveLength(1);
    // aktivna varijanta zaključava tip sačuvanog polja
    expect(e.querySelector('app-polja-editor mat-select[data-tip]')!.getAttribute('aria-disabled')).toBe('true');
    expect(e.querySelectorAll('app-varijanta-kartica')).toHaveLength(3);
    expect(e.querySelector('a[data-nova-varijanta]')!.getAttribute('href')).toBe('/banka/varijante/nova?grupa=2');
    expect(onemoguceno(sacuvaj())).toBe(true);
    expect(onemoguceno(odbaci())).toBe(true);
  });

  it('samo preimenovanje: PUT sa "polja": null (šema ostaje), LOCAL_ERRORS, poruka uspeha i ponovo učitane varijante', async () => {
    const uspeh = vi.spyOn(TestBed.inject(NotificationStore), 'uspeh');
    await otvori('/banka/grupe/2');
    await unesi('input[data-naziv]', '  Binarno u dekadno ');
    expect(stranica().imaNesacuvanihIzmena()).toBe(true);
    expect(onemoguceno(sacuvaj())).toBe(false);
    await klik(sacuvaj());

    expect(api.izmeniGrupu).toHaveBeenCalledTimes(1);
    expect(api.izmeniGrupu.mock.calls[0][0]).toBe(2);
    expect(telo()).toEqual({ naziv: 'Binarno u dekadno', opis: 'Binarni u dekadni.', tezina: 2, uputstvo: 'Do 8 cifara.', polja: null });
    expect(api.izmeniGrupu.mock.calls[0][2]).toEqual({ tiho: true });
    expect(uspeh).toHaveBeenCalledWith('Grupa je sačuvana.');
    expect(api.varijante).toHaveBeenCalledTimes(2);
    expect(el().querySelector('h1')!.textContent).toBe('Binarno u dekadno');
    expect(TestBed.inject(BreadcrumbService).mrvice().at(-1)!.label).toBe('Binarno u dekadno');
    expect(stranica().imaNesacuvanihIzmena()).toBe(false);
    expect(onemoguceno(sacuvaj())).toBe(true);
    // prazan opis i uputstvo se šalju kao null
    await unesi('textarea[data-opis]', '   ');
    await unesi('textarea[data-uputstvo]', '');
    await klik(sacuvaj());
    expect(telo(1)).toEqual({ naziv: 'Binarno u dekadno', opis: null, tezina: 2, uputstvo: null, polja: null });
  });

  it('izmena šeme: PUT nosi celu (normalizovanu) listu polja; upozorenje kad se dodaje polje uz aktivne varijante', async () => {
    const e = await otvori('/banka/grupe/2');
    const upozorenja = () => e.querySelector('[data-posledice]')!.textContent!;
    expect(upozorenja().trim()).toBe('');

    e.querySelector<HTMLElement>('[data-dodaj-polje]')!.click();
    await stabilno();
    expect(upozorenja()).toContain('Aktivne varijante će postati nacrti dok ne dobiju odgovor za novo polje.');
    // novo polje bez oznake: šema nije ispravna, ne čuva se
    expect(e.querySelector('[data-greska-polja]')!.textContent).toContain('Oznaka polja mora imati 1 do 200 znakova.');
    expect(onemoguceno(sacuvaj())).toBe(true);
    await klik(sacuvaj());
    expect(api.izmeniGrupu).not.toHaveBeenCalled();

    await unesi('[data-polje="b"] input[data-oznaka]', ' Broj jedinica ');
    await klik(sacuvaj());
    expect(telo().polja).toEqual([POLJE_A, { ...novoPolje('BROJ', [POLJE_A]), oznaka: 'Broj jedinica' }]);
    expect(telo()).toMatchObject({ naziv: '2 → 10', tezina: 2 });
  });

  it('izmena samo u šemi je nesačuvana izmena; izmena pa vraćanje nije, i uz drugu izmenu šalje "polja": null', async () => {
    const e = await otvori('/banka/grupe/2');
    const oznaka = '[data-polje="a"] input[data-oznaka]';
    await unesi(oznaka, 'Dekadno');
    expect(stranica().imaNesacuvanihIzmena()).toBe(true);
    expect(onemoguceno(sacuvaj())).toBe(false);

    await unesi(oznaka, POLJE_A.oznaka);
    expect(stranica().imaNesacuvanihIzmena()).toBe(false);
    expect(onemoguceno(sacuvaj())).toBe(true);
    await unesi('input[data-naziv]', 'Novo');
    await klik(sacuvaj());
    expect(telo().polja).toBeNull();
    expect(e.querySelector('[data-posledice]')!.textContent!.trim()).toBe('');
  });

  it('samo preuređenje polja šalje ceo niz novim redom', async () => {
    api.grupa.mockReturnValue(of(list({ polja: [POLJE_A, POLJE_B] })));
    const e = await otvori('/banka/grupe/2');
    await klik(e.querySelector<HTMLElement>('[data-polje="b"] [data-gore]')!);
    expect(stranica().imaNesacuvanihIzmena()).toBe(true);
    await klik(sacuvaj());
    expect(telo().polja.map((p: Polje) => p.kljuc)).toEqual(['b', 'a']);
    expect(telo().polja).toEqual([POLJE_B, POLJE_A]);
  });

  it('obrisana sačuvana opcija pa nova: nov id (ne id obrisane) i upozorenje o obrisanoj opciji', async () => {
    api.grupa.mockReturnValue(of(list({ polja: [POLJE_A, POLJE_B] })));
    const e = await otvori('/banka/grupe/2');
    await klik(e.querySelectorAll<HTMLElement>('[data-polje="b"] [data-obrisi-opciju]')[2]);
    await klik(e.querySelector<HTMLElement>('[data-polje="b"] [data-dodaj-opciju]')!);
    const nova = [...e.querySelectorAll<HTMLInputElement>('[data-polje="b"] input[data-opcija]')][2];
    nova.value = '16';
    nova.dispatchEvent(new Event('input', { bubbles: true }));
    await stabilno();
    expect(e.querySelector('[data-posledice]')!.textContent).toContain(
      'Tačni odgovori koji biraju obrisanu opciju se brišu iz varijanti; takva aktivna varijanta postaje nacrt.');
    await klik(sacuvaj());
    expect(telo().polja[1].opcije).toEqual([{ id: 1, tekst: '4' }, { id: 2, tekst: '8' }, { id: 4, tekst: '16' }]);
  });

  it('brisanje polja: upozorenje o brisanju odgovora; "polja": [] briše šemu; Odbaci vraća sačuvano', async () => {
    const e = await otvori('/banka/grupe/2');
    e.querySelector<HTMLElement>('[data-polje="a"] [data-obrisi-polje]')!.click();
    await stabilno();
    expect(e.querySelector('[data-posledice]')!.textContent).toContain('Odgovori za obrisano polje se brišu iz svih varijanti.');

    await klik(odbaci());
    expect(e.querySelectorAll('app-polja-editor [data-polje]')).toHaveLength(1);
    expect(e.querySelector('[data-posledice]')!.textContent!.trim()).toBe('');
    expect(stranica().imaNesacuvanihIzmena()).toBe(false);

    e.querySelector<HTMLElement>('[data-polje="a"] [data-obrisi-polje]')!.click();
    await stabilno();
    await klik(sacuvaj());
    expect(telo().polja).toEqual([]);
  });

  it('greška servera ide u traku iznad forme (ne u snackbar); izmene ostaju', async () => {
    api.izmeniGrupu.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { reason: "Tip polja 'a' se ne menja dok grupa ima aktivne varijante." } })));
    const e = await otvori('/banka/grupe/2');
    await unesi('input[data-naziv]', 'Novo');
    await klik(sacuvaj());

    const traka = e.querySelector('app-form-error-banner [role=alert]')!;
    expect(traka.textContent).toContain("Tip polja 'a' se ne menja dok grupa ima aktivne varijante.");
    expect(e.querySelector<HTMLInputElement>('input[data-naziv]')!.value).toBe('Novo');
    expect(stranica().imaNesacuvanihIzmena()).toBe(true);
  });

  it('dok čuvanje traje Sačuvaj je onemogućeno (dvostruki klik šalje jedan PUT)', async () => {
    const odgovor = new Subject<GrupaDetails>();
    api.izmeniGrupu.mockReturnValue(odgovor);
    await otvori('/banka/grupe/2');
    await unesi('input[data-naziv]', 'Novo');
    await klik(sacuvaj());
    expect(onemoguceno(sacuvaj())).toBe(true);
    await klik(sacuvaj());
    expect(api.izmeniGrupu).toHaveBeenCalledTimes(1);
    odgovor.next(list({ naziv: 'Novo' }));
    odgovor.complete();
    await stabilno();
    expect(stranica().imaNesacuvanihIzmena()).toBe(false);
  });

  it('grupa sa varijantama: težina se ne može ukloniti; bez varijanti nudi "Bez težine"', async () => {
    const e = await otvori('/banka/grupe/2');
    e.querySelector<HTMLElement>('mat-select[data-tezina] .mat-mdc-select-trigger')!.click();
    await stabilno();
    const opcije = () => [...TestBed.inject(OverlayContainer).getContainerElement().querySelectorAll('mat-option')].map(o => o.textContent!.trim());
    expect(opcije()).toEqual(['1', '2', '3', '4', '5']);
    await klik(TestBed.inject(OverlayContainer).getContainerElement().querySelector<HTMLElement>('.cdk-overlay-backdrop')!);

    api.grupa.mockReturnValue(of(list({ id: 5, brojVarijanti: 0, brojAktivnih: 0, brojNacrta: 0, tezina: null })));
    api.varijante.mockReturnValue(of([]));
    await otvori('/banka/grupe/5');
    expect(el().querySelector('button[data-nova-varijanta]')!.getAttribute('aria-disabled')).toBe('true');
    expect(el().textContent).toContain('Grupa još nema varijanti');
    el().querySelector<HTMLElement>('mat-select[data-tezina] .mat-mdc-select-trigger')!.click();
    await stabilno();
    expect(opcije()).toContain('Bez težine');
  });

  it('unutrašnji čvor: samo naziv i opis; PUT zadržava težinu i uputstvo, "polja": null', async () => {
    const e = await otvori('/banka/grupe/1');
    expect(e.querySelector('input[data-naziv]')).not.toBeNull();
    expect(e.querySelector('textarea[data-opis]')).not.toBeNull();
    expect(e.querySelector('mat-select[data-tezina]')).toBeNull();
    expect(e.querySelector('textarea[data-uputstvo]')).toBeNull();
    expect(e.querySelector('app-polja-editor')).toBeNull();
    expect(e.querySelector('app-varijanta-kartica')).toBeNull();
    expect(api.varijante).not.toHaveBeenCalled();

    await unesi('textarea[data-opis]', 'Zbirna grupa.');
    await klik(sacuvaj());
    expect(telo()).toEqual({ naziv: 'Konverzije brojeva', opis: 'Zbirna grupa.', tezina: null, uputstvo: 'Staro uputstvo', polja: null });
  });

  it('404: "Grupa nije pronađena" sa vezom na banku; druga greška: panel sa ponovnim pokušajem', async () => {
    api.grupa.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404, error: { reason: 'Grupa nije pronađena.' } })));
    let e = await otvori('/banka/grupe/9');
    expect(e.textContent).toContain('Grupa nije pronađena');
    expect(e.querySelector('a[href="/banka"]')).not.toBeNull();
    expect(e.querySelector('form')).toBeNull();

    api.grupa.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 }))).mockReturnValue(of(list()));
    e = await otvori('/banka/grupe/2');
    expect(e.querySelector('app-error-panel')).not.toBeNull();
    await klik(e.querySelector<HTMLElement>('app-error-panel [data-ponovo]')!);
    expect(el().querySelector<HTMLInputElement>('input[data-naziv]')!.value).toBe('2 → 10');
  });

  it('radnja nad karticom ide kroz API i ponovo učitava varijante; aktivne zaključavaju tip', async () => {
    api.odobri.mockReturnValue(of({}));
    const e = await otvori('/banka/grupe/2');
    api.varijante.mockReturnValue(of([varijanta(11, 'AKTIVNA'), varijanta(12, 'AKTIVNA'), varijanta(13, 'NACRT')]));
    e.querySelector<HTMLElement>('app-varijanta-kartica[data-varijanta="11"] button[data-meni]')!.click();
    await stabilno();
    const stavka = [...TestBed.inject(OverlayContainer).getContainerElement().querySelectorAll<HTMLElement>('[role=menuitem]')]
      .find(s => s.textContent!.trim() === 'Odobri')!;
    await klik(stavka);
    expect(api.odobri).toHaveBeenCalledWith(11, { tiho: true });
    expect(api.varijante).toHaveBeenCalledTimes(2);
    expect(e.querySelector('app-varijanta-kartica[data-varijanta="11"]')!.textContent).toContain('Aktivna');
  });

  it('brisanje varijante posle potvrde; fokus prelazi na karticu koja je došla na njeno mesto', async () => {
    api.obrisiVarijantu.mockReturnValue(of(undefined));
    const e = await otvori('/banka/grupe/2');
    const nova = new Subject<VarijantaInfo[]>();
    api.varijante.mockReturnValue(nova);
    e.querySelector<HTMLElement>('app-varijanta-kartica[data-varijanta="11"] button[data-meni]')!.click();
    await stabilno();
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    await klik([...overlay.querySelectorAll<HTMLElement>('[role=menuitem]')].find(s => s.textContent!.trim() === 'Obriši')!);
    expect(overlay.textContent).toContain('Obrisati varijantu „Varijanta 11“?');
    await klik([...overlay.querySelectorAll<HTMLElement>('button')].find(b => b.textContent!.includes('Obriši varijantu'))!);
    expect(api.obrisiVarijantu).toHaveBeenCalledWith(11, { tiho: true });

    // kartica sa fokusom nestaje: fokus pada na body, pa ga stranica vraća na karticu na istom mestu
    (document.activeElement as HTMLElement | null)?.blur();
    nova.next([varijanta(12, 'AKTIVNA'), varijanta(13, 'NACRT')]);
    await stabilno();
    expect(e.querySelectorAll('app-varijanta-kartica')).toHaveLength(2);
    expect(document.activeElement).toBe(e.querySelector('app-varijanta-kartica[data-varijanta="12"] .bk-kartica-veza'));
  });

  it('napuštanje sa nesačuvanim izmenama traži potvrdu (unsavedChangesGuard)', async () => {
    await otvori('/banka/grupe/2');
    await unesi('input[data-naziv]', 'Novo');
    // navigacija čeka potvrdu (zadatak u toku), pa se ovde ne čeka `whenStable`
    const navigacija = router.navigateByUrl('/drugo');
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    await vi.waitUntil(() => overlay.textContent!.includes('Napustiti stranicu?'));
    [...overlay.querySelectorAll<HTMLElement>('button')].find(b => b.textContent!.includes('Napusti'))!.click();
    expect(await navigacija).toBe(true);
    expect(router.url).toBe('/drugo');
  });
});
