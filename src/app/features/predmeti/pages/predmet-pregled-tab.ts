import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { StatTile } from '../../../shared/ui/stat-tile';
import { formatDatum, parseDatum } from '../../../shared/util/datum.pipe';
import { formatSkolskaGodina } from '../../../shared/util/skolska-godina';
import { PredmetStore } from '../data-access/predmet.store';
import { StavkaLinije, vremenskaLinija } from '../data-access/predmeti.models';

const MESECI = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];

export interface MesecLinije {
  kljuc: string;
  naslov: string;
  stavke: StavkaLinije[];
}

/** Stavke linije po mesecima (redosled ostaje); bez datuma u poslednjoj grupi "Bez datuma". */
export function poMesecima(stavke: readonly StavkaLinije[]): MesecLinije[] {
  const meseci: MesecLinije[] = [];
  for (const s of stavke) {
    const d = parseDatum(s.datum);
    const kljuc = d ? `${d.getFullYear()}-${d.getMonth()}` : 'bez-datuma';
    let m = meseci.at(-1);
    if (!m || m.kljuc !== kljuc) {
      m = { kljuc, naslov: d ? `${MESECI[d.getMonth()]} ${d.getFullYear()}.` : 'Bez datuma', stavke: [] };
      meseci.push(m);
    }
    m.stavke.push(s);
  }
  return meseci;
}

const VRSTA: Record<StavkaLinije['tip'], string> = { predavanje: 'Predavanje', domaci: 'Domaći', test: 'Test' };

/**
 * Tab Pregled huba (H1): brojke godine i vremenska linija semestra (predavanja sa temama, domaći, testovi po datumu,
 * sa ikonom i nazivom vrste, ne samo bojom). Izabrana grupa sužava liniju na svoju nastavu.
 */
@Component({
  selector: 'app-predmet-pregled-tab',
  imports: [EmptyState, ErrorPanel, MatIcon, RouterLink, SkeletonRows, StatTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (store.statusNastave()) {
      @case ('loaded') {
        <div class="brojke" data-brojke>
          <app-stat-tile labela="Predavanja" ikona="co_present" [vrednost]="broj().predavanje" />
          <app-stat-tile labela="Domaći" ikona="description" [vrednost]="broj().domaci" />
          <app-stat-tile labela="Testovi" ikona="assignment" [vrednost]="broj().test" />
        </div>
        @if (linija().length === 0) {
          <app-empty-state [naslov]="'Nema nastave u školskoj godini ' + godina()" ikona="event"
            tekst="Predavanja, domaći i testovi predmeta pojaviće se ovde po datumu." />
        } @else {
          <section class="linija" aria-label="Vremenska linija">
            @for (m of meseci(); track m.kljuc) {
              <h2 class="mesec">{{ m.naslov }}</h2>
              <ol>
                @for (s of m.stavke; track s.tip + s.id) {
                  <li [attr.data-stavka]="s.tip + '-' + s.id">
                    <span class="datum mono">{{ datum(s.datum) }}</span>
                    <span class="ikona" [class.test]="s.tip === 'test'"><mat-icon [svgIcon]="s.ikona" aria-hidden="true" /></span>
                    <span class="sadrzaj">
                      <span class="vrsta">{{ vrsta[s.tip] }}</span>
                      <a [routerLink]="s.url">{{ s.naslov }}</a>
                    </span>
                    @if (s.grupa) {
                      <span class="oznaka grupa">{{ s.grupa.naziv }}</span>
                    }
                  </li>
                }
              </ol>
            }
          </section>
        }
      }
      @case ('error') {
        <app-error-panel naslov="Nastava predmeta nije učitana." [poruka]="store.greskaNastave()" (ponovo)="store.osveziNastavu()" />
      }
      @default {
        <app-skeleton-rows [redovi]="6" />
      }
    }
  `,
  styles: `
    :host { display: block; }
    .brojke { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
    .linija { padding: 8px 16px 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
    .mesec { margin: 12px 0 4px; color: var(--muted); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
    ol { margin: 0; padding: 0; list-style: none; }
    li { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 6px 0; border-bottom: 1px solid var(--line); }
    li:last-child { border-bottom: 0; }
    .datum { flex: 0 0 64px; color: var(--muted); font-size: 13px; white-space: nowrap; }
    .ikona { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%;
      background: var(--surface-2); color: var(--ink-2); }
    .ikona.test { background: var(--primary-soft); color: var(--primary-soft-ink); }
    .ikona .mat-icon { width: 18px; height: 18px; }
    .sadrzaj { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
    .vrsta { color: var(--muted); font-size: 12px; }
    .sadrzaj a { color: var(--ink); font-weight: 600; text-decoration: none; overflow-wrap: anywhere; }
    .sadrzaj a:hover { color: var(--primary); text-decoration: underline; }
    .grupa { flex: none; }
    @media (max-width: 599.98px) {
      .brojke > * { flex: 1 1 90px; }
      li { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 2px 10px; align-items: start; }
      .ikona { grid-column: 1; grid-row: 1 / span 2; }
      .sadrzaj { grid-column: 2; grid-row: 1; }
      .datum { grid-column: 3; grid-row: 1; padding-top: 2px; }
      .grupa { grid-column: 2; grid-row: 2; justify-self: start; }
    }
  `,
})
export class PredmetPregledTab {
  protected readonly store = inject(PredmetStore);
  protected readonly vrsta = VRSTA;
  /** Mesec i godina su u naslovu grupe, pa je ovde dovoljan dan i mesec. */
  protected readonly datum = (d: string | null) => formatDatum(d, 'kratko');
  protected readonly godina = computed(() => formatSkolskaGodina(this.store.godina()));
  protected readonly linija = computed(() => {
    const n = this.store.nastava();
    return n ? vremenskaLinija(n, this.store.grupa()) : [];
  });
  protected readonly meseci = computed(() => poMesecima(this.linija()));
  protected readonly broj = computed(() => {
    const b = { predavanje: 0, domaci: 0, test: 0 };
    for (const s of this.linija()) {
      b[s.tip]++;
    }
    return b;
  });
}
