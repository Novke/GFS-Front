// Komande uređivača teksta (F12) nad ProseMirror stanjem, bez Angular-a: Enter, Shift+Enter, Tab, lepljenje, stil dela i
// atributi pasusa. Atributi čvora se NIKAD ne menjaju na mestu: svaka izmena ide kroz `setNodeMarkup` sa novim objektom
// (`noviAtributi`, duboka kopija), jer su podrazumevani objekti šeme deljeni među čvorovima (zamrznuti, pm-sema).
import { baseKeymap } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Mark, Node as PmCvor, ResolvedPos } from 'prosemirror-model';
import { type Command, type EditorState, type Plugin, TextSelection, type Transaction } from 'prosemirror-state';
import type { Pasus } from '../../data-access/platno.models';
import { PODRAZUMEVANI_STIL } from './pm-konverzija';
import type { AtributiDela, AtributiPasusa } from './pm-sema';
import { MAX_NIVO, type StanjeSelekcije, novaLista, uvlacenjeListe } from './stil-teksta';

type Dispatch = (tr: Transaction) => void;
export type PoljeStila = 'podebljano' | 'kurziv' | 'podvuceno' | 'precrtano';

const POLJA_STILA = ['font', 'velicina', 'boja', 'podebljano', 'kurziv', 'podvuceno', 'precrtano', 'polozaj'] as const;

const stilIz = (marks: readonly Mark[]): AtributiDela | null =>
  (marks.find((m) => m.type.name === 'stil')?.attrs as AtributiDela | undefined) ?? null;

/** Novi (duboko kopirani) atributi pasusa sa izmenama: nijedan objekat se ne deli sa starim čvorom ni sa pozivaocem. */
function noviAtributi(a: AtributiPasusa, izmena: Partial<AtributiPasusa>): AtributiPasusa {
  return structuredClone({ ...a, ...izmena });
}

/** Stil na kursoru: sačuvani markovi, pa markovi pozicije, pa `prazanDeo` pasusa. */
function stilKursora(state: EditorState, $poz: ResolvedPos = state.selection.$from): AtributiDela | null {
  return stilIz(state.storedMarks ?? $poz.marks()) ?? ($poz.parent.attrs as AtributiPasusa).prazanDeo ?? null;
}

/** Pasusi (čvor, pozicija) koje izbor dodiruje, redom. */
function pasusiIzbora(state: EditorState): { cvor: PmCvor; pos: number }[] {
  const { $from, $to } = state.selection;
  const od = $from.depth >= 1 ? $from.before(1) : 0;
  const doPoz = $to.depth >= 1 ? $to.after(1) : state.doc.content.size;
  const rezultat: { cvor: PmCvor; pos: number }[] = [];
  state.doc.forEach((cvor, pos) => {
    if (pos >= od && pos < doPoz) rezultat.push({ cvor, pos });
  });
  return rezultat;
}

/**
 * Enter: nov pasus nasleđuje atribute pasusa (lista, nivo, uvlačenje, ...), `prazanDeo` null. Ključ (odluka 17) ostaje
 * delu koji drži sadržaj: na početku nepraznog pasusa to je DONJI deo (gornji, nov i prazan, nema ključ), inače GORNJI.
 * Sopstveni split jer `splitBlock` ostavlja isti ključ u obe polovine, a na kraju pasusa pravi pasus sa podrazumevanim
 * atributima (Enter na kraju stavke liste bi izbacio iz liste). Kucanje se nastavlja stilom pre kursora (kao PowerPoint).
 */
export function podeliPasus(state: EditorState, dispatch?: Dispatch): boolean {
  const { $from, $to } = state.selection;
  if (!$from.parent.isTextblock) return false;
  if (dispatch) {
    const markovi = state.storedMarks ?? ($to.parentOffset ? $from.marks() : null);
    const tr = state.tr.deleteSelection();
    const $poz = tr.doc.resolve(tr.mapping.map($to.pos));
    const roditelj = $poz.parent;
    const a = roditelj.attrs as AtributiPasusa;
    const naPocetku = $poz.parentOffset === 0 && roditelj.content.size > 0;
    const gornji = noviAtributi(a, { prazanDeo: null, kljuc: naPocetku ? null : a.kljuc });
    const donji = noviAtributi(a, { prazanDeo: null, kljuc: naPocetku ? a.kljuc : null });
    tr.setNodeMarkup($poz.before(), undefined, gornji);
    // setNodeMarkup ne pomera pozicije, pa $poz.pos (već u koordinatama tr.doc) važi i dalje
    tr.split($poz.pos, 1, [{ type: state.schema.nodes['pasus'], attrs: donji }]);
    if (markovi) tr.ensureMarks(markovi);
    dispatch(tr.scrollIntoView());
  }
  return true;
}

/** Shift+Enter: prelom reda u istom pasusu (čvor `prelom` = `\n`, PowerPointov `a:br`) u stilu kursora. */
export function umetniPrelom(state: EditorState, dispatch?: Dispatch): boolean {
  const { $from } = state.selection;
  if (!$from.parent.isTextblock) return false;
  if (dispatch) {
    const stil = stilKursora(state);
    const markovi = stil ? [state.schema.marks['stil'].create(stil)] : [];
    dispatch(state.tr.replaceSelectionWith(state.schema.nodes['prelom'].create(null, null, markovi), false).scrollIntoView());
  }
  return true;
}

/**
 * Tab / Shift+Tab (odluka 18): na početku pasusa liste menja nivo (0-8) i uvlačenje; inače Tab upisuje `\t`, a Shift+Tab
 * ne radi ništa. Taster se uvek troši (fokus ne izlazi iz teksta; iz uređivanja se izlazi sa Esc).
 */
export function tabIliNivo(smer: 1 | -1): Command {
  return (state, dispatch) => {
    const { $from, empty } = state.selection;
    if (!$from.parent.isTextblock) return false;
    const a = $from.parent.attrs as AtributiPasusa;
    if (empty && $from.parentOffset === 0 && a.lista) {
      const nivo = Math.min(MAX_NIVO, Math.max(0, a.nivo + smer));
      if (nivo !== a.nivo && dispatch) {
        dispatch(state.tr.setNodeMarkup($from.before(), undefined, noviAtributi(a, { nivo, uvlacenje: uvlacenjeListe(nivo) })));
      }
      return true;
    }
    if (smer === 1 && dispatch) dispatch(state.tr.insertText('\t').scrollIntoView());
    return true;
  };
}

/**
 * Lepljenje (samo običan tekst, odluka 17): `\r\n`, `\r` i `\n` dele pasuse; novi pasusi nasleđuju atribute pasusa kursora
 * i nemaju ključ (dobiće ga `dodeliKljuceve`), a ključ ostaje pasusu koji drži stari sadržaj (kao Enter). Tekst je u
 * stilu kursora (sačuvani markovi, markovi pozicije, `prazanDeo`).
 */
export function nalepiTekst(state: EditorState, tekst: string): Transaction {
  const redovi = tekst.split(/\r\n|\r|\n/);
  const stil = stilKursora(state);
  const markovi = stil ? [state.schema.marks['stil'].create(stil)] : [];
  const tr = state.tr;
  if (!state.selection.empty) tr.deleteSelection();
  const $poz = tr.selection.$from;
  const roditelj = $poz.parent;
  const a = roditelj.attrs as AtributiPasusa;
  const naPocetku = $poz.parentOffset === 0 && roditelj.content.size > 0 && redovi.length > 1;
  const pocetak = $poz.before();
  let pos = $poz.pos;
  redovi.forEach((red, i) => {
    if (i > 0) {
      tr.split(pos, 1, [{ type: state.schema.nodes['pasus'], attrs: noviAtributi(a, { kljuc: null, prazanDeo: null }) }]);
      pos += 2;
    }
    if (red) {
      tr.insert(pos, state.schema.text(red, markovi));
      pos += red.length;
    }
  });
  if (naPocetku) {
    tr.setNodeMarkup(pocetak, undefined, noviAtributi(tr.doc.nodeAt(pocetak)!.attrs as AtributiPasusa, { kljuc: null }));
    const $kraj = tr.doc.resolve(pos);
    tr.setNodeMarkup($kraj.before(), undefined, noviAtributi($kraj.parent.attrs as AtributiPasusa, { kljuc: a.kljuc }));
  }
  tr.setSelection(TextSelection.create(tr.doc, pos));
  return tr.scrollIntoView();
}

/**
 * Stil dela nad izborom; prazan izbor -> sačuvani markovi (sledeće kucanje), a prazan pasus pamti stil i u `prazanDeo`.
 * Prazni pasusi unutar izbora takođe dobijaju stil (kao PowerPointov kraj pasusa).
 */
export function postaviStil(izmena: Partial<AtributiDela>): Command {
  return (state, dispatch) => {
    if (!dispatch) return true;
    const tip = state.schema.marks['stil'];
    const { from, to, empty, $from } = state.selection;
    const tr = state.tr;
    const prazanPasus = (cvor: PmCvor, pos: number) => {
      const a = cvor.attrs as AtributiPasusa;
      tr.setNodeMarkup(pos, undefined, noviAtributi(a, { prazanDeo: { ...(a.prazanDeo ?? PODRAZUMEVANI_STIL), ...izmena } }));
    };
    if (empty) {
      const novi = { ...(stilKursora(state) ?? PODRAZUMEVANI_STIL), ...izmena };
      if ($from.parent.content.size === 0 && $from.depth >= 1) prazanPasus($from.parent, $from.before());
      // posle koraka (setNodeMarkup briše sačuvane markove), pa tek onda sačuvani markovi
      tr.setStoredMarks([tip.create(novi)]);
    } else {
      state.doc.nodesBetween(from, to, (cvor, pos) => {
        if (cvor.type.name === 'pasus' && cvor.content.size === 0) prazanPasus(cvor, pos);
        if (!cvor.isInline) return true;
        const stari = stilIz(cvor.marks) ?? PODRAZUMEVANI_STIL;
        tr.addMark(Math.max(pos, from), Math.min(pos + cvor.nodeSize, to), tip.create({ ...stari, ...izmena }));
        return false;
      });
    }
    dispatch(tr);
    return true;
  };
}

/** Uključi ili isključi ukras nad izborom: ako ga ceo izbor već ima -> isključi, inače (i mešano) uključi. */
export function prebaciStil(polje: PoljeStila): Command {
  return (state, dispatch) => postaviStil({ [polje]: stanjeSelekcije(state)[polje] !== true })(state, dispatch);
}

/** Atributi svih pasusa u izboru (nove kopije objekata, nikad deljeni). */
export function postaviPasus(izmena: Partial<Omit<Pasus, 'delovi'>>): Command {
  return (state, dispatch) => {
    if (dispatch) {
      const tr = state.tr;
      for (const { cvor, pos } of pasusiIzbora(state)) tr.setNodeMarkup(pos, undefined, noviAtributi(cvor.attrs as AtributiPasusa, izmena));
      dispatch(tr);
    }
    return true;
  };
}

/**
 * Lista nad pasusima izbora (odluka 18): ako su svi već te vrste -> bez liste i bez uvlačenja; inače svi postaju ta vrsta
 * (znak `•` ili broj `ARAPSKI_TACKA` od 1; pasus koji je već te vrste zadržava svoju), uvlačenje `uvlacenjeListe(nivo)`.
 */
export function prebaciListu(vrsta: 'ZNAK' | 'BROJ'): Command {
  return (state, dispatch) => {
    if (dispatch) {
      const pasusi = pasusiIzbora(state);
      const svi = pasusi.every(({ cvor }) => (cvor.attrs as AtributiPasusa).lista?.vrsta === vrsta);
      const tr = state.tr;
      for (const { cvor, pos } of pasusi) {
        const a = cvor.attrs as AtributiPasusa;
        const izmena: Partial<AtributiPasusa> = svi
          ? { lista: null, uvlacenje: { levo: 0, prviRed: 0 } }
          : { lista: a.lista?.vrsta === vrsta ? a.lista : novaLista(vrsta), uvlacenje: uvlacenjeListe(a.nivo) };
        tr.setNodeMarkup(pos, undefined, noviAtributi(a, izmena));
      }
      dispatch(tr);
    }
    return true;
  };
}

/** Nivo pasusa izbora (0-8); pasus liste dobija i uvlačenje nivoa. */
export function promeniNivo(razlika: 1 | -1): Command {
  return (state, dispatch) => {
    if (dispatch) {
      const tr = state.tr;
      for (const { cvor, pos } of pasusiIzbora(state)) {
        const a = cvor.attrs as AtributiPasusa;
        const nivo = Math.min(MAX_NIVO, Math.max(0, a.nivo + razlika));
        if (nivo !== a.nivo) tr.setNodeMarkup(pos, undefined, noviAtributi(a, a.lista ? { nivo, uvlacenje: uvlacenjeListe(nivo) } : { nivo }));
      }
      if (tr.docChanged) dispatch(tr);
    }
    return true;
  };
}

/** Jedna vrednost ako je ista za sve, inače null (mešano). */
function jedna<T>(vrednosti: readonly T[]): T | null {
  return vrednosti.length && vrednosti.every((v) => v === vrednosti[0]) ? vrednosti[0] : null;
}

/** Stil izbora za panel teksta (F13): vrednosti delova i pasusa izbora, null = mešano. */
export function stanjeSelekcije(state: EditorState): StanjeSelekcije {
  const { from, to, empty } = state.selection;
  const stilovi: AtributiDela[] = [];
  if (!empty) {
    state.doc.nodesBetween(from, to, (cvor) => {
      if (!cvor.isInline) return true;
      const s = stilIz(cvor.marks);
      if (s) stilovi.push(s);
      return false;
    });
  }
  if (!stilovi.length) {
    const s = stilKursora(state);
    if (s) stilovi.push(s);
  }
  const deo = Object.fromEntries(POLJA_STILA.map((k) => [k, jedna(stilovi.map((s) => s[k]))])) as {
    [K in (typeof POLJA_STILA)[number]]: AtributiDela[K] | null;
  };
  const pasusi = pasusiIzbora(state).map(({ cvor }) => cvor.attrs as AtributiPasusa);
  return {
    ...deo,
    poravnanje: jedna(pasusi.map((p) => p.poravnanje)),
    lista: jedna(pasusi.map((p) => p.lista?.vrsta ?? 'BEZ')),
    nivo: jedna(pasusi.map((p) => p.nivo)),
    proredProcenat: jedna(pasusi.map((p) => p.proredProcenat)),
    razmakPre: jedna(pasusi.map((p) => p.razmakPre)),
    razmakPosle: jedna(pasusi.map((p) => p.razmakPosle)),
  };
}

/** Ctrl+A: ceo tekst kao tekstualni izbor (od prvog do poslednjeg pasusa), pa kucanje preko njega zadržava prvi pasus. */
export function izaberiSav(state: EditorState, dispatch?: Dispatch): boolean {
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, 1, state.doc.content.size - 1)));
  return true;
}

/**
 * Tasteri uređivača (pre `baseKeymap`): Enter, Shift+Enter, Tab, poništi/ponovi, B/I/U, Ctrl+A i Esc. `naTab` (ćelija
 * tabele, F14) zamenjuje Tab / Shift+Tab: prelaz na sledeću / prethodnu ćeliju.
 */
export function tasteriUredjivaca(naEsc: () => boolean, naTab?: (smer: 1 | -1) => boolean): Plugin[] {
  return [
    keymap({
      Enter: podeliPasus,
      'Shift-Enter': umetniPrelom,
      Tab: naTab ? () => naTab(1) : tabIliNivo(1),
      'Shift-Tab': naTab ? () => naTab(-1) : tabIliNivo(-1),
      'Mod-z': undo,
      'Mod-y': redo,
      'Shift-Mod-z': redo,
      'Mod-b': prebaciStil('podebljano'),
      'Mod-i': prebaciStil('kurziv'),
      'Mod-u': prebaciStil('podvuceno'),
      'Mod-a': izaberiSav,
      Escape: () => naEsc(),
    }),
    keymap(baseKeymap),
  ];
}
