import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle,
} from '@angular/material/dialog';
import { map, Observable } from 'rxjs';

let brojDijaloga = 0;
const opisZa = (idDijaloga: string) => `${idDijaloga}-opis`;

export interface ConfirmDialogCfg {
  naslov: string;
  /** Poruka; niz su pasusi. */
  tekst: string | readonly string[];
  /** Tekst dugmeta potvrde, npr. "Obriši". */
  potvrdi: string;
  /** Crveno dugme; tekst treba da opiše šta se briše. */
  destruktivno?: boolean;
}

/**
 * Potvrda umesto prozora brauzera (`alertdialog`, tekst je njegov opis kroz `aria-describedby`). Esc, klik van dijaloga i
 * "Odustani" daju `false`. Destruktivna varijanta počinje fokusom na "Odustani".
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ cfg.naslov }}</h2>
    <mat-dialog-content [id]="opisId">
      @if (pasusi.length === 1) {
        {{ pasusi[0] }}
      } @else {
        @for (p of pasusi; track $index) { <p>{{ p }}</p> }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton data-odustani [mat-dialog-close]="false">Odustani</button>
      <button
        matButton="filled"
        data-potvrdi
        [class.destruktivno]="cfg.destruktivno"
        [mat-dialog-close]="true"
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
  protected readonly pasusi: readonly string[] = typeof this.cfg.tekst === 'string' ? [this.cfg.tekst] : this.cfg.tekst;
  /** Isti id koji `otvori` daje kao `ariaDescribedBy`. */
  protected readonly opisId = opisZa(inject(MatDialogRef).id);

  static otvori(dialog: MatDialog, cfg: ConfirmDialogCfg): Observable<boolean> {
    const id = `potvrda-${++brojDijaloga}`;
    return dialog
      .open<ConfirmDialog, ConfirmDialogCfg, boolean>(ConfirmDialog, {
        id, data: cfg, role: 'alertdialog', ariaDescribedBy: opisZa(id),
        autoFocus: cfg.destruktivno ? '[data-odustani]' : '[data-potvrdi]', width: '28rem', maxWidth: '92vw',
      })
      .afterClosed()
      .pipe(map(rez => rez === true));
  }
}
