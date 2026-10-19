import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { Breadcrumbs } from './breadcrumbs';
import { KorisnikMeni } from './korisnik-meni';
import { ObavestenjaMeni } from './obavestenja-meni';

/** Da li je fokus u polju za unos (tada `/` piše kosu crtu, a ne otvara pretragu). */
function kucaUPolje(cilj: EventTarget | null): boolean {
  if (!(cilj instanceof HTMLElement)) {
    return false;
  }
  return cilj.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(cilj.tagName);
}

/**
 * Gornja traka ljuske: hamburger (ispod 1024 px), mrvice, pretraga (Ctrl+K i `/`), oznaka STAGING, zvono obaveštenja i meni
 * nastavnika. Zvono i meni (sa `ObavestenjaStore`, API-jem i šablonima) su `@defer (on immediate)`: učitavaju se odmah posle
 * prvog prikaza, ali van početnog paketa (budžet u `e2e/lenji-editor.spec.ts`); do tada je njihovo mesto rezervisano.
 */
@Component({
  selector: 'app-top-bar',
  imports: [Breadcrumbs, KorisnikMeni, MatIcon, MatIconButton, ObavestenjaMeni],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'precica($event)',
  },
  template: `
    @if (prikaziMeni()) {
      <button mat-icon-button type="button" class="meni" data-meni aria-label="Otvori meni" (click)="meni.emit()">
        <mat-icon svgIcon="menu" aria-hidden="true" />
      </button>
    }
    <app-breadcrumbs class="mrvice" />
    <button type="button" class="pretraga" aria-keyshortcuts="Control+K /" (click)="otvoriPretragu()">
      <mat-icon svgIcon="search" aria-hidden="true" />
      <span class="pretraga-tekst">Student, indeks, tema…</span>
      <kbd aria-hidden="true">Ctrl K</kbd>
      <span class="sr-only">Pretraga</span>
    </button>
    @if (staging()) {
      <span class="oznaka-okruzenja">STAGING</span>
    }
    @defer (on immediate) {
      <div class="nalog">
        <app-obavestenja-meni />
        <app-korisnik-meni />
      </div>
    } @placeholder {
      <div class="nalog" data-mesto-naloga aria-hidden="true"></div>
    }
  `,
  styleUrl: './top-bar.scss',
})
export class TopBar {
  readonly prikaziMeni = input(false);
  readonly staging = input(false);
  readonly meni = output<void>();
  /** Otvaranje globalne pretrage (Ctrl+K, `/` ili dugme). */
  readonly pretraga = output<void>();

  otvoriPretragu(): void {
    this.pretraga.emit();
  }

  protected precica(e: KeyboardEvent): void {
    const ctrlK = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k';
    const kosa = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !kucaUPolje(e.target);
    if (ctrlK || kosa) {
      e.preventDefault();
      this.otvoriPretragu();
    }
  }
}
