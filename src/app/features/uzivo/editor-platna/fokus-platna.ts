import { Injectable } from '@angular/core';

/** Prva kontrola koja prima fokus tastaturom (dugme, polje, `mat-select`, dugme boje). */
const FOKUSABILNO = 'button:not([disabled]), input:not([disabled]), [tabindex="0"]';

/**
 * Fokus okvira platna (u `providers` komponente editora): posle ubacivanja sloja i na pointerdown po platnu. F6 iz
 * uređivača teksta (F12) fokusira prvu kontrolu panela teksta u tabu Svojstva, bez kraja sesije.
 */
@Injectable()
export class FokusPlatna {
  private okvir: HTMLElement | null = null;
  private koren: HTMLElement | null = null;

  postavi(el: HTMLElement | null): void {
    this.okvir = el;
  }

  /** Koren editora (domaćin `app-platno-editor`): u njemu se traži panel. */
  postaviKoren(el: HTMLElement | null): void {
    this.koren = el;
  }

  fokus(): void {
    this.okvir?.focus({ preventScroll: true });
  }

  /** Prva kontrola panela teksta (font); false kad panela nema. */
  fokusPanela(): boolean {
    const el = this.koren?.querySelector('.uz-ep-paneli app-svojstva-teksta')?.querySelector<HTMLElement>(FOKUSABILNO);
    el?.focus();
    return !!el;
  }
}
