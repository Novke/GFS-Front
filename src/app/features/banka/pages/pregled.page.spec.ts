import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { delay, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferenceApi } from '../../../core/api/reference.api';
import { BANKA_RUTE } from '../banka.routes';
import { BankaApi } from '../data-access/banka.api';
import { BankaPretragaStavka, PonistavanjeInfo, VarijantaDetails } from '../data-access/banka.models';

@Component({ template: 'druga' })
class Druga {}

const PUTANJA = [{ id: 1, naziv: 'Konverzije brojeva' }, { id: 4, naziv: '8 → 2 (Klod)' }];

function stavka(id: number, izmena: Partial<BankaPretragaStavka> = {}): BankaPretragaStavka {
  return {
    varijantaId: id, grupaId: 4, grupaNaziv: '8 → 2 (Klod)', putanja: PUTANJA, naziv: `Kol. 1, zad. ${id}`, status: 'NACRT',
    renderStatus: 'OK', isecak: 'Pretvori', izvor: 'CLAUDE', serija: 'uvoz-kol1-2024', ...izmena,
  };
}

function varijanta(id: number, izmena: Partial<VarijantaDetails> = {}): VarijantaDetails {
  return {
    id, grupaId: 4, putanja: PUTANJA, rb: id - 14, naziv: `Kol. 1, zad. ${id}`, tekst: 'Pretvori', resenje: 'Rešenje', odgovori: {
      a: { broj: null, prihvatljivi: ['1111'], tacna: null, tacne: null },
    }, polja: [{
      kljuc: 'a', oznaka: 'Binarni zapis', tip: 'TEKST', odstupanje: null, odstupanjeTip: null, jedinica: null, zanemariVelicinu: true,
      zanemariRazmake: true, opcije: null,
    }], prilozi: [], status: 'NACRT', izvor: 'CLAUDE', renderStatus: 'OK', svgId: `svg-${id}`, resenjeSvgId: `svg-r-${id}`,
    renderGreska: null, renderDeo: null, kreirano: '2026-10-18T10:00:00', izmenjeno: '2026-10-18T10:00:00', ikadOdobrena: false,
    zamenjuje: null, serija: 'uvoz-kol1-2024', ...izmena,
  };
}

const VARIJANTE: Record<number, VarijantaDetails> = {
  15: varijanta(15, { naziv: '17 u binarni', status: 'AKTIVNA', izvor: 'RUCNO', serija: null, ikadOdobrena: true }),
  16: varijanta(16, { zamenjuje: 15 }),
  17: varijanta(17),
  18: varijanta(18, { izvor: 'RUCNO', serija: null }),
};

describe('PregledPage', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  const api = {
    pretraga: vi.fn(),
    varijanta: vi.fn(),
    odobri: vi.fn(),
    obrisiVarijantu: vi.fn(),
    odbaciSeriju: vi.fn(),
  };
  const referenca = {
    predmeti: vi.fn(() => of([{ id: 1, naziv: 'Uvod u računarstvo' }])),
    grupe: vi.fn(() => of([])),
    tipoviTesta: vi.fn(() => of([])),
  };
  const el = () => harness.routeNativeElement as HTMLElement;
  const overlay = () => TestBed.inject(OverlayContainer).getContainerElement();
  const dijalog = () => overlay().querySelector<HTMLElement>('mat-dialog-container');

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
  /** Taster na dokumentu (ili na elementu `na`, odakle se penje do dokumenta). */
  async function taster(key: string, na: EventTarget = document, opcije: KeyboardEventInit = {}): Promise<KeyboardEvent> {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opcije });
    na.dispatchEvent(e);
    await stabilno();
    return e;
  }
  const napredak = () => el().querySelector('[data-napredak]')?.textContent?.trim();
  const naslov = () => el().querySelector('[data-naziv]')?.textContent?.trim();

  beforeEach(async () => {
    for (const f of Object.values(api)) {
      f.mockReset();
    }
    api.pretraga.mockImplementation(() => of({
      content: [stavka(16), stavka(17), stavka(18, { izvor: 'RUCNO', serija: null })],
      page: { size: 100, number: 0, totalElements: 3, totalPages: 1 },
    }));
    api.varijanta.mockImplementation((id: number) => of(VARIJANTE[id]));
    api.odobri.mockImplementation((id: number) => of({ ...VARIJANTE[id], status: 'AKTIVNA' }));
    api.obrisiVarijantu.mockImplementation(() => of(undefined));
    TestBed.configureTestingModule({
      providers: [
        // editor varijante (odredište "Uredi") je ovde prazna stranica
        provideRouter([
          { path: 'banka', children: [...BANKA_RUTE.filter(r => !r.matcher || r.title !== 'Varijanta'), { path: 'varijante/:id', component: Druga }] },
          { path: '**', component: Druga },
        ], withComponentInputBinding()),
        { provide: BankaApi, useValue: api },
        { provide: ReferenceApi, useValue: referenca },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    vi.spyOn(TestBed.inject(MatIconRegistry), 'getNamedSvgIcon').mockReturnValue(of(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });

  it('prvi nacrt: napredak, putanja, naziv, izvor, serija, SVG zadatka i rešenja, odgovori; kopija sa originalom pored', async () => {
    const e = await otvori('/banka/pregled?predmet=1&serija=uvoz-kol1-2024');
    expect(api.pretraga).toHaveBeenCalledWith(
      { predmetId: 1, namena: null, q: null, status: 'NACRT', izvor: null, serija: 'uvoz-kol1-2024' }, { page: 0, size: 100 }, { tiho: true });
    expect(napredak()).toBe('1 / 3');
    expect(naslov()).toBe('Kol. 1, zad. 16');
    expect([...e.querySelectorAll('[data-nacrt] [data-putanja] li')].map(li => li.textContent!.trim())).toEqual(['Konverzije brojeva', '8 → 2 (Klod)']);
    expect(e.querySelector('[data-nacrt] [data-izvor]')!.textContent).toContain('Claude');
    expect(e.querySelector('[data-nacrt] [data-serija]')!.textContent).toContain('uvoz-kol1-2024');
    const slike = [...e.querySelectorAll<HTMLImageElement>('[data-nacrt] img')].map(i => [i.getAttribute('src'), i.alt]);
    expect(slike).toEqual([
      ['api/public/mediji/svg-16', 'Zadatak: Kol. 1, zad. 16'],
      ['api/public/mediji/svg-r-16', 'Rešenje: Kol. 1, zad. 16'],
    ]);
    expect(e.querySelector('[data-nacrt] app-odgovori-pregled')!.textContent).toContain('1111');
    expect(e.querySelector('[data-zamenjuje]')!.textContent!.trim()).toBe('Zamenjuje: 17 u binarni');
    const original = e.querySelector('[data-original]')!;
    expect(original.querySelector('img')!.getAttribute('src')).toBe('api/public/mediji/svg-15');
    expect(original.textContent).toContain('Aktivna');
  });

  it('bez originala: nema kolone originala ni oznake "Zamenjuje"', async () => {
    const e = await otvori('/banka/pregled?predmet=1&od=17');
    expect(naslov()).toBe('Kol. 1, zad. 17');
    expect(e.querySelector('[data-original]')).toBeNull();
    expect(e.querySelector('[data-zamenjuje]')).toBeNull();
  });

  it('`O` odobrava i prikazuje sledeći; dugmad rade isto', async () => {
    await otvori('/banka/pregled?predmet=1');
    await taster('o');
    expect(api.odobri).toHaveBeenCalledWith(16, { tiho: true });
    expect(napredak()).toBe('1 / 2');
    expect(naslov()).toBe('Kol. 1, zad. 17');

    el().querySelector<HTMLButtonElement>('[data-odobri]')!.click();
    await stabilno();
    expect(api.odobri).toHaveBeenLastCalledWith(17, { tiho: true });
    expect(naslov()).toBe('Kol. 1, zad. 18');
  });

  it('tasteri se ne obrađuju dok je fokus u polju ili uz Ctrl/Alt/Meta', async () => {
    const e = await otvori('/banka/pregled?predmet=1');
    const polje = document.createElement('input');
    const uredivo = document.createElement('div');
    uredivo.setAttribute('contenteditable', '');
    const unutra = document.createElement('span');
    uredivo.appendChild(unutra);
    e.append(polje, uredivo);
    for (const cilj of [polje, unutra]) {
      await taster('o', cilj);
      await taster('Delete', cilj);
      await taster('ArrowRight', cilj);
    }
    await taster('o', document, { ctrlKey: true });
    await taster('o', document, { altKey: true });
    await taster('o', document, { metaKey: true });
    expect(api.odobri).not.toHaveBeenCalled();
    expect(api.obrisiVarijantu).not.toHaveBeenCalled();
    expect(napredak()).toBe('1 / 3');
  });

  it('`Delete` za Klodov nacrt briše bez dijaloga', async () => {
    await otvori('/banka/pregled?predmet=1');
    const e = await taster('Delete');
    expect(e.defaultPrevented).toBe(true);
    expect(dijalog()).toBeNull();
    expect(api.obrisiVarijantu).toHaveBeenCalledWith(16, { tiho: true });
    expect(naslov()).toBe('Kol. 1, zad. 17');
  });

  it('`Delete` za ručnu varijantu pita; dok je dijalog otvoren tasteri ne pokreću drugu akciju', async () => {
    await otvori('/banka/pregled?predmet=1&od=18');
    expect(naslov()).toBe('Kol. 1, zad. 18');
    await taster('Delete');
    expect(dijalog()!.textContent).toContain('Obrisati varijantu „Kol. 1, zad. 18“?');
    await taster('Delete');
    await taster('o');
    await taster('ArrowLeft');
    expect(overlay().querySelectorAll('mat-dialog-container')).toHaveLength(1);
    expect(api.obrisiVarijantu).not.toHaveBeenCalled();
    expect(api.odobri).not.toHaveBeenCalled();
    expect(napredak()).toBe('3 / 3');

    dijalog()!.querySelector<HTMLButtonElement>('[data-potvrdi]')!.click();
    await stabilno();
    expect(api.obrisiVarijantu).toHaveBeenCalledOnce();
    expect(api.obrisiVarijantu).toHaveBeenCalledWith(18, { tiho: true });
  });

  it('`→` na poslednjem: "Nema više nacrta." sa vezom na banku; `←` vraća poslednji', async () => {
    const e = await otvori('/banka/pregled?predmet=1&od=18');
    await taster('ArrowRight');
    expect(e.textContent).toContain('Nema više nacrta.');
    expect(e.querySelector('[data-kraj] a[href="/banka?predmet=1"]')).not.toBeNull();
    expect(e.querySelector('[data-akcije]')).toBeNull();
    await taster('ArrowRight');
    expect(e.textContent).toContain('Nema više nacrta.');

    await taster('ArrowLeft');
    expect(naslov()).toBe('Kol. 1, zad. 18');
  });

  it('prazna lista: "Nema više nacrta.", a fokus se ne pomera', async () => {
    // odgovor stiže posle prvog crtanja (kao sa servera), pa stranica vidi prelaz u kraj bez radnje korisnika
    api.pretraga.mockImplementation(() => of({ content: [], page: { size: 100, number: 0, totalElements: 0, totalPages: 0 } }).pipe(delay(0)));
    const e = await otvori('/banka/pregled?predmet=1');
    expect(e.textContent).toContain('Nema više nacrta.');
    expect(api.varijanta).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });

  it('fokus: "Preskoči" na poslednjem (dugme nestaje) ide na vezu ka banci, "Nazad" iz kraja na traku', async () => {
    const e = await otvori('/banka/pregled?predmet=1&od=18');
    const preskoci = [...e.querySelectorAll<HTMLButtonElement>('[data-akcije] button')].find(b => b.textContent!.includes('Preskoči'))!;
    preskoci.focus();
    preskoci.click();
    await stabilno();
    expect(document.activeElement).toBe(e.querySelector('[data-kraj] [data-fokus-kraj]'));

    const nazad = e.querySelector<HTMLButtonElement>('[data-kraj] button')!;
    nazad.focus();
    nazad.click();
    await stabilno();
    expect(naslov()).toBe('Kol. 1, zad. 18');
    expect(document.activeElement).toBe(e.querySelector('[data-akcije] button'));
  });

  it('`U` i "Uredi": editor sa povratkom na pregled sa `od`', async () => {
    const e = await otvori('/banka/pregled?predmet=1&serija=uvoz-kol1-2024&od=17');
    const uredi = e.querySelector<HTMLAnchorElement>('a[data-uredi]')!;
    const ocekivano = '/banka/varijante/17?povratak=%2Fbanka%2Fpregled%3Fpredmet%3D1%26serija%3Duvoz-kol1-2024%26od%3D17';
    expect(uredi.getAttribute('href')).toBe(ocekivano);
    await taster('u');
    expect(router.url).toBe(ocekivano);
  });

  it('"Odbaci celu seriju": samo uz seriju; potvrda sa brojem Klodovih nacrta, pa POST', async () => {
    let e = await otvori('/banka/pregled?predmet=1');
    expect(e.querySelector('[data-odbaci-seriju]')).toBeNull();

    const info: PonistavanjeInfo = { potvrdjeno: true, obrisano: [{ vrsta: 'VARIJANTA', id: 16, naziv: null, razlog: null }], preskoceno: [] };
    api.odbaciSeriju.mockImplementation(() => of(info));
    e = await otvori('/banka/pregled?predmet=1&serija=uvoz-kol1-2024');
    e.querySelector<HTMLButtonElement>('[data-odbaci-seriju]')!.click();
    await stabilno();
    expect(dijalog()!.textContent).toContain('Odbaciti seriju „uvoz-kol1-2024“?');
    expect(dijalog()!.textContent).toContain('ovde ih je 2');
    expect(api.odbaciSeriju).not.toHaveBeenCalled();
    dijalog()!.querySelector<HTMLButtonElement>('[data-potvrdi]')!.click();
    await stabilno();
    expect(api.odbaciSeriju).toHaveBeenCalledWith('uvoz-kol1-2024', { tiho: true });
  });

  it('greška rendera: poruka umesto slike i Odobri onemogućeno', async () => {
    api.varijanta.mockImplementation((id: number) => of(varijanta(id, {
      renderStatus: 'GRESKA', svgId: null, resenjeSvgId: null, renderGreska: { linija: 3, poruka: 'Undefined control sequence \\foo' }, renderDeo: 'tekst',
    })));
    const e = await otvori('/banka/pregled?predmet=1');
    expect(e.querySelector('[data-nacrt]')!.textContent).toContain('linija 3: Undefined control sequence \\foo');
    expect(e.querySelector('[data-odobri]')!.getAttribute('aria-disabled')).toBe('true');
    await taster('o');
    expect(api.odobri).not.toHaveBeenCalled();
  });
});
