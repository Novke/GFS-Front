import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { naPushPoruku } from '../../../core/pwa/service-worker';
import { AnketeStudentaApi } from './ankete-studenta.api';
import { AnketaStudentu } from './ankete-studenta.models';
import { istiIzbor, prebaciIzbor, zaIskakanje } from './ankete-studenta.pravila';

const PORUKA_MREZA = 'Glas nije poslat. Proveri internet i pokušaj ponovo.';

interface Stanje {
  ankete: AnketaStudentu[];
  /** Lokalni trenutak poslednjeg odgovora (odbrojavanje po satu servera, `sadaMs`). */
  primljenoMs: number;
  /** Sklonjene sa "Kasnije" (ne iskaču ponovo; kartica ostaje). */
  sklonjene: number[];
  /** Anketa u listu bez obzira na pravilo iskakanja ("Glasaj" sa kartice, posle glasa). */
  prikazana: number | null;
  /** Kućice pre slanja (više odgovora), po anketi. */
  izbor: Record<number, number[]>;
  /** Glas u toku (id ankete). */
  salje: number | null;
  greska: string | null;
}

const POCETNO: Stanje = { ankete: [], primljenoMs: 0, sklonjene: [], prikazana: null, izbor: {}, salje: null, greska: null };

/**
 * Ankete studenta (spec brze ankete 6.3), jedan za ceo nalog i telefon u prezentaciji: hrane ga `CasStanje.ankete` (ljuska
 * tabova i tab Čas), `GET public/nalog/ankete` (telefon u prezentaciji, `app-anketa-list izvor="uzivo"`) i poruka service
 * worker-a kad stigne push (odmah `GET ankete`). Bira anketu za donji list, šalje i menja glas.
 */
export const AnketeStudentaStore = signalStore(
  { providedIn: 'root' },
  withState<Stanje>(POCETNO),
  withProps(() => ({
    _api: inject(AnketeStudentaApi),
    _veze: { osvezavanje: null as Subscription | null, odjava: null as (() => void) | null },
  })),
  withComputed(store => ({
    /** Anketa u donjem listu (ili `null`). */
    list: computed(() => {
      const p = store.prikazana();
      return store.ankete().find(a => a.id === p) ?? zaIskakanje(store.ankete(), store.sklonjene());
    }),
  })),
  withMethods(store => {
    const zameni = (a: AnketaStudentu) =>
      store.ankete().some(x => x.id === a.id) ? store.ankete().map(x => (x.id === a.id ? a : x)) : [a, ...store.ankete()];

    return {
      /** Novi skup sa servera; `undefined` (stari backend bez polja) ne menja ništa. */
      primi(lista: AnketaStudentu[] | null | undefined): void {
        if (lista === undefined) {
          return;
        }
        const ankete = lista ?? [];
        const p = store.prikazana();
        const postoji = (id: number) => ankete.some(a => a.id === id);
        patchState(store, {
          ankete, primljenoMs: Date.now(), prikazana: p !== null && postoji(p) ? p : null,
          sklonjene: store.sklonjene().filter(postoji),
        });
      },

      /** `GET ankete` odmah (push, povratak u prvi plan); greška ostavlja poslednji skup. */
      osvezi(): void {
        const v = store._veze;
        if (v.osvezavanje && !v.osvezavanje.closed) {
          return;
        }
        v.osvezavanje = store._api.ankete().subscribe({ next: l => this.primi(l), error: () => undefined });
      },

      /** "Glasaj" / "Promeni glas" sa kartice: list sa tom anketom. */
      otvori(id: number): void {
        patchState(store, { prikazana: id, greska: null, sklonjene: store.sklonjene().filter(x => x !== id) });
      },

      /** "Kasnije" / "Zatvori": list nestaje do sledeće nove ankete. */
      skloni(): void {
        const a = store.list();
        if (a) {
          patchState(store, { prikazana: null, greska: null, sklonjene: [...store.sklonjene().filter(x => x !== a.id), a.id] });
        }
      },

      /** Kućica (više odgovora): izbor pre "Pošalji", polazi od poslatog glasa. */
      izaberi(a: AnketaStudentu, i: number): void {
        const pre = store.izbor()[a.id] ?? a.mojGlas ?? [];
        patchState(store, { izbor: { ...store.izbor(), [a.id]: prebaciIzbor(pre, i) }, greska: null });
      },

      glasaj(a: AnketaStudentu, opcije: number[]): void {
        if (store.salje() !== null || !a.otvorena || istiIzbor(a.mojGlas, opcije)) {
          return;
        }
        patchState(store, { salje: a.id, greska: null, prikazana: a.id });
        store._api.glasaj(a.id, opcije).subscribe({
          next: nova => {
            const izbor = { ...store.izbor() };
            delete izbor[a.id];
            patchState(store, { ankete: zameni(nova), salje: null, izbor, primljenoMs: Date.now() });
          },
          error: (e: unknown) => {
            const http = e instanceof HttpErrorResponse ? e : null;
            const poruka = http ? (http.status === 0 ? PORUKA_MREZA : toApiError(http).reason) : PORUKA_SISTEM;
            patchState(store, { salje: null, greska: poruka });
            if (http && [403, 404, 409].includes(http.status)) {
              this.osvezi(); // zatvorena ili nestala: list pokazuje novo stanje
            }
          },
        });
      },
    };
  }),
  withHooks({
    onInit(store) {
      store._veze.odjava = naPushPoruku(() => store.osvezi());
    },
    onDestroy(store) {
      store._veze.odjava?.();
      store._veze.osvezavanje?.unsubscribe();
    },
  }),
);
