import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { trake } from '../data-access/ankete.pravila';

/**
 * Trake rezultata ankete (panel nastavnika i projektor): po odgovoru tekst, broj i traka; pobednik (jedini sa najviše
 * glasova) je zelen. Udeo je od broja studenata koji su glasali, pa za više odgovora zbir prelazi 100 %. Čitač ekrana dobija
 * jedan red teksta po odgovoru, trake su ukras.
 */
@Component({
  selector: 'app-anketa-trake',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'at', '[class.at--projektor]': 'projektor()' },
  template: `
    <ul class="at-lista">
      @for (t of redovi(); track $index) {
        <li class="at-red" [class.at-red--pobednik]="t.pobednik" data-traka-ankete [attr.data-pobednik]="t.pobednik || null">
          <span class="at-tekst">
            <span class="at-odgovor">{{ t.tekst }}</span>
            <span class="at-broj">{{ t.broj }}<span class="at-sr"> ({{ t.procenat }} %)</span></span>
          </span>
          <span class="at-pozadina" aria-hidden="true"><span class="at-puno" [style.width.%]="t.udeo * 100"></span></span>
        </li>
      }
    </ul>
  `,
  styles: `
    :host { display: block; }
    .at-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .at-tekst { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 5px; font-size: 15px; color: var(--ink); }
    .at-odgovor { min-width: 0; overflow-wrap: anywhere; }
    .at-broj { flex: none; font-weight: 700; font-variant-numeric: tabular-nums; }
    .at-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .at-pozadina { display: block; height: 12px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
    .at-puno { display: block; height: 100%; min-width: 2px; border-radius: 999px; background: var(--primary); transition: width .4s ease; }
    .at-red--pobednik .at-puno { background: var(--ok); }
    .at-red--pobednik .at-broj { color: var(--ok); }
    :host(.at--projektor) .at-lista { gap: 1.4em; }
    :host(.at--projektor) .at-tekst { font-size: 1em; margin-bottom: .35em; }
    :host(.at--projektor) .at-pozadina { height: .7em; }
    @media (prefers-reduced-motion: reduce) { .at-puno { transition: none; } }
  `,
})
export class AnketaTrakeComponent {
  readonly opcije = input.required<readonly string[]>();
  readonly glasovi = input.required<readonly number[]>();
  readonly brojGlasalo = input.required<number>();
  /** Veći razmaci i veličina iz roditelja (`font-size` projektora). */
  readonly projektor = input(false);

  protected readonly redovi = computed(() => trake(this.opcije(), this.glasovi(), this.brojGlasalo()));
}
