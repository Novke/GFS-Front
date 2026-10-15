import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { IKONE } from '../../../core/layout/icons';
import { OpcijaCmd, PitanjeCmd, TipPitanja } from '../data-access/uzivo.models';
import { ModulFormule, UCITAJ_FORMULE, ucitajFormule } from '../ui/formula-ucitavanje';
import { MAX_TEKST_SA_FORMULAMA } from '../ui/markdown';
import { MAX_FORMULA_U_TEKSTU } from '../ui/tekst-formule.component';
import { PitanjeFormaComponent, formuleIzPitanja, greskePitanja, pitanjeForma } from './pitanje-forma.component';

function pitanje(tip: TipPitanja, izmene: Partial<PitanjeCmd> = {}): PitanjeCmd {
  return {
    tip, tekst: 'Koliko je 2 + 2?', slikaId: null, vremeSekunde: null, opcije: [], brojTacno: null, brojOdstupanje: null,
    odstupanjeTip: null, jedinica: null, tekstPrikaz: null, prihvatljiviOdgovori: [], skalaMinOznaka: null,
    skalaMaxOznaka: null, ...izmene,
  };
}

const o = (tekst: string, tacna = false): OpcijaCmd => ({ tekst, tacna });

describe('greskePitanja (iste poruke kao SlajdPP)', () => {
  it('ispravno pitanje sa jednim tačnim nema grešaka', () => {
    expect(greskePitanja(pitanje('JEDAN_TACAN', { opcije: [o('3'), o('4', true)] }))).toEqual([]);
  });

  it('broj opcija mora biti 2-6', () => {
    const poruka = 'Pitanje mora imati od 2 do 6 ponuđenih odgovora.';
    expect(greskePitanja(pitanje('ANKETA', { opcije: [o('a')] }))).toContain(poruka);
    expect(greskePitanja(pitanje('ANKETA', { opcije: [o('a'), o('b'), o('c'), o('d'), o('e'), o('f'), o('g')] })))
      .toContain(poruka);
    expect(greskePitanja(pitanje('ANKETA', { opcije: [o('a'), o('b'), o('c'), o('d'), o('e'), o('f')] }))).toEqual([]);
  });

  it('prazan ili predugačak tekst opcije', () => {
    const poruka = 'Ponuđeni odgovor mora imati od 1 do 300 znakova.';
    expect(greskePitanja(pitanje('ANKETA', { opcije: [o('a'), o('   ')] }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('ANKETA', { opcije: [o('a'), o('x'.repeat(301))] }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('ANKETA', { opcije: [o('a'), o('x'.repeat(300))] }))).toEqual([]);
  });

  it('jedan tačan: tačno jedna tačna opcija', () => {
    const poruka = 'Pitanje sa jednim tačnim odgovorom mora imati tačno jedan tačan odgovor.';
    expect(greskePitanja(pitanje('JEDAN_TACAN', { opcije: [o('a'), o('b')] }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('JEDAN_TACAN', { opcije: [o('a', true), o('b', true)] }))).toEqual([poruka]);
  });

  it('više tačnih: bar jedna tačna, više je dozvoljeno', () => {
    expect(greskePitanja(pitanje('VISE_TACNIH', { opcije: [o('a'), o('b')] }))).toEqual(['Označi bar jedan tačan odgovor.']);
    expect(greskePitanja(pitanje('VISE_TACNIH', { opcije: [o('a', true), o('b', true)] }))).toEqual([]);
  });

  it('anketa ne traži tačan odgovor', () => {
    expect(greskePitanja(pitanje('ANKETA', { opcije: [o('a'), o('b')] }))).toEqual([]);
  });

  it('tačno/netačno: tačno dve opcije i tačno jedna tačna', () => {
    const poruka = 'Tačno/netačno pitanje ima tačno dva odgovora, od kojih je jedan tačan.';
    expect(greskePitanja(pitanje('TACNO_NETACNO', { opcije: [o('Tačno', true), o('Netačno')] }))).toEqual([]);
    expect(greskePitanja(pitanje('TACNO_NETACNO', { opcije: [o('Tačno'), o('Netačno')] }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('TACNO_NETACNO', { opcije: [o('Tačno', true), o('Netačno', true)] }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('TACNO_NETACNO', { opcije: [o('Tačno', true)] }))).toEqual([poruka]);
  });

  it('vreme je null ili 5-600 sekundi', () => {
    const poruka = 'Vreme za odgovor mora biti od 5 do 600 sekundi.';
    expect(greskePitanja(pitanje('SKALA', { vremeSekunde: 4 }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('SKALA', { vremeSekunde: 601 }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('SKALA', { vremeSekunde: 5 }))).toEqual([]);
    expect(greskePitanja(pitanje('SKALA', { vremeSekunde: 600 }))).toEqual([]);
    expect(greskePitanja(pitanje('SKALA', { vremeSekunde: null }))).toEqual([]);
  });

  it('odstupanje broja je ≥ 0', () => {
    expect(greskePitanja(pitanje('BROJ', { brojTacno: 3.5, brojOdstupanje: -0.1 })))
      .toEqual(['Odstupanje ne može biti negativno.']);
    expect(greskePitanja(pitanje('BROJ', { brojTacno: 3.5, brojOdstupanje: 0 }))).toEqual([]);
    expect(greskePitanja(pitanje('BROJ', { brojTacno: null, brojOdstupanje: null }))).toEqual([]);
    expect(greskePitanja(pitanje('BROJ', { brojTacno: NaN }))).toEqual(['Broj nije ispravan.']);
  });

  it('najviše 20 prihvatljivih odgovora, svaki do 100 znakova', () => {
    const poruka = 'Najviše 20 prihvatljivih odgovora, svaki do 100 znakova.';
    const dvadeset = Array.from({ length: 20 }, (_, i) => `odgovor ${i}`);
    expect(greskePitanja(pitanje('KRATAK_TEKST', { prihvatljiviOdgovori: dvadeset }))).toEqual([]);
    expect(greskePitanja(pitanje('KRATAK_TEKST', { prihvatljiviOdgovori: [...dvadeset, 'još jedan'] }))).toEqual([poruka]);
    expect(greskePitanja(pitanje('KRATAK_TEKST', { prihvatljiviOdgovori: ['x'.repeat(101)] }))).toEqual([poruka]);
  });

  it('tekst pitanja je obavezan, a za tipove bez opcija se opcije ne proveravaju', () => {
    expect(greskePitanja(pitanje('KRATAK_TEKST', { tekst: '  ' }))).toEqual(['Tekst pitanja je obavezan (najviše 2000 znakova).']);
    expect(greskePitanja(pitanje('SKALA', { skalaMinOznaka: 'x'.repeat(61) })))
      .toEqual(['Oznaka skale može imati najviše 60 znakova.']);
  });
});

describe('formuleIzPitanja', () => {
  it('sve formule iz teksta i opcija, redom, bez duplikata', () => {
    expect(formuleIzPitanja({ tekst: 'Koliko je $x$ i $x$?', opcije: [{ tekst: '$y$', tacna: true }] })).toEqual(['x', 'y']);
  });

  it('isto pravilo kao prikaz: kod u Markdown-u, \\$ i iznos posle cifre nisu formule', () => {
    expect(formuleIzPitanja({ tekst: 'Kod `$a$`, cena 5$ i 10$, znak \\$b$ i $c$', opcije: [] })).toEqual(['c']);
    // opcija je običan tekst (kao pločice): kosa crta pre $ je znak dolara, `kod` se ne tumači
    expect(formuleIzPitanja({ tekst: '', opcije: [o('`$d$` i \\$e$'), o('2$f$ i $g$')] })).toEqual(['d', 'g']);
  });

  it('prazno i bez formula', () => {
    expect(formuleIzPitanja({ tekst: '', opcije: [] })).toEqual([]);
    expect(formuleIzPitanja({ tekst: 'Koliko je 2 + 2?', opcije: [o('4')] })).toEqual([]);
  });

  it(`po tekstu najviše ${MAX_FORMULA_U_TEKSTU} formula (ostale prikaz ionako crta kao izvor)`, () => {
    const tekst = Array.from({ length: MAX_FORMULA_U_TEKSTU + 5 }, (_, i) => `$a_{${i}}$`).join(' ');
    const f = formuleIzPitanja({ tekst, opcije: [o('$z$')] });
    expect(f.length).toBe(MAX_FORMULA_U_TEKSTU + 1);
    expect(f.at(-2)).toBe(`a_{${MAX_FORMULA_U_TEKSTU - 1}}`);
    expect(f.at(-1)).toBe('z');
  });
});

/** Ikone bez HTTP-a i bez grešaka "Error retrieving icon" u izlazu testa (kao `student-picker.spec`). */
function registrujIkone(): void {
  const registry = TestBed.inject(MatIconRegistry);
  const sanitizer = TestBed.inject(DomSanitizer);
  for (const ime of IKONE) {
    registry.addSvgIconLiteral(ime, sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
  }
}

/** Markup lažnog modula (kao `tekst-formule.component.spec`). */
function fragment(latex: string): DocumentFragment {
  const t = document.createElement('template');
  t.innerHTML = '<span class="ML__latex"></span>';
  t.content.firstElementChild!.textContent = latex;
  return t.content;
}

/**
 * Lažni `formula-markup`: `\nepostoji{...}` i `\bad` su neispravni (null), sve ostalo daje markup. Isto kao pravi
 * MathLive za nepoznatu komandu (`\nepostoji{x}`, test sa pravim `mathlive/ssr` dole); nepotpun `\frac{1}{` pravi MathLive
 * crta (prazno mesto), pa nije primer neispravne formule.
 */
function lazniModul(pozivi: string[]): ModulFormule {
  return {
    latexUMarkup: (l: string) => {
      pozivi.push(l);
      return l.includes('\\nepostoji{') || l.includes('\\bad') ? null : fragment(l);
    },
  } as unknown as ModulFormule;
}

describe('PitanjeFormaComponent: uputstvo i upozorenje za formule', () => {
  let pozivi: string[];
  let ucitaj: ReturnType<typeof vi.fn>;

  function napravi(p: PitanjeCmd, ucitavac: unknown = ucitaj) {
    TestBed.configureTestingModule({
      imports: [PitanjeFormaComponent],
      providers: [
        provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: UCITAJ_FORMULE, useValue: ucitavac },
      ],
    });
    registrujIkone();
    const forma = pitanjeForma(p);
    const fixture = TestBed.createComponent(PitanjeFormaComponent);
    fixture.componentRef.setInput('forma', forma);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, forma, el };
  }

  const upozorenja = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLElement>('p.uz-ed-upozorenje')).map((p) => p.textContent!.trim());

  async function posle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }, ms: number) {
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    pozivi = [];
    ucitaj = vi.fn(() => Promise.resolve(lazniModul(pozivi)));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ispod teksta pitanja je uputstvo za formule (mat-hint, povezan sa poljem)', () => {
    const { el } = napravi(pitanje('KRATAK_TEKST'));
    const hint = el.querySelector('mat-hint')!;
    expect(hint.textContent).toContain('Formula između znakova dolara: $1011_2$, $\\frac{1}{2}$ · znak dolara: \\$');
    // izuzetak pravila (F1): `$` odmah posle cifre ne otvara formulu (iznos), forma za njega ne upozorava
    expect(hint.textContent).toContain('odmah posle cifre $ ne otvara formulu (5$, 10$)');
    expect(hint.textContent).toContain('Markdown');
    const polje = el.querySelector('textarea')!;
    expect(polje.getAttribute('aria-describedby')).toContain(hint.id);
  });

  it('napomena o formulama u odgovorima samo za tipove sa opcijama koje se kucaju', () => {
    const sa = napravi(pitanje('JEDAN_TACAN', { opcije: [o('a', true), o('b')] })).el;
    expect(sa.querySelector('.uz-ed-opcije .uz-ed-napomena')?.textContent).toContain('Formule važe i u odgovorima: $x^2$.');
    TestBed.resetTestingModule();
    expect(napravi(pitanje('BROJ')).el.textContent).not.toContain('Formule važe i u odgovorima');
    TestBed.resetTestingModule();
    const tn = napravi(pitanje('TACNO_NETACNO', { opcije: [o('Tačno', true), o('Netačno')] })).el;
    expect(tn.textContent).not.toContain('Formule važe i u odgovorima');
  });

  it('neispravna formula: upozorenje posle 300 ms (debounce), sa \\textstyle kao prikaz', async () => {
    const { fixture, forma, el } = napravi(pitanje('KRATAK_TEKST', { tekst: 'Koliko je 5?' }));
    forma.controls.tekst.setValue('Koliko je $\\nepostoji{x}$?');
    await posle(fixture, 299);
    expect(upozorenja(el)).toEqual([]);
    expect(ucitaj).not.toHaveBeenCalled();
    await posle(fixture, 1);
    expect(upozorenja(el)).toEqual(['Formula „\\nepostoji{x}“ u tekstu pitanja ima grešku u LaTeX-u i prikazaće se kao tekst.']);
    expect(pozivi).toEqual(['\\textstyle \\nepostoji{x}']);
    const status = el.querySelector('p.uz-ed-upozorenje')!.closest('[role="status"]')!;
    expect(el.querySelector('textarea')!.getAttribute('aria-describedby')).toContain(status.id);
  });

  it('ispravna formula: nema upozorenja; ispravka briše staro upozorenje', async () => {
    const { fixture, forma, el } = napravi(pitanje('KRATAK_TEKST', { tekst: '$\\nepostoji{x}$' }));
    await posle(fixture, 300);
    expect(upozorenja(el).length).toBe(1);
    forma.controls.tekst.setValue('Koliko je $x^2$?');
    await posle(fixture, 300);
    expect(upozorenja(el)).toEqual([]);
    expect(ucitaj).toHaveBeenCalled();
  });

  it('tekst bez $ ne zove učitavač; iznos 5$ takođe', async () => {
    const { fixture, forma, el } = napravi(pitanje('JEDAN_TACAN', { tekst: 'Koliko je 2 + 2?', opcije: [o('4', true), o('5')] }));
    await posle(fixture, 300);
    forma.controls.tekst.setValue('Koliko košta 5$ ili 10$?');
    await posle(fixture, 300);
    expect(ucitaj).not.toHaveBeenCalled();
    expect(upozorenja(el)).toEqual([]);
  });

  it(`tekst pitanja duži od ${MAX_TEKST_SA_FORMULAMA} znakova: prikaz ne crta formule, pa forma ne upozorava`, async () => {
    const { fixture, forma, el } = napravi(pitanje('KRATAK_TEKST', { tekst: 'Koliko je 5?' }));
    const tekst = 'Koliko je $\\nepostoji{x}$? ';
    forma.controls.tekst.setValue(tekst + 'a'.repeat(MAX_TEKST_SA_FORMULAMA - tekst.length));
    await posle(fixture, 300);
    expect(upozorenja(el)).toEqual(['Formula „\\nepostoji{x}“ u tekstu pitanja ima grešku u LaTeX-u i prikazaće se kao tekst.']);
    forma.controls.tekst.setValue(tekst + 'a'.repeat(MAX_TEKST_SA_FORMULAMA - tekst.length + 1));
    await posle(fixture, 300);
    expect(upozorenja(el)).toEqual([]);
    expect(formuleIzPitanja({ tekst: forma.controls.tekst.value, opcije: [] })).toEqual([]);
  });

  it('formula u odgovoru se proverava; najviše 3 upozorenja pa "i još n"', async () => {
    const { fixture, el } = napravi(pitanje('VISE_TACNIH', {
      tekst: 'Koje su $\\bad1$ i $\\bad2$?',
      opcije: [o('$\\bad3$', true), o('$\\bad4$'), o('$\\bad5$'), o('$x$')],
    }));
    await posle(fixture, 300);
    const u = upozorenja(el);
    expect(u.slice(0, 3)).toEqual([
      'Formula „\\bad1“ u tekstu pitanja ima grešku u LaTeX-u i prikazaće se kao tekst.',
      'Formula „\\bad2“ u tekstu pitanja ima grešku u LaTeX-u i prikazaće se kao tekst.',
      'Formula „\\bad3“ u odgovoru A ima grešku u LaTeX-u i prikazaće se kao tekst.',
    ]);
    expect(u[3]).toBe('i još 2 formule sa greškom.');
    expect(u.length).toBe(4);
  });

  it('tip bez opcija: opcije koje forma još čuva se ne proveravaju', async () => {
    const { fixture, forma, el } = napravi(pitanje('JEDAN_TACAN', { tekst: 'Pitanje', opcije: [o('$\\bad$', true), o('b')] }));
    await posle(fixture, 300);
    expect(upozorenja(el).length).toBe(1);
    forma.controls.tip.setValue('BROJ');
    await posle(fixture, 300);
    expect(upozorenja(el)).toEqual([]);
  });

  it(`više od ${MAX_FORMULA_U_TEKSTU} formula u jednom tekstu: upozorenje kao prikaz (ostale ostaju tekst)`, async () => {
    const mnogo = Array.from({ length: MAX_FORMULA_U_TEKSTU + 1 }, () => '$a$').join(' ');
    const { fixture, el } = napravi(pitanje('ANKETA', { tekst: mnogo, opcije: [o('a'), o(mnogo)] }));
    await posle(fixture, 300);
    expect(upozorenja(el)).toEqual([
      `Tekst pitanja ima više od ${MAX_FORMULA_U_TEKSTU} formula; ostale će se prikazati kao tekst.`,
      `Odgovor B ima više od ${MAX_FORMULA_U_TEKSTU} formula; ostale će se prikazati kao tekst.`,
    ]);
    expect(pozivi).toEqual(['\\textstyle a']);
  });

  it('ista neispravna formula na više mesta: jedna poruka sa svim poljima', async () => {
    const { fixture, el } = napravi(pitanje('JEDAN_TACAN', {
      tekst: 'Da li je $\\bad$ tačno?', opcije: [o('$\\bad$', true), o('b'), o('$\\bad$ i $\\nepostoji{y}$')],
    }));
    await posle(fixture, 300);
    expect(upozorenja(el)).toEqual([
      'Formula „\\bad“ u tekstu pitanja, odgovoru A i odgovoru C ima grešku u LaTeX-u i prikazaće se kao tekst.',
      'Formula „\\nepostoji{y}“ u odgovoru C ima grešku u LaTeX-u i prikazaće se kao tekst.',
    ]);
    expect(pozivi).toEqual(['\\textstyle \\bad', '\\textstyle \\nepostoji{y}']);
  });

  it('neuspelo učitavanje se pamti u formi: sledeće pauze ne zovu import() ponovo i ne pišu novi console.warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const odbij = vi.fn(() => Promise.reject(new Error('mreža')));
    const { fixture, forma, el } = napravi(pitanje('KRATAK_TEKST', { tekst: '$\\nepostoji{x}$' }), odbij);
    await posle(fixture, 300);
    forma.controls.tekst.setValue('$\\bad$ pa $x$');
    await posle(fixture, 300);
    forma.controls.tekst.setValue('$\\bad$');
    await posle(fixture, 300);
    expect(odbij).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(upozorenja(el)).toEqual([]);
    warn.mockRestore();
  });

  it('greška učitavanja: bez upozorenja, jedan console.warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const odbij = vi.fn(() => Promise.reject(new Error('mreža')));
    const { fixture, el } = napravi(pitanje('KRATAK_TEKST', { tekst: '$\\nepostoji{x}$' }), odbij);
    await posle(fixture, 300);
    expect(odbij).toHaveBeenCalledTimes(1);
    expect(upozorenja(el)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('kasni odgovor stare provere ne prepisuje noviju', async () => {
    let razresi!: (m: ModulFormule) => void;
    const sporo = vi.fn()
      .mockImplementationOnce(() => new Promise<ModulFormule>((r) => { razresi = r; }))
      .mockImplementation(() => Promise.resolve(lazniModul(pozivi)));
    const { fixture, forma, el } = napravi(pitanje('KRATAK_TEKST', { tekst: '$\\nepostoji{x}$' }), sporo);
    await posle(fixture, 300);
    forma.controls.tekst.setValue('$x$');
    await posle(fixture, 300);
    razresi(lazniModul(pozivi));
    await posle(fixture, 0);
    expect(upozorenja(el)).toEqual([]);
  });

  it('nova forma (drugi slajd): stara upozorenja nestaju, nova se računaju', async () => {
    const { fixture, el } = napravi(pitanje('KRATAK_TEKST', { tekst: '$\\nepostoji{x}$' }));
    await posle(fixture, 300);
    expect(upozorenja(el).length).toBe(1);
    fixture.componentRef.setInput('forma', pitanjeForma(pitanje('KRATAK_TEKST', { tekst: 'Bez formule' })));
    await posle(fixture, 0);
    expect(upozorenja(el)).toEqual([]);
    fixture.componentRef.setInput('forma', pitanjeForma(pitanje('KRATAK_TEKST', { tekst: '$\\bad$' })));
    await posle(fixture, 300);
    expect(upozorenja(el)).toEqual(['Formula „\\bad“ u tekstu pitanja ima grešku u LaTeX-u i prikazaće se kao tekst.']);
  });

  it('dugačka formula u poruci je skraćena', async () => {
    const dug = `\\bad${'x'.repeat(200)}`;
    const { fixture, el } = napravi(pitanje('KRATAK_TEKST', { tekst: `$${dug}$` }));
    await posle(fixture, 300);
    const [u] = upozorenja(el);
    expect(u).toContain(`„${dug.slice(0, 60)}…“`);
    expect(u.length).toBeLessThan(140);
  });
});

describe('PitanjeFormaComponent: upozorenje sa pravim mathlive/ssr (ista provera kao prikaz)', () => {
  it('zabranjena komanda, ^^, nepoznata komanda i pretežak LaTeX daju upozorenje; ispravne formule ne', async () => {
    TestBed.configureTestingModule({
      imports: [PitanjeFormaComponent],
      providers: [
        provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: UCITAJ_FORMULE, useValue: ucitajFormule },
      ],
    });
    // dubina 33 > MAX_DUBINA_FORMULE (trosakFormule); `\frac{1}{` MathLive crta (prazno mesto), pa ga i prikaz crta: nepotpun
    // izraz nije primer neispravne formule (lažni modul gore zato koristi `\nepostoji{...}`)
    const tesko = `${'\\sqrt{'.repeat(33)}x${'}'.repeat(33)}`;
    registrujIkone();
    const fixture = TestBed.createComponent(PitanjeFormaComponent);
    fixture.componentRef.setInput('forma', pitanjeForma(pitanje('JEDAN_TACAN', {
      tekst: `Koliko je $1011_2$ i $\\href{http://e.com}{x}$, a $${tesko}$?`,
      opcije: [o('$^^5cfrac{1}{2}$', true), o('$\\nepostoji{x}$'), o('$\\sqrt{2}$ i $\\frac{1}{$')],
    })));
    fixture.detectChanges();
    await vi.waitFor(() => {
      expect(fixture.componentInstance.neispravne().length).toBeGreaterThan(0);
    }, { timeout: 4000, interval: 50 });
    expect(fixture.componentInstance.neispravne().map((n) => n.latex))
      .toEqual(['\\href{http://e.com}{x}', tesko, '^^5cfrac{1}{2}', '\\nepostoji{x}']);
    expect(fixture.componentInstance.neispravne().map((n) => n.gde))
      .toEqual([['tekstu pitanja'], ['tekstu pitanja'], ['odgovoru A'], ['odgovoru B']]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('p.uz-ed-upozorenje').length).toBe(4);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('i još 1 formula sa greškom.');
  });
});
