import {
  ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal, untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { KOD, samoCifreKoda } from '../data-access/nalog.pravila';

/** "Pošalji ponovo" je dostupno tek ovoliko sekundi posle poslednjeg slanja (spec prijave 5.1 tačka 4). */
export const CEKANJE_PONOVO_S = 60;

/**
 * Korak "kod" prijave studenta (spec prijave 5.1 tačke 2 i 4): poruka servera ("Ako nalog postoji, kod je poslat."), maska
 * mejla, polje za 6 cifara (`inputmode=numeric`, `autocomplete=one-time-code`; nalepljen kod sa razmacima ili crticom
 * postaje 6 cifara), "Pošalji ponovo" posle {@link CEKANJE_PONOVO_S} s, "Ne stiže mi kod" i "Drugi indeks". Prezentaciona
 * komponenta (bez HTTP-a): roditelj šalje zahteve; `slanjeBroj` raste sa svakim uspešnim slanjem koda i pokreće čekanje
 * ispočetka. Koriste je `/nalog` i (F5) `/nalog/moodle`.
 */
@Component({
  selector: 'app-nalog-kod-korak',
  imports: [FormErrorBanner, MatButton, MatError, MatFormField, MatHint, MatInput, MatLabel, MatProgressSpinner, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-form-error-banner [poruka]="greska()" />
    <p class="poslato">{{ poruka() }}</p>
    <dl class="podaci">
      <dt>Indeks</dt><dd class="mono">{{ indeks() }}</dd>
      <dt>Mejl</dt><dd>{{ maska() }}</dd>
    </dl>
    <p class="savet">Kod ide na mejl koji si dao pri upisu. Proveri i Spam. Ako ga nemaš, nastavnik može da upiše novi.</p>

    <form class="forma" [formGroup]="forma" (ngSubmit)="posalji()" novalidate>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Kod iz mejla</mat-label>
        <input matInput type="text" name="kod" formControlName="kod" class="mono kod" inputmode="numeric"
          autocomplete="one-time-code" maxlength="6" spellcheck="false" (paste)="nalepi($event)" (input)="ocisti()">
        <mat-hint>6 cifara</mat-hint>
        @if (forma.controls.kod.invalid) {
          <mat-error>Kod ima 6 cifara.</mat-error>
        }
      </mat-form-field>
      <button type="submit" mat-flat-button class="dugme" [disabled]="salje()">
        @if (salje()) {
          <mat-progress-spinner mode="indeterminate" diameter="18" aria-hidden="true" />
        }
        Prijavi se
      </button>
    </form>

    <div class="akcije">
      <button type="button" matButton="outlined" [disabled]="preostalo() > 0 || salje()" (click)="ponovo()">
        Pošalji ponovo@if (preostalo() > 0) { (za {{ preostalo() }} s)}
      </button>
      <button type="button" matButton="outlined" [disabled]="pomocSalje()" (click)="neStize.emit()">Ne stiže mi kod</button>
      <button type="button" matButton (click)="promeniIndeks.emit()">Drugi indeks</button>
    </div>
    <p class="pomoc" role="status">{{ pomoc() }}</p>
  `,
  styles: `
    :host { display: block; }
    .poslato { margin: 0 0 12px; padding: 12px 16px; border: 1px solid var(--line); border-radius: var(--radius-sm);
      background: var(--surface-2); color: var(--ink-2); }
    .podaci { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0 0 12px; }
    .podaci dt { color: var(--muted); }
    .podaci dd { margin: 0; overflow-wrap: anywhere; }
    .savet { margin: 0 0 18px; color: var(--ink-2); }
    .forma { display: flex; flex-direction: column; gap: 18px; }
    mat-form-field { width: 100%; }
    .mono { font-family: var(--font-mono); }
    .kod { font-size: 20px; letter-spacing: .2em; }
    .dugme { width: 100%; min-height: 48px; font-size: 16px; }
    .dugme mat-progress-spinner { display: inline-block; margin-right: 8px; vertical-align: middle; }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
    .akcije button { min-height: 44px; }
    .pomoc { margin: 12px 0 0; color: var(--ok); }
    .pomoc:empty { margin: 0; }
  `,
})
export class KodKorak {
  readonly indeks = input('');
  readonly maska = input('');
  /** Poruka servera posle slanja koda. */
  readonly poruka = input('');
  /** Raste sa svakim uspešnim slanjem koda; promena pokreće čekanje za "Pošalji ponovo" ispočetka. */
  readonly slanjeBroj = input(0);
  readonly salje = input(false);
  readonly greska = input<string | null>(null);
  /** Odgovor na "Ne stiže mi kod" ("Javili smo nastavniku."). */
  readonly pomoc = input<string | null>(null);
  readonly pomocSalje = input(false);

  /** Tačno 6 cifara. */
  readonly prijavi = output<string>();
  readonly posaljiPonovo = output<void>();
  readonly neStize = output<void>();
  readonly promeniIndeks = output<void>();

  protected readonly forma = new FormGroup({
    kod: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(KOD)] }),
  });
  /** Sekunde do "Pošalji ponovo" (0 = može). */
  protected readonly preostalo = signal(CEKANJE_PONOVO_S);
  private tajmer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      this.slanjeBroj();
      untracked(() => this.pokreniCekanje());
    });
    // pogrešan kod: ostaje samo poruka, polje je prazno za novi unos (na telefonu se ne briše cifru po cifru); fokus ostaje na traci greške (FormErrorBanner)
    effect(() => {
      if (this.greska() !== null && !this.salje()) {
        untracked(() => this.isprazniKod());
      }
    });
    inject(DestroyRef).onDestroy(() => this.zaustavi());
  }

  /** Nalepljen tekst (`123 456`, `Kod: 123-456`): samo cifre, pa `maxlength` ne odseče kod sa razmacima. */
  protected nalepi(e: Event): void {
    const tekst = (e as ClipboardEvent).clipboardData?.getData('text') ?? '';
    const cifre = samoCifreKoda(tekst);
    if (cifre) {
      e.preventDefault();
      this.forma.controls.kod.setValue(cifre);
    }
  }

  /** Unos i automatsko popunjavanje: samo cifre. */
  protected ocisti(): void {
    const c = this.forma.controls.kod;
    const cifre = samoCifreKoda(c.value);
    if (cifre !== c.value) {
      c.setValue(cifre);
    }
  }

  protected posalji(): void {
    if (this.salje()) {
      return;
    }
    this.forma.markAllAsTouched();
    if (this.forma.invalid) {
      return;
    }
    this.prijavi.emit(this.forma.controls.kod.value);
  }

  protected ponovo(): void {
    if (this.preostalo() > 0 || this.salje()) {
      return;
    }
    this.posaljiPonovo.emit();
  }

  private isprazniKod(): void {
    if (this.forma.controls.kod.value === '') {
      return;
    }
    this.forma.reset();
  }

  private pokreniCekanje(): void {
    this.zaustavi();
    // po satu, ne po broju otkucaja: telefon u pozadini usporava tajmere
    const kraj = Date.now() + CEKANJE_PONOVO_S * 1000;
    const osvezi = () => {
      const s = Math.max(0, Math.ceil((kraj - Date.now()) / 1000));
      this.preostalo.set(s);
      if (s === 0) {
        this.zaustavi();
      }
    };
    osvezi();
    this.tajmer = setInterval(osvezi, 1000);
  }

  private zaustavi(): void {
    if (this.tajmer !== null) {
      clearInterval(this.tajmer);
      this.tajmer = null;
    }
  }
}
