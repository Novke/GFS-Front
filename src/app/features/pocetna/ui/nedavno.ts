import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { NazivIkone } from '../../../core/layout/icons';
import { NedavnoStavka, NedavnoTip } from '../../../core/state/preferences.store';

const IKONE: Record<NedavnoTip, NazivIkone> = {
  predavanje: 'co_present',
  test: 'assignment',
  domaci: 'description',
  grupa: 'groups',
  student: 'person',
  predmet: 'menu_book',
};

/** P5 "Nedavno": poslednjih otvorenih detalja (lokalno, `PreferencesStore`); bez stavki kratko objašnjenje. */
@Component({
  selector: 'app-nedavno',
  imports: [MatIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="kartica" aria-labelledby="nedavno-naslov">
      <div class="zaglavlje"><h2 id="nedavno-naslov">Nedavno</h2></div>
      <div class="telo">
        @if (stavke().length > 0) {
          <ul class="lista">
            @for (s of stavke(); track s.tip + s.id) {
              <li>
                <a [routerLink]="s.url">
                  <mat-icon [svgIcon]="ikona(s.tip)" aria-hidden="true" />{{ s.naslov }}
                </a>
              </li>
            }
          </ul>
        } @else {
          <p class="prazno" data-prazno>Ovde će se pojaviti predavanja, testovi, grupe i studenti koje otvoriš.</p>
        }
      </div>
    </section>
  `,
  styles: `
    :host { display: block; }
    .kartica { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
    .zaglavlje { padding: 14px 18px; border-bottom: 1px solid var(--line); }
    h2 { font-size: 16px; }
    .telo { padding: 14px 18px; }
    .lista { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
    a { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 6px 10px; border: 1px solid var(--line);
      border-radius: var(--chip-radius, 999px); background: var(--surface); color: var(--ink); font-size: 13px; text-decoration: none; }
    a:hover { background: var(--surface-2); }
    a .mat-icon { width: 16px; height: 16px; color: var(--muted); }
    .prazno { margin: 0; color: var(--muted); }
  `,
})
export class Nedavno {
  readonly stavke = input.required<readonly NedavnoStavka[]>();

  protected ikona(tip: NedavnoTip): NazivIkone {
    return IKONE[tip];
  }
}
