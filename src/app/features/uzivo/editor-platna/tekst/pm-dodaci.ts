// Dodaci (plugin-i) uređivača teksta (F12): stil teksta bez marka i praznih pasusa, prikaz pasusa (isti stil kao prikaz
// platna) i granica znakova slajda. Bez Angular-a; uređivač ih sastavlja kroz `dodaciUredjivaca`.
import { history } from 'prosemirror-history';
import type { Node as PmCvor } from 'prosemirror-model';
import { type EditorState, Plugin, type Transaction } from 'prosemirror-state';
import { Mapping } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { GRANICE, codePointa } from '../../data-access/platno-provera';
import { METRIKA, type Metrika } from '../../ui/platno-metrika';
import { prikazPasusa } from '../../ui/platno-tekst';
import { dokUPasuse, istiStil } from './pm-konverzija';
import { tasteriUredjivaca } from './pm-komande';
import { type AtributiDela, type AtributiPasusa, uCss } from './pm-sema';

const stilIz = (cvor: PmCvor): AtributiDela | null =>
  (cvor.marks.find((m) => m.type.name === 'stil')?.attrs as AtributiDela | undefined) ?? null;

/**
 * Stil koji pamti pasus koji je postao (ili ostao) prazan: sačuvani markovi kad je kursor u njemu (npr. posle Enter-a na
 * kraju), pa stil teksta koji je tu bio u starom dokumentu (obrisan tekst; Enter na kraju pasusa: stil kraja gornjeg),
 * pa `prazanDeo` tog starog pasusa, pa prethodni stil u dokumentu, pa podrazumevani.
 */
function stilPraznog(
  novi: EditorState, stari: EditorState, nazad: Mapping, pos: number, prethodni: AtributiDela | null, podrazumevano: AtributiDela,
): AtributiDela {
  const { $from } = novi.selection;
  if ($from.depth >= 1 && $from.before(1) === pos) {
    const sacuvan = novi.storedMarks?.find((m) => m.type.name === 'stil');
    if (sacuvan) return sacuvan.attrs as AtributiDela;
  }
  const staraPoz = Math.min(Math.max(nazad.map(pos + 1, -1), 0), stari.doc.content.size);
  const $s = stari.doc.resolve(staraPoz);
  if ($s.depth >= 1) {
    const izMarkova = $s.marks().find((m) => m.type.name === 'stil');
    if (izMarkova) return izMarkova.attrs as AtributiDela;
    const pasus = $s.node(1);
    let prvi: AtributiDela | null = null;
    pasus.forEach((d) => (prvi ??= stilIz(d)));
    const iz = prvi ?? (pasus.attrs as AtributiPasusa).prazanDeo;
    if (iz) return iz;
  }
  return prethodni ?? podrazumevano;
}

/**
 * Svaki tekst i prelom bez marka `stil` dobija stil (prazanDeo pasusa, pa prethodni stil u dokumentu, pa `podrazumevano`);
 * pasus koji postane prazan pamti stil u `prazanDeo`, neprazan ga briše. Tako tekst bez marka (lepljenje, prevlačenje,
 * kucanje u prazan pasus) nikad tiho ne nestane iz modela, a prazan red zadržava font i veličinu (odluka 9 faze 1).
 */
export function dodatakStila(podrazumevano: AtributiDela): Plugin {
  return new Plugin({
    appendTransaction(transakcije, stari, novi) {
      if (!transakcije.some((t) => t.docChanged)) return null;
      const nazad = new Mapping();
      transakcije.forEach((t) => nazad.appendMapping(t.mapping));
      const unazad = nazad.invert();
      const tip = novi.schema.marks['stil'];
      let tr: Transaction | null = null;
      let prethodni: AtributiDela | null = null;
      novi.doc.forEach((pasus, pos) => {
        const a = pasus.attrs as AtributiPasusa;
        pasus.forEach((dete, pomeraj) => {
          const stil = stilIz(dete);
          if (stil) {
            prethodni = stil;
            return;
          }
          const s: AtributiDela = a.prazanDeo ?? prethodni ?? podrazumevano;
          const od = pos + 1 + pomeraj;
          tr ??= novi.tr;
          tr.addMark(od, od + dete.nodeSize, tip.create(s));
          prethodni = s;
        });
        if (pasus.content.size > 0) {
          if (a.prazanDeo) (tr ??= novi.tr).setNodeMarkup(pos, undefined, { ...a, prazanDeo: null });
        } else if (!a.prazanDeo) {
          const prazanDeo = { ...stilPraznog(novi, stari, unazad, pos, prethodni, podrazumevano) };
          (tr ??= novi.tr).setNodeMarkup(pos, undefined, { ...a, prazanDeo });
        }
      });
      return tr;
    },
  });
}

/** Oznaka liste kao widget (nije deo teksta; isti stil kao `uz-pl-oznaka` prikaza). */
function oznaka(tekst: string, stil: string) {
  return (view: { dom: Element }) => {
    const span = view.dom.ownerDocument.createElement('span');
    span.className = 'uz-pl-oznaka';
    span.setAttribute('style', stil);
    span.textContent = tekst;
    return span;
  };
}

interface OpcijePasusa { skala: number; skalaProreda: number; metrika?: Metrika; }

function dekoracije(dok: PmCvor, o: OpcijePasusa): DecorationSet {
  const prikaz = prikazPasusa(dokUPasuse(dok), { skala: o.skala, skalaProreda: o.skalaProreda, metrika: o.metrika ?? METRIKA });
  const lista: Decoration[] = [];
  dok.forEach((cvor, pos, i) => {
    const p = prikaz[i];
    lista.push(Decoration.node(pos, pos + cvor.nodeSize, { style: uCss(p.stil) }));
    if (p.oznaka) {
      const stil = uCss(p.oznaka.stil);
      lista.push(Decoration.widget(pos + 1, oznaka(p.oznaka.tekst, stil), {
        side: -1, ignoreSelection: true, key: `oznaka:${p.oznaka.tekst}:${stil}`,
      }));
    }
    // uzastopna deca istog stila su jedan deo (kao `dokUPasuse`); deo j prikaza nosi `line-height` kad mu font ima
    // drugačiji prost prored od prvog dela (`delovi()` u platno-tekst.ts)
    let j = 0;
    let niz: { od: number; do: number; stil: AtributiDela | null } | null = null;
    const zatvori = () => {
      if (!niz) return;
      const visina = p.delovi[j++]?.stil['line-height'];
      if (visina) lista.push(Decoration.inline(niz.od, niz.do, { style: `line-height: ${visina}` }));
    };
    cvor.forEach((dete, pomeraj) => {
      const od = pos + 1 + pomeraj;
      const stil = stilIz(dete);
      if (niz && niz.stil && stil && istiStil(niz.stil, stil)) {
        niz.do = od + dete.nodeSize;
        return;
      }
      zatvori();
      niz = { od, do: od + dete.nodeSize, stil };
    });
    zatvori();
  });
  return DecorationSet.create(dok, lista);
}

/**
 * Stil `<p>` i oznake liste kao dekoracije čvora, i `line-height` dela drugog fonta kao inline dekoracija (sve iz
 * `prikazPasusa` nad celim dokumentom, isto kao prikaz). Računa se ponovo samo kad se dokument promeni. `metrika` je
 * `METRIKA` prikaza (testovi daju svoju).
 */
export function dodatakPasusa(o: OpcijePasusa): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    state: {
      init: (_, state) => dekoracije(state.doc, o),
      apply: (tr, stare, _, novo) => (tr.docChanged ? dekoracije(novo.doc, o) : stare),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}

/** Znaci dokumenta kao na serveru: code point-i teksta, prelom = 1 (`\n`); granice pasusa se ne broje. */
const KES_ZNAKOVA = new WeakMap<PmCvor, number>();
export function znakovaDokumenta(dok: PmCvor): number {
  const kes = KES_ZNAKOVA.get(dok);
  if (kes !== undefined) return kes;
  let n = 0;
  dok.descendants((c) => {
    if (c.isText) n += codePointa(c.text ?? '');
    else if (c.isLeaf) n++;
    return true;
  });
  KES_ZNAKOVA.set(dok, n);
  return n;
}

/**
 * Odbija transakciju koja bi prešla 50 000 znakova na slajdu (`ostalo` = znaci ostalih slojeva); javlja `prekoracenje`.
 * Transakcija koja ne povećava broj znakova (brisanje) uvek prolazi.
 */
export function dodatakGranice(ostalo: number, prekoracenje: () => void): Plugin {
  return new Plugin({
    filterTransaction(tr, state) {
      if (!tr.docChanged) return true;
      const posle = znakovaDokumenta(tr.doc);
      if (posle + ostalo <= GRANICE.znakova || posle <= znakovaDokumenta(state.doc)) return true;
      prekoracenje();
      return false;
    },
  });
}

export interface OpcijeUredjivaca {
  /** Stil teksta kad ga ništa drugo ne daje (prvi deo sloja ili telo teme). */
  podrazumevano: AtributiDela;
  /** `okvir.skala` i `okvir.skalaProreda` sloja (autofit), kao prikaz. */
  skala: number;
  skalaProreda: number;
  /** Znaci ostalih slojeva slajda. */
  ostalo: number;
  prekoracenje: () => void;
  /** Esc: kraj uređivanja (true = taster obrađen). */
  naEsc: () => boolean;
}

/** Svi dodaci uređivača, redom: granica, istorija, tasteri, stil, prikaz pasusa. */
export function dodaciUredjivaca(o: OpcijeUredjivaca): Plugin[] {
  return [
    dodatakGranice(o.ostalo, o.prekoracenje),
    history(),
    ...tasteriUredjivaca(o.naEsc),
    dodatakStila(o.podrazumevano),
    dodatakPasusa({ skala: o.skala, skalaProreda: o.skalaProreda }),
  ];
}
