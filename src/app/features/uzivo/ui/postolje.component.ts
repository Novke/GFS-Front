import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RangStavka } from '../data-access/uzivo.models';
import { grupisiCifre } from './format';

/** Postolje za prva tri mesta (raspored 2-1-3); prima celu rang-listu ili samo vrh. */
@Component({
  selector: 'app-postolje',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'uz-postolje' },
  template: `
    <ol class="uz-postolje-redovi" aria-label="Pobednici">
      @for (s of raspored(); track s.mesto) {
        <li class="uz-postolje-kolona" [attr.data-mesto]="s.mesto">
          <span class="uz-postolje-ime">{{ s.ime }}</span>
          <span class="uz-postolje-poeni">{{ poeni(s.poeni) }}</span>
          <span class="uz-postolje-blok"><span class="uz-postolje-mesto">{{ s.mesto }}.</span></span>
        </li>
      }
    </ol>
  `,
})
export class PostoljeComponent {
  readonly stavke = input<readonly RangStavka[]>([]);

  /** Prva tri po mestu; vizuelni redosled (2, 1, 3) daje CSS `order`, a čitač ekrana čita 1, 2, 3. */
  protected readonly raspored = computed(() => [...this.stavke()].sort((a, b) => a.mesto - b.mesto).slice(0, 3));
  protected readonly poeni = grupisiCifre;
}
