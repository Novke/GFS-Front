import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { signalStore } from '@ngrx/signals';

import { JE_ID } from '../../../core/route-matchers';
import { ReferenceStore } from '../../../core/state/reference.store';
import { ChipOpcija, ChipSelect } from '../../../shared/ui/chip-select';
import { FilterBar } from '../../../shared/ui/filter-bar';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { Paginator } from '../../../shared/ui/paginator';
import { formatSkolskaGodina } from '../../../shared/util/skolska-godina';
import { StatusDomaceg } from '../../domaci/data-access/domaci.models';
import { withListaDomacih } from '../../domaci/data-access/domaci-lista.store';
import { DomaciTabela } from '../../domaci/ui/domaci-tabela';
import { StatusPredavanja } from '../../predavanja/data-access/predavanja.models';
import { withListaPredavanja } from '../../predavanja/data-access/predavanja-lista.store';
import { PredavanjaTabela } from '../../predavanja/ui/predavanja-tabela';
import { StatusTesta } from '../../testovi/data-access/testovi.models';
import { withListaTestova } from '../../testovi/data-access/testovi-lista.store';
import { TestoviTabela } from '../../testovi/ui/testovi-tabela';
import { PredmetStore } from '../data-access/predmet.store';
import { serijeProsekaPoTipu } from '../data-access/predmeti.models';
import { ProsekPoTipu } from '../ui/prosek-po-tipu';

/**
 * Id predmeta iz putanje (`/predmeti/:id/...`): prvi `id` idući od tekuće rute ka korenu. Zove se u injection kontekstu
 * store-a liste (`zakljucano`); neispravan id (`NaN`) `withListQuery` ne zaključava.
 */
export function predmetIzRute(): number {
  const putanja = inject(ActivatedRoute).snapshot.pathFromRoot;
  for (let i = putanja.length - 1; i >= 0; i--) {
    const id = putanja[i].paramMap.get('id');
    if (id !== null) {
      return JE_ID.test(id) ? Number(id) : NaN;
    }
  }
  return NaN;
}

/**
 * Filteri koje lista u hubu prikazuje i čisti sama: pretraga, status (i tip testa). Školska godina i grupa su iste
 * query promenljive (`godina`, `grupa`), ali ih bira zaglavlje huba, pa ih "Očisti filtere" u tabu ne dira.
 */
const SVOJI_FILTERI = { q: null, status: null } as const;

const LISTA_STILOVI = `
  :host { display: block; }
  .zaglavlje-liste { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-bottom: 12px; }
  app-error-panel { display: block; margin: 0 16px; }
  .grafikon { margin-bottom: 16px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
  .grafikon h2 { margin: 0 0 4px; font-size: 16px; }
  .grafikon .podnaslov { margin: 0 0 12px; color: var(--muted); font-size: 13px; }
`;

// ------------------------------------------------------------------------------------------------ predavanja

const PredavanjaPredmetaStore = signalStore(
  withListaPredavanja({ kljuc: 'predavanja-predmet', zakljucano: () => ({ predmet: predmetIzRute() }) }),
);

/** Tab Predavanja huba: ista lista kao `/predavanja`, sa zaključanim predmetom; godina i grupa iz zaglavlja huba. */
@Component({
  selector: 'app-predmet-predavanja-tab',
  imports: [ChipSelect, EmptyState, ErrorPanel, FilterBar, MatButton, MatIcon, Paginator, PredavanjaTabela, RouterLink, SkeletonRows],
  providers: [PredavanjaPredmetaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="zaglavlje-liste">
      <a matButton="filled" routerLink="/predavanja/novo" [queryParams]="novo()" data-novo><mat-icon svgIcon="add" aria-hidden="true" />Započni predavanje</a>
    </div>
    <section class="lista-kartica" aria-label="Predavanja predmeta" [attr.aria-busy]="store.ucitava()">
      <app-filter-bar [pretraga]="f().q" pretragaLabela="Pretraži po temi…" [imaFiltera]="imaSvojih()"
        (pretragaChange)="store.postaviFiltere({ q: $event })" (ocisti)="store.postaviFiltere(svoji)">
        <app-chip-select labela="Status" [opcije]="statusi" [vrednost]="f().status" (vrednostChange)="store.postaviFilter('status', $event)" />
      </app-filter-bar>
      @if (store.imaGresku()) {
        <app-error-panel [poruka]="store.greska()" (ponovo)="store.osvezi()" />
      }
      @if (store.stavke().length > 0) {
        <app-predavanja-tabela [stavke]="store.stavke()" [zakljucano]="zakljucaneKolone()" [sort]="store.upit().sort" [punDatum]="f().godina === null"
          (otvori)="router.navigate(['/predavanja', $event])" (sortChange)="store.postaviSort($event)" />
      } @else if (store.ucitava() || store.status() === 'idle') {
        <app-skeleton-rows [redovi]="5" />
      } @else if (store.status() === 'loaded') {
        <app-empty-state [naslov]="imaSvojih() ? 'Nema predavanja za izabrane filtere' : 'Nema predavanja u školskoj godini ' + godina()" ikona="co_present">
          @if (imaSvojih()) {
            <button matButton="outlined" type="button" (click)="store.postaviFiltere(svoji)">Očisti filtere</button>
          }
        </app-empty-state>
      }
      <app-paginator [ukupno]="store.ukupno()" [strana]="store.upit().strana" [velicina]="store.upit().velicina"
        (stranaChange)="store.postaviStranu($event)" (velicinaChange)="store.postaviVelicinu($event)" />
    </section>
  `,
  styles: LISTA_STILOVI,
})
export class PredmetPredavanjaTab {
  protected readonly store = inject(PredavanjaPredmetaStore);
  protected readonly router = inject(Router);
  protected readonly f = computed(() => this.store.upit().filteri);
  protected readonly svoji = SVOJI_FILTERI;
  protected readonly imaSvojih = computed(() => this.f().q !== null || this.f().status !== null);
  protected readonly godina = computed(() => formatSkolskaGodina(this.f().godina));
  protected readonly zakljucaneKolone = computed(() => (this.f().grupa !== null ? (['predmet', 'grupa'] as const) : (['predmet'] as const)));
  protected readonly statusi: ChipOpcija<StatusPredavanja>[] = [
    { vrednost: 'u-toku', labela: 'U toku' },
    { vrednost: 'zavrseno', labela: 'Završeno' },
  ];
  /** "Započni predavanje" nosi zaključan predmet i grupu iz zaglavlja huba. */
  protected readonly novo = computed(() => ({ predmet: this.store.zakljucano().predmet ?? null, grupa: this.f().grupa }));
}

// ------------------------------------------------------------------------------------------------ domaći

const DomaciPredmetaStore = signalStore(withListaDomacih({ kljuc: 'domaci-predmet', zakljucano: () => ({ predmet: predmetIzRute() }) }));

/** Tab Domaći huba: lista sa zaključanim predmetom. */
@Component({
  selector: 'app-predmet-domaci-tab',
  imports: [ChipSelect, DomaciTabela, EmptyState, ErrorPanel, FilterBar, MatButton, MatIcon, Paginator, RouterLink, SkeletonRows],
  providers: [DomaciPredmetaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="zaglavlje-liste">
      <a matButton="filled" routerLink="/domaci/novo" [queryParams]="novo()" data-novo><mat-icon svgIcon="add" aria-hidden="true" />Nov domaći</a>
    </div>
    <section class="lista-kartica" aria-label="Domaći predmeta" [attr.aria-busy]="store.ucitava()">
      <app-filter-bar [pretraga]="f().q" pretragaLabela="Pretraži po naslovu…" [imaFiltera]="imaSvojih()"
        (pretragaChange)="store.postaviFiltere({ q: $event })" (ocisti)="store.postaviFiltere(svoji)">
        <app-chip-select labela="Status" [opcije]="statusi" [vrednost]="f().status" (vrednostChange)="store.postaviFilter('status', $event)" />
      </app-filter-bar>
      @if (store.imaGresku()) {
        <app-error-panel [poruka]="store.greska()" (ponovo)="store.osvezi()" />
      }
      @if (store.stavke().length > 0) {
        <app-domaci-tabela [stavke]="store.stavke()" [zakljucano]="zakljucaneKolone()" [sort]="store.upit().sort" [punDatum]="f().godina === null"
          (otvori)="router.navigate(['/domaci', $event])" (sortChange)="store.postaviSort($event)" />
      } @else if (store.ucitava() || store.status() === 'idle') {
        <app-skeleton-rows [redovi]="5" />
      } @else if (store.status() === 'loaded') {
        <app-empty-state [naslov]="imaSvojih() ? 'Nema domaćih za izabrane filtere' : 'Nema domaćih u školskoj godini ' + godina()" ikona="description">
          @if (imaSvojih()) {
            <button matButton="outlined" type="button" (click)="store.postaviFiltere(svoji)">Očisti filtere</button>
          }
        </app-empty-state>
      }
      <app-paginator [ukupno]="store.ukupno()" [strana]="store.upit().strana" [velicina]="store.upit().velicina"
        (stranaChange)="store.postaviStranu($event)" (velicinaChange)="store.postaviVelicinu($event)" />
    </section>
  `,
  styles: LISTA_STILOVI,
})
export class PredmetDomaciTab {
  protected readonly store = inject(DomaciPredmetaStore);
  protected readonly router = inject(Router);
  protected readonly f = computed(() => this.store.upit().filteri);
  protected readonly svoji = SVOJI_FILTERI;
  protected readonly imaSvojih = computed(() => this.f().q !== null || this.f().status !== null);
  protected readonly godina = computed(() => formatSkolskaGodina(this.f().godina));
  protected readonly zakljucaneKolone = computed(() => (this.f().grupa !== null ? (['predmet', 'grupa'] as const) : (['predmet'] as const)));
  protected readonly statusi: ChipOpcija<StatusDomaceg>[] = [
    { vrednost: 'za-pregled', labela: 'Za pregled' },
    { vrednost: 'pregledan', labela: 'Pregledan' },
  ];
  protected readonly novo = computed(() => ({ predmet: this.store.zakljucano().predmet ?? null, grupa: this.f().grupa }));
}

// ------------------------------------------------------------------------------------------------ testovi

const TestoviPredmetaStore = signalStore(withListaTestova({ kljuc: 'testovi-predmet', zakljucano: () => ({ predmet: predmetIzRute() }) }));

/**
 * Tab Testovi huba: H3 prosek po tipu kroz vreme (nastava godine iz `PredmetStore`, izabrana grupa) i lista testova
 * sa zaključanim predmetom (filteri status i tip testa ovog predmeta).
 */
@Component({
  selector: 'app-predmet-testovi-tab',
  imports: [ChipSelect, EmptyState, ErrorPanel, FilterBar, MatButton, MatIcon, Paginator, ProsekPoTipu, RouterLink, SkeletonRows, TestoviTabela],
  providers: [TestoviPredmetaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="grafikon" aria-labelledby="naslov-proseka">
      <h2 id="naslov-proseka">Prosek po tipu testa kroz vreme</h2>
      <p class="podnaslov">Prosečan broj poena u procentima od max poena testa · {{ godinaHuba() }}{{ grupaHuba() ? ' · ' + grupaHuba() : '' }}</p>
      @switch (predmet.statusNastave()) {
        @case ('loaded') {
          @defer (on viewport) {
            <app-prosek-po-tipu [serije]="serije()" />
          } @placeholder {
            <div style="min-height: 168px"></div>
          }
        }
        @case ('error') {
          <app-error-panel naslov="Prosek nije učitan." [poruka]="predmet.greskaNastave()" (ponovo)="predmet.osveziNastavu()" />
        }
        @default {
          <app-skeleton-rows [redovi]="3" />
        }
      }
    </section>

    <div class="zaglavlje-liste">
      <a matButton="filled" routerLink="/testovi/novo" [queryParams]="novo()" data-novo><mat-icon svgIcon="add" aria-hidden="true" />Nov test</a>
    </div>
    <section class="lista-kartica" aria-label="Testovi predmeta" [attr.aria-busy]="store.ucitava()">
      <app-filter-bar [imaFiltera]="imaSvojih()" (ocisti)="store.postaviFiltere(svoji)">
        <app-chip-select labela="Status" [opcije]="statusi" [vrednost]="f().status" (vrednostChange)="store.postaviFilter('status', $event)" />
        <app-chip-select labela="Tip" [opcije]="tipovi()" [vrednost]="f().tip" (vrednostChange)="store.postaviFilter('tip', $event)" />
      </app-filter-bar>
      @if (store.imaGresku()) {
        <app-error-panel [poruka]="store.greska()" (ponovo)="store.osvezi()" />
      }
      @if (store.stavke().length > 0) {
        <app-testovi-tabela [stavke]="store.stavke()" [zakljucano]="zakljucaneKolone()" [sort]="store.upit().sort" [punDatum]="f().godina === null"
          (otvori)="router.navigate(['/testovi', $event])" (sortChange)="store.postaviSort($event)" />
      } @else if (store.ucitava() || store.status() === 'idle') {
        <app-skeleton-rows [redovi]="5" />
      } @else if (store.status() === 'loaded') {
        <app-empty-state [naslov]="imaSvojih() ? 'Nema testova za izabrane filtere' : 'Nema testova u školskoj godini ' + godina()" ikona="assignment">
          @if (imaSvojih()) {
            <button matButton="outlined" type="button" (click)="store.postaviFiltere(svoji)">Očisti filtere</button>
          }
        </app-empty-state>
      }
      <app-paginator [ukupno]="store.ukupno()" [strana]="store.upit().strana" [velicina]="store.upit().velicina"
        (stranaChange)="store.postaviStranu($event)" (velicinaChange)="store.postaviVelicinu($event)" />
    </section>
  `,
  styles: LISTA_STILOVI,
})
export class PredmetTestoviTab {
  protected readonly store = inject(TestoviPredmetaStore);
  protected readonly predmet = inject(PredmetStore);
  protected readonly router = inject(Router);
  private readonly reference = inject(ReferenceStore);
  protected readonly f = computed(() => this.store.upit().filteri);
  protected readonly svoji = { ...SVOJI_FILTERI, tip: null };
  protected readonly imaSvojih = computed(() => this.f().status !== null || this.f().tip !== null);
  protected readonly godina = computed(() => formatSkolskaGodina(this.f().godina));
  protected readonly godinaHuba = computed(() => formatSkolskaGodina(this.predmet.godina()));
  protected readonly grupaHuba = computed(() => {
    const g = this.predmet.grupa();
    return g === null ? null : (this.predmet.grupe().find(x => x.id === g)?.naziv ?? null);
  });
  protected readonly zakljucaneKolone = computed(() => (this.f().grupa !== null ? (['predmet', 'grupa'] as const) : (['predmet'] as const)));
  protected readonly statusi: ChipOpcija<StatusTesta>[] = [
    { vrednost: 'za-evidentiranje', labela: 'Za evidentiranje' },
    { vrednost: 'evidentiran', labela: 'Evidentiran' },
  ];
  /** Aktivni tipovi testa ovog predmeta. */
  protected readonly tipovi = computed<ChipOpcija<number>[]>(() => {
    const id = this.predmet.id();
    return id === null ? [] : this.reference.tipoviTesta(id)().map(t => ({ vrednost: t.id, labela: t.naziv }));
  });
  /** H3 nad nastavom godine; sa izabranom grupom samo njeni testovi. */
  protected readonly serije = computed(() => {
    const g = this.predmet.grupa();
    const testovi = this.predmet.nastava()?.testovi ?? [];
    return serijeProsekaPoTipu(g === null ? testovi : testovi.filter(t => t.grupa?.id === g));
  });
  protected readonly novo = computed(() => ({ predmet: this.store.zakljucano().predmet ?? null, grupa: this.f().grupa }));
}
