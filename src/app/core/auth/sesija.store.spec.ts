import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SesijaStore } from './sesija.store';

const JA = { uloga: 'NASTAVNIK', korisnik: 'nastavnik' };
const neovlascen = { status: 401, statusText: 'Unauthorized' };

describe('SesijaStore', () => {
  let http: HttpTestingController;
  let store: SesijaStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(SesijaStore);
  });

  afterEach(() => http.verify());

  it('počinje kao nepoznato, bez zahteva', () => {
    expect(store.status()).toBe('nepoznato');
    expect(store.korisnik()).toBeNull();
    http.expectNone('api/auth/ja');
  });

  it('dva paralelna proveri() šalju jedan GET ja; oba dobijaju true', async () => {
    const a = store.proveri();
    const b = store.proveri();
    http.expectOne('api/auth/ja').flush(JA);
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(store.status()).toBe('prijavljen');
    expect(store.korisnik()).toBe('nastavnik');
  });

  it('posle uspešne provere je keširano: nema novog zahteva', async () => {
    const a = store.proveri();
    http.expectOne('api/auth/ja').flush(JA);
    await a;
    expect(await store.proveri()).toBe(true);
    http.expectNone('api/auth/ja');
  });

  it('401 -> false i odjavljen; sledeća provera pita server ponovo (prijava u drugoj kartici)', async () => {
    const a = store.proveri();
    http.expectOne('api/auth/ja').flush({ reason: 'Potrebna je prijava.' }, neovlascen);
    expect(await a).toBe(false);
    expect(store.status()).toBe('odjavljen');

    const b = store.proveri();
    http.expectOne('api/auth/ja').flush(JA);
    expect(await b).toBe(true);
    expect(store.status()).toBe('prijavljen');
  });

  it('mrežna greška ili 5xx nije odjava: true, stanje ostaje nepoznato (server ionako odlučuje)', async () => {
    const a = store.proveri();
    http.expectOne('api/auth/ja').error(new ProgressEvent('error'));
    expect(await a).toBe(true);
    expect(store.status()).toBe('nepoznato');

    const b = store.proveri();
    http.expectOne('api/auth/ja').flush('boom', { status: 502, statusText: 'Bad Gateway' });
    expect(await b).toBe(true);
    expect(store.status()).toBe('nepoznato');
  });

  it('prijavi: POST prijava, pa prijavljen sa unetim korisnikom', async () => {
    const p = store.prijavi('nastavnik', 'lozinka');
    const req = http.expectOne('api/auth/prijava');
    expect(req.request.body).toEqual({ korisnik: 'nastavnik', lozinka: 'lozinka' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await p;
    expect(store.status()).toBe('prijavljen');
    expect(store.korisnik()).toBe('nastavnik');
    expect(await store.proveri()).toBe(true);
    http.expectNone('api/auth/ja');
  });

  it('prijavi sa greškom odbija HttpErrorResponse i ne menja stanje', async () => {
    const p = store.prijavi('nastavnik', 'pogresno');
    http.expectOne('api/auth/prijava').flush({ reason: 'Pogrešno korisničko ime ili lozinka.' }, neovlascen);
    const e = await p.then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(HttpErrorResponse);
    expect((e as HttpErrorResponse).status).toBe(401);
    expect(store.status()).toBe('nepoznato');
  });

  it('odjavi: POST odjava, pa odjavljen; 401 (već odjavljen) je isto uspeh', async () => {
    const p = store.prijavi('nastavnik', 'l');
    http.expectOne('api/auth/prijava').flush(null, { status: 204, statusText: 'No Content' });
    await p;

    const o = store.odjavi();
    http.expectOne('api/auth/odjava').flush(null, { status: 204, statusText: 'No Content' });
    await o;
    expect(store.status()).toBe('odjavljen');
    expect(store.korisnik()).toBeNull();

    const o2 = store.odjavi();
    http.expectOne('api/auth/odjava').flush({ reason: 'Potrebna je prijava.' }, neovlascen);
    await o2;
    expect(store.status()).toBe('odjavljen');
  });

  it('odjavi sa mrežnom greškom odbija i ostaje prijavljen (kolačić na serveru i dalje važi)', async () => {
    const p = store.prijavi('nastavnik', 'l');
    http.expectOne('api/auth/prijava').flush(null, { status: 204, statusText: 'No Content' });
    await p;

    const o = store.odjavi();
    http.expectOne('api/auth/odjava').error(new ProgressEvent('error'));
    await expect(o).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(store.status()).toBe('prijavljen');
  });

  it('ponisti: odjavljen, a sledeća provera ide na server', async () => {
    const a = store.proveri();
    http.expectOne('api/auth/ja').flush(JA);
    await a;

    store.ponisti();
    expect(store.status()).toBe('odjavljen');
    expect(store.korisnik()).toBeNull();

    const b = store.proveri();
    http.expectOne('api/auth/ja').flush({ reason: 'Potrebna je prijava.' }, neovlascen);
    expect(await b).toBe(false);
  });

  it('odgovor provere poslate pre ponisti() se ne primenjuje (zastareo)', async () => {
    const a = store.proveri();
    const req = http.expectOne('api/auth/ja');
    store.ponisti();
    req.flush(JA);
    expect(await a).toBe(false);
    expect(store.status()).toBe('odjavljen');
  });
});
