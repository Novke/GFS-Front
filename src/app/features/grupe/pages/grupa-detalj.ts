import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { BreadcrumbService } from '../../../core/layout/breadcrumbs';
import { JE_ID } from '../../../core/route-matchers';
import { NotificationStore } from '../../../core/state/notification.store';
import { PreferencesStore } from '../../../core/state/preferences.store';
import { ReferenceStore } from '../../../core/state/reference.store';
import { ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { StatTile } from '../../../shared/ui/stat-tile';
import { GrupaStore } from '../data-access/grupa.store';
import { GrupaInfo } from '../data-access/grupe.models';
import { TABOVI_GRUPE } from '../grupe.routes';
import { GrupaDialog } from '../ui/grupa-dialog';

/** Prosečna prisutnost 0-1 u `87 %`; bez predavanja `—`. */
export function prisutnostTekst(p: number | null | undefined): string | null {
  return typeof p === 'number' && Number.isFinite(p) ? `${Math.round(p * 100)} %` : null;
}

/**
 * Detalj grupe (`/grupe/:id/{pregled,studenti,prisustvo,nastava,onboarding}`): zaglavlje (naziv, godina upisa, meni ⋮
 * "Izmeni grupu"), G1 pločice (studenti, prosečna prisutnost, predavanja, otvoren onboarding sa QR) i tabovi kao child
 * rute. `GrupaStore` je ovde, pa ga tabovi dele; tabovi se prikazuju tek kad je grupa učitana (posle promene grupe
 * ispočetka, da tab ne pokaže studente prethodne grupe).
 */
@Component({
  selector: 'app-grupa-detalj',
  imports: [
    ErrorPanel, MatButton, MatIcon, MatIconButton, MatMenu, MatMenuItem, MatMenuTrigger, RouterLink, RouterLinkActive,
    RouterOutlet, SkeletonRows, StatTile,
  ],
  providers: [GrupaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.pregled(); as p) {
      <header class="zaglavlje">
        <div class="naslov-blok">
          <h1>{{ store.naziv() }}</h1>
          <div class="kontekst">
            <span class="oznaka" data-godina title="Godina upisa">Upis {{ p.grupa.godinaUpisa ?? '—' }}</span>
          </div>
        </div>
        <button matIconButton type="button" [matMenuTriggerFor]="meni" aria-label="Još akcija" data-meni><mat-icon svgIcon="more_vert" /></button>
        <mat-menu #meni="matMenu" xPosition="before">
          <button mat-menu-item type="button" (click)="izmeniGrupu()" data-izmeni-grupu><mat-icon svgIcon="edit" />Izmeni grupu</button>
        </mat-menu>
      </header>

      <div class="brojke" data-brojke>
        <app-stat-tile labela="Studenti" ikona="groups" [vrednost]="p.brojStudenata" />
        <app-stat-tile labela="Prosečna prisutnost" ikona="co_present" [vrednost]="prisutnost()" />
        <app-stat-tile labela="Predavanja" ikona="event" [vrednost]="p.brojPredavanja" />
        <div class="onboarding-plocica" data-onboarding>
          @if (p.otvorenOnboarding; as o) {
            <app-stat-tile labela="Onboarding otvoren · na čekanju" ikona="person_add" [vrednost]="o.brojNaCekanju" />
            <a matButton="outlined" [routerLink]="['/grupe', p.grupa.id, 'onboarding', o.id, 'qr']" data-qr-zaglavlje>
              <mat-icon svgIcon="qr_code_2" aria-hidden="true" />QR
            </a>
          } @else {
            <app-stat-tile labela="Onboarding nije otvoren" ikona="person_add" [vrednost]="null" />
          }
        </div>
      </div>

      @if (store.imaGresku()) {
        <!-- osvežavanje posle izmene nije uspelo: prikaz ostaje, ali se vidi da je zastareo -->
        <app-error-panel naslov="Osvežavanje grupe nije uspelo; prikazani podaci su možda zastareli." [poruka]="store.greska()"
          (ponovo)="store.osvezi()" data-greska-osvezavanja />
      }

      <nav class="tabovi" aria-label="Odeljci grupe">
        @for (t of tabovi; track t.putanja) {
          <a [routerLink]="t.putanja" routerLinkActive="aktivan" ariaCurrentWhenActive="page" [attr.data-tab]="t.putanja">{{ t.naslov }}</a>
        }
      </nav>
      <router-outlet />
    } @else if (store.imaGresku()) {
      <app-error-panel [naslov]="store.statusGreske() === 404 ? 'Grupa ne postoji.' : 'Grupa nije učitana.'" [poruka]="store.greska()" (ponovo)="store.osvezi()" />
      <a matButton routerLink="/grupe"><mat-icon svgIcon="arrow_back" aria-hidden="true" />Sve grupe</a>
    } @else {
      <app-skeleton-rows [redovi]="6" />
    }
  `,
  styles: `
    :host { display: block; }
    .zaglavlje { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .naslov-blok { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
    h1 { font-size: 26px; overflow-wrap: anywhere; }
    .kontekst { display: flex; flex-wrap: wrap; gap: 6px; }
    .brojke { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
    .onboarding-plocica { display: flex; align-items: center; gap: 8px; }
    .tabovi { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--line); overflow-x: auto; }
    .tabovi a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border-bottom: 2px solid transparent;
      color: var(--muted); font-weight: 600; text-decoration: none; white-space: nowrap; }
    .tabovi a:hover { color: var(--ink); }
    .tabovi a.aktivan { color: var(--ink); border-bottom-color: var(--primary); }
    @media (max-width: 599.98px) { h1 { font-size: 22px; } .brojke > * { flex: 1 1 140px; } }
    @media print { .brojke, .tabovi { display: none; } }
  `,
})
export class GrupaDetalj {
  protected readonly store = inject(GrupaStore);
  private readonly dialog = inject(MatDialog);
  private readonly mrvice = inject(BreadcrumbService);
  private readonly preference = inject(PreferencesStore);
  private readonly reference = inject(ReferenceStore);
  private readonly obavestenja = inject(NotificationStore);
  private readonly router = inject(Router);

  /** Id iz putanje (`withComponentInputBinding`); matcher rute propušta samo brojeve. */
  readonly id = input<string>();

  protected readonly tabovi = TABOVI_GRUPE;
  protected readonly gId = computed(() => (JE_ID.test(this.id() ?? '') ? Number(this.id()) : null));
  protected readonly prisutnost = computed(() => prisutnostTekst(this.store.pregled()?.prosecnaPrisutnost));
  private readonly oznaka = computed(
    () => {
      const g = this.store.grupa();
      return g ? { id: g.id, naziv: this.store.naziv() } : null;
    },
    { equal: (a, b) => a?.id === b?.id && a?.naziv === b?.naziv },
  );

  constructor() {
    effect(() => {
      const id = this.gId();
      if (id !== null) {
        untracked(() => this.store.ucitaj(id));
      }
    });

    effect(() => {
      const o = this.oznaka();
      if (o) {
        untracked(() => {
          this.mrvice.postavi(o.naziv);
          this.preference.zabeleziNedavno({ tip: 'grupa', id: o.id, naslov: `Grupa ${o.naziv}`, url: `/grupe/${o.id}` });
        });
      }
    });
    // Mrvice se računaju iznova na svaku navigaciju (i prelazak između tabova, kad se detalj ne pravi ponovo): vrati naziv.
    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        const o = this.oznaka();
        if (o) {
          this.mrvice.postavi(o.naziv);
        }
      });
  }

  protected izmeniGrupu(): void {
    const g = this.store.grupa();
    if (!g) {
      return;
    }
    GrupaDialog.otvori(this.dialog, { grupa: g })
      .pipe(filter((x): x is GrupaInfo => !!x))
      .subscribe(x => {
        this.reference.invalidiraj('grupe');
        this.obavestenja.uspeh(`Grupa ${x.naziv} je sačuvana.`);
        this.store.osvezi();
      });
  }
}
