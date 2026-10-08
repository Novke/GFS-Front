import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { UcesnikStanje } from '../data-access/uzivo.models';
import { potvrdi } from '../ui/potvrda.dialog';
import { grupisiCifre } from '../ui/format';

/** Ime učesnika: 1-40 znakova posle `trim` (kao server, spec 2.8). */
export const IME_MAKS = 40;

/** Dijalog za novo ime učesnika; vraća ime bez razmaka na krajevima ili `undefined`. */
@Component({
  selector: 'gfs-preimenuj-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  template: `
    <form (ngSubmit)="sacuvaj()">
      <h2 mat-dialog-title>Preimenuj učesnika</h2>
      <mat-dialog-content>
        <mat-form-field class="uz-kon-polje">
          <mat-label>Ime</mat-label>
          <input matInput [formControl]="ime" [maxlength]="maks" autocomplete="off" cdkFocusInitial>
          <mat-hint align="end">{{ ime.value.length }}/{{ maks }}</mat-hint>
          @if (ime.invalid) { <mat-error>Ime ima od 1 do {{ maks }} znakova.</mat-error> }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Otkaži</button>
        <button mat-flat-button color="primary" type="submit">Sačuvaj</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class PreimenujDialog {
  private readonly ref = inject<MatDialogRef<PreimenujDialog, string>>(MatDialogRef);
  protected readonly maks = IME_MAKS;
  protected readonly ime = new FormControl(inject<string>(MAT_DIALOG_DATA), {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(IME_MAKS), Validators.pattern(/\S/)],
  });

  protected sacuvaj(): void {
    this.ime.markAsTouched();
    if (this.ime.invalid) return;
    this.ref.close(this.ime.value.trim());
  }
}

/**
 * Spisak učesnika (spec 2.8, 6.4): ime, povezan (tačka i tekst), odgovorio na trenutnu rundu, poeni uz takmičenje;
 * preimenuj u dijalogu, izbaci uz potvrdu. Učesnici su u redosledu prijave.
 */
@Component({
  selector: 'gfs-ucesnici-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  host: { class: 'uz-kon-ucesnici' },
  template: `
    <p class="uz-kon-zbir">Povezano {{ povezanih() }} od {{ ucesnici().length }}</p>
    @if (ucesnici().length) {
      <ul class="uz-kon-ucesnici-lista">
        @for (u of ucesnici(); track u.id) {
          <li class="uz-kon-ucesnik" [class.uz-kon-ucesnik--odsutan]="!u.povezan">
            <span class="uz-kon-tacka" [class.uz-kon-tacka--da]="u.povezan" aria-hidden="true"></span>
            <span class="uz-kon-ucesnik-ime">{{ u.ime }}<span class="uz-sr">{{ u.povezan ? ', povezan' : ', nije povezan' }}</span></span>
            @if (u.odgovorio) { <mat-icon class="uz-kon-odgovorio" aria-label="odgovorio">check</mat-icon> }
            @if (takmicenje()) { <span class="uz-kon-poeni">{{ poeni(u.poeni) }}</span> }
            <button mat-icon-button type="button" [attr.aria-label]="'Preimenuj ' + u.ime" (click)="preimenujDialog(u)">
              <mat-icon>edit</mat-icon>
            </button>
            <button mat-icon-button type="button" [attr.aria-label]="'Izbaci ' + u.ime" (click)="izbaciPotvrda(u)">
              <mat-icon>person_remove</mat-icon>
            </button>
          </li>
        }
      </ul>
    } @else {
      <p class="uz-prazno">Još niko nije ušao.</p>
    }
  `,
})
export class UcesniciPanelComponent {
  readonly ucesnici = input<readonly UcesnikStanje[]>([]);
  readonly takmicenje = input<boolean>(false);
  readonly preimenuj = output<{ id: number; ime: string }>();
  readonly izbaci = output<number>();

  private readonly dialog = inject(MatDialog);
  protected readonly poeni = grupisiCifre;
  protected readonly povezanih = computed(() => this.ucesnici().filter(u => u.povezan).length);

  protected preimenujDialog(u: UcesnikStanje): void {
    this.dialog.open<PreimenujDialog, string, string>(PreimenujDialog, { data: u.ime, width: '400px', maxWidth: '95vw' })
      .afterClosed().subscribe(ime => {
        if (ime && ime !== u.ime) this.preimenuj.emit({ id: u.id, ime });
      });
  }

  protected izbaciPotvrda(u: UcesnikStanje): void {
    potvrdi(this.dialog, {
      naslov: `Izbaciti „${u.ime}“?`,
      poruke: ['Učesnik više ne može da odgovara; može ponovo da uđe pod novim imenom.'],
      potvrdi: 'Izbaci', opasno: true,
    }).subscribe(da => {
      if (da) this.izbaci.emit(u.id);
    });
  }
}
