// spec sme statički da uveze `ui/formula-markup` (nije deo chunk-a): dijalog koristi isti spisak kao prikaz
import type { FormulaSloj } from '../../data-access/platno.models';
import { ZABRANJENE_KOMANDE } from '../../ui/formula-markup';
import { KOMANDE_ZABRANJENE, PORODICE_ZABRANJENE } from '../../ui/formula-komande';
import { GRANICA_ODBIJENE_MS } from '../../ui/formula-vreme.testing';
import { primeniFormulu, type FormulaUnos } from './formula-pravila';
import { MAX_LATEX, PORUKA_PRETESKA, PORUKA_ZABRANJENA, ZABRANJENE_KOMANDE_FORMULE, greskaFormule } from './provera-formule';

const ZABRANJENA = 'Formula koristi komandu koja nije dozvoljena (\\href, \\url, \\style, \\class, \\cssId, \\csname, \\html…) ' +
  'ili zapis ^^.';
const NEISPRAVNA = 'Formula ima grešku u LaTeX-u.';
const bezGresaka = () => [] as const;

function formula(deo: Partial<FormulaSloj> = {}): FormulaSloj {
  return {
    id: 's1', naziv: null, x: 10, y: 10, sirina: 320, visina: 80, rotacija: 0, providnost: 1, zakljucan: false, senka: null,
    tip: 'FORMULA', latex: 'x^2', boja: '#000000', velicina: 28, poravnanje: 'CENTAR', slikaIzvora: null, ...deo,
  };
}

describe('greskaFormule', () => {
  it('prazna formula i samo razmaci', () => {
    expect(greskaFormule('', bezGresaka)).toBe('Formula je prazna.');
    expect(greskaFormule('   ', bezGresaka)).toBe('Formula je prazna.');
  });

  it('5000 znakova prolazi, 5001 ne (par surogata se broji kao jedan znak, kao na serveru)', () => {
    expect(MAX_LATEX).toBe(5000);
    const sa = 'x'.repeat(4999) + '𝑥';
    expect(sa.length).toBe(5001); // UTF-16 jedinice
    expect([...sa].length).toBe(5000);
    expect(greskaFormule(sa, bezGresaka)).toBeNull();
    expect(greskaFormule(sa + 'x', bezGresaka)).toBe('Formula može imati najviše 5000 znakova.');
  });

  it('lažna provera sa jednom greškom -> poruka o grešci u LaTeX-u', () => {
    expect(greskaFormule('\\frac{a}', () => [{}])).toBe(NEISPRAVNA);
  });

  it('provera koja baca izuzetak -> poruka o grešci, bez izuzetka', () => {
    expect(greskaFormule('x', () => {
      throw new Error('MathLive');
    })).toBe(NEISPRAVNA);
  });

  it.each([
    '\\href{http://e}{x}', '\\htmlStyle{color:red}{x}', '\\url{x}', '\\cssId{a}{x}', '\\class{a}{x}', '\\htmlData{a=b}{x}',
    '\\style{position:fixed}{x}', '\\htmlId{q}{x}', '\\csname htmlStyle\\endcsname{x}{y}',
    // F15 fix 1: \htmlClass i porodica \html…, ^^ (\ce i \pu reparsiraju argument: ^^5c = \)
    '\\htmlClass{uz-pub}{x}', '\\htmlFoo{x}', '\\ce{^^5chtmlClass{uz-pub}{X}}', '\\ce{^^5chtmlStyle{color:#123456}{X}}',
    '\\ce{^^5ccssId{q}{X}}', '\\ce{^^5chref{http://e}{X}}', '\\pu{^^5cclass{q}{x}}', 'x^^2',
  ])('zabranjena komanda %s -> poruka, a provera se ni ne zove', (latex) => {
    const provera = vi.fn(bezGresaka);
    expect(greskaFormule(latex, provera)).toBe(ZABRANJENA);
    expect(provera).not.toHaveBeenCalled();
  });

  it('\\hrefx nije komanda \\href: ide do provere', () => {
    const provera = vi.fn(bezGresaka);
    expect(greskaFormule('\\hrefx', provera)).toBeNull();
    expect(provera).toHaveBeenCalledWith('\\hrefx');
  });

  it('ispravna formula -> null', () => {
    expect(greskaFormule('\\frac{a}{b} + \\sqrt{x^2}', bezGresaka)).toBeNull();
  });

  it('poruka se gradi iz istog spiska kao regex (svaka komanda i porodica je i u poruci i odbijena)', () => {
    for (const k of KOMANDE_ZABRANJENE) {
      expect(PORUKA_ZABRANJENA).toContain(`\\${k}`);
      expect(greskaFormule(`\\${k}{a}{b}`, bezGresaka), k).toBe(ZABRANJENA);
    }
    for (const p of PORODICE_ZABRANJENE) {
      expect(PORUKA_ZABRANJENA).toContain(`\\${p}…`);
      expect(greskaFormule(`\\${p}Nesto{a}{b}`, bezGresaka), p).toBe(ZABRANJENA);
    }
  });

  it('regex je bez zastavice g (stalno isti rezultat; .test ne pamti lastIndex)', () => {
    expect(ZABRANJENE_KOMANDE.flags).toBe('');
    for (let i = 0; i < 3; i++) expect(ZABRANJENE_KOMANDE.test('\\htmlClass{a}{b}')).toBe(true);
  });

  it('isti spisak kao ZABRANJENE_KOMANDE prikaza (ui/formula-markup): isti objekat, ne kopija', () => {
    expect(ZABRANJENE_KOMANDE_FORMULE).toBe(ZABRANJENE_KOMANDE);
  });
});

describe('primeniFormulu', () => {
  const unos: FormulaUnos = { latex: '\\frac{a}{b}', boja: '#FF0000', velicina: 32, poravnanje: 'LEVO' };

  it('upisuje LaTeX, boju, veličinu i poravnanje i briše sliku izvora (spec 11)', () => {
    const s = formula({ slikaIzvora: '00000000-0000-0000-0000-0000000000aa' });
    const r = primeniFormulu(s, unos);
    expect(r).toEqual({ ...s, ...unos, slikaIzvora: null });
    expect(s.slikaIzvora).not.toBeNull(); // ulaz netaknut
  });

  it('isti unos bez slike izvora vraća isti objekat (nema praznog koraka)', () => {
    const s = formula();
    expect(primeniFormulu(s, { latex: s.latex, boja: s.boja, velicina: s.velicina, poravnanje: s.poravnanje })).toBe(s);
  });

  it('isti unos, ali sa slikom izvora: nov objekat bez slike', () => {
    const s = formula({ slikaIzvora: '00000000-0000-0000-0000-0000000000aa' });
    const r = primeniFormulu(s, { latex: s.latex, boja: s.boja, velicina: s.velicina, poravnanje: s.poravnanje });
    expect(r).not.toBe(s);
    expect(r.slikaIzvora).toBeNull();
  });
});

describe('ZABRANJENE_KOMANDE i greskaFormule: bez katastrofalnog vraćanja (F15 fix 2)', () => {
  const traje = (f: () => unknown) => {
    const t = performance.now();
    f();
    return performance.now() - t;
  };
  it.each([
    ['\\html + mnogo slova', '\\html' + 'a'.repeat(5000)],
    ['mnogo kosih crta', '\\'.repeat(5000)],
    ['mnogo kapica', '^'.repeat(5000)],
    ['kose crte i slova naizmenično', '\\htmla'.repeat(800)],
    ['skoro komanda bez kraja', '\\cssI'.repeat(1000)],
  ])('%s: ispod granice', (_ime, latex) => {
    expect(traje(() => {
      ZABRANJENE_KOMANDE_FORMULE.test(latex);
      greskaFormule(latex, () => []);
    })).toBeLessThan(GRANICA_ODBIJENE_MS);
  });
});

describe('greskaFormule: preteška formula (F15 fix 3 i 4)', () => {
  it.each([
    ['\\sqrt{ x700', '\\sqrt{'.repeat(700) + 'x' + '}'.repeat(700)],
    ['\\sqrt bez zagrada x800', '\\sqrt '.repeat(800) + 'x'],
    ['\\frac1 lanac x700', '\\frac1'.repeat(700) + 'x'],
  ])('%s -> poruka o složenosti, a provera MathLive-a se ni ne zove', (_ime, latex) => {
    const provera = vi.fn(() => [] as const);
    expect(greskaFormule(latex, provera)).toBe(PORUKA_PRETESKA);
    expect(provera).not.toHaveBeenCalled();
  });

  it('poruka nabraja granice iz istog izvora kao provera; formula na granici prolazi', () => {
    for (const n of ['32', '16', '200', '100 redova', '100 kolona', '2000']) expect(PORUKA_PRETESKA).toContain(n);
    expect(greskaFormule('\\sqrt{'.repeat(16) + 'x' + '}'.repeat(16), () => [])).toBeNull();
  });
});
