import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { NastavnickiZadatak, UcesnikStanje } from '../data-access/uzivo.models';
import { grupisiCifre } from '../ui/format';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';

/** Ime učesnika: 1-40 znakova posle `trim` (kao server, spec 2.8). */
export const IME_MAKS = 40;

/** Dijalog za novo ime učesnika; vraća ime bez razmaka na krajevima ili `undefined`. */
@Component({
  selector: 'app-preimenuj-dialog',
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
        <button mat-flat-button type="submit">Sačuvaj</button>
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

/** Varijanta učesnika u trenutnoj Zadatak rundi: naziv (ili redni broj izvučene) i da li se radi na papiru. */
interface VarijantaUcesnika { naziv: string; papir: boolean; }

/**
 * Spisak učesnika (spec 2.8, 6.4): ime, povezan (tačka i tekst), odgovorio na trenutnu rundu, poeni uz takmičenje;
 * preimenuj u dijalogu, izbaci uz potvrdu. Učesnici su u redosledu prijave. U Zadatak rundi uz ime još dodeljena
 * varijanta i ishod (tačno, netačno, nije odgovorio; na papiru bez ishoda), samo u konzoli (banka spec 4.2.5).
 */
@Component({
  selector: 'app-ucesnici-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  host: { class: 'uz-kon-ucesnici' },
  // Zadatak runda: varijanta i ishod uz ime (u komponenti: početni paket je na granici budžeta)
  styles: `
    .uz-kon-varijanta {
      flex: none; max-width: 7em; padding: 0 6px; border: 1px solid var(--line); border-radius: 6px; font-size: 13px;
      font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .uz-kon-ishod { flex: none; color: var(--muted); font-size: 13px; }
    .uz-kon-ishod--tacno { color: var(--ok); font-weight: 600; }
    .uz-kon-ishod--netacno { color: var(--danger); font-weight: 600; }
  `,
  template: `
    <p class="uz-kon-zbir">Povezano {{ povezanih() }} od {{ ucesnici().length }}</p>
    @if (ucesnici().length) {
      <ul class="uz-kon-ucesnici-lista">
        @for (u of ucesnici(); track u.id) {
          <li class="uz-kon-ucesnik" [class.uz-kon-ucesnik--odsutan]="!u.povezan">
            <span class="uz-kon-tacka" [class.uz-kon-tacka--da]="u.povezan" aria-hidden="true"></span>
            <span class="uz-kon-ucesnik-ime">{{ u.ime }}<span class="uz-sr">{{ u.povezan ? ', povezan' : ', nije povezan' }}</span></span>
            @if (varijantaOd(u); as v) {
              <span class="uz-kon-varijanta" [title]="'Varijanta ' + v.naziv">{{ v.naziv }}</span>
              @if (v.papir) {
                <span class="uz-kon-ishod">na papiru</span>
              } @else {
                @let ishod = u.tacno === true ? 'tačno' : u.tacno === false ? 'netačno' : u.odgovorio ? 'odgovorio' : 'nije odgovorio';
                <span class="uz-kon-ishod" [class.uz-kon-ishod--tacno]="u.tacno === true" [class.uz-kon-ishod--netacno]="u.tacno === false">{{ ishod }}</span>
              }
            }
            @if (u.odgovorio) { <mat-icon class="uz-kon-odgovorio" aria-label="odgovorio" svgIcon="check" /> }
            @if (takmicenje()) { <span class="uz-kon-poeni">{{ poeni(u.poeni) }}</span> }
            <button mat-icon-button type="button" [attr.aria-label]="'Preimenuj ' + u.ime" (click)="preimenujDialog(u)">
              <mat-icon svgIcon="edit" />
            </button>
            <button mat-icon-button type="button" [attr.aria-label]="'Izbaci ' + u.ime" (click)="izbaciPotvrda(u)">
              <mat-icon svgIcon="person_remove" />
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
  /** Zadatak trenutnog slajda (`null` van njega): nazivi izvučenih varijanti i rad na papiru. */
  readonly zadatak = input<NastavnickiZadatak | null>(null);
  readonly preimenuj = output<{ id: number; ime: string }>();
  readonly izbaci = output<number>();

  private readonly dialog = inject(MatDialog);
  protected readonly poeni = grupisiCifre;
  protected readonly povezanih = computed(() => this.ucesnici().filter(u => u.povezan).length);
  protected readonly varijante = computed(() => {
    const z = this.zadatak();
    const papir = new Set((z?.rezultat?.varijante ?? []).filter(r => r.polja.length === 0).map(r => r.varijantaId));
    return new Map<number, VarijantaUcesnika>((z?.varijante ?? []).map((v, i) => [
      v.varijantaId, { naziv: v.naziv ?? `V${i + 1}`, papir: papir.has(v.varijantaId) },
    ]));
  });

  /** Dodeljena varijanta u trenutnoj Zadatak rundi (`null` van nje i dok učesnik nema dodelu). */
  protected varijantaOd(u: UcesnikStanje): VarijantaUcesnika | null {
    return u.varijantaId == null ? null : this.varijante().get(u.varijantaId) ?? null;
  }

  protected preimenujDialog(u: UcesnikStanje): void {
    this.dialog.open<PreimenujDialog, string, string>(PreimenujDialog, { data: u.ime, width: '400px', maxWidth: '95vw' })
      .afterClosed().subscribe(ime => {
        if (ime && ime !== u.ime) this.preimenuj.emit({ id: u.id, ime });
      });
  }

  protected izbaciPotvrda(u: UcesnikStanje): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: `Izbaciti „${u.ime}“?`,
      tekst: 'Učesnik više ne može da odgovara; može ponovo da uđe pod novim imenom.',
      potvrdi: 'Izbaci', destruktivno: true,
    }).subscribe(da => {
      if (da) this.izbaci.emit(u.id);
    });
  }
}
