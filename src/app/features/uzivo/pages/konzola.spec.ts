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
import { ServerskiSat } from '../data-access/sat';
import { BeleskePanelComponent } from './beleske-panel.component';
import { KonzolaPage } from './konzola.page';
import { VremeIzvodjenjaComponent } from './vreme-izvodjenja.component';

describe('KonzolaPage: sledeći slajd', () => {
  const lazniStore = {
    stanje: signal<NastavnickoStanje | null>(null),
    greska: signal<string | null>(null),
    veza: signal<'povezivanje' | 'povezan' | 'prekinut'>('povezan'),
    joinLink: signal('http://localhost/uzivo/123456'),
    konzolaLink: signal(''),
    publikaLink: signal(''),
    sat: signal(new ServerskiSat()),
    ukupnoMs: signal(null),
    dozvoljene: signal(new Set()),
    init: vi.fn(), komanda: vi.fn(), sakrij: vi.fn(), preimenuj: vi.fn(), izbaci: vi.fn(), posleVracanja: vi.fn(),
    daljinskiLink: signal(''),
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

describe('KonzolaPage: zaglavlje, beleške, telefon, povratak', () => {
  const lazniStore = {
    stanje: signal<NastavnickoStanje | null>(null),
    greska: signal<string | null>(null),
    veza: signal<'povezivanje' | 'povezan' | 'prekinut'>('povezan'),
    joinLink: signal('http://localhost/uzivo/123456'),
    konzolaLink: signal('http://localhost/izvodjenja/5/konzola'),
    daljinskiLink: signal('http://localhost/izvodjenja/5/daljinski'),
    publikaLink: signal(''),
    sat: signal(new ServerskiSat()),
    ukupnoMs: signal(null),
    dozvoljene: signal(new Set()),
    init: vi.fn(), komanda: vi.fn(), sakrij: vi.fn(), preimenuj: vi.fn(), izbaci: vi.fn(), posleVracanja: vi.fn(),
  };

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

  const vidljivost = (v: 'hidden' | 'visible') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(() => {
    resetujPreducitavanje();
    vi.stubGlobal('Image', class { set src(v: string) { /* bez mreže */ } });
    lazniStore.posleVracanja.mockClear();
    lazniStore.stanje.set(stanje({
      prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd({ postepeno: true, beleske: 'Reci uvod.' }), korak: 1, brojStavki: 3,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'visibilityState');
    window.name = '';
    lazniStore.stanje.set(null);
  });

  it('zaglavlje ima vreme izvođenja i položaj sa korakom', async () => {
    const f = await prikazi();
    expect(f.debugElement.query(By.directive(VremeIzvodjenjaComponent))).not.toBeNull();
    expect((f.nativeElement as HTMLElement).querySelector('.uz-kon-meta')?.textContent).toContain('Slajd 1/3 · korak 1/3');
  });

  it('beleške su panel sa tekstom trenutnog slajda', async () => {
    const f = await prikazi();
    const panel = f.debugElement.query(By.directive(BeleskePanelComponent));
    expect(panel.nativeElement.textContent).toContain('Reci uvod.');
  });

  it('Telefon: QR daljinskog, "Cela konzola" menja QR i aria-pressed', async () => {
    const f = await prikazi();
    const dugme = Array.from((f.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Telefon')) as HTMLButtonElement;
    dugme.click();
    await f.whenStable();
    const qr = () => document.querySelector('app-qr-kod canvas')?.getAttribute('aria-label');
    expect(qr()).toBe('QR kod: http://localhost/izvodjenja/5/daljinski');
    const konz = Array.from(document.querySelectorAll('.uz-kon-telefon-izbor button'))
      .find((b) => b.textContent?.includes('Cela konzola')) as HTMLButtonElement;
    expect(konz.getAttribute('aria-pressed')).toBe('false');
    konz.click();
    f.detectChanges();
    await f.whenStable();
    expect(konz.getAttribute('aria-pressed')).toBe('true');
    expect(qr()).toBe('QR kod: http://localhost/izvodjenja/5/konzola');
  });

  it('povratak na stranicu zove store.posleVracanja', async () => {
    await prikazi();
    vidljivost('hidden');
    vidljivost('visible');
    expect(lazniStore.posleVracanja).toHaveBeenCalledTimes(1);
  });

  it('posle uništenja stranice povratak više ne zove store', async () => {
    const f = await prikazi();
    f.destroy();
    vidljivost('hidden');
    vidljivost('visible');
    expect(lazniStore.posleVracanja).not.toHaveBeenCalled();
  });
});
