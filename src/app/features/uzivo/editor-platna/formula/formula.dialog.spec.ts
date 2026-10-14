import { TestBed } from '@angular/core/testing';
import { convertLatexToMarkup } from 'mathlive/ssr';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IKONE } from '../../../../core/layout/icons';
import { type MathLive, UCITAJ_MATHLIVE } from './mathlive-ucitavanje';
import type { FormulaUnos } from './formula-pravila';
import { OZNAKA_FORMULE_EDITORA, type FormulaPodaci, otvoriFormulu } from './formula.dialog';

/**
 * Lažni MathLive: `\nepoznato` je greška u LaTeX-u; `<math-field>` je u testu nepoznat element; markup daje pravi
 * `mathlive/ssr` (isti crtač kao ceo `mathlive`; spec sme da ga uveze, nije deo chunk-a).
 */
const LAZNI: MathLive = {
  validateLatex: (l: string) => (l.includes('\\nepoznato') ? [{}] : []),
  convertLatexToMarkup: (l: string) => convertLatexToMarkup(l, { defaultMode: 'math' }),
  MathfieldElement: class {},
} as unknown as MathLive;

const POCETAK: FormulaUnos = { latex: 'x^2', boja: '#000000', velicina: 28, poravnanje: 'CENTAR' };

const koren = () => document.querySelector<HTMLElement>(`[data-oznaka="${OZNAKA_FORMULE_EDITORA}"]`);
const tekst = () => (koren()?.textContent ?? '').replace(/\s+/g, ' ');
const polje = () => koren()!.querySelector<HTMLTextAreaElement>('textarea')!;
const mf = () => koren()?.querySelector<HTMLElement & { value?: string }>('math-field') ?? null;
const greska = () => koren()!.querySelector<HTMLElement>('[role="alert"]')!;

function dugme(natpis: string): HTMLButtonElement {
  const b = [...(koren()?.querySelectorAll('button') ?? [])].find((x) => x.textContent?.trim() === natpis);
  if (!b) throw new Error(`Nema dugmeta "${natpis}". Tekst dijaloga: ${tekst()}`);
  return b;
}

/** Čeka uslov i usput pokreće detekciju promena (učitavanje je obećanje). */
async function doK(uslov: () => boolean, opis = 'uslov'): Promise<void> {
  const kraj = Date.now() + 5000;
  for (;;) {
    TestBed.tick();
    if (uslov()) return;
    if (Date.now() > kraj) throw new Error(`Nije ispunjeno: ${opis}. Tekst dijaloga: ${tekst()}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

function upisiLatex(vrednost: string): void {
  polje().value = vrednost;
  polje().dispatchEvent(new Event('input', { bubbles: true }));
  TestBed.tick();
}

describe('FormulaDialog', () => {
  let ucitaj: () => Promise<MathLive>;
  let rezultat: { vrednost: FormulaUnos | undefined; zatvoren: boolean };

  beforeEach(() => {
    ucitaj = () => Promise.resolve(LAZNI);
    TestBed.configureTestingModule({
      providers: [
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: UCITAJ_MATHLIVE, useFactory: () => () => ucitaj() },
      ],
    });
    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    for (const ime of IKONE) registry.addSvgIconLiteral(ime, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    TestBed.tick();
    delete (window as { mathVirtualKeyboard?: unknown }).mathVirtualKeyboard;
    vi.restoreAllMocks();
  });

  function otvori(podaci: Partial<FormulaPodaci> = {}): void {
    rezultat = { vrednost: undefined, zatvoren: false };
    otvoriFormulu(TestBed.inject(MatDialog), { pocetak: POCETAK, tema: 'NACRT', izSlike: false, ...podaci }).subscribe((v) => {
      rezultat.vrednost = v;
      rezultat.zatvoren = true;
    });
    TestBed.tick();
  }

  const ucitano = () => doK(() => !!mf(), 'math-field posle učitavanja');

  it('domaćin nosi oznaku lenjog chunk-a; naslov "Formula"; otvara se sa autoFocus: false i restoreFocus', () => {
    const open = vi.spyOn(TestBed.inject(MatDialog), 'open');
    otvori();
    expect(OZNAKA_FORMULE_EDITORA).toBe('gfs-formula-editor');
    expect(koren()).not.toBeNull();
    expect(koren()!.querySelector('h2')!.textContent!.trim()).toBe('Formula');
    expect(open).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ autoFocus: false, restoreFocus: true }));
  });

  it('dok se MathLive učitava: traka napretka, bez math-field; posle učitavanja math-field sa početnom vrednošću u fokusu', async () => {
    let razresi!: (m: MathLive) => void;
    ucitaj = () => new Promise((r) => (razresi = r));
    otvori();
    expect(koren()!.querySelector('mat-progress-bar')).not.toBeNull();
    expect(mf()).toBeNull();
    expect(polje().value).toBe('x^2');
    razresi(LAZNI);
    await ucitano();
    expect(koren()!.querySelector('mat-progress-bar')).toBeNull();
    expect(mf()!.value).toBe('x^2');
    expect(mf()!.getAttribute('math-virtual-keyboard-policy')).toBe('manual');
    expect(mf()!.getAttribute('aria-label')).toBe('Formula (vizuelno)');
    await doK(() => document.activeElement === mf(), 'fokus u math-field');
  });

  it('CDK posle animacije fokusira kontejner (fokus u shadow DOM-u ne vidi): fokus se vraća u math-field dok korisnik ne radi', async () => {
    otvori();
    await ucitano();
    const kontejner = document.querySelector<HTMLElement>('mat-dialog-container')!;
    kontejner.focus();
    expect(document.activeElement).toBe(mf());
    // posle prvog pritiska korisnika fokus ostaje gde ga on (ili CDK) stavi
    polje().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    kontejner.focus();
    expect(document.activeElement).toBe(kontejner);
  });

  it('odbijeno učitavanje: fokus u polju "LaTeX" i poruka u role="status"', async () => {
    ucitaj = () => Promise.reject(new Error('chunk'));
    otvori();
    await doK(() => tekst().includes('Vizuelni unos nije učitan; piši LaTeX.'), 'poruka o učitavanju');
    const status = [...koren()!.querySelectorAll('[role="status"]')].map((s) => s.textContent!.trim());
    expect(status).toContain('Vizuelni unos nije učitan; piši LaTeX.');
    expect(mf()).toBeNull();
    await doK(() => document.activeElement === polje(), 'fokus u polju LaTeX');
    // LaTeX se i dalje čuva (bez provere sintakse, ali sa zabranjenim komandama)
    upisiLatex('\\href{http://e}{x}');
    expect(dugme('Sačuvaj').disabled).toBe(true);
    upisiLatex('a+b');
    expect(dugme('Sačuvaj').disabled).toBe(false);
  });

  it('greška u LaTeX-u: poruka u role="alert" (polje je opisuje) i "Sačuvaj" onemogućeno', async () => {
    otvori();
    await ucitano();
    upisiLatex('\\nepoznato{x}');
    expect(greska().textContent!.trim()).toBe('Formula ima grešku u LaTeX-u.');
    expect(polje().getAttribute('aria-describedby')).toContain(greska().id);
    expect(dugme('Sačuvaj').disabled).toBe(true);
  });

  it('zabranjena komanda: poruka i "Sačuvaj" onemogućeno; vizuelno polje je ne dobija', async () => {
    otvori();
    await ucitano();
    upisiLatex('\\htmlStyle{background:url(http://e)}{x}');
    expect(greska().textContent).toContain('nije dozvoljena');
    expect(dugme('Sačuvaj').disabled).toBe(true);
    expect(mf()!.value).toBe('x^2');
  });

  it('uvezena formula sa zabranjenom komandom se ne upisuje u math-field (bez spoljnog zahteva iz MathLive-a)', async () => {
    otvori({ pocetak: { ...POCETAK, latex: '\\href{http://e.com}{x}' } });
    await ucitano();
    await doK(() => document.activeElement === mf(), 'fokus u math-field');
    expect(mf()!.value ?? '').toBe('');
    expect(polje().value).toBe('\\href{http://e.com}{x}');
    expect(dugme('Sačuvaj').disabled).toBe(true);
  });

  it('formula koju bi sanitizer promenio (\\mathtip: oblačić) ne ide u math-field, ni na početku ni iz polja LaTeX', async () => {
    otvori({ pocetak: { ...POCETAK, latex: '\\mathtip{a}{b}' } });
    await ucitano();
    await doK(() => document.activeElement === mf(), 'fokus u math-field');
    expect(mf()!.value ?? '').toBe('');
    expect(polje().value).toBe('\\mathtip{a}{b}');
    upisiLatex('\\frac{a}{b}');
    expect(mf()!.value).toBe('\\frac{a}{b}');
    upisiLatex('\\texttip{a}{b}');
    expect(mf()!.value).toBe('\\frac{a}{b}');
    // zaobilazni put sloja (a) (^^) se ne upisuje ni ne čuva
    upisiLatex('\\ce{^^5chtmlClass{uz-pub}{X}}');
    expect(mf()!.value).toBe('\\frac{a}{b}');
    expect(dugme('Sačuvaj').disabled).toBe(true);
  });

  it('preduboka formula (\\sqrt{ x700) ne ide u math-field i ne crta se (MathLive se ni ne zove); poruka o dubini', async () => {
    const crtaj = vi.fn((l: string) => convertLatexToMarkup(l, { defaultMode: 'math' }));
    ucitaj = () => Promise.resolve({ ...LAZNI, convertLatexToMarkup: crtaj } as unknown as MathLive);
    otvori();
    await ucitano();
    crtaj.mockClear();
    const latex = '\\sqrt{'.repeat(700) + 'x' + '}'.repeat(700);
    const t = performance.now();
    upisiLatex(latex);
    expect(performance.now() - t).toBeLessThan(500);
    expect(crtaj).not.toHaveBeenCalled();
    expect(mf()!.value).toBe('x^2');
    expect(greska().textContent).toContain('previše složena');
    expect(dugme('Sačuvaj').disabled).toBe(true);
  });

  it('markup veći od 1 MB ne ide u math-field (bez parsiranja u <template>)', async () => {
    ucitaj = () => Promise.resolve({ ...LAZNI, convertLatexToMarkup: () => '<span>' + 'x'.repeat(1_000_001) + '</span>' } as unknown as MathLive);
    otvori();
    await ucitano();
    expect(mf()!.value ?? '').toBe('');
  });

  it('greška crtača MathLive-a (izuzetak) -> math-field ne dobija formulu, polje LaTeX radi', async () => {
    ucitaj = () => Promise.resolve({ ...LAZNI, convertLatexToMarkup: () => { throw new Error('x'); } } as unknown as MathLive);
    otvori();
    await ucitano();
    expect(mf()!.value ?? '').toBe('');
    expect(polje().value).toBe('x^2');
    expect(dugme('Sačuvaj').disabled).toBe(false);
  });

  it('prazna nova formula: "Sačuvaj" onemogućeno, poruka tek posle kucanja', async () => {
    otvori({ pocetak: { ...POCETAK, latex: '' } });
    await ucitano();
    expect(dugme('Sačuvaj').disabled).toBe(true);
    expect(greska().textContent!.trim()).toBe('');
    upisiLatex('x');
    upisiLatex('');
    expect(greska().textContent!.trim()).toBe('Formula je prazna.');
  });

  it('polje LaTeX -> math-field; input iz math-field -> polje; isti input se ignoriše (bez petlje)', async () => {
    otvori();
    await ucitano();
    upisiLatex('\\frac{a}{b}');
    expect(mf()!.value).toBe('\\frac{a}{b}');
    mf()!.value = '\\sqrt{x}';
    mf()!.dispatchEvent(new Event('input', { bubbles: true }));
    TestBed.tick();
    expect(polje().value).toBe('\\sqrt{x}');
    // isti input (npr. posle programskog upisa) ne menja ništa
    const pre = polje().value;
    mf()!.dispatchEvent(new Event('input', { bubbles: true }));
    TestBed.tick();
    expect(polje().value).toBe(pre);
  });

  it('lepljenje zabranjene komande u math-field se odbija (beforeinput), uz poruku', async () => {
    otvori();
    await ucitano();
    const e = new InputEvent('beforeinput', { data: '\\htmlStyle{background:url(http://e)}{x}', cancelable: true, bubbles: true });
    mf()!.dispatchEvent(e);
    TestBed.tick();
    expect(e.defaultPrevented).toBe(true);
    expect(greska().textContent).toContain('nije dozvoljena');
    const ok = new InputEvent('beforeinput', { data: '\\frac{a}{b}', cancelable: true, bubbles: true });
    mf()!.dispatchEvent(ok);
    expect(ok.defaultPrevented).toBe(false);
  });

  it('ispravna formula: "Sačuvaj" zatvara sa unosom (LaTeX, boja, veličina, poravnanje)', async () => {
    otvori();
    await ucitano();
    upisiLatex('\\frac{a}{b}');
    const velicina = [...koren()!.querySelectorAll('mat-form-field')]
      .find((f) => f.querySelector('mat-label')?.textContent?.trim() === 'Veličina')!.querySelector('input')!;
    velicina.value = '32';
    velicina.dispatchEvent(new Event('input'));
    velicina.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    TestBed.tick();
    koren()!.querySelector<HTMLElement>('mat-button-toggle-group[aria-label="Poravnanje"] button[aria-label="Levo"]')!.click();
    TestBed.tick();
    expect(dugme('Sačuvaj').disabled).toBe(false);
    dugme('Sačuvaj').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(rezultat.vrednost).toEqual({ latex: '\\frac{a}{b}', boja: '#000000', velicina: 32, poravnanje: 'LEVO' });
  });

  it('formula uvezena kao slika: napomena vidljiva; bez slike nema napomene', async () => {
    otvori({ izSlike: true });
    expect(tekst()).toContain('Ova formula je uvezena kao slika iz PowerPointa. Posle čuvanja crta se iz LaTeX-a.');
    TestBed.inject(MatDialog).closeAll();
    await doK(() => !koren(), 'zatvoren');
    otvori();
    expect(tekst()).not.toContain('uvezena kao slika');
  });

  it('"Otkaži" zatvara sa undefined', async () => {
    otvori();
    await ucitano();
    dugme('Otkaži').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(rezultat.vrednost).toBeUndefined();
  });

  it('Esc u math-field ne zatvara (MathLive ga koristi za LaTeX režim); Esc van njega otkazuje', async () => {
    otvori();
    await ucitano();
    mf()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, composed: true }));
    TestBed.tick();
    await new Promise((r) => setTimeout(r, 10));
    expect(rezultat.zatvoren).toBe(false);
    polje().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await doK(() => rezultat.zatvoren, 'zatvaranje Esc-om');
    expect(rezultat.vrednost).toBeUndefined();
  });

  it('--keyboard-zindex na body dok je dijalog otvoren; po zatvaranju uklonjen i tastatura sakrivena', async () => {
    const hide = vi.fn();
    (window as { mathVirtualKeyboard?: unknown }).mathVirtualKeyboard = Object.assign(new EventTarget(), {
      visible: false, show: vi.fn(), hide,
    });
    otvori();
    await ucitano();
    expect(document.body.style.getPropertyValue('--keyboard-zindex')).toBe('1100');
    dugme('Otkaži').click();
    await doK(() => rezultat.zatvoren, 'zatvaranje');
    expect(document.body.style.getPropertyValue('--keyboard-zindex')).toBe('');
    expect(hide).toHaveBeenCalled();
  });

  it('"Tastatura" prikazuje i sakriva virtuelnu tastaturu (aria-pressed prati njen događaj)', async () => {
    const tastatura = Object.assign(new EventTarget(), {
      visible: false,
      show: vi.fn(() => {
        tastatura.visible = true;
        tastatura.dispatchEvent(new Event('virtual-keyboard-toggle'));
      }),
      hide: vi.fn(() => {
        tastatura.visible = false;
        tastatura.dispatchEvent(new Event('virtual-keyboard-toggle'));
      }),
    });
    (window as { mathVirtualKeyboard?: unknown }).mathVirtualKeyboard = tastatura;
    otvori();
    await ucitano();
    const t = dugme('Tastatura');
    expect(t.getAttribute('aria-pressed')).toBe('false');
    // završni talas: `disabledInteractive` bez `[disabled]` nema smisla (dugme nikad nije onemogućeno)
    expect(t.classList).not.toContain('mat-mdc-button-disabled-interactive');
    t.click();
    TestBed.tick();
    expect(tastatura.show).toHaveBeenCalled();
    expect(t.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(mf()); // tasteri tastature idu u fokusirano polje
    t.click();
    TestBed.tick();
    expect(tastatura.hide).toHaveBeenCalled();
    expect(t.getAttribute('aria-pressed')).toBe('false');
  });
});
