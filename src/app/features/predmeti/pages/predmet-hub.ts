import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, OnInit, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatSelect } from '@angular/material/select';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { BreadcrumbService } from '../../../core/layout/breadcrumbs';
import { JE_ID } from '../../../core/route-matchers';
import { PreferencesStore } from '../../../core/state/preferences.store';
import { ReferenceStore } from '../../../core/state/reference.store';
import { ErrorPanel, SkeletonRows } from '../../../shared/ui/list-states';
import { formatSkolskaGodina, opcijeSkolskihGodina } from '../../../shared/util/skolska-godina';
import { PredmetStore } from '../data-access/predmet.store';
import { parseGodinaHuba, parseGrupaHuba } from '../data-access/predmeti.models';
import { TABOVI_PREDMETA } from '../predmeti.routes';

/** Opcije birača grupe: grupe sa nastavom u godini; izabrana grupa koje tu nema (stari link) se dodaje na kraj. */
export function opcijeGrupaHuba(
  saNastavom: readonly { id: number; naziv: string }[],
  izabrana: number | null,
  sve: readonly { id: number; naziv: string }[],
): { id: number; naziv: string }[] {
  const opcije = saNastavom.map(g => ({ id: g.id, naziv: g.naziv }));
  if (izabrana !== null && !opcije.some(g => g.id === izabrana)) {
    opcije.push({ id: izabrana, naziv: sve.find(g => g.id === izabrana)?.naziv ?? 'Nepoznata grupa' });
  }
  return opcije;
}

/**
 * Hub predmeta (`/predmeti/:id/{pregled,predavanja,domaci,testovi,studenti,ocene,podesavanja}`): zaglavlje sa nazivom i
 * biračima školske godine i grupe (query parametri `godina`, `grupa`, koje tabovi nasleđuju; liste ih čitaju kao svoje
 * filtere) i tabovi kao child rute. `PredmetStore` je ovde, pa ga tabovi dele. Neispravan `godina`/`grupa` u linku
 * pada na tekuću godinu / sve grupe, bez navigacije.
 */
@Component({
  selector: 'app-predmet-hub',
  imports: [
    ErrorPanel, MatButton, MatFormField, MatIcon, MatLabel, MatOption, MatSelect, RouterLink, RouterLinkActive, RouterOutlet,
    SkeletonRows,
  ],
  providers: [PredmetStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.predmet()) {
      <header class="zaglavlje">
        <div class="naslov-blok">
          <h1>{{ store.naziv() }}</h1>
          <p class="podnaslov">Školska godina {{ skolskaGodina() }}{{ nazivGrupe() ? ' · ' + nazivGrupe() : ' · sve grupe' }}</p>
        </div>
        <div class="biraci">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Školska godina</mat-label>
            <mat-select [value]="godinaH()" (selectionChange)="promeni({ godina: $event.value })" data-birac-godine>
              @for (g of godine(); track g.vrednost) {
                <mat-option [value]="g.vrednost">{{ g.labela }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Grupa</mat-label>
            <mat-select [value]="grupaH() ?? 0" (selectionChange)="promeni({ grupa: $event.value || null })" data-birac-grupe>
              <mat-option [value]="0">Sve grupe</mat-option>
              @for (g of grupe(); track g.id) {
                <mat-option [value]="g.id">{{ g.naziv }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
      </header>

      <nav class="tabovi" aria-label="Odeljci predmeta">
        @for (t of tabovi; track t.putanja) {
          <a [routerLink]="t.putanja" [queryParams]="parametriTaba()" routerLinkActive="aktivan" ariaCurrentWhenActive="page"
            [attr.data-tab]="t.putanja">{{ t.naslov }}</a>
        }
      </nav>
      <router-outlet />
    } @else if (store.imaGresku()) {
      <app-error-panel [naslov]="store.statusGreske() === 404 ? 'Predmet ne postoji.' : 'Predmet nije učitan.'" [poruka]="store.greska()"
        (ponovo)="store.osveziPredmet()" />
      <a matButton routerLink="/predmeti"><mat-icon svgIcon="arrow_back" aria-hidden="true" />Svi predmeti</a>
    } @else {
      <app-skeleton-rows [redovi]="6" />
    }
  `,
  styles: `
    :host { display: block; }
    .zaglavlje { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 16px; margin-bottom: 12px; }
    .naslov-blok { flex: 1 1 260px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    h1 { font-size: 26px; overflow-wrap: anywhere; }
    .podnaslov { margin: 0; color: var(--muted); }
    .biraci { display: flex; flex-wrap: wrap; gap: 8px; }
    .biraci mat-form-field { width: 180px; }
    .tabovi { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--line); overflow-x: auto; }
    .tabovi a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border-bottom: 2px solid transparent;
      color: var(--muted); font-weight: 600; text-decoration: none; white-space: nowrap; }
    .tabovi a:hover { color: var(--ink); }
    .tabovi a.aktivan { color: var(--ink); border-bottom-color: var(--primary); }
    @media (max-width: 599.98px) {
      h1 { font-size: 22px; }
      .biraci { width: 100%; }
      .biraci mat-form-field { flex: 1 1 140px; width: auto; }
    }
  `,
})
export class PredmetHub implements OnInit {
  protected readonly store = inject(PredmetStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly mrvice = inject(BreadcrumbService);
  private readonly preference = inject(PreferencesStore);
  private readonly reference = inject(ReferenceStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** Id iz putanje i query parametri (`withComponentInputBinding`). */
  readonly id = input<string>();
  readonly godina = input<string>();
  readonly grupa = input<string>();

  protected readonly tabovi = TABOVI_PREDMETA;
  protected readonly pId = computed(() => (JE_ID.test(this.id() ?? '') ? Number(this.id()) : null));
  protected readonly godinaH = computed(() => parseGodinaHuba(this.godina()));
  protected readonly grupaH = computed(() => parseGrupaHuba(this.grupa()));
  protected readonly skolskaGodina = computed(() => formatSkolskaGodina(this.godinaH()));

  /** Tekuća i pet prethodnih godina; godina iz linka koje među njima nema se dodaje. */
  protected readonly godine = computed(() => {
    const opcije = opcijeSkolskihGodina(6);
    const g = this.godinaH();
    if (!opcije.some(o => o.vrednost === g)) {
      opcije.push({ vrednost: g, labela: formatSkolskaGodina(g) });
      opcije.sort((a, b) => b.vrednost - a.vrednost);
    }
    return opcije;
  });
  protected readonly grupe = computed(() => opcijeGrupaHuba(this.store.grupe(), this.grupaH(), this.reference.grupe()));
  protected readonly nazivGrupe = computed(() => {
    const g = this.grupaH();
    return g === null ? null : (this.grupe().find(x => x.id === g)?.naziv ?? null);
  });
  /**
   * Tabovi nose godinu (uvek eksplicitno, da lista u tabu ne vrati svoje zapamćene filtere preko izbora huba) i grupu;
   * ostali parametri (strana, sort, pretraga liste) ostaju u tabu u kom su.
   */
  protected readonly parametriTaba = computed(() => ({ godina: this.godinaH(), grupa: this.grupaH() }));

  private readonly oznaka = computed(
    () => {
      const p = this.store.predmet();
      return p ? { id: p.id, naziv: this.store.naziv() } : null;
    },
    { equal: (a, b) => a?.id === b?.id && a?.naziv === b?.naziv },
  );

  constructor() {
    effect(() => {
      const id = this.pId();
      const godina = this.godinaH();
      if (id !== null) {
        untracked(() => this.store.ucitaj(id, godina));
      }
    });
    effect(() => {
      const g = this.grupaH();
      untracked(() => this.store.postaviGrupu(g));
    });
    effect(() => {
      const o = this.oznaka();
      if (o) {
        untracked(() => {
          this.mrvice.postavi(o.naziv);
          this.preference.zabeleziNedavno({ tip: 'predmet', id: o.id, naslov: o.naziv, url: `/predmeti/${o.id}` });
        });
      }
    });
    // Mrvice se računaju iznova na svaku navigaciju (i prelazak između tabova, kad se hub ne pravi ponovo): vrati naziv.
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
        this.pokaziAktivanTab();
      });
    // na uskom ekranu traka tabova se skroluje: aktivan tab (npr. Podešavanja iz linka) mora biti vidljiv
    effect(() => {
      if (this.store.predmet()) {
        this.pokaziAktivanTab();
      }
    });
  }

  private pokaziAktivanTab(): void {
    setTimeout(() => this.host.querySelector<HTMLElement>('.tabovi a.aktivan')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }));
  }

  ngOnInit(): void {
    this.reference.ucitaj();
  }

  /** Nova godina ili grupa: ostaje isti tab, lista u tabu se vraća na prvu stranu. */
  protected promeni(izmena: { godina?: number; grupa?: number | null }): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { godina: this.godinaH(), grupa: this.grupaH(), ...izmena, strana: null },
      queryParamsHandling: 'merge',
    });
  }
}
