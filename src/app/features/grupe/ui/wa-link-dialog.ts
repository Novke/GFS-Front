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
import { GrupeApi } from '../../../core/api/grupe.api';
import { WaLinkInfo } from '../../../core/api/grupe.models';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';

export interface WaLinkDialogCfg {
  grupa: { id: number; naziv: string };
  /** Trenutni link ili `null` (nije podešen). */
  waLink: string | null;
}

/**
 * "WhatsApp grupa": link za poziv u grupu generacije (`PATCH grupe/{id}/wa-link`). Server prihvata ono što WhatsApp
 * daje pri deljenju i čuva kanonski oblik; njegova poruka ide u traku iznad polja. "Ukloni link" šalje `null`.
 * Vraća sačuvan `WaLinkInfo` ili `undefined` (Odustani).
 */
@Component({
  selector: 'app-wa-link-dialog',
  imports: [
    FormErrorBanner, MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatError, MatFormField,
    MatHint, MatInput, MatLabel, MatProgressSpinner, ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>WhatsApp grupa · {{ cfg.grupa.naziv }}</h2>
    <form [formGroup]="forma" (ngSubmit)="sacuvaj(link.value)" novalidate>
      <mat-dialog-content>
        <app-form-error-banner [poruka]="greska()" />
        <p class="uvod">
          Link vide studenti posle prijave preko QR forme, a ide i u mejl „Pošalji WA link“.
          U WhatsApp-u: Info grupe → Pozovi putem linka → Kopiraj link.
        </p>
        <mat-form-field appearance="outline">
          <mat-label>Link za poziv</mat-label>
          <input matInput formControlName="link" type="url" inputmode="url" autocomplete="off" placeholder="https://chat.whatsapp.com/…" data-wa-polje />
          <mat-hint>https://chat.whatsapp.com/…</mat-hint>
          @if (link.hasError('required')) {
            <mat-error>Unesi link ili izaberi „Ukloni link“.</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        @if (cfg.waLink) {
          <button matButton type="button" class="ukloni" [disabled]="salje()" (click)="sacuvaj(null)" data-ukloni>Ukloni link</button>
        }
        <button matButton type="button" [mat-dialog-close]="undefined" data-odustani>Odustani</button>
        <button matButton="filled" type="submit" [disabled]="salje()" data-sacuvaj>
          @if (salje()) {
            <mat-progress-spinner mode="indeterminate" diameter="18" aria-label="Čuvanje" />
          }
          Sačuvaj
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .uvod { margin: 0 0 16px; color: var(--ink-2); }
    mat-form-field { width: 100%; }
    .ukloni { margin-right: auto; }
    button mat-progress-spinner { display: inline-block; margin-right: 8px; }
  `,
})
export class WaLinkDialog {
  protected readonly cfg = inject<WaLinkDialogCfg>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<WaLinkDialog, WaLinkInfo>>(MatDialogRef);
  private readonly api = inject(GrupeApi);

  protected readonly link = new FormControl(this.cfg.waLink ?? '', { nonNullable: true, validators: [Validators.required] });
  protected readonly forma = new FormGroup({ link: this.link });
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);

  static otvori(dialog: MatDialog, cfg: WaLinkDialogCfg): Observable<WaLinkInfo | undefined> {
    return dialog.open<WaLinkDialog, WaLinkDialogCfg, WaLinkInfo>(WaLinkDialog, { data: cfg, width: '34rem', maxWidth: '96vw' }).afterClosed();
  }

  /** `null` = ukloni link; inače tekst iz polja (prazno polje se ne šalje, za to je "Ukloni link"). */
  protected sacuvaj(vrednost: string | null): void {
    if (this.salje()) {
      return;
    }
    if (vrednost !== null) {
      vrednost = vrednost.trim();
      this.link.setValue(vrednost);
      if (this.link.invalid) {
        this.link.markAsTouched();
        return;
      }
    }
    this.salje.set(true);
    this.greska.set(null);
    this.api.postaviWaLink(this.cfg.grupa.id, vrednost, { tiho: true }).subscribe({
      next: info => this.ref.close(info),
      error: (e: unknown) => {
        this.salje.set(false);
        this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
      },
    });
  }
}
