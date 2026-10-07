import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { PredmetInfo } from '../api/reference.api';
import { DashboardCounts } from '../state/dashboard-counts.store';
import { NazivIkone } from './icons';
import { ThemeToggle } from './theme-toggle';

export interface NavStavka {
  label: string;
  url: string;
  ikona: NazivIkone;
  /** Ključ brojača iz `DashboardCountsStore`. */
  brojac?: keyof DashboardCounts;
}

export const NASTAVA: readonly NavStavka[] = [
  { label: 'Predavanja', url: '/predavanja', ikona: 'co_present' },
  { label: 'Domaći', url: '/domaci', ikona: 'description', brojac: 'domaci' },
  { label: 'Testovi', url: '/testovi', ikona: 'assignment', brojac: 'testovi' },
  { label: 'Ocene', url: '/ocene', ikona: 'bar_chart' },
];

export const LJUDI: readonly NavStavka[] = [
  { label: 'Grupe', url: '/grupe', ikona: 'groups', brojac: 'prijave' },
  { label: 'Studenti', url: '/studenti', ikona: 'person' },
];

const OPIS_BROJACA: Record<keyof DashboardCounts, string> = {
  domaci: 'za pregled',
  testovi: 'za evidentiranje',
  prijave: 'prijava na čekanju',
};

/** Bočna navigacija (tamna ljuska): sekcije iz spec-a 2, brojači, predmeti, dno sa nalogom, režimom i okruženjem. */
@Component({
  selector: 'app-side-nav',
  imports: [RouterLink, RouterLinkActive, MatIcon, ThemeToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './side-nav.html',
  styleUrl: './side-nav.scss',
})
export class SideNav {
  readonly predmeti = input<readonly PredmetInfo[]>([]);
  readonly brojaci = input<DashboardCounts>({ testovi: 0, domaci: 0, prijave: 0 });
  readonly staging = input(false);
  /** Klik na stavku (ljuska zatvara navigaciju u `over` režimu). */
  readonly izabrano = output<void>();

  protected readonly sekcije = [
    { id: 'nav-nastava', naslov: 'Nastava', stavke: NASTAVA },
    { id: 'nav-ljudi', naslov: 'Ljudi', stavke: LJUDI },
  ] as const;
  protected readonly opisBrojaca = OPIS_BROJACA;
}
