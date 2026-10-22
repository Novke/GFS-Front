import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, inject, input, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { MatError, MatFormField, MatHint, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import {
  ispravanBroj,
  ispravnaGodina,
  MAX_CIFARA_BROJA,
  maxGodina,
  MIN_GODINA,
  PODRAZUMEVANI_SMER,
  prikazIndeksa,
  samoCifreBroja,
  sastaviIndeks,
} from '../util/indeks';

/** Kontrole indeksa u tri dela (smer je stalan, nije kontrola). Obe su tekst, da `inputmode="numeric"` radi bez `type=number`. */
export type IndeksKontrole = FormGroup<{ broj: FormControl<string>; godina: FormControl<string> }>;

const proveriBroj = (c: AbstractControl<string>): ValidationErrors | null => {
  const v = (c.value ?? '').trim();
  if (!v) {
    return { obavezno: true };
  }
  return ispravanBroj(v) ? null : { broj: true };
};

const proveriGodinu = (c: AbstractControl<string>): ValidationErrors | null => {
  const v = (c.value ?? '').trim();
  if (!v) {
    return { obavezno: true };
  }
  return /^\d{4}$/u.test(v) && ispravnaGodina(Number(v)) ? null : { godina: true };
};

/** Nova grupa kontrola: prazan broj, predložena godina. */
export function indeksKontrole(godina: number | null): IndeksKontrole {
  return new FormGroup({
    broj: new FormControl('', { nonNullable: true, validators: [proveriBroj] }),
    godina: new FormControl(godina === null ? '' : String(godina), { nonNullable: true, validators: [proveriGodinu] }),
  });
}

/** Indeks (`GD5`) i godina iz ispravne grupe, inače `null`. */
export function vrednostIndeksa(g: IndeksKontrole, smer = PODRAZUMEVANI_SMER): { indeks: string; godina: number } | null {
  if (g.invalid) {
    return null;
  }
  const { broj, godina } = g.getRawValue();
  return { indeks: sastaviIndeks(smer, broj), godina: Number(godina.trim()) };
}

/** Ceo indeks nalepljen u polje broja: `GD05/2026`, `gd 5 / 2026`, `5/2026`. */
const CEO_INDEKS = /^\s*[A-Za-z]{0,4}\s*-?\s*0*(\d{1,3})\s*\/\s*(\d{4})\s*$/u;

/**
 * Unos indeksa u tri dela: smer (stalan, `GD`, prikazan kao prefiks polja broja), broj (1-3 cifre, `inputmode=numeric`) i
 * godina upisa (četiri cifre, predložena, menja se). Greške su odmah ispod polja (posle dodira ili pokušaja slanja), a ispod
 * oba polja je ceo indeks kako ga server vidi (`GD5/2026`). Nalepljen ceo indeks (`GD05/2026`) popunjava oba polja.
 * Koriste ga javne forme `nalog` i `upis` (allow-lista `gfs/javna-ruta-uvozi`): uvozi samo Angular, Material i
 * `shared/util/indeks`.
 */
@Component({
  selector: 'app-indeks-polja',
  imports: [MatError, MatFormField, MatHint, MatInput, MatLabel, MatPrefix, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="red" [formGroup]="grupa()">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="broj">
        <mat-label>Broj indeksa</mat-label>
        <span matTextPrefix class="smer" aria-hidden="true">{{ smer() }}&nbsp;</span>
        <input matInput type="text" formControlName="broj" name="broj-indeksa" class="mono" inputmode="numeric"
          autocomplete="off" spellcheck="false" [attr.maxlength]="maxCifara" [attr.aria-label]="'Broj indeksa, smer ' + smer()"
          (input)="ocistiBroj()" (paste)="nalepi($event)">
        @if (grupa().controls.broj.hasError('obavezno')) {
          <mat-error>Unesi broj indeksa.</mat-error>
        } @else if (grupa().controls.broj.hasError('broj')) {
          <mat-error>Broj ima od 1 do {{ maxCifara }} cifre.</mat-error>
        } @else {
          <mat-hint>npr. 5 ili 12</mat-hint>
        }
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="godina">
        <mat-label>Godina upisa</mat-label>
        <input matInput type="text" formControlName="godina" name="godina-upisa" class="mono" inputmode="numeric"
          autocomplete="off" spellcheck="false" maxlength="4" (input)="ocistiGodinu()">
        @if (grupa().controls.godina.invalid) {
          <mat-error>Unesi godinu {{ minGodina }}–{{ najvecaGodina }}.</mat-error>
        } @else {
          <mat-hint>{{ hintGodine() }}</mat-hint>
        }
      </mat-form-field>
    </div>
    <p class="ceo" aria-live="polite">
      Indeks: <span class="mono">{{ ceo() }}</span>
    </p>
  `,
  styles: `
    :host { display: block; }
    .red { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
    mat-form-field { width: 100%; }
    .mono { font-family: var(--font-mono); }
    .smer { font-family: var(--font-mono); font-weight: 600; color: var(--ink-2); }
    .ceo { margin: 8px 0 0; color: var(--muted); font-size: 14px; }
    .ceo .mono { color: var(--ink); font-weight: 600; }
  `,
})
export class IndeksPolja {
  readonly grupa = input.required<IndeksKontrole>();
  /** Smer (prvi deo indeksa); za sada uvek `GD`. */
  readonly smer = input(PODRAZUMEVANI_SMER);
  /** Pomoćni tekst ispod godine (npr. odakle je predlog). */
  readonly hintGodine = input('Promeni ako si upisan ranije.');

  protected readonly maxCifara = MAX_CIFARA_BROJA;
  protected readonly minGodina = MIN_GODINA;
  protected readonly najvecaGodina = maxGodina();

  private readonly vrednost = signal({ broj: '', godina: '' });

  /** Ceo indeks za prikaz; dok broj nije ispravan, `GD…`. */
  protected readonly ceo = computed(() => {
    const { broj, godina } = this.vrednost();
    const b = ispravanBroj(broj) ? String(Number(broj)) : '…';
    const g = /^\d{4}$/u.test(godina.trim()) ? Number(godina.trim()) : null;
    return prikazIndeksa(`${this.smer()}${b}`, g);
  });

  constructor() {
    const cdr = inject(ChangeDetectorRef);
    // Roditelj menja grupu (reset, markAllAsTouched pri slanju): OnPush dete mora da se osveži, da se greška pojavi ispod polja.
    effect(onCleanup => {
      const g = this.grupa();
      this.vrednost.set(g.getRawValue());
      const sub = g.events.subscribe(() => {
        this.vrednost.set(g.getRawValue());
        cdr.markForCheck();
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  /** Samo cifre u broju (tastatura bez numeričkog režima, automatsko popunjavanje). */
  protected ocistiBroj(): void {
    const c = this.grupa().controls.broj;
    const v = samoCifreBroja(c.value);
    if (v !== c.value) {
      c.setValue(v);
    }
  }

  protected ocistiGodinu(): void {
    const c = this.grupa().controls.godina;
    const v = c.value.replace(/\D+/gu, '').slice(0, 4);
    if (v !== c.value) {
      c.setValue(v);
    }
  }

  /** Nalepljen ceo indeks (`GD05/2026`) ide u oba polja; ostalo samo cifre broja. */
  protected nalepi(e: ClipboardEvent): void {
    const tekst = e.clipboardData?.getData('text') ?? '';
    const m = CEO_INDEKS.exec(tekst);
    if (m) {
      e.preventDefault();
      this.grupa().patchValue({ broj: m[1], godina: m[2] });
      this.grupa().controls.broj.markAsTouched();
    }
  }
}
