import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, concatMap, defer, EMPTY, exhaustMap, finalize, map, Observable, of, pipe, switchMap, tap } from 'rxjs';

import { JE_ID } from '../../../core/route-matchers';
import { NotificationStore } from '../../../core/state/notification.store';
import { sRecju } from '../../../shared/util/mnozina';
import { BankaApi } from './banka.api';
import { BankaFilter, BankaPretragaStavka, IzvorVarijante, NIVOI, PonistavanjeInfo, StatusVarijante, VarijantaDetails } from './banka.models';
import { razlogBanke, TIHO, UPIS } from './greske';
import { PromeneNivoa } from './promene-nivoa';

/** Veličina strane pretrage (najviše što server daje) i najviše strana pregleda (1 000 varijanti, i kad je bez predmeta). */
const VELICINA_STRANE = 100;
const MAX_STRANA = 10;
/** Najviše varijanti u pregledu (preko toga je `skraceno`). */
export const NAJVISE_U_PREGLEDU = VELICINA_STRANE * MAX_STRANA;
/**
 * Redosled pregleda: kako su nastale (Klod piše seriju redom, zad. 1, 2, 3...), i stalan dok se pregleda. Podrazumevani sort
 * pretrage (`izmenjeno` opadajuće) bi izmenjenu varijantu (Uredi, pa nazad sa `od`) pomerio na prvo mesto i vratio preskočene posle nje.
 */
const SORT_PREGLEDA = 'id,asc';
/** Oblik serije kao na serveru (`utility/Serija`); drugačija vrednost iz linka je "bez serije". */
const SERIJA = /^[a-z0-9-]{3,60}$/;
const IZVORI: readonly IzvorVarijante[] = ['RUCNO', 'CLAUDE'];
const STATUSI: readonly StatusVarijante[] = ['NACRT', 'AKTIVNA', 'ARHIVIRANA'];

/** Učitane strane pretrage i `totalElements` servera za filter (više od učitanih = lista je skraćena). */
interface UcitaneStrane {
  stavke: BankaPretragaStavka[];
  ukupno: number;
}

/**
 * Mesto od kog pregled počinje u `ids` (rastući id-jevi): `od` kad je u listi; kad nije (u editoru je "Sačuvaj i odobri"
 * izbacio iz liste nacrta, ili je u međuvremenu obrisana), prva nastala posle nje, kao posle odobravanja na pregledu, pa
 * preskočene pre nje ostaju iza; kad posle nje nema nijedne, kraj (`ids.length`, Nazad vraća poslednju). Bez `od` prva.
 */
export function pocetakPregleda(ids: readonly number[], od: number | null): number {
  if (od === null) {
    return 0;
  }
  const i = ids.indexOf(od);
  if (i >= 0) {
    return i;
  }
  const sledeca = ids.findIndex(id => id > od);
  return sledeca >= 0 ? sledeca : ids.length;
}

/** Šta pregled prikazuje (`/banka/pregled?predmet&izvor&serija&grupa&status&nivo`); `null` = bez tog filtera. */
export interface PregledFilter {
  /** `null` = svi predmeti (link iz MCP-a nosi samo seriju): pretraga bez `predmetId`, server traži kroz sve. */
  predmet: number | null;
  izvor: IzvorVarijante | null;
  serija: string | null;
  /** Grupa i njeno podstablo (po `putanja` stavke, na klijentu). */
  grupa: number | null;
  status: StatusVarijante;
  /** Samo varijante tog nivoa (1-3); `null` = svi nivoi. */
  nivo: number | null;
}

/** Query parametri pregleda kako ih daje ruter (`withComponentInputBinding`). */
export interface UpitPregleda {
  predmet?: string;
  izvor?: string;
  serija?: string;
  grupa?: string;
  status?: string;
  nivo?: string;
}

/** Filter iz query parametara: nevažeća vrednost je "bez filtera" (`null`), a status bez ispravne vrednosti NACRT. */
export function filterPregleda(u: UpitPregleda): PregledFilter {
  const id = (v: string | undefined) => (v !== undefined && JE_ID.test(v) ? Number(v) : null);
  return {
    predmet: id(u.predmet),
    izvor: IZVORI.find(x => x === u.izvor) ?? null,
    serija: u.serija !== undefined && SERIJA.test(u.serija) ? u.serija : null,
    grupa: id(u.grupa),
    status: STATUSI.find(x => x === u.status) ?? 'NACRT',
    nivo: NIVOI.find(x => String(x) === u.nivo) ?? null,
  };
}

/** Obrnuto od {@link filterPregleda}: samo postavljeni filteri (status samo kad nije NACRT), za URL pregleda. */
export function upitPregleda(f: PregledFilter): Record<string, string | number> {
  const upit: Record<string, string | number | null> = {
    predmet: f.predmet, izvor: f.izvor, serija: f.serija, grupa: f.grupa, status: f.status === 'NACRT' ? null : f.status, nivo: f.nivo,
  };
  return Object.fromEntries(Object.entries(upit).filter((x): x is [string, string | number] => x[1] !== null));
}

/** "Obrisano: 2 varijante, 1 grupa." (i " Preskočeno: N." kad server nešto nije obrisao: odobreno, ručno, neprazno). */
export function porukaOdbacivanja(info: PonistavanjeInfo): string {
  const broj = (vrsta: string) => info.obrisano.filter(s => s.vrsta === vrsta).length;
  const poruka = `Obrisano: ${sRecju(broj('VARIJANTA'), 'varijanta', 'varijante', 'varijanti')}, ${sRecju(broj('GRUPA'), 'grupa', 'grupe', 'grupa')}.`;
  return info.preskoceno.length > 0 ? `${poruka} Preskočeno: ${info.preskoceno.length}.` : poruka;
}

interface PregledState {
  /** Filter poslednjeg `ucitaj` (`null` pre prvog). */
  filter: PregledFilter | null;
  /** Varijante za pregled, redom nastanka (`id` rastuće, sort na serveru); odobrena ili obrisana izlazi iz liste. */
  ids: number[];
  /** Mesto prikazane u `ids`; `ids.length` = posle poslednje (kraj). */
  indeks: number;
  trenutna: VarijantaDetails | null;
  /** Varijanta koju `trenutna` menja (`zamenjuje`), ako još postoji. */
  original: VarijantaDetails | null;
  /** Učitava se lista ili prikazana varijanta. */
  ucitava: boolean;
  /** Akcija (odobri, obriši, odbaci seriju) je u toku: druga se ne prima (dvostruki taster ili klik). */
  radi: boolean;
  /** Razlog neuspelog učitavanja liste ili varijante ("Pokušaj ponovo" je `ucitajPonovo`). */
  greska: string | null;
  /**
   * Server ima više varijanti za filter nego što se učitava ({@link MAX_STRANA} strana po {@link VELICINA_STRANE}): lista nije
   * cela, a ostale (novije, `sort=id,asc`) stižu tek kad se ove pregledaju i lista učita ponovo.
   */
  skraceno: boolean;
}

/**
 * Pregled nacrta jedan po jedan (`/banka/pregled`): lista varijanti iz `GET banka/pretraga` po filteru (redom nastanka, strane
 * po 100 dok ih ima, najviše 10, a kad ih server ima više, `skraceno`; bez predmeta u filteru pretraga ide bez `predmetId`, pa
 * server traži kroz sve predmete; grupa se sužava na klijentu po putanji), pa prikazana varijanta i, kad je
 * kopija (`zamenjuje`), njen original. Početak je `od` ({@link pocetakPregleda}: ili prva posle nje kad je izašla iz liste).
 * Posle odobravanja ili brisanja varijanta izlazi iz liste i prikazuje se sledeća (na istom mestu); `sledeca` posle
 * poslednje daje `kraj`. Varijanta koje u međuvremenu više nema (404) se preskače. Akcije idu jedna po jedna (`radi`), a
 * odgovor akcije posle novog `ucitaj` se zanemaruje. Greške učitavanja su u `greska`, greške akcija idu u `NotificationStore` (`razlogBanke`). Feature store:
 * provajduje ga stranica pregleda.
 */
export const PregledNacrtaStore = signalStore(
  withState<PregledState>({
    filter: null,
    ids: [],
    indeks: 0,
    trenutna: null,
    original: null,
    ucitava: false,
    radi: false,
    greska: null,
    skraceno: false,
  }),
  withProps(() => ({
    _api: inject(BankaApi),
    _obavestenja: inject(NotificationStore),
  })),
  withComputed(({ filter, ids, indeks, ucitava, greska }) => ({
    /** Prazno posle poslednje (i kad lista nema ništa); pre prvog učitavanja i uz grešku nije kraj. */
    kraj: computed(() => filter() !== null && !ucitava() && greska() === null && indeks() >= ids().length),
    /** "12 / 48" (mesto prikazane / koliko ih je ostalo u listi); prazno kad ništa nije prikazano. */
    napredak: computed(() => (indeks() < ids().length ? `${indeks() + 1} / ${ids().length}` : '')),
  })),
  withMethods(store => {
    /** Raste sa svakim `ucitaj`: odgovor akcije iz prethodne liste se ne primenjuje na novu. */
    let generacija = 0;

    /**
     * Sve strane pretrage (najviše {@link MAX_STRANA}), po {@link SORT_PREGLEDA}; `ukupno` = `totalElements` prve strane
     * (koliko ih server ima za filter). `predmetId: null` je pretraga kroz sve predmete (server, `BankaSpecs.predmet(null)`).
     */
    const strane = (f: BankaFilter, page = 0): Observable<UcitaneStrane> =>
      store._api.pretraga(f, { page, size: VELICINA_STRANE, sort: SORT_PREGLEDA }, TIHO).pipe(
        switchMap(s => (s.content.length > 0 && page + 1 < Math.min(s.page.totalPages, MAX_STRANA)
          ? strane(f, page + 1).pipe(map(dalje => [...s.content, ...dalje.stavke]))
          : of(s.content)).pipe(map(stavke => ({ stavke, ukupno: s.page.totalElements })))),
      );

    /**
     * Lista pregleda redom nastanka (`sort=id,asc` na serveru, i preko predmeta: na tome stoji `pocetakPregleda`), svaka
     * varijanta jednom: ona koja između dve strane uđe u filter (npr. vraćena u nacrt) pomera ostale, pa bi se ponovila.
     */
    const stavke = (f: PregledFilter): Observable<{ lista: BankaPretragaStavka[]; skraceno: boolean }> =>
      strane({ predmetId: f.predmet, namena: null, q: null, status: f.status, izvor: f.izvor, serija: f.serija, nivo: f.nivo }).pipe(
        map(({ stavke: sve, ukupno }) => {
          const vidjene = new Set<number>();
          return {
            lista: sve.filter(s => !vidjene.has(s.varijantaId) && vidjene.add(s.varijantaId)
              && (f.grupa === null || s.putanja.some(p => p.id === f.grupa))),
            skraceno: ukupno > sve.length,
          };
        }),
      );

    /** Prikazana varijanta (`ids[indeks]`) i njen original; 404 izbacuje id iz liste i prelazi na sledeću. */
    const ucitajTrenutnu = (): Observable<unknown> => defer(() => {
      const id = store.ids()[store.indeks()];
      if (id === undefined) {
        patchState(store, { trenutna: null, original: null, ucitava: false });
        return EMPTY;
      }
      patchState(store, { trenutna: null, original: null, ucitava: true, greska: null });
      return store._api.varijanta(id, TIHO).pipe(
        switchMap(v => (v.zamenjuje === null
          ? of({ v, original: null })
          : store._api.varijanta(v.zamenjuje, TIHO).pipe(
            map(original => ({ v, original })),
            catchError(() => of({ v, original: null })),
          ))),
        tap(({ v, original }) => patchState(store, { trenutna: v, original, ucitava: false })),
        catchError((e: unknown) => {
          if (e instanceof HttpErrorResponse && e.status === 404) {
            patchState(store, s => ({ ids: s.ids.filter(x => x !== id) }));
            return ucitajTrenutnu();
          }
          patchState(store, { ucitava: false, greska: razlogBanke(e) });
          return EMPTY;
        }),
      );
    });
    /** `true` = prikaži `ids[indeks]`; `false` samo prekida učitavanje u letu (nova lista). */
    const prikazi = rxMethod<boolean>(pipe(switchMap(ucitaj => (ucitaj ? ucitajTrenutnu() : EMPTY))));

    const ucitajListu = rxMethod<{ filter: PregledFilter; od: number | null }>(
      pipe(
        switchMap(({ filter: f, od }) => stavke(f).pipe(
          tap(({ lista, skraceno }) => {
            const ids = lista.map(s => s.varijantaId);
            patchState(store, { ids, indeks: pocetakPregleda(ids, od), skraceno, ucitava: false });
            prikazi(true);
          }),
          catchError((e: unknown) => {
            patchState(store, { ucitava: false, greska: razlogBanke(e) });
            return EMPTY;
          }),
        )),
      ),
    );

    const ucitaj = (f: PregledFilter, od: number | null): void => {
      generacija++;
      patchState(store, { filter: f, ids: [], indeks: 0, trenutna: null, original: null, ucitava: true, greska: null, skraceno: false });
      prikazi(false);
      ucitajListu({ filter: f, od });
    };

    /**
     * Odobrene ili obrisane varijante izlaze iz liste. Ako je jedna od njih prikazana, na njenom mestu je sledeća koja ostaje;
     * ako je korisnik u međuvremenu prešao na drugu (preskok dok je zahtev trajao), ta ostaje prikazana (mesto joj se pomera
     * za svaku uklonjenu pre nje).
     */
    const ukloni = (...uklonjene: number[]): void => {
      const ids = store.ids();
      const ostaje = (x: number) => !uklonjene.includes(x);
      if (ids.every(ostaje)) {
        return;
      }
      const prikazana = ids[store.indeks()];
      const bilaPrikazana = prikazana !== undefined && !ostaje(prikazana);
      patchState(store, { ids: ids.filter(ostaje), indeks: ids.slice(0, store.indeks()).filter(ostaje).length });
      if (bilaPrikazana) {
        prikazi(true);
      }
    };

    /**
     * Akcija nad serverom; dok traje (`radi`), nova se ne prima. `posle` se ne zove kad je u međuvremenu učitana nova lista.
     */
    const akcija = rxMethod<{ poziv: Observable<unknown>; posle: (odgovor: unknown) => void }>(
      pipe(
        exhaustMap(({ poziv, posle }) => {
          const gen = generacija;
          patchState(store, { radi: true });
          return poziv.pipe(
            tap(odgovor => {
              if (gen === generacija) {
                posle(odgovor);
              }
            }),
            catchError((e: unknown) => {
              store._obavestenja.greska(razlogBanke(e, UPIS));
              return EMPTY;
            }),
            finalize(() => patchState(store, { radi: false })),
          );
        }),
      ),
    );

    /** Promene nivoa u letu (kao u `BankaStore`): optimistična izmena, pa vraćanje na potvrđeni nivo ({@link PromeneNivoa}). */
    const nivoi = new PromeneNivoa();
    const postaviNivo = (id: number, nivo: number): void =>
      patchState(store, s => ({ trenutna: s.trenutna?.id === id ? { ...s.trenutna, nivo } : s.trenutna }));
    const posaljiNivo = rxMethod<{ id: number; nivo: number }>(
      pipe(
        concatMap(({ id, nivo }) =>
          store._api.promeniNivo(id, nivo, TIHO).pipe(
            tap(v => nivoi.potvrdi(id, v.nivo)),
            catchError((e: unknown) => {
              store._obavestenja.greska(razlogBanke(e, UPIS));
              return EMPTY;
            }),
            finalize(() => {
              const prikaz = nivoi.zavrsi(id);
              if (prikaz !== null) {
                postaviNivo(id, prikaz);
              }
            }),
          ),
        ),
      ),
    );

    return {
      /**
       * Menja nivo prikazane varijante (`PATCH banka/varijante/{id}/nivo`): odmah u prikazu, a kad zahtev padne vraća se poslednji
       * potvrđeni nivo i javlja razlog. Ne zauzima `radi` (Odobri i Obriši ostaju na raspolaganju), ne menja listu ni mesto, i
       * ne menja status, pa varijanta ostaje u filteru; filter nivoa se primenjuje tek pri sledećem učitavanju liste.
       */
      promeniNivo(nivo: number): void {
        const v = store.trenutna();
        if (!v || v.nivo === nivo) {
          return;
        }
        nivoi.pocni(v.id, v.nivo);
        postaviNivo(v.id, nivo);
        posaljiNivo({ id: v.id, nivo });
      },
      /** Lista za filter iznova; počinje od varijante `od` ({@link pocetakPregleda}), bez nje od prve. */
      ucitaj,
      /** Posle greške: lista iznova, od prikazane (ili one na kojoj je stalo). */
      ucitajPonovo(): void {
        const f = store.filter();
        if (f) {
          ucitaj(f, store.trenutna()?.id ?? store.ids()[store.indeks()] ?? null);
        }
      },
      /** Preskoči: sledeća, a posle poslednje kraj (dalje ništa). */
      sledeca(): void {
        if (store.indeks() < store.ids().length) {
          patchState(store, s => ({ indeks: s.indeks + 1 }));
          prikazi(true);
        }
      },
      /** Nazad: prethodna (na prvoj ništa); iz kraja poslednja. */
      prethodna(): void {
        if (store.indeks() > 0) {
          patchState(store, s => ({ indeks: Math.min(s.indeks, s.ids.length) - 1 }));
          prikazi(true);
        }
      },
      /**
       * `POST banka/varijante/{id}/odobri` za prikazanu, pa sledeća. Kopija (`zamenjuje`) na serveru u istoj transakciji
       * arhivira original, pa i on izlazi iz liste (inače bi ostao kao ARHIVIRANA i `O` bi ga odobrio uz kopiju).
       */
      odobri(): void {
        const v = store.trenutna();
        if (v && !store.radi()) {
          akcija({
            poziv: store._api.odobri(v.id, TIHO),
            posle: () => (v.zamenjuje === null ? ukloni(v.id) : ukloni(v.id, v.zamenjuje)),
          });
        }
      },
      /** `DELETE banka/varijante/{id}` za prikazanu (potvrdu traži stranica), pa sledeća. */
      obrisi(): void {
        const v = store.trenutna();
        if (v && !store.radi()) {
          akcija({ poziv: store._api.obrisiVarijantu(v.id, TIHO), posle: () => ukloni(v.id) });
        }
      },
      /**
       * `POST banka/serije/{serija}/odbaci` (potvrdu traži stranica): poruka sa brojevima, pa lista iznova, od prikazane ako je
       * ostala.
       */
      odbaciSeriju(): void {
        const f = store.filter();
        if (f?.serija && !store.radi()) {
          const od = store.trenutna()?.id ?? store.ids()[store.indeks()] ?? null;
          akcija({
            poziv: store._api.odbaciSeriju(f.serija, TIHO),
            posle: info => {
              store._obavestenja.uspeh(porukaOdbacivanja(info as PonistavanjeInfo));
              ucitaj(f, od);
            },
          });
        }
      },
    };
  }),
);
export type PregledNacrtaStore = InstanceType<typeof PregledNacrtaStore>;
