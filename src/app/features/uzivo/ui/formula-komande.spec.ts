import { MAX_DUBINA_FORMULE, dubinaFormule, preDubokaFormula } from './formula-komande';

describe('dubinaFormule (F15 fix 3: rana provera ugnježdavanja pre MathLive-a)', () => {
  it.each([
    ['x+1', 0],
    ['{a}', 1],
    ['\\{a\\}', 0], // zagrade kao znak
    ['\\\\{x}', 1], // \\ (novi red) pa zagrada
    ['\\frac{a}{b}', 1],
    ['\\left(\\frac{a}{b}\\right)', 2],
    ['\\begin{pmatrix}1&2\\end{pmatrix}', 2], // okruženje + {pmatrix} unutar njega
    ['\\sqrt{\\left(\\begin{pmatrix}x\\end{pmatrix}\\right)}', 4],
    ['x^{x^{x}}', 2],
    ['}}}{', 1], // višak zatvorenih ne ide ispod nule
    ['\\left.\\right|', 1],
    ['\\leftarrow{x}', 1], // \leftarrow nije \left
  ])('%s -> %i', (latex, dubina) => {
    expect(dubinaFormule(latex)).toBe(dubina);
  });

  it('granica je 32; \\sqrt{ x700 (recenzija: 36 MB markup-a) je preduboka, i bez zatvaranja', () => {
    expect(MAX_DUBINA_FORMULE).toBe(32);
    expect(preDubokaFormula('\\sqrt{'.repeat(32) + 'x' + '}'.repeat(32))).toBe(false);
    expect(preDubokaFormula('\\sqrt{'.repeat(33) + 'x' + '}'.repeat(33))).toBe(true);
    expect(preDubokaFormula('\\sqrt{'.repeat(700) + 'x' + '}'.repeat(700))).toBe(true);
    expect(preDubokaFormula('\\left('.repeat(40) + 'x')).toBe(true);
    expect(preDubokaFormula('\\begin{matrix}'.repeat(31) + 'x')).toBe(false); // {matrix} je još jedan nivo dok traje
    expect(preDubokaFormula('\\begin{matrix}'.repeat(32) + 'x')).toBe(true);
  });

  it('linearno: 5000 znakova najgoreg oblika ispod 50 ms', () => {
    for (const l of ['{'.repeat(5000), '\\'.repeat(5000), '\\left'.repeat(1000), '\\begin{'.repeat(700)]) {
      const t = performance.now();
      dubinaFormule(l);
      expect(performance.now() - t).toBeLessThan(50);
    }
  });
});
