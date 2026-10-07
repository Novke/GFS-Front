import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { LOCAL_ERRORS, PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { API_URL } from '../../../core/api/api-url';

/** Deo `OnboardingSesijaDetails` potreban za preusmerenje. */
interface SesijaZaPreusmerenje {
  sesija: { id: number; grupa: { id: number } };
}

/**
 * Stare rute `onboarding/:id` i `onboarding/:id/qr` (linkovi i obeleživači iz starog UI-ja) znaju samo id sesije;
 * nova putanja traži i grupu. Učita sesiju i ode na `grupe/:g/onboarding/:id[/qr]` bez zapisa u istoriji.
 */
@Component({
  selector: 'app-onboarding-preusmerenje',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="preusmerenje">
      @if (greska(); as poruka) {
        <h1>Sesija nije otvorena</h1>
        <p role="alert">{{ poruka }}</p>
        <a routerLink="/grupe">Na grupe</a>
      } @else {
        <p role="status">Otvaram sesiju upisa…</p>
      }
    </main>
  `,
  styles: `.preusmerenje { max-width: 520px; margin: 48px auto; padding: 0 16px; text-align: center; }`,
})
export class OnboardingPreusmerenje {
  protected readonly greska = signal<string | null>(null);

  constructor() {
    const route = inject(ActivatedRoute).snapshot;
    const router = inject(Router);
    const id = Number(route.paramMap.get('id'));
    const qr = route.data['qr'] === true;

    inject(HttpClient)
      .get<SesijaZaPreusmerenje>(`${API_URL}/onboarding/${id}`, { context: new HttpContext().set(LOCAL_ERRORS, true) })
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe({
        next: d => {
          const grupaId = d?.sesija?.grupa?.id;
          if (typeof grupaId !== 'number') {
            this.greska.set('Sesija nema grupu.');
            return;
          }
          const putanja = ['/grupe', grupaId, 'onboarding', id, ...(qr ? ['qr'] : [])];
          void router.navigate(putanja, { replaceUrl: true });
        },
        error: (e: unknown) => {
          if (!(e instanceof HttpErrorResponse)) {
            this.greska.set(PORUKA_SISTEM);
          } else {
            this.greska.set(e.status === 404 ? 'Sesija ne postoji.' : toApiError(e).reason);
          }
        },
      });
  }
}
