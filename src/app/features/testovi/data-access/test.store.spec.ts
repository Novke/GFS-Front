import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createEnvironmentInjector, EnvironmentInjector, ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { StudentListItem } from '../../../core/api/studenti.api';
import { NesacuvaneIzmene } from '../../../core/state/nesacuvane-izmene';
import { NotificationStore, Poruka } from '../../../core/state/notification.store';
import {
  DEBOUNCE_REDA_MS,
  greskaReda,
  jePolozio,
  korpePoena,
  opisProlaza,
  parsirajPoene,
  statistikaPoena,
  statistikaPoVarijantama,
  TestStore,
} from './test.store';
import { TestDetails, TestPolaganjeInfo } from '../../../core/api/testovi.models';

const GRUPA = { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 3 };

const polaganje = (id: number, ime: string, indeks: string, poeni: number | null, grupa: 'A' | 'B' | null = 'A', godina = 2025): TestPolaganjeInfo => ({
  id: 100 + id,
  student: { id, ime, prezime: 'P', indeks, godina },
  grupa: poeni === null ? null : grupa,
  ostvareniPoeni: poeni,
  prepisivao: false,
  polozio: null,
  napomene: null,
});

function test(polaganja: TestPolaganjeInfo[], max = 30): TestDetails {
  return {
    id: 5,
    tipTesta: { id: 2, naziv: 'Kolokvijum 1', aktivan: true },
    predmet: { id: 1, naziv: 'UPR' },
    grupa: GRUPA,
    datum: '2025-10-16',
    maxPoena: max,
    pragProlaza: 15,
    pregledan: false,
    grupe: ['A', 'B'],
    polaganja,
    statistika: null,
  };
}

describe('Testovi: čiste funkcije', () => {
  it('parsira poene sa zarezom i tačkom; prazno je null, tekst NaN', () => {
    expect(parsirajPoene('14,5')).toBe(14.5);
    expect(parsirajPoene(' 7 ')).toBe(7);
    expect(parsirajPoene('')).toBeNull();
    expect(parsirajPoene('abc')).toBeNaN();
    expect(parsirajPoene('-3')).toBeNaN();
  });

  it('poeni veći od max su greška validacije polja poena; varijanta je obavezna kad ih ima više', () => {
    const v = { grupa: 'A' as const, poeni: '31', prepisivao: false, napomene: '' };
    expect(greskaReda(v, 30, ['A', 'B'])).toEqual({ polje: 'poeni', poruka: 'Najviše 30.' });
    expect(greskaReda({ ...v, poeni: '30' }, 30, ['A', 'B'])).toBeNull();
    expect(greskaReda({ ...v, poeni: '0' }, 30, ['A', 'B'])).toBeNull();
    expect(greskaReda({ ...v, grupa: null, poeni: '12' }, 30, ['A', 'B'])).toEqual({ polje: 'varijanta', poruka: 'Izaberi varijantu.' });
    expect(greskaReda({ ...v, grupa: null, poeni: '12' }, 30, ['A'])).toBeNull();
    expect(greskaReda({ ...v, grupa: null, poeni: '' }, 30, ['A', 'B'])).toBeNull();
    expect(greskaReda({ ...v, poeni: '5', napomene: 'x'.repeat(256) }, 30, ['A', 'B'])?.polje).toBe('napomena');
  });

  it('statistika uživo ignoriše prazne unose: prosek, prolaz (prag 15, bez prepisivanja), min i max', () => {
    const s = statistikaPoena(
      [
        { poeni: 10, prepisivao: false },
        { poeni: null, prepisivao: false },
        { poeni: 20, prepisivao: false },
        { poeni: 15, prepisivao: true },
        { poeni: null, prepisivao: false },
      ],
      15,
    );
    expect(s).toEqual({ broj: 3, ukupno: 5, prosek: 15, prolaz: (1 * 100) / 3, min: 10, max: 20 });
  });

  it('prag prolaza: tačno prag prolazi, prag - 1 pada, prepisivao pada i sa poenima iznad praga', () => {
    expect(jePolozio(15, 15, false)).toBe(true);
    expect(jePolozio(14, 15, false)).toBe(false);
    expect(jePolozio(14.5, 15, false)).toBe(false);
    expect(jePolozio(30, 15, true)).toBe(false);
    expect(jePolozio(0, 0, false)).toBe(true);
    const s = statistikaPoena(
      [
        { poeni: 15, prepisivao: false },
        { poeni: 14, prepisivao: false },
        { poeni: 30, prepisivao: true },
      ],
      15,
    );
    expect(s.prolaz).toBeCloseTo(100 / 3);
  });

  it('bez praga test nema prolaznost: prolaz je null (prikaz "—"), ostalo se računa', () => {
    expect(jePolozio(30, null, false)).toBe(false);
    const s = statistikaPoena([{ poeni: 20, prepisivao: false }], null);
    expect(s).toMatchObject({ broj: 1, prosek: 20, prolaz: null });
    expect(statistikaPoVarijantama([polaganje(1, 'Ana', 'GD1', 20, 'A')], null)[0].prolaz).toBeNull();
    expect(opisProlaza(null)).toBe('Bez praga test nema prolaznost.');
    expect(opisProlaza(15)).toBe('Prolaz: najmanje 15 poena, bez prepisivanja.');
  });

  it('statistika bez unetih poena nema proseka (prikaz "—")', () => {
    expect(statistikaPoena([{ poeni: null, prepisivao: false }], 30)).toEqual({
      broj: 0,
      ukupno: 1,
      prosek: null,
      prolaz: null,
      min: null,
      max: null,
    });
    expect(statistikaPoena([], 30).prosek).toBeNull();
  });

  it('korpe histograma: 10 korpi po 10 % max; 0 u prvoj, max u poslednjoj, granica u višoj', () => {
    const k = korpePoena([0, 2.9, 3, 29.9, 30, 31, -1], 30);
    expect(k).toHaveLength(10);
    expect(k.map(x => x.broj)).toEqual([2, 1, 0, 0, 0, 0, 0, 0, 0, 2]);
    expect(k[0].labela).toBe('0–3');
    expect(k[9].labela).toBe('27–30');
    expect(korpePoena([5], 0)).toEqual([]);
    expect(korpePoena([1.5], 15)[1].broj).toBe(1);
  });

  it('statistika po varijantama računa samo polaganja sa poenima', () => {
    const s = statistikaPoVarijantama(
      [polaganje(1, 'Ana', 'GD1', 20, 'A'), polaganje(2, 'Bora', 'GD2', 10, 'B'), polaganje(3, 'Ceca', 'GD3', null), polaganje(4, 'Dule', 'GD4', 30, 'A')],
      15,
    );
    expect(s.map(x => [x.varijanta, x.broj, x.prosek, x.prolaz])).toEqual([
      ['A', 2, 25, 100],
      ['B', 1, 10, 0],
    ]);
  });
});

describe('TestStore', () => {
  let http: HttpTestingController;
  let injector: EnvironmentInjector;
  let store: TestStore;
  let poruke: Poruka[];

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe(p => poruke.push(p));
    // store u svom injektoru, da test može da ga uništi (napuštanje ekrana)
    injector = createEnvironmentInjector([TestStore], TestBed.inject(EnvironmentInjector));
    store = injector.get(TestStore);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  function ucitaj(polaganja: TestPolaganjeInfo[], max = 30): void {
    store.ucitaj(5);
    const req = http.expectOne('api/test/5');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush(test(polaganja, max));
  }

  const odgovor = (p: TestPolaganjeInfo[]) => ({ ...test(p), statistika: null });

  it('učitava redove po indeksu i vrednosti polaganja', () => {
    ucitaj([polaganje(2, 'Bora', 'GD10', 12.5, 'B'), polaganje(1, 'Ana', 'GD2', null)]);
    expect(store.redovi().map(r => r.indeks)).toEqual(['GD2', 'GD10']);
    expect(store.vrednosti()[2]).toEqual({ grupa: 'B', poeni: '12,5', prepisivao: false, napomene: '' });
    expect(store.vrednosti()[1].poeni).toBe('');
  });

  it('poeni veći od max: greška validacije, ništa se ne šalje', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', null)]);
    store.izmeni(1, { grupa: 'A', poeni: '45' });
    expect(store.greskeValidacije()[1]).toEqual({ polje: 'poeni', poruka: 'Najviše 30.' });
    expect(store.statusi()[1]).toBeNull();
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS * 3);
    http.expectNone('api/test/5/polaganje');
    expect(store.statistikaUzivo().broj).toBe(0);
  });

  it('red se čuva sam posle debounce-a, jednim zahtevom sa poslednjim vrednostima', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', null)]);
    store.izmeni(1, { grupa: 'A', poeni: '1' });
    vi.advanceTimersByTime(300);
    store.izmeni(1, { poeni: '14,5' });
    expect(store.statusi()[1]).toBe('cuva');
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS - 1);
    http.expectNone('api/test/5/polaganje');
    vi.advanceTimersByTime(1);
    const req = http.expectOne('api/test/5/polaganje');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ studentId: 1, grupa: 'A', ostvareniPoeni: 14.5, prepisivao: false, napomene: null });
    req.flush(odgovor([{ ...polaganje(1, 'Ana', 'GD2', 14.5, 'A') }]));
    expect(store.statusi()[1]).toBe('sacuvano');
  });

  it('statistika uživo se računa iz unetih vrednosti pre odgovora servera; prazni redovi se ignorišu', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', null), polaganje(2, 'Bora', 'GD3', null), polaganje(3, 'Ceca', 'GD4', 24, 'A')]);
    store.izmeni(1, { grupa: 'B', poeni: '12' });
    const s = store.statistikaUzivo();
    expect(s.broj).toBe(2);
    expect(s.ukupno).toBe(3);
    expect(s.prosek).toBe(18);
    expect(s.prolaz).toBe(50);
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    http.expectOne('api/test/5/polaganje').flush(odgovor([polaganje(1, 'Ana', 'GD2', 12, 'B')]));
  });

  it('odgovor koji kasni ne pregazi noviji unos; noviji se šalje posle prvog', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', null)]);
    store.izmeni(1, { grupa: 'A', poeni: '10' });
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    const prvi = http.expectOne('api/test/5/polaganje');
    store.izmeni(1, { poeni: '20' });
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    http.expectNone('api/test/5/polaganje'); // jedan zahtev u toku
    prvi.flush(odgovor([polaganje(1, 'Ana', 'GD2', 10, 'A')]));
    expect(store.vrednosti()[1].poeni).toBe('20');
    const drugi = http.expectOne('api/test/5/polaganje');
    expect(drugi.request.body.ostvareniPoeni).toBe(20);
    drugi.flush(odgovor([polaganje(1, 'Ana', 'GD2', 20, 'A')]));
    expect(store.statusi()[1]).toBe('sacuvano');
  });

  it('greška mreže: uneto ostaje, poruka se javlja odmah, "Pokušaj ponovo" šalje ponovo', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', null)]);
    store.izmeni(1, { grupa: 'A', poeni: '10' });
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    http.expectOne('api/test/5/polaganje').error(new ProgressEvent('error'), { status: 0 });
    http.expectOne('api/test/5').flush(test([polaganje(1, 'Ana', 'GD2', null)])); // usaglašavanje potvrđenog
    expect(store.statusi()[1]).toBe('greska');
    expect(store.greske()[1]).toBe('Nema veze sa serverom.');
    expect(store.vrednosti()[1].poeni).toBe('10');
    expect(poruke.at(-1)).toMatchObject({ tip: 'greska', tekst: 'Ana P: Nema veze sa serverom.', grupa: 'test-5-cuvanje' });
    store.ponovo(1);
    http.expectOne('api/test/5/polaganje').flush(odgovor([polaganje(1, 'Ana', 'GD2', 10, 'A')]));
    expect(store.statusi()[1]).toBe('sacuvano');
  });

  it('4xx (pravilo servera): uneto ostaje, razlog je u redu do sledeće izmene', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', 8, 'A')]);
    store.izmeni(1, { poeni: '9' });
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    http.expectOne('api/test/5/polaganje').flush({ reason: 'Test je oznacen kao pregledan!' }, { status: 400, statusText: 'Bad Request' });
    http.expectOne('api/test/5').flush(test([polaganje(1, 'Ana', 'GD2', 8, 'A')]));
    expect(store.vrednosti()[1].poeni).toBe('9');
    expect(store.statusi()[1]).toBe('greska');
    expect(store.greske()[1]).toBe('Test je oznacen kao pregledan!');
    expect(poruke.at(-1)).toMatchObject({ tip: 'greska', tekst: 'Ana P: Test je oznacen kao pregledan!', grupa: 'test-5-cuvanje' });
    store.izmeni(1, { poeni: '7' });
    expect(store.greske()[1]).toBeNull();
    expect(store.statusi()[1]).toBe('cuva');
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    http.expectOne('api/test/5/polaganje').flush(odgovor([polaganje(1, 'Ana', 'GD2', 7, 'A')]));
  });

  it('greške više redova: jedna zbirna poruka koja zamenjuje prethodnu', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', null), polaganje(2, 'Bora', 'GD3', null)]);
    store.izmeni(1, { grupa: 'A', poeni: '10' });
    store.izmeni(2, { grupa: 'B', poeni: '11' });
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    http.expectOne('api/test/5/polaganje').error(new ProgressEvent('error'), { status: 0 });
    http.expectOne('api/test/5').flush(test([]));
    http.expectOne('api/test/5/polaganje').flush({ reason: 'x' }, { status: 503, statusText: 'Unavailable' });
    http.expectOne('api/test/5').flush(test([]));
    expect(poruke.filter(p => p.tip === 'greska').map(p => [p.tekst, p.grupa])).toEqual([
      ['Ana P: Nema veze sa serverom.', 'test-5-cuvanje'],
      ['Nije sačuvano za 2 ispitanika. Sistemska greška. Pokušaj ponovo.', 'test-5-cuvanje'],
    ]);
  });

  it('vraćanje na potvrđenu vrednost dok je zahtev u toku: server na kraju ima prikazanu vrednost', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', 10, 'A')]);
    store.izmeni(1, { poeni: '20' });
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    const prvi = http.expectOne('api/test/5/polaganje');
    expect(prvi.request.body.ostvareniPoeni).toBe(20);
    store.izmeni(1, { poeni: '10' }); // isto kao potvrđeno pre slanja, ali server će imati 20
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    prvi.flush(odgovor([polaganje(1, 'Ana', 'GD2', 20, 'A')]));
    expect(store.statusi()[1]).toBe('cuva'); // odgovor za staru verziju ne javlja "Sačuvano"
    const drugi = http.expectOne('api/test/5/polaganje');
    expect(drugi.request.body.ostvareniPoeni).toBe(10);
    drugi.flush(odgovor([polaganje(1, 'Ana', 'GD2', 10, 'A')]));
    expect(store.statusi()[1]).toBe('sacuvano');
    expect(store.vrednosti()[1].poeni).toBe('10');
  });

  it('izgubljen odgovor (server ipak upisao 20), pa vraćeno na 10: sledeći posao ipak šalje 10', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', 10, 'A')]);
    store.izmeni(1, { poeni: '20' });
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    const prvi = http.expectOne('api/test/5/polaganje');
    store.izmeni(1, { poeni: '10' });
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS); // posao "10" čeka u redu iza zahteva u toku
    prvi.flush({ reason: 'x' }, { status: 504, statusText: 'Gateway Timeout' }); // server je upisao 20, odgovor izgubljen
    const drugi = http.expectOne('api/test/5/polaganje');
    expect(drugi.request.body.ostvareniPoeni).toBe(10);
    drugi.flush(odgovor([polaganje(1, 'Ana', 'GD2', 10, 'A')]));
    http.expectOne('api/test/5').flush(test([polaganje(1, 'Ana', 'GD2', 10, 'A')])); // usaglašavanje posle greške
    expect(store.statusi()[1]).toBe('sacuvano');
  });

  it('zastareo GET usaglašavanja ne pregazi noviju potvrdu (vraćanje na 10 se ipak šalje)', async () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', 10, 'A')]);
    store.izmeni(1, { poeni: '20' });
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    http.expectOne('api/test/5/polaganje').flush({ reason: 'Odbijeno' }, { status: 400, statusText: 'Bad Request' });
    const zastareo = http.expectOne(r => r.method === 'GET' && r.url === 'api/test/5'); // usaglašavanje, odgovor kasni
    store.izmeni(1, { poeni: '30' });
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    http.expectOne('api/test/5/polaganje').flush(odgovor([polaganje(1, 'Ana', 'GD2', 30, 'A')]));
    zastareo.flush(test([polaganje(1, 'Ana', 'GD2', 10, 'A')])); // stanje pre upisa 30
    store.izmeni(1, { poeni: '10' });
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    const vracanje = http.expectOne('api/test/5/polaganje');
    expect(vracanje.request.body.ostvareniPoeni).toBe(10);
    vracanje.flush(odgovor([polaganje(1, 'Ana', 'GD2', 10, 'A')]));
    expect(store.statusi()[1]).toBe('sacuvano');
  });

  it('veći max u zaglavlju šalje red koji je do tada bio neispravan', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', null)]);
    store.izmeni(1, { grupa: 'A', poeni: '45' });
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    http.expectNone('api/test/5/polaganje');
    void store.izmeniZaglavlje({ datum: '2025-10-16', maxPoena: 50, tipTestaId: 2 });
    http.expectOne(r => r.method === 'PUT' && r.url === 'api/test/5').flush({ ...test([], 50), polaganja: null });
    expect(store.greskeValidacije()[1]).toBeNull();
    const req = http.expectOne('api/test/5/polaganje');
    expect(req.request.body.ostvareniPoeni).toBe(45);
    req.flush(odgovor([polaganje(1, 'Ana', 'GD2', 45, 'A')]));
    expect(store.statusi()[1]).toBe('sacuvano');
  });

  it('uklanjanje prvo šalje izmenu na čekanju; ako uklanjanje ne uspe, uneto je sačuvano', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', null)]);
    store.izmeni(1, { grupa: 'A', poeni: '12' });
    store.ukloni(1);
    http.expectOne('api/test/5/polaganje').flush(odgovor([polaganje(1, 'Ana', 'GD2', 12, 'A')]));
    http.expectOne(r => r.method === 'DELETE' && r.url === 'api/test/5/polaganje/1').flush({ reason: 'ne' }, { status: 400, statusText: 'Bad' });
    expect(store.redovi().map(r => r.id)).toEqual([1]);
    expect(store.vrednosti()[1].poeni).toBe('12');
    expect(store.zauzet()[1]).toBeUndefined();
  });

  it('"Završi" šalje izmene na čekanju i čeka da se red isprazni pre PATCH-a testa', async () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', 20, 'A')]);
    store.izmeni(1, { poeni: '21' });
    const gotovo = store.zavrsi();
    http.expectNone(r => r.method === 'PATCH' && r.url === 'api/test/5');
    http.expectOne('api/test/5/polaganje').flush(odgovor([polaganje(1, 'Ana', 'GD2', 21, 'A')]));
    http.expectOne(r => r.method === 'PATCH' && r.url === 'api/test/5').flush({ ...test([]), pregledan: true });
    await expect(gotovo).resolves.toBe(true);
    expect(store.evidentiran()).toBe(true);
  });

  it('"Završi" ne šalje PATCH kad čuvanje nije uspelo', async () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', 20, 'A')]);
    store.izmeni(1, { poeni: '21' });
    const gotovo = store.zavrsi();
    http.expectOne('api/test/5/polaganje').error(new ProgressEvent('error'), { status: 0 });
    http.expectOne(r => r.method === 'GET' && r.url === 'api/test/5').flush(test([polaganje(1, 'Ana', 'GD2', 20, 'A')]));
    await expect(gotovo).resolves.toBe(false);
    http.expectNone(r => r.method === 'PATCH' && r.url === 'api/test/5');
  });

  it('brisanje otkazuje izmene na čekanju (ne šalju se obrisanom testu)', async () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', null)]);
    store.izmeni(1, { grupa: 'A', poeni: '12' });
    const gotovo = store.obrisi();
    http.expectOne(r => r.method === 'DELETE' && r.url === 'api/test/5').flush(null, { status: 204, statusText: 'No Content' });
    await expect(gotovo).resolves.toBe(true);
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS * 2);
    http.expectNone('api/test/5/polaganje');
  });

  it('prelazak na drugi test (/testovi/5 -> /testovi/6): izmena ide na test 5, test 6 se čita posle nje', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', null)]);
    store.izmeni(1, { grupa: 'A', poeni: '12' });
    store.ucitaj(6);
    http.expectNone('api/test/6'); // čeka se pražnjenje sesije testa 5
    const req = http.expectOne('api/test/5/polaganje');
    expect(req.request.body).toMatchObject({ studentId: 1, ostvareniPoeni: 12 });
    req.flush(odgovor([polaganje(1, 'Ana', 'GD2', 12, 'A')]));
    http.expectOne('api/test/6').flush({ ...test([polaganje(3, 'Ceca', 'GD4', 5, 'B')]), id: 6 });
    expect(store.test()?.id).toBe(6);
    expect(store.redovi().map(r => r.id)).toEqual([3]);
    expect(store.statusi()[1]).toBeUndefined();
  });

  it('napušten ekran pa ponovo otvoren isti test (novi store): GET čeka upis prethodnog ekrana', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', null)]);
    store.izmeni(1, { grupa: 'A', poeni: '12' });
    injector.destroy(); // ekran napušten: izmena se šalje
    const upis = http.expectOne('api/test/5/polaganje');
    const drugi = createEnvironmentInjector([TestStore], TestBed.inject(EnvironmentInjector)).get(TestStore);
    drugi.ucitaj(5);
    http.expectNone('api/test/5'); // registar: sesija napuštenog ekrana još upisuje
    upis.flush(odgovor([polaganje(1, 'Ana', 'GD2', 12, 'A')]));
    http.expectOne('api/test/5').flush(test([polaganje(1, 'Ana', 'GD2', 12, 'A')]));
    expect(drugi.vrednosti()[1].poeni).toBe('12');
  });

  it('5 -> 6 -> 5: povratak na test 5 čeka upis zatvorene sesije testa 5', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', null)]);
    store.izmeni(1, { grupa: 'A', poeni: '12' });
    store.ucitaj(6);
    const upis = http.expectOne('api/test/5/polaganje');
    store.ucitaj(5); // pre nego što se 6 uopšte učitao
    http.expectNone('api/test/6');
    http.expectNone('api/test/5');
    upis.flush(odgovor([polaganje(1, 'Ana', 'GD2', 12, 'A')]));
    http.expectOne('api/test/5').flush(test([polaganje(1, 'Ana', 'GD2', 12, 'A')]));
    expect(store.test()?.id).toBe(5);
    expect(store.vrednosti()[1].poeni).toBe('12');
  });

  it('posle napuštanja ekrana zakazano čuvanje se šalje odmah (poeni se ne gube)', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', null)]);
    store.izmeni(1, { grupa: 'B', poeni: '17' });
    injector.destroy();
    const req = http.expectOne('api/test/5/polaganje');
    expect(req.request.body).toMatchObject({ studentId: 1, grupa: 'B', ostvareniPoeni: 17 });
    req.error(new ProgressEvent('error'), { status: 0 });
    http.expectOne('api/test/5').flush(test([])); // tiho usaglašavanje i posle napuštanja ekrana
    expect(poruke.at(-1)).toMatchObject({ tip: 'greska', grupa: 'test-5-cuvanje' });
    expect(poruke.at(-1)?.tekst).toContain('Ana P');
  });

  it('stariji student dodat kroz birač ulazi u tabelu (POST polaganje sa { id })', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', null)]);
    const stariji: StudentListItem = {
      id: 9,
      ime: 'Ivana',
      prezime: 'Kostić',
      indeks: 'GD14',
      godina: 2023,
      email: null,
      brojTelefona: null,
      grupa: { id: 2, naziv: 'GD-2023', godinaUpisa: 2023, brojStudenata: 30 },
    };
    store.dodajIspitanike([stariji]);
    expect(store.redovi().map(r => r.id)).toEqual([1, 9]);
    expect(store.redovi()[1].stariji).toBe(true);
    expect(store.zauzet()[9]).toBe('dodaje');
    const req = http.expectOne('api/test/5/polaganje');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ id: 9 });
    req.flush(
      odgovor([polaganje(1, 'Ana', 'GD2', null), { ...polaganje(9, 'Ivana', 'GD14', null, 'A', 2023), student: { id: 9, ime: 'Ivana', prezime: 'Kostić', indeks: 'GD14', godina: 2023 } }]),
    );
    expect(store.zauzet()[9]).toBeUndefined();
    store.izmeni(9, { grupa: 'A', poeni: '20' });
    expect(store.statistikaUzivo().broj).toBe(1);
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    http.expectOne('api/test/5/polaganje').flush(odgovor([polaganje(9, 'Ivana', 'GD14', 20, 'A', 2023)]));
  });

  it('student kog server odbije (mlađi, bez grupe) ne ostaje u tabeli', () => {
    ucitaj([]);
    store.dodajIspitanike([
      { id: 7, ime: 'Mladi', prezime: 'M', indeks: 'GD1', godina: 2026, email: null, brojTelefona: null, grupa: null },
    ]);
    http.expectOne('api/test/5/polaganje').flush({ reason: 'Student GD1 ne pripada grupi GD-2025' }, { status: 400, statusText: 'Bad Request' });
    expect(store.redovi()).toEqual([]);
    expect(poruke.at(-1)).toMatchObject({ tip: 'greska', tekst: 'Mladi M: Student GD1 ne pripada grupi GD-2025' });
  });

  it('"Završi evidentiranje" može tek kad svi ispitanici imaju sačuvane poene', () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', 20, 'A'), polaganje(2, 'Bora', 'GD3', null)]);
    expect(store.spremnost()).toEqual({ moze: false, razlog: 'Unesi poene za sve ispitanike (još 1).' });
    store.izmeni(2, { grupa: 'B', poeni: '5' });
    expect(store.spremnost().moze).toBe(false);
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    http.expectOne('api/test/5/polaganje').flush(odgovor([polaganje(2, 'Bora', 'GD3', 5, 'B')]));
    expect(store.spremnost()).toEqual({ moze: true, razlog: null });
  });

  it('prag: PATCH prag-prolaza (i na evidentiranom testu), statistika uživo se odmah preračunava; null briše prag', async () => {
    ucitaj([polaganje(1, 'Ana', 'GD2', 12, 'A'), polaganje(2, 'Bora', 'GD3', 20, 'B')]);
    patchEvidentiran();
    expect(store.statistikaUzivo().prolaz).toBe(50);
    const p = store.postaviPrag(10);
    const req = http.expectOne('api/test/5/prag-prolaza');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ pragProlaza: 10 });
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush({ ...test([]), pragProlaza: 10, pregledan: true });
    await expect(p).resolves.toBeNull();
    expect(store.statistikaUzivo().prolaz).toBe(100);
    const brisanje = store.postaviPrag(null);
    const r2 = http.expectOne('api/test/5/prag-prolaza');
    expect(r2.request.body).toEqual({ pragProlaza: null });
    r2.flush({ ...test([]), pragProlaza: null, pregledan: true });
    await brisanje;
    expect(store.statistikaUzivo().prolaz).toBeNull();
  });

  it('prag van opsega: razlog servera se vraća polju (nema snackbara), prag ostaje', async () => {
    ucitaj([]);
    const p = store.postaviPrag(40);
    http
      .expectOne('api/test/5/prag-prolaza')
      .flush({ reason: 'Prag prolaza mora biti između 0 i maksimalnog broja poena.' }, { status: 400, statusText: 'Bad Request' });
    await expect(p).resolves.toBe('Prag prolaza mora biti između 0 i maksimalnog broja poena.');
    expect(store.pragProlaza()).toBe(15);
  });

  it('zaglavlje (PUT) ne šalje prag; greška servera se vraća formi', async () => {
    ucitaj([]);
    const p = store.izmeniZaglavlje({ datum: '2025-10-16', maxPoena: 10, tipTestaId: 2 });
    const req = http.expectOne(r => r.method === 'PUT' && r.url === 'api/test/5');
    expect(req.request.body).toEqual({ datum: '2025-10-16', maxPoena: 10, tipTestaId: 2 });
    req.flush({ reason: 'Prag prolaza mora biti između 0 i maksimalnog broja poena.' }, { status: 400, statusText: 'Bad Request' });
    await expect(p).resolves.toBe('Prag prolaza mora biti između 0 i maksimalnog broja poena.');
    expect(store.maxPoena()).toBe(30);
  });

  it('izuzetak u obradi greške ne gasi red: sledeća izmena se šalje, povratak na test ne čeka zauvek', () => {
    const handleError = vi.spyOn(TestBed.inject(ErrorHandler), 'handleError').mockImplementation(() => undefined);
    vi.spyOn(TestBed.inject(NotificationStore), 'greska').mockImplementationOnce(() => {
      throw new Error('pukla poruka');
    });
    ucitaj([polaganje(1, 'Ana', 'GD2', 10, 'A')]);
    store.izmeni(1, { poeni: '20' });
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    http.expectOne('api/test/5/polaganje').flush({ reason: 'Odbijeno' }, { status: 400, statusText: 'Bad Request' });
    http.expectOne(r => r.method === 'GET' && r.url === 'api/test/5').flush(test([polaganje(1, 'Ana', 'GD2', 10, 'A')]));
    store.izmeni(1, { poeni: '21' });
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    http.expectOne('api/test/5/polaganje').flush(odgovor([polaganje(1, 'Ana', 'GD2', 21, 'A')]));
    expect(store.statusi()[1]).toBe('sacuvano');
    injector.destroy(); // napušten ekran pa isti test ponovo: registar ne čeka sesiju sa zaglavljenim redom
    const drugi = createEnvironmentInjector([TestStore], TestBed.inject(EnvironmentInjector)).get(TestStore);
    drugi.ucitaj(5);
    http.expectOne('api/test/5').flush(test([polaganje(1, 'Ana', 'GD2', 21, 'A')]));
    expect(drugi.status()).toBe('loaded');
    expect(handleError).toHaveBeenCalledWith(new Error('pukla poruka'));
  });

  it('nesačuvane izmene (čekanje, u toku, neuspelo) se vide u NesacuvaneIzmene; posle potvrde ih nema', () => {
    const nesacuvane = TestBed.inject(NesacuvaneIzmene);
    /** `true` = pregledač bi pitao "Napustiti sajt?". */
    const pita = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    ucitaj([polaganje(1, 'Ana', 'GD2', null)]);
    expect(nesacuvane.broj()).toBe(0);
    expect(pita()).toBe(false);
    store.izmeni(1, { grupa: 'A', poeni: '12' });
    expect(nesacuvane.broj()).toBe(1); // čeka debounce
    expect(pita()).toBe(true);
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS);
    const req = http.expectOne('api/test/5/polaganje');
    expect(nesacuvane.broj()).toBe(1); // u toku
    req.error(new ProgressEvent('error'), { status: 0 });
    http.expectOne(r => r.method === 'GET' && r.url === 'api/test/5').flush(test([polaganje(1, 'Ana', 'GD2', null)]));
    expect(nesacuvane.broj()).toBe(1); // nije sačuvano
    store.ponovo(1);
    http.expectOne('api/test/5/polaganje').flush(odgovor([polaganje(1, 'Ana', 'GD2', 12, 'A')]));
    expect(nesacuvane.broj()).toBe(0);
    expect(pita()).toBe(false);
  });

  /** Evidentiran test (prag se i tada menja): stanje kao da je završen. */
  function patchEvidentiran(): void {
    void store.zavrsi();
    http.expectOne(r => r.method === 'PATCH' && r.url === 'api/test/5').flush({ ...test([]), pregledan: true });
    expect(store.evidentiran()).toBe(true);
  }
});
