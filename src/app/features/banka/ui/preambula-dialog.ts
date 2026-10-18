import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { filter, Observable, of, switchMap, tap } from 'rxjs';

import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { sRecju } from '../../../shared/util/mnozina';
import { BankaApi } from '../data-access/banka.api';
import { PreambulaInfo, RenderujSveInfo } from '../data-access/banka.models';
import { razlogBanke, TIHO } from '../data-access/greske';

/** Najduža preambula (`LatexPreambulaService.MAX_ZNAKOVA`). */
export const MAX_PREAMBULA = 50_000;
/** Koliko puta zaredom se zove `renderuj-sve` posle čuvanja (server jednim pozivom radi najviše ~40 s). */
export const MAX_KRUGOVA_RENDERA = 10;

export interface PreambulaDialogPodaci {
  predmetId: number;
  predmet: string | null;
}

/** Zbir renderovanja posle čuvanja (`renderovano` i `neuspelo` saberu se kroz korake, `preostalo` je iz poslednjeg). */
export type PreambulaDialogRezultat = RenderujSveInfo;

/** "1 varijanta nije renderovana", "3 varijante nisu renderovane", "12 varijanti nije renderovano". */
export function opisNeuspelih(n: number): string {
  return sRecju(n, 'varijanta nije renderovana', 'varijante nisu renderovane', 'varijanti nije renderovano');
}

type Faza = 'ucitava' | 'neucitano' | 'spremna' | 'cuva' | 'renderuje';

/**
 * "Podešavanja LaTeX-a" predmeta: preambula koja ide ispred teksta svake varijante (`GET|PUT predmeti/{id}/latex-preambula`).
 * Podrazumevana se prikazuje u polju; nepromenjena podrazumevana i prazno polje šalju `null` (predmet ostaje na
 * podrazumevanoj, keš rendera se ne poništava). Posle čuvanja zove `renderuj-sve` dok `preostalo` nije 0 (najviše
 * {@link MAX_KRUGOVA_RENDERA} puta, pa nudi "Nastavi renderovanje", kao i posle greške), uz napredak "Renderovano N, preostalo
 * M" i zbir neuspelih. Kad sve uspe, zatvara se sam; kad neki render nije uspeo (`neuspelo`), ostaje otvoren sa upozorenjem
 * (varijante zadržavaju status i poslednji uspeo render), a ispravljena preambula se čuva ponovo istim dugmetom "Sačuvaj"
 * (posle čuvanja čeka novu izmenu teksta). Greške su u traci dijaloga (`{ tiho: true }`). Vraća zbir renderovanja kad je
 * preambula sačuvana, inače `undefined`. Dok radi, ne zatvara se; klik van dijaloga ga ne zatvara, a Esc samo dok tekst nije
 * menjan.
 */
@Component({
  selector: 'app-preambula-dialog',
  imports: [
    FormErrorBanner, MatButton, MatDialogActions, MatDialogContent, MatDialogTitle, MatError, MatFormField, MatInput, MatLabel,
    MatProgressBar, ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Podešavanja LaTeX-a{{ d.predmet ? ' · ' + d.predmet : '' }}</h2>
    <mat-dialog-content>
      <app-form-error-banner [poruka]="greska()" />
      @if (faza() === 'ucitava') {
        <mat-progress-bar mode="indeterminate" aria-label="Učitavanje preambule" />
      } @else if (faza() === 'neucitano') {
        <button matButton="outlined" type="button" (click)="ucitaj()" data-ponovo>Pokušaj ponovo</button>
      } @else {
        <p class="bk-dijalog-opis">
          Preambula ide ispred teksta svake varijante ovog predmeta, pre <code>\\begin{{ '{' }}document{{ '}' }}</code>. Dozvoljeni su
          <code>\\usepackage</code>, TikZ biblioteke i makroi; <code>\\write18</code>, <code>\\input</code>, <code>\\include</code> i
          čitanje ili pisanje fajlova nisu. Posle čuvanja se sve varijante predmeta ponovo renderuju.
        </p>
        @if (podrazumevana()) {
          <p class="bk-napomena" data-podrazumevana-oznaka>Predmet koristi podrazumevanu preambulu.</p>
        }
        <mat-form-field appearance="outline" class="bk-preambula-polje">
          <mat-label>Preambula</mat-label>
          <textarea matInput [formControl]="tekst" rows="14" spellcheck="false" autocapitalize="off" autocomplete="off"
            maxlength="50000" class="bk-mono" data-preambula></textarea>
          @if (tekst.hasError('maxlength')) {
            <mat-error>Preambula može imati najviše 50 000 znakova.</mat-error>
          }
        </mat-form-field>
        <button matButton type="button" [disabled]="radi()" (click)="vratiPodrazumevanu()" data-podrazumevana>Vrati podrazumevanu</button>
      }
      @if (napredak(); as n) {
        <p class="bk-napredak" role="status">Renderovano {{ n.renderovano }}, preostalo {{ n.preostalo }}{{ n.neuspelo ? ', nije uspelo ' + n.neuspelo : '' }}</p>
        @if (!radi() && n.neuspelo > 0) {
          <div class="bk-upozorenje-preambule" role="alert" data-neuspelo>
            {{ opisNeuspelih(n.neuspelo) }} (greška u preambuli?). Status varijanti je sačuvan, pregled na telefonu koristi poslednji uspeo
            render dok se ne ispravi.
          </div>
        }
      } @else if (faza() === 'renderuje' || faza() === 'cuva') {
        <p class="bk-napredak" role="status">{{ faza() === 'cuva' ? 'Čuvanje…' : 'Renderovanje…' }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" [disabled]="radi()" (click)="zatvori()" data-zatvori>{{ sacuvano() ? 'Zatvori' : 'Odustani' }}</button>
      @if (nedovrseno()) {
        <button matButton="outlined" type="button" [disabled]="radi()" (click)="renderuj()" data-nastavi>Nastavi renderovanje</button>
      }
      <button matButton="filled" type="button" [disabled]="radi() || faza() !== 'spremna' || (sacuvano() && !tekst.dirty)" (click)="sacuvaj()"
        data-sacuvaj>Sačuvaj</button>
    </mat-dialog-actions>
  `,
  styles: `
    .bk-dijalog-opis { margin: 0 0 12px; color: var(--ink-2); }
    .bk-napomena { margin: 0 0 12px; color: var(--muted); font-size: 13px; }
    .bk-preambula-polje { width: 100%; }
    .bk-mono { font-family: var(--font-mono); font-size: 13px; line-height: 1.5; white-space: pre; }
    .bk-napredak { margin: 8px 0 0; font-family: var(--font-mono); font-size: 13px; }
    .bk-upozorenje-preambule {
      margin: 8px 0 0;
      padding: 8px 12px;
      border: 1px solid var(--warn);
      border-radius: var(--radius-sm);
      background: var(--warn-soft);
      color: var(--ink);
    }
  `,
})
export class PreambulaDialog {
  protected readonly d = inject<PreambulaDialogPodaci>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<PreambulaDialog, PreambulaDialogRezultat>>(MatDialogRef);
  private readonly api = inject(BankaApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly faza = signal<Faza>('ucitava');
  protected readonly greska = signal<string | null>(null);
  private readonly info = signal<PreambulaInfo | null>(null);
  /** Zbir koraka renderovanja posle poslednjeg čuvanja; `null` dok čuvanje nije uspelo. */
  protected readonly napredak = signal<RenderujSveInfo | null>(null);
  /** Poslednji krug renderovanja je pao (greška servera ili mreže): "Nastavi renderovanje" ga ponavlja. */
  private readonly prekinuto = signal(false);
  protected readonly sacuvano = computed(() => this.napredak() !== null);
  /**
   * Preambula je sačuvana, a renderovanje nije stiglo do kraja (prekid ili {@link MAX_KRUGOVA_RENDERA} krugova). Posle celog
   * kruga sa neuspelim renderima nema nastavka: server bi iste varijante probao ponovo i one bi se brojale dvaput.
   */
  protected readonly nedovrseno = computed(() => this.sacuvano() && (this.prekinuto() || (this.napredak()?.preostalo ?? 0) > 0));
  protected readonly opisNeuspelih = opisNeuspelih;
  protected readonly podrazumevana = computed(() => this.info()?.podrazumevana ?? false);
  protected readonly radi = computed(() => this.faza() === 'cuva' || this.faza() === 'renderuje');
  protected readonly tekst = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(MAX_PREAMBULA)] });

  constructor() {
    this.ucitaj();
    this.ref.keydownEvents()
      .pipe(filter(e => e.key === 'Escape' && !this.radi() && !this.tekst.dirty), takeUntilDestroyed())
      .subscribe(() => this.zatvori());
  }

  static otvori(dialog: MatDialog, podaci: PreambulaDialogPodaci): Observable<PreambulaDialogRezultat | undefined> {
    return dialog
      .open<PreambulaDialog, PreambulaDialogPodaci, PreambulaDialogRezultat>(PreambulaDialog, {
        data: podaci, width: '46rem', maxWidth: '96vw', disableClose: true,
      })
      .afterClosed();
  }

  protected ucitaj(): void {
    this.faza.set('ucitava');
    this.greska.set(null);
    this.api.preambula(this.d.predmetId, TIHO).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: info => {
        this.info.set(info);
        this.tekst.reset(info.preambula ?? info.podrazumevanaPreambula);
        this.faza.set('spremna');
      },
      error: (e: unknown) => {
        this.greska.set(razlogBanke(e));
        this.faza.set('neucitano');
      },
    });
  }

  protected vratiPodrazumevanu(): void {
    const info = this.info();
    if (info) {
      this.tekst.setValue(info.podrazumevanaPreambula);
      this.tekst.markAsDirty();
    }
  }

  protected sacuvaj(): void {
    const info = this.info();
    if (!info || this.radi() || this.tekst.invalid) {
      return;
    }
    const t = this.tekst.value.trim();
    const zaSlanje = t === '' || t === info.podrazumevanaPreambula.trim() ? null : this.tekst.value;
    this.faza.set('cuva');
    this.greska.set(null);
    this.api.postaviPreambulu(this.d.predmetId, zaSlanje, TIHO).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: novo => {
        this.info.set(novo);
        this.tekst.markAsPristine();
        this.napredak.set({ renderovano: 0, neuspelo: 0, preostalo: 0 });
        this.renderujSve();
      },
      error: (e: unknown) => {
        this.greska.set(razlogBanke(e));
        this.faza.set('spremna');
      },
    });
  }

  /** "Nastavi renderovanje" (posle prekida ili greške). */
  protected renderuj(): void {
    if (!this.radi()) {
      this.renderujSve();
    }
  }

  /**
   * Do {@link MAX_KRUGOVA_RENDERA} poziva `renderuj-sve` zaredom, sa zbirom uspelih i neuspelih; zatvara se sam kad ništa ne
   * preostane i nijedan render nije pao.
   */
  private renderujSve(): void {
    this.faza.set('renderuje');
    this.greska.set(null);
    this.prekinuto.set(false);
    const korak = (krug: number): Observable<RenderujSveInfo> =>
      this.api.renderujSve(this.d.predmetId, TIHO).pipe(
        tap(r => this.napredak.update(n => ({
          renderovano: (n?.renderovano ?? 0) + r.renderovano, neuspelo: (n?.neuspelo ?? 0) + r.neuspelo, preostalo: r.preostalo,
        }))),
        switchMap(r => (r.preostalo > 0 && krug < MAX_KRUGOVA_RENDERA ? korak(krug + 1) : of(r))),
      );
    korak(1).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        this.faza.set('spremna');
        if (r.preostalo === 0 && this.napredak()?.neuspelo === 0) {
          this.zatvori();
        }
      },
      error: (e: unknown) => {
        this.greska.set(razlogBanke(e));
        this.prekinuto.set(true);
        this.faza.set('spremna');
      },
    });
  }

  protected zatvori(): void {
    if (!this.radi()) {
      this.ref.close(this.napredak() ?? undefined);
    }
  }
}
