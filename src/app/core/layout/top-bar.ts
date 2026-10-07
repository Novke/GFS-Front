import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { Breadcrumbs } from './breadcrumbs';

/** Da li je fokus u polju za unos (tada `/` piše kosu crtu, a ne otvara pretragu). */
function kucaUPolje(cilj: EventTarget | null): boolean {
  if (!(cilj instanceof HTMLElement)) {
    return false;
  }
  return cilj.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(cilj.tagName);
}

/** Gornja traka ljuske: hamburger (ispod 1024 px), mrvice, pretraga (Ctrl+K i `/`), oznaka STAGING. */
@Component({
  selector: 'app-top-bar',
  imports: [Breadcrumbs, MatIcon, MatIconButton],
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
