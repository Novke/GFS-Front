import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModulFormule, UCITAJ_FORMULE } from './formula-ucitavanje';
import { MAX_KOREKCIJA, MIN_K_FORMULE, koeficijentFormule, korakNadole, meriFormule } from './mera-formule';
import { MERA_FORMULE, TekstFormuleComponent, UCITAJ_STIL_TEKSTA_FORMULE } from './tekst-formule.component';

describe('koeficijentFormule', () => {
  it.each([
    [200, 400, 0.5, 1], // staje: prirodna veličina
    [400, 400, 0.5, 1], // tačno staje
    [800, 400, 0.5, 0.5], // pola
    [600, 400, 0.5, 400 / 600],
    [2000, 400, 0.5, 0.5], // ispod najmanjeg: najmanji (seče se na ivici okvira)
    [0, 400, 0.5, 1], // bez merenja (jsdom, nema markupa)
    [Number.NaN, 400, 0.5, 1],
    [300, 0, 0.5, 1], // okvir bez širine (sakriven): ne dira se
  ])('prirodna %d, raspoloživo %d, min %d -> %d', (prirodna, raspolozivo, min, k) => {
    expect(koeficijentFormule(prirodna, raspolozivo, min)).toBeCloseTo(k, 6);
  });

  it('najmanji koeficijent nastavničkih prikaza je 0,5', () => {
    expect(MIN_K_FORMULE).toBe(0.5);
  });
});

describe('korakNadole', () => {
  it('srazmerno raspoloživom, bar 0,005 manje, nikad ispod najmanjeg', () => {
    expect(korakNadole(0.9, 334, 304, 0.5)).toBeCloseTo((0.9 * 304) / 334, 6);
    expect(korakNadole(0.9, 304.1, 304, 0.5)).toBeCloseTo(0.895, 6); // gotovo staje: ipak korak od 0,005
    expect(korakNadole(0.52, 2000, 304, 0.5)).toBe(0.5);
    expect(MAX_KOREKCIJA).toBe(2);
  });
});

/** Markup lažnog modula: `<span class="ML__latex">` (širinu mu zadaje lažni raspored ispod). */
function lazniModul(): ModulFormule {
  return {
    latexUMarkup: (l: string) => {
      const t = document.createElement('template');
      t.innerHTML = '<span class="ML__latex"></span>';
      t.content.firstElementChild!.textContent = l;
      return t.content;
    },
  } as unknown as ModulFormule;
}

async function stabilno(f: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((r) => setTimeout(r));
  f.detectChanges();
  await f.whenStable();
}

@Component({
  imports: [TekstFormuleComponent],
  providers: [{ provide: MERA_FORMULE, useValue: meriFormule }],
  template: `<div class="okvir"><app-tekst-formule [tekst]="tekst()" [markdown]="markdown()" /></div>`,
})
class NastavnickiOkvir {
  readonly tekst = signal('Koliko je $x$?');
  readonly markdown = signal(true);
}

@Component({
  imports: [TekstFormuleComponent],
  template: `<div class="okvir"><app-tekst-formule [tekst]="'Koliko je $x$?'" [markdown]="true" /></div>`,
})
class BezMere {}

describe('meriFormule (MERA_FORMULE, nastavnički prikazi)', () => {
  /** Lažni `ResizeObserver`: test sam javlja promenu veličine (kao pregledač posle svakog upisa k). */
  const posmatraci: { cb: () => void }[] = [];
  const javiPromenu = () => posmatraci.forEach((p) => p.cb());

  /**
   * jsdom nema raspored. `sirinaBloka(k)` je širina sadržaja bloka formule (`p` u Markdown-u, `div.okvir` za običan tekst),
   * a markup je `prirodna * k` širok, od leve ivice bloka; `font-size` teksta je 20 px (rezerva 0,3em = 6 px).
   */
  function napravi<T>(komponenta: new () => T, blok: string, prirodna: number | ((k: number) => number),
    sirinaBloka: (k: number) => number) {
    const markup = typeof prirodna === 'number' ? (k: number) => prirodna * k : prirodna;
    const k = () => Number(document.querySelector<HTMLElement>('.uz-formula--spremna')?.style.getPropertyValue('--uz-formula-k')) || 1;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.matches(blok) ? sirinaBloka(k()) : 0;
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const w = this.classList.contains('ML__latex') ? markup(k()) : 0;
      return { left: 0, top: 0, right: w, bottom: 0, width: w, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    vi.stubGlobal('ResizeObserver', class {
      constructor(readonly cb: () => void) { posmatraci.push(this); }
      observe(): void { /* lažni */ }
      disconnect(): void { /* lažni */ }
    });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: UCITAJ_FORMULE, useValue: () => Promise.resolve(lazniModul()) },
        { provide: UCITAJ_STIL_TEKSTA_FORMULE, useValue: () => Promise.resolve() },
      ],
    });
    const fixture = TestBed.createComponent(komponenta);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).style.fontSize = '20px';
    const el = fixture.nativeElement as HTMLElement;
    const upisano = () => el.querySelector<HTMLElement>('.uz-formula--spremna')!.style.getPropertyValue('--uz-formula-k');
    /** Broj upisa stila formule (kao e2e: `MutationObserver` nad `style`). */
    let upisa = 0;
    new MutationObserver((l) => { upisa += l.filter((z) => (z.target as Element).classList.contains('uz-formula--spremna')).length; })
      .observe(el, { subtree: true, attributes: true, attributeFilter: ['style'] });
    return { fixture, el, upisano, upisa: () => upisa };
  }

  beforeEach(() => { posmatraci.length = 0; });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('formula koja staje: bez --uz-formula-k (k = 1)', async () => {
    const { fixture, el, upisano } = napravi(NastavnickiOkvir, 'p', 100, () => 400);
    await stabilno(fixture);
    expect(el.querySelector('.uz-formula--spremna')).not.toBeNull();
    expect(upisano()).toBe('');
  });

  it('široka formula u okviru stalne širine: k = (raspoloživo - 0,3em) / prirodna; nova merenja ga ne spuštaju dalje', async () => {
    const { fixture, upisano } = napravi(NastavnickiOkvir, 'p', 600, () => 400);
    await stabilno(fixture);
    const prvi = Number(upisano());
    expect(prvi).toBeCloseTo((400 - 0.3 * 20) / 600, 3);
    for (let i = 0; i < 5; i++) {
      javiPromenu();
      await stabilno(fixture);
    }
    expect(Number(upisano())).toBeCloseTo(prvi, 3);
  });

  it('okvir poraste: k se vraća na 1 (svojstvo se briše)', async () => {
    let sirina = 400;
    const { fixture, upisano } = napravi(NastavnickiOkvir, 'p', 600, () => sirina);
    await stabilno(fixture);
    expect(Number(upisano())).toBeLessThan(1);
    sirina = 1000;
    javiPromenu();
    await stabilno(fixture);
    expect(upisano()).toBe('');
  });

  it('najmanje 0,5: šira formula ostaje na 0,5 (seče se na ivici)', async () => {
    const { fixture, upisano } = napravi(NastavnickiOkvir, 'p', 4000, () => 400);
    await stabilno(fixture);
    expect(upisano()).toBe('0.500');
  });

  it('spirala (re-recenzija 2, I1): okvir širok koliko formula ne smanjuje kratku formulu ni posle mnogo merenja', async () => {
    // običan tekst: blok je `div.okvir`, čija širina prati formulu (flex stavka koja se skuplja na sadržaj)
    const { fixture, upisano } = napravi(NastavnickiOkvir, 'div.okvir', 100, (k) => 100 * k);
    fixture.componentInstance.markdown.set(false);
    await stabilno(fixture);
    for (let i = 0; i < 10; i++) {
      javiPromenu();
      await stabilno(fixture);
    }
    expect(upisano()).toBe('');
  });

  /** `n` puta `ResizeObserver` (isti ulaz, kao posle sopstvenog upisa u pregledaču), pa stabilno. */
  async function merenja(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }, n: number) {
    for (let i = 0; i < n; i++) {
      javiPromenu();
      await stabilno(fixture);
    }
  }

  it('nelinearna širina markupa (re-recenzija 3, Critical 1): najviše jedna korekcija, pa 20 merenja bez upisa', async () => {
    // kao MathLive: oko k = 0,9 širina skače (0,904 -> 321 px, 0,917 -> 336 px); okvir 310 px, rezerva 6 px
    const w = (k: number) => 330 * k + (k > 0.85 && k < 0.95 ? 30 : 0);
    const { fixture, upisano, upisa } = napravi(NastavnickiOkvir, 'p', w, () => 310);
    await stabilno(fixture);
    expect(Number(upisano())).toBeCloseTo(304 / 330, 3); // iz mere pri k = 1
    await merenja(fixture, 1); // ista širina okvira: formula prelazi -> jedan korak nadole
    const posle = Number(upisano());
    expect(posle).toBeLessThan(304 / 330);
    expect(w(posle)).toBeLessThanOrEqual(310); // konačno stanje ne prelazi ivicu
    const pre = upisa();
    await merenja(fixture, 20);
    expect(upisa() - pre, 'upisi stila u 20 merenja sa istim ulazom').toBe(0);
    expect(Number(upisano())).toBe(posle);
  });

  it('formula koja i posle dve korekcije prelazi: kraj, bez daljih upisa (gasi se po konstrukciji)', async () => {
    const w = (k: number) => 330 * k + (k < 1 ? 100 : 0);
    const { fixture, upisa } = napravi(NastavnickiOkvir, 'p', w, () => 310);
    await stabilno(fixture);
    await merenja(fixture, MAX_KOREKCIJA);
    const pre = upisa();
    await merenja(fixture, 20);
    expect(upisa() - pre).toBe(0);
  });

  it('nov ulaz posle korekcija (okvir se promeni): računa se iznova od k = 1, pa opet najviše dve korekcije', async () => {
    let sirina = 310;
    const w = (k: number) => 330 * k + (k > 0.85 && k < 0.95 ? 30 : 0);
    const { fixture, upisano, upisa } = napravi(NastavnickiOkvir, 'p', w, () => sirina);
    await stabilno(fixture);
    await merenja(fixture, 3);
    sirina = 1000;
    await merenja(fixture, 1);
    expect(upisano()).toBe('');
    const pre = upisa();
    await merenja(fixture, 20);
    expect(upisa() - pre).toBe(0);
  });

  it('sakriven okvir (širina 0): ništa se ne upisuje ni ne pamti', async () => {
    let sirina = 0;
    const { fixture, upisano, upisa } = napravi(NastavnickiOkvir, 'p', 600, () => sirina);
    await stabilno(fixture);
    await merenja(fixture, 3);
    expect(upisano()).toBe('');
    expect(upisa()).toBe(0);
    sirina = 400;
    await merenja(fixture, 1);
    expect(Number(upisano())).toBeCloseTo(394 / 600, 3);
  });

  it('bez MERA_FORMULE (telefon, javne rute): nema merenja ni --uz-formula-k', async () => {
    const { fixture, upisano } = napravi(BezMere, 'p', 4000, () => 400);
    await stabilno(fixture);
    expect(upisano()).toBe('');
    expect(posmatraci).toEqual([]);
  });
});
