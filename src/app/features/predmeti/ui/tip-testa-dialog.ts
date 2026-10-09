import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Observable } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { porukaValidacije } from '../../../shared/forms/poruke-validacije';
import { PredmetiApi } from '../data-access/predmeti.api';
import { TipTestaInfo } from '../data-access/predmeti.models';

export interface TipTestaDialogCfg {
  predmetId: number;
}

/** "Nov tip testa" (H5): naziv 2-60 znakova; nov tip je aktivan. Vraća napravljen tip ili `undefined`. */
@Component({
  selector: 'app-tip-testa-dialog',
  imports: [
    FormErrorBanner, MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatError, MatFormField,
    MatInput, MatLabel, MatProgressSpinner, ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Nov tip testa</h2>
    <form [formGroup]="forma" (ngSubmit)="sacuvaj()" novalidate>
      <mat-dialog-content>
        <app-form-error-banner [poruka]="greska()" />
        <mat-form-field appearance="outline" class="puno">
          <mat-label>Naziv</mat-label>
          <input matInput formControlName="naziv" maxlength="60" autocomplete="off" placeholder="npr. Kolokvijum 1" data-naziv />
          @if (porukaNaziva(); as m) {
            <mat-error>{{ m }}</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" [mat-dialog-close]="undefined" data-odustani>Odustani</button>
        <button matButton="filled" type="submit" [disabled]="salje()" data-sacuvaj>
          @if (salje()) {
            <mat-progress-spinner mode="indeterminate" diameter="18" aria-label="Čuvanje" />
          }
          Dodaj tip
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .puno { width: 100%; }
    button mat-progress-spinner { display: inline-block; margin-right: 8px; }
  `,
})
export class TipTestaDialog {
  private readonly cfg = inject<TipTestaDialogCfg>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<TipTestaDialog, TipTestaInfo>>(MatDialogRef);
  private readonly api = inject(PredmetiApi);

  protected readonly naziv = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2), Validators.maxLength(60)] });
  protected readonly forma = new FormGroup({ naziv: this.naziv });
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);

  static otvori(dialog: MatDialog, cfg: TipTestaDialogCfg): Observable<TipTestaInfo | undefined> {
    return dialog.open<TipTestaDialog, TipTestaDialogCfg, TipTestaInfo>(TipTestaDialog, { data: cfg, width: '28rem', maxWidth: '96vw' }).afterClosed();
  }

  protected porukaNaziva(): string | null {
    return porukaValidacije(this.naziv.errors, 'Naziv');
  }

  protected sacuvaj(): void {
    if (this.salje()) {
      return;
    }
    this.naziv.setValue(this.naziv.value.trim());
    this.naziv.markAsTouched();
    if (this.naziv.invalid) {
      return;
    }
    this.salje.set(true);
    this.greska.set(null);
    this.api.noviTip({ naziv: this.naziv.value, predmetId: this.cfg.predmetId }, { tiho: true }).subscribe({
      next: t => this.ref.close(t),
      error: (e: unknown) => {
        this.salje.set(false);
        this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
      },
    });
  }
}
