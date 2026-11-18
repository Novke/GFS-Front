import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { deloviSaLinkovima } from '../util/linkovi';

/**
 * Običan tekst u kome su `http(s)://` adrese linkovi (beleške slajda, opis prezentacije). Link se otvara u novoj kartici,
 * bez `opener`-a i `Referer`-a. Ostatak teksta je tekst, a prelome redova i razmake čuva roditelj (`white-space`).
 * Posle klika mišem link pušta fokus: u konzoli bi sledeći Enter inače ponovo otvorio link umesto da ide na sledeći slajd.
 */
@Component({
  selector: 'app-tekst-sa-linkovima',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // bez razmaka između delova: svaki razmak u šablonu bio bi višak u tekstu
  template: `@for (d of delovi(); track $index) {@if (d.href) {<a class="tekst-link" [href]="d.href" target="_blank" rel="noopener noreferrer" (click)="pustiFokus($event)">{{ d.tekst }}</a>} @else {<span>{{ d.tekst }}</span>}}`,
  styles: `
    .tekst-link {
      color: var(--primary);
      text-decoration: underline;
      overflow-wrap: anywhere;
    }
    .tekst-link:hover {
      text-decoration-thickness: 2px;
    }
  `,
})
export class TekstSaLinkovima {
  readonly tekst = input<string | null>(null);

  protected readonly delovi = computed(() => deloviSaLinkovima(this.tekst()));

  protected pustiFokus(e: MouseEvent): void {
    if (e.detail > 0 && e.currentTarget instanceof HTMLElement) e.currentTarget.blur();
  }
}
