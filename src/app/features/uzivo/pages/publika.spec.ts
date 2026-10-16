import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { infoSlajd, naPitanju, platnoSlajd, stanje } from '../data-access/izvodjenje-podaci.testing';
import { IzvodjenjeStore } from '../data-access/izvodjenje.store';
import { NastavnickoStanje, medijUrl } from '../data-access/uzivo.models';
import { resetujPreducitavanje } from '../ui/preducitavanje';
import { PublikaScenaComponent } from './publika-scena.component';
import { PublikaPage, scenaPosle } from './publika.page';

const zavrseno = (s: NastavnickoStanje): NastavnickoStanje =>
  ({ ...s, verzija: s.verzija + 1, izvodjenje: { ...s.izvodjenje, status: 'ZAVRSENO' } });

const kraj = stanje({
  prikaz: 'KRAJ', indeks: 3, takmicenje: true, verzija: 8,
  javnaRangLista: [{ mesto: 1, ucesnikId: null, ime: 'Ana', poeni: 1800 }, { mesto: 2, ucesnikId: null, ime: 'Bojan', poeni: 900 }],
});

describe('scenaPosle', () => {
  it('aktivno: uvek trenutni snimak', () => {
    const s = naPitanju('OTVORENO');
    expect(scenaPosle(s, kraj)).toBe(s);
    expect(scenaPosle(null, kraj)).toBeNull();
  });

  it('završeno posle KRAJ: ostaje poslednji KRAJ (postolje)', () => {
    // bez čuvanja server briše učesnike, pa završeni snimak više nema rang-listu
    const kasnije = zavrseno({ ...kraj, javnaRangLista: [], ucesnici: [] });
    expect(scenaPosle(kasnije, kraj)).toBe(kraj);
    // i sledeći završeni snimak ga zadržava
    expect(scenaPosle(zavrseno(kasnije), kraj)).toBe(kraj);
  });

  it('završeno iz drugog prikaza, tek učitano ili drugo izvođenje: bez scene', () => {
    const slajd = naPitanju('ZATVORENO');
    expect(scenaPosle(zavrseno(slajd), slajd)).toBeNull();
    expect(scenaPosle(zavrseno(kraj), null)).toBeNull();
    const drugo = zavrseno({ ...kraj, izvodjenje: { ...kraj.izvodjenje, id: 99 } });
    expect(scenaPosle(drugo, kraj)).toBeNull();
  });
});

describe('PublikaPage', () => {
  const lazniStore = {
    stanje: signal<NastavnickoStanje | null>(null),
    greska: signal<string | null>(null),
    veza: signal<'povezivanje' | 'povezan' | 'prekinut'>('povezan'),
    joinLink: signal('http://localhost/uzivo/123456'),
    konzolaLink: signal(''),
    sat: signal(null),
    dozvoljene: signal(new Set()),
    init: vi.fn(),
    komanda: vi.fn(),
    posleVracanja: vi.fn(),
  };

  async function prikazi() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '5' })) } }],
    });
    TestBed.overrideComponent(PublikaPage, { set: { providers: [{ provide: IzvodjenjeStore, useValue: lazniStore }] } });
    const fixture = TestBed.createComponent(PublikaPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  const osvezi = async (f: Awaited<ReturnType<typeof prikazi>>) => {
    f.detectChanges();
    await f.whenStable();
  };

  beforeEach(() => resetujPreducitavanje());

  afterEach(() => {
    window.name = '';
    lazniStore.stanje.set(null);
    lazniStore.veza.set('povezan');
  });

  it('povratak na stranicu zove store.posleVracanja, a posle uništenja ne', async () => {
    lazniStore.posleVracanja.mockClear();
    lazniStore.stanje.set(naPitanju('CEKA'));
    const f = await prikazi();
    const vidljivost = (v: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    try {
      vidljivost('hidden');
      vidljivost('visible');
      expect(lazniStore.posleVracanja).toHaveBeenCalledTimes(1);
      f.destroy();
      vidljivost('hidden');
      vidljivost('visible');
      expect(lazniStore.posleVracanja).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
    }
  });

  it('epoha veze raste pri svakom prekidu (povezan -> prekinut), ne pri ponovnom povezivanju', async () => {
    lazniStore.stanje.set(naPitanju('CEKA'));
    const f = await prikazi();
    const epoha = () => (f.debugElement.query(By.directive(PublikaScenaComponent)).componentInstance as PublikaScenaComponent).epohaVeze();
    expect(epoha()).toBe(0);
    lazniStore.veza.set('prekinut');
    await osvezi(f);
    expect(epoha()).toBe(1);
    lazniStore.veza.set('povezan');
    await osvezi(f);
    expect(epoha()).toBe(1);
    lazniStore.veza.set('prekinut');
    await osvezi(f);
    lazniStore.veza.set('povezan');
    await osvezi(f);
    expect(epoha()).toBe(2);
  });

  it('"Završi" dok je postolje na platnu: postolje ostaje', async () => {
    lazniStore.stanje.set(kraj);
    const f = await prikazi();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('app-postolje')?.textContent).toContain('Ana');

    lazniStore.stanje.set(zavrseno({ ...kraj, javnaRangLista: [], ucesnici: [] }));
    await osvezi(f);
    expect(el.querySelector('app-postolje')?.textContent).toContain('Ana');
    expect(el.textContent).not.toContain('Izvođenje je završeno.');
  });

  it('"Završi" sa slajda: poruka o kraju', async () => {
    const slajd = naPitanju('ZATVORENO');
    lazniStore.stanje.set(slajd);
    const f = await prikazi();
    lazniStore.stanje.set(zavrseno(slajd));
    await osvezi(f);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('app-publika-scena')).toBeNull();
    expect(el.textContent).toContain('Izvođenje je završeno. Hvala!');
  });

  describe('fontovi i slike unapred', () => {
    let load: ReturnType<typeof vi.fn>;
    let razresi: () => void;

    beforeEach(() => {
      const cekanje = new Promise<void>((r) => { razresi = r; });
      load = vi.fn(() => cekanje);
      Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
    });

    afterEach(() => {
      delete (document as Partial<Document> & { fonts?: unknown }).fonts;
      vi.unstubAllGlobals();
    });

    it('prvi snimak: učitavanje dok fontovi trenutnog, sledećeg slajda i teme ne stignu, pa scena', async () => {
      const p = platnoSlajd().platno!;
      const tekst = p.slojevi.find((s) => s.tip === 'TEKST')!;
      if (tekst.tip === 'TEKST') tekst.pasusi[0].delovi[0].font = 'Tinos';
      lazniStore.stanje.set(stanje({
        prikaz: 'SLAJD', indeks: 0, tema: 'PAPIR', trenutniSlajd: platnoSlajd({ platno: p }),
        sledeciSlajd: platnoSlajd({ id: 31 }),
      }));
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(), provideHttpClientTesting(),
          { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '5' })) } }],
      });
      TestBed.overrideComponent(PublikaPage, { set: { providers: [{ provide: IzvodjenjeStore, useValue: lazniStore }] } });
      const f = TestBed.createComponent(PublikaPage);
      f.detectChanges();
      const el = f.nativeElement as HTMLElement;
      expect(el.querySelector('app-publika-scena')).toBeNull();
      expect(el.textContent).toContain('Učitavanje…');
      const trazeni = new Set(load.mock.calls.map((c) => String(c[0]).replace(/^\d+ 32px /, '')));
      // Cousine: formula fabričkog platna nema sliku izvora (LaTeX izvor se crta tim fontom)
      expect([...trazeni].sort()).toEqual(['"Caladea"', '"Carlito"', '"Cousine"', '"Tinos"']);

      razresi();
      await new Promise((r) => setTimeout(r));
      await osvezi(f);
      expect(el.querySelector('app-publika-scena .uz-pl-platno')).not.toBeNull();
      expect(el.textContent).not.toContain('Učitavanje…');
    });

    it('posle svakog snimka unapred učitava slike sledećeg slajda', async () => {
      const ucitane: string[] = [];
      vi.stubGlobal('Image', class { set src(v: string) { ucitane.push(v); } });
      const slika = { id: 'pub-sledeca', naziv: 's.png', mime: 'image/png', velicina: 1 };
      lazniStore.stanje.set(stanje({ sledeciSlajd: infoSlajd({ slika }) }));
      const f = await prikazi();
      expect(ucitane).toContain(medijUrl('pub-sledeca'));

      const p = platnoSlajd().platno!;
      p.pozadina.medijId = 'pub-pozadina';
      lazniStore.stanje.set(stanje({ verzija: 2, prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd({ slika }),
        sledeciSlajd: platnoSlajd({ platno: p }) }));
      await osvezi(f);
      expect(ucitane).toContain(medijUrl('pub-pozadina'));
    });

    it('formula bez slike na sledećem slajdu: unapred stil formula (MathLive) iako trenutni slajd nema formulu', async () => {
      vi.stubGlobal('Image', class { set src(v: string) { /* bez mreže */ } });
      const linkovi = () => document.head.querySelectorAll('link[data-gfs="mathlive"]');
      lazniStore.stanje.set(stanje({ prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd(), sledeciSlajd: infoSlajd() }));
      const f = await prikazi();
      expect(linkovi().length).toBe(0);
      // fabričko platno ima FORMULA x^2 bez slike izvora
      lazniStore.stanje.set(stanje({ verzija: 2, prikaz: 'SLAJD', indeks: 0, trenutniSlajd: infoSlajd(),
        sledeciSlajd: platnoSlajd() }));
      await osvezi(f);
      expect(linkovi().length).toBe(1);
    });
  });
});
