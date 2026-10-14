import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { EmptyState } from '../../../shared/ui/list-states';
import { DatumPipe } from '../../../shared/util/datum.pipe';
import { StudentStore } from '../data-access/student.store';

/**
 * Tab "Hronologija" profila (S3): aktivnosti na predavanjima, urađeni domaći i polaganja u jednoj listi, najnovije prvo
 * (spajanje i redosled su u `hronologija()`). Naslov stavke vodi na predavanje, domaći ili test. Stavka bez datuma
 * prikazuje `—` i ide na kraj.
 */
@Component({
  selector: 'app-student-hronologija-tab',
  imports: [DatumPipe, EmptyState, MatIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.hronologija().length > 0) {
      <ol class="linija" aria-label="Hronologija studenta" data-hronologija>
        @for (s of store.hronologija(); track s.kljuc) {
          <li [attr.data-tip]="s.tip">
            <span class="datum mono">{{ s.datum | datum }}</span>
            <span class="oznaka" [class.ton-info]="s.tip === 'aktivnost'" [class.ton-warn]="s.tip === 'domaci'" [class.ton-ok]="s.tip === 'test'">
              <mat-icon [svgIcon]="s.ikona" aria-hidden="true" />{{ s.oznaka }}
            </span>
            <div class="sadrzaj">
              @if (s.link; as link) {
                <a [routerLink]="link" data-veza>{{ s.naslov }}</a>
              } @else {
                <span>{{ s.naslov }}</span>
              }
              @if (s.detalj) {
                <span class="detalj">{{ s.detalj }}</span>
              }
            </div>
          </li>
        }
      </ol>
    } @else {
      <app-empty-state naslov="Još nema zabeleženog rada" ikona="history"
        tekst="Aktivnosti na predavanjima, domaći i testovi studenta pojaviće se ovde." />
    }
  `,
  styles: `
    .linija { margin: 0; padding: 0; list-style: none; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
    li { display: grid; grid-template-columns: 7.5rem 7.5rem minmax(0, 1fr); align-items: start; gap: 4px 16px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
    li:last-child { border-bottom: 0; }
    .datum { font-size: 13px; color: var(--muted); padding-top: 2px; }
    .oznaka { justify-self: start; }
    .sadrzaj { display: flex; flex-direction: column; min-width: 0; }
    .sadrzaj a { color: var(--ink); font-weight: 600; text-decoration: none; overflow-wrap: anywhere; }
    .sadrzaj a:hover { color: var(--primary); text-decoration: underline; }
    .detalj { font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
    @media (max-width: 599.98px) {
      li { grid-template-columns: auto 1fr; }
      .sadrzaj { grid-column: 1 / -1; }
      .oznaka { justify-self: end; }
    }
  `,
})
export class StudentHronologijaTab {
  protected readonly store = inject(StudentStore);
}
