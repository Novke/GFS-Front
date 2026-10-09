import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Observable, map } from 'rxjs';

export interface PotvrdaPodaci {
  naslov: string;
  /** Pasusi poruke. */
  poruke: string[];
  potvrdi?: string;
  opasno?: boolean;
}

/** Dijalog za potvrdu (brisanje, završavanje); fokus je na "Otkaži" da Enter ne potvrdi slučajno. */
@Component({
  selector: 'app-potvrda-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ d.naslov }}</h2>
    <mat-dialog-content>
      @for (p of d.poruke; track $index) { <p>{{ p }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false" cdkFocusInitial>Otkaži</button>
      <button mat-flat-button type="button" [class.uz-opasno]="d.opasno" [mat-dialog-close]="true">
        {{ d.potvrdi ?? 'U redu' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class PotvrdaDialog {
  protected readonly d = inject<PotvrdaPodaci>(MAT_DIALOG_DATA);
}

/** `true` samo kad nastavnik potvrdi. */
export function potvrdi(dialog: MatDialog, podaci: PotvrdaPodaci): Observable<boolean> {
  return dialog.open<PotvrdaDialog, PotvrdaPodaci, boolean>(PotvrdaDialog, { data: podaci, maxWidth: '95vw', width: '440px' })
    .afterClosed().pipe(map(r => r === true));
}
