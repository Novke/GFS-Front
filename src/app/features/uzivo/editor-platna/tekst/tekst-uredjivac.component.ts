// Uređivač teksta na platnu (F12, odluka 4 i 17): ProseMirror `EditorView` montiran na `div.uz-pl-sadrzaj.uz-pl-tekst`
// sloja u uređivanju, sa istim klasama i funkcijama stila kao prikaz (`stilOkvira`, `prikazPasusa` kroz dodatak pasusa,
// `stilDela` kroz mark), pa su raspored, prelom i fontovi isti kao na projektoru. Registruje se u `PlatnoEditorStore` kao
// aktivni uređivač: store kroz `presek()` uzima tekst (pražnjenje pre čuvanja, kraj sesije, uništavanje), a rezultat se
// računa iz poslednjeg dokumenta, pa radi i kad je `EditorView` već uništen (promena slajda). Ćelija tabele (F14) koristi
// isti uređivač: editor mu daje TEKST sloj sastavljen od pasusa, sidra i popune ćelije, uz `celija` (Tab prelazi ćelije).
// Granica istorije: presek primljen usred sesije (Ctrl+S, izmena okvira iz panela, kopiraj) je već korak platna, pa
// ProseMirror-ovo poništavanje (Ctrl+Z u tekstu, panel, traka) ne prelazi stanje tog preseka; dalje ide istorija platna.
import {
  type AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, type OnDestroy, type OnInit, type Signal, ViewEncapsulation,
  afterNextRender, computed, inject, input, signal, untracked, viewChild,
} from '@angular/core';
import type { Node as PmCvor } from 'prosemirror-model';
import { closeHistory, isHistoryTransaction, redo, redoDepth, undo, undoDepth } from 'prosemirror-history';
import { type Command, EditorState, Selection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { NotificationStore } from '../../../../core/state/notification.store';
import type { Pasus, Tema, TekstSloj } from '../../data-access/platno.models';
import { deoTeme } from '../../data-access/platno-novo';
import { znakovaSloja } from '../../data-access/platno-provera';
import { stilOkvira } from '../../ui/platno-tekst';
import { FokusPlatna } from '../fokus-platna';
import { nazivSloja } from '../komande';
import { PlatnoEditorStore } from '../platno-editor.store';
import type { Polje } from '../tabela';
import { dodeliKljuceve, kljuceviPasusa, mapaPoKljucevima } from './kljucevi-pasusa';
import { atributiDela, dokUPasuse, pasusiUDok } from './pm-konverzija';
import { dodaciUredjivaca } from './pm-dodaci';
import {
  type PoljeStila, nalepiTekst, postaviPasus, postaviStil, prebaciListu, prebaciStil, promeniNivo, stanjeSelekcije,
} from './pm-komande';
import { type AtributiDela, napraviSemu } from './pm-sema';
import type { StanjeSelekcije } from './stil-teksta';

/** Rezultat preseka: pasusi sloja i mapa stari indeks pasusa -> novi (ili null: pasus više ne postoji). */
export interface RezultatTeksta { pasusi: Pasus[]; mapa: (number | null)[]; }

/** Ono što store i panel teksta (F13) vide od aktivnog uređivača. */
export interface KomandeTeksta {
  /** Od početka sesije (ili poslednjeg preseka); null bez izmena; radi i posle uništenja view-a. */
  presek(): RezultatTeksta | null;
  /** Poslednji presek nije primljen (store ga je odbio): osnova se vraća, pa sledeći presek opet daje isti tekst. */
  odbaciPresek(): void;
  postaviStil(izmena: Partial<AtributiDela>): void;
  prebaciStil(polje: PoljeStila): void;
  postaviPasus(izmena: Partial<Omit<Pasus, 'delovi'>>): void;
  prebaciListu(vrsta: 'ZNAK' | 'BROJ'): void;
  promeniNivo(razlika: 1 | -1): void;
  readonly stanje: Signal<StanjeSelekcije>;
  fokus(): void;
  /**
   * Poništi / ponovi u istoriji uređivača (ProseMirror), bez fokusa: undo/redo iz panela tokom sesije (zajednički krug
   * F12/F13). false = nema šta (pozivalac tada ide na istoriju platna). Poništavanje ne prelazi granicu poslednjeg
   * primljenog preseka usred sesije (taj tekst je već korak platna).
   */
  ponisti(): boolean;
  ponovi(): boolean;
  /** Ima li istorija uređivača korak nazad (iznad granice) / napred (dugmad Poništi/Ponovi na traci tokom sesije). */
  readonly istorija: Signal<{ nazad: boolean; napred: boolean }>;
}

/** Id skrivenog opisa tastera uređivača (u šablonu editora platna). */
export const ID_POMOCI_TEKSTA = 'uz-ep-tekst-pomoc';

/**
 * Stil uređivača (globalan: `ViewEncapsulation.None`). Svako pravilo počinje sa `.uz-ep-uredjivanje` (sloj za uređivanje
 * editora), nikad golo `.uz-pl-*`, jer bi inače pogodilo i projektor. `prosemirror-view/style/prosemirror.css` se ne
 * uvozi (odluka 4): ovde su samo pravila koja uređivaču trebaju; `font-variant-ligatures` ostaje kao u prikazu. U ćeliji
 * tabele (F14) sadržaj je u toku (ne `inset: 0`), pa ćelija uređivača raste dok se kuca (najmanja visina je ćelija).
 */
export const STIL_UREDJIVACA = `
.uz-ep-uredjivanje { pointer-events: none; }
.uz-ep-uredjivanje .uz-ep-celija > app-tekst-uredjivac { display: flex; flex-direction: column; flex: 1 0 auto; }
.uz-ep-uredjivanje .uz-ep-celija .uz-pl-sadrzaj { position: relative; inset: auto; flex: 1 0 auto; }
.uz-ep-uredjivanje .uz-pl-sloj { pointer-events: auto; outline: 1px dashed var(--primary); }
.uz-ep-uredjivanje .uz-pl-tekst {
  white-space: pre-wrap; word-wrap: break-word; outline: none; caret-color: currentColor; cursor: text;
}
.uz-ep-uredjivanje .uz-pl-tekst--bez-preloma { white-space: pre; }
.uz-ep-uredjivanje .ProseMirror-hideselection *::selection { background: transparent; }
.uz-ep-uredjivanje .ProseMirror-hideselection { caret-color: transparent; }
.uz-ep-uredjivanje .ProseMirror-widget { user-select: none; }
.uz-ep-uredjivanje img.ProseMirror-separator { display: inline !important; border: none !important; margin: 0 !important; }
`;

const PRAZNO_STANJE: StanjeSelekcije = {
  font: null, velicina: null, boja: null, podebljano: null, kurziv: null, podvuceno: null, precrtano: null, polozaj: null,
  poravnanje: null, lista: null, nivo: null, proredProcenat: null, razmakPre: null, razmakPosle: null, polozaji: [], liste: [],
};
const PORUKA_ZNAKOVA = 'Slajd može imati najviše 50000 znakova teksta.';

@Component({
  selector: 'app-tekst-uredjivac',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styles: [STIL_UREDJIVACA],
  template: `<div #koren class="uz-pl-sadrzaj uz-pl-tekst" [class.uz-pl-tekst--bez-preloma]="!prelom()" [style]="okvir()"></div>`,
})
export class TekstUredjivacComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Sloj na početku sesije (čita se jednom; kasnije vrednosti istog sloja posle preseka se ne prenose u view). */
  readonly sloj = input.required<TekstSloj>();
  /** Tema prezentacije: stil teksta kad sloj nema nijedan deo. */
  readonly tema = input.required<Tema>();
  /** Ćelija tabele (F14): `sloj` je tada sastavljen od ćelije; null = TEKST sloj. */
  readonly celija = input<Polje | null>(null);

  private readonly store = inject(PlatnoEditorStore);
  private readonly fokusPlatna = inject(FokusPlatna);
  private readonly obavestenja = inject(NotificationStore);
  private readonly koren = viewChild.required<ElementRef<HTMLElement>>('koren');

  protected readonly okvir = computed(() => {
    const s = this.sloj();
    return stilOkvira(s.okvir, s.popuna, s.ivica);
  });
  protected readonly prelom = computed(() => this.sloj().okvir.prelom);

  private view: EditorView | null = null;
  private pocetak!: EditorState;
  /** Poslednji dokument (posle svake transakcije) i dokument poslednjeg preseka; nepromenljivi, pa važe i bez view-a. */
  private dok!: PmCvor;
  private dokPreseka!: PmCvor;
  private kljuceviPreseka: (string | null)[] = [];
  /** Osnova pre poslednjeg preseka (za `odbaciPresek`); null kad nema šta da se vrati. */
  private prethodnaOsnova: { dok: PmCvor; kljucevi: (string | null)[] } | null = null;
  private podrazumevano!: AtributiDela;
  /**
   * Granica istorije: broj događaja ProseMirror istorije u trenutku poslednjeg primljenog preseka (i pre njega, za
   * `odbaciPresek`). Poništavanje ispod nje bi vratilo tekst koji je već korak platna.
   */
  private granica = 0;
  private prethodnaGranica = 0;
  private readonly brojac = { n: 0 };
  private readonly stanje = signal<StanjeSelekcije>(PRAZNO_STANJE);
  private readonly koraci = signal({ nazad: false, napred: false }, { equal: (a, b) => a.nazad === b.nazad && a.napred === b.napred });

  readonly komande: KomandeTeksta = {
    presek: () => this.presek(),
    odbaciPresek: () => this.odbaciPresek(),
    postaviStil: (izmena) => this.izvrsi(postaviStil(izmena)),
    prebaciStil: (polje) => this.izvrsi(prebaciStil(polje)),
    postaviPasus: (izmena) => this.izvrsi(postaviPasus(izmena)),
    prebaciListu: (vrsta) => this.izvrsi(prebaciListu(vrsta)),
    promeniNivo: (razlika) => this.izvrsi(promeniNivo(razlika)),
    stanje: this.stanje.asReadonly(),
    fokus: () => this.view?.focus(),
    ponisti: () => !!this.view && undoDepth(this.view.state) > this.granica && this.istorija(undo),
    ponovi: () => this.istorija(redo),
    istorija: this.koraci.asReadonly(),
  };

  constructor() {
    afterNextRender(() => this.view?.focus());
  }

  /**
   * Ctrl+Z (i Undo pregledača) u tekstu kad ProseMirror nema korak iznad granice preseka: kao Poništi iz panela i trake, sesija
   * se završava i poništava se poslednji korak platna; fokus tada prelazi na okvir (uređivača više nema). Kad presek nije
   * primljen (granica znakova, gest), sesija i fokus ostaju.
   */
  private ponistiNaPlatnu(): void {
    this.store.ponisti();
    if (!this.store.uredjivanje()) this.fokusPlatna.fokus();
  }

  /** ProseMirror view (testovi i panel teksta); null pre crtanja i posle uništenja. */
  pogled(): EditorView | null {
    return this.view;
  }

  ngOnInit(): void {
    const s = untracked(this.sloj);
    const prvi = s.pasusi[0]?.delovi[0];
    this.podrazumevano = prvi ? atributiDela(prvi) : atributiDela(deoTeme(untracked(this.tema), 'telo', 24));
    // znaci ostatka slajda: sve minus tekst koji se uređuje (sloj ili samo ta ćelija)
    const ostalo = this.store.platno().slojevi.reduce((n, x) => n + znakovaSloja(x), 0) - znakovaSloja(s);
    const celija = untracked(this.celija);
    const doc = pasusiUDok(s.pasusi, napraviSemu(s.okvir.skala));
    this.pocetak = EditorState.create({
      doc,
      selection: Selection.atEnd(doc),
      plugins: dodaciUredjivaca({
        podrazumevano: this.podrazumevano, skala: s.okvir.skala, skalaProreda: s.okvir.skalaProreda, ostalo,
        prekoracenje: () => this.obavestenja.greska(PORUKA_ZNAKOVA),
        naEsc: () => {
          // presek nije primljen (granica, gest): sesija ostaje otvorena, pa i fokus ostaje u tekstu
          if (this.store.zavrsiUredjivanje()) this.fokusPlatna.fokus();
          return true;
        },
        naTab: celija ? (smer) => {
          this.store.predjiNaCeliju(smer);
          return true;
        } : undefined,
        // na granici posle preseka kao Poništi iz panela: kraj sesije i korak platna (TALAS-B); bez preseka i bez ijednog
        // koraka kao ranije (false: Ctrl+Z u tekstu ne dira platno, Note F4b RF3)
        ponisti: (state, dispatch) => {
          if (undoDepth(state) > this.granica) return undo(state, dispatch);
          if (!this.granica) return false;
          if (dispatch) this.ponistiNaPlatnu();
          return true;
        },
        // F6: panel Svojstva, sesija i izbor ostaju (povratak: F6 iz panela, koren editora)
        naF6: () => this.fokusPlatna.fokusPanela(),
      }),
    });
    this.dok = this.dokPreseka = doc;
    this.kljuceviPreseka = kljuceviPasusa(doc);
    this.stanje.set(stanjeSelekcije(this.pocetak));
    this.store.registrujUredjivac(this.komande);
  }

  ngAfterViewInit(): void {
    const s = untracked(this.sloj);
    const c = untracked(this.celija);
    this.view = new EditorView({ mount: this.koren().nativeElement }, {
      state: this.pocetak,
      attributes: {
        role: 'textbox', 'aria-multiline': 'true',
        'aria-label': c ? `Tekst ćelije ${c.r + 1}, ${c.k + 1}` : 'Tekst sloja ' + nazivSloja(this.store.platno(), s),
        'aria-describedby': ID_POMOCI_TEKSTA,
      },
      dispatchTransaction: (tr) => this.primeni(tr),
      // lepljenje je samo običan tekst (odluka 17); bez teksta (npr. slika) ništa
      handlePaste: (view, e) => {
        const tekst = e.clipboardData?.getData('text/plain') ?? '';
        if (tekst) view.dispatch(nalepiTekst(view.state, tekst));
        return true;
      },
    });
  }

  ngOnDestroy(): void {
    this.view?.destroy();
    this.view = null;
  }

  /** Transakcija, pa ključevi novim pasusima i duplikatima (Enter, lepljenje, prevlačenje), pa stanje izbora. */
  private primeni(tr: Parameters<EditorView['dispatch']>[0]): void {
    const view = this.view;
    if (!view) return;
    const dubina = undoDepth(view.state);
    let s = view.state.apply(tr);
    const k = dodeliKljuceve(s, this.brojac);
    if (k) s = s.apply(k);
    view.updateState(s);
    this.dok = s.doc;
    // preliv istorije (posle 120 događaja odbacuje najstarijih 20): granica se pomera sa njima
    const posle = undoDepth(s);
    if (!isHistoryTransaction(tr) && posle < dubina) this.granica = Math.max(0, this.granica - (dubina + 1 - posle));
    this.stanje.set(stanjeSelekcije(s));
    this.osveziKorake();
  }

  private osveziKorake(): void {
    const s = this.view?.state;
    if (s) this.koraci.set({ nazad: undoDepth(s) > this.granica, napred: redoDepth(s) > 0 });
  }

  /**
   * Komanda panela teksta nad sačuvanim izborom: svoj korak ProseMirror istorije (`closeHistory` pre i posle), pa Ctrl+Z
   * posle izbora fonta vraća samo font, a ne i kucanje pre njega ni posle njega.
   */
  private izvrsi(c: Command): void {
    const view = this.view;
    if (!view) return;
    c(view.state, (tr) => view.dispatch(closeHistory(tr)));
    view.dispatch(closeHistory(view.state.tr));
  }

  private istorija(c: Command): boolean {
    const view = this.view;
    return !!view && c(view.state, (tr) => view.dispatch(tr));
  }

  private presek(): RezultatTeksta | null {
    if (this.dok.eq(this.dokPreseka)) return null;
    const rezultat = { pasusi: dokUPasuse(this.dok, this.podrazumevano), mapa: mapaPoKljucevima(this.kljuceviPreseka, this.dok) };
    this.prethodnaOsnova = { dok: this.dokPreseka, kljucevi: this.kljuceviPreseka };
    this.dokPreseka = this.dok;
    this.kljuceviPreseka = kljuceviPasusa(this.dok);
    // granica: dalje kucanje je nov događaj istorije, a poništavanje staje na ovom stanju (store ga odbacuje ako odbije)
    this.prethodnaGranica = this.granica;
    const view = this.view;
    if (view) {
      view.dispatch(closeHistory(view.state.tr));
      this.granica = undoDepth(view.state);
      this.osveziKorake();
    }
    return rezultat;
  }

  private odbaciPresek(): void {
    const o = this.prethodnaOsnova;
    if (!o) return;
    this.dokPreseka = o.dok;
    this.kljuceviPreseka = o.kljucevi;
    this.prethodnaOsnova = null;
    this.granica = this.prethodnaGranica;
    this.osveziKorake();
  }
}
