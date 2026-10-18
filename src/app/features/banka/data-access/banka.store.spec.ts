import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationStore, Poruka } from '../../../core/state/notification.store';
import { BankaApi } from './banka.api';
import { GrupaCvor, GrupaDetails, VarijantaDetails, VarijantaInfo } from './banka.models';
import { BankaStore } from './banka.store';

function cvor(id: number, naziv: string, deca: GrupaCvor[] = [], izmena: Partial<GrupaCvor> = {}): GrupaCvor {
  return {
    id, naziv, rb: id, tezina: deca.length ? null : 2, list: deca.length === 0, brojVarijanti: 0, brojAktivnih: 0, brojNacrta: 0,
    brojGresaka: 0, deca, ...izmena,
  };
}

/** Konverzije (1) -> "2 → 10" (2, 3 varijante, 1 aktivna, 2 nacrta, 1 greška) i "16 → 2" (3, 1 aktivna); zasebna grupa Osnove (4). */
function stablo(): GrupaCvor[] {
  return [
    cvor(1, 'Konverzije brojeva', [
      cvor(2, '2 → 10', [], { brojVarijanti: 3, brojAktivnih: 1, brojNacrta: 2, brojGresaka: 1 }),
      cvor(3, '16 → 2', [], { brojVarijanti: 1, brojAktivnih: 1 }),
    ], { brojVarijanti: 4, brojAktivnih: 2, brojNacrta: 2, brojGresaka: 1 }),
    cvor(4, 'Osnove'),
  ];
}

function detalji(id: number, izmena: Partial<GrupaDetails> = {}): GrupaDetails {
  const nadji = (lista: GrupaCvor[], putanja: { id: number; naziv: string }[]): { id: number; naziv: string }[] | null => {
    for (const c of lista) {
      const p = [...putanja, { id: c.id, naziv: c.naziv }];
      const dalje = c.id === id ? p : nadji(c.deca, p);
      if (dalje) {
        return dalje;
      }
    }
    return null;
  };
  const putanja = nadji(stablo(), []) ?? [{ id, naziv: `Grupa ${id}` }];
  return {
    id, predmetId: 7, roditeljId: putanja.length > 1 ? putanja[putanja.length - 2].id : null, namena: 'PREDAVANJE',
    naziv: putanja[putanja.length - 1].naziv, opis: 'Opis grupe', rb: id, tezina: 2, uputstvo: 'Uputstvo za Claude-a',
    polja: [], putanja, list: id !== 1, brojVarijanti: 0, brojAktivnih: 0, brojNacrta: 0, brojGresaka: 0,
    izmenjeno: '2026-10-17T10:00:00', ...izmena,
  };
}

function varijanta(id: number, status: VarijantaInfo['status'], renderStatus: VarijantaInfo['renderStatus'] = 'OK'): VarijantaInfo {
  return {
    id, grupaId: 2, rb: id, naziv: `Varijanta ${id}`, status, izvor: 'RUCNO', renderStatus,
    svgId: renderStatus === 'OK' ? `svg-${id}` : null, resenjeSvgId: null, izmenjeno: '2026-10-17T10:00:00',
  };
}

const VARIJANTE_2: VarijantaInfo[] = [varijanta(11, 'NACRT'), varijanta(12, 'AKTIVNA'), varijanta(13, 'NACRT', 'GRESKA')];

/** Odgovor koji test pušta kad hoće (`stigni`), da se proveri šta radi store dok je zahtev u letu. */
function kasni<T>(): Subject<T> & { stigni(vrednost: T): void } {
  const s = new Subject<T>();
  return Object.assign(s, {
    stigni(vrednost: T) {
      s.next(vrednost);
      s.complete();
    },
  });
}

function greskaServera(status: number, reason: string): Observable<never> {
  return throwError(() => new HttpErrorResponse({ status, error: { reason } }));
}

describe('BankaStore', () => {
  let store: InstanceType<typeof BankaStore>;
  let poruke: Poruka[];
  const api = {
    stablo: vi.fn(),
    grupa: vi.fn(),
    varijante: vi.fn(),
    kreirajGrupu: vi.fn(),
    izmeniGrupu: vi.fn(),
    obrisiGrupu: vi.fn(),
    premesti: vi.fn(),
    odobri: vi.fn(),
    arhiviraj: vi.fn(),
    vratiUNacrt: vi.fn(),
    obrisiVarijantu: vi.fn(),
    dupliraj: vi.fn(),
  };

  beforeEach(() => {
    for (const f of Object.values(api)) {
      f.mockReset();
    }
    api.stablo.mockImplementation(() => of(stablo()));
    api.grupa.mockImplementation((id: number) => of(detalji(id)));
    api.varijante.mockImplementation((id: number) => of(id === 2 ? VARIJANTE_2 : []));
    api.odobri.mockImplementation(() => of({} as VarijantaDetails));
    TestBed.configureTestingModule({ providers: [BankaStore, { provide: BankaApi, useValue: api }] });
    store = TestBed.inject(BankaStore);
    poruke = [];
    TestBed.inject(NotificationStore).poruke$.subscribe(p => poruke.push(p));
  });

  describe('ucitaj', () => {
    it('puni stablo, bira prvi list i učitava njegovu grupu i varijante', () => {
      store.ucitaj(7, 'PREDAVANJE');

      expect(api.stablo).toHaveBeenCalledWith(7, 'PREDAVANJE', { tiho: true });
      expect(store.status()).toBe('loaded');
      expect(store.predmetId()).toBe(7);
      expect(store.namena()).toBe('PREDAVANJE');
      expect(store.stablo()).toEqual(stablo());
      expect(store.izabranaGrupaId()).toBe(2);
      expect(api.grupa).toHaveBeenCalledWith(2, { tiho: true });
      expect(api.varijante).toHaveBeenCalledWith(2, undefined, { tiho: true });
      expect(store.grupa()?.id).toBe(2);
      expect(store.varijante()).toEqual(VARIJANTE_2);
      expect(poruke).toEqual([]);
    });

    it('izabrana grupa iz poziva (povratak iz editora) ima prednost, ako postoji u stablu', () => {
      store.ucitaj(7, 'PREDAVANJE', 3);
      expect(store.izabranaGrupaId()).toBe(3);
      expect(store.grupa()?.id).toBe(3);

      store.ucitaj(7, 'PREDAVANJE', 999);
      expect(store.izabranaGrupaId()).toBe(2);
    });

    it('prazno stablo: ništa nije izabrano i grupa se ne traži', () => {
      api.stablo.mockImplementation(() => of([]));
      store.ucitaj(7, 'TEST');

      expect(store.status()).toBe('loaded');
      expect(store.stablo()).toEqual([]);
      expect(store.izabranaGrupaId()).toBeNull();
      expect(store.grupa()).toBeNull();
      expect(api.grupa).not.toHaveBeenCalled();
      expect(api.varijante).not.toHaveBeenCalled();
    });

    it('greška API-ja: status "error" sa razlogom i poruka u NotificationStore', () => {
      api.stablo.mockImplementation(() => greskaServera(404, 'Predmet ne postoji.'));
      store.ucitaj(7, 'PREDAVANJE');

      expect(store.status()).toBe('error');
      expect(store.imaGresku()).toBe(true);
      expect(store.greska()).toBe('Predmet ne postoji.');
      expect(poruke).toEqual([{ tip: 'greska', tekst: 'Predmet ne postoji.', akcija: undefined }]);
      expect(api.grupa).not.toHaveBeenCalled();
    });

    it('istek (504) učitavanja: "pokušaj ponovo" (čitanje), bez provere banke', () => {
      api.stablo.mockImplementation(() => greskaServera(504, 'Gateway Timeout'));
      store.ucitaj(7, 'PREDAVANJE');
      expect(store.greska()).toBe('Zahtev je istekao, pokušaj ponovo.');
      expect(poruke.map(p => p.tekst)).toEqual(['Zahtev je istekao, pokušaj ponovo.']);
    });

    it('drugi predmet ili namena odmah brišu tuđe stablo, izbor i varijante, pa stari odgovori ne stižu', () => {
      store.ucitaj(7, 'PREDAVANJE');
      const novoStablo = kasni<GrupaCvor[]>();
      api.stablo.mockImplementationOnce(() => novoStablo);
      store.ucitaj(8, 'TEST');

      expect(store.ucitava()).toBe(true);
      expect(store.predmetId()).toBe(8);
      expect(store.namena()).toBe('TEST');
      expect(store.stablo()).toEqual([]);
      expect(store.izabranaGrupaId()).toBeNull();
      expect(store.grupa()).toBeNull();
      expect(store.varijante()).toEqual([]);

      novoStablo.stigni([cvor(40, 'Test grupa')]);
      expect(store.izabranaGrupaId()).toBe(40);
    });

    it('odgovor za grupu starog predmeta, koji stigne dok se novo stablo još učitava, ne prepisuje novo stanje', () => {
      const kasna = kasni<GrupaDetails>();
      api.grupa.mockImplementationOnce(() => kasna);
      store.ucitaj(7, 'PREDAVANJE');
      api.stablo.mockImplementationOnce(() => kasni<GrupaCvor[]>());
      store.ucitaj(8, 'TEST');

      kasna.stigni(detalji(2));
      expect(store.grupa()).toBeNull();
      expect(store.izabranaGrupaId()).toBeNull();
    });

    it('izmena koja se završi dok se novo stablo prvi put učitava ne ostavlja status "loading" (trka sa ucitaj)', () => {
      store.ucitaj(7, 'PREDAVANJE');
      const odobrenje = kasni<VarijantaDetails>();
      api.odobri.mockImplementationOnce(() => odobrenje);
      store.odobri(11);
      api.stablo.mockImplementationOnce(() => kasni<GrupaCvor[]>());
      store.ucitaj(8, 'TEST', 40);
      api.stablo.mockImplementation(() => of([cvor(41, 'Druga'), cvor(40, 'Test grupa')]));

      // osvežavanje posle izmene prekida prvo učitavanje novog stabla, pa mora samo da ga završi (i izbor iz `ucitaj`)
      odobrenje.stigni({} as VarijantaDetails);

      expect(api.stablo).toHaveBeenLastCalledWith(8, 'TEST', { tiho: true });
      expect(store.status()).toBe('loaded');
      expect(store.stablo().map(c => c.id)).toEqual([41, 40]);
      expect(store.izabranaGrupaId()).toBe(40);
    });

    it('neuspelo osvežavanje usred prvog učitavanja daje status "error"', () => {
      store.ucitaj(7, 'PREDAVANJE');
      const odobrenje = kasni<VarijantaDetails>();
      api.odobri.mockImplementationOnce(() => odobrenje);
      store.odobri(11);
      api.stablo.mockImplementationOnce(() => kasni<GrupaCvor[]>());
      store.ucitaj(8, 'TEST');
      api.stablo.mockImplementation(() => greskaServera(404, 'Predmet nije pronađen.'));

      odobrenje.stigni({} as VarijantaDetails);

      expect(store.status()).toBe('error');
      expect(store.greska()).toBe('Predmet nije pronađen.');
    });
  });

  describe('izaberi', () => {
    beforeEach(() => store.ucitaj(7, 'PREDAVANJE'));

    it('učitava grupu i varijante izabrane grupe', () => {
      store.izaberi(3);

      expect(store.izabranaGrupaId()).toBe(3);
      expect(store.grupa()?.id).toBe(3);
      expect(store.varijante()).toEqual([]);
    });

    it('do odgovora ne prikazuje grupu i varijante prethodnog izbora, a stariji odgovor kasni bez efekta', () => {
      const kasnaGrupa = kasni<GrupaDetails>();
      api.grupa.mockImplementationOnce(() => kasnaGrupa);
      store.izaberi(3);
      expect(store.izabranaGrupaId()).toBe(3);
      expect(store.grupa()).toBeNull();
      expect(store.varijante()).toEqual([]);

      store.izaberi(2);
      expect(store.grupa()?.id).toBe(2);
      kasnaGrupa.stigni(detalji(3));
      expect(store.grupa()?.id).toBe(2);
      expect(store.varijante()).toEqual(VARIJANTE_2);
    });

    it('unutrašnji čvor: grupa se učitava, a varijanti nema', () => {
      store.izaberi(1);
      expect(store.grupa()?.list).toBe(false);
      expect(store.varijante()).toEqual([]);
    });

    it('null skida izbor', () => {
      store.izaberi(null);
      expect(store.izabranaGrupaId()).toBeNull();
      expect(store.grupa()).toBeNull();
      expect(store.varijante()).toEqual([]);
    });

    it('greška API-ja: poruka u NotificationStore, grupa i varijante prazne', () => {
      api.varijante.mockImplementationOnce(() => greskaServera(404, 'Grupa zadataka ne postoji.'));
      store.izaberi(3);

      expect(poruke).toEqual([{ tip: 'greska', tekst: 'Grupa zadataka ne postoji.', akcija: undefined }]);
      expect(store.izabranaGrupaId()).toBe(3);
      expect(store.grupa()).toBeNull();
      expect(store.varijante()).toEqual([]);
      expect(store.status()).toBe('loaded');
      expect(store.greskaGrupe()).toBe('Grupa zadataka ne postoji.');
    });

    it('istek (504) učitavanja grupe: "pokušaj ponovo"', () => {
      api.grupa.mockImplementationOnce(() => greskaServera(504, 'Gateway Timeout'));
      store.izaberi(3);
      expect(store.greskaGrupe()).toBe('Zahtev je istekao, pokušaj ponovo.');
    });

    it('greskaGrupe se briše sa novim izborom i sa uspelim ponovnim učitavanjem', () => {
      expect(store.greskaGrupe()).toBeNull();
      api.varijante.mockImplementationOnce(() => greskaServera(500, 'Interna greška.'));
      store.izaberi(3);
      expect(store.greskaGrupe()).toBe('Sistemska greška. Pokušaj ponovo.');

      const kasna = kasni<GrupaDetails>();
      api.grupa.mockImplementationOnce(() => kasna);
      store.izaberi(2);
      expect(store.greskaGrupe()).toBeNull();
      kasna.stigni(detalji(2));
      expect(store.grupa()?.id).toBe(2);

      api.varijante.mockImplementationOnce(() => greskaServera(500, 'Interna greška.'));
      store.osveziStablo();
      expect(store.greskaGrupe()).not.toBeNull();
      store.osveziStablo();
      expect(store.greskaGrupe()).toBeNull();
      expect(store.varijante()).toEqual(VARIJANTE_2);
    });
  });

  describe('filter i izvedeni podaci', () => {
    beforeEach(() => store.ucitaj(7, 'PREDAVANJE'));

    it('postaviFilter filtrira varijante po statusu, "SVE" ih vraća', () => {
      expect(store.filterStatusa()).toBe('SVE');
      expect(store.filtriraneVarijante().map(v => v.id)).toEqual([11, 12, 13]);

      store.postaviFilter('NACRT');
      expect(store.filtriraneVarijante().map(v => v.id)).toEqual([11, 13]);
      store.postaviFilter('AKTIVNA');
      expect(store.filtriraneVarijante().map(v => v.id)).toEqual([12]);
      store.postaviFilter('ARHIVIRANA');
      expect(store.filtriraneVarijante()).toEqual([]);
      store.postaviFilter('SVE');
      expect(store.filtriraneVarijante()).toHaveLength(3);
    });

    it('izbor druge grupe čuva filter statusa', () => {
      store.postaviFilter('NACRT');
      store.izaberi(3);
      expect(store.filterStatusa()).toBe('NACRT');
    });

    it('putanja je od korena do izabrane grupe', () => {
      expect(store.putanja()).toEqual([{ id: 1, naziv: 'Konverzije brojeva' }, { id: 2, naziv: '2 → 10' }]);
      store.izaberi(4);
      expect(store.putanja()).toEqual([{ id: 4, naziv: 'Osnove' }]);
      store.izaberi(null);
      expect(store.putanja()).toEqual([]);
    });

    it('brojaciIzabrane su brojači čvora izabrane grupe (unutrašnji čvor: zbir podstabla), nule bez izbora', () => {
      expect(store.brojaciIzabrane()).toEqual({ brojVarijanti: 3, brojAktivnih: 1, brojNacrta: 2, brojGresaka: 1 });
      store.izaberi(1);
      expect(store.brojaciIzabrane()).toEqual({ brojVarijanti: 4, brojAktivnih: 2, brojNacrta: 2, brojGresaka: 1 });
      store.izaberi(null);
      expect(store.brojaciIzabrane()).toEqual({ brojVarijanti: 0, brojAktivnih: 0, brojNacrta: 0, brojGresaka: 0 });
    });
  });

  it('osveziStablo bez učitanog predmeta ne radi ništa', () => {
    store.osveziStablo();
    expect(api.stablo).not.toHaveBeenCalled();
    expect(store.status()).toBe('idle');
  });

  describe('osveziStablo', () => {
    beforeEach(() => store.ucitaj(7, 'PREDAVANJE'));

    it('ponovo učitava stablo, grupu i varijante izabrane grupe bez ekrana učitavanja', () => {
      const novo = stablo();
      novo[0].deca[0].brojAktivnih = 2;
      api.stablo.mockImplementation(() => of(novo));
      const kasna = kasni<GrupaCvor[]>();
      api.stablo.mockImplementationOnce(() => kasna);

      store.osveziStablo();
      expect(store.status()).toBe('loaded');
      expect(store.stablo()).toEqual(stablo());
      kasna.stigni(novo);

      expect(store.stablo()[0].deca[0].brojAktivnih).toBe(2);
      expect(store.izabranaGrupaId()).toBe(2);
      expect(api.grupa).toHaveBeenCalledTimes(2);
      expect(api.varijante).toHaveBeenCalledTimes(2);
    });

    it('izabrane grupe više nema u stablu: bira se prvi list', () => {
      api.stablo.mockImplementation(() => of([cvor(4, 'Osnove')]));
      store.osveziStablo();
      expect(store.izabranaGrupaId()).toBe(4);
      expect(store.grupa()?.id).toBe(4);
    });

    it('greška: poruka, a stari prikaz ostaje', () => {
      api.stablo.mockImplementation(() => greskaServera(500, 'Interna greška.'));
      store.osveziStablo();

      expect(poruke).toHaveLength(1);
      expect(poruke[0].tip).toBe('greska');
      expect(store.status()).toBe('loaded');
      expect(store.stablo()).toEqual(stablo());
      expect(store.grupa()?.id).toBe(2);
    });

  });

  describe('izmene varijanti', () => {
    beforeEach(() => {
      store.ucitaj(7, 'PREDAVANJE');
      store.postaviFilter('NACRT');
      api.stablo.mockClear();
      api.grupa.mockClear();
      api.varijante.mockClear();
    });

    it.each([
      ['odobri', 'odobri', 11],
      ['arhiviraj', 'arhiviraj', 12],
      ['vratiUNacrt', 'vratiUNacrt', 12],
      ['obrisiVarijantu', 'obrisiVarijantu', 13],
      ['dupliraj', 'dupliraj', 11],
    ] as const)('%s zove API, pa ponovo učitava stablo i varijante izabrane grupe uz isti izbor i filter', (metoda, apiMetoda, id) => {
      api[apiMetoda].mockImplementation(() => of({}));
      store[metoda](id);

      expect(api[apiMetoda]).toHaveBeenCalledWith(id, { tiho: true });
      expect(api.stablo).toHaveBeenCalledTimes(1);
      expect(api.grupa).toHaveBeenCalledWith(2, { tiho: true });
      expect(api.varijante).toHaveBeenCalledWith(2, undefined, { tiho: true });
      expect(store.izabranaGrupaId()).toBe(2);
      expect(store.filterStatusa()).toBe('NACRT');
      expect(poruke).toEqual([]);
    });

    it('greška servera (409) ide u NotificationStore sa razlogom i ništa se ne učitava ponovo', () => {
      api.odobri.mockImplementation(() => greskaServera(409, 'Render nije uspeo.'));
      store.odobri(13);

      expect(poruke).toEqual([{ tip: 'greska', tekst: 'Render nije uspeo.', akcija: undefined }]);
      expect(api.stablo).not.toHaveBeenCalled();
      expect(store.izabranaGrupaId()).toBe(2);
    });

    it.each([
      ['dupliraj', 'dupliraj', 11],
      ['obrisiVarijantu', 'obrisiVarijantu', 13],
    ] as const)('%s: zauzeto dok zahtev traje (dvostruki klik ne pravi dva zahteva), posle uspeha i greške slobodno', (metoda, apiMetoda, id) => {
      expect(store.zauzeto()).toBe(false);
      const odgovor = kasni<unknown>();
      api[apiMetoda].mockImplementationOnce(() => odgovor);
      store[metoda](id);
      expect(store.zauzeto()).toBe(true);
      odgovor.stigni({});
      expect(store.zauzeto()).toBe(false);

      api[apiMetoda].mockImplementationOnce(() => greskaServera(409, 'Korišćeno na času; arhiviraj.'));
      store[metoda](id);
      expect(store.zauzeto()).toBe(false);
    });

    it('odobri, arhiviraj i vratiUNacrt (idempotentne) ne zauzimaju stranicu', () => {
      const odgovor = kasni<VarijantaDetails>();
      api.odobri.mockImplementationOnce(() => odgovor);
      store.odobri(11);
      expect(store.zauzeto()).toBe(false);
      odgovor.stigni({} as VarijantaDetails);
    });

    it('dve zauzimajuće izmene: slobodno tek kad se obe završe', () => {
      const prva = kasni<VarijantaDetails>();
      const druga = kasni<VarijantaDetails>();
      api.dupliraj.mockImplementationOnce(() => prva).mockImplementationOnce(() => druga);
      store.dupliraj(11);
      store.dupliraj(12);
      prva.stigni({} as VarijantaDetails);
      expect(store.zauzeto()).toBe(true);
      druga.stigni({} as VarijantaDetails);
      expect(store.zauzeto()).toBe(false);
    });

    it('5xx: 500 opšta poruka (bez detalja servera), 503 render servis, 504 istek bez poziva na ponovni pokušaj', () => {
      api.dupliraj.mockImplementationOnce(() => greskaServera(500, 'NullPointerException'))
        .mockImplementationOnce(() => greskaServera(503, 'Render servis nije dostupan.'))
        .mockImplementationOnce(() => greskaServera(504, 'Gateway Timeout'));
      store.dupliraj(11);
      store.dupliraj(11);
      store.dupliraj(11);
      expect(poruke.map(p => p.tekst)).toEqual([
        'Sistemska greška. Pokušaj ponovo.',
        'Render servis nije dostupan.',
        'Zahtev je istekao. Proveri u banci da li je sačuvano pre ponovnog pokušaja.',
      ]);
    });
  });

  describe('izmene grupa', () => {
    beforeEach(() => {
      store.ucitaj(7, 'PREDAVANJE');
      api.stablo.mockClear();
      api.grupa.mockClear();
      api.varijante.mockClear();
    });

    it('kreirajGrupu šalje komandu, ponovo učitava stablo i bira novu grupu', () => {
      const cmd = { predmetId: 7, roditeljId: 1, naziv: '8 → 2', opis: null, tezina: 3, uputstvo: null, polja: null };
      api.kreirajGrupu.mockImplementation(() => of(detalji(50)));
      const novo = stablo();
      novo[0].deca.push(cvor(50, '8 → 2'));
      api.stablo.mockImplementation(() => of(novo));

      store.kreirajGrupu(cmd);

      expect(api.kreirajGrupu).toHaveBeenCalledWith(cmd, { tiho: true });
      expect(store.stablo()[0].deca.map(c => c.id)).toEqual([2, 3, 50]);
      expect(store.izabranaGrupaId()).toBe(50);
      expect(api.grupa).toHaveBeenCalledWith(50, { tiho: true });
    });

    it('preimenuj izabrane grupe šalje PUT sa učitanim opisom, težinom i uputstvom i "polja": null (šema ostaje)', () => {
      api.izmeniGrupu.mockImplementation(() => of(detalji(2, { naziv: 'Binarno u dekadno' })));
      store.preimenuj(2, '  Binarno u dekadno ');

      expect(api.izmeniGrupu).toHaveBeenCalledWith(
        2, { naziv: 'Binarno u dekadno', tezina: 2, opis: 'Opis grupe', uputstvo: 'Uputstvo za Claude-a', polja: null }, { tiho: true });
      // grupa se čita tek posle izmene (ponovno učitavanje), ne pre nje
      expect(api.grupa).toHaveBeenCalledTimes(1);
      expect(api.grupa.mock.invocationCallOrder[0]).toBeGreaterThan(api.izmeniGrupu.mock.invocationCallOrder[0]);
      expect(api.stablo).toHaveBeenCalledTimes(1);
    });

    it('preimenuj sa težinom šalje novu težinu (null briše), bez nje ostaje učitana', () => {
      api.izmeniGrupu.mockImplementation(() => of(detalji(2)));
      store.preimenuj(2, '2 → 10', 4);
      expect(api.izmeniGrupu).toHaveBeenLastCalledWith(
        2, { naziv: '2 → 10', tezina: 4, opis: 'Opis grupe', uputstvo: 'Uputstvo za Claude-a', polja: null }, { tiho: true });
      store.preimenuj(2, '2 → 10', null);
      expect(api.izmeniGrupu.mock.lastCall?.[1].tezina).toBeNull();
    });

    it.each([
      ['kreirajGrupu', 'kreirajGrupu'],
      ['obrisiGrupu', 'obrisiGrupu'],
    ] as const)('%s: zauzeto dok zahtev traje', (metoda, apiMetoda) => {
      const odgovor = kasni<unknown>();
      api[apiMetoda].mockImplementationOnce(() => odgovor);
      if (metoda === 'kreirajGrupu') {
        store.kreirajGrupu({ predmetId: 7, namena: 'PREDAVANJE', roditeljId: null, naziv: 'Nova', opis: null, tezina: null, uputstvo: null, polja: null });
      } else {
        store.obrisiGrupu(4);
      }
      expect(store.zauzeto()).toBe(true);
      odgovor.stigni(metoda === 'kreirajGrupu' ? detalji(50) : undefined);
      expect(store.zauzeto()).toBe(false);
    });

    it('preimenuj i premesti ne zauzimaju stranicu', () => {
      api.izmeniGrupu.mockImplementationOnce(() => kasni<GrupaDetails>());
      store.preimenuj(2, 'Novo ime');
      api.premesti.mockImplementationOnce(() => kasni<GrupaDetails>());
      store.premesti(3, { roditeljId: null, rb: null });
      expect(store.zauzeto()).toBe(false);
    });

    it('preimenuj druge grupe prvo čita njene podatke', () => {
      api.grupa.mockImplementation((id: number) => of(detalji(id, { opis: null, tezina: 4, uputstvo: null })));
      api.izmeniGrupu.mockImplementation(() => of(detalji(3)));
      store.preimenuj(3, 'Heksadekadno u binarno');

      expect(api.grupa).toHaveBeenCalledWith(3, { tiho: true });
      expect(api.izmeniGrupu).toHaveBeenCalledWith(
        3, { naziv: 'Heksadekadno u binarno', tezina: 4, opis: null, uputstvo: null, polja: null }, { tiho: true });
      expect(store.izabranaGrupaId()).toBe(2);
    });

    it('preimenuj: greška servera (400) ide u NotificationStore', () => {
      api.izmeniGrupu.mockImplementation(() => greskaServera(400, 'Naziv grupe mora imati 1 do 120 znakova.'));
      store.preimenuj(2, '');
      expect(poruke).toEqual([{ tip: 'greska', tekst: 'Naziv grupe mora imati 1 do 120 znakova.', akcija: undefined }]);
      expect(api.stablo).not.toHaveBeenCalled();
    });

    it('premesti šalje komandu i čuva izbor', () => {
      api.premesti.mockImplementation(() => of(detalji(3)));
      store.premesti(3, { roditeljId: null, rb: 1 });

      expect(api.premesti).toHaveBeenCalledWith(3, { roditeljId: null, rb: 1 }, { tiho: true });
      expect(api.stablo).toHaveBeenCalledTimes(1);
      expect(store.izabranaGrupaId()).toBe(2);
    });

    it('obrisiGrupu izabrane grupe bira njenog roditelja', () => {
      api.obrisiGrupu.mockImplementation(() => of(undefined));
      api.stablo.mockImplementation(() => of([cvor(1, 'Konverzije brojeva', [cvor(3, '16 → 2')]), cvor(4, 'Osnove')]));
      store.obrisiGrupu(2);

      expect(api.obrisiGrupu).toHaveBeenCalledWith(2, { tiho: true });
      expect(store.izabranaGrupaId()).toBe(1);
      expect(api.grupa).toHaveBeenCalledWith(1, { tiho: true });
    });

    it('obrisiGrupu izabrane grupe bez roditelja bira prvi list', () => {
      store.izaberi(4);
      api.obrisiGrupu.mockImplementation(() => of(undefined));
      api.stablo.mockImplementation(() => of([cvor(1, 'Konverzije brojeva', [cvor(3, '16 → 2')])]));
      store.obrisiGrupu(4);

      expect(store.izabranaGrupaId()).toBe(3);
    });

    it('obrisiGrupu druge grupe čuva izbor', () => {
      api.obrisiGrupu.mockImplementation(() => of(undefined));
      store.obrisiGrupu(4);
      expect(store.izabranaGrupaId()).toBe(2);
    });

    it('obrisiGrupu: 409 (ima podgrupe) ide u NotificationStore, izbor ostaje', () => {
      api.obrisiGrupu.mockImplementation(() => greskaServera(409, 'Grupa ima podgrupe.'));
      store.obrisiGrupu(1);
      expect(poruke).toEqual([{ tip: 'greska', tekst: 'Grupa ima podgrupe.', akcija: undefined }]);
      expect(store.izabranaGrupaId()).toBe(2);
      expect(api.stablo).not.toHaveBeenCalled();
    });
  });
});
