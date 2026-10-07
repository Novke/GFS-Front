import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle } from '@angular/material/dialog';
import { map, Observable } from 'rxjs';

export interface ConfirmDialogCfg {
  naslov: string;
  tekst: string;
  /** Tekst dugmeta potvrde, npr. "Obriši". */
  potvrdi: string;
  /** Crveno dugme; tekst treba da opiše šta se briše. */
  destruktivno?: boolean;
}

/** Potvrda umesto `confirm()`. Esc, klik van dijaloga i "Odustani" daju `false`. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ cfg.naslov }}</h2>
    <mat-dialog-content>{{ cfg.tekst }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton data-odustani [mat-dialog-close]="false">Odustani</button>
      <button
        matButton="filled"
        data-potvrdi
        [class.destruktivno]="cfg.destruktivno"
        [mat-dialog-close]="true"
        cdkFocusInitial
      >{{ cfg.potvrdi }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .destruktivno {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class ConfirmDialog {
  protected readonly cfg = inject<ConfirmDialogCfg>(MAT_DIALOG_DATA);

  static otvori(dialog: MatDialog, cfg: ConfirmDialogCfg): Observable<boolean> {
    return dialog
      .open<ConfirmDialog, ConfirmDialogCfg, boolean>(ConfirmDialog, { data: cfg, role: 'alertdialog', width: '28rem', maxWidth: '92vw' })
      .afterClosed()
      .pipe(map(rez => rez === true));
  }
}
