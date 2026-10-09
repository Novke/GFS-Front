import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatOption, MatSelect } from '@angular/material/select';
import { Observable } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { StudentiApi, StudentPregledDetails, UpdateStudentCmd } from '../../../core/api/studenti.api';
import { NotificationStore } from '../../../core/state/notification.store';
import { ReferenceStore } from '../../../core/state/reference.store';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { porukaValidacije } from '../../../shared/forms/poruke-validacije';
import { ErrorPanel } from '../../../shared/ui/list-states';

export interface StudentIzmenaCfg {
  id: number;
  /** `izmena`: podaci studenta; `premesti`: samo grupa (ostali podaci se šalju nepromenjeni). */
  nacin: 'izmena' | 'premesti';
  /** Trenutna grupa (`null` za studenta bez grupe: server traži grupu, pa je izbor obavezan). */
  grupaId: number | null;
}

type ImeKontrole = 'grupa' | 'ime' | 'prezime' | 'indeks' | 'godina' | 'email' | 'telefon' | 'datum' | 'opstina';

const LABELE: Record<ImeKontrole, string> = {
  grupa: 'Grupa',
  ime: 'Ime',
  prezime: 'Prezime',
  indeks: 'Indeks',
  godina: 'Godina upisa',
  email: 'Email',
  telefon: 'Broj telefona',
  datum: 'Datum rođenja',
  opstina: 'Opština',
};

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const prazno = (v: string): string | null => v.trim() || null;

/**
 * Izmena podataka i premeštanje studenta (`PUT studenti/{id}`). Server prima pun zapis i briše izostavljena opciona polja,
 * pa dijalog pri otvaranju učitava studenta (`GET studenti/{id}`, sa datumom rođenja i opštinom) i tek tada se može
 * sačuvati. Proverava se svih devet polja u oba načina: ako u "Premesti" neko nevidljivo polje nije ispravno (npr. stari red
 * bez godine upisa), šalje se samo upozorenje da se prvo uradi "Izmeni podatke". Greška servera (npr. duplikat indeksa u godini upisa) ide u traku iznad forme. Vraća `true` posle uspeha.
 */
@Component({
  selector: 'app-student-izmena-dialog',
  imports: [
    ErrorPanel, FormErrorBanner, MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatError,
    MatFormField, MatInput, MatLabel, MatOption, MatProgressSpinner, MatSelect, ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ cfg.nacin === 'premesti' ? 'Premesti u drugu grupu' : 'Izmeni podatke studenta' }}</h2>
    <form [formGroup]="forma" (ngSubmit)="sacuvaj()" novalidate>
      <mat-dialog-content>
        @if (greskaUcitavanja(); as g) {
          <app-error-panel naslov="Podaci studenta nisu učitani." [poruka]="g" (ponovo)="ucitaj()" />
        } @else if (ucitava()) {
          <p class="ucitava" role="status"><mat-progress-spinner mode="indeterminate" diameter="18" />Učitavam podatke…</p>
        } @else {
          <app-form-error-banner [poruka]="greska()" />
          <div class="polja">
            @if (cfg.nacin === 'premesti') {
              <p class="uputstvo">{{ imeStudenta() }} se premešta u izabranu grupu; ostali podaci ostaju isti.</p>
              <mat-form-field appearance="outline">
                <mat-label>Nova grupa</mat-label>
                <mat-select formControlName="grupa" data-grupa>
                  @for (g of reference.grupe(); track g.id) {
                    <mat-option [value]="g.id">{{ g.naziv }}</mat-option>
                  }
                </mat-select>
                @if (poruka('grupa'); as m) {
                  <mat-error>{{ m }}</mat-error>
                }
              </mat-form-field>
            } @else {
              <mat-form-field appearance="outline">
                <mat-label>Ime</mat-label>
                <input matInput formControlName="ime" maxlength="60" autocomplete="off" data-ime />
                @if (poruka('ime'); as m) {
                  <mat-error>{{ m }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Prezime</mat-label>
                <input matInput formControlName="prezime" maxlength="60" autocomplete="off" data-prezime />
                @if (poruka('prezime'); as m) {
                  <mat-error>{{ m }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Indeks</mat-label>
                <input matInput formControlName="indeks" maxlength="20" autocomplete="off" data-indeks />
                @if (poruka('indeks'); as m) {
                  <mat-error>{{ m }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Godina upisa</mat-label>
                <input matInput type="number" formControlName="godina" data-godina />
                @if (poruka('godina'); as m) {
                  <mat-error>{{ m }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Email</mat-label>
                <input matInput type="email" formControlName="email" maxlength="255" autocomplete="off" data-email />
                @if (poruka('email'); as m) {
                  <mat-error>{{ m }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Broj telefona</mat-label>
                <input matInput type="tel" formControlName="telefon" maxlength="20" autocomplete="off" data-telefon />
                @if (poruka('telefon'); as m) {
                  <mat-error>{{ m }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Datum rođenja</mat-label>
                <input matInput type="date" formControlName="datum" data-datum />
                @if (poruka('datum'); as m) {
                  <mat-error>{{ m }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Opština</mat-label>
                <input matInput formControlName="opstina" maxlength="100" autocomplete="off" data-opstina />
                @if (poruka('opstina'); as m) {
                  <mat-error>{{ m }}</mat-error>
                }
              </mat-form-field>
            }
          </div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" data-odustani [mat-dialog-close]="false">Odustani</button>
        <button matButton="filled" type="submit" data-sacuvaj [disabled]="salje() || ucitava() || greskaUcitavanja() !== null">
          @if (salje()) {
            <mat-progress-spinner mode="indeterminate" diameter="18" aria-label="Čuvanje" />
          }
          {{ cfg.nacin === 'premesti' ? 'Premesti' : 'Sačuvaj' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .polja { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 12px; }
    .uputstvo { grid-column: 1 / -1; margin: 0 0 12px; color: var(--ink-2); }
    .ucitava { display: flex; align-items: center; gap: 12px; margin: 0; color: var(--muted); }
    button mat-progress-spinner { display: inline-block; margin-right: 8px; }
    @media (max-width: 599.98px) { .polja { grid-template-columns: 1fr; } }
  `,
})
export class StudentIzmenaDialog implements OnInit {
  protected readonly cfg = inject<StudentIzmenaCfg>(MAT_DIALOG_DATA);
  protected readonly reference = inject(ReferenceStore);
  private readonly api = inject(StudentiApi);
  private readonly obavestenja = inject(NotificationStore);
  private readonly ref = inject<MatDialogRef<StudentIzmenaDialog, boolean>>(MatDialogRef);

  protected readonly forma = new FormGroup({
    grupa: new FormControl<number | null>(this.cfg.grupaId, Validators.required),
    ime: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(60)] }),
    prezime: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(60)] }),
    indeks: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2), Validators.maxLength(20)] }),
    godina: new FormControl<number | null>(null, [Validators.required, Validators.min(2000), Validators.max(2100)]),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email, Validators.maxLength(255)] }),
    telefon: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(20)] }),
    datum: new FormControl('', { nonNullable: true, validators: [Validators.pattern(ISO_DATUM)] }),
    opstina: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] }),
  });

  protected readonly ucitava = signal(true);
  protected readonly greskaUcitavanja = signal<string | null>(null);
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);
  protected readonly imeStudenta = signal('Student');

  ngOnInit(): void {
    this.reference.ucitaj();
    this.ucitaj();
  }

  /** Učitava trenutne podatke studenta; bez njih se ne čuva (server bi obrisao datum rođenja i opštinu). */
  protected ucitaj(): void {
    this.ucitava.set(true);
    this.greskaUcitavanja.set(null);
    this.api.get(this.cfg.id, { tiho: true }).subscribe({
      next: s => {
        this.popuni(s);
        this.ucitava.set(false);
      },
      error: (e: unknown) => {
        this.greskaUcitavanja.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
        this.ucitava.set(false);
      },
    });
  }

  private popuni(s: StudentPregledDetails): void {
    this.imeStudenta.set([s.ime, s.prezime].filter(Boolean).join(' ') || 'Student');
    this.forma.patchValue({
      ime: s.ime ?? '',
      prezime: s.prezime ?? '',
      indeks: s.indeks ?? '',
      grupa: s.grupaId ?? this.cfg.grupaId,
      godina: s.godina ?? null,
      email: s.email ?? '',
      telefon: s.brojTelefona ?? '',
      datum: s.datumRodjenja ?? '',
      opstina: s.opstina ?? '',
    });
    this.forma.markAsPristine();
  }

  protected poruka(ime: ImeKontrole): string | null {
    const k = this.forma.controls[ime];
    return k.touched || k.dirty ? porukaValidacije(k.errors, LABELE[ime]) : null;
  }

  protected sacuvaj(): void {
    if (this.salje() || this.ucitava() || this.greskaUcitavanja() !== null) {
      return;
    }
    // server prima pun zapis, pa se proveravaju sva polja, i u "premesti" načinu gde je vidljiva samo grupa
    this.forma.markAllAsTouched();
    if (this.forma.invalid) {
      if (this.cfg.nacin === 'premesti' && this.forma.controls.grupa.valid) {
        this.greska.set(null);
        this.greska.set('Podaci studenta nisu potpuni ili ispravni (npr. godina upisa), pa ga nije moguće premestiti. Prvo ih ispravi kroz „Izmeni podatke“.');
      }
      return;
    }
    const v = this.forma.getRawValue();
    const cmd: UpdateStudentCmd = {
      grupaId: v.grupa as number,
      ime: v.ime.trim(),
      prezime: v.prezime.trim(),
      indeks: v.indeks.trim(),
      godina: v.godina as number,
      email: prazno(v.email),
      brojTelefona: prazno(v.telefon),
      datumRodjenja: prazno(v.datum),
      opstina: prazno(v.opstina),
    };
    this.salje.set(true);
    this.greska.set(null);
    this.api.izmeni(this.cfg.id, cmd, { tiho: true }).subscribe({
      next: () => {
        const grupa = this.reference.grupe().find(g => g.id === cmd.grupaId)?.naziv;
        this.obavestenja.uspeh(
          this.cfg.nacin === 'premesti' && grupa ? `Student je premešten u grupu ${grupa}.` : 'Podaci studenta su sačuvani.',
        );
        this.ref.close(true);
      },
      error: (e: unknown) => {
        this.salje.set(false);
        this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
      },
    });
  }

  static otvori(dialog: MatDialog, cfg: StudentIzmenaCfg): Observable<boolean | undefined> {
    return dialog
      .open<StudentIzmenaDialog, StudentIzmenaCfg, boolean>(StudentIzmenaDialog, { data: cfg, width: '40rem', maxWidth: '96vw' })
      .afterClosed();
  }
}
