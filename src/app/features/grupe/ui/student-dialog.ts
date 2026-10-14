import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatOption, MatSelect } from '@angular/material/select';
import { Observable } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { ReferenceStore } from '../../../core/state/reference.store';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { porukaValidacije } from '../../../shared/forms/poruke-validacije';
import { GrupeApi } from '../../../core/api/grupe.api';
import { grupeZaPremestanje, imeStudenta, StudentInfo } from '../../../core/api/grupe.models';

export type NacinStudentDialoga = 'dodaj' | 'izmena' | 'premesti';

export interface StudentDialogCfg {
  nacin: NacinStudentDialoga;
  /** Grupa iz koje je dijalog otvoren: nov student ide u nju; premeštanje je ne nudi. */
  grupa: { id: number; naziv: string; godinaUpisa: number | null };
  /** Za izmenu i premeštanje: pun zapis studenta (server briše izostavljena opciona polja). */
  student?: StudentInfo | null;
}

type Polje = 'grupaId' | 'ime' | 'prezime' | 'indeks' | 'godina' | 'email' | 'brojTelefona' | 'datumRodjenja' | 'opstina';

const LABELE: Record<Polje, string> = {
  grupaId: 'Grupa',
  ime: 'Ime',
  prezime: 'Prezime',
  indeks: 'Indeks',
  godina: 'Godina upisa',
  email: 'Email',
  brojTelefona: 'Broj telefona',
  datumRodjenja: 'Datum rođenja',
  opstina: 'Opština',
};

const prazno = (v: string | null | undefined): string | null => v?.trim() || null;

/**
 * Student u grupi (G2, G8): "Dodaj studenta" (`POST studenti`), "Izmeni" i "Premesti u grupu" (`PUT studenti/{id}` sa
 * punim zapisom; premeštanje menja samo `grupaId` i ne nudi trenutnu grupu). Greška servera (npr. duplikat indeksa u
 * godini upisa) ide u traku iznad forme. Vraća sačuvanog studenta ili `undefined`.
 */
@Component({
  selector: 'app-student-dialog',
  imports: [
    FormErrorBanner, MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatError, MatFormField,
    MatHint, MatInput, MatLabel, MatOption, MatProgressSpinner, MatSelect, ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ naslov }}</h2>
    <form [formGroup]="forma" (ngSubmit)="sacuvaj()" novalidate>
      <mat-dialog-content>
        <app-form-error-banner [poruka]="greska()" />
        @if (cfg.nacin === 'premesti') {
          <p class="uputstvo">{{ ime }} iz grupe {{ cfg.grupa.naziv }} prelazi u izabranu grupu; ostali podaci ostaju isti.</p>
          @if (opcijeGrupa().length === 0) {
            <p class="uputstvo" role="status" data-bez-grupa>Nema druge grupe u koju bi student mogao da pređe.</p>
          } @else {
            <mat-form-field appearance="outline" class="puno">
              <mat-label>Nova grupa</mat-label>
              <mat-select formControlName="grupaId" data-grupa>
                @for (g of opcijeGrupa(); track g.id) {
                  <mat-option [value]="g.id">{{ g.naziv }}</mat-option>
                }
              </mat-select>
              @if (poruka('grupaId'); as m) {
                <mat-error>{{ m }}</mat-error>
              }
            </mat-form-field>
          }
        } @else {
          <div class="polja">
            <mat-form-field appearance="outline">
              <mat-label>Ime</mat-label>
              <input matInput id="ime" formControlName="ime" maxlength="60" autocomplete="off" data-ime />
              @if (poruka('ime'); as m) { <mat-error>{{ m }}</mat-error> }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Prezime</mat-label>
              <input matInput id="prezime" formControlName="prezime" maxlength="60" autocomplete="off" data-prezime />
              @if (poruka('prezime'); as m) { <mat-error>{{ m }}</mat-error> }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Indeks</mat-label>
              <input matInput id="indeks" formControlName="indeks" maxlength="20" autocomplete="off" data-indeks />
              <mat-hint>Npr. GD12</mat-hint>
              @if (poruka('indeks'); as m) { <mat-error>{{ m }}</mat-error> }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Godina upisa</mat-label>
              <input matInput id="godina" type="number" inputmode="numeric" min="2000" max="2100" formControlName="godina" data-godina />
              @if (poruka('godina'); as m) { <mat-error>{{ m }}</mat-error> }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Email (opciono)</mat-label>
              <input matInput id="email" type="email" formControlName="email" [maxlength]="maxEmail" autocomplete="off" data-email />
              @if (poruka('email'); as m) { <mat-error>{{ m }}</mat-error> }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Telefon (opciono)</mat-label>
              <input matInput id="brojTelefona" type="tel" formControlName="brojTelefona" maxlength="20" autocomplete="off" data-telefon />
              @if (poruka('brojTelefona'); as m) { <mat-error>{{ m }}</mat-error> }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Datum rođenja (opciono)</mat-label>
              <input matInput id="datumRodjenja" type="date" formControlName="datumRodjenja" data-datum />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Opština (opciono)</mat-label>
              <input matInput id="opstina" formControlName="opstina" maxlength="100" autocomplete="off" data-opstina />
              @if (poruka('opstina'); as m) { <mat-error>{{ m }}</mat-error> }
            </mat-form-field>
          </div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" [mat-dialog-close]="undefined" data-odustani>Odustani</button>
        <button matButton="filled" type="submit" [disabled]="salje() || (cfg.nacin === 'premesti' && opcijeGrupa().length === 0)" data-sacuvaj>
          @if (salje()) {
            <mat-progress-spinner mode="indeterminate" diameter="18" aria-label="Čuvanje" />
          }
          {{ dugme }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .polja { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 12px; }
    .puno { width: 100%; }
    .uputstvo { margin: 0 0 12px; color: var(--ink-2); }
    button mat-progress-spinner { display: inline-block; margin-right: 8px; }
    @media (max-width: 599.98px) { .polja { grid-template-columns: 1fr; } }
  `,
})
export class StudentDialog implements OnInit {
  protected readonly cfg = inject<StudentDialogCfg>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<StudentDialog, StudentInfo>>(MatDialogRef);
  private readonly api = inject(GrupeApi);
  private readonly reference = inject(ReferenceStore);

  /** Dodavanje šalje `CreateStudentCmd` (email do 120), izmena `UpdateStudentCmd` (do 255). */
  protected readonly maxEmail = this.cfg.nacin === 'dodaj' ? 120 : 255;
  protected readonly ime = imeStudenta(this.cfg.student);
  protected readonly naslov =
    this.cfg.nacin === 'dodaj' ? 'Dodaj studenta' : this.cfg.nacin === 'izmena' ? 'Izmeni studenta' : 'Premesti u grupu';
  protected readonly dugme = this.cfg.nacin === 'dodaj' ? 'Dodaj studenta' : this.cfg.nacin === 'izmena' ? 'Sačuvaj' : 'Premesti';

  /** Sve grupe osim trenutne. */
  protected readonly opcijeGrupa = computed(() => grupeZaPremestanje(this.reference.grupe(), this.cfg.grupa.id));

  protected readonly forma = (() => {
    const s = this.cfg.student;
    const izmena = this.cfg.nacin !== 'dodaj';
    return new FormGroup({
      grupaId: new FormControl<number | null>(
        this.cfg.nacin === 'premesti' ? null : this.cfg.grupa.id,
        Validators.required,
      ),
      ime: new FormControl(s?.ime ?? '', { nonNullable: true, validators: [Validators.required, Validators.maxLength(60)] }),
      prezime: new FormControl(s?.prezime ?? '', { nonNullable: true, validators: [Validators.required, Validators.maxLength(60)] }),
      indeks: new FormControl(s?.indeks ?? '', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(20), ...(izmena ? [Validators.minLength(2)] : [])],
      }),
      godina: new FormControl<number | null>(izmena ? (s?.godina ?? null) : (this.cfg.grupa.godinaUpisa ?? new Date().getFullYear()), [
        Validators.required,
        Validators.min(2000),
        Validators.max(2100),
      ]),
      email: new FormControl(s?.email ?? '', { nonNullable: true, validators: [Validators.email, Validators.maxLength(this.maxEmail)] }),
      brojTelefona: new FormControl(s?.brojTelefona ?? '', { nonNullable: true, validators: [Validators.maxLength(20)] }),
      datumRodjenja: new FormControl(s?.datumRodjenja ?? '', { nonNullable: true }),
      opstina: new FormControl(s?.opstina ?? '', { nonNullable: true, validators: [Validators.maxLength(100)] }),
    });
  })();

  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);

  static otvori(dialog: MatDialog, cfg: StudentDialogCfg): Observable<StudentInfo | undefined> {
    return dialog
      .open<StudentDialog, StudentDialogCfg, StudentInfo>(StudentDialog, { data: cfg, width: '40rem', maxWidth: '96vw' })
      .afterClosed();
  }

  ngOnInit(): void {
    if (this.cfg.nacin === 'premesti') {
      this.reference.ucitaj();
    }
  }

  protected poruka(polje: Polje): string | null {
    return porukaValidacije(this.forma.controls[polje].errors, LABELE[polje]);
  }

  protected sacuvaj(): void {
    if (this.salje()) {
      return;
    }
    const c = this.forma.controls;
    // samo razmaci nisu ime: prazno polje pokazuje "obavezno"
    for (const k of ['ime', 'prezime', 'indeks'] as const) {
      if (!c[k].value.trim()) {
        c[k].setValue('');
      }
    }
    if (this.forma.invalid) {
      this.forma.markAllAsTouched();
      if (this.cfg.nacin === 'premesti' && c.grupaId.valid) {
        // skrivena polja (stari student bez godine upisa ili imena): server traži pun zapis
        this.greska.set('Podaci studenta nisu potpuni (ime, prezime, indeks, godina upisa). Prvo izmeni studenta.');
      }
      return;
    }
    const v = this.forma.getRawValue();
    const podaci = {
      ime: v.ime.trim(),
      prezime: v.prezime.trim(),
      indeks: v.indeks.trim(),
      godina: v.godina as number,
      email: prazno(v.email),
      brojTelefona: prazno(v.brojTelefona),
      datumRodjenja: prazno(v.datumRodjenja),
      opstina: prazno(v.opstina),
    };
    const s = this.cfg.student;
    const zahtev =
      this.cfg.nacin === 'dodaj' || !s
        ? this.api.dodajStudenta({ grupaId: this.cfg.grupa.id, ...podaci }, { tiho: true })
        : this.api.izmeniStudenta(s.id, { grupaId: v.grupaId as number, ...podaci }, { tiho: true });
    this.salje.set(true);
    this.greska.set(null);
    zahtev.subscribe({
      next: rez => this.ref.close(rez),
      error: (e: unknown) => {
        this.salje.set(false);
        this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
      },
    });
  }
}
