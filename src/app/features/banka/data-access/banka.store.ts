import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, EMPTY, finalize, forkJoin, map, mergeMap, Observable, of, pipe, switchMap, tap } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { NotificationStore } from '../../../core/state/notification.store';
import { setError, setLoaded, setLoading, withRequestStatus } from '../../../shared/store/request-status.feature';
import { BankaApi } from './banka.api';
import {
  GrupaCmd, GrupaCvor, GrupaDetails, GrupaPutanja, Namena, nadjiCvor, PremestiCmd, prviList, putanjaDo, StatusVarijante,
  VarijantaInfo,
} from './banka.models';

export type FilterStatusa = StatusVarijante | 'SVE';

interface BankaState {
  predmetId: number | null;
  namena: Namena;
  stablo: GrupaCvor[];
  /** Izabrana grupa stabla (list ili unutrašnji čvor); `null` = ništa (prazno stablo). */
  izabranaGrupaId: number | null;
  grupa: GrupaDetails | null;
  /** Sve varijante izabrane grupe; `filterStatusa` se primenjuje u `filtriraneVarijante`. */
  varijante: VarijantaInfo[];
  filterStatusa: FilterStatusa;
  /** Razlog neuspelog učitavanja izabrane grupe (stablo ostaje); briše se sa novim izborom i uspelim učitavanjem. */
  greskaGrupe: string | null;
  /** Broj neidempotentnih izmena u letu (kreiranje, dupliranje, brisanje): dok nije 0, njihova dugmad su onemogućena. */
  _zauzetih: number;
}

/** Brojači jednog čvora stabla (za unutrašnji čvor zbir podstabla). */
export interface Brojaci {
  brojVarijanti: number;
  brojAktivnih: number;
  brojNacrta: number;
  brojGresaka: number;
}

const NULA: Brojaci = { brojVarijanti: 0, brojAktivnih: 0, brojNacrta: 0, brojGresaka: 0 };
/** Greške store prikazuje sam kroz `NotificationStore` (ili status `error`), pa globalni snackbar ne sme da ih udvostruči. */
const TIHO = { tiho: true } as const;

function razlog(e: unknown): string {
  return e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM;
}

/** Zahtev za stablo: `grupaId` je željeni izbor (važi samo ako postoji u stablu), `prvo` = nov predmet/namena (status učitavanja). */
interface ZahtevStabla {
  predmetId: number;
  namena: Namena;
  grupaId: number | null;
  prvo: boolean;
}

/**
 * Stranica banke (`/banka`): stablo grupa jednog predmeta i namene, izabrana grupa sa varijantama i izmene grupa i varijanti.
 * Feature store: provajduje ga rutirana stranica. Ne zna ništa o prikazu. Posle svake izmene ponovo učitava stablo i izabranu
 * grupu sa varijantama (brojači stabla i kartice ostaju tačni), uz isti izbor i isti filter statusa. Greške idu u
 * `NotificationStore` (razlog servera, a 5xx opšta poruka); uz to prvo učitavanje (`ucitaj`) postavlja status `error`, a
 * neuspelo učitavanje izabrane grupe `greskaGrupe`. `zauzeto` je `true` dok traje kreiranje, dupliranje ili brisanje.
 */
export const BankaStore = signalStore(
  withState<BankaState>({
    predmetId: null,
    namena: 'PREDAVANJE',
    stablo: [],
    izabranaGrupaId: null,
    grupa: null,
    varijante: [],
    filterStatusa: 'SVE',
    greskaGrupe: null,
    _zauzetih: 0,
  }),
  withRequestStatus(),
  withProps(() => ({
    _api: inject(BankaApi),
    _obavestenja: inject(NotificationStore),
  })),
  withComputed(({ stablo, izabranaGrupaId, grupa, varijante, filterStatusa, _zauzetih }) => ({
    /** Kreiranje, dupliranje ili brisanje je u toku (dvostruki klik ne sme da napravi dva zahteva). */
    zauzeto: computed(() => _zauzetih() > 0),
    /** Od korena do izabrane grupe (iz stabla, pa je odmah tačna posle izbora i posle preimenovanja). */
    putanja: computed<GrupaPutanja[]>(() => {
      const izStabla = putanjaDo(stablo(), izabranaGrupaId());
      return izStabla.length > 0 ? izStabla : (grupa()?.putanja ?? []);
    }),
    brojaciIzabrane: computed<Brojaci>(() => {
      const izvor = nadjiCvor(stablo(), izabranaGrupaId()) ?? grupa();
      return izvor
        ? { brojVarijanti: izvor.brojVarijanti, brojAktivnih: izvor.brojAktivnih, brojNacrta: izvor.brojNacrta, brojGresaka: izvor.brojGresaka }
        : NULA;
    }),
    filtriraneVarijante: computed(() => varijante().filter(v => filterStatusa() === 'SVE' || v.status === filterStatusa())),
  })),
  withMethods(store => {
    const prijavi = (e: unknown): void => store._obavestenja.greska(razlog(e));

    /** Grupa i varijante izabrane grupe; `null` samo prekida zahtev u letu (stari odgovor ne sme na novo stanje). */
    const ucitajGrupu = rxMethod<number | null>(
      pipe(
        switchMap(id => {
          if (id === null) {
            return EMPTY;
          }
          return forkJoin({ grupa: store._api.grupa(id, TIHO), varijante: store._api.varijante(id, undefined, TIHO) }).pipe(
            tap(({ grupa, varijante }) => patchState(store, { grupa, varijante, greskaGrupe: null })),
            catchError((e: unknown) => {
              patchState(store, { grupa: null, varijante: [], greskaGrupe: razlog(e) });
              prijavi(e);
              return EMPTY;
            }),
          );
        }),
      ),
    );

    /** Menja izbor (brišući tuđu grupu i varijante do odgovora) i učitava grupu; isti izbor samo osvežava. */
    const postaviIzbor = (id: number | null): void => {
      if (id !== store.izabranaGrupaId()) {
        patchState(store, { izabranaGrupaId: id, grupa: null, varijante: [], greskaGrupe: null });
      }
      ucitajGrupu(id);
    };

    /** Izbor koji je tražio poslednji `ucitaj`; važi dok prvo stablo ne stigne (i kad osvežavanje prekine to učitavanje). */
    let trazenaGrupa: number | null = null;

    const ucitajStablo = rxMethod<ZahtevStabla>(
      pipe(
        switchMap(z =>
          store._api.stablo(z.predmetId, z.namena, TIHO).pipe(
            tap(stablo => {
              patchState(store, { stablo }, z.prvo ? setLoaded() : {});
              postaviIzbor(nadjiCvor(stablo, z.grupaId)?.id ?? prviList(stablo)?.id ?? null);
            }),
            catchError((e: unknown) => {
              if (z.prvo) {
                patchState(store, setError(razlog(e)));
              }
              prijavi(e);
              return EMPTY;
            }),
          ),
        ),
      ),
    );

    /**
     * Ponovo učitava stablo (bez ekrana učitavanja) i grupu: izbor je `grupaId`, a ako ga nema u stablu, prvi list. Ako prvo
     * učitavanje još traje (izmena prethodnog predmeta se završila posle `ucitaj`), ovaj zahtev ga prekida, pa ga i završava:
     * postavlja status i bira grupu koju je tražio `ucitaj`.
     */
    const osvezi = (grupaId: number | null): void => {
      const predmetId = store.predmetId();
      if (predmetId !== null) {
        const prvo = store.status() === 'loading';
        ucitajStablo({ predmetId, namena: store.namena(), grupaId: prvo ? (grupaId ?? trazenaGrupa) : grupaId, prvo });
      }
    };

    /**
     * Izmena na serveru: emitovana vrednost je grupa koja se bira posle (`undefined` = ostaje izabrana). Izmene idu paralelno
     * (server ih serijalizuje), a ponovno učitavanje posle njih prekida prethodno, pa važi poslednje. `zauzima`: neidempotentna
     * izmena (ponovljen zahtev pravi duplikat ili 404), `zauzeto` je `true` dok njen zahtev traje.
     */
    const izmena = rxMethod<{ poziv: Observable<number | null | undefined>; zauzima?: boolean }>(
      pipe(
        mergeMap(({ poziv, zauzima }) => {
          if (zauzima) {
            patchState(store, s => ({ _zauzetih: s._zauzetih + 1 }));
          }
          return poziv.pipe(
            tap(izbor => osvezi(izbor === undefined ? store.izabranaGrupaId() : izbor)),
            catchError((e: unknown) => {
              prijavi(e);
              return EMPTY;
            }),
            finalize(() => {
              if (zauzima) {
                patchState(store, s => ({ _zauzetih: s._zauzetih - 1 }));
              }
            }),
          );
        }),
      ),
    );
    const bezIzbora = map((): undefined => undefined);

    return {
      /**
       * Učitava stablo predmeta i namene; bira `grupaId` (povratak sa editora) ako postoji u stablu, inače prvi list. Prethodno
       * stablo, izbor i varijante se brišu odmah, pa se nikad ne vidi tuđe.
       */
      ucitaj(predmetId: number, namena: Namena, grupaId: number | null = null): void {
        patchState(store, { predmetId, namena, stablo: [], izabranaGrupaId: null, grupa: null, varijante: [], greskaGrupe: null }, setLoading());
        trazenaGrupa = grupaId;
        ucitajGrupu(null);
        ucitajStablo({ predmetId, namena, grupaId, prvo: true });
      },
      izaberi(grupaId: number | null): void {
        postaviIzbor(grupaId);
      },
      /** Stablo i izabrana grupa iznova (npr. posle izmene van ove stranice); izbor ostaje ako grupa još postoji. */
      osveziStablo(): void {
        osvezi(store.izabranaGrupaId());
      },
      postaviFilter(filterStatusa: FilterStatusa): void {
        patchState(store, { filterStatusa });
      },

      /** Nova grupa (koren ili podgrupa); posle uspeha je izabrana. */
      kreirajGrupu(cmd: GrupaCmd): void {
        izmena({ poziv: store._api.kreirajGrupu(cmd, TIHO).pipe(map(nova => nova.id)), zauzima: true });
      },
      /**
       * Preimenuje grupu (i menja težinu kad je data; `null` je briše). `PUT` je puna zamena, pa nosi postojeći opis, težinu i
       * uputstvo (iz učitane grupe, a za drugu grupu iz njenog čitanja) i `polja: null`, što ostavlja šemu i odgovore varijanti.
       */
      preimenuj(id: number, naziv: string, tezina?: number | null): void {
        const trenutna = store.grupa();
        const izvor = trenutna?.id === id ? of(trenutna) : store._api.grupa(id, TIHO);
        const poziv = izvor.pipe(
          switchMap(g => store._api.izmeniGrupu(
            id, { naziv: naziv.trim(), tezina: tezina === undefined ? g.tezina : tezina, opis: g.opis, uputstvo: g.uputstvo, polja: null }, TIHO)),
          bezIzbora,
        );
        izmena({ poziv });
      },
      /** Briše grupu; ako je bila izabrana, bira se njen roditelj (ili prvi list kad je koren). */
      obrisiGrupu(id: number): void {
        const bila = store.izabranaGrupaId() === id;
        const roditelj = putanjaDo(store.stablo(), id).at(-2)?.id ?? null;
        izmena({ poziv: store._api.obrisiGrupu(id, TIHO).pipe(map(() => (bila ? roditelj : undefined))), zauzima: true });
      },
      premesti(id: number, cmd: PremestiCmd): void {
        izmena({ poziv: store._api.premesti(id, cmd, TIHO).pipe(bezIzbora) });
      },

      odobri(id: number): void {
        izmena({ poziv: store._api.odobri(id, TIHO).pipe(bezIzbora) });
      },
      arhiviraj(id: number): void {
        izmena({ poziv: store._api.arhiviraj(id, TIHO).pipe(bezIzbora) });
      },
      vratiUNacrt(id: number): void {
        izmena({ poziv: store._api.vratiUNacrt(id, TIHO).pipe(bezIzbora) });
      },
      obrisiVarijantu(id: number): void {
        izmena({ poziv: store._api.obrisiVarijantu(id, TIHO).pipe(bezIzbora), zauzima: true });
      },
      dupliraj(id: number): void {
        izmena({ poziv: store._api.dupliraj(id, TIHO).pipe(bezIzbora), zauzima: true });
      },
    };
  }),
);
export type BankaStore = InstanceType<typeof BankaStore>;
