import {
  ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input, viewChild,
} from '@angular/core';

import {
  PreferencesStore, VELICINE_BELESKI, manjaVelicinaBeleski, vecaVelicinaBeleski,
} from '../../../core/state/preferences.store';
import { pustiFokusPosleKlika } from './precice';

/**
 * Beleške slajda sa A-/A+ (veličina je jedna postavka za konzolu i daljinski). Prelomi redova su sačuvani, dugačke
 * reči se lome, a pri promeni slajda (`kljucSlajda`) skrol se vraća na vrh.
 */
@Component({
  selector: 'app-beleske-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'uz-beleske' },
  template: `
    <div class="uz-beleske-alati" role="group" aria-label="Veličina slova beležaka">
      <button type="button" class="uz-beleske-dugme" aria-label="Manja slova beležaka" [disabled]="!mozeManje()"
              (click)="pustiFokus($event); manje()">A−</button>
      <button type="button" class="uz-beleske-dugme" aria-label="Veća slova beležaka" [disabled]="!mozeVece()"
              (click)="pustiFokus($event); vece()">A+</button>
    </div>
    <div #telo class="uz-beleske-telo" tabindex="0" role="region" aria-label="Beleške" [style.font-size.px]="velicina()">
      @if (tekst(); as t) {
        <p class="uz-beleske-tekst">{{ t }}</p>
      } @else {
        <p class="uz-prazno">{{ prazno() }}</p>
      }
    </div>
  `,
})
export class BeleskePanelComponent {
  readonly tekst = input<string | null>(null);
  readonly kljucSlajda = input<number | string | null>(null);
  readonly prazno = input('Nema beležaka za ovaj slajd.');

  private readonly postavke = inject(PreferencesStore);
  private readonly telo = viewChild.required<ElementRef<HTMLElement>>('telo');

  protected readonly velicina = this.postavke.velicinaBeleski;
  protected readonly mozeManje = computed(() => this.velicina() > VELICINE_BELESKI[0]);
  protected readonly mozeVece = computed(() => this.velicina() < VELICINE_BELESKI[VELICINE_BELESKI.length - 1]);
  protected readonly pustiFokus = pustiFokusPosleKlika;

  constructor() {
    afterRenderEffect(() => {
      this.kljucSlajda();
      this.telo().nativeElement.scrollTop = 0;
    });
  }

  protected manje(): void {
    this.postavke.postaviVelicinuBeleski(manjaVelicinaBeleski(this.velicina()));
  }

  protected vece(): void {
    this.postavke.postaviVelicinuBeleski(vecaVelicinaBeleski(this.velicina()));
  }
}
