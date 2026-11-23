import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnketePanelStore } from './ankete-panel.store';
import { AnketeSabloniInfo, KontekstAnkete } from './ankete.models';
import { OSVEZAVANJE_ANKETE_MS, PORUKA_BEZ_PREDAVANJA } from './ankete.pravila';
import { anketa, sablon } from './ankete.testing';

const K: KontekstAnkete = { predavanjeId: 5, grupaId: 4, grupaNaziv: 'GD-2026', predmetNaziv: 'UPR', brojCekiranih: 27 };

const INFO: AnketeSabloniInfo = {
  folderi: [{ id: 1, naziv: 'Tok časa', rb: 0, brojSablona: 1 }],
  sabloni: [
    sablon(10, { precica: true, precicaRb: 0, pokreniOdmah: true, trajanjeSekunde: 60, kratakNaziv: 'Pauza?', folderId: 1, boja: 'PLAVA' }),
    sablon(11, { precica: true, precicaRb: 1, publika: 'GRUPA', rokSati: 24, kratakNaziv: 'Kolokvijum', boja: 'ZELENA' }),
  ],
};

describe('AnketePanelStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof AnketePanelStore>;
  let vidljivost: DocumentVisibilityState;

  beforeEach(() => {
    vi.useFakeTimers();
    vidljivost = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vidljivost });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), AnketePanelStore] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AnketePanelStore);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    delete (document as unknown as Record<string, unknown>)['visibilityState'];
  });

  function otvori(k: KontekstAnkete = K, aktivne = [] as ReturnType<typeof anketa>[]) {
    store.init(signal(k));
    http.expectOne('api/ankete/sabloni').flush(INFO);
    if (k.predavanjeId !== null || k.grupaId !== null) {
      const z = http.expectOne(r => r.url === 'api/ankete/aktivne');
      expect(z.request.params.get('predavanjeId')).toBe(k.predavanjeId === null ? null : String(k.predavanjeId));
      z.flush(aktivne);
    }
  }

  it('otvaranje: šabloni, prečice redom, a otvorena anketa konteksta odmah na rezultatima', () => {
    otvori(K, [anketa(3, { otvorena: false, rezultatPrikazan: true }), anketa(4)]);
    expect(store.precice().map(s => s.id)).toEqual([10, 11]);
    expect(store.anketa()?.id).toBe(4);
    expect(store.desno()).toEqual({ ekran: 'rezultati' });
    expect(store.brojPoFolderu().get(1)).toBe(1);
    expect(store.bezFoldera()).toBe(1);
  });

  it('prečica "pokreni odmah": POST ankete sa podacima šablona i predavanjem, pa rezultati', () => {
    otvori();
    store.dodir(store.precice()[0]);
    const z = http.expectOne(r => r.method === 'POST' && r.url === 'api/ankete');
    expect(z.request.body).toEqual({
      sablonId: 10, pitanje: 'Pitanje 10?', opcije: ['Da', 'Ne'], viseOdgovora: false, publika: 'NA_CASU', predavanjeId: 5, grupaId: null,
      trajanjeSekunde: 60, rok: null,
    });
    z.flush(anketa(20, { sablonId: 10 }));
    expect(store.desno()).toEqual({ ekran: 'rezultati' });
    expect(store.anketa()?.id).toBe(20);
    http.expectOne('api/ankete/sabloni').flush(INFO); // broj pokretanja
  });

  it('prečica bez "pokreni odmah" otvara proveru; bez publike poruka umesto pokretanja', () => {
    otvori();
    store.precicaPoRedu(1);
    const d = store.desno();
    expect(d?.ekran).toBe('provera');
    expect(d?.ekran === 'provera' && d.nacrt.publika).toBe('GRUPA');
    store.precicaPoRedu(7); // nema osme prečice: ništa
    expect(store.desno()?.ekran).toBe('provera');
    store.zatvoriDesno();
    http.verify();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), AnketePanelStore] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AnketePanelStore);
    otvori({ predavanjeId: null, grupaId: null, grupaNaziv: null, predmetNaziv: null, brojCekiranih: null });
    store.dodir(store.precice()[0]);
    expect(store.poruka()).toBe(PORUKA_BEZ_PREDAVANJA);
    expect(store.desno()).toBeNull();
  });

  it('"Sačuvaj kao prečicu" uz pokretanje: prvo šablon, pa anketa iz njega', () => {
    otvori();
    store.nova();
    const d = store.desno();
    if (d?.ekran !== 'provera') throw new Error('provera');
    store.pokreni({ ...d.nacrt, pitanje: 'Još jedan zadatak?', opcije: ['Danas', 'Sledeći put'] }, { sacuvaj: true, folderId: null, precica: true });
    const s = http.expectOne(r => r.method === 'POST' && r.url === 'api/ankete/sabloni');
    expect(s.request.body).toMatchObject({ pitanje: 'Još jedan zadatak?', precica: true, boja: 'LJUBICASTA', kratakNaziv: 'Još jedan zadatak?' });
    s.flush(sablon(30, { precica: true }));
    const a = http.expectOne(r => r.method === 'POST' && r.url === 'api/ankete');
    expect(a.request.body.sablonId).toBe(30);
    a.flush(anketa(31, { sablonId: 30 }));
    http.expectOne('api/ankete/sabloni').flush(INFO);
    expect(store.anketa()?.id).toBe(31);
  });

  it('otvorena anketa se osvežava na 2 s, ne dok je stranica skrivena ni dok upit čeka; zatvorena ne', async () => {
    otvori(K, [anketa(4)]);
    await vi.advanceTimersByTimeAsync(OSVEZAVANJE_ANKETE_MS);
    const prvi = http.expectOne('api/ankete/4');
    await vi.advanceTimersByTimeAsync(OSVEZAVANJE_ANKETE_MS);
    http.expectNone('api/ankete/4'); // prvi još čeka
    prvi.flush(anketa(4, { glasovi: [3, 1, 0], brojGlasalo: 4 }));
    expect(store.anketa()?.brojGlasalo).toBe(4);

    vidljivost = 'hidden';
    await vi.advanceTimersByTimeAsync(OSVEZAVANJE_ANKETE_MS);
    http.expectNone('api/ankete/4');
    vidljivost = 'visible';

    await vi.advanceTimersByTimeAsync(OSVEZAVANJE_ANKETE_MS);
    http.expectOne('api/ankete/4').flush(anketa(4, { otvorena: false }));
    await vi.advanceTimersByTimeAsync(OSVEZAVANJE_ANKETE_MS * 3);
    http.expectNone('api/ankete/4');
  });

  it('zatvori i pokaži rezultat; greška ide u traku panela', () => {
    otvori(K, [anketa(4)]);
    store.prebaciRezultat();
    const r = http.expectOne('api/ankete/4/rezultat');
    expect(r.request.method).toBe('PUT');
    expect(r.request.body).toEqual({ prikazan: true });
    r.flush(anketa(4, { rezultatPrikazan: true }));
    expect(store.anketa()?.rezultatPrikazan).toBe(true);

    store.zatvoriAnketu();
    http.expectOne('api/ankete/4/zatvori').flush({ status: 409, reason: 'Anketa je zatvorena.' }, { status: 409, statusText: 'Conflict' });
    expect(store.poruka()).toBe('Anketa je zatvorena.');
    expect(store.radi()).toBe(false);
  });

  it('"★ Sačuvaj" za anketu bez šablona pravi prečicu i dugme nestaje', () => {
    otvori(K, [anketa(4, { rok: '2026-11-24T10:41:00' })]);
    store.sacuvajKaoPrecicu();
    const z = http.expectOne(r => r.method === 'POST' && r.url === 'api/ankete/sabloni');
    expect(z.request.body).toMatchObject({ precica: true, boja: 'LJUBICASTA', trajanjeSekunde: 60, pokreniOdmah: true });
    z.flush(sablon(40, { precica: true }));
    http.expectOne('api/ankete/sabloni').flush(INFO);
    expect(store.sacuvanaKaoPrecica()).toBe(true);
  });

  it('istorija: strana 0 pri svakom otvaranju, "Još" dodaje, brisanje sklanja red', () => {
    otvori();
    const strana = (n: number, ids: number[], ukupno: number) => ({
      content: ids.map(id => ({ id, pitanje: `P${id}`, publika: 'NA_CASU', otvoreno: '2026-11-24T10:00:00', zatvoreno: null, otvorena: false,
        brojGlasalo: 1, brojMogucih: 2, pobednik: 'Da', predmetNaziv: null, grupaNaziv: null })),
      page: { size: 20, number: n, totalElements: ukupno, totalPages: Math.ceil(ukupno / 20) },
    });
    store.otvoriLevo({ ekran: 'istorija' });
    const z = http.expectOne(r => r.url === 'api/ankete' && r.method === 'GET');
    expect(z.request.params.get('page')).toBe('0');
    z.flush(strana(0, [5, 4], 22));
    expect(store.istorijaIma()).toBe(true);
    store.ucitajIstoriju(true);
    http.expectOne(r => r.url === 'api/ankete' && r.params.get('page') === '1').flush(strana(1, [3], 22));
    expect(store.istorija().map(a => a.id)).toEqual([5, 4, 3]);
    expect(store.istorijaIma()).toBe(false);
    store.obrisiIzIstorije(4);
    http.expectOne(r => r.method === 'DELETE' && r.url === 'api/ankete/4').flush(null, { status: 204, statusText: 'No Content' });
    expect(store.istorija().map(a => a.id)).toEqual([5, 3]);
  });

  it('uređivanje prečica: redosled, uklanjanje i izmena izgleda', () => {
    otvori();
    store.poredjajPrecice([11, 10]);
    const r = http.expectOne('api/ankete/precice');
    expect(r.request.body).toEqual({ ids: [11, 10] });
    r.flush(INFO);
    store.ukloniSaPrecica(store.precice()[0]);
    http.expectOne('api/ankete/precice').flush(INFO);
    store.izmeniPrecicu(store.precice()[0], { boja: 'OKER' });
    const p = http.expectOne('api/ankete/sabloni/10');
    expect(p.request.method).toBe('PUT');
    expect(p.request.body).toMatchObject({ boja: 'OKER', kratakNaziv: 'Pauza?', precica: true, folderId: 1 });
    p.flush({ ...INFO.sabloni[0], boja: 'OKER' });
    expect(store.precice()[0].boja).toBe('OKER');
  });
});
