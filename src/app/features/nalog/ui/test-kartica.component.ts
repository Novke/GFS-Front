import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { TestoviStudentaApi } from '../data-access/testovi-studenta.api';
import { TestNaNalogu } from '../data-access/testovi-studenta.models';
import { KARTICA_TESTA_MS, opisFaze } from '../data-access/testovi-studenta.pravila';

/**
 * Kartica „Test je otvoren · Uđi“ na Početnoj i tabu Čas (online testovi, plan 6): sama pita `GET api/public/nalog/testovi`
 * na 20 s dok je strana vidljiva (i odmah kad se vrati u prvi plan). Bez otvorenog testa ne crta ništa; greške ćute (sledeći
 * upit redovno).
 */
@Component({
  selector: 'app-test-kartica',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (t of testovi(); track t.testId) {
      <section class="tk" [attr.aria-labelledby]="'test-kartica-' + t.testId" data-test-kartica [attr.data-test-id]="t.testId">
        <p class="tk-oznaka">{{ opis(t) }}</p>
        <h2 class="tk-naslov" [id]="'test-kartica-' + t.testId">{{ t.naziv }}</h2>
        <p class="tk-opis">{{ t.predmet }} · {{ t.trajanjeMin }} min</p>
        <div class="tk-dno">
          <a class="tk-dugme" [routerLink]="['/nalog/test', t.testId]" data-test-udji>
            {{ t.faza === 'ULAZ' ? 'Uđi' : t.faza === 'PREDATO' ? 'Pogledaj' : 'Nastavi' }}
          </a>
        </div>
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .tk { margin: 0 0 16px; padding: 14px 16px; border: 2px solid var(--primary); border-radius: var(--radius-sm); background: var(--primary-soft); }
    .tk-oznaka { margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--primary); }
    .tk-naslov { margin: 0 0 4px; font-size: 17px; overflow-wrap: anywhere; }
    .tk-opis { margin: 0; font-size: 14px; color: var(--ink-2); }
    .tk-dno { display: flex; justify-content: flex-end; margin-top: 10px; }
    .tk-dugme { display: inline-flex; align-items: center; min-height: 44px; padding: 0 20px; border-radius: 999px; background: var(--primary);
      color: var(--primary-ink); font-weight: 700; text-decoration: none; }
    .tk-dugme:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
  `,
})
export class TestKarticaComponent {
  private readonly api = inject(TestoviStudentaApi);
  private readonly dokument = inject(DOCUMENT);
  protected readonly testovi = signal<TestNaNalogu[]>([]);
  protected readonly opis = (t: TestNaNalogu) => (t.faza === 'ULAZ' ? 'Test je otvoren' : opisFaze(t.faza));
  private zahtev: Subscription | null = null;

  constructor() {
    const upit = () => {
      if (this.dokument.visibilityState === 'hidden' || (this.zahtev && !this.zahtev.closed)) return;
      this.zahtev = this.api.testovi().subscribe({
        next: l => this.testovi.set((l ?? []).filter(t => t.faza !== 'ZAVRSEN')),
        error: () => undefined,
      });
    };
    const slusalac = () => upit();
    const tajmer = setInterval(upit, KARTICA_TESTA_MS);
    this.dokument.addEventListener('visibilitychange', slusalac);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tajmer);
      this.dokument.removeEventListener('visibilitychange', slusalac);
      this.zahtev?.unsubscribe();
    });
    upit();
  }
}
