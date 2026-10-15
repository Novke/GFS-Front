import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { MERA_FORMULE } from './tekst-formule.component';
import { TestBed } from '@angular/core/testing';
import { ModulFormule, UCITAJ_FORMULE, ucitajFormule } from './formula-ucitavanje';
import {
  FONTOVI_TEKSTA_FORMULE, MAX_FORMULA_U_TEKSTU, TekstFormuleComponent, UCITAJ_STIL_TEKSTA_FORMULE, resetujStilTekstaFormule,
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

  it('stil formula odbijen (CSS nije stigao): izvor ostaje i kad modul stigne; nov tekst pokušava ponovo', async () => {
    const upozorenje = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const stil = vi.fn().mockRejectedValueOnce(new Error('css')).mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: UCITAJ_FORMULE, useValue: ucitaj },
        { provide: UCITAJ_STIL_TEKSTA_FORMULE, useValue: stil },
      ],
    });
    const fixture = TestBed.createComponent(Domacin);
    fixture.componentInstance.tekst.set('Koliko je $x$?');
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('app-tekst-formule')!;
    await stabilno(fixture);
    await stabilno(fixture);
    expect(el.querySelector('.uz-formula--spremna')).toBeNull();
    expect(el.querySelector('.uz-formula')!.textContent).toBe('$x$');
    expect(pozivi).toEqual([]); // markup bez CSS-a se ne crta
    expect(stil).toHaveBeenCalledTimes(1);
    fixture.componentInstance.tekst.set('Koliko je $y$?');
    await stabilno(fixture);
    await stabilno(fixture);
    expect(stil).toHaveBeenCalledTimes(2);
    expect(el.querySelector('.uz-formula--spremna')!.getAttribute('aria-label')).toBe('y');
    upozorenje.mockRestore();
  });

  it('modul ne stigne za dve instance i dva teksta: tačno jedan console.warn po prozoru', async () => {
    const upozorenje = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const odbij = vi.fn(() => Promise.reject(new Error('mreža')));
    const a = napravi('Koliko je $x$?', false, odbij);
    await stabilno(a.fixture);
    const b = TestBed.createComponent(Domacin);
    b.componentInstance.tekst.set('$z$');
    b.detectChanges();
    await stabilno(b);
    a.fixture.componentInstance.tekst.set('Sada $y$');
    await stabilno(a.fixture);
    await stabilno(a.fixture);
    expect(odbij).toHaveBeenCalledTimes(3);
    expect(upozorenje).toHaveBeenCalledTimes(1);
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

  it.each([
    '\\htmlStyle{background:url(http://primer.invalid/x.png)}{x}',
    '\\htmlStyle{background:image-set("http://primer.invalid/a.png" 1x)}{x}',
    '\\style{background:url(http://primer.invalid/x.png)}{x}',
    '\\ce{^^5chtmlStyle{background:url(http://primer.invalid/x.png)}{X}}',
  ])('pravi UCITAJ_FORMULE, put teksta: %s ostaje izvor, bez url( i bez primer.invalid u markupu (Review Focus 2)', async (latex) => {
    const { fixture, el } = napravi(`Vidi $${latex}$ i $x$`, false, ucitajFormule);
    await vi.waitFor(async () => {
      await stabilno(fixture);
      expect(el.querySelector('.uz-formula--spremna')).not.toBeNull();
    }, { timeout: 5000 });
    expect(el.querySelector('.uz-formula--izvor')!.textContent).toBe(`$${latex}$`);
    const markup = [...el.querySelectorAll('.uz-formula--spremna')].map((f) => f.innerHTML).join('');
    expect(markup).not.toContain('url(');
    expect(markup).not.toContain('primer.invalid');
    expect(el.querySelector('[style*="url("]')).toBeNull();
  });

  it('pravi UCITAJ_FORMULE: \\colorbox sa url( umesto boje: ni izvor ni markup ne nose url( u atributu (sanitizer stila)', async () => {
    const { fixture, el } = napravi('Vidi $\\colorbox{url(http://primer.invalid/x.png)}{x}$', false, ucitajFormule);
    await vi.waitFor(async () => {
      await stabilno(fixture);
      expect(el.querySelector('.uz-formula--spremna, .uz-formula--izvor')).not.toBeNull();
    }, { timeout: 5000 });
    // izvor (tekst) ili markup bez url( u stilu: nijedan atribut osim `aria-label` (LaTeX kao tekst) ne nosi url(
    const f = el.querySelector<HTMLElement>('.uz-formula')!;
    if (f.classList.contains('uz-formula--spremna')) {
      expect(f.innerHTML).not.toContain('url(');
      expect(f.getAttribute('aria-label')).toBe('\\colorbox{url(http://primer.invalid/x.png)}{x}');
    } else {
      expect(f.textContent).toBe('$\\colorbox{url(http://primer.invalid/x.png)}{x}$');
    }
    expect([...el.querySelectorAll('*')].flatMap((e) => [...e.attributes])
      .filter((a) => a.name !== 'aria-label' && a.value.includes('url(')).map((a) => `${a.name}=${a.value}`)).toEqual([]);
  });

  it('pravi UCITAJ_FORMULE: ispravna formula dobija očišćen markup MathLive-a', async () => {
    const { fixture, el } = napravi('Koliko je $1011_2$?', false, ucitajFormule);
    await vi.waitFor(async () => {
      await stabilno(fixture);
      expect(el.querySelector('.uz-formula--spremna .ML__latex')).not.toBeNull();
    }, { timeout: 5000 });
  });
});

@Component({
  imports: [TekstFormuleComponent],
  template: `<p class="tekst"><app-tekst-formule [tekst]="tekst()" /></p>
    <button type="button" aria-label="A: x"><app-tekst-formule aria-hidden="true" [tekst]="tekst()" /></button>`,
})
class DomacinTelefona {
  readonly tekst = signal('Izračunaj $x$ i $y$');
}

/** Lažni `ResizeObserver` (jsdom ga nema): pamti posmatrane elemente, `javi()` zove povratni poziv kao pregledač. */
class LazniPosmatrac {
  static svi: LazniPosmatrac[] = [];
  readonly posmatrani = new Set<Element>();
  odvezan = 0;
  constructor(private readonly povratni: ResizeObserverCallback) {
    LazniPosmatrac.svi.push(this);
  }
  observe(el: Element) {
    this.posmatrani.add(el);
  }
  unobserve(el: Element) {
    this.posmatrani.delete(el);
  }
  disconnect() {
    this.odvezan++;
    this.posmatrani.clear();
  }
  javi() {
    this.povratni([...this.posmatrani].map((target) => ({ target }) as ResizeObserverEntry), this as unknown as ResizeObserver);
  }
}

/** `scrollWidth`/`clientWidth` formule (jsdom nema raspored). */
function sirine(el: Element, scroll: number, client: number) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scroll });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: client });
}

describe('TekstFormuleComponent na telefonu: tab stop samo za široku formulu (axe scrollable-region-focusable)', () => {
  beforeEach(() => {
    LazniPosmatrac.svi = [];
    vi.stubGlobal('ResizeObserver', LazniPosmatrac);
  });
  afterEach(() => vi.unstubAllGlobals());

  function napravi(mera: unknown = null) {
    const pozivi: string[] = [];
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: UCITAJ_FORMULE, useValue: () => Promise.resolve(lazniModul(pozivi)) },
        { provide: UCITAJ_STIL_TEKSTA_FORMULE, useValue: () => Promise.resolve() },
        ...(mera ? [{ provide: MERA_FORMULE, useValue: mera }] : []),
      ],
    });
    const fixture = TestBed.createComponent(DomacinTelefona);
    fixture.detectChanges();
    return fixture;
  }

  it('prelazi -> tabindex="0"; ne prelazi -> bez tab stopa; promena širine (okretanje) skida ga', async () => {
    const fixture = napravi();
    await stabilno(fixture);
    const [x, y] = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('p.tekst .uz-formula--spremna');
    sirine(x, 400, 300);
    sirine(y, 100, 100);
    const posmatrac = LazniPosmatrac.svi.find((p) => p.posmatrani.has(x))!;
    expect(posmatrac.posmatrani.has(y)).toBe(true);
    posmatrac.javi();
    expect(x.getAttribute('tabindex')).toBe('0');
    expect(y.hasAttribute('tabindex')).toBe(false);
    sirine(x, 300, 300);
    posmatrac.javi();
    expect(x.hasAttribute('tabindex')).toBe(false);
    // ime ostaje ime slike (bez duplog čitanja sadržaja)
    expect(x.getAttribute('role')).toBe('img');
    expect(x.getAttribute('aria-label')).toBe('x');
  });

  it('formula u dugmetu opcije (aria-hidden) se ne posmatra i nikad ne dobija tab stop (nested-interactive)', async () => {
    const fixture = napravi();
    await stabilno(fixture);
    const uDugmetu = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('button .uz-formula--spremna');
    expect(uDugmetu.length).toBe(2);
    uDugmetu.forEach((f) => sirine(f, 400, 300));
    for (const p of LazniPosmatrac.svi) {
      uDugmetu.forEach((f) => expect(p.posmatrani.has(f)).toBe(false));
      p.javi();
    }
    uDugmetu.forEach((f) => expect(f.hasAttribute('tabindex')).toBe(false));
  });

  it('novi tekst: staro posmatranje se prekida, posmatraju se nove formule; uništavanje odvezuje posmatrača', async () => {
    const fixture = napravi();
    await stabilno(fixture);
    const posmatrac = LazniPosmatrac.svi[0];
    const pre = posmatrac.odvezan;
    fixture.componentInstance.tekst.set('Sada $z$');
    await stabilno(fixture);
    expect(posmatrac.odvezan).toBeGreaterThan(pre);
    const z = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('p.tekst .uz-formula--spremna')!;
    expect(z.getAttribute('aria-label')).toBe('z');
    expect(posmatrac.posmatrani.has(z)).toBe(true);
    const odvezan = LazniPosmatrac.svi.map((p) => p.odvezan);
    fixture.destroy();
    LazniPosmatrac.svi.forEach((p, i) => expect(p.odvezan).toBeGreaterThan(odvezan[i]));
  });

  it('nastavnički prikaz (MERA_FORMULE dat): nema posmatrača skrola ni tab stopa (tamo formula nije skrol region)', async () => {
    const mera = vi.fn();
    const fixture = napravi(mera);
    await stabilno(fixture);
    expect(mera).toHaveBeenCalled();
    expect(LazniPosmatrac.svi).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).querySelector('[tabindex]')).toBeNull();
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

  it('onerror linka -> odbija, link se uklanja i greška se ne pamti: sledeći poziv pravi nov link (bez petlje)', async () => {
    const p = ucitajStilFormulaUTekstu();
    linkovi()[0].dispatchEvent(new Event('error'));
    await expect(p).rejects.toThrow('Stil formula nije učitan');
    expect(linkovi()).toEqual([]);
    expect(load).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    const drugi = ucitajStilFormulaUTekstu();
    expect(drugi).not.toBe(p);
    expect(linkovi().length).toBe(1);
    linkovi()[0].dispatchEvent(new Event('load'));
    await expect(drugi).resolves.toBeUndefined();
  });

  it('greška linka faze 4 -> odbija; sledeći poziv ga ne čeka, nego pravi sopstveni link', async () => {
    const faza4 = document.createElement('link');
    faza4.dataset['gfs'] = 'mathlive';
    document.head.appendChild(faza4);
    const p = ucitajStilFormulaUTekstu();
    faza4.dispatchEvent(new Event('error'));
    await expect(p).rejects.toThrow();
    expect(faza4.isConnected).toBe(true); // link faze 4 pripada fazi 4
    void ucitajStilFormulaUTekstu();
    expect(linkovi().length).toBe(1);
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
