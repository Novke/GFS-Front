import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Observable, filter } from 'rxjs';

import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { formatDatum } from '../../../shared/util/datum.pipe';
import { OnlineTestoviApi } from '../data-access/online-testovi.api';
import { vremeIzIso } from '../data-access/online.pravila';

/**
 * Objava rezultata studentima (spec 14, `POST|DELETE test/{id}/objava`): „Objavi rezultate“ sa kućicom „Pokaži tačne odgovore“
 * (samo online: tačne vrednosti i slike rešenja), „Objavi ponovo“ i „Povuci objavu“. I za test na papiru (samo ukupni poeni, bez
 * kućice). Online test se objavljuje tek kad je završen (roditelj crta komponentu tek tada).
 */
@Component({
  selector: 'app-objava-testa',
  imports: [FormsModule, MatButton, MatCheckbox, MatIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="objava" [class.objavljeno]="!!objavljeno()" data-objava>
      <p class="stanje">
        @if (objavljeno(); as o) {
          <strong>Rezultati su objavljeni</strong> {{ kada(o) }}@if (online()) { · {{ tacni() ? 'sa tačnim odgovorima' : 'bez tačnih odgovora' }} }
        } @else {
          <strong>Rezultati nisu objavljeni.</strong> Studenti ih ne vide dok ih ne objaviš.
        }
      </p>
      <div class="akcije">
        @if (online()) {
          <mat-checkbox [(ngModel)]="saTacnim" data-tacni>Pokaži tačne odgovore</mat-checkbox>
        }
        <button matButton="filled" type="button" [disabled]="radi()" (click)="objavi()" data-objavi>
          <mat-icon svgIcon="visibility" aria-hidden="true" />{{ objavljeno() ? 'Objavi ponovo' : 'Objavi rezultate' }}
        </button>
        @if (objavljeno()) {
          <button matButton="outlined" type="button" [disabled]="radi()" (click)="povuci()" data-povuci>
            <mat-icon svgIcon="visibility_off" aria-hidden="true" />Povuci objavu
          </button>
        }
      </div>
    </section>
  `,
  styles: `
    .objava { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 12px;
      padding: 10px 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
    .objava.objavljeno { border-color: var(--ok); background: var(--ok-soft); }
    .stanje { margin: 0; }
    .akcije { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  `,
})
export class ObjavaTesta {
  readonly testId = input.required<number>();
  readonly online = input(false);
  readonly objavljeno = input<string | null>(null);
  readonly tacni = input(false);
  readonly promena = output<void>();

  private readonly api = inject(OnlineTestoviApi);
  private readonly dialog = inject(MatDialog);
  protected readonly radi = signal(false);
  protected saTacnim = false;

  protected kada(iso: string): string {
    return `${formatDatum(iso)} u ${vremeIzIso(iso)}`;
  }

  protected objavi(): void {
    const tacni = this.online() && this.saTacnim;
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Objaviti rezultate?',
      tekst: tacni
        ? 'Svaki student vidi svoje poene, svoje odgovore, tačne vrednosti i rešenja.'
        : this.online() ? 'Svaki student vidi svoje poene i svoje odgovore, bez tačnih vrednosti.' : 'Svaki student vidi svoje poene.',
      potvrdi: 'Objavi',
    }).pipe(filter(Boolean)).subscribe(() => this.posalji(this.api.objavi(this.testId(), tacni)));
  }

  protected povuci(): void {
    ConfirmDialog.otvori(this.dialog, {
      naslov: 'Povući objavu?', tekst: 'Studenti više ne vide rezultate ovog testa.', potvrdi: 'Povuci', destruktivno: true,
    }).pipe(filter(Boolean)).subscribe(() => this.posalji(this.api.povuciObjavu(this.testId())));
  }

  private posalji(o: Observable<void>): void {
    this.radi.set(true);
    o.subscribe({
      next: () => {
        this.radi.set(false);
        this.promena.emit();
      },
      error: () => this.radi.set(false),
    });
  }
}
