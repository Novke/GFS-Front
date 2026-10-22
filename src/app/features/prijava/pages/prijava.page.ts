import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { SesijaStore } from '../../../core/auth/sesija.store';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { bezbednoNazad, javnoNazad } from '../../../shared/util/nazad';

/** Tekst za baner forme: 401, 429 i 503 nose tekst servera (`reason`); mreža i ostale 5xx opšte poruke. */
export function porukaPrijave(e: unknown): string {
  if (!(e instanceof HttpErrorResponse)) {
    return PORUKA_SISTEM;
  }
  // 503 "Prijava nastavnika nije podešena." je poruka aplikacije; `toApiError` bi je (kao svaku 5xx) sakrio
  const reason = e.status === 503 ? (e.error as { reason?: unknown } | null)?.reason : null;
  return typeof reason === 'string' && reason.trim() !== '' ? reason : toApiError(e).reason;
}

/**
 * Prijava nastavnika (`/prijava`, u `PublicLayout`-u: bez ljuske, uvek svetlo). Ne injektuje store-ove ljuske
 * (`ReferenceStore`, `DashboardCountsStore`, ...): jedini zahtev stranice je `POST api/auth/prijava` (kroz `SesijaStore`).
 * Posle uspeha ide na `nazad` (query, `withComponentInputBinding`) ako ga `bezbednoNazad` pusti, inače na početnu; spoljni
 * ili apsolutni URL se nikad ne otvara. Već prijavljen nastavnik vidi "Već si prijavljen kao ..." i "Nastavi" umesto forme
 * (bez zahteva: `prijavljen` je keširano stanje). Greške (401, 429, 503, mreža) su u baneru forme, nikad u snackbar-u.
 * Strana jasno kaže da je za nastavnike (korisničko ime i lozinka), a studentima koji ovde zalutaju (i sa golog `/` bez
 * sesije) daje krupnu vezu "Student si? Prijavi se brojem indeksa" na `/nalog` (samo `routerLink`, bez uvoza iz
 * `features/nalog`), uz `nazad` kad je javna putanja.
 */
@Component({
  selector: 'app-prijava-page',
  imports: [
    FormErrorBanner, MatButton, MatError, MatFormField, MatInput, MatLabel, MatProgressSpinner, ReactiveFormsModule, RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="prijava">
      <header class="zaglavlje">
        <span class="znak" aria-hidden="true"><img src="assets/images/gfs-logo.png" alt="" width="170" height="128"></span>
        <div class="naslovi">
          <p class="nadnaslov">Građevinski fakultet Subotica</p>
          <h1>Prijava za nastavnike</h1>
        </div>
      </header>

      <div class="telo">
        @if (vecPrijavljen()) {
          <div class="vec">
            <p class="vec-tekst" role="status">Već si prijavljen kao {{ sesija.korisnik() }}.</p>
            <button type="button" mat-flat-button class="dugme" (click)="nastavi()">Nastavi</button>
          </div>
        } @else {
          <section class="studentu" aria-labelledby="studentu-naslov">
            <p id="studentu-naslov" class="studentu-naslov">Student si?</p>
            <p class="studentu-tekst">Ova stranica je samo za nastavnike. Studenti se prijavljuju brojem indeksa i kodom, bez lozinke.</p>
            <a matButton="filled" class="dugme studentu-dugme" routerLink="/nalog" [queryParams]="upitZaStudenta()">
              Student si? Prijavi se brojem indeksa
            </a>
          </section>

          <h2 class="podnaslov">Nastavnik: korisničko ime i lozinka</h2>
          <app-form-error-banner [poruka]="greska()" />
          <form class="forma" [formGroup]="forma" (ngSubmit)="posalji()" novalidate>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Korisničko ime</mat-label>
              <input matInput type="text" formControlName="korisnik" autocomplete="username" autocapitalize="none"
                spellcheck="false" maxlength="100">
              @if (forma.controls.korisnik.hasError('required')) {
                <mat-error>Unesi korisničko ime.</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Lozinka</mat-label>
              <input matInput type="password" formControlName="lozinka" autocomplete="current-password" maxlength="200">
              @if (forma.controls.lozinka.hasError('required')) {
                <mat-error>Unesi lozinku.</mat-error>
              }
            </mat-form-field>

            <button type="submit" mat-flat-button class="dugme" [disabled]="salje()">
              @if (salje()) {
                <mat-progress-spinner mode="indeterminate" diameter="18" aria-hidden="true" />
              }
              Prijavi se
            </button>
          </form>
        }
      </div>
    </article>
  `,
  styles: `
    :host { display: block; padding-block: clamp(0px, 6vh, 64px); }

    .prijava {
      max-width: 420px;
      margin: 0 auto;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .zaglavlje {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 18px 20px;
      background: var(--hero-bg);
      color: var(--hero-ink);
    }

    /* znak iz logoa (kao na upisu i u bočnoj navigaciji), beo na tamnoj podlozi */
    .znak {
      flex: none;
      width: 39px;
      height: 57px;
      overflow: hidden;
      filter: var(--logo-filter);
      mix-blend-mode: screen;
    }
    .znak img { display: block; max-width: none; margin: -36px 0 0 -66px; }

    .naslovi { min-width: 0; }
    .nadnaslov {
      margin: 0 0 4px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: .06em;
      text-transform: uppercase;
      opacity: .8;
    }
    h1 { margin: 0; color: inherit; font-size: 22px; line-height: 1.25; overflow-wrap: anywhere; }

    .telo { padding: 20px; }
    .studentu {
      margin: 0 0 22px;
      padding: 14px 16px 16px;
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      background: var(--primary-soft);
      color: var(--primary-soft-ink);
    }
    .studentu-naslov { margin: 0 0 4px; font-weight: 600; font-size: 16px; }
    .studentu-tekst { margin: 0 0 12px; font-size: 14px; }
    .studentu-dugme { display: flex; text-align: center; white-space: normal; height: auto; padding-block: 10px; }
    .podnaslov { margin: 0 0 14px; font-size: 16px; font-weight: 600; color: var(--ink); }
    .vec { display: flex; flex-direction: column; gap: 18px; }
    .vec-tekst { margin: 0; overflow-wrap: anywhere; }
    .forma { display: flex; flex-direction: column; gap: 18px; }
    mat-form-field { width: 100%; }

    .dugme { width: 100%; min-height: 48px; font-size: 16px; }
    .dugme mat-progress-spinner { display: inline-block; margin-right: 8px; vertical-align: middle; }
  `,
})
export class PrijavaPage {
  /** Query `nazad` (relativna putanja aplikacije); proverava ga `bezbednoNazad` tek pri upotrebi. */
  readonly nazad = input<string | null | undefined>(null);

  protected readonly sesija = inject(SesijaStore);
  private readonly router = inject(Router);

  protected readonly forma = new FormGroup({
    korisnik: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    lozinka: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);
  /** Veza za studente: `/nalog`, sa `nazad` samo kad je javna putanja (`uzivo/...`, `upis/...`, `nalog`). */
  protected readonly upitZaStudenta = computed(() => {
    const cilj = javnoNazad(this.nazad());
    return cilj === null ? {} : { nazad: cilj };
  });
  /** Prijava je upravo uspela i traje navigacija: forma ne ustupa mesto panelu "Već si prijavljen". */
  private readonly prelazi = signal(false);
  /** Nastavnik koji već ima sesiju otvori `/prijava` (obeleživač, dugme Nazad): bez druge sesije na novom slanju. */
  protected readonly vecPrijavljen = computed(() => this.sesija.prijavljen() && !this.prelazi());
  private readonly formaDir = viewChild.required(FormGroupDirective);

  protected async posalji(): Promise<void> {
    if (this.salje()) {
      return;
    }
    this.forma.markAllAsTouched();
    if (this.forma.invalid) {
      return;
    }
    const { korisnik, lozinka } = this.forma.getRawValue();
    this.greska.set(null);
    this.salje.set(true);
    try {
      await this.sesija.prijavi(korisnik, lozinka);
    } catch (e: unknown) {
      if (e instanceof HttpErrorResponse && e.status === 401) {
        // pogrešna lozinka se briše; `resetForm` vraća i stanje "poslato", pa prazno polje ne dobija i "Unesi lozinku."
        this.formaDir().resetForm({ korisnik, lozinka: '' });
      }
      this.greska.set(porukaPrijave(e));
      return;
    } finally {
      this.salje.set(false);
    }
    this.prelazi.set(true);
    await this.router.navigateByUrl(bezbednoNazad(this.nazad()) ?? '');
  }

  protected nastavi(): void {
    void this.router.navigateByUrl(bezbednoNazad(this.nazad()) ?? '');
  }
}
