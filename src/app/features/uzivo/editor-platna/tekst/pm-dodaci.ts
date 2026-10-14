// Dodaci (plugin-i) uređivača teksta (F12): stil teksta bez marka i praznih pasusa, prikaz pasusa (isti stil kao prikaz
// platna) i granica znakova slajda. Bez Angular-a; uređivač ih sastavlja kroz `dodaciUredjivaca`.
import { history } from 'prosemirror-history';
import type { Node as PmCvor } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from 'prosemirror-state';
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
 * pasus koji postane prazan pamti stil u `prazanDeo`, neprazan ga briše. Prazan pasus koji transakcija nije dirala (npr.
 * `delovi: []` iz modela, crta se 18 pt) ostaje kakav jeste. Tako tekst bez marka (lepljenje, prevlačenje,
 * kucanje u prazan pasus) nikad tiho ne nestane iz modela, a prazan red zadržava font i veličinu (odluka 9 faze 1).
 */
export function dodatakStila(podrazumevano: AtributiDela): Plugin {
  const kljuc = new PluginKey<ReadonlySet<PmCvor>>('stil');
  return new Plugin({
    key: kljuc,
    // pasusi POČETNOG dokumenta sesije: prazan pasus koji istorija vrati (Ctrl+Z posle brisanja) je isti objekat kao na
    // početku, pa ostaje netaknut iako ga nema u stanju neposredno pre poništavanja (F12 rr2/1)
    state: {
      init: (_c, s) => {
        const pocetni = new Set<PmCvor>();
        s.doc.forEach((c) => pocetni.add(c));
        return pocetni;
      },
      apply: (_tr, v) => v,
    },
    appendTransaction(transakcije, stari, novi) {
      if (!transakcije.some((t) => t.docChanged)) return null;
      const nazad = new Mapping();
      transakcije.forEach((t) => nazad.appendMapping(t.mapping));
      const unazad = nazad.invert();
      // pasus koji je ISTI čvor kao u starom dokumentu je netaknut (ProseMirror deli strukturu) i ostaje bajt-isti;
      // identitet, ne opsezi mapa: `setNodeMarkup` suseda pokriva i token granice pa bi "dirao" i ovaj pasus
      const stariCvorovi = new Set<PmCvor>();
      stari.doc.forEach((c) => stariCvorovi.add(c));
      const pocetni = kljuc.getState(novi) ?? new Set<PmCvor>();
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
        } else if (!a.prazanDeo && !stariCvorovi.has(pasus) && !pocetni.has(pasus)) {
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

/**
 * Izbor iz DOM-a pre komande tastature (F19 fix 1). Shift/Ctrl+strelice menja izbor u DOM-u (pregledač), a ProseMirror
 * ga upisuje u stanje tek na `selectionchange` (zaseban zadatak); dok je glavna nit zauzeta sledeći taster (Backspace,
 * Ctrl+B) bi radio nad starim izborom. Zato se pre svakog tastera izbor iz DOM-a prenosi u stanje, samo kad je ceo u
 * uređivaču, razlikuje se od tekstualnog izbora stanja i ne traje kompozicija (IME). Taster ide dalje (`false`).
 */
export function dodatakIzboraIzDoma(): Plugin {
  return new Plugin({
    props: {
      handleKeyDown(view) {
        const d = view.dom.ownerDocument.getSelection();
        const s = view.state.selection;
        if (view.composing || !(s instanceof TextSelection) || !d?.anchorNode || !d.focusNode
          || !view.dom.contains(d.anchorNode) || !view.dom.contains(d.focusNode)) return false;
        const a = view.posAtDOM(d.anchorNode, d.anchorOffset);
        const h = view.posAtDOM(d.focusNode, d.focusOffset);
        const doc = view.state.doc;
        if ((a === s.anchor && h === s.head) || !doc.resolve(a).parent.inlineContent || !doc.resolve(h).parent.inlineContent) return false;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, a, h)));
        return false;
      },
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
  /** Tab / Shift+Tab u ćeliji tabele (F14): sledeća / prethodna ćelija; bez njega Tab je znak ili nivo liste. */
  naTab?: (smer: 1 | -1) => boolean;
}

/** Svi dodaci uređivača, redom: izbor iz DOM-a (pre tastera), granica, istorija, tasteri, stil, prikaz pasusa. */
export function dodaciUredjivaca(o: OpcijeUredjivaca): Plugin[] {
  return [
    dodatakIzboraIzDoma(),
    dodatakGranice(o.ostalo, o.prekoracenje),
    history(),
    ...tasteriUredjivaca(o.naEsc, o.naTab),
    dodatakStila(o.podrazumevano),
    dodatakPasusa({ skala: o.skala, skalaProreda: o.skalaProreda }),
  ];
}
