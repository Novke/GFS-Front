import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { EkranOpis } from './monitor';

/** Izbor ekrana za prikaz publike (Window Management API, više ekrana). Koriste ga konzola i tabla predavanja. */
@Component({
  selector: 'app-izbor-ekrana-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  styles: `.uz-kon-ekrani { display: flex; flex-direction: column; gap: 8px; }`,
  template: `
    <h2 mat-dialog-title>Na kom ekranu?</h2>
    <mat-dialog-content>
      <div class="uz-kon-ekrani">
        @for (e of ekrani; track $index) {
          <button mat-stroked-button type="button" [mat-dialog-close]="e">
            <mat-icon [svgIcon]="e.primarni ? 'computer' : 'tv'" />{{ e.oznaka }}
          </button>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="null" cdkFocusInitial>Otkaži</button>
    </mat-dialog-actions>
  `,
})
export class IzborEkranaDialog {
  protected readonly ekrani = inject<EkranOpis[]>(MAT_DIALOG_DATA);
}

/**
 * Funkcija izbora za {@link otvoriPublikuNaMonitoru}: otvara dijalog i javlja da li je korisnik otkazao (`otkazano()`),
 * da pozivalac ne prijavi "blokiran prozor" kad je samo zatvorio izbor.
 */
export function izborEkrana(dialog: MatDialog): { izbor: (ekrani: EkranOpis[]) => Promise<EkranOpis | null>; otkazano: () => boolean } {
  let otkazano = false;
  return {
    izbor: async (ekrani: EkranOpis[]) => {
      const e = await firstValueFrom(
        dialog.open<IzborEkranaDialog, EkranOpis[], EkranOpis | null>(IzborEkranaDialog, { data: ekrani, width: '420px', maxWidth: '95vw' })
          .afterClosed());
      otkazano = !e;
      return e ?? null;
    },
    otkazano: () => otkazano,
  };
}
