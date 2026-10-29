import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, DOCUMENT, inject } from '@angular/core';
import { Router } from '@angular/router';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../api/api-error';
import { BrojObavestenja, NAJVISE_OTVORENIH, ObavestenjaApi, ObavestenjeInfo } from '../api/obavestenja.api';
import { periodicnoOsvezavanje } from './periodicno-osvezavanje';

export type StatusObavestenja = 'idle' | 'loading' | 'loaded' | 'error';

interface ObavestenjaState {
  broj: BrojObavestenja;
  /** Prvih {@link NAJVISE_OTVORENIH} otvorenih (nerešenih), najnovija prva. */
  otvorena: ObavestenjeInfo[];
  status: StatusObavestenja;
  greska: string | null;
}

const ceo = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const isti = (a: BrojObavestenja, b: BrojObavestenja) => a.neprocitana === b.neprocitana && a.otvorena === b.otvorena;
/** Vrednost "pročitano" koju prikaz zna odmah posle klika (pravu vrednost daje osvežavanje). */
const SADA = () => new Date().toISOString();

/**
 * Obaveštenja za nastavnika (spec prijave, sekcija 6): broj za značku u gornjoj traci i prvih 10 otvorenih za padajuću
 * listu i karticu "Obaveštenja" na Početnoj (root).
 *
 * - **Broj** se osvežava istim ritmom kao `DashboardCountsStore` (`periodicnoOsvezavanje`: posle navigacije najviše jednom u
 *   15 s, na 60 s dok je tab vidljiv), ali tek kad ga `pokreni` uključi, i samo dok živi ono što ga je uključilo (zvono u
 *   gornjoj traci, dakle ljuska). Zato ništa od ovoga ne radi na javnim rutama (`upis`, `uzivo`, `nalog`) ni na `/prijava`
 *   posle odjave. Greške broja su tihe; broj ostaje poslednji poznat.
 * - **Lista** se učitava na zahtev (`ucitaj`: otvaranje liste, Početna); kad je učitana, a broj se promeni, učitava se ponovo.
 * - **Akcije** (`procitano`, `reseno`, `procitajSve`) odmah menjaju prikaz, greška ide u snackbar (zahtev nije tih), a posle
 *   odgovora (i greške) lista i broj se učitavaju ponovo, pa važi stanje servera.
 */
export const ObavestenjaStore = signalStore(
  { providedIn: 'root' },
  withState<ObavestenjaState>({ broj: { neprocitana: 0, otvorena: 0 }, otvorena: [], status: 'idle', greska: null }),
  withProps(() => ({
    _api: inject(ObavestenjaApi),
    _router: inject(Router),
    _document: inject(DOCUMENT),
    _r: {
      poslednje: Number.NEGATIVE_INFINITY,
      broj: null as Subscription | null,
      lista: null as Subscription | null,
      periodicno: null as Subscription | null,
    },
  })),
  withMethods(store => {
    const ucitajListu = (): void => {
      store._r.lista?.unsubscribe();
      patchState(store, { status: 'loading' });
      store._r.lista = store._api.otvorena({ tiho: true }).subscribe({
        next: strana =>
          patchState(store, {
            otvorena: (Array.isArray(strana?.content) ? strana.content : []).slice(0, NAJVISE_OTVORENIH),
            status: 'loaded',
            greska: null,
          }),
        error: (e: unknown) =>
          patchState(store, { status: 'error', greska: e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM }),
      });
    };

    /** `saListom`: kad se broj promeni, a lista je učitana, i nju (ne kad `ucitaj` ionako učitava obe). */
    const osveziBroj = (saListom: boolean): void => {
      store._r.poslednje = Date.now();
      store._r.broj?.unsubscribe();
      store._r.broj = store._api.broj({ tiho: true }).subscribe({
        next: b => {
          const novi = { neprocitana: ceo(b?.neprocitana), otvorena: ceo(b?.otvorena) };
          const promena = !isti(novi, store.broj());
          patchState(store, { broj: novi });
          if (saListom && promena && store.status() === 'loaded') {
            ucitajListu();
          }
        },
        error: () => undefined,
      });
    };

    const ucitaj = (): void => {
      ucitajListu();
      osveziBroj(false);
    };

    /** Zahtev akcije; posle odgovora (i greške, koju je već prikazao snackbar) važi stanje servera. */
    const akcija = (zahtev: Observable<unknown>): void => {
      zahtev.subscribe({ complete: ucitaj, error: ucitaj });
    };

    const nadji = (id: number) => store.otvorena().find(o => o.id === id);

    return {
      /**
       * Uključuje osvežavanje broja dok `trajanje` (npr. `DestroyRef` zvona u gornjoj traci) ne istekne; odmah učitava broj.
       * Drugi poziv dok osvežavanje radi ne pravi drugi tajmer.
       */
      pokreni(trajanje: DestroyRef): void {
        if (store._r.periodicno) {
          return;
        }
        osveziBroj(true);
        const periodicno = periodicnoOsvezavanje({
          router: store._router,
          document: store._document,
          osvezi: () => osveziBroj(true),
          poslednje: () => store._r.poslednje,
        });
        store._r.periodicno = periodicno;
        trajanje.onDestroy(() => {
          periodicno.unsubscribe();
          store._r.broj?.unsubscribe();
          if (store._r.periodicno === periodicno) {
            store._r.periodicno = null;
          }
        });
      },

      /** Broj (za značku) sada, van ritma. */
      osveziBroj: () => osveziBroj(true),

      /** Lista otvorenih i broj. */
      ucitaj,

      procitano(id: number): void {
        const o = nadji(id);
        if (o?.procitano) {
          return;
        }
        if (o) {
          patchState(store, s => ({
            otvorena: s.otvorena.map(x => (x.id === id ? { ...x, procitano: SADA() } : x)),
            broj: { ...s.broj, neprocitana: Math.max(0, s.broj.neprocitana - 1) },
          }));
        }
        akcija(store._api.procitano(id));
      },

      reseno(id: number): void {
        const o = nadji(id);
        if (o) {
          patchState(store, s => ({
            otvorena: s.otvorena.filter(x => x.id !== id),
            broj: {
              neprocitana: Math.max(0, s.broj.neprocitana - (o.procitano ? 0 : 1)),
              otvorena: Math.max(0, s.broj.otvorena - 1),
            },
          }));
        }
        akcija(store._api.reseno(id));
      },

      procitajSve(): void {
        const sada = SADA();
        patchState(store, s => ({
          otvorena: s.otvorena.map(x => (x.procitano ? x : { ...x, procitano: sada })),
          broj: { ...s.broj, neprocitana: 0 },
        }));
        akcija(store._api.procitajSve());
      },
    };
  }),
);

export type ObavestenjaStore = InstanceType<typeof ObavestenjaStore>;
