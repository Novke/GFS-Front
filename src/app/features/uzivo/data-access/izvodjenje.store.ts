import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { RxStomp, RxStompState } from '@stomp/rx-stomp';
import {
  EMPTY, Observable, Subject, Subscription, TimeoutError, catchError, concatMap, defer, finalize, tap, timeout,
} from 'rxjs';
import { IzvodjenjaApi } from './izvodjenja.api';
import { dozvoljeneKomande } from './izvodjenje-pravila';
import { NotificationStore } from '../../../core/state/notification.store';
import { razlogGreske } from './razlog-greske';
import { ServerskiSat } from './sat';
import { STOMP_FABRIKA } from './stomp';
import { NastavnickoStanje, TipKomande } from './uzivo.models';

export type Veza = 'povezivanje' | 'povezan' | 'prekinut';

export interface IzvodjenjeState {
  stanje: NastavnickoStanje | null;
  veza: Veza;
  greska: string | null;
  /** Bar jedna komanda čeka odgovor servera. */
  salje: boolean;
}

/** Komanda bez odgovora ovoliko dugo se odustaje, da red ne stane (stanje ionako stiže kroz STOMP). */
export const KOMANDA_TIMEOUT_MS = 15_000;
/** Grupa poruka komandi u `NotificationStore`: nova poruka sklanja prethodnu. */
export const GRUPA_PORUKA = 'uzivo-komanda';
const PORUKA_TIMEOUT = 'Server ne odgovara. Pokušaj ponovo.';

interface Posao { zahtev: () => Observable<NastavnickoStanje>; greska: string; }

const POCETNO: IzvodjenjeState = { stanje: null, veza: 'povezivanje', greska: null, salje: false };

const link = (putanja: string) => new URL(putanja, document.baseURI).href;

/**
 * Stanje jednog izvođenja za nastavnika (publika i konzola; jedna instanca po stranici, `providers: [IzvodjenjeStore]`).
 *
 * - `init(id)`: `GET stanje`, pa STOMP (`api/ws`) sa pretplatama na `/topic/izvodjenja/{id}/nastavnik` (snimak posle
 *   svake promene) i `/app/izvodjenja/{id}/nastavnik-pocetno` (snimak odmah, i posle svakog ponovnog povezivanja).
 *   Na 404/410 (pogrešan id, izvođenje ne postoji) STOMP se ne otvara, inače bi se večno ponovo povezivao; na druge
 *   greške (mreža, 5xx) se otvara, pa stanje stiže kroz početni snimak. HTTP zahtev je deo veze: novi `init` i
 *   `destroy` ga otkazuju.
 * - `prihvati`: server je jedini izvor istine; snimak sa manjom verzijom od trenutne se odbacuje, a jednaka verzija se
 *   prihvata (posle odgovora studenata server šalje svežije rezultate bez promene verzije). Usklađuje `ServerskiSat`.
 * - `komanda`, `preimenuj`, `izbaci`, `sakrij`: jedan red (`concatMap`), pa brzo `→ → →` stiže na server redom i nijedna
 *   komanda se ne gubi dok prethodna čeka. Odgovor (novo stanje) ide kroz `prihvati`; greška (409, 400, ...) postavlja
 *   `greska` iz `reason` i prikazuje se 3 s; 410 (izvođenje završeno) još i ponovo učita stanje.
 */
export const IzvodjenjeStore = signalStore(
  withState<IzvodjenjeState>(POCETNO),
  withProps(() => ({
    _sat: new ServerskiSat(),
    /** Prvo viđeno preostalo vreme po rundi (pun krug tajmera kad pitanje nema ograničenje). */
    _prvoPreostalo: new Map<number, number>(),
  })),
  withComputed(({ stanje, _sat, _prvoPreostalo }) => ({
    sat: computed(() => _sat),
    dozvoljene: computed(() => dozvoljeneKomande(stanje())),
    joinLink: computed(() => {
      const kod = stanje()?.izvodjenje.kod;
      return kod ? link('uzivo/' + kod) : '';
    }),
    konzolaLink: computed(() => {
      const id = stanje()?.izvodjenje.id;
      return id ? link(`izvodjenja/${id}/konzola`) : '';
    }),
    publikaLink: computed(() => {
      const id = stanje()?.izvodjenje.id;
      return id ? link(`izvodjenja/${id}/publika`) : '';
    }),
    /** Pun krug tajmera: vreme pitanja, a bez ograničenja prvo preostalo vreme viđeno u toj rundi. */
    ukupnoMs: computed(() => {
      const s = stanje();
      const r = s?.runda;
      if (!s || !r) return null;
      const sekunde = s.trenutniSlajd?.pitanje?.vremeSekunde;
      if (sekunde) return sekunde * 1000;
      const preostalo = r.preostaloMs ?? (r.rokMs !== null ? _sat.preostalo(r.rokMs) : null);
      if (preostalo === null) return null;
      if (!_prvoPreostalo.has(r.id)) _prvoPreostalo.set(r.id, preostalo);
      return _prvoPreostalo.get(r.id)!;
    }),
  })),
  withMethods(store => {
    const api = inject(IzvodjenjaApi);
    const obavestenja = inject(NotificationStore);
    const fabrika = inject(STOMP_FABRIKA);

    let izvodjenjeId: number | null = null;
    let stomp: RxStomp | null = null;
    let veza = new Subscription();
    let naCekanju = 0;
    const red = new Subject<Posao>();

    const redPretplata = red.pipe(
      concatMap(p => defer(p.zahtev).pipe(
        timeout(KOMANDA_TIMEOUT_MS),
        tap(s => {
          patchState(store, { greska: null });
          prihvati(s);
        }),
        catchError(e => {
          prijaviGresku(e, p.greska);
          return EMPTY;
        }),
        finalize(() => {
          naCekanju = Math.max(0, naCekanju - 1);
          patchState(store, { salje: naCekanju > 0 });
        }),
      )),
    ).subscribe();

    function prihvati(s: NastavnickoStanje): void {
      if (izvodjenjeId !== null && s.izvodjenje?.id !== izvodjenjeId) return;
      const t = store.stanje();
      if (t && s.verzija < t.verzija) return;
      store._sat.azuriraj(s.serverVremeMs);
      patchState(store, { stanje: s });
    }

    function prihvatiPoruku(telo: string): void {
      try {
        prihvati(JSON.parse(telo) as NastavnickoStanje);
      } catch {
        // neispravna poruka se preskače; sledeći snimak je ionako ceo
      }
    }

    function prijaviGresku(e: unknown, podrazumevano: string): void {
      const poruka = e instanceof TimeoutError ? PORUKA_TIMEOUT : razlogGreske(e, podrazumevano);
      patchState(store, { greska: poruka });
      // Kratka poruka (ne greška koja čeka zatvaranje): nastavnik pritiska komande u brzom nizu, nova zamenjuje staru.
      obavestenja.info(poruka, { grupa: GRUPA_PORUKA });
      if (e instanceof HttpErrorResponse && e.status === 410) osvezi();
    }

    function osvezi(): void {
      if (izvodjenjeId === null) return;
      veza.add(api.stanje(izvodjenjeId).subscribe({ next: prihvati, error: () => undefined }));
    }

    function povezi(id: number): void {
      const s = fabrika('api/ws');
      stomp = s;
      let biloPovezano = false;
      veza.add(s.connectionState$.subscribe(st => {
        if (st === RxStompState.OPEN) biloPovezano = true;
        patchState(store, { veza: st === RxStompState.OPEN ? 'povezan' : biloPovezano ? 'prekinut' : 'povezivanje' });
      }));
      veza.add(s.watch(`/topic/izvodjenja/${id}/nastavnik`).subscribe(m => prihvatiPoruku(m.body)));
      veza.add(s.watch(`/app/izvodjenja/${id}/nastavnik-pocetno`).subscribe(m => prihvatiPoruku(m.body)));
    }

    function posalji(zahtev: () => Observable<NastavnickoStanje>, greska: string): void {
      if (izvodjenjeId === null) return;
      naCekanju++;
      patchState(store, { salje: true });
      red.next({ zahtev, greska });
    }

    function zatvoriVezu(): void {
      veza.unsubscribe();
      veza = new Subscription();
      void stomp?.deactivate();
      stomp = null;
    }

    return {
      init(id: number): void {
        zatvoriVezu();
        izvodjenjeId = id;
        patchState(store, { ...POCETNO });
        veza.add(api.stanje(id).subscribe({
          next: s => {
            prihvati(s);
            povezi(id);
          },
          error: e => {
            patchState(store, { greska: razlogGreske(e, 'Izvođenje nije učitano.') });
            const nePostoji = e instanceof HttpErrorResponse && (e.status === 404 || e.status === 410);
            if (!nePostoji) povezi(id);
          },
        }));
      },

      prihvati,

      komanda(tip: TipKomande, vrednost?: number): void {
        posalji(() => api.komanda(izvodjenjeId!, { tip, vrednost: vrednost ?? null }), 'Komanda nije izvršena.');
      },

      preimenuj(ucesnikId: number, ime: string): void {
        posalji(() => api.preimenuj(izvodjenjeId!, ucesnikId, ime), 'Preimenovanje nije uspelo.');
      },

      izbaci(ucesnikId: number): void {
        posalji(() => api.izbaci(izvodjenjeId!, ucesnikId), 'Izbacivanje nije uspelo.');
      },

      sakrij(rundaId: number, kljuc: string, sakriven: boolean): void {
        posalji(() => api.sakrij(izvodjenjeId!, rundaId, kljuc, sakriven), 'Izmena nije uspela.');
      },

      /** Zatvara STOMP vezu i red komandi (zove se i iz `onDestroy`). */
      destroy(): void {
        zatvoriVezu();
        redPretplata.unsubscribe();
      },
    };
  }),
  withHooks({
    onDestroy(store) {
      store.destroy();
    },
  }),
);
