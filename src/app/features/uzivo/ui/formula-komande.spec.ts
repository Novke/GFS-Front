import {
  MAX_DUBINA_FORMULE, MAX_KORENA_FORMULE, MAX_RASTEGLJIVIH_FORMULE, MAX_REDOVA_FORMULE, MAX_STRUKTURE_FORMULE,
  preTeskaFormula, trosakFormule,
} from './formula-komande';

describe('trosakFormule (F15 fix 3 i 4: strukturni trošak pre MathLive-a)', () => {
  const r = (s: string, n: number) => s.repeat(n);

  it.each([
    ['x+1', 0],
    ['{a}', 1],
    ['\\{a\\}', 0], // zagrade kao znak
    ['\\\\{x}', 1], // \\ (novi red) pa zagrada
    ['\\bgroup a\\egroup', 1], // kao { }
    ['\\frac{a}{b}', 1], // argument u zagradama ne dodaje nivo preko svoje komande
    ['\\frac ab', 1],
    ['\\left(\\frac{a}{b}\\right)', 2],
    ['\\begin{pmatrix}1&2\\end{pmatrix}', 1],
    ['\\sqrt{\\left(\\begin{pmatrix}x\\end{pmatrix}\\right)}', 3],
    ['x^{x^{x}}', 2],
    ['x^2+y^2', 1],
    ['\\sqrt\\sqrt\\sqrt x', 3], // bez zagrada
    ['\\sqrt\\bgroup\\sqrt\\bgroup x\\egroup\\egroup', 2],
    ['\\frac1\\frac1\\frac1x', 3],
    ['\\xrightarrow[\\xrightarrow[x]{}]{}', 2], // kroz opcioni argument
    ['\\sqrt[3]{x}', 1],
    ['\\overbrace{a+b}^{n}', 1],
    ['}}}{', 1], // višak zatvorenih se zanemaruje
    ['\\leftarrow{x}', 1], // \leftarrow nije \left
  ])('dubina %s -> %i', (latex, dubina) => {
    expect(trosakFormule(latex).dubina).toBe(dubina);
  });

  it('broji korene, rastegljive (koren, \\left, matrica sa zagradama), strukturne komande i redove', () => {
    expect(trosakFormule('\\sqrt{x}+\\sqrt y')).toMatchObject({ koreni: 2, rastegljive: 1, struktura: 2 });
    expect(trosakFormule('\\left(\\sqrt{\\begin{pmatrix}1\\\\2\\end{pmatrix}}\\right)')).toMatchObject({ rastegljive: 3, redovi: 1 });
    expect(trosakFormule('\\begin{matrix}\\begin{matrix}x\\end{matrix}\\end{matrix}').rastegljive).toBe(0);
    expect(trosakFormule('x^2_1+\\hat a+\\^{e}+{a\\over b}').struktura).toBe(5);
    expect(trosakFormule('a\\cr b\\\\c').redovi).toBe(2);
    // strelice sa natpisom po pravilu imena (\\xi nije strelica)
    expect(trosakFormule('\\xmapsto[a]{b}+\\xLeftrightharpoons{c}+\\longrightarrow{d}').struktura).toBe(3);
    expect(trosakFormule('\\xi+\\Xi+\\Longrightarrow').struktura).toBe(0);
  });

  it('granice: dubina 32, rastegljive 16, koreni 32, struktura 200, redovi 100', () => {
    expect([MAX_DUBINA_FORMULE, MAX_RASTEGLJIVIH_FORMULE, MAX_KORENA_FORMULE, MAX_STRUKTURE_FORMULE, MAX_REDOVA_FORMULE])
      .toEqual([32, 16, 32, 200, 100]);
    expect(preTeskaFormula(r('x^{', 32) + 'x' + r('}', 32))).toBe(false);
    expect(preTeskaFormula(r('x^{', 33) + 'x' + r('}', 33))).toBe(true);
    expect(preTeskaFormula(r('\\sqrt ', 16) + 'x')).toBe(false);
    expect(preTeskaFormula(r('\\sqrt ', 17) + 'x')).toBe(true);
    expect(preTeskaFormula(r('\\sqrt{x}', 32))).toBe(false);
    expect(preTeskaFormula(r('\\sqrt{x}', 33))).toBe(true);
    expect(preTeskaFormula(r('x^2', 200))).toBe(false);
    expect(preTeskaFormula(r('x^2', 201))).toBe(true);
    expect(preTeskaFormula('\\begin{matrix}' + r('1\\\\', 100) + '\\end{matrix}')).toBe(false);
    expect(preTeskaFormula('\\begin{matrix}' + r('1\\\\', 101) + '\\end{matrix}')).toBe(true);
  });

  it('zaobilaznice iz re-recenzije 3: koreni bez zagrada, \\bgroup, lanci \\frac1', () => {
    expect(preTeskaFormula(r('\\sqrt ', 800) + 'x')).toBe(true);
    expect(preTeskaFormula(r('\\sqrt\\bgroup ', 300) + 'x' + r('\\egroup ', 300))).toBe(true);
    expect(preTeskaFormula(r('\\frac1', 700) + 'x')).toBe(true);
    expect(preTeskaFormula(r('\\xrightarrow[', 200) + 'x' + r(']{}', 200))).toBe(true);
  });

  it('linearno: 5000 znakova najgoreg oblika ispod 50 ms', () => {
    for (const l of ['{'.repeat(5000), '\\'.repeat(5000), r('\\left', 1000), r('\\begin{', 700), r('\\sqrt', 1250), r('^', 5000),
      r('\\frac[', 830), r('\\xrightarrow[', 400), '\\x' + r('a', 4990), '\\long' + r('arrow', 990)]) {
      const t = performance.now();
      trosakFormule(l);
      expect(performance.now() - t).toBeLessThan(50);
    }
  });
});
