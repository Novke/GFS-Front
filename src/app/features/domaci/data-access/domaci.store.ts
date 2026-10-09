import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { catchError, concatMap, defer, EMPTY, firstValueFrom, map, Observable, of, Subject, Subscription, tap } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { NotificationStore } from '../../../core/state/notification.store';
import { setError, setLoaded, setLoading, withRequestStatus } from '../../../shared/store/request-status.feature';
import { StanjeCuvanja } from '../../../shared/ui/save-status';
import { TipAktivnosti } from '../../predavanja/data-access/predavanja.models';
import { DomaciApi } from './domaci.api';
import { DomaciDetails, DomaciStudentiInfo, DomaciPodaci } from './domaci.models';

/** Koliko se čeka posle poslednje izmene reda pre nego što se red pošalje serveru (spec 4, tabelarni unos). */
export const DEBOUNCE_REDA_MS = 600;

/** Najviše bodova za domaći (server: `@Max(10)`). */
export const MAX_BODOVA = 10;
/** Kolona `uradjeni_domaci.napomene` je `varchar(255)`. */
export const MAX_NAPOMENA = 255;

/** Ono što se unosi u redu; ovo se šalje serveru (`CreateUradjenDomaciCmd`). */
export interface VrednostiReda {
  /** `null` = nije uneto (domaći nije evidentiran za studenta). */
  bodovi: number | null;
  prepisivanje: boolean;
  napomene: string;
}

/** Student u tabeli: nepromenljivi podaci reda (ono što se unosi je u `vrednosti`). */
export interface RedStudenta {
  id: number;
  ime: string;
  prezime: string;
  indeks: string;
  godina: number | null;
  tip: TipAktivnosti | null;
  predavanjaNapomene: string | null;
  /** Oslobođen studenti su zaključani (bodovi 10 postavlja server). */
  oslobodjen: boolean;
}

export interface BrojeviDomaceg {
  studenata: number;
  prisutnih: number;
  /** Zadatak ili zvezdica na predavanju domaćeg. */
  aktivnih: number;
  oslobodjenih: number;
  /** Aktivni koji još nisu oslobođeni (šta radi "Oslobodi aktivne"). */
  zaOslobadjanje: number;
  /** Studenti (bez oslobođenih) sa upisanim bodovima. */
  evidentirano: number;
  /** Prosek bodova evidentiranih (bez oslobođenih); `null` kad nema nijednog. */
  prosek: number | null;
  prepisivanja: number;
}

export interface IzmenaZaglavljaDomaceg {
  naslov: string;
  text: string;
  datum: string;
}

interface DomaciState {
  domaci: DomaciPodaci | null;
  studenti: RedStudenta[];
  /** Vrednosti koje korisnik vidi (optimistično, pre potvrde servera). */
  vrednosti: Record<number, VrednostiReda>;
  /** `null` = red nije menjan; `cuva` = čeka debounce ili je zahtev u toku. */
  statusi: Record<number, StanjeCuvanja | null>;
}

const AKTIVNI_TIPOVI: readonly (TipAktivnosti | null)[] = ['ZADATAK', 'SA_ZVEZDICOM'];
/** Zadatak ili zvezdica na predavanju (prisutan bez zadatka nije aktivan). */
export const jeAktivan = (tip: TipAktivnosti | null): boolean => AKTIVNI_TIPOVI.includes(tip);

function porukaGreske(e: unknown): string {
  return e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM;
}

const jednake = (a: VrednostiReda, b: VrednostiReda): boolean =>
  a.bodovi === b.bodovi && a.prepisivanje === b.prepisivanje && a.napomene === b.napomene;

/** Bodovi su ceo broj 0-10 (ili `null` = prazno polje). */
export function ispravniBodovi(b: number | null): boolean {
  return b === null || (Number.isInteger(b) && b >= 0 && b <= MAX_BODOVA);
}

function izRedaServera(r: DomaciStudentiInfo): VrednostiReda {
  return { bodovi: r.bodovi ?? null, prepisivanje: r.prepisivanje === true, napomene: r.uradjenDomaciNapomene ?? '' };
}

function uRed(r: DomaciStudentiInfo): RedStudenta {
  return {
    id: r.studentId,
    ime: r.ime ?? '',
    prezime: r.prezime ?? '',
    indeks: r.indeks ?? '',
    godina: r.godina ?? null,
    tip: r.tip ?? null,
    predavanjaNapomene: r.predavanjaNapomene ?? null,
    oslobodjen: r.oslobodjen === true,
  };
}

function zaglavljeIzOdgovora(det: DomaciDetails): DomaciPodaci {
  const zaglavlje: Partial<DomaciDetails> = { ...det };
  delete zaglavlje.studenti;
  return zaglavlje as DomaciPodaci;
}

/**
 * Detalj domaćeg: zaglavlje i tabela evidentiranja (provajduje se u `DomaciDetalj`).
 *
 * Svaki red (student) se čuva sam: izmena je vidljiva odmah, a zahtev (`POST domaci/evidentiraj`, ceo red) ide posle
 * {@link DEBOUNCE_REDA_MS} ms od poslednje izmene, pa više brzih izmena istog reda daje jedan zahtev. Zahtevi su
 * **serijalizovani po studentu** (`concatMap`, kao u `PredavanjeStore`): za jednog studenta je najviše jedan zahtev u toku,
 * a kad red dođe na izvršenje šalju se **najnovije** vrednosti reda, pa konačno stanje na serveru uvek odgovara poslednjoj
 * izmeni (i prvi upis ne može da napravi dupli red). Odgovor koji stigne dok je red u međuvremenu menjan ne prepisuje
 * unos (`verzije`). Greška ostavlja uneto u polju i postavlja status reda na `greska` ("Pokušaj ponovo" = `ponovi`).
 * Oslobođeni redovi i pregledan domaći su samo za čitanje.
 */
export const DomaciStore = signalStore(
  withState<DomaciState>({ domaci: null, studenti: [], vrednosti: {}, statusi: {} }),
  withRequestStatus(),
  withProps(() => ({
    _api: inject(DomaciApi),
    _obavestenja: inject(NotificationStore),
    /** Promenljivo knjigovodstvo (nije stanje): redovi zahteva, tajmeri debounce-a, potvrđene vrednosti, verzije unosa. */
    _r: {
      redovi: new Map<number, Subject<void>>(),
      veze: new Subscription(),
      timeri: new Map<number, ReturnType<typeof setTimeout>>(),
      /** Poslednje vrednosti koje je server potvrdio, po studentu. */
      potvrdjeno: new Map<number, VrednostiReda>(),
      /** Raste sa svakom izmenom reda; odgovor važi samo ako je verzija ista kao pri slanju. */
      verzije: new Map<number, number>(),
      ucitavanje: null as Subscription | null,
      unisten: false,
    },
  })),
  withComputed(({ domaci, studenti, vrednosti, statusi }) => ({
    pregledan: computed(() => domaci()?.pregledan === true),
    /** Neki red još čeka ili šalje izmenu: pregled se ne završava dok traje. */
    cuva: computed(() => Object.values(statusi()).some(s => s === 'cuva')),
    brojGresaka: computed(() => Object.values(statusi()).filter(s => s === 'greska').length),
    brojevi: computed<BrojeviDomaceg>(() => {
      const redovi = studenti();
      const v = vrednosti();
      const bodovi = redovi
        .filter(s => !s.oslobodjen)
        .map(s => v[s.id]?.bodovi ?? null)
        .filter((b): b is number => b !== null);
      const aktivni = redovi.filter(s => jeAktivan(s.tip));
      return {
        studenata: redovi.length,
        prisutnih: redovi.filter(s => s.tip !== null).length,
        aktivnih: aktivni.length,
        oslobodjenih: redovi.filter(s => s.oslobodjen).length,
        zaOslobadjanje: aktivni.filter(s => !s.oslobodjen).length,
        evidentirano: bodovi.length,
        prosek: bodovi.length > 0 ? bodovi.reduce((a, b) => a + b, 0) / bodovi.length : null,
        prepisivanja: redovi.filter(s => v[s.id]?.prepisivanje === true).length,
      };
    }),
  })),
  withMethods(store => {
    const id = () => store.domaci()?.id ?? null;
    const verzija = (sId: number) => store._r.verzije.get(sId) ?? 0;

    function postaviStatus(sId: number, status: StanjeCuvanja | null): void {
      patchState(store, s => ({ statusi: { ...s.statusi, [sId]: status } }));
    }

    function imeStudenta(sId: number): string {
      const s = store.studenti().find(x => x.id === sId);
      return s ? [s.ime, s.prezime].filter(Boolean).join(' ') || 'Student' : 'Student';
    }

    /** Odgovor servera: potvrđene vrednosti reda; unos se prepisuje samo ako red u međuvremenu nije menjan. */
    function uskladi(sId: number, det: DomaciDetails, poslataVerzija: number): void {
      const red = det.studenti?.find(s => s.studentId === sId);
      if (!red) {
        return;
      }
      const potvrdjeno = izRedaServera(red);
      store._r.potvrdjeno.set(sId, potvrdjeno);
      if (verzija(sId) !== poslataVerzija) {
        return; // noviji unos čeka ili je u redu: on određuje konačno stanje
      }
      patchState(store, s => ({
        vrednosti: { ...s.vrednosti, [sId]: potvrdjeno },
        statusi: { ...s.statusi, [sId]: 'sacuvano' as StanjeCuvanja },
      }));
    }

    function izvrsi(sId: number): Observable<unknown> {
      return defer(() => {
        const dId = id();
        const trenutna = verzija(sId);
        const v = store.vrednosti()[sId];
        const potvrdjeno = store._r.potvrdjeno.get(sId);
        if (dId === null || !v) {
          return EMPTY;
        }
        if (potvrdjeno && jednake(v, potvrdjeno)) {
          // npr. izmena vraćena na staro ili ju je već sačuvao prethodni korak reda
          if (verzija(sId) === trenutna) {
            postaviStatus(sId, 'sacuvano');
          }
          return EMPTY;
        }
        return store._api
          .evidentiraj(
            { studentId: sId, domaciId: dId, bodovi: v.bodovi ?? 0, napomene: v.napomene, prepisivanje: v.prepisivanje },
            { tiho: true },
          )
          .pipe(
            tap(det => uskladi(sId, det, trenutna)),
            catchError((e: unknown) => {
              if (verzija(sId) === trenutna) {
                postaviStatus(sId, 'greska');
                store._obavestenja.greska(`${imeStudenta(sId)}: ${porukaGreske(e)}`);
              }
              return EMPTY;
            }),
          );
      });
    }

    function red(sId: number): Subject<void> {
      let r = store._r.redovi.get(sId);
      if (!r) {
        const novi = new Subject<void>();
        store._r.veze.add(novi.pipe(concatMap(() => izvrsi(sId))).subscribe());
        store._r.redovi.set(sId, novi);
        r = novi;
      }
      return r;
    }

    function posalji(sId: number): void {
      const t = store._r.timeri.get(sId);
      if (t !== undefined) {
        clearTimeout(t);
        store._r.timeri.delete(sId);
      }
      red(sId).next();
    }

    function resetuj(): void {
      store._r.veze.unsubscribe();
      store._r.veze = new Subscription();
      store._r.redovi.clear();
      store._r.timeri.forEach(t => clearTimeout(t));
      store._r.timeri.clear();
      store._r.potvrdjeno.clear();
      store._r.verzije.clear();
    }

    function postaviPodatke(det: DomaciDetails): void {
      const redovi = (det.studenti ?? []).map(uRed);
      const vrednosti: Record<number, VrednostiReda> = {};
      for (const r of det.studenti ?? []) {
        vrednosti[r.studentId] = izRedaServera(r);
        store._r.potvrdjeno.set(r.studentId, vrednosti[r.studentId]);
      }
      patchState(store, { domaci: zaglavljeIzOdgovora(det), studenti: redovi, vrednosti, statusi: {} }, setLoaded());
    }

    return {
      ucitaj(dId: number): void {
        store._r.ucitavanje?.unsubscribe();
        resetuj();
        patchState(store, { domaci: null, studenti: [], vrednosti: {}, statusi: {} }, setLoading());
        store._r.ucitavanje = store._api.get(dId, { tiho: true }).subscribe({
          next: det => postaviPodatke(det),
          error: (e: unknown) => patchState(store, setError(porukaGreske(e))),
        });
      },

      /**
       * Izmena polja reda (`bodovi`, `prepisivanje`, `napomene`): vidljiva odmah, čuva se posle debounce-a. Neispravni bodovi
       * (nisu ceo broj 0-10) se ne primaju; oslobođeni red i pregledan domaći se ne menjaju.
       */
      izmeni(sId: number, izmena: Partial<VrednostiReda>): void {
        const r = store.studenti().find(s => s.id === sId);
        if (store._r.unisten || !r || r.oslobodjen || store.pregledan() || !ispravniBodovi(izmena.bodovi ?? null)) {
          return;
        }
        const staro = store.vrednosti()[sId];
        const novo = { ...staro, ...izmena };
        if (staro && jednake(staro, novo)) {
          return;
        }
        store._r.verzije.set(sId, verzija(sId) + 1);
        patchState(store, s => ({
          vrednosti: { ...s.vrednosti, [sId]: novo },
          statusi: { ...s.statusi, [sId]: 'cuva' as StanjeCuvanja },
        }));
        red(sId); // red zahteva postoji čim postoji izmena na čekanju (i pri napuštanju ekrana ima kome da se pošalje)
        const stari = store._r.timeri.get(sId);
        if (stari !== undefined) {
          clearTimeout(stari);
        }
        store._r.timeri.set(sId, setTimeout(() => posalji(sId), DEBOUNCE_REDA_MS));
      },

      /** Ne čeka debounce (Enter u polju): šalje red odmah, ako ima šta da se pošalje. */
      sacuvajOdmah(sId: number): void {
        if (store._r.timeri.has(sId)) {
          posalji(sId);
        }
      },

      /** "Pokušaj ponovo" posle greške: šalje trenutne vrednosti reda. */
      ponovi(sId: number): void {
        if (store._r.unisten || store.statusi()[sId] !== 'greska') {
          return;
        }
        postaviStatus(sId, 'cuva');
        posalji(sId);
      },

      /** `POST domaci/{id}/oslobodi`: aktivni studenti dobijaju 10 bodova i oznaku; redovi koji se trenutno menjaju ostaju. */
      oslobodi(): Promise<boolean> {
        const dId = id();
        if (dId === null) {
          return Promise.resolve(false);
        }
        return firstValueFrom(
          store._api.oslobodi(dId).pipe(
            map(det => {
              const ranije = new Set(store.studenti().filter(s => s.oslobodjen).map(s => s.id));
              let novih = 0;
              for (const r of det.studenti ?? []) {
                const potvrdjeno = izRedaServera(r);
                store._r.potvrdjeno.set(r.studentId, potvrdjeno);
                const menja = store.statusi()[r.studentId] === 'cuva';
                if (r.oslobodjen === true && !ranije.has(r.studentId)) {
                  novih++;
                }
                if (r.oslobodjen === true || !menja) {
                  const t = store._r.timeri.get(r.studentId);
                  if (t !== undefined && r.oslobodjen === true) {
                    clearTimeout(t);
                    store._r.timeri.delete(r.studentId);
                  }
                  patchState(store, s => ({
                    vrednosti: { ...s.vrednosti, [r.studentId]: potvrdjeno },
                    statusi: { ...s.statusi, [r.studentId]: r.oslobodjen === true ? null : s.statusi[r.studentId] ?? null },
                    studenti: s.studenti.map(x => (x.id === r.studentId ? { ...x, oslobodjen: r.oslobodjen === true } : x)),
                  }));
                }
              }
              store._obavestenja.uspeh(novih > 0 ? `Oslobođeno studenata: ${novih}.` : 'Nema novih studenata za oslobađanje.');
              return true;
            }),
            catchError(() => of(false)), // grešku je već prikazao interceptor
          ),
        );
      },

      /** Naslov, opis i datum; evidentiranje u tabeli se ne dira. */
      izmeniZaglavlje(izmena: IzmenaZaglavljaDomaceg): Promise<boolean> {
        const dId = id();
        if (dId === null) {
          return Promise.resolve(false);
        }
        return firstValueFrom(
          store._api.update(dId, { naslov: izmena.naslov, text: izmena.text, datum: izmena.datum }).pipe(
            map(det => {
              patchState(store, { domaci: zaglavljeIzOdgovora(det) });
              store._obavestenja.uspeh('Izmene su sačuvane.');
              return true;
            }),
            catchError(() => of(false)),
          ),
        );
      },

      /** `PATCH domaci/{id}`: pregled je završen, tabela postaje samo za čitanje. */
      zavrsi(): Promise<boolean> {
        const dId = id();
        if (dId === null) {
          return Promise.resolve(false);
        }
        return firstValueFrom(
          store._api.zavrsi(dId).pipe(
            map(() => {
              patchState(store, s => (s.domaci ? { domaci: { ...s.domaci, pregledan: true } } : {}));
              store._obavestenja.uspeh('Pregled je završen.');
              return true;
            }),
            catchError(() => of(false)),
          ),
          { defaultValue: true },
        );
      },

      obrisi(): Promise<boolean> {
        const dId = id();
        if (dId === null) {
          return Promise.resolve(false);
        }
        return firstValueFrom(
          store._api.obrisi(dId).pipe(
            map(() => {
              // izmene koje čekaju debounce nemaju kome da se pošalju
              store._r.timeri.forEach(t => clearTimeout(t));
              store._r.timeri.clear();
              store._obavestenja.uspeh('Domaći je obrisan.');
              return true;
            }),
            catchError(() => of(false)),
          ),
          { defaultValue: true },
        );
      },
    };
  }),
  withHooks({
    onDestroy(store) {
      store._r.unisten = true;
      store._r.ucitavanje?.unsubscribe();
      // izmena koja još čeka debounce se šalje (ekran se napušta), a zahtevi u toku se ne otkazuju: redovi se samo zatvaraju
      for (const [sId, t] of store._r.timeri) {
        clearTimeout(t);
        store._r.redovi.get(sId)?.next();
      }
      store._r.timeri.clear();
      store._r.redovi.forEach(r => r.complete());
    },
  }),
);

export type DomaciStore = InstanceType<typeof DomaciStore>;
