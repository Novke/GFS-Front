import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import {
  MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle,
} from '@angular/material/dialog';
import { finalize, Observable } from 'rxjs';

import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { DatumPipe } from '../../shared/util/datum.pipe';
import { sRecju } from '../../shared/util/mnozina';
import { PORUKA_SISTEM, toApiError } from '../api/api-error';
import { AuthApi, SesijaInfo } from '../auth/auth.api';
import { NotificationStore } from '../state/notification.store';

type Status = 'loading' | 'loaded' | 'error';

const uredjaja = (n: number) => sRecju(n, 'uređaj', 'uređaja', 'uređaja');

/**
 * "Prijavljeni uređaji" (meni nastavnika): sesije nastavnika (`GET api/auth/sesije`), odjava jednog uređaja i "Odjavi sve
 * ostale" (sve osim ovog), obe uz `ConfirmDialog`; rezultat ide u snackbar, pa se lista učitava ponovo. Lenji chunk: meni ga
 * uvozi dinamički tek na klik. Greška učitavanja je u dijalogu (zahtev je tih), greška akcije u snackbaru.
 */
@Component({
  selector: 'app-sesije-dialog',
  imports: [DatumPipe, MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Prijavljeni uređaji</h2>
    <mat-dialog-content>
      <p class="uvod">Uređaji na kojima si prijavljen kao nastavnik. Odjavi svaki koji ne prepoznaješ.</p>
      @switch (status()) {
        @case ('loading') {
          <p class="stanje" role="status">Učitavanje…</p>
        }
        @case ('error') {
          <div class="stanje">
            <p role="alert">{{ greska() }}</p>
            <button matButton="outlined" type="button" data-ponovo (click)="ucitaj()">Pokušaj ponovo</button>
          </div>
        }
        @default {
          <ul class="lista">
            @for (s of sesije(); track s.id) {
              <li [attr.data-sesija]="s.id">
                <div class="tekst">
                  <div class="opis">
                    {{ s.opis || 'Nepoznat uređaj' }}
                    @if (s.trenutna) {
                      <span class="ovaj">Ovaj uređaj</span>
                    }
                  </div>
                  <div class="vreme">Prijava {{ s.kreirano | datum: 'sa-vremenom' }} · poslednji put {{ s.poslednjiUlaz | datum: 'sa-vremenom' }}</div>
                </div>
                @if (!s.trenutna) {
                  <button matButton type="button" data-odjavi [disabled]="radi()" [attr.aria-label]="'Odjavi uređaj: ' + (s.opis || 'Nepoznat uređaj')"
                          (click)="opozovi(s)">Odjavi</button>
                }
              </li>
            }
          </ul>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" data-odjavi-sve [disabled]="ostali() === 0 || radi()" (click)="odjaviSveOstale()">Odjavi sve ostale</button>
      <button matButton="filled" type="button" mat-dialog-close>Zatvori</button>
    </mat-dialog-actions>
  `,
  styles: `
    .uvod { margin: 0 0 8px; color: var(--muted); }
    .lista { margin: 0; padding: 0; list-style: none; }
    li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
    li:last-child { border-bottom: 0; }
    .tekst { flex: 1; min-width: 0; }
    .opis { color: var(--ink); font-weight: 600; overflow-wrap: anywhere; }
    .ovaj { margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: var(--ok-soft); color: var(--ink); font-size: 12px; font-weight: 600; }
    .vreme { color: var(--muted); font-size: 12.5px; }
    .stanje { margin: 0; padding: 12px 0; color: var(--muted); }
    .stanje p { margin: 0 0 8px; color: var(--ink); }
  `,
})
export class SesijeDialog {
  private readonly api = inject(AuthApi);
  private readonly dialog = inject(MatDialog);
  private readonly poruke = inject(NotificationStore);
  private readonly destroyRef = inject(DestroyRef);
  /** Neka potvrda je otvorena: drugi klik ne otvara drugu. */
  private potvrdaOtvorena = false;

  protected readonly sesije = signal<SesijaInfo[]>([]);
  protected readonly status = signal<Status>('loading');
  protected readonly greska = signal<string | null>(null);
  /** Akcija u toku (dugmad su isključena dok se ne završi). */
  protected readonly radi = signal(false);
  protected readonly ostali = computed(() => this.sesije().filter(s => !s.trenutna).length);

  constructor() {
    this.ucitaj();
  }

  protected ucitaj(): void {
    this.status.set('loading');
    this.api.sesije({ tiho: true }).subscribe({
      next: lista => {
        this.sesije.set(Array.isArray(lista) ? lista : []);
        this.status.set('loaded');
      },
      error: (e: unknown) => {
        this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
        this.status.set('error');
      },
    });
  }

  protected opozovi(s: SesijaInfo): void {
    const opis = s.opis || 'Nepoznat uređaj';
    this.uzPotvrdu(
      { naslov: 'Odjaviti uređaj?', tekst: `${opis} mora ponovo da se prijavi da bi radio u GFS-u.`, potvrdi: 'Odjavi', destruktivno: true },
      () => this.api.opozovi(s.id),
      () => this.poruke.uspeh('Uređaj je odjavljen.'),
    );
  }

  protected odjaviSveOstale(): void {
    this.uzPotvrdu(
      {
        naslov: 'Odjaviti sve ostale uređaje?',
        tekst: `Odjaviće se ${uredjaja(this.ostali())}; na njima treba ponovo da se prijaviš. Ovaj uređaj ostaje prijavljen.`,
        potvrdi: 'Odjavi sve ostale',
        destruktivno: true,
      },
      () => this.api.odjaviSveOstale(),
      (r: { odjavljeno?: unknown } | void) => {
        const n = typeof r?.odjavljeno === 'number' ? r.odjavljeno : 0;
        if (n > 0) {
          this.poruke.uspeh(`Odjavljeno: ${uredjaja(n)}.`);
        } else {
          this.poruke.info('Nijedan drugi uređaj nije bio prijavljen.');
        }
      },
    );
  }

  /** Potvrda, zahtev (greška ide u snackbar), poruka uspeha, pa ponovo lista (i posle greške). */
  private uzPotvrdu<T>(cfg: Parameters<typeof ConfirmDialog.otvori>[1], zahtev: () => Observable<T>, uspeh: (r: T) => void): void {
    if (this.radi() || this.potvrdaOtvorena) {
      return;
    }
    this.potvrdaOtvorena = true;
    ConfirmDialog.otvori(this.dialog, cfg).pipe(
      finalize(() => (this.potvrdaOtvorena = false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(da => {
      if (!da) {
        return;
      }
      this.radi.set(true);
      zahtev().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: r => uspeh(r),
        error: () => {
          this.radi.set(false);
          this.ucitaj();
        },
        complete: () => {
          this.radi.set(false);
          this.ucitaj();
        },
      });
    });
  }

  static otvori(dialog: MatDialog): MatDialogRef<SesijeDialog> {
    return dialog.open(SesijeDialog, { width: '36rem', maxWidth: '94vw', autoFocus: 'first-heading', restoreFocus: true });
  }
}
