import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatCheckbox } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, map, Observable, of } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../core/api/api-error';
import { StudentiApi, StudentListItem } from '../../core/api/studenti.api';
import { IndeksPipe } from '../util/indeks.pipe';
import { FilterBar } from './filter-bar';
import { EmptyState, ErrorPanel, SkeletonRows } from './list-states';
import { StatusChip } from './status-chip';

export interface StudentPickerCfg {
  /** Grupa konteksta (predavanja, testa): "Iz grupe" su njeni studenti, "Stariji" su iz grupa sa manjom godinom upisa. */
  grupaId: number;
  /** Već dodati studenti; ne nude se. */
  iskljuci: readonly number[];
  naslov: string;
}

type Rezim = 'grupa' | 'stariji';

/** Najviše koliko backend vraća u jednoj strani (`max-page-size`); više od toga traži pretragu. */
const VELICINA = 100;

interface Rezultat {
  stavke: StudentListItem[];
  ukupno: number;
  greska: string | null;
}

/**
 * Zajednički birač studenata (dodavanje starijih na predavanje, ispitanika na test): "Iz grupe"
 * (`studenti/pretraga?grupaId=`) i "Stariji studenti" (`?starijiOdGrupe=`), pretraga po imenu ili indeksu,
 * višestruki izbor koji se pamti i kad se promeni tab, "Dodaj (n)". Vraća izabrane redom izbora; Odustani i Esc `[]`.
 * Greške prikazuje sam (zahtev je `tiho`, bez snackbara).
 */
@Component({
  selector: 'app-student-picker',
  imports: [
    EmptyState,
    ErrorPanel,
    FilterBar,
    IndeksPipe,
    MatButton,
    MatButtonToggle,
    MatButtonToggleGroup,
    MatCheckbox,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    SkeletonRows,
    StatusChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ cfg.naslov }}</h2>
    <mat-dialog-content>
      <app-filter-bar class="traka" [pretraga]="q()" pretragaLabela="Ime, prezime ili indeks" (pretragaChange)="q.set($event)">
        <mat-button-toggle-group class="segment" aria-label="Koji studenti" [hideSingleSelectionIndicator]="true"
          [value]="rezim()" (change)="rezim.set($event.value)">
          <mat-button-toggle value="grupa" data-rezim="grupa">Iz grupe</mat-button-toggle>
          <mat-button-toggle value="stariji" data-rezim="stariji">Stariji studenti</mat-button-toggle>
        </mat-button-toggle-group>
      </app-filter-bar>

      @if (rezultat.isLoading()) {
        <app-skeleton-rows [redovi]="4" />
      } @else if (greska(); as g) {
        <app-error-panel [poruka]="g" (ponovo)="rezultat.reload()" />
      } @else if (ponuda().length === 0) {
        <app-empty-state [naslov]="prazno()" ikona="person" />
      } @else {
        <div class="sve">
          <mat-checkbox [checked]="sviIzabrani()" [indeterminate]="nekiIzabrani() && !sviIzabrani()" (change)="izaberiSve($event.checked)">
            Izaberi sve prikazane ({{ ponuda().length }})
          </mat-checkbox>
        </div>
        <ul class="lista">
          @for (s of ponuda(); track s.id) {
            <li [attr.data-student]="s.id">
              <mat-checkbox [checked]="izabrani().has(s.id)" (change)="prebaci(s, $event.checked)">
                <span class="ime">{{ s.ime }} {{ s.prezime }}</span>
                <span class="indeks">{{ s.indeks | indeks: s.godina }}</span>
                @if (jeStariji(s)) {
                  <span class="grupa">{{ s.grupa?.naziv ?? '—' }}</span>
                  <app-status-chip tekst="stariji" ton="warn" [ikona]="null" />
                }
              </mat-checkbox>
            </li>
          }
        </ul>
      }
      @if (!rezultat.isLoading() && !greska() && skraceno()) {
        <p class="napomena" data-skraceno>Prikazano {{ ponuda().length }} od {{ rezultatVrednost().ukupno }} pronađenih. Suzi pretragu.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" data-odustani [mat-dialog-close]="[]">Odustani</button>
      <button matButton="filled" type="button" data-dodaj [disabled]="izabrani().size === 0" (click)="dodaj()">
        Dodaj ({{ izabrani().size }})
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .traka { padding: 0 0 12px; margin-bottom: 4px; }
    .segment { --mat-button-toggle-height: 34px; }
    .sve { padding: 4px 0; border-bottom: 1px solid var(--line); }
    .lista { list-style: none; margin: 0; padding: 0; }
    .lista li { border-bottom: 1px solid var(--line); }
    .lista mat-checkbox { display: block; padding: 2px 0; }
    .ime { font-weight: 600; margin-right: 8px; }
    .indeks { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 13px; color: var(--ink-2); margin-right: 8px; white-space: nowrap; }
    .grupa { font-size: 13px; color: var(--muted); margin-right: 8px; white-space: nowrap; }
    .napomena { margin: 8px 0 0; font-size: 13px; color: var(--muted); }
  `,
})
export class StudentPicker {
  protected readonly cfg = inject<StudentPickerCfg>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<StudentPicker, StudentListItem[]>>(MatDialogRef);
  private readonly api = inject(StudentiApi);

  protected readonly rezim = signal<Rezim>('grupa');
  protected readonly q = signal<string | null>(null);
  /** Izabrani studenti, redom izbora (Map čuva redosled umetanja). */
  protected readonly izabrani = signal(new Map<number, StudentListItem>());

  protected readonly rezultat = rxResource<Rezultat, { rezim: Rezim; q: string | null }>({
    params: () => ({ rezim: this.rezim(), q: this.q() }),
    stream: ({ params }) =>
      this.api
        .pretraga(
          {
            [params.rezim === 'grupa' ? 'grupaId' : 'starijiOdGrupe']: this.cfg.grupaId,
            q: params.q,
            page: 0,
            size: VELICINA,
          },
          { tiho: true },
        )
        .pipe(
          map(s => ({ stavke: s?.content ?? [], ukupno: s?.page?.totalElements ?? 0, greska: null })),
          catchError((e: unknown) =>
            of({ stavke: [], ukupno: 0, greska: e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM }),
          ),
        ),
  });

  protected readonly rezultatVrednost = computed<Rezultat>(() => this.rezultat.value() ?? { stavke: [], ukupno: 0, greska: null });
  protected readonly greska = computed(() => this.rezultatVrednost().greska);
  private readonly iskljuceni = new Set(this.cfg.iskljuci);
  protected readonly ponuda = computed(() => this.rezultatVrednost().stavke.filter(s => !this.iskljuceni.has(s.id)));
  protected readonly skraceno = computed(() => this.rezultatVrednost().ukupno > this.rezultatVrednost().stavke.length);
  protected readonly sviIzabrani = computed(() => this.ponuda().every(s => this.izabrani().has(s.id)));
  protected readonly nekiIzabrani = computed(() => this.ponuda().some(s => this.izabrani().has(s.id)));
  protected readonly prazno = computed(() => {
    const q = this.q();
    if (q) {
      return `Nema studenata za „${q}“.`;
    }
    if (this.rezultatVrednost().stavke.length > 0) {
      return this.skraceno() ? 'Svi prikazani studenti su već dodati.' : 'Svi studenti su već dodati.';
    }
    return this.rezim() === 'grupa' ? 'Grupa nema studenata.' : 'Nema studenata iz starijih grupa.';
  });

  static otvori(dialog: MatDialog, cfg: StudentPickerCfg): Observable<StudentListItem[]> {
    return dialog
      .open<StudentPicker, StudentPickerCfg, StudentListItem[]>(StudentPicker, {
        data: cfg,
        width: '40rem',
        maxWidth: '96vw',
        autoFocus: 'input[type=search]',
      })
      .afterClosed()
      .pipe(map(rez => rez ?? []));
  }

  protected jeStariji(s: StudentListItem): boolean {
    return s.grupa?.id !== this.cfg.grupaId;
  }

  protected prebaci(s: StudentListItem, ukljuci: boolean): void {
    this.izabrani.update(m => {
      const nova = new Map(m);
      if (ukljuci) {
        nova.set(s.id, s);
      } else {
        nova.delete(s.id);
      }
      return nova;
    });
  }

  protected izaberiSve(ukljuci: boolean): void {
    for (const s of this.ponuda()) {
      this.prebaci(s, ukljuci);
    }
  }

  protected dodaj(): void {
    this.ref.close([...this.izabrani().values()]);
  }
}
