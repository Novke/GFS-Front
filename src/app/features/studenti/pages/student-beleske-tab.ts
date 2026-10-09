import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { filter } from 'rxjs';

import { BeleskaInfo } from '../../../core/api/studenti.api';
import { porukaValidacije } from '../../../shared/forms/poruke-validacije';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { formatDatum } from '../../../shared/util/datum.pipe';
import { StudentStore } from '../data-access/student.store';

/** Kolona `beleske.tekst`: server odbija duže od 2000 znakova. */
export const MAX_BELESKA = 2000;

/** Samo razmaci su prazna beleška (server ih skida pa odbija). */
const jePrazno: ValidatorFn = c => (String(c.value ?? '').trim() === '' ? { required: true } : null);

/** `14. 10. 2025. 14:05` i, kad je beleška menjana, ` · izmenjeno 15. 10. 2025. 09:30`. */
export function vremeBeleske(b: Pick<BeleskaInfo, 'kreirano' | 'izmenjeno'>): string {
  const kreirano = formatDatum(b.kreirano, 'sa-vremenom');
  return b.izmenjeno ? `${kreirano} · izmenjeno ${formatDatum(b.izmenjeno, 'sa-vremenom')}` : kreirano;
}

/**
 * Tab "Beleške" profila (S6): beleške nastavnika o studentu, najnovije prve. Dodavanje na vrhu, izmena na mestu (jedna
 * po jedna), brisanje uz potvrdu. Greške servera idu u snackbar (interceptor), a unos ostaje u polju.
 */
@Component({
  selector: 'app-student-beleske-tab',
  imports: [EmptyState, ErrorPanel, MatButton, MatError, MatFormField, MatHint, MatIcon, MatInput, MatLabel, ReactiveFormsModule, SkeletonRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="nova" [formGroup]="novaForma" (ngSubmit)="dodaj()" novalidate>
      <mat-form-field appearance="outline">
        <mat-label>Nova beleška</mat-label>
        <textarea matInput rows="3" [formControl]="nova" [maxlength]="max" data-nova></textarea>
        <mat-hint align="end">{{ nova.value.length }} / {{ max }}</mat-hint>
        @if (poruka(nova); as m) {
          <mat-error>{{ m }}</mat-error>
        }
      </mat-form-field>
      <button matButton="filled" type="submit" data-dodaj [disabled]="salje()">
        <mat-icon svgIcon="add" aria-hidden="true" />Dodaj belešku
      </button>
    </form>

    @if (store.beleske(); as beleske) {
      @if (beleske.length > 0) {
        <ul class="lista" aria-label="Beleške o studentu" data-beleske>
          @for (b of beleske; track b.id) {
            <li [attr.data-beleska]="b.id">
              @if (uIzmeni() === b.id) {
                <form [formGroup]="izmenaForma" (ngSubmit)="sacuvaj(b.id)" novalidate>
                  <mat-form-field appearance="outline">
                    <mat-label>Izmena beleške</mat-label>
                    <textarea matInput rows="3" [formControl]="izmena" [maxlength]="max" data-izmena></textarea>
                    <mat-hint align="end">{{ izmena.value.length }} / {{ max }}</mat-hint>
                    @if (poruka(izmena); as m) {
                      <mat-error>{{ m }}</mat-error>
                    }
                  </mat-form-field>
                  <div class="akcije">
                    <button matButton type="button" data-odustani (click)="uIzmeni.set(null)">Odustani</button>
                    <button matButton="filled" type="submit" data-sacuvaj [disabled]="salje()">Sačuvaj</button>
                  </div>
                </form>
              } @else {
                <p class="tekst">{{ b.tekst }}</p>
                <div class="podnozje">
                  <span class="vreme mono">{{ vreme(b) }}</span>
                  <div class="akcije">
                    <button matButton type="button" data-izmeni (click)="pocni(b)"><mat-icon svgIcon="edit" aria-hidden="true" />Izmeni</button>
                    <button matButton type="button" class="opasno" data-obrisi (click)="obrisi(b)"><mat-icon svgIcon="delete" aria-hidden="true" />Obriši</button>
                  </div>
                </div>
              }
            </li>
          }
        </ul>
      } @else {
        <app-empty-state naslov="Još nema beleški" ikona="sticky_note_2"
          tekst="Zapiši šta treba da zapamtiš o studentu: dogovore, probleme, opravdanja." />
      }
    } @else if (store.beleskeStatus() === 'error') {
      <app-error-panel [poruka]="store.beleskeGreska()" (ponovo)="store.ucitajBeleske(true)" />
    } @else {
      <app-skeleton-rows [redovi]="3" />
    }
  `,
  styles: `
    .nova { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; max-width: 720px; margin-bottom: 16px; }
    .nova mat-form-field, form mat-form-field { width: 100%; }
    .lista { display: flex; flex-direction: column; gap: 12px; max-width: 720px; margin: 0; padding: 0; list-style: none; }
    li { padding: 14px 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
    .tekst { margin: 0 0 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .podnozje { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; }
    .vreme { font-size: 12.5px; color: var(--muted); }
    .akcije { display: flex; flex-wrap: wrap; gap: 4px; }
    .opasno { --mat-button-text-label-text-color: var(--danger); }
  `,
})
export class StudentBeleskeTab {
  protected readonly store = inject(StudentStore);
  private readonly dialog = inject(MatDialog);

  protected readonly max = MAX_BELESKA;
  protected readonly nova = new FormControl('', { nonNullable: true, validators: [jePrazno, Validators.maxLength(MAX_BELESKA)] });
  protected readonly izmena = new FormControl('', { nonNullable: true, validators: [jePrazno, Validators.maxLength(MAX_BELESKA)] });
  protected readonly novaForma = new FormGroup({ nova: this.nova });
  protected readonly izmenaForma = new FormGroup({ izmena: this.izmena });
  /** Id beleške koja se menja na mestu; jedna po jedna. */
  protected readonly uIzmeni = signal<number | null>(null);
  protected readonly salje = signal(false);

  constructor() {
    effect(() => {
      this.store.id();
      if (this.store.beleskeStatus() === 'idle') {
        untracked(() => this.store.ucitajBeleske());
      }
    });
  }

  protected vreme(b: BeleskaInfo): string {
    return vremeBeleske(b);
  }

  protected poruka(k: FormControl<string>): string | null {
    return k.touched || k.dirty ? porukaValidacije(k.errors, 'Beleška') : null;
  }

  protected async dodaj(): Promise<void> {
    if (this.salje()) {
      return;
    }
    if (this.nova.invalid) {
      this.nova.markAsTouched();
      return;
    }
    this.salje.set(true);
    try {
      if (await this.store.dodajBelesku(this.nova.value.trim())) {
        this.nova.reset('');
      }
    } finally {
      this.salje.set(false);
    }
  }

  protected pocni(b: BeleskaInfo): void {
    this.izmena.reset(b.tekst);
    this.uIzmeni.set(b.id);
  }

  protected async sacuvaj(id: number): Promise<void> {
    if (this.salje()) {
      return;
    }
    if (this.izmena.invalid) {
      this.izmena.markAsTouched();
      return;
    }
    this.salje.set(true);
    try {
      if (await this.store.izmeniBelesku(id, this.izmena.value.trim())) {
        this.uIzmeni.set(null);
      }
    } finally {
      this.salje.set(false);
    }
  }

  protected obrisi(b: BeleskaInfo): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Obriši belešku?',
      tekst: 'Beleška se briše trajno i ne može se vratiti.',
      potvrdi: 'Obriši',
      destruktivno: true,
    })
      .pipe(filter(Boolean))
      .subscribe(() => {
        // stanje izmene se čisti tek kad server obriše: posle greške unos u izmeni ostaje
        void this.store.obrisiBelesku(b.id).then(ok => {
          if (ok && this.uIzmeni() === b.id) {
            this.uIzmeni.set(null);
          }
        });
      });
  }
}
