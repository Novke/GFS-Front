import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { JavnaRangTacnostiStavka } from '../data-access/uzivo.models';
import { prikazVremena } from '../../../core/api/rang.api';

/**
 * Rang tačnosti na projektoru (L, Shift+L; spec rang tačnosti 6): mesto, ime, tačnost u procentima, prosečno vreme i ★.
 * Server šalje najviše 10 redova i bez id-jeva; isto mesto dele redovi sa istom tačnošću, vremenom i ★.
 */
@Component({
  selector: 'app-rang-tacnosti-projektor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'uz-rang' },
  styles: `
    .uz-rang-red.uz-rt-red { grid-template-columns: 2.4em minmax(0, 1fr) auto auto auto; column-gap: 1em; }
    .uz-rt-broj { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
    .uz-rt-procenat { font-weight: 700; }
    .uz-rt-vreme { color: var(--muted); }
    .uz-rt-zvezde-znak { color: var(--star); }
  `,
  template: `
    @if (stavke().length) {
      <ol class="uz-rang-lista">
        @for (s of stavke(); track $index) {
          <li class="uz-rang-red uz-rt-red">
            <span class="uz-rang-mesto">{{ s.mesto }}.</span>
            <span class="uz-rang-ime">{{ s.ime }}</span>
            <span class="uz-rt-broj uz-rt-procenat">{{ s.procenat ?? 0 }}%</span>
            <span class="uz-rt-broj uz-rt-vreme">{{ vreme(s.prosekMs) }}</span>
            <span class="uz-rt-broj">{{ s.zvezdice }} <span class="uz-rt-zvezde-znak" aria-hidden="true">★</span><span class="uz-sr"> zvezdica</span></span>
          </li>
        }
      </ol>
    } @else {
      <p class="uz-prazno">Još nema zatvorenih pitanja sa tačnim odgovorom.</p>
    }
  `,
})
export class RangTacnostiProjektorComponent {
  readonly stavke = input<readonly JavnaRangTacnostiStavka[]>([]);
  protected readonly vreme = prikazVremena;
}
