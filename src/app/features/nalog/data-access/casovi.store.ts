import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, Subscription } from 'rxjs';

import { CasoviApi } from './casovi.api';
import { kljucTermina, NajavaCmd, StudentskiTermin } from './casovi.models';
import { porukaGreske } from './nalog.pravila';

export type StatusCasova = 'ucitavanje' | 'ok' | 'greska';

interface CasoviState {
  termini: StudentskiTermin[];
  status: StatusCasova;
  greska: string | null;
  /** Ključ termina čija najava ili povlačenje je u toku (jedna akcija u isto vreme). */
  salje: string | null;
  /** Poruka uz jedan termin (greška servera ili potvrda), ključ termina. */
  poruka: { kljuc: string; tekst: string; greska: boolean } | null;
}

/**
 * Stanje kartice „Naredni časovi“ (spec najave odsustva, odeljak 4). Daje ga sama komponenta (`providers`), pa kartica ne
 * zavisi od stranice na kojoj stoji (kasnije ide u tab „Čas“). Posle 404 ili 409 (čas je u međuvremenu otkazan, počeo ili
 * više nije u rasporedu) lista se učitava iznova, a poruka servera ostaje uz termin.
 */
export const CasoviStore = signalStore(
  withState<CasoviState>({ termini: [], status: 'ucitavanje', greska: null, salje: null, poruka: null }),
  withProps(() => ({ _api: inject(CasoviApi), _veze: { lista: null as Subscription | null, akcija: null as Subscription | null } })),
  withMethods(store => {
    const ucitaj = (tiho = false): void => {
      store._veze.lista?.unsubscribe();
      if (!tiho) {
        patchState(store, { status: 'ucitavanje', greska: null });
      }
      store._veze.lista = store._api.naredni().subscribe({
        next: n => patchState(store, { termini: n?.termini ?? [], status: 'ok', greska: null }),
        error: (e: unknown) => {
          if (!tiho) {
            patchState(store, { status: 'greska', greska: porukaGreske(e) });
          }
        },
      });
    };

    const akcija = (t: StudentskiTermin, poziv: (cmd: NajavaCmd) => Observable<StudentskiTermin>, cmd: NajavaCmd, potvrda: string) => {
      if (store.salje() !== null) {
        return;
      }
      const kljuc = kljucTermina(t);
      patchState(store, { salje: kljuc, poruka: null });
      store._veze.akcija = poziv(cmd).subscribe({
        next: novi => patchState(store, {
          salje: null,
          termini: store.termini().map(x => (kljucTermina(x) === kljuc ? novi : x)),
          poruka: { kljuc, tekst: potvrda, greska: false },
        }),
        error: (e: unknown) => {
          patchState(store, { salje: null, poruka: { kljuc, tekst: porukaGreske(e), greska: true } });
          if (e instanceof HttpErrorResponse && (e.status === 404 || e.status === 409)) {
            ucitaj(true);
          }
        },
      });
    };

    return {
      ucitaj: () => ucitaj(),
      /** "Neću doći" ili izmena razloga (`razlog` null = bez razloga). */
      najavi(t: StudentskiTermin, razlog: string | null): void {
        const r = razlog?.trim() ? razlog.trim() : null;
        akcija(t, cmd => store._api.najavi(cmd), { stavkaId: t.stavkaId, datum: t.datum, razlog: r },
          t.najavljeno ? 'Sačuvano.' : 'Javljeno je da nećeš doći.');
      },
      /** "Ipak dolazim". */
      povuci(t: StudentskiTermin): void {
        akcija(t, cmd => store._api.povuci(cmd), { stavkaId: t.stavkaId, datum: t.datum }, 'Javljeno je da ipak dolaziš.');
      },
    };
  }),
  withHooks({
    onDestroy(store) {
      store._veze.lista?.unsubscribe();
      store._veze.akcija?.unsubscribe();
    },
  }),
);
export type CasoviStore = InstanceType<typeof CasoviStore>;
