import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RangStavka } from '../data-access/uzivo.models';
import { grupisiCifre } from './format';

/**
 * Rang-lista (mesto, ime, poeni). `istakni` je **mesto** stavke koju treba istaći (npr. `licno.mesto` studenta): mesta
 * su jedinstvena (jednaki poeni se razdvajaju vremenom), a `ucesnikId` se u javnom stanju ne šalje.
 */
@Component({
  selector: 'gfs-rang-lista',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'uz-rang' },
  template: `
    @if (stavke().length) {
      <ol class="uz-rang-lista">
        @for (s of stavke(); track s.mesto) {
          <li class="uz-rang-red" [class.uz-rang-red--istaknut]="s.mesto === istakni()"
              [attr.aria-current]="s.mesto === istakni() ? 'true' : null">
            <span class="uz-rang-mesto">{{ s.mesto }}.</span>
            <span class="uz-rang-ime">{{ s.ime }}</span>
            <span class="uz-rang-poeni">{{ poeni(s.poeni) }}</span>
          </li>
        }
      </ol>
    } @else {
      <p class="uz-prazno">Još nema poena.</p>
    }
  `,
})
export class RangListaComponent {
  readonly stavke = input<readonly RangStavka[]>([]);
  readonly istakni = input<number | null>(null);

  protected readonly poeni = grupisiCifre;
}
