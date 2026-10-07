import { ChangeDetectionStrategy, Component, computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, Params, ResolveEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';

/** Jedna mrvica; poslednja je tekuća stranica (bez linka). `url` je apsolutan u aplikaciji (`/predavanja`). */
export interface Mrvica {
  label: string;
  url?: string;
}

/** `data.mrvice` rute: dobija parametre svih ruta od korena do lista (spojene). */
export type MrviceFn = (params: Params) => Mrvica[];

/** Mrvice najdublje rute koja ih ima (`data` se nasleđuje na prazne i rute bez komponente). */
export function mrviceZa(koren: ActivatedRouteSnapshot): Mrvica[] {
  let params: Params = {};
  let fn: MrviceFn | undefined;
  for (let s: ActivatedRouteSnapshot | null = koren; s; s = s.firstChild) {
    params = { ...params, ...s.params };
    const kandidat: unknown = s.data['mrvice'];
    if (typeof kandidat === 'function') {
      fn = kandidat as MrviceFn;
    }
  }
  return fn ? fn(params) : [];
}

/**
 * Mrvice tekuće rute. Osnovne dolaze iz `data.mrvice`; stranica detalja posle učitavanja zamenjuje labelu poslednje
 * mrvice (`postavi('Predavanje 12 · Petlje')`). Računa se na `ResolveEnd` (pre nego što se prave komponente nove
 * stranice), pa labela koju stranica postavi odmah pri nastanku ostaje do sledeće navigacije.
 */
@Injectable({ providedIn: 'root' })
export class BreadcrumbService {
  private readonly router = inject(Router);
  private readonly osnovne = signal<Mrvica[]>(mrviceZa(this.router.routerState.snapshot.root));
  private readonly labela = signal<string | null>(null);

  readonly mrvice = computed<Mrvica[]>(() => {
    const osnovne = this.osnovne();
    const labela = this.labela();
    if (!labela || osnovne.length === 0) {
      return osnovne;
    }
    return [...osnovne.slice(0, -1), { ...osnovne[osnovne.length - 1], label: labela }];
  });

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is ResolveEnd => e instanceof ResolveEnd),
        takeUntilDestroyed(),
      )
      .subscribe(e => {
        this.osnovne.set(mrviceZa(e.state.root));
        this.labela.set(null);
      });
  }

  /** Dinamička labela tekuće stranice (naziv predavanja, ime studenta…); važi do sledeće navigacije. */
  postavi(labela: string): void {
    this.labela.set(labela);
  }
}

@Component({
  selector: 'app-breadcrumbs',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (mrvice().length) {
      <nav aria-label="Mrvice" class="mrvice">
        <ol>
          @for (m of mrvice(); track $index; let poslednja = $last) {
            <li>
              @if (poslednja) {
                <span aria-current="page" class="tekuca">{{ m.label }}</span>
              } @else if (m.url) {
                <a [routerLink]="m.url">{{ m.label }}</a>
              } @else {
                <span>{{ m.label }}</span>
              }
            </li>
          }
        </ol>
      </nav>
    }
  `,
  styleUrl: './breadcrumbs.scss',
})
export class Breadcrumbs {
  readonly mrvice = inject(BreadcrumbService).mrvice;
}
