import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { DashboardCountsStore } from '../state/dashboard-counts.store';
import { ReferenceStore } from '../state/reference.store';
import { Okruzenje } from './okruzenje';
import { SideNav } from './side-nav';
import { TopBar } from './top-bar';

/** Od ove širine bočna navigacija je stalno otvorena (`side`); ispod je drawer (`over`) sa hamburgerom. */
export const SIROKO = '(min-width: 1024px)';

/**
 * Ljuska nastavničkih ruta: tamna bočna navigacija, gornja traka sa mrvicama, sadržaj (max 1440 px).
 * Jedino mesto koje instancira `DashboardCountsStore` i učitava `ReferenceStore` (predmeti u navigaciji):
 * javne (`/upis`) i projektorske rute koriste svoj layout bez ljuske.
 */
@Component({
  selector: 'app-shell',
  imports: [MatSidenavContainer, MatSidenav, MatSidenavContent, RouterOutlet, SideNav, TopBar],
  // Stari ekrani (Eager, bez signala) u outletu se osvežavaju i ispod OnPush ljuske (Angular 22 obilazi Eager
  // poglede u kontejnerima); proverava test "stari ekran ..." u shell.spec.ts.
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly brojaciStore = inject(DashboardCountsStore);
  protected readonly reference = inject(ReferenceStore);
  protected readonly okruzenje = inject(Okruzenje);
  private readonly sadrzaj = viewChild.required<ElementRef<HTMLElement>>('sadrzaj');

  protected readonly siroko = toSignal(
    inject(BreakpointObserver).observe(SIROKO).pipe(map(s => s.matches)),
    { initialValue: false },
  );
  /** Stanje drawer-a u `over` režimu (u `side` režimu navigacija je uvek otvorena). */
  protected readonly otvorena = signal(false);
  protected readonly brojaci = computed(() => ({
    testovi: this.brojaciStore.testovi(),
    domaci: this.brojaciStore.domaci(),
    prijave: this.brojaciStore.prijave(),
  }));

  constructor() {
    this.reference.ucitaj();
    inject(Router)
      .events.pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.otvorena.set(false));
  }

  protected zatvoriAkoJeDrawer(): void {
    if (!this.siroko()) {
      this.otvorena.set(false);
    }
  }

  protected otvoriPretragu(): void {
    // Globalna pretraga (GlobalnaPretraga) dolazi u Task 25; do tada prečice i dugme ne rade ništa.
  }

  /** Skip-link: `href="#sadrzaj"` bi uz `<base href>` otvorio početnu stranu, zato fokus ide ručno. */
  protected preskoci(e: Event): void {
    e.preventDefault();
    this.sadrzaj().nativeElement.focus();
  }
}
