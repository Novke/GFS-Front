import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { map, Observable } from 'rxjs';

/** Kolona `prijave.napomena` je `varchar(255)`. */
export const MAX_NAPOMENA_ODBIJANJA = 255;

export interface OdbijCfg {
  /** `Ana Anić (GD12)`. */
  student: string;
}

/** Rezultat: `{ napomena }` (prazna = bez napomene) ili `null` kad je odbijanje otkazano. */
export interface OdbijRezultat {
  napomena: string | null;
}

/** "Odbij" prijavu sa opcionim razlogom (umesto prozora brauzera). Destruktivno: fokus počinje na polju, "Odbij" je crveno. */
@Component({
  selector: 'app-odbij-dialog',
  imports: [MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatError, MatFormField, MatHint, MatInput, MatLabel, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Odbij prijavu</h2>
    <form [formGroup]="forma" (ngSubmit)="odbij()" novalidate>
      <mat-dialog-content>
        <p class="uputstvo">Prijava {{ cfg.student }} se odbija; student se ne dodaje u grupu.</p>
        <mat-form-field appearance="outline" class="puno">
          <mat-label>Razlog odbijanja (opciono)</mat-label>
          <textarea matInput [formControl]="napomena" rows="3" [maxlength]="max" cdkFocusInitial data-napomena></textarea>
          <mat-hint align="end">{{ napomena.value.length }} / {{ max }}</mat-hint>
          @if (napomena.invalid) {
            <mat-error>Najviše {{ max }} znakova.</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" [mat-dialog-close]="undefined" data-odustani>Odustani</button>
        <button matButton="filled" type="submit" class="destruktivno" data-odbij>Odbij</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .uputstvo { margin: 0 0 12px; color: var(--ink-2); }
    .puno { width: 100%; }
    .destruktivno {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class OdbijDialog {
  protected readonly cfg = inject<OdbijCfg>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<OdbijDialog, OdbijRezultat>>(MatDialogRef);
  protected readonly max = MAX_NAPOMENA_ODBIJANJA;
  protected readonly napomena = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(MAX_NAPOMENA_ODBIJANJA)] });
  protected readonly forma = new FormGroup({ napomena: this.napomena });

  static otvori(dialog: MatDialog, cfg: OdbijCfg): Observable<OdbijRezultat | null> {
    return dialog
      .open<OdbijDialog, OdbijCfg, OdbijRezultat>(OdbijDialog, { data: cfg, width: '30rem', maxWidth: '96vw', role: 'alertdialog' })
      .afterClosed()
      .pipe(map(r => r ?? null));
  }

  protected odbij(): void {
    if (this.napomena.invalid) {
      this.napomena.markAsTouched();
      return;
    }
    this.ref.close({ napomena: this.napomena.value.trim() || null });
  }
}
