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
  ])('%s -> %s', (ulaz, izlaz) => {
    expect(ocistiStil(ulaz)).toBe(izlaz);
  });
});

describe('ocistiMarkup', () => {
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
