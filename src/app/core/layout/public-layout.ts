import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Okruzenje } from './okruzenje';

/**
 * Javni layout (`/upis/:token`, student na telefonu, bez basic-auth-a): bez ljuske, uvek dnevni izgled.
 * Sme da pozove samo `assets/env.json` (oznaka STAGING); stranice ispod njega samo `api/public/upis/*`.
 * Ne injektuje nijedan store: `DashboardCountsStore` i `ReferenceStore` zovu zaključan `/api/*` (401 = dijalog za lozinku).
 */
@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet],
  // PRIVREMENO (do Task 27): stari ekrani u outletu ne javljaju promene (bez signala/markForCheck); ispod OnPush
  // roditelja ne bi se nikad osvežili. Kad nestanu, vraća se OnPush.
  // eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { class: 'rezim-dan papir' },
  template: `
    @if (okruzenje.jeStaging()) {
      <div class="traka-okruzenja">STAGING — test podaci</div>
    }
    <main class="javni-sadrzaj">
      <router-outlet />
    </main>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; color: var(--ink); }
    .javni-sadrzaj { max-width: 640px; margin: 0 auto; padding: 16px; }
  `,
})
export class PublicLayout {
  protected readonly okruzenje = inject(Okruzenje);
}
