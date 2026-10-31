import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { CekiranStudent } from '../../../core/api/cekiranje.api';
import { StatusChip } from '../../../shared/ui/status-chip';
import { formatDatum } from '../../../shared/util/datum.pipe';

/**
 * "Čekirani" na stranici predavanja (nikad na projektoru): ko se čekirao telefonom, redom čekiranja, sa vremenom, oznakom
 * "kasnio" (više od 15 min posle prvog čekiranja, računa server) i upozorenjem "isti telefon kao X" kad su se dva studenta
 * čekirala istim uređajem. Prazna lista na živom predavanju upućuje na dugme "Čekiranje".
 */
@Component({
  selector: 'app-cekirani-panel',
  imports: [StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cek" aria-labelledby="naslov-cekiranih" data-cekirani>
      <h2 id="naslov-cekiranih">Čekirani <span class="broj">{{ cekirani().length }}</span></h2>
      @if (redovi().length === 0) {
        <p class="prazno" data-prazno>Još niko se nije čekirao. Otvori „Čekiranje“ i prikaži QR na projektoru.</p>
      } @else {
        <ul class="lista">
          @for (r of redovi(); track r.studentId) {
            <li class="stavka" [attr.data-cekiran]="r.studentId">
              <span class="ime">{{ r.ime }}</span>
              <span class="vreme mono">{{ r.vreme }}</span>
              @if (r.kasnio) {
                <app-status-chip tekst="kasnio" ton="warn" data-kasnio />
              }
              @if (r.istiTelefonKao; as x) {
                <span class="isti" data-isti-telefon>isti telefon kao {{ x }}</span>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .cek { margin-top: 24px; }
    .cek h2 { font-size: 18px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    .broj { font-family: var(--font-mono); font-size: 14px; color: var(--muted); font-weight: 600; }
    .lista { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 6px 12px; }
    .stavka { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
    .ime { font-weight: 600; overflow-wrap: anywhere; }
    .vreme { color: var(--muted); font-size: 13px; }
    .isti { flex-basis: 100%; font-size: 13px; color: var(--danger-ink); }
    .prazno { font-size: 13px; color: var(--muted); }
  `,
})
export class CekiraniPanel {
  readonly cekirani = input.required<readonly CekiranStudent[]>();

  protected readonly redovi = computed(() => {
    const lista = this.cekirani();
    const imena = new Map(lista.map(c => [c.studentId, `${c.ime} ${c.prezime}`.trim()]));
    return lista.map(c => ({
      studentId: c.studentId,
      ime: imena.get(c.studentId) || c.indeks,
      vreme: formatDatum(c.vreme, 'vreme'),
      kasnio: c.kasnio,
      istiTelefonKao: c.istiTelefonKao !== null && c.istiTelefonKao !== undefined ? (imena.get(c.istiTelefonKao) ?? 'drugi student') : null,
    }));
  });
}
