import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { EmptyState, SkeletonRows } from '../../../shared/ui/list-states';
import { OcenePregled } from '../../ocene/ui/ocene-pregled';
import { PredmetStore } from '../data-access/predmet.store';

/**
 * Tab Ocene huba (H2): isti sadržaj kao `/ocene?predmet&grupa` za predmet huba i grupu iz zaglavlja. Bez izabrane grupe
 * nudi grupe sa nastavom u godini (link menja `?grupa=` huba, pa ga dele i ostali tabovi).
 */
@Component({
  selector: 'app-predmet-ocene-tab',
  imports: [EmptyState, MatButton, OcenePregled, RouterLink, SkeletonRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (predmetId(); as pid) {
      @if (store.grupa(); as gid) {
        <app-ocene-pregled [predmetId]="pid" [grupaId]="gid" />
      } @else {
        <app-empty-state naslov="Izaberi grupu" ikona="groups" tekst="Predlog ocena se računa za jednu grupu. Izaberi je u zaglavlju ili ovde.">
          @if (store.statusNastave() === 'loaded') {
            <div class="grupe">
              @for (g of store.grupe(); track g.id) {
                <a matButton="outlined" [routerLink]="[]" [queryParams]="{ grupa: g.id }" queryParamsHandling="merge" [attr.data-grupa]="g.id">{{ g.naziv }}</a>
              }
            </div>
          }
        </app-empty-state>
      }
    } @else {
      <app-skeleton-rows [redovi]="6" />
    }
  `,
  styles: `
    :host { display: block; }
    .grupe { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
  `,
})
export class PredmetOceneTab {
  protected readonly store = inject(PredmetStore);
  protected readonly predmetId = computed(() => this.store.id());
}
