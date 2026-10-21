import { type Command, EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import type { Lista, Pasus } from '../../data-access/platno.models';
import { kljuceviPasusa } from './kljucevi-pasusa';
import { dokUPasuse, pasusiUDok } from './pm-konverzija';
import {
  nalepiTekst, podeliPasus, postaviPasus, postaviStil, prebaciListu, prebaciStil, promeniNivo, stanjeSelekcije, tabIliNivo,
  umetniPrelom,
} from './pm-komande';
import { type AtributiPasusa, napraviSemu } from './pm-sema';
import { deo, pasusSa, poz } from './pm.testing';

/** Golo stanje (bez dodataka): komanda sama, bez dodele ključeva i dodatka stila. */
class Golo {
  state: EditorState;
  constructor(pasusi: Pasus[]) {
    this.state = EditorState.create({ doc: pasusiUDok(pasusi, napraviSemu()) });
  }
  readonly dispatch = (tr: Transaction) => { this.state = this.state.apply(tr); };
  izaberi(od: number, doPoz = od) {
    this.dispatch(this.state.tr.setSelection(TextSelection.create(this.state.doc, od, doPoz)));
  }
  izvrsi(c: Command) { return c(this.state, this.dispatch); }
  get dok() { return this.state.doc; }
  pasusi() { return dokUPasuse(this.state.doc); }
  atributi(i: number) { return this.state.doc.child(i).attrs as AtributiPasusa; }
}

const ZNAK: Lista = { vrsta: 'ZNAK', znak: '•', boja: null, format: null, pocetak: null };

describe('podeliPasus (Enter)', () => {
  const lista = () => new Golo([pasusSa([deo('abcd')], { lista: ZNAK, nivo: 2, uvlacenje: { levo: 90, prviRed: -18 } })]);

  it('pasus liste nivoa 2: nov pasus ima istu listu, nivo i uvlačenje (nove objekte), prazanDeo null', () => {
    const g = lista();
    g.izaberi(poz(g.dok, 0, 2));
    expect(g.izvrsi(podeliPasus)).toBe(true);
    const [gornji, donji] = [g.atributi(0), g.atributi(1)];
    expect(donji).toMatchObject({ lista: ZNAK, nivo: 2, uvlacenje: { levo: 90, prviRed: -18 }, prazanDeo: null });
    expect(gornji.prazanDeo).toBeNull();
    expect(g.pasusi().map((p) => p.delovi[0].tekst)).toEqual(['ab', 'cd']);
  });

  it('Enter na kraju pasusa liste ne izbacuje iz liste (split ne gubi atribute na kraju)', () => {
    const g = lista();
    g.izaberi(poz(g.dok, 0, 4));
    g.izvrsi(podeliPasus);
    expect(g.atributi(1)).toMatchObject({ lista: ZNAK, nivo: 2, uvlacenje: { levo: 90, prviRed: -18 } });
  });

  it.each([
    ['u sredini', 2, ['p0', null]],
    ['na kraju', 4, ['p0', null]],
    ['na početku nepraznog pasusa', 0, [null, 'p0']],
  ] as const)('ključ: kursor %s', (_, pomeraj, kljucevi) => {
    const g = lista();
    g.izaberi(poz(g.dok, 0, pomeraj));
    g.izvrsi(podeliPasus);
    expect(kljuceviPasusa(g.dok)).toEqual(kljucevi);
  });

  it('prazan pasus: ključ ostaje gornjem', () => {
    const g = new Golo([pasusSa([deo('')])]);
    g.izaberi(poz(g.dok, 0, 0));
    g.izvrsi(podeliPasus);
    expect(kljuceviPasusa(g.dok)).toEqual(['p0', null]);
  });

  it('nastavlja stil kraja gornjeg dela (sačuvani markovi)', () => {
    const g = new Golo([pasusSa([deo('a'), deo('b', { velicina: 40 })])]);
    g.izaberi(poz(g.dok, 0, 2));
    g.izvrsi(podeliPasus);
    g.dispatch(g.state.tr.insertText('c'));
    expect(g.pasusi()[1].delovi[0]).toMatchObject({ tekst: 'c', velicina: 40 });
  });

  it('atributi starog dokumenta ostaju netaknuti (nikad izmena node.attrs na mestu)', () => {
    const g = lista();
    const stari = g.dok;
    const uvlacenje = (stari.child(0).attrs as AtributiPasusa).uvlacenje;
    g.izaberi(poz(g.dok, 0, 2));
    g.izvrsi(podeliPasus);
    g.izvrsi(tabIliNivo(1));
    expect((stari.child(0).attrs as AtributiPasusa).uvlacenje).toBe(uvlacenje);
    expect(uvlacenje).toEqual({ levo: 90, prviRed: -18 });
    expect(g.atributi(0).uvlacenje).not.toBe(g.atributi(1).uvlacenje);
  });
});

describe('umetniPrelom (Shift+Enter)', () => {
  it('umeće čvor prelom; dokUPasuse daje \\n u istom pasusu', () => {
    const g = new Golo([pasusSa([deo('ab')])]);
    g.izaberi(poz(g.dok, 0, 1));
    expect(g.izvrsi(umetniPrelom)).toBe(true);
    expect(g.dok.child(0).child(1).type.name).toBe('prelom');
    expect(g.pasusi()).toHaveLength(1);
    expect(g.pasusi()[0].delovi[0].tekst).toBe('a\nb');
  });
});

describe('tabIliNivo', () => {
  it('Tab na početku pasusa liste: nivo + 1 i uvlačenje {54, -18}', () => {
    const g = new Golo([pasusSa([deo('a')], { lista: ZNAK, uvlacenje: { levo: 18, prviRed: -18 } })]);
    g.izaberi(poz(g.dok, 0, 0));
    expect(g.izvrsi(tabIliNivo(1))).toBe(true);
    expect(g.atributi(0)).toMatchObject({ nivo: 1, uvlacenje: { levo: 54, prviRed: -18 } });
    expect(g.pasusi()[0].delovi[0].tekst).toBe('a');
    g.izvrsi(tabIliNivo(-1));
    expect(g.atributi(0)).toMatchObject({ nivo: 0, uvlacenje: { levo: 18, prviRed: -18 } });
  });

  it('nivo ne prelazi 8', () => {
    const g = new Golo([pasusSa([deo('a')], { lista: ZNAK, nivo: 8 })]);
    g.izaberi(poz(g.dok, 0, 0));
    const pre = g.dok;
    g.izvrsi(tabIliNivo(1));
    expect(g.dok).toBe(pre);
  });

  it('van liste (ili van početka pasusa): Tab upisuje \\t', () => {
    const g = new Golo([pasusSa([deo('ab')])]);
    g.izaberi(poz(g.dok, 0, 0));
    g.izvrsi(tabIliNivo(1));
    expect(g.pasusi()[0].delovi[0].tekst).toBe('\tab');
    const l = new Golo([pasusSa([deo('ab')], { lista: ZNAK })]);
    l.izaberi(poz(l.dok, 0, 1));
    l.izvrsi(tabIliNivo(1));
    expect(l.pasusi()[0].delovi[0].tekst).toBe('a\tb');
    expect(l.atributi(0).nivo).toBe(0);
  });

  it('Shift+Tab na nivou 0 (i van liste): ništa, ali se taster troši (fokus ne izlazi iz teksta)', () => {
    const g = new Golo([pasusSa([deo('ab')], { lista: ZNAK })]);
    g.izaberi(poz(g.dok, 0, 0));
    const pre = g.dok;
    expect(g.izvrsi(tabIliNivo(-1))).toBe(true);
    expect(g.dok).toBe(pre);
    const van = new Golo([pasusSa([deo('ab')])]);
    van.izaberi(poz(van.dok, 0, 1));
    const preVan = van.dok;
    expect(van.izvrsi(tabIliNivo(-1))).toBe(true);
    expect(van.dok).toBe(preVan);
  });
});

describe('nalepiTekst', () => {
  it("'a\\r\\nb\\nc' na kraju pasusa: 3 pasusa sa stilom kursora; novi bez ključa i sa atributima pasusa", () => {
    const caladea = deo('xy', { font: 'Caladea', velicina: 40 });
    const g = new Golo([pasusSa([caladea], { lista: ZNAK })]);
    g.izaberi(poz(g.dok, 0, 2));
    g.dispatch(nalepiTekst(g.state, 'a\r\nb\nc'));
    const p = g.pasusi();
    expect(p.map((x) => x.delovi.map((d) => d.tekst).join(''))).toEqual(['xya', 'b', 'c']);
    for (const x of p) {
      expect(x.delovi).toHaveLength(1);
      expect(x.delovi[0]).toMatchObject({ font: 'Caladea', velicina: 40 });
      expect(x.lista).toEqual(ZNAK);
    }
    expect(kljuceviPasusa(g.dok)).toEqual(['p0', null, null]);
  });

  it('na početku nepraznog pasusa ključ ide pasusu koji drži stari sadržaj (poslednjem)', () => {
    const g = new Golo([pasusSa([deo('cd')])]);
    g.izaberi(poz(g.dok, 0, 0));
    g.dispatch(nalepiTekst(g.state, 'a\nb'));
    expect(g.pasusi().map((x) => x.delovi[0].tekst)).toEqual(['a', 'bcd']);
    expect(kljuceviPasusa(g.dok)).toEqual([null, 'p0']);
  });

  it('jedan red zamenjuje izbor; kursor posle nalepljenog', () => {
    const g = new Golo([pasusSa([deo('abcd')])]);
    g.izaberi(poz(g.dok, 0, 1), poz(g.dok, 0, 3));
    g.dispatch(nalepiTekst(g.state, 'X'));
    expect(g.pasusi()[0].delovi[0].tekst).toBe('aXd');
    expect(g.state.selection.from).toBe(poz(g.dok, 0, 2));
  });

  it('u prazan pasus: stil iz prazanDeo', () => {
    const tinos = deo('', { font: 'Tinos', velicina: 32 });
    const g = new Golo([pasusSa([tinos])]);
    g.izaberi(poz(g.dok, 0, 0));
    g.dispatch(nalepiTekst(g.state, 'a\nb'));
    expect(g.pasusi().map((x) => x.delovi[0])).toMatchObject([
      { tekst: 'a', font: 'Tinos', velicina: 32 }, { tekst: 'b', font: 'Tinos', velicina: 32 },
    ]);
  });
});

describe('stil izbora', () => {
  it('postaviStil({ velicina: 40 }) nad delom teksta: samo izabrani deo ima 40', () => {
    const g = new Golo([pasusSa([deo('abcd')])]);
    g.izaberi(poz(g.dok, 0, 1), poz(g.dok, 0, 3));
    g.izvrsi(postaviStil({ velicina: 40 }));
    expect(g.pasusi()[0].delovi.map((d) => [d.tekst, d.velicina])).toEqual([['a', 18], ['bc', 40], ['d', 18]]);
  });

  it('postaviStil sa praznim izborom: sačuvani markovi (sledeće kucanje), a prazan pasus pamti stil u prazanDeo', () => {
    const g = new Golo([pasusSa([deo('')])]);
    g.izaberi(poz(g.dok, 0, 0));
    g.izvrsi(postaviStil({ velicina: 40, font: 'Tinos' }));
    expect(g.atributi(0).prazanDeo).toMatchObject({ velicina: 40, font: 'Tinos' });
    expect(g.pasusi()[0].delovi[0]).toMatchObject({ tekst: '', velicina: 40, font: 'Tinos' });
    g.dispatch(g.state.tr.insertText('x'));
    expect(g.pasusi()[0].delovi[0]).toMatchObject({ tekst: 'x', velicina: 40, font: 'Tinos' });
  });

  it('prebaciStil(podebljano) nad mešanim izborom: svi podebljani, ponovo: nijedan', () => {
    const g = new Golo([pasusSa([deo('a', { podebljano: true }), deo('b')])]);
    g.izaberi(poz(g.dok, 0, 0), poz(g.dok, 0, 2));
    expect(stanjeSelekcije(g.state).podebljano).toBeNull();
    g.izvrsi(prebaciStil('podebljano'));
    expect(g.pasusi()[0].delovi).toEqual([deo('ab', { podebljano: true })]);
    expect(stanjeSelekcije(g.state).podebljano).toBe(true);
    g.izvrsi(prebaciStil('podebljano'));
    expect(g.pasusi()[0].delovi).toEqual([deo('ab')]);
  });

  it('prebaciStil sa praznim izborom menja sačuvane markove', () => {
    const g = new Golo([pasusSa([deo('ab')])]);
    g.izaberi(poz(g.dok, 0, 2));
    g.izvrsi(prebaciStil('kurziv'));
    expect(stanjeSelekcije(g.state).kurziv).toBe(true);
    g.dispatch(g.state.tr.insertText('c'));
    expect(g.pasusi()[0].delovi.map((d) => [d.tekst, d.kurziv])).toEqual([['ab', false], ['c', true]]);
  });
});

describe('pasusi izbora', () => {
  it("prebaciListu('BROJ') nad dva pasusa: oba BROJ ARAPSKI_TACKA od 1, uvlačenje {18, -18}; ponovo: bez liste, {0, 0}", () => {
    const g = new Golo([pasusSa([deo('a')]), pasusSa([deo('b')]), pasusSa([deo('c')])]);
    g.izaberi(poz(g.dok, 0, 0), poz(g.dok, 1, 1));
    g.izvrsi(prebaciListu('BROJ'));
    for (const i of [0, 1]) {
      expect(g.atributi(i).lista).toEqual({ vrsta: 'BROJ', znak: null, boja: null, format: 'ARAPSKI_TACKA', pocetak: 1 });
      expect(g.atributi(i).uvlacenje).toEqual({ levo: 18, prviRed: -18 });
    }
    expect(g.atributi(2).lista).toBeNull();
    expect(stanjeSelekcije(g.state).lista).toBe('BROJ');
    g.izvrsi(prebaciListu('BROJ'));
    for (const i of [0, 1]) {
      expect(g.atributi(i).lista).toBeNull();
      expect(g.atributi(i).uvlacenje).toEqual({ levo: 0, prviRed: 0 });
    }
  });

  it("prebaciListu('ZNAK') nad mešanim (jedan već ZNAK): svi ZNAK '•'", () => {
    const g = new Golo([pasusSa([deo('a')], { lista: ZNAK }), pasusSa([deo('b')])]);
    g.izaberi(poz(g.dok, 0, 0), poz(g.dok, 1, 1));
    expect(stanjeSelekcije(g.state).lista).toBeNull();
    g.izvrsi(prebaciListu('ZNAK'));
    expect([g.atributi(0).lista, g.atributi(1).lista]).toEqual([ZNAK, ZNAK]);
  });

  it('postaviPasus menja sve pasuse izbora novim objektima (deljeni objekti ostaju netaknuti)', () => {
    const g = new Golo([pasusSa([deo('a')]), pasusSa([deo('b')])]);
    g.izaberi(poz(g.dok, 0, 0), poz(g.dok, 1, 1));
    const izmena = { poravnanje: 'CENTAR' as const, uvlacenje: { levo: 10, prviRed: 0 } };
    g.izvrsi(postaviPasus(izmena));
    expect(g.pasusi().map((p) => p.poravnanje)).toEqual(['CENTAR', 'CENTAR']);
    expect(g.atributi(0).uvlacenje).toEqual({ levo: 10, prviRed: 0 });
    expect(g.atributi(0).uvlacenje).not.toBe(izmena.uvlacenje);
    expect(g.atributi(0).uvlacenje).not.toBe(g.atributi(1).uvlacenje);
    expect(stanjeSelekcije(g.state).poravnanje).toBe('CENTAR');
  });

  it('promeniNivo menja nivo i uvlačenje pasusa liste u izboru', () => {
    const g = new Golo([pasusSa([deo('a')], { lista: ZNAK, uvlacenje: { levo: 18, prviRed: -18 } })]);
    g.izaberi(poz(g.dok, 0, 1));
    g.izvrsi(promeniNivo(1));
    expect(g.atributi(0)).toMatchObject({ nivo: 1, uvlacenje: { levo: 54, prviRed: -18 } });
    expect(stanjeSelekcije(g.state).nivo).toBe(1);
  });
});

describe('stanjeSelekcije', () => {
  it('jedan stil i jedan pasus: sve vrednosti; mešano -> null', () => {
    const g = new Golo([
      pasusSa([deo('ab', { font: 'Tinos', velicina: 30, boja: '#C00000' })], { proredProcenat: 90, razmakPre: 6 }),
      pasusSa([deo('cd', { font: 'Arimo', velicina: 30 })], { proredProcenat: 90, razmakPre: 0, poravnanje: 'DESNO' }),
    ]);
    g.izaberi(poz(g.dok, 0, 1));
    expect(stanjeSelekcije(g.state)).toEqual({
      font: 'Tinos', velicina: 30, boja: '#C00000', podebljano: false, kurziv: false, podvuceno: false, precrtano: false,
      polozaj: 'OBICAN', poravnanje: 'LEVO', lista: 'BEZ', nivo: 0, proredProcenat: 90, razmakPre: 6, razmakPosle: 0,
      polozaji: ['OBICAN'], liste: ['BEZ'],
    });
    g.izaberi(poz(g.dok, 0, 0), poz(g.dok, 1, 2));
    expect(stanjeSelekcije(g.state)).toMatchObject({
      font: null, velicina: 30, boja: null, poravnanje: null, proredProcenat: 90, razmakPre: null, lista: 'BEZ',
    });
  });

  it('mešan položaj i lista: polozaji i liste nose samo vrednosti prisutne u izboru (aria-pressed mixed, F13)', () => {
    const g = new Golo([
      pasusSa([deo('ab'), deo('cd', { polozaj: 'INDEKS' })]),
      pasusSa([deo('ef')], { lista: { vrsta: 'ZNAK', znak: '•', boja: null, format: null, pocetak: null } }),
    ]);
    g.izaberi(poz(g.dok, 0, 0), poz(g.dok, 1, 2));
    expect(stanjeSelekcije(g.state)).toMatchObject({
      polozaj: null, polozaji: ['OBICAN', 'INDEKS'], lista: null, liste: ['BEZ', 'ZNAK'],
    });
  });

  it('prazan pasus: stil iz prazanDeo', () => {
    const g = new Golo([pasusSa([deo('', { font: 'Cousine', velicina: 50 })])]);
    g.izaberi(poz(g.dok, 0, 0));
    expect(stanjeSelekcije(g.state)).toMatchObject({ font: 'Cousine', velicina: 50 });
  });
});
