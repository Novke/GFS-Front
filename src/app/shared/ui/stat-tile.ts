import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

import { NazivIkone } from '../../core/layout/icons';

/**
 * Pločica sa brojkom (G1, KPI predavanja): labela, vrednost (`null` -> `—`) i opcioni podtekst ("od 38", "prosek").
 * Vrednost je u mono fontu (spec 3: brojevi u IBM Plex Mono); labela je ispod, kao u maketi (`.kpi`).
 */
@Component({
  selector: 'app-stat-tile',
  imports: [MatIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ikona(); as i) {
      <mat-icon class="ikona" [svgIcon]="i" aria-hidden="true" />
    }
    <span class="vrednost">{{ prikaz() }}@if (podtekst()) {<span class="podtekst"> {{ podtekst() }}</span>}</span>
    <span class="labela">{{ labela() }}</span>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 2px; min-width: 104px; padding: 10px 14px;
      border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); box-shadow: var(--shadow); }
    .ikona { width: 20px; height: 20px; color: var(--muted); margin-bottom: 2px; }
    .vrednost { font-family: var(--font-mono); font-size: 22px; font-weight: 600; line-height: 1.2; color: var(--ink); }
    .podtekst { font-family: var(--font); font-size: 13px; font-weight: 500; color: var(--muted); }
    .labela { font-size: 12px; color: var(--muted); }
  `,
})
export class StatTile {
  readonly labela = input.required<string>();
  readonly vrednost = input<string | number | null | undefined>(null);
  readonly podtekst = input<string | null | undefined>(null);
  readonly ikona = input<NazivIkone | null | undefined>(null);

  protected readonly prikaz = computed(() => {
    const v = this.vrednost();
    return v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v)) ? '—' : String(v);
  });
}
