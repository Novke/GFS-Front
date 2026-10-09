import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { catchError, concatMap, defer, EMPTY, firstValueFrom, map, Observable, of, Subject, Subscription, tap } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { StudentListItem } from '../../../core/api/studenti.api';
import { NotificationStore } from '../../../core/state/notification.store';
import { setError, setLoaded, setLoading, withRequestStatus } from '../../../shared/store/request-status.feature';
import { StanjeCuvanja } from '../../../shared/ui/save-status';
import { StubacHistograma } from '../../../shared/ui/histogram';
import { TestoviApi } from './testovi.api';
import { TestDetails, TestGrupa, TestPolaganjeInfo, TestStudentInfo, UpdateTestCmd, VARIJANTE } from './testovi.models';

/** Koliko se čeka posle poslednje izmene reda pre nego što se red pošalje serveru (spec 4, tabelarni unos). */
export const DEBOUNCE_REDA_MS = 600;
/** Kolona `polaganja.napomene` je `varchar(255)`. */
export const MAX_NAPOMENA = 255;
/**
 * Prolaz za statistiku uživo: najmanje pola max poena, bez prepisivanja (isto pravilo kao sintetički podaci stejdžinga).
 * Server oznaku `polozio` pri evidentiranju ne postavlja, pa se prolaz novih unosa ne može čitati sa servera.
 */
export const PRAG_PROLAZA = 0.5;

/** Ono što nastavnik unosi u redu; `poeni` je tekst kako je otkucan (`14,5`), prazan = još nije uneto. */
export interface VrednostiReda {
  grupa: TestGrupa | null;
  poeni: string;
  prepisivao: boolean;
  napomene: string;
}

/** Ispitanik u tabeli (nepromenljivi podaci reda). `godina` je godina upisa; `null` kad je nema. */
export interface RedIspitanika {
  id: number;
  ime: string;
  prezime: string;
  indeks: string;
  godina: number | null;
  /** Iz starije generacije (manja godina upisa od grupe testa): ponovac, premešten. */
  stariji: boolean;
}

/** Statistika iz unetih vrednosti (prazni redovi se ne računaju). `prolaz` je 0-100. */
export interface StatistikaPoena {
  /** Redova sa ispravno unetim poenima. */
  broj: number;
  /** Svih redova (ispitanika). */
  ukupno: number;
  prosek: number | null;
  prolaz: number | null;
  min: number | null;
  max: number | null;
}

export interface UnosPoena {
  poeni: number | null;
  prepisivao: boolean;
}

export interface StatistikaVarijante {
  varijanta: TestGrupa | null;
  broj: number;
  prosek: number | null;
  prolaz: number | null;
  min: number | null;
  max: number | null;
}

/** Spremnost za "Završi evidentiranje"; `razlog` objašnjava zašto još ne može. */
export interface SpremnostZavrsetka {
  moze: boolean;
  razlog: string | null;
}

/** `14,5`, `14.5`, ` 7 ` -> broj; prazno -> `null`; bilo šta drugo -> `NaN`. */
export function parsirajPoene(tekst: string | null | undefined): number | null {
  const t = (tekst ?? '').trim().replace(',', '.');
  if (t === '') {
    return null;
  }
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}

/** Poeni sa servera za polje: `14.5` -> `14,5`, `null` -> prazno. */
export function poeniUTekst(poeni: number | null | undefined): string {
  return poeni === null || poeni === undefined || !Number.isFinite(poeni) ? '' : String(poeni).replace('.', ',');
}

/** Broj za prikaz: najviše dve decimale, decimalni zarez; `null` -> `—`. */
export function formatBroja(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) {
    return '—';
  }
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** Greška polja poena (`null` = ispravno ili prazno). Negativan broj se ne može ni otkucati (`-` nije broj). */
export function greskaPoena(tekst: string, max: number | null | undefined): string | null {
  const p = parsirajPoene(tekst);
  if (p === null) {
    return null;
  }
  if (Number.isNaN(p)) {
    return 'Unesi broj (npr. 14,5).';
  }
  if (max !== null && max !== undefined && p > max) {
    return `Najviše ${max}.`;
  }
  return null;
}

/**
 * Greška validacije reda (`null` = može da se sačuva čim su poeni uneti): poeni 0-max, varijanta kad test ima više
 * varijanti, napomena do {@link MAX_NAPOMENA} znakova. Red sa greškom se ne šalje.
 */
export function greskaReda(v: VrednostiReda, max: number | null | undefined, varijante: readonly TestGrupa[]): string | null {
  const poeni = greskaPoena(v.poeni, max);
  if (poeni) {
    return poeni;
  }
  if (v.napomene.length > MAX_NAPOMENA) {
    return `Napomena: najviše ${MAX_NAPOMENA} znakova.`;
  }
  if (parsirajPoene(v.poeni) === null && (v.prepisivao || v.napomene.trim() !== '')) {
    return 'Unesi poene da bi se red sačuvao.';
  }
  if (parsirajPoene(v.poeni) !== null && !v.grupa && varijante.length > 1) {
    return 'Izaberi varijantu.';
  }
  return null;
}

/** Red se šalje serveru samo kad je ispravan i ima poene i varijantu (server traži oba). */
export function zaSlanje(v: VrednostiReda, max: number | null | undefined, varijante: readonly TestGrupa[]): boolean {
  return greskaReda(v, max, varijante) === null && parsirajPoene(v.poeni) !== null && (v.grupa !== null || varijante.length <= 1);
}

export function jePolozio(poeni: number, max: number | null | undefined, prepisivao: boolean): boolean {
  return !prepisivao && max !== null && max !== undefined && max > 0 && poeni >= max * PRAG_PROLAZA;
}

/** Statistika iz unosa: prosek, prolaz, min i max samo nad unetim poenima (prazni se ignorišu). */
export function statistikaPoena(unosi: readonly UnosPoena[], max: number | null | undefined): StatistikaPoena {
  const uneti = unosi.filter((u): u is { poeni: number; prepisivao: boolean } => u.poeni !== null && Number.isFinite(u.poeni));
  if (uneti.length === 0) {
    return { broj: 0, ukupno: unosi.length, prosek: null, prolaz: null, min: null, max: null };
  }
  const poeni = uneti.map(u => u.poeni);
  const polozilo = uneti.filter(u => jePolozio(u.poeni, max, u.prepisivao)).length;
  return {
    broj: uneti.length,
    ukupno: unosi.length,
    prosek: poeni.reduce((z, p) => z + p, 0) / uneti.length,
    prolaz: (polozilo * 100) / uneti.length,
    min: Math.min(...poeni),
    max: Math.max(...poeni),
  };
}

/** Poeni reda za statistiku: ispravan broj u opsegu 0-max, inače `null`. */
export function poeniZaStatistiku(tekst: string, max: number | null | undefined): number | null {
  const p = parsirajPoene(tekst);
  return p === null || Number.isNaN(p) || greskaPoena(tekst, max) !== null ? null : p;
}

/**
 * Korpe raspodele poena za histogram: 10 korpi po 10 % max poena, `[0, 10 %)`, `[10 %, 20 %)` … `[90 %, 100 %]`
 * (poslednja uključuje max). Poeni van 0-max se ne broje. Bez max poena nema korpi.
 */
export function korpePoena(poeni: readonly number[], max: number | null | undefined): StubacHistograma[] {
  if (max === null || max === undefined || !Number.isFinite(max) || max <= 0) {
    return [];
  }
  const korak = max / 10;
  const brojevi = new Array<number>(10).fill(0);
  for (const p of poeni) {
    if (!Number.isFinite(p) || p < 0 || p > max) {
      continue;
    }
    brojevi[Math.min(9, Math.floor((p * 10) / max))]++;
  }
  return brojevi.map((broj, i) => ({ labela: `${formatBroja(i * korak)}–${formatBroja((i + 1) * korak)}`, broj }));
}

/** Statistika po varijantama (A, B, …; polaganja bez varijante kao `null`), samo polaganja sa poenima. */
export function statistikaPoVarijantama(polaganja: readonly TestPolaganjeInfo[], max: number | null | undefined): StatistikaVarijante[] {
  const grupe = new Map<TestGrupa | null, UnosPoena[]>();
  for (const p of polaganja) {
    if (p.ostvareniPoeni === null || p.ostvareniPoeni === undefined) {
      continue;
    }
    const g = p.grupa ?? null;
    grupe.set(g, [...(grupe.get(g) ?? []), { poeni: p.ostvareniPoeni, prepisivao: p.prepisivao === true }]);
  }
  const redosled: (TestGrupa | null)[] = [...VARIJANTE, null];
  return redosled
    .filter(g => grupe.has(g))
    .map(g => {
      const s = statistikaPoena(grupe.get(g)!, max);
      return { varijanta: g, broj: s.broj, prosek: s.prosek, prolaz: s.prolaz, min: s.min, max: s.max };
    });
}

const indeksi = new Intl.Collator('sr-Latn', { numeric: true, sensitivity: 'base' });

function poIndeksu(a: RedIspitanika, b: RedIspitanika): number {
  return indeksi.compare(a.indeks ?? '', b.indeks ?? '') || (a.godina ?? 0) - (b.godina ?? 0) || a.id - b.id;
}

function porukaGreske(e: unknown): string {
  return e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM;
}

/** Greška koju vredi ponoviti (mreža, 5xx); 4xx je odbijanje po pravilima i vraća se na stanje servera. */
function prolaznaGreska(e: unknown): boolean {
  return !(e instanceof HttpErrorResponse) || e.status === 0 || e.status >= 500;
}

/** `StudentInfo.godina` je `int`: student bez godine stiže kao 0. */
function godinaUpisa(g: number | null | undefined): number | null {
  return g !== null && g !== undefined && Number.isInteger(g) && g > 0 ? g : null;
}

function jeStariji(godina: number | null, grupaGodina: number | null | undefined): boolean {
  return godina !== null && grupaGodina !== null && grupaGodina !== undefined && godina < grupaGodina;
}

function redIz(s: TestStudentInfo | StudentListItem, grupaGodina: number | null | undefined): RedIspitanika {
  const godina = godinaUpisa(s.godina);
  return {
    id: s.id,
    ime: s.ime ?? '',
    prezime: s.prezime ?? '',
    indeks: s.indeks ?? '',
    godina,
    stariji: jeStariji(godina, grupaGodina),
  };
}

function vrednostiIz(p: TestPolaganjeInfo | undefined, varijante: readonly TestGrupa[]): VrednostiReda {
  return {
    grupa: p?.grupa ?? (varijante.length === 1 ? varijante[0] : null),
    poeni: poeniUTekst(p?.ostvareniPoeni),
    prepisivao: p?.prepisivao === true,
    napomene: p?.napomene ?? '',
  };
}

/** Ono što je server potvrdio za red (poredi se sa unetim, da se ne šalje ništa što je već sačuvano). */
interface Potvrdjeno {
  grupa: TestGrupa | null;
  poeni: number | null;
  prepisivao: boolean;
  napomene: string;
}

function potvrdjenoIz(p: TestPolaganjeInfo | undefined): Potvrdjeno {
  return {
    grupa: p?.grupa ?? null,
    poeni: p?.ostvareniPoeni ?? null,
    prepisivao: p?.prepisivao === true,
    napomene: p?.napomene ?? '',
  };
}

function jednako(v: VrednostiReda, p: Potvrdjeno | undefined): boolean {
  return (
    !!p &&
    v.grupa === p.grupa &&
    parsirajPoene(v.poeni) === p.poeni &&
    v.prepisivao === p.prepisivao &&
    v.napomene.trim() === p.napomene.trim()
  );
}

const imeReda = (r: Pick<RedIspitanika, 'ime' | 'prezime'> | undefined): string =>
  r ? [r.ime, r.prezime].filter(Boolean).join(' ') || 'Student' : 'Student';

type Posao = { tip: 'cuvaj'; sId: number } | { tip: 'dodaj'; red: RedIspitanika } | { tip: 'ukloni'; sId: number };

/**
 * Knjigovodstvo jednog učitanog testa. Posle napuštanja ekrana (ili učitavanja drugog testa) sesija je neaktivna:
 * zakazana čuvanja se šalju odmah, red poslova se **prazni do servera** (HttpClient je u root injektoru, uneti poeni se ne
 * gube), ali se stanje store-a više ne menja; greške se i dalje javljaju.
 */
interface Sesija {
  tId: number;
  aktivna: boolean;
  red: Subject<Posao>;
  tajmeri: Map<number, ReturnType<typeof setTimeout>>;
  /** Zakazani poslovi čuvanja po studentu (u redu, još neizvršeni). */
  naCekanju: Map<number, number>;
  potvrdjeno: Map<number, Potvrdjeno>;
  /** Poslednje unete vrednosti (i posle zatvaranja sesije, kad store više nije izvor). */
  zadnje: Map<number, VrednostiReda>;
  imena: Map<number, RedIspitanika>;
  max: number | null;
  varijante: TestGrupa[];
}

interface TestState {
  test: TestDetails | null;
  redovi: RedIspitanika[];
  vrednosti: Record<number, VrednostiReda>;
  statusi: Record<number, StanjeCuvanja | null>;
  /** Poruka greške servera za red (uz "Pokušaj ponovo"). */
  greske: Record<number, string | null>;
  /** Red koji se dodaje ili uklanja (polja zaključana). */
  zauzet: Record<number, 'dodaje' | 'uklanja' | undefined>;
}

const PRAZNO_STANJE: TestState = { test: null, redovi: [], vrednosti: {}, statusi: {}, greske: {}, zauzet: {} };

/** Prazni zakazana čuvanja (šalje ih odmah) i zatvara red: završava se tek kad pošalje sve poslove. */
function zatvoriSesijuStore(r: { sesija: Sesija | null }, posalji: (ses: Sesija, sId: number) => void): void {
  const ses = r.sesija;
  r.sesija = null;
  if (!ses) {
    return;
  }
  ses.aktivna = false;
  for (const [sId, t] of [...ses.tajmeri]) {
    clearTimeout(t);
    ses.tajmeri.delete(sId);
    posalji(ses, sId);
  }
  ses.red.complete();
}

/**
 * Detalj testa sa tabelarnim unosom poena (provajduje se u `TestDetalj`).
 *
 * Svaka izmena reda je **optimistična** (vidi se odmah, statistika uživo se odmah preračunava) i čuva se sama posle
 * {@link DEBOUNCE_REDA_MS} bez novih izmena tog reda. Red sa greškom validacije (poeni > max, bez varijante…) se ne šalje.
 * Svi zahtevi testa idu kroz **jedan red** (`concatMap`): za studenta je najviše jedan zahtev u toku, a server
 * (`evidentirajIspitanika` briše i ponovo upisuje polaganje) ne dobija paralelne izmene istog testa. Posao čuvanja
 * šalje **poslednje** unete vrednosti u trenutku kad dođe na red; zastareo posao (noviji je u redu) ili vrednost koju
 * je server već potvrdio se preskače. Status reda (čuva se / sačuvano / greška) prikazuje `SaveStatus`.
 *
 * Greška: mreža ili 5xx -> uneto ostaje, status "Nije sačuvano" sa "Pokušaj ponovo"; 4xx (pravilo servera) -> red se
 * vraća na potvrđeno stanje i javlja se razlog. U oba slučaja se test ponovo čita (tiho) da se potvrđeno stanje
 * usaglasi sa serverom, za slučaj da je izmena ipak upisana a odgovor izgubljen.
 */
export const TestStore = signalStore(
  withState<TestState>(PRAZNO_STANJE),
  withRequestStatus(),
  withProps(() => ({
    _api: inject(TestoviApi),
    _obavestenja: inject(NotificationStore),
    _r: { sesija: null as Sesija | null, ucitavanje: null as Subscription | null, unisten: false },
  })),
  withComputed(({ test, redovi, vrednosti, zauzet }) => {
    const max = computed(() => test()?.maxPoena ?? null);
    const varijante = computed<TestGrupa[]>(() => {
      const g = test()?.grupe ?? [];
      return VARIJANTE.filter(v => g.includes(v));
    });
    return {
      maxPoena: max,
      varijante,
      evidentiran: computed(() => test()?.pregledan === true),
      /** Statistika uživo iz unetih (ispravnih) poena; redovi koji se dodaju ne ulaze. */
      statistikaUzivo: computed<StatistikaPoena>(() => {
        const v = vrednosti();
        const z = zauzet();
        const m = max();
        return statistikaPoena(
          redovi()
            .filter(r => z[r.id] !== 'dodaje')
            .map(r => ({ poeni: poeniZaStatistiku(v[r.id]?.poeni ?? '', m), prepisivao: v[r.id]?.prepisivao === true })),
          m,
        );
      }),
      /** Greška validacije po redu (prikazuje je red; red sa greškom se ne šalje). */
      greskeValidacije: computed<Record<number, string | null>>(() => {
        const v = vrednosti();
        const m = max();
        const vr = varijante();
        return Object.fromEntries(redovi().map(r => [r.id, v[r.id] ? greskaReda(v[r.id], m, vr) : null]));
      }),
    };
  }),
  withComputed(({ redovi, vrednosti, statusi, zauzet, greskeValidacije, evidentiran }) => ({
    spremnost: computed<SpremnostZavrsetka>(() => {
      if (evidentiran()) {
        return { moze: false, razlog: 'Evidentiranje je završeno.' };
      }
      const r = redovi();
      if (r.some(x => zauzet()[x.id] || statusi()[x.id] === 'cuva')) {
        return { moze: false, razlog: 'Čuvanje je u toku…' };
      }
      if (r.some(x => statusi()[x.id] === 'greska')) {
        return { moze: false, razlog: 'Neki redovi nisu sačuvani.' };
      }
      if (r.some(x => greskeValidacije()[x.id])) {
        return { moze: false, razlog: 'Ispravi označene redove.' };
      }
      const bez = r.filter(x => parsirajPoene(vrednosti()[x.id]?.poeni) === null).length;
      if (bez > 0) {
        return { moze: false, razlog: `Unesi poene za sve ispitanike (još ${bez}).` };
      }
      return { moze: true, razlog: null };
    }),
    /** Ima izmena koje server još nije potvrdio (zakazano, u toku ili neuspelo). */
    imaNesacuvanih: computed(() => Object.values(statusi()).some(s => s === 'cuva' || s === 'greska')),
  })),
  withMethods(store => {
    const aktivnaZa = (ses: Sesija) => ses.aktivna && !store._r.unisten && store.test()?.id === ses.tId;

    function postaviStatus(sId: number, status: StanjeCuvanja | null, greska: string | null = null): void {
      patchState(store, s => ({ statusi: { ...s.statusi, [sId]: status }, greske: { ...s.greske, [sId]: greska } }));
    }

    function zakazi(ses: Sesija, posao: Posao): void {
      if (posao.tip === 'cuvaj') {
        ses.naCekanju.set(posao.sId, (ses.naCekanju.get(posao.sId) ?? 0) + 1);
      }
      ses.red.next(posao);
    }

    /** Šalje čuvanje reda odmah (posle debounce-a, "Pokušaj ponovo", napuštanja ekrana). */
    function posaljiOdmah(ses: Sesija, sId: number): void {
      const t = ses.tajmeri.get(sId);
      if (t !== undefined) {
        clearTimeout(t);
        ses.tajmeri.delete(sId);
      }
      zakazi(ses, { tip: 'cuvaj', sId });
    }

    /** Posle greške: ponovo čita test i usaglašava potvrđeno stanje studenta; 4xx vraća i prikaz na stanje servera. */
    function osveziPotvrdjeno(ses: Sesija, sId: number, vratiPrikaz: boolean): void {
      store._api.get(ses.tId, { tiho: true }).subscribe({
        next: det => {
          const p = det.polaganja?.find(x => x.student?.id === sId);
          ses.potvrdjeno.set(sId, potvrdjenoIz(p));
          if (!vratiPrikaz || !aktivnaZa(ses) || ses.tajmeri.has(sId) || (ses.naCekanju.get(sId) ?? 0) > 0) {
            return; // u međuvremenu nova izmena: ona određuje prikaz
          }
          const v = vrednostiIz(p, ses.varijante);
          ses.zadnje.set(sId, v);
          patchState(store, s => ({ vrednosti: { ...s.vrednosti, [sId]: v } }));
        },
        error: () => undefined,
      });
    }

    function zavrsiCuvanje(ses: Sesija, sId: number, greska: unknown): void {
      if (ses.tajmeri.has(sId) || (ses.naCekanju.get(sId) ?? 0) > 0) {
        return; // noviji unos čeka: on određuje status
      }
      const ime = imeReda(ses.imena.get(sId));
      if (!aktivnaZa(ses)) {
        if (greska !== null) {
          store._obavestenja.greska(`${ime}: poeni nisu sačuvani (${porukaGreske(greska)})`);
        }
        return;
      }
      if (greska === null) {
        postaviStatus(sId, 'sacuvano');
        return;
      }
      const poruka = porukaGreske(greska);
      if (prolaznaGreska(greska)) {
        postaviStatus(sId, 'greska', poruka);
        osveziPotvrdjeno(ses, sId, false);
      } else {
        postaviStatus(sId, null);
        store._obavestenja.greska(`${ime}: ${poruka}`);
        osveziPotvrdjeno(ses, sId, true);
      }
    }

    function cuvaj(ses: Sesija, sId: number): Observable<unknown> {
      const ostalo = (ses.naCekanju.get(sId) ?? 1) - 1;
      ses.naCekanju.set(sId, ostalo);
      if (ostalo > 0 || ses.tajmeri.has(sId)) {
        return EMPTY; // nadjačan novijim unosom: on šalje poslednje vrednosti
      }
      const v = ses.zadnje.get(sId);
      if (!v || !ses.imena.has(sId) || !zaSlanje(v, ses.max, ses.varijante)) {
        // red je u međuvremenu postao neispravan (ili je uklonjen): ne šalje se, poruku prikazuje red
        if (v && aktivnaZa(ses) && ses.imena.has(sId)) {
          postaviStatus(sId, null);
        }
        return EMPTY;
      }
      if (jednako(v, ses.potvrdjeno.get(sId))) {
        zavrsiCuvanje(ses, sId, null);
        return EMPTY;
      }
      const poeni = parsirajPoene(v.poeni) as number;
      const grupa = (v.grupa ?? ses.varijante[0] ?? 'A') as TestGrupa;
      const napomene = v.napomene.trim() || null;
      return store._api
        .evidentiraj(ses.tId, { studentId: sId, grupa, ostvareniPoeni: poeni, prepisivao: v.prepisivao, napomene }, { tiho: true })
        .pipe(
          tap(det => {
            const p = det.polaganja?.find(x => x.student?.id === sId);
            ses.potvrdjeno.set(sId, p ? potvrdjenoIz(p) : { grupa, poeni, prepisivao: v.prepisivao, napomene: napomene ?? '' });
            zavrsiCuvanje(ses, sId, null);
          }),
          catchError((e: unknown) => {
            zavrsiCuvanje(ses, sId, e);
            return EMPTY;
          }),
        );
    }

    function dodaj(ses: Sesija, red: RedIspitanika): Observable<unknown> {
      return store._api.dodajPolaganje(ses.tId, red.id, { tiho: true }).pipe(
        tap(det => {
          const p = det.polaganja?.find(x => x.student?.id === red.id);
          ses.potvrdjeno.set(red.id, potvrdjenoIz(p));
          if (!aktivnaZa(ses)) {
            return;
          }
          patchState(store, s => ({ zauzet: { ...s.zauzet, [red.id]: undefined }, statusi: { ...s.statusi, [red.id]: null } }));
        }),
        catchError((e: unknown) => {
          ses.imena.delete(red.id);
          ses.zadnje.delete(red.id);
          store._obavestenja.greska(`${imeReda(red)}: ${porukaGreske(e)}`);
          if (aktivnaZa(ses)) {
            patchState(store, s => ({
              redovi: s.redovi.filter(r => r.id !== red.id),
              zauzet: { ...s.zauzet, [red.id]: undefined },
              statusi: { ...s.statusi, [red.id]: null },
            }));
          }
          return EMPTY;
        }),
      );
    }

    function ukloni(ses: Sesija, sId: number): Observable<unknown> {
      const red = ses.imena.get(sId);
      return store._api.ukloniPolaganje(ses.tId, sId, { tiho: true }).pipe(
        tap(() => {
          ses.imena.delete(sId);
          ses.zadnje.delete(sId);
          ses.potvrdjeno.delete(sId);
          if (!aktivnaZa(ses)) {
            return;
          }
          patchState(store, s => {
            const vrednosti = { ...s.vrednosti };
            delete vrednosti[sId];
            return {
              redovi: s.redovi.filter(r => r.id !== sId),
              vrednosti,
              zauzet: { ...s.zauzet, [sId]: undefined },
              statusi: { ...s.statusi, [sId]: null },
            };
          });
          store._obavestenja.uspeh(`${imeReda(red)} je uklonjen sa testa.`, undefined, { grupa: `test-${ses.tId}` });
        }),
        catchError((e: unknown) => {
          store._obavestenja.greska(`${imeReda(red)}: ${porukaGreske(e)}`);
          if (aktivnaZa(ses)) {
            patchState(store, s => ({ zauzet: { ...s.zauzet, [sId]: undefined } }));
          }
          return EMPTY;
        }),
      );
    }

    function izvrsi(ses: Sesija, posao: Posao): Observable<unknown> {
      return defer(() => {
        switch (posao.tip) {
          case 'cuvaj':
            return cuvaj(ses, posao.sId);
          case 'dodaj':
            return dodaj(ses, posao.red);
          case 'ukloni':
            return ukloni(ses, posao.sId);
        }
      });
    }

    function novaSesija(det: TestDetails): Sesija {
      const varijante = VARIJANTE.filter(v => (det.grupe ?? []).includes(v));
      const ses: Sesija = {
        tId: det.id,
        aktivna: true,
        red: new Subject<Posao>(),
        tajmeri: new Map(),
        naCekanju: new Map(),
        potvrdjeno: new Map(),
        zadnje: new Map(),
        imena: new Map(),
        max: det.maxPoena ?? null,
        varijante,
      };
      // pretplata se namerno ne otkazuje: posle zatvaranja sesije red se završava tek kad pošalje sve poslove
      ses.red.pipe(concatMap(p => izvrsi(ses, p))).subscribe();
      return ses;
    }

    const zatvoriSesiju = () => zatvoriSesijuStore(store._r, posaljiOdmah);

    function postaviTest(det: TestDetails): void {
      zatvoriSesiju();
      const ses = novaSesija(det);
      store._r.sesija = ses;
      const grupaGodina = det.grupa?.godinaUpisa;
      const polaganja = (det.polaganja ?? []).filter(p => p.student);
      const redovi = polaganja.map(p => redIz(p.student, grupaGodina)).sort(poIndeksu);
      const vrednosti: Record<number, VrednostiReda> = {};
      for (const p of polaganja) {
        vrednosti[p.student.id] = vrednostiIz(p, ses.varijante);
        ses.zadnje.set(p.student.id, vrednosti[p.student.id]);
        ses.potvrdjeno.set(p.student.id, potvrdjenoIz(p));
      }
      redovi.forEach(r => ses.imena.set(r.id, r));
      patchState(store, { ...PRAZNO_STANJE, test: det, redovi, vrednosti }, setLoaded());
    }

    /** Samo polja zaglavlja iz odgovora izmene (polaganja u store-u su potvrđena po redu i ne prepisuju se). */
    function zaglavljeIz(det: TestDetails): void {
      const ses = store._r.sesija;
      if (ses) {
        ses.max = det.maxPoena ?? ses.max;
      }
      patchState(store, s =>
        s.test
          ? {
              test: {
                ...s.test,
                datum: det.datum,
                maxPoena: det.maxPoena,
                tipTesta: det.tipTesta ?? s.test.tipTesta,
                pregledan: det.pregledan,
              },
            }
          : {},
      );
    }

    const tId = () => store.test()?.id ?? null;

    return {
      ucitaj(id: number): void {
        store._r.ucitavanje?.unsubscribe();
        zatvoriSesiju();
        patchState(store, PRAZNO_STANJE, setLoading());
        store._r.ucitavanje = store._api.get(id, { tiho: true }).subscribe({
          next: det => postaviTest(det),
          error: (e: unknown) => patchState(store, setError(porukaGreske(e))),
        });
      },

      /** Izmena reda (deo vrednosti); ispravan red se čuva sam posle {@link DEBOUNCE_REDA_MS}. */
      izmeni(sId: number, izmena: Partial<VrednostiReda>): void {
        const ses = store._r.sesija;
        const staro = store.vrednosti()[sId];
        if (!ses || !aktivnaZa(ses) || !staro || store.evidentiran() || store.zauzet()[sId]) {
          return;
        }
        const novo = { ...staro, ...izmena };
        ses.zadnje.set(sId, novo);
        patchState(store, s => ({ vrednosti: { ...s.vrednosti, [sId]: novo } }));
        const t = ses.tajmeri.get(sId);
        if (t !== undefined) {
          clearTimeout(t);
          ses.tajmeri.delete(sId);
        }
        const uRedu = (ses.naCekanju.get(sId) ?? 0) > 0;
        if (!zaSlanje(novo, ses.max, ses.varijante)) {
          // neispravno ili nepotpuno: ne šalje se; poruku prikazuje red (posao u redu, ako ga ima, se preskače)
          if (!uRedu) {
            postaviStatus(sId, null);
          }
          return;
        }
        if (jednako(novo, ses.potvrdjeno.get(sId)) && !uRedu) {
          postaviStatus(sId, store.statusi()[sId] === 'sacuvano' ? 'sacuvano' : null);
          return;
        }
        postaviStatus(sId, 'cuva');
        ses.tajmeri.set(
          sId,
          setTimeout(() => {
            ses.tajmeri.delete(sId);
            zakazi(ses, { tip: 'cuvaj', sId });
          }, DEBOUNCE_REDA_MS),
        );
      },

      /** "Pokušaj ponovo" posle greške čuvanja. */
      ponovo(sId: number): void {
        const ses = store._r.sesija;
        if (!ses || !aktivnaZa(ses) || !store.vrednosti()[sId]) {
          return;
        }
        postaviStatus(sId, 'cuva');
        posaljiOdmah(ses, sId);
      },

      /** Dodaje ispitanike (birač: iz grupe i stariji); već dodati se preskaču. Server proverava pravo na test. */
      dodajIspitanike(studenti: readonly StudentListItem[]): void {
        const ses = store._r.sesija;
        if (!ses || !aktivnaZa(ses) || store.evidentiran()) {
          return;
        }
        const grupaGodina = store.test()?.grupa?.godinaUpisa;
        const postojeci = new Set(store.redovi().map(r => r.id));
        const novi = studenti
          .filter((s, i) => !postojeci.has(s.id) && studenti.findIndex(x => x.id === s.id) === i)
          .map(s => redIz(s, grupaGodina));
        if (novi.length === 0) {
          return;
        }
        const vrednosti = Object.fromEntries(novi.map(r => [r.id, vrednostiIz(undefined, ses.varijante)]));
        for (const r of novi) {
          ses.imena.set(r.id, r);
          ses.zadnje.set(r.id, vrednosti[r.id]);
        }
        patchState(store, s => ({
          redovi: [...s.redovi, ...novi].sort(poIndeksu),
          vrednosti: { ...s.vrednosti, ...vrednosti },
          statusi: { ...s.statusi, ...Object.fromEntries(novi.map(r => [r.id, 'cuva' as const])) },
          zauzet: { ...s.zauzet, ...Object.fromEntries(novi.map(r => [r.id, 'dodaje' as const])) },
        }));
        novi.forEach(red => zakazi(ses, { tip: 'dodaj', red }));
      },

      /** Uklanja ispitanika (posle čuvanja koja su već u redu, redom). */
      ukloni(sId: number): void {
        const ses = store._r.sesija;
        if (!ses || !aktivnaZa(ses) || store.evidentiran() || store.zauzet()[sId] || !store.vrednosti()[sId]) {
          return;
        }
        const t = ses.tajmeri.get(sId);
        if (t !== undefined) {
          clearTimeout(t);
          ses.tajmeri.delete(sId);
        }
        patchState(store, s => ({ zauzet: { ...s.zauzet, [sId]: 'uklanja' as const }, statusi: { ...s.statusi, [sId]: null } }));
        zakazi(ses, { tip: 'ukloni', sId });
      },

      izmeniZaglavlje(izmena: UpdateTestCmd): Promise<boolean> {
        const id = tId();
        if (id === null) {
          return Promise.resolve(false);
        }
        return firstValueFrom(
          store._api.update(id, izmena).pipe(
            map(det => {
              zaglavljeIz(det);
              store._obavestenja.uspeh('Izmene su sačuvane.');
              return true;
            }),
            catchError(() => of(false)), // grešku je već prikazao interceptor
          ),
        );
      },

      zavrsi(): Promise<boolean> {
        const id = tId();
        if (id === null || !store.spremnost().moze) {
          return Promise.resolve(false);
        }
        return firstValueFrom(
          store._api.zavrsi(id).pipe(
            map(det => {
              zaglavljeIz({ ...det, pregledan: true });
              store._obavestenja.uspeh('Evidentiranje je završeno.', undefined, { grupa: `test-${id}` });
              return true;
            }),
            catchError(() => of(false)),
          ),
        );
      },

      obrisi(): Promise<boolean> {
        const id = tId();
        if (id === null) {
          return Promise.resolve(false);
        }
        return firstValueFrom(
          store._api.obrisi(id).pipe(
            map(() => {
              store._obavestenja.uspeh('Test je obrisan.');
              return true;
            }),
            catchError(() => of(false)),
          ),
          { defaultValue: true },
        );
      },

      _zatvoriSesiju: zatvoriSesiju,
    };
  }),
  withHooks({
    onDestroy(store) {
      store._r.unisten = true;
      store._r.ucitavanje?.unsubscribe();
      store._r.ucitavanje = null;
      store._zatvoriSesiju();
    },
  }),
);

export type TestStore = InstanceType<typeof TestStore>;
