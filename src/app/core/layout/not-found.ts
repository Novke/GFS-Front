import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * "Stranica nije pronađena". U ljusci nudi povratak na početnu; u javnom layoutu (`javna`, iz `data` rute) nema
 * linka ka nastavničkom delu, jer bi student na telefonu dobio dijalog za lozinku.
 */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="nije-pronadjeno" aria-labelledby="naslov-404">
      <p class="kod" aria-hidden="true">404</p>
      <h1 id="naslov-404">Stranica nije pronađena</h1>
      @if (javna()) {
        <p>Proveri link koji si dobio. Ako je sa QR koda, skeniraj ga ponovo.</p>
      } @else {
        <p>Adresa ne postoji ili je stranica premeštena.</p>
        <a routerLink="/" class="na-pocetnu">Na početnu</a>
      }
    </section>
  `,
  styles: `
    .nije-pronadjeno { max-width: 520px; margin: 48px auto; text-align: center; }
    .kod { margin: 0 0 8px; font-family: var(--font-mono); font-size: 48px; font-weight: 600; color: var(--muted); }
    h1 { margin-bottom: 12px; }
    p { color: var(--ink-2); }
    .na-pocetnu { display: inline-block; margin-top: 8px; padding: 10px 16px; min-height: 44px;
      border-radius: var(--radius-sm); background: var(--primary); color: var(--primary-ink); font-weight: 600;
      text-decoration: none; }
  `,
})
export class NotFound {
  /**
   * Iz `data: { javna: true }` (withComponentInputBinding). Na ruti bez tog podatka binding upisuje `undefined`,
   * pa `booleanAttribute` svodi svaku vrednost na boolean (`undefined` -> false).
   */
  readonly javna = input(false, { transform: booleanAttribute });
}
