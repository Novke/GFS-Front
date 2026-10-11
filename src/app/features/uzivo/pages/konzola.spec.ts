import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { infoSlajd, platnoSlajd, stanje } from '../data-access/izvodjenje-podaci.testing';
import { IzvodjenjeStore } from '../data-access/izvodjenje.store';
import { NastavnickoStanje, medijUrl } from '../data-access/uzivo.models';
import { resetujPreducitavanje } from '../ui/preducitavanje';
import { SlajdPrikazComponent } from '../ui/slajd-prikaz.component';
import { KonzolaPage } from './konzola.page';

describe('KonzolaPage: sledeći slajd', () => {
  const lazniStore = {
    stanje: signal<NastavnickoStanje | null>(null),
    greska: signal<string | null>(null),
    veza: signal<'povezivanje' | 'povezan' | 'prekinut'>('povezan'),
    joinLink: signal('http://localhost/uzivo/123456'),
    konzolaLink: signal(''),
    publikaLink: signal(''),
    sat: signal(null),
    ukupnoMs: signal(null),
    dozvoljene: signal(new Set()),
    init: vi.fn(), komanda: vi.fn(), sakrij: vi.fn(), preimenuj: vi.fn(), izbaci: vi.fn(),
  };
  let ucitane: string[];

  async function prikazi() {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '5' })) } }],
    });
    TestBed.overrideComponent(KonzolaPage, { set: { providers: [{ provide: IzvodjenjeStore, useValue: lazniStore }] } });
    const fixture = TestBed.createComponent(KonzolaPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  beforeEach(() => {
    resetujPreducitavanje();
    ucitane = [];
    vi.stubGlobal('Image', class { set src(v: string) { ucitane.push(v); } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.name = '';
    lazniStore.stanje.set(null);
  });

  it('sledeći slajd dobija temu prezentacije; slike sledećeg se učitavaju unapred', async () => {
    const p = platnoSlajd().platno!;
    p.pozadina.medijId = 'kon-pozadina';
    lazniStore.stanje.set(stanje({
      prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd(), tema: 'TAMNA', sledeciSlajd: platnoSlajd({ platno: p }),
    }));
    const f = await prikazi();
    const slajdovi = f.debugElement.queryAll(By.directive(SlajdPrikazComponent)).map((d) => d.componentInstance as SlajdPrikazComponent);
    // trenutni (umanjeni projektor) i sledeći
    expect(slajdovi.length).toBe(2);
    expect(slajdovi.map((s) => s.tema())).toEqual(['TAMNA', 'TAMNA']);
    expect(slajdovi[1].slajd().tip).toBe('PLATNO');
    expect(ucitane).toContain(medijUrl('kon-pozadina'));
  });
});
