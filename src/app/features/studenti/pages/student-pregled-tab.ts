import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';

import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { StudentStore } from '../data-access/student.store';
import { PredmetKartica } from '../ui/predmet-kartica';

/** Tab "Pregled" profila (S2): kartica po predmetu; učitava se kad se tab otvori. */
@Component({
  selector: 'app-student-pregled-tab',
  imports: [EmptyState, ErrorPanel, PredmetKartica, SkeletonRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.kartice(); as kartice) {
      @if (kartice.length > 0) {
        <div class="kartice" data-kartice>
          @for (k of kartice; track k.predmet.id) {
            <app-predmet-kartica [kartica]="k" [studentId]="store.id() ?? 0" />
          }
        </div>
      } @else {
        <app-empty-state naslov="Nema podataka po predmetima" ikona="school"
          tekst="Student nema grupu ni zabeleženu aktivnost, pa nema šta da se prikaže po predmetu." />
      }
    } @else if (store.karticeStatus() === 'error') {
      <app-error-panel [poruka]="store.karticeGreska()" (ponovo)="store.ucitajKartice(true)" />
    } @else {
      <app-skeleton-rows [redovi]="3" />
    }
  `,
  styles: `
    .kartice { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 16px; }
  `,
})
export class StudentPregledTab {
  protected readonly store = inject(StudentStore);

  constructor() {
    // učitava se kad je deo `idle`: pri otvaranju taba, posle promene studenta i posle otkazanog zahteva
    effect(() => {
      this.store.id();
      if (this.store.karticeStatus() === 'idle') {
        untracked(() => this.store.ucitajKartice());
      }
    });
  }
}
