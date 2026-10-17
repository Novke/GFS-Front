import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { Observable } from 'rxjs';

import { porukaValidacije } from '../../../shared/forms/poruke-validacije';

/** Najduži naziv grupe (`BankaPP.MAX_NAZIV_GRUPE`). */
export const MAX_NAZIV_GRUPE = 120;
export const TEZINE = [1, 2, 3, 4, 5] as const;

export interface GrupaDialogPodaci {
  naslov: string;
  naziv?: string;
  tezina?: number | null;
  /** Unutrašnji čvor: težina se ne pita (ima je samo list). */
  bezTezine?: boolean;
  /** Grupa već ima varijante: server odbija izmenu bez težine. */
  tezinaObavezna?: boolean;
  /** Nazivi braće (bez same grupe): server odbija isti naziv bez obzira na velika slova. */
  zauzetiNazivi?: readonly string[];
  /** Tekst dugmeta potvrde; podrazumevano "Sačuvaj". */
  potvrdi?: string;
}

export interface GrupaDialogRezultat {
  naziv: string;
  tezina: number | null;
}

const normalizovan = (s: string) => s.trim().toLocaleLowerCase('sr');

function slobodanNaziv(zauzeti: readonly string[]): ValidatorFn {
  const skup = new Set(zauzeti.map(normalizovan));
  return (c: AbstractControl<string>): ValidationErrors | null => (skup.has(normalizovan(c.value ?? '')) ? { zauzet: true } : null);
}

/**
 * Naziv (1-120) i težina (1-5, opciona) grupe banke: nova grupa (koren ili podgrupa) i izmena postojeće. Ne čuva sam: vraća
 * `{naziv, tezina}` ili `undefined` (Odustani), a store šalje komandu i javlja grešku servera.
 */
@Component({
  selector: 'app-grupa-dialog',
  imports: [
    MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatError, MatFormField, MatHint, MatInput,
    MatLabel, MatOption, MatSelect, ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ d.naslov }}</h2>
    <form [formGroup]="forma" (ngSubmit)="sacuvaj()" novalidate>
      <mat-dialog-content>
        <div class="bk-dijalog-polja">
          <mat-form-field appearance="outline">
            <mat-label>Naziv</mat-label>
            <input matInput formControlName="naziv" maxlength="120" autocomplete="off" data-naziv />
            @if (poruka(); as m) {
              <mat-error>{{ m }}</mat-error>
            }
          </mat-form-field>
          @if (!d.bezTezine) {
            <mat-form-field appearance="outline">
              <mat-label>Težina</mat-label>
              <mat-select formControlName="tezina" data-tezina>
                @if (!d.tezinaObavezna) {
                  <mat-option [value]="null">Bez težine</mat-option>
                }
                @for (t of tezine; track t) {
                  <mat-option [value]="t">{{ t }}</mat-option>
                }
              </mat-select>
              <mat-hint>Od 1 do 5; varijante se dodaju tek u grupu sa težinom.</mat-hint>
              @if (forma.controls.tezina.hasError('required')) {
                <mat-error>Grupa ima varijante, pa mora imati težinu.</mat-error>
              }
            </mat-form-field>
          }
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" [mat-dialog-close]="undefined" data-odustani>Odustani</button>
        <button matButton="filled" type="submit" data-sacuvaj>{{ d.potvrdi ?? 'Sačuvaj' }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .bk-dijalog-polja { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 0 12px; }
    @media (max-width: 599.98px) { .bk-dijalog-polja { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class GrupaDialog {
  protected readonly d = inject<GrupaDialogPodaci>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<GrupaDialog, GrupaDialogRezultat>>(MatDialogRef);

  protected readonly tezine = TEZINE;
  protected readonly forma = new FormGroup({
    naziv: new FormControl(this.d.naziv ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(MAX_NAZIV_GRUPE), slobodanNaziv(this.d.zauzetiNazivi ?? [])],
    }),
    tezina: new FormControl<number | null>(this.d.tezina ?? null, this.d.tezinaObavezna && !this.d.bezTezine ? Validators.required : null),
  });

  static otvori(dialog: MatDialog, podaci: GrupaDialogPodaci): Observable<GrupaDialogRezultat | undefined> {
    return dialog
      .open<GrupaDialog, GrupaDialogPodaci, GrupaDialogRezultat>(GrupaDialog, { data: podaci, width: '30rem', maxWidth: '96vw' })
      .afterClosed();
  }

  protected poruka(): string | null {
    const c = this.forma.controls.naziv;
    return c.hasError('zauzet') && !c.hasError('required') ? 'Grupa sa tim nazivom već postoji.' : porukaValidacije(c.errors, 'Naziv');
  }

  protected sacuvaj(): void {
    const naziv = this.forma.controls.naziv;
    if (naziv.value.trim() === '') {
      naziv.setValue('');
    }
    if (this.forma.invalid) {
      this.forma.markAllAsTouched();
      return;
    }
    this.ref.close({ naziv: naziv.value.trim(), tezina: this.d.bezTezine ? null : this.forma.controls.tezina.value });
  }
}
