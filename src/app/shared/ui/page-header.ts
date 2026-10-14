import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Zaglavlje stranice: naslov (`h1`), podnaslov, desno akcije (`<button akcije>` / `<div akcije>`), ispod naslova
 * opcioni chipovi konteksta detalja (`<div kontekst>`: predmet, grupa, datum, status).
 */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tekst">
      <h1>{{ naslov() }}</h1>
      @if (podnaslov()) {
        <p class="podnaslov">{{ podnaslov() }}</p>
      }
      <ng-content select="[kontekst]" />
    </div>
    <div class="akcije">
      <ng-content select="[akcije]" />
    </div>
  `,
  styles: `
    :host { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 16px; margin-bottom: 20px; }
    .tekst { flex: 1 1 280px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    h1 { overflow-wrap: anywhere; }
    .podnaslov { margin: 0; color: var(--muted); }
    .akcije { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
    .akcije:empty { display: none; }
    @media (max-width: 599.98px) { h1 { font-size: 23px; } }
  `,
})
export class PageHeader {
  readonly naslov = input.required<string>();
  readonly podnaslov = input<string | null | undefined>(null);
}
