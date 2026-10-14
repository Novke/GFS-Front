// spec sme statički da uveze `ui/formula-markup` (nije deo chunk-a): dijalog koristi isti spisak kao prikaz
import type { FormulaSloj } from '../../data-access/platno.models';
import { ZABRANJENE_KOMANDE } from '../../ui/formula-markup';
import { KOMANDE_ZABRANJENE, PORODICE_ZABRANJENE } from '../../ui/formula-komande';
import {
  MAX_LATEX, PORUKA_ZABRANJENA, ZABRANJENE_KOMANDE_FORMULE, greskaFormule, primeniFormulu, type FormulaUnos,
} from './formula-pravila';

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
