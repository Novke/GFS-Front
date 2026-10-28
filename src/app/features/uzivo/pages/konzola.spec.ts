import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { infoSlajd, naZadatku, platnoSlajd, stanje } from '../data-access/izvodjenje-podaci.testing';
import { dozvoljeneKomande } from '../data-access/izvodjenje-pravila';
import { IzvodjenjeStore } from '../data-access/izvodjenje.store';
import { NastavnickoStanje, TipKomande, medijUrl } from '../data-access/uzivo.models';
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
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '5' })) } }],
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
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '5' })) } }],
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

  it('"čekirano N" u zaglavlju samo za izvođenje sa predavanja', async () => {
    lazniStore.stanje.update(s => s && { ...s, brojCekiranih: 18, brojOcekivanih: 18 });
    const f = await prikazi();
    expect((f.nativeElement as HTMLElement).querySelector('.uz-kon-meta')?.textContent).toContain('čekirano 18');
    lazniStore.stanje.update(s => s && { ...s, brojCekiranih: null });
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('.uz-kon-meta')?.textContent).not.toContain('čekirano');
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

describe('KonzolaPage: Zadatak slajd i bodovan run', () => {
  const lazniStore = {
    stanje: signal<NastavnickoStanje | null>(null),
    greska: signal<string | null>(null),
    veza: signal<'povezivanje' | 'povezan' | 'prekinut'>('povezan'),
    joinLink: signal('http://localhost/uzivo/123456'),
    konzolaLink: signal(''),
    daljinskiLink: signal(''),
    publikaLink: signal(''),
    sat: signal(new ServerskiSat()),
    ukupnoMs: signal(null),
    dozvoljene: signal<ReadonlySet<TipKomande>>(new Set()),
    init: vi.fn(), komanda: vi.fn(), sakrij: vi.fn(), preimenuj: vi.fn(), izbaci: vi.fn(), posleVracanja: vi.fn(),
  };
  let otvoreno: ReturnType<typeof vi.spyOn>;

  async function prikazi(s: NastavnickoStanje) {
    lazniStore.stanje.set(s);
    lazniStore.dozvoljene.set(dozvoljeneKomande(s));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '5' })) } }],
    });
    TestBed.overrideComponent(KonzolaPage, { set: { providers: [{ provide: IzvodjenjeStore, useValue: lazniStore }] } });
    otvoreno = vi.spyOn(TestBed.inject(MatDialog), 'open')
      .mockReturnValue({ afterClosed: () => of(false) } as unknown as MatDialogRef<unknown>);
    const fixture = TestBed.createComponent(KonzolaPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  beforeEach(() => {
    resetujPreducitavanje();
    vi.stubGlobal('Image', class { set src(v: string) { /* bez mreže */ } });
    lazniStore.komanda.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.name = '';
    lazniStore.stanje.set(null);
  });

  const tekst = (f: { nativeElement: HTMLElement }) => (f.nativeElement.textContent ?? '').replace(/\s+/g, ' ');

  it('Zadatak slajd: kartica "Zadatak" sa panelom; izbor broja ide serveru kao BROJ_VARIJANTI', async () => {
    const f = await prikazi(naZadatku('CEKA'));
    const kartica = (f.nativeElement as HTMLElement).querySelector('section[aria-label="Zadatak"]');
    expect(kartica?.querySelector('app-zadatak-panel')).not.toBeNull();
    expect(tekst(f)).not.toContain('Rezultati se vide kad se pitanje otvori.');
    const izbor = kartica!.querySelector('select')!;
    izbor.value = '0';
    izbor.dispatchEvent(new Event('change'));
    expect(lazniStore.komanda).toHaveBeenCalledWith('BROJ_VARIJANTI', 0);
  });

  it('otvorena Zadatak runda: "Odgovorili" i kartice varijanti', async () => {
    const f = await prikazi(naZadatku('OTVORENO'));
    expect(tekst(f)).toContain('Odgovorili 0/2');
    expect((f.nativeElement as HTMLElement).querySelectorAll('section[aria-label="Zadatak"] img').length).toBe(2);
  });

  it('učesnici dobijaju varijantu trenutne Zadatak runde', async () => {
    const s = naZadatku('OTVORENO');
    const f = await prikazi({ ...s, ucesnici: s.ucesnici.map((u, i) => ({ ...u, varijantaId: 11 + i, tacno: null })) });
    const lista = (f.nativeElement as HTMLElement).querySelector('app-ucesnici-panel')!.textContent!;
    expect(lista).toContain('V11');
    expect(lista).toContain('V12');
  });

  it('R na Zadatak slajdu traži potvrdu "Ponoviti zadatak?", Shift+R šalje RESENJE bez potvrde', async () => {
    await prikazi(naZadatku('ZATVORENO'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }));
    expect(otvoreno).toHaveBeenCalledTimes(1);
    expect((otvoreno.mock.calls[0][1] as { data: { naslov: string } }).data.naslov).toBe('Ponoviti zadatak?');
    expect(lazniStore.komanda).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'R', shiftKey: true, bubbles: true, cancelable: true }));
    expect(lazniStore.komanda).toHaveBeenCalledWith('RESENJE', undefined);
    expect(otvoreno).toHaveBeenCalledTimes(1);
  });

  it('zaglavlje: čip "Boduje se" samo za bodovan run', async () => {
    const s = naZadatku('CEKA');
    let f = await prikazi(s);
    expect(f.nativeElement.querySelector('.uz-kon-meta')?.textContent).not.toContain('Boduje se');
    f.destroy();
    TestBed.resetTestingModule();
    f = await prikazi({ ...s, izvodjenje: { ...s.izvodjenje, boduje: true } });
    expect(f.nativeElement.querySelector('.uz-kon-meta .uz-boduje')?.textContent?.trim()).toBe('Boduje se');
  });
});
