import { convertLatexToMarkup } from 'mathlive/ssr';
import { latexUMarkup as latexUMarkupZaTest } from './formula-markup';
import { MAX_MARKUP, markupNepromenjen, ocistiMarkup, ocistiStil } from './formula-sanitizer';

const ml = (latex: string) => convertLatexToMarkup(latex, { defaultMode: 'math' });

describe('formula-sanitizer: markupNepromenjen (dijalog: upis u math-field samo kad sanitizer ništa ne briše)', () => {
  it.each(['x^2', '\\frac{a}{b}', '\\begin{array}{c|c}1&2\\\\3&4\\end{array}', '\\enclose{circle}[2px dashed red]{x}', '\\cancel{x}',
    '\\left(\\frac{a}{b}\\right)', '\\colorbox{yellow}{z}', ''])('izlaz MathLive-a za %s je nepromenjen', latex => {
    expect(markupNepromenjen(ml(latex))).toBe(true);
  });

  it.each([
    '\\mathtip{a}{b}', // oblačić se briše
    '\\htmlClass{uz-pub}{x}', '\\ce{^^5cclass{uz-pub}{X}}', '\\htmlStyle{position:fixed}{x}', '\\cssId{q}{x}',
    '\\htmlData{onclick=alert(1)}{x}', '\\href{http://e.com}{x}',
  ])('izlaz MathLive-a za %s bi se promenio', latex => {
    expect(markupNepromenjen(ml(latex))).toBe(false);
  });

  it('izmena = obrisan ili razvijen element, atribut, token klase ili deklaracija stila; preformatiranje stila nije', () => {
    expect(markupNepromenjen('<span style="font-size: 70%;">a</span>')).toBe(true);
    expect(markupNepromenjen('<span class="ML__base uz-pub">a</span>')).toBe(false);
    expect(markupNepromenjen('<span style="color:#f00;position:fixed">a</span>')).toBe(false);
    expect(markupNepromenjen('<span id="a">a</span>')).toBe(false);
    expect(markupNepromenjen('<span><a>t</a></span>')).toBe(false);
    expect(markupNepromenjen('<svg><path d="url(#x)"></path></svg>')).toBe(false);
    expect(markupNepromenjen('<span>a<script>x</script></span>')).toBe(false);
  });

  it('ocistiMarkup i dalje vraća očišćen fragment', () => {
    const div = document.createElement('div');
    div.append(ocistiMarkup('<span class="ML__base uz-pub" onclick="x">a</span>'));
    expect(div.innerHTML).toBe('<span class="ML__base">a</span>');
  });

  it('prototip nije dozvoljena lista: constructor/toString u stilu i atributima se brišu bez izuzetka', () => {
    expect(() => ocistiMarkup('<span constructor="x" style="constructor:x;toString:y;color:#000">a</span>')).not.toThrow();
    const div = document.createElement('div');
    div.append(ocistiMarkup('<span constructor="x" style="constructor:x;toString:y;color:#000">a</span>'));
    expect(div.innerHTML).toBe('<span style="color:#000">a</span>');
  });
});

/**
 * Katastrofalno vraćanje (F15 fix 2): najgori slučaj svakog regexa nad vrednošću iz markup-a ili LaTeX-a. Granica je
 * labava (CI je opterećen); pre popravke `points` je bio eksponencijalan (24 cifre: 61 s), a brojevi i `calc(`
 * kvadratni (`\d*\.?\d+`, `\s*[...\s]*`).
 */
describe('formula-sanitizer: bez katastrofalnog vraćanja (vremenska granica)', () => {
  const GRANICA_MS = 200;
  const traje = (f: () => unknown) => {
    const t = performance.now();
    f();
    return performance.now() - t;
  };
  const svg = (atributi: string) => ocistiMarkup(`<svg ${atributi}><polygon></polygon></svg>`);

  it('formula sa ogromnim \\rule u \\enclose{updiagonalarrow} (points sa e+44) se crta brzo, vrh strelice ostaje', () => {
    // pre popravke: oko 1 s (recenzija; varijanta sa padding="0.1234567" i 1.123456789em ni posle 30 s)
    const latex = '\\enclose{updiagonalarrow}{\\rule{1em}{100000000000000000000000em}}';
    let f: DocumentFragment | null = null;
    expect(traje(() => (f = latexUMarkupZaTest(latex)))).toBeLessThan(GRANICA_MS);
    expect(f!.querySelector('polygon')!.getAttribute('points')).toMatch(/e\+\d+/);
  });

  it('formula iz re-recenzije (pre popravke ni posle 30 s; RED nije puštan, zamrzao bi suite) se crta brzo', () => {
    const latex = '\\enclose{updiagonalarrow}[padding="0.1234567"]{\\rule{1.123456789em}{100000000000000000000000em}}';
    let f: DocumentFragment | null = null;
    expect(traje(() => (f = latexUMarkupZaTest(latex)))).toBeLessThan(GRANICA_MS);
    expect(f!.querySelector('polygon')).not.toBeNull();
    expect(traje(() => markupNepromenjen(convertLatexToMarkup(latex, { defaultMode: 'math' })))).toBeLessThan(GRANICA_MS);
  });

  it('points: niz cifara bez separatora pa nedozvoljen znak (eksponencijalno pre popravke)', () => {
    let f!: DocumentFragment;
    // posle popravke i 40 cifara (pre: 21 cifra ~3 s, 24 cifre ~61 s)
    expect(traje(() => ocistiMarkup(`<svg><polygon points="${'1'.repeat(40)}x"></polygon></svg>`))).toBeLessThan(GRANICA_MS);
    expect(traje(() => (f = ocistiMarkup(`<svg><polygon points="${'1'.repeat(21)}x"></polygon></svg>`)))).toBeLessThan(GRANICA_MS);
    expect(f.querySelector('polygon')!.hasAttribute('points')).toBe(false);
    // ispravne vrednosti i dalje prolaze, i sa eksponentom sa znakom
    const ok = ocistiMarkup('<svg><polygon points="1.3,0.3 -1.1999999999999997e+44,2e-3 .5 4"></polygon></svg>');
    expect(ok.querySelector('polygon')!.getAttribute('points')).toBe('1.3,0.3 -1.1999999999999997e+44,2e-3 .5 4');
  });

  it.each([
    ['x1 (BROJ)', () => ocistiMarkup(`<svg><line x1="${'1'.repeat(30000)}x"></line></svg>`)],
    ['width (DUZINA, broj)', () => svg(`width="${'1'.repeat(30000)}x"`)],
    ['viewBox', () => svg(`viewBox="${'1'.repeat(30000)}x"`)],
    ['points (dug, sa separatorima)', () => ocistiMarkup(`<svg><polygon points="${'1 '.repeat(30000)}x"></polygon></svg>`)],
    ['d (dug)', () => ocistiMarkup(`<svg><path d="${'M0 1'.repeat(20000)}#"></path></svg>`)],
    ['style height (DUZINA, broj)', () => ocistiStil(`height:${'1'.repeat(30000)}x`)],
    ['style calc( sa razmacima', () => ocistiStil(`left:calc(${' '.repeat(30000)}x)`)],
    ['style calc( sa jedinicama', () => ocistiStil(`left:calc(${'1em'.repeat(20000)}x)`)],
    ['style vertical-align', () => ocistiStil(`vertical-align:${'1'.repeat(30000)}x`)],
    ['style border (IVICA)', () => ocistiStil(`border:${'1'.repeat(30000)}x solid`)],
    ['style border, imenovana boja', () => ocistiStil(`border:1px solid ${'a'.repeat(30000)}1`)],
    ['style mnogo deklaracija', () => ocistiStil('height:1em;'.repeat(20000))],
    ['class sa mnogo razmaka', () => ocistiMarkup(`<span class="${' '.repeat(30000)}ML__base x">a</span>`)],
    ['class, dug token (KLASE_OSTALE)', () => ocistiMarkup(`<span class="slice-1-of-${'1'.repeat(30000)} overline${'-line'.repeat(5000)}">a</span>`)],
    ['preserveAspectRatio, dug', () => svg(`preserveAspectRatio="xMinYMin ${'slice'.repeat(10000)}"`)],
    ['fill (BOJA_SVG), dug', () => svg(`fill="#${'f'.repeat(30000)}"`)],
    ['style color (BOJA), dug', () => ocistiStil(`color:#${'f'.repeat(30000)}`)],
    ['style opacity, dug', () => ocistiStil(`opacity:0.${'1'.repeat(30000)}x`)],
  ])('%s: najgori slučaj ispod granice', (_ime, f) => {
    expect(traje(f)).toBeLessThan(GRANICA_MS);
  });

  // tik ispod granice dužine (199 / 19 999): regex se zaista pokreće (recenzija 2, m2)
  it.each([
    ['x1', () => ocistiMarkup(`<svg><line x1="${'1'.repeat(198)}x"></line></svg>`)],
    ['width', () => svg(`width="${'1'.repeat(198)}x"`)],
    ['viewBox', () => svg(`viewBox="${'1 '.repeat(98)}1x"`)],
    ['points', () => ocistiMarkup(`<svg><polygon points="${'1'.repeat(19_998)}x"></polygon></svg>`)],
    ['points sa separatorima', () => ocistiMarkup(`<svg><polygon points="${'1,'.repeat(9_999)}x"></polygon></svg>`)],
    ['d', () => ocistiMarkup(`<svg><path d="${'M0 1'.repeat(4_999)}#"></path></svg>`)],
    ['stil height', () => ocistiStil(`height:${'1'.repeat(198)}x`)],
    ['stil calc( razmaci', () => ocistiStil(`left:calc(${' '.repeat(193)}x)`)],
    ['stil calc( jedinice', () => ocistiStil(`left:calc(${'1em'.repeat(63)}x)`)],
    ['stil border', () => ocistiStil(`border:${'1'.repeat(186)}x solid`)],
  ])('%s tik ispod granice dužine: regex brz', (_ime, f) => {
    expect(traje(f)).toBeLessThan(GRANICA_MS);
  });

  it('eksponent dosledno: stil i x1..y2 primaju 1e+23em / 1e-7 kao points (recenzija 2, m3)', () => {
    expect(ocistiStil('height:1e+23em;top:-1.5e-7em')).toBe('height:1e+23em;top:-1.5e-7em');
    const l = ocistiMarkup('<svg><line x1="1e-7" y1="-2.5e+3" x2="1" y2="0"></line></svg>').querySelector('line')!;
    expect(l.getAttribute('x1')).toBe('1e-7');
    expect(l.getAttribute('y1')).toBe('-2.5e+3');
  });

  it('markupNepromenjen: markup veći od MAX_MARKUP je izmena (dijalog ga ne upisuje), bez <template>', () => {
    const t = performance.now();
    expect(markupNepromenjen('<span>' + 'x'.repeat(MAX_MARKUP) + '</span>')).toBe(false);
    expect(traje(() => markupNepromenjen('<span>x</span>'))).toBeLessThan(GRANICA_MS);
    expect(performance.now() - t).toBeLessThan(GRANICA_MS);
  });

  it('predugačke vrednosti se odbacuju pre regexa (atribut, deklaracija stila)', () => {
    expect(ocistiStil(`height:${'1'.repeat(300)}em`)).toBe('');
    expect(svg(`width="${'1'.repeat(300)}"`).querySelector('svg')!.hasAttribute('width')).toBe(false);
  });
});
