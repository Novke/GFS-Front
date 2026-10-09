import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, ErrorHandler, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { NesacuvaneIzmene } from '../../../core/state/nesacuvane-izmene';
import { NotificationStore, Poruka } from '../../../core/state/notification.store';
import { CreateUradjenDomaciCmd, DomaciDetails, DomaciStudentiInfo } from '../../../core/api/domaci.models';
import { DEBOUNCE_REDA_MS, DomaciStore } from './domaci.store';

const red = (studentId: number, ime: string, prezime: string, indeks: string, izmene: Partial<DomaciStudentiInfo> = {}): DomaciStudentiInfo => ({
  studentId,
  domaciId: 5,
  ime,
  prezime,
  indeks,
  godina: 2025,
  tip: null,
  predavanjaNapomene: null,
  uradjenDomaciId: null,
  bodovi: null,
  uradjenDomaciNapomene: null,
  prepisivanje: null,
  oslobodjen: null,
  ...izmene,
});

/**
 * Lažni server: čuva `uradjeni` po studentu kao `DomaciService.dodajEvidentaciju` (upis ili izmena) i uvek vraća ceo domaći.
 * `details` se menja između testova kroz `studenti`.
 */
class Server {
  studenti: DomaciStudentiInfo[] = [
    red(1, 'Ana', 'Radić', 'GD2', { tip: 'ZADATAK' }),
    red(2, 'Marko', 'Ilić', 'GD10'),
    red(3, 'Jovana', 'Petrović', 'GD7', { tip: 'PRISUSTVO' }),
  ];
  predavanje: DomaciDetails['predavanje'] = { id: 12, rb: 7, tema: 'Petlje', datum: '2025-10-14' };
  grupa: DomaciDetails['grupa'] = { id: 4, naziv: 'GD-2025', godinaUpisa: 2025 };
  id = 5;
  pregledan = false;
  primljeno: CreateUradjenDomaciCmd[] = [];

  details(): DomaciDetails {
    return {
      id: this.id,
      predmet: { id: 1, naziv: 'Uvod u primenu računara' },
      naslov: 'Domaći 3',
      text: 'Petlje',
      datum: '2025-10-15',
      pregledan: this.pregledan,
      grupa: this.grupa,
      predavanje: this.predavanje,
      studenti: this.studenti.map(s => ({ ...s })),
    };
  }

  primeni(cmd: CreateUradjenDomaciCmd): void {
    this.primljeno.push(cmd);
    const s = this.studenti.find(x => x.studentId === cmd.studentId)!;
    s.uradjenDomaciId = s.uradjenDomaciId ?? 100 + cmd.studentId;
    s.bodovi = cmd.bodovi;
    s.uradjenDomaciNapomene = cmd.napomene;
    s.prepisivanje = cmd.prepisivanje;
  }

  /** Primenjuje zahtev i odgovara. */
  odgovori(req: TestRequest): CreateUradjenDomaciCmd {
    const cmd = req.request.body as CreateUradjenDomaciCmd;
    this.primeni(cmd);
    req.flush(this.details());
    return cmd;
  }
}

@Component({ template: '', providers: [DomaciStore], changeDetection: ChangeDetectionStrategy.OnPush })
class Domacin {
  readonly store = inject(DomaciStore);
}

describe('DomaciStore', () => {
  let http: HttpTestingController;
  let store: DomaciStore;
  let server: Server;
  let poruke: Poruka[];

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [DomaciStore, provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(DomaciStore);
    server = new Server();
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe(p => poruke.push(p));
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function ucitaj(): void {
    store.ucitaj(5);
    const req = http.expectOne('api/domaci/5');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush(server.details());
  }

  const evidentiraj = () => http.match(r => r.url === 'api/domaci/evidentiraj');
  const tece = () => vi.advanceTimersByTime(DEBOUNCE_REDA_MS);

  it('učitava zaglavlje i redove; nedostajući podaci su prazni, ne izuzeci', () => {
    server.studenti[0].ime = null;
    server.studenti[0].indeks = null;
    server.studenti[0].godina = null;
    ucitaj();
    expect(store.status()).toBe('loaded');
    expect(store.domaci()).toMatchObject({ id: 5, naslov: 'Domaći 3', pregledan: false });
    expect(store.studenti().map(s => s.id)).toEqual([1, 2, 3]);
    expect(store.studenti()[0]).toMatchObject({ ime: '', indeks: '', godina: null });
    expect(store.vrednosti()[2]).toEqual({ bodovi: null, prepisivanje: false, napomene: '' });
    expect(store.brojevi()).toMatchObject({ studenata: 3, prisutnih: 2, aktivnih: 1, zaOslobadjanje: 1, evidentirano: 0, prosek: null });
  });

  it('domaći bez grupe i predavanja: nema studenata, nema izuzetaka', () => {
    server.studenti = [];
    server.grupa = null;
    server.predavanje = null;
    ucitaj();
    expect(store.domaci()).toMatchObject({ grupa: null, predavanje: null });
    expect(store.studenti()).toEqual([]);
    expect(store.brojevi()).toMatchObject({ studenata: 0, evidentirano: 0, prosek: null });
  });

  it('greška učitavanja: status error i poruka', () => {
    store.ucitaj(5);
    http.expectOne('api/domaci/5').flush({ reason: 'Domaci ne postoji! ID = 5' }, { status: 404, statusText: 'Not Found' });
    expect(store.imaGresku()).toBe(true);
    expect(store.greska()).toBe('Domaci ne postoji! ID = 5');
  });

  it('autosave: više brzih izmena istog reda šalje jedan zahtev, sa poslednjim vrednostima', () => {
    ucitaj();
    store.izmeni(2, { bodovi: 3 });
    vi.advanceTimersByTime(200);
    store.izmeni(2, { bodovi: 4 });
    vi.advanceTimersByTime(200);
    store.izmeni(2, { napomene: 'kasni' });
    vi.advanceTimersByTime(200);
    store.izmeni(2, { bodovi: 8, prepisivanje: true });
    // prikazuje se odmah, a ništa nije poslato dok traje debounce
    expect(store.vrednosti()[2]).toEqual({ bodovi: 8, prepisivanje: true, napomene: 'kasni' });
    expect(store.statusi()[2]).toBe('cuva');
    vi.advanceTimersByTime(DEBOUNCE_REDA_MS - 1);
    expect(evidentiraj()).toHaveLength(0);
    vi.advanceTimersByTime(1);

    const zahtevi = evidentiraj();
    expect(zahtevi).toHaveLength(1);
    expect(zahtevi[0].request.context.get(LOCAL_ERRORS)).toBe(true);
    expect(server.odgovori(zahtevi[0])).toEqual({ studentId: 2, domaciId: 5, bodovi: 8, napomene: 'kasni', prepisivanje: true });
    expect(store.statusi()[2]).toBe('sacuvano');
    expect(store.vrednosti()[2]).toEqual({ bodovi: 8, prepisivanje: true, napomene: 'kasni' });
    expect(store.brojevi()).toMatchObject({ evidentirano: 1, prosek: 8, prepisivanja: 1 });
  });

  it('različiti redovi imaju svoje debounce-ove i zahteve', () => {
    ucitaj();
    store.izmeni(1, { bodovi: 5 });
    store.izmeni(2, { bodovi: 6 });
    tece();
    const zahtevi = evidentiraj();
    expect(zahtevi.map(z => (z.request.body as CreateUradjenDomaciCmd).studentId).sort()).toEqual([1, 2]);
    zahtevi.forEach(z => server.odgovori(z));
    expect(store.brojevi().prosek).toBe(5.5);
  });

  it('prazno polje bodova šalje 0 (server ne prima null), napomena ostaje', () => {
    ucitaj();
    store.izmeni(3, { napomene: 'samo napomena' });
    tece();
    const [z] = evidentiraj();
    expect((z.request.body as CreateUradjenDomaciCmd).bodovi).toBe(0);
    server.odgovori(z);
    expect(store.vrednosti()[3]).toEqual({ bodovi: 0, prepisivanje: false, napomene: 'samo napomena' });
  });

  it('greška čuvanja ostavlja vrednost, status je greska i javlja se poruka; "Pokušaj ponovo" šalje opet', () => {
    ucitaj();
    store.izmeni(2, { bodovi: 7, napomene: 'u redu' });
    tece();
    evidentiraj()[0].flush({ reason: 'Max 10 bodova je dozvoljeno' }, { status: 400, statusText: 'Bad Request' });

    expect(store.vrednosti()[2]).toEqual({ bodovi: 7, prepisivanje: false, napomene: 'u redu' });
    expect(store.statusi()[2]).toBe('greska');
    expect(store.brojGresaka()).toBe(1);
    expect(poruke).toEqual([{ tip: 'greska', tekst: 'Marko Ilić: Max 10 bodova je dozvoljeno', akcija: undefined, grupa: 'domaci-5-cuvanje' }]);

    store.ponovi(2);
    expect(store.statusi()[2]).toBe('cuva');
    const ponovo = evidentiraj();
    expect(ponovo).toHaveLength(1);
    server.odgovori(ponovo[0]);
    expect(store.statusi()[2]).toBe('sacuvano');
    expect(store.brojGresaka()).toBe(0);
  });

  it('serijalizacija po studentu: izmena dok je zahtev u toku čeka, a kasni odgovor ne prepisuje noviji unos', () => {
    ucitaj();
    store.izmeni(2, { bodovi: 4 });
    tece();
    const prvi = evidentiraj();
    expect(prvi).toHaveLength(1);

    // dok prvi zahtev još nije dobio odgovor, korisnik menja isti red i debounce prođe
    store.izmeni(2, { bodovi: 9 });
    tece();
    expect(evidentiraj()).toHaveLength(0); // drugi čeka prvi (najviše jedan zahtev po studentu)

    server.odgovori(prvi[0]);
    // odgovor na stariji unos ne vraća 4 u polje, a red je i dalje "čuva"
    expect(store.vrednosti()[2].bodovi).toBe(9);
    expect(store.statusi()[2]).toBe('cuva');

    const drugi = evidentiraj();
    expect(drugi).toHaveLength(1);
    expect((drugi[0].request.body as CreateUradjenDomaciCmd).bodovi).toBe(9);
    server.odgovori(drugi[0]);
    expect(store.vrednosti()[2].bodovi).toBe(9);
    expect(store.statusi()[2]).toBe('sacuvano');
    expect(server.primljeno.map(c => c.bodovi)).toEqual([4, 9]);
  });

  it('izmena vraćena na staru vrednost dok je zahtev u toku ne šalje ništa suvišno', () => {
    ucitaj();
    store.izmeni(2, { bodovi: 4 });
    tece();
    const [prvi] = evidentiraj();
    store.izmeni(2, { bodovi: 6 });
    store.izmeni(2, { bodovi: 4 });
    tece();
    server.odgovori(prvi); // server već ima 4: drugi korak je jednak potvrđenom
    expect(evidentiraj()).toHaveLength(0);
    expect(store.vrednosti()[2].bodovi).toBe(4);
    expect(store.statusi()[2]).toBe('sacuvano');
    expect(server.primljeno).toHaveLength(1);
  });

  it('greška starijeg zahteva dok je noviji unos na čekanju ne prikazuje grešku, noviji unos je šalje opet', () => {
    ucitaj();
    store.izmeni(2, { bodovi: 4 });
    tece();
    const [prvi] = evidentiraj();
    store.izmeni(2, { bodovi: 5 });
    tece();
    prvi.flush({ reason: 'x' }, { status: 500, statusText: 'Server Error' });
    expect(poruke).toEqual([]);
    expect(store.statusi()[2]).toBe('cuva');
    const [drugi] = evidentiraj();
    expect((drugi.request.body as CreateUradjenDomaciCmd).bodovi).toBe(5);
    server.odgovori(drugi);
    expect(store.statusi()[2]).toBe('sacuvano');
  });

  it('sacuvajOdmah (Enter) ne čeka debounce, a bez izmene ne šalje ništa', () => {
    ucitaj();
    store.sacuvajOdmah(2);
    expect(evidentiraj()).toHaveLength(0);
    store.izmeni(2, { bodovi: 6 });
    store.sacuvajOdmah(2);
    const zahtevi = evidentiraj();
    expect(zahtevi).toHaveLength(1);
    server.odgovori(zahtevi[0]);
    expect(store.statusi()[2]).toBe('sacuvano');
    tece(); // tajmer je otkazan: nema drugog zahteva
    expect(evidentiraj()).toHaveLength(0);
  });

  it('neispravni bodovi (negativni, razlomak, preko 10) se ne primaju', () => {
    ucitaj();
    for (const b of [-1, 11, 2.5, Number.NaN]) {
      store.izmeni(2, { bodovi: b });
    }
    expect(store.vrednosti()[2].bodovi).toBeNull();
    expect(store.statusi()[2]).toBeUndefined();
    tece();
    expect(evidentiraj()).toHaveLength(0);
  });

  it('oslobođen red je zaključan: izmena se ignoriše', () => {
    server.studenti[0] = red(1, 'Ana', 'Radić', 'GD2', { tip: 'ZADATAK', oslobodjen: true, bodovi: 10, uradjenDomaciId: 9 });
    ucitaj();
    expect(store.studenti()[0].oslobodjen).toBe(true);
    store.izmeni(1, { bodovi: 3 });
    tece();
    expect(store.vrednosti()[1].bodovi).toBe(10);
    expect(evidentiraj()).toHaveLength(0);
    expect(store.brojevi()).toMatchObject({ oslobodjenih: 1, zaOslobadjanje: 0, evidentirano: 0 });
  });

  it('pregledan domaći je samo za čitanje', () => {
    server.pregledan = true;
    ucitaj();
    expect(store.pregledan()).toBe(true);
    store.izmeni(2, { bodovi: 3 });
    tece();
    expect(evidentiraj()).toHaveLength(0);
  });

  it('oslobodi: aktivni dobijaju 10 i zaključavaju se, red koji se menja ostaje', async () => {
    ucitaj();
    store.izmeni(3, { napomene: 'piše se' }); // student 3 je samo prisutan, nije aktivan
    const obecanje = store.oslobodi();
    const req = http.expectOne('api/domaci/5/oslobodi');
    expect(req.request.method).toBe('POST');
    server.studenti[0] = { ...server.studenti[0], oslobodjen: true, bodovi: 10, uradjenDomaciId: 9 };
    req.flush(server.details());
    expect(await obecanje).toBe(true);

    expect(store.studenti()[0].oslobodjen).toBe(true);
    expect(store.vrednosti()[1].bodovi).toBe(10);
    expect(store.vrednosti()[3].napomene).toBe('piše se'); // unos u toku nije pregažen
    expect(store.brojevi()).toMatchObject({ oslobodjenih: 1, zaOslobadjanje: 0 });
    expect(poruke[0]).toMatchObject({ tip: 'uspeh', tekst: 'Oslobođeno studenata: 1.' });
    tece();
    server.odgovori(evidentiraj()[0]);
  });

  it('zavrsi: PATCH, domaći postaje pregledan', async () => {
    ucitaj();
    const obecanje = store.zavrsi();
    const req = http.expectOne('api/domaci/5');
    expect(req.request.method).toBe('PATCH');
    req.flush(null);
    expect(await obecanje).toBe(true);
    expect(store.pregledan()).toBe(true);
    store.izmeni(2, { bodovi: 3 });
    tece();
    expect(evidentiraj()).toHaveLength(0);
  });

  it('izmeniZaglavlje: PUT sa naslovom, opisom i datumom; redovi se ne diraju', async () => {
    ucitaj();
    store.izmeni(2, { bodovi: 6 });
    const obecanje = store.izmeniZaglavlje({ naslov: 'Novi naslov', text: 'Opis', datum: '2025-10-20' });
    const req = http.expectOne('api/domaci/5');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ naslov: 'Novi naslov', text: 'Opis', datum: '2025-10-20' });
    req.flush({ ...server.details(), naslov: 'Novi naslov', text: 'Opis', datum: '2025-10-20' });
    expect(await obecanje).toBe(true);
    expect(store.domaci()).toMatchObject({ naslov: 'Novi naslov', datum: '2025-10-20' });
    expect(store.vrednosti()[2].bodovi).toBe(6);
    tece();
    server.odgovori(evidentiraj()[0]);
  });

  it('obrisi: DELETE; izmene na čekanju se odbacuju (ne šalju se obrisanom domaćem)', async () => {
    ucitaj();
    store.izmeni(2, { bodovi: 6 });
    const obecanje = store.obrisi();
    const req = http.expectOne('api/domaci/5');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(await obecanje).toBe(true);
    tece();
    expect(evidentiraj()).toHaveLength(0);
  });

  describe('prelazak na drugi domaći (/domaci/5 -> /domaci/6)', () => {
    const DRUGI = (): DomaciDetails => ({ ...new Server().details(), id: 6, naslov: 'Domaći 4', studenti: [red(2, 'Marko', 'Ilić', 'GD10')] });

    it('izmena na čekanju se šalje starom domaćem, a novi se učitava tek kad se red isprazni', () => {
      ucitaj();
      store.izmeni(2, { bodovi: 6 });
      store.ucitaj(6);

      const zahtevi = evidentiraj();
      expect(zahtevi).toHaveLength(1);
      expect(zahtevi[0].request.body).toEqual({ studentId: 2, domaciId: 5, bodovi: 6, napomene: '', prepisivanje: false });
      http.expectNone('api/domaci/6'); // čeka pražnjenje stare sesije
      expect(store.status()).toBe('loading');
      tece(); // prošli tajmer ne šalje drugi put
      expect(evidentiraj()).toHaveLength(0);

      server.odgovori(zahtevi[0]);
      http.expectOne('api/domaci/6').flush(DRUGI());
      expect(store.domaci()).toMatchObject({ id: 6, naslov: 'Domaći 4' });
      expect(store.vrednosti()[2]).toEqual({ bodovi: null, prepisivanje: false, napomene: '' });
      expect(store.statusi()).toEqual({});
      expect(server.primljeno).toHaveLength(1);
    });

    it('zahtev u toku se ne otkazuje; zakasneli odgovor ne dira stanje novog domaćeg', () => {
      ucitaj();
      store.izmeni(2, { bodovi: 4 });
      tece();
      const [uToku] = evidentiraj();
      store.ucitaj(6);
      expect(uToku.cancelled).toBe(false);
      server.odgovori(uToku);
      http.expectOne('api/domaci/6').flush(DRUGI());
      expect(store.domaci()?.id).toBe(6);
      expect(store.vrednosti()[2].bodovi).toBeNull();
      expect(store.statusi()[2]).toBeUndefined();
    });

    it('red koji čeka iza zahteva u toku se ipak šalje (sa najnovijim vrednostima), pa tek onda novi domaći', () => {
      ucitaj();
      store.izmeni(2, { bodovi: 4 });
      tece();
      const [prvi] = evidentiraj();
      store.izmeni(2, { bodovi: 9 }); // čeka debounce iza zahteva u toku
      store.ucitaj(6);
      server.odgovori(prvi);
      const drugi = evidentiraj();
      expect(drugi.map(z => (z.request.body as CreateUradjenDomaciCmd).bodovi)).toEqual([9]);
      expect((drugi[0].request.body as CreateUradjenDomaciCmd).domaciId).toBe(5);
      http.expectNone('api/domaci/6');
      server.odgovori(drugi[0]);
      http.expectOne('api/domaci/6').flush(DRUGI());
      expect(server.primljeno.map(c => c.bodovi)).toEqual([4, 9]);
    });

    it('greška stare sesije se javlja, ali ne menja status ni vrednosti novog domaćeg', () => {
      ucitaj();
      store.izmeni(2, { bodovi: 4 });
      tece();
      const [uToku] = evidentiraj();
      store.ucitaj(6);
      uToku.flush({ reason: 'Domaci ne postoji' }, { status: 404, statusText: 'Not Found' });
      expect(poruke).toEqual([{ tip: 'greska', tekst: 'Marko Ilić: Domaci ne postoji', akcija: undefined, grupa: 'domaci-5-cuvanje' }]);
      http.expectOne('api/domaci/6').flush(DRUGI());
      expect(store.brojGresaka()).toBe(0);
      expect(store.vrednosti()[2].bodovi).toBeNull();
    });

    it('izmena novog domaćeg ide novom domaćem, nezavisno od starog', () => {
      ucitaj();
      store.ucitaj(6);
      http.expectOne('api/domaci/6').flush(DRUGI());
      store.izmeni(2, { bodovi: 7 });
      tece();
      const [z] = evidentiraj();
      expect((z.request.body as CreateUradjenDomaciCmd).domaciId).toBe(6);
      server.id = 6;
      server.odgovori(z);
    });
  });

  it('greške više redova se javljaju jednom porukom iste grupe: "Nije sačuvano za N studenata"', () => {
    ucitaj();
    store.izmeni(1, { bodovi: 1 });
    store.izmeni(2, { bodovi: 2 });
    store.izmeni(3, { bodovi: 3 });
    tece();
    const zahtevi = evidentiraj();
    zahtevi.forEach(z => z.flush({ reason: 'Greška baze.' }, { status: 400, statusText: 'Bad Request' }));
    expect(poruke.map(p => p.tekst)).toEqual([
      'Ana Radić: Greška baze.',
      'Nije sačuvano za 2 studenta. Greška baze.',
      'Nije sačuvano za 3 studenta. Greška baze.',
    ]);
    expect(new Set(poruke.map(p => p.grupa))).toEqual(new Set(['domaci-5-cuvanje'])); // host ih zamenjuje poslednjom
    expect(store.brojGresaka()).toBe(3);
    // uspešno ponavljanje jednog reda smanjuje brojač
    store.ponovi(1);
    server.odgovori(evidentiraj()[0]);
    expect(store.brojGresaka()).toBe(2);
  });

  it('zavrsi: šalje izmene koje čekaju debounce i čeka pražnjenje redova pre PATCH-a', async () => {
    ucitaj();
    store.izmeni(2, { bodovi: 6 });
    const obecanje = store.zavrsi();
    const [z] = evidentiraj();
    expect(z).toBeDefined();
    http.expectNone(r => r.method === 'PATCH'); // još čeka odgovor na čuvanje
    server.odgovori(z);
    const patch = http.expectOne(r => r.method === 'PATCH' && r.url === 'api/domaci/5');
    patch.flush(null);
    expect(await obecanje).toBe(true);
    expect(store.pregledan()).toBe(true);
    expect(store.statusi()[2]).toBe('sacuvano');
  });

  it('obrisi: izmene na čekanju se ne šalju, zahtev u toku se sačeka pre DELETE', async () => {
    ucitaj();
    store.izmeni(1, { bodovi: 3 });
    tece();
    const [uToku] = evidentiraj();
    store.izmeni(2, { bodovi: 6 }); // čeka debounce
    const obecanje = store.obrisi();
    http.expectNone(r => r.method === 'DELETE');
    server.odgovori(uToku);
    tece();
    expect(evidentiraj()).toHaveLength(0); // izmena na čekanju je otkazana
    http.expectOne(r => r.method === 'DELETE' && r.url === 'api/domaci/5').flush(null, { status: 204, statusText: 'No Content' });
    expect(await obecanje).toBe(true);
  });

  it('obrisi koje ne uspe vraća izmene na izvršenje', async () => {
    ucitaj();
    store.izmeni(2, { bodovi: 6 });
    const obecanje = store.obrisi();
    http.expectOne(r => r.method === 'DELETE').flush({ reason: 'Ne može.' }, { status: 400, statusText: 'Bad Request' });
    expect(await obecanje).toBe(false);
    const zahtevi = evidentiraj();
    expect(zahtevi).toHaveLength(1);
    server.odgovori(zahtevi[0]);
    expect(store.statusi()[2]).toBe('sacuvano');
  });

  describe('jednak obrazac čuvanja (kao TestStore)', () => {
    it('izgubljen odgovor (server ipak upisao 4), pa vraćeno na staru vrednost: sledeća izmena ipak šalje', () => {
      ucitaj();
      store.izmeni(2, { bodovi: 4 });
      tece();
      const [prvi] = evidentiraj();
      server.primeni(prvi.request.body as CreateUradjenDomaciCmd); // server je upisao...
      prvi.flush({ reason: 'x' }, { status: 504, statusText: 'Gateway Timeout' }); // ...a odgovor se izgubio
      expect(store.statusi()[2]).toBe('greska');
      store.izmeni(2, { bodovi: null }); // nazad na ono što je bilo potvrđeno pri učitavanju
      tece();
      const [drugi] = evidentiraj();
      expect(drugi).toBeDefined();
      expect((drugi.request.body as CreateUradjenDomaciCmd).bodovi).toBe(0);
      server.odgovori(drugi);
      expect(store.statusi()[2]).toBe('sacuvano');
      expect(server.studenti[1].bodovi).toBe(0);
    });

    it('zastareo odgovor "oslobodi" ne pregazi noviju potvrdu čuvanja (ni prikaz ni potvrđeno)', async () => {
      ucitaj();
      store.izmeni(2, { bodovi: 4 });
      tece();
      const [cuvanje] = evidentiraj();
      const obecanje = store.oslobodi();
      const oslobodi = http.expectOne('api/domaci/5/oslobodi');
      const preUpisa = server.details(); // server je obradio "oslobodi" pre upisa 4
      server.odgovori(cuvanje); // odgovor čuvanja stiže prvi
      expect(store.statusi()[2]).toBe('sacuvano');
      oslobodi.flush(preUpisa); // zastareo za studenta 2 (bodovi null)
      expect(await obecanje).toBe(true);
      expect(store.vrednosti()[2].bodovi).toBe(4);
      store.izmeni(2, { bodovi: null }); // razlikuje se od potvrđenog 4: mora da se pošalje
      tece();
      const [vracanje] = evidentiraj();
      expect(vracanje).toBeDefined();
      server.odgovori(vracanje);
      expect(server.studenti[1].bodovi).toBe(0);
    });

    it('5 -> 6 -> 5: povratak na domaći 5 čeka upis zatvorene sesije domaćeg 5', () => {
      ucitaj();
      store.izmeni(2, { bodovi: 6 });
      store.ucitaj(6);
      const [upis] = evidentiraj();
      store.ucitaj(5); // pre nego što se 6 uopšte učitao
      http.expectNone('api/domaci/6');
      http.expectNone('api/domaci/5');
      server.odgovori(upis);
      http.expectOne('api/domaci/5').flush(server.details());
      expect(store.domaci()?.id).toBe(5);
      expect(store.vrednosti()[2].bodovi).toBe(6);
    });

    it('napušten ekran pa ponovo otvoren isti domaći (novi store): GET čeka upis prethodnog ekrana', () => {
      const f = TestBed.createComponent(Domacin);
      f.componentInstance.store.ucitaj(5);
      http.expectOne('api/domaci/5').flush(server.details());
      f.componentInstance.store.izmeni(2, { bodovi: 6 });
      f.destroy(); // izmena se šalje
      const [upis] = evidentiraj();
      const drugi = TestBed.createComponent(Domacin);
      drugi.componentInstance.store.ucitaj(5);
      http.expectNone('api/domaci/5'); // registar: sesija napuštenog ekrana još upisuje
      server.odgovori(upis);
      http.expectOne('api/domaci/5').flush(server.details());
      expect(drugi.componentInstance.store.vrednosti()[2].bodovi).toBe(6);
    });

    it('izuzetak u obradi greške ne gasi red studenta: sledeća izmena se šalje, povratak na domaći ne čeka zauvek', () => {
      const handleError = vi.spyOn(TestBed.inject(ErrorHandler), 'handleError').mockImplementation(() => undefined);
      vi.spyOn(TestBed.inject(NotificationStore), 'greska').mockImplementationOnce(() => {
        throw new Error('pukla poruka');
      });
      const f = TestBed.createComponent(Domacin);
      const lokalni = f.componentInstance.store;
      lokalni.ucitaj(5);
      http.expectOne('api/domaci/5').flush(server.details());
      lokalni.izmeni(2, { bodovi: 4 });
      tece();
      evidentiraj()[0].flush({ reason: 'Odbijeno' }, { status: 400, statusText: 'Bad Request' });
      lokalni.izmeni(2, { bodovi: 5 });
      tece();
      const [drugi] = evidentiraj();
      expect(drugi).toBeDefined();
      server.odgovori(drugi);
      expect(lokalni.statusi()[2]).toBe('sacuvano');
      lokalni.izmeni(2, { bodovi: 6 });
      tece();
      const [treci] = evidentiraj(); // u toku dok se ekran napušta
      f.destroy();
      const ponovo = TestBed.createComponent(Domacin).componentInstance.store;
      ponovo.ucitaj(5);
      server.odgovori(treci);
      http.expectOne('api/domaci/5').flush(server.details());
      expect(ponovo.status()).toBe('loaded');
      expect(handleError).toHaveBeenCalledWith(new Error('pukla poruka'));
    });

    it('nesačuvane izmene (čekanje, u toku, neuspelo) se vide u NesacuvaneIzmene; posle potvrde ih nema', () => {
      const nesacuvane = TestBed.inject(NesacuvaneIzmene);
      ucitaj();
      expect(nesacuvane.broj()).toBe(0);
      store.izmeni(2, { bodovi: 4 });
      expect(nesacuvane.broj()).toBe(1);
      tece();
      const [prvi] = evidentiraj();
      expect(nesacuvane.broj()).toBe(1);
      prvi.flush({ reason: 'x' }, { status: 500, statusText: 'Server Error' });
      expect(nesacuvane.broj()).toBe(1);
      store.ponovi(2);
      server.odgovori(evidentiraj()[0]);
      expect(nesacuvane.broj()).toBe(0);
    });
  });

  describe('upozorenje pre zatvaranja kartice (NesacuvaneIzmene)', () => {
    /** `beforeunload` kao iz pregledača; `defaultPrevented` = pregledač pita "Napustiti sajt?". */
    function zatvaranje(): boolean {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    }

    it('slušalac samo dok ima nesačuvanog: izmena ga dodaje, potvrda servera skida', () => {
      const dodaj = vi.spyOn(window, 'addEventListener');
      const ukloni = vi.spyOn(window, 'removeEventListener');
      const broj = (spy: typeof dodaj | typeof ukloni) => spy.mock.calls.filter(([tip]) => tip === 'beforeunload').length;
      ucitaj();
      expect(broj(dodaj)).toBe(0); // učitan domaći bez izmena: bfcache ostaje
      store.izmeni(2, { bodovi: 4 });
      expect(broj(dodaj)).toBe(1);
      expect(zatvaranje()).toBe(true);
      tece();
      server.odgovori(evidentiraj()[0]);
      expect(broj(ukloni)).toBe(1);
      expect(zatvaranje()).toBe(false);
      dodaj.mockRestore();
      ukloni.mockRestore();
    });

    it('greška reda pa "oslobodi" (red postaje samo za čitanje): ništa nesačuvano, zatvaranje ne pita', async () => {
      const nesacuvane = TestBed.inject(NesacuvaneIzmene);
      ucitaj();
      store.izmeni(1, { bodovi: 3 }); // Ana je aktivna (zadatak)
      tece();
      evidentiraj()[0].flush({ reason: 'Greška baze.' }, { status: 400, statusText: 'Bad Request' });
      expect(nesacuvane.broj()).toBe(1);
      expect(zatvaranje()).toBe(true);
      const obecanje = store.oslobodi();
      server.studenti[0] = { ...server.studenti[0], oslobodjen: true, bodovi: 10, uradjenDomaciId: 9 };
      http.expectOne('api/domaci/5/oslobodi').flush(server.details());
      expect(await obecanje).toBe(true);
      expect(nesacuvane.broj()).toBe(0);
      expect(zatvaranje()).toBe(false);
    });

    it('čuvanje u toku pa "oslobodi", pa greška tog čuvanja: oslobođen red ne postaje greška (samo za čitanje)', async () => {
      const nesacuvane = TestBed.inject(NesacuvaneIzmene);
      ucitaj();
      store.izmeni(1, { bodovi: 3 }); // Ana je aktivna (zadatak)
      tece();
      const cuvanje = evidentiraj()[0]; // u toku
      const obecanje = store.oslobodi();
      server.studenti[0] = { ...server.studenti[0], oslobodjen: true, bodovi: 10, uradjenDomaciId: 9 };
      http.expectOne('api/domaci/5/oslobodi').flush(server.details());
      expect(await obecanje).toBe(true);
      cuvanje.flush({ reason: 'Greška baze.' }, { status: 400, statusText: 'Bad Request' });
      expect(store.statusi()[1]).toBeNull();
      expect(store.brojGresaka()).toBe(0);
      expect(nesacuvane.broj()).toBe(0);
      expect(zatvaranje()).toBe(false);
      expect(poruke.filter(p => p.tip === 'greska')).toEqual([]);
    });

    it('greška reda pa završen pregled (tabela samo za čitanje): ništa nesačuvano, zatvaranje ne pita', async () => {
      const nesacuvane = TestBed.inject(NesacuvaneIzmene);
      ucitaj();
      store.izmeni(2, { bodovi: 3 });
      tece();
      evidentiraj()[0].flush({ reason: 'Greška baze.' }, { status: 400, statusText: 'Bad Request' });
      expect(nesacuvane.broj()).toBe(1);
      const obecanje = store.zavrsi();
      http.expectOne(r => r.method === 'PATCH' && r.url === 'api/domaci/5').flush(null);
      expect(await obecanje).toBe(true);
      expect(nesacuvane.broj()).toBe(0);
      expect(zatvaranje()).toBe(false);
    });
  });

  it('napuštanje ekrana (uništen store) šalje izmenu koja je čekala debounce', () => {
    // store provajdovan u komponenti, kao u `DomaciDetalj`: uništava se sa njom, a HttpClient (root) ostaje
    const f = TestBed.createComponent(Domacin);
    const lokalni = f.componentInstance.store;
    lokalni.ucitaj(5);
    http.match('api/domaci/5').forEach(r => r.flush(server.details()));
    lokalni.izmeni(2, { bodovi: 6 });
    f.destroy();
    const zahtevi = evidentiraj();
    expect(zahtevi).toHaveLength(1);
    expect((zahtevi[0].request.body as CreateUradjenDomaciCmd).bodovi).toBe(6);
    zahtevi[0].flush(server.details());
  });
});
