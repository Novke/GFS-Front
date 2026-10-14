import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Observable } from 'rxjs';

import { porukaValidacije } from '../../../shared/forms/poruke-validacije';

/** Kolona `aktivnosti.napomene` je `varchar(255)`. */
export const MAX_NAPOMENA = 255;

export interface NapomenaCfg {
  student: string;
  napomena: string | null;
}

/** Napomena uz aktivnost studenta na predavanju. Vraća novi tekst (prazan = briše napomenu) ili `undefined` (Odustani). */
@Component({
  selector: 'app-napomena-dialog',
  imports: [MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatError, MatFormField, MatHint, MatInput, MatLabel, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Napomena: {{ cfg.student }}</h2>
    <form [formGroup]="forma" (ngSubmit)="sacuvaj()" novalidate>
      <mat-dialog-content>
        <mat-form-field appearance="outline" class="polje">
          <mat-label>Napomena</mat-label>
          <textarea matInput [formControl]="tekst" rows="3" [maxlength]="max" data-tekst></textarea>
          <mat-hint align="end">{{ tekst.value.length }} / {{ max }}</mat-hint>
          @if (tekst.invalid) {
            <mat-error>{{ greska() }}</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Odustani</button>
        <button matButton="filled" type="submit" data-sacuvaj>Sačuvaj</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `.polje { width: 100%; }`,
})
export class NapomenaDialog {
  protected readonly cfg = inject<NapomenaCfg>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<NapomenaDialog, string>>(MatDialogRef);
  protected readonly max = MAX_NAPOMENA;
  protected readonly tekst = new FormControl(this.cfg.napomena ?? '', { nonNullable: true, validators: [Validators.maxLength(MAX_NAPOMENA)] });
  protected readonly forma = new FormGroup({ tekst: this.tekst });

  static otvori(dialog: MatDialog, cfg: NapomenaCfg): Observable<string | undefined> {
    return dialog.open<NapomenaDialog, NapomenaCfg, string>(NapomenaDialog, { data: cfg, width: '30rem', maxWidth: '96vw' }).afterClosed();
  }

  protected greska(): string | null {
    return porukaValidacije(this.tekst.errors, 'Napomena');
  }

  protected sacuvaj(): void {
    if (this.tekst.invalid) {
      this.tekst.markAsTouched();
      return;
    }
    this.ref.close(this.tekst.value.trim());
  }
}
