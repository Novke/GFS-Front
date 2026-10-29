import { booleanAttribute, ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Okruzenje } from './okruzenje';
import { RezimProjektora } from './rezim-projektora';

/**
 * Projektorski layout (`/predavanja/:id/projektor`, `/grupe/:id/onboarding/:sid/qr`, `/izvodjenja/:id/publika|konzola|daljinski`):
 * bez ljuske, ceo ekran, uvek svetao (`.rezim-dan`), osim kad ruta traži `pratiRezim` (daljinski: telefon u zamračenoj
 * sali prati dan/noć aplikacije) ili stranica privremeno to ne zatraži ({@link RezimProjektora}: završni ekran konzole).
 * Dugme "Pun ekran" i Esc su na samim stranicama.
 */
@Component({
  selector: 'app-projector-layout',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.rezim-dan]': '!pratiRezim() && !rezim.pratiRezim()' },
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
  protected readonly rezim = inject(RezimProjektora);
  /**
   * Iz `data: { celaStrana: true }` rute layouta (withComponentInputBinding): sadržaj bez okvira (širina, razmak), za
   * strane koje same crtaju ceo ekran (uživo). Bez tog podatka binding upisuje `undefined` (-> false).
   */
  readonly celaStrana = input(false, { transform: booleanAttribute });
  /** Iz `data: { pratiRezim: true }`: bez `.rezim-dan`, pa važi režim aplikacije (dan/noć/sistem). */
  readonly pratiRezim = input(false, { transform: booleanAttribute });
}
