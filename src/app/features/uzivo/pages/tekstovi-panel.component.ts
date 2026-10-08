import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RezultatTekst } from '../data-access/uzivo.models';

/**
 * Tekstualni odgovori trenutne runde (kratak tekst), najčešći prvi, sa "Sakrij"/"Vrati" po grupi (spec 2.8): sakrivena
 * grupa se ne vidi u javnim rezultatima, a ovde ostaje precrtana.
 */
@Component({
  selector: 'gfs-tekstovi-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  host: { class: 'uz-kon-tekstovi' },
  template: `
    @if (sortirani().length) {
      <ul class="uz-kon-tekstovi-lista">
        @for (t of sortirani(); track t.kljuc) {
          <li class="uz-kon-tekst" [class.uz-kon-tekst--sakriven]="t.sakriven">
            <span class="uz-kon-tekst-sadrzaj">{{ t.tekst }}</span>
            <span class="uz-kon-tekst-broj">{{ t.broj }}</span>
            <button mat-button type="button" (click)="sakrij.emit({ kljuc: t.kljuc, sakriven: !t.sakriven })"
                    [attr.aria-label]="(t.sakriven ? 'Vrati ' : 'Sakrij ') + t.tekst">
              {{ t.sakriven ? 'Vrati' : 'Sakrij' }}
            </button>
          </li>
        }
      </ul>
    } @else {
      <p class="uz-prazno">Još nema tekstualnih odgovora.</p>
    }
  `,
})
export class TekstoviPanelComponent {
  readonly tekstovi = input<readonly RezultatTekst[]>([]);
  readonly sakrij = output<{ kljuc: string; sakriven: boolean }>();

  protected readonly sortirani = computed(() => [...this.tekstovi()].sort((a, b) => b.broj - a.broj));
}
