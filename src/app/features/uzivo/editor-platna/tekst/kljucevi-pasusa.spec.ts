import { baseKeymap, deleteSelection } from 'prosemirror-commands';
import { undo } from 'prosemirror-history';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { animacija, pasus, platnoSaAnimacijama } from '../../data-access/platno-podaci.testing';
import type { Platno } from '../../data-access/platno.models';
import { dodeliKljuceve, kljuceviPasusa, mapaPoKljucevima, preslikajAnimacije } from './kljucevi-pasusa';
import { pasusiUDok } from './pm-konverzija';
import { nalepiTekst, podeliPasus } from './pm-komande';
import { napraviSemu } from './pm-sema';
import { Sesija, poz } from './pm.testing';

/** Review Focus 2: animacije pasusa prate pasus po stabilnom ključu (odluka 17), i kroz Ctrl+Z u istoj sesiji. */
describe('kljucevi-pasusa: mapa starih indeksa pasusa posle uređivanja', () => {
  const POCETNI = ['p0', 'p1', 'p2'];
  const nova = () => new Sesija([pasus('ab'), pasus('cd'), pasus('ef')]);

  it('pasusiUDok daje ključeve p0, p1, p2', () => {
    expect(kljuceviPasusa(nova().dok)).toEqual(POCETNI);
  });

  const slucajevi: [string, (s: Sesija) => void, (number | null)[]][] = [
    ['kucanje u pasusu 0', (s) => { s.izaberi(poz(s.dok, 0, 1)); s.kucaj('x'); }, [0, 1, 2]],
    ['Enter na kraju pasusa 0 (gornji zadržava p0, donji dobija n1)', (s) => {
      s.izaberi(poz(s.dok, 0, 2)); s.izvrsi(podeliPasus);
    }, [0, 2, 3]],
    ['Enter na početku pasusa 1 (nov prazan gornji dobija n1, "cd" ostaje p1)', (s) => {
      s.izaberi(poz(s.dok, 1, 0)); s.izvrsi(podeliPasus);
    }, [0, 2, 3]],
    ['Backspace na početku pasusa 1 (spajanje zadržava gornji ključ p0)', (s) => {
      s.izaberi(poz(s.dok, 1, 0)); s.izvrsi(baseKeymap['Backspace']);
    }, [0, null, 1]],
    ['izbor od kraja pasusa 0 do početka pasusa 2 i brisanje ("ef" se spaja u p0)', (s) => {
      s.izaberi(poz(s.dok, 0, 2), poz(s.dok, 2, 0)); s.izvrsi(deleteSelection);
    }, [0, null, null]],
    ['izbor celog teksta i kucanje "x"', (s) => { s.izaberi(poz(s.dok, 0, 0), poz(s.dok, 2, 2)); s.kucaj('x'); }, [0, null, null]],
    ['brisanje samo teksta pasusa 1 (pasus ostaje prazan, sa ključem)', (s) => {
      s.izaberi(poz(s.dok, 1, 0), poz(s.dok, 1, 2)); s.izvrsi(deleteSelection);
    }, [0, 1, 2]],
    ['izbor celog pasusa 1 sa granicama i brisanje, pa Ctrl+Z u istoj sesiji (istorija vraća čvor sa ključem p1)', (s) => {
      s.dispatch(s.state.tr.setSelection(NodeSelection.create(s.dok, poz(s.dok, 1) - 1)));
      s.izvrsi(deleteSelection);
      expect(kljuceviPasusa(s.dok)).toEqual(['p0', 'p2']);
      expect(s.izvrsi(undo)).toBe(true);
    }, [0, 1, 2]],
    ['lepljenje dva reda na kraj pasusa 2 (nov pasus dobija n1)', (s) => {
      s.izaberi(poz(s.dok, 2, 2)); s.dispatch(nalepiTekst(s.state, 'x\ny'));
      expect(kljuceviPasusa(s.dok)).toEqual(['p0', 'p1', 'p2', 'n1']);
    }, [0, 1, 2]],
  ];

  it.each(slucajevi)('%s', (_, radnja, mapa) => {
    const s = nova();
    radnja(s);
    expect(mapaPoKljucevima(POCETNI, s.dok)).toEqual(mapa);
    // posle svake transakcije nijedan pasus nije bez ključa niti sa duplikatom
    const k = kljuceviPasusa(s.dok);
    expect(k.every((x) => x !== null)).toBe(true);
    expect(new Set(k).size).toBe(k.length);
  });

  it('Enter na kraju pasusa 0: nov donji pasus dobija ključ n1', () => {
    const s = nova();
    s.izaberi(poz(s.dok, 0, 2));
    s.izvrsi(podeliPasus);
    expect(kljuceviPasusa(s.dok)).toEqual(['p0', 'n1', 'p1', 'p2']);
  });

  it('mapaPoKljucevima: null ključ u početnom stanju daje null', () => {
    expect(mapaPoKljucevima(['p0', null], nova().dok)).toEqual([0, null]);
  });
});

describe('preslikajAnimacije', () => {
  const p = (): Platno => platnoSaAnimacijama([
    animacija('a1', 't', { pasus: 0 }),
    animacija('a2', 't', { pasus: 1 }),
    animacija('a3', 't', { pasus: 2 }),
    animacija('a4', 't'),
    animacija('a5', 'drugi', { pasus: 1 }),
  ]);

  it('mapa [0, null, 1]: animacija pasusa 1 uklonjena, pasusa 2 -> 1; ceo sloj i drugi slojevi netaknuti', () => {
    const pocetak = p();
    const { platno, uklonjeno } = preslikajAnimacije(pocetak, 't', [0, null, 1]);
    expect(uklonjeno).toBe(1);
    expect(platno.animacije.map((a) => [a.id, a.pasus])).toEqual([['a1', 0], ['a3', 1], ['a4', null], ['a5', 1]]);
    expect(platno.animacije[0]).toBe(pocetak.animacije[0]);
    expect(platno.animacije[2]).toBe(pocetak.animacije[3]);
    expect(platno.animacije[3]).toBe(pocetak.animacije[4]);
    expect(pocetak.animacije[2].pasus).toBe(2);
  });

  it('mapa identiteta -> isti objekat dokumenta', () => {
    const pocetak = p();
    const r = preslikajAnimacije(pocetak, 't', [0, 1, 2]);
    expect(r.platno).toBe(pocetak);
    expect(r.uklonjeno).toBe(0);
  });

  it('pasus van mape (indeks preko dužine) se uklanja', () => {
    const r = preslikajAnimacije(p(), 't', [0]);
    expect(r.uklonjeno).toBe(2);
  });
});

describe('dodeliKljuceve', () => {
  it('dva pasusa sa ključem p0: drugi dobija n1; transakcija je van istorije (addToHistory false)', () => {
    const sema = napraviSemu();
    const dok = pasusiUDok([pasus('a'), pasus('b')], sema);
    const kopija = sema.nodes['doc'].create(null, [dok.child(0), dok.child(0).type.create(dok.child(0).attrs, dok.child(1).content)]);
    const state = EditorState.create({ doc: kopija });
    const brojac = { n: 0 };
    const tr = dodeliKljuceve(state, brojac)!;
    expect(tr).not.toBeNull();
    expect(tr.getMeta('addToHistory')).toBe(false);
    expect(kljuceviPasusa(tr.doc)).toEqual(['p0', 'n1']);
    expect(brojac.n).toBe(1);
  });

  it('pasus bez ključa dobija sledeći n<k>; bez duplikata i praznih -> null', () => {
    const sema = napraviSemu();
    const dok = sema.nodes['doc'].create(null, [sema.nodes['pasus'].create(), sema.nodes['pasus'].create()]);
    const brojac = { n: 4 };
    const tr = dodeliKljuceve(EditorState.create({ doc: dok }), brojac)!;
    expect(kljuceviPasusa(tr.doc)).toEqual(['n5', 'n6']);
    expect(dodeliKljuceve(EditorState.create({ doc: tr.doc }), brojac)).toBeNull();
  });

  it('Ctrl+Z ne poništava dodelu ključeva (Enter, pa Ctrl+Z: nema n1, nema duplikata)', () => {
    const s = new Sesija([pasus('ab')]);
    s.izaberi(poz(s.dok, 0, 1));
    s.izvrsi(podeliPasus);
    expect(kljuceviPasusa(s.dok)).toEqual(['p0', 'n1']);
    s.izvrsi(undo);
    expect(kljuceviPasusa(s.dok)).toEqual(['p0']);
    expect(s.pasusi()[0].delovi[0].tekst).toBe('ab');
  });
});
