// Uređivač teksta na platnu (F12, odluka 4 i 17): ProseMirror `EditorView` montiran na `div.uz-pl-sadrzaj.uz-pl-tekst`
// sloja u uređivanju, sa istim klasama i funkcijama stila kao prikaz (`stilOkvira`, `prikazPasusa` kroz dodatak pasusa,
// `stilDela` kroz mark), pa su raspored, prelom i fontovi isti kao na projektoru. Registruje se u `PlatnoEditorStore` kao
// aktivni uređivač: store kroz `presek()` uzima tekst (pražnjenje pre čuvanja, kraj sesije, uništavanje), a rezultat se
// računa iz poslednjeg dokumenta, pa radi i kad je `EditorView` već uništen (promena slajda).
import {
  type AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, type OnDestroy, type OnInit, type Signal, ViewEncapsulation,
  afterNextRender, computed, inject, input, signal, untracked, viewChild,
} from '@angular/core';
import type { Node as PmCvor } from 'prosemirror-model';
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
}

/** Id skrivenog opisa tastera uređivača (u šablonu editora platna). */
export const ID_POMOCI_TEKSTA = 'uz-ep-tekst-pomoc';

/**
 * Stil uređivača (globalan: `ViewEncapsulation.None`). Svako pravilo počinje sa `.uz-ep-uredjivanje` (sloj za uređivanje
 * editora), nikad golo `.uz-pl-*`, jer bi inače pogodilo i projektor. `prosemirror-view/style/prosemirror.css` se ne
 * uvozi (odluka 4): ovde su samo pravila koja uređivaču trebaju; `font-variant-ligatures` ostaje kao u prikazu.
 */
export const STIL_UREDJIVACA = `
.uz-ep-uredjivanje { pointer-events: none; }
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
  poravnanje: null, lista: null, nivo: null, proredProcenat: null, razmakPre: null, razmakPosle: null,
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
  private readonly brojac = { n: 0 };
  private readonly stanje = signal<StanjeSelekcije>(PRAZNO_STANJE);

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
  };

  constructor() {
    afterNextRender(() => this.view?.focus());
  }

  /** ProseMirror view (testovi i panel teksta); null pre crtanja i posle uništenja. */
  pogled(): EditorView | null {
    return this.view;
  }

  ngOnInit(): void {
    const s = untracked(this.sloj);
    const prvi = s.pasusi[0]?.delovi[0];
    this.podrazumevano = prvi ? atributiDela(prvi) : atributiDela(deoTeme(untracked(this.tema), 'telo', 24));
    const ostalo = this.store.platno().slojevi.reduce((n, x) => (x.id === s.id ? n : n + znakovaSloja(x)), 0);
    const doc = pasusiUDok(s.pasusi, napraviSemu(s.okvir.skala));
    this.pocetak = EditorState.create({
      doc,
      selection: Selection.atEnd(doc),
      plugins: dodaciUredjivaca({
        podrazumevano: this.podrazumevano, skala: s.okvir.skala, skalaProreda: s.okvir.skalaProreda, ostalo,
        prekoracenje: () => this.obavestenja.greska(PORUKA_ZNAKOVA),
        naEsc: () => {
          this.store.zavrsiUredjivanje();
          this.fokusPlatna.fokus();
          return true;
        },
      }),
    });
    this.dok = this.dokPreseka = doc;
    this.kljuceviPreseka = kljuceviPasusa(doc);
    this.stanje.set(stanjeSelekcije(this.pocetak));
    this.store.registrujUredjivac(this.komande);
  }

  ngAfterViewInit(): void {
    const s = untracked(this.sloj);
    this.view = new EditorView({ mount: this.koren().nativeElement }, {
      state: this.pocetak,
      attributes: {
        role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Tekst sloja ' + nazivSloja(this.store.platno(), s),
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
    let s = view.state.apply(tr);
    const k = dodeliKljuceve(s, this.brojac);
    if (k) s = s.apply(k);
    view.updateState(s);
    this.dok = s.doc;
    this.stanje.set(stanjeSelekcije(s));
  }

  private izvrsi(c: Command): void {
    const view = this.view;
    if (view) c(view.state, (tr) => view.dispatch(tr));
  }

  private presek(): RezultatTeksta | null {
    if (this.dok.eq(this.dokPreseka)) return null;
    const rezultat = { pasusi: dokUPasuse(this.dok, this.podrazumevano), mapa: mapaPoKljucevima(this.kljuceviPreseka, this.dok) };
    this.prethodnaOsnova = { dok: this.dokPreseka, kljucevi: this.kljuceviPreseka };
    this.dokPreseka = this.dok;
    this.kljuceviPreseka = kljuceviPasusa(this.dok);
    return rezultat;
  }

  private odbaciPresek(): void {
    const o = this.prethodnaOsnova;
    if (!o) return;
    this.dokPreseka = o.dok;
    this.kljuceviPreseka = o.kljucevi;
    this.prethodnaOsnova = null;
  }
}
