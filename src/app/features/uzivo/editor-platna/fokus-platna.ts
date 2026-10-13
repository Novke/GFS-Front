import { Injectable } from '@angular/core';

/** Fokus okvira platna (u `providers` komponente editora): posle ubacivanja sloja i na pointerdown po platnu. */
@Injectable()
export class FokusPlatna {
  private okvir: HTMLElement | null = null;

  postavi(el: HTMLElement | null): void {
    this.okvir = el;
  }

  fokus(): void {
    this.okvir?.focus({ preventScroll: true });
  }
}
