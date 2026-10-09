import { HttpErrorResponse } from '@angular/common/http';
import { computed, ErrorHandler, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { catchError, concatMap, defer, EMPTY, finalize, firstValueFrom, map, Observable, of, Subject, Subscription, switchMap, take, tap } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { NotificationStore } from '../../../core/state/notification.store';
import { bezPrekidaReda, RegistarCuvanja, SesijaCuvanja } from '../../../core/state/registar-cuvanja';
import { setError, setLoaded, setLoading, withRequestStatus } from '../../../shared/store/request-status.feature';
import { StanjeCuvanja } from '../../../shared/ui/save-status';
import { TipAktivnosti } from '../../../core/api/predavanja.models';
import { DomaciApi } from '../../../core/api/domaci.api';
import { brojStudenata, DomaciDetails, DomaciPodaci, DomaciStudentiInfo } from '../../../core/api/domaci.models';

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
 * Sesija jednog učitanog domaćeg: sve što treba da se pošalje i prati za njegove redove. Ne zavisi od stanja store-a ni od
 * toga koji je domaći sada na ekranu: zahtev nosi `domaciId` i vrednosti iz sesije, pa izmena napravljena na jednom domaćem
 * uvek stigne na taj domaći, i kad je ekran u međuvremenu prešao na drugi.
 */
class Sesija implements SesijaCuvanja {
  /** Redovi zahteva po studentu: najviše jedan zahtev u toku, ostali čekaju (`concatMap`). */
  readonly redovi = new Map<number, Subject<void>>();
  /** Debounce tajmeri izmena koje još nisu poslate. */
  readonly timeri = new Map<number, ReturnType<typeof setTimeout>>();
  /** Poslednje vrednosti koje je korisnik uneo (ono što treba poslati). */
  readonly lokalno = new Map<number, VrednostiReda>();
  /**
   * Poslednje vrednosti koje je server potvrdio; nema unosa = nepoznato (posle greške čuvanja: server je možda ipak
   * upisao, a odgovor se izgubio), pa sledeći korak reda uvek šalje.
   */
  readonly potvrdjeno = new Map<number, VrednostiReda>();
  /** Raste sa svakom promenom potvrđenog stanja reda; odgovor zahteva za ceo domaći (oslobodi) se odbacuje ako je zastareo. */
  readonly potvrde = new Map<number, number>();
  /** Raste sa svakom izmenom reda; odgovor važi samo ako je verzija ista kao pri slanju. */
  readonly verzije = new Map<number, number>();
  readonly imena = new Map<number, string>();
  /** Redovi čije poslednje čuvanje nije uspelo. */
  readonly greske = new Set<number>();
  /** Koraci koji su u redu ili se izvršavaju (ne računaju se tajmeri). */
  uToku = 0;
  /** Poslednji korak je završen i `uToku` je pao na 0 (za čekanje pražnjenja). */
  readonly mirovanje = new Subject<void>();
  /** Domaći se briše: izmene se ne šalju. */
  obrisan = false;
  /** Sesija je zatvorena (ekran napušten ili prelaz na drugi domaći): odjavljuje se iz registra kad isprazni redove. */
  zatvorena = false;
  readonly kljuc: string;

  constructor(readonly domaciId: number) {
    this.kljuc = `domaci-${domaciId}`;
  }

  verzija(sId: number): number {
    return this.verzije.get(sId) ?? 0;
  }

  potvrda(sId: number): number {
    return this.potvrde.get(sId) ?? 0;
  }

  /** Novo potvrđeno stanje reda (`undefined` = nepoznato). */
  potvrdi(sId: number, v: VrednostiReda | undefined): void {
    if (v) {
      this.potvrdjeno.set(sId, v);
    } else {
      this.potvrdjeno.delete(sId);
    }
    this.potvrde.set(sId, this.potvrda(sId) + 1);
  }

  /** Za upozorenje pre zatvaranja kartice: na čekanju, u redu ili u izvršenju, i neuspela čuvanja. */
  nesacuvano(): number {
    return this.timeri.size + this.uToku + this.greske.size;
  }
}

/**
 * Detalj domaćeg: zaglavlje i tabela evidentiranja (provajduje se u `DomaciDetalj`).
 *
 * Svaki red (student) se čuva sam: izmena je vidljiva odmah, a zahtev (`POST domaci/evidentiraj`, ceo red) ide posle
 * {@link DEBOUNCE_REDA_MS} ms od poslednje izmene, pa više brzih izmena istog reda daje jedan zahtev. Zahtevi su
 * **serijalizovani po studentu** (`concatMap`, kao u `PredavanjeStore`): za jednog studenta je najviše jedan zahtev u toku,
 * a kad red dođe na izvršenje šalju se **najnovije** vrednosti reda, pa konačno stanje na serveru uvek odgovara poslednjoj
 * izmeni (i prvi upis ne može da napravi dupli red). Odgovor koji stigne dok je red u međuvremenu menjan ne prepisuje
 * unos (`verzije`). Greška ostavlja uneto u polju i postavlja status reda na `greska` ("Pokušaj ponovo" = `ponovi`);
 * greške više redova se javljaju jednom porukom ("Nije sačuvano za N studenata", grupa poruka zamenjuje prethodnu).
 * Posle greške je potvrđeno stanje reda **nepoznato** (server je možda upisao, a odgovor se izgubio), pa sledeća izmena
 * uvek šalje, i kad je jednaka staroj vrednosti. Odgovor `oslobodi` ne prepisuje red za koji je u međuvremenu stigla
 * novija potvrda (`potvrde`).
 *
 * Svaki učitani domaći ima svoju {@link Sesija}. Kad `ucitaj` pređe na drugi domaći (ista komponenta, drugi `:id`), sesija
 * prethodnog se **zatvara, ne otkazuje**: izmene koje čekaju debounce se odmah šalju, zahtevi u toku se završavaju, a
 * odgovori stare sesije ne diraju stanje novog domaćeg. Novi domaći se učitava tek kad se stara sesija isprazni i kad
 * nijedna sesija tog domaćeg u aplikaciji (registar `RegistarCuvanja`, i iz uništenih store-ova) nema posao na putu.
 * `zavrsi` pre PATCH-a šalje izmene i čeka da se redovi isprazne; `obrisi` otkazuje izmene na čekanju tog domaćeg.
 * Oslobođeni redovi i pregledan domaći su samo za čitanje.
 */
export const DomaciStore = signalStore(
  withState<DomaciState>({ domaci: null, studenti: [], vrednosti: {}, statusi: {} }),
  withRequestStatus(),
  withProps(() => ({
    _api: inject(DomaciApi),
    _obavestenja: inject(NotificationStore),
    _registar: inject(RegistarCuvanja),
    _greske: inject(ErrorHandler),
    /** Promenljivo knjigovodstvo (nije stanje): tekuća sesija, učitavanje u toku, uništen store. */
    _r: { sesija: null as Sesija | null, ucitavanje: null as Subscription | null, unisten: false },
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
    /** Stanje (za ekran) se menja samo za sesiju koja je sada na ekranu; stara sesija samo završava svoje zahteve. */
    const tekuca = (s: Sesija) => store._r.sesija === s;

    function postaviStatus(s: Sesija, sId: number, status: StanjeCuvanja | null): void {
      if (tekuca(s)) {
        patchState(store, st => ({ statusi: { ...st.statusi, [sId]: status } }));
      }
    }

    /** Odgovor servera: potvrđene vrednosti reda; unos se prepisuje samo ako red u međuvremenu nije menjan. */
    function uskladi(s: Sesija, sId: number, det: DomaciDetails, poslataVerzija: number): void {
      const red = det.studenti?.find(r => r.studentId === sId);
      if (!red) {
        return;
      }
      const potvrdjeno = izRedaServera(red);
      s.potvrdi(sId, potvrdjeno);
      if (s.verzija(sId) !== poslataVerzija) {
        return; // noviji unos čeka ili je u redu: on određuje konačno stanje
      }
      s.lokalno.set(sId, potvrdjeno);
      s.greske.delete(sId);
      if (tekuca(s)) {
        patchState(store, st => ({
          vrednosti: { ...st.vrednosti, [sId]: potvrdjeno },
          statusi: { ...st.statusi, [sId]: 'sacuvano' as StanjeCuvanja },
        }));
      }
    }

    /** Jedna poruka za sve redove bez čuvanja (nova zamenjuje prethodnu iste sesije). */
    function javiGresku(s: Sesija, sId: number, e: unknown): void {
      const n = s.greske.size;
      const razlog = porukaGreske(e);
      const tekst = n <= 1 ? `${s.imena.get(sId) ?? 'Student'}: ${razlog}` : `Nije sačuvano za ${brojStudenata(n)}. ${razlog}`;
      store._obavestenja.greska(tekst, { grupa: `domaci-${s.domaciId}-cuvanje` });
    }

    function izvrsi(s: Sesija, sId: number): Observable<unknown> {
      return defer(() => {
        const trenutna = s.verzija(sId);
        const v = s.lokalno.get(sId);
        const potvrdjeno = s.potvrdjeno.get(sId);
        if (s.obrisan || !v) {
          return EMPTY;
        }
        if (potvrdjeno && jednake(v, potvrdjeno)) {
          // npr. izmena vraćena na staro ili ju je već sačuvao prethodni korak reda
          if (s.verzija(sId) === trenutna) {
            s.greske.delete(sId);
            postaviStatus(s, sId, 'sacuvano');
          }
          return EMPTY;
        }
        return store._api
          .evidentiraj(
            { studentId: sId, domaciId: s.domaciId, bodovi: v.bodovi ?? 0, napomene: v.napomene, prepisivanje: v.prepisivanje },
            { tiho: true },
          )
          .pipe(
            tap(det => uskladi(s, sId, det, trenutna)),
            catchError((e: unknown) => {
              // server je možda ipak upisao (izgubljen odgovor): sledeći korak reda šalje i vrednost jednaku staroj
              s.potvrdi(sId, undefined);
              if (s.verzija(sId) === trenutna) {
                s.greske.add(sId);
                postaviStatus(s, sId, 'greska');
                javiGresku(s, sId, e);
              }
              return EMPTY;
            }),
          );
      }).pipe(
        // izuzetak iz obrade greške ne sme da ugasi red studenta (sledeći koraci, pražnjenje, registar)
        (korak$: Observable<unknown>) => bezPrekidaReda(korak$, store._greske),
        finalize(() => {
          s.uToku--;
          store._registar.promena();
          if (s.uToku === 0) {
            if (s.zatvorena) {
              store._registar.odjavi(s);
            }
            s.mirovanje.next();
          }
        }),
      );
    }

    function red(s: Sesija, sId: number): Subject<void> {
      let r = s.redovi.get(sId);
      if (!r) {
        const novi = new Subject<void>();
        novi.pipe(concatMap(() => izvrsi(s, sId))).subscribe();
        s.redovi.set(sId, novi);
        r = novi;
      }
      return r;
    }

    /** Stavlja red studenta na izvršenje (otkazuje debounce koji je čekao). */
    function posalji(s: Sesija, sId: number): void {
      const t = s.timeri.get(sId);
      if (t !== undefined) {
        clearTimeout(t);
        s.timeri.delete(sId);
      }
      s.uToku++;
      store._registar.promena();
      red(s, sId).next();
    }

    /** Šalje sve izmene koje čekaju debounce. */
    function posaljiCekajuce(s: Sesija): void {
      for (const sId of [...s.timeri.keys()]) {
        posalji(s, sId);
      }
    }

    /** Emituje (jednom) kad nema koraka u redu ni u izvršenju; odmah ako ih nema. */
    const sacekaj = (s: Sesija): Observable<unknown> => defer(() => (s.uToku === 0 ? of(null) : s.mirovanje.pipe(take(1))));

    /** Zatvara sesiju: izmene na čekanju se šalju, zahtevi u toku i u redu se završavaju (ne otkazuju). */
    function zatvori(s: Sesija): void {
      posaljiCekajuce(s);
      s.zatvorena = true;
      s.redovi.forEach(r => r.complete());
      if (s.uToku === 0) {
        store._registar.odjavi(s);
      }
    }

    /** Šta nije potvrđeno ponovo ide na izvršenje (posle neuspelog brisanja). */
    function ponoviNepotvrdjeno(s: Sesija): void {
      for (const [sId, v] of s.lokalno) {
        const p = s.potvrdjeno.get(sId);
        if (!p || !jednake(v, p)) {
          posalji(s, sId);
        }
      }
    }

    function postaviPodatke(det: DomaciDetails): void {
      const s = new Sesija(det.id);
      const redovi = (det.studenti ?? []).map(uRed);
      const vrednosti: Record<number, VrednostiReda> = {};
      for (const r of det.studenti ?? []) {
        const v = izRedaServera(r);
        vrednosti[r.studentId] = v;
        s.lokalno.set(r.studentId, v);
        s.potvrdjeno.set(r.studentId, v);
        s.imena.set(r.studentId, [r.ime, r.prezime].filter(Boolean).join(' ') || 'Student');
      }
      store._registar.prijavi(s);
      store._r.sesija = s;
      patchState(store, { domaci: zaglavljeIzOdgovora(det), studenti: redovi, vrednosti, statusi: {} }, setLoaded());
    }

    return {
      /** Zatvara tekuću sesiju (uništenje store-a); `_` = privatno, vidljivo samo u `withHooks`. */
      _zatvori(): void {
        if (store._r.sesija) {
          zatvori(store._r.sesija);
        }
      },

      /**
       * Učitava domaći. Sesija prethodnog domaćeg se zatvara (izmene na čekanju se šalju) i novi se učitava kad se ona isprazni
       * i kad se isprazne sve druge sesije istog domaćeg ({@link RegistarCuvanja}: napušten ekran, prelaz 5 -> 6 -> 5), pa
       * učitano stanje ne može da prethodi izmenama koje su još na putu.
       */
      ucitaj(dId: number): void {
        store._r.ucitavanje?.unsubscribe();
        const stara = store._r.sesija;
        store._r.sesija = null;
        if (stara) {
          zatvori(stara);
        }
        patchState(store, { domaci: null, studenti: [], vrednosti: {}, statusi: {} }, setLoading());
        store._r.ucitavanje = (stara ? sacekaj(stara) : of(null))
          .pipe(
            switchMap(() => store._registar.sacekaj(`domaci-${dId}`)),
            switchMap(() => store._api.get(dId, { tiho: true })),
          )
          .subscribe({
            next: det => postaviPodatke(det),
            error: (e: unknown) => patchState(store, setError(porukaGreske(e))),
          });
      },

      /**
       * Izmena polja reda (`bodovi`, `prepisivanje`, `napomene`): vidljiva odmah, čuva se posle debounce-a. Neispravni bodovi
       * (nisu ceo broj 0-10) se ne primaju; oslobođeni red i pregledan domaći se ne menjaju.
       */
      izmeni(sId: number, izmena: Partial<VrednostiReda>): void {
        const s = store._r.sesija;
        const r = store.studenti().find(x => x.id === sId);
        if (store._r.unisten || !s || s.obrisan || !r || r.oslobodjen || store.pregledan() || !ispravniBodovi(izmena.bodovi ?? null)) {
          return;
        }
        const staro = s.lokalno.get(sId);
        if (!staro) {
          return;
        }
        const novo = { ...staro, ...izmena };
        if (jednake(staro, novo)) {
          return;
        }
        s.lokalno.set(sId, novo);
        s.verzije.set(sId, s.verzija(sId) + 1);
        patchState(store, st => ({
          vrednosti: { ...st.vrednosti, [sId]: novo },
          statusi: { ...st.statusi, [sId]: 'cuva' as StanjeCuvanja },
        }));
        red(s, sId); // red zahteva postoji čim postoji izmena na čekanju
        const stari = s.timeri.get(sId);
        if (stari !== undefined) {
          clearTimeout(stari);
        }
        s.timeri.set(sId, setTimeout(() => posalji(s, sId), DEBOUNCE_REDA_MS));
        store._registar.promena();
      },

      /** Ne čeka debounce (Enter u polju): šalje red odmah, ako ima šta da se pošalje. */
      sacuvajOdmah(sId: number): void {
        const s = store._r.sesija;
        if (s?.timeri.has(sId)) {
          posalji(s, sId);
        }
      },

      /** "Pokušaj ponovo" posle greške: šalje trenutne vrednosti reda. */
      ponovi(sId: number): void {
        const s = store._r.sesija;
        if (store._r.unisten || !s || s.obrisan || store.statusi()[sId] !== 'greska') {
          return;
        }
        postaviStatus(s, sId, 'cuva');
        posalji(s, sId);
      },

      /** `POST domaci/{id}/oslobodi`: aktivni studenti dobijaju 10 bodova i oznaku; redovi koji se trenutno menjaju ostaju. */
      oslobodi(): Promise<boolean> {
        const s = store._r.sesija;
        if (!s) {
          return Promise.resolve(false);
        }
        // potvrde redova pri slanju: red za koji u međuvremenu stigne odgovor čuvanja ima noviju potvrdu od ovog odgovora
        const potvrdePriSlanju = new Map([...s.lokalno.keys()].map(sId => [sId, s.potvrda(sId)]));
        return firstValueFrom(
          store._api.oslobodi(s.domaciId).pipe(
            map(det => {
              if (!tekuca(s)) {
                return true; // korisnik je u međuvremenu otišao na drugi domaći
              }
              const ranije = new Set(store.studenti().filter(x => x.oslobodjen).map(x => x.id));
              let novih = 0;
              for (const r of det.studenti ?? []) {
                const potvrdjeno = izRedaServera(r);
                const oslobodjen = r.oslobodjen === true;
                if (oslobodjen && !ranije.has(r.studentId)) {
                  novih++;
                }
                if (!oslobodjen && s.potvrda(r.studentId) !== potvrdePriSlanju.get(r.studentId)) {
                  continue; // zastareo red: noviju vrednost je već potvrdio odgovor čuvanja
                }
                s.potvrdi(r.studentId, potvrdjeno);
                const menja = store.statusi()[r.studentId] === 'cuva';
                if (oslobodjen || !menja) {
                  const t = s.timeri.get(r.studentId);
                  if (t !== undefined && oslobodjen) {
                    clearTimeout(t);
                    s.timeri.delete(r.studentId);
                  }
                  if (oslobodjen) {
                    // oslobođen red je samo za čitanje: neuspelo čuvanje se više ne može ponoviti ni brojati kao nesačuvano
                    s.greske.delete(r.studentId);
                  }
                  s.lokalno.set(r.studentId, potvrdjeno);
                  patchState(store, st => ({
                    vrednosti: { ...st.vrednosti, [r.studentId]: potvrdjeno },
                    statusi: { ...st.statusi, [r.studentId]: oslobodjen ? null : (st.statusi[r.studentId] ?? null) },
                    studenti: st.studenti.map(x => (x.id === r.studentId ? { ...x, oslobodjen } : x)),
                  }));
                }
              }
              store._registar.promena();
              store._obavestenja.uspeh(novih > 0 ? `Oslobođeno studenata: ${novih}.` : 'Nema novih studenata za oslobađanje.');
              return true;
            }),
            catchError(() => of(false)), // grešku je već prikazao interceptor
          ),
        );
      },

      /** Naslov, opis i datum; evidentiranje u tabeli se ne dira. */
      izmeniZaglavlje(izmena: IzmenaZaglavljaDomaceg): Promise<boolean> {
        const s = store._r.sesija;
        if (!s) {
          return Promise.resolve(false);
        }
        return firstValueFrom(
          store._api.update(s.domaciId, { naslov: izmena.naslov, text: izmena.text, datum: izmena.datum }).pipe(
            map(det => {
              if (tekuca(s)) {
                patchState(store, { domaci: zaglavljeIzOdgovora(det) });
              }
              store._obavestenja.uspeh('Izmene su sačuvane.');
              return true;
            }),
            catchError(() => of(false)),
          ),
        );
      },

      /**
       * `PATCH domaci/{id}`: pregled je završen, tabela postaje samo za čitanje. Pre PATCH-a se šalju izmene koje čekaju
       * debounce i čeka se da se redovi isprazne, da evidencija bude potpuna kad se pregled zaključa.
       */
      zavrsi(): Promise<boolean> {
        const s = store._r.sesija;
        if (!s) {
          return Promise.resolve(false);
        }
        posaljiCekajuce(s);
        return firstValueFrom(
          sacekaj(s).pipe(
            switchMap(() => (tekuca(s) ? store._api.zavrsi(s.domaciId).pipe(map(() => true)) : of(false))),
            map(uspelo => {
              if (uspelo) {
                // pregledan domaći je samo za čitanje: redovi sa greškom se više ne mogu ponoviti (poruka ih je navela)
                s.greske.clear();
                store._registar.promena();
                patchState(store, st => (st.domaci ? { domaci: { ...st.domaci, pregledan: true } } : {}));
                store._obavestenja.uspeh('Pregled je završen.');
              }
              return uspelo;
            }),
            catchError(() => of(false)),
          ),
          { defaultValue: true },
        );
      },

      /**
       * `DELETE domaci/{id}`: izmene na čekanju se otkazuju i ne šalju obrisanom domaćem; zahtevi koji su već u toku se
       * sačekaju pre brisanja. Ako brisanje ne uspe, nepotvrđeno se šalje ponovo.
       */
      obrisi(): Promise<boolean> {
        const s = store._r.sesija;
        if (!s) {
          return Promise.resolve(false);
        }
        s.obrisan = true;
        s.timeri.forEach(t => clearTimeout(t));
        s.timeri.clear();
        store._registar.promena();
        return firstValueFrom(
          sacekaj(s).pipe(
            switchMap(() => store._api.obrisi(s.domaciId)),
            map(() => {
              store._obavestenja.uspeh('Domaći je obrisan.');
              return true;
            }),
            catchError(() => {
              s.obrisan = false;
              ponoviNepotvrdjeno(s);
              return of(false);
            }),
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
      // ekran se napušta: izmene na čekanju se šalju, zahtevi u toku se ne otkazuju
      store._zatvori();
    },
  }),
);

export type DomaciStore = InstanceType<typeof DomaciStore>;
