import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, Subscription } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { NotificationStore } from '../../../core/state/notification.store';
import { setError, setLoaded, setLoading, withRequestStatus } from '../../../shared/store/request-status.feature';
import { OnboardingApi, OnboardingSesijaDetails, PrijavaInfo, StatusPrijave, UpdatePrijavaCmd } from './onboarding.api';

export type FilterPrijava = 'SVE' | StatusPrijave;

export const FILTERI_PRIJAVA: readonly { vrednost: FilterPrijava; naziv: string }[] = [
  { vrednost: 'SVE', naziv: 'Sve' },
  { vrednost: 'NA_CEKANJU', naziv: 'Na čekanju' },
  { vrednost: 'PRIHVACENA', naziv: 'Prihvaćene' },
  { vrednost: 'ODBIJENA', naziv: 'Odbijene' },
];

/** Query parametar `status` u filter; sve nepoznato (zastareo ili ručno izmenjen link) je `SVE`, bez navigacije. */
export function parseFilterPrijava(v: unknown): FilterPrijava {
  return FILTERI_PRIJAVA.some(f => f.vrednost === v) ? (v as FilterPrijava) : 'SVE';
}

interface SesijaState {
  sesijaId: number | null;
  detalji: OnboardingSesijaDetails | null;
  /** Zbirna poruka poslednje akcije (`OnboardingSesijaDetails.poruka`). */
  poruka: string | null;
  /** Akcija (prihvati, odbij, izmena, prihvati sve) je u toku; druga se ne pokreće. */
  zauzet: boolean;
  /** Prijava u inline izmeni. */
  izmenaId: number | null;
  statusGreske: number | null;
}

function porukaGreske(e: unknown): string {
  return e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM;
}

/**
 * Prijave jedne onboarding sesije (`/grupe/:id/onboarding/:sid`). Jedna akcija u isto vreme; posle greške akcije (npr.
 * 409 "već obrađena") lista se tiho osveži da pokaže stvarno stanje. Odgovor osvežavanja koji je krenuo pre akcije se
 * odbacuje (`_verzija`), a odgovor za prethodnu sesiju posle promene rute takođe (`_generacija`).
 */
export const OnboardingSesijaStore = signalStore(
  withState<SesijaState>({ sesijaId: null, detalji: null, poruka: null, zauzet: false, izmenaId: null, statusGreske: null }),
  withRequestStatus(),
  withProps(() => ({
    _api: inject(OnboardingApi),
    _obavestenja: inject(NotificationStore),
    _brojaci: { generacija: 0, verzija: 0, ucitavanje: null as Subscription | null },
  })),
  withComputed(({ detalji }) => {
    const prijave = computed(() => detalji()?.prijave ?? []);
    return {
      sesija: computed(() => detalji()?.sesija ?? null),
      prijave,
      brojevi: computed(() => {
        const p = prijave();
        return {
          ukupno: p.length,
          naCekanju: p.filter(x => x.status === 'NA_CEKANJU').length,
          prihvacene: p.filter(x => x.status === 'PRIHVACENA').length,
          odbijene: p.filter(x => x.status === 'ODBIJENA').length,
        };
      }),
    };
  }),
  withMethods(store => {
    const b = store._brojaci;

    const primeni = (detalji: OnboardingSesijaDetails) => {
      // prijava koju je neko u međuvremenu obradio više se ne menja
      const izmenaId = store.izmenaId();
      const izmenaVazi = izmenaId !== null && (detalji.prijave ?? []).some(p => p.id === izmenaId && p.status === 'NA_CEKANJU');
      patchState(store, { detalji, izmenaId: izmenaVazi ? izmenaId : null, statusGreske: null }, setLoaded());
    };

    /** Učitavanje koje se ne primenjuje (otkazano, zastarelo, tiho palo) ne ostavlja status 'loading' nad prikazom. */
    const zavrsiUcitavanje = () => {
      if (store.status() === 'loading' && store.detalji()) {
        patchState(store, setLoaded());
      }
    };

    /** `tiho`: automatsko osvežavanje; greška tada ne menja prikaz, samo se zabeleži u konzoli. */
    const osvezi = (tiho = false) => {
      const id = store.sesijaId();
      if (id === null || store.zauzet() || b.ucitavanje) {
        return;
      }
      const g = b.generacija;
      const v = b.verzija;
      if (!tiho) {
        patchState(store, setLoading());
      }
      b.ucitavanje = store._api.sesija(id, { tiho: true }).subscribe({
        next: d => {
          if (g !== b.generacija) {
            return;
          }
          b.ucitavanje = null;
          if (v === b.verzija) {
            primeni(d);
          } else {
            zavrsiUcitavanje();
          }
        },
        error: (e: unknown) => {
          if (g !== b.generacija) {
            return;
          }
          b.ucitavanje = null;
          if (tiho && store.detalji()) {
            // prikaz ostaje; status ne sme da ostane 'loading' od ručnog osvežavanja koje je akcija otkazala
            zavrsiUcitavanje();
            console.error('Osvežavanje prijava nije uspelo', e);
            return;
          }
          patchState(store, { statusGreske: e instanceof HttpErrorResponse ? e.status : null }, setError(porukaGreske(e)));
        },
      });
    };

    /** Jedna akcija na serveru; greška ide u snackbar (globalni interceptor), pa tiho osvežavanje. */
    const izvrsi = <T>(zahtev: Observable<T>, uspeh: (odgovor: T) => void) => {
      if (store.zauzet()) {
        return;
      }
      const g = b.generacija;
      b.verzija++;
      b.ucitavanje?.unsubscribe();
      b.ucitavanje = null;
      zavrsiUcitavanje();
      patchState(store, { zauzet: true });
      zahtev.subscribe({
        next: odgovor => {
          if (g !== b.generacija) {
            return;
          }
          patchState(store, { zauzet: false });
          uspeh(odgovor);
        },
        error: () => {
          if (g !== b.generacija) {
            return;
          }
          patchState(store, { zauzet: false });
          osvezi(true);
        },
      });
    };

    const primeniOdgovor = (d: OnboardingSesijaDetails) => {
      patchState(store, { poruka: d.poruka ?? null });
      primeni(d);
    };

    return {
      ucitaj(sesijaId: number): void {
        b.generacija++;
        b.ucitavanje?.unsubscribe();
        b.ucitavanje = null;
        patchState(store, { sesijaId, detalji: null, poruka: null, zauzet: false, izmenaId: null, statusGreske: null });
        osvezi();
      },
      osvezi,
      prihvati(p: PrijavaInfo): void {
        const id = store.sesijaId();
        if (id !== null) {
          izvrsi(store._api.prihvati(id, p.id), primeniOdgovor);
        }
      },
      odbij(p: PrijavaInfo, napomena: string | null): void {
        const id = store.sesijaId();
        if (id !== null) {
          izvrsi(store._api.odbij(id, p.id, { napomena: napomena?.trim() || null }), primeniOdgovor);
        }
      },
      prihvatiSve(): void {
        const id = store.sesijaId();
        if (id !== null && store.izmenaId() === null && store.brojevi().naCekanju > 0) {
          izvrsi(store._api.prihvatiSve(id), primeniOdgovor);
        }
      },
      zapocniIzmenu(p: PrijavaInfo): void {
        if (!store.zauzet() && store.izmenaId() === null && p.status === 'NA_CEKANJU') {
          patchState(store, { izmenaId: p.id });
        }
      },
      otkaziIzmenu(): void {
        patchState(store, { izmenaId: null });
      },
      sacuvajIzmenu(p: PrijavaInfo, cmd: UpdatePrijavaCmd): void {
        const id = store.sesijaId();
        if (id === null || store.izmenaId() !== p.id) {
          return;
        }
        izvrsi(store._api.izmeniPrijavu(id, p.id, cmd), azurirana => {
          const d = store.detalji();
          patchState(store, { izmenaId: null });
          if (d) {
            primeni({ ...d, prijave: d.prijave.map(x => (x.id === azurirana.id ? azurirana : x)) });
          }
          store._obavestenja.uspeh('Prijava je izmenjena.');
        });
      },
      zatvoriPoruku(): void {
        patchState(store, { poruka: null });
      },
    };
  }),
  withHooks({
    onDestroy(store) {
      store._brojaci.generacija++;
      store._brojaci.ucitavanje?.unsubscribe();
    },
  }),
);
export type OnboardingSesijaStore = InstanceType<typeof OnboardingSesijaStore>;
