import { inject } from '@angular/core';
import { signalStore } from '@ngrx/signals';

import { ListQuery } from '../../../shared/store/list-params';
import { withListQuery } from '../../../shared/store/list-query.feature';
import { tekucaSkolskaGodina } from '../../../shared/util/skolska-godina';
import { TestoviApi } from './testovi.api';
import { TESTOVI_SORT_POLJA, TestListItem, TestoviFilteri } from './testovi.models';

/** Podrazumevano: tekuća školska godina, najnoviji testovi prvo (kao backend). */
export function podrazumevanaListaTestova(): ListQuery<TestoviFilteri> {
  return {
    filteri: { predmet: null, grupa: null, godina: tekucaSkolskaGodina(), status: null, tip: null, od: null, do: null },
    sort: 'datum,desc',
    strana: 1,
    velicina: 25,
  };
}

export interface OpcijeListeTestova {
  /** Ključ zapamćenih filtera (PreferencesStore); hubovi koriste svoj. */
  kljuc?: string;
  /** Filteri određeni rutom (hub predmeta ili grupe); vidi `withListQuery`. */
  zakljucano?: () => Partial<TestoviFilteri>;
}

/**
 * Lista testova (`test/pretraga`) sa filterima, sortom i stranama u URL-u. Hubovi grupe i predmeta (Task 22, 24) je
 * koriste sa zaključanim filterom: `signalStore(withListaTestova({ kljuc: 'testovi-predmet', zakljucano: ... }))`.
 */
export function withListaTestova(opcije: OpcijeListeTestova = {}) {
  return withListQuery<TestListItem, TestoviFilteri>({
    kljuc: opcije.kljuc ?? 'testovi',
    filteri: {
      predmet: { tip: 'broj' },
      grupa: { tip: 'broj' },
      godina: { tip: 'broj' },
      status: { tip: 'tekst' },
      tip: { tip: 'broj' },
      od: { tip: 'datum' },
      do: { tip: 'datum' },
    },
    podrazumevano: podrazumevanaListaTestova(),
    sortPolja: TESTOVI_SORT_POLJA,
    // greška učitavanja se prikazuje u panelu liste, ne i kao snackbar
    loader: () => {
      const api = inject(TestoviApi);
      return q => api.pretraga(q, { tiho: true });
    },
    zakljucano: opcije.zakljucano,
  });
}

export const TestoviListaStore = signalStore(withListaTestova());
export type TestoviListaStore = InstanceType<typeof TestoviListaStore>;
