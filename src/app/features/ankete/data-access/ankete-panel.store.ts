import { HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT, Signal, computed, inject, signal } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, Subscription, concatMap, map, of } from 'rxjs';

import { PORUKA_SISTEM, toApiError } from '../../../core/api/api-error';
import { AnketeApi } from './ankete.api';
import { AnketaDetails, AnketaInfo, AnketeSabloniInfo, KontekstAnkete, SablonAnkete, SablonAnketeCmd } from './ankete.models';
import {
  Mogucnosti, Nacrt, OSVEZAVANJE_ANKETE_MS, cmdIzSablona, cmdPokretanja, cmdPreciceIzAnkete, cmdSablonaIzNacrta, mogucnosti,
  mozeOdmah, nacrtIzAnkete, nacrtIzSablona, prazanNacrt, precice, sledecaBoja,
} from './ankete.pravila';

/** Leva kolona (na telefonu prvi ekran): početni, folder (`null` = bez foldera), istorija, uređivanje prečica. */
export type LeviEkran =
  | { ekran: 'pocetni' }
  | { ekran: 'folder'; folderId: number | null }
  | { ekran: 'istorija' }
  | { ekran: 'uredi' };

/**
 * Desna kolona (na telefonu preko leve): provera pre pokretanja (`pokreni`) ili izmena šablona bez pokretanja (`sablon`),
 * pa rezultati. `null` = ništa (laptop pokazuje uputstvo, telefon levu kolonu).
 */
export type DesniEkran =
  | { ekran: 'provera'; nacrt: Nacrt; sablon: SablonAnkete | null; rezim: 'pokreni' | 'sablon'; novo: NovSablon }
  | { ekran: 'rezultati' }
  | null;

/** Gde ide nov šablon (folder, prečica); za postojeći se ne koristi. */
export interface NovSablon {
  folderId: number | null;
  precica: boolean;
}

const NOV_PODRAZUMEVANO: NovSablon = { folderId: null, precica: true };

/** Čuvanje uz pokretanje: izmene u šablon iz koga je otvoreno, ili nov šablon (i prečica). */
export interface CuvanjeNacrta {
  sacuvaj: boolean;
  folderId: number | null;
  precica: boolean;
}

/** Strana istorije (`GET ankete`). */
export const VELICINA_ISTORIJE = 20;

interface PanelState {
  info: AnketeSabloniInfo | null;
  ucitava: boolean;
  greskaUcitavanja: string | null;
  levo: LeviEkran;
  desno: DesniEkran;
  upit: string;
  /** Prikazana anketa (rezultati); osvežava se na 2 s dok je otvorena. */
  anketa: AnketaDetails | null;
  /** Lokalni trenutak kad je `anketa` stigla (odbrojavanje po satu servera, `sadaMs`). */
  primljenoMs: number;
  /** Anketa je posle pokretanja sačuvana kao prečica ("★ Sačuvaj"): dugme nestaje. */
  sacuvanaKaoPrecica: boolean;
  /** Zahtev nastavnika je u toku (pokretanje, zatvaranje, čuvanje). */
  radi: boolean;
  /** Greška poslednje radnje (traka u panelu). */
  poruka: string | null;
  istorija: AnketaInfo[];
  istorijaStrana: number;
  istorijaIma: boolean;
  istorijaUcitava: boolean;
}

const POCETNO: PanelState = {
  info: null, ucitava: false, greskaUcitavanja: null, levo: { ekran: 'pocetni' }, desno: null, upit: '', anketa: null,
  primljenoMs: 0, sacuvanaKaoPrecica: false, radi: false, poruka: null, istorija: [], istorijaStrana: -1, istorijaIma: false,
  istorijaUcitava: false,
};

const razlog = (e: unknown): string => (e instanceof HttpErrorResponse ? toApiError(e).reason : PORUKA_SISTEM);

/** Uređivanje šablona ne zavisi od konteksta: obe publike. */
const SVE_PUBLIKE: Mogucnosti = { naCasu: true, grupa: true, poruka: null };

const BEZ_KONTEKSTA: KontekstAnkete = { predavanjeId: null, grupaId: null, grupaNaziv: null, predmetNaziv: null, brojCekiranih: null };

/**
 * Stanje panela brze ankete (spec 6.1): šabloni, navigacija po ekranima, pokretanje, rezultati uživo, istorija i
 * uređivanje prečica. Daje ga komponenta panela (`providers`), pa traje koliko i panel. Kontekst (predavanje, grupa, broj
 * čekiranih) je signal pozivaoca (konzola ga osvežava uživo). Prikazana otvorena anketa se osvežava `GET ankete/{id}` na 2 s,
 * samo dok je stranica vidljiva i nijedan upit nije u toku.
 */
export const AnketePanelStore = signalStore(
  withState<PanelState>(POCETNO),
  withProps(() => ({
    _api: inject(AnketeApi),
    _dokument: inject(DOCUMENT),
    _kontekst: signal<Signal<KontekstAnkete>>(signal(BEZ_KONTEKSTA)),
    _veze: { osvezavanje: null as Subscription | null, tajmer: null as ReturnType<typeof setInterval> | null },
  })),
  withComputed(store => ({
    kontekst: computed(() => store._kontekst()()),
    precice: computed(() => precice(store.info())),
    folderi: computed(() => [...(store.info()?.folderi ?? [])].sort((a, b) => a.rb - b.rb || a.id - b.id)),
  })),
  withComputed(store => ({
    mogucnosti: computed<Mogucnosti>(() => mogucnosti(store.kontekst())),
    bezFoldera: computed(() => (store.info()?.sabloni ?? []).filter(s => s.folderId === null).length),
    /** Broj šablona po folderu iz samih šablona (premeštanje menja samo šablon, ne i `brojSablona` foldera). */
    brojPoFolderu: computed(() => {
      const m = new Map<number, number>();
      for (const s of store.info()?.sabloni ?? []) {
        if (s.folderId !== null) {
          m.set(s.folderId, (m.get(s.folderId) ?? 0) + 1);
        }
      }
      return m;
    }),
  })),
  withMethods(store => {
    const api = store._api;
    const greska = (e: unknown) => patchState(store, { radi: false, poruka: razlog(e) });

    const prikazi = (a: AnketaDetails) =>
      patchState(store, { anketa: a, primljenoMs: Date.now(), desno: { ekran: 'rezultati' }, radi: false, poruka: null });

    const ucitajSablone = (): void => {
      patchState(store, { ucitava: store.info() === null, greskaUcitavanja: null });
      api.sabloni().subscribe({
        next: info => patchState(store, { info, ucitava: false }),
        error: e => patchState(store, { ucitava: false, greskaUcitavanja: razlog(e) }),
      });
    };

    /** Jedan zahtev u isto vreme; posle uspeha `posle`, greška ide u traku. */
    const radnja = <T>(zahtev: Observable<T>, posle: (x: T) => void): void => {
      if (store.radi()) {
        return;
      }
      patchState(store, { radi: true, poruka: null });
      zahtev.subscribe({
        next: x => {
          patchState(store, { radi: false });
          posle(x);
        },
        error: greska,
      });
    };

    const pokreniNacrt = (nacrt: Nacrt, sablon: SablonAnkete | null, cuvanje: CuvanjeNacrta | null): void => {
      const k = store.kontekst();
      const sada = new Date();
      // sa čuvanjem: prvo šablon (izmene ili nov), pa anketa iz njega; šablon iz koga je otvoreno se inače ne menja
      const prvo: Observable<number | null> = cuvanje?.sacuvaj
        ? api.sacuvajSablon(cmdSablonaIzNacrta(nacrt, sablon, { folderId: cuvanje.folderId, precica: cuvanje.precica, boja: sledecaBoja(store.precice()) }, sada),
          sablon?.id ?? null).pipe(map(s => s.id))
        : of(nacrt.sablonId);
      radnja(prvo.pipe(concatMap(sablonId => api.pokreni(cmdPokretanja({ ...nacrt, sablonId }, k)))), a => {
        patchState(store, { sacuvanaKaoPrecica: false });
        prikazi(a);
        if (cuvanje?.sacuvaj || nacrt.sablonId !== null) {
          ucitajSablone(); // broj pokretanja, nov šablon
        }
      });
    };

    return {
      ucitajSablone,

      /** Panel se otvara: šabloni, pa otvorena anketa konteksta (ako je ima) odmah na ekranu rezultata. */
      init(kontekst: Signal<KontekstAnkete>): void {
        store._kontekst.set(kontekst);
        ucitajSablone();
        const k = kontekst();
        if (k.predavanjeId === null && k.grupaId === null) {
          return;
        }
        api.aktivne(k.predavanjeId !== null ? { predavanjeId: k.predavanjeId } : { grupaId: k.grupaId }).subscribe({
          next: lista => {
            const otvorena = [...lista].sort((a, b) => b.id - a.id).find(a => a.otvorena);
            if (otvorena && store.anketa() === null && store.desno() === null) {
              patchState(store, { sacuvanaKaoPrecica: false });
              prikazi(otvorena);
            }
          },
          error: () => undefined, // bez otvorene ankete na početku: panel radi i bez ovoga
        });
      },

      otvoriLevo(levo: LeviEkran): void {
        patchState(store, { levo, poruka: null, upit: levo.ekran === 'pocetni' ? store.upit() : '' });
        if (levo.ekran === 'istorija') {
          this.ucitajIstoriju(); // uvek sveže: anketa pokrenuta u međuvremenu je prva
        }
      },

      /** Strelica nazad: desni ekran se zatvara, a bez njega leva kolona ide na početni. */
      nazad(): void {
        if (store.desno()) {
          patchState(store, { desno: null, poruka: null });
        } else {
          patchState(store, { levo: { ekran: 'pocetni' }, poruka: null });
        }
      },

      zatvoriDesno(): void {
        patchState(store, { desno: null, poruka: null });
      },

      pretrazi(upit: string): void {
        patchState(store, { upit });
      },

      ponistiPoruku(): void {
        patchState(store, { poruka: null });
      },

      /** Dodir prečice ili šablona: odmah (`pokreniOdmah` i kontekst to nudi) ili ekran provere. */
      dodir(s: SablonAnkete): void {
        if (store.radi()) {
          return;
        }
        const m = store.mogucnosti();
        if (m.poruka) {
          patchState(store, { poruka: m.poruka });
          return;
        }
        const nacrt = nacrtIzSablona(s, m, new Date());
        if (mozeOdmah(s, m)) {
          pokreniNacrt(nacrt, s, null);
        } else {
          patchState(store, { desno: { ekran: 'provera', nacrt, sablon: s, rezim: 'pokreni', novo: NOV_PODRAZUMEVANO }, poruka: null });
        }
      },

      /** Taster 1-9: prečica redom. */
      precicaPoRedu(indeks: number): void {
        const s = store.precice()[indeks];
        if (s) {
          this.dodir(s);
        }
      },

      nova(): void {
        const m = store.mogucnosti();
        patchState(store, { desno: { ekran: 'provera', nacrt: prazanNacrt(m, new Date()), sablon: null, rezim: 'pokreni', novo: NOV_PODRAZUMEVANO }, poruka: null });
      },

      /** Izmena šablona bez pokretanja (folder, pretraga). */
      izmeniSablon(s: SablonAnkete): void {
        const nacrt = nacrtIzSablona(s, SVE_PUBLIKE, new Date(), false);
        patchState(store, {
          desno: { ekran: 'provera', nacrt, sablon: s, rezim: 'sablon', novo: { folderId: s.folderId, precica: s.precica } }, poruka: null,
        });
      },

      /** Nov šablon bez pokretanja ("+ prečica": prečica; "Nov šablon" u folderu: u tom folderu). */
      novSablon(novo: NovSablon = NOV_PODRAZUMEVANO): void {
        const nacrt = prazanNacrt(SVE_PUBLIKE, new Date());
        patchState(store, { desno: { ekran: 'provera', nacrt, sablon: null, rezim: 'sablon', novo }, poruka: null });
      },

      /** Rezultati prikazane ankete (telefon: dugme "Otvorena anketa" na početnom ekranu). */
      prikaziRezultate(): void {
        if (store.anketa()) {
          patchState(store, { desno: { ekran: 'rezultati' }, poruka: null });
        }
      },

      pokreni(nacrt: Nacrt, cuvanje: CuvanjeNacrta | null): void {
        const d = store.desno();
        pokreniNacrt(nacrt, d?.ekran === 'provera' ? d.sablon : null, cuvanje);
      },

      /** Ekran izmene šablona: cela zamena postojećeg ili nov (sa izgledom prečice iz `izgled`). */
      sacuvajSablon(cmd: SablonAnketeCmd, id: number | null): void {
        radnja(api.sacuvajSablon(cmd, id), () => {
          patchState(store, { desno: null });
          ucitajSablone();
        });
      },

      zatvoriAnketu(): void {
        const a = store.anketa();
        if (a?.otvorena) {
          radnja(api.zatvori(a.id), prikazi);
        }
      },

      prebaciRezultat(): void {
        const a = store.anketa();
        if (a) {
          radnja(api.rezultat(a.id, !a.rezultatPrikazan), prikazi);
        }
      },

      /** "★ Sačuvaj": anketa koja nije iz šablona postaje prečica. */
      sacuvajKaoPrecicu(): void {
        const a = store.anketa();
        if (!a || a.sablonId !== null) {
          return;
        }
        radnja(api.sacuvajSablon(cmdPreciceIzAnkete(a, sledecaBoja(store.precice()))), () => {
          patchState(store, { sacuvanaKaoPrecica: true });
          ucitajSablone();
        });
      },

      pokreniPonovo(): void {
        const a = store.anketa();
        if (!a) {
          return;
        }
        const s = (store.info()?.sabloni ?? []).find(x => x.id === a.sablonId) ?? null;
        patchState(store, {
          desno: { ekran: 'provera', nacrt: nacrtIzAnkete(a, store.mogucnosti(), new Date()), sablon: s, rezim: 'pokreni', novo: NOV_PODRAZUMEVANO },
          poruka: null,
        });
      },

      /** Istorija: klik otvara rezultate (`GET ankete/{id}`). */
      otvoriAnketu(id: number): void {
        radnja(api.anketa(id), a => {
          patchState(store, { sacuvanaKaoPrecica: false });
          prikazi(a);
        });
      },

      /** Istorija, "Pokreni ponovo": pitanje i odgovori iz ankete (`GET ankete/{id}`), pa provera. */
      pokreniPonovoIzIstorije(id: number): void {
        radnja(api.anketa(id), a => {
          patchState(store, { anketa: a, primljenoMs: Date.now(), sacuvanaKaoPrecica: false });
          this.pokreniPonovo();
        });
      },

      ucitajIstoriju(jos = false): void {
        if (store.istorijaUcitava()) {
          return;
        }
        const strana = jos ? store.istorijaStrana() + 1 : 0;
        patchState(store, { istorijaUcitava: true, poruka: null });
        api.istorija({}, strana, VELICINA_ISTORIJE).subscribe({
          next: s => patchState(store, {
            istorija: jos ? [...store.istorija(), ...s.content] : s.content, istorijaStrana: strana,
            istorijaIma: s.page.number + 1 < s.page.totalPages, istorijaUcitava: false,
          }),
          error: e => patchState(store, { istorijaUcitava: false, poruka: razlog(e) }),
        });
      },

      obrisiIzIstorije(id: number): void {
        radnja(api.obrisi(id), () => {
          patchState(store, { istorija: store.istorija().filter(x => x.id !== id) });
          if (store.anketa()?.id === id) {
            patchState(store, { anketa: null, desno: null });
          }
        });
      },

      /** Izmena jedne prečice (izgled, pokreni odmah, publika, trajanje): cela zamena šablona. */
      izmeniPrecicu(s: SablonAnkete, izmene: Partial<SablonAnketeCmd>): void {
        radnja(api.sacuvajSablon(cmdIzSablona(s, izmene), s.id), novi =>
          patchState(store, { info: zameniSablon(store.info(), novi) }));
      },

      /** Redosled prečica (prevlačenje, strelice), dodavanje i uklanjanje: server vraća sve šablone. */
      poredjajPrecice(ids: number[]): void {
        radnja(api.poredjajPrecice(ids), info => patchState(store, { info }));
      },

      dodajNaPrecice(s: SablonAnkete): void {
        this.poredjajPrecice([...store.precice().map(p => p.id), s.id]);
      },

      ukloniSaPrecica(s: SablonAnkete): void {
        this.poredjajPrecice(store.precice().map(p => p.id).filter(id => id !== s.id));
      },

      premestiSablon(s: SablonAnkete, folderId: number | null): void {
        this.izmeniPrecicu(s, { folderId });
      },

      obrisiSablon(s: SablonAnkete): void {
        radnja(api.obrisiSablon(s.id), () => ucitajSablone());
      },

      noviFolder(naziv: string): void {
        radnja(api.noviFolder(naziv.trim()), () => ucitajSablone());
      },

      preimenujFolder(id: number, naziv: string): void {
        radnja(api.preimenujFolder(id, naziv.trim()), () => ucitajSablone());
      },

      obrisiFolder(id: number): void {
        radnja(api.obrisiFolder(id), () => {
          patchState(store, { levo: { ekran: 'pocetni' } });
          ucitajSablone();
        });
      },

      /** Jedan krug osvežavanja prikazane otvorene ankete (tajmer panela; skrivena stranica ne pita). */
      osveziAnketu(): void {
        const a = store.anketa();
        const v = store._veze;
        if (!a?.otvorena || store._dokument.visibilityState === 'hidden' || (v.osvezavanje && !v.osvezavanje.closed)) {
          return;
        }
        v.osvezavanje = api.anketa(a.id).subscribe({
          next: novo => {
            if (store.anketa()?.id === novo.id) {
              patchState(store, { anketa: novo, primljenoMs: Date.now() });
            }
          },
          error: () => undefined, // mreža: sledeći krug za 2 s, prikaz ostaje
        });
      },
    };
  }),
  withHooks({
    onInit(store) {
      store._veze.tajmer = setInterval(() => store.osveziAnketu(), OSVEZAVANJE_ANKETE_MS);
    },
    onDestroy(store) {
      if (store._veze.tajmer !== null) {
        clearInterval(store._veze.tajmer);
      }
      store._veze.osvezavanje?.unsubscribe();
    },
  }),
);

function zameniSablon(info: AnketeSabloniInfo | null, s: SablonAnkete): AnketeSabloniInfo | null {
  return info ? { ...info, sabloni: info.sabloni.map(x => (x.id === s.id ? s : x)) } : info;
}

