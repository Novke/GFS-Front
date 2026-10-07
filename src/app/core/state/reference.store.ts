import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Signal, untracked } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, Subscription } from 'rxjs';

import { setError, setLoaded, setLoading, withRequestStatus } from '../../shared/store/request-status.feature';
import { PORUKA_SISTEM, toApiError } from '../api/api-error';
import { GrupaInfo, PredmetInfo, ReferenceApi, TipTestaInfo } from '../api/reference.api';

export type ReferentniResurs = 'predmeti' | 'grupe' | 'tipovi';

/** `ne` = niko ga još nije tražio (ništa se ne učitava ni posle `invalidiraj`). */
type Stanje = 'ne' | 'ucitava' | 'ucitano' | 'greska';

interface ReferenceState {
  predmeti: PredmetInfo[];
  grupe: GrupaInfo[];
  _tipovi: Record<number, TipTestaInfo[]>;
}

const PRAZNO: readonly TipTestaInfo[] = [];

function porukaGreske(e: unknown): string {
  return e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM;
}

/**
 * Referentni podaci (predmeti, grupe, tipovi testa po predmetu), keširani za celu aplikaciju.
 *
 * Lenj: ne učitava ništa dok neko ne pozove `ucitaj()` ili `tipoviTesta(id)`, pa se na javnoj ruti `/upis` nikad ne
 * instancira (i ne sme se tamo injektovati). `ucitaj()` je idempotentan; posle izmene (nova grupa, predmet, tip) pozovi
 * `invalidiraj(...)`: resurs koji je već bio tražen se odmah ponovo učitava, a zahtev koji je u toku se otkazuje.
 * `status`/`greska` (withRequestStatus) su zbir predmeta i grupa: `loading` dok je bilo koji u toku, inače `error` dok
 * bilo koji ima grešku (uspeh drugog resursa je ne skriva), inače `loaded`. Tipovi testa nemaju zaseban status.
 */
export const ReferenceStore = signalStore(
  { providedIn: 'root' },
  withState<ReferenceState>({ predmeti: [], grupe: [], _tipovi: {} }),
  withRequestStatus(),
  withProps(() => ({
    _api: inject(ReferenceApi),
    // knjigovodstvo zahteva nije stanje (ne prikazuje se); tako tipoviTesta() ne piše signale sinhrono
    _lista: {
      predmeti: { stanje: 'ne' as Stanje, veza: null as Subscription | null, greska: null as string | null },
      grupe: { stanje: 'ne' as Stanje, veza: null as Subscription | null, greska: null as string | null },
    },
    _tipoviZahtevi: new Map<number, { stanje: Stanje; veza: Subscription | null }>(),
    _tipoviSignali: new Map<number, Signal<readonly TipTestaInfo[]>>(),
  })),
  withMethods(store => {
    /** Zbirni status predmeta i grupa (vidi opis store-a). */
    const azurirajStatus = () => {
      const liste = Object.values(store._lista);
      const saGreskom = liste.find(l => l.stanje === 'greska');
      if (liste.some(l => l.stanje === 'ucitava')) {
        patchState(store, setLoading());
      } else if (saGreskom) {
        patchState(store, setError(saGreskom.greska ?? PORUKA_SISTEM));
      } else if (liste.some(l => l.stanje === 'ucitano')) {
        patchState(store, setLoaded());
      }
    };

    const pokreniListu = <K extends 'predmeti' | 'grupe'>(kljuc: K, izvor: Observable<ReferenceState[K]>) => {
      const l = store._lista[kljuc];
      l.veza?.unsubscribe();
      l.stanje = 'ucitava';
      l.greska = null;
      azurirajStatus();
      l.veza = izvor.subscribe({
        next: lista => {
          l.stanje = 'ucitano';
          patchState(store, { [kljuc]: lista ?? [] } as Partial<ReferenceState>);
          azurirajStatus();
        },
        error: (e: unknown) => {
          l.stanje = 'greska';
          l.greska = porukaGreske(e);
          azurirajStatus();
        },
      });
    };

    const ucitajListu = (kljuc: 'predmeti' | 'grupe') =>
      pokreniListu(kljuc, kljuc === 'predmeti' ? store._api.predmeti() : store._api.grupe());

    const pokreniTipove = (predmetId: number) => {
      const z = store._tipoviZahtevi.get(predmetId) ?? { stanje: 'ne' as Stanje, veza: null };
      z.veza?.unsubscribe();
      z.stanje = 'ucitava';
      store._tipoviZahtevi.set(predmetId, z);
      z.veza = store._api.tipoviTesta(predmetId).subscribe({
        next: tipovi => {
          z.stanje = 'ucitano';
          patchState(store, s => ({ _tipovi: { ...s._tipovi, [predmetId]: tipovi ?? [] } }));
        },
        // bez automatskog ponavljanja: tipoviTesta() se zove iz šablona, pa bi ponavljanje bila oluja zahteva
        error: () => (z.stanje = 'greska'),
      });
    };

    return {
      /** Učitava predmete i grupe ako još nisu učitani (ili je prošli pokušaj pao). */
      ucitaj(): void {
        for (const kljuc of ['predmeti', 'grupe'] as const) {
          const stanje = store._lista[kljuc].stanje;
          if (stanje === 'ne' || stanje === 'greska') {
            ucitajListu(kljuc);
          }
        }
      },
      /**
       * Tipovi testa predmeta (prazan niz dok ne stignu). Prvi poziv za predmet pokreće učitavanje; sme se zvati iz
       * šablona i `computed`-a. Posle greške vraća prazan niz dok se ne pozove `invalidiraj('tipovi', id)`.
       */
      tipoviTesta(predmetId: number): Signal<readonly TipTestaInfo[]> {
        if (!Number.isSafeInteger(predmetId) || predmetId < 1) {
          return computed(() => PRAZNO);
        }
        if (!store._tipoviZahtevi.has(predmetId)) {
          // zove se iz šablona/computed/effect-a: pokretanje zahteva ne sme da pravi reaktivnu zavisnost
          untracked(() => pokreniTipove(predmetId));
        }
        let s = store._tipoviSignali.get(predmetId);
        if (!s) {
          s = computed(() => store._tipovi()[predmetId] ?? PRAZNO);
          store._tipoviSignali.set(predmetId, s);
        }
        return s;
      },
      /** Posle izmene: ponovo učitava resurs ako ga je neko već tražio. Za `tipovi` bez id-a važi za sve predmete. */
      invalidiraj(resurs: ReferentniResurs, predmetId?: number): void {
        if (resurs === 'tipovi') {
          const ids = predmetId === undefined ? [...store._tipoviZahtevi.keys()] : [predmetId];
          ids.filter(id => store._tipoviZahtevi.has(id)).forEach(pokreniTipove);
          return;
        }
        if (store._lista[resurs].stanje !== 'ne') {
          ucitajListu(resurs);
        }
      },
    };
  }),
  withHooks({
    onDestroy(store) {
      store._lista.predmeti.veza?.unsubscribe();
      store._lista.grupe.veza?.unsubscribe();
      store._tipoviZahtevi.forEach(z => z.veza?.unsubscribe());
    },
  }),
);

export type ReferenceStore = InstanceType<typeof ReferenceStore>;
