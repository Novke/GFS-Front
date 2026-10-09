import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Observable } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { OnboardingApi, OnboardingSesijaInfo } from '../../../core/api/onboarding.api';

export interface PokreniOnboardingCfg {
  grupaId: number;
  grupaNaziv: string;
}

/**
 * "Pokreni onboarding" (G5): rok u danima (1-60, podrazumevano 7), max prijava (1-1000, 200) i napomena. Tekstovi i
 * pravila kao u starom UI-ju. Vraća novu sesiju (pozivalac otvara QR) ili `undefined`.
 */
@Component({
  selector: 'app-pokreni-onboarding-dialog',
  imports: [
    FormErrorBanner, MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatError, MatFormField,
    MatHint, MatInput, MatLabel, MatProgressSpinner, ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Pokreni onboarding</h2>
    <form [formGroup]="forma" (ngSubmit)="pokreni()" novalidate>
      <mat-dialog-content>
        <p class="uputstvo">Studenti grupe {{ cfg.grupaNaziv }} se prijavljuju sami, preko QR koda ili linka. Prijave potvrđuješ ti.</p>
        <app-form-error-banner [poruka]="greska()" />
        <div class="polja">
          <mat-form-field appearance="outline">
            <mat-label>Rok (u danima)</mat-label>
            <input matInput id="rokUDanima" type="number" inputmode="numeric" min="1" max="60" step="1" formControlName="rokUDanima" data-rok />
            @if (forma.controls.rokUDanima.invalid) {
              <mat-error>Rok mora biti između 1 i 60 dana.</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Max prijava</mat-label>
            <input matInput id="maxPrijava" type="number" inputmode="numeric" min="1" max="1000" step="1" formControlName="maxPrijava" data-max />
            @if (forma.controls.maxPrijava.invalid) {
              <mat-error>Max prijava mora biti između 1 i 1000.</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" class="puno">
            <mat-label>Napomena (opciono)</mat-label>
            <input matInput id="napomena" formControlName="napomena" maxlength="255" autocomplete="off" data-napomena />
            <mat-hint align="end">{{ forma.controls.napomena.value.length }} / 255</mat-hint>
          </mat-form-field>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" [mat-dialog-close]="undefined" data-odustani>Odustani</button>
        <button matButton="filled" type="submit" [disabled]="salje()" data-pokreni>
          @if (salje()) {
            <mat-progress-spinner mode="indeterminate" diameter="18" aria-label="Pokretanje" />
          }
          Pokreni onboarding
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .uputstvo { margin: 0 0 12px; color: var(--ink-2); }
    .polja { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 12px; }
    .puno { grid-column: 1 / -1; }
    button mat-progress-spinner { display: inline-block; margin-right: 8px; }
    @media (max-width: 599.98px) { .polja { grid-template-columns: 1fr; } }
  `,
})
export class PokreniOnboardingDialog {
  protected readonly cfg = inject<PokreniOnboardingCfg>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<PokreniOnboardingDialog, OnboardingSesijaInfo>>(MatDialogRef);
  private readonly api = inject(OnboardingApi);

  protected readonly forma = new FormGroup({
    rokUDanima: new FormControl<number | null>(7, [Validators.required, Validators.min(1), Validators.max(60), Validators.pattern(/^\d+$/)]),
    maxPrijava: new FormControl<number | null>(200, [Validators.required, Validators.min(1), Validators.max(1000), Validators.pattern(/^\d+$/)]),
    napomena: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
  });
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);

  static otvori(dialog: MatDialog, cfg: PokreniOnboardingCfg): Observable<OnboardingSesijaInfo | undefined> {
    return dialog
      .open<PokreniOnboardingDialog, PokreniOnboardingCfg, OnboardingSesijaInfo>(PokreniOnboardingDialog, {
        data: cfg,
        width: '34rem',
        maxWidth: '96vw',
      })
      .afterClosed();
  }

  protected pokreni(): void {
    if (this.salje()) {
      return;
    }
    if (this.forma.invalid) {
      this.forma.markAllAsTouched();
      return;
    }
    const v = this.forma.getRawValue();
    this.salje.set(true);
    this.greska.set(null);
    this.api
      .pokreni(this.cfg.grupaId, { isticeZaDana: v.rokUDanima as number, maxPrijava: v.maxPrijava as number, napomena: v.napomena.trim() || null }, { tiho: true })
      .subscribe({
        next: s => this.ref.close(s),
        error: (e: unknown) => {
          this.salje.set(false);
          this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
        },
      });
  }
}
