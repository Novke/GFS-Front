import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { catchError, concatMap, defer, EMPTY, finalize, firstValueFrom, map, Observable, of, Subject, Subscription, switchMap, take, tap } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { StudentListItem } from '../../../core/api/studenti.api';
import { NotificationStore } from '../../../core/state/notification.store';
import { setError, setLoaded, setLoading, withRequestStatus } from '../../../shared/store/request-status.feature';
import { StanjeCuvanja } from '../../../shared/ui/save-status';
import { StubacHistograma } from '../../../shared/ui/histogram';
import { CuvanjaTestova } from './cuvanja-testova';
import { TestoviApi } from './testovi.api';
import { brojIspitanika, TestDetails, TestGrupa, TestPolaganjeInfo, TestStudentInfo, UpdateTestCmd, VARIJANTE } from './testovi.models';

/** Koliko se čeka posle poslednje izmene reda pre nego što se red pošalje serveru (spec 4, tabelarni unos). */
export const DEBOUNCE_REDA_MS = 600;
/** Kolona `polaganja.napomene` je `varchar(255)`. */
export const MAX_NAPOMENA = 255;
/** Poruka servera (`TestPP`, `@Min`) i forme za prag van opsega 0-max. */
export const PORUKA_PRAGA = 'Prag prolaza mora biti između 0 i maksimalnog broja poena.';

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

/** Polje na koje se odnosi greška validacije reda (za `aria-invalid` i `aria-describedby` na pravom polju). */
export type PoljeReda = 'poeni' | 'varijanta' | 'napomena';

export interface GreskaReda {
  polje: PoljeReda;
  poruka: string;
}

/**
 * Greška validacije reda (`null` = može da se sačuva čim su poeni uneti): poeni 0-max, varijanta kad test ima više
 * varijanti, napomena do {@link MAX_NAPOMENA} znakova. Red sa greškom se ne šalje.
 */
export function greskaReda(v: VrednostiReda, max: number | null | undefined, varijante: readonly TestGrupa[]): GreskaReda | null {
  const poeni = greskaPoena(v.poeni, max);
  if (poeni) {
    return { polje: 'poeni', poruka: poeni };
  }
  if (v.napomene.length > MAX_NAPOMENA) {
    return { polje: 'napomena', poruka: `Napomena: najviše ${MAX_NAPOMENA} znakova.` };
  }
  if (parsirajPoene(v.poeni) === null && (v.prepisivao || v.napomene.trim() !== '')) {
    return { polje: 'poeni', poruka: 'Unesi poene da bi se red sačuvao.' };
  }
  if (parsirajPoene(v.poeni) !== null && !v.grupa && varijante.length > 1) {
    return { polje: 'varijanta', poruka: 'Izaberi varijantu.' };
  }
  return null;
}

/** Red se šalje serveru samo kad je ispravan i ima poene i varijantu (server traži oba). */
export function zaSlanje(v: VrednostiReda, max: number | null | undefined, varijante: readonly TestGrupa[]): boolean {
  return greskaReda(v, max, varijante) === null && parsirajPoene(v.poeni) !== null && (v.grupa !== null || varijante.length <= 1);
}

/**
 * Jedino mesto pravila prolaza na frontu (statistika uživo, stranica statistike, tabela po varijantama); isto kao backend
 * `utility/Prolaz`: test ima prag (`pragProlaza`, u poenima), poeni >= prag (prag je uključen) i nije prepisivao.
 * Bez praga test nema prolaznost (`false`; statistika tada daje `prolaz: null`).
 */
export function jePolozio(poeni: number, pragProlaza: number | null | undefined, prepisivao: boolean): boolean {
  return pragProlaza !== null && pragProlaza !== undefined && !prepisivao && poeni >= pragProlaza;
}

/** Tekst pravila prolaza za ekran (uz {@link jePolozio}). */
export function opisProlaza(pragProlaza: number | null | undefined): string {
  return pragProlaza === null || pragProlaza === undefined
    ? 'Bez praga test nema prolaznost.'
    : `Prolaz: najmanje ${pragProlaza} poena, bez prepisivanja.`;
}

/**
 * Statistika iz unosa: prosek, prolaz, min i max samo nad unetim poenima (prazni se ignorišu). `prolaz` je `null` kad test
 * nema prag prolaza ili nema unetih poena.
 */
export function statistikaPoena(unosi: readonly UnosPoena[], pragProlaza: number | null | undefined): StatistikaPoena {
  const uneti = unosi.filter((u): u is { poeni: number; prepisivao: boolean } => u.poeni !== null && Number.isFinite(u.poeni));
  if (uneti.length === 0) {
    return { broj: 0, ukupno: unosi.length, prosek: null, prolaz: null, min: null, max: null };
  }
  const poeni = uneti.map(u => u.poeni);
  const polozilo = uneti.filter(u => jePolozio(u.poeni, pragProlaza, u.prepisivao)).length;
  const saPragom = pragProlaza !== null && pragProlaza !== undefined;
  return {
    broj: uneti.length,
    ukupno: unosi.length,
    prosek: poeni.reduce((z, p) => z + p, 0) / uneti.length,
    prolaz: saPragom ? (polozilo * 100) / uneti.length : null,
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
export function statistikaPoVarijantama(
  polaganja: readonly TestPolaganjeInfo[],
  pragProlaza: number | null | undefined,
): StatistikaVarijante[] {
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
      const s = statistikaPoena(grupe.get(g)!, pragProlaza);
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

const jednakeVrednosti = (a: VrednostiReda, b: VrednostiReda): boolean =>
  a.grupa === b.grupa && a.poeni === b.poeni && a.prepisivao === b.prepisivao && a.napomene === b.napomene;

const imeReda = (r: Pick<RedIspitanika, 'ime' | 'prezime'> | undefined): string =>
  r ? [r.ime, r.prezime].filter(Boolean).join(' ') || 'Student' : 'Student';

type Posao = { tip: 'cuvaj'; sId: number } | { tip: 'dodaj'; red: RedIspitanika } | { tip: 'ukloni'; sId: number };

/**
 * Sesija jednog učitanog testa: sve što treba poslati i pratiti za njegove redove. Ne zavisi od stanja store-a ni od toga
 * koji je test sada na ekranu: zahtev nosi `tId` i vrednosti iz sesije, pa izmena napravljena na jednom testu uvek stigne
 * na taj test, i kad je ekran u međuvremenu prešao na drugi (`/testovi/5` -> `/testovi/6`, ista komponenta).
 */
class Sesija {
  /** Jedan red poslova testa (`concatMap`): čuvanja, dodavanja i uklanjanja, redom. */
  readonly red = new Subject<Posao>();
  /** Debounce tajmeri izmena koje još nisu poslate. */
  readonly timeri = new Map<number, ReturnType<typeof setTimeout>>();
  /** Poslednje unete vrednosti (ono što treba poslati). */
  readonly lokalno = new Map<number, VrednostiReda>();
  /**
   * Poslednje vrednosti koje je server potvrdio; nema unosa = nepoznato (npr. posle greške čuvanja: server je možda
   * ipak upisao), pa sledeći posao reda uvek šalje.
   */
  readonly potvrdjeno = new Map<number, Potvrdjeno>();
  /** Raste sa svakom promenom potvrđenog stanja reda (odgovor upisa, greška); zastareo GET usaglašavanja se odbacuje. */
  readonly potvrde = new Map<number, number>();
  /** Raste sa svakom izmenom reda; odgovor ili greška važe za prikaz samo ako je verzija ista kao pri slanju. */
  readonly verzije = new Map<number, number>();
  readonly imena = new Map<number, RedIspitanika>();
  /** Redovi čije poslednje čuvanje nije uspelo (za zbirnu poruku). */
  readonly greske = new Set<number>();
  /** Poslovi u redu ili u izvršenju (tajmeri se ne računaju). */
  uToku = 0;
  /** `uToku` je pao na 0 (čekanje pražnjenja). */
  readonly mirovanje = new Subject<void>();
  /** Test se briše: izmene se ne šalju. */
  obrisan = false;
  /** Sesija je zatvorena (ekran napušten ili prelaz na drugi test): odjavljuje se iz registra kad isprazni red. */
  zatvorena = false;

  constructor(
    readonly tId: number,
    public max: number | null,
    readonly varijante: TestGrupa[],
  ) {}

  verzija(sId: number): number {
    return this.verzije.get(sId) ?? 0;
  }

  potvrda(sId: number): number {
    return this.potvrde.get(sId) ?? 0;
  }

  /** Novo potvrđeno stanje reda (`undefined` = nepoznato). */
  potvrdi(sId: number, p: Potvrdjeno | undefined): void {
    if (p) {
      this.potvrdjeno.set(sId, p);
    } else {
      this.potvrdjeno.delete(sId);
    }
    this.potvrde.set(sId, this.potvrda(sId) + 1);
  }
}

interface TestState {
  test: TestDetails | null;
  redovi: RedIspitanika[];
  vrednosti: Record<number, VrednostiReda>;
  statusi: Record<number, StanjeCuvanja | null>;
  /** Razlog poslednje neuspele izmene reda (sa servera), prikazuje se u redu do sledeće izmene. */
  greske: Record<number, string | null>;
  /** Red koji se dodaje ili uklanja (polja zaključana). */
  zauzet: Record<number, 'dodaje' | 'uklanja' | undefined>;
}

const PRAZNO_STANJE: TestState = { test: null, redovi: [], vrednosti: {}, statusi: {}, greske: {}, zauzet: {} };

/**
 * Detalj testa sa tabelarnim unosom poena (provajduje se u `TestDetalj` i `TestStatistika`).
 *
 * Svaka izmena reda je **optimistična** (vidi se odmah, statistika uživo se odmah preračunava) i čuva se sama posle
 * {@link DEBOUNCE_REDA_MS} bez novih izmena tog reda. Red sa greškom validacije (poeni > max, bez varijante…) se ne šalje.
 * Svaka izmena ispravnog reda ide u red poslova testa (i kad je jednaka potvrđenoj: zahtev u toku može da je promeni);
 * posao u trenutku izvršenja poredi **poslednje unete** vrednosti sa potvrđenim i šalje samo razliku. Svi poslovi testa
 * idu kroz **jedan red** (`concatMap`): za studenta je najviše jedan zahtev u toku, a server (`evidentirajIspitanika`
 * briše i ponovo upisuje polaganje) ne dobija paralelne izmene istog testa. Odgovor ili greška menjaju prikaz reda samo
 * ako red od slanja nije menjan (`verzije`), pa "Sačuvano" uvek znači da server ima baš prikazanu vrednost.
 *
 * Greška (mreža, 5xx ili pravilo servera, 4xx): uneto ostaje u polju, status reda je "Nije sačuvano" sa "Pokušaj ponovo",
 * a razlog se vidi u redu do sledeće izmene; greške više redova se javljaju jednom porukom ("Nije sačuvano za N
 * ispitanika", grupa `test-<id>-cuvanje` zamenjuje prethodnu). Potvrđeno stanje se tiho usaglašava ponovnim čitanjem.
 *
 * Kad `ucitaj` pređe na drugi test, sesija prethodnog se **zatvara, ne otkazuje** (izmene na čekanju se odmah šalju, red se
 * prazni), a novi test se učitava tek kad se stara sesija isprazni i kad nijedna sesija tog testa u aplikaciji (registar
 * `CuvanjaTestova`) nema posao na putu. Isto pri napuštanju ekrana. `zavrsi` šalje izmene i čeka
 * pražnjenje pre PATCH-a; `obrisi` otkazuje izmene na čekanju tog testa.
 */
export const TestStore = signalStore(
  withState<TestState>(PRAZNO_STANJE),
  withRequestStatus(),
  withProps(() => ({
    _api: inject(TestoviApi),
    _registar: inject(CuvanjaTestova),
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
      pragProlaza: computed(() => test()?.pragProlaza ?? null),
      /** Statistika uživo iz unetih (ispravnih) poena; redovi koji se dodaju ne ulaze. */
      statistikaUzivo: computed<StatistikaPoena>(() => {
        const v = vrednosti();
        const z = zauzet();
        const m = max();
        return statistikaPoena(
          redovi()
            .filter(r => z[r.id] !== 'dodaje')
            .map(r => ({ poeni: poeniZaStatistiku(v[r.id]?.poeni ?? '', m), prepisivao: v[r.id]?.prepisivao === true })),
          test()?.pragProlaza,
        );
      }),
      /** Greška validacije po redu (prikazuje je red; red sa greškom se ne šalje). */
      greskeValidacije: computed<Record<number, GreskaReda | null>>(() => {
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
    /** Stanje (za ekran) menja samo sesija koja je sada na ekranu; stara sesija samo završava svoje zahteve. */
    const tekuca = (s: Sesija) => store._r.sesija === s && !store._r.unisten;

    function postaviStatus(s: Sesija, sId: number, status: StanjeCuvanja | null, greska: string | null = null): void {
      if (tekuca(s)) {
        patchState(store, st => ({ statusi: { ...st.statusi, [sId]: status }, greske: { ...st.greske, [sId]: greska } }));
      }
    }

    /** Jedna poruka za sve redove bez čuvanja (nova zamenjuje prethodnu iste sesije); javlja se i posle napuštanja ekrana. */
    function javiGresku(s: Sesija, sId: number, razlog: string): void {
      const n = s.greske.size;
      const tekst = n <= 1 ? `${imeReda(s.imena.get(sId))}: ${razlog}` : `Nije sačuvano za ${brojIspitanika(n)}. ${razlog}`;
      store._obavestenja.greska(tekst, { grupa: `test-${s.tId}-cuvanje` });
    }

    /**
     * Posle greške: tiho ponovo čita potvrđeno stanje reda (izmena je možda upisana a odgovor izgubljen). Prikaz ostaje.
     * Odgovor važi samo ako za red u međuvremenu nije stigla novija potvrda (upis koji je prošao posle slanja GET-a).
     */
    function osveziPotvrdjeno(s: Sesija, sId: number): void {
      const potvrda = s.potvrda(sId);
      store._api.get(s.tId, { tiho: true }).subscribe({
        next: det => {
          const p = det.polaganja?.find(x => x.student?.id === sId);
          if (p && s.potvrda(sId) === potvrda) {
            s.potvrdi(sId, potvrdjenoIz(p));
          }
        },
        error: () => undefined,
      });
    }

    function cuvaj(s: Sesija, sId: number): Observable<unknown> {
      const trenutna = s.verzija(sId);
      const v = s.lokalno.get(sId);
      if (s.obrisan || !v || !s.imena.has(sId) || !zaSlanje(v, s.max, s.varijante)) {
        return EMPTY; // neispravan red se ne šalje; poruku prikazuje red
      }
      if (jednako(v, s.potvrdjeno.get(sId))) {
        if (s.verzija(sId) === trenutna && !s.timeri.has(sId)) {
          s.greske.delete(sId);
          postaviStatus(s, sId, 'sacuvano');
        }
        return EMPTY;
      }
      const poeni = parsirajPoene(v.poeni) as number;
      const grupa = (v.grupa ?? s.varijante[0] ?? 'A') as TestGrupa;
      const napomene = v.napomene.trim() || null;
      return store._api
        .evidentiraj(s.tId, { studentId: sId, grupa, ostvareniPoeni: poeni, prepisivao: v.prepisivao, napomene }, { tiho: true })
        .pipe(
          tap(det => {
            const p = det.polaganja?.find(x => x.student?.id === sId);
            s.potvrdi(sId, p ? potvrdjenoIz(p) : { grupa, poeni, prepisivao: v.prepisivao, napomene: napomene ?? '' });
            if (s.verzija(sId) === trenutna && !s.timeri.has(sId)) {
              s.greske.delete(sId);
              postaviStatus(s, sId, 'sacuvano');
            }
          }),
          catchError((e: unknown) => {
            // server je možda ipak upisao (izgubljen odgovor): potvrđeno je nepoznato dok ga GET ne usaglasi
            s.potvrdi(sId, undefined);
            osveziPotvrdjeno(s, sId);
            if (s.verzija(sId) === trenutna) {
              const razlog = porukaGreske(e);
              s.greske.add(sId);
              postaviStatus(s, sId, 'greska', razlog);
              javiGresku(s, sId, razlog);
            }
            return EMPTY;
          }),
        );
    }

    function dodaj(s: Sesija, red: RedIspitanika): Observable<unknown> {
      return store._api.dodajPolaganje(s.tId, red.id, { tiho: true }).pipe(
        tap(det => {
          const p = det.polaganja?.find(x => x.student?.id === red.id);
          s.potvrdi(red.id, potvrdjenoIz(p));
          if (tekuca(s)) {
            patchState(store, st => ({ zauzet: { ...st.zauzet, [red.id]: undefined }, statusi: { ...st.statusi, [red.id]: null } }));
          }
        }),
        catchError((e: unknown) => {
          s.imena.delete(red.id);
          s.lokalno.delete(red.id);
          store._obavestenja.greska(`${imeReda(red)}: ${porukaGreske(e)}`);
          if (tekuca(s)) {
            patchState(store, st => ({
              redovi: st.redovi.filter(r => r.id !== red.id),
              zauzet: { ...st.zauzet, [red.id]: undefined },
              statusi: { ...st.statusi, [red.id]: null },
            }));
          }
          return EMPTY;
        }),
      );
    }

    function ukloni(s: Sesija, sId: number): Observable<unknown> {
      const red = s.imena.get(sId);
      return store._api.ukloniPolaganje(s.tId, sId, { tiho: true }).pipe(
        tap(() => {
          s.imena.delete(sId);
          s.lokalno.delete(sId);
          s.potvrdi(sId, undefined);
          s.greske.delete(sId);
          if (!tekuca(s)) {
            return;
          }
          patchState(store, st => {
            const vrednosti = { ...st.vrednosti };
            delete vrednosti[sId];
            return {
              redovi: st.redovi.filter(r => r.id !== sId),
              vrednosti,
              zauzet: { ...st.zauzet, [sId]: undefined },
              statusi: { ...st.statusi, [sId]: null },
              greske: { ...st.greske, [sId]: null },
            };
          });
          store._obavestenja.uspeh(`${imeReda(red)} je uklonjen sa testa.`, undefined, { grupa: `test-${s.tId}` });
        }),
        catchError((e: unknown) => {
          store._obavestenja.greska(`${imeReda(red)}: ${porukaGreske(e)}`);
          if (tekuca(s)) {
            patchState(store, st => ({ zauzet: { ...st.zauzet, [sId]: undefined } }));
          }
          return EMPTY;
        }),
      );
    }

    function izvrsi(s: Sesija, posao: Posao): Observable<unknown> {
      return defer(() => {
        switch (posao.tip) {
          case 'cuvaj':
            return cuvaj(s, posao.sId);
          case 'dodaj':
            return dodaj(s, posao.red);
          case 'ukloni':
            return ukloni(s, posao.sId);
        }
      }).pipe(
        finalize(() => {
          s.uToku--;
          if (s.uToku === 0) {
            if (s.zatvorena) {
              store._registar.odjavi(s);
            }
            s.mirovanje.next();
          }
        }),
      );
    }

    function nova(det: TestDetails): Sesija {
      const s = new Sesija(det.id, det.maxPoena ?? null, VARIJANTE.filter(v => (det.grupe ?? []).includes(v)));
      // pretplata se namerno ne otkazuje: posle zatvaranja sesije red se završava tek kad izvrši sve poslove
      s.red.pipe(concatMap(p => izvrsi(s, p))).subscribe();
      store._registar.prijavi(s);
      return s;
    }

    function zakazi(s: Sesija, posao: Posao): void {
      s.uToku++;
      s.red.next(posao);
    }

    /** Šalje čuvanje reda odmah (otkazuje debounce koji je čekao). */
    function posalji(s: Sesija, sId: number): void {
      const t = s.timeri.get(sId);
      if (t !== undefined) {
        clearTimeout(t);
        s.timeri.delete(sId);
      }
      zakazi(s, { tip: 'cuvaj', sId });
    }

    function posaljiCekajuce(s: Sesija): void {
      for (const sId of [...s.timeri.keys()]) {
        posalji(s, sId);
      }
    }

    /** Emituje (jednom) kad nema poslova u redu ni u izvršenju; odmah ako ih nema. */
    const sacekaj = (s: Sesija): Observable<unknown> => defer(() => (s.uToku === 0 ? of(null) : s.mirovanje.pipe(take(1))));

    /** Zatvara sesiju: izmene na čekanju se šalju, poslovi u toku i u redu se završavaju (ne otkazuju). */
    function zatvori(s: Sesija): void {
      posaljiCekajuce(s);
      s.zatvorena = true;
      s.red.complete();
      if (s.uToku === 0) {
        store._registar.odjavi(s);
      }
    }

    /** Ispravni redovi koji se razlikuju od potvrđenih idu ponovo na čuvanje (novi max, neuspelo brisanje). */
    function posaljiNepotvrdjeno(s: Sesija): void {
      for (const [sId, v] of s.lokalno) {
        if (!s.timeri.has(sId) && zaSlanje(v, s.max, s.varijante) && !jednako(v, s.potvrdjeno.get(sId))) {
          postaviStatus(s, sId, 'cuva');
          posalji(s, sId);
        }
      }
    }

    function postaviPodatke(det: TestDetails): void {
      const s = nova(det);
      const grupaGodina = det.grupa?.godinaUpisa;
      const polaganja = (det.polaganja ?? []).filter(p => p.student);
      const redovi = polaganja.map(p => redIz(p.student, grupaGodina)).sort(poIndeksu);
      const vrednosti: Record<number, VrednostiReda> = {};
      for (const p of polaganja) {
        vrednosti[p.student.id] = vrednostiIz(p, s.varijante);
        s.lokalno.set(p.student.id, vrednosti[p.student.id]);
        s.potvrdjeno.set(p.student.id, potvrdjenoIz(p));
      }
      redovi.forEach(r => s.imena.set(r.id, r));
      store._r.sesija = s;
      patchState(store, { ...PRAZNO_STANJE, test: det, redovi, vrednosti }, setLoaded());
    }

    /** Samo polja zaglavlja iz odgovora izmene (polaganja u store-u su potvrđena po redu i ne prepisuju se). */
    function zaglavljeIz(s: Sesija, det: TestDetails): void {
      s.max = det.maxPoena ?? s.max;
      if (!tekuca(s)) {
        return;
      }
      patchState(store, st =>
        st.test
          ? {
              test: {
                ...st.test,
                datum: det.datum,
                maxPoena: det.maxPoena,
                pragProlaza: det.pragProlaza !== undefined ? det.pragProlaza : st.test.pragProlaza,
                tipTesta: det.tipTesta ?? st.test.tipTesta,
                pregledan: det.pregledan,
              },
            }
          : {},
      );
    }

    /** Aktivna sesija na ekranu (ne posle uništenja ili brisanja). */
    const aktivna = (): Sesija | null => {
      const s = store._r.sesija;
      return s && tekuca(s) && !s.obrisan ? s : null;
    };

    return {
      /** Zatvara tekuću sesiju (uništenje store-a); `_` = privatno, vidljivo samo u `withHooks`. */
      _zatvori(): void {
        if (store._r.sesija) {
          zatvori(store._r.sesija);
        }
      },

      /**
       * Učitava test. Sesija prethodnog testa se zatvara (izmene na čekanju se šalju) i novi se učitava kad se ona isprazni
       * i kad se isprazne sve druge sesije istog testa ({@link CuvanjaTestova}: napušten ekran, drugi store), pa učitano
       * stanje ne može da prethodi izmenama koje su još na putu.
       */
      ucitaj(id: number): void {
        store._r.ucitavanje?.unsubscribe();
        const stara = store._r.sesija;
        store._r.sesija = null;
        if (stara) {
          zatvori(stara);
        }
        patchState(store, PRAZNO_STANJE, setLoading());
        // prvo stara sesija ovog store-a (i kad je drugi test), pa sve sesije testa `id` u aplikaciji (registar)
        store._r.ucitavanje = (stara ? sacekaj(stara) : of(null))
          .pipe(
            switchMap(() => store._registar.sacekaj(id)),
            switchMap(() => store._api.get(id, { tiho: true })),
          )
          .subscribe({
            next: det => postaviPodatke(det),
            error: (e: unknown) => patchState(store, setError(porukaGreske(e))),
          });
      },

      /** Izmena reda (deo vrednosti); ispravan red se čuva sam posle {@link DEBOUNCE_REDA_MS}. */
      izmeni(sId: number, izmena: Partial<VrednostiReda>): void {
        const s = aktivna();
        const staro = s?.lokalno.get(sId);
        if (!s || !staro || store.evidentiran() || store.zauzet()[sId]) {
          return;
        }
        const novo = { ...staro, ...izmena };
        if (jednakeVrednosti(staro, novo)) {
          return;
        }
        s.lokalno.set(sId, novo);
        s.verzije.set(sId, s.verzija(sId) + 1);
        s.greske.delete(sId);
        const t = s.timeri.get(sId);
        if (t !== undefined) {
          clearTimeout(t);
          s.timeri.delete(sId);
        }
        const salje = zaSlanje(novo, s.max, s.varijante);
        patchState(store, st => ({
          vrednosti: { ...st.vrednosti, [sId]: novo },
          // neispravno ili nepotpuno: ne šalje se, poruku prikazuje red
          statusi: { ...st.statusi, [sId]: salje ? ('cuva' as const) : null },
          greske: { ...st.greske, [sId]: null },
        }));
        if (salje) {
          s.timeri.set(
            sId,
            setTimeout(() => posalji(s, sId), DEBOUNCE_REDA_MS),
          );
        }
      },

      /** "Pokušaj ponovo" posle greške čuvanja. */
      ponovo(sId: number): void {
        const s = aktivna();
        if (!s || !s.lokalno.has(sId)) {
          return;
        }
        postaviStatus(s, sId, 'cuva');
        posalji(s, sId);
      },

      /** Dodaje ispitanike (birač: iz grupe i stariji); već dodati se preskaču. Server proverava pravo na test. */
      dodajIspitanike(studenti: readonly StudentListItem[]): void {
        const s = aktivna();
        if (!s || store.evidentiran()) {
          return;
        }
        const grupaGodina = store.test()?.grupa?.godinaUpisa;
        const postojeci = new Set(store.redovi().map(r => r.id));
        const novi = studenti
          .filter((x, i) => !postojeci.has(x.id) && studenti.findIndex(y => y.id === x.id) === i)
          .map(x => redIz(x, grupaGodina));
        if (novi.length === 0) {
          return;
        }
        const vrednosti = Object.fromEntries(novi.map(r => [r.id, vrednostiIz(undefined, s.varijante)]));
        for (const r of novi) {
          s.imena.set(r.id, r);
          s.lokalno.set(r.id, vrednosti[r.id]);
        }
        patchState(store, st => ({
          redovi: [...st.redovi, ...novi].sort(poIndeksu),
          vrednosti: { ...st.vrednosti, ...vrednosti },
          statusi: { ...st.statusi, ...Object.fromEntries(novi.map(r => [r.id, 'cuva' as const])) },
          zauzet: { ...st.zauzet, ...Object.fromEntries(novi.map(r => [r.id, 'dodaje' as const])) },
        }));
        novi.forEach(red => zakazi(s, { tip: 'dodaj', red }));
      },

      /**
       * Uklanja ispitanika. Izmena koja čeka debounce se prvo šalje (ako uklanjanje ne uspe, uneto nije izgubljeno),
       * pa uklanjanje ide u red posle nje.
       */
      ukloni(sId: number): void {
        const s = aktivna();
        if (!s || store.evidentiran() || store.zauzet()[sId] || !s.lokalno.has(sId)) {
          return;
        }
        if (s.timeri.has(sId)) {
          posalji(s, sId);
        }
        patchState(store, st => ({ zauzet: { ...st.zauzet, [sId]: 'uklanja' as const } }));
        zakazi(s, { tip: 'ukloni', sId });
      },

      /**
       * Tip, datum, max (`PUT`, prag se ne šalje). Vraća `null` kad je sačuvano, inače razlog greške (forma ga prikazuje
       * sama; npr. max manji od praga prolaza). Posle većeg max-a se šalju redovi koji su do tada bili neispravni.
       */
      izmeniZaglavlje(izmena: UpdateTestCmd): Promise<string | null> {
        const s = aktivna();
        if (!s) {
          return Promise.resolve(PORUKA_SISTEM);
        }
        return firstValueFrom(
          store._api.update(s.tId, izmena, { tiho: true }).pipe(
            map(det => {
              zaglavljeIz(s, det);
              store._obavestenja.uspeh('Izmene su sačuvane.');
              posaljiNepotvrdjeno(s);
              return null;
            }),
            catchError((e: unknown) => of(porukaGreske(e))),
          ),
        );
      },

      /**
       * Prag prolaza (`PATCH test/{id}/prag-prolaza`, `null` briše), i na evidentiranom testu. Vraća `null` kad je
       * sačuvano, inače razlog greške (polje ga prikazuje). Statistika uživo se odmah preračunava po novom pragu.
       */
      postaviPrag(pragProlaza: number | null): Promise<string | null> {
        const s = store._r.sesija;
        if (!s || !tekuca(s) || s.obrisan) {
          return Promise.resolve(PORUKA_SISTEM);
        }
        return firstValueFrom(
          store._api.pragProlaza(s.tId, pragProlaza, { tiho: true }).pipe(
            map(det => {
              if (tekuca(s)) {
                patchState(store, st => (st.test ? { test: { ...st.test, pragProlaza: det.pragProlaza ?? null } } : {}));
              }
              return null;
            }),
            catchError((e: unknown) => of(porukaGreske(e))),
          ),
        );
      },

      /**
       * `PATCH test/{id}`: završava evidentiranje. Pre PATCH-a se šalju izmene koje čekaju debounce i čeka se da se red
       * isprazni; ako tada neki ispitanik nema potvrđene poene (ili čuvanje nije uspelo), ne završava se.
       */
      zavrsi(): Promise<boolean> {
        const s = aktivna();
        if (!s || store.evidentiran()) {
          return Promise.resolve(false);
        }
        posaljiCekajuce(s);
        return firstValueFrom(
          sacekaj(s).pipe(
            switchMap(() => {
              if (!tekuca(s)) {
                return of(false);
              }
              const nepotvrdjeno = [...s.imena.keys()].filter(sId => {
                const v = s.lokalno.get(sId);
                const p = s.potvrdjeno.get(sId);
                return s.greske.has(sId) || !v || p?.poeni === null || p?.poeni === undefined || !jednako(v, p);
              });
              if (nepotvrdjeno.length > 0) {
                store._obavestenja.greska(`Nisu sačuvani poeni za ${brojIspitanika(nepotvrdjeno.length)}; evidentiranje nije završeno.`);
                return of(false);
              }
              return store._api.zavrsi(s.tId).pipe(
                map(det => {
                  zaglavljeIz(s, { ...det, pregledan: true });
                  store._obavestenja.uspeh('Evidentiranje je završeno.', undefined, { grupa: `test-${s.tId}` });
                  return true;
                }),
              );
            }),
            catchError(() => of(false)),
          ),
          { defaultValue: false },
        );
      },

      /**
       * `DELETE test/{id}`: izmene na čekanju se otkazuju i ne šalju obrisanom testu; poslovi koji su već u redu se sačekaju
       * pre brisanja. Ako brisanje ne uspe, nepotvrđeno se šalje ponovo.
       */
      obrisi(): Promise<boolean> {
        const s = aktivna();
        if (!s) {
          return Promise.resolve(false);
        }
        s.obrisan = true;
        s.timeri.forEach(t => clearTimeout(t));
        s.timeri.clear();
        return firstValueFrom(
          sacekaj(s).pipe(
            switchMap(() => store._api.obrisi(s.tId)),
            map(() => {
              store._obavestenja.uspeh('Test je obrisan.');
              return true;
            }),
            catchError(() => {
              s.obrisan = false;
              posaljiNepotvrdjeno(s);
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

export type TestStore = InstanceType<typeof TestStore>;
