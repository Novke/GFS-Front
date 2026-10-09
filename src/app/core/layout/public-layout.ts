import { booleanAttribute, ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Okruzenje } from './okruzenje';

/**
 * Javni layout (`/upis/:token`, `/uzivo[/:kod]`; student na telefonu, bez basic-auth-a): bez ljuske, uvek dnevni izgled.
 * Sme da pozove samo `assets/env.json` (oznaka STAGING); stranice ispod njega samo `api/public/*`.
 * Ne injektuje nijedan store: `DashboardCountsStore` i `ReferenceStore` zovu zaključan `/api/*` (401 = dijalog za lozinku).
 */
@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'rezim-dan papir' },
  template: `
    @if (okruzenje.jeStaging()) {
      <div class="traka-okruzenja">STAGING — test podaci</div>
    }
    <main class="javni-sadrzaj" [class.cela-strana]="celaStrana()">
      <router-outlet />
    </main>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; color: var(--ink); }
    .javni-sadrzaj { max-width: 640px; margin: 0 auto; padding: 16px; }
    .cela-strana { max-width: none; margin: 0; padding: 0; }
  `,
})
export class PublicLayout {
  protected readonly okruzenje = inject(Okruzenje);
  /**
   * Iz `data: { celaStrana: true }` rute layouta (withComponentInputBinding): sadržaj bez okvira (širina, razmak), za
   * strane koje same crtaju ceo ekran (uživo). Bez tog podatka binding upisuje `undefined` (-> false).
   */
  readonly celaStrana = input(false, { transform: booleanAttribute });
}
