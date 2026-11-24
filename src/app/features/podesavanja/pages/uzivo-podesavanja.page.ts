import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatSlideToggle } from '@angular/material/slide-toggle';

import { PageHeader } from '../../../shared/ui/page-header';
import { RanijiCrteziPodesavanje } from '../../uzivo/crtanje/ranije-podesavanje';

/**
 * Podešavanja -> Uživo (spec crtanja 5.4): „Nudi ranije crteže na slajdu”. Postavka je u ovom pregledaču (`localStorage`,
 * van `gfs.prefs.v1`, kao rang na tabli), pa se ne šalje serveru.
 */
@Component({
  selector: 'app-uzivo-podesavanja-page',
  imports: [MatSlideToggle, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header naslov="Uživo" podnaslov="Konzola izvođenja i crtanje preko slajda." />

    <section class="kartica" aria-labelledby="pu-crtanje" data-ranije-crteze>
      <h2 id="pu-crtanje">Crtanje</h2>
      <mat-slide-toggle [checked]="ranije.ukljuceno()" (change)="ranije.postavi($event.checked)" aria-describedby="pu-ranije-opis">
        Nudi ranije crteže na slajdu
      </mat-slide-toggle>
      <p class="uvod" id="pu-ranije-opis">
        Konzola na slajdu na kom si crtao u ranijem izvođenju iste prezentacije nudi te crteže („Ranije si na ovom slajdu crtao”).
        Važi za ovaj pregledač. Kad je isključeno, crteži se i dalje čuvaju i vide se u pregledu izvođenja.
      </p>
    </section>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; }
    .kartica { padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
      box-shadow: var(--shadow); min-width: 0; max-width: 720px; }
    h2 { margin: 0 0 12px; font-size: 17px; }
    .uvod { margin: 12px 0 0; color: var(--ink-2); }
  `,
})
export class UzivoPodesavanjaPage {
  protected readonly ranije = inject(RanijiCrteziPodesavanje);
}
