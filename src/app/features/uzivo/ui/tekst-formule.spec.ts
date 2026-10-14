import {
  escapeHtml,
  formulaMarked,
  imaFormulu,
  KLASA_FORMULE,
  nadjiFormulu,
  podeliFormule,
  tekstSaFormulama,
  tekstZaCitac,
} from './tekst-formule';

const T = (tekst: string) => ({ vrsta: 'TEKST', tekst });
const F = (latex: string) => ({ vrsta: 'FORMULA', latex });

describe('podeliFormule (Review Focus 1)', () => {
  it.each([
    ['Koliko je $1011_2$ dekadno?', [T('Koliko je '), F('1011_2'), T(' dekadno?')]],
    ['Cena je 5$ i 10$', [T('Cena je 5$ i 10$')]],
    ['$ 5', [T('$ 5')]],
    ['$5 i $6', [T('$5 i $6')]],
    ['\\$5 i \\$6', [T('$5 i $6')]],
    ['$$', [T('$$')]],
    ['$x', [T('$x')]],
    ['$x\ny$', [T('$x\ny$')]],
    ['$x$1', [T('$x$1')]],
    ['$\\frac{1}{2}$', [F('\\frac{1}{2}')]],
    ['$a\\$b$', [F('a\\$b')]],
    ['$x$ i $y$', [F('x'), T(' i '), F('y')]],
    ['a\\b', [T('a\\b')]],
    ['$x $', [T('$x $')]],
    ['$x\\$', [T('$x$')]],
    ['($x$).', [T('('), F('x'), T(').')]],
  ])('%j', (ulaz, ocekivano) => expect(podeliFormule(ulaz)).toEqual(ocekivano));

  it('prazno i null -> []', () => {
    expect(podeliFormule('')).toEqual([]);
    expect(podeliFormule(null)).toEqual([]);
    expect(podeliFormule(undefined)).toEqual([]);
  });

  it('nadjiFormulu gleda samo početak', () => {
    expect(nadjiFormulu('$x^2$ ostalo')).toEqual({ latex: 'x^2', duzina: 5 });
    expect(nadjiFormulu('a $x$')).toBeNull();
  });

  it('imaFormulu i tekstZaCitac', () => {
    expect(imaFormulu('Koliko je $1011_2$?')).toBe(true);
    expect(imaFormulu('Cena je 5$')).toBe(false);
    expect(imaFormulu(null)).toBe(false);
    expect(tekstZaCitac('Koliko je $1011_2$? \\$5')).toBe('Koliko je 1011_2? $5');
    expect(tekstZaCitac(undefined)).toBe('');
  });

  it('tekstSaFormulama: escape teksta i izvora, mesta formula', () => {
    expect(tekstSaFormulama('<b>$x<y$</b>')).toEqual({
      html: '&lt;b&gt;<span class="uz-formula">$x&lt;y$</span>&lt;/b&gt;',
      formula: true,
    });
    expect(tekstSaFormulama('5$ & "6"')).toEqual({ html: '5$ &amp; &quot;6&quot;', formula: false });
    expect(tekstSaFormulama(null)).toEqual({ html: '', formula: false });
    expect(escapeHtml(`<'&">`)).toBe('&lt;&#39;&amp;&quot;&gt;');
  });

  it('mesto formule nosi KLASA_FORMULE, a izvor sa navodnicima ne izlazi iz elementa', () => {
    expect(KLASA_FORMULE).toBe('uz-formula');
    expect(tekstSaFormulama('$a"b\'c$').html).toBe('<span class="uz-formula">$a&quot;b&#39;c$</span>');
  });

  it('dugačak tekst bez zatvarajućeg $ se deli brzo (bez eksplozije pretrage)', () => {
    const ulaz = '$a '.repeat(1000) + 'x\\$'.repeat(500);
    const pocetak = performance.now();
    const delovi = podeliFormule(ulaz);
    expect(performance.now() - pocetak).toBeLessThan(100);
    expect(delovi.every((d: { vrsta: string }) => d.vrsta === 'TEKST')).toBe(true);
  });

  it('formulaMarked je jedna ekstenzija u redu', () => {
    expect(formulaMarked.extensions?.map((e) => ('level' in e ? e.level : null))).toEqual(['inline']);
  });
});
