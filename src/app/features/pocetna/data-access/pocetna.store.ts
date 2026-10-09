import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, of, pipe, switchMap, tap } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { KontrolnaTablaCeka, KontrolnaTablaInfo, PregledApi } from '../../../core/api/pregled.api';
import { setError, setLoaded, setLoading, withRequestStatus } from '../../../shared/store/request-status.feature';
import { agendaNedelje } from './pocetna.vreme';

interface PocetnaState {
  tabla: KontrolnaTablaInfo | null;
  /** Trenutak poslednjeg učitavanja: pozdrav, "danas" i nedelja se računaju od njega. */
  sada: Date;
}

const PRAZNO_CEKA: KontrolnaTablaCeka = {
  testovi: [],
  domaci: [],
  prijave: [],
  nezavrsena: [],
  brojTestova: 0,
  brojDomacih: 0,
  brojPrijava: 0,
  brojNezavrsenih: 0,
};

/** Broj iz odgovora; sve što nije konačan nenegativan broj je 0 (stari ili okrnjen odgovor ne sme da ruši ekran). */
const broj = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const lista = <T>(v: readonly T[] | null | undefined): readonly T[] => (Array.isArray(v) ? v : []);

/**
 * Kontrolna tabla (`/`), P1-P4: jedan zahtev `GET pregled/kontrolna-tabla`. Provajduje se u stranici. Greška ne ide
 * u snackbar (`tiho`), nego u panel greške sa "Pokušaj ponovo". Dok se tabla osvežava, stari podaci ostaju na ekranu.
 */
export const PocetnaStore = signalStore(
  withState<PocetnaState>({ tabla: null, sada: new Date() }),
  withRequestStatus(),
  withComputed(store => {
    const ceka = computed<KontrolnaTablaCeka>(() => {
      const c = store.tabla()?.ceka;
      return c
        ? {
            testovi: lista(c.testovi),
            domaci: lista(c.domaci),
            prijave: lista(c.prijave),
            nezavrsena: lista(c.nezavrsena),
            brojTestova: broj(c.brojTestova),
            brojDomacih: broj(c.brojDomacih),
            brojPrijava: broj(c.brojPrijava),
            brojNezavrsenih: broj(c.brojNezavrsenih),
          }
        : PRAZNO_CEKA;
    });
    return {
      sledece: computed(() => store.tabla()?.sledece ?? null),
      uToku: computed(() => lista(store.tabla()?.uToku)),
      ceka,
      nedelja: computed(() => agendaNedelje(lista(store.tabla()?.nedelja), store.sada())),
    };
  }),
  withMethods(store => {
    const api = inject(PregledApi);
    return {
      ucitaj: rxMethod<void>(
        pipe(
          tap(() => patchState(store, setLoading(), { sada: new Date() })),
          switchMap(() =>
            api.kontrolnaTabla({ tiho: true }).pipe(
              tap(tabla => patchState(store, { tabla }, setLoaded())),
              catchError((e: unknown) => {
                patchState(store, setError(e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM));
                return of(null);
              }),
            ),
          ),
        ),
      ),
    };
  }),
);
