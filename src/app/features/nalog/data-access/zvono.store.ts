import { DOCUMENT, inject } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { Subscription } from 'rxjs';

import { naPushPoruku, registrujServiceWorker } from '../../../core/pwa/service-worker';
import { ObavestenjaApi } from './obavestenja.api';
import { StavkaZvona } from './obavestenja.models';
import { OSVEZAVANJE_ZVONA_MS } from './obavestenja.pravila';

interface ZvonoState {
  stavke: StavkaZvona[];
  /** Ima stavki posle poslednjeg otvaranja zvona (server, pa važi za sve uređaje studenta). */
  novo: boolean;
  /** Bar jedno uspešno učitavanje (pre toga zvona nema: student možda nije prijavljen). */
  ucitano: boolean;
  greska: boolean;
  otvoren: boolean;
}

/**
 * Zvono studenta (spec „Aplikacija i obaveštenja“ 6.8): sopstveni mali store, daje ga sama komponenta zvona (`providers`),
 * jer `PublicLayout` ne ubrizgava store, a nastavnički `NotificationStore` je za snackbar. Zove samo
 * `api/public/nalog/obavestenja*`. Osvežava se pri otvaranju, kad se stranica vrati u prvi plan, na 2 min dok je vidljiva i
 * odmah kad service worker javi da je stigao push. Posle prvog uspešnog učitavanja (student je prijavljen) registruje
 * service worker. 401 i greška mreže ne prikazuju ništa: stranica sama vodi na prijavu.
 */
export const ZvonoStore = signalStore(
  withState<ZvonoState>({ stavke: [], novo: false, ucitano: false, greska: false, otvoren: false }),
  withProps(() => ({
    _api: inject(ObavestenjaApi),
    _dokument: inject(DOCUMENT),
    _veze: { lista: null as Subscription | null, otvoreno: null as Subscription | null, ukloni: null as (() => void) | null },
  })),
  withMethods(store => {
    const ucitaj = (): void => {
      if (store._veze.lista && !store._veze.lista.closed) {
        return;
      }
      store._veze.lista = store._api.zvono().subscribe({
        next: z => {
          const prvo = !store.ucitano();
          // dok je zvono otvoreno, nove stavke su viđene: tačka se ne pali
          patchState(store, { stavke: z?.stavke ?? [], novo: !!z?.novo && !store.otvoren(), ucitano: true, greska: false });
          if (store.otvoren() && z?.novo) {
            oznaciOtvoreno();
          }
          if (prvo) {
            void registrujServiceWorker(store._dokument);
          }
        },
        error: () => patchState(store, { greska: true }),
      });
    };

    const oznaciOtvoreno = (): void => {
      store._veze.otvoreno?.unsubscribe();
      store._veze.otvoreno = store._api.otvoreno().subscribe({ error: () => undefined });
    };

    return {
      ucitaj,
      otvori(): void {
        const bilo = store.novo();
        patchState(store, { otvoren: true, novo: false });
        if (bilo) {
          oznaciOtvoreno();
        }
        ucitaj();
      },
      zatvori(): void {
        patchState(store, { otvoren: false });
      },
    };
  }),
  withHooks({
    onInit(store) {
      const dok = store._dokument;
      const naVidljivost = () => {
        if (dok.visibilityState === 'visible') {
          store.ucitaj();
        }
      };
      const tajmer = setInterval(() => {
        if (dok.visibilityState === 'visible') {
          store.ucitaj();
        }
      }, OSVEZAVANJE_ZVONA_MS);
      dok.addEventListener('visibilitychange', naVidljivost);
      const odjavaSw = naPushPoruku(() => store.ucitaj());
      store._veze.ukloni = () => {
        clearInterval(tajmer);
        dok.removeEventListener('visibilitychange', naVidljivost);
        odjavaSw();
      };
      store.ucitaj();
    },
    onDestroy(store) {
      store._veze.ukloni?.();
      store._veze.lista?.unsubscribe();
      store._veze.otvoreno?.unsubscribe();
    },
  }),
);
