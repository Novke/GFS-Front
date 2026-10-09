import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { filter, Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { NotificationStore } from '../../../core/state/notification.store';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { StatusChip, TonStatusa } from '../../../shared/ui/status-chip';
import { DatumPipe } from '../../../shared/util/datum.pipe';
import { moguceZatvoriti, OnboardingApi, OnboardingSesijaInfo, statusSesije, StatusSesije } from '../../../core/api/onboarding.api';
import { PokreniOnboardingDialog } from '../../onboarding/ui/pokreni-onboarding-dialog';
import { GrupaStore } from '../data-access/grupa.store';

const TON_SESIJE: Record<StatusSesije, TonStatusa> = { Otvorena: 'uToku', Zatvorena: 'neutral', Istekla: 'warn', Popunjena: 'info' };

/** Najnovija sesija prva (po vremenu kreiranja, pa id-ju). */
export function sortirajSesije(sesije: readonly OnboardingSesijaInfo[]): OnboardingSesijaInfo[] {
  return [...sesije].sort((a, b) => (b.kreirano ?? '').localeCompare(a.kreirano ?? '') || b.id - a.id);
}

/**
 * Tab Onboarding grupe (G5): sesije (status, kreirano, rok, prijave ukupno / na čekanju, napomena) sa "QR", "Prijave"
 * i "Zatvori" / "Otvori", i "Pokreni onboarding" (dijalog; posle pokretanja otvara QR, kao u starom UI-ju).
 */
@Component({
  selector: 'app-grupa-onboarding-tab',
  imports: [DatumPipe, EmptyState, ErrorPanel, MatButton, MatIcon, RouterLink, SkeletonRows, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="alati">
      <p class="opis">Studenti se prijavljuju sami preko QR koda; ti potvrđuješ prijave.</p>
      <button matButton="filled" type="button" (click)="pokreni()" data-pokreni>
        <mat-icon svgIcon="qr_code_2" aria-hidden="true" />Pokreni onboarding
      </button>
    </div>

    <section class="lista-kartica" aria-label="Sesije">
      @if (greska(); as g) {
        <app-error-panel [poruka]="g" (ponovo)="ucitaj()" />
      }
      @if (sesije(); as lista) {
        @if (lista.length > 0) {
          <div class="tabela-okvir">
            <table class="sesije">
              <caption class="sr-only">Onboarding sesije</caption>
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Kreirano</th>
                  <th scope="col">Ističe</th>
                  <th scope="col">Prijava (ukupno / na čekanju)</th>
                  <th scope="col">Napomena</th>
                  <th scope="col"><span class="sr-only">Akcije</span></th>
                </tr>
              </thead>
              <tbody>
                @for (s of lista; track s.id) {
                  @let st = status(s);
                  <tr [attr.data-sesija]="s.id">
                    <td><app-status-chip [tekst]="st" [ton]="tonovi[st]" /></td>
                    <td class="mono nowrap">{{ s.kreirano | datum: 'sa-vremenom' }}</td>
                    <td class="mono nowrap">{{ s.istice | datum: 'sa-vremenom' }}</td>
                    <td class="mono">{{ s.brojPrijava }} / {{ s.brojNaCekanju }}</td>
                    <td class="napomena">{{ s.napomena || '—' }}</td>
                    <td class="akcije">
                      <a matButton="outlined" [routerLink]="[s.id, 'qr']" data-qr>QR</a>
                      <a matButton="filled" [routerLink]="[s.id]" data-prijave>Prijave</a>
                      @if (zatvoriti(s)) {
                        <button matButton type="button" [disabled]="menja() !== null" (click)="promeni(s, false)" data-zatvori>Zatvori</button>
                      } @else {
                        <button matButton type="button" [disabled]="menja() !== null" (click)="promeni(s, true)" data-otvori>Otvori</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <app-empty-state naslov="Još nije pokrenut nijedan onboarding" ikona="qr_code_2"
            tekst="Pokreni onboarding, pokaži QR kod na projektoru i studenti će se prijaviti sa telefona." />
        }
      } @else if (!greska()) {
        <app-skeleton-rows [redovi]="3" />
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .alati { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
    .opis { margin: 0; color: var(--ink-2); }
    .sesije { width: 100%; border-collapse: collapse; font-size: 14px; }
    .sesije th { padding: 10px 12px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: 600; text-align: left; }
    .sesije td { padding: 8px 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
    .sesije tbody tr:last-child td { border-bottom: 0; }
    .nowrap { white-space: nowrap; }
    .napomena { min-width: 10ch; color: var(--ink-2); overflow-wrap: anywhere; }
    .akcije { white-space: nowrap; text-align: right; }
    .akcije > * + * { margin-left: 6px; }
    app-error-panel { display: block; margin: 0 16px; }
  `,
})
export class GrupaOnboardingTab {
  private readonly store = inject(GrupaStore);
  private readonly api = inject(OnboardingApi);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly obavestenja = inject(NotificationStore);

  protected readonly sesije = signal<OnboardingSesijaInfo[] | null>(null);
  protected readonly greska = signal<string | null>(null);
  /** Id sesije koja se zatvara/otvara (jedna promena u isto vreme). */
  protected readonly menja = signal<number | null>(null);
  protected readonly tonovi = TON_SESIJE;
  private readonly grupaId = computed(() => this.store.grupa()?.id ?? null);
  private zahtev: Subscription | null = null;

  constructor() {
    effect(() => {
      if (this.grupaId() !== null) {
        untracked(() => this.ucitaj());
      }
    });
    inject(DestroyRef).onDestroy(() => this.zahtev?.unsubscribe());
  }

  protected status(s: OnboardingSesijaInfo): StatusSesije {
    return statusSesije(s);
  }

  protected zatvoriti(s: OnboardingSesijaInfo): boolean {
    return moguceZatvoriti(s);
  }

  protected ucitaj(): void {
    const id = this.grupaId();
    if (id === null) {
      return;
    }
    this.zahtev?.unsubscribe();
    this.greska.set(null);
    this.zahtev = this.api.sesije(id, { tiho: true }).subscribe({
      next: s => this.sesije.set(sortirajSesije(s ?? [])),
      error: (e: unknown) => this.greska.set(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM),
    });
  }

  protected pokreni(): void {
    const g = this.store.grupa();
    if (!g) {
      return;
    }
    PokreniOnboardingDialog.otvori(this.dialog, { grupaId: g.id, grupaNaziv: g.naziv })
      .pipe(filter((s): s is OnboardingSesijaInfo => !!s))
      .subscribe(s => {
        this.store.osvezi();
        void this.router.navigate(['/grupe', g.id, 'onboarding', s.id, 'qr']);
      });
  }

  protected promeni(s: OnboardingSesijaInfo, aktivna: boolean): void {
    if (this.menja() !== null) {
      return;
    }
    this.menja.set(s.id);
    this.api.promeniAktivnost(s.id, { aktivna }).subscribe({
      next: () => {
        this.menja.set(null);
        this.obavestenja.uspeh(aktivna ? 'Sesija je ponovo otvorena.' : 'Sesija je zatvorena.');
        this.ucitaj();
        this.store.osvezi();
      },
      error: () => this.menja.set(null),
    });
  }
}
