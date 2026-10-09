import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit } from '@angular/core';
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
import { formatSkolskaGodina, opcijeSkolskihGodina } from '../../../shared/util/skolska-godina';
import { StatusDomaceg } from '../../domaci/data-access/domaci.models';
import { withListaDomacih } from '../../domaci/data-access/domaci-lista.store';
import { DomaciTabela } from '../../domaci/ui/domaci-tabela';
import { StatusPredavanja } from '../../predavanja/data-access/predavanja.models';
import { withListaPredavanja } from '../../predavanja/data-access/predavanja-lista.store';
import { PredavanjaTabela } from '../../predavanja/ui/predavanja-tabela';
import { StatusTesta } from '../../testovi/data-access/testovi.models';
import { withListaTestova } from '../../testovi/data-access/testovi-lista.store';
import { TestoviTabela } from '../../testovi/ui/testovi-tabela';

export const VRSTE_NASTAVE = [
  { vrednost: 'predavanja', naziv: 'Predavanja' },
  { vrednost: 'domaci', naziv: 'Domaći' },
  { vrednost: 'testovi', naziv: 'Testovi' },
] as const;
export type VrstaNastave = (typeof VRSTE_NASTAVE)[number]['vrednost'];

/** `?vrsta=` u vrstu liste; sve nepoznato je `predavanja` (bez navigacije, pa bez petlje). */
export function parseVrsta(v: unknown): VrstaNastave {
  return VRSTE_NASTAVE.some(x => x.vrednost === v) ? (v as VrstaNastave) : 'predavanja';
}

/**
 * Id grupe iz putanje (`/grupe/:id/nastava`): prvi `id` idući od tekuće rute ka korenu. Zove se u injection kontekstu
 * store-a liste (`zakljucano`), pri svakoj promeni parametara; neispravan id (`NaN`) `withListQuery` ne zaključava.
 */
export function grupaIzRute(): number {
  const putanja = inject(ActivatedRoute).snapshot.pathFromRoot;
  for (let i = putanja.length - 1; i >= 0; i--) {
    const id = putanja[i].paramMap.get('id');
    if (id !== null) {
      return JE_ID.test(id) ? Number(id) : NaN;
    }
  }
  return NaN;
}

/** Predmeti i školske godine za chipove liste u hubu grupe (zajedničko za tri liste). */
function opcijeFiltera(reference: ReferenceStore, godina: () => number | null) {
  return {
    predmeti: computed<ChipOpcija<number>[]>(() => reference.predmeti().map(p => ({ vrednost: p.id, labela: p.naziv }))),
    godine: computed<ChipOpcija<number>[]>(() => {
      const opcije = opcijeSkolskihGodina(6).map(o => ({ vrednost: o.vrednost, labela: o.labela }));
      const g = godina();
      if (g !== null && !opcije.some(o => o.vrednost === g)) {
        opcije.push({ vrednost: g, labela: formatSkolskaGodina(g) });
        opcije.sort((a, b) => b.vrednost - a.vrednost);
      }
      return opcije;
    }),
  };
}

const LISTA_STILOVI = `
  :host { display: block; }
  .zaglavlje-liste { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-bottom: 12px; }
  app-error-panel { display: block; margin: 0 16px; }
`;

// ------------------------------------------------------------------------------------------------ predavanja

const PredavanjaGrupeStore = signalStore(withListaPredavanja({ kljuc: 'predavanja-grupa', zakljucano: () => ({ grupa: grupaIzRute() }) }));

/** Predavanja grupe: lista sa zaključanom grupom (filteri predmet, godina, status, tema u URL-u). */
@Component({
  selector: 'app-grupa-predavanja',
  imports: [ChipSelect, EmptyState, ErrorPanel, FilterBar, MatButton, MatIcon, Paginator, PredavanjaTabela, RouterLink, SkeletonRows],
  providers: [PredavanjaGrupeStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="zaglavlje-liste">
      <a matButton="filled" routerLink="/predavanja/novo" [queryParams]="novo()" data-novo><mat-icon svgIcon="add" aria-hidden="true" />Novo predavanje</a>
    </div>
    <section class="lista-kartica" aria-label="Predavanja grupe" [attr.aria-busy]="store.ucitava()">
      <app-filter-bar [pretraga]="f().q" pretragaLabela="Pretraži po temi…" [imaFiltera]="store.imaFiltera()"
        (pretragaChange)="store.postaviFiltere({ q: $event })" (ocisti)="store.ocistiFiltere()">
        <app-chip-select labela="Predmet" [opcije]="opcije.predmeti()" [vrednost]="f().predmet" (vrednostChange)="store.postaviFilter('predmet', $event)" />
        <app-chip-select labela="Školska godina" [opcije]="opcije.godine()" [vrednost]="f().godina" (vrednostChange)="store.postaviFilter('godina', $event)" />
        <app-chip-select labela="Status" [opcije]="statusi" [vrednost]="f().status" (vrednostChange)="store.postaviFilter('status', $event)" />
      </app-filter-bar>
      @if (store.imaGresku()) {
        <app-error-panel [poruka]="store.greska()" (ponovo)="store.osvezi()" />
      }
      @if (store.stavke().length > 0) {
        <app-predavanja-tabela [stavke]="store.stavke()" [zakljucano]="['grupa']" [sort]="store.upit().sort" [punDatum]="f().godina === null"
          (otvori)="router.navigate(['/predavanja', $event])" (sortChange)="store.postaviSort($event)" />
      } @else if (store.ucitava() || store.status() === 'idle') {
        <app-skeleton-rows [redovi]="5" />
      } @else if (store.status() === 'loaded') {
        <app-empty-state [naslov]="store.imaFiltera() ? 'Nema predavanja za izabrane filtere' : 'Grupa nema predavanja u ovoj godini'" ikona="co_present">
          @if (store.imaFiltera()) {
            <button matButton="outlined" type="button" (click)="store.ocistiFiltere()">Očisti filtere</button>
          }
        </app-empty-state>
      }
      <app-paginator [ukupno]="store.ukupno()" [strana]="store.upit().strana" [velicina]="store.upit().velicina"
        (stranaChange)="store.postaviStranu($event)" (velicinaChange)="store.postaviVelicinu($event)" />
    </section>
  `,
  styles: LISTA_STILOVI,
})
export class GrupaPredavanja implements OnInit {
  protected readonly store = inject(PredavanjaGrupeStore);
  protected readonly router = inject(Router);
  private readonly reference = inject(ReferenceStore);
  protected readonly f = computed(() => this.store.upit().filteri);
  protected readonly opcije = opcijeFiltera(this.reference, () => this.f().godina);
  protected readonly statusi: ChipOpcija<StatusPredavanja>[] = [
    { vrednost: 'u-toku', labela: 'U toku' },
    { vrednost: 'zavrseno', labela: 'Završeno' },
  ];
  /** "Novo predavanje" nosi zaključanu grupu i izabran predmet. */
  protected readonly novo = computed(() => ({ grupa: this.store.zakljucano().grupa ?? null, predmet: this.f().predmet }));

  ngOnInit(): void {
    this.reference.ucitaj();
  }
}

// ------------------------------------------------------------------------------------------------ domaći

const DomaciGrupeStore = signalStore(withListaDomacih({ kljuc: 'domaci-grupa', zakljucano: () => ({ grupa: grupaIzRute() }) }));

/** Domaći grupe: lista sa zaključanom grupom. */
@Component({
  selector: 'app-grupa-domaci',
  imports: [ChipSelect, DomaciTabela, EmptyState, ErrorPanel, FilterBar, MatButton, MatIcon, Paginator, RouterLink, SkeletonRows],
  providers: [DomaciGrupeStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="zaglavlje-liste">
      <a matButton="filled" routerLink="/domaci/novo" [queryParams]="novo()" data-novo><mat-icon svgIcon="add" aria-hidden="true" />Nov domaći</a>
    </div>
    <section class="lista-kartica" aria-label="Domaći grupe" [attr.aria-busy]="store.ucitava()">
      <app-filter-bar [pretraga]="f().q" pretragaLabela="Pretraži po naslovu…" [imaFiltera]="store.imaFiltera()"
        (pretragaChange)="store.postaviFiltere({ q: $event })" (ocisti)="store.ocistiFiltere()">
        <app-chip-select labela="Predmet" [opcije]="opcije.predmeti()" [vrednost]="f().predmet" (vrednostChange)="store.postaviFilter('predmet', $event)" />
        <app-chip-select labela="Školska godina" [opcije]="opcije.godine()" [vrednost]="f().godina" (vrednostChange)="store.postaviFilter('godina', $event)" />
        <app-chip-select labela="Status" [opcije]="statusi" [vrednost]="f().status" (vrednostChange)="store.postaviFilter('status', $event)" />
      </app-filter-bar>
      @if (store.imaGresku()) {
        <app-error-panel [poruka]="store.greska()" (ponovo)="store.osvezi()" />
      }
      @if (store.stavke().length > 0) {
        <app-domaci-tabela [stavke]="store.stavke()" [zakljucano]="['grupa']" [sort]="store.upit().sort" [punDatum]="f().godina === null"
          (otvori)="router.navigate(['/domaci', $event])" (sortChange)="store.postaviSort($event)" />
      } @else if (store.ucitava() || store.status() === 'idle') {
        <app-skeleton-rows [redovi]="5" />
      } @else if (store.status() === 'loaded') {
        <app-empty-state [naslov]="store.imaFiltera() ? 'Nema domaćih za izabrane filtere' : 'Grupa nema domaćih u ovoj godini'" ikona="description">
          @if (store.imaFiltera()) {
            <button matButton="outlined" type="button" (click)="store.ocistiFiltere()">Očisti filtere</button>
          }
        </app-empty-state>
      }
      <app-paginator [ukupno]="store.ukupno()" [strana]="store.upit().strana" [velicina]="store.upit().velicina"
        (stranaChange)="store.postaviStranu($event)" (velicinaChange)="store.postaviVelicinu($event)" />
    </section>
  `,
  styles: LISTA_STILOVI,
})
export class GrupaDomaci implements OnInit {
  protected readonly store = inject(DomaciGrupeStore);
  protected readonly router = inject(Router);
  private readonly reference = inject(ReferenceStore);
  protected readonly f = computed(() => this.store.upit().filteri);
  protected readonly opcije = opcijeFiltera(this.reference, () => this.f().godina);
  protected readonly statusi: ChipOpcija<StatusDomaceg>[] = [
    { vrednost: 'za-pregled', labela: 'Za pregled' },
    { vrednost: 'pregledan', labela: 'Pregledan' },
  ];
  protected readonly novo = computed(() => ({ grupa: this.store.zakljucano().grupa ?? null, predmet: this.f().predmet }));

  ngOnInit(): void {
    this.reference.ucitaj();
  }
}

// ------------------------------------------------------------------------------------------------ testovi

const TestoviGrupeStore = signalStore(withListaTestova({ kljuc: 'testovi-grupa', zakljucano: () => ({ grupa: grupaIzRute() }) }));

/** Testovi grupe: lista sa zaključanom grupom. */
@Component({
  selector: 'app-grupa-testovi',
  imports: [ChipSelect, EmptyState, ErrorPanel, FilterBar, MatButton, MatIcon, Paginator, RouterLink, SkeletonRows, TestoviTabela],
  providers: [TestoviGrupeStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="zaglavlje-liste">
      <a matButton="filled" routerLink="/testovi/novo" [queryParams]="novo()" data-novo><mat-icon svgIcon="add" aria-hidden="true" />Nov test</a>
    </div>
    <section class="lista-kartica" aria-label="Testovi grupe" [attr.aria-busy]="store.ucitava()">
      <app-filter-bar [imaFiltera]="store.imaFiltera()" (ocisti)="store.ocistiFiltere()">
        <app-chip-select labela="Predmet" [opcije]="opcije.predmeti()" [vrednost]="f().predmet" (vrednostChange)="store.postaviFiltere({ predmet: $event, tip: null })" />
        <app-chip-select labela="Školska godina" [opcije]="opcije.godine()" [vrednost]="f().godina" (vrednostChange)="store.postaviFilter('godina', $event)" />
        <app-chip-select labela="Status" [opcije]="statusi" [vrednost]="f().status" (vrednostChange)="store.postaviFilter('status', $event)" />
      </app-filter-bar>
      @if (store.imaGresku()) {
        <app-error-panel [poruka]="store.greska()" (ponovo)="store.osvezi()" />
      }
      @if (store.stavke().length > 0) {
        <app-testovi-tabela [stavke]="store.stavke()" [zakljucano]="['grupa']" [sort]="store.upit().sort" [punDatum]="f().godina === null"
          (otvori)="router.navigate(['/testovi', $event])" (sortChange)="store.postaviSort($event)" />
      } @else if (store.ucitava() || store.status() === 'idle') {
        <app-skeleton-rows [redovi]="5" />
      } @else if (store.status() === 'loaded') {
        <app-empty-state [naslov]="store.imaFiltera() ? 'Nema testova za izabrane filtere' : 'Grupa nema testova u ovoj godini'" ikona="assignment">
          @if (store.imaFiltera()) {
            <button matButton="outlined" type="button" (click)="store.ocistiFiltere()">Očisti filtere</button>
          }
        </app-empty-state>
      }
      <app-paginator [ukupno]="store.ukupno()" [strana]="store.upit().strana" [velicina]="store.upit().velicina"
        (stranaChange)="store.postaviStranu($event)" (velicinaChange)="store.postaviVelicinu($event)" />
    </section>
  `,
  styles: LISTA_STILOVI,
})
export class GrupaTestovi implements OnInit {
  protected readonly store = inject(TestoviGrupeStore);
  protected readonly router = inject(Router);
  private readonly reference = inject(ReferenceStore);
  protected readonly f = computed(() => this.store.upit().filteri);
  protected readonly opcije = opcijeFiltera(this.reference, () => this.f().godina);
  protected readonly statusi: ChipOpcija<StatusTesta>[] = [
    { vrednost: 'za-evidentiranje', labela: 'Za evidentiranje' },
    { vrednost: 'evidentiran', labela: 'Evidentiran' },
  ];
  protected readonly novo = computed(() => ({ grupa: this.store.zakljucano().grupa ?? null, predmet: this.f().predmet }));

  ngOnInit(): void {
    this.reference.ucitaj();
  }
}

// ------------------------------------------------------------------------------------------------ tab

/**
 * Tab Nastava grupe (G4): predavanja, domaći ili testovi grupe (`?vrsta=`), iste liste kao glavne, sa zaključanom
 * grupom (`withListQuery` `zakljucano`: grupa nije u URL-u, ni u zapamćenim filterima, chip grupe se ne prikazuje).
 * Svaka lista ima svoj store i ključ zapamćenih filtera (`*-grupa`); promena vrste briše parametre prethodne liste.
 * "Novo …" nosi zaključanu grupu i izabran predmet.
 */
@Component({
  selector: 'app-grupa-nastava-tab',
  imports: [GrupaDomaci, GrupaPredavanja, GrupaTestovi, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="vrste" aria-label="Vrsta nastave">
      @for (v of vrste; track v.vrednost) {
        <a class="chip" [class.aktivan]="aktivna() === v.vrednost" [attr.aria-current]="aktivna() === v.vrednost ? 'page' : null"
          [routerLink]="[]" [queryParams]="{ vrsta: v.vrednost === 'predavanja' ? null : v.vrednost }" [attr.data-vrsta]="v.vrednost">{{ v.naziv }}</a>
      }
    </nav>
    @switch (aktivna()) {
      @case ('domaci') {
        <app-grupa-domaci />
      }
      @case ('testovi') {
        <app-grupa-testovi />
      }
      @default {
        <app-grupa-predavanja />
      }
    }
  `,
  styles: `
    :host { display: block; }
    .vrste { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .vrste .chip { align-items: center; padding: 0 14px; text-decoration: none; }
  `,
})
export class GrupaNastavaTab {
  /** Query parametar (`withComponentInputBinding`). */
  readonly vrsta = input<string>();
  protected readonly vrste = VRSTE_NASTAVE;
  protected readonly aktivna = computed(() => parseVrsta(this.vrsta()));
}
