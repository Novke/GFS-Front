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
import { DomaciListaStore } from '../../../core/state/domaci-lista.store';
import { StatusDomaceg } from '../../../core/api/domaci.models';
import { DomaciTabela } from '../ui/domaci-tabela';

const STATUSI: readonly ChipOpcija<StatusDomaceg>[] = [
  { vrednost: 'za-pregled', labela: 'Za pregled' },
  { vrednost: 'pregledan', labela: 'Pregledan' },
];

const SORTOVI: Record<string, string> = {
  'datum,desc': 'datumu, najnovije prvo',
  'datum,asc': 'datumu, najstarije prvo',
  'naslov,asc': 'naslovu, A–Ž',
  'naslov,desc': 'naslovu, Ž–A',
};

/** `1 domaći`, `2 domaća`, `5 domaćih`, `21 domaći`, `12 domaćih`. */
export function brojDomacih(n: number): string {
  const poslednja = n % 10;
  const poslednjeDve = n % 100;
  if (poslednja === 1 && poslednjeDve !== 11) {
    return `${n} domaći`;
  }
  if (poslednja >= 2 && poslednja <= 4 && (poslednjeDve < 12 || poslednjeDve > 14)) {
    return `${n} domaća`;
  }
  return `${n} domaćih`;
}

/** Lista svih domaćih (`/domaci`): filteri, sort i strane u URL-u (spec 4, Lista; spec 5, Domaći). */
@Component({
  selector: 'app-domaci-lista',
  imports: [
    ChipSelect,
    DateRangeChip,
    DomaciTabela,
    EmptyState,
    ErrorPanel,
    FilterBar,
    MatButton,
    MatIcon,
    PageHeader,
    Paginator,
    RouterLink,
    SkeletonRows,
  ],
  providers: [DomaciListaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './domaci-lista.html',
  styleUrl: './domaci-lista.scss',
})
export class DomaciLista implements OnInit {
  protected readonly store = inject(DomaciListaStore);
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
  /** Tekuća i prethodne školske godine; godina iz linka koje nema među njima se dodaje, da chip ne pokazuje `—`. */
  protected readonly godine = computed<ChipOpcija<number>[]>(() => {
    const opcije = opcijeSkolskihGodina(6).map(o => ({ vrednost: o.vrednost, labela: o.labela }));
    const g = this.filteri().godina;
    if (g !== null && !opcije.some(o => o.vrednost === g)) {
      opcije.push({ vrednost: g, labela: formatSkolskaGodina(g) });
      opcije.sort((a, b) => b.vrednost - a.vrednost);
    }
    return opcije;
  });

  /** Podnaslov rezultata: `12 domaćih · sortirano po datumu, najnovije prvo`. */
  protected readonly brojRezultata = computed(() => {
    const sort = SORTOVI[this.store.upit().sort];
    return `${brojDomacih(this.store.ukupno())}${sort ? ` · sortirano po ${sort}` : ''}`;
  });

  /** "Nov domaći" nosi predmet i grupu koji su trenutno izabrani u filterima. */
  protected readonly noviParametri = computed(() => ({ predmet: this.filteri().predmet, grupa: this.filteri().grupa }));

  protected readonly skolskaGodina = computed(() => formatSkolskaGodina(this.filteri().godina));

  ngOnInit(): void {
    this.reference.ucitaj();
  }

  protected otvori(id: number): void {
    void this.router.navigate(['/domaci', id]);
  }

  protected promeniOpseg(o: OpsegDatuma): void {
    this.store.postaviFiltere({ od: o.od, do: o.do });
  }

  /** `FilterBar` već čeka 300 ms, pa ide direktno (bez drugog debounce-a u store-u). */
  protected promeniPretragu(q: string | null): void {
    this.store.postaviFiltere({ q });
  }
}
