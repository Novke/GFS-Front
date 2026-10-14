import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';

import { ReferenceStore } from '../../../core/state/reference.store';
import { ChipOpcija, ChipSelect } from '../../../shared/ui/chip-select';
import { DateRangeChip, OpsegDatuma } from '../../../shared/ui/date-range-chip';
import { FilterBar } from '../../../shared/ui/filter-bar';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { Paginator } from '../../../shared/ui/paginator';
import { formatSkolskaGodina, opcijeSkolskihGodina } from '../../../shared/util/skolska-godina';
import { TestoviListaStore } from '../../../core/state/testovi-lista.store';
import { StatusTesta } from '../../../core/api/testovi.models';
import { TestoviTabela } from '../ui/testovi-tabela';

const STATUSI: readonly ChipOpcija<StatusTesta>[] = [
  { vrednost: 'za-evidentiranje', labela: 'Za evidentiranje' },
  { vrednost: 'evidentiran', labela: 'Evidentiran' },
];

const SORTOVI: Record<string, string> = {
  'datum,desc': 'datumu, najnovije prvo',
  'datum,asc': 'datumu, najstarije prvo',
  'maxPoena,desc': 'max poena, od najvećeg',
  'maxPoena,asc': 'max poena, od najmanjeg',
};

/** `1 test`, `2 testa`, `5 testova`, `21 test`, `12 testova`. */
export function brojTestova(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) {
    return `${n} test`;
  }
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) {
    return `${n} testa`;
  }
  return `${n} testova`;
}

/**
 * Lista svih testova (`/testovi`): filteri (predmet, grupa, školska godina, status, tip testa, datum), sort i strane u
 * URL-u (spec 4, Lista; spec 5, Testovi). Tip testa se bira tek kad je izabran predmet (tipovi su po predmetu).
 */
@Component({
  selector: 'app-testovi-lista',
  imports: [
    ChipSelect,
    DateRangeChip,
    EmptyState,
    ErrorPanel,
    FilterBar,
    MatButton,
    MatIcon,
    PageHeader,
    Paginator,
    RouterLink,
    SkeletonRows,
    TestoviTabela,
  ],
  providers: [TestoviListaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header naslov="Testovi" podnaslov="Kolokvijumi, testovi i popravni, svih predmeta i grupa">
      <a akcije matButton="filled" routerLink="/testovi/novo" [queryParams]="novoParametri()" data-novo>
        <mat-icon svgIcon="add" aria-hidden="true" />Nov test
      </a>
    </app-page-header>

    <section class="lista-kartica" aria-label="Lista testova" [attr.aria-busy]="store.ucitava()">
      <app-filter-bar [imaFiltera]="store.imaFiltera()" (ocisti)="store.ocistiFiltere()">
        <app-chip-select labela="Predmet" [opcije]="predmeti()" [vrednost]="filteri().predmet" (vrednostChange)="promeniPredmet($event)" />
        <app-chip-select labela="Grupa" [opcije]="grupe()" [vrednost]="filteri().grupa" (vrednostChange)="store.postaviFilter('grupa', $event)" />
        <app-chip-select labela="Školska godina" [opcije]="godine()" [vrednost]="filteri().godina"
          (vrednostChange)="store.postaviFilter('godina', $event)" />
        <app-chip-select labela="Status" [opcije]="statusi" [vrednost]="filteri().status" (vrednostChange)="store.postaviFilter('status', $event)" />
        @if (filteri().predmet !== null || filteri().tip !== null) {
          <app-chip-select labela="Tip" [opcije]="tipovi()" [vrednost]="filteri().tip" (vrednostChange)="store.postaviFilter('tip', $event)" />
        }
        <app-date-range-chip labela="Datum" [opseg]="opseg()" (opsegChange)="promeniOpseg($event)" />
      </app-filter-bar>

      @if (store.imaGresku()) {
        <app-error-panel [poruka]="store.greska()" (ponovo)="store.osvezi()" />
      }

      @if (store.stavke().length > 0) {
        <p class="lista-broj" aria-live="polite">{{ brojRezultata() }}</p>
        <app-testovi-tabela [stavke]="store.stavke()" [sort]="store.upit().sort" [punDatum]="filteri().godina === null"
          (otvori)="otvori($event)" (sortChange)="store.postaviSort($event)" />
      } @else if (store.ucitava() || store.status() === 'idle') {
        <app-skeleton-rows [redovi]="6" />
      } @else if (store.status() === 'loaded') {
        @if (store.imaFiltera()) {
          <app-empty-state naslov="Nema testova za izabrane filtere" tekst="Probaj drugu školsku godinu, predmet, grupu ili status.">
            <button matButton="outlined" type="button" data-ocisti (click)="store.ocistiFiltere()">Očisti filtere</button>
          </app-empty-state>
        } @else {
          <app-empty-state naslov="Još nema testova" ikona="assignment"
            [tekst]="'Za školsku godinu ' + skolskaGodina() + ' nema nijednog testa. Napravi prvi.'">
            <a matButton="filled" routerLink="/testovi/novo" [queryParams]="novoParametri()">
              <mat-icon svgIcon="add" aria-hidden="true" />Nov test
            </a>
          </app-empty-state>
        }
      }

      <app-paginator [ukupno]="store.ukupno()" [strana]="store.upit().strana" [velicina]="store.upit().velicina"
        (stranaChange)="store.postaviStranu($event)" (velicinaChange)="store.postaviVelicinu($event)" />
    </section>
  `,
  styles: `
    :host { display: block; }
    app-error-panel { display: block; margin: 0 16px; }
  `,
})
export class TestoviLista implements OnInit {
  protected readonly store = inject(TestoviListaStore);
  private readonly reference = inject(ReferenceStore);
  private readonly router = inject(Router);

  protected readonly statusi = STATUSI;
  protected readonly filteri = computed(() => this.store.upit().filteri);
  protected readonly opseg = computed<OpsegDatuma>(() => ({ od: this.filteri().od, do: this.filteri().do }));

  protected readonly predmeti = computed<ChipOpcija<number>[]>(() =>
    this.reference.predmeti().map(p => ({ vrednost: p.id, labela: p.naziv })),
  );
  protected readonly grupe = computed<ChipOpcija<number>[]>(() =>
    this.reference.grupe().map(g => ({ vrednost: g.id, labela: g.naziv })),
  );
  /** Aktivni tipovi izabranog predmeta (bez predmeta nema tipova; tip iz starog linka bez predmeta je `—`). */
  protected readonly tipovi = computed<ChipOpcija<number>[]>(() => {
    const p = this.filteri().predmet;
    return p === null ? [] : this.reference.tipoviTesta(p)().map(t => ({ vrednost: t.id, labela: t.naziv }));
  });
  /** Tekuća i prethodne školske godine; godina iz linka koje nema među njima se dodaje. */
  protected readonly godine = computed<ChipOpcija<number>[]>(() => {
    const opcije = opcijeSkolskihGodina(6).map(o => ({ vrednost: o.vrednost, labela: o.labela }));
    const g = this.filteri().godina;
    if (g !== null && !opcije.some(o => o.vrednost === g)) {
      opcije.push({ vrednost: g, labela: formatSkolskaGodina(g) });
      opcije.sort((a, b) => b.vrednost - a.vrednost);
    }
    return opcije;
  });

  protected readonly brojRezultata = computed(() => {
    const sort = SORTOVI[this.store.upit().sort];
    return `${brojTestova(this.store.ukupno())}${sort ? ` · sortirano po ${sort}` : ''}`;
  });

  /** "Nov test" nosi predmet i grupu koji su trenutno izabrani u filterima. */
  protected readonly novoParametri = computed(() => ({ predmet: this.filteri().predmet, grupa: this.filteri().grupa }));
  protected readonly skolskaGodina = computed(() => formatSkolskaGodina(this.filteri().godina));

  ngOnInit(): void {
    this.reference.ucitaj();
  }

  protected otvori(id: number): void {
    void this.router.navigate(['/testovi', id]);
  }

  /** Tipovi su po predmetu: promena predmeta briše izabran tip. */
  protected promeniPredmet(predmet: number | null): void {
    this.store.postaviFiltere({ predmet, tip: null });
  }

  protected promeniOpseg(o: OpsegDatuma): void {
    this.store.postaviFiltere({ od: o.od, do: o.do });
  }
}
