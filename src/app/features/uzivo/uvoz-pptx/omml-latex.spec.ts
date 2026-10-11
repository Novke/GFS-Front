import { latexOkvira, ommlULatex } from './omml-latex';
import { NS } from './xml';

/** Omota isečak OMML-a u `m:oMath` i vraća koren. */
function oMath(isecak: string): Element {
  return new DOMParser().parseFromString(`<m:oMath xmlns:m="${NS.m}">${isecak}</m:oMath>`, 'application/xml').documentElement;
}
const r = (t: string) => `<m:r><m:t>${t}</m:t></m:r>`;
const e = (t: string) => `<m:e>${r(t)}</m:e>`;

describe('ommlULatex: tabela iz brief-a', () => {
  it.each([
    ['tekst', r('x+1'), 'x+1'],
    ['razlomak', `<m:f><m:num>${r('a')}</m:num><m:den>${r('b')}</m:den></m:f>`, '\\frac{a}{b}'],
    ['linijski razlomak', `<m:f><m:fPr><m:type m:val="lin"/></m:fPr><m:num>${r('a')}</m:num><m:den>${r('b')}</m:den></m:f>`, 'a/b'],
    ['sSub', `<m:sSub>${e('x')}<m:sub>${r('1')}</m:sub></m:sSub>`, 'x_{1}'],
    ['sSub sa osnovom od dva znaka', `<m:sSub>${e('xy')}<m:sub>${r('1')}</m:sub></m:sSub>`, '{xy}_{1}'],
    ['sSup', `<m:sSup>${e('2')}<m:sup>${r('3')}</m:sup></m:sSup>`, '2^{3}'],
    ['sSubSup', `<m:sSubSup>${e('x')}<m:sub>${r('i')}</m:sub><m:sup>${r('2')}</m:sup></m:sSubSup>`, 'x_{i}^{2}'],
    ['sPre', `<m:sPre><m:sub>${r('a')}</m:sub><m:sup>${r('b')}</m:sup>${e('X')}</m:sPre>`, '{}_{a}^{b}X'],
    ['koren bez stepena', `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>${e('x')}</m:rad>`, '\\sqrt{x}'],
    ['koren sa stepenom', `<m:rad><m:deg>${r('3')}</m:deg>${e('x')}</m:rad>`, '\\sqrt[3]{x}'],
    ['suma', `<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${r('i=1')}</m:sub><m:sup>${r('n')}</m:sup>${e('i')}</m:nary>`,
      '\\sum_{i=1}^{n}{i}'],
    ['integral bez granica', '<m:nary><m:naryPr><m:subHide m:val="1"/><m:supHide m:val="1"/></m:naryPr><m:sub/><m:sup/>'
      + `${e('f')}</m:nary>`, '\\int{f}'],
    ['zagrade', `<m:d>${e('a+b')}</m:d>`, '\\left(a+b\\right)'],
    ['uglaste zagrade', `<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr>${e('a')}</m:d>`, '\\left[a\\right]'],
    ['zagrade sa dva člana', `<m:d>${e('a')}${e('b')}</m:d>`, '\\left(a|b\\right)'],
    ['vitičasta bez zatvorene', `<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr>${e('a')}</m:d>`, '\\left\\{a\\right.'],
    ['matrica', `<m:m><m:mr>${e('a')}${e('b')}</m:mr><m:mr>${e('c')}${e('d')}</m:mr></m:m>`, '\\begin{matrix}a&b\\\\c&d\\end{matrix}'],
    ['niz jednačina', `<m:eqArr>${e('a')}${e('b')}</m:eqArr>`, '\\begin{aligned}a\\\\b\\end{aligned}'],
    ['akcenat podrazumevan', `<m:acc>${e('x')}</m:acc>`, '\\hat{x}'],
    ['akcenat vektor', `<m:acc><m:accPr><m:chr m:val="\u20D7"/></m:accPr>${e('x')}</m:acc>`, '\\vec{x}'],
    ['crta gore', `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr>${e('x')}</m:bar>`, '\\overline{x}'],
    ['funkcija', `<m:func><m:fName>${r('sin')}</m:fName>${e('x')}</m:func>`, '\\sin{x}'],
    ['limes', `<m:func><m:fName><m:limLow>${e('lim')}<m:lim>${r('n→∞')}</m:lim></m:limLow></m:fName>`
      + `<m:e><m:sSub>${e('a')}<m:sub>${r('n')}</m:sub></m:sSub></m:e></m:func>`, '\\lim_{n→∞}{a_{n}}'],
    ['limLow', `<m:limLow>${e('x')}<m:lim>${r('y')}</m:lim></m:limLow>`, '\\underset{y}{x}'],
    ['groupChr', `<m:groupChr>${e('x')}</m:groupChr>`, '\\underbrace{x}'],
    ['borderBox', `<m:borderBox>${e('x')}</m:borderBox>`, '\\boxed{x}'],
    ['procenat', r('50%'), '50\\%'],
    ['podvlaka', r('a_b'), 'a\\_b'],
    ['vitičaste u tekstu', r('{x}'), '\\{x\\}'],
    ['običan tekst', `<m:r><m:rPr><m:nor/></m:rPr><m:t>ako je</m:t></m:r>`, '\\text{ako je}'],
  ])('%s', (_ime, isecak, ocekivano) => {
    expect(ommlULatex(oMath(isecak))).toEqual({ latex: ocekivano, zaProveru: false });
  });

  it('oMathPara sa dva oMath -> gathered', () => {
    const el = new DOMParser().parseFromString(
      `<m:oMathPara xmlns:m="${NS.m}"><m:oMathParaPr/><m:oMath>${r('a')}</m:oMath><m:oMath>${r('b')}</m:oMath></m:oMathPara>`,
      'application/xml').documentElement;
    expect(ommlULatex(el)).toEqual({ latex: '\\begin{gathered}a\\\\b\\end{gathered}', zaProveru: false });
  });

  it('nepoznat m:* -> sadržaj dece za proveru', () => {
    expect(ommlULatex(oMath(`<m:foo>${r('z')}</m:foo>`))).toEqual({ latex: 'z', zaProveru: true });
  });
});

describe('ommlULatex: izbegavanje i razmaci', () => {
  it.each([
    ['razmak', r('a b'), 'a\\ b'],
    ['tilda pred slovom dobija razmak', r('~x'), '\\sim x'],
    ['tilda pred zagradom bez razmaka', r('~('), '\\sim('],
    ['obrnuta kosa crta', r('a\\b'), 'a\\backslash b'],
    ['ostali specijalni znaci', r('#$&amp;'), '\\#\\$\\&'],
    ['unikod ostaje', r('α≤β'), 'α≤β'],
    ['nevidljivi operatori se brišu', r('f\u2061x\u2062y'), 'fxy'],
    ['debelo', `<m:r><m:rPr><m:sty m:val="b"/></m:rPr><m:t>v</m:t></m:r>`, '\\mathbf{v}'],
    ['debelo koso', `<m:r><m:rPr><m:sty m:val="bi"/></m:rPr><m:t>v</m:t></m:r>`, '\\boldsymbol{v}'],
    ['uspravno', `<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>d</m:t></m:r>`, '\\mathrm{d}'],
    ['koso je podrazumevano', `<m:r><m:rPr><m:sty m:val="i"/></m:rPr><m:t>d</m:t></m:r>`, 'd'],
    ['double-struck', `<m:r><m:rPr><m:scr m:val="double-struck"/><m:sty m:val="p"/></m:rPr><m:t>R</m:t></m:r>`, '\\mathbb{R}'],
    ['fraktur', `<m:r><m:rPr><m:scr m:val="fraktur"/></m:rPr><m:t>g</m:t></m:r>`, '\\mathfrak{g}'],
    ['script', `<m:r><m:rPr><m:scr m:val="script"/></m:rPr><m:t>L</m:t></m:r>`, '\\mathcal{L}'],
    ['tekst izbegavanje', `<m:r><m:rPr><m:nor/></m:rPr><m:t>\\{a_b}^~ 5%</m:t></m:r>`,
      '\\text{\\textbackslash{}\\{a\\_b\\}\\textasciicircum{}\\textasciitilde{} 5\\%}'],
    ['nor sa val="0" je matematika', `<m:r><m:rPr><m:nor m:val="0"/></m:rPr><m:t>ab</m:t></m:r>`, 'ab'],
    ['spojeni delovi', r('x') + r('+1'), 'x+1'],
    ['komanda pa slovo iz drugog dela', r('~') + r('y'), '\\sim y'],
    ['osnova sa jednim unikod znakom', `<m:sSup>${e('𝑥')}<m:sup>${r('2')}</m:sup></m:sSup>`, '𝑥^{2}'],
    ['ugnježden stepen ide u zagrade', `<m:sSup><m:e><m:sSup>${e('x')}<m:sup>${r('2')}</m:sup></m:sSup></m:e><m:sup>${r('3')}</m:sup></m:sSup>`,
      '{x^{2}}^{3}'],
    ['ctrlPr i *Pr se preskaču', `<m:sSup><m:sSupPr><m:ctrlPr><m:r><m:t>q</m:t></m:r></m:ctrlPr></m:sSupPr>${e('x')}<m:sup>${r('2')}</m:sup></m:sSup>`,
      'x^{2}'],
  ])('%s', (_ime, isecak, ocekivano) => {
    expect(ommlULatex(oMath(isecak))).toEqual({ latex: ocekivano, zaProveru: false });
  });

  it('^ u matematičkom tekstu -> \\hat{} za proveru', () => {
    expect(ommlULatex(oMath(r('a^b')))).toEqual({ latex: 'a\\hat{}b', zaProveru: true });
  });
});

describe('ommlULatex: ostala pravila', () => {
  it.each([
    ['skw razlomak', `<m:f><m:fPr><m:type m:val="skw"/></m:fPr><m:num>${r('a')}</m:num><m:den>${r('b')}</m:den></m:f>`, '\\frac{a}{b}'],
    ['razlomak bez crte', `<m:f><m:fPr><m:type m:val="noBar"/></m:fPr><m:num>${r('a')}</m:num><m:den>${r('b')}</m:den></m:f>`,
      '\\genfrac{}{}{0pt}{}{a}{b}'],
    ['degHide bez val je uključen', `<m:rad><m:radPr><m:degHide/></m:radPr><m:deg>${r('3')}</m:deg>${e('x')}</m:rad>`, '\\sqrt{x}'],
    ['degHide val="0" prikazuje stepen', `<m:rad><m:radPr><m:degHide m:val="0"/></m:radPr><m:deg>${r('3')}</m:deg>${e('x')}</m:rad>`,
      '\\sqrt[3]{x}'],
    ['prazan stepen', `<m:rad><m:deg/>${e('x')}</m:rad>`, '\\sqrt{x}'],
    ['proizvod sa donjom granicom', `<m:nary><m:naryPr><m:chr m:val="∏"/><m:supHide m:val="1"/></m:naryPr><m:sub>${r('k')}</m:sub><m:sup/>${e('a')}</m:nary>`,
      '\\prod_{k}{a}'],
    ['dvostruki integral', `<m:nary><m:naryPr><m:chr m:val="∬"/></m:naryPr><m:sub>${r('D')}</m:sub><m:sup/>${e('f')}</m:nary>`, '\\iint_{D}{f}'],
    ['ugaone zagrade', `<m:d><m:dPr><m:begChr m:val="⟨"/><m:endChr m:val="⟩"/></m:dPr>${e('a')}</m:d>`, '\\left\\langle a\\right\\rangle'],
    ['norma', `<m:d><m:dPr><m:begChr m:val="‖"/><m:endChr m:val="‖"/></m:dPr>${e('v')}</m:d>`, '\\left\\|v\\right\\|'],
    ['pod i plafon', `<m:d><m:dPr><m:begChr m:val="⌊"/><m:endChr m:val="⌉"/></m:dPr>${e('x')}</m:d>`, '\\left\\lfloor x\\right\\rceil'],
    ['separator po izboru', `<m:d><m:dPr><m:sepChr m:val=";"/></m:dPr>${e('a')}${e('b')}${e('c')}</m:d>`, '\\left(a;b;c\\right)'],
    ['akcenti', `<m:acc><m:accPr><m:chr m:val="\u0303"/></m:accPr>${e('x')}</m:acc><m:acc><m:accPr><m:chr m:val="\u0308"/></m:accPr>${e('y')}</m:acc>`,
      '\\tilde{x}\\ddot{y}'],
    ['crta dole je podrazumevana', `<m:bar>${e('x')}</m:bar>`, '\\underline{x}'],
    ['funkcija sa uspravnim imenom', `<m:func><m:fName><m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>log</m:t></m:r></m:fName>${e('x')}</m:func>`,
      '\\log{x}'],
    ['nepoznata funkcija', `<m:func><m:fName>${r('sgn')}</m:fName>${e('x')}</m:func>`, '\\operatorname{sgn}{x}'],
    ['max sa donjom granicom', `<m:func><m:fName><m:limLow>${e('max')}<m:lim>${r('i')}</m:lim></m:limLow></m:fName>${e('a')}</m:func>`,
      '\\max_{i}{a}'],
    ['limUpp', `<m:limUpp>${e('x')}<m:lim>${r('y')}</m:lim></m:limUpp>`, '\\overset{y}{x}'],
    ['groupChr gore', `<m:groupChr><m:groupChrPr><m:pos m:val="top"/></m:groupChrPr>${e('x')}</m:groupChr>`, '\\overbrace{x}'],
    ['groupChr U+23DE', `<m:groupChr><m:groupChrPr><m:chr m:val="⏞"/></m:groupChrPr>${e('x')}</m:groupChr>`, '\\overbrace{x}'],
    ['groupChr drugi znak dole', `<m:groupChr><m:groupChrPr><m:chr m:val="→"/></m:groupChrPr>${e('x')}</m:groupChr>`, '\\underset{→}{x}'],
    ['groupChr drugi znak gore', `<m:groupChr><m:groupChrPr><m:chr m:val="→"/><m:pos m:val="top"/></m:groupChrPr>${e('x')}</m:groupChr>`,
      '\\overset{→}{x}'],
    ['zvezdica posle komande dobija razmak (MathLive)', `<m:d><m:dPr><m:begChr m:val="⌊"/><m:endChr m:val="⌋"/></m:dPr>${e('x')}</m:d>${r('*2')}`,
      '\\left\\lfloor x\\right\\rfloor *2'],
    ['zvezdica posle tilde', r('a~*b'), 'a\\sim *b'],
    ['prazan sepChr nema separatora', `<m:d><m:dPr><m:sepChr m:val=""/></m:dPr>${e('a')}${e('b')}</m:d>`, '\\left(ab\\right)'],
    ['eqArr: prvi & u redu je poravnanje, ostali se izbegavaju', `<m:eqArr>${e('a&amp;=b&amp;c')}<m:e>${r('x')}${r('&amp;=y')}</m:e></m:eqArr>`,
      '\\begin{aligned}a&=b\\&c\\\\x&=y\\end{aligned}'],
    ['eqArr: & ugnežđen u razlomku reda se izbegava', `<m:eqArr><m:e><m:f><m:num>${r('a&amp;b')}</m:num><m:den>${r('c')}</m:den></m:f>${r('&amp;=d')}</m:e></m:eqArr>`,
      '\\begin{aligned}\\frac{a\\&b}{c}&=d\\end{aligned}'],
    ['& van eqArr ostaje izbegnut', r('a&amp;b'), 'a\\&b'],
    ['box je samo sadržaj', `<m:box><m:boxPr/>${e('x')}</m:box>`, 'x'],
    ['prazan oMath', '', ''],
  ])('%s', (_ime, isecak, ocekivano) => {
    expect(ommlULatex(oMath(isecak))).toEqual({ latex: ocekivano, zaProveru: false });
  });

  it.each([
    ['nepoznat n-arni znak', `<m:nary><m:naryPr><m:chr m:val="⨁"/></m:naryPr><m:sub/><m:sup/>${e('x')}</m:nary>`, '\\mathop{⨁}{x}'],
    ['nepoznat akcenat', `<m:acc><m:accPr><m:chr m:val="→"/></m:accPr>${e('x')}</m:acc>`, '\\hat{x}'],
    ['nepoznata zagrada', `<m:d><m:dPr><m:begChr m:val="⟦"/><m:endChr m:val="⟧"/></m:dPr>${e('a')}</m:d>`, '⟦\\left.a\\right.⟧'],
  ])('%s -> za proveru', (_ime, isecak, ocekivano) => {
    expect(ommlULatex(oMath(isecak))).toEqual({ latex: ocekivano, zaProveru: true });
  });

  it('elementi drugih imenskih prostora unutar m:r se preskaču', () => {
    const el = new DOMParser().parseFromString(
      `<m:oMath xmlns:m="${NS.m}" xmlns:a="${NS.a}"><m:r><a:rPr lang="sr-Latn-RS"><a:latin typeface="Cambria Math"/></a:rPr><m:t>x</m:t></m:r></m:oMath>`,
      'application/xml').documentElement;
    expect(ommlULatex(el)).toEqual({ latex: 'x', zaProveru: false });
  });
});

describe('ommlULatex: zlonamerni ulaz', () => {
  it('duboko ugnežđavanje ne obara stek: posle 64 nivoa samo tekst, za proveru', () => {
    // (jsdom parsira duboko ugnežđen XML kvadratno, pa test ostaje na 1000 nivoa; pretvaranje je linearno.)
    const duboko = (n: number, sredina: string) => oMath('<m:d><m:e>'.repeat(n) + sredina + '</m:e></m:d>'.repeat(n));
    const rez = ommlULatex(duboko(1000, r('z')));
    expect(rez.zaProveru).toBe(true);
    expect(rez.latex).toMatch(/^(\\left\(){32}z\\right\)/);
    expect(rez.latex.length).toBeLessThan(1000);
    // Ispod granice dubine ni sam tekst podstabla ne staje u budžet.
    expect(ommlULatex(duboko(100, '<m:r/>'.repeat(10_000)))).toEqual({ latex: '\\text{formula}', zaProveru: true });
  });

  it('ogroman izlaz se seče na \\text{formula}', () => {
    const rez = ommlULatex(oMath(r('x'.repeat(50_000))));
    expect(rez).toEqual({ latex: '\\text{formula}', zaProveru: true });
  });

  it.each([
    ['m:d', `<m:d>${'<m:e/>'.repeat(100_000)}</m:d>`],
    ['m:m', `<m:m>${'<m:mr/>'.repeat(100_000)}</m:m>`],
    ['m:m sa praznim ćelijama', `<m:m><m:mr>${'<m:e/>'.repeat(100_000)}</m:mr></m:m>`],
    ['m:eqArr', `<m:eqArr>${'<m:e/>'.repeat(100_000)}</m:eqArr>`],
  ])('100 000 praznih argumenata u %s troši budžet', (_ime, isecak) => {
    expect(ommlULatex(oMath(isecak))).toEqual({ latex: '\\text{formula}', zaProveru: true });
  });

  it('mnogo praznih elemenata se seče bez kvadratnog vremena', () => {
    const rez = ommlULatex(oMath('<m:r/>'.repeat(100_000)));
    expect(rez).toEqual({ latex: '\\text{formula}', zaProveru: true });
  });
});

describe('latexOkvira', () => {
  const DEKL = `xmlns:a="${NS.a}" xmlns:a14="${NS.a14}" xmlns:m="${NS.m}"`;
  const ar = (t: string) => `<a:r><a:rPr lang="sr-Latn-RS"/><a:t>${t}</a:t></a:r>`;
  const a14 = (isecak: string) => `<a14:m><m:oMathPara><m:oMathParaPr><m:jc m:val="centerGroup"/></m:oMathParaPr><m:oMath>${isecak}</m:oMath></m:oMathPara></a14:m>`;
  const pasusi = (...p: string[]) => {
    const doc = new DOMParser().parseFromString(`<a:txBody ${DEKL}>${p.map((x) => `<a:p><a:pPr/>${x}<a:endParaRPr/></a:p>`).join('')}</a:txBody>`,
      'application/xml');
    return Array.from(doc.documentElement.children);
  };

  it('tekst pa formula u jednom pasusu', () => {
    expect(latexOkvira(pasusi(ar('Neka je ') + a14(r('x'))))).toEqual({ latex: '\\text{Neka je }x', zaProveru: false });
  });

  it('dva pasusa -> gathered', () => {
    expect(latexOkvira(pasusi(a14(r('a')), a14(r('b'))))).toEqual({ latex: '\\begin{gathered}a\\\\b\\end{gathered}', zaProveru: false });
  });

  it('susedni delovi teksta se spajaju, tekst se izbegava kao tekst', () => {
    expect(latexOkvira(pasusi(ar('50') + ar('% i ') + a14(r('y'))))).toEqual({ latex: '\\text{50\\% i }y', zaProveru: false });
  });

  it('prazan pasus se preskače', () => {
    expect(latexOkvira(pasusi(a14(r('a')), '', ar('  '), a14(r('b'))))).toEqual({
      latex: '\\begin{gathered}a\\\\b\\end{gathered}', zaProveru: false,
    });
  });

  it('a:br deli red', () => {
    expect(latexOkvira(pasusi(a14(r('a')) + '<a:br/>' + ar('b')))).toEqual({
      latex: '\\begin{gathered}a\\\\\\text{b}\\end{gathered}', zaProveru: false,
    });
  });

  it('oMathPara sa dva oMath u jednom a14:m daje dva reda', () => {
    const p = `<a14:m><m:oMathPara><m:oMath>${r('a')}</m:oMath><m:oMath>${r('b')}</m:oMath></m:oMathPara></a14:m>`;
    expect(latexOkvira(pasusi(p))).toEqual({ latex: '\\begin{gathered}a\\\\b\\end{gathered}', zaProveru: false });
  });

  it('a14:m sa m:oMath bez oMathPara', () => {
    expect(latexOkvira(pasusi(`<a14:m><m:oMath>${r('x')}</m:oMath></a14:m>`))).toEqual({ latex: 'x', zaProveru: false });
  });

  it('prazno -> \\text{ } za proveru', () => {
    expect(latexOkvira(pasusi(''))).toEqual({ latex: '\\text{ }', zaProveru: true });
    expect(latexOkvira([])).toEqual({ latex: '\\text{ }', zaProveru: true });
  });

  it('duže od 5000 znakova -> \\text{formula} za proveru', () => {
    expect(latexOkvira(pasusi(a14(r('x'.repeat(5001)))))).toEqual({ latex: '\\text{formula}', zaProveru: true });
    expect(latexOkvira(pasusi(a14(r('x'.repeat(5000)))))).toEqual({ latex: 'x'.repeat(5000), zaProveru: false });
  });

  it('za proveru iz formule se prenosi', () => {
    expect(latexOkvira(pasusi(a14(`<m:foo>${r('z')}</m:foo>`)))).toEqual({ latex: 'z', zaProveru: true });
  });
});
