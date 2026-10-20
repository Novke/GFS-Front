import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

import { AuthApi } from './auth.api';

export type StatusSesije = 'nepoznato' | 'prijavljen' | 'odjavljen';

export interface SesijaState {
  status: StatusSesije;
  korisnik: string | null;
}

const ODJAVLJEN: SesijaState = { status: 'odjavljen', korisnik: null };

/**
 * Sesija nastavnika u ovom pregledaču (root). Kolačić `gfs_nastavnik` je `HttpOnly`, pa front zna za sesiju samo iz
 * `GET api/auth/ja`: `proveri` ga šalje **jednom** (paralelni pozivi dele isti zahtev), a uspeh se kešira dok ga
 * `ponisti` (401 sa nastavničkog API-ja, `sesijaInterceptor`) ili `odjavi` ne obore. Posle 401 sledeća provera opet pita
 * server (nastavnik se možda prijavio u drugoj kartici).
 *
 * Mrežna greška ili 5xx nisu odjava: status ostaje `nepoznato` i `proveri` daje `true`, pa čuvar pušta stranicu, a server
 * (koji jedini odlučuje) na prvom zahtevu vrati 401 ako sesije stvarno nema. Tako restart backenda (deploy) ne izbacuje
 * nastavnika na prijavu.
 *
 * Ne instancira se na javnim rutama (`upis`, `uzivo`, `nalog`): injektuju ga čuvar ruta, stranica `/prijava` i interceptor
 * tek na 401 nastavničkog API-ja.
 */
export const SesijaStore = signalStore(
  { providedIn: 'root' },
  withState<SesijaState>({ status: 'nepoznato', korisnik: null }),
  withProps(() => ({
    _api: inject(AuthApi),
    /** Provera u toku (deli se) i generacija: odgovor provere poslate pre `ponisti`/`odjavi` se ne primenjuje. */
    _r: { provera: null as Promise<boolean> | null, generacija: 0 },
  })),
  withComputed(store => ({
    prijavljen: computed(() => store.status() === 'prijavljen'),
  })),
  withMethods(store => {
    const zaboravi = (): void => {
      store._r.generacija++;
      store._r.provera = null;
    };
    return {
      /** `true` dok nije poznato da je nastavnik odjavljen; `false` samo posle 401 na `GET api/auth/ja`. */
      proveri(): Promise<boolean> {
        if (store.status() === 'prijavljen') {
          return Promise.resolve(true);
        }
        if (store._r.provera) {
          return store._r.provera;
        }
        const generacija = store._r.generacija;
        const provera = firstValueFrom(store._api.ja()).then(
          ja => {
            if (generacija === store._r.generacija) {
              patchState(store, { status: 'prijavljen', korisnik: ja.korisnik });
            }
          },
          (e: unknown) => {
            if (generacija === store._r.generacija && e instanceof HttpErrorResponse && e.status === 401) {
              patchState(store, ODJAVLJEN);
            }
          },
        ).then(() => {
          if (store._r.provera === provera) {
            store._r.provera = null;
          }
          return store.status() !== 'odjavljen';
        });
        store._r.provera = provera;
        return provera;
      },

      /** Prijava; greška (401, 429, 503, mreža) se prosleđuje kao `HttpErrorResponse`, stanje ostaje kakvo je bilo. */
      async prijavi(korisnik: string, lozinka: string): Promise<void> {
        await firstValueFrom(store._api.prijavi(korisnik, lozinka), { defaultValue: undefined });
        zaboravi();
        patchState(store, { status: 'prijavljen', korisnik });
      },

      /**
       * Odjava ovog uređaja. 401 znači da sesije već nema (isto kao uspeh); svaka druga greška se prosleđuje, a stanje
       * ostaje prijavljen, jer kolačić na serveru i dalje važi.
       */
      async odjavi(): Promise<void> {
        try {
          await firstValueFrom(store._api.odjavi(), { defaultValue: undefined });
        } catch (e: unknown) {
          if (!(e instanceof HttpErrorResponse && e.status === 401)) {
            throw e;
          }
        }
        zaboravi();
        patchState(store, ODJAVLJEN);
      },

      /** Server je odbio sesiju (401): front je zaboravlja, sledeća provera pita server. */
      ponisti(): void {
        zaboravi();
        patchState(store, ODJAVLJEN);
      },
    };
  }),
);

export type SesijaStore = InstanceType<typeof SesijaStore>;
