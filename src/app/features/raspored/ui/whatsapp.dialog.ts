import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAnchor, MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { whatsAppLink } from '../data-access/whatsapp';

/**
 * „Pošalji u WhatsApp“ posle otkazivanja ili vraćanja termina (spec aplikacije i obaveštenja, odeljak 7): predlog poruke koji
 * nastavnik može da izmeni, pa „Otvori WhatsApp“ (`wa.me` sa tekstom). Grupu bira u WhatsApp-u; aplikacija ništa ne šalje.
 */
@Component({
  selector: 'app-whatsapp-dialog',
  imports: [MatAnchor, MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatFormField, MatInput,
    MatLabel, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Pošalji u WhatsApp</h2>
    <mat-dialog-content>
      <p class="opis">Proveri tekst, otvori WhatsApp i izaberi grupu.</p>
      <mat-form-field appearance="outline" class="polje">
        <mat-label>Poruka</mat-label>
        <textarea matInput [formControl]="tekst" rows="4" maxlength="1000" data-wa-tekst></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Zatvori</button>
      <a matButton="filled" [href]="link()" target="_blank" rel="noopener noreferrer" [attr.aria-disabled]="prazno()"
         [class.onemoguceno]="prazno()" data-wa-otvori>Otvori WhatsApp</a>
    </mat-dialog-actions>
  `,
  styles: `
    .opis { margin: 0 0 12px; }
    .polje { width: 100%; }
    .onemoguceno { pointer-events: none; opacity: .5; }
  `,
})
export class WhatsAppDialog {
  protected readonly tekst = new FormControl(inject<string>(MAT_DIALOG_DATA), { nonNullable: true });
  private readonly vrednost = toSignal(this.tekst.valueChanges, { initialValue: this.tekst.value });
  protected readonly link = computed(() => whatsAppLink(this.vrednost().trim()));
  protected readonly prazno = computed(() => this.vrednost().trim() === '');

  static otvori(dialog: MatDialog, tekst: string): void {
    dialog.open<WhatsAppDialog, string>(WhatsAppDialog, { data: tekst, width: '32rem', maxWidth: '96vw', autoFocus: 'first-tabbable' });
  }
}
