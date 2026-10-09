import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { AgendaStavkaInfo } from '../../../core/api/pregled.api';
import { AgendaNedelje, mnozina } from '../data-access/pocetna.vreme';

/** Putanja detalja stavke agende. */
function veza(s: AgendaStavkaInfo): string[] {
  const koren = s.tip === 'PREDAVANJE' ? 'predavanja' : s.tip === 'DOMACI' ? 'domaci' : 'testovi';
  return ['/', koren, String(s.id)];
}

/**
 * P4 "Ova nedelja": ponedeljak-petak, danas istaknut (gornja linija + "danas"), testovi u boji upozorenja sa ikonom
 * (boja nije jedini znak). Na uskim ekranima dani se listaju horizontalnim skrolom, ne lome stranicu.
 */
@Component({
  selector: 'app-ova-nedelja',
  imports: [MatIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="kartica" aria-labelledby="nedelja-naslov">
      <div class="zaglavlje">
        <h2 id="nedelja-naslov">Ova nedelja</h2>
        <a routerLink="/predavanja">Sva predavanja →</a>
      </div>
      <div class="telo">
        <div class="agenda" role="list">
          @for (d of nedelja().dani; track d.iso) {
            <div class="dan" role="listitem" [class.danas]="d.jeDanas" [attr.aria-current]="d.jeDanas ? 'date' : null" [attr.data-dan]="d.iso">
              <h3>{{ d.oznaka }}@if (d.jeDanas) { · danas}</h3>
              @for (s of d.stavke; track s.tip + s.id) {
                <a class="ev" [class.test]="s.tip === 'TEST'" [routerLink]="veza(s)">
                  @if (s.tip === 'TEST') {
                    <mat-icon svgIcon="assignment" aria-hidden="true" />
                  }
                  <span>
                    {{ s.tip === 'TEST' ? (s.naslov || 'Test') : s.tip === 'DOMACI' ? (s.naslov || 'Domaći') : (s.naslov || 'Predavanje') }}<br />
                    {{ s.predmet?.naziv ?? '—' }} · {{ s.grupa?.naziv ?? '—' }}
                  </span>
                </a>
              }
            </div>
          }
        </div>
        @if (nedelja().brojVikend > 0) {
          <p class="vikend" data-vikend>Vikend: još {{ vikend() }} (nisu prikazane).</p>
        }
      </div>
    </section>
  `,
  styles: `
    :host { display: block; }
    .kartica { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
    .zaglavlje { display: flex; align-items: center; gap: 8px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
    h2 { font-size: 16px; }
    .zaglavlje a { margin-left: auto; color: var(--muted); font-size: 13px; }
    .telo { padding: 14px 18px; }
    .agenda { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
    .dan { min-height: 92px; padding: 8px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
    .dan.danas { border-color: var(--primary); box-shadow: inset 0 3px 0 var(--primary); }
    h3 { margin: 0 0 6px; color: var(--muted); font-size: 12px; font-weight: 600; }
    .dan.danas h3 { color: var(--primary); }
    .ev { display: flex; align-items: flex-start; gap: 4px; margin-bottom: 4px; padding: 4px 6px; border-radius: 4px;
      background: var(--surface-2); color: var(--ink); font-size: 12px; line-height: 1.25; text-decoration: none; overflow-wrap: anywhere; }
    .ev:hover { text-decoration: underline; }
    .ev.test { background: var(--warn-soft); color: var(--warn); font-weight: 600; }
    .ev .mat-icon { flex: none; width: 14px; height: 14px; margin-top: 1px; }
    .vikend { margin: 10px 0 0; color: var(--muted); font-size: 12.5px; }
    @media (max-width: 899.98px) {
      .telo { overflow-x: auto; }
      .agenda { grid-template-columns: repeat(5, minmax(120px, 1fr)); }
    }
  `,
})
export class OvaNedelja {
  readonly nedelja = input.required<AgendaNedelje>();

  protected veza = veza;
  protected vikend(): string {
    return mnozina(this.nedelja().brojVikend, 'stavka', 'stavke', 'stavki');
  }
}
