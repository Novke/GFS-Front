import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { Observable } from 'rxjs';

import { blokVremena, danIDatum } from '../../../shared/util/termin';
import { TerminInfo } from '../data-access/raspored.models';

/** Izbor u dijalogu vraćanja termina. */
export interface IzborVracanja {
  posaljiMejl: boolean;
}

/**
 * Vraćanje otkazanog termina („čas se ipak održava“, spec najave odsustva, odeljak 6): potvrda (alertdialog) sa izborom
 * „Obavesti studente mejlom i na telefon“ (uključeno). Vraća izbor ili `undefined` (Odustani); zahtev šalje stranica.
 */
@Component({
  selector: 'app-vracanje-dialog',
  imports: [MatButton, MatCheckbox, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Vratiti čas?</h2>
    <mat-dialog-content>
      <p class="opis">
        <strong>{{ t.predmet.naziv }}</strong> · {{ t.grupa.naziv }}<br />
        {{ dan }}, {{ blok }}
      </p>
      <p class="opis">Čas se ipak održava: studenti na nalogu više ne vide „Nema časa“.</p>
      <mat-checkbox [formControl]="posaljiMejl" data-posalji-mejl>Obavesti studente mejlom i na telefon („Čas se ipak održava“)</mat-checkbox>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" [mat-dialog-close]="undefined">Odustani</button>
      <button matButton="filled" type="button" (click)="potvrdi()" data-vrati-potvrdi>Vrati čas</button>
    </mat-dialog-actions>
  `,
  styles: `
    .opis { margin: 0 0 12px; }
    mat-checkbox { display: block; }
  `,
})
export class VracanjeDialog {
  protected readonly t = inject<TerminInfo>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<VracanjeDialog, IzborVracanja>);
  protected readonly dan = danIDatum(this.t.datum);
  protected readonly blok = blokVremena(this.t.pocetak, this.t.kraj);
  protected readonly posaljiMejl = new FormControl(true, { nonNullable: true });

  static otvori(dialog: MatDialog, t: TerminInfo): Observable<IzborVracanja | undefined> {
    return dialog
      .open<VracanjeDialog, TerminInfo, IzborVracanja>(VracanjeDialog, {
        data: t, role: 'alertdialog', width: '30rem', maxWidth: '96vw', autoFocus: 'first-tabbable',
      })
      .afterClosed();
  }

  protected potvrdi(): void {
    this.ref.close({ posaljiMejl: this.posaljiMejl.value });
  }
}
