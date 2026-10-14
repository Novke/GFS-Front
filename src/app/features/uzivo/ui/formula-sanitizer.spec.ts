import { convertLatexToMarkup } from 'mathlive/ssr';
import { markupNepromenjen, ocistiMarkup } from './formula-sanitizer';

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
