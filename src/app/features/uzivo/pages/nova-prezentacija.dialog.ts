import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { Observable } from 'rxjs';
import { PrezentacijeApi } from '../data-access/prezentacije.api';
import { razlogGreske } from '../data-access/razlog-greske';
import { PORUKE, greskePrezentacije } from '../data-access/slajd-pravila';
import { PRIHVACENI_FAJLOVI, proveriImeFajla } from '../uvoz-pptx/ime-fajla';
import { PredmetKratko, PrezentacijaDetails } from '../data-access/uzivo.models';

export interface NovaPrezentacijaPodaci { predmeti: PredmetKratko[]; predmetId: number | null; }

/** Napravljena prezentacija i, kad je početak "Iz PowerPointa", izabrani fajl (uvoz ga čita u sledećem koraku). */
export interface NovaPrezentacijaIshod { prezentacija: PrezentacijaDetails; fajl: File | null; }

export function otvoriNovuPrezentaciju(dialog: MatDialog, podaci: NovaPrezentacijaPodaci): Observable<NovaPrezentacijaIshod | undefined> {
  return dialog.open<NovaPrezentacijaDialog, NovaPrezentacijaPodaci, NovaPrezentacijaIshod>(NovaPrezentacijaDialog, {
    data: podaci, width: '520px', maxWidth: '95vw',
  }).afterClosed();
}

/** Nova prezentacija: predmet, naziv, opis -> `POST /prezentacije`; zatvara se sa napravljenom prezentacijom. */
@Component({
  selector: 'app-nova-prezentacija-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatRadioModule, MatSelectModule],
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
        <mat-radio-group class="uz-ed-izbori" aria-label="Početak" [value]="pocetak()" (change)="promeniPocetak($event.value)">
          <mat-radio-button value="prazna">Prazna</mat-radio-button>
          <mat-radio-button value="pptx">Iz PowerPointa</mat-radio-button>
        </mat-radio-group>
        @if (pocetak() === 'pptx') {
          <div class="uz-ed-fajl">
            <input #ulaz type="file" class="uz-ed-fajl-ulaz" tabindex="-1" aria-hidden="true"
              [accept]="prihvaceniFajlovi"
              (change)="izaberiFajl(ulaz)">
            <button mat-stroked-button type="button" (click)="ulaz.click()" aria-describedby="uz-nova-fajl-ime">Izaberi .pptx fajl</button>
            <span id="uz-nova-fajl-ime" class="uz-ed-napomena" aria-live="polite">
              {{ fajl() ? 'Izabrano: ' + fajl()!.name : 'Fajl nije izabran.' }}
            </span>
          </div>
          @if (greskaFajla(); as g) {
            <p class="uz-ed-greska" role="alert">{{ g }}</p>
          }
        }
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
        <button mat-flat-button type="submit" [disabled]="salje()">Napravi</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class NovaPrezentacijaDialog {
  protected readonly data = inject<NovaPrezentacijaPodaci>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<NovaPrezentacijaDialog, NovaPrezentacijaIshod>>(MatDialogRef);
  private readonly api = inject(PrezentacijeApi);

  protected readonly porukaNaziv = PORUKE.naziv;
  protected readonly prihvaceniFajlovi = PRIHVACENI_FAJLOVI;
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);
  protected readonly pocetak = signal<'prazna' | 'pptx'>('prazna');
  protected readonly fajl = signal<File | null>(null);
  protected readonly greskaFajla = signal<string | null>(null);
  /** Naziv koji je dijalog sam upisao iz imena fajla; ručno upisan naziv se ne prepisuje. */
  private predlog = '';
  protected readonly forma = new FormGroup({
    predmetId: new FormControl<number | null>(this.data.predmetId, Validators.required),
    naziv: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
    opis: new FormControl('', { nonNullable: true }),
  });

  protected promeniPocetak(v: 'prazna' | 'pptx'): void {
    this.pocetak.set(v);
    this.greska.set(null);
  }

  protected izaberiFajl(ulaz: HTMLInputElement): void {
    const f = ulaz.files?.[0] ?? null;
    ulaz.value = '';
    if (!f) return;
    const poruka = proveriImeFajla(f.name);
    this.greskaFajla.set(poruka);
    this.fajl.set(poruka ? null : f);
    if (poruka) return;
    const naziv = this.forma.controls.naziv;
    if (!naziv.value.trim() || naziv.value === this.predlog) {
      this.predlog = f.name.replace(/\.[^./\\]+$/, '').slice(0, 200);
      naziv.setValue(this.predlog);
    }
  }

  protected napravi(): void {
    this.forma.markAllAsTouched();
    if (this.pocetak() === 'pptx' && !this.fajl()) {
      this.greskaFajla.set(this.greskaFajla() ?? 'Izaberi .pptx fajl ili izaberi početak "Prazna".');
      return;
    }
    const { predmetId, naziv, opis } = this.forma.getRawValue();
    const greske = greskePrezentacije(naziv, opis);
    if (this.forma.invalid || predmetId === null || greske.length) {
      this.greska.set(greske[0] ?? null);
      return;
    }
    this.salje.set(true);
    this.greska.set(null);
    const fajl = this.pocetak() === 'pptx' ? this.fajl() : null;
    this.api.kreiraj({ predmetId, naziv: naziv.trim(), opis: opis.trim() || null, tema: fajl ? 'BELA' : null }).subscribe({
      next: p => this.ref.close({ prezentacija: p, fajl }),
      error: e => {
        this.salje.set(false);
        this.greska.set(razlogGreske(e, 'Prezentacija nije napravljena.'));
      },
    });
  }
}
