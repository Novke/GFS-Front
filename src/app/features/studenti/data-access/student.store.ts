import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { catchError, firstValueFrom, map, Observable, of, Subscription, switchMap } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import {
  BeleskaInfo,
  StudentiApi,
  StudentListItem,
  StudentNaPredmetuDetails,
  StudentPredmetKartica,
  StudentPregledDetails,
} from '../../../core/api/studenti.api';
import { NotificationStore } from '../../../core/state/notification.store';
import { setError, setLoaded, setLoading, withRequestStatus } from '../../../shared/store/request-status.feature';
import { Strana } from '../../../shared/models/strana';
import { formatIndeks } from '../../../shared/util/indeks.pipe';
import { hronologija, punoIme, redosledStudenata, susedi } from './studenti.models';

/** Najviše studenata koje `studenti/pretraga` vraća u jednoj strani; toliko se traži pri nalaženju zaglavlja po indeksu. */
const MAX_STRANA = 100;

/** Stanje dela ekrana koji se učitava zasebno (kartice, beleške). */
export type StanjeDela = 'idle' | 'loading' | 'loaded' | 'error';

interface StudentState {
  id: number | null;
  podaci: StudentPregledDetails | null;
  /** Red iz `pretraga` (godina upisa, kontakt, grupa sa id-jem); `null` dok se ne učita ili ako ga nema. */
  zaglavlje: StudentListItem | null;
  zaglavljeUcitano: boolean;
  /** Studenti grupe po redosledu indeksa (za prethodni/sledeći); prazno bez grupe ili posle greške. */
  redosled: { id: number }[];
  kartice: StudentPredmetKartica[] | null;
  karticeStatus: StanjeDela;
  karticeGreska: string | null;
  beleske: BeleskaInfo[] | null;
  beleskeStatus: StanjeDela;
  beleskeGreska: string | null;
}

const POCETNO: StudentState = {
  id: null,
  podaci: null,
  zaglavlje: null,
  zaglavljeUcitano: false,
  redosled: [],
  kartice: null,
  karticeStatus: 'idle',
  karticeGreska: null,
  beleske: null,
  beleskeStatus: 'idle',
  beleskeGreska: null,
};

function porukaGreske(e: unknown): string {
  return e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM;
}

/**
 * Profil studenta (`/studenti/:id` i tabovi). `ucitaj(id)` učitava `GET studenti/{id}` (glavni zahtev, greška ide u panel)
 * i posle njega, tiho, zaglavlje (`pretraga` po indeksu daje godinu upisa, kontakt i grupu sa id-jem, jer
 * `StudentPregledDetails` toga nema) i studente grupe (`GET grupe/{id}`, za prethodni/sledeći). Neuspeh zaglavlja ne
 * ruši profil: godina i kontakt su `—`. Kartice po predmetu i beleške učitavaju tabovi (`ucitajKartice`,
 * `ucitajBeleske`: idempotentno po studentu). Promena `id` otkazuje sve zahteve u toku; ista komponenta se koristi za
 * sve studente. Ponovno učitavanje istog studenta (posle izmene) ne prazni ekran.
 */
export const StudentStore = signalStore(
  withState<StudentState>(POCETNO),
  withRequestStatus(),
  withProps(() => ({
    _api: inject(StudentiApi),
    _obavestenja: inject(NotificationStore),
    _veze: { glavna: null as Subscription | null, zaglavlje: null as Subscription | null, kartice: null as Subscription | null, beleske: null as Subscription | null },
  })),
  withComputed(({ id, podaci, zaglavlje, redosled }) => ({
    ime: computed(() => {
      const p = podaci();
      return p ? punoIme(p) : '';
    }),
    /** `GD12/2025`; dok zaglavlje nije stiglo (ili godine nema) samo indeks. */
    indeks: computed(() => formatIndeks(podaci()?.indeks, zaglavlje()?.godina)),
    hronologija: computed(() => {
      const p = podaci();
      return p ? hronologija(p) : [];
    }),
    susedi: computed(() => susedi(redosled(), id() ?? -1)),
  })),
  withMethods(store => {
    const zatvori = (kljucevi: (keyof typeof store._veze)[]) => {
      for (const k of kljucevi) {
        store._veze[k]?.unsubscribe();
        store._veze[k] = null;
      }
    };

    /** Zaglavlje i redosled grupe; svaki korak je tih i neuspeh ostavlja `null`/prazno. */
    const ucitajZaglavlje = (id: number, d: StudentPregledDetails) => {
      zatvori(['zaglavlje']);
      const indeks = d.indeks?.trim();
      const trazi$: Observable<Strana<StudentListItem> | null> = indeks ? store._api.pretraga({ q: indeks, size: MAX_STRANA }, { tiho: true }) : of(null);
      store._veze.zaglavlje = trazi$
        .pipe(
          map(strana => strana?.content?.find(s => s.id === id) ?? null),
          catchError(() => of(null)),
          switchMap(z =>
            z?.grupa
              ? store._api.grupa(z.grupa.id, { tiho: true }).pipe(
                  map(g => ({ z, redosled: redosledStudenata(g?.studenti ?? []).map(s => ({ id: s.id })) })),
                  catchError(() => of({ z, redosled: [] as { id: number }[] })),
                )
              : of({ z, redosled: [] as { id: number }[] }),
          ),
        )
        .subscribe(({ z, redosled }) => patchState(store, { zaglavlje: z, zaglavljeUcitano: true, redosled }));
    };

    const ucitajKartice = (osvezi = false) => {
      const id = store.id();
      const stanje = store.karticeStatus();
      if (id === null || (!osvezi && stanje !== 'idle')) {
        return;
      }
      zatvori(['kartice']);
      patchState(store, { karticeStatus: 'loading', karticeGreska: null });
      store._veze.kartice = store._api.predmeti(id, { tiho: true }).subscribe({
        next: kartice => patchState(store, { kartice: kartice ?? [], karticeStatus: 'loaded' }),
        error: (e: unknown) => patchState(store, { karticeStatus: 'error', karticeGreska: porukaGreske(e) }),
      });
    };

    const ucitajBeleske = (osvezi = false) => {
      const id = store.id();
      const stanje = store.beleskeStatus();
      if (id === null || (!osvezi && stanje !== 'idle')) {
        return;
      }
      zatvori(['beleske']);
      patchState(store, { beleskeStatus: 'loading', beleskeGreska: null });
      store._veze.beleske = store._api.beleske(id, { tiho: true }).subscribe({
        next: beleske => patchState(store, { beleske: beleske ?? [], beleskeStatus: 'loaded' }),
        error: (e: unknown) => patchState(store, { beleskeStatus: 'error', beleskeGreska: porukaGreske(e) }),
      });
    };

    /** Zahtev za izmenu beleške; greška ide u snackbar (interceptor) i daje `false`. */
    async function izvrsi<T>(zahtev: Promise<T>): Promise<{ ok: true; vrednost: T } | { ok: false }> {
      try {
        return { ok: true, vrednost: await zahtev };
      } catch {
        return { ok: false };
      }
    }

    return {
      ucitaj(id: number): void {
        const isti = store.id() === id;
        zatvori(['glavna', 'zaglavlje', 'kartice', 'beleske']);
        // zahtev koji je otkazan ne sme da ostavi deo ekrana u `loading`: ide na `idle`, pa ga tab učitava ponovo
        patchState(store, s => ({
          karticeStatus: s.karticeStatus === 'loading' ? 'idle' : s.karticeStatus,
          beleskeStatus: s.beleskeStatus === 'loading' ? 'idle' : s.beleskeStatus,
        }));
        if (!isti) {
          patchState(store, { ...POCETNO, id }, setLoading());
        }
        // isti student (osvežavanje): stari prikaz ostaje, a tabovi koji su već učitani se učitavaju ponovo
        store._veze.glavna = store._api.get(id, { tiho: true }).subscribe({
          next: d => {
            patchState(store, { podaci: d }, setLoaded());
            ucitajZaglavlje(id, d);
            if (isti) {
              if (store.kartice() !== null) {
                ucitajKartice(true);
              }
              if (store.beleske() !== null) {
                ucitajBeleske(true);
              }
            }
          },
          error: (e: unknown) => patchState(store, setError(porukaGreske(e))),
        });
      },
      ucitajKartice,
      ucitajBeleske,

      /** Dodaje belešku na početak liste; `false` kad server odbije (poruka je već u snackbaru). */
      async dodajBelesku(tekst: string): Promise<boolean> {
        const id = store.id();
        if (id === null) {
          return false;
        }
        const r = await izvrsi(firstValueFrom(store._api.dodajBelesku(id, tekst)));
        if (!r.ok) {
          return false;
        }
        if (store.id() === id) {
          patchState(store, s => ({ beleske: [r.vrednost, ...(s.beleske ?? [])] }));
        }
        store._obavestenja.uspeh('Beleška je dodata.');
        return true;
      },

      async izmeniBelesku(beleskaId: number, tekst: string): Promise<boolean> {
        const id = store.id();
        const r = await izvrsi(firstValueFrom(store._api.izmeniBelesku(beleskaId, tekst)));
        if (!r.ok) {
          return false;
        }
        if (store.id() === id) {
          patchState(store, s => ({ beleske: (s.beleske ?? []).map(b => (b.id === beleskaId ? r.vrednost : b)) }));
        }
        store._obavestenja.uspeh('Beleška je sačuvana.');
        return true;
      },

      async obrisiBelesku(beleskaId: number): Promise<boolean> {
        const id = store.id();
        const r = await izvrsi(firstValueFrom(store._api.obrisiBelesku(beleskaId)));
        if (!r.ok) {
          return false;
        }
        if (store.id() === id) {
          patchState(store, s => ({ beleske: (s.beleske ?? []).filter(b => b.id !== beleskaId) }));
        }
        store._obavestenja.uspeh('Beleška je obrisana.');
        return true;
      },
    };
  }),
  withHooks({
    onDestroy(store) {
      for (const veza of Object.values(store._veze)) {
        veza?.unsubscribe();
      }
    },
  }),
);

export type StudentStore = InstanceType<typeof StudentStore>;

interface StudentPredmetState {
  podaci: StudentNaPredmetuDetails | null;
}

/** Student na jednom predmetu (`/studenti/:id/predmeti/:pid`): jedan zahtev, greška u panelu. Promena `id` ili `pid` otkazuje prethodni. */
export const StudentPredmetStore = signalStore(
  withState<StudentPredmetState>({ podaci: null }),
  withRequestStatus(),
  withProps(() => ({ _api: inject(StudentiApi), _r: { veza: null as Subscription | null } })),
  withMethods(store => ({
    ucitaj(id: number, predmetId: number): void {
      store._r.veza?.unsubscribe();
      patchState(store, { podaci: null }, setLoading());
      store._r.veza = store._api.naPredmetu(id, predmetId, { tiho: true }).subscribe({
        next: podaci => patchState(store, { podaci }, setLoaded()),
        error: (e: unknown) => patchState(store, setError(porukaGreske(e))),
      });
    },
  })),
  withHooks({
    onDestroy(store) {
      store._r.veza?.unsubscribe();
    },
  }),
);

export type StudentPredmetStore = InstanceType<typeof StudentPredmetStore>;
