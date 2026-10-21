import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormulaPrikazComponent } from './formula-prikaz.component';
import { ModulFormule, UCITAJ_FORMULE, UCITAJ_STIL_FORMULA } from './formula-ucitavanje';
import { Stil } from './platno-tekst';

@Component({
  imports: [FormulaPrikazComponent],
  template: `<app-formula-prikaz [latex]="latex()" [stil]="stil()" />`,
})
class Domacin {
  readonly latex = signal('x^2');
  readonly stil = signal<Stil>({
    color: '#d7170b', 'font-size': 'calc(var(--uz-pl-j) * 40)', 'text-align': 'center', 'font-family': '"Cousine"',
  });
}

/** Obećanje koje test razrešava ručno. */
function odlozeno<T>() {
  let razresi!: (v: T) => void;
  let odbij!: (e: unknown) => void;
  const obecanje = new Promise<T>((a, b) => { razresi = a; odbij = b; });
  return { obecanje, razresi, odbij };
}

/** Lažni modul: markup je `<span class="lazni">` sa LaTeX-om (null za LaTeX iz `neispravni`). */
function lazniModul(neispravni: string[] = [], pozivi: string[] = []): ModulFormule {
  return {
    latexUMarkup: (latex: string) => {
      pozivi.push(latex);
      if (neispravni.includes(latex)) return null;
      const t = document.createElement('template');
      t.innerHTML = `<span class="lazni">${latex}</span>`;
      return t.content;
    },
  } as unknown as ModulFormule;
}

describe('FormulaPrikazComponent', () => {
  let modul: ReturnType<typeof odlozeno<ModulFormule>>;
  let stil: ReturnType<typeof odlozeno<void>>;
  let ucitajModul: ReturnType<typeof vi.fn>;

  function napravi() {
    TestBed.configureTestingModule({
      providers: [
        { provide: UCITAJ_FORMULE, useValue: ucitajModul },
        { provide: UCITAJ_STIL_FORMULA, useValue: () => stil.obecanje },
      ],
    });
    const fixture = TestBed.createComponent(Domacin);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function stabilno(f: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await new Promise(r => setTimeout(r));
    f.detectChanges();
    await f.whenStable();
  }

  beforeEach(() => {
    modul = odlozeno<ModulFormule>();
    stil = odlozeno<void>();
    ucitajModul = vi.fn(() => modul.obecanje);
  });

  it('pre učitavanja izvor; samo modul spreman -> i dalje izvor; oba -> markup sa role=img i aria-label', async () => {
    const { fixture, el } = napravi();
    await stabilno(fixture);
    const izvor = el.querySelector<HTMLElement>('.uz-pl-formula-izvor')!;
    expect(izvor.textContent).toBe('x^2');
    expect(izvor.style.fontFamily).toContain('Cousine');
    expect(el.querySelector('.uz-pl-formula-markup')).toBeNull();

    modul.razresi(lazniModul());
    await stabilno(fixture);
    expect(el.querySelector('.uz-pl-formula-izvor')).not.toBeNull();
    expect(el.querySelector('.uz-pl-formula-markup')).toBeNull();

    stil.razresi();
    await stabilno(fixture);
    const markup = el.querySelector<HTMLElement>('.uz-pl-formula-markup')!;
    expect(markup).not.toBeNull();
    expect(markup.getAttribute('role')).toBe('img');
    expect(markup.getAttribute('aria-label')).toBe('Formula: x^2');
    expect(markup.querySelector('.lazni')?.textContent).toBe('x^2');
    expect(el.querySelector('.uz-pl-formula-izvor')).toBeNull();
    // boja, veličina i poravnanje formule; font bira MathLive (KaTeX), ne Cousine izvora
    expect(markup.style.color).toBe('rgb(215, 23, 11)');
    expect(markup.style.fontSize).toBe('calc(var(--uz-pl-j) * 40)');
    expect(markup.style.textAlign).toBe('center');
    expect(markup.style.fontFamily).toBe('');
  });

  it('modul vraća null (neispravan ili zabranjen LaTeX) -> ostaje izvor', async () => {
    const { fixture, el } = napravi();
    modul.razresi(lazniModul(['x^2']));
    stil.razresi();
    await stabilno(fixture);
    expect(el.querySelector('.uz-pl-formula-izvor')?.textContent).toBe('x^2');
    expect(el.querySelector('.uz-pl-formula-markup')).toBeNull();
  });

  it('odbijeno učitavanje -> ostaje izvor, console.warn jednom (i posle nove formule)', async () => {
    const upozorenje = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    ucitajModul = vi.fn(() => Promise.reject(new Error('mreža')));
    const { fixture, el } = napravi();
    stil.razresi();
    await stabilno(fixture);
    expect(el.querySelector('.uz-pl-formula-izvor')?.textContent).toBe('x^2');
    expect(el.querySelector('.uz-pl-formula-markup')).toBeNull();
    fixture.componentInstance.latex.set('y^3');
    await stabilno(fixture);
    expect(el.querySelector('.uz-pl-formula-izvor')?.textContent).toBe('y^3');
    expect(ucitajModul).toHaveBeenCalledTimes(2);
    expect(upozorenje).toHaveBeenCalledTimes(1);
    upozorenje.mockRestore();
  });

  it('promena latex -> nov markup; zakasneli rezultat starog ulaza se odbacuje', async () => {
    const stari = odlozeno<ModulFormule>();
    const novi = odlozeno<ModulFormule>();
    ucitajModul = vi.fn().mockReturnValueOnce(stari.obecanje).mockReturnValueOnce(novi.obecanje);
    const { fixture, el } = napravi();
    stil.razresi();
    await stabilno(fixture);
    fixture.componentInstance.latex.set('\\frac{a}{b}');
    await stabilno(fixture);
    novi.razresi(lazniModul());
    await stabilno(fixture);
    expect(el.querySelector('.lazni')?.textContent).toBe('\\frac{a}{b}');
    stari.razresi(lazniModul());
    await stabilno(fixture);
    expect(el.querySelectorAll('.lazni').length).toBe(1);
    expect(el.querySelector('.lazni')?.textContent).toBe('\\frac{a}{b}');
    expect(el.querySelector('.uz-pl-formula-markup')?.getAttribute('aria-label')).toBe('Formula: \\frac{a}{b}');
  });

  it('ponovno crtanje (isti latex) ne prazni markup', async () => {
    const { fixture, el } = napravi();
    modul.razresi(lazniModul());
    stil.razresi();
    await stabilno(fixture);
    fixture.componentInstance.stil.set({ color: '#000000', 'font-size': '20px', 'text-align': 'left' });
    await stabilno(fixture);
    const markup = el.querySelector<HTMLElement>('.uz-pl-formula-markup')!;
    expect(markup.querySelector('.lazni')?.textContent).toBe('x^2');
    expect(markup.style.fontSize).toBe('20px');
  });
});
