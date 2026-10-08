import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

export type StanjeCuvanja = 'cuva' | 'sacuvano' | 'greska';

/**
 * Status automatskog čuvanja reda (tabelarni unos, spec 4): ikona + tekst, `aria-live="polite"` na hostu (region
 * postoji i dok je prazan, da bi čitač ekrana najavio promenu). Kod greške dugme "Pokušaj ponovo" (`ponovo`).
 * `kompaktno`: tekst samo za čitač ekrana (uska kolona tabele), ikona ima `title`.
 */
@Component({
  selector: 'app-save-status',
  imports: [MatIcon, MatProgressSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-live': 'polite', '[class.kompaktno]': 'kompaktno()' },
  template: `
    @switch (stanje()) {
      @case ('cuva') {
        <mat-progress-spinner mode="indeterminate" diameter="14" aria-hidden="true" />
        <span class="tekst">Čuva se…</span>
      }
      @case ('sacuvano') {
        <mat-icon class="ok" svgIcon="check_circle" aria-hidden="true" title="Sačuvano" />
        <span class="tekst">Sačuvano</span>
      }
      @case ('greska') {
        <mat-icon class="greska" svgIcon="error" aria-hidden="true" title="Nije sačuvano" />
        <span class="tekst">Nije sačuvano</span>
        <button type="button" class="ponovo" (click)="ponovo.emit()">Pokušaj ponovo</button>
      }
    }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 6px; min-height: 20px; font-size: 12.5px; color: var(--muted); }
    .mat-icon { width: 18px; height: 18px; flex: none; }
    .ok { color: var(--ok); }
    .greska { color: var(--danger); }
    :host(.kompaktno) .tekst { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
    .ponovo { padding: 2px 6px; border: 0; border-radius: 4px; background: none; color: var(--primary); font: inherit;
      font-weight: 600; text-decoration: underline; cursor: pointer; }
  `,
})
export class SaveStatus {
  readonly stanje = input<StanjeCuvanja | null | undefined>(null);
  readonly kompaktno = input(false, { transform: booleanAttribute });
  readonly ponovo = output<void>();
}
