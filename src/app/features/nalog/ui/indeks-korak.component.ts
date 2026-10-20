import { ChangeDetectionStrategy, Component, effect, input, output, untracked } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { normalizujIndeks } from '../data-access/nalog.pravila';

const neprazanIndeks = (c: AbstractControl<string>): ValidationErrors | null =>
  normalizujIndeks(c.value ?? '') ? null : { required: true };

/**
 * Korak "indeks" prijave studenta kodom (spec prijave 5.1 tačka 1): polje indeksa i "Pošalji kod". Prezentaciona
 * komponenta (bez HTTP-a): roditelj šalje zahtev i vraća `salje`/`greska`. Koriste je `/nalog` i (F5) `/nalog/moodle`.
 */
@Component({
  selector: 'app-nalog-indeks-korak',
  imports: [FormErrorBanner, MatButton, MatError, MatFormField, MatHint, MatInput, MatLabel, MatProgressSpinner, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-form-error-banner [poruka]="greska()" />
    <p class="uvod">Upiši broj indeksa. Kod za prijavu stiže na mejl koji si dao pri upisu.</p>
    <form class="forma" [formGroup]="forma" (ngSubmit)="posalji()" novalidate>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Broj indeksa</mat-label>
        <input matInput type="text" name="indeks" formControlName="indeks" class="mono" autocomplete="username"
          autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="20">
        <mat-hint>Kao pri upisu, npr. GD12</mat-hint>
        @if (forma.controls.indeks.hasError('required')) {
          <mat-error>Unesi broj indeksa.</mat-error>
        }
      </mat-form-field>
      <button type="submit" mat-flat-button class="dugme" [disabled]="salje()">
        @if (salje()) {
          <mat-progress-spinner mode="indeterminate" diameter="18" aria-hidden="true" />
        }
        Pošalji kod
      </button>
    </form>
  `,
  styles: `
    :host { display: block; }
    .uvod { margin: 0 0 18px; color: var(--ink-2); }
    .forma { display: flex; flex-direction: column; gap: 18px; }
    mat-form-field { width: 100%; }
    .mono { font-family: var(--font-mono); }
    .dugme { width: 100%; min-height: 48px; font-size: 16px; }
    .dugme mat-progress-spinner { display: inline-block; margin-right: 8px; vertical-align: middle; }
  `,
})
export class IndeksKorak {
  /** Početna vrednost polja (npr. posle "Drugi indeks"). */
  readonly indeks = input('');
  readonly salje = input(false);
  /** Tekst greške servera za baner (`null` sakriva). */
  readonly greska = input<string | null>(null);
  /** Normalizovan indeks (bez razmaka, velika slova). */
  readonly posaljiKod = output<string>();

  protected readonly forma = new FormGroup({
    indeks: new FormControl('', { nonNullable: true, validators: [neprazanIndeks] }),
  });

  constructor() {
    effect(() => {
      const v = this.indeks();
      untracked(() => this.forma.controls.indeks.setValue(v));
    });
  }

  protected posalji(): void {
    if (this.salje()) {
      return;
    }
    this.forma.markAllAsTouched();
    if (this.forma.invalid) {
      return;
    }
    this.posaljiKod.emit(normalizujIndeks(this.forma.controls.indeks.value));
  }
}
