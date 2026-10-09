import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEBOUNCE_PRETRAGE_MS, GlobalnaPretraga, sledeciIndeks, stavkeIzRezultata } from './globalna-pretraga';
import { PretragaRezultat } from './pretraga.api';

@Component({ template: 'stub' })
class Stub {}

const GRUPA = { id: 4, naziv: 'GD-2025', godinaUpisa: 2025, brojStudenata: 38 };
const PREDMET = { id: 1, naziv: 'UPR' };

const REZULTAT: PretragaRezultat = {
  studenti: [
    { id: 11, ime: 'Danica', prezime: 'Vuković', indeks: 'GD3', godina: 2025, email: null, brojTelefona: null, grupa: GRUPA },
    { id: 12, ime: 'Marko', prezime: 'Vuk', indeks: 'GD4', godina: null, email: null, brojTelefona: null, grupa: null },
  ],
  predavanja: [
    { id: 21, rb: 9, datum: '2025-10-14', tema: 'Vukovi i ovce', zavrseno: true, predmet: PREDMET, grupa: GRUPA, brojPrisutnih: 1, brojStarijihPrisutnih: 0, brojStudenata: 38 },
  ],
  testovi: [],
  grupe: [GRUPA],
};

describe('stavkeIzRezultata i sledeciIndeks', () => {
  it('grupe redom: studenti, predavanja, testovi, grupe; prazan ili okrnjen rezultat je prazan spisak', () => {
    const s = stavkeIzRezultata(REZULTAT);
    expect(s.map(x => x.url)).toEqual(['/studenti/11', '/studenti/12', '/predavanja/21', '/grupe/4']);
    expect(s[0].podnaslov).toBe('GD3/2025 · GD-2025');
    expect(s[1].podnaslov).toBe('GD4'); // student bez grupe i godine: bez "—" viška
    expect(s[2].naslov).toBe('Predavanje 9 · Vukovi i ovce');
    expect(stavkeIzRezultata(null)).toEqual([]);
    expect(stavkeIzRezultata({} as PretragaRezultat)).toEqual([]);
  });

  it('strelice su kružne', () => {
    expect(sledeciIndeks(0, 1, 3)).toBe(1);
    expect(sledeciIndeks(2, 1, 3)).toBe(0);
    expect(sledeciIndeks(0, -1, 3)).toBe(2);
    expect(sledeciIndeks(0, 1, 0)).toBe(0);
  });
});

const pauza = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe('GlobalnaPretraga', () => {
  let http: HttpTestingController;
  let router: Router;
  let dialog: MatDialog;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Stub }]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    dialog = TestBed.inject(MatDialog);
  });

  afterEach(() => {
    dialog.closeAll();
    http.verify();
  });

  const polje = () => document.querySelector<HTMLInputElement>('app-globalna-pretraga input')!;
  const opcije = () => [...document.querySelectorAll<HTMLElement>('app-globalna-pretraga [role=option]')];
  const tekst = () => document.querySelector('app-globalna-pretraga')!.textContent!;

  async function osvezi() {
    TestBed.tick();
    await pauza(0);
    TestBed.tick();
  }

  async function otvori() {
    GlobalnaPretraga.otvori(dialog);
    await osvezi();
  }

  async function ukucaj(q: string) {
    polje().value = q;
    polje().dispatchEvent(new Event('input'));
    await osvezi();
  }

  async function sacekajDebounce() {
    await pauza(DEBOUNCE_PRETRAGE_MS + 60);
    TestBed.tick();
  }

  async function pretrazi(q: string, odgovor: PretragaRezultat = REZULTAT) {
    await ukucaj(q);
    await sacekajDebounce();
    http.expectOne(r => r.url === 'api/pretraga' && r.params.get('q') === q.trim()).flush(odgovor);
    await osvezi();
  }

  const tipka = (key: string) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    polje().dispatchEvent(e);
    TestBed.tick();
    return e;
  };

  it('upit pod debounce-om i najmanje 2 znaka: jedan zahtev tek posle pauze; kraći upit ne zove server', async () => {
    await otvori();
    expect(tekst()).toContain('Upiši bar 2 znaka');
    await ukucaj('v');
    await sacekajDebounce();
    http.expectNone('api/pretraga');
    await ukucaj('vu');
    await pauza(DEBOUNCE_PRETRAGE_MS - 100);
    await ukucaj('vuk');
    await pauza(DEBOUNCE_PRETRAGE_MS - 100);
    http.expectNone('api/pretraga'); // pauza se računa od poslednjeg znaka
    await sacekajDebounce();
    const req = http.expectOne('api/pretraga?q=vuk');
    req.flush(REZULTAT);
  });

  it('grupisani rezultati sa naslovima grupa; prvi je aktivan (aria-activedescendant)', async () => {
    await otvori();
    await pretrazi('vuk');
    expect([...document.querySelectorAll('app-globalna-pretraga .grupa')].map(g => g.textContent)).toEqual(['Studenti', 'Predavanja', 'Grupe']);
    expect(opcije().length).toBe(4);
    expect(polje().getAttribute('aria-activedescendant')).toBe('pretraga-opcija-0');
    expect(opcije()[0].getAttribute('aria-selected')).toBe('true');
    expect(polje().getAttribute('role')).toBe('combobox');
    expect(tekst()).toContain('Danica Vuković');
  });

  it('strelice idu kroz sve rezultate preko granice grupa i kružno; Enter otvara aktivan', async () => {
    await otvori();
    await pretrazi('vuk');
    const aktivna = () => polje().getAttribute('aria-activedescendant');
    expect(tipka('ArrowDown').defaultPrevented).toBe(true);
    expect(aktivna()).toBe('pretraga-opcija-1'); // drugi student
    tipka('ArrowDown');
    expect(aktivna()).toBe('pretraga-opcija-2'); // prešlo u grupu Predavanja
    tipka('ArrowDown');
    tipka('ArrowDown');
    expect(aktivna()).toBe('pretraga-opcija-0'); // kružno posle poslednje (grupe)
    tipka('ArrowUp');
    expect(aktivna()).toBe('pretraga-opcija-3'); // kružno unazad, u grupu Grupe
    tipka('ArrowUp');
    expect(aktivna()).toBe('pretraga-opcija-2');
    TestBed.tick();
    expect(opcije()[2].getAttribute('aria-selected')).toBe('true');

    tipka('Enter');
    await pauza(0);
    expect(router.url).toBe('/predavanja/21');
    for (let i = 0; i < 20 && dialog.openDialogs.length > 0; i++) {
      await pauza(50); // animacija zatvaranja
    }
    expect(dialog.openDialogs.length).toBe(0); // dijalog je zatvoren
  });

  it('Enter dok je spisak zastareo (upit se menja, odgovor još nije stigao) ne otvara ništa', async () => {
    await otvori();
    await pretrazi('vuk');
    await ukucaj('vukov');
    tipka('Enter');
    await pauza(0);
    expect(router.url).toBe('/');
    await sacekajDebounce();
    http.expectOne('api/pretraga?q=vukov').flush(REZULTAT);
  });

  it('klik na rezultat otvara ga', async () => {
    await otvori();
    await pretrazi('vuk');
    opcije()[0].click();
    await pauza(0);
    expect(router.url).toBe('/studenti/11');
  });

  it('nema rezultata, i greška servera u dijalogu (bez snackbara)', async () => {
    await otvori();
    await pretrazi('qqq', { studenti: [], predavanja: [], testovi: [], grupe: [] });
    expect(tekst()).toContain('Nema rezultata za „qqq“.');
    tipka('Enter');
    await pauza(0);
    expect(router.url).toBe('/');

    await ukucaj('zzz');
    await sacekajDebounce();
    http.expectOne('api/pretraga?q=zzz').flush({ reason: 'Greška pretrage.' }, { status: 400, statusText: 'Bad Request' });
    await osvezi();
    expect(document.querySelector('[data-greska]')!.textContent).toContain('Greška pretrage.');
  });

  it('Esc zatvara dijalog', async () => {
    await otvori();
    polje().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    await pauza(300);
    await osvezi();
    expect(dialog.openDialogs.length).toBe(0);
  });

  it('ponovno otvaranje (Ctrl+K u otvorenoj pretrazi) ne pravi drugi dijalog', async () => {
    await otvori();
    GlobalnaPretraga.otvori(dialog);
    await osvezi();
    expect(dialog.openDialogs.length).toBe(1);
  });

  it('razmak na kraju upita: Enter i dalje otvara aktivan rezultat (nema novog zahteva)', async () => {
    await otvori();
    await pretrazi('vuk');
    await ukucaj('vuk ');
    await sacekajDebounce();
    http.expectNone(r => r.url === 'api/pretraga');
    tipka('Enter');
    await pauza(0);
    expect(router.url).toBe('/studenti/11');
  });

  it('izmena pa vraćanje na isti upit u okviru debounce-a: Enter otvara', async () => {
    await otvori();
    await pretrazi('vuk');
    await ukucaj('vuko');
    await ukucaj('vuk');
    await sacekajDebounce();
    http.expectNone(r => r.url === 'api/pretraga');
    tipka('Enter');
    await pauza(0);
    expect(router.url).toBe('/studenti/11');
  });

  it('posle greške Enter ponavlja isti upit', async () => {
    await otvori();
    await ukucaj('zzz');
    await sacekajDebounce();
    http.expectOne('api/pretraga?q=zzz').flush({ reason: 'Greška pretrage.' }, { status: 400, statusText: 'Bad Request' });
    await osvezi();
    expect(document.querySelector('[data-greska]')).not.toBeNull();
    tipka('Enter');
    await osvezi();
    http.expectOne('api/pretraga?q=zzz').flush(REZULTAT);
    await osvezi();
    expect(document.querySelector('[data-greska]')).toBeNull();
    expect(opcije().length).toBe(4);
  });

  it('dok traje novi zahtev stari rezultati ostaju (prigušeni), pa se zamene', async () => {
    await otvori();
    await pretrazi('vuk');
    await ukucaj('vukov');
    await sacekajDebounce();
    const req = http.expectOne('api/pretraga?q=vukov');
    await osvezi();
    expect(opcije().length).toBe(4);
    expect(document.querySelector('#pretraga-lista')!.classList.contains('zamucena')).toBe(true);
    expect(document.querySelector('[data-trazim]')).toBeNull();
    req.flush({ studenti: [], predavanja: [], testovi: [], grupe: [GRUPA] });
    await osvezi();
    expect(opcije().length).toBe(1);
    expect(document.querySelector('#pretraga-lista')!.classList.contains('zamucena')).toBe(false);
  });

  it('stalna živa regija i listbox na koji pokazuje aria-controls postoje i pre rezultata', async () => {
    await otvori();
    expect(document.getElementById(polje().getAttribute('aria-controls')!)).not.toBeNull();
    expect(polje().getAttribute('aria-expanded')).toBe('false');
    const status = document.querySelector('[data-status]')!;
    expect(status.getAttribute('aria-live')).toBe('polite');
    await pretrazi('vuk');
    expect(document.querySelector('[data-status]')).toBe(status); // isti element, menja se samo tekst
    expect(status.textContent).toBe('4 rezultata');
    expect(polje().getAttribute('aria-expanded')).toBe('true');
  });

  it('po zatvaranju fokus se vraća na element koji je otvorio pretragu', async () => {
    const dugme = document.createElement('button');
    document.body.appendChild(dugme);
    dugme.focus();
    await otvori();
    for (let i = 0; i < 20 && document.activeElement !== polje(); i++) {
      await pauza(50);
    }
    expect(document.activeElement).toBe(polje());
    dialog.closeAll();
    for (let i = 0; i < 20 && document.activeElement !== dugme; i++) {
      await pauza(50);
    }
    expect(document.activeElement).toBe(dugme);
    dugme.remove();
  });

  it('ne otvara se dok je otvoren drugi dijalog', async () => {
    @Component({ template: 'drugi' })
    class Drugi {}
    dialog.open(Drugi);
    await osvezi();
    expect(GlobalnaPretraga.otvori(dialog)).toBeNull();
    expect(document.querySelector('app-globalna-pretraga')).toBeNull();
  });
});
