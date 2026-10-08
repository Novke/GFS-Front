import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import {
  catchError,
  concat,
  concatMap,
  defer,
  EMPTY,
  expand,
  firstValueFrom,
  forkJoin,
  map,
  Observable,
  of,
  reduce,
  Subject,
  Subscription,
  switchMap,
  tap,
} from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { StudentiApi, StudentListItem } from '../../../core/api/studenti.api';
import { NotificationStore } from '../../../core/state/notification.store';
import { setError, setLoaded, setLoading, withRequestStatus } from '../../../shared/store/request-status.feature';
import { PredavanjaApi } from './predavanja.api';
import { PredavanjeAktivnostInfo, PredavanjeDetails, TipAktivnosti } from './predavanja.models';

/** Stanje studenta na predavanju; `odsutan` = nema aktivnosti. */
export type StanjeStudenta = 'odsutan' | 'prisutan' | 'zadatak' | 'zvezdica';

/** Klik na pločicu kruži: odsutan -> prisutan -> zadatak -> zvezdica -> prisutan (klik nikad ne briše prisustvo). */
export const SLEDECE_STANJE: Record<StanjeStudenta, StanjeStudenta> = {
  odsutan: 'prisutan',
  prisutan: 'zadatak',
  zadatak: 'zvezdica',
  zvezdica: 'prisutan',
};

const IZ_TIPA: Record<TipAktivnosti, StanjeStudenta> = { PRISUSTVO: 'prisutan', ZADATAK: 'zadatak', SA_ZVEZDICOM: 'zvezdica' };

export function stanjeIzAktivnosti(a: PredavanjeAktivnostInfo | undefined): StanjeStudenta {
  return a ? (IZ_TIPA[a.tip] ?? 'prisutan') : 'odsutan';
}

export interface IzmenaZaglavlja {
  rb: number;
  tema: string;
  datum: string;
}

export interface BrojeviPredavanja {
  prisutnoUkupno: number;
  prisutnoStarijih: number;
  prisutnoIzGrupe: number;
  /** Studenti koji su sada u grupi predavanja (0 za predavanje bez grupe). */
  studenataGrupe: number;
  zadaci: number;
  zvezdice: number;
}

interface PredavanjeState {
  predavanje: PredavanjeDetails | null;
  /** Pločice: studenti grupe + stariji (zabeleženi ili dodati biračem), prirodnim redom indeksa. */
  studenti: StudentListItem[];
  /** Optimistično stanje (ono što korisnik vidi). */
  stanjePoStudentu: Record<number, StanjeStudenta>;
  /** Student ima izmenu koju server još nije potvrdio. */
  cekanje: Record<number, boolean>;
  _grupaIds: number[];
}

/** Jedan klik u redu studenta: cilj i stanje pre klika (za "Poništi"). */
interface Korak {
  cilj: StanjeStudenta;
  prethodno: StanjeStudenta;
}

const indeksi = new Intl.Collator('sr-Latn', { numeric: true, sensitivity: 'base' });

function poIndeksu(a: StudentListItem, b: StudentListItem): number {
  return indeksi.compare(a.indeks ?? '', b.indeks ?? '') || (a.godina ?? 0) - (b.godina ?? 0) || a.id - b.id;
}

function porukaGreske(e: unknown): string {
  return e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM;
}

const imeStudenta = (s: { ime: string | null; prezime: string | null } | undefined): string =>
  s ? [s.ime, s.prezime].filter(Boolean).join(' ') || 'Student' : 'Student';

/** Velika grupa: sve strane studenata (100 po strani), redom. */
function sviStudentiGrupe(api: StudentiApi, grupaId: number): Observable<StudentListItem[]> {
  const strana = (page: number) => api.pretraga({ grupaId, page, size: 100 }, { tiho: true });
  return strana(0).pipe(
    expand(s => (s.page.number + 1 < s.page.totalPages ? strana(s.page.number + 1) : EMPTY)),
    reduce((svi, s) => [...svi, ...(s.content ?? [])], [] as StudentListItem[]),
  );
}

/**
 * Detalj predavanja: beleženje uživo i pregled (provajduje se u `PredavanjeDetalj`).
 *
 * Izmene stanja studenata su **optimistične** (vidljive odmah) i **serijalizovane po studentu**: svaki student ima svoj
 * red (`concatMap`), pa je za njega u svakom trenutku najviše jedan zahtev u toku; različiti studenti idu paralelno.
 * Kad korak dođe na red, prelaz se računa od stanja koje je server poslednje potvrdio, a korak koji je u međuvremenu
 * nadjačan novijim klikom se preskače (tri brza klika = najviše dva zahteva). Posle odgovora se stanje studenta
 * usaglašava sa serverom **samo ako u redu nema novijih klikova**, pa odgovor koji kasni nikad ne pregazi poslednji klik
 * (Review Focus 3). Greška: stanje se vraća na poslednje potvrđeno i javlja se greška; uspeh: "Ime Prezime: stanje" sa
 * "Poništi" (poruke grupe `predavanje-<id>` se zamenjuju, pa samo poslednja izmena nosi "Poništi").
 *
 * Završeno predavanje je samo za čitanje: backend nema "ponovo otvori" (`zavrsiPredavanje` samo postavlja `true`).
 */
export const PredavanjeStore = signalStore(
  withState<PredavanjeState>({ predavanje: null, studenti: [], stanjePoStudentu: {}, cekanje: {}, _grupaIds: [] }),
  withRequestStatus(),
  withProps(() => ({
    _api: inject(PredavanjaApi),
    _studentiApi: inject(StudentiApi),
    _obavestenja: inject(NotificationStore),
    _redovi: new Map<number, Subject<Korak>>(),
    /** Promenljivo knjigovodstvo (nije stanje): pretplate redova, učitavanje u toku, uništen store. */
    _r: { veze: new Subscription(), ucitavanje: null as Subscription | null, unisten: false },
    /** Koraci u redu po studentu (uključujući onaj koji se izvršava). */
    _naCekanju: new Map<number, number>(),
    /** Poslednje stanje koje je server potvrdio, po studentu. */
    _potvrdjeno: new Map<number, StanjeStudenta>(),
  })),
  withComputed(({ predavanje, studenti, _grupaIds }) => ({
    zavrseno: computed(() => predavanje()?.zavrseno === true),
    /** Pločice koje nisu iz grupe predavanja (ponovci, premešteni); predavanje bez grupe nema "starije". */
    stariji: computed<ReadonlySet<number>>(() => {
      if (!predavanje()?.grupa) {
        return new Set();
      }
      const grupa = new Set(_grupaIds());
      return new Set(studenti().filter(s => !grupa.has(s.id)).map(s => s.id));
    }),
    _poStudentu: computed(() => new Map(studenti().map(s => [s.id, s]))),
  })),
  withComputed(({ stanjePoStudentu, stariji, _grupaIds }) => ({
    brojevi: computed<BrojeviPredavanja>(() => {
      const stanja = stanjePoStudentu();
      const st = stariji();
      let prisutnoUkupno = 0;
      let prisutnoStarijih = 0;
      let zadaci = 0;
      let zvezdice = 0;
      for (const [id, s] of Object.entries(stanja)) {
        if (s === 'odsutan') {
          continue;
        }
        prisutnoUkupno++;
        if (st.has(Number(id))) {
          prisutnoStarijih++;
        }
        if (s === 'zadatak') {
          zadaci++;
        } else if (s === 'zvezdica') {
          zvezdice++;
        }
      }
      return {
        prisutnoUkupno,
        prisutnoStarijih,
        prisutnoIzGrupe: prisutnoUkupno - prisutnoStarijih,
        studenataGrupe: _grupaIds().length,
        zadaci,
        zvezdice,
      };
    }),
  })),
  withMethods(store => {
    const id = () => store.predavanje()?.id ?? null;
    const grupaPoruka = () => `predavanje-${id()}`;

    /** Odgovor servera: potvrđeno stanje i aktivnost **samo ovog** studenta (ostali možda imaju svoje zahteve u toku). */
    function uskladi(sId: number, det: PredavanjeDetails): void {
      const aktivnost = det.aktivnosti?.find(a => a.student?.id === sId);
      store._potvrdjeno.set(sId, stanjeIzAktivnosti(aktivnost));
      patchState(store, s => {
        if (!s.predavanje) {
          return {};
        }
        const ostale = s.predavanje.aktivnosti.filter(a => a.student?.id !== sId);
        return { predavanje: { ...s.predavanje, aktivnosti: aktivnost ? [...ostale, aktivnost] : ostale } };
      });
    }

    /** HTTP koraci od potvrđenog do ciljnog stanja (današnji API; vidi `PredavanjeService`). */
    function prelaz(pId: number, sId: number, od: StanjeStudenta, cilj: StanjeStudenta): (() => Observable<PredavanjeDetails>)[] {
      const api = store._api;
      const t = { tiho: true };
      if (od === cilj) {
        return [];
      }
      if (cilj === 'odsutan') {
        return [() => api.ukloniPrisustvo(pId, sId, t)];
      }
      const koraci: (() => Observable<PredavanjeDetails>)[] = od === 'odsutan' ? [() => api.prisustvo(pId, sId, t)] : [];
      const tip: StanjeStudenta = od === 'odsutan' ? 'prisutan' : od;
      if (cilj === 'zadatak') {
        koraci.push(() => api.zadatak(pId, sId, t));
      } else if (cilj === 'zvezdica') {
        koraci.push(() => api.zvezdica(pId, sId, t));
      } else if (tip !== 'prisutan') {
        // zadatak/zvezdica -> prisutan: `skloniZadatak` vraća tip na PRISUSTVO i za SA_ZVEZDICOM
        koraci.push(() => api.ukloniZadatak(pId, sId, t));
      }
      return koraci;
    }

    function zavrsiKorak(sId: number, korak: Korak, greska: unknown): void {
      const ostalo = (store._naCekanju.get(sId) ?? 1) - 1;
      store._naCekanju.set(sId, ostalo);
      if (ostalo > 0) {
        return; // noviji klik u redu: on određuje konačno stanje
      }
      const potvrdjeno = store._potvrdjeno.get(sId) ?? 'odsutan';
      patchState(store, s => ({
        stanjePoStudentu: { ...s.stanjePoStudentu, [sId]: potvrdjeno },
        cekanje: { ...s.cekanje, [sId]: false },
      }));
      const ime = imeStudenta(store._poStudentu().get(sId));
      if (greska !== null) {
        store._obavestenja.greska(`${ime}: ${porukaGreske(greska)}`);
      } else if (potvrdjeno === korak.cilj && korak.prethodno !== korak.cilj) {
        store._obavestenja.uspeh(
          `${ime}: ${korak.cilj}`,
          { label: 'Poništi', run: () => postavi(sId, korak.prethodno) },
          { grupa: grupaPoruka() },
        );
      }
    }

    function izvrsi(pId: number, sId: number, korak: Korak): Observable<unknown> {
      return defer(() => {
        if ((store._naCekanju.get(sId) ?? 0) > 1) {
          // nadjačan novijim klikom: preskače se (noviji prelaz kreće od potvrđenog stanja)
          store._naCekanju.set(sId, (store._naCekanju.get(sId) ?? 1) - 1);
          return EMPTY;
        }
        const od = store._potvrdjeno.get(sId) ?? 'odsutan';
        const zahtevi = prelaz(pId, sId, od, korak.cilj).map(z => defer(z).pipe(tap(det => uskladi(sId, det))));
        return concat(...zahtevi).pipe(
          reduce(() => null, null),
          tap(() => zavrsiKorak(sId, korak, null)),
          catchError((e: unknown) => {
            zavrsiKorak(sId, korak, e);
            return EMPTY;
          }),
        );
      });
    }

    function red(pId: number, sId: number): Subject<Korak> {
      let r = store._redovi.get(sId);
      if (!r) {
        const novi = new Subject<Korak>();
        store._r.veze.add(novi.pipe(concatMap(k => izvrsi(pId, sId, k))).subscribe());
        store._redovi.set(sId, novi);
        r = novi;
      }
      return r;
    }

    function postavi(sId: number, cilj: StanjeStudenta): void {
      const p = store.predavanje();
      if (store._r.unisten || !p || p.zavrseno === true || !store._poStudentu().has(sId)) {
        return;
      }
      const prethodno = store.stanjePoStudentu()[sId] ?? 'odsutan';
      const naCekanju = store._naCekanju.get(sId) ?? 0;
      if (prethodno === cilj && naCekanju === 0) {
        return;
      }
      patchState(store, s => ({
        stanjePoStudentu: { ...s.stanjePoStudentu, [sId]: cilj },
        cekanje: { ...s.cekanje, [sId]: true },
      }));
      store._naCekanju.set(sId, naCekanju + 1);
      red(p.id, sId).next({ cilj, prethodno });
    }

    function resetujRedove(): void {
      store._r.veze.unsubscribe();
      store._r.veze = new Subscription();
      store._redovi.clear();
      store._naCekanju.clear();
      store._potvrdjeno.clear();
    }

    /**
     * Zabeleženi studenti van grupe (stariji) imaju u `PredavanjeDetails` samo ime i indeks; grupa i godina upisa
     * (za `GD14/2024`) se dopunjuju pretragom po indeksu. Neuspela dopuna nije greška: pločica ostaje bez godine.
     */
    function dopuniVanGrupe(p: PredavanjeDetails, grupa: StudentListItem[]): Observable<StudentListItem[]> {
      const uGrupi = new Set(grupa.map(s => s.id));
      const van = (p.aktivnosti ?? []).map(a => a.student).filter(st => st && !uGrupi.has(st.id));
      if (van.length === 0) {
        return of([]);
      }
      return forkJoin(
        van.map(st =>
          store._studentiApi.pretraga({ q: st.indeks?.replace(/\s+/g, ''), size: 100 }, { tiho: true }).pipe(
            map(r => r.content?.find(x => x.id === st.id) ?? null),
            catchError(() => of(null)),
          ),
        ),
      ).pipe(map(r => r.filter((x): x is StudentListItem => x !== null)));
    }

    /** Postavlja predavanje i pločice; studenti sa aktivnošću koji nisu u grupi dobijaju pločicu (stariji). */
    function postaviPodatke(predavanje: PredavanjeDetails, grupa: StudentListItem[], vanGrupe: StudentListItem[]): void {
      const aktivnosti = predavanje.aktivnosti ?? [];
      const poId = new Map(grupa.map(s => [s.id, s]));
      const dopunjeni = new Map(vanGrupe.map(s => [s.id, s]));
      for (const a of aktivnosti) {
        if (a.student && !poId.has(a.student.id)) {
          poId.set(a.student.id, dopunjeni.get(a.student.id) ?? { ...a.student, godina: null, email: null, brojTelefona: null, grupa: null });
        }
      }
      const studenti = [...poId.values()].sort(poIndeksu);
      const stanja: Record<number, StanjeStudenta> = {};
      for (const s of studenti) {
        const st = stanjeIzAktivnosti(aktivnosti.find(a => a.student?.id === s.id));
        stanja[s.id] = st;
        store._potvrdjeno.set(s.id, st);
      }
      patchState(
        store,
        {
          predavanje: { ...predavanje, aktivnosti },
          studenti,
          stanjePoStudentu: stanja,
          cekanje: {},
          _grupaIds: grupa.map(s => s.id),
        },
        setLoaded(),
      );
    }

    /** Samo polja zaglavlja iz odgovora: aktivnosti u store-u su potvrđene po studentu i ne prepisuju se. */
    function zaglavljeIz(det: PredavanjeDetails): void {
      patchState(store, s =>
        s.predavanje
          ? { predavanje: { ...s.predavanje, rb: det.rb, tema: det.tema, datum: det.datum, zavrseno: det.zavrseno, posecenost: det.posecenost } }
          : {},
      );
    }

    return {
      ucitaj(pId: number): void {
        store._r.ucitavanje?.unsubscribe();
        resetujRedove();
        patchState(store, { predavanje: null, studenti: [], stanjePoStudentu: {}, cekanje: {}, _grupaIds: [] }, setLoading());
        store._r.ucitavanje = store._api
          .get(pId, { tiho: true })
          .pipe(
            switchMap(p =>
              (p.grupa ? sviStudentiGrupe(store._studentiApi, p.grupa.id) : of([] as StudentListItem[])).pipe(
                switchMap(grupa => dopuniVanGrupe(p, grupa).pipe(map(vanGrupe => ({ p, grupa, vanGrupe })))),
              ),
            ),
          )
          .subscribe({
            next: ({ p, grupa, vanGrupe }) => postaviPodatke(p, grupa, vanGrupe),
            error: (e: unknown) => patchState(store, setError(porukaGreske(e))),
          });
      },

      klik(sId: number): void {
        postavi(sId, SLEDECE_STANJE[store.stanjePoStudentu()[sId] ?? 'odsutan']);
      },

      postavi,

      ukloni(sId: number): void {
        postavi(sId, 'odsutan');
      },

      /** Dodaje pločice (stariji studenti iz birača); već prisutne se preskaču. Stanje je `odsutan`. */
      dodajStarije(studenti: readonly StudentListItem[]): void {
        const postojeci = store._poStudentu();
        const novi = studenti.filter((s, i) => !postojeci.has(s.id) && studenti.findIndex(x => x.id === s.id) === i);
        if (novi.length === 0) {
          return;
        }
        patchState(store, s => ({
          studenti: [...s.studenti, ...novi].sort(poIndeksu),
          stanjePoStudentu: { ...s.stanjePoStudentu, ...Object.fromEntries(novi.map(n => [n.id, 'odsutan' as StanjeStudenta])) },
        }));
      },

      /** Napomena uz aktivnost studenta (postoji samo dok je prisutan). */
      napomena(sId: number, tekst: string): Promise<boolean> {
        const aktivnost = store.predavanje()?.aktivnosti.find(a => a.student?.id === sId);
        if (!aktivnost) {
          store._obavestenja.greska('Napomena se beleži uz prisustvo: student nije zabeležen kao prisutan.');
          return Promise.resolve(false);
        }
        return firstValueFrom(
          store._api.napomena(aktivnost.id, tekst).pipe(
            tap(info =>
              patchState(store, s =>
                s.predavanje
                  ? {
                      predavanje: {
                        ...s.predavanje,
                        aktivnosti: s.predavanje.aktivnosti.map(a => (a.id === aktivnost.id ? { ...a, napomene: info.napomene } : a)),
                      },
                    }
                  : {},
              ),
            ),
            map(() => {
              store._obavestenja.uspeh('Napomena je sačuvana.');
              return true;
            }),
            catchError(() => of(false)), // grešku je već prikazao interceptor
          ),
        );
      },

      izmeniZaglavlje(izmena: IzmenaZaglavlja): Promise<boolean> {
        const pId = id();
        if (pId === null) {
          return Promise.resolve(false);
        }
        return firstValueFrom(
          store._api.update(pId, { rb: izmena.rb, tema: izmena.tema, datum: izmena.datum }).pipe(
            map(det => {
              zaglavljeIz(det);
              store._obavestenja.uspeh('Izmene su sačuvane.');
              return true;
            }),
            catchError(() => of(false)),
          ),
        );
      },

      zavrsi(): Promise<boolean> {
        const pId = id();
        if (pId === null) {
          return Promise.resolve(false);
        }
        return firstValueFrom(
          store._api.zavrsi(pId).pipe(
            map(det => {
              zaglavljeIz({ ...det, zavrseno: true });
              // ista grupa: sklanja "Poništi" poslednje izmene, koje na završenom predavanju više ne radi
              store._obavestenja.uspeh('Predavanje je završeno.', undefined, { grupa: grupaPoruka() });
              return true;
            }),
            catchError(() => of(false)),
          ),
        );
      },

      obrisi(): Promise<boolean> {
        const pId = id();
        if (pId === null) {
          return Promise.resolve(false);
        }
        return firstValueFrom(
          store._api.obrisi(pId).pipe(
            map(() => {
              store._obavestenja.uspeh('Predavanje je obrisano.');
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
      store._r.veze.unsubscribe();
    },
  }),
);

export type PredavanjeStore = InstanceType<typeof PredavanjeStore>;
