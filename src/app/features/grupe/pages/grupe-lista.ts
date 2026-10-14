import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { catchError, filter, forkJoin, map, of, Subscription, switchMap, tap } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { NotificationStore } from '../../../core/state/notification.store';
import { ReferenceStore } from '../../../core/state/reference.store';
import { FilterBar } from '../../../shared/ui/filter-bar';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { StatusChip } from '../../../shared/ui/status-chip';
import { OnboardingApi, OnboardingSesijaInfo } from '../../../core/api/onboarding.api';
import { GrupeApi } from '../../../core/api/grupe.api';
import { GrupaInfo } from '../../../core/api/grupe.models';
import { GrupaDialog } from '../ui/grupa-dialog';

/** Otvoren onboarding grupe: najnovija otvorena sesija, `null` = nema je, `undefined` = još se učitava ili nije uspelo. */
export type OtvorenOnboarding = OnboardingSesijaInfo | null | undefined;

/** Najnovija otvorena sesija (po vremenu kreiranja, pa id-ju) ili `null`. */
export function otvorenaSesija(sesije: readonly OnboardingSesijaInfo[] | null | undefined): OnboardingSesijaInfo | null {
  const otvorene = (sesije ?? []).filter(s => s.otvorena);
  otvorene.sort((a, b) => (b.kreirano ?? '').localeCompare(a.kreirano ?? '') || b.id - a.id);
  return otvorene[0] ?? null;
}

/** Pretraga po nazivu: bez razlike u velikim slovima i dijakriticima (`cs` nalazi "ČS-2024"). */
export function poklapaNaziv(naziv: string | null | undefined, q: string | null | undefined): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'dj').toLowerCase();
  const t = q?.trim();
  return !t || norm(naziv ?? '').includes(norm(t));
}

/**
 * Lista grupa (`/grupe`): naziv, godina upisa, broj studenata i otvoren onboarding; "Nova grupa" (dijalog) i pretraga po
 * nazivu (lokalno, lista je mala). Otvoren onboarding se čita po grupi (`GET grupe/{id}/onboarding`), jer ga lista
 * grupa sa servera nema; neuspeh za jednu grupu je `—`, ne greška cele liste.
 */
@Component({
  selector: 'app-grupe-lista',
  imports: [EmptyState, ErrorPanel, FilterBar, MatButton, MatIcon, PageHeader, RouterLink, SkeletonRows, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header naslov="Grupe" podnaslov="Grupe studenata po godini upisa">
      <button akcije matButton="filled" type="button" (click)="novaGrupa()" data-nova>
        <mat-icon svgIcon="add" aria-hidden="true" />Nova grupa
      </button>
    </app-page-header>

    <section class="lista-kartica" aria-label="Lista grupa" [attr.aria-busy]="status() === 'ucitava'">
      <app-filter-bar [pretraga]="q()" pretragaLabela="Pretraži po nazivu…" [imaFiltera]="!!q()" (pretragaChange)="q.set($event)" (ocisti)="q.set(null)" />

      @if (status() === 'greska') {
        <app-error-panel [poruka]="greska()" (ponovo)="ucitaj()" />
      }

      @if (prikazane().length > 0) {
        <p class="lista-broj" aria-live="polite">{{ brojTekst() }}</p>
        <div class="tabela-okvir">
          <table class="lista-tabela">
            <caption class="sr-only">Grupe</caption>
            <thead>
              <tr>
                <th scope="col">Naziv</th>
                <th scope="col">Godina upisa</th>
                <th scope="col">Studenti</th>
                <th scope="col">Onboarding</th>
              </tr>
            </thead>
            <tbody>
              @for (g of prikazane(); track g.id) {
                @let o = onboarding()[g.id];
                <tr (click)="otvori(g.id)" [attr.data-grupa]="g.id">
                  <td class="c-glavno">
                    <button type="button" class="otvori" (click)="$event.stopPropagation(); otvori(g.id)">{{ g.naziv || '—' }}</button>
                  </td>
                  <td class="samo-desktop mono">{{ g.godinaUpisa ?? '—' }}</td>
                  <td class="samo-desktop mono">{{ g.brojStudenata ?? '—' }}</td>
                  <td class="c-st">
                    @if (o) {
                      <a class="onb" [routerLink]="['/grupe', g.id, 'onboarding', o.id]" (click)="$event.stopPropagation()"
                        [attr.aria-label]="'Otvoren onboarding grupe ' + g.naziv + ', na čekanju ' + o.brojNaCekanju">
                        <app-status-chip tekst="Otvoren" ton="uToku" />
                        @if (o.brojNaCekanju > 0) {
                          <span class="cekanje">{{ o.brojNaCekanju }} na čekanju</span>
                        }
                      </a>
                    } @else if (o === null) {
                      <span class="nema">—</span>
                    } @else {
                      <span class="nema" aria-label="Učitava se">…</span>
                    }
                  </td>
                  <td class="c-meta">Upis {{ g.godinaUpisa ?? '—' }} · {{ g.brojStudenata ?? 0 }} studenata</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (status() === 'ucitava') {
        <app-skeleton-rows [redovi]="4" />
      } @else if (status() === 'ucitano') {
        @if (q()) {
          <app-empty-state naslov="Nema grupa za izabrane filtere" [tekst]="'Nijedna grupa ne sadrži „' + q() + '“.'">
            <button matButton="outlined" type="button" (click)="q.set(null)" data-ocisti>Očisti filtere</button>
          </app-empty-state>
        } @else {
          <app-empty-state naslov="Još nema grupa" ikona="groups" tekst="Napravi prvu grupu, pa dodaj studente ručno ili preko onboardinga.">
            <button matButton="filled" type="button" (click)="novaGrupa()"><mat-icon svgIcon="add" aria-hidden="true" />Nova grupa</button>
          </app-empty-state>
        }
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    app-error-panel { display: block; margin: 0 16px; }
    .onb { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; text-decoration: none; color: inherit; }
    .cekanje { font-size: 12.5px; color: var(--warn); font-weight: 600; white-space: nowrap; }
    .nema { color: var(--muted); }
  `,
})
export class GrupeLista implements OnInit {
  private readonly api = inject(GrupeApi);
  private readonly onboardingApi = inject(OnboardingApi);
  private readonly reference = inject(ReferenceStore);
  private readonly obavestenja = inject(NotificationStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly grupe = signal<GrupaInfo[]>([]);
  protected readonly onboarding = signal<Record<number, OtvorenOnboarding>>({});
  protected readonly status = signal<'ucitava' | 'ucitano' | 'greska'>('ucitava');
  protected readonly greska = signal<string | null>(null);
  protected readonly q = signal<string | null>(null);
  private zahtev: Subscription | null = null;

  /** Najnovija godina upisa prva, pa po nazivu. */
  protected readonly prikazane = computed(() =>
    this.grupe()
      .filter(g => poklapaNaziv(g.naziv, this.q()))
      .sort((a, b) => (b.godinaUpisa ?? 0) - (a.godinaUpisa ?? 0) || (a.naziv ?? '').localeCompare(b.naziv ?? '', 'sr')),
  );
  protected readonly brojTekst = computed(() => {
    const n = this.prikazane().length;
    const d = n % 10;
    const dd = n % 100;
    return `${n} ${d === 1 && dd !== 11 ? 'grupa' : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'grupe' : 'grupa'}`;
  });

  ngOnInit(): void {
    this.ucitaj();
  }

  protected ucitaj(): void {
    // "Pokušaj ponovo" dok prethodno učitavanje još traje: staro se otkazuje (i njegovi zahtevi za onboarding)
    this.zahtev?.unsubscribe();
    this.status.set('ucitava');
    this.greska.set(null);
    this.onboarding.set({});
    this.zahtev = this.api
      .sve({ tiho: true })
      .pipe(
        tap(grupe => {
          this.grupe.set(grupe ?? []);
          this.status.set('ucitano');
        }),
        switchMap(grupe =>
          forkJoin(
            (grupe ?? []).map(g =>
              this.onboardingApi.sesije(g.id, { tiho: true }).pipe(
                map(s => [g.id, otvorenaSesija(s)] as const),
                catchError(() => of([g.id, null] as const)),
              ),
            ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: parovi => this.onboarding.set(Object.fromEntries(parovi)),
        error: (e: unknown) => {
          this.status.set('greska');
          this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);
        },
      });
  }

  protected otvori(id: number): void {
    void this.router.navigate(['/grupe', id]);
  }

  protected novaGrupa(): void {
    GrupaDialog.otvori(this.dialog)
      .pipe(filter((g): g is GrupaInfo => !!g))
      .subscribe(g => {
        this.reference.invalidiraj('grupe');
        this.obavestenja.uspeh(`Grupa ${g.naziv} je kreirana.`);
        void this.router.navigate(['/grupe', g.id, 'studenti']);
      });
  }
}
