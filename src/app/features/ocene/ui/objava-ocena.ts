import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subscription, filter, switchMap } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { OceneApi } from '../../../core/api/ocene.api';
import { ObjavaOcenaInfo } from '../../../core/api/ocene.models';
import { NotificationStore } from '../../../core/state/notification.store';
import { ConfirmDialog, ConfirmDialogCfg } from '../../../shared/ui/confirm-dialog';
import { formatDatum } from '../../../shared/util/datum.pipe';
import { brojStudenataTekst } from '../../../shared/util/mnozina';

/**
 * Traka objave predloga ocena studentima (spec studentskog dela 12.4), iznad predloga ocena za predmet i grupu: dok nije
 * objavljeno studenti na nalogu ne vide ništa o oceni ("Objavi predloge"); posle objave traka kaže kada i za koliko
 * studenata, a "Objavi ponovo" pravi nov snimak (zamenjuje ceo prethodni) i "Povuci" ga briše. Obe radnje uz potvrdu.
 */
@Component({
  selector: 'app-objava-ocena',
  imports: [MatButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (stanje(); as s) {
      <section class="traka" [class.objavljeno]="!!s.objavljeno" aria-label="Objava studentima" data-objava>
        <p class="tekst" role="status">
          @if (s.objavljeno) {
            Objavljeno studentima {{ datum(s.objavljeno) }} ({{ studenata(s.studenata) }}). Na nalogu vide svoj predlog iz tog trenutka.
          } @else {
            Studenti još ne vide predloge ocena ni bodove.
          }
        </p>
        <div class="akcije">
          <button type="button" matButton="filled" [disabled]="radi()" (click)="objavi(!!s.objavljeno)" data-objavi>
            {{ s.objavljeno ? 'Objavi ponovo' : 'Objavi predloge' }}
          </button>
          @if (s.objavljeno) {
            <button type="button" matButton="outlined" [disabled]="radi()" (click)="povuci()" data-povuci>Povuci</button>
          }
        </div>
      </section>
    } @else if (greska(); as g) {
      <p class="greska" role="alert">Stanje objave nije učitano: {{ g }}</p>
    }
  `,
  styles: `
    :host { display: block; margin-bottom: 12px; }
    .traka { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; padding: 10px 14px;
      border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
    .traka.objavljeno { border-color: var(--ok); background: var(--ok-soft); }
    .tekst { margin: 0; }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; }
    .greska { margin: 0; color: var(--danger); }
  `,
})
export class ObjavaOcena {
  readonly predmetId = input.required<number>();
  readonly grupaId = input.required<number>();

  private readonly api = inject(OceneApi);
  private readonly dialog = inject(MatDialog);
  private readonly obavestenja = inject(NotificationStore);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly stanje = signal<ObjavaOcenaInfo | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly radi = signal(false);
  protected readonly studenata = brojStudenataTekst;
  private ucitavanje?: Subscription;

  constructor() {
    this.destroyRef.onDestroy(() => this.ucitavanje?.unsubscribe());
    effect(() => {
      const predmet = this.predmetId();
      const grupa = this.grupaId();
      untracked(() => this.ucitaj(predmet, grupa));
    });
  }

  protected datum(v: string): string {
    return formatDatum(v, 'sa-vremenom');
  }

  protected objavi(ponovo: boolean): void {
    this.radnja(
      {
        naslov: ponovo ? 'Objaviti ponovo?' : 'Objaviti predloge ocena?',
        tekst: ponovo
          ? 'Studenti grupe dobijaju nov snimak predloga (zamenjuje prethodni).'
          : 'Svaki student grupe na svom nalogu vidi svoj predlog ocene i bodove, kakvi su sada. Kasnije izmene vide tek posle nove objave.',
        potvrdi: ponovo ? 'Objavi ponovo' : 'Objavi',
      },
      () => this.api.objavi(this.predmetId(), this.grupaId(), { tiho: true }),
      'Predlozi ocena su objavljeni.',
    );
  }

  protected povuci(): void {
    this.radnja(
      {
        naslov: 'Povući objavu?',
        tekst: 'Studenti na nalogu više ne vide predlog ocene ni bodove.',
        potvrdi: 'Povuci',
        destruktivno: true,
      },
      () => this.api.povuci(this.predmetId(), this.grupaId(), { tiho: true }),
      'Objava je povučena.',
    );
  }

  private radnja(
    cfg: ConfirmDialogCfg,
    poziv: () => Observable<unknown>,
    uspeh: string,
  ): void {
    if (this.radi()) {
      return;
    }
    this.radi.set(true);
    ConfirmDialog.otvori(this.dialog, cfg)
      .pipe(
        filter(da => {
          if (!da) {
            this.radi.set(false);
          }
          return da;
        }),
        switchMap(() => poziv()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.radi.set(false);
          this.obavestenja.uspeh(uspeh);
          this.ucitaj(this.predmetId(), this.grupaId());
        },
        error: (e: unknown) => {
          this.radi.set(false);
          this.obavestenja.greska(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
        },
      });
  }

  private ucitaj(predmet: number, grupa: number): void {
    this.ucitavanje?.unsubscribe();
    this.greska.set(null);
    this.ucitavanje = this.api.objava(predmet, grupa, { tiho: true }).subscribe({
      next: s => this.stanje.set(s),
      error: (e: unknown) => {
        this.stanje.set(null);
        this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
      },
    });
  }
}
