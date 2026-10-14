import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_ERRORS } from '../api/api-error';
import { Strana } from '../../shared/models/strana';
import { tekucaSkolskaGodina } from '../../shared/util/skolska-godina';
import { PredavanjaListaStore } from './predavanja-lista.store';
import { PredavanjeListItem } from '../api/predavanja.models';

@Component({ template: '', providers: [PredavanjaListaStore], changeDetection: ChangeDetectionStrategy.OnPush })
class Lista {
  readonly store = inject(PredavanjaListaStore);
}

const bezGrupe: PredavanjeListItem = {
  id: 7,
  rb: 3,
  datum: null,
  tema: null,
  zavrseno: null,
  predmet: { id: 1, naziv: 'Uvod u primenu računara' },
  grupa: null,
  brojPrisutnih: 0,
  brojStarijihPrisutnih: 0,
  brojStudenata: 0,
};

function strana(content: PredavanjeListItem[], ukupno = content.length): Strana<PredavanjeListItem> {
  return { content, page: { size: 25, number: 0, totalElements: ukupno, totalPages: Math.ceil(ukupno / 25) } };
}

describe('PredavanjaListaStore', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'predavanja', component: Lista }]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function otvori(url: string): Promise<{ store: PredavanjaListaStore; zahtev: TestRequest }> {
    harness = await RouterTestingHarness.create();
    const cmp = await harness.navigateByUrl(url, Lista);
    const zahtev = http.expectOne(r => r.url === 'api/predavanja/pretraga');
    return { store: cmp.store, zahtev };
  }

  it('šalje predmetId, grupaId, godina, zavrseno, q, od, do, page, size i sort', async () => {
    const { zahtev } = await otvori(
      '/predavanja?predmet=3&grupa=4&godina=2025&status=zavrseno&q=petlje&od=2025-10-01&do=2025-10-31&sort=rb,asc&strana=2&velicina=10',
    );
    const p = zahtev.request.params;
    expect(p.get('predmetId')).toBe('3');
    expect(p.get('grupaId')).toBe('4');
    expect(p.get('godina')).toBe('2025');
    expect(p.get('zavrseno')).toBe('true');
    expect(p.get('q')).toBe('petlje');
    expect(p.get('od')).toBe('2025-10-01');
    expect(p.get('do')).toBe('2025-10-31');
    expect(p.get('page')).toBe('1');
    expect(p.get('size')).toBe('10');
    expect(p.get('sort')).toBe('rb,asc');
    expect(p.has('status')).toBe(false);
    expect(zahtev.request.method).toBe('GET');
    zahtev.flush(strana([]));
  });

  it('status u-toku je zavrseno=false', async () => {
    const { zahtev } = await otvori('/predavanja?status=u-toku');
    expect(zahtev.request.params.get('zavrseno')).toBe('false');
    zahtev.flush(strana([]));
  });

  it('bez filtera: tekuća školska godina, sort datum,desc, prva strana od 25; bez predmeta, grupe i statusa', async () => {
    const { zahtev, store } = await otvori('/predavanja');
    const p = zahtev.request.params;
    expect(p.get('godina')).toBe(String(tekucaSkolskaGodina()));
    expect(p.get('sort')).toBe('datum,desc');
    expect(p.get('page')).toBe('0');
    expect(p.get('size')).toBe('25');
    for (const k of ['predmetId', 'grupaId', 'zavrseno', 'q', 'od', 'do', 'status']) {
      expect(p.has(k), k).toBe(false);
    }
    zahtev.flush(strana([]));
    expect(store.imaFiltera()).toBe(false);
  });

  it('godina= (prazno) znači sve školske godine: godina se ne šalje', async () => {
    const { zahtev, store } = await otvori('/predavanja?godina=');
    expect(zahtev.request.params.has('godina')).toBe(false);
    zahtev.flush(strana([]));
    expect(store.imaFiltera()).toBe(true);
  });

  it('nepoznat status u URL-u ne šalje zavrseno', async () => {
    const { zahtev } = await otvori('/predavanja?status=nesto');
    expect(zahtev.request.params.has('zavrseno')).toBe(false);
    zahtev.flush(strana([]));
  });

  it('smeće u URL-u (strana, veličina, sort, grupa) pada na podrazumevano i ne šalje se', async () => {
    const { zahtev } = await otvori('/predavanja?strana=abc&velicina=1000&sort=lozinka,asc&grupa=-3');
    const p = zahtev.request.params;
    expect([p.get('page'), p.get('size'), p.get('sort'), p.has('grupaId')]).toEqual(['0', '25', 'datum,desc', false]);
    zahtev.flush(strana([]));
  });

  it('predavanje bez grupe i datuma stiže u stavke bez izuzetka', async () => {
    const { zahtev, store } = await otvori('/predavanja');
    zahtev.flush(strana([bezGrupe]));
    expect(store.stavke()).toEqual([bezGrupe]);
    expect(store.status()).toBe('loaded');
  });

  it('greška učitavanja ide u status liste, a ne u snackbar (LOCAL_ERRORS)', async () => {
    const { zahtev, store } = await otvori('/predavanja');
    expect(zahtev.request.context.get(LOCAL_ERRORS)).toBe(true);
    zahtev.flush({ reason: 'Neispravan parametar: sort.' }, { status: 400, statusText: 'Bad Request' });
    expect(store.status()).toBe('error');
    expect(store.greska()).toBe('Neispravan parametar: sort.');
  });
});
