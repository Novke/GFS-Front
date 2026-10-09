import { booleanAttribute, ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Okruzenje } from './okruzenje';

/**
 * Projektorski layout (`/predavanja/:id/projektor`, `/grupe/:id/onboarding/:sid/qr`, `/izvodjenja/:id/publika|konzola`): bez ljuske, uvek svetao
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
    <main class="projektor-sadrzaj" [class.cela-strana]="celaStrana()">
      <router-outlet />
    </main>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; background: var(--surface); color: var(--ink); }
    .projektor-sadrzaj { padding: 24px; }
    .cela-strana { max-width: none; margin: 0; padding: 0; }
  `,
})
export class ProjectorLayout {
  protected readonly okruzenje = inject(Okruzenje);
  /**
   * Iz `data: { celaStrana: true }` rute layouta (withComponentInputBinding): sadržaj bez okvira (širina, razmak), za
   * strane koje same crtaju ceo ekran (uživo). Bez tog podatka binding upisuje `undefined` (-> false).
   */
  readonly celaStrana = input(false, { transform: booleanAttribute });
}
