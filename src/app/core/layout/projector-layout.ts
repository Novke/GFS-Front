import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Okruzenje } from './okruzenje';

/**
 * Projektorski layout (`/predavanja/:id/projektor`, `/grupe/:id/onboarding/:sid/qr`): bez ljuske, uvek svetao
 * (`.rezim-dan`), ceo ekran. Dugme "Pun ekran" i Esc su na samim stranicama.
 */
@Component({
  selector: 'app-projector-layout',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'rezim-dan' },
  template: `
    @if (okruzenje.jeStaging()) {
      <div class="traka-okruzenja">STAGING — test podaci</div>
    }
    <main class="projektor-sadrzaj">
      <router-outlet />
    </main>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; background: var(--surface); color: var(--ink); }
    .projektor-sadrzaj { padding: 24px; }
  `,
})
export class ProjectorLayout {
  protected readonly okruzenje = inject(Okruzenje);
}
