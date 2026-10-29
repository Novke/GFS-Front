import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { RasporedTablaInfo, TerminKratkoInfo } from '../../../core/api/pregled.api';
import { blokVremena, danIDatum, isoDatum } from '../../../shared/util/termin';

/**
 * "Raspored, narednih 7 dana" na Početnoj (spec najave odsustva, odeljak 8): termini od danas sa brojem najava odsustva
 * (bez imena; imena su na stranici termina), otkazani i predavanje tog dana; veza "Svi termini". Prikazuje se kad ima
 * termina ili kad neki raspored pokriva danas. Bez HTTP-a (podaci su deo kontrolne table).
 */
@Component({
  selector: 'app-raspored-kartica',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="kartica" aria-labelledby="raspored-naslov" data-raspored-kartica>
      <div class="zaglavlje">
        <h2 id="raspored-naslov">Raspored, narednih 7 dana</h2>
        <a class="ide" routerLink="/raspored/termini">Svi termini</a>
      </div>
      @if (raspored().naredni.length === 0) {
        <p class="prazno">Narednih 7 dana nema časova po rasporedu.</p>
      } @else {
        <ul class="termini">
          @for (t of raspored().naredni; track t.stavkaId + ':' + t.datum) {
            <li [class.otkazan]="t.otkazan" [attr.data-termin]="t.stavkaId + ':' + t.datum">
              <div class="kad">{{ dan(t) }}<span class="vreme">{{ blok(t) }}</span></div>
              <div class="sta">
                <span class="naziv">{{ t.predmet.naziv }} · {{ t.grupa?.naziv ?? '—' }}</span>
                @if (t.otkazan) {
                  <span class="oznaka opasnost">otkazano</span>
                }
                @if (t.brojNajava > 0) {
                  <a class="oznaka upozorenje" [routerLink]="['/raspored/termini']" [queryParams]="{ od: t.datum }"
                     data-najave>ne dolazi: {{ t.brojNajava }}<span class="sr-only"> — {{ t.predmet.naziv }}, {{ dan(t) }}</span></a>
                }
                @if (t.predavanjeId) {
                  <a class="ide" [routerLink]="['/predavanja', t.predavanjeId]">Predavanje<span class="sr-only"> — {{ t.predmet.naziv }}, {{ dan(t) }}</span></a>
                }
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .kartica { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
    .zaglavlje { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 18px;
      border-bottom: 1px solid var(--line); }
    h2 { font-size: 16px; }
    .prazno { margin: 0; padding: 14px 18px; color: var(--muted); font-size: 14px; }
    .termini { margin: 0; padding: 4px 18px; list-style: none; }
    li { display: flex; flex-wrap: wrap; gap: 2px 12px; padding: 9px 0; border-bottom: 1px solid var(--line); }
    li:last-child { border-bottom: 0; }
    .kad { flex: 0 0 150px; font-size: 13px; color: var(--ink-2); }
    .vreme { display: block; font-family: var(--font-mono); font-weight: 600; color: var(--ink); }
    .sta { flex: 1 1 200px; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
    .naziv { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
    .otkazan .naziv, .otkazan .vreme { text-decoration: line-through; color: var(--muted); }
    .oznaka { padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; text-decoration: none; }
    .opasnost { background: var(--danger-soft); color: var(--danger); }
    .upozorenje { background: var(--warn-soft); color: var(--warn); }
    .ide { color: var(--primary); font-size: 13px; font-weight: 600; text-decoration: none; }
    .ide:hover, a.oznaka:hover { text-decoration: underline; }
  `,
})
export class RasporedKartica {
  readonly raspored = input.required<RasporedTablaInfo>();
  /** Trenutak za "danas" (roditelj daje jedan sat za ceo ekran). */
  readonly sada = input.required<Date>();

  private readonly danas = computed(() => isoDatum(this.sada()));

  protected dan(t: TerminKratkoInfo): string {
    return t.datum === this.danas() ? `danas, ${danIDatum(t.datum)}` : danIDatum(t.datum);
  }

  protected blok(t: TerminKratkoInfo): string {
    return blokVremena(t.pocetak, t.kraj);
  }
}
