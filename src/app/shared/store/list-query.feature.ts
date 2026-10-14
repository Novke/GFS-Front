import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, convertToParamMap, ParamMap, Params, Router } from '@angular/router';
import { patchState, signalStoreFeature, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { setAllEntities, withEntities } from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, combineLatest, EMPTY, map, Observable, pipe, switchMap, tap } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../core/api/api-error';
import { PreferencesStore } from '../../core/state/preferences.store';
import { Strana } from '../models/strana';
import {
  FilterDef,
  FilterValue,
  jeDozvoljenSort,
  ListQuery,
  normalizujFilter,
  parseListParams,
  REZERVISANI_PARAMETRI,
  toQueryParams,
  VELICINE,
} from './list-params';
import { setError, setLoaded, setLoading, withRequestStatus } from './request-status.feature';

/** Koliko se čeka posle poslednjeg otkucaja u tekstualnom filteru pre navigacije (i učitavanja). */
export const DEBOUNCE_PRETRAGE_MS = 300;

export interface ListQueryConfig<T extends { id: number }, F extends Record<string, FilterValue>> {
  /** Ključ za zapamćene filtere u PreferencesStore-u, npr. `'predavanja'`. */
  kljuc: string;
  /** Svi filteri liste i njihovi tipovi; ime filtera je i ime query parametra. */
  filteri: Record<keyof F, FilterDef>;
  podrazumevano: ListQuery<F>;
  /** Dozvoljena polja sorta (isto što backend prihvata; nepoznato polje bi dalo 400). */
  sortPolja: string[];
  /** Poziva se jednom, u injection kontekstu store-a; vraća funkciju koja učitava jednu stranu. */
  loader: () => (q: ListQuery<F>) => Observable<Strana<T>>;
  /**
   * Filteri koje određuje ruta (npr. predmet huba). Poziva se u injection kontekstu store-a pri svakoj promeni
   * parametara rute ili URL-a. Zaključani filteri se ne mogu menjati, ne ulaze u URL, zapamćene filtere ni `imaFiltera`.
   */
  zakljucano?: () => Partial<F>;
}

interface ListQueryState<F> {
  upit: ListQuery<F>;
  ukupno: number;
  zakljucano: Partial<F>;
}

function porukaGreske(e: unknown): string {
  return e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM;
}

function bezStrane(params: Params): Params {
  const rest = { ...params };
  delete rest['strana'];
  return rest;
}

/**
 * Lista sa filterima, sortom i stranama, sinhronizovana sa query parametrima rute (URL je izvor istine).
 *
 * Tok: promena URL-a -> `parseListParams` (neispravno pada na podrazumevano) -> zaključani filteri -> `upit` -> učitavanje
 * (`switchMap`: prethodni zahtev se otkazuje). Metode `postavi*` ne menjaju stanje direktno nego navigiraju; promena
 * stiže nazad kroz URL. Store navigira sam od sebe samo dvaput i nikad u petlji: jednom na početku (zapamćeni filteri,
 * kad URL nema nijedan parametar liste) i kad je strana iza poslednje (prelazak na poslednju postojeću; strana samo opada).
 * Neispravan URL se ne prepravlja (nema navigacije), samo se tumači kao podrazumevan.
 *
 * Više poziva `postavi*` u istom tiku se sabira: svaki kreće od cilja navigacije koja je u toku (`_nav.cilj`), ne od
 * `upit`-a koji se menja tek kad URL stigne. Cilj se briše kad se sve pokrenute navigacije završe (uspeh, otkazivanje,
 * greška), pa otkazana navigacija ne ostavlja zaglavljen cilj.
 *
 * Store mora biti provajdovan u rutiranoj komponenti (koristi njen `ActivatedRoute`).
 */
export function withListQuery<T extends { id: number }, F extends Record<string, FilterValue>>(cfg: ListQueryConfig<T, F>) {
  const kljucevi = Object.keys(cfg.filteri) as (keyof F & string)[];
  const sudar = kljucevi.find(k => (REZERVISANI_PARAMETRI as readonly string[]).includes(k));
  if (sudar) {
    throw new Error(`withListQuery(${cfg.kljuc}): filter se ne sme zvati "${sudar}".`);
  }
  const pod = cfg.podrazumevano;
  const parse = (pm: ParamMap) => parseListParams<F>(pm, cfg.filteri, pod, cfg.sortPolja);
  const jeZakljucan = (zak: Partial<F>, k: string) => Object.hasOwn(zak, k);
  const sZakljucanim = (q: ListQuery<F>, zak: Partial<F>): ListQuery<F> => ({ ...q, filteri: { ...q.filteri, ...zak } });
  /** Parametri liste za URL: bez podrazumevanih vrednosti i bez zaključanih filtera (oni su u putanji). */
  const urlParams = (q: ListQuery<F>, zak: Partial<F>): Params => {
    const params = toQueryParams(q, pod);
    for (const k of Object.keys(zak)) {
      delete params[k];
    }
    return params;
  };
  /** Svi parametri liste na `null`: uz `queryParamsHandling: 'merge'` brišu stare, a ostale parametre ne diraju. */
  const ocisti: Params = Object.fromEntries([...kljucevi, ...REZERVISANI_PARAMETRI].map(k => [k, null]));
  const jednako = (a: ListQuery<F>, b: ListQuery<F>) => JSON.stringify(a) === JSON.stringify(b);
  /** Zaključane vrednosti iz rute po pravilima filtera; neispravna (`NaN` iz `/predmeti/abc`) nije zaključana. */
  const ispravnoZakljucano = (sirovo: Partial<F>): Partial<F> => {
    const zak: Partial<Record<string, FilterValue>> = {};
    for (const [k, v] of Object.entries(sirovo ?? {})) {
      const n = Object.hasOwn(cfg.filteri, k) ? normalizujFilter(v, cfg.filteri[k as keyof F]) : undefined;
      if (n !== undefined && n !== null) {
        zak[k] = n;
      }
    }
    return zak as Partial<F>;
  };

  return signalStoreFeature(
    withEntities<T>(),
    withRequestStatus(),
    withState<ListQueryState<F>>({ upit: pod, ukupno: 0, zakljucano: {} }),
    withProps(() => ({
      _router: inject(Router),
      _route: inject(ActivatedRoute),
      _prefs: inject(PreferencesStore),
      _injector: inject(Injector),
      _loader: cfg.loader(),
      /** Otkucan tekst koji čeka debounce (nije stanje: ne prikazuje se, samo se šalje u URL). */
      _pretraga: { tajmer: undefined as ReturnType<typeof setTimeout> | undefined, vrednosti: {} as Partial<F> },
      _url: { prvi: true, poslednjiUcitan: null as string | null },
      /** Upit ka kojem navigacija ide, dok se sve pokrenute navigacije ne završe (`uToku`). */
      _nav: { cilj: null as ListQuery<F> | null, uToku: 0 },
    })),
    withComputed(({ entities, upit, ukupno, zakljucano }) => ({
      stavke: computed(() => entities()),
      imaFiltera: computed(() => {
        const { filteri } = upit();
        const zak = zakljucano();
        return kljucevi.some(k => !jeZakljucan(zak, k) && filteri[k] !== pod.filteri[k]);
      }),
      brojStrana: computed(() => Math.ceil(ukupno() / upit().velicina)),
    })),
    withMethods(store => {
      const navigiraj = (q: ListQuery<F>, opcije: { replaceUrl: boolean; sacuvaj: boolean }) => {
        const params = urlParams(q, store.zakljucano());
        if (opcije.sacuvaj) {
          store._prefs.sacuvajFiltere(cfg.kljuc, bezStrane(params));
        }
        const nav = store._nav;
        nav.cilj = q;
        nav.uToku++;
        const gotovo = () => {
          nav.uToku--;
          if (nav.uToku === 0) {
            nav.cilj = null;
          }
        };
        store._router
          .navigate([], {
            relativeTo: store._route,
            queryParams: { ...ocisti, ...params },
            queryParamsHandling: 'merge',
            replaceUrl: opcije.replaceUrl,
          })
          // greška navigacije ide kroz Router; lista ostaje na upitu iz URL-a
          .then(gotovo, gotovo);
      };

      /** Polazni upit za sledeću promenu: cilj navigacije u toku ili, ako je nema, trenutni upit. */
      const osnova = () => store._nav.cilj ?? store.upit();

      /** Navigira na novi upit ako se razlikuje od polaznog. */
      const idi = (q: ListQuery<F>, replaceUrl = false) => {
        if (!jednako(q, osnova())) {
          navigiraj(q, { replaceUrl, sacuvaj: true });
        }
      };

      /** Uzima tekst koji čeka debounce i otkazuje tajmer. */
      const uzmiPretragu = (): Partial<F> => {
        clearTimeout(store._pretraga.tajmer);
        const vrednosti = store._pretraga.vrednosti;
        store._pretraga.tajmer = undefined;
        store._pretraga.vrednosti = {};
        return vrednosti;
      };

      const saFilterima = (izmene: Partial<F>): ListQuery<F> => {
        const upit = osnova();
        return { ...upit, filteri: { ...upit.filteri, ...izmene }, strana: 1 };
      };

      const ucitaj = rxMethod<ListQuery<F>>(
        pipe(
          tap(() => patchState(store, setLoading())),
          switchMap(q =>
            store._loader(q).pipe(
              tap(s => {
                const content = s?.content ?? [];
                const ukupno = s?.page?.totalElements ?? content.length;
                patchState(store, setAllEntities<T>(content), { ukupno }, setLoaded());
                const poslednja = s?.page?.totalPages ?? 0;
                if (content.length === 0 && q.strana > 1 && q.strana > poslednja) {
                  // zastareo link (strana=9 a ima ih 2): na poslednju postojeću; strana samo opada, pa nema petlje
                  navigiraj({ ...q, strana: Math.max(1, poslednja) }, { replaceUrl: true, sacuvaj: false });
                }
              }),
              catchError((e: unknown) => {
                patchState(store, setError(porukaGreske(e))); // entiteti ostaju: stari prikaz + panel greške
                return EMPTY;
              }),
            ),
          ),
        ),
      );

      const primeniUrl = (pm: ParamMap) => {
        const zak = cfg.zakljucano ? ispravnoZakljucano(runInInjectionContext(store._injector, cfg.zakljucano)) : ({} as Partial<F>);
        let q = sZakljucanim(parse(pm), zak);
        if (store._url.prvi) {
          store._url.prvi = false;
          const imaParametre = [...REZERVISANI_PARAMETRI, ...kljucevi].some(k => !jeZakljucan(zak, k) && pm.has(k));
          const sacuvano = imaParametre ? null : store._prefs.filteri(cfg.kljuc);
          if (sacuvano) {
            const izSacuvanog = sZakljucanim(parse(convertToParamMap(bezStrane(sacuvano))), zak);
            if (Object.keys(urlParams(izSacuvanog, zak)).length > 0) {
              q = izSacuvanog;
              patchState(store, { zakljucano: zak });
              navigiraj(q, { replaceUrl: true, sacuvaj: false });
            }
          }
        }
        patchState(store, { zakljucano: zak, upit: q });
        const kljuc = JSON.stringify(q);
        if (kljuc !== store._url.poslednjiUcitan) {
          store._url.poslednjiUcitan = kljuc;
          ucitaj(q);
        }
      };

      /** Izmene filtera iz koda, normalizovane po pravilima URL-a; zaključani, nepoznati i neispravni se izostavljaju. */
      const ispravneIzmene = (izmene: Partial<F>): Partial<F> => {
        const zak = store.zakljucano();
        const ispravne: Partial<Record<string, FilterValue>> = {};
        for (const [k, v] of Object.entries(izmene)) {
          if (!Object.hasOwn(cfg.filteri, k) || jeZakljucan(zak, k)) {
            continue;
          }
          const n = normalizujFilter(v, cfg.filteri[k as keyof F]);
          if (n !== undefined) {
            ispravne[k] = n;
          }
        }
        return ispravne as Partial<F>;
      };

      return {
        _pratiUrl: rxMethod<ParamMap>(tap(primeniUrl)),
        /** Jedan filter; `tekst` se debounsuje ({@link DEBOUNCE_PRETRAGE_MS}) i ide sa `replaceUrl`. Strana se vraća na 1. */
        postaviFilter<K extends keyof F & string>(k: K, v: F[K]): void {
          const izmena = ispravneIzmene({ [k]: v } as unknown as Partial<F>);
          if (!Object.hasOwn(izmena, k)) {
            return;
          }
          if (cfg.filteri[k].tip === 'tekst') {
            clearTimeout(store._pretraga.tajmer);
            store._pretraga.vrednosti = { ...store._pretraga.vrednosti, ...izmena };
            store._pretraga.tajmer = setTimeout(() => idi(saFilterima(uzmiPretragu()), true), DEBOUNCE_PRETRAGE_MS);
            return;
          }
          idi(saFilterima({ ...uzmiPretragu(), ...izmena }));
        },
        /** Više filtera odjednom, jednom navigacijom i bez debounce-a (npr. „Primeni“ u panelu filtera). */
        postaviFiltere(izmene: Partial<F>): void {
          const ispravne = ispravneIzmene(izmene);
          if (Object.keys(ispravne).length === 0) {
            return;
          }
          idi(saFilterima({ ...uzmiPretragu(), ...ispravne }));
        },
        postaviSort(sort: string): void {
          if (jeDozvoljenSort(sort, cfg.sortPolja)) {
            idi({ ...saFilterima(uzmiPretragu()), sort });
          }
        },
        postaviStranu(n: number): void {
          if (Number.isSafeInteger(n) && n >= 1) {
            idi({ ...saFilterima(uzmiPretragu()), strana: n });
          }
        },
        postaviVelicinu(n: number): void {
          if ((VELICINE as readonly number[]).includes(n)) {
            idi({ ...saFilterima(uzmiPretragu()), velicina: n });
          }
        },
        ocistiFiltere(): void {
          uzmiPretragu();
          idi({ ...osnova(), filteri: { ...pod.filteri, ...store.zakljucano() }, strana: 1 });
        },
        osvezi(): void {
          ucitaj(store.upit());
        },
      };
    }),
    withHooks({
      onInit(store) {
        const route = store._route;
        // parametri cele putanje (zaključan filter može doći iz roditeljske rute huba) + query parametri
        store._pratiUrl(combineLatest([...route.pathFromRoot.map(r => r.paramMap), route.queryParamMap]).pipe(map(() => route.snapshot.queryParamMap)));
      },
      onDestroy(store) {
        clearTimeout(store._pretraga.tajmer);
      },
    }),
  );
}
