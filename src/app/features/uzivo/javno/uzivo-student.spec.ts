import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import {
  JavniZadatak, JavnoPitanje, JavnoStanje, LicniZadatak, LicnoStanje, TelefonPrikaz,
} from '../data-access/uzivo.models';
import { ServerskiSat } from '../data-access/sat';
import { IZASAO_IZ_IZVODJENJA, zapamtiIzlazak } from '../izlaz-iz-izvodjenja';
import { EkranStudenta, FazaStudenta, StudentStore, TacanOdgovor, Veza } from './student.store';
import { POVRATAK_NA_CAS_MS, tacnostUcesnika, UzivoStudentPage } from './uzivo-student.page';

// Uništena stranica izvođenja koje traje pamti izlazak u sessionStorage (`zapamtiIzlazak`), a jsdom ga deli sa ostalim spec
// fajlovima istog radnika. TestBed bi stranice uništio tek u svom afterEach (posle ovog), pa ih ovde uništavamo pre brisanja.
afterEach(() => {
  TestBed.resetTestingModule();
  sessionStorage.clear();
});

/*
 * Stranica studenta sa formulama (faza 5, F3). `StudentStore` je provider komponente, pa se zamenjuje na komponenti.
 * Učitavači formula ostaju oni iz `src/test-setup.ts` (nikad se ne razreše): javni spec ne sme da uvozi
 * `ui/formula-ucitavanje` (`gfs/javna-ruta-uvozi`, odluka 4), a crtanje markup-a pokrivaju `tekst-formule.component.spec`
 * i e2e (F5). Ovde se proverava da tekst pitanja i opcija ide kroz `app-tekst-formule` (mesto formule sa izvorom).
 */

function pitanje(izmene: Partial<JavnoPitanje> = {}): JavnoPitanje {
  return {
    tip: 'JEDAN_TACAN', faza: 'OTVORENO', rundaId: 3, brojOpcija: 2,
    opcije: [{ id: 21, tekst: '$11$' }, { id: 22, tekst: '$13$' }],
    tekst: 'Koliko je $1011_2$?', slikaId: null, jedinica: null, skalaMinOznaka: null, skalaMaxOznaka: null,
    rokMs: null, preostaloMs: null, tacneOpcije: null, tacanBroj: null, prihvatljiviOdgovori: null,
    ...izmene,
  };
}

function javno(telefonPrikaz: TelefonPrikaz, p: JavnoPitanje, detaljiDozvoljeni = false): JavnoStanje {
  return {
    izvodjenjeId: 7, verzija: 4, serverVremeMs: 0, status: 'AKTIVNO', naziv: 'Brojni sistemi', kod: '123456',
    prikaz: 'SLAJD', slajdTip: 'PITANJE', ekran: 'NORMALAN', takmicenje: false, telefonPrikaz, detaljiDozvoljeni,
    brojUcesnika: 1, pitanje: p, rezultat: null, rangLista: null,
  };
}

function lazniStore() {
  return {
    faza: signal<FazaStudenta>('uzivo'), ekran: signal<EkranStudenta>('unos'), javno: signal<JavnoStanje | null>(null),
    licno: signal<LicnoStanje | null>(null), pitanje: signal<JavnoPitanje | null>(null), sat: signal(new ServerskiSat()),
    ukupnoMs: signal<number | null>(null), nacrt: signal(null), ishod: signal(null), tacan: signal<TacanOdgovor | null>(null),
    greska: signal<string | null>(null), ucesnik: signal(null), info: signal(null), kod: signal('123456'),
    veza: signal<Veza>('povezan'), salje: signal(false),
    runda: signal<JavnoPitanje | JavniZadatak | null>(null), zadatak: signal<LicniZadatak | null>(null), nacrtZadatka: signal(null),
    otvori: vi.fn(), prijavi: vi.fn(), odgovori: vi.fn(), sacuvajNacrt: vi.fn(), ponovoUdji: vi.fn(),
    odgovoriZadatak: vi.fn(), sacuvajNacrtZadatka: vi.fn(),
  };
}

describe('UzivoStudentPage: formule u pitanju i odgovorima', () => {
  let lazni: ReturnType<typeof lazniStore>;
  let fixture: ComponentFixture<UzivoStudentPage>;

  function napravi(j: JavnoStanje, ekran: EkranStudenta = 'unos', tacan: TacanOdgovor | null = null): HTMLElement {
    lazni.javno.set(j);
    lazni.pitanje.set(j.pitanje);
    lazni.ekran.set(ekran);
    lazni.tacan.set(tacan);
    fixture = TestBed.createComponent(UzivoStudentPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    lazni = lazniStore();
    TestBed.configureTestingModule({
      imports: [UzivoStudentPage],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ kod: '123456' })) } },
      ],
    });
    TestBed.overrideComponent(UzivoStudentPage, { set: { providers: [{ provide: StudentStore, useValue: lazni }] } });
    // stranica ima `@defer` (lenja komponenta zadatka): preklopljena komponenta se prevodi asinhrono
    await TestBed.compileComponents();
  });

  it('režim PITANJE: tekst pitanja je app-tekst-formule (Markdown) sa mestom formule; kod ide u otvori', () => {
    const el = napravi(javno('PITANJE', pitanje()));
    expect(lazni.otvori).toHaveBeenCalledWith('123456');
    const md = el.querySelector<HTMLElement>('.uz-st-pitanje-vrh app-tekst-formule.uz-st-md');
    expect(md).not.toBeNull();
    expect(md!.style.display).toBe('block');
    expect(md!.querySelector('p')?.textContent).toBe('Koliko je $1011_2$?');
    expect(md!.querySelector('span.uz-formula')?.textContent).toBe('$1011_2$');
    expect(el.querySelector('div.uz-st-md')).toBeNull();
    // opcije na dugmadi (režim A) takođe kroz app-tekst-formule, čitač dobija tekst bez $
    expect(el.querySelectorAll('button app-tekst-formule.uz-st-opcija-tekst').length).toBe(2);
    expect(el.querySelector('button.uz-st-opcija')?.getAttribute('aria-label')).toBe('A, crveni trougao: 11');
  });

  it('Markdown u tekstu pitanja i dalje prolazi Angularov sanitizer (javascript: veza ne prolazi)', () => {
    const el = napravi(javno('PITANJE', pitanje({ tekst: 'Vidi [ovde](javascript:alert(1)) i $x$' })));
    const md = el.querySelector<HTMLElement>('app-tekst-formule.uz-st-md')!;
    expect(md.querySelector('a[href^="javascript"]')).toBeNull();
    expect(md.querySelector('span.uz-formula')?.textContent).toBe('$x$');
  });

  it('režim DUGMAD bez detalja: tekst pitanja ne stiže na ekran (nema app-tekst-formule.uz-st-md)', () => {
    const el = napravi(javno('DUGMAD', pitanje()));
    expect(el.querySelector('app-tekst-formule.uz-st-md')).toBeNull();
    expect(el.querySelector('app-tekst-formule')).toBeNull();
    expect(el.querySelector('.uz-st-detalji-dugme')).toBeNull();
  });

  it('tačan odgovor: tekst tačne opcije je app-tekst-formule; prihvatljiv tekst ostaje običan tekst', () => {
    const el = napravi(javno('PITANJE', pitanje({ faza: 'ZATVORENO' })), 'tacan', { opcije: [{ indeks: 1, tekst: '$13$' }], tekst: null });
    const t = el.querySelector<HTMLElement>('.uz-st-tacna app-tekst-formule');
    expect(t).not.toBeNull();
    expect(t!.querySelector('span.uz-formula')?.textContent).toBe('$13$');

    fixture.destroy();
    const el2 = napravi(javno('PITANJE', pitanje({ tip: 'KRATAK_TEKST', faza: 'ZATVORENO', opcije: null })), 'tacan',
      { opcije: [], tekst: '$x$ ili y' });
    const tacna = el2.querySelector<HTMLElement>('.uz-st-tacna')!;
    expect(tacna.querySelector('app-tekst-formule')).toBeNull();
    expect(tacna.querySelector('strong')?.textContent).toBe('$x$ ili y');
  });

  it('panel Detalji (DUGMAD sa detaljima): tekst pitanja i opcija kroz app-tekst-formule', async () => {
    const el = napravi(javno('DUGMAD', pitanje(), true));
    el.querySelector<HTMLButtonElement>('.uz-st-detalji-dugme')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const panel = el.querySelector<HTMLElement>('.uz-st-detalji')!;
    expect(panel.querySelector('app-tekst-formule.uz-st-md span.uz-formula')?.textContent).toBe('$1011_2$');
    const opcije = Array.from(panel.querySelectorAll('.uz-st-detalji-opcije li app-tekst-formule')) as HTMLElement[];
    expect(opcije.map(o => o.querySelector('span.uz-formula')?.textContent)).toEqual(['$11$', '$13$']);
  });
});

describe('UzivoStudentPage: Zadatak slajd', () => {
  let lazni: ReturnType<typeof lazniStore>;
  let fixture: ComponentFixture<UzivoStudentPage>;

  const jz: JavniZadatak = {
    faza: 'OTVORENO', rundaId: 55, rokMs: null, preostaloMs: 60_000, brojVarijanti: 2, grupaNaziv: '2 → 10', resenjePrikazano: false,
  };
  const lz: LicniZadatak = {
    rundaId: 55, varijantaId: 12, svgId: 'svg-a', faza: 'OTVORENO', primljen: false, ishod: null, tacno: null, tacneVrednosti: null,
    resenjeSvgId: null,
    polja: [{
      kljuc: 'a', oznaka: 'a', tip: 'BROJ', odstupanje: null, odstupanjeTip: null, jedinica: null, zanemariVelicinu: null,
      zanemariRazmake: null, opcije: null,
    }],
  };

  async function napravi(ekran: EkranStudenta, z: LicniZadatak | null = lz, javni: JavniZadatak = jz): Promise<HTMLElement> {
    lazni.javno.set({
      izvodjenjeId: 7, verzija: 4, serverVremeMs: 0, status: 'AKTIVNO', naziv: 'Brojni sistemi', kod: '123456', prikaz: 'SLAJD',
      slajdTip: 'ZADATAK', ekran: 'NORMALAN', takmicenje: false, telefonPrikaz: 'DUGMAD', detaljiDozvoljeni: false,
      brojUcesnika: 1, pitanje: null, rezultat: null, rangLista: null, zadatak: javni,
    });
    lazni.ekran.set(ekran);
    lazni.runda.set(javni);
    lazni.zadatak.set(z);
    fixture = TestBed.createComponent(UzivoStudentPage);
    fixture.detectChanges();
    // komponenta zadatka je lenja (`@defer`): sačeka se njen chunk
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    lazni = lazniStore();
    TestBed.configureTestingModule({
      imports: [UzivoStudentPage],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ kod: '123456' })) } },
      ],
    });
    TestBed.overrideComponent(UzivoStudentPage, { set: { providers: [{ provide: StudentStore, useValue: lazni }] } });
    // stranica ima `@defer` (lenja komponenta zadatka): preklopljena komponenta se prevodi asinhrono
    await TestBed.compileComponents();
  });

  it('CEKA: "Zadatak stiže…" bez slike', async () => {
    const el = await napravi('stize', null, { ...jz, faza: 'CEKA', rundaId: null });
    expect(el.textContent).toContain('Zadatak stiže…');
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('app-zadatak-ekran')).toBeNull();
    expect(el.querySelector('app-zadatak-unos')).toBeNull();
  });

  it('ekrani zadatka: red stanja i unos su u lenjom app-zadatak-ekran (stanje iz store-a stranice, bez ulaza)', async () => {
    const el = await napravi('zadatak');
    const ekran = el.querySelector('app-zadatak-ekran')!;
    expect(ekran).not.toBeNull();
    expect(ekran.querySelector('.uz-st-zd-vrh app-tajmer')).not.toBeNull();
    expect(ekran.querySelector('app-zadatak-unos img[data-zadatak-svg]')).not.toBeNull();
    expect(el.textContent).not.toContain('Učitavanje zadatka…');
  });

  it('otvoreno: svoja slika, tajmer i polja; "Pošalji" ide u odgovoriZadatak', async () => {
    const el = await napravi('zadatak');
    expect(el.querySelector('img[data-zadatak-svg]')?.getAttribute('src')).toBe('api/public/mediji/svg-a');
    expect(el.querySelector('app-tajmer')).not.toBeNull();
    const polje = el.querySelector<HTMLInputElement>('input[data-polje="a"]')!;
    expect(polje.disabled).toBe(false);
    polje.value = '45';
    polje.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(lazni.sacuvajNacrtZadatka).toHaveBeenCalledWith({ rundaId: 55, polja: { a: '45' } });
    Array.from(el.querySelectorAll('button')).find(b => b.textContent!.trim() === 'Pošalji')!.click();
    expect(lazni.odgovoriZadatak).toHaveBeenCalledWith({ a: '45' });
  });

  it('poslato: "Odgovor primljen ✓", slika ostaje, polja i "Pošalji" nestaju', async () => {
    const el = await napravi('zadatakPrimljen');
    expect(el.textContent).toContain('Odgovor primljen ✓');
    expect(el.querySelector('img[data-zadatak-svg]')).not.toBeNull();
    expect(el.querySelector('input[data-polje="a"]')).toBeNull();
    expect(Array.from(el.querySelectorAll('button')).some(b => b.textContent!.trim() === 'Pošalji')).toBe(false);
  });

  it('ishod: naslov "Tačno!" ili "Nisi odgovorio"; rad na papiru bez naslova ishoda', async () => {
    const zatvoreno = { ...jz, faza: 'ZATVORENO' as const };
    let el = await napravi('zadatakIshod', { ...lz, faza: 'ZATVORENO', primljen: true, tacno: true, ishod: { a: true } }, zatvoreno);
    expect(el.querySelector('.uz-st-zd-naslov')?.textContent?.trim()).toBe('Tačno!');
    fixture.destroy();
    el = await napravi('zadatakIshod', { ...lz, faza: 'ZATVORENO' }, zatvoreno);
    expect(el.querySelector('.uz-st-zd-naslov')?.textContent?.trim()).toBe('Nisi odgovorio');
    fixture.destroy();
    el = await napravi('zadatakIshod', { ...lz, faza: 'ZATVORENO', polja: [] }, zatvoreno);
    expect(el.querySelector('.uz-st-zd-naslov')).toBeNull();
    expect(el.textContent).toContain('Reši na papiru.');
  });
});

describe('UzivoStudentPage: povratak na čas (?sa=cas)', () => {
  let lazni: ReturnType<typeof lazniStore>;
  let navigacija: ReturnType<typeof vi.spyOn>;

  async function pripremi(query: Record<string, string>): Promise<void> {
    lazni = lazniStore();
    TestBed.configureTestingModule({
      imports: [UzivoStudentPage],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ kod: '123456' })), snapshot: { queryParamMap: convertToParamMap(query) } },
        },
      ],
    });
    TestBed.overrideComponent(UzivoStudentPage, { set: { providers: [{ provide: StudentStore, useValue: lazni }] } });
    await TestBed.compileComponents();
    navigacija = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function prikazi(faza: FazaStudenta): Promise<ComponentFixture<UzivoStudentPage>> {
    lazni.faza.set(faza);
    lazni.ekran.set('kraj');
    const f = TestBed.createComponent(UzivoStudentPage);
    f.detectChanges();
    await f.whenStable();
    return f;
  }

  it('posleKrajaSaCasVracaNaCas: posle 3 s na nalog/cas (zamena u istoriji)', async () => {
    await pripremi({ sa: 'cas' });
    const f = await prikazi('kraj');
    expect((f.nativeElement as HTMLElement).querySelector('[data-na-cas]')?.textContent).toContain('Vraćam te na čas');
    await vi.advanceTimersByTimeAsync(POVRATAK_NA_CAS_MS - 1);
    expect(navigacija).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(navigacija).toHaveBeenCalledWith('nalog/cas', { replaceUrl: true });
  });

  it('posleKrajaBezSaCasOstaje', async () => {
    await pripremi({});
    const f = await prikazi('kraj');
    await vi.advanceTimersByTimeAsync(POVRATAK_NA_CAS_MS * 3);
    expect(navigacija).not.toHaveBeenCalled();
    expect((f.nativeElement as HTMLElement).querySelector('[data-na-cas]')).toBeNull();
  });

  it('izbacenSaCasVracaNaCas: prijavljen student bez "Uđi ponovo", pa nazad na čas', async () => {
    await pripremi({ sa: 'cas' });
    lazni.info.set({ naziv: 'Statika', prijavljenStudent: true } as never);
    const f = await prikazi('izbacen');
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Nastavnik te je uklonio iz ovog izvođenja.');
    expect(el.textContent).not.toContain('Uđi ponovo');
    await vi.advanceTimersByTimeAsync(POVRATAK_NA_CAS_MS);
    expect(navigacija).toHaveBeenCalledWith('nalog/cas', { replaceUrl: true });
  });

  it('bodovanoBezCekiranjaPrikazujePoruku: poruka servera, bez forme imena i bez "Pokušaj ponovo"', async () => {
    await pripremi({});
    lazni.greska.set('Prvo se čekiraj: skeniraj QR sa table.');
    const f = await prikazi('cekiranje');
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-cekiranje]')?.textContent).toBe('Prvo se čekiraj: skeniraj QR sa table.');
    expect(el.querySelector('#uz-st-ime')).toBeNull();
    expect(el.textContent).not.toContain('Pokušaj ponovo');
    await vi.advanceTimersByTimeAsync(POVRATAK_NA_CAS_MS * 2);
    expect(navigacija).not.toHaveBeenCalled();
  });
});

function licno(izmene: Partial<LicnoStanje> = {}): LicnoStanje {
  return { verzija: 1, ucesnikId: 5, ime: 'Ana', poeni: 1200, mesto: 2, brojUcesnika: 9, izbacen: false, odgovor: null, ...izmene };
}

describe('tacnostUcesnika', () => {
  it.each([
    [null, null],
    [licno(), null],
    [licno({ tacnih: 0, dugovanih: 0 }), null],
    [licno({ tacnih: 0, dugovanih: 2 }), 'Tačno 0 od 2'],
    [licno({ tacnih: 3, dugovanih: 5 }), 'Tačno 3 od 5'],
  ] as const)('%j -> %s', (l, ocekivano) => {
    expect(tacnostUcesnika(l)).toBe(ocekivano);
  });
});

describe('UzivoStudentPage: Izađi, tačnost i pamćenje izlaska', () => {
  let lazni: ReturnType<typeof lazniStore>;
  let navigacija: ReturnType<typeof vi.spyOn>;

  async function pripremi(query: Record<string, string>): Promise<ComponentFixture<UzivoStudentPage>> {
    sessionStorage.clear();
    lazni = lazniStore();
    TestBed.configureTestingModule({
      imports: [UzivoStudentPage],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ kod: '123456' })), snapshot: { queryParamMap: convertToParamMap(query) } },
        },
      ],
    });
    TestBed.overrideComponent(UzivoStudentPage, { set: { providers: [{ provide: StudentStore, useValue: lazni }] } });
    await TestBed.compileComponents();
    navigacija = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    lazni.ekran.set('tabla');
    const f = TestBed.createComponent(UzivoStudentPage);
    f.detectChanges();
    return f;
  }

  afterEach(() => sessionStorage.clear());

  it('otvaranje briše zapamćen izlazak; napuštanje izvođenja koje traje ga pamti', async () => {
    zapamtiIzlazak('123456');
    const f = await pripremi({ sa: 'cas' });
    expect(sessionStorage.getItem(IZASAO_IZ_IZVODJENJA)).toBeNull();
    f.destroy();
    expect(sessionStorage.getItem(IZASAO_IZ_IZVODJENJA)).toBe('123456');
  });

  it.each(['kraj', 'izbacen'] as const)('posle faze %s napuštanje ne pamti izlazak (izvođenje se završilo)', async faza => {
    const f = await pripremi({ sa: 'cas' });
    lazni.faza.set(faza);
    f.destroy();
    expect(sessionStorage.getItem(IZASAO_IZ_IZVODJENJA)).toBeNull();
  });

  it('Izađi sa časa: tab Čas uz zamenu u istoriji', async () => {
    const f = await pripremi({ sa: 'cas' });
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-izadji]')!.click();
    expect(navigacija).toHaveBeenCalledExactlyOnceWith('nalog/cas', { replaceUrl: true });
  });

  it('Izađi: prijavljen student bez ?sa=cas ide na Početnu, gost na unos koda', async () => {
    let f = await pripremi({});
    lazni.info.set({ naziv: 'Statika', prijavljenStudent: true } as never);
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-izadji]')!.click();
    expect(navigacija).toHaveBeenCalledExactlyOnceWith('nalog/pocetna');
    f.destroy();
    TestBed.resetTestingModule();
    f = await pripremi({});
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-izadji]')!.click();
    expect(navigacija).toHaveBeenCalledExactlyOnceWith('uzivo');
  });

  it('tačnost u zaglavlju i na ekranu "Gledaj u tablu"; bez nijednog pitanja ništa', async () => {
    const f = await pripremi({ sa: 'cas' });
    const el = f.nativeElement as HTMLElement;
    lazni.licno.set(licno());
    f.detectChanges();
    expect(el.querySelector('[data-tacnost]')).toBeNull();
    expect(el.querySelector('[data-skor]')).toBeNull();
    lazni.licno.set(licno({ tacnih: 3, dugovanih: 5 }));
    f.detectChanges();
    expect(el.querySelector('[data-tacnost]')?.textContent?.trim()).toBe('Tačno 3 od 5');
    expect(el.querySelector('[data-skor]')?.textContent).toContain('Tačno 3 od 5');
  });

  it('takmičenje: poeni i tačnost u istom redu', async () => {
    const f = await pripremi({ sa: 'cas' });
    lazni.javno.set({ ...javno('PITANJE', pitanje()), takmicenje: true });
    lazni.licno.set(licno({ tacnih: 1, dugovanih: 2 }));
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('[data-tacnost]')?.textContent?.replace(/\s+/g, ' ').trim())
      .toBe('1 200 poena · Tačno 1 od 2');
  });
});
