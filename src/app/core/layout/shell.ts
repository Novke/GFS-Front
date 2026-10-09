import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { GlobalnaPretraga } from '../search/globalna-pretraga';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly dialog = inject(MatDialog);
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

  /** Pamti samo stanje drawer-a (`over`); u `side` režimu je navigacija uvek otvorena (i Esc je ne zatvara). */
  protected promenaOtvorenosti(otvorena: boolean): void {
    if (!this.siroko()) {
      this.otvorena.set(otvorena);
    }
  }

  protected zatvoriAkoJeDrawer(): void {
    if (!this.siroko()) {
      this.otvorena.set(false);
    }
  }

  /** Dugme, Ctrl+K i `/` (TopBar): globalna pretraga; ako je već otvorena, ostaje ta. */
  protected otvoriPretragu(): void {
    GlobalnaPretraga.otvori(this.dialog);
  }

  /** Skip-link: `href="#sadrzaj"` bi uz `<base href>` otvorio početnu stranu, zato fokus ide ručno. */
  protected preskoci(e: Event): void {
    e.preventDefault();
    this.sadrzaj().nativeElement.focus();
  }
}
