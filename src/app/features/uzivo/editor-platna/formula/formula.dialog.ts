// Dijalog formule (F16, odluka 20): `<math-field>` MathLive-a i polje "LaTeX" usklađeni u oba smera (polje je i
// pristupačna alternativa elementu treće strane), uz boju, veličinu i poravnanje. Lenji chunk: učitava ga samo
// `formula-otvarac.ts` (dinamički `import()`), a ceo `mathlive` ovaj dijalog vuče tek posle otvaranja (`UCITAJ_MATHLIVE`).
// Fokus postavlja sam (`autoFocus: false`; CDK-ov autoFocus posle animacije bi ga oteo): `math-field` kad se učita, inače
// polje "LaTeX". Esc u `math-field`-u pripada MathLive-u (prelaz u LaTeX režim), pa zatvara samo Esc van njega.
import { hasModifierKey } from '@angular/cdk/keycodes';
import {
  CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed,
  inject, signal, viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, type MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import type { Observable } from 'rxjs';
import type { Poravnanje, Tema } from '../../data-access/platno.models';
import { BrojcanoPoljeComponent } from '../brojcano-polje';
import { IzborBojeComponent } from '../izbor-boje.component';
import { preTeskaFormula } from '../../ui/formula-komande';
import { markupNepromenjen } from '../../ui/formula-sanitizer';
import {
  type FormulaUnos, MAX_LATEX, PORUKA_PRAZNA, PORUKA_ZABRANJENA, ZABRANJENE_KOMANDE_FORMULE, greskaFormule,
} from './formula-pravila';
import { type MathLive, UCITAJ_MATHLIVE } from './mathlive-ucitavanje';

/** Host atribut `data-oznaka` dijaloga: niz ostaje u lenjom chunk-u (e2e ga traži, odluka 26). */
export const OZNAKA_FORMULE_EDITORA = 'gfs-formula-editor';

export interface FormulaPodaci {
  pocetak: FormulaUnos;
  /** Tema prezentacije (paleta boja). */
  tema: Tema;
  /** Formula je iz PowerPointa uvezena kao slika (`slikaIzvora`): napomena da se posle čuvanja crta iz LaTeX-a. */
  izSlike: boolean;
}

/**
 * Otvara dijalog; emituje unos posle "Sačuvaj" ili `undefined` (Otkaži, Esc). `disableClose`: klik van dijaloga ne gubi
 * otkucanu formulu, a Esc obrađuje dijalog sam (u `math-field`-u ga koristi MathLive).
 */
export function otvoriFormulu(dialog: MatDialog, podaci: FormulaPodaci): Observable<FormulaUnos | undefined> {
  return dialog.open<FormulaDialog, FormulaPodaci, FormulaUnos>(FormulaDialog, {
    data: podaci, autoFocus: false, restoreFocus: true, disableClose: true, width: '560px', maxWidth: '95vw',
  }).afterClosed();
}

/** Deo `MathfieldElement`-a koji dijalog koristi (u testu je `<math-field>` nepoznat element). */
type PoljeFormule = HTMLElement & { value: string; menuItems?: readonly unknown[] };
/** `window.mathVirtualKeyboard` (postoji tek posle uvoza `mathlive`). */
type VirtuelnaTastatura = EventTarget & { visible: boolean; show(): void; hide(): void };

const tastatura = (): VirtuelnaTastatura | undefined =>
  (window as unknown as { mathVirtualKeyboard?: VirtuelnaTastatura }).mathVirtualKeyboard;

const PORAVNANJA: readonly { v: Poravnanje; naziv: string; ikona: string }[] = [
  { v: 'LEVO', naziv: 'Levo', ikona: 'format_align_left' },
  { v: 'CENTAR', naziv: 'Centar', ikona: 'format_align_center' },
  { v: 'DESNO', naziv: 'Desno', ikona: 'format_align_right' },
];

/** Virtuelna tastatura MathLive-a iznad CDK overlay-a (1000) dok je dijalog otvoren. */
const ZINDEX_TASTATURE = '1100';

@Component({
  selector: 'app-formula-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    BrojcanoPoljeComponent, IzborBojeComponent, MatButtonModule, MatButtonToggleModule, MatDialogModule, MatFormFieldModule,
    MatIconModule, MatInputModule, MatProgressBarModule,
  ],
  host: { 'data-oznaka': OZNAKA_FORMULE_EDITORA },
  template: `
    <h2 mat-dialog-title>Formula</h2>
    <mat-dialog-content class="uz-fd-telo">
      @if (podaci.izSlike) {
        <p class="uz-fd-napomena">Ova formula je uvezena kao slika iz PowerPointa. Posle čuvanja crta se iz LaTeX-a.</p>
      }
      @switch (stanje()) {
        @case ('ucitava') { <mat-progress-bar mode="indeterminate" aria-label="Učitavanje vizuelnog unosa" /> }
        @case ('spremno') {
          <div class="uz-fd-vizuelno">
            <math-field #mf tabindex="0" math-virtual-keyboard-policy="manual" aria-label="Formula (vizuelno)"
                        (input)="izPolja($event)" (beforeinput)="preUnosa($event)" (mount)="fokusPolja()"></math-field>
            <button mat-stroked-button type="button" [attr.aria-pressed]="tastaturaVidljiva()"
                    (click)="prebaciTastaturu()"><mat-icon svgIcon="keyboard" />Tastatura</button>
          </div>
        }
      }
      <p role="status" class="uz-fd-stanje">{{ stanje() === 'greska' ? 'Vizuelni unos nije učitan; piši LaTeX.' : '' }}</p>
      <mat-form-field class="uz-fd-latex" appearance="outline" subscriptSizing="dynamic">
        <mat-label>LaTeX</mat-label>
        <textarea #latexPolje matInput rows="3" spellcheck="false" autocomplete="off" [value]="latex()"
                  [attr.aria-describedby]="idGreske" [attr.aria-invalid]="!!prikazGreske()" (input)="izTeksta($event)"></textarea>
      </mat-form-field>
      <p role="alert" class="uz-fd-greska" [id]="idGreske">{{ prikazGreske() }}</p>
      <div class="uz-fd-red">
        <app-izbor-boje oznaka="Boja" [tema]="podaci.tema" [vrednost]="boja()" (izbor)="$event && boja.set($event)" />
        <app-brojcano-polje oznaka="Veličina" jedinica="pt" [vrednost]="velicina()" [min]="1" [max]="400" [stegni]="false"
                            (promena)="velicina.set($event)" />
      </div>
      <mat-button-toggle-group aria-label="Poravnanje" hideSingleSelectionIndicator [value]="poravnanje()"
                               (change)="poravnanje.set($event.value)">
        @for (p of poravnanja; track p.v) {
          <mat-button-toggle [value]="p.v" [aria-label]="p.naziv" [title]="p.naziv"><mat-icon [svgIcon]="p.ikona" /></mat-button-toggle>
        }
      </mat-button-toggle-group>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Otkaži</button>
      <button mat-flat-button type="button" [disabled]="!mozeSacuvati()" (click)="sacuvaj()">Sačuvaj</button>
    </mat-dialog-actions>
  `,
  styles: `
    .uz-fd-telo { display: grid; gap: 8px; }
    .uz-fd-napomena, .uz-fd-stanje { margin: 0; font-size: 13px; color: var(--ink-2); }
    .uz-fd-stanje:empty, .uz-fd-greska:empty { display: none; }
    .uz-fd-greska { margin: 0; font-size: 13px; color: var(--danger); }
    .uz-fd-vizuelno { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    math-field {
      flex: 1 1 260px; min-height: 56px; padding: 8px; font-size: 24px; color: var(--ink); background: var(--surface);
      border: 1px solid var(--line); border-radius: 4px; outline: none;
    }
    math-field:focus-within { outline: 2px solid var(--focus); outline-offset: 1px; }
    math-field::part(virtual-keyboard-toggle), math-field::part(menu-toggle) { display: none; }
    .uz-fd-latex { width: 100%; }
    .uz-fd-latex textarea { font-family: var(--font-mono); }
    .uz-fd-red { display: grid; grid-template-columns: minmax(0, 1fr) 140px; align-items: center; gap: 12px; }
    mat-button-toggle-group { justify-self: start; }
  `,
})
export class FormulaDialog {
  private static brojac = 0;
  protected readonly podaci = inject<FormulaPodaci>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<FormulaDialog, FormulaUnos>>(MatDialogRef);
  private readonly ucitaj = inject(UCITAJ_MATHLIVE);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly mf = viewChild<ElementRef<PoljeFormule>>('mf');
  private readonly latexPolje = viewChild.required<ElementRef<HTMLTextAreaElement>>('latexPolje');

  protected readonly poravnanja = PORAVNANJA;
  protected readonly idGreske = `uz-fd-greska-${++FormulaDialog.brojac}`;
  protected readonly stanje = signal<'ucitava' | 'spremno' | 'greska'>('ucitava');
  private readonly modul = signal<MathLive | null>(null);
  protected readonly latex = signal(this.podaci.pocetak.latex);
  protected readonly boja = signal(this.podaci.pocetak.boja);
  protected readonly velicina = signal(this.podaci.pocetak.velicina);
  protected readonly poravnanje = signal(this.podaci.pocetak.poravnanje);
  protected readonly tastaturaVidljiva = signal(false);
  /** Prazna nova formula ne viče "Formula je prazna." pre prvog kucanja (dugme "Sačuvaj" je ipak onemogućeno). */
  private readonly dirano = signal(false);
  /** Lepljenje (ili umetanje) zabranjene komande u `math-field` je odbijeno: poruka do sledeće izmene. */
  private readonly odbijeno = signal(false);

  /** Bez MathLive-a (učitavanje palo) sintaksa se ne proverava; zabranjene komande i granice da. */
  protected readonly greska = computed(() => {
    const m = this.modul();
    return greskaFormule(this.latex(), m ? (l) => m.validateLatex(l) : () => []);
  });
  protected readonly prikazGreske = computed(() => {
    if (this.odbijeno()) return PORUKA_ZABRANJENA;
    const g = this.greska();
    return g === PORUKA_PRAZNA && !this.dirano() ? '' : g ?? '';
  });
  protected readonly mozeSacuvati = computed(() => this.stanje() !== 'ucitava' && this.greska() === null);

  constructor() {
    let ziv = true;
    const telo = document.body.style;
    telo.setProperty('--keyboard-zindex', ZINDEX_TASTATURE);
    const naPromenuTastature = () => this.tastaturaVidljiva.set(!!tastatura()?.visible);
    inject(DestroyRef).onDestroy(() => {
      ziv = false;
      telo.removeProperty('--keyboard-zindex');
      const t = tastatura();
      t?.removeEventListener('virtual-keyboard-toggle', naPromenuTastature);
      t?.hide();
    });
    // CDK sa `autoFocus: false` posle animacije otvaranja fokusira kontejner kad fokus "nije u njemu", a fokus u shadow
    // DOM-u `math-field`-a ne vidi (`contains` ne prelazi granicu shadow root-a). Dok korisnik još ništa nije uradio u
    // dijalogu, fokus kontejnera se zato vraća u polje (posle prvog pritiska ili tastera ostaje gde ga korisnik stavi).
    // MathLive pri tome i dalje misli da ima fokus (njegov `focus()` je tada no-op dok ne obradi gubitak fokusa), pa se
    // pokušava ponovo, kratko, dok fokus ne stigne u polje ili korisnik ne krene sam.
    let korisnik = false;
    const radi = () => (korisnik = true);
    const kontejner = () => this.host.closest('mat-dialog-container');
    const vrati = (pokusaja: number) => {
      if (!ziv || korisnik || document.activeElement !== kontejner()) return;
      this.pocetniFokus();
      if (pokusaja > 1) setTimeout(() => vrati(pokusaja - 1), 80);
    };
    const naFokus = (e: FocusEvent) => {
      if (!korisnik && e.target instanceof Element && e.target === kontejner()) vrati(8);
    };
    document.addEventListener('focusin', naFokus);
    this.host.addEventListener('pointerdown', radi, true);
    this.host.addEventListener('keydown', radi, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('focusin', naFokus);
      this.host.removeEventListener('pointerdown', radi, true);
      this.host.removeEventListener('keydown', radi, true);
    });
    // Esc van `math-field`-a otkazuje (u njemu je komanda MathLive-a: prelaz u LaTeX režim)
    this.ref.keydownEvents().subscribe((e) => {
      if (e.key !== 'Escape' || hasModifierKey(e) || e.defaultPrevented) return;
      if (e.composedPath().some((x) => x instanceof Element && x.localName === 'math-field')) return;
      e.preventDefault();
      this.ref.close();
    });
    this.ucitaj().then((m) => {
      if (!ziv) return;
      this.modul.set(m);
      this.stanje.set('spremno');
      tastatura()?.addEventListener('virtual-keyboard-toggle', naPromenuTastature);
      afterNextRender({
        write: () => {
          const mf = this.mf()?.nativeElement;
          if (!mf || !ziv) return;
          mf.menuItems = []; // meni MathLive-a je na engleskom; sve iz njega ima i polje LaTeX
          // uvezen LaTeX sa zabranjenom komandom ne ide u polje: MathLive bi ga nacrtao (spoljni url(...) u stilu)
          const l = this.latex();
          if (this.smeUPolje(l)) mf.value = l;
          this.fokusPolja();
        },
      }, { injector: this.injector });
    }, () => {
      if (!ziv) return;
      this.stanje.set('greska');
      afterNextRender({ write: () => ziv && this.latexPolje().nativeElement.focus() }, { injector: this.injector });
    });
  }

  /**
   * Početni fokus u `math-field` (posle crtanja i na `mount` pravog MathLive-a: pre toga `focus()` ne radi), samo dok
   * fokus još nije u sadržaju dijaloga (korisnik je možda već kliknuo u drugo polje).
   */
  protected fokusPolja(): void {
    const mf = this.mf()?.nativeElement;
    if (mf && !this.host.contains(document.activeElement)) mf.focus();
  }

  /** Početni fokus: `math-field` kad je učitan, polje "LaTeX" kad učitavanje nije uspelo (dok se učitava: `mount` kasnije). */
  private pocetniFokus(): void {
    if (this.stanje() === 'spremno') this.mf()?.nativeElement.focus();
    else if (this.stanje() === 'greska') this.latexPolje().nativeElement.focus();
  }

  /** Polje LaTeX -> `math-field` (programski upis ne pravi `input`, pa nema petlje). */
  protected izTeksta(e: Event): void {
    const l = (e.target as HTMLTextAreaElement).value;
    this.postaviLatex(l);
    const mf = this.mf()?.nativeElement;
    if (mf && mf.value !== l && this.smeUPolje(l)) mf.value = l;
  }

  /**
   * `math-field` crta MathLive sam (shadow DOM), mimo sanitizera statičkog prikaza. Zato LaTeX ide u njega samo kad
   * prolazi spisak zabranjenih komandi (i `^^`) i granicu dužine, i kad sanitizer (`ui/formula-sanitizer`, bez uvoza) ne bi
   * promenio markup iste formule (MathLive ništa ne nacrta što projektor ne bi). Kucanje komande znak po znak u LaTeX
   * režimu polja ovo zaobilazi (`beforeinput` vidi jedan znak): to je samoizazvano, a "Sačuvaj" ga ionako odbija.
   */
  private smeUPolje(l: string): boolean {
    const m = this.modul();
    // dubina pre MathLive-a (duboko ugnježdeni koreni: sekunde crtanja, desetine MB markup-a)
    if (!m || ZABRANJENE_KOMANDE_FORMULE.test(l) || [...l].length > MAX_LATEX || preTeskaFormula(l)) return false;
    try {
      return markupNepromenjen(m.convertLatexToMarkup(l, { defaultMode: 'math' }));
    } catch {
      return false;
    }
  }

  /** `math-field` -> polje LaTeX; ista vrednost se ignoriše. */
  protected izPolja(e: Event): void {
    const l = (e.target as PoljeFormule).value;
    if (typeof l === 'string' && l !== this.latex()) this.postaviLatex(l);
  }

  /** Umetanje ili lepljenje zabranjene komande u `math-field` se ne izvršava (MathLive bi je nacrtao). */
  protected preUnosa(e: Event): void {
    const data = (e as InputEvent).data;
    if (data && ZABRANJENE_KOMANDE_FORMULE.test(data)) {
      e.preventDefault();
      this.odbijeno.set(true);
    }
  }

  protected prebaciTastaturu(): void {
    const t = tastatura();
    if (!t || this.stanje() !== 'spremno') return;
    if (t.visible) {
      t.hide();
    } else {
      // tasteri tastature idu u fokusirano polje
      this.mf()?.nativeElement.focus();
      t.show();
    }
    this.tastaturaVidljiva.set(t.visible);
  }

  protected sacuvaj(): void {
    if (!this.mozeSacuvati()) return;
    this.ref.close({ latex: this.latex(), boja: this.boja(), velicina: this.velicina(), poravnanje: this.poravnanje() });
  }

  private postaviLatex(l: string): void {
    this.latex.set(l);
    this.dirano.set(true);
    this.odbijeno.set(false);
  }
}
