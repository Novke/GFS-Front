import { OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { IKONE } from '../../../core/layout/icons';
import { AnketeSabloniInfo } from '../data-access/ankete.models';
import { anketa, sablon } from '../data-access/ankete.testing';
import { KontekstAnkete, otvoriAnketu } from './otvori-anketu';

const K: KontekstAnkete = { predavanjeId: 5, grupaId: 4, grupaNaziv: 'GD-2026', predmetNaziv: 'UPR', brojCekiranih: 27 };
const INFO: AnketeSabloniInfo = {
  folderi: [{ id: 1, naziv: 'Tok časa', rb: 0, brojSablona: 2 }],
  sabloni: [
    sablon(10, { precica: true, precicaRb: 0, pokreniOdmah: true, kratakNaziv: 'Pauza?', ikonica: '☕', boja: 'PLAVA', folderId: 1,
      pitanje: 'Da li vam treba pauza?', opcije: ['Da, 10 min', 'Da, 15 min', 'Ne'] }),
    sablon(11, { precica: true, precicaRb: 1, publika: 'GRUPA', kratakNaziv: 'Kolokvijum', boja: 'VISNJA', opcije: ['Opcija 1', 'Opcija 2'] }),
    sablon(12, { folderId: 1, pitanje: 'Da ponovim ovaj deo?' }),
  ],
};

describe('AnketaPanelDialog', () => {
  let http: HttpTestingController;
  let dialog: MatDialog;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    dialog = TestBed.inject(MatDialog);
    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    for (const ime of IKONE) {
      registry.addSvgIconLiteral(ime, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
    }
  });

  afterEach(() => {
    dialog.closeAll();
    http.verify();
  });

  const overlay = () => TestBed.inject(OverlayContainer).getContainerElement();
  const tick = () => new Promise(r => setTimeout(r));
  const crtaj = async () => {
    TestBed.inject(ApplicationRef).tick();
    await tick();
  };
  const taster = (key: string, target: EventTarget = document.body) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  async function otvori(aktivne = [] as ReturnType<typeof anketa>[]) {
    await otvoriAnketu(dialog, signal(K));
    await tick();
    http.expectOne('api/ankete/sabloni').flush(INFO);
    http.expectOne(r => r.url === 'api/ankete/aktivne').flush(aktivne);
    await crtaj();
  }

  it('početni ekran: kontekst, prečice sa natpisom i opisom, folderi i istorija', async () => {
    await otvori();
    const o = overlay();
    expect(o.querySelector('.ap-pod')?.textContent).toContain('UPR · GD-2026 · 27 čekiranih');
    const plocice = [...o.querySelectorAll('[data-precica]')];
    expect(plocice.map(p => p.querySelector('.pe-natpis')?.textContent?.trim())).toEqual(['Pauza?', 'Kolokvijum']);
    expect(plocice[1].querySelector('.pe-opis')?.textContent).toContain('cela grupa');
    expect(o.querySelector('[data-folder]')?.textContent).toContain('Tok časa');
    expect(o.querySelector('[data-folder] .pe-broj')?.textContent?.trim()).toBe('2');
    expect(o.querySelector('[data-anketa-istorija]')).not.toBeNull();
  });

  it('taster 1 pokreće prečicu odmah, rezultati se vide; R pokazuje rezultat, Enter zatvara', async () => {
    await otvori();
    taster('1');
    const post = http.expectOne(r => r.method === 'POST' && r.url === 'api/ankete');
    expect(post.request.body).toMatchObject({ sablonId: 10, predavanjeId: 5, publika: 'NA_CASU' });
    post.flush(anketa(20, { sablonId: 10, glasovi: [14, 6, 3], brojGlasalo: 23 }));
    http.expectOne('api/ankete/sabloni').flush(INFO);
    await crtaj();
    const o = overlay();
    expect(o.querySelector('#anketa-desno-naslov')?.textContent).toContain('Da li vam treba pauza?');
    expect(o.querySelector('[data-anketa-glasalo]')?.textContent?.trim()).toBe('23 / 27 glasalo');
    expect(o.querySelector('.re-ostatak')?.textContent).toContain('Još nije glasalo: 4.');
    const trake = [...o.querySelectorAll('[data-traka-ankete]')];
    expect(trake.map(t => t.hasAttribute('data-pobednik'))).toEqual([true, false, false]);
    expect(o.querySelector('[data-anketa-vidljivost]')?.textContent).toContain('samo ti');

    taster('r');
    const rez = http.expectOne('api/ankete/20/rezultat');
    expect(rez.request.body).toEqual({ prikazan: true });
    rez.flush(anketa(20, { sablonId: 10, rezultatPrikazan: true }));
    await crtaj();
    expect(o.querySelector('[data-anketa-vidljivost]')?.textContent).toContain('studenti i projektor');

    taster('Enter');
    http.expectOne(r => r.method === 'POST' && r.url === 'api/ankete/20/zatvori').flush(anketa(20, { sablonId: 10, otvorena: false }));
    await crtaj();
    expect(o.querySelector('[data-anketa-zatvori]')).toBeNull();
    expect(o.querySelector('[data-anketa-ponovo]')).not.toBeNull();
    // anketa iz šablona nema "★ Sačuvaj"
    expect(o.querySelector('[data-anketa-sacuvaj-precicu]')).toBeNull();
  });

  it('tasteri se ne pale dok se kuca u polje', async () => {
    await otvori();
    const pretraga = overlay().querySelector<HTMLInputElement>('[data-anketa-pretraga]')!;
    taster('1', pretraga);
    http.expectNone(r => r.url === 'api/ankete' && r.method === 'POST');
  });

  it('prečica sa mestima za upis otvara proveru; prazni odgovori se ne šalju', async () => {
    await otvori();
    (overlay().querySelectorAll<HTMLButtonElement>('[data-precica]')[1]).click();
    await crtaj();
    const o = overlay();
    expect(o.querySelector('#anketa-desno-naslov')?.textContent).toContain('Pokreni anketu');
    const odgovori = [...o.querySelectorAll<HTMLInputElement>('[data-anketa-odgovor] input')];
    expect(odgovori.map(i => i.value)).toEqual(['', '']);
    expect(o.querySelector('[data-publika-grupa]')?.classList).toContain('mat-button-toggle-checked');
    o.querySelector<HTMLButtonElement>('[data-anketa-pokreni]')!.click();
    await crtaj();
    expect(o.querySelector('[data-anketa-provera-greska]')?.textContent).toContain('Potrebna su bar dva odgovora.');

    odgovori[0].value = 'Sreda 3.12.';
    odgovori[0].dispatchEvent(new Event('input'));
    odgovori[1].value = 'Petak 5.12.';
    odgovori[1].dispatchEvent(new Event('input'));
    o.querySelector<HTMLButtonElement>('[data-anketa-pokreni]')!.click();
    await crtaj();
    const post = http.expectOne(r => r.method === 'POST' && r.url === 'api/ankete');
    expect(post.request.body).toMatchObject({ sablonId: 11, publika: 'GRUPA', grupaId: 4, opcije: ['Sreda 3.12.', 'Petak 5.12.'] });
    expect(post.request.body.rok).toMatch(/T20:00:00$/);
    post.flush(anketa(21, { sablonId: 11, publika: 'GRUPA' }));
    http.expectOne('api/ankete/sabloni').flush(INFO);
  });

  it('otvorena anketa konteksta se vidi odmah, a bez šablona nudi "★ Sačuvaj"', async () => {
    await otvori([anketa(4, { glasovi: [1, 0, 0], brojGlasalo: 1 })]);
    const o = overlay();
    expect(o.querySelector('[data-anketa-sacuvaj-precicu]')).not.toBeNull();
    expect(o.querySelector('[data-anketa-zatvori]')).not.toBeNull();
    // telefon (jsdom nema matchMedia): jedna kolona, strelica nazad vraća na početni sa trakom prikazane ankete
    o.querySelector<HTMLButtonElement>('[data-anketa-nazad]')!.click();
    await crtaj();
    expect(o.querySelector('[data-anketa-prikazana]')?.textContent).toContain('Otvorena anketa');
  });

  it('istorija: lista sa ishodom, klik otvara rezultate', async () => {
    await otvori();
    overlay().querySelector<HTMLButtonElement>('[data-anketa-istorija]')!.click();
    http.expectOne(r => r.url === 'api/ankete' && r.method === 'GET').flush({
      content: [{ id: 9, pitanje: 'Tempo?', publika: 'NA_CASU', otvoreno: '2026-11-24T10:40:00', zatvoreno: '2026-11-24T10:41:00',
        otvorena: false, brojGlasalo: 20, brojMogucih: 25, pobednik: 'Taman', predmetNaziv: 'UPR', grupaNaziv: 'GD-2026' }],
      page: { size: 20, number: 0, totalElements: 1, totalPages: 1 },
    });
    await crtaj();
    const red = overlay().querySelector('[data-istorija-red]')!;
    expect(red.textContent).toContain('Taman · 20 / 25 glasalo');
    expect(red.textContent).toContain('na času · UPR · GD-2026 · 24.11. u 10:40');
    red.querySelector<HTMLButtonElement>('.ie-glavno')!.click();
    http.expectOne('api/ankete/9').flush(anketa(9, { otvorena: false, pitanje: 'Tempo?' }));
    await crtaj();
    expect(overlay().querySelector('#anketa-desno-naslov')?.textContent).toContain('Tempo?');
  });
});
