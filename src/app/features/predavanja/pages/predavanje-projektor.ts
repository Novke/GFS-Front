import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DOCUMENT, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { catchError, filter, map, of, startWith, switchMap, timer } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { JE_ID } from '../../../core/route-matchers';
import { PredavanjaApi } from '../data-access/predavanja.api';
import { PredavanjeDetails } from '../data-access/predavanja.models';

/** Projektor osvežava broj prisutnih na 10 s (samo dok je tab vidljiv). */
export const OSVEZAVANJE_MS = 10_000;

type Ucitano = { tip: 'ok'; p: PredavanjeDetails } | { tip: 'greska'; poruka: string } | { tip: 'ucitava' };

/**
 * Projektorski režim predavanja (`/predavanja/:id/projektor`, `ProjectorLayout` bez ljuske, uvek svetao): tema,
 * "Predavanje N · Predmet · Grupa" i veliki broj prisutnih, bez ličnih podataka. "Pun ekran" (Fullscreen API);
 * Esc van punog ekrana vraća na predavanje.
 */
@Component({
  selector: 'app-predavanje-projektor',
  imports: [MatButton, MatIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'esc()',
    '(document:fullscreenchange)': 'punEkran.set(!!dokument.fullscreenElement)',
  },
  template: `
    <div class="alati">
      <a matButton [routerLink]="['/predavanja', id()]"><mat-icon svgIcon="arrow_back" aria-hidden="true" />Nazad na predavanje</a>
      <button matButton="outlined" type="button" data-pun-ekran (click)="prebaciPunEkran()">
        <mat-icon svgIcon="fullscreen" aria-hidden="true" />{{ punEkran() ? 'Izađi iz punog ekrana' : 'Pun ekran' }}
      </button>
    </div>
    @switch (stanje().tip) {
      @case ('ok') {
        @if (predavanje(); as p) {
          <section class="sadrzaj" aria-live="polite">
            <p class="kontekst">{{ kontekst() }}</p>
            <h1 class="tema">{{ p.tema?.trim() || 'Predavanje ' + p.rb }}</h1>
            <div class="broj" data-prisutnih>
              <span class="vrednost">{{ brojPrisutnih() }}</span>
              <span class="labela">prisutno</span>
            </div>
          </section>
        }
      }
      @case ('greska') {
        <p class="poruka" role="alert">{{ greska() }}</p>
      }
      @default {
        <p class="poruka" role="status">Učitavanje…</p>
      }
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: calc(100dvh - 48px); }
    .alati { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
    .sadrzaj { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center; }
    .kontekst { margin: 0; font-size: clamp(22px, 3vw, 36px); color: var(--ink-2); }
    .tema { margin: 0; font-size: clamp(36px, 6vw, 80px); line-height: 1.1; overflow-wrap: anywhere; }
    .broj { display: flex; flex-direction: column; align-items: center; margin-top: 24px; }
    .vrednost { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-weight: 700; font-size: clamp(96px, 18vw, 240px); line-height: 1; color: var(--primary); }
    .labela { font-size: clamp(28px, 3vw, 40px); color: var(--muted); }
    .poruka { margin: auto; font-size: 32px; color: var(--ink-2); text-align: center; }
  `,
})
export class PredavanjeProjektor {
  private readonly api = inject(PredavanjaApi);
  private readonly router = inject(Router);
  protected readonly dokument = inject(DOCUMENT);

  readonly id = input.required<string>();
  protected readonly punEkran = signal(false);

  private readonly pId = computed(() => (JE_ID.test(this.id()) ? Number(this.id()) : null));

  /** Poslednji uspešan odgovor ostaje na ekranu i kad jedno osvežavanje ne uspe. */
  private poslednji: PredavanjeDetails | null = null;

  protected readonly stanje = toSignal(
    toObservable(this.pId).pipe(
      switchMap(id => {
        this.poslednji = null;
        if (id === null) {
          return of<Ucitano>({ tip: 'greska', poruka: 'Predavanje ne postoji.' });
        }
        return timer(0, OSVEZAVANJE_MS).pipe(
          filter((_, i) => i === 0 || !this.dokument.hidden),
          switchMap(() =>
            this.api.get(id, { tiho: true }).pipe(
              map((p): Ucitano => {
                this.poslednji = p;
                return { tip: 'ok', p };
              }),
              catchError((e: unknown) =>
                of<Ucitano>(
                  this.poslednji
                    ? { tip: 'ok', p: this.poslednji }
                    : { tip: 'greska', poruka: e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM },
                ),
              ),
            ),
          ),
          startWith<Ucitano>({ tip: 'ucitava' }),
        );
      }),
    ),
    { initialValue: { tip: 'ucitava' } as Ucitano },
  );

  protected readonly predavanje = computed(() => {
    const s = this.stanje();
    return s.tip === 'ok' ? s.p : null;
  });
  protected readonly greska = computed(() => {
    const s = this.stanje();
    return s.tip === 'greska' ? s.poruka : null;
  });
  /** Svi različiti studenti sa aktivnošću (i stariji); bez imena. */
  protected readonly brojPrisutnih = computed(() => new Set((this.predavanje()?.aktivnosti ?? []).map(a => a.student?.id)).size);
  protected readonly kontekst = computed(() => {
    const p = this.predavanje();
    return p ? [`Predavanje ${p.rb}`, p.predmet?.naziv, p.grupa?.naziv].filter(Boolean).join(' · ') : '';
  });

  protected prebaciPunEkran(): void {
    if (this.dokument.fullscreenElement) {
      void this.dokument.exitFullscreen?.();
    } else {
      void this.dokument.documentElement.requestFullscreen?.().catch(() => undefined);
    }
  }

  protected esc(): void {
    if (!this.dokument.fullscreenElement && this.pId() !== null) {
      void this.router.navigate(['/predavanja', this.pId()]);
    }
  }
}
