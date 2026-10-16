// Pomoćnici za specove uređivača teksta (F12): sesija nad pravim `EditorState`-om sa dodacima i keymap-om kao u
// uređivaču (posle svake transakcije `dodeliKljuceve`, isto kao `dispatchTransaction` uređivača), pozicije pasusa i delovi.
import type { Node as PmCvor } from 'prosemirror-model';
import { type Command, EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { pasus } from '../../data-access/platno-podaci.testing';
import type { Deo, Pasus } from '../../data-access/platno.models';
import { dodeliKljuceve } from './kljucevi-pasusa';
import { atributiDela, dokUPasuse, pasusiUDok } from './pm-konverzija';
import { dodaciUredjivaca } from './pm-dodaci';
import { type AtributiDela, napraviSemu } from './pm-sema';

/** Deo podrazumevanog stila (`pasus('')`: Carlito 18, crno) sa izmenama. */
export function deo(tekst: string, izmene: Partial<Deo> = {}): Deo {
  return { ...pasus('').delovi[0], tekst, ...izmene };
}

/** Pasus sa datim delovima i izmenama atributa pasusa. */
export function pasusSa(delovi: Deo[], izmene: Partial<Omit<Pasus, 'delovi'>> = {}): Pasus {
  return { ...pasus(''), ...izmene, delovi };
}

export const PODRAZUMEVANO: AtributiDela = atributiDela(deo(''));

/** Pozicija u dokumentu: `pomeraj` znakova od početka sadržaja pasusa `i`. */
export function poz(dok: PmCvor, i: number, pomeraj = 0): number {
  let p = 0;
  for (let j = 0; j < i; j++) p += dok.child(j).nodeSize;
  return p + 1 + pomeraj;
}

export interface OpcijeSesije {
  ostalo?: number;
  prekoracenje?: () => void;
  naEsc?: () => boolean;
  podrazumevano?: AtributiDela;
}

/** Stanje i dispatch kao u uređivaču (bez `EditorView`-a). */
export class Sesija {
  state: EditorState;
  readonly brojac = { n: 0 };

  constructor(pasusi: Pasus[], o: OpcijeSesije = {}) {
    const sema = napraviSemu();
    this.state = EditorState.create({
      doc: pasusiUDok(pasusi, sema),
      plugins: dodaciUredjivaca({
        podrazumevano: o.podrazumevano ?? PODRAZUMEVANO, skala: 1, skalaProreda: 1, ostalo: o.ostalo ?? 0,
        prekoracenje: o.prekoracenje ?? (() => undefined), naEsc: o.naEsc ?? (() => true),
      }),
    });
  }

  readonly dispatch = (tr: Transaction): void => {
    let s = this.state.apply(tr);
    const k = dodeliKljuceve(s, this.brojac);
    if (k) s = s.apply(k);
    this.state = s;
  };

  get dok(): PmCvor {
    return this.state.doc;
  }

  izvrsi(c: Command): boolean {
    return c(this.state, this.dispatch);
  }

  izaberi(od: number, doPoz = od): void {
    this.dispatch(this.state.tr.setSelection(TextSelection.create(this.state.doc, od, doPoz)));
  }

  /** Kucanje na mestu izbora (kao unos iz pregledača: sačuvani markovi ili markovi kursora). */
  kucaj(tekst: string): void {
    this.dispatch(this.state.tr.insertText(tekst));
  }

  pasusi(): Pasus[] {
    return dokUPasuse(this.state.doc);
  }
}
