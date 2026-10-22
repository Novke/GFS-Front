import { OverlayContainer } from '@angular/cdk/overlay';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KodZaDiktiranjeApi } from '../api/kod-za-diktiranje.api';
import { ObavestenjeInfo } from '../api/obavestenja.api';
import { ObavestenjaStore } from '../state/obavestenja.store';
import { ObavestenjaPanel } from './obavestenja-panel';

@Component({ template: '' })
class Prazna {}

const obavestenje = (id: number, izmene: Partial<ObavestenjeInfo> = {}): ObavestenjeInfo => ({
  id, vrsta: 'NE_STIZE_KOD', studentId: 4, studentIme: 'Ana Primerović', indeks: 'GD1/2025', podaci: { imaMejl: true },
  kreirano: '2026-10-19T10:05:00', procitano: null, reseno: null, ...izmene,
});

const STAVKE: ObavestenjeInfo[] = [
  obavestenje(1, { podaci: { imaMejl: false, uredjaj: 'NEPOZNAT' } }),
  obavestenje(2, { studentId: null, studentIme: null, indeks: 'XX9/2025' }),
  obavestenje(3, { vrsta: 'PREVISE_KODOVA', studentId: 7, studentIme: 'Bojan Izmišljenović', procitano: '2026-10-19T11:00:00' }),
];

describe('ObavestenjaPanel (lista obaveštenja)', () => {
  let overlay: HTMLElement;
  let dialog: MatDialog;
  let router: Router;
  let izdaj: ReturnType<typeof vi.fn>;
  let stanje: {
    broj: ReturnType<typeof signal<{ neprocitana: number; otvorena: number }>>;
    otvorena: ReturnType<typeof signal<ObavestenjeInfo[]>>;
    status: ReturnType<typeof signal<string>>;
    greska: ReturnType<typeof signal<string | null>>;
    ucitaj: ReturnType<typeof vi.fn>;
    procitano: ReturnType<typeof vi.fn>;
    reseno: ReturnType<typeof vi.fn>;
    procitajSve: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    izdaj = vi.fn(() => of({ kod: '123456', istice: '2026-10-22T09:10:00', indeks: 'GD1', godina: 2025, upozorenje: null }));
    stanje = {
      broj: signal({ neprocitana: 2, otvorena: 3 }),
      otvorena: signal(STAVKE),
      status: signal('loaded'),
      greska: signal(null),
      ucitaj: vi.fn(),
      procitano: vi.fn(),
      reseno: vi.fn(),
      procitajSve: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'studenti/:id', component: Prazna }]),
        { provide: ObavestenjaStore, useValue: stanje },
        { provide: KodZaDiktiranjeApi, useValue: { izdaj } },
      ],
    });
    dialog = TestBed.inject(MatDialog);
    router = TestBed.inject(Router);
    overlay = TestBed.inject(OverlayContainer).getContainerElement();
  });

  afterEach(() => dialog.closeAll());

  const tick = () => new Promise(r => setTimeout(r));
  const stavka = (id: number) => overlay.querySelector(`[data-obavestenje="${id}"]`) as HTMLElement;

  async function otvori() {
    const okidac = document.createElement('button');
    document.body.appendChild(okidac);
    const ref = ObavestenjaPanel.otvori(dialog, okidac);
    await tick();
    return ref;
  }

  it('pri otvaranju učitava listu; naslov je ime dijaloga', async () => {
    await otvori();
    expect(stanje.ucitaj).toHaveBeenCalledOnce();
    const kontejner = overlay.querySelector('mat-dialog-container')!;
    const naslov = overlay.querySelector('h2')!;
    expect(naslov.textContent?.trim()).toBe('Obaveštenja');
    expect(kontejner.getAttribute('aria-labelledby')).toBe(naslov.id);
  });

  it('stavke: tačan tekst, nepročitane označene, veza na karticu studenta samo kad student postoji', async () => {
    await otvori();
    expect(stavka(1).textContent).toContain('Ne stiže kod: Ana Primerović · nema mejl · nepoznat uređaj');
    expect(stavka(2).textContent).toContain('Ne stiže kod: XX9/2025');
    expect(stavka(3).textContent).toContain('Previše zahteva za kod: Bojan Izmišljenović');
    expect(stavka(1).textContent).toContain('19. 10. 2026. 10:05');
    expect(stavka(1).classList).toContain('neprocitano');
    expect(stavka(3).classList).not.toContain('neprocitano');
    expect(stavka(1).querySelector('a')!.getAttribute('href')).toBe('/studenti/4');
    expect(stavka(3).querySelector('a')!.getAttribute('href')).toBe('/studenti/7');
    expect(stavka(2).querySelector('a')).toBeNull();
  });

  it('klik na stavku: označi pročitano, zatvori panel i otvori karticu studenta', async () => {
    const ref = await otvori();
    const zatvori = vi.spyOn(ref, 'close');
    stavka(1).querySelector('a')!.click();
    await vi.waitFor(() => expect(router.url).toBe('/studenti/4'));
    expect(stanje.procitano).toHaveBeenCalledExactlyOnceWith(1);
    expect(zatvori).toHaveBeenCalled();
  });

  it('klik na već pročitanu stavku ne šalje "pročitano"', async () => {
    await otvori();
    stavka(3).querySelector('a')!.click();
    await vi.waitFor(() => expect(router.url).toBe('/studenti/7'));
    expect(stanje.procitano).not.toHaveBeenCalled();
  });

  it('stavka bez studenta ostaje (bez navigacije), ali se može označiti pročitanom i rešenom', async () => {
    await otvori();
    const procitano = stavka(2).querySelector<HTMLButtonElement>('[data-procitano]')!;
    expect(procitano.getAttribute('aria-label')).toBe('Označi kao pročitano: Ne stiže kod: XX9/2025');
    procitano.click();
    expect(stanje.procitano).toHaveBeenCalledExactlyOnceWith(2);
    stavka(2).querySelector<HTMLButtonElement>('[data-reseno]')!.click();
    expect(stanje.reseno).toHaveBeenCalledExactlyOnceWith(2);
    expect(router.url).toBe('/');
    expect(overlay.querySelector('mat-dialog-container')).not.toBeNull();
    // pročitana stavka nema dugme "Pročitano"
    expect(stavka(3).querySelector('[data-procitano]')).toBeNull();
  });

  it('"Kod za diktiranje" samo uz studenta: izdaje kod, prikazuje ga u dijalogu i osvežava listu', async () => {
    await otvori();
    expect(stavka(2).querySelector('[data-kod-za-diktiranje]')).toBeNull();
    stavka(1).querySelector<HTMLButtonElement>('[data-kod-za-diktiranje]')!.click();
    await tick();
    expect(izdaj).toHaveBeenCalledWith(4);
    const dijalog = overlay.querySelector('app-kod-za-diktiranje-dialog')!;
    expect(dijalog.querySelector('[data-kod]')?.textContent?.trim()).toBe('123 456');
    expect(dijalog.textContent).toContain('Važi do 09:10');
    expect(stanje.ucitaj).toHaveBeenCalledTimes(2); // otvaranje panela + posle izdavanja
  });

  it('"Označi sve kao pročitano" zove procitajSve; isključeno kad nema nepročitanih', async () => {
    await otvori();
    const sve = overlay.querySelector<HTMLButtonElement>('[data-procitaj-sve]')!;
    expect(sve.textContent?.trim()).toBe('Označi sve kao pročitano');
    expect(sve.disabled).toBe(false);
    sve.click();
    expect(stanje.procitajSve).toHaveBeenCalledOnce();
    stanje.broj.set({ neprocitana: 0, otvorena: 3 });
    await tick();
    expect(sve.disabled).toBe(true);
  });

  it('više otvorenih nego prikazanih: "+N još"', async () => {
    stanje.broj.set({ neprocitana: 2, otvorena: 14 });
    await otvori();
    expect(overlay.querySelector('[data-jos]')?.textContent).toContain('+11 još');
  });

  it('prazno, učitavanje i greška sa "Pokušaj ponovo"', async () => {
    stanje.otvorena.set([]);
    stanje.status.set('loading');
    await otvori();
    expect(overlay.textContent).toContain('Učitavanje');
    stanje.status.set('loaded');
    await tick();
    expect(overlay.querySelector('[data-prazno]')?.textContent?.trim()).toBe('Nema otvorenih obaveštenja.');
    stanje.status.set('error');
    stanje.greska.set('Nema veze sa serverom.');
    await tick();
    expect(overlay.querySelector('[role=alert]')?.textContent).toContain('Nema veze sa serverom.');
    overlay.querySelector<HTMLButtonElement>('[data-ponovo]')!.click();
    expect(stanje.ucitaj).toHaveBeenCalledTimes(2);
  });
});
