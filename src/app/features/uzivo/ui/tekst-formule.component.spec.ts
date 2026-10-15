import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModulFormule, UCITAJ_FORMULE, ucitajFormule } from './formula-ucitavanje';
import {
  FONTOVI_TEKSTA_FORMULE, MAX_FORMULA_U_TEKSTU, MIN_K_FORMULE, MIN_K_FORMULE_TELEFON, TekstFormuleComponent, koeficijentFormule, UCITAJ_STIL_TEKSTA_FORMULE, resetujStilTekstaFormule,
  ucitajStilFormulaUTekstu,
} from './tekst-formule.component';

@Component({
  imports: [TekstFormuleComponent],
  template: `<app-tekst-formule [tekst]="tekst()" [markdown]="markdown()" />`,
})
class Domacin {
  readonly tekst = signal<string | null>('Koliko je 5?');
  readonly markdown = signal(false);
}

/** Markup lažnog modula: `<span class="ML__latex">` sa LaTeX-om (kao `template`, bez Angular-ovog sanitizera). */
function fragment(latex: string): DocumentFragment {
  const t = document.createElement('template');
  t.innerHTML = '<span class="ML__latex"></span>';
  t.content.firstElementChild!.textContent = latex;
  return t.content;
}

/**
 * Lažni `formula-markup`: nepoznata komanda `\nepostoji{...}` je neispravna (null), sve ostalo daje markup. Pravi MathLive
 * je takođe odbija, a nepotpun `\frac{1}{` crta (prazno mesto), pa on nije primer neispravne formule.
 */
function lazniModul(pozivi: string[]): ModulFormule {
  return {
    latexUMarkup: (l: string) => {
      pozivi.push(l);
      return l.includes('\\nepostoji{') ? null : fragment(l);
    },
  } as unknown as ModulFormule;
}

async function stabilno(f: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((r) => setTimeout(r));
  f.detectChanges();
  await f.whenStable();
}

describe('TekstFormuleComponent', () => {
  let pozivi: string[];
  let ucitaj: ReturnType<typeof vi.fn>;

  function napravi(tekst: string | null, markdown = false, ucitavac: unknown = ucitaj) {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: UCITAJ_FORMULE, useValue: ucitavac },
        { provide: UCITAJ_STIL_TEKSTA_FORMULE, useValue: () => Promise.resolve() },
      ],
    });
    const fixture = TestBed.createComponent(Domacin);
    fixture.componentInstance.tekst.set(tekst);
    fixture.componentInstance.markdown.set(markdown);
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('app-tekst-formule')!;
    return { fixture, el };
  }

  beforeEach(() => {
    pozivi = [];
    ucitaj = vi.fn(() => Promise.resolve(lazniModul(pozivi)));
  });

  it('bez formule: samo tekst, učitavač se ne zove (Review Focus 1)', async () => {
    const { fixture, el } = napravi('Koliko je 5?');
    await stabilno(fixture);
    expect(el.textContent).toBe('Koliko je 5?');
    expect(el.querySelector('.uz-formula')).toBeNull();
    expect(ucitaj).not.toHaveBeenCalled();
  });

  it('iznos sa dolarom (5$ i 10$) ostaje tekst i ne učitava formule', async () => {
    const { fixture, el } = napravi('Cena je 5$ i 10$, a sa popustom 4$.');
    await stabilno(fixture);
    expect(el.textContent).toBe('Cena je 5$ i 10$, a sa popustom 4$.');
    expect(ucitaj).not.toHaveBeenCalled();
  });

  it('formula: pre učitavanja izvor u mestu, posle markup sa role=img i aria-label = LaTeX', async () => {
    const { fixture, el } = napravi('Koliko je $1011_2$?');
    const mesto = el.querySelector<HTMLElement>('span.uz-formula')!;
    expect(mesto.textContent).toBe('$1011_2$');
    expect(mesto.classList).not.toContain('uz-formula--spremna');

    await stabilno(fixture);
    const spremna = el.querySelector<HTMLElement>('.uz-formula--spremna')!;
    expect(spremna.querySelector('.ML__latex')).not.toBeNull();
    expect(spremna.getAttribute('role')).toBe('img');
    expect(spremna.getAttribute('aria-label')).toBe('1011_2');
    expect(pozivi).toEqual(['\\textstyle 1011_2']);
    expect(ucitaj).toHaveBeenCalledTimes(1);
    expect(el.textContent).toBe('Koliko je \\textstyle 1011_2?');
  });

  it('neispravna formula ostaje izvor (uz-formula--izvor), bez izuzetka (Review Focus 2)', async () => {
    const { fixture, el } = napravi('$\\nepostoji{x}$');
    await stabilno(fixture);
    const izvor = el.querySelector<HTMLElement>('.uz-formula--izvor')!;
    expect(izvor.textContent).toBe('$\\nepostoji{x}$');
    expect(izvor.classList).not.toContain('uz-formula--spremna');
    expect(izvor.getAttribute('role')).toBeNull();
  });

  it('učitavač odbijen: izvor ostaje, console.warn tačno jednom, bez izuzetka', async () => {
    const upozorenje = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const odbij = vi.fn(() => Promise.reject(new Error('mreža')));
    const { fixture, el } = napravi('Koliko je $x$?', false, odbij);
    await stabilno(fixture);
    await stabilno(fixture);
    expect(el.querySelector('.uz-formula')!.textContent).toBe('$x$');
    expect(el.querySelector('.uz-formula--spremna')).toBeNull();
    expect(upozorenje).toHaveBeenCalledTimes(1);
    expect(odbij).toHaveBeenCalledTimes(1);
    upozorenje.mockRestore();
  });

  it('markdown: **a** $x$ -> <strong>a</strong> i jedna spremna formula; domaćin je blok', async () => {
    const { fixture, el } = napravi('**a** $x$', true);
    await stabilno(fixture);
    expect(el.querySelector('strong')!.textContent).toBe('a');
    expect(el.querySelectorAll('.uz-formula--spremna').length).toBe(1);
    expect(el.style.display).toBe('block');
  });

  it('običan tekst: domaćin bez inline display', async () => {
    const { fixture, el } = napravi('$x$');
    await stabilno(fixture);
    expect(el.style.display).toBe('');
  });

  it('promena teksta na $y$: novo mesto spremno, staro nestaje', async () => {
    const { fixture, el } = napravi('Prvo $x$');
    await stabilno(fixture);
    expect(el.querySelector('.uz-formula--spremna')!.getAttribute('aria-label')).toBe('x');
    fixture.componentInstance.tekst.set('$y$');
    await stabilno(fixture);
    const mesta = el.querySelectorAll<HTMLElement>('.uz-formula');
    expect(mesta.length).toBe(1);
    expect(mesta[0].classList).toContain('uz-formula--spremna');
    expect(mesta[0].getAttribute('aria-label')).toBe('y');
    expect(el.textContent).not.toContain('Prvo');
    expect(ucitaj).toHaveBeenCalledTimes(1);
  });

  it('promena na tekst bez formule: formule nema, nema novog učitavanja', async () => {
    const { fixture, el } = napravi('$x$');
    await stabilno(fixture);
    fixture.componentInstance.tekst.set('Bez formule');
    await stabilno(fixture);
    expect(el.textContent).toBe('Bez formule');
    expect(el.querySelector('.uz-formula')).toBeNull();
  });

  it(`najviše ${MAX_FORMULA_U_TEKSTU} formula po tekstu crta MathLive; višak ostaje izvor`, async () => {
    const tekst = Array.from({ length: MAX_FORMULA_U_TEKSTU + 2 }, (_, i) => `$a_{${i}}$`).join(' ');
    const { fixture, el } = napravi(tekst, true);
    await stabilno(fixture);
    expect(el.querySelectorAll('.uz-formula--spremna').length).toBe(MAX_FORMULA_U_TEKSTU);
    const izvor = el.querySelectorAll('.uz-formula--izvor');
    expect(izvor.length).toBe(2);
    expect(izvor[1].textContent).toBe(`$a_{${MAX_FORMULA_U_TEKSTU + 1}}$`);
    expect(pozivi.length).toBe(MAX_FORMULA_U_TEKSTU);
    expect(MAX_FORMULA_U_TEKSTU).toBe(50);
  });

  it('HTML iz običnog teksta je tekst: nema elementa img', async () => {
    const { fixture, el } = napravi('<img src=x onerror=alert(1)> $x$');
    await stabilno(fixture);
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('markdown: veza javascript: ne prolazi (Angularov sanitizer na [innerHTML] domaćina)', async () => {
    const upozorenje = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { fixture, el } = napravi('[klik](javascript:alert(1)) $x$', true);
    await stabilno(fixture);
    const a = el.querySelector('a');
    expect(a?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    upozorenje.mockRestore();
  });

  it('pravi UCITAJ_FORMULE (mathlive/ssr): \\href ostaje izvor, nema ni a ni [href] (put faze 4)', async () => {
    const { fixture, el } = napravi('Klikni $\\href{http://e.com}{x}$', false, ucitajFormule);
    await vi.waitFor(async () => {
      await stabilno(fixture);
      expect(el.querySelector('.uz-formula--izvor')).not.toBeNull();
    }, { timeout: 5000 });
    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('[href]')).toBeNull();
    expect(el.querySelector('.uz-formula--izvor')!.textContent).toBe('$\\href{http://e.com}{x}$');
  });

  it('pravi UCITAJ_FORMULE: ispravna formula dobija očišćen markup MathLive-a', async () => {
    const { fixture, el } = napravi('Koliko je $1011_2$?', false, ucitajFormule);
    await vi.waitFor(async () => {
      await stabilno(fixture);
      expect(el.querySelector('.uz-formula--spremna .ML__latex')).not.toBeNull();
    }, { timeout: 5000 });
  });
});

describe('koeficijentFormule', () => {
  it.each([
    [200, 400, 0.5, 1], // staje: prirodna veličina
    [400, 400, 0.5, 1], // tačno staje
    [800, 400, 0.5, 0.5], // pola
    [600, 400, 0.5, 400 / 600],
    [2000, 400, 0.5, 0.5], // ispod najmanjeg: najmanji (seče se na ivici / skrol na telefonu)
    [2000, 400, 0.75, 0.75],
    [0, 400, 0.5, 1], // bez merenja (jsdom, nema markupa)
    [Number.NaN, 400, 0.5, 1],
    [300, 0, 0.5, 1], // okvir bez širine (sakriven): ne dira se
  ])('prirodna %d, raspoloživo %d, min %d -> %d', (prirodna, raspolozivo, min, k) => {
    expect(koeficijentFormule(prirodna, raspolozivo, min)).toBeCloseTo(k, 6);
  });

  it('najmanji koeficijenti: nastavnički prikazi 0,5, telefon 0,75', () => {
    expect([MIN_K_FORMULE, MIN_K_FORMULE_TELEFON]).toEqual([0.5, 0.75]);
  });
});

describe('TekstFormuleComponent: smanjivanje formule da stane', () => {
  @Component({
    imports: [TekstFormuleComponent],
    template: `<div [class.uz-st]="telefon()"><app-tekst-formule [tekst]="tekst()" [markdown]="true" /></div>`,
  })
  class Okvir {
    readonly tekst = signal('Koliko je $x$?');
    readonly telefon = signal(false);
  }

  /** jsdom nema raspored: širina bloka (p) i prirodna širina markupa se zadaju, `font-size` 20 px. */
  function napravi(sirinaBloka: number, sirinaMarkupa: () => number, telefon = false) {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.tagName === 'P' ? sirinaBloka : 0;
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const w = this.classList.contains('ML__latex') ? sirinaMarkupa() : 0;
      return { left: 0, top: 0, right: w, bottom: 0, width: w, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: UCITAJ_FORMULE, useValue: () => Promise.resolve(lazniModul([])) },
        { provide: UCITAJ_STIL_TEKSTA_FORMULE, useValue: () => Promise.resolve() },
      ],
    });
    const fixture = TestBed.createComponent(Okvir);
    fixture.componentInstance.telefon.set(telefon);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.style.fontSize = '20px';
    return { fixture, el };
  }

  const k = (el: HTMLElement) => el.querySelector<HTMLElement>('.uz-formula--spremna')!.style.getPropertyValue('--uz-formula-k');

  afterEach(() => vi.restoreAllMocks());

  it('formula koja staje: bez --uz-formula-k (k = 1)', async () => {
    const { fixture, el } = napravi(400, () => 100);
    await stabilno(fixture);
    expect(el.querySelector('.uz-formula--spremna')).not.toBeNull();
    expect(k(el)).toBe('');
  });

  it('široka formula: k = (raspoloživo - rezerva 0,3em) / prirodna', async () => {
    const { fixture, el } = napravi(400, () => 600);
    await stabilno(fixture);
    expect(Number(k(el))).toBeCloseTo((400 - 0.3 * 20) / 600, 3);
  });

  it('nastavnički prikaz: najmanje 0,5; telefon (.uz-st): najmanje 0,75', async () => {
    const nastavnik = napravi(400, () => 4000);
    await stabilno(nastavnik.fixture);
    expect(k(nastavnik.el)).toBe('0.500');
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    const telefon = napravi(400, () => 4000, true);
    await stabilno(telefon.fixture);
    expect(k(telefon.el)).toBe('0.750');
  });
});

describe('ucitajStilFormulaUTekstu', () => {
  let load: ReturnType<typeof vi.fn>;
  const linkovi = () => [...document.head.querySelectorAll<HTMLLinkElement>('link[data-gfs="mathlive-tekst"]')];

  beforeEach(() => {
    resetujStilTekstaFormule();
    load = vi.fn(() => Promise.resolve([]));
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
    vi.useFakeTimers();
  });

  afterEach(() => {
    delete (document as Partial<Document> & { fonts?: unknown }).fonts;
    vi.useRealTimers();
    resetujStilTekstaFormule();
  });

  it('dva poziva -> jedan <link data-gfs="mathlive-tekst"> sa stilom faze 4', () => {
    const a = ucitajStilFormulaUTekstu();
    const b = ucitajStilFormulaUTekstu();
    expect(a).toBe(b);
    expect(linkovi().length).toBe(1);
    expect(linkovi()[0].getAttribute('href')).toBe('assets/mathlive/mathlive-static.css');
    expect(linkovi()[0].rel).toBe('stylesheet');
  });

  it('postoji <link data-gfs="mathlive"> faze 4 (projektor): nema drugog linka, čeka se njegov load', async () => {
    const faza4 = document.createElement('link');
    faza4.rel = 'stylesheet';
    faza4.href = 'assets/mathlive/mathlive-static.css';
    faza4.dataset['gfs'] = 'mathlive';
    document.head.appendChild(faza4);
    let gotovo = false;
    const p = ucitajStilFormulaUTekstu().then(() => { gotovo = true; });
    expect(linkovi().length).toBe(0);
    expect(document.head.querySelectorAll('link[href="assets/mathlive/mathlive-static.css"]').length).toBe(1);
    await Promise.resolve();
    expect(gotovo).toBe(false);
    faza4.dispatchEvent(new Event('load'));
    await p;
    expect(load.mock.calls.map((c) => c[0])).toEqual([...FONTOVI_TEKSTA_FORMULE]);
  });

  it('link faze 4 je već učitan (sheet postoji): fontovi odmah, bez čekanja događaja', async () => {
    const faza4 = document.createElement('link');
    faza4.rel = 'stylesheet';
    faza4.href = 'assets/mathlive/mathlive-static.css';
    faza4.dataset['gfs'] = 'mathlive';
    Object.defineProperty(faza4, 'sheet', { configurable: true, value: {} });
    document.head.appendChild(faza4);
    await ucitajStilFormulaUTekstu();
    expect(linkovi().length).toBe(0);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('link faze 4 koji ne odgovori: najviše 3000 ms, pa fontovi', async () => {
    const faza4 = document.createElement('link');
    faza4.dataset['gfs'] = 'mathlive';
    document.head.appendChild(faza4);
    void ucitajStilFormulaUTekstu();
    await vi.advanceTimersByTimeAsync(2999);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('posle load linka: fonts.load tačno sa dva fonta teksta (ne svih 7 porodica faze 4)', async () => {
    const p = ucitajStilFormulaUTekstu();
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    linkovi()[0].dispatchEvent(new Event('load'));
    await p;
    expect(load.mock.calls.map((c) => c[0])).toEqual([...FONTOVI_TEKSTA_FORMULE]);
    expect(FONTOVI_TEKSTA_FORMULE).toEqual(['400 1em KaTeX_Main', 'italic 400 1em KaTeX_Math']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('onerror linka -> obećanje se razrešava (ne odbija)', async () => {
    const p = ucitajStilFormulaUTekstu();
    linkovi()[0].dispatchEvent(new Event('error'));
    await expect(p).resolves.toBeUndefined();
  });

  it('link bez odgovora: najviše 3000 ms; fonts.load koji visi: razrešenje posle još 3000 ms', async () => {
    load.mockImplementation(() => new Promise(() => undefined));
    let gotovo = false;
    void ucitajStilFormulaUTekstu().then(() => { gotovo = true; });
    await vi.advanceTimersByTimeAsync(2999);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2999);
    expect(gotovo).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(gotovo).toBe(true);
  });

  it('fonts.load odbija -> obećanje se ipak razrešava', async () => {
    load.mockImplementation(() => Promise.reject(new Error('font')));
    const p = ucitajStilFormulaUTekstu();
    linkovi()[0].dispatchEvent(new Event('load'));
    await expect(p).resolves.toBeUndefined();
  });

  it('pregledač bez document.fonts: razrešava se odmah posle stila', async () => {
    delete (document as Partial<Document> & { fonts?: unknown }).fonts;
    const p = ucitajStilFormulaUTekstu();
    linkovi()[0].dispatchEvent(new Event('load'));
    await expect(p).resolves.toBeUndefined();
  });
});
