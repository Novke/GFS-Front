import { ChangeDetectionStrategy, Component, computed, DestroyRef, DOCUMENT, ElementRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { NavigationEnd, Router } from '@angular/router';
import { filter, startWith } from 'rxjs';

import { sRecju } from '../../shared/util/mnozina';
import { postaviManifest } from '../pwa/manifest';
import { naPushPoruku, registrujServiceWorker } from '../pwa/service-worker';
import { ObavestenjaStore } from '../state/obavestenja.store';

/**
 * Zvono u gornjoj traci: značka sa brojem nepročitanih obaveštenja (sakrivena na 0) i dugme koje otvara padajuću listu
 * (`./obavestenja-panel`, lenji dijalog ispod zvona). Uključuje osvežavanje broja u `ObavestenjaStore` dok postoji, a postoji
 * samo u ljusci (gornja traka ga učitava kroz `@defer`), pa javne rute i `/prijava` nikad ne pitaju za obaveštenja.
 *
 * Aplikacija i push na nastavnikovom telefonu (spec „Aplikacija i obaveštenja“ 4 i 6.6): zvono (lenji deo ljuske, pa početni
 * paket ne raste) postavlja nastavnički manifest i registruje service worker. Klik na push otvara `?obavestenja=otvori`, pa
 * se lista otvara sama i parametar se briše iz adrese; poruka service worker-a o novom push-u odmah osvežava broj.
 */
@Component({
  selector: 'app-obavestenja-meni',
  imports: [MatIcon, MatIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button mat-icon-button type="button" class="zvono" data-obavestenja aria-haspopup="dialog"
            [attr.aria-expanded]="otvoren()" [attr.aria-label]="labela()" (click)="otvori()">
      <mat-icon svgIcon="notifications" aria-hidden="true" />
      @if (neprocitana() > 0) {
        <span class="znacka" data-znacka aria-hidden="true">{{ znacka() }}</span>
      }
    </button>
  `,
  styles: `
    :host { display: inline-flex; }
    .zvono { position: relative; color: var(--ink); }
    .znacka {
      position: absolute; top: 2px; right: 0; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box;
      border-radius: 9px; background: var(--accent); color: var(--accent-ink); font-family: var(--font-mono);
      font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; pointer-events: none;
    }
  `,
})
export class ObavestenjaMeni {
  private readonly store = inject(ObavestenjaStore);
  private readonly dialog = inject(MatDialog);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly otvoren = signal(false);
  protected readonly neprocitana = computed(() => this.store.broj().neprocitana);
  protected readonly znacka = computed(() => (this.neprocitana() > 99 ? '99+' : String(this.neprocitana())));
  protected readonly labela = computed(() => {
    const n = this.neprocitana();
    return n > 0 ? `Obaveštenja: ${sRecju(n, 'nepročitano', 'nepročitana', 'nepročitanih')}` : 'Obaveštenja';
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    const dokument = inject(DOCUMENT);
    this.store.pokreni(destroyRef);
    postaviManifest(dokument, 'nastavnik');
    void registrujServiceWorker(dokument);
    destroyRef.onDestroy(naPushPoruku(() => this.store.osveziBroj()));
    const router = inject(Router);
    router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      startWith(null),
      takeUntilDestroyed(destroyRef),
    ).subscribe(() => {
      const url = router.parseUrl(router.url);
      const { obavestenja, ...ostalo } = url.queryParams;
      if (obavestenja === 'otvori') {
        url.queryParams = ostalo;
        void router.navigateByUrl(url, { replaceUrl: true });
        void this.otvori();
      }
    });
  }

  protected async otvori(): Promise<void> {
    if (this.otvoren()) {
      return;
    }
    this.otvoren.set(true);
    try {
      const { ObavestenjaPanel } = await import('./obavestenja-panel');
      const dugme = this.el.nativeElement.querySelector('button') ?? this.el.nativeElement;
      ObavestenjaPanel.otvori(this.dialog, dugme).afterClosed().subscribe(() => this.otvoren.set(false));
    } catch {
      this.otvoren.set(false);
    }
  }
}
