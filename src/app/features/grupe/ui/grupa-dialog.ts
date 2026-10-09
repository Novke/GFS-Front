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
import { GrupeApi } from '../data-access/grupe.api';
import { GrupaInfo } from '../data-access/grupe.models';

export interface GrupaDialogCfg {
  /** Bez grupe: nova grupa; sa grupom: izmena (`PUT grupe/{id}`). */
  grupa?: Pick<GrupaInfo, 'id' | 'naziv' | 'godinaUpisa'> | null;
}

/**
 * "Nova grupa" i "Izmeni grupu" (G8): naziv (do 60) i godina upisa (2000-2100). Čuva sam; greška servera ide u traku
 * iznad forme. Vraća sačuvanu grupu ili `undefined` (Odustani).
 */
@Component({
  selector: 'app-grupa-dialog',
  imports: [
    FormErrorBanner, MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatError, MatFormField,
    MatInput, MatLabel, MatProgressSpinner, ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ izmena ? 'Izmeni grupu' : 'Nova grupa' }}</h2>
    <form [formGroup]="forma" (ngSubmit)="sacuvaj()" novalidate>
      <mat-dialog-content>
        <app-form-error-banner [poruka]="greska()" />
        <div class="polja">
          <mat-form-field appearance="outline">
            <mat-label>Naziv</mat-label>
            <input matInput id="naziv" formControlName="naziv" maxlength="60" autocomplete="off" data-naziv />
            @if (poruka('naziv'); as m) {
              <mat-error>{{ m }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Godina upisa</mat-label>
            <input matInput id="godinaUpisa" type="number" inputmode="numeric" min="2000" max="2100" formControlName="godinaUpisa" data-godina />
            @if (poruka('godinaUpisa'); as m) {
              <mat-error>{{ m }}</mat-error>
            }
          </mat-form-field>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" [mat-dialog-close]="undefined" data-odustani>Odustani</button>
        <button matButton="filled" type="submit" [disabled]="salje()" data-sacuvaj>
          @if (salje()) {
            <mat-progress-spinner mode="indeterminate" diameter="18" aria-label="Čuvanje" />
          }
          {{ izmena ? 'Sačuvaj' : 'Kreiraj grupu' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .polja { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 0 12px; }
    button mat-progress-spinner { display: inline-block; margin-right: 8px; }
    @media (max-width: 599.98px) { .polja { grid-template-columns: 1fr; } }
  `,
})
export class GrupaDialog {
  private readonly cfg = inject<GrupaDialogCfg>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<GrupaDialog, GrupaInfo>>(MatDialogRef);
  private readonly api = inject(GrupeApi);

  protected readonly izmena = !!this.cfg.grupa;
  protected readonly forma = new FormGroup({
    naziv: new FormControl(this.cfg.grupa?.naziv ?? '', { nonNullable: true, validators: [Validators.required, Validators.maxLength(60)] }),
    godinaUpisa: new FormControl<number | null>(this.cfg.grupa?.godinaUpisa ?? new Date().getFullYear(), [
      Validators.required,
      Validators.min(2000),
      Validators.max(2100),
    ]),
  });
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);

  static otvori(dialog: MatDialog, cfg: GrupaDialogCfg = {}): Observable<GrupaInfo | undefined> {
    return dialog.open<GrupaDialog, GrupaDialogCfg, GrupaInfo>(GrupaDialog, { data: cfg, width: '32rem', maxWidth: '96vw' }).afterClosed();
  }

  protected poruka(ime: 'naziv' | 'godinaUpisa'): string | null {
    const c = this.forma.controls[ime];
    return porukaValidacije(c.errors, ime === 'naziv' ? 'Naziv' : 'Godina upisa');
  }

  protected sacuvaj(): void {
    if (this.salje()) {
      return;
    }
    const naziv = this.forma.controls.naziv.value.trim();
    if (!naziv) {
      this.forma.controls.naziv.setValue('');
    }
    if (this.forma.invalid) {
      this.forma.markAllAsTouched();
      return;
    }
    const cmd = { naziv, godinaUpisa: this.forma.controls.godinaUpisa.value as number };
    const id = this.cfg.grupa?.id;
    this.salje.set(true);
    this.greska.set(null);
    (id ? this.api.update(id, cmd, { tiho: true }) : this.api.create(cmd, { tiho: true })).subscribe({
      next: g => this.ref.close(g),
      error: (e: unknown) => {
        this.salje.set(false);
        this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
      },
    });
  }
}
