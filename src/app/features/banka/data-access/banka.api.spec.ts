import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_ERRORS } from '../../../core/api/api-error';
import { BankaApi } from './banka.api';
import { svgUrl } from './banka.models';

describe('BankaApi', () => {
  let http: HttpTestingController;
  let api: BankaApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(BankaApi);
  });

  afterEach(() => http.verify());

  /** Jedan zahtev na putanju (bez query-ja) sa metodom; query se proverava posebno. */
  function zahtev(metod: string, putanja: string): TestRequest {
    const req = http.expectOne(r => r.url === putanja);
    expect(req.request.method).toBe(metod);
    return req;
  }

  it('stablo: GET banka/stablo?predmetId&namena', () => {
    api.stablo(7, 'TEST').subscribe();
    const req = zahtev('GET', 'api/banka/stablo');
    expect(req.request.params.get('predmetId')).toBe('7');
    expect(req.request.params.get('namena')).toBe('TEST');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(false);
    req.flush([]);
  });

  it('{ tiho: true } uključuje LOCAL_ERRORS (greška ide pozivaocu, ne u snackbar)', () => {
    api.grupa(3, { tiho: true }).subscribe();
    const req = zahtev('GET', 'api/banka/grupe/3');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush({});
  });

  it('grupe: kreiranje, izmena, brisanje i premeštanje', () => {
    const cmd = { naziv: 'Grupa', opis: null, tezina: 2, uputstvo: null, polja: null };
    api.kreirajGrupu({ ...cmd, predmetId: 7, namena: 'PREDAVANJE' }).subscribe();
    const nova = zahtev('POST', 'api/banka/grupe');
    expect(nova.request.body).toEqual({ ...cmd, predmetId: 7, namena: 'PREDAVANJE' });
    nova.flush({});

    api.izmeniGrupu(4, cmd).subscribe();
    const izmena = zahtev('PUT', 'api/banka/grupe/4');
    expect(izmena.request.body).toBe(cmd);
    izmena.flush({});

    api.obrisiGrupu(4).subscribe();
    zahtev('DELETE', 'api/banka/grupe/4').flush(null, { status: 204, statusText: 'No Content' });

    api.premesti(4, { roditeljId: null, rb: 1 }).subscribe();
    const premesti = zahtev('POST', 'api/banka/grupe/4/premesti');
    expect(premesti.request.body).toEqual({ roditeljId: null, rb: 1 });
    premesti.flush({});
  });

  it('redosled: PUT banka/grupe/redosled sa ids u telu; roditeljId samo kad ga ima', () => {
    api.redosled(7, 'PREDAVANJE', 1, [3, 2]).subscribe();
    const podgrupe = zahtev('PUT', 'api/banka/grupe/redosled');
    expect(podgrupe.request.params.get('roditeljId')).toBe('1');
    expect(podgrupe.request.params.get('predmetId')).toBe('7');
    expect(podgrupe.request.body).toEqual({ ids: [3, 2] });
    podgrupe.flush(null, { status: 204, statusText: 'No Content' });

    api.redosled(7, 'PREDAVANJE', null, [5, 1]).subscribe();
    const koreni = zahtev('PUT', 'api/banka/grupe/redosled');
    expect(koreni.request.params.has('roditeljId')).toBe(false);
    koreni.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('varijante: lista (sa statusom ili bez), čitanje, upis i brisanje', () => {
    api.varijante(2).subscribe();
    const sve = zahtev('GET', 'api/banka/grupe/2/varijante');
    expect(sve.request.params.keys()).toEqual([]);
    sve.flush([]);

    api.varijante(2, 'NACRT').subscribe();
    const nacrti = zahtev('GET', 'api/banka/grupe/2/varijante');
    expect(nacrti.request.params.get('status')).toBe('NACRT');
    nacrti.flush([]);

    api.varijanta(11).subscribe();
    zahtev('GET', 'api/banka/varijante/11').flush({});

    const cmd = { naziv: null, tekst: 'x', resenje: null, odgovori: {}, prilozi: [] };
    api.kreirajVarijantu(2, cmd).subscribe();
    const nova = zahtev('POST', 'api/banka/grupe/2/varijante');
    expect(nova.request.body).toBe(cmd);
    nova.flush({});

    api.izmeniVarijantu(11, cmd).subscribe();
    zahtev('PUT', 'api/banka/varijante/11').flush({});

    api.obrisiVarijantu(11).subscribe();
    zahtev('DELETE', 'api/banka/varijante/11').flush(null, { status: 204, statusText: 'No Content' });
  });

  it.each([
    ['odobri', 'odobri'],
    ['arhiviraj', 'arhiviraj'],
    ['vratiUNacrt', 'vrati-u-nacrt'],
    ['render', 'render'],
    ['dupliraj', 'dupliraj'],
  ] as const)('%s: POST banka/varijante/{id}/%s bez tela', (metoda, putanja) => {
    api[metoda](11).subscribe();
    const req = zahtev('POST', `api/banka/varijante/11/${putanja}`);
    expect(req.request.body).toBeNull();
    req.flush({});
  });

  it('promeniNivo: PATCH banka/varijante/{id}/nivo sa telom { nivo }', () => {
    api.promeniNivo(11, 3, { tiho: true }).subscribe();
    const req = zahtev('PATCH', 'api/banka/varijante/11/nivo');
    expect(req.request.body).toEqual({ nivo: 3 });
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush({});
  });

  it('pretraga šalje filter nivoa samo kad je postavljen', () => {
    api.pretraga({ predmetId: 7, nivo: 3 }).subscribe();
    const sa = http.expectOne(r => r.url === 'api/banka/pretraga');
    expect(sa.request.params.get('nivo')).toBe('3');
    sa.flush({});
    api.pretraga({ predmetId: 7, nivo: null }).subscribe();
    const bez = http.expectOne(r => r.url === 'api/banka/pretraga');
    expect(bez.request.params.has('nivo')).toBe(false);
    bez.flush({});
  });

  it('renderProba: POST banka/render-proba sa komandom', () => {
    const cmd = { predmetId: 7, tekst: '$x^2$' };
    api.renderProba(cmd).subscribe();
    const req = zahtev('POST', 'api/banka/render-proba');
    expect(req.request.body).toBe(cmd);
    req.flush({ ok: true, svg: '<svg/>', resenjeSvg: null, greska: null, deo: null });
  });

  it('prilog: multipart POST banka/prilozi sa fajlom u polju "fajl"', () => {
    const fajl = new File(['%PDF-1.4'], 'slika.pdf', { type: 'application/pdf' });
    const rez = vi.fn();
    api.prilog(fajl).subscribe(rez);
    const req = zahtev('POST', 'api/banka/prilozi');
    const telo = req.request.body as FormData;
    expect(telo).toBeInstanceOf(FormData);
    expect([...telo.keys()]).toEqual(['fajl']);
    expect((telo.get('fajl') as File).name).toBe('slika.pdf');
    const medij = { id: 'm1', naziv: 'slika.pdf', mime: 'application/pdf', velicina: 8 };
    req.flush(medij, { status: 201, statusText: 'Created' });
    expect(rez).toHaveBeenCalledWith(medij);
  });

  it('preambula: GET i PUT predmeti/{id}/latex-preambula (null vraća podrazumevanu)', () => {
    api.preambula(7).subscribe();
    zahtev('GET', 'api/predmeti/7/latex-preambula').flush({});

    api.postaviPreambulu(7, null).subscribe();
    const req = zahtev('PUT', 'api/predmeti/7/latex-preambula');
    expect(req.request.body).toEqual({ preambula: null });
    req.flush({});
  });

  it('renderujSve: POST banka/predmeti/{id}/renderuj-sve', () => {
    const rez = vi.fn();
    api.renderujSve(7).subscribe(rez);
    const req = zahtev('POST', 'api/banka/predmeti/7/renderuj-sve');
    req.flush({ renderovano: 5, neuspelo: 1, preostalo: 2 });
    expect(rez).toHaveBeenCalledWith({ renderovano: 5, neuspelo: 1, preostalo: 2 });
  });

  it('svg: GET api/public/mediji/{id} kao tekst (pregled sačuvane varijante), tiho', () => {
    const rez = vi.fn();
    api.svg('abc-1', { tiho: true }).subscribe(rez);
    const req = zahtev('GET', 'api/public/mediji/abc-1');
    expect(req.request.responseType).toBe('text');
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    req.flush('<svg/>');
    expect(rez).toHaveBeenCalledWith('<svg/>');
  });

  it('pretraga: GET banka/pretraga šalje samo postavljene filtere i stranicu', () => {
    api.pretraga({ predmetId: 7, namena: 'PREDAVANJE', q: 'binarni', status: null }, { page: 1, size: 20, sort: 'naziv,asc' }).subscribe();
    const req = zahtev('GET', 'api/banka/pretraga');
    expect(Object.fromEntries(req.request.params.keys().map(k => [k, req.request.params.get(k)]))).toEqual({
      predmetId: '7', namena: 'PREDAVANJE', q: 'binarni', page: '1', size: '20', sort: 'naziv,asc',
    });
    req.flush({ content: [], page: { size: 20, number: 1, totalElements: 0, totalPages: 0 } });
  });

  it('pretraga: izvor i serija idu kao parametri', () => {
    api.pretraga({ predmetId: 1, izvor: 'CLAUDE', serija: 'uvoz-kol1-2024', status: 'NACRT' }, { size: 100 }).subscribe();
    const req = zahtev('GET', 'api/banka/pretraga');
    expect(Object.fromEntries(req.request.params.keys().map(k => [k, req.request.params.get(k)]))).toEqual({
      predmetId: '1', izvor: 'CLAUDE', serija: 'uvoz-kol1-2024', status: 'NACRT', size: '100',
    });
    req.flush({ content: [], page: { size: 100, number: 0, totalElements: 0, totalPages: 0 } });
  });

  it('pretraga bez predmeta (`predmetId: null`): bez parametra predmetId, server traži kroz sve predmete', () => {
    api.pretraga({ predmetId: null, serija: 'uvoz-kol1-2024', status: 'NACRT' }, { page: 0, size: 100, sort: 'id,asc' }).subscribe();
    const req = zahtev('GET', 'api/banka/pretraga');
    expect(req.request.params.has('predmetId')).toBe(false);
    expect(Object.fromEntries(req.request.params.keys().map(k => [k, req.request.params.get(k)]))).toEqual({
      serija: 'uvoz-kol1-2024', status: 'NACRT', page: '0', size: '100', sort: 'id,asc',
    });
    req.flush({ content: [], page: { size: 100, number: 0, totalElements: 0, totalPages: 0 } });
  });

  it('serije: GET banka/serije?predmetId', () => {
    const rez = vi.fn();
    api.serije(1).subscribe(rez);
    const req = zahtev('GET', 'api/banka/serije');
    expect(Object.fromEntries(req.request.params.keys().map(k => [k, req.request.params.get(k)]))).toEqual({ predmetId: '1' });
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(false);
    req.flush([]);
    expect(rez).toHaveBeenCalledWith([]);
  });

  it('odbaciSeriju: POST banka/serije/{serija}/odbaci bez tela, serija enkodovana u putanji', () => {
    const rez = vi.fn();
    api.odbaciSeriju('uvoz x', { tiho: true }).subscribe(rez);
    const req = zahtev('POST', 'api/banka/serije/uvoz%20x/odbaci');
    expect(req.request.body).toBeNull();
    expect(req.request.context.get(LOCAL_ERRORS)).toBe(true);
    const ishod = { potvrdjeno: true, obrisano: [], preskoceno: [] };
    req.flush(ishod);
    expect(rez).toHaveBeenCalledWith(ishod);
  });

  it('isključene teme: GET i POST predmeti/{id}/iskljucene-teme, DELETE iskljucene-teme/{id}', () => {
    api.iskljuceneTeme(1).subscribe();
    zahtev('GET', 'api/predmeti/1/iskljucene-teme').flush([]);

    const cmd = { opis: 'Razlomljeni brojevi', grupaId: null };
    api.iskljuciTemu(1, cmd).subscribe();
    const nova = zahtev('POST', 'api/predmeti/1/iskljucene-teme');
    expect(nova.request.body).toBe(cmd);
    nova.flush({}, { status: 201, statusText: 'Created' });

    const rez = vi.fn();
    api.ukljuciTemu(7, { tiho: true }).subscribe(rez);
    const brisanje = zahtev('DELETE', 'api/iskljucene-teme/7');
    expect(brisanje.request.context.get(LOCAL_ERRORS)).toBe(true);
    brisanje.flush(null, { status: 204, statusText: 'No Content' });
    expect(rez).toHaveBeenCalledOnce();
  });

  it('zadaci za vežbanje: stanje, otvori i zatvori po grupi studenata', () => {
    api.otvoreno(5).subscribe();
    zahtev('GET', 'api/banka/grupe/5/otvoreno').flush([]);
    api.otvori(5, 9, { tiho: true }).subscribe();
    const put = zahtev('PUT', 'api/banka/grupe/5/otvoreno/9');
    expect(put.request.body).toBeNull();
    expect(put.request.context.get(LOCAL_ERRORS)).toBe(true);
    put.flush([]);
    api.zatvori(5, 9).subscribe();
    zahtev('DELETE', 'api/banka/grupe/5/otvoreno/9').flush([]);
  });

  it('statistikaVezbanja šalje samo postavljene filtere', () => {
    api.statistikaVezbanja(3).subscribe();
    const bez = zahtev('GET', 'api/predmeti/3/vezbanje/statistika');
    expect(bez.request.params.keys()).toEqual([]);
    bez.flush([]);
    api.statistikaVezbanja(3, { grupa: 4, od: '2026-10-01', do: null }).subscribe();
    const sa = zahtev('GET', 'api/predmeti/3/vezbanje/statistika');
    expect(sa.request.params.get('grupa')).toBe('4');
    expect(sa.request.params.get('od')).toBe('2026-10-01');
    expect(sa.request.params.has('do')).toBe(false);
    sa.flush([]);
  });
});

describe('svgUrl', () => {
  it('je relativan na base href (bez vodeće kose crte)', () => {
    expect(svgUrl('abc-123')).toBe('api/public/mediji/abc-123');
  });
});
