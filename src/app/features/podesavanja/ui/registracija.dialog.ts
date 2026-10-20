import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Observable } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { FormErrorBanner } from '../../../shared/forms/form-error-banner';
import { LtiApi } from '../data-access/lti.api';
import { LtiRegistracijaInfo } from '../data-access/lti.models';
import { AUTH_PUTANJA, CERTS_PUTANJA, izvedeniUrl, uCmd, uFormu } from '../data-access/lti.pravila';

export interface RegistracijaDialogCfg {
  /** `null` = nova registracija. */
  registracija: LtiRegistracijaInfo | null;
}

/** Prazno je dozvoljeno (adresa se izvodi); inače mora `https://` i bez razmaka (server proverava isto i više). */
const httpsAdresa = (c: AbstractControl<string>): ValidationErrors | null => {
  const v = (c.value ?? '').trim();
  return v === '' || /^https:\/\/[^\s/]\S*$/iu.test(v) ? null : { https: true };
};

const obavezno = (c: AbstractControl<string>): ValidationErrors | null => ((c.value ?? '').trim() === '' ? { required: true } : null);

const tekst = (max: number, ...dodatno: ((c: AbstractControl<string>) => ValidationErrors | null)[]) =>
  new FormControl('', { nonNullable: true, validators: [Validators.maxLength(max), ...dodatno] });

/**
 * Forma registracije alata na Moodle-u (Podešavanja -> Moodle, spec prijave 8.1): naziv, issuer (Platform ID), Client ID,
 * Deployment ID, auth i JWKS URL (prazno = izvedeno iz issuer-a, pomoć ispod polja pokazuje izvedenu adresu) i "Aktivna".
 * Čuva sama (`POST`/`PUT`, tihe greške): razlog servera (400 adresa, 409 duplikat) je u traci iznad polja. Vraća sačuvanu
 * registraciju ili `undefined` (Odustani).
 */
@Component({
  selector: 'app-registracija-dialog',
  imports: [
    FormErrorBanner, MatButton, MatCheckbox, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle, MatError,
    MatFormField, MatHint, MatInput, MatLabel, MatProgressSpinner, ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ cfg.registracija ? 'Izmena registracije' : 'Nova registracija' }}</h2>
    <form [formGroup]="forma" (ngSubmit)="sacuvaj()" novalidate>
      <mat-dialog-content>
        <app-form-error-banner [poruka]="greska()" />
        <p class="uvod">
          Vrednosti su na Moodle-u, u detaljima alata ("View configuration details"). Auth URL je tamo "Authentication request
          URL", a JWKS URL "Public keyset URL"; obično ostaju prazni.
        </p>

        <mat-form-field appearance="outline">
          <mat-label>Naziv</mat-label>
          <input matInput formControlName="naziv" autocomplete="off" maxlength="120">
          <mat-hint>Za tebe, npr. ime predmeta</mat-hint>
          @if (forma.controls.naziv.hasError('required')) {
            <mat-error>Unesi naziv.</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Issuer (Platform ID)</mat-label>
          <input matInput formControlName="izdavac" type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="255">
          <mat-hint>Adresa Moodle-a, sa https://</mat-hint>
          @if (forma.controls.izdavac.hasError('required')) {
            <mat-error>Unesi issuer (Platform ID).</mat-error>
          } @else if (forma.controls.izdavac.hasError('https')) {
            <mat-error>Adresa mora da počne sa https://.</mat-error>
          }
        </mat-form-field>

        <div class="par">
          <mat-form-field appearance="outline">
            <mat-label>Client ID</mat-label>
            <input matInput formControlName="clientId" autocomplete="off" spellcheck="false" maxlength="255" class="mono">
            @if (forma.controls.clientId.hasError('required')) {
              <mat-error>Unesi Client ID.</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Deployment ID</mat-label>
            <input matInput formControlName="deploymentId" autocomplete="off" spellcheck="false" maxlength="255" class="mono">
            @if (forma.controls.deploymentId.hasError('required')) {
              <mat-error>Unesi Deployment ID.</mat-error>
            }
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Auth URL</mat-label>
          <input matInput formControlName="authUrl" type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="500">
          <mat-hint class="izvedeno">Prazno: {{ izvedenAuth() ?? 'izvodi se iz issuer-a.' }}</mat-hint>
          @if (forma.controls.authUrl.hasError('https')) {
            <mat-error>Adresa mora da počne sa https://.</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>JWKS URL</mat-label>
          <input matInput formControlName="jwksUrl" type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="500">
          <mat-hint class="izvedeno">Prazno: {{ izvedenJwks() ?? 'izvodi se iz issuer-a.' }}</mat-hint>
          @if (forma.controls.jwksUrl.hasError('https')) {
            <mat-error>Adresa mora da počne sa https://.</mat-error>
          }
        </mat-form-field>

        <mat-checkbox formControlName="aktivna">Aktivna (Moodle sme da otvara GFS preko ove registracije)</mat-checkbox>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" [mat-dialog-close]="undefined">Odustani</button>
        <button matButton="filled" type="submit" [disabled]="salje()" data-sacuvaj>
          @if (salje()) {
            <mat-progress-spinner mode="indeterminate" diameter="18" aria-label="Čuvanje" />
          }
          Sačuvaj
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .uvod { margin: 0 0 16px; color: var(--ink-2); }
    mat-form-field { width: 100%; margin-bottom: 8px; }
    .par { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
    @media (max-width: 599.98px) { .par { grid-template-columns: 1fr; } }
    .izvedeno { overflow-wrap: anywhere; }
    .mono { font-family: var(--font-mono); }
    button mat-progress-spinner { display: inline-block; margin-right: 8px; }
  `,
})
export class RegistracijaDialog {
  protected readonly cfg = inject<RegistracijaDialogCfg>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<RegistracijaDialog, LtiRegistracijaInfo>>(MatDialogRef);
  private readonly api = inject(LtiApi);

  protected readonly forma = new FormGroup({
    naziv: tekst(120, obavezno),
    izdavac: tekst(255, obavezno, httpsAdresa),
    clientId: tekst(255, obavezno),
    deploymentId: tekst(255, obavezno),
    authUrl: tekst(500, httpsAdresa),
    jwksUrl: tekst(500, httpsAdresa),
    aktivna: new FormControl(true, { nonNullable: true }),
  });
  protected readonly salje = signal(false);
  protected readonly greska = signal<string | null>(null);

  private readonly izdavac = toSignal(this.forma.controls.izdavac.valueChanges, { initialValue: '' });
  protected readonly izvedenAuth = computed(() => izvedeniUrl(this.izdavac(), AUTH_PUTANJA));
  protected readonly izvedenJwks = computed(() => izvedeniUrl(this.izdavac(), CERTS_PUTANJA));

  constructor() {
    this.forma.setValue(uFormu(this.cfg.registracija));
  }

  static otvori(dialog: MatDialog, cfg: RegistracijaDialogCfg): Observable<LtiRegistracijaInfo | undefined> {
    return dialog
      .open<RegistracijaDialog, RegistracijaDialogCfg, LtiRegistracijaInfo>(RegistracijaDialog, {
        data: cfg, width: '40rem', maxWidth: '96vw', autoFocus: 'first-tabbable',
      })
      .afterClosed();
  }

  protected sacuvaj(): void {
    if (this.salje()) {
      return;
    }
    this.forma.markAllAsTouched();
    if (this.forma.invalid) {
      return;
    }
    this.salje.set(true);
    this.ref.disableClose = true; // Esc ili klik sa strane ne sme da zatvori dijalog dok zahtev traje (rezultat bi se izgubio)
    this.greska.set(null);
    const cmd = uCmd(this.forma.getRawValue());
    const id = this.cfg.registracija?.id;
    const zahtev = id === undefined ? this.api.dodaj(cmd, { tiho: true }) : this.api.izmeni(id, cmd, { tiho: true });
    zahtev.subscribe({
      next: r => this.ref.close(r),
      error: (e: unknown) => {
        this.salje.set(false);
        this.ref.disableClose = false;
        this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
      },
    });
  }
}
