import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, DOCUMENT, inject } from '@angular/core';
import { Router } from '@angular/router';
import { patchState, signalStore, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../api/api-error';
import { KontrolnaTablaInfo, PregledApi } from '../api/pregled.api';
import { periodicnoOsvezavanje } from './periodicno-osvezavanje';

export { PERIOD_MS, RAZMAK_NAVIGACIJA_MS } from './periodicno-osvezavanje';

export type StatusTable = 'idle' | 'loading' | 'loaded' | 'error';

export interface DashboardCounts {
  /** Testovi koji čekaju evidentiranje. */
  testovi: number;
  /** Domaći koji čekaju pregled. */
  domaci: number;
  /** Prijave na čekanju, zbir po svim otvorenim sesijama. */
  prijave: number;
}

/** Zahtev koji je počeo ovoliko ranije još važi za nekoga ko traži svež odgovor (stranica Početna ne pravi drugi zahtev). */
export const SVEZ_ZAHTEV_MS = 2_000;

const broj = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Ukupni brojevi iz `ceka.broj*` (liste u `ceka` su ograničene na 10 stavki, pa njihova dužina nije broj). */
export function brojaciIz(tabla: KontrolnaTablaInfo | null): DashboardCounts {
  const ceka = tabla?.ceka;
  return { testovi: broj(ceka?.brojTestova), domaci: broj(ceka?.brojDomacih), prijave: broj(ceka?.brojPrijava) };
}

/**
 * Brojači na stavkama bočne navigacije (Domaći, Testovi, Grupe), iz agregata kontrolne table ("čeka na tebe").
 * Učitava se kad ga `pokreni` uključi, posle navigacije (najviše jednom u 15 s) i na 60 s dok je tab vidljiv, ali samo dok
 * živi ono što ga je uključilo (`DestroyRef` ljuske, kao `ObavestenjaStore`). Store je root, pa bi inače posle odjave i
 * prelaska na javnu rutu (`/nalog`, `/upis`, `/uzivo`) u istoj kartici i dalje zvao zaključan `/api/*`: 401 bi tada pokrenuo
 * istek sesije. Greške su tihe (`LOCAL_ERRORS`, bez snackbara): brojači ostaju na poslednjoj vrednosti. Čuva i ceo poslednji
 * odgovor (`tabla`, `status`, `greska`): stranica Početna ga prikazuje, pa ceo ekran ima jedan zahtev (`osveziSada`).
 *
 * Instancira ga i pokreće samo `Shell`.
 */
export const DashboardCountsStore = signalStore(
  { providedIn: 'root' },
  withState<DashboardCounts & { tabla: KontrolnaTablaInfo | null; status: StatusTable; greska: string | null }>({
    testovi: 0,
    domaci: 0,
    prijave: 0,
    tabla: null,
    status: 'idle',
    greska: null,
  }),
  withProps(() => ({
    _api: inject(PregledApi),
    _router: inject(Router),
    _document: inject(DOCUMENT),
    _poslednje: { vreme: Number.NEGATIVE_INFINITY, pocetakZahteva: Number.NEGATIVE_INFINITY },
    _zahtev: { veza: null as Subscription | null, periodicno: null as Subscription | null },
  })),
  withMethods(store => {
    const osvezi = (): void => {
      store._poslednje.vreme = Date.now();
      store._poslednje.pocetakZahteva = Date.now();
      store._zahtev.veza?.unsubscribe();
      patchState(store, { status: 'loading' });
      store._zahtev.veza = store._api.kontrolnaTabla({ tiho: true }).subscribe({
        next: tabla => patchState(store, { ...brojaciIz(tabla), tabla, status: 'loaded', greska: null }),
        // brojači ostaju na poslednjoj vrednosti; greška se samo pamti (Početna je prikazuje, navigacija je tiha)
        error: (e: unknown) =>
          patchState(store, { status: 'error', greska: e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM }),
      });
    };
    return {
      osvezi,
      /**
       * Uključuje osvežavanje dok `trajanje` (`DestroyRef` ljuske) ne istekne; odmah učitava. Drugi poziv dok osvežavanje
       * radi ne pravi drugi tajmer. Po isteku otkazuje i zahtev u toku.
       */
      pokreni(trajanje: DestroyRef): void {
        if (store._zahtev.periodicno) {
          return;
        }
        osvezi();
        const periodicno = periodicnoOsvezavanje({
          router: store._router,
          document: store._document,
          osvezi,
          poslednje: () => store._poslednje.vreme,
        });
        store._zahtev.periodicno = periodicno;
        trajanje.onDestroy(() => {
          periodicno.unsubscribe();
          store._zahtev.veza?.unsubscribe();
          if (store._zahtev.periodicno === periodicno) {
            store._zahtev.periodicno = null;
          }
        });
      },
      /**
       * Za stranicu Početna: svež odgovor, ali bez drugog zahteva ako je jedan upravo počeo (npr. pri nastanku store-a ili iz
       * navigacije), pa `/` šalje jedan `GET pregled/kontrolna-tabla`.
       */
      osveziSada(): void {
        if (store.status() === 'loading' && Date.now() - store._poslednje.pocetakZahteva < SVEZ_ZAHTEV_MS) {
          return;
        }
        osvezi();
      },
    };
  }),
  withHooks({
    onDestroy(store) {
      store._zahtev.veza?.unsubscribe();
      store._zahtev.periodicno?.unsubscribe();
    },
  }),
);
