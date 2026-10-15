import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModulFormule, UCITAJ_FORMULE } from './formula-ucitavanje';
import { MIN_K_FORMULE, koeficijentFormule, meriFormule, noviKoeficijent } from './mera-formule';
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

describe('noviKoeficijent', () => {
  it('formula prelazi ivicu: smanjuje se na cilj (nikad ne raste)', () => {
    expect(noviKoeficijent(1, 600, 400, true)).toBeCloseTo(400 / 600, 6);
    expect(noviKoeficijent(0.6, 600, 400, true)).toBe(0.6);
  });

  it('formula ne prelazi: k sme samo da raste (veći okvir), nikad da padne', () => {
    // okvir koji se skuplja na sadržaj: raspoloživo je manje od prirodne širine, a formula ne prelazi
    expect(noviKoeficijent(1, 100, 94, false)).toBe(1);
    expect(noviKoeficijent(0.6, 600, 1000, false)).toBe(1);
    expect(noviKoeficijent(0.6, 600, 450, false)).toBeCloseTo(0.75, 6);
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
  function napravi<T>(komponenta: new () => T, blok: string, prirodna: number, sirinaBloka: (k: number) => number) {
    const k = () => Number(document.querySelector<HTMLElement>('.uz-formula--spremna')?.style.getPropertyValue('--uz-formula-k')) || 1;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.matches(blok) ? sirinaBloka(k()) : 0;
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const w = this.classList.contains('ML__latex') ? prirodna * k() : 0;
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
    return { fixture, el, upisano };
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

  it('bez MERA_FORMULE (telefon, javne rute): nema merenja ni --uz-formula-k', async () => {
    const { fixture, upisano } = napravi(BezMere, 'p', 4000, () => 400);
    await stabilno(fixture);
    expect(upisano()).toBe('');
    expect(posmatraci).toEqual([]);
  });
});
