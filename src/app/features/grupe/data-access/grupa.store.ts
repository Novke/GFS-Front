import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, EMPTY, pipe, switchMap, tap } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { setError, setLoaded, setLoading, withRequestStatus } from '../../../shared/store/request-status.feature';
import { GrupeApi } from './grupe.api';
import { GrupaPregledInfo } from './grupe.models';

interface GrupaState {
  id: number | null;
  pregled: GrupaPregledInfo | null;
  /** HTTP status poslednje greške (404 = grupa ne postoji), `null` bez greške. */
  statusGreske: number | null;
}

/**
 * Detalj grupe (`/grupe/:id/...`): G1 brojke i G2 statistika po studentu iz `GET grupe/{id}/pregled` (preko svih
 * predmeta). Provajduje se u `GrupaDetalj`, pa ga tabovi dele; izmene (grupa, student, onboarding) zovu `osvezi()`.
 * Promena grupe briše stari prikaz (da se ne vide studenti druge grupe), osvežavanje iste grupe ga zadržava.
 */
export const GrupaStore = signalStore(
  withState<GrupaState>({ id: null, pregled: null, statusGreske: null }),
  withRequestStatus(),
  withProps(() => ({ _api: inject(GrupeApi) })),
  withComputed(({ pregled }) => ({
    grupa: computed(() => pregled()?.grupa ?? null),
    studenti: computed(() => pregled()?.studenti ?? []),
    naziv: computed(() => pregled()?.grupa?.naziv?.trim() || 'Grupa'),
  })),
  withMethods(store => {
    const ucitajId = rxMethod<number>(
      pipe(
        tap(() => patchState(store, setLoading())),
        switchMap(id =>
          store._api.pregled(id, null, { tiho: true }).pipe(
            tap(pregled => patchState(store, { pregled, statusGreske: null }, setLoaded())),
            catchError((e: unknown) => {
              const status = e instanceof HttpErrorResponse ? e.status : null;
              patchState(store, { statusGreske: status }, setError(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM));
              return EMPTY;
            }),
          ),
        ),
      ),
    );
    return {
      ucitaj(id: number): void {
        if (id !== store.id()) {
          patchState(store, { id, pregled: null, statusGreske: null });
        }
        ucitajId(id);
      },
      osvezi(): void {
        const id = store.id();
        if (id !== null) {
          ucitajId(id);
        }
      },
    };
  }),
);
export type GrupaStore = InstanceType<typeof GrupaStore>;
