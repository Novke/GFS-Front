import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router } from '@angular/router';

import { ReferenceStore } from '../../../core/state/reference.store';
import { ChipOpcija, ChipSelect } from '../../../shared/ui/chip-select';
import { FilterBar } from '../../../shared/ui/filter-bar';
import { EmptyState, ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { PageHeader } from '../../../shared/ui/page-header';
import { Paginator } from '../../../shared/ui/paginator';
import { StudentiListaStore } from '../data-access/studenti-lista.store';
import { brojStudenataTekst } from '../data-access/studenti.models';
import { StudentiTabela } from '../ui/studenti-tabela';

const SORTOVI: Record<string, string> = {
  'prezime,asc': 'prezimenu, A–Ž',
  'prezime,desc': 'prezimenu, Ž–A',
  'indeks,asc': 'indeksu, rastuće',
  'indeks,desc': 'indeksu, opadajuće',
  'godina,asc': 'godini upisa, najstarija prvo',
  'godina,desc': 'godini upisa, najnovija prvo',
  'ime,asc': 'imenu, A–Ž',
  'ime,desc': 'imenu, Ž–A',
};

/**
 * Lista studenata (`/studenti?grupa&q&stariji`): filteri, sort i strane u URL-u (spec 4, Lista; spec 5, Studenti).
 * "Stariji od grupe" prikazuje studente iz grupa sa manjom godinom upisa od izabrane grupe (ponovci).
 */
@Component({
  selector: 'app-studenti-lista',
  imports: [ChipSelect, EmptyState, ErrorPanel, FilterBar, MatButton, PageHeader, Paginator, SkeletonRows, StudentiTabela],
  providers: [StudentiListaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header naslov="Studenti" podnaslov="Svi studenti, svih grupa" />

    <section class="lista-kartica" aria-label="Lista studenata" [attr.aria-busy]="store.ucitava()">
      <app-filter-bar [pretraga]="filteri().q" pretragaLabela="Pretraži po imenu ili indeksu…" [imaFiltera]="store.imaFiltera()"
        (pretragaChange)="promeniPretragu($event)" (ocisti)="store.ocistiFiltere()">
        <app-chip-select labela="Grupa" [opcije]="grupe()" [vrednost]="filteri().grupa"
          (vrednostChange)="store.postaviFilter('grupa', $event)" />
        <app-chip-select labela="Stariji od grupe" [opcije]="grupe()" [vrednost]="filteri().stariji"
          (vrednostChange)="store.postaviFilter('stariji', $event)" />
      </app-filter-bar>

      @if (store.imaGresku()) {
        <app-error-panel [poruka]="store.greska()" (ponovo)="store.osvezi()" />
      }

      @if (store.stavke().length > 0) {
        <p class="lista-broj" aria-live="polite">{{ brojRezultata() }}</p>
        <app-studenti-tabela [stavke]="store.stavke()" [sort]="store.upit().sort" (otvori)="otvori($event)"
          (sortChange)="store.postaviSort($event)" />
      } @else if (store.ucitava() || store.status() === 'idle') {
        <app-skeleton-rows [redovi]="6" />
      } @else if (store.status() === 'loaded') {
        @if (store.imaFiltera()) {
          <app-empty-state naslov="Nema studenata za izabrane filtere" tekst="Probaj drugu grupu ili drugačiji upit.">
            <button matButton="outlined" type="button" data-ocisti (click)="store.ocistiFiltere()">Očisti filtere</button>
          </app-empty-state>
        } @else {
          <app-empty-state naslov="Još nema studenata" ikona="groups"
            tekst="Studenti se dodaju u grupi: ručno ili kroz onboarding (QR kod za upis)." />
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
export class StudentiLista implements OnInit {
  protected readonly store = inject(StudentiListaStore);
  private readonly reference = inject(ReferenceStore);
  private readonly router = inject(Router);

  protected readonly filteri = computed(() => this.store.upit().filteri);
  protected readonly grupe = computed<ChipOpcija<number>[]>(() =>
    this.reference.grupe().map(g => ({ vrednost: g.id, labela: g.naziv })),
  );

  /** Podnaslov rezultata: `38 studenata · sortirano po prezimenu, A–Ž`. */
  protected readonly brojRezultata = computed(() => {
    const sort = SORTOVI[this.store.upit().sort];
    return `${brojStudenataTekst(this.store.ukupno())}${sort ? ` · sortirano po ${sort}` : ''}`;
  });

  ngOnInit(): void {
    this.reference.ucitaj();
  }

  /** `FilterBar` već čeka 300 ms, pa ide direktno (bez drugog debounce-a u store-u). */
  protected promeniPretragu(q: string | null): void {
    this.store.postaviFiltere({ q });
  }

  protected otvori(id: number): void {
    void this.router.navigate(['/studenti', id]);
  }
}
