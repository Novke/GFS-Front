import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { Subscription } from 'rxjs';

import { razlogServera } from './nalog.pravila';
import { TestoviStudentaApi } from './testovi-studenta.api';
import {
  PolaganjeStudenta, PORUKA_DRUGI_UREDJAJ, PORUKA_ISTEKLO, PORUKA_PREDAT, PORUKA_ZASTARELA, UnetoPolja, ZadatakTesta,
} from './testovi-studenta.models';
import { istiUnos, kljucKopije, odlaganjePonovo, pomakSata, praznihPolja, ZADRZAVANJE_CUVANJA_MS } from './testovi-studenta.pravila';

export type StatusCuvanja = 'cisto' | 'ceka' | 'cuva' | 'greska';

/** Lokalno stanje jednog zadatka: šta je student uneo (uvek poslednje), `rev` servera i stanje čuvanja. */
export interface StanjeZadatka {
  uneto: Record<string, UnetoPolja>;
  rev: number;
  sacuvano: string | null;
  status: StatusCuvanja;
  /** Tekst ispod zadatka kad čuvanje ne uspe (vrednosti ostaju i šalju se ponovo). */
  poruka: string | null;
}

export const PORUKA_NIJE_SACUVANO = 'Nije sačuvano. Proveri internet; pokušavam ponovo.';
export const PORUKA_PREDAJA_CEKA = 'Neki odgovori još nisu sačuvani. Sačekaj da se sačuvaju, pa predaj ponovo.';

/** Najviše tri uzastopna 409 `Zastarela izmena.` za jedan zadatak, pa greška (dva uređaja se otimaju). */
const MAKS_ZASTARELIH = 3;

interface Stanje {
  testId: number | null;
  polaganje: PolaganjeStudenta | null;
  zadaci: Record<number, StanjeZadatka>;
  /** `serverVremeMs - Date.now()` iz poslednjeg odgovora. */
  pomak: number;
  ucitava: boolean;
  /** Greška učitavanja ili ulaza (ekran je prikazuje u baneru). */
  greska: string | null;
  /** 409 `Test je otvoren na drugom uređaju.`: ekran nudi „Nastavi ovde“. */
  zakljucano: boolean;
  /** 401: sesija je istekla, strana vodi na prijavu sa `nazad`. */
  odjavljen: boolean;
  predaje: boolean;
}

const POCETNO: Stanje = {
  testId: null, polaganje: null, zadaci: {}, pomak: 0, ucitava: false, greska: null, zakljucano: false, odjavljen: false, predaje: false,
};

interface Interno {
  tajmeri: Map<number, ReturnType<typeof setTimeout>>;
  uLetu: Set<number>;
  pokusaji: Map<number, number>;
  zastarelih: Map<number, number>;
  pretplate: Subscription[];
  cekaPraznjenje: (() => void)[];
}

function kopija(testId: number, zadatakId: number): Record<string, UnetoPolja> | null {
  try {
    const s = sessionStorage.getItem(kljucKopije(testId, zadatakId));
    const v = s ? (JSON.parse(s) as unknown) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, UnetoPolja>) : null;
  } catch {
    return null;
  }
}

function sacuvajKopiju(testId: number, zadatakId: number, uneto: Record<string, UnetoPolja>): void {
  try {
    sessionStorage.setItem(kljucKopije(testId, zadatakId), JSON.stringify(uneto));
  } catch {
    // pun ili zabranjen storage: vrednosti ostaju u memoriji
  }
}

function obrisiKopiju(testId: number, zadatakId: number): void {
  try {
    sessionStorage.removeItem(kljucKopije(testId, zadatakId));
  } catch {
    // isto
  }
}

const statusGreske = (e: unknown) => (e instanceof HttpErrorResponse ? e.status : -1);

/**
 * Polaganje online testa na nalogu studenta (`nalog/test/:id`, plan 6). Pruža ga strana (živi dok je strana otvorena).
 *
 * Ništa uneto se ne gubi: svaka izmena odmah ide u `sessionStorage` (`gfs-test-<testId>-<zadatakId>`) i u memoriju, a čuva se
 * posle {@link ZADRZAVANJE_CUVANJA_MS} jednim `PUT` po zadatku (najviše jedan zahtev u letu po zadatku; šalje se poslednje
 * uneto, ne ono iz trenutka kucanja). Mreža, 429 i 5xx: poruka i ponovni pokušaj (2, 4, 8, 15 s), vrednosti ostaju. 409
 * `Zastarela izmena.`: pročitaj stanje (`GET`), uzmi `rev` servera i pošalji svoje vrednosti ponovo. 409 drugi uređaj:
 * zaključano („Nastavi ovde“). 409 isteklo/predat: ponovo učitaj stanje. Posle ponovnog učitavanja strane kopija iz
 * `sessionStorage` koja se razlikuje od servera ima prednost (to je ono što je student poslednje kucao) i odmah se šalje.
 */
export const PolaganjeStore = signalStore(
  withState<Stanje>(POCETNO),
  withProps(() => ({
    _api: inject(TestoviStudentaApi),
    _i: {
      tajmeri: new Map(), uLetu: new Set(), pokusaji: new Map(), zastarelih: new Map(), pretplate: [], cekaPraznjenje: [],
    } as Interno,
  })),
  withComputed(store => ({
    faza: computed(() => store.polaganje()?.faza ?? null),
    zadaciTesta: computed<ZadatakTesta[]>(() => store.polaganje()?.zadaci ?? []),
    /** Bar jedan zadatak čeka ili se čuva. */
    cuvaSe: computed(() => Object.values(store.zadaci()).some(z => z.status === 'ceka' || z.status === 'cuva')),
    /** Bar jedan zadatak nije sačuvan zbog greške. */
    imaGresku: computed(() => Object.values(store.zadaci()).some(z => z.status === 'greska')),
    prazno: computed(() => praznihPolja(store.polaganje()?.zadaci ?? [], id => store.zadaci()[id]?.uneto ?? null)),
  })),
  withMethods(store => {
    const i = store._i;

    const zadatak = (id: number) => store.zadaci()[id];
    const postavi = (id: number, z: Partial<StanjeZadatka>) =>
      patchState(store, { zadaci: { ...store.zadaci(), [id]: { ...store.zadaci()[id], ...z } } });

    const javiPraznjenje = () => {
      const z = Object.values(store.zadaci());
      if (!z.some(x => x.status === 'ceka' || x.status === 'cuva') || z.some(x => x.status === 'greska')) {
        const cekaju = i.cekaPraznjenje.splice(0);
        cekaju.forEach(f => f());
      }
    };

    const otkaziTajmer = (id: number) => {
      const t = i.tajmeri.get(id);
      if (t !== undefined) {
        clearTimeout(t);
        i.tajmeri.delete(id);
      }
    };

    const zakazi = (id: number, ms: number) => {
      otkaziTajmer(id);
      i.tajmeri.set(id, setTimeout(() => {
        i.tajmeri.delete(id);
        posalji(id);
      }, ms));
    };

    /** Novo stanje sa servera: zadaci koji nisu u letu ni neposlati preuzimaju vrednosti servera. */
    const primi = (p: PolaganjeStudenta) => {
      const testId = p.testId;
      const zadaci: Record<number, StanjeZadatka> = {};
      const zaSlanje: number[] = [];
      for (const z of p.zadaci ?? []) {
        const lok = store.zadaci()[z.zadatakId];
        const server = z.uneto ?? {};
        if (lok && lok.status !== 'cisto') {
          // lokalno neposlato ili u letu: zadrži uneto, samo novi rev
          zadaci[z.zadatakId] = { ...lok, rev: Math.max(lok.rev, z.rev), sacuvano: z.sacuvano ?? lok.sacuvano };
          continue;
        }
        const kop = p.faza === 'U_TOKU' ? kopija(testId, z.zadatakId) : null;
        if (kop && !istiUnos(kop, server)) {
          zadaci[z.zadatakId] = { uneto: kop, rev: z.rev, sacuvano: z.sacuvano, status: 'ceka', poruka: null };
          zaSlanje.push(z.zadatakId);
        } else {
          if (kop) obrisiKopiju(testId, z.zadatakId);
          zadaci[z.zadatakId] = { uneto: server, rev: z.rev, sacuvano: z.sacuvano, status: 'cisto', poruka: null };
        }
      }
      if (p.faza === 'PREDATO' || p.faza === 'ZAVRSEN') {
        for (const z of p.zadaci ?? []) obrisiKopiju(testId, z.zadatakId);
        for (const id of Object.keys(zadaci).map(Number)) {
          otkaziTajmer(id);
          zadaci[id] = { ...zadaci[id], status: zadaci[id].status === 'cisto' ? 'cisto' : 'greska' };
        }
      }
      patchState(store, { testId, polaganje: p, zadaci, pomak: pomakSata(p.serverVremeMs, Date.now()), zakljucano: false });
      zaSlanje.forEach(id => zakazi(id, 0));
      javiPraznjenje();
    };

    const ucitajTiho = (posle?: () => void) => {
      const testId = store.testId();
      if (testId === null) return;
      i.pretplate.push(store._api.polaganje(testId).subscribe({
        next: p => {
          primi(p);
          posle?.();
        },
        error: (e: unknown) => {
          if (statusGreske(e) === 401) patchState(store, { odjavljen: true });
          posle?.();
        },
      }));
    };

    const posalji = (id: number): void => {
      const testId = store.testId();
      const z = zadatak(id);
      if (testId === null || !z || z.status === 'cisto' || store.faza() !== 'U_TOKU' || store.zakljucano()) {
        javiPraznjenje();
        return;
      }
      if (i.uLetu.has(id)) {
        return; // kad se vrati odgovor, poslaće se poslednje uneto
      }
      const poslato = z.uneto;
      i.uLetu.add(id);
      postavi(id, { status: 'cuva' });
      i.pretplate.push(store._api.sacuvaj(testId, id, { rev: z.rev, uneto: poslato }).subscribe({
        next: o => {
          i.uLetu.delete(id);
          i.pokusaji.delete(id);
          i.zastarelih.delete(id);
          const sada = zadatak(id);
          const isto = istiUnos(sada.uneto, poslato);
          postavi(id, { rev: o.rev, sacuvano: o.sacuvano, status: isto ? 'cisto' : 'ceka', poruka: null });
          if (isto) {
            obrisiKopiju(testId, id);
          } else if (!i.tajmeri.has(id)) {
            zakazi(id, 0);
          }
          javiPraznjenje();
        },
        error: (e: unknown) => {
          i.uLetu.delete(id);
          greskaCuvanja(id, e);
        },
      }));
    };

    const greskaCuvanja = (id: number, e: unknown) => {
      const s = statusGreske(e);
      const razlog = razlogServera(e);
      if (s === 409 && razlog === PORUKA_ZASTARELA) {
        const n = (i.zastarelih.get(id) ?? 0) + 1;
        i.zastarelih.set(id, n);
        if (n > MAKS_ZASTARELIH) {
          postavi(id, { status: 'greska', poruka: PORUKA_NIJE_SACUVANO });
          zakazi(id, odlaganjePonovo(n));
          javiPraznjenje();
          return;
        }
        // pročitaj stanje (novi rev) i pošalji svoje vrednosti ponovo
        postavi(id, { status: 'ceka' });
        ucitajTiho(() => posalji(id));
        return;
      }
      if (s === 409 && razlog === PORUKA_DRUGI_UREDJAJ) {
        patchState(store, { zakljucano: true });
        postavi(id, { status: 'greska', poruka: PORUKA_DRUGI_UREDJAJ });
        javiPraznjenje();
        return;
      }
      if (s === 409 && (razlog === PORUKA_ISTEKLO || razlog === PORUKA_PREDAT)) {
        postavi(id, { status: 'greska', poruka: razlog });
        ucitajTiho();
        javiPraznjenje();
        return;
      }
      if (s === 401) {
        postavi(id, { status: 'greska', poruka: PORUKA_NIJE_SACUVANO });
        patchState(store, { odjavljen: true });
        javiPraznjenje();
        return;
      }
      if (s === 400 || s === 404 || s === 413) {
        postavi(id, { status: 'greska', poruka: razlog ?? 'Odgovor nije prihvaćen.' });
        javiPraznjenje();
        return;
      }
      // mreža (0), 429, 5xx, ostalo: ponovo, vrednosti ostaju u memoriji i u sessionStorage
      const n = (i.pokusaji.get(id) ?? 0) + 1;
      i.pokusaji.set(id, n);
      postavi(id, { status: 'greska', poruka: PORUKA_NIJE_SACUVANO });
      zakazi(id, odlaganjePonovo(n));
      javiPraznjenje();
    };

    return {
      primi,

      ucitaj(testId: number): void {
        patchState(store, { testId, ucitava: true, greska: null });
        i.pretplate.push(store._api.polaganje(testId).subscribe({
          next: p => {
            primi(p);
            patchState(store, { ucitava: false });
          },
          error: (e: unknown) => {
            patchState(store, { ucitava: false, greska: razlogServera(e) ?? 'Test nije učitan.', odjavljen: statusGreske(e) === 401 });
          },
        }));
      },

      /** Poruka u baneru strane (ulaz, predaja). */
      postaviGresku(poruka: string | null): void {
        patchState(store, { greska: poruka });
      },

      /** Ponovno čitanje bez prekidanja (čekaonica na 5 s, posle isteka roka). */
      osvezi(): void {
        ucitajTiho();
      },

      /** Ulaz (i „Nastavi ovde“ sa `preuzmi`); vraća poruku greške ili `null`. */
      udji(kod: string | null, preuzmi: boolean): Promise<string | null> {
        const testId = store.testId();
        if (testId === null) return Promise.resolve('Test nije učitan.');
        return new Promise(resolve => {
          i.pretplate.push(store._api.udji(testId, { kod, preuzmi }).subscribe({
            next: p => {
              primi(p);
              patchState(store, { greska: null });
              // posle preuzimanja pošalji sve što je ovde ostalo neposlato
              Object.entries(store.zadaci()).filter(([, z]) => z.status !== 'cisto').forEach(([id]) => zakazi(Number(id), 0));
              resolve(null);
            },
            error: (e: unknown) => {
              if (statusGreske(e) === 409 && razlogServera(e) === PORUKA_DRUGI_UREDJAJ) patchState(store, { zakljucano: true });
              if (statusGreske(e) === 401) patchState(store, { odjavljen: true });
              resolve(razlogServera(e) ?? 'Ulaz nije uspeo. Pokušaj ponovo.');
            },
          }));
        });
      },

      /** Izmena polja: odmah u memoriju i `sessionStorage`, čuvanje posle zadržavanja. */
      unesi(zadatakId: number, kljuc: string, vrednost: UnetoPolja | null): void {
        const testId = store.testId();
        const z = zadatak(zadatakId);
        if (testId === null || !z || store.faza() !== 'U_TOKU') return;
        const uneto = { ...z.uneto };
        if (vrednost === null || vrednost === '' || (Array.isArray(vrednost) && vrednost.length === 0)) {
          delete uneto[kljuc];
        } else {
          uneto[kljuc] = vrednost;
        }
        sacuvajKopiju(testId, zadatakId, uneto);
        postavi(zadatakId, { uneto, status: z.status === 'cuva' ? 'cuva' : 'ceka' });
        if (!i.uLetu.has(zadatakId)) {
          zakazi(zadatakId, ZADRZAVANJE_CUVANJA_MS);
        }
      },

      /** Sačuvaj odmah sve što čeka (pre „Predaj“, pri napuštanju strane). Razrešava se kad nema ničeg u letu ili posle greške. */
      sacuvajSve(): Promise<void> {
        for (const [id, z] of Object.entries(store.zadaci())) {
          if (z.status === 'ceka' || z.status === 'greska') {
            otkaziTajmer(Number(id));
            posalji(Number(id));
          }
        }
        return new Promise(resolve => {
          i.cekaPraznjenje.push(resolve);
          javiPraznjenje();
        });
      },

      /** „Predaj“ (posle potvrde na strani): prvo sve sačuva; odbija dok bilo šta nije sačuvano. Vraća poruku greške ili `null`. */
      async predaj(): Promise<string | null> {
        const testId = store.testId();
        if (testId === null || store.predaje()) return null;
        patchState(store, { predaje: true });
        await this.sacuvajSve();
        if (Object.values(store.zadaci()).some(z => z.status !== 'cisto')) {
          patchState(store, { predaje: false });
          return PORUKA_PREDAJA_CEKA;
        }
        return new Promise(resolve => {
          i.pretplate.push(store._api.predaj(testId).subscribe({
            next: p => {
              primi(p);
              patchState(store, { predaje: false });
              resolve(null);
            },
            error: (e: unknown) => {
              patchState(store, { predaje: false, odjavljen: statusGreske(e) === 401 });
              if (statusGreske(e) === 409) ucitajTiho();
              resolve(razlogServera(e) ?? 'Predaja nije uspela. Proveri internet i pokušaj ponovo.');
            },
          }));
        });
      },

      /** Meki znak (napustio/vratio se); greška se ne prikazuje. */
      dogadjaj(vrsta: 'NAPUSTIO' | 'VRATIO', trajanjeMs: number | null): void {
        const testId = store.testId();
        if (testId === null || store.faza() !== 'U_TOKU') return;
        store._api.dogadjaj(testId, { vrsta, trajanjeMs }).subscribe({ error: () => undefined });
      },
    };
  }),
  withHooks({
    onDestroy(store) {
      store._i.tajmeri.forEach(t => clearTimeout(t));
      store._i.tajmeri.clear();
      store._i.pretplate.forEach(s => s.unsubscribe());
      store._i.cekaPraznjenje.splice(0).forEach(f => f());
    },
  }),
);
