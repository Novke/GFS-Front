import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, EMPTY, forkJoin, pipe, switchMap, tap } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { setError, setLoaded, setLoading, withRequestStatus } from '../../../shared/store/request-status.feature';
import { DomaciApi } from '../../domaci/data-access/domaci.api';
import { podrazumevanaListaDomacih } from '../../domaci/data-access/domaci-lista.store';
import { PredavanjaApi } from '../../predavanja/data-access/predavanja.api';
import { podrazumevanaListaPredavanja } from '../../predavanja/data-access/predavanja-lista.store';
import { TestoviApi } from '../../testovi/data-access/testovi.api';
import { podrazumevanaListaTestova } from '../../testovi/data-access/testovi-lista.store';
import { PredmetiApi, sveStrane, VELICINA_STRANE } from './predmeti.api';
import { grupeSaNastavom, NastavaGodine, PredmetInfo } from './predmeti.models';

type StatusNastave = 'idle' | 'loading' | 'loaded' | 'error';

interface PredmetState {
  id: number | null;
  predmet: PredmetInfo | null;
  /** HTTP status poslednje greške predmeta (404 = ne postoji). */
  statusGreske: number | null;
  /** Godina za koju je `nastava` (ili za koju se učitava). */
  godina: number | null;
  /** Izabrana grupa huba (`?grupa=`); `null` = sve grupe. */
  grupa: number | null;
  nastava: NastavaGodine | null;
  statusNastave: StatusNastave;
  greskaNastave: string | null;
}

const PRAZNA_NASTAVA: NastavaGodine = { predavanja: [], domaci: [], testovi: [] };

function poruka(e: unknown): string {
  return e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM;
}

/**
 * Hub predmeta (`/predmeti/:id/...`): predmet (`GET predmeti/{id}`) i sva nastava predmeta u izabranoj školskoj godini
 * (predavanja, domaći, testovi svih grupa, sve strane, po datumu). Provajduje se u `PredmetHub`, pa ga tabovi dele: H1
 * vremenska linija, H3 prosek po tipu, birač grupe (grupe sa nastavom) i tab Studenti (grupe sa predavanjima).
 * Grupa se ne šalje serveru: filtrira se na frontu, da birač uvek zna sve grupe godine.
 */
export const PredmetStore = signalStore(
  withState<PredmetState>({
    id: null,
    predmet: null,
    statusGreske: null,
    godina: null,
    grupa: null,
    nastava: null,
    statusNastave: 'idle',
    greskaNastave: null,
  }),
  withRequestStatus(),
  withProps(() => ({
    _api: inject(PredmetiApi),
    _predavanja: inject(PredavanjaApi),
    _domaci: inject(DomaciApi),
    _testovi: inject(TestoviApi),
  })),
  withComputed(({ predmet, nastava }) => ({
    naziv: computed(() => predmet()?.naziv?.trim() || 'Predmet'),
    grupe: computed(() => grupeSaNastavom(nastava() ?? PRAZNA_NASTAVA)),
  })),
  withMethods(store => {
    const ucitajPredmet = rxMethod<number>(
      pipe(
        tap(() => patchState(store, setLoading())),
        switchMap(id =>
          store._api.get(id, { tiho: true }).pipe(
            tap(predmet => patchState(store, { predmet, statusGreske: null }, setLoaded())),
            catchError((e: unknown) => {
              patchState(store, { statusGreske: e instanceof HttpErrorResponse ? e.status : null }, setError(poruka(e)));
              return EMPTY;
            }),
          ),
        ),
      ),
    );

    const ucitajNastavu = rxMethod<{ id: number; godina: number }>(
      pipe(
        tap(() => patchState(store, { statusNastave: 'loading', greskaNastave: null })),
        switchMap(({ id, godina }) => {
          const strana = { sort: 'datum,asc', velicina: VELICINA_STRANE };
          const p = podrazumevanaListaPredavanja();
          const d = podrazumevanaListaDomacih();
          const t = podrazumevanaListaTestova();
          return forkJoin({
            predavanja: sveStrane(n =>
              store._predavanja.pretraga({ ...p, ...strana, strana: n, filteri: { ...p.filteri, predmet: id, godina } }, { tiho: true }),
            ),
            domaci: sveStrane(n => store._domaci.pretraga({ ...d, ...strana, strana: n, filteri: { ...d.filteri, predmet: id, godina } }, { tiho: true })),
            testovi: sveStrane(n => store._testovi.pretraga({ ...t, ...strana, strana: n, filteri: { ...t.filteri, predmet: id, godina } }, { tiho: true })),
          }).pipe(
            tap(nastava => patchState(store, { nastava, statusNastave: 'loaded' })),
            catchError((e: unknown) => {
              patchState(store, { statusNastave: 'error', greskaNastave: poruka(e) });
              return EMPTY;
            }),
          );
        }),
      ),
    );

    return {
      /** Predmet i nastava godine; drugi predmet ili druga godina brišu stari prikaz (da se ne vidi tuđa nastava). */
      ucitaj(id: number, godina: number): void {
        const noviPredmet = id !== store.id();
        if (noviPredmet) {
          patchState(store, { id, predmet: null, statusGreske: null });
          ucitajPredmet(id);
        }
        if (noviPredmet || godina !== store.godina() || store.statusNastave() === 'idle') {
          patchState(store, { godina, nastava: null });
          ucitajNastavu({ id, godina });
        }
      },
      postaviGrupu(grupa: number | null): void {
        patchState(store, { grupa });
      },
      osveziPredmet(): void {
        const id = store.id();
        if (id !== null) {
          ucitajPredmet(id);
        }
      },
      osveziNastavu(): void {
        const id = store.id();
        const godina = store.godina();
        if (id !== null && godina !== null) {
          ucitajNastavu({ id, godina });
        }
      },
    };
  }),
);
export type PredmetStore = InstanceType<typeof PredmetStore>;
