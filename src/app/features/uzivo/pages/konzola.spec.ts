import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
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
import { RezimProjektora } from '../../../core/layout/rezim-projektora';
import { KonzolaPage } from './konzola.page';
import { VremeIzvodjenjaComponent } from './vreme-izvodjenja.component';

describe('KonzolaPage: sledeći slajd', () => {
  const lazniStore = {
    stanje: signal<NastavnickoStanje | null>(null),
    greska: signal<string | null>(null),
    veza: signal<'povezivanje' | 'povezan' | 'prekinut'>('povezan'),
    joinLink: signal('http://localhost/uzivo/123456'),
    qrLink: signal('http://localhost/uzivo/123456'),
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
    qrLink: signal('http://localhost/uzivo/123456'),
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

  it('posle kraja: završni ekran umesto konzole, prati dan/noć dok je prikazan', async () => {
    const f = await prikazi();
    const rezim = TestBed.inject(RezimProjektora);
    expect(rezim.pratiRezim()).toBe(false);
    const s = lazniStore.stanje()!;
    lazniStore.stanje.set({ ...s, izvodjenje: { ...s.izvodjenje, status: 'ZAVRSENO', kraj: '2026-10-29T10:41:00' } });
    f.detectChanges();
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('app-kraj-izvodjenja')).not.toBeNull();
    expect(el.querySelector('app-beleske-panel')).toBeNull();
    expect(rezim.pratiRezim()).toBe(true);
    f.destroy();
    expect(rezim.pratiRezim()).toBe(false);
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
    qrLink: signal('http://localhost/uzivo/123456'),
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

  it('taster R dvaput u roku 2 s ponavlja bez potvrde (natpis posle prvog), Shift+R šalje RESENJE', async () => {
    const f = await prikazi(naZadatku('ZATVORENO'));
    const r = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }));
    r();
    f.detectChanges();
    expect(lazniStore.komanda).not.toHaveBeenCalled();
    expect(tekst(f)).toContain('Pritisni R ponovo da ponoviš pitanje');
    r();
    f.detectChanges();
    expect(lazniStore.komanda).toHaveBeenCalledWith('PONOVI');
    expect(otvoreno).not.toHaveBeenCalled();
    expect(tekst(f)).not.toContain('Pritisni R ponovo');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'R', shiftKey: true, bubbles: true, cancelable: true }));
    expect(lazniStore.komanda).toHaveBeenCalledWith('RESENJE', undefined);
    expect(otvoreno).not.toHaveBeenCalled();
  });

  it('R pa drugi taster: ponavljanje se prekida (drugi R opet samo najavljuje)', async () => {
    await prikazi(naZadatku('ZATVORENO'));
    const taster = (key: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    taster('r');
    taster('t');
    taster('r');
    expect(lazniStore.komanda).not.toHaveBeenCalledWith('PONOVI');
  });

  it('dugme "Ponovi zadatak" i dalje traži potvrdu "Ponoviti zadatak?"', async () => {
    const f = await prikazi(naZadatku('ZATVORENO'));
    const dugme = (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[aria-keyshortcuts="R"]')!;
    dugme.click();
    expect(otvoreno).toHaveBeenCalledTimes(1);
    expect((otvoreno.mock.calls[0][1] as { data: { naslov: string } }).data.naslov).toBe('Ponoviti zadatak?');
    expect(lazniStore.komanda).not.toHaveBeenCalled();
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

describe('KonzolaPage: crtanje', () => {
  const lazniStore = {
    stanje: signal<NastavnickoStanje | null>(null),
    greska: signal<string | null>(null),
    veza: signal<'povezivanje' | 'povezan' | 'prekinut'>('povezan'),
    joinLink: signal('http://localhost/uzivo/123456'),
    qrLink: signal('http://localhost/uzivo/123456'),
    konzolaLink: signal(''),
    daljinskiLink: signal(''),
    publikaLink: signal(''),
    sat: signal(new ServerskiSat()),
    ukupnoMs: signal(null),
    dozvoljene: signal<ReadonlySet<TipKomande>>(new Set()),
    init: vi.fn(), komanda: vi.fn(), sakrij: vi.fn(), preimenuj: vi.fn(), izbaci: vi.fn(), posleVracanja: vi.fn(),
  };
  const slajd = infoSlajd();
  const naSlajdu = (o: Partial<NastavnickoStanje> = {}) => stanje({
    prikaz: 'SLAJD', indeks: 0, brojSlajdova: 3, trenutniSlajd: slajd, crtez: { slajdId: slajd.id, pozadina: 'SLAJD', verzija: 0 }, ...o,
  });
  let http: HttpTestingController;

  async function prikazi(s: NastavnickoStanje) {
    lazniStore.stanje.set(s);
    lazniStore.dozvoljene.set(dozvoljeneKomande(s));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '5' })) } }],
    });
    TestBed.overrideComponent(KonzolaPage, { set: { providers: [{ provide: IzvodjenjeStore, useValue: lazniStore }] } });
    const fixture = TestBed.createComponent(KonzolaPage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }
  const taster = (key: string, mod: KeyboardEventInit = {}) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mod }));
  const el = (f: { nativeElement: HTMLElement }) => f.nativeElement;
  /** Odgovor na GET strane (i raniji crteži prazni). */
  function odgovoriStrani(elementi: unknown[] = []) {
    for (const r of http.match(req => req.url.endsWith('/crtezi/ranije'))) r.flush([]);
    http.expectOne(req => req.url.endsWith('/crtezi/strana') && req.method === 'GET').flush({ elementi, verzija: 0 });
  }

  beforeEach(() => {
    resetujPreducitavanje();
    vi.stubGlobal('Image', class { set src(v: string) { /* bez mreže */ } });
    localStorage.clear();
    lazniStore.komanda.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.name = '';
    lazniStore.stanje.set(null);
  });

  it('D ulazi u crtanje (alati, traka, površina), D ponovo izlazi; zaglavlje ostaje', async () => {
    const f = await prikazi(naSlajdu());
    odgovoriStrani();
    expect(el(f).querySelector('app-raspored-crtanja')).toBeNull();
    taster('d');
    f.detectChanges();
    expect(el(f).querySelector('app-raspored-crtanja')).not.toBeNull();
    expect(el(f).querySelectorAll('app-alati-crtanja button[aria-keyshortcuts]').length).toBe(7);
    expect(el(f).querySelector('app-povrsina-crtanja')).not.toBeNull();
    expect(el(f).querySelector('.uz-kon-zaglavlje')).not.toBeNull();
    expect(el(f).querySelector('button[aria-label="Crtaj"]')!.getAttribute('aria-pressed')).toBe('true');
    taster('d');
    f.detectChanges();
    expect(el(f).querySelector('app-raspored-crtanja')).toBeNull();
  });

  it('u crtanju 1–7 biraju alat, G + cifre i dalje idu na slajd, strelice listaju, Esc izlazi', async () => {
    const f = await prikazi(naSlajdu());
    odgovoriStrani();
    taster('d');
    taster('4');
    f.detectChanges();
    expect(el(f).querySelector('button[aria-label="Strelica"]')!.getAttribute('aria-pressed')).toBe('true');
    taster('g');
    taster('2');
    taster('Enter');
    expect(lazniStore.komanda).toHaveBeenCalledWith('IDI_NA', 1);
    f.detectChanges();
    expect(el(f).querySelector('button[aria-label="Strelica"]')!.getAttribute('aria-pressed')).toBe('true');
    taster('ArrowRight');
    expect(lazniStore.komanda).toHaveBeenCalledWith('SLEDECI', undefined);
    taster('Escape');
    f.detectChanges();
    expect(el(f).querySelector('app-raspored-crtanja')).toBeNull();
  });

  it('Ctrl+Z poništava i Ctrl+Y vraća poslednji potez strane (PUT cele strane)', async () => {
    const linija = { tip: 'LINIJA', boja: '#121A2A', debljina: 3, tacke: [0, 0, 50, 50] };
    const f = await prikazi(naSlajdu({ crtez: { slajdId: slajd.id, pozadina: 'SLAJD', verzija: 1 } }));
    odgovoriStrani([linija]);
    taster('d');
    f.detectChanges();
    expect(el(f).querySelector<HTMLButtonElement>('button[aria-label="Obriši sve"]')!.disabled).toBe(false);
    el(f).querySelector<HTMLButtonElement>('button[aria-label="Obriši sve"]')!.click();
    let put = http.expectOne(req => req.method === 'PUT');
    expect(put.request.body).toEqual({ elementi: [] });
    put.flush({ verzija: 2 });
    taster('z', { ctrlKey: true });
    put = http.expectOne(req => req.method === 'PUT');
    expect(put.request.body).toEqual({ elementi: [linija] });
    put.flush({ verzija: 3 });
    taster('y', { ctrlKey: true });
    put = http.expectOne(req => req.method === 'PUT');
    expect(put.request.body).toEqual({ elementi: [] });
  });

  it('na prijavi (bez strane) "Crtaj" ne radi i ima oblačić; D ne ulazi u crtanje', async () => {
    const f = await prikazi(stanje({ prikaz: 'PRIJAVA', crtez: null }));
    const dugme = el(f).querySelector('button[aria-label="Crtaj"]')!;
    expect(dugme.getAttribute('aria-disabled')).toBe('true');
    taster('d');
    f.detectChanges();
    expect(el(f).querySelector('app-raspored-crtanja')).toBeNull();
  });

  it('na crnom ekranu ulazak u crtanje prvo gasi crni ekran', async () => {
    const f = await prikazi(naSlajdu({ ekran: 'CRN' }));
    odgovoriStrani();
    taster('d');
    f.detectChanges();
    expect(lazniStore.komanda).toHaveBeenCalledWith('EKRAN_CRN');
    expect(el(f).querySelector('app-raspored-crtanja')).not.toBeNull();
  });

  it('čip "Ranije si na ovom slajdu crtao" kad ima ranijih crteža; klik ulazi u crtanje i panel ih nudi', async () => {
    const f = await prikazi(naSlajdu());
    http.expectOne(req => req.url.endsWith('/crtezi/ranije')).flush([
      { izvodjenjeId: 2, pocetak: '2026-11-12T10:00:00', grupa: 'GD-2025', pozadina: 'SLAJD',
        elementi: [{ tip: 'KRUG', boja: '#2456A6', debljina: 6, tacke: [0, 0, 80, 80] }] },
    ]);
    http.expectOne(req => req.url.endsWith('/crtezi/strana')).flush({ elementi: [], verzija: 0 });
    f.detectChanges();
    const cip = el(f).querySelector<HTMLButtonElement>('.uz-kon-ranije-cip')!;
    expect(cip.textContent).toContain('Ranije si na ovom slajdu crtao');
    cip.click();
    f.detectChanges();
    const panel = el(f).querySelector('app-ranije-panel')!;
    expect(panel.textContent).toContain('GD-2025 · 12. 11. 2026.');
    panel.querySelector<HTMLButtonElement>('button')!.click();
    const put = http.expectOne(req => req.method === 'PUT');
    expect((put.request.body as { elementi: unknown[] }).elementi).toHaveLength(1);
  });

  it('prekidač "Nudi ranije crteže" isključen: nema zahteva ni čipa', async () => {
    localStorage.setItem('gfs.ranije-crteze.v1', '0');
    TestBed.resetTestingModule();
    const f = await prikazi(naSlajdu());
    expect(http.match(req => req.url.endsWith('/crtezi/ranije')).length).toBe(0);
    odgovoriStrani();
    f.detectChanges();
    expect(el(f).querySelector('.uz-kon-ranije-cip')).toBeNull();
  });
});
