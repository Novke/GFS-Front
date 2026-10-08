import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { StudentListItem } from '../../../core/api/studenti.api';
import { NotificationStore, Poruka } from '../../../core/state/notification.store';
import { Strana } from '../../../shared/models/strana';
import { PredavanjeStore } from './predavanje.store';
import { PredavanjeDetails, TipAktivnosti } from './predavanja.models';

const GRUPA = { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 3 };

const student = (id: number, ime: string, prezime: string, indeks: string, grupa = GRUPA): StudentListItem => ({
  id,
  ime,
  prezime,
  indeks,
  godina: grupa?.godinaUpisa ?? null,
  email: null,
  brojTelefona: null,
  grupa,
});

const ANA = student(1, 'Ana', 'Radić', 'GD2');
const MARKO = student(2, 'Marko', 'Ilić', 'GD10');
const JOVANA = student(3, 'Jovana', 'Petrović', 'GD7');
/** Stariji student (ponovac) koji je već zabeležen na predavanju, a nije u grupi. */
const IVANA = { id: 9, ime: 'Ivana', prezime: 'Kostić', indeks: 'GD14' };

const strana = (content: StudentListItem[]): Strana<StudentListItem> => ({
  content,
  page: { size: 100, number: 0, totalElements: content.length, totalPages: 1 },
});

/**
 * Lažni server: stanje aktivnosti po studentu, kao `PredavanjeService` (zvezdica -> `DELETE zadatak` vraća PRISUSTVO).
 * `odgovori` primenjuje zahtev na stanje i vraća `PredavanjeDetails` posle njega.
 */
class Server {
  readonly tipovi = new Map<number, TipAktivnosti>();
  zavrseno = false;
  private sledeciId = 100;
  private readonly ids = new Map<number, number>();
  private readonly imena = new Map<number, { ime: string; prezime: string; indeks: string }>(
    [ANA, MARKO, JOVANA, IVANA].map(s => [s.id, { ime: s.ime, prezime: s.prezime, indeks: s.indeks }]),
  );

  details(): PredavanjeDetails {
    return {
      id: 5,
      rb: 12,
      datum: '2025-10-14',
      tema: 'Petlje',
      posecenost: this.tipovi.size,
      grupa: { id: GRUPA.id, naziv: GRUPA.naziv, godinaUpisa: GRUPA.godinaUpisa },
      predmet: { naziv: 'Uvod u primenu računara' },
      zavrseno: this.zavrseno,
      aktivnosti: [...this.tipovi].map(([sId, tip]) => ({
        id: this.ids.get(sId)!,
        student: { id: sId, ...this.imena.get(sId)! },
        tip,
        napomene: null,
      })),
    };
  }

  postavi(sId: number, tip: TipAktivnosti | null): void {
    if (tip === null) {
      this.tipovi.delete(sId);
      return;
    }
    if (!this.ids.has(sId)) {
      this.ids.set(sId, this.sledeciId++);
    }
    this.tipovi.set(sId, tip);
  }

  /** Primenjuje zahtev i odgovara; vraća opis zahteva (`PATCH prisustvo 1`) za proveru redosleda. */
  odgovori(req: TestRequest): string {
    const { method, url, body } = req.request;
    const m = /^api\/predavanja\/5\/(prisustvo|zadatak|zvezdica)(?:\/(\d+))?$/.exec(url);
    if (!m) {
      throw new Error(`Neočekivan zahtev ${method} ${url}`);
    }
    const sId = method === 'DELETE' ? Number(m[2]) : (body as { id: number }).id;
    const akcija = `${method} ${m[1]} ${sId}`;
    switch (akcija.replace(/ \d+$/, '')) {
      case 'PATCH prisustvo':
        this.postavi(sId, 'PRISUSTVO');
        break;
      case 'DELETE prisustvo':
        this.postavi(sId, null);
        break;
      case 'PATCH zadatak':
        this.postavi(sId, 'ZADATAK');
        break;
      case 'DELETE zadatak':
        this.postavi(sId, 'PRISUSTVO');
        break;
      case 'PATCH zvezdica':
        this.postavi(sId, 'SA_ZVEZDICOM');
        break;
    }
    req.flush(this.details());
    return akcija;
  }
}

describe('PredavanjeStore', () => {
  let http: HttpTestingController;
  let store: PredavanjeStore;
  let server: Server;
  let poruke: Poruka[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PredavanjeStore, provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(PredavanjeStore);
    server = new Server();
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe(p => poruke.push(p));
  });

  afterEach(() => http.verify());

  function ucitaj(): void {
    store.ucitaj(5);
    http.expectOne('api/predavanja/5').flush(server.details());
    const req = http.expectOne(r => r.url === 'api/studenti/pretraga' && r.params.has('grupaId'));
    expect(req.request.params.get('grupaId')).toBe('4');
    req.flush(strana([MARKO, ANA, JOVANA]));
  }

  /** Zahtevi beleženja koji su u toku. `match` ih uklanja iz kontrolera: na svaki vraćeni se mora odgovoriti. */
  const zahteviUToku = () => http.match(r => r.url.startsWith('api/predavanja/5/'));

  /**
   * Odgovara na sve zahteve koji su u toku, **obrnutim redom** (poslednji poslat prvi dobija odgovor), dok ih ima.
   * Vraća redosled kojim ih je server primio (izvršio).
   */
  function odgovaraj(): string[] {
    const izvrseno: string[] = [];
    for (let u = zahteviUToku(); u.length > 0; u = zahteviUToku()) {
      for (const req of [...u].reverse()) {
        izvrseno.push(server.odgovori(req));
      }
    }
    return izvrseno;
  }

  it('učitava predavanje i studente grupe; zabeleženi student van grupe dobija pločicu "stariji"', () => {
    server.postavi(2, 'ZADATAK');
    server.postavi(IVANA.id, 'PRISUSTVO');
    ucitaj();
    // stariji student: grupa i godina upisa se dopunjuju pretragom po indeksu (tiho)
    const dopuna = http.expectOne(r => r.url === 'api/studenti/pretraga' && r.params.get('q') === 'GD14');
    expect(dopuna.request.context.get(LOCAL_ERRORS)).toBe(true);
    expect(store.status()).toBe('loading');
    const gd2024 = { id: 1, naziv: 'GD-2024', godinaUpisa: 2024, brojStudenata: 30 };
    dopuna.flush(strana([student(IVANA.id, IVANA.ime, IVANA.prezime, IVANA.indeks, gd2024), student(10, 'X', 'Y', 'GD140', gd2024)]));

    expect(store.status()).toBe('loaded');
    expect(store.studenti().find(s => s.id === IVANA.id)).toMatchObject({ godina: 2024, grupa: { naziv: 'GD-2024' } });
    expect(store.studenti().map(s => s.indeks)).toEqual(['GD2', 'GD7', 'GD10', 'GD14']); // prirodni redosled indeksa
    expect(store.stanjePoStudentu()).toEqual({ 1: 'odsutan', 2: 'zadatak', 3: 'odsutan', 9: 'prisutan' });
    expect([...store.stariji()]).toEqual([9]);
    expect(store.brojevi()).toEqual({ prisutnoUkupno: 2, prisutnoStarijih: 1, prisutnoIzGrupe: 1, studenataGrupe: 3, zadaci: 1, zvezdice: 0 });
  });

  it('klik kruži: odsutan -> prisutan -> zadatak -> zvezdica -> prisutan (nikad ne briše)', () => {
    ucitaj();
    const koraci: string[] = [];
    for (let i = 0; i < 4; i++) {
      store.klik(1);
      koraci.push(store.stanjePoStudentu()[1]);
      odgovaraj();
    }
    expect(koraci).toEqual(['prisutan', 'zadatak', 'zvezdica', 'prisutan']);
    expect(server.tipovi.get(1)).toBe('PRISUSTVO');
  });

  it('zvezdica -> prisutan ide preko DELETE zadatak (server vraća PRISUSTVO i za SA_ZVEZDICOM)', () => {
    server.postavi(1, 'SA_ZVEZDICOM');
    ucitaj();
    store.klik(1);
    expect(odgovaraj()).toEqual(['DELETE zadatak 1']);
    expect(store.stanjePoStudentu()[1]).toBe('prisutan');
  });

  it('Review Focus 3: prisutan -> zadatak -> zvezdica brzo, odgovori obrnutim redom: konačno zvezdica', () => {
    ucitaj();
    store.klik(1); // odsutan -> prisutan
    store.klik(1); // -> zadatak
    store.klik(1); // -> zvezdica, sve za < 1 s
    expect(store.stanjePoStudentu()[1]).toBe('zvezdica');
    expect(store.cekanje()[1]).toBe(true);
    // po studentu je u svakom trenutku najviše jedan zahtev u toku (match ih uzima, pa se na njih odgovara ovde)
    const prvi = zahteviUToku();
    expect(prvi).toHaveLength(1);

    const izvrseno = [server.odgovori(prvi[0]), ...odgovaraj()];

    expect(store.stanjePoStudentu()[1]).toBe('zvezdica');
    expect(server.tipovi.get(1)).toBe('SA_ZVEZDICOM');
    expect(store.cekanje()[1]).toBe(false);
    // prvi klik je odmah poslat; klikovi koji su stigli dok je on bio u toku sabijaju se u jedan prelaz
    expect(izvrseno).toEqual(['PATCH prisustvo 1', 'PATCH zvezdica 1']);
  });

  it('odgovor koji kasni ne pregazi noviji klik: stanje se usaglašava tek kad u redu nema novijih', () => {
    server.postavi(1, 'PRISUSTVO');
    ucitaj();
    store.klik(1); // -> zadatak (poslato)
    store.klik(1); // -> zvezdica (čeka u redu)
    const [prvi] = zahteviUToku();
    server.odgovori(prvi); // server kaže ZADATAK
    expect(store.stanjePoStudentu()[1]).toBe('zvezdica'); // i dalje poslednji klik
    expect(store.cekanje()[1]).toBe(true);
    odgovaraj();
    expect(store.stanjePoStudentu()[1]).toBe('zvezdica');
    expect(store.cekanje()[1]).toBe(false);
  });

  it('neuspela dopuna starijeg studenta nije greška: pločica ostaje bez godine', () => {
    server.postavi(IVANA.id, 'PRISUSTVO');
    ucitaj();
    http.expectOne(r => r.params.get('q') === 'GD14').flush(null, { status: 500, statusText: 'Server Error' });
    expect(store.status()).toBe('loaded');
    expect(store.studenti().find(s => s.id === IVANA.id)).toMatchObject({ indeks: 'GD14', godina: null, grupa: null });
    expect(store.stariji().has(IVANA.id)).toBe(true);
  });

  it('greška vraća poslednje potvrđeno stanje i javlja grešku (tiho, bez duple poruke interceptora)', () => {
    server.postavi(1, 'PRISUSTVO');
    ucitaj();
    store.klik(1);
    expect(store.stanjePoStudentu()[1]).toBe('zadatak');
    const [req] = zahteviUToku();
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush({ reason: 'Student nije dodat na predavanje!' }, { status: 400, statusText: 'Bad Request' });

    expect(store.stanjePoStudentu()[1]).toBe('prisutan');
    expect(store.cekanje()[1]).toBe(false);
    expect(poruke.filter(p => p.tip === 'greska').map(p => p.tekst)).toEqual(['Ana Radić: Student nije dodat na predavanje!']);
    expect(poruke.some(p => p.tip === 'uspeh')).toBe(false);
  });

  it('greška usred višekoračnog prelaza: stanje je ono što je server potvrdio', () => {
    server.postavi(1, 'SA_ZVEZDICOM');
    ucitaj();
    store.ukloni(1); // -> odsutan
    store.postavi(1, 'zvezdica'); // undo: odsutan -> zvezdica = PATCH prisustvo + PATCH zvezdica
    server.odgovori(zahteviUToku()[0]); // DELETE prisustvo
    server.odgovori(zahteviUToku()[0]); // PATCH prisustvo
    zahteviUToku()[0].flush({ reason: 'Odbijeno.' }, { status: 400, statusText: 'Bad Request' }); // PATCH zvezdica
    expect(store.stanjePoStudentu()[1]).toBe('prisutan');
    expect(server.tipovi.get(1)).toBe('PRISUSTVO');
  });

  it('dva studenta idu paralelno, svaki svojim redom', () => {
    ucitaj();
    store.klik(1);
    store.klik(2);
    const uToku = zahteviUToku();
    expect(uToku.map(r => (r.request.body as { id: number }).id)).toEqual([1, 2]);
    server.odgovori(uToku[1]);
    expect(store.cekanje()).toMatchObject({ 1: true, 2: false });
    server.odgovori(uToku[0]);
    expect(store.stanjePoStudentu()).toMatchObject({ 1: 'prisutan', 2: 'prisutan' });
    expect(store.cekanje()).toMatchObject({ 1: false, 2: false });
  });

  it('posle potvrde: "<Ime Prezime>: <stanje>" sa "Poništi", koje vraća prethodno stanje', () => {
    ucitaj();
    store.klik(3);
    odgovaraj();
    const poruka = poruke.find(p => p.tip === 'uspeh')!;
    expect(poruka.tekst).toBe('Jovana Petrović: prisutan');
    expect(poruka.akcija?.label).toBe('Poništi');
    expect(poruka.grupa).toBe('predavanje-5');

    poruka.akcija!.run();
    expect(store.stanjePoStudentu()[3]).toBe('odsutan');
    expect(odgovaraj()).toEqual(['DELETE prisustvo 3']);
    expect(server.tipovi.has(3)).toBe(false);
  });

  it('klik i postavi na završenom predavanju ne rade ništa', () => {
    server.zavrseno = true;
    ucitaj();
    store.klik(1);
    store.postavi(2, 'zvezdica');
    store.ukloni(3);
    expect(zahteviUToku()).toHaveLength(0);
    expect(store.stanjePoStudentu()).toEqual({ 1: 'odsutan', 2: 'odsutan', 3: 'odsutan' });
  });

  it('dodajStarije dodaje pločice bez duplikata; označene su "stariji"', () => {
    ucitaj();
    const stariji = student(7, 'Luka', 'Pavlović', 'GD1', { id: 2, naziv: 'GD-2024', godinaUpisa: 2024, brojStudenata: 30 });
    store.dodajStarije([stariji, ANA]);
    store.dodajStarije([stariji]);
    expect(store.studenti().map(s => s.id)).toEqual([7, 1, 3, 2]);
    expect(store.stanjePoStudentu()[7]).toBe('odsutan');
    expect([...store.stariji()]).toEqual([7]);
  });

  it('napomena ide na aktivnost studenta (PUT predavanja/aktivnost/{id})', () => {
    server.postavi(1, 'PRISUSTVO');
    ucitaj();
    store.napomena(1, 'Kasnio 10 min');
    const req = http.expectOne('api/predavanja/aktivnost/100');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ napomene: 'Kasnio 10 min' });
    req.flush({ ...server.details().aktivnosti[0], napomene: 'Kasnio 10 min' });
    expect(store.predavanje()!.aktivnosti[0].napomene).toBe('Kasnio 10 min');
  });

  it('izmeniZaglavlje i zavrsi menjaju samo zaglavlje; posle zavrsi klik ne radi ništa', async () => {
    ucitaj();
    const izmena = store.izmeniZaglavlje({ rb: 13, tema: 'Nizovi', datum: '2025-10-15' });
    const put = http.expectOne('api/predavanja/5');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ rb: 13, tema: 'Nizovi', datum: '2025-10-15' });
    put.flush({ ...server.details(), rb: 13, tema: 'Nizovi', datum: '2025-10-15' });
    expect(await izmena).toBe(true);
    expect(store.predavanje()).toMatchObject({ rb: 13, tema: 'Nizovi', datum: '2025-10-15' });

    const kraj = store.zavrsi();
    const patch = http.expectOne('api/predavanja/5');
    expect(patch.request.method).toBe('PATCH');
    patch.flush({ ...server.details(), zavrseno: true });
    expect(await kraj).toBe(true);
    expect(store.zavrseno()).toBe(true);
    store.klik(1);
    expect(zahteviUToku()).toHaveLength(0);
  });
});
