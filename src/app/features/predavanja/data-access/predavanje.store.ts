import { HttpErrorResponse } from '@angular/common/http';
import { computed, ErrorHandler, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import {
  catchError,
  concat,
  concatMap,
  defer,
  EMPTY,
  expand,
  finalize,
  firstValueFrom,
  forkJoin,
  map,
  Observable,
  of,
  reduce,
  Subject,
  Subscription,
  switchMap,
  take,
  tap,
} from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { StudentiApi, StudentListItem } from '../../../core/api/studenti.api';
import { NotificationStore } from '../../../core/state/notification.store';
import { bezPrekidaReda, RegistarCuvanja, SesijaCuvanja } from '../../../core/state/registar-cuvanja';
import { setError, setLoaded, setLoading, withRequestStatus } from '../../../shared/store/request-status.feature';
import { PredavanjaApi } from '../../../core/api/predavanja.api';
import { PredavanjeAktivnostInfo, PredavanjeDetails, TipAktivnosti } from '../../../core/api/predavanja.models';

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

/** Jedan klik u redu studenta: cilj, stanje pre klika (za "Poništi") i napomena koju uklanjanje prisustva briše. */
interface Korak {
  cilj: StanjeStudenta;
  prethodno: StanjeStudenta;
  napomena: string | null;
}

/**
 * Knjigovodstvo jednog učitanog predavanja: red po studentu, broj koraka u redu i stanje koje je server potvrdio.
 * Posle napuštanja ekrana ili učitavanja drugog predavanja sesija postaje neaktivna: redovi se **i dalje prazne do servera**
 * (klik koji je korisnik video se ne gubi; HttpClient je u root injektoru), ali više ne menjaju stanje store-a niti prikazuju
 * uspeh i "Poništi" (greška se i dalje javlja). Zatvorena sesija se odjavljuje iz registra kad isprazni redove.
 */
class Sesija implements SesijaCuvanja {
  aktivna = true;
  readonly redovi = new Map<number, Subject<Korak>>();
  readonly naCekanju = new Map<number, number>();
  /** Poslednje stanje koje je server potvrdio (za prikaz posle greške i kao polazište prelaza). */
  readonly potvrdjeno = new Map<number, StanjeStudenta>();
  /**
   * Studenti čije je potvrđeno stanje nepoznato: zahtev nije uspeo, a server je možda ipak upisao (izgubljen odgovor).
   * Sledeći korak prvo čita predavanje i prelaz računa od pravog stanja; klik se ne preskače ni kad je cilj isti kao prikaz.
   */
  readonly nepoznato = new Set<number>();
  /** Raste sa svakom promenom potvrđenog stanja studenta; zastareo GET usaglašavanja se odbacuje. */
  readonly potvrde = new Map<number, number>();
  /** Koraci u redovima ili u izvršenju. */
  uToku = 0;
  readonly mirovanje = new Subject<void>();
  readonly kljuc: string;

  constructor(readonly pId: number) {
    this.kljuc = `predavanje-${pId}`;
  }

  potvrda(sId: number): number {
    return this.potvrde.get(sId) ?? 0;
  }

  /** Novo potvrđeno stanje (`undefined` = nepoznato; prikaz posle greške ostaje na poslednjem poznatom). */
  potvrdi(sId: number, stanje: StanjeStudenta | undefined): void {
    if (stanje) {
      this.potvrdjeno.set(sId, stanje);
      this.nepoznato.delete(sId);
    } else {
      this.nepoznato.add(sId);
    }
    this.potvrde.set(sId, this.potvrda(sId) + 1);
  }

  /** Za upozorenje pre zatvaranja kartice: klikovi koje server još nije primio. */
  nesacuvano(): number {
    return this.uToku;
  }
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

/** Velika grupa: sve strane studenata (100 po strani), redom. Koristi i projektor (isti broj "iz grupe" kao zaglavlje). */
export function sviStudentiGrupe(api: StudentiApi, grupaId: number): Observable<StudentListItem[]> {
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
    _registar: inject(RegistarCuvanja),
    _greske: inject(ErrorHandler),
    /** Promenljivo knjigovodstvo (nije stanje): sesija tekućeg predavanja, učitavanje u toku, uništen store. */
    _r: { sesija: null as Sesija | null, ucitavanje: null as Subscription | null, unisten: false },
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
    const aktivnaZa = (ses: Sesija) => ses.aktivna && !store._r.unisten && store.predavanje()?.id === ses.pId;

    /** Odgovor servera: potvrđeno stanje i aktivnost **samo ovog** studenta (ostali možda imaju svoje zahteve u toku). */
    function uskladi(ses: Sesija, sId: number, det: PredavanjeDetails): void {
      const aktivnost = det.aktivnosti?.find(a => a.student?.id === sId);
      ses.potvrdi(sId, stanjeIzAktivnosti(aktivnost));
      if (!aktivnaZa(ses)) {
        return;
      }
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

    /**
     * Posle greške (red prazan): ponovo čita predavanje i usaglašava tog studenta, za slučaj da je server izmenu ipak
     * upisao a odgovor se izgubio (inače bi svaki sledeći klik krenuo od pogrešnog stanja i dobijao 400). Odgovor važi
     * samo ako za studenta u međuvremenu nije stigla novija potvrda (klik koji je prošao posle slanja GET-a).
     */
    function osveziStudenta(ses: Sesija, sId: number): void {
      const potvrda = ses.potvrda(sId);
      store._api.get(ses.pId, { tiho: true }).subscribe({
        next: det => {
          if (!aktivnaZa(ses) || (ses.naCekanju.get(sId) ?? 0) > 0 || ses.potvrda(sId) !== potvrda) {
            return; // u međuvremenu novi klik ili novija potvrda: oni određuju stanje
          }
          uskladi(ses, sId, det);
          const potvrdjeno = ses.potvrdjeno.get(sId) ?? 'odsutan';
          patchState(store, s => ({ stanjePoStudentu: { ...s.stanjePoStudentu, [sId]: potvrdjeno } }));
        },
        error: () => undefined, // ostaje poslednje potvrđeno
      });
    }

    function porukaUspeha(ime: string, korak: Korak): string {
      return korak.cilj === 'odsutan' && korak.napomena
        ? `${ime}: odsutan · napomena je obrisana i ne vraća se poništavanjem`
        : `${ime}: ${korak.cilj}`;
    }

    function zavrsiKorak(ses: Sesija, sId: number, korak: Korak, greska: unknown): void {
      const ostalo = (ses.naCekanju.get(sId) ?? 1) - 1;
      ses.naCekanju.set(sId, ostalo);
      if (greska !== null) {
        ses.potvrdi(sId, undefined); // server je možda ipak upisao: sledeći korak prvo čita pravo stanje
      }
      if (ostalo > 0) {
        return; // noviji klik u redu: on određuje konačno stanje
      }
      const ime = imeStudenta(store._poStudentu().get(sId));
      if (!aktivnaZa(ses)) {
        // ekran napušten: stanje se više ne prikazuje, ali greška ne sme da prođe nezapaženo
        if (greska !== null) {
          store._obavestenja.greska(`${ime}: ${porukaGreske(greska)}`);
        }
        return;
      }
      const potvrdjeno = ses.potvrdjeno.get(sId) ?? 'odsutan';
      patchState(store, s => ({
        stanjePoStudentu: { ...s.stanjePoStudentu, [sId]: potvrdjeno },
        cekanje: { ...s.cekanje, [sId]: false },
      }));
      if (greska !== null) {
        osveziStudenta(ses, sId); // pre poruke: usaglašavanje ne zavisi od toga da li prikaz poruke uspe
        store._obavestenja.greska(`${ime}: ${porukaGreske(greska)}`);
      } else if (potvrdjeno === korak.cilj && korak.prethodno !== korak.cilj) {
        store._obavestenja.uspeh(
          porukaUspeha(ime, korak),
          {
            label: 'Poništi',
            // "Poništi" važi samo za ovo predavanje, dok je ekran otvoren
            run: () => {
              if (aktivnaZa(ses)) {
                postavi(sId, korak.prethodno);
              }
            },
          },
          { grupa: `predavanje-${ses.pId}` },
        );
      }
    }

    function izvrsi(ses: Sesija, sId: number, korak: Korak): Observable<unknown> {
      return defer(() => {
        if ((ses.naCekanju.get(sId) ?? 0) > 1) {
          // nadjačan novijim klikom: preskače se (noviji prelaz kreće od potvrđenog stanja)
          ses.naCekanju.set(sId, (ses.naCekanju.get(sId) ?? 1) - 1);
          return EMPTY;
        }
        let zavrsen = false;
        const zavrsi = (greska: unknown) => {
          zavrsen = true;
          zavrsiKorak(ses, sId, korak, greska);
        };
        // potvrđeno stanje nepoznato (ranija greška): prelaz se računa od stanja koje server stvarno ima
        const od$: Observable<StanjeStudenta> = ses.nepoznato.has(sId)
          ? store._api.get(ses.pId, { tiho: true }).pipe(
              map(det => {
                uskladi(ses, sId, det);
                return ses.potvrdjeno.get(sId) ?? 'odsutan';
              }),
            )
          : of(ses.potvrdjeno.get(sId) ?? 'odsutan');
        return od$.pipe(
          take(1),
          switchMap(od => concat(...prelaz(ses.pId, sId, od, korak.cilj).map(z => defer(z).pipe(tap(det => uskladi(ses, sId, det)))))),
          reduce(() => null, null),
          tap(() => zavrsi(null)),
          catchError((e: unknown) => {
            if (zavrsen) {
              throw e; // izuzetak iz obrade uspeha: ide u ErrorHandler (bezPrekidaReda), korak je već završen
            }
            zavrsi(e);
            return EMPTY;
          }),
        );
      }).pipe(
        // izuzetak iz obrade greške ne sme da ugasi red studenta (sledeći klikovi, pražnjenje, registar)
        (korak$: Observable<unknown>) => bezPrekidaReda(korak$, store._greske),
        finalize(() => {
          ses.uToku--;
          store._registar.promena();
          if (ses.uToku === 0) {
            if (!ses.aktivna) {
              store._registar.odjavi(ses);
            }
            ses.mirovanje.next();
          }
        }),
      );
    }

    /** Red studenta; pretplata se namerno ne otkazuje: kad se sesija zatvori, red se završi tek kad isprazni korake. */
    function red(ses: Sesija, sId: number): Subject<Korak> {
      let r = ses.redovi.get(sId);
      if (!r) {
        const novi = new Subject<Korak>();
        novi.pipe(concatMap(k => izvrsi(ses, sId, k))).subscribe();
        ses.redovi.set(sId, novi);
        r = novi;
      }
      return r;
    }

    function postavi(sId: number, cilj: StanjeStudenta): void {
      const p = store.predavanje();
      const ses = store._r.sesija;
      if (!ses || !p || !aktivnaZa(ses) || p.zavrseno === true || !store._poStudentu().has(sId)) {
        return;
      }
      const prethodno = store.stanjePoStudentu()[sId] ?? 'odsutan';
      const naCekanju = ses.naCekanju.get(sId) ?? 0;
      if (prethodno === cilj && naCekanju === 0 && !ses.nepoznato.has(sId)) {
        return;
      }
      const napomena = cilj === 'odsutan' ? (p.aktivnosti.find(a => a.student?.id === sId)?.napomene ?? null) : null;
      patchState(store, s => ({
        stanjePoStudentu: { ...s.stanjePoStudentu, [sId]: cilj },
        cekanje: { ...s.cekanje, [sId]: true },
      }));
      ses.naCekanju.set(sId, naCekanju + 1);
      ses.uToku++;
      store._registar.promena();
      red(ses, sId).next({ cilj, prethodno, napomena });
    }

    /** Sesija prestaje da menja stanje; redovi se završavaju tek pošto pošalju sve korake, pa se odjavljuje iz registra. */
    function zatvoriSesiju(): void {
      const ses = store._r.sesija;
      store._r.sesija = null;
      if (!ses) {
        return;
      }
      ses.aktivna = false;
      ses.redovi.forEach(r => r.complete());
      if (ses.uToku === 0) {
        store._registar.odjavi(ses);
      }
    }

    /** Emituje (jednom) kad sesija nema koraka u redu ni u izvršenju; odmah ako ih nema. */
    const sacekaj = (ses: Sesija): Observable<unknown> => defer(() => (ses.uToku === 0 ? of(null) : ses.mirovanje.pipe(take(1))));

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
    function postaviPodatke(ses: Sesija, predavanje: PredavanjeDetails, grupa: StudentListItem[], vanGrupe: StudentListItem[]): void {
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
        ses.potvrdjeno.set(s.id, st);
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
      /** Zatvara tekuću sesiju (uništenje store-a); `_` = privatno, vidljivo samo u `withHooks`. */
      _zatvori: zatvoriSesiju,

      /**
       * Učitava predavanje. Sesija prethodnog se zatvara (klikovi u redu i dalje stižu do servera), a novo se čita kad se
       * ona isprazni i kad nijedna sesija ovog predavanja u aplikaciji ({@link RegistarCuvanja}: napušten ekran, prelaz
       * 5 -> 6 -> 5) nema korak na putu, pa učitano stanje ne prethodi klikovima koji su još na putu.
       */
      ucitaj(pId: number): void {
        store._r.ucitavanje?.unsubscribe();
        const stara = store._r.sesija;
        zatvoriSesiju();
        const ses = new Sesija(pId);
        store._registar.prijavi(ses);
        store._r.sesija = ses;
        patchState(store, { predavanje: null, studenti: [], stanjePoStudentu: {}, cekanje: {}, _grupaIds: [] }, setLoading());
        store._r.ucitavanje = (stara ? sacekaj(stara) : of(null))
          .pipe(
            switchMap(() => store._registar.sacekaj(ses.kljuc)),
            switchMap(() => store._api.get(pId, { tiho: true })),
          )
          .pipe(
            switchMap(p =>
              (p.grupa ? sviStudentiGrupe(store._studentiApi, p.grupa.id) : of([] as StudentListItem[])).pipe(
                switchMap(grupa => dopuniVanGrupe(p, grupa).pipe(map(vanGrupe => ({ p, grupa, vanGrupe })))),
              ),
            ),
          )
          .subscribe({
            next: ({ p, grupa, vanGrupe }) => postaviPodatke(ses, p, grupa, vanGrupe),
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
              store._obavestenja.uspeh('Predavanje je završeno.', undefined, { grupa: `predavanje-${pId}` });
              // backend `posecenost` je read-modify-write, a zahtevi po studentima idu paralelno: prebroji (tiho)
              store._api.posecenost(pId, { tiho: true }).subscribe({ error: () => undefined });
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
      store._r.ucitavanje = null;
      store._zatvori();
    },
  }),
);

export type PredavanjeStore = InstanceType<typeof PredavanjeStore>;
