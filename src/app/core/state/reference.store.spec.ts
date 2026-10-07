import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GrupaInfo, PredmetInfo, TipTestaInfo } from '../api/reference.api';
import { ReferenceStore } from './reference.store';

const PREDMETI: PredmetInfo[] = [{ id: 1, naziv: 'Matematika' }];
const GRUPE: GrupaInfo[] = [{ id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 31 }];
const TIPOVI: TipTestaInfo[] = [{ id: 7, naziv: 'Kolokvijum', aktivan: true }];

describe('ReferenceStore', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('je lenj: sam store ne šalje nijedan zahtev', () => {
    const store = TestBed.inject(ReferenceStore);
    expect(store.predmeti()).toEqual([]);
    expect(store.grupe()).toEqual([]);
    expect(store.status()).toBe('idle');
    store.invalidiraj('grupe');
    store.invalidiraj('predmeti');
    store.invalidiraj('tipovi');
    http.expectNone(() => true);
  });

  it('ucitaj() učitava predmete i grupe samo prvi put', () => {
    const store = TestBed.inject(ReferenceStore);
    store.ucitaj();
    expect(store.status()).toBe('loading');
    store.ucitaj();
    http.expectOne({ method: 'GET', url: 'api/predmeti' }).flush(PREDMETI);
    http.expectOne({ method: 'GET', url: 'api/grupe' }).flush(GRUPE);
    expect(store.predmeti()).toEqual(PREDMETI);
    expect(store.grupe()).toEqual(GRUPE);
    expect(store.status()).toBe('loaded');
    store.ucitaj();
    http.expectNone('api/predmeti');
    http.expectNone('api/grupe');
  });

  it('invalidiraj ponovo učitava samo traženi resurs', () => {
    const store = TestBed.inject(ReferenceStore);
    store.ucitaj();
    http.expectOne('api/predmeti').flush(PREDMETI);
    http.expectOne('api/grupe').flush(GRUPE);

    store.invalidiraj('grupe');
    http.expectNone('api/predmeti');
    const nove = [...GRUPE, { id: 5, naziv: 'AR-2025', godinaUpisa: 2025, brojStudenata: 0 }];
    http.expectOne('api/grupe').flush(nove);
    expect(store.grupe()).toEqual(nove);
  });

  it('invalidiraj tokom učitavanja otkazuje stari zahtev; važi novi odgovor', () => {
    const store = TestBed.inject(ReferenceStore);
    store.ucitaj();
    http.expectOne('api/predmeti').flush(PREDMETI);
    const stari = http.expectOne('api/grupe');
    store.invalidiraj('grupe');
    expect(stari.cancelled).toBe(true);
    http.expectOne('api/grupe').flush(GRUPE);
    expect(store.grupe()).toEqual(GRUPE);
    expect(store.status()).toBe('loaded');
  });

  it('greška: status error sa porukom, sledeći ucitaj() pokušava ponovo', () => {
    const store = TestBed.inject(ReferenceStore);
    store.ucitaj();
    http.expectOne('api/predmeti').flush(PREDMETI);
    http.expectOne('api/grupe').flush({ reason: 'Nema pristupa.' }, { status: 403, statusText: 'Forbidden' });
    expect(store.status()).toBe('error');
    expect(store.greska()).toBe('Nema pristupa.');
    expect(store.predmeti()).toEqual(PREDMETI);

    store.ucitaj();
    http.expectNone('api/predmeti');
    http.expectOne('api/grupe').flush(GRUPE);
    expect(store.status()).toBe('loaded');
    expect(store.grupe()).toEqual(GRUPE);
  });

  it('tipoviTesta(predmetId) učitava jednom po predmetu i kešira', () => {
    const store = TestBed.inject(ReferenceStore);
    const t5 = store.tipoviTesta(5);
    expect(t5()).toEqual([]);
    store.tipoviTesta(5);
    http.expectOne({ method: 'GET', url: 'api/predmeti/5/tipovi' }).flush(TIPOVI);
    expect(t5()).toEqual(TIPOVI);
    expect(store.tipoviTesta(5)()).toEqual(TIPOVI);
    http.expectNone('api/predmeti/5/tipovi');

    store.tipoviTesta(6);
    http.expectOne('api/predmeti/6/tipovi').flush([]);

    store.invalidiraj('tipovi', 5);
    http.expectOne('api/predmeti/5/tipovi').flush([]);
    expect(t5()).toEqual([]);
    http.expectNone('api/predmeti/6/tipovi');

    store.invalidiraj('tipovi');
    http.expectOne('api/predmeti/5/tipovi').flush(TIPOVI);
    http.expectOne('api/predmeti/6/tipovi').flush([]);
    expect(t5()).toEqual(TIPOVI);
  });

  it('tipoviTesta za neispravan id ne šalje zahtev; posle greške ne ponavlja zahtev sam od sebe', () => {
    const store = TestBed.inject(ReferenceStore);
    expect(store.tipoviTesta(0)()).toEqual([]);
    expect(store.tipoviTesta(Number.NaN)()).toEqual([]);
    http.expectNone(() => true);

    store.tipoviTesta(8);
    http.expectOne('api/predmeti/8/tipovi').flush(null, { status: 500, statusText: 'x' });
    store.tipoviTesta(8);
    http.expectNone('api/predmeti/8/tipovi');
    store.invalidiraj('tipovi', 8);
    http.expectOne('api/predmeti/8/tipovi').flush(TIPOVI);
    expect(store.tipoviTesta(8)()).toEqual(TIPOVI);
  });

  it('tipoviTesta sme da se pozove iz computed-a / šablona (ne piše signale sinhrono)', () => {
    const store = TestBed.inject(ReferenceStore);
    const naziv = computed(() => store.tipoviTesta(3)().map(t => t.naziv).join(','));
    expect(naziv()).toBe('');
    http.expectOne('api/predmeti/3/tipovi').flush(TIPOVI);
    expect(naziv()).toBe('Kolokvijum');
  });
});
