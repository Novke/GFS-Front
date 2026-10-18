import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { NavigationEnd, provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { filter, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferenceApi } from '../../../core/api/reference.api';
import { PREFS_KLJUC } from '../../../core/state/preferences.store';
import { BANKA_RUTE } from '../banka.routes';
import { BankaApi } from '../data-access/banka.api';
import { GrupaCvor, GrupaDetails, VarijantaInfo } from '../data-access/banka.models';

@Component({ template: '404' })
class NijePronadjeno {}

function cvor(id: number, naziv: string, deca: GrupaCvor[] = [], izmena: Partial<GrupaCvor> = {}): GrupaCvor {
  return {
    id, naziv, rb: id, tezina: deca.length ? null : 2, list: deca.length === 0, brojVarijanti: 0, brojAktivnih: 0, brojNacrta: 0,
    brojGresaka: 0, deca, ...izmena,
  };
}

/** Konverzije (1) -> "2 → 10" (2, tri varijante) i "16 → 2" (3, jedna); "Osnove" (4) je list bez težine. */
const STABLO: GrupaCvor[] = [
  cvor(1, 'Konverzije brojeva', [
    cvor(2, '2 → 10', [], { brojVarijanti: 3, brojAktivnih: 1, brojNacrta: 2, brojGresaka: 1 }),
    cvor(3, '16 → 2', [], { brojVarijanti: 1, brojAktivnih: 1, tezina: 3 }),
  ], { brojVarijanti: 4, brojAktivnih: 2, brojNacrta: 2, brojGresaka: 1 }),
  cvor(4, 'Osnove', [], { tezina: null }),
];

function detalji(id: number): GrupaDetails {
  return {
    id, predmetId: 7, roditeljId: null, namena: 'PREDAVANJE', naziv: `Grupa ${id}`, opis: null, rb: id, tezina: 2, uputstvo: null,
    polja: [], putanja: [], list: id !== 1, brojVarijanti: 0, brojAktivnih: 0, brojNacrta: 0, brojGresaka: 0, izmenjeno: '2026-10-17T10:00:00',
  };
}

function varijanta(id: number, status: VarijantaInfo['status'], renderStatus: VarijantaInfo['renderStatus'] = 'OK'): VarijantaInfo {
  return {
    id, grupaId: 2, rb: id - 10, naziv: `Varijanta ${id}`, status, izvor: 'RUCNO', renderStatus,
    svgId: renderStatus === 'OK' ? `svg-${id}` : null, resenjeSvgId: null, izmenjeno: '2026-10-17T10:00:00',
  };
}

describe('BankaPage', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  const api = {
    stablo: vi.fn(),
    grupa: vi.fn(),
    varijante: vi.fn(),
    kreirajGrupu: vi.fn(),
    izmeniGrupu: vi.fn(),
    odobri: vi.fn(),
    obrisiVarijantu: vi.fn(),
  };
  const referenca = {
    predmeti: vi.fn(() => of([{ id: 7, naziv: 'Statika' }, { id: 3, naziv: 'Beton' }])),
    grupe: vi.fn(() => of([])),
    tipoviTesta: vi.fn(() => of([])),
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

  function zapamti(filteri: Record<string, string>): void {
    localStorage.setItem(PREFS_KLJUC, JSON.stringify({ filteri: { banka: filteri } }));
  }

  beforeEach(async () => {
    localStorage.clear();
    for (const f of Object.values(api)) {
      f.mockReset();
    }
    api.stablo.mockImplementation(() => of(STABLO));
    api.grupa.mockImplementation((id: number) => of(detalji(id)));
    api.varijante.mockImplementation((id: number) => of(id === 2 ? [varijanta(11, 'NACRT'), varijanta(12, 'AKTIVNA'), varijanta(13, 'NACRT', 'GRESKA')] : []));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'banka', children: BANKA_RUTE }, { path: '**', component: NijePronadjeno }], withComponentInputBinding()),
        { provide: BankaApi, useValue: api },
        { provide: ReferenceApi, useValue: referenca },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => localStorage.clear());

  const overlay = () => TestBed.inject(OverlayContainer).getContainerElement();
  /** Otvara meni dugmetom i vraća stanje stavki poslednjeg otvorenog menija (`naziv -> onemogućena`). */
  async function meni(dugme: HTMLElement): Promise<Record<string, boolean>> {
    dugme.click();
    await stabilno();
    const panel = [...overlay().querySelectorAll('.mat-mdc-menu-panel')].at(-1)!;
    return Object.fromEntries([...panel.querySelectorAll<HTMLElement>('[role=menuitem]')]
      .map(s => [s.textContent!.trim(), s.getAttribute('aria-disabled') === 'true' || s.hasAttribute('disabled')]));
  }
  async function zatvoriMeni(): Promise<void> {
    overlay().querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    await stabilno();
  }
  async function stavkaMenija(dugme: HTMLElement, naziv: string): Promise<void> {
    dugme.click();
    await stabilno();
    const panel = [...overlay().querySelectorAll('.mat-mdc-menu-panel')].at(-1)!;
    [...panel.querySelectorAll<HTMLElement>('[role=menuitem]')].find(s => s.textContent!.trim() === naziv)!.click();
    await stabilno();
  }
  const karticaMeni = (e: HTMLElement, id: number) => e.querySelector<HTMLElement>(`app-varijanta-kartica[data-varijanta="${id}"] button[data-meni]`)!;
  const stabloMeni = (e: HTMLElement, id: number) => e.querySelector<HTMLElement>(`[role=treeitem][data-id="${id}"] button.bk-meni-dugme`)!;

  it('bez ?predmet vraća zapamćen predmet i namenu (bez novog unosa u istoriji) i učitava njihovo stablo', async () => {
    // Statika (7) nije prva po nazivu (Beton, 3): bira se zapamćen
    zapamti({ predmet: '7', namena: 'TEST' });
    const navigacije = vi.spyOn(router, 'navigate');
    await otvori('/banka');

    expect(navigacije.mock.calls[0][1]).toMatchObject({ queryParams: { predmet: 7, namena: 'TEST' }, replaceUrl: true });
    expect(router.url).toMatch(/^\/banka\?predmet=7&namena=TEST/);
    expect(api.stablo).toHaveBeenCalledWith(7, 'TEST', { tiho: true });
    expect(api.stablo).toHaveBeenCalledTimes(1);
  });

  it('bez zapamćenog predmeta bira prvi po nazivu, namena Predavanja; izbor se pamti', async () => {
    await otvori('/banka');

    expect(api.stablo).toHaveBeenCalledWith(3, 'PREDAVANJE', { tiho: true });
    expect(router.url).toContain('predmet=3');
    expect(JSON.parse(localStorage.getItem(PREFS_KLJUC)!).filteri.banka).toEqual({ predmet: '3', namena: 'PREDAVANJE' });
  });

  it('list: kartice varijanti izabranog lista (prvi list), ?grupa u URL-u, filter statusa', async () => {
    const e = await otvori('/banka?predmet=7');

    expect(router.url).toContain('grupa=2');
    expect(e.querySelector('#bk-naslov-grupe')!.textContent).toBe('2 → 10');
    expect(e.querySelectorAll('app-varijanta-kartica')).toHaveLength(3);
    expect(e.querySelector('[data-zbir]')).toBeNull();
    expect(e.querySelector('[data-tezina]')!.textContent!.trim()).toBe('Težina 2');
    expect(e.querySelector('a[data-nova-varijanta]')!.getAttribute('href')).toBe('/banka/varijante/nova?grupa=2');

    e.querySelector<HTMLButtonElement>('app-chip-select [data-otvori]')!.click();
    await stabilno();
    const nacrt = [...TestBed.inject(OverlayContainer).getContainerElement().querySelectorAll<HTMLElement>('[role=menuitemradio]')]
      .find(s => s.textContent!.includes('Nacrt'))!;
    nacrt.click();
    await stabilno();
    expect([...e.querySelectorAll<HTMLElement>('app-varijanta-kartica')].map(k => k.dataset['varijanta'])).toEqual(['11', '13']);
  });

  it('unutrašnji čvor iz ?grupa: zbirni brojači, podgrupe i "Nova podgrupa", bez kartica', async () => {
    const e = await otvori('/banka?predmet=7&grupa=1');

    expect(e.querySelector('#bk-naslov-grupe')!.textContent).toBe('Konverzije brojeva');
    expect(e.querySelectorAll('app-varijanta-kartica')).toHaveLength(0);
    const zbir = [...e.querySelectorAll('[data-zbir] app-stat-tile')]
      .map(t => `${t.querySelector('.vrednost')!.textContent!.trim()} ${t.querySelector('.labela')!.textContent!.trim()}`);
    expect(zbir).toEqual(['4 Varijanti', '2 Aktivnih', '2 Nacrta', '1 Grešaka u LaTeX-u']);
    expect([...e.querySelectorAll('[data-podgrupa]')].map(p => p.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      '2 → 10, 1 aktivna, 2 nacrta, 1 greška',
      '16 → 2, 1 aktivna',
    ]);
    expect(e.querySelector('[data-nova-podgrupa]')).not.toBeNull();
    expect(api.varijante).toHaveBeenCalledWith(1, undefined, { tiho: true });
  });

  it('podgrupa u zbirnom panelu i klik u stablu biraju grupu i menjaju ?grupa', async () => {
    const e = await otvori('/banka?predmet=7&grupa=1');
    e.querySelector<HTMLButtonElement>('[data-podgrupa="3"]')!.click();
    await stabilno();
    expect(router.url).toContain('grupa=3');
    expect(e.querySelectorAll('app-varijanta-kartica')).toHaveLength(0);
    expect(e.querySelector('#bk-naslov-grupe')!.textContent).toBe('16 → 2');

    e.querySelector<HTMLElement>('[role=treeitem][data-id="2"] .bk-naziv')!.click();
    await stabilno();
    expect(router.url).toContain('grupa=2');
    expect(e.querySelectorAll('app-varijanta-kartica')).toHaveLength(3);
  });

  it('list bez težine: "Nova varijanta" je onemogućena uz objašnjenje i "Zadaj težinu"', async () => {
    const e = await otvori('/banka?predmet=7&grupa=4');

    const dugme = e.querySelector<HTMLButtonElement>('button[data-nova-varijanta]')!;
    expect(dugme.getAttribute('aria-disabled')).toBe('true');
    expect(e.querySelector('a[data-nova-varijanta]')).toBeNull();
    expect(e.querySelector('[data-bez-tezine]')!.textContent).toContain('Zadaj težinu');
    expect(e.querySelector('[data-tezina]')!.textContent!.trim()).toBe('Bez težine');
  });

  it('"Nova podgrupa" otvara dijalog i šalje komandu podgrupe (bez predmeta i namene, polja null)', async () => {
    api.kreirajGrupu.mockImplementation(() => of(detalji(50)));
    const e = await otvori('/banka?predmet=7&grupa=1');
    e.querySelector<HTMLButtonElement>('[data-nova-podgrupa]')!.click();
    await stabilno();

    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    expect(overlay.querySelector('h2')!.textContent).toContain('Nova podgrupa u „Konverzije brojeva“');
    const naziv = overlay.querySelector<HTMLInputElement>('[data-naziv]')!;
    // isti naziv kao brat (bez obzira na velika slova) se ne šalje
    naziv.value = '2 → 10';
    naziv.dispatchEvent(new Event('input'));
    overlay.querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    await stabilno();
    expect(overlay.textContent).toContain('Grupa sa tim nazivom već postoji.');
    expect(api.kreirajGrupu).not.toHaveBeenCalled();

    naziv.value = '  8 → 2 ';
    naziv.dispatchEvent(new Event('input'));
    overlay.querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    await stabilno();
    expect(api.kreirajGrupu).toHaveBeenCalledExactlyOnceWith(
      { roditeljId: 1, naziv: '8 → 2', tezina: null, opis: null, uputstvo: null, polja: null }, { tiho: true });
  });

  it('"Nova grupa" u zaglavlju pravi koren u predmetu i nameni stabla', async () => {
    api.kreirajGrupu.mockImplementation(() => of(detalji(51)));
    const e = await otvori('/banka?predmet=7&namena=TEST');
    e.querySelector<HTMLButtonElement>('[data-nova-grupa]')!.click();
    await stabilno();
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    const naziv = overlay.querySelector<HTMLInputElement>('[data-naziv]')!;
    naziv.value = 'Logička kola';
    naziv.dispatchEvent(new Event('input'));
    overlay.querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    await stabilno();
    expect(api.kreirajGrupu).toHaveBeenCalledExactlyOnceWith(
      { predmetId: 7, namena: 'TEST', roditeljId: null, naziv: 'Logička kola', tezina: null, opis: null, uputstvo: null, polja: null },
      { tiho: true });
  });

  it('prazno stablo: "Nema grupa: napravi prvu" sa dugmetom', async () => {
    api.stablo.mockImplementation(() => of([]));
    const e = await otvori('/banka?predmet=7&namena=TEST');
    expect(e.querySelector('app-empty-state h2')!.textContent).toBe('Nema grupa: napravi prvu');
    expect(e.querySelector('[data-prva-grupa]')).not.toBeNull();
    expect(e.querySelector('app-stablo-grupa')).toBeNull();
  });

  it('promena namene učitava drugo stablo i briše ?grupa', async () => {
    const e = await otvori('/banka?predmet=7&grupa=3');
    const testovi = [...e.querySelectorAll<HTMLButtonElement>('[data-namena] button')].find(b => b.textContent!.includes('Testovi'))!;
    testovi.click();
    await stabilno();
    expect(api.stablo).toHaveBeenLastCalledWith(7, 'TEST', { tiho: true });
    expect(router.url).toContain('namena=TEST');
    expect(router.url).toContain('grupa=2');
  });

  it('?grupa promenjen spolja (link, istorija) bira tu grupu bez novog stabla i bez povratnog upisa u URL', async () => {
    const e = await otvori('/banka?predmet=7&grupa=2');
    expect(e.querySelector('#bk-naslov-grupe')!.textContent).toBe('2 → 10');
    const navigacije: string[] = [];
    router.events.pipe(filter((d): d is NavigationEnd => d instanceof NavigationEnd)).subscribe(d => navigacije.push(d.urlAfterRedirects));

    await router.navigate(['/banka'], { queryParams: { predmet: 7, grupa: 3 } });
    await stabilno();

    expect(e.querySelector('#bk-naslov-grupe')!.textContent).toBe('16 → 2');
    expect(e.querySelector('[role=treeitem][data-id="3"]')!.getAttribute('aria-selected')).toBe('true');
    expect(api.stablo).toHaveBeenCalledTimes(1);
    expect(api.grupa).toHaveBeenLastCalledWith(3, { tiho: true });
    expect(navigacije).toEqual(['/banka?predmet=7&grupa=3']);

    // grupe nema u stablu: izbor ostaje, URL se ne dira
    await router.navigate(['/banka'], { queryParams: { predmet: 7, grupa: 99 } });
    await stabilno();
    expect(e.querySelector('#bk-naslov-grupe')!.textContent).toBe('16 → 2');
    expect(api.stablo).toHaveBeenCalledTimes(1);
  });

  it('zauzeto (kreiranje u toku): Nova grupa, Nova podgrupa, brisanje i dupliranje u menijima onemogućeni, posle odgovora opet ne', async () => {
    const odgovor = new Subject<GrupaDetails>();
    api.kreirajGrupu.mockReturnValue(odgovor);
    const e = await otvori('/banka?predmet=7&grupa=1');
    const dugme = (sel: string) => e.querySelector<HTMLButtonElement>(sel)!;
    dugme('[data-nova-podgrupa]').click();
    await stabilno();
    const naziv = overlay().querySelector<HTMLInputElement>('[data-naziv]')!;
    naziv.value = 'Nova';
    naziv.dispatchEvent(new Event('input'));
    overlay().querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    await stabilno();
    expect(api.kreirajGrupu).toHaveBeenCalledOnce();

    expect(dugme('[data-nova-grupa]').disabled).toBe(true);
    expect(dugme('[data-nova-podgrupa]').disabled).toBe(true);
    expect(await meni(stabloMeni(e, 4))).toEqual({ 'Dodaj podgrupu': true, Preimenuj: false, 'Premesti u…': false, Obriši: true });
    await zatvoriMeni();
    e.querySelector<HTMLElement>('[role=treeitem][data-id="2"] .bk-naziv')!.click();
    await stabilno();
    expect(await meni(karticaMeni(e, 11))).toEqual({ Uredi: false, Odobri: false, Dupliraj: true, Obriši: true });
    await zatvoriMeni();

    odgovor.next(detalji(50));
    odgovor.complete();
    await stabilno();

    expect(dugme('[data-nova-grupa]').disabled).toBe(false);
    expect(await meni(karticaMeni(e, 11))).toEqual({ Uredi: false, Odobri: false, Dupliraj: false, Obriši: false });
    await zatvoriMeni();
    expect(await meni(stabloMeni(e, 4))).toEqual({ 'Dodaj podgrupu': false, Preimenuj: false, 'Premesti u…': false, Obriši: false });
    await zatvoriMeni();
    e.querySelector<HTMLElement>('[role=treeitem][data-id="1"] .bk-naziv')!.click();
    await stabilno();
    expect(dugme('[data-nova-podgrupa]').disabled).toBe(false);
  });

  it('greška učitavanja grupe: panel greške, aria-busy nije "true"', async () => {
    api.varijante.mockImplementation(() => throwError(() => new HttpErrorResponse({ status: 404, error: { reason: 'Grupa nije pronađena.' } })));
    const e = await otvori('/banka?predmet=7&grupa=3');
    const panel = e.querySelector('[data-grupa-panel]')!;
    expect(panel.querySelector('app-error-panel')!.textContent).toContain('Grupa nije pronađena.');
    expect(panel.getAttribute('aria-busy')).toBe('false');
  });

  it('kartica koja nestane posle Odobri (filter "Nacrt") predaje fokus sledećoj, poslednja traci filtera', async () => {
    let lista = [varijanta(11, 'NACRT'), varijanta(12, 'AKTIVNA'), varijanta(13, 'NACRT', 'GRESKA')];
    api.varijante.mockImplementation((id: number) => of(id === 2 ? lista : []));
    api.odobri.mockImplementation(() => of({}));
    api.obrisiVarijantu.mockImplementation(() => of(undefined));
    const e = await otvori('/banka?predmet=7&grupa=2');
    e.querySelector<HTMLButtonElement>('app-chip-select [data-otvori]')!.click();
    await stabilno();
    [...overlay().querySelectorAll<HTMLElement>('[role=menuitemradio]')].find(s => s.textContent!.includes('Nacrt'))!.click();
    await stabilno();

    lista = [varijanta(11, 'AKTIVNA'), varijanta(12, 'AKTIVNA'), varijanta(13, 'NACRT', 'GRESKA')];
    await stavkaMenija(karticaMeni(e, 11), 'Odobri');
    expect(api.odobri).toHaveBeenCalledWith(11, { tiho: true });
    expect([...e.querySelectorAll<HTMLElement>('app-varijanta-kartica')].map(k => k.dataset['varijanta'])).toEqual(['13']);
    expect(document.activeElement).toBe(e.querySelector('app-varijanta-kartica[data-varijanta="13"] .bk-kartica-veza'));

    lista = [varijanta(11, 'AKTIVNA'), varijanta(12, 'AKTIVNA')];
    await stavkaMenija(karticaMeni(e, 13), 'Obriši');
    overlay().querySelector<HTMLButtonElement>('[data-potvrdi]')!.click();
    await stabilno();
    expect(api.obrisiVarijantu).toHaveBeenCalledWith(13, { tiho: true });
    expect(e.querySelectorAll('app-varijanta-kartica')).toHaveLength(0);
    expect(document.activeElement).toBe(e.querySelector('app-filter-bar button'));
  });

  it('"Zadaj težinu": posle čuvanja fokus ide na link "Nova varijanta" (dugme i upozorenje nestaju)', async () => {
    let tezina: number | null = null;
    api.stablo.mockImplementation(() => of([...STABLO.slice(0, 1), cvor(4, 'Osnove', [], { tezina })]));
    api.izmeniGrupu.mockImplementation((_id: number, cmd: { tezina: number | null }) => {
      tezina = cmd.tezina;
      return of(detalji(4));
    });
    const e = await otvori('/banka?predmet=7&grupa=4');
    e.querySelector<HTMLButtonElement>('[data-bez-tezine] button')!.click();
    await stabilno();
    overlay().querySelector<HTMLElement>('mat-select[data-tezina] .mat-mdc-select-trigger')!.click();
    await stabilno();
    [...overlay().querySelectorAll<HTMLElement>('mat-option')].find(o => o.textContent!.trim() === '4')!.click();
    await stabilno();
    overlay().querySelector<HTMLButtonElement>('[data-sacuvaj]')!.click();
    await stabilno();

    expect(api.izmeniGrupu.mock.lastCall?.[1].tezina).toBe(4);
    expect(e.querySelector('[data-bez-tezine]')).toBeNull();
    expect(document.activeElement).toBe(e.querySelector('a[data-nova-varijanta]'));
  });

  it('nepoznat id u putanji ide na 404, bez poziva API-ja', async () => {
    await otvori('/banka/varijante/abc');
    expect(el().textContent).toBe('404');
    expect(api.stablo).not.toHaveBeenCalled();
  });
});
