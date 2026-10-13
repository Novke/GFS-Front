import { EditorView } from 'prosemirror-view';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Lista } from '../../data-access/platno.models';
import { METRIKA, type Metrika } from '../../ui/platno-metrika';
import { prikazPasusa } from '../../ui/platno-tekst';
import { dodatakPasusa } from './pm-dodaci';
import { atributiDela } from './pm-konverzija';
import type { AtributiDela, AtributiPasusa } from './pm-sema';
import { nalepiTekst, podeliPasus, postaviPasus, tabIliNivo } from './pm-komande';
import { Sesija, deo, pasusSa, poz } from './pm.testing';

const stilTeksta = (s: Sesija, i = 0, j = 0): AtributiDela | undefined =>
  s.dok.child(i).child(j).marks.find((m) => m.type.name === 'stil')?.attrs as AtributiDela | undefined;
const atributi = (s: Sesija, i = 0) => s.dok.child(i).attrs as AtributiPasusa;

describe('dodatakStila', () => {
  it('kucanje u prazan pasus sa prazanDeo (Tinos 32): tekst dobija taj stil, a prazanDeo se briše', () => {
    const tinos = deo('', { font: 'Tinos', velicina: 32 });
    const s = new Sesija([pasusSa([tinos])]);
    expect(atributi(s).prazanDeo).toEqual(atributiDela(tinos));
    s.izaberi(poz(s.dok, 0, 0));
    s.kucaj('a');
    expect(stilTeksta(s)).toEqual(atributiDela(tinos));
    expect(atributi(s).prazanDeo).toBeNull();
  });

  it('brisanje celog teksta pasusa: prazanDeo = stil obrisanog teksta (pa sledeće kucanje nastavlja tim stilom)', () => {
    const caladea = deo('ab', { font: 'Caladea', velicina: 40, podebljano: true });
    const s = new Sesija([pasusSa([caladea])]);
    s.izaberi(poz(s.dok, 0, 0), poz(s.dok, 0, 2));
    s.dispatch(s.state.tr.deleteSelection());
    expect(s.dok.child(0).content.size).toBe(0);
    expect(atributi(s).prazanDeo).toEqual(atributiDela(caladea));
    s.dispatch(s.state.tr.setStoredMarks([]));
    s.kucaj('x');
    expect(stilTeksta(s)).toEqual(atributiDela(caladea));
  });

  it('Enter na kraju pasusa: nov prazan pasus pamti stil kraja gornjeg (prazanDeo nije null)', () => {
    const s = new Sesija([pasusSa([deo('a'), deo('b', { velicina: 44 })])]);
    s.izaberi(poz(s.dok, 0, 2));
    s.izvrsi((st, d) => {
      const tr = st.tr.split(st.selection.from);
      d!(tr);
      return true;
    });
    expect(atributi(s, 1).prazanDeo?.velicina).toBe(44);
  });

  describe('tekst bez marka `stil` ne sme tiho da nestane (Note F12 a)', () => {
    it('pasus sa prazanDeo: nemarkiran tekst dobija prazanDeo', () => {
      const tinos = deo('', { font: 'Tinos', velicina: 32 });
      const s = new Sesija([pasusSa([deo('ab', { font: 'Caladea' })]), pasusSa([tinos])]);
      s.dispatch(s.state.tr.insert(poz(s.dok, 1, 0), s.state.schema.text('x')));
      expect(stilTeksta(s, 1)).toEqual(atributiDela(tinos));
      expect(s.pasusi()[1].delovi[0]).toMatchObject({ tekst: 'x', font: 'Tinos', velicina: 32 });
    });

    it('bez prazanDeo: nemarkiran tekst dobija prethodni stil u dokumentu', () => {
      const caladea = deo('ab', { font: 'Caladea' });
      const s = new Sesija([pasusSa([caladea]), pasusSa([deo('cd', { font: 'Tinos' })])]);
      s.dispatch(s.state.tr.insert(poz(s.dok, 1, 0), s.state.schema.text('x')));
      expect(stilTeksta(s, 1)).toEqual(atributiDela(caladea));
      expect(s.pasusi()[1].delovi.map((d) => d.tekst)).toEqual(['x', 'cd']);
    });

    it('bez ičega pre: podrazumevani stil uređivača', () => {
      const podrazumevano = atributiDela(deo('', { font: 'Arimo', velicina: 24 }));
      const s = new Sesija([pasusSa([])], { podrazumevano });
      s.dispatch(s.state.tr.insert(poz(s.dok, 0, 0), s.state.schema.text('x')));
      expect(stilTeksta(s)).toEqual(podrazumevano);
      expect(s.pasusi()[0].delovi[0].tekst).toBe('x');
    });

    it('prelom bez marka takođe dobija stil', () => {
      const s = new Sesija([pasusSa([deo('ab', { velicina: 30 })])]);
      s.dispatch(s.state.tr.insert(poz(s.dok, 0, 1), s.state.schema.nodes['prelom'].create()));
      expect(s.pasusi()[0].delovi).toHaveLength(1);
      expect(s.pasusi()[0].delovi[0]).toMatchObject({ tekst: 'a\nb', velicina: 30 });
    });
  });

  it('podrazumevani atributi pasusa ostaju zamrznuti i netaknuti (atributi se menjaju samo novim objektom)', () => {
    const s = new Sesija([pasusSa([deo('ab')])]);
    s.izaberi(poz(s.dok, 0, 2));
    s.kucaj('c');
    const prazan = s.state.schema.nodes['pasus'].create();
    expect(Object.isFrozen(prazan.attrs['uvlacenje'])).toBe(true);
    expect(Object.isFrozen(prazan.attrs['tabulatori'])).toBe(true);
    expect(prazan.attrs['uvlacenje']).toEqual({ levo: 0, prviRed: 0 });
  });
});

describe('dodatakStila: netaknut prazan pasus (delovi: []) ostaje bajt-isti (Fix 2)', () => {
  const ZNAK: Lista = { vrsta: 'ZNAK', znak: '•', boja: null, format: null, pocetak: null };
  const prazan = pasusSa([]);
  /** "Naslov" 40 pt (stavka liste, da Tab menja nivo), prazan bez delova, "kraj" Tinos 30 pt. */
  const nova = () => new Sesija([
    pasusSa([deo('Naslov', { velicina: 40 })], { lista: ZNAK, uvlacenje: { levo: 18, prviRed: -18 } }),
    prazan,
    pasusSa([deo('kraj', { font: 'Tinos', velicina: 30 })]),
  ]);
  const slucajevi: [string, (s: Sesija) => void, number][] = [
    ['Enter na kraju prethodnog pasusa (i dodela ključa novom susedu)', (s) => {
      s.izaberi(poz(s.dok, 0, 6)); s.izvrsi(podeliPasus);
    }, 2],
    ['Enter na početku prethodnog pasusa', (s) => { s.izaberi(poz(s.dok, 0, 0)); s.izvrsi(podeliPasus); }, 2],
    ['višeredno lepljenje na kraj prethodnog pasusa', (s) => {
      s.izaberi(poz(s.dok, 0, 6)); s.dispatch(nalepiTekst(s.state, 'x\ny'));
    }, 2],
    ['postaviPasus na prethodnom pasusu', (s) => { s.izaberi(poz(s.dok, 0, 2)); s.izvrsi(postaviPasus({ poravnanje: 'CENTAR' })); }, 1],
    ['postaviPasus na sledećem pasusu', (s) => { s.izaberi(poz(s.dok, 2, 2)); s.izvrsi(postaviPasus({ poravnanje: 'DESNO' })); }, 1],
    ['tabIliNivo na prethodnom pasusu (nivo liste)', (s) => { s.izaberi(poz(s.dok, 0, 0)); s.izvrsi(tabIliNivo(1)); }, 1],
    ['kucanje na kraju prethodnog i na početku sledećeg', (s) => {
      s.izaberi(poz(s.dok, 0, 6)); s.kucaj('!'); s.izaberi(poz(s.dok, 2, 0)); s.kucaj('?');
    }, 1],
  ];

  it.each(slucajevi)('%s', (_, radnja, indeks) => {
    const s = nova();
    const pre = s.dok.child(1);
    radnja(s);
    expect(s.dok.child(indeks)).toBe(pre);
    expect(s.pasusi()[indeks]).toStrictEqual(prazan);
  });

  it('pasus koji korisnik stvarno dira i dalje dobija stil: kucanje u prazan pasus -> stil prethodnog teksta', () => {
    const s = nova();
    s.izaberi(poz(s.dok, 1, 0));
    s.kucaj('a');
    expect(s.pasusi()[1].delovi).toEqual([deo('a', { velicina: 40 })]);
  });

  it('pasus koji brisanjem postane prazan pamti stil obrisanog teksta (nov čvor)', () => {
    const s = nova();
    s.izaberi(poz(s.dok, 2, 0), poz(s.dok, 2, 4));
    s.dispatch(s.state.tr.deleteSelection());
    expect(s.pasusi()[2].delovi).toEqual([deo('', { font: 'Tinos', velicina: 30 })]);
  });
});

describe('dodatakPasusa (dekoracije u pravom EditorView-u)', () => {
  let koren: HTMLElement;
  let view: EditorView | null = null;
  beforeEach(() => {
    koren = document.createElement('div');
    document.body.appendChild(koren);
  });
  afterEach(() => {
    view?.destroy();
    view = null;
    koren.remove();
  });
  const prikazi = (s: Sesija) => {
    view = new EditorView({ mount: koren }, { state: s.state });
    return view.dom;
  };

  it('CENTAR -> stil <p> sa text-align: center (isti stil kao prikaz)', () => {
    const p = pasusSa([deo('a')], { poravnanje: 'CENTAR' });
    const dom = prikazi(new Sesija([p]));
    const el = dom.querySelector<HTMLElement>('p.uz-pl-pasus')!;
    expect(el.style.textAlign).toBe('center');
    expect(prikazPasusa([p])[0].stil['text-align']).toBe('center');
  });

  it('BROJ -> widget oznake "1." (klasa uz-pl-oznaka, nije deo teksta)', () => {
    const lista: Lista = { vrsta: 'BROJ', znak: null, boja: null, format: 'ARAPSKI_TACKA', pocetak: 1 };
    const s = new Sesija([pasusSa([deo('a')], { lista }), pasusSa([deo('b')], { lista })]);
    const dom = prikazi(s);
    expect([...dom.querySelectorAll('.uz-pl-oznaka')].map((o) => o.textContent)).toEqual(['1.', '2.']);
    expect(s.pasusi().map((p) => p.delovi[0].tekst)).toEqual(['a', 'b']);
  });

  it('deo u fontu Cousine posle dela u Carlito dobija line-height kao u prikazu', () => {
    // današnja METRIKA ima isti prost prored za sve fontove; Cousine sa svojim (kao posle buduće kalibracije)
    const metrika: Metrika = { ...METRIKA, prostiProred: { ...METRIKA.prostiProred, Cousine: 1.13 } };
    const p = pasusSa([deo('a', { font: 'Carlito' }), deo('b', { font: 'Cousine' })]);
    const ocekivano = prikazPasusa([p], { metrika })[0].delovi[1].stil['line-height'];
    expect(ocekivano).toBeDefined();
    expect(prikazPasusa([p], { metrika })[0].delovi[0].stil['line-height']).toBeUndefined();
    const s = new Sesija([p]);
    view = new EditorView({ mount: koren }, {
      state: EditorState.create({ doc: s.dok, plugins: [dodatakPasusa({ skala: 1, skalaProreda: 1, metrika })] }),
    });
    const dom = view.dom;
    const saProredom = [...dom.querySelectorAll<HTMLElement>('[style*="line-height"]')].filter((e) => e.tagName !== 'P');
    expect(saProredom.map((e) => [e.textContent, e.style.lineHeight])).toEqual([['b', ocekivano]]);
  });

  it('posle kucanja dekoracije prate nov dokument (nov pasus liste dobija oznaku "2.")', () => {
    const lista: Lista = { vrsta: 'BROJ', znak: null, boja: null, format: 'ARAPSKI_TACKA', pocetak: 1 };
    const s = new Sesija([pasusSa([deo('a')], { lista }), pasusSa([deo('')])]);
    const dom = prikazi(s);
    expect(dom.querySelectorAll('.uz-pl-oznaka')).toHaveLength(1);
    const tr = view!.state.tr.setSelection(TextSelection.create(view!.state.doc, poz(view!.state.doc, 1, 0)));
    view!.dispatch(tr.setNodeMarkup(poz(view!.state.doc, 1) - 1, undefined, { ...view!.state.doc.child(1).attrs, lista }));
    view!.dispatch(view!.state.tr.insertText('b'));
    expect([...dom.querySelectorAll('.uz-pl-oznaka')].map((o) => o.textContent)).toEqual(['1.', '2.']);
  });
});

describe('dodatakGranice', () => {
  it('ostalo 49 998: unos "abc" odbijen (stanje isto, prekoracenje pozvano), unos "ab" prihvaćen', () => {
    const prekoracenje = vi.fn();
    const s = new Sesija([pasusSa([deo('')])], { ostalo: 49_998, prekoracenje });
    const pre = s.state;
    s.izaberi(poz(s.dok, 0, 0));
    const posleIzbora = s.state;
    s.kucaj('abc');
    expect(s.state).toBe(posleIzbora);
    expect(s.dok).toBe(pre.doc);
    expect(prekoracenje).toHaveBeenCalledTimes(1);
    s.kucaj('ab');
    expect(s.pasusi()[0].delovi[0].tekst).toBe('ab');
    expect(prekoracenje).toHaveBeenCalledTimes(1);
  });

  it('preko granice brisanje je i dalje dozvoljeno (broj znakova se ne povećava)', () => {
    const prekoracenje = vi.fn();
    const s = new Sesija([pasusSa([deo('abcd')])], { ostalo: 49_999, prekoracenje });
    s.izaberi(poz(s.dok, 0, 0), poz(s.dok, 0, 1));
    s.dispatch(s.state.tr.deleteSelection());
    expect(s.pasusi()[0].delovi[0].tekst).toBe('bcd');
    expect(prekoracenje).not.toHaveBeenCalled();
  });

  it('broji code point-e i prelom kao jedan znak (kao server)', () => {
    const prekoracenje = vi.fn();
    const s = new Sesija([pasusSa([deo('😀')])], { ostalo: 49_998, prekoracenje });
    s.izaberi(poz(s.dok, 0, 2));
    s.dispatch(s.state.tr.replaceSelectionWith(s.state.schema.nodes['prelom'].create()));
    expect(prekoracenje).not.toHaveBeenCalled();
    s.kucaj('x');
    expect(prekoracenje).toHaveBeenCalledTimes(1);
  });
});
