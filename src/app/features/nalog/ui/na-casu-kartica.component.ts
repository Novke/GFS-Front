import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { CasPredavanje } from '../data-access/cas.models';
import { opisCasa } from '../data-access/cas.pravila';

/** "Na času si" na `/nalog` (prijavljen student, čekiran na času koji traje): predmet · dan datum · tema i "Nastavi". Bez HTTP-a. */
@Component({
  selector: 'app-na-casu-kartica',
  imports: [MatButton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="kartica" aria-labelledby="naslov-na-casu" data-na-casu-kartica>
      <h3 id="naslov-na-casu">Na času si</h3>
      <p class="opis">{{ opis() }}</p>
      <a mat-flat-button class="dugme" routerLink="/nalog/cas">Nastavi</a>
    </section>
  `,
  styles: `
    .kartica { margin: 0 0 16px; padding: 12px 16px; border: 1px solid var(--ok); border-radius: var(--radius-sm); background: var(--ok-soft); }
    h3 { margin: 0 0 4px; font-size: 16px; color: var(--ok); }
    .opis { margin: 0 0 10px; }
    .dugme { width: 100%; min-height: 48px; font-size: 16px; }
  `,
})
export class NaCasuKartica {
  readonly predavanje = input.required<CasPredavanje>();
  protected readonly opis = computed(() => opisCasa(this.predavanje()));
}
