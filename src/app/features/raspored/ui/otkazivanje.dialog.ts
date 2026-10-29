import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Observable } from 'rxjs';

import { blokVremena, danIDatum } from '../../../shared/util/termin';
import { MAX_NAPOMENA, TerminInfo } from '../data-access/raspored.models';

/** Šta je nastavnik izabrao u dijalogu otkazivanja (`napomena` `''` = bez napomene). */
export interface IzborOtkazivanja {
  napomena: string;
  posaljiMejl: boolean;
}

/**
 * Otkazivanje termina (spec najave odsustva, odeljak 6): napomena za studente (nije obavezna, do 200 znakova) i „Pošalji
 * mejl studentima“ (uključeno). Vraća izbor ili `undefined` (Odustani). Zahtev šalje stranica. Za već otkazan termin isti
 * dijalog menja samo napomenu (server tada ne šalje mejl ponovo, pa izbora mejla nema).
 */
@Component({
  selector: 'app-otkazivanje-dialog',
  imports: [
    MatButton, MatCheckbox, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatError, MatFormField, MatHint, MatInput,
    MatLabel, ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ t.otkazan ? 'Napomena za otkazan čas' : 'Otkazati čas?' }}</h2>
    <mat-dialog-content>
      <p class="opis">
        <strong>{{ t.predmet.naziv }}</strong> · {{ t.grupa.naziv }}<br />
        {{ dan }}, {{ blok }}
      </p>
      @if (t.otkazan) {
        <p class="opis">Čas je već otkazan; studenti vide novu napomenu na nalogu, a mejl se ne šalje ponovo.</p>
      } @else {
        <p class="opis">Studenti iz rasporeda ovog časa na nalogu vide „Nema časa“ i napomenu.</p>
      }
      <mat-form-field appearance="outline" class="polje">
        <mat-label>Napomena za studente (nije obavezno)</mat-label>
        <textarea matInput rows="3" [formControl]="napomena" [maxlength]="max" data-napomena></textarea>
        <mat-hint align="end">{{ napomena.value.length }}/{{ max }}</mat-hint>
        @if (napomena.hasError('maxlength')) {
          <mat-error>Najviše {{ max }} znakova.</mat-error>
        }
      </mat-form-field>
      @if (!t.otkazan) {
        <mat-checkbox [formControl]="posaljiMejl" data-posalji-mejl>Pošalji mejl studentima („Nema časa“, jedan po studentu)</mat-checkbox>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" [mat-dialog-close]="undefined">Odustani</button>
      <button matButton="filled" type="button" class="destruktivno" [disabled]="napomena.invalid" (click)="potvrdi()" data-otkazi-potvrdi>
        {{ t.otkazan ? 'Sačuvaj napomenu' : 'Otkaži čas' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .opis { margin: 0 0 12px; }
    .polje { width: 100%; }
    mat-checkbox { display: block; margin-top: 4px; }
    .destruktivno {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class OtkazivanjeDialog {
  protected readonly t = inject<TerminInfo>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<OtkazivanjeDialog, IzborOtkazivanja>);
  protected readonly max = MAX_NAPOMENA;
  protected readonly dan = danIDatum(this.t.datum);
  protected readonly blok = blokVremena(this.t.pocetak, this.t.kraj);
  protected readonly napomena = new FormControl(this.t.napomena ?? '', { nonNullable: true, validators: [Validators.maxLength(MAX_NAPOMENA)] });
  protected readonly posaljiMejl = new FormControl(true, { nonNullable: true });

  static otvori(dialog: MatDialog, t: TerminInfo): Observable<IzborOtkazivanja | undefined> {
    return dialog
      .open<OtkazivanjeDialog, TerminInfo, IzborOtkazivanja>(OtkazivanjeDialog, { data: t, width: '32rem', maxWidth: '96vw', autoFocus: 'first-tabbable' })
      .afterClosed();
  }

  protected potvrdi(): void {
    if (this.napomena.valid) {
      this.ref.close({ napomena: this.napomena.value.trim(), posaljiMejl: !this.t.otkazan && this.posaljiMejl.value });
    }
  }
}
