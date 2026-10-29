import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { NotificationStore } from '../../../core/state/notification.store';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { StatusChip } from '../../../shared/ui/status-chip';
import { formatDatum } from '../../../shared/util/datum.pipe';
import { isoDatum } from '../../../shared/util/termin';
import { RasporedApi } from '../data-access/raspored.api';
import { RasporedInfo } from '../data-access/raspored.models';
import { vaziNaDan } from '../data-access/raspored.pravila';

type Status = 'ucitavanje' | 'greska' | 'ok';

/**
 * Raspored časova (`/raspored`; spec najave odsustva, odeljak 7): periodi, najnoviji prvi, sa brojem termina, pragom i
 * oznakom „Važi danas“; „Izmeni“, „Kopiraj u novi“ (`/raspored/novi?kopija=<id>`) i „Obriši“ (potvrda). Periodi se ne
 * brišu sami: stari ostaju dok ih nastavnik ne obriše.
 */
@Component({
  selector: 'app-rasporedi-page',
  imports: [EmptyState, ErrorPanel, MatButton, MatIcon, PageHeader, RouterLink, SkeletonRows, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header naslov="Raspored časova" podnaslov="Po periodu: koji predmet i grupa imaju čas kog dana. Studenti vide naredne časove na nalogu i mogu da jave da neće doći.">
      <a akcije matButton="outlined" routerLink="/raspored/termini"><mat-icon svgIcon="event" aria-hidden="true" />Naredni termini</a>
      <a akcije matButton="filled" routerLink="/raspored/novi" data-novi><mat-icon svgIcon="add" aria-hidden="true" />Nov raspored</a>
    </app-page-header>

    <section class="kartica" aria-labelledby="rs-periodi">
      <h2 id="rs-periodi">Periodi</h2>
      @switch (status()) {
        @case ('ucitavanje') {
          <app-skeleton-rows redovi="2" />
        }
        @case ('greska') {
          <app-error-panel [poruka]="greska()" (ponovo)="ucitaj()" />
        }
        @default {
          @if (lista().length === 0) {
            <app-empty-state naslov="Nema rasporeda" ikona="event"
              tekst="Napravi raspored za semestar: dan, vreme, predmet i grupa za svaki čas.">
              <a matButton="outlined" routerLink="/raspored/novi">Nov raspored</a>
            </app-empty-state>
          } @else {
            <ul class="periodi">
              @for (r of lista(); track r.id) {
                <li [attr.data-raspored]="r.id">
                  <div class="glava">
                    <h3><a [routerLink]="['/raspored', r.id]">{{ r.naziv }}</a></h3>
                    @if (vazi(r)) {
                      <app-status-chip tekst="Važi danas" ton="ok" />
                    }
                  </div>
                  <p class="detalj">
                    {{ datum(r.vaziOd) }} – {{ datum(r.vaziDo) }} · {{ termina(r.brojStavki) }} · prag najava {{ r.pragNajava }}
                  </p>
                  <div class="akcije">
                    <a matButton="outlined" [routerLink]="['/raspored', r.id]" [attr.aria-label]="'Izmeni ' + r.naziv">
                      <mat-icon svgIcon="edit" aria-hidden="true" />Izmeni
                    </a>
                    <a matButton [routerLink]="['/raspored/novi']" [queryParams]="{ kopija: r.id }"
                       [attr.aria-label]="'Kopiraj u novi: ' + r.naziv" data-kopiraj>
                      <mat-icon svgIcon="content_copy" aria-hidden="true" />Kopiraj u novi
                    </a>
                    <button matButton type="button" class="destruktivno" [attr.aria-label]="'Obriši ' + r.naziv"
                            [disabled]="brise() === r.id" (click)="obrisi(r)" data-obrisi>
                      <mat-icon svgIcon="delete" aria-hidden="true" />Obriši
                    </button>
                  </div>
                </li>
              }
            </ul>
          }
        }
      }
    </section>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; }
    .kartica { padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
      box-shadow: var(--shadow); min-width: 0; }
    h2 { margin: 0 0 12px; font-size: 17px; }
    h3 { margin: 0; font-size: 15px; overflow-wrap: anywhere; }
    h3 a { color: inherit; }
    .periodi { margin: 0; padding: 0; list-style: none; }
    .periodi li { padding: 12px 0; border-top: 1px solid var(--line); }
    .periodi li:first-child { border-top: 0; padding-top: 0; }
    .glava { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-bottom: 4px; }
    .detalj { margin: 0 0 8px; color: var(--ink-2); font-size: 14px; }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; }
    .destruktivno { --mat-button-text-label-text-color: var(--danger); }
  `,
})
export class RasporediPage {
  private readonly api = inject(RasporedApi);
  private readonly dialog = inject(MatDialog);
  private readonly poruke = inject(NotificationStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly danas = isoDatum(new Date());
  private potvrdaOtvorena = false;

  protected readonly lista = signal<RasporedInfo[]>([]);
  protected readonly status = signal<Status>('ucitavanje');
  protected readonly greska = signal<string | null>(null);
  protected readonly brise = signal<number | null>(null);

  constructor() {
    this.ucitaj();
  }

  protected ucitaj(): void {
    this.status.set('ucitavanje');
    this.api.lista({ tiho: true }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: l => {
        this.lista.set(l ?? []);
        this.status.set('ok');
      },
      error: (e: unknown) => {
        this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
        this.status.set('greska');
      },
    });
  }

  protected vazi(r: RasporedInfo): boolean {
    return vaziNaDan(r, this.danas);
  }

  protected datum(d: string): string {
    return formatDatum(d);
  }

  protected termina(n: number): string {
    return `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'termin' : 'termina'}`;
  }

  protected obrisi(r: RasporedInfo): void {
    if (this.potvrdaOtvorena || this.brise() !== null) {
      return;
    }
    this.potvrdaOtvorena = true;
    ConfirmDialog.otvori(this.dialog, {
      naslov: `Obrisati raspored „${r.naziv}“?`,
      tekst: [
        'Brišu se i svi njegovi termini, otkazivanja i najave odsustva studenata. Predavanja i aktivnosti ostaju.',
        'Studenti više neće videti ove časove na nalogu.',
      ],
      potvrdi: 'Obriši',
      destruktivno: true,
    }).pipe(finalize(() => (this.potvrdaOtvorena = false)), takeUntilDestroyed(this.destroyRef)).subscribe(da => {
      if (!da) {
        return;
      }
      this.brise.set(r.id);
      this.api.obrisi(r.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.brise.set(null);
          this.lista.update(l => l.filter(x => x.id !== r.id));
          this.poruke.uspeh('Raspored je obrisan.');
        },
        error: () => this.brise.set(null), // poruka servera ide u snackbar (zahtev nije tih)
      });
    });
  }
}
