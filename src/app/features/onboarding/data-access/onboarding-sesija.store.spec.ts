import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OnboardingApi, OnboardingSesijaDetails, PrijavaInfo, StatusPrijave } from '../../../core/api/onboarding.api';
import { OnboardingSesijaStore, parseFilterPrijava } from './onboarding-sesija.store';

function prijava(id: number, status: StatusPrijave = 'NA_CEKANJU'): PrijavaInfo {
  return {
    id,
    ime: `Ime${id}`,
    prezime: `Prezime${id}`,
    indeks: `GD${id}`,
    godina: 2025,
    email: `s${id}@example.com`,
    brojTelefona: '064 111 222',
    datumRodjenja: null,
    opstina: null,
    status,
    podneto: '2025-10-14T10:00:00',
    obradjeno: null,
    studentId: null,
    napomena: null,
  };
}

function detalji(sesijaId: number, prijave: PrijavaInfo[], poruka: string | null = null): OnboardingSesijaDetails {
  return {
    sesija: {
      id: sesijaId,
      token: 'a'.repeat(32),
      grupa: { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 3 },
      aktivna: true,
      otvorena: true,
      kreirano: '2025-10-14T09:00:00',
      istice: '2025-10-21T09:00:00',
      maxPrijava: 200,
      brojPrijava: prijave.length,
      brojNaCekanju: prijave.filter(p => p.status === 'NA_CEKANJU').length,
      napomena: null,
    },
    prijave,
    poruka,
  };
}

const status = (store: OnboardingSesijaStore, id: number) => store.prijave().find(p => p.id === id)?.status;

describe('parseFilterPrijava', () => {
  it('poznat status ili "SVE"', () => {
    expect(parseFilterPrijava('NA_CEKANJU')).toBe('NA_CEKANJU');
    expect(parseFilterPrijava('lozinka')).toBe('SVE');
    expect(parseFilterPrijava(undefined)).toBe('SVE');
  });
});

describe('OnboardingSesijaStore: zaštite od trka', () => {
  let http: HttpTestingController;
  let store: OnboardingSesijaStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [OnboardingSesijaStore, provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(OnboardingSesijaStore);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  /** Sesija 9 sa dve prijave na čekanju, učitana. */
  function ucitana() {
    store.ucitaj(9);
    http.expectOne('api/onboarding/9').flush(detalji(9, [prijava(1), prijava(2)]));
    expect(store.status()).toBe('loaded');
  }

  it('dok akcija traje (zauzet), druga akcija i osvežavanje ne šalju zahtev', () => {
    ucitana();
    store.prihvati(prijava(1));
    const prva = http.expectOne('api/onboarding/9/prijave/1/prihvati');
    expect(store.zauzet()).toBe(true);

    store.odbij(prijava(2), 'x');
    store.prihvati(prijava(2));
    store.prihvatiSve();
    store.osvezi();
    store.osvezi(true);
    http.expectNone(r => r.url !== 'api/onboarding/9/prijave/1/prihvati');

    prva.flush(detalji(9, [prijava(1, 'PRIHVACENA'), prijava(2)]));
    expect(store.zauzet()).toBe(false);
    store.odbij(prijava(2), '  razlog  ');
    const odbij = http.expectOne('api/onboarding/9/prijave/2/odbij');
    expect(odbij.request.body).toEqual({ napomena: 'razlog' });
    odbij.flush(detalji(9, [prijava(1, 'PRIHVACENA'), prijava(2, 'ODBIJENA')]));
  });

  it('akcija otkazuje osvežavanje u toku: odgovor starog stanja ne stiže posle rezultata akcije; status nije "loading"', () => {
    ucitana();
    store.osvezi();
    const staro = http.expectOne('api/onboarding/9');
    expect(store.status()).toBe('loading');

    store.prihvati(prijava(1));
    expect(store.status()).toBe('loaded');
    expect(staro.cancelled).toBe(true);
    http.expectOne('api/onboarding/9/prijave/1/prihvati').flush(detalji(9, [prijava(1, 'PRIHVACENA'), prijava(2)], 'Prihvaćeno: 1.'));
    // bez otkazivanja bi odgovor starog stanja (obe na čekanju) stigao tek sada i pregazio rezultat akcije
    if (!staro.cancelled) {
      staro.flush(detalji(9, [prijava(1), prijava(2)]));
    }

    expect(status(store, 1)).toBe('PRIHVACENA');
    expect(store.poruka()).toBe('Prihvaćeno: 1.');
    expect(store.status()).toBe('loaded');
  });

  it('promena sesije otkazuje osvežavanje prethodne: njen odgovor ne pregazi novu sesiju', () => {
    ucitana();
    store.osvezi(true);
    const staro = http.expectOne('api/onboarding/9');

    store.ucitaj(10);
    expect(staro.cancelled).toBe(true);
    http.expectOne('api/onboarding/10').flush(detalji(10, [prijava(5)]));
    if (!staro.cancelled) {
      staro.flush(detalji(9, [prijava(1), prijava(2)]));
    }
    expect(store.sesija()?.id).toBe(10);
    expect(store.prijave().map(p => p.id)).toEqual([5]);
  });

  it('odgovor akcije za prethodnu sesiju (generacija) se odbacuje posle promene sesije', () => {
    ucitana();
    store.prihvati(prijava(1));
    const akcija = http.expectOne('api/onboarding/9/prijave/1/prihvati');

    store.ucitaj(10);
    http.expectOne('api/onboarding/10').flush(detalji(10, [prijava(5)]));
    expect(store.zauzet()).toBe(false);

    akcija.flush(detalji(9, [prijava(1, 'PRIHVACENA'), prijava(2)], 'Prihvaćeno: 1.'));
    expect(store.sesija()?.id).toBe(10);
    expect(store.prijave().map(p => p.id)).toEqual([5]);
    expect(store.poruka()).toBeNull();
  });

  it('posle greške akcije lista se tiho osveži i pokaže stvarno stanje', () => {
    ucitana();
    store.prihvati(prijava(1));
    http
      .expectOne('api/onboarding/9/prijave/1/prihvati')
      .flush({ reason: 'Prijava je već obrađena.' }, { status: 409, statusText: 'Conflict' });
    expect(store.zauzet()).toBe(false);

    const osvezavanje = http.expectOne('api/onboarding/9');
    osvezavanje.flush(detalji(9, [prijava(1, 'ODBIJENA'), prijava(2)]));
    expect(status(store, 1)).toBe('ODBIJENA');
    expect(store.status()).toBe('loaded');
    expect(store.imaGresku()).toBe(false);
  });

  it('ručno osvežavanje u toku + greška akcije + palo tiho osvežavanje: prikaz ostaje, status nije zaglavljen u "loading"', () => {
    ucitana();
    store.osvezi();
    http.expectOne('api/onboarding/9');
    store.prihvati(prijava(1));
    http.expectOne('api/onboarding/9/prijave/1/prihvati').flush({ reason: 'x' }, { status: 409, statusText: 'Conflict' });
    http.expectOne('api/onboarding/9').flush(null, { status: 0, statusText: 'Unknown Error' });

    expect(store.status()).toBe('loaded');
    expect(store.prijave()).toHaveLength(2);
  });

  it('izmena koju je server u međuvremenu obradio se zatvara pri osvežavanju', () => {
    ucitana();
    store.zapocniIzmenu(prijava(2));
    expect(store.izmenaId()).toBe(2);
    store.osvezi(true);
    http.expectOne('api/onboarding/9').flush(detalji(9, [prijava(1), prijava(2, 'PRIHVACENA')]));
    expect(store.izmenaId()).toBeNull();
  });
});

describe('OnboardingSesijaStore: odgovor koji stigne odmah', () => {
  it('sinhron odgovor ne ostavlja zatvorenu vezu koja bi blokirala sledeće osvežavanje', () => {
    const sesija = vi.fn(() => of(detalji(9, [prijava(1)])));
    TestBed.configureTestingModule({ providers: [OnboardingSesijaStore, { provide: OnboardingApi, useValue: { sesija } }] });
    const store = TestBed.inject(OnboardingSesijaStore);
    store.ucitaj(9);
    store.osvezi(true);
    store.osvezi();
    expect(sesija).toHaveBeenCalledTimes(3);
    expect(store.status()).toBe('loaded');
  });
});
