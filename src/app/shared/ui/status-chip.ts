import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

import { NazivIkone } from '../../core/layout/icons';

/** `uToku` je zelena tačka sa prstenom ("U toku"); ostali tonovi imaju podrazumevanu ikonu. */
export type TonStatusa = 'neutral' | 'info' | 'ok' | 'warn' | 'danger' | 'uToku';

const IKONA: Record<TonStatusa, NazivIkone | null> = {
  neutral: null,
  info: 'info',
  ok: 'check_circle',
  warn: 'schedule',
  danger: 'error',
  uToku: null,
};

/**
 * Oznaka statusa (npr. "U toku", "Završeno", "Evidentiran", "Na čekanju", "stariji"). Tekst je obavezan:
 * status se nikad ne prikazuje samo bojom (spec 3). Stilovi su globalni (`.oznaka` u `styles/_ui.scss`).
 */
@Component({
  selector: 'app-status-chip',
  imports: [MatIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="oznaka" [class]="'ton-' + (ton() === 'uToku' ? 'ok' : ton())">
      @if (ton() === 'uToku') {
        <span class="tacka" aria-hidden="true"></span>
      } @else if (ikonaPrikaz(); as i) {
        <mat-icon [svgIcon]="i" aria-hidden="true" />
      }
      {{ tekst() }}
    </span>
  `,
})
export class StatusChip {
  readonly tekst = input.required<string>();
  readonly ton = input<TonStatusa>('neutral');
  /** Druga ikona umesto podrazumevane za ton; `null` = bez ikone. */
  readonly ikona = input<NazivIkone | null | undefined>(undefined);

  protected readonly ikonaPrikaz = computed(() => {
    const i = this.ikona();
    return i === undefined ? IKONA[this.ton()] : i;
  });
}
