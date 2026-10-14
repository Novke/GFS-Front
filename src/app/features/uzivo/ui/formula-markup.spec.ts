import { convertLatexToMarkup } from 'mathlive/ssr';
import { ZABRANJENE_KOMANDE, konvertuj, latexUMarkup, ocistiMarkup, ocistiStil } from './formula-markup';

/** Sirov izlaz MathLive-a (bez čišćenja), parsiran kao HTML, radi poređenja sa očišćenim. */
function sirov(latex: string): DocumentFragment {
  const t = document.createElement('template');
  t.innerHTML = convertLatexToMarkup(latex, { defaultMode: 'math' });
  return t.content;
}

/** `ime:vrednost` bez razmaka, istim redom (MathLive ponekad piše `font-size: 70%` ili završno `;`). */
function normalizujStil(stil: string): string {
  return stil.split(';').map(d => d.replace(/\s+/g, '')).filter(Boolean).join(';');
}

/** Elementi redom, svaki sa svim atributima (`style` normalizovan). */
function opis(f: DocumentFragment): { el: string; atributi: Record<string, string> }[] {
  return [...f.querySelectorAll('*')].map(el => ({
    el: el.localName,
    atributi: Object.fromEntries([...el.attributes].map(a => [a.name, a.name === 'style' ? normalizujStil(a.value) : a.value])),
  }));
}

describe('latexUMarkup: pravi mathlive/ssr', () => {
  it('x^2 i razlomak daju markup MathLive-a', () => {
    expect(latexUMarkup('x^2')!.querySelector('.ML__latex')).not.toBeNull();
    expect(latexUMarkup('\\frac{a}{b}')!.querySelector('.ML__mfrac')).not.toBeNull();
  });

  it.each([
    'x^2', '\\frac{a}{b}', '\\sqrt[3]{x}', '\\int_0^1 x\\,dx', '\\sum_{i=1}^n i', '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}',
    '\\overrightarrow{AB}', '\\boxed{x}', '\\colorbox{yellow}{z}', '\\cancel{x}', '\\bcancel{x}', '\\xcancel{x}',
    '\\enclose{circle}{x}', '\\enclose{roundedbox}{x}', '\\enclose{updiagonalstrike}{x}',
    // Fix 1: izmereni funkcionalni gubici i klase van ML__ (col-align, delim-size, slice, overline, underline, lcGreek)
    '\\begin{array}{c|c}1&2\\\\3&4\\end{array}', '\\begin{array}{lcr}a&b&c\\end{array}', '\\enclose{top}{x}', '\\enclose{bottom}{x}',
    '\\enclose{left}{x}', '\\enclose{right}{x}', '\\enclose{actuarial}{x}', '\\enclose{madruwb}{x}', '\\enclose{updiagonalarrow}{x}',
    '\\enclose{circle}[2px dashed red]{x}', '\\enclose{box}[3px solid blue]{x}', '\\overline{x}', '\\underline{x}',
    '\\left(\\frac{a}{b}\\right)', '\\Bigg\\{x\\Bigg\\}', '\\widehat{abc}', '\\overbrace{a+b}^{n}', '\\xrightarrow[a]{b}',
    '\\boldsymbol{\\alpha}', '\\begin{cases}x&y\\\\z&w\\end{cases}', '\\ce{H2O}', '\\pu{123 kJ/mol}', '\\mathbb{R}+\\mathcal{L}',
  ])('dozvoljena lista ne kvari uobičajenu formulu %s (isti elementi i atributi)', latex => {
    const ocekivano = opis(sirov(latex));
    const dobijeno = opis(latexUMarkup(latex)!);
    expect(ocekivano.length).toBeGreaterThan(0);
    expect(dobijeno).toEqual(ocekivano);
  });

  it('\\cancel: <line> zadržava koordinate; \\enclose{circle}: border-radius i border bez debljine', () => {
    const linija = latexUMarkup('\\cancel{x}')!.querySelector('line')!;
    for (const a of ['x1', 'y1', 'x2', 'y2']) expect(linija.getAttribute(a), a).toMatch(/^\d/);
    const krug = [...latexUMarkup('\\enclose{circle}{x}')!.querySelectorAll<HTMLElement>('[style]')]
      .map(el => normalizujStil(el.getAttribute('style')!)).find(s => s.includes('border-radius'));
    expect(krug).toContain('border-radius:50%');
    expect(krug).toContain('border:solidcurrentColor');
  });

  it.each([
    '\\href{http://e.com}{x}', '\\href{javascript:alert(1)}{x}', '\\url{http://e.com}',
    '\\htmlStyle{background:url(http://e)}{x}', '\\htmlStyle{background:image-set("http://e/a.png" 1x)}{x}',
    '\\htmlStyle{position:fixed;top:0}{x}', '\\cssId{q}{x}', '\\htmlData{onclick=alert(1)}{x}',
    '\\class{a" onmouseover="x}{y}',
    // prolaze validateLatex, a MathLive za njih piše style/id
    '\\style{position:fixed}{x}', '\\htmlId{q}{x}', '\\csname htmlStyle\\endcsname{position:fixed}{x}',
    // Fix 1: \htmlClass (alias za \class), cela porodica \html…, i ^^ (tokenizer: ^^5c = \; \ce i \pu reparsiraju argument)
    '\\class{uz-pub}{x}', '\\htmlClass{uz-pub}{x}', '\\htmlBilosta{x}', '\\ce{^^5chtmlClass{uz-pub}{X}}', '\\ce{^^5cclass{uz-pub}{X}}',
    '\\ce{^^5chtmlStyle{color:#123456}{X}}', '\\ce{^^5ccssId{q}{X}}', '\\ce{^^5chref{http://e.com}{X}}', '\\pu{^^5cclass{uz-pub}{X}}',
    '\\pu{^^5chtmlClass{uz-pub}{X}}', 'x^^2', '^^\x1chtmlClass{uz-pub}{X}',
  ])('zabranjena komanda -> null: %s', latex => {
    expect(ZABRANJENE_KOMANDE.test(latex)).toBe(true);
    expect(latexUMarkup(latex)).toBeNull();
  });

  it('\\stylex i \\urlx nisu komande sa liste (odbija ih validateLatex, ne lista)', () => {
    expect(ZABRANJENE_KOMANDE.test('\\stylex')).toBe(false);
    expect(ZABRANJENE_KOMANDE.test('\\urlx')).toBe(false);
    expect(latexUMarkup('\\stylex')).toBeNull();
    expect(latexUMarkup('\\urlx')).toBeNull();
  });

  it('neispravan ili prazan LaTeX -> null', () => {
    expect(latexUMarkup('\\nepostoji{x}')).toBeNull();
    expect(latexUMarkup('')).toBeNull();
    expect(latexUMarkup('  ')).toBeNull();
  });

  it('konvertuj: izuzetak MathLive-a (\\href{javascript:...}) i zamenjene funkcije -> null bez izuzetka', () => {
    expect(() => konvertuj('\\href{javascript:alert(1)}{x}')).not.toThrow();
    expect(konvertuj('\\href{javascript:alert(1)}{x}')).toBeNull();
    expect(konvertuj('x', () => { throw new Error('x'); })).toBeNull();
  });

  it('LaTeX od 5000 znakova daje markup', () => {
    const latex = 'x+'.repeat(2499) + 'xx';
    expect(latex.length).toBe(5000);
    expect(latexUMarkup(latex)).not.toBeNull();
  });

  it('klasa aplikacije ne prolazi ni kad se sloj (a) zaobiđe (konvertuj bez provere komandi)', () => {
    for (const latex of ['\\class{uz-pub}{X}', '\\htmlClass{uz-pub uz-pub-veza}{X}', '\\ce{^^5cclass{uz-pub}{X}}', '\\ce{^^5chtmlClass{uz-pub}{X}}']) {
      const f = konvertuj(latex);
      expect(f, latex).not.toBeNull();
      const tokeni = [...f!.querySelectorAll('[class]')].flatMap(el => el.getAttribute('class')!.split(/\s+/));
      expect(tokeni.filter(t => !t.startsWith('ML__')), latex).toEqual([]);
      expect(f!.textContent, latex).toContain('X');
    }
  });

  it('\\mathtip: oblačić (position:fixed u CSS-u MathLive-a) se ne crta, ostaje osnova', () => {
    const f = latexUMarkup('\\mathtip{a}{b}')!;
    expect(f.querySelector('.ML__tooltip-content')).toBeNull();
    expect(f.textContent).toBe('a');
  });

  it('očišćen markup napadnih ulaza nema href, id, data-*, on* ni spoljni url (konvertuj bez provere komandi)', () => {
    for (const latex of [
      '\\href{http://e.com}{x}', '\\htmlStyle{background:url(http://e)}{x}', '\\cssId{q}{x}', '\\htmlData{onclick=alert(1)}{x}',
      '\\style{position:fixed}{x}', '\\htmlId{q}{x}', '\\htmlStyle{background:image-set("http://e/a.png" 1x)}{x}',
    ]) {
      const f = konvertuj(latex);
      expect(f, latex).not.toBeNull();
      for (const el of f!.querySelectorAll('*')) {
        for (const a of el.attributes) {
          expect(a.name, latex).not.toMatch(/^(?:href|id|on.*|data-.*)$/);
          expect(a.value, latex).not.toMatch(/url\(|image-set|fixed/i);
        }
      }
      expect(f!.querySelector('a'), latex).toBeNull();
    }
  });
});

describe('ocistiStil', () => {
  it.each([
    ['height:0.87em;top:-3.41em', 'height:0.87em;top:-3.41em'],
    ['left:calc(-1 * 1px - 0.3em)', 'left:calc(-1 * 1px - 0.3em)'],
    ['background:url(http://e)', ''],
    ['background-image:image-set("a.png" 1x)', ''],
    ['background-color:-webkit-image-set(url(a) 1x)', ''],
    ['position:fixed', ''],
    ['position:absolute', 'position:absolute'],
    ['width:var(--x)', ''],
    ['color:#d7170b', 'color:#d7170b'],
    ['color:red', ''],
    ['z-index:999', ''],
    ['border-radius:50%', 'border-radius:50%'],
    ['border-radius:8px', 'border-radius:8px'],
    ['border:solid currentColor', 'border:solid currentColor'],
    ['border-radius:url(a)', ''],
    ['height:1em;position:fixed;color:#000', 'height:1em;color:#000'],
    // Fix 1: ivice pojedinačnih strana (array{c|c}, \enclose{top} ...) i imenovana boja ivice (\enclose{circle}[2px dashed red])
    ['border-right:0.04em solid currentColor', 'border-right:0.04em solid currentColor'],
    ['border-top:solid currentColor', 'border-top:solid currentColor'],
    ['border-bottom:solid currentColor;border-left:solid currentColor', 'border-bottom:solid currentColor;border-left:solid currentColor'],
    ['border:2px dashed red', 'border:2px dashed red'],
    ['border:3px solid blue', 'border:3px solid blue'],
    ['border:1px solid url(a)', ''],
    ['border-top:1px solid var(--x)', ''],
    ['border:1px solid rgb(1,2,3)', ''],
    // CSS komentar unutar calc( bi "pojeo" sledeće deklaracije
    ['left:calc(-1 * 1px /* x */ - 0.3em)', ''],
    ['width:calc(1em /*);color:#f00', 'color:#f00'], // deklaracija sa komentarom ispada, ostale se sastavljaju iznova
    ['height:calc( 1.03056em + 1px)', 'height:calc( 1.03056em + 1px)'],
  ])('%s -> %s', (ulaz, izlaz) => {
    expect(ocistiStil(ulaz)).toBe(izlaz);
  });
});

describe('ocistiMarkup', () => {
  const html = (f: DocumentFragment) => {
    const div = document.createElement('div');
    div.append(f);
    return div.innerHTML;
  };

  it('svaki token klase po dozvoljenoj listi: klase aplikacije i neizmerene ML__ klase ispadaju', () => {
    expect(html(ocistiMarkup('<span class="ML__base uz-pub cdk-overlay-container">a</span>'))).toBe('<span class="ML__base">a</span>');
    expect(html(ocistiMarkup('<span class="uz-pub">a</span>'))).toBe('<span>a</span>');
    expect(html(ocistiMarkup('<span class="ML__keyboard ML__tooltip-content2">a</span>'))).toBe('<span>a</span>');
    const izmerene = 'col-align-c col-align-m delim-size1 delim-size4 slice-1-of-1 slice-2-of-3 overline overline-line underline ' +
      'underline-line lcGreek style-wrap ML__delim-size3 ML__vlist-t2 ML__series_ub';
    expect(html(ocistiMarkup(`<span class="${izmerene}">a</span>`))).toBe(`<span class="${izmerene}">a</span>`);
  });

  it('vrednosti SVG atributa po formi: bez url(, javascript: i neizmerenih oblika', () => {
    const f = ocistiMarkup(
      '<svg fill="url(https://e/x.svg#a)" stroke="javascript:x" width="expression(x)" height="0.3em" viewBox="0 0 1.17 1.03" ' +
      'preserveAspectRatio="xMinYMin slice" stroke-width="0.06em" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M0 241v40h399891c-47.3 35.3-84 78-110 128z" fill="currentcolor"></path><path d="url(#x)" fill="#ff0000"></path>' +
      '<line x1="0" y1="1" x2="1" y2="0" vector-effect="non-scaling-stroke" stroke="none"></line>' +
      '<polygon points="0.87,0.3 0.83,0.30945298463965276" stroke="none" fill="currentColor"></polygon><polygon points="javascript:1"></polygon></svg>',
    );
    const svg = f.querySelector('svg')!;
    expect(svg.hasAttribute('fill')).toBe(false);
    expect(svg.hasAttribute('stroke')).toBe(false);
    expect(svg.hasAttribute('width')).toBe(false);
    expect(svg.getAttribute('height')).toBe('0.3em');
    expect(svg.getAttribute('viewBox')).toBe('0 0 1.17 1.03');
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMinYMin slice');
    expect(svg.getAttribute('stroke-width')).toBe('0.06em');
    expect(svg.getAttribute('stroke-linecap')).toBe('round');
    const [p1, p2] = [...f.querySelectorAll('path')];
    expect(p1.getAttribute('d')).toBe('M0 241v40h399891c-47.3 35.3-84 78-110 128z');
    expect(p1.getAttribute('fill')).toBe('currentcolor');
    expect(p2.hasAttribute('d')).toBe(false);
    expect(p2.getAttribute('fill')).toBe('#ff0000');
    expect(f.querySelector('line')!.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    const [g1, g2] = [...f.querySelectorAll('polygon')];
    expect(g1.getAttribute('points')).toBe('0.87,0.3 0.83,0.30945298463965276');
    expect(g1.getAttribute('fill')).toBe('currentColor');
    expect(g2.hasAttribute('points')).toBe(false);
  });

  it('element sa klasom ML__tooltip-content se briše zajedno sa sadržajem', () => {
    expect(html(ocistiMarkup('<span class="ML__tooltip-container"><span class="ML__tooltip-content">b</span>a</span>')))
      .toBe('<span class="ML__tooltip-container">a</span>');
  });

  it('koordinata linije koja nije broj se briše, ostale ostaju', () => {
    const f = ocistiMarkup('<svg><line x1="0.35" y1="javascript:x" x2="1e-3" y2="2"></line></svg>');
    const l = f.querySelector('line')!;
    expect(l.getAttribute('x1')).toBe('0.35');
    expect(l.hasAttribute('y1')).toBe(false);
    expect(l.getAttribute('x2')).toBe('1e-3');
    expect(l.getAttribute('y2')).toBe('2');
  });

  it('on*, id, script, img i <a> (sadržaj ostaje), stil van liste', () => {
    const f = ocistiMarkup(
      '<span onclick="x" id="a" style="color:#f00;position:fixed"><script>x</script><img src=x onerror=y><a href="javascript:z">t</a></span>',
    );
    const div = document.createElement('div');
    div.append(f);
    expect(div.innerHTML).toBe('<span style="color:#f00">t</span>');
  });

  it('klasa sa navodnicima ili znakovima van liste se briše; style, foreignObject i use nestaju sa sadržajem', () => {
    const f = ocistiMarkup(
      '<span class="ML__x a&quot;b">a</span><style>*{}</style><svg><foreignObject><span>z</span></foreignObject><use href="#x"></use></svg>',
    );
    const div = document.createElement('div');
    div.append(f);
    expect(div.innerHTML).toBe('<span>a</span><svg></svg>');
  });
});
