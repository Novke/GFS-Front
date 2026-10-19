import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferenceApi } from '../../../core/api/reference.api';
import { NotificationStore, Poruka } from '../../../core/state/notification.store';
import { ReferenceStore } from '../../../core/state/reference.store';
import { Strana } from '../../../shared/models/strana';
import { BankaApi } from './banka.api';
import { BankaPretragaStavka, PonistavanjeInfo, VarijantaDetails } from './banka.models';
import { filterPregleda, pocetakPregleda, PregledFilter, PregledNacrtaStore, porukaOdbacivanja } from './pregled-nacrta.store';

function stavka(id: number, izmena: Partial<BankaPretragaStavka> = {}): BankaPretragaStavka {
  return {
    varijantaId: id, grupaId: 4, grupaNaziv: '8 → 2', putanja: [{ id: 1, naziv: 'Konverzije' }, { id: 4, naziv: '8 → 2' }],
    naziv: `Zad. ${id}`, status: 'NACRT', renderStatus: 'OK', isecak: 'Pretvori', izvor: 'CLAUDE', serija: 'uvoz-kol1-2024', ...izmena,
  };
}

function varijanta(id: number, izmena: Partial<VarijantaDetails> = {}): VarijantaDetails {
  return {
    id, grupaId: 4, putanja: [{ id: 1, naziv: 'Konverzije' }, { id: 4, naziv: '8 → 2' }], rb: id, naziv: `Zad. ${id}`, tekst: 'Pretvori',
    resenje: null, odgovori: {}, polja: [], prilozi: [], status: 'NACRT', izvor: 'CLAUDE', renderStatus: 'OK', svgId: `svg-${id}`,
    resenjeSvgId: null, renderGreska: null, renderDeo: null, kreirano: '2026-10-18T10:00:00', izmenjeno: '2026-10-18T10:00:00',
    ikadOdobrena: false, zamenjuje: null, serija: 'uvoz-kol1-2024', ...izmena,
  };
}

/** Jedna strana pretrage (`page` od 0) sa `ukupno` stavki u `strana` strana. */
function strana(stavke: BankaPretragaStavka[], broj: number, ukupnoStrana: number, ukupno = stavke.length): Strana<BankaPretragaStavka> {
  return { content: stavke, page: { size: 100, number: broj, totalElements: ukupno, totalPages: ukupnoStrana } };
}

const greskaServera = (status: number, reason = 'Greška.') => throwError(() => new HttpErrorResponse({ status, error: { reason } }));

const FILTER: PregledFilter = { predmet: 1, izvor: null, serija: 'uvoz-kol1-2024', grupa: null, status: 'NACRT' };

describe('filterPregleda', () => {
  it('podrazumevano: status NACRT, ostalo null', () => {
    expect(filterPregleda({})).toEqual({ predmet: null, izvor: null, serija: null, grupa: null, status: 'NACRT' });
  });

  it('ispravne vrednosti iz upita', () => {
    expect(filterPregleda({ predmet: '1', izvor: 'CLAUDE', serija: 'uvoz-kol1-2024', grupa: '4', status: 'AKTIVNA' }))
      .toEqual({ predmet: 1, izvor: 'CLAUDE', serija: 'uvoz-kol1-2024', grupa: 4, status: 'AKTIVNA' });
  });

  it('nevažeće vrednosti su null (status ostaje NACRT)', () => {
    expect(filterPregleda({ predmet: 'x', izvor: 'NEKO', serija: 'Uvoz X', grupa: '0', status: 'SVE' }))
      .toEqual({ predmet: null, izvor: null, serija: null, grupa: null, status: 'NACRT' });
    expect(filterPregleda({ serija: 'ab' }).serija).toBeNull();
  });
});

describe('porukaOdbacivanja', () => {
  it('broji obrisane varijante i grupe, a preskočene dodaje samo kad ih ima', () => {
    const info = (obrisano: PonistavanjeInfo['obrisano'], preskoceno: PonistavanjeInfo['preskoceno'] = []): PonistavanjeInfo =>
      ({ potvrdjeno: true, obrisano, preskoceno });
    const v = (id: number) => ({ vrsta: 'VARIJANTA' as const, id, naziv: null, razlog: null });
    const g = (id: number) => ({ vrsta: 'GRUPA' as const, id, naziv: null, razlog: null });
    expect(porukaOdbacivanja(info([v(1), v(2), g(3)]))).toBe('Obrisano: 2 varijante, 1 grupa.');
    expect(porukaOdbacivanja(info([]))).toBe('Obrisano: 0 varijanti, 0 grupa.');
    expect(porukaOdbacivanja(info([v(1)], [{ ...g(4), razlog: 'Grupa nije prazna.' }]))).toBe('Obrisano: 1 varijanta, 0 grupa. Preskočeno: 1.');
  });
});

describe('pocetakPregleda', () => {
  it('bez `od` prva; `od` u listi je njeno mesto', () => {
    expect(pocetakPregleda([16, 17, 18], null)).toBe(0);
    expect(pocetakPregleda([16, 17, 18], 17)).toBe(1);
  });

  it('`od` van liste: prva nastala posle nje, a kad je nema, kraj (`ids.length`)', () => {
    expect(pocetakPregleda([16, 18], 17)).toBe(1);
    expect(pocetakPregleda([16, 18], 10)).toBe(0);
    expect(pocetakPregleda([16, 17], 18)).toBe(2);
    expect(pocetakPregleda([], 17)).toBe(0);
  });
});

describe('PregledNacrtaStore', () => {
  let store: PregledNacrtaStore;
  let poruke: Poruka[];
  const api = {
    pretraga: vi.fn(),
    varijanta: vi.fn(),
    odobri: vi.fn(),
    obrisiVarijantu: vi.fn(),
    odbaciSeriju: vi.fn(),
  };
  const referenca = {
    predmeti: vi.fn(() => of([{ id: 1, naziv: 'Statika' }, { id: 2, naziv: 'Beton' }])),
    grupe: vi.fn(() => of([])),
    tipoviTesta: vi.fn(() => of([])),
  };

  /** Pretraga sa jednom stranom ovih stavki (za svaki predmet). */
  function lista(...ids: number[]): void {
    api.pretraga.mockImplementation(() => of(strana(ids.map(id => stavka(id)), 0, 1)));
  }

  beforeEach(() => {
    for (const f of Object.values(api)) {
      f.mockReset();
    }
    referenca.predmeti.mockClear();
    api.varijanta.mockImplementation((id: number) => of(varijanta(id)));
    api.odobri.mockImplementation((id: number) => of(varijanta(id, { status: 'AKTIVNA' })));
    api.obrisiVarijantu.mockImplementation(() => of(undefined));
    lista(16, 17, 18);
    TestBed.configureTestingModule({
      providers: [PregledNacrtaStore, { provide: BankaApi, useValue: api }, { provide: ReferenceApi, useValue: referenca }],
    });
    store = TestBed.inject(PregledNacrtaStore);
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe(p => poruke.push(p));
  });

  describe('ucitaj', () => {
    it('spaja dve strane pretrage (po 100) redom nastanka i prikazuje prvu', () => {
      const prva = Array.from({ length: 100 }, (_, i) => stavka(1000 + i));
      api.pretraga.mockImplementation((_f: unknown, s: { page: number }) =>
        of(s.page === 0 ? strana(prva, 0, 2, 102) : strana([stavka(1100), stavka(1101)], 1, 2, 102)));

      store.ucitaj({ ...FILTER, izvor: 'CLAUDE' }, null);

      expect(api.pretraga.mock.calls).toEqual([
        [{ predmetId: 1, namena: null, q: null, status: 'NACRT', izvor: 'CLAUDE', serija: 'uvoz-kol1-2024' }, { page: 0, size: 100, sort: 'id,asc' }, { tiho: true }],
        [{ predmetId: 1, namena: null, q: null, status: 'NACRT', izvor: 'CLAUDE', serija: 'uvoz-kol1-2024' }, { page: 1, size: 100, sort: 'id,asc' }, { tiho: true }],
      ]);
      expect(store.ids()).toHaveLength(102);
      expect(store.ids().slice(98)).toEqual([1098, 1099, 1100, 1101]);
      expect(store.indeks()).toBe(0);
      expect(api.varijanta).toHaveBeenCalledWith(1000, { tiho: true });
      expect(store.trenutna()?.id).toBe(1000);
      expect(store.ucitava()).toBe(false);
      expect(store.napredak()).toBe('1 / 102');
      expect(store.kraj()).toBe(false);
      expect(store.skraceno()).toBe(false);
    });

    it('najviše 10 strana', () => {
      api.pretraga.mockImplementation((_f: unknown, s: { page: number }) => of(strana([stavka(100 + s.page)], s.page, 15, 1500)));
      store.ucitaj(FILTER, null);
      expect(api.pretraga).toHaveBeenCalledTimes(10);
      expect(store.ids()).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
      // server ima 1500, učitano 10: lista je skraćena (stranica to kaže)
      expect(store.skraceno()).toBe(true);
    });

    it('skraceno samo kad server za neki predmet ima više nego što je učitano; nov `ucitaj` ga briše', () => {
      api.pretraga.mockImplementation((f: { predmetId: number }, s: { page: number }) =>
        of(f.predmetId === 1 ? strana([stavka(16)], 0, 1) : strana(s.page === 0 ? [stavka(40)] : [], s.page, 11, 1001)));
      store.ucitaj({ ...FILTER, predmet: null }, null);
      TestBed.tick();
      expect(store.skraceno()).toBe(true);

      lista(16, 17);
      store.ucitaj(FILTER, null);
      expect(store.skraceno()).toBe(false);
    });

    it('počinje od `od` kad je u listi; `od` pre svih je prva, a posle svih kraj (Nazad vraća poslednju)', () => {
      store.ucitaj(FILTER, 18);
      expect(store.indeks()).toBe(2);
      expect(store.trenutna()?.id).toBe(18);
      expect(store.napredak()).toBe('3 / 3');

      store.ucitaj(FILTER, 10);
      expect(store.indeks()).toBe(0);
      expect(store.trenutna()?.id).toBe(16);

      store.ucitaj(FILTER, 99);
      expect(store.kraj()).toBe(true);
      expect(store.trenutna()).toBeNull();
      store.prethodna();
      expect(store.trenutna()?.id).toBe(18);
    });

    it('`od` odobrena u editoru (više nije u listi nacrta): sledeća po id-ju, a preskočena pre nje ostaje iza', () => {
      store.ucitaj(FILTER, null);
      store.sledeca();
      expect(store.trenutna()?.id).toBe(17);
      expect(store.napredak()).toBe('2 / 3');

      // "Sačuvaj i odobri" u editoru: 17 je AKTIVNA, pa je pretraga nacrta više ne vraća; povratak sa `od=17`
      lista(16, 18);
      store.ucitaj(FILTER, 17);
      expect(store.ids()).toEqual([16, 18]);
      expect(store.trenutna()?.id).toBe(18);
      expect(store.napredak()).toBe('2 / 2');
      store.prethodna();
      expect(store.trenutna()?.id).toBe(16);
      expect(store.napredak()).toBe('1 / 2');
    });

    it('`od` poslednja, odobrena u editoru: kraj (ne prva preskočena)', () => {
      lista(16, 17);
      store.ucitaj(FILTER, 18);
      expect(store.kraj()).toBe(true);
      expect(api.varijanta).not.toHaveBeenCalled();
    });

    it('redosled nastanka (`sort=id,asc` na svakoj strani): izmenjena varijanta ostaje na svom mestu posle povratka sa `od`', () => {
      // server kao `BankaPretragaService`: bez `sort` podrazumevano `izmenjeno` opadajuće, pa `id` opadajuće
      const izmenjeno: Record<number, string> = { 16: '2026-10-18T10:10:00', 17: '2026-10-18T10:20:00', 18: '2026-10-18T10:30:00' };
      api.pretraga.mockImplementation((_f: unknown, s: { sort?: string }) => {
        const ids = Object.keys(izmenjeno).map(Number);
        ids.sort(s.sort === 'id,asc' ? (a, b) => a - b : (a, b) => izmenjeno[b].localeCompare(izmenjeno[a]) || b - a);
        return of(strana(ids.map(id => stavka(id)), 0, 1));
      });

      store.ucitaj(FILTER, null);
      expect(api.pretraga.mock.calls.map(c => (c[1] as { sort?: string }).sort)).toEqual(['id,asc']);
      expect(store.ids()).toEqual([16, 17, 18]);
      store.sledeca();
      expect(store.napredak()).toBe('2 / 3');

      // Uredi 17 (PUT pomera `izmenjeno`), pa nazad na pregled sa `od=17`
      izmenjeno[17] = '2026-10-18T11:00:00';
      store.ucitaj(FILTER, 17);
      expect(store.ids()).toEqual([16, 17, 18]);
      expect(store.napredak()).toBe('2 / 3');
      expect(store.trenutna()?.id).toBe(17);
      store.sledeca();
      expect(store.trenutna()?.id).toBe(18);
      expect(store.napredak()).toBe('3 / 3');
    });

    it('`grupa` sužava po putanji (i podgrupe), na klijentu', () => {
      api.pretraga.mockImplementation(() => of(strana([
        stavka(16), stavka(21, { grupaId: 2, putanja: [{ id: 1, naziv: 'Konverzije' }, { id: 2, naziv: '2 → 10' }] }), stavka(18),
      ], 0, 1)));
      store.ucitaj({ ...FILTER, grupa: 4 }, null);
      expect(store.ids()).toEqual([16, 18]);
      store.ucitaj({ ...FILTER, grupa: 1 }, null);
      expect(store.ids()).toEqual([16, 18, 21]);
    });

    it('kopija (`zamenjuje`) učitava i original; original koji ne postoji je null, a kopija se ipak prikazuje', () => {
      api.varijanta.mockImplementation((id: number) => (id === 15 ? of(varijanta(15, { status: 'AKTIVNA', izvor: 'RUCNO' }))
        : of(varijanta(id, { zamenjuje: id === 16 ? 15 : id === 17 ? 9 : null }))));
      api.varijanta.mockImplementationOnce(() => of(varijanta(16, { zamenjuje: 15 })));
      store.ucitaj(FILTER, null);
      expect(store.trenutna()?.id).toBe(16);
      expect(store.original()?.id).toBe(15);

      api.varijanta.mockImplementation((id: number) => (id === 9 ? greskaServera(404) : of(varijanta(id, { zamenjuje: 9 }))));
      store.sledeca();
      expect(store.trenutna()?.id).toBe(17);
      expect(store.original()).toBeNull();
      expect(poruke).toEqual([]);
    });

    it('bez predmeta: pretraga po svim predmetima, spojeno redom nastanka (id)', () => {
      api.pretraga.mockImplementation((f: { predmetId: number }) =>
        of(strana(f.predmetId === 1 ? [stavka(16), stavka(45)] : [stavka(40), stavka(41)], 0, 1)));
      store.ucitaj({ ...FILTER, predmet: null }, null);
      TestBed.tick();
      expect(referenca.predmeti).toHaveBeenCalled();
      expect(api.pretraga.mock.calls.map(c => (c[0] as { predmetId: number }).predmetId)).toEqual([1, 2]);
      expect(store.ids()).toEqual([16, 40, 41, 45]);
      expect(store.trenutna()?.id).toBe(16);
    });

    /** Pretraga po predmetu: predmet 1 ima 16, 17 i 18, ostali ništa (spajanje bez duplikata). */
    function listaPredmeta1(): void {
      api.pretraga.mockImplementation((f: { predmetId: number }) =>
        of(f.predmetId === 1 ? strana([stavka(16), stavka(17), stavka(18)], 0, 1) : strana([], 0, 0)));
    }

    it('bez predmeta, predmeti padnu: greška; jedan `ucitajPonovo` čeka nov odgovor, ne stari snimak greške', () => {
      listaPredmeta1();
      referenca.predmeti.mockReturnValueOnce(greskaServera(502));
      store.ucitaj({ ...FILTER, predmet: null }, null);
      TestBed.tick();
      expect(store.greska()).toBe('Sistemska greška. Pokušaj ponovo.');
      expect(store.ucitava()).toBe(false);
      expect(api.pretraga).not.toHaveBeenCalled();

      store.ucitajPonovo();
      TestBed.tick();
      expect(referenca.predmeti).toHaveBeenCalledTimes(2);
      expect(store.greska()).toBeNull();
      expect(store.ids()).toEqual([16, 17, 18]);
      expect(store.trenutna()?.id).toBe(16);
    });

    it('bez predmeta, predmeti su pali ranije (npr. u ljusci): prvo otvaranje čeka nov pokušaj, ne staru grešku', () => {
      listaPredmeta1();
      referenca.predmeti.mockReturnValueOnce(greskaServera(502));
      const reference = TestBed.inject(ReferenceStore);
      reference.ucitaj();
      TestBed.tick();
      expect(reference.status()).toBe('error');

      const novi = new Subject<{ id: number; naziv: string }[]>();
      referenca.predmeti.mockReturnValueOnce(novi);
      store.ucitaj({ ...FILTER, predmet: null }, null);
      TestBed.tick();
      expect(store.greska()).toBeNull();
      expect(store.ucitava()).toBe(true);
      novi.next([{ id: 1, naziv: 'Statika' }]);
      novi.complete();
      TestBed.tick();
      expect(store.ids()).toEqual([16, 17, 18]);
      expect(store.trenutna()?.id).toBe(16);
    });

    it('bez predmeta: ponovni pokušaj dok predmeti još stižu ne prikazuje staru grešku, a novu grešku da', () => {
      listaPredmeta1();
      referenca.predmeti.mockReturnValueOnce(greskaServera(502));
      store.ucitaj({ ...FILTER, predmet: null }, null);
      TestBed.tick();
      expect(store.greska()).not.toBeNull();

      const drugi = new Subject<{ id: number; naziv: string }[]>();
      referenca.predmeti.mockReturnValueOnce(drugi);
      store.ucitajPonovo();
      TestBed.tick();
      expect(store.greska()).toBeNull();
      expect(store.ucitava()).toBe(true);
      expect(api.pretraga).not.toHaveBeenCalled();
      drugi.error(new HttpErrorResponse({ status: 0 }));
      TestBed.tick();
      expect(store.greska()).toBe('Nema veze sa serverom.');

      const treci = new Subject<{ id: number; naziv: string }[]>();
      referenca.predmeti.mockReturnValueOnce(treci);
      store.ucitajPonovo();
      TestBed.tick();
      expect(store.greska()).toBeNull();
      treci.next([{ id: 1, naziv: 'Statika' }]);
      treci.complete();
      TestBed.tick();
      expect(store.ids()).toEqual([16, 17, 18]);
      expect(store.trenutna()?.id).toBe(16);
      expect(store.greska()).toBeNull();
    });

    it('prazna lista: odmah kraj, bez učitavanja varijante', () => {
      lista();
      store.ucitaj(FILTER, null);
      expect(store.kraj()).toBe(true);
      expect(store.napredak()).toBe('');
      expect(api.varijanta).not.toHaveBeenCalled();
    });

    it('pre prvog učitavanja nije kraj', () => {
      expect(store.kraj()).toBe(false);
    });

    it('greška pretrage: razlog u `greska` (bez kraja), `ucitajPonovo` ponavlja', () => {
      api.pretraga.mockImplementation(() => greskaServera(400, 'Serija mora imati 3 do 60 malih slova, cifara ili crtica.'));
      store.ucitaj(FILTER, null);
      expect(store.greska()).toBe('Serija mora imati 3 do 60 malih slova, cifara ili crtica.');
      expect(store.ucitava()).toBe(false);
      expect(store.kraj()).toBe(false);

      lista(16, 17);
      store.ucitajPonovo();
      expect(store.greska()).toBeNull();
      expect(store.ids()).toEqual([16, 17]);
      expect(store.trenutna()?.id).toBe(16);
    });

    it('varijanta koja je u međuvremenu obrisana (404) se preskače', () => {
      api.varijanta.mockImplementation((id: number) => (id === 16 ? greskaServera(404) : of(varijanta(id))));
      store.ucitaj(FILTER, null);
      expect(store.ids()).toEqual([17, 18]);
      expect(store.trenutna()?.id).toBe(17);
      expect(store.greska()).toBeNull();
    });

    it('druga greška varijante: razlog u `greska`, lista ostaje', () => {
      api.varijanta.mockImplementation(() => greskaServera(500));
      store.ucitaj(FILTER, null);
      expect(store.greska()).toBe('Sistemska greška. Pokušaj ponovo.');
      expect(store.ids()).toEqual([16, 17, 18]);
      expect(store.trenutna()).toBeNull();
      expect(store.kraj()).toBe(false);
    });

    it('nov `ucitaj` dok se varijanta još učitava: stari odgovor se ne prikazuje', () => {
      const kasni = new Subject<VarijantaDetails>();
      api.varijanta.mockImplementationOnce(() => kasni);
      store.ucitaj(FILTER, null);
      expect(store.ucitava()).toBe(true);
      lista(17);
      store.ucitaj(FILTER, null);
      kasni.next(varijanta(16));
      expect(store.trenutna()?.id).toBe(17);
    });
  });

  describe('kretanje', () => {
    beforeEach(() => store.ucitaj(FILTER, null));

    it('sledeća i prethodna; prethodna na prvoj ostaje', () => {
      store.prethodna();
      expect(store.indeks()).toBe(0);
      expect(api.varijanta).toHaveBeenCalledTimes(1);

      store.sledeca();
      expect(store.trenutna()?.id).toBe(17);
      expect(store.napredak()).toBe('2 / 3');
      store.prethodna();
      expect(store.trenutna()?.id).toBe(16);
    });

    it('posle poslednje je kraj; sledeća tada ne baca i ništa ne menja, prethodna vraća poslednju', () => {
      store.sledeca();
      store.sledeca();
      store.sledeca();
      expect(store.kraj()).toBe(true);
      expect(store.trenutna()).toBeNull();
      expect(store.napredak()).toBe('');
      expect(() => store.sledeca()).not.toThrow();
      expect(store.indeks()).toBe(3);

      store.prethodna();
      expect(store.kraj()).toBe(false);
      expect(store.trenutna()?.id).toBe(18);
    });
  });

  describe('akcije', () => {
    beforeEach(() => store.ucitaj(FILTER, null));

    it('odobri: id izlazi iz liste i prikazuje se sledeća', () => {
      store.odobri();
      expect(api.odobri).toHaveBeenCalledWith(16, { tiho: true });
      expect(store.ids()).toEqual([17, 18]);
      expect(store.indeks()).toBe(0);
      expect(store.trenutna()?.id).toBe(17);
      expect(store.napredak()).toBe('1 / 2');
      expect(store.radi()).toBe(false);
    });

    it('odobri poslednje: kraj', () => {
      store.sledeca();
      store.sledeca();
      store.odobri();
      expect(store.ids()).toEqual([16, 17]);
      expect(store.kraj()).toBe(true);
    });

    it('dok akcija traje, druga se ne šalje', () => {
      const kasni = new Subject<VarijantaDetails>();
      api.odobri.mockImplementationOnce(() => kasni);
      store.odobri();
      expect(store.radi()).toBe(true);
      store.odobri();
      store.obrisi();
      expect(api.odobri).toHaveBeenCalledTimes(1);
      expect(api.obrisiVarijantu).not.toHaveBeenCalled();
      kasni.next(varijanta(16, { status: 'AKTIVNA' }));
      kasni.complete();
      expect(store.radi()).toBe(false);
      expect(store.trenutna()?.id).toBe(17);
    });

    it('preskok dok odobravanje traje: posle odgovora ostaje prikazana ona na koju se prešlo', () => {
      const kasni = new Subject<VarijantaDetails>();
      api.odobri.mockImplementationOnce(() => kasni);
      store.odobri();
      store.sledeca();
      expect(store.trenutna()?.id).toBe(17);
      kasni.next(varijanta(16, { status: 'AKTIVNA' }));
      kasni.complete();
      expect(store.ids()).toEqual([17, 18]);
      expect(store.indeks()).toBe(0);
      expect(store.trenutna()?.id).toBe(17);
      expect(store.napredak()).toBe('1 / 2');
      expect(api.varijanta).toHaveBeenCalledTimes(2);
    });

    it('greška odobravanja: poruka, varijanta ostaje', () => {
      api.odobri.mockImplementation(() => greskaServera(409, 'Varijanta se odobrava tek kad je render uspeo.'));
      store.odobri();
      expect(poruke.map(p => p.tekst)).toEqual(['Varijanta se odobrava tek kad je render uspeo.']);
      expect(store.ids()).toEqual([16, 17, 18]);
      expect(store.trenutna()?.id).toBe(16);
      expect(store.radi()).toBe(false);
    });

    it('obriši: DELETE, id izlazi iz liste i prikazuje se sledeća', () => {
      store.sledeca();
      store.obrisi();
      expect(api.obrisiVarijantu).toHaveBeenCalledWith(17, { tiho: true });
      expect(store.ids()).toEqual([16, 18]);
      expect(store.trenutna()?.id).toBe(18);
      expect(store.napredak()).toBe('2 / 2');
    });

    it('bez prikazane varijante (kraj) akcije ne rade ništa', () => {
      store.sledeca();
      store.sledeca();
      store.sledeca();
      store.odobri();
      store.obrisi();
      expect(api.odobri).not.toHaveBeenCalled();
      expect(api.obrisiVarijantu).not.toHaveBeenCalled();
    });

    it('odgovor akcije posle novog učitavanja ne dira novu listu', () => {
      const kasni = new Subject<VarijantaDetails>();
      api.odobri.mockImplementationOnce(() => kasni);
      store.odobri();
      lista(16, 30);
      store.ucitaj(FILTER, null);
      kasni.next(varijanta(16, { status: 'AKTIVNA' }));
      kasni.complete();
      expect(store.ids()).toEqual([16, 30]);
      expect(store.trenutna()?.id).toBe(16);
      expect(store.radi()).toBe(false);
    });

    it('odbaci seriju: POST, poruka sa brojevima i lista iznova (od iste varijante)', () => {
      const info: PonistavanjeInfo = {
        potvrdjeno: true,
        obrisano: [{ vrsta: 'VARIJANTA', id: 16, naziv: null, razlog: null }, { vrsta: 'VARIJANTA', id: 18, naziv: null, razlog: null }],
        preskoceno: [{ vrsta: 'GRUPA', id: 4, naziv: '8 → 2', razlog: 'Grupa nije prazna.' }],
      };
      api.odbaciSeriju.mockImplementation(() => of(info));
      store.sledeca();
      lista(17);
      store.odbaciSeriju();
      expect(api.odbaciSeriju).toHaveBeenCalledWith('uvoz-kol1-2024', { tiho: true });
      expect(poruke.map(p => [p.tip, p.tekst])).toEqual([['uspeh', 'Obrisano: 2 varijante, 0 grupa. Preskočeno: 1.']]);
      expect(store.ids()).toEqual([17]);
      expect(store.trenutna()?.id).toBe(17);
    });

    it('odbaci seriju bez serije u filteru ne radi ništa', () => {
      store.ucitaj({ ...FILTER, serija: null }, null);
      store.odbaciSeriju();
      expect(api.odbaciSeriju).not.toHaveBeenCalled();
    });

    it('greška odbacivanja: poruka, lista ostaje', () => {
      api.odbaciSeriju.mockImplementation((): Observable<never> => greskaServera(400, 'Serija mora imati 3 do 60 malih slova, cifara ili crtica.'));
      store.odbaciSeriju();
      expect(poruke.map(p => p.tekst)).toEqual(['Serija mora imati 3 do 60 malih slova, cifara ili crtica.']);
      expect(store.ids()).toEqual([16, 17, 18]);
    });
  });
});
