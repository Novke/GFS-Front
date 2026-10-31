import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { porukaGreske } from '../data-access/nalog.pravila';
import { PortalApi } from '../data-access/portal.api';
import { PredmetStudenta } from '../data-access/portal.models';
import { opisPredmeta, putanjaPrijave, status } from '../data-access/portal.pravila';
import { NalogOkvir } from '../ui/nalog-okvir.component';

/**
 * Tab **Predmeti** (`/nalog/predmeti`, spec studentskog dela 5.1 i 12.2): predmeti koje student sluša (sopstvena grupa i
 * grupe predavanja na kojima je bio), sa "Prisutan na x od y", brojem tipova za vežbanje i oznakom "Ocena objavljena".
 * Samo `GET api/public/nalog/predmeti`; 401 vodi na prijavu sa povratkom ovde.
 */
@Component({
  selector: 'app-predmeti-page',
  imports: [MatButton, MatProgressSpinner, NalogOkvir, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-nalog-okvir naslov="Predmeti">
      <h2>Moji predmeti</h2>
      @if (predmeti(); as lista) {
        @if (lista.length === 0) {
          <p class="prazno" data-prazno>Još nemaš predmete. Predmet se pojavi posle prvog časa na kome si bio.</p>
        } @else {
          <ul class="predmeti">
            @for (p of lista; track p.id) {
              <li>
                <a class="predmet" [routerLink]="['/nalog/predmet', p.id]" [attr.data-predmet]="p.id">
                  <span class="naziv">{{ p.naziv }}</span>
                  <span class="opis">{{ opis(p) }}</span>
                  @if (p.ocenaObjavljena) {
                    <span class="cip">Ocena objavljena</span>
                  }
                </a>
              </li>
            }
          </ul>
        }
      } @else if (greska(); as g) {
        <p class="poruka opasnost" role="alert">{{ g }}</p>
        <button type="button" mat-flat-button class="dugme" (click)="ucitaj()">Pokušaj ponovo</button>
      } @else {
        <p class="stanje" role="status">
          <mat-progress-spinner mode="indeterminate" diameter="20" aria-hidden="true" />Učitavanje...
        </p>
      }
    </app-nalog-okvir>
  `,
  styles: `
    h2 { margin: 0 0 14px; font-size: 18px; }
    .stanje { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0; padding: 24px 0; color: var(--muted); }
    .prazno { margin: 0; color: var(--ink-2); }
    .dugme { width: 100%; min-height: 48px; font-size: 16px; }
    .poruka { margin: 0 0 16px; padding: 12px 16px; border: 1px solid transparent; border-radius: var(--radius-sm); }
    .poruka.opasnost { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }
    .predmeti { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
    .predmet {
      display: flex; flex-direction: column; gap: 4px; min-height: 48px; padding: 12px 14px; border: 1px solid var(--line);
      border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); text-decoration: none;
    }
    .predmet:hover { border-color: var(--primary); }
    .predmet:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .naziv { font-weight: 700; overflow-wrap: anywhere; }
    .opis { color: var(--ink-2); font-size: 14px; }
    .cip { align-self: flex-start; padding: 2px 8px; border-radius: 999px; background: var(--ok-soft); color: var(--ok);
      font-size: 12px; font-weight: 600; }
  `,
})
export class PredmetiPage {
  private readonly api = inject(PortalApi);
  private readonly router = inject(Router);

  protected readonly predmeti = signal<PredmetStudenta[] | null>(null);
  protected readonly greska = signal<string | null>(null);
  protected readonly opis = opisPredmeta;
  private zahtev?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
    this.ucitaj();
  }

  protected ucitaj(): void {
    this.zahtev?.unsubscribe();
    this.greska.set(null);
    this.zahtev = this.api.predmeti().subscribe({
      next: lista => this.predmeti.set(lista ?? []),
      error: (e: unknown) => {
        if (status(e) === 401) {
          void this.router.navigateByUrl(putanjaPrijave(this.router.url));
        } else {
          this.greska.set(porukaGreske(e));
        }
      },
    });
  }
}
