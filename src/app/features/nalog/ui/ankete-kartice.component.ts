import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { AnketaTrakeComponent } from '../../../shared/ui/anketa-trake.component';
import { AnketaStudentu } from '../data-access/ankete-studenta.models';
import { ishodRezultata, kartice, oznakaKartice } from '../data-access/ankete-studenta.pravila';
import { AnketeStudentaStore } from '../data-access/ankete-studenta.store';

/**
 * Kartice brze ankete u nalogu (spec 6.3, maketa G): na tabu Čas sve ankete studenta (prvo pokazani rezultati), na Početnoj
 * samo ankete za celu grupu. Otvorena anketa ima "Glasaj" / "Promeni glas" (otvara donji list), pokazan rezultat ishod i
 * trake. Bez anketa ništa se ne crta. Podatke drži `AnketeStudentaStore`.
 */
@Component({
  selector: 'app-ankete-kartice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnketaTrakeComponent],
  template: `
    @for (a of lista(); track a.id) {
      <section class="ak" [class.ak--rezultat]="a.rezultat && !a.otvorena" [attr.aria-labelledby]="'anketa-kartica-' + a.id"
               data-anketa-kartica [attr.data-anketa-id]="a.id">
        <p class="ak-oznaka">{{ oznaka(a) }}</p>
        <h2 class="ak-pitanje" [id]="'anketa-kartica-' + a.id">{{ a.pitanje }}</h2>
        @if (a.rezultat; as r) {
          <p class="ak-ishod" data-anketa-ishod>{{ ishod(a) }}</p>
          <app-anketa-trake [opcije]="a.opcije" [glasovi]="r.glasovi" [brojGlasalo]="r.brojGlasalo" />
        } @else {
          <p class="ak-opcije">{{ a.opcije.join(' · ') }}</p>
        }
        @if (a.otvorena) {
          <div class="ak-dno">
            @if (a.mojGlas) { <span class="ak-glasao">Glas je zabeležen ✓</span> }
            <button type="button" class="ak-dugme" [class.ak-dugme--sporedno]="!!a.mojGlas" (click)="store.otvori(a.id)" data-anketa-glasaj>
              {{ a.mojGlas ? 'Promeni glas' : 'Glasaj' }}
            </button>
          </div>
        }
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    :host:empty { display: none; }
    .ak { margin: 0 0 16px; padding: 14px 16px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
    .ak--rezultat { border-color: var(--ok); background: var(--ok-soft); }
    .ak-oznaka { margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--primary); }
    .ak--rezultat .ak-oznaka { color: var(--ok); }
    .ak-pitanje { margin: 0 0 6px; font-size: 17px; line-height: 1.3; overflow-wrap: anywhere; }
    .ak-opcije, .ak-ishod { margin: 0 0 10px; font-size: 14px; color: var(--ink-2); overflow-wrap: anywhere; }
    .ak-ishod { font-weight: 600; color: var(--ink); }
    .ak-dno { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 12px; }
    .ak-glasao { margin-right: auto; font-size: 14px; color: var(--ok); font-weight: 600; }
    .ak-dugme {
      min-height: 44px; padding: 0 20px; border: 0; border-radius: 999px; background: var(--primary); color: var(--primary-ink);
      font: inherit; font-weight: 600; cursor: pointer; touch-action: manipulation;
    }
    .ak-dugme--sporedno { border: 1px solid var(--line); background: var(--surface); color: var(--ink); }
    .ak-dugme:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
  `,
})
export class AnketeKarticeComponent {
  readonly mesto = input.required<'cas' | 'pocetna'>();

  protected readonly store = inject(AnketeStudentaStore);
  protected readonly lista = computed(() => kartice(this.store.ankete(), this.mesto()));

  protected oznaka(a: AnketaStudentu): string {
    return oznakaKartice(a);
  }

  protected ishod(a: AnketaStudentu): string | null {
    return ishodRezultata(a);
  }
}
