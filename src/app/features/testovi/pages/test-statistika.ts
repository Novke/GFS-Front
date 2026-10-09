import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';

import { JE_ID } from '../../../core/route-matchers';
import { Histogram, StubacHistograma } from '../../../shared/ui/histogram';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { StatTile } from '../../../shared/ui/stat-tile';
import {
  formatBroja,
  korpePoena,
  OPIS_PROLAZA,
  statistikaPoena,
  StatistikaVarijante,
  statistikaPoVarijantama,
  TestStore,
} from '../data-access/test.store';
import { TestZaglavlje } from '../ui/test-zaglavlje';
import { obrisiTestUzPotvrdu } from './obrisi-test';

const procenat = (p: number | null) => (p === null ? '—' : `${Math.round(p)} %`);

/**
 * Statistika testa (`/testovi/:id/statistika`): postojeća serverska `statistika` (broj polaganja, prosek, min, max,
 * standardna devijacija), raspodela poena (histogram, korpe po 10 % max poena; učitava se `@defer`) i tabela po
 * varijantama. Prolaz (ukupno i po varijantama) računa `jePolozio`, isto kao statistika uživo na unosu.
 */
@Component({
  selector: 'app-test-statistika',
  imports: [EmptyState, ErrorPanel, Histogram, MatButton, MatIcon, RouterLink, SkeletonRows, StatTile, TestZaglavlje],
  providers: [TestStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.test(); as t) {
      <app-test-zaglavlje [test]="t" (obrisi)="obrisi()" />

      @if (brojSaPoenima() === 0) {
        <app-empty-state ikona="bar_chart" naslov="Još nema unetih poena"
          tekst="Statistika se računa kad bar jedan ispitanik ima upisane poene.">
          <a matButton="filled" [routerLink]="['/testovi', t.id]">Unos poena</a>
        </app-empty-state>
      } @else {
        <div class="kpi" role="group" aria-label="Statistika testa">
          <app-stat-tile labela="ispitanika" [vrednost]="t.statistika?.ukupnoPolaganja ?? polaganja().length"
            [podtekst]="brojSaPoenima() + ' sa poenima'" data-kpi-ispitanika />
          <app-stat-tile labela="prosek" [vrednost]="broj(t.statistika?.prosecniPoeni ?? lokalno().prosek)"
            [podtekst]="t.maxPoena ? '/ ' + t.maxPoena : null" data-kpi-prosek />
          <app-stat-tile labela="prolaz" [vrednost]="procenat(lokalno().prolaz)" data-kpi-prolaz />
          <app-stat-tile labela="min" [vrednost]="broj(t.statistika?.minPoeni ?? lokalno().min)" />
          <app-stat-tile labela="max" [vrednost]="broj(t.statistika?.maxPoeni ?? lokalno().max)" />
          <app-stat-tile labela="std. devijacija" [vrednost]="broj(t.statistika?.standardnaDevijacija ?? null)" />
        </div>
        <p class="napomena">Prolaz: {{ opisProlaza }}.</p>

        <section class="kartica" aria-labelledby="naslov-raspodele">
          <h2 id="naslov-raspodele">Raspodela poena</h2>
          <p class="podnaslov">Broj ispitanika po opsegu poena (korak 10 % od max {{ t.maxPoena ?? '—' }}).</p>
          @defer (on viewport) {
            <app-histogram naslov="Raspodela poena" [vrednosti]="korpe()" />
          } @placeholder {
            <div class="mesto-histograma" aria-hidden="true"></div>
          } @loading (minimum 100ms) {
            <app-skeleton-rows [redovi]="3" />
          }
        </section>

        <section class="kartica" aria-labelledby="naslov-varijanti">
          <h2 id="naslov-varijanti">Po varijantama</h2>
          <div class="tabela-okvir">
            <table class="varijante">
              <caption class="sr-only">Statistika po varijantama</caption>
              <thead>
                <tr>
                  <th scope="col">Varijanta</th>
                  <th scope="col" class="broj">Ispitanika</th>
                  <th scope="col" class="broj">Prosek</th>
                  <th scope="col" class="broj">Prolaz</th>
                  <th scope="col" class="broj">Min</th>
                  <th scope="col" class="broj">Max</th>
                </tr>
              </thead>
              <tbody>
                @for (v of poVarijantama(); track v.varijanta) {
                  <tr [attr.data-varijanta]="v.varijanta ?? 'bez'">
                    <th scope="row">{{ v.varijanta ?? 'bez varijante' }}</th>
                    <td class="broj mono">{{ v.broj }}</td>
                    <td class="broj mono">{{ broj(v.prosek) }}</td>
                    <td class="broj mono">{{ procenat(v.prolaz) }}</td>
                    <td class="broj mono">{{ broj(v.min) }}</td>
                    <td class="broj mono">{{ broj(v.max) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    } @else if (store.imaGresku()) {
      <app-error-panel naslov="Test nije učitan." [poruka]="store.greska()" (ponovo)="ponovo()" />
      <a matButton routerLink="/testovi"><mat-icon svgIcon="arrow_back" aria-hidden="true" />Svi testovi</a>
    } @else {
      <app-skeleton-rows [redovi]="6" />
    }
  `,
  styles: `
    :host { display: block; }
    .kpi { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 6px; }
    .napomena, .podnaslov { margin: 0 0 12px; font-size: 13px; color: var(--muted); }
    .kartica { margin-top: 16px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
      box-shadow: var(--shadow); }
    h2 { font-size: 18px; margin: 0 0 4px; }
    .mesto-histograma { height: 238px; }
    .tabela-okvir { overflow-x: auto; }
    .varijante { width: 100%; border-collapse: collapse; font-size: 14px; }
    .varijante th, .varijante td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; }
    .varijante thead th { color: var(--muted); font-size: 12px; font-weight: 600; }
    .varijante tbody tr:last-child > * { border-bottom: 0; }
    .broj { text-align: right !important; }
    @media (max-width: 599.98px) {
      .kpi app-stat-tile { flex: 1 1 calc(33% - 10px); min-width: 0; }
      .kartica { padding: 12px; }
    }
  `,
})
export class TestStatistika {
  protected readonly store = inject(TestStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  protected readonly tId = computed(() => (JE_ID.test(this.id()) ? Number(this.id()) : null));
  protected readonly opisProlaza = OPIS_PROLAZA;
  protected readonly procenat = procenat;

  protected readonly polaganja = computed(() => this.store.test()?.polaganja ?? []);
  private readonly unosi = computed(() =>
    this.polaganja().map(p => ({ poeni: p.ostvareniPoeni ?? null, prepisivao: p.prepisivao === true })),
  );
  protected readonly lokalno = computed(() => statistikaPoena(this.unosi(), this.store.maxPoena()));
  protected readonly brojSaPoenima = computed(() => this.lokalno().broj);
  /** Stabilan ulaz histograma: menja se samo kad se promene poeni ili max. */
  protected readonly korpe = computed<StubacHistograma[]>(
    () =>
      korpePoena(
        this.unosi()
          .map(u => u.poeni)
          .filter((p): p is number => p !== null),
        this.store.maxPoena(),
      ),
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );
  protected readonly poVarijantama = computed<StatistikaVarijante[]>(() => statistikaPoVarijantama(this.polaganja(), this.store.maxPoena()));

  constructor() {
    effect(() => {
      const id = this.tId();
      if (id !== null) {
        untracked(() => this.store.ucitaj(id));
      }
    });
  }

  protected broj(n: number | null | undefined): string {
    return formatBroja(n);
  }

  protected ponovo(): void {
    const id = this.tId();
    if (id !== null) {
      this.store.ucitaj(id);
    }
  }

  protected obrisi(): void {
    obrisiTestUzPotvrdu(this.dialog, this.router, this.store);
  }

}
