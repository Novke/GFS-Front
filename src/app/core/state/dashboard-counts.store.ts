import { DOCUMENT, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { patchState, signalStore, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { catchError, EMPTY, filter, interval, Subscription } from 'rxjs';

import { KontrolnaTablaInfo, PregledApi } from '../api/pregled.api';

export interface DashboardCounts {
  /** Testovi koji čekaju evidentiranje. */
  testovi: number;
  /** Domaći koji čekaju pregled. */
  domaci: number;
  /** Prijave na čekanju, zbir po svim otvorenim sesijama. */
  prijave: number;
}

/** Posle navigacije osvežava se najviše jednom u ovom razmaku. */
export const RAZMAK_NAVIGACIJA_MS = 15_000;
/** Periodično osvežavanje dok je tab vidljiv. */
export const PERIOD_MS = 60_000;

const broj = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Ukupni brojevi iz `ceka.broj*` (liste u `ceka` su ograničene na 10 stavki, pa njihova dužina nije broj). */
export function brojaciIz(tabla: KontrolnaTablaInfo | null): DashboardCounts {
  const ceka = tabla?.ceka;
  return { testovi: broj(ceka?.brojTestova), domaci: broj(ceka?.brojDomacih), prijave: broj(ceka?.brojPrijava) };
}

/**
 * Brojači na stavkama bočne navigacije (Domaći, Testovi, Grupe), iz agregata kontrolne table ("čeka na tebe").
 * Učitava se pri nastanku, posle navigacije (najviše jednom u 15 s) i na 60 s dok je tab vidljiv. Greške su tihe
 * (`LOCAL_ERRORS`, bez snackbara): brojači ostaju na poslednjoj vrednosti.
 *
 * Instancira ga samo `Shell`: na javnoj ruti `/upis` ne sme da postoji (zove zaključan `/api/*`).
 */
export const DashboardCountsStore = signalStore(
  { providedIn: 'root' },
  withState<DashboardCounts>({ testovi: 0, domaci: 0, prijave: 0 }),
  withProps(() => ({
    _api: inject(PregledApi),
    _router: inject(Router),
    _document: inject(DOCUMENT),
    _poslednje: { vreme: Number.NEGATIVE_INFINITY },
    _zahtev: { veza: null as Subscription | null },
  })),
  withMethods(store => ({
    osvezi(): void {
      store._poslednje.vreme = Date.now();
      store._zahtev.veza?.unsubscribe();
      store._zahtev.veza = store._api
        .kontrolnaTabla({ tiho: true })
        .pipe(catchError(() => EMPTY))
        .subscribe(tabla => patchState(store, brojaciIz(tabla)));
    },
  })),
  withHooks({
    onInit(store) {
      store.osvezi();
      store._router.events
        .pipe(
          filter(e => e instanceof NavigationEnd),
          filter(() => Date.now() - store._poslednje.vreme >= RAZMAK_NAVIGACIJA_MS),
          takeUntilDestroyed(),
        )
        .subscribe(() => store.osvezi());
      interval(PERIOD_MS)
        .pipe(
          filter(() => store._document.visibilityState === 'visible'),
          takeUntilDestroyed(),
        )
        .subscribe(() => store.osvezi());
    },
    onDestroy(store) {
      store._zahtev.veza?.unsubscribe();
    },
  }),
);
