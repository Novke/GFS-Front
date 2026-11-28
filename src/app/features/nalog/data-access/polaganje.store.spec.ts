import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PolaganjeStore, PORUKA_NIJE_SACUVANO, PORUKA_PREDAJA_CEKA } from './polaganje.store';
import { PolaganjeStudenta, PoljeTesta, ZadatakTesta } from './testovi-studenta.models';
import { kljucKopije } from './testovi-studenta.pravila';

const URL = 'api/public/nalog/testovi/7';

function polje(kljuc: string, tip: 'BROJ' | 'TEKST'): PoljeTesta {
  return {
    kljuc, oznaka: kljuc, tip, odstupanje: null, odstupanjeTip: null, jedinica: null, zanemariVelicinu: null, zanemariRazmake: null,
    opcije: null, poeniPolja: 2,
  };
}

function zadatak(id: number, d: Partial<ZadatakTesta> = {}): ZadatakTesta {
  return {
    zadatakId: id, rb: id, naziv: `Zadatak ${id}`, maxPoena: 4, svgId: `svg-${id}`, rucno: false,
    polja: [polje('a', 'BROJ'), polje('b', 'TEKST')],
    uneto: null, rev: 0, sacuvano: null, ...d,
  };
}

function polaganje(d: Partial<PolaganjeStudenta> = {}): PolaganjeStudenta {
  return {
    testId: 7, naziv: 'Kolokvijum 1', predmet: 'Uvod', faza: 'U_TOKU', ime: 'Ana', prezime: 'Kovač', indeks: 'GD5', grupaTesta: 'A',
    rokMs: Date.now() + 60_000, serverVremeMs: Date.now(), maxPoena: 8, zadaci: [zadatak(1), zadatak(2)], predato: null, racunar: false,
    ...d,
  };
}

describe('PolaganjeStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof PolaganjeStore>;

  const ucitaj = (p = polaganje()) => {
    store.ucitaj(7);
    http.expectOne(URL).flush(p);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), PolaganjeStore] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(PolaganjeStore);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('čuva posle zadržavanja jednim PUT-om sa poslednjim unosom i rev-om', () => {
    ucitaj();
    store.unesi(1, 'a', '1');
    store.unesi(1, 'a', '12');
    expect(sessionStorage.getItem(kljucKopije(7, 1))).toBe('{"a":"12"}');
    vi.advanceTimersByTime(799);
    http.expectNone(`${URL}/zadaci/1`);
    vi.advanceTimersByTime(1);
    const r = http.expectOne(`${URL}/zadaci/1`);
    expect(r.request.method).toBe('PUT');
    expect(r.request.body).toEqual({ rev: 0, uneto: { a: '12' } });
    expect(store.zadaci()[1].status).toBe('cuva');
    r.flush({ rev: 1, sacuvano: '2026-12-09T10:41:07' });
    expect(store.zadaci()[1]).toMatchObject({ status: 'cisto', rev: 1, sacuvano: '2026-12-09T10:41:07' });
    expect(sessionStorage.getItem(kljucKopije(7, 1))).toBeNull();
  });

  it('kucanje dok je zahtev u letu: posle odgovora šalje novo uneto sa novim rev-om', () => {
    ucitaj();
    store.unesi(1, 'a', '1');
    vi.advanceTimersByTime(800);
    const prvi = http.expectOne(`${URL}/zadaci/1`);
    store.unesi(1, 'b', 'm');
    vi.advanceTimersByTime(800);
    http.expectNone(`${URL}/zadaci/1`); // jedan u letu po zadatku
    prvi.flush({ rev: 1, sacuvano: '2026-12-09T10:41:07' });
    expect(store.zadaci()[1].status).toBe('ceka');
    vi.advanceTimersByTime(0);
    const drugi = http.expectOne(`${URL}/zadaci/1`);
    expect(drugi.request.body).toEqual({ rev: 1, uneto: { a: '1', b: 'm' } });
    drugi.flush({ rev: 2, sacuvano: '2026-12-09T10:41:09' });
    expect(store.zadaci()[1].status).toBe('cisto');
  });

  it('429 i prekid mreže: vrednosti ostaju, poruka, pa ponovo posle 2 s i 4 s', () => {
    ucitaj();
    store.unesi(2, 'a', '5');
    vi.advanceTimersByTime(800);
    http.expectOne(`${URL}/zadaci/2`).flush({ reason: 'Previše zahteva.' }, { status: 429, statusText: 'Too Many' });
    expect(store.zadaci()[2]).toMatchObject({ status: 'greska', poruka: PORUKA_NIJE_SACUVANO, uneto: { a: '5' } });
    expect(store.imaGresku()).toBe(true);
    expect(sessionStorage.getItem(kljucKopije(7, 2))).toBe('{"a":"5"}');
    vi.advanceTimersByTime(1_999);
    http.expectNone(`${URL}/zadaci/2`);
    vi.advanceTimersByTime(1);
    http.expectOne(`${URL}/zadaci/2`).error(new ProgressEvent('error'));
    expect(store.zadaci()[2].uneto).toEqual({ a: '5' });
    vi.advanceTimersByTime(4_000);
    const r = http.expectOne(`${URL}/zadaci/2`);
    expect(r.request.body).toEqual({ rev: 0, uneto: { a: '5' } });
    r.flush({ rev: 1, sacuvano: '2026-12-09T10:42:00' });
    expect(store.zadaci()[2]).toMatchObject({ status: 'cisto', poruka: null });
    expect(store.imaGresku()).toBe(false);
  });

  it('409 Zastarela izmena: pročita stanje i ponovo pošalje svoje vrednosti sa rev-om servera', () => {
    ucitaj();
    store.unesi(1, 'a', '42');
    vi.advanceTimersByTime(800);
    http.expectOne(`${URL}/zadaci/1`).flush({ reason: 'Zastarela izmena.' }, { status: 409, statusText: 'Conflict' });
    // server ima noviji rev (i tuđu vrednost), ali student je poslednji kucao: šalje se njegovo
    http.expectOne(URL).flush(polaganje({ zadaci: [zadatak(1, { rev: 5, uneto: { a: '7' } }), zadatak(2)] }));
    expect(store.zadaci()[1].uneto).toEqual({ a: '42' });
    const r = http.expectOne(`${URL}/zadaci/1`);
    expect(r.request.body).toEqual({ rev: 5, uneto: { a: '42' } });
    r.flush({ rev: 6, sacuvano: '2026-12-09T10:41:07' });
    expect(store.zadaci()[1]).toMatchObject({ status: 'cisto', rev: 6, uneto: { a: '42' } });
  });

  it('409 drugi uređaj: zaključano, ništa se ne briše; „Nastavi ovde“ preuzima i šalje neposlato', async () => {
    ucitaj();
    store.unesi(1, 'a', '3');
    vi.advanceTimersByTime(800);
    http.expectOne(`${URL}/zadaci/1`).flush({ reason: 'Test je otvoren na drugom uređaju.' }, { status: 409, statusText: 'Conflict' });
    expect(store.zakljucano()).toBe(true);
    expect(store.zadaci()[1].uneto).toEqual({ a: '3' });
    vi.advanceTimersByTime(30_000);
    http.expectNone(`${URL}/zadaci/1`);
    const p = store.udji(null, true);
    const ulaz = http.expectOne(`${URL}/ulaz`);
    expect(ulaz.request.body).toEqual({ kod: null, preuzmi: true });
    ulaz.flush(polaganje({ zadaci: [zadatak(1, { rev: 2 }), zadatak(2)] }));
    expect(await p).toBeNull();
    expect(store.zakljucano()).toBe(false);
    vi.advanceTimersByTime(0);
    const r = http.expectOne(`${URL}/zadaci/1`);
    expect(r.request.body).toEqual({ rev: 2, uneto: { a: '3' } });
    r.flush({ rev: 3, sacuvano: '2026-12-09T10:45:00' });
  });

  it('posle ponovnog učitavanja strane kopija iz sessionStorage ima prednost i odmah se šalje', () => {
    sessionStorage.setItem(kljucKopije(7, 2), JSON.stringify({ a: '9', b: 'x' }));
    sessionStorage.setItem(kljucKopije(7, 1), JSON.stringify({ a: '1' }));
    ucitaj(polaganje({ zadaci: [zadatak(1, { uneto: { a: '1' }, rev: 1 }), zadatak(2, { uneto: { a: '9' }, rev: 3 })] }));
    expect(store.zadaci()[1].status).toBe('cisto'); // ista kao server: kopija se briše
    expect(sessionStorage.getItem(kljucKopije(7, 1))).toBeNull();
    expect(store.zadaci()[2]).toMatchObject({ status: 'ceka', uneto: { a: '9', b: 'x' } });
    vi.advanceTimersByTime(0);
    const r = http.expectOne(`${URL}/zadaci/2`);
    expect(r.request.body).toEqual({ rev: 3, uneto: { a: '9', b: 'x' } });
    r.flush({ rev: 4, sacuvano: '2026-12-09T10:41:07' });
  });

  it('Predaj prvo sačuva sve što čeka, pa predaje', async () => {
    ucitaj();
    store.unesi(1, 'a', '1');
    expect(store.prazno()).toBe(3);
    const p = store.predaj();
    const r = http.expectOne(`${URL}/zadaci/1`); // bez čekanja na zadržavanje
    r.flush({ rev: 1, sacuvano: '2026-12-09T10:43:00' });
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne(`${URL}/predaj`).flush(polaganje({ faza: 'PREDATO', predato: '2026-12-09T10:43:01', zadaci: [zadatak(1, { uneto: { a: '1' }, rev: 1 }), zadatak(2)] }));
    expect(await p).toBeNull();
    expect(store.faza()).toBe('PREDATO');
  });

  it('Predaj odbija dok čuvanje ne uspe (vrednosti ostaju)', async () => {
    ucitaj();
    store.unesi(1, 'a', '1');
    const p = store.predaj();
    http.expectOne(`${URL}/zadaci/1`).error(new ProgressEvent('error'));
    expect(await p).toBe(PORUKA_PREDAJA_CEKA);
    http.expectNone(`${URL}/predaj`);
    expect(store.zadaci()[1].uneto).toEqual({ a: '1' });
    // ponovni pokušaj i dalje radi
    vi.advanceTimersByTime(2_000);
    http.expectOne(`${URL}/zadaci/1`).flush({ rev: 1, sacuvano: '2026-12-09T10:43:00' });
  });

  it('409 Vreme je isteklo: ponovo učita stanje; 401: odjavljen', () => {
    ucitaj();
    store.unesi(1, 'a', '1');
    vi.advanceTimersByTime(800);
    http.expectOne(`${URL}/zadaci/1`).flush({ reason: 'Vreme je isteklo.' }, { status: 409, statusText: 'Conflict' });
    expect(store.zadaci()[1].poruka).toBe('Vreme je isteklo.');
    http.expectOne(URL).flush(polaganje({ faza: 'ZAVRSEN' }));
    expect(store.faza()).toBe('ZAVRSEN');
    expect(sessionStorage.getItem(kljucKopije(7, 1))).toBeNull();
    store.unesi(1, 'a', '2'); // posle kraja se ništa ne menja
    vi.advanceTimersByTime(800);
    http.expectNone(`${URL}/zadaci/1`);

    store.ucitaj(7);
    http.expectOne(URL).flush({ reason: 'Potrebna je prijava.' }, { status: 401, statusText: 'Unauthorized' });
    expect(store.odjavljen()).toBe(true);
  });

  it('pomak sata iz serverVremeMs', () => {
    ucitaj(polaganje({ serverVremeMs: Date.now() + 5_000 }));
    expect(store.pomak()).toBe(5_000);
  });
});
