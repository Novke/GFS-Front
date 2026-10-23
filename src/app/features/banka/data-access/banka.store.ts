import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, concatMap, EMPTY, finalize, forkJoin, map, mergeMap, Observable, of, pipe, switchMap, tap } from 'rxjs';

import { NotificationStore } from '../../../core/state/notification.store';
import { setError, setLoaded, setLoading, withRequestStatus } from '../../../shared/store/request-status.feature';
import { BankaApi } from './banka.api';
import {
  GrupaCmd, GrupaCvor, GrupaDetails, GrupaPutanja, IskljucenaTemaInfo, IzvorVarijante, Namena, nadjiCvor, PremestiCmd, prviList,
  putanjaDo, SerijaInfo, StatusVarijante, VarijantaInfo,
} from './banka.models';
import { OpcijeRazloga, razlogBanke, TIHO, UPIS } from './greske';
import { PromeneNivoa } from './promene-nivoa';

export type FilterStatusa = StatusVarijante | 'SVE';
export type FilterIzvora = IzvorVarijante | 'SVI';

/** Grupa poruka grešaka serija i tema: kad padnu obe (npr. server ne radi), ostaje jedna poruka. */
const GRUPA_SERIJA_I_TEMA = 'banka-serije-teme';

interface BankaState {
  predmetId: number | null;
  namena: Namena;
  stablo: GrupaCvor[];
  /** Izabrana grupa stabla (list ili unutrašnji čvor); `null` = ništa (prazno stablo). */
  izabranaGrupaId: number | null;
  grupa: GrupaDetails | null;
  /** Sve varijante izabrane grupe; `filterStatusa` i `filterIzvora` se primenjuju u `filtriraneVarijante`. */
  varijante: VarijantaInfo[];
  filterStatusa: FilterStatusa;
  filterIzvora: FilterIzvora;
  /** Klodove serije predmeta (najnovije prve); učitavaju se pri promeni predmeta, ne namene. */
  serije: SerijaInfo[];
  /** Isključene teme predmeta (najnovije prve); kao `serije`. */
  teme: IskljucenaTemaInfo[];
  /** Teme čiji je `DELETE` (Uključi) u letu: drugi klik na istu ne šalje novi zahtev (bio bi 404). */
  temeUToku: number[];
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

/** Zahtev za stablo: `grupaId` je željeni izbor (važi samo ako postoji u stablu), `prvo` = nov predmet/namena (status učitavanja). */
interface ZahtevStabla {
  predmetId: number;
  namena: Namena;
  grupaId: number | null;
  prvo: boolean;
}

/**
 * Stranica banke (`/banka`): stablo grupa jednog predmeta i namene, izabrana grupa sa varijantama i izmene grupa i varijanti,
 * uz Klodove serije i isključene teme predmeta. Feature store: provajduje ga rutirana stranica. Ne zna ništa o prikazu. Posle
 * svake izmene ponovo učitava stablo i izabranu grupu sa varijantama (brojači stabla i kartice ostaju tačni), uz isti izbor i
 * iste filtere, a kad predmet ima serije, i njih (brojači nacrta i odobrenih); posle brisanja, preimenovanja i premeštanja grupe
 * i isključene teme, kad ih predmet ima (njihova grupa i putanja). Greške idu u
 * `NotificationStore` (`razlogBanke`: razlog servera, 503 render servis, 504 istek, kod izmena uz proveru banke pre ponovnog
 * pokušaja, ostali 5xx opšta poruka); uz to prvo učitavanje (`ucitaj`) postavlja status `error`, a neuspelo učitavanje
 * izabrane grupe `greskaGrupe`. `zauzeto` je `true` dok traje kreiranje, dupliranje ili brisanje.
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
    filterIzvora: 'SVI',
    serije: [],
    teme: [],
    temeUToku: [],
    greskaGrupe: null,
    _zauzetih: 0,
  }),
  withRequestStatus(),
  withProps(() => ({
    _api: inject(BankaApi),
    _obavestenja: inject(NotificationStore),
  })),
  withComputed(({ stablo, izabranaGrupaId, grupa, varijante, filterStatusa, filterIzvora, _zauzetih }) => ({
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
    filtriraneVarijante: computed(() => varijante().filter(v =>
      (filterStatusa() === 'SVE' || v.status === filterStatusa()) && (filterIzvora() === 'SVI' || v.izvor === filterIzvora()))),
    /** Postavljen je filter statusa ili izvora ("Očisti filtere" ih vraća oba). */
    imaFiltera: computed(() => filterStatusa() !== 'SVE' || filterIzvora() !== 'SVI'),
  })),
  withMethods(store => {
    const prijavi = (e: unknown, o: OpcijeRazloga = {}): void => store._obavestenja.greska(razlogBanke(e, o));

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
              patchState(store, { grupa: null, varijante: [], greskaGrupe: razlogBanke(e) });
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

    /**
     * Lista predmeta (serije ili teme): novi zahtev prekida stari, pa odgovor za prethodni predmet ne stiže na novi. Greška:
     * prazna lista i poruka u grupi {@link GRUPA_SERIJA_I_TEMA}.
     */
    const ucitajListu = <T>(poziv: (predmetId: number) => Observable<T[]>, postavi: (lista: T[]) => void) =>
      rxMethod<number>(
        pipe(
          switchMap(predmetId =>
            poziv(predmetId).pipe(
              tap(postavi),
              catchError((e: unknown) => {
                postavi([]);
                store._obavestenja.greska(razlogBanke(e), { grupa: GRUPA_SERIJA_I_TEMA });
                return EMPTY;
              }),
            ),
          ),
        ),
      );
    const ucitajSerije = ucitajListu(id => store._api.serije(id, TIHO), serije => patchState(store, { serije }));
    const ucitajTeme = ucitajListu(id => store._api.iskljuceneTeme(id, TIHO), teme => patchState(store, { teme }));
    /** `ucitajSerije` ili `ucitajTeme` za tekući predmet (bez predmeta ništa). */
    const zaPredmet = (ucitaj: (predmetId: number) => void): void => {
      const predmetId = store.predmetId();
      if (predmetId !== null) {
        ucitaj(predmetId);
      }
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
                patchState(store, setError(razlogBanke(e)));
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
     * (server ih serijalizuje), a ponovno učitavanje posle njih prekida prethodno, pa važi poslednje; kad predmet ima serije,
     * učitavaju se i one (izmena varijante ili grupe serije menja njene brojače, a ručna izmena seriju ne pravi). `zauzima`:
     * neidempotentna izmena (ponovljen zahtev pravi duplikat ili 404), `zauzeto` je `true` dok njen zahtev traje. `teme`: šta
     * izmena menja u isključenim temama. `'lista'` = samu listu, pa se teme učitavaju uvek; `'grupe'` = grupe na koje teme
     * pokazuju (brisanje grupe odvezuje njenu temu, server postavlja `grupaId` na `null`; preimenovanje i premeštanje grupe ili
     * pretka menjaju `putanja`), pa se učitavaju kad ih predmet ima. Bez `teme` (varijante, nova grupa) teme se ne učitavaju.
     */
    const izmena = rxMethod<{ poziv: Observable<number | null | undefined>; zauzima?: boolean; teme?: 'lista' | 'grupe' }>(
      pipe(
        mergeMap(({ poziv, zauzima, teme }) => {
          if (zauzima) {
            patchState(store, s => ({ _zauzetih: s._zauzetih + 1 }));
          }
          return poziv.pipe(
            tap(izbor => {
              osvezi(izbor === undefined ? store.izabranaGrupaId() : izbor);
              if (store.serije().length > 0) {
                zaPredmet(ucitajSerije);
              }
              if (teme === 'lista' || (teme === 'grupe' && store.teme().length > 0)) {
                zaPredmet(ucitajTeme);
              }
            }),
            catchError((e: unknown) => {
              prijavi(e, UPIS);
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

    /** Promene nivoa u letu: optimistična izmena, pa vraćanje na potvrđeni nivo kad poslednji zahtev završi ({@link PromeneNivoa}). */
    const nivoi = new PromeneNivoa();
    const postaviNivo = (id: number, nivo: number): void =>
      patchState(store, s => ({ varijante: s.varijante.map(v => (v.id === id ? { ...v, nivo } : v)) }));
    /** Redom (`concatMap`): server ih primi onim redosledom kojim je korisnik kliknuo, pa važi poslednji klik. */
    const posaljiNivo = rxMethod<{ id: number; nivo: number }>(
      pipe(
        concatMap(({ id, nivo }) =>
          store._api.promeniNivo(id, nivo, TIHO).pipe(
            tap(v => nivoi.potvrdi(id, v.nivo)),
            catchError((e: unknown) => {
              prijavi(e, UPIS);
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
       * Učitava stablo predmeta i namene; bira `grupaId` (povratak sa editora) ako postoji u stablu, inače prvi list. Prethodno
       * stablo, izbor i varijante se brišu odmah, pa se nikad ne vidi tuđe. Serije i teme (po predmetu, ne po nameni) se učitavaju
       * kad se predmet promeni i pri ponovnom pokušaju posle greške; tuđe se takođe brišu odmah.
       */
      ucitaj(predmetId: number, namena: Namena, grupaId: number | null = null): void {
        const listePredmeta = predmetId !== store.predmetId() || store.status() === 'error';
        patchState(store, { predmetId, namena, stablo: [], izabranaGrupaId: null, grupa: null, varijante: [], greskaGrupe: null }, setLoading());
        trazenaGrupa = grupaId;
        ucitajGrupu(null);
        ucitajStablo({ predmetId, namena, grupaId, prvo: true });
        if (listePredmeta) {
          patchState(store, { serije: [], teme: [] });
          ucitajSerije(predmetId);
          ucitajTeme(predmetId);
        }
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
      postaviFilterIzvora(filterIzvora: FilterIzvora): void {
        patchState(store, { filterIzvora });
      },
      /** Oba filtera na podrazumevano (sve varijante). */
      ocisti(): void {
        patchState(store, { filterStatusa: 'SVE', filterIzvora: 'SVI' });
      },
      /** Serije tekućeg predmeta iznova (npr. posle povratka sa pregleda nacrta). */
      ucitajSerije(): void {
        zaPredmet(ucitajSerije);
      },
      /** Isključene teme tekućeg predmeta iznova. */
      ucitajTeme(): void {
        zaPredmet(ucitajTeme);
      },
      /**
       * Uključuje isključenu temu (`DELETE`), pa osvežava stablo (oznaka "Isključeno" u stablu i grupi) i teme. Greška ide u
       * `NotificationStore` kao kod ostalih izmena. Dok `DELETE` traje, tema je u `temeUToku` i nov poziv za nju se zanemaruje;
       * posle uspeha odmah izlazi iz `teme` (ne tek kad stigne ponovo učitana lista), pa ni tada nema dugmeta za drugi `DELETE`.
       * Posle greške ostaje u listi i može se pokušati ponovo.
       */
      ukljuciTemu(id: number): void {
        if (store.temeUToku().includes(id)) {
          return;
        }
        patchState(store, s => ({ temeUToku: [...s.temeUToku, id] }));
        izmena({
          poziv: store._api.ukljuciTemu(id, TIHO).pipe(
            tap(() => patchState(store, s => ({ teme: s.teme.filter(t => t.id !== id) }))),
            finalize(() => patchState(store, s => ({ temeUToku: s.temeUToku.filter(x => x !== id) }))),
            bezIzbora,
          ),
          teme: 'lista',
        });
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
        izmena({ poziv, teme: 'grupe' });
      },
      /** Briše grupu; ako je bila izabrana, bira se njen roditelj (ili prvi list kad je koren). */
      obrisiGrupu(id: number): void {
        const bila = store.izabranaGrupaId() === id;
        const roditelj = putanjaDo(store.stablo(), id).at(-2)?.id ?? null;
        const poziv = store._api.obrisiGrupu(id, TIHO).pipe(map(() => (bila ? roditelj : undefined)));
        izmena({ poziv, zauzima: true, teme: 'grupe' });
      },
      premesti(id: number, cmd: PremestiCmd): void {
        izmena({ poziv: store._api.premesti(id, cmd, TIHO).pipe(bezIzbora), teme: 'grupe' });
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
      /**
       * Menja nivo varijante (`PATCH banka/varijante/{id}/nivo`, u svakom statusu). Optimistično: kartica odmah prikazuje novi nivo;
       * kad zahtev padne, vraća se poslednji potvrđeni i javlja se razlog u `NotificationStore`. Ne osvežava stablo (nivo ne
       * menja brojače), pa izbor i fokus ostaju gde jesu.
       */
      promeniNivo(id: number, nivo: number): void {
        const v = store.varijante().find(x => x.id === id);
        if (!v || v.nivo === nivo) {
          return;
        }
        nivoi.pocni(id, v.nivo);
        postaviNivo(id, nivo);
        posaljiNivo({ id, nivo });
      },
      dupliraj(id: number): void {
        izmena({ poziv: store._api.dupliraj(id, TIHO).pipe(bezIzbora), zauzima: true });
      },
    };
  }),
);
export type BankaStore = InstanceType<typeof BankaStore>;
