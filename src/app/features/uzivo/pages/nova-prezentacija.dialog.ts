import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Observable } from 'rxjs';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { razlogGreske } from '../data-access/razlog-greske';
import { PORUKE, greskePrezentacije } from '../data-access/slajd-pravila';
import { PredmetKratko, PrezentacijaDetails } from '../data-access/uzivo.models';

export interface NovaPrezentacijaPodaci { predmeti: PredmetKratko[]; predmetId: number | null; }

export function otvoriNovuPrezentaciju(dialog: MatDialog, podaci: NovaPrezentacijaPodaci): Observable<PrezentacijaDetails | undefined> {
  return dialog.open<NovaPrezentacijaDialog, NovaPrezentacijaPodaci, PrezentacijaDetails>(NovaPrezentacijaDialog, {
    data: podaci, width: '520px', maxWidth: '95vw',
  }).afterClosed();
}

/** Nova prezentacija: predmet, naziv, opis -> `POST /prezentacije`; zatvara se sa napravljenom prezentacijom. */
@Component({
  selector: 'gfs-nova-prezentacija-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>Nova prezentacija</h2>
    <form [formGroup]="forma" (ngSubmit)="napravi()">
      <mat-dialog-content class="uz-ed-dijalog">
        <mat-form-field>
          <mat-label>Predmet</mat-label>
          <mat-select formControlName="predmetId" required>
            @for (p of data.predmeti; track p.id) {
              <mat-option [value]="p.id">{{ p.naziv }}</mat-option>
            }
          </mat-select>
          <mat-hint>Prezentacija pripada predmetu i koristi se iz godine u godinu.</mat-hint>
          <mat-error>Izaberi predmet.</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Naziv</mat-label>
          <input matInput formControlName="naziv" required maxlength="200" cdkFocusInitial>
          <mat-error>{{ porukaNaziv }}</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Opis (nije obavezan)</mat-label>
          <textarea matInput formControlName="opis" rows="3" maxlength="1000"></textarea>
        </mat-form-field>
        @if (greska(); as g) {
          <p class="uz-ed-greska" role="alert">{{ g }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Otkaži</button>
        <button mat-flat-button color="primary" type="submit" [disabled]="salje()">Napravi</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class NovaPrezentacijaDialog {
  protected readonly data = inject<NovaPrezentacijaPodaci>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<NovaPrezentacijaDialog, PrezentacijaDetails>>(MatDialogRef);
  private readonly api = inject(PrezentacijeApi);

  protected readonly porukaNaziv = PORUKE.naziv;
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);
  protected readonly forma = new FormGroup({
    predmetId: new FormControl<number | null>(this.data.predmetId, Validators.required),
    naziv: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
    opis: new FormControl('', { nonNullable: true }),
  });

  protected napravi(): void {
    this.forma.markAllAsTouched();
    const { predmetId, naziv, opis } = this.forma.getRawValue();
    const greske = greskePrezentacije(naziv, opis);
    if (this.forma.invalid || predmetId === null || greske.length) {
      this.greska.set(greske[0] ?? null);
      return;
    }
    this.salje.set(true);
    this.greska.set(null);
    this.api.kreiraj({ predmetId, naziv: naziv.trim(), opis: opis.trim() || null }).subscribe({
      next: p => this.ref.close(p),
      error: e => {
        this.salje.set(false);
        this.greska.set(razlogGreske(e, 'Prezentacija nije napravljena.'));
      },
    });
  }
}
