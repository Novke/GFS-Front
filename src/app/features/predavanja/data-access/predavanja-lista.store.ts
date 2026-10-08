import { inject } from '@angular/core';
import { signalStore } from '@ngrx/signals';

import { ListQuery } from '../../../shared/store/list-params';
import { withListQuery } from '../../../shared/store/list-query.feature';
import { tekucaSkolskaGodina } from '../../../shared/util/skolska-godina';
import { PredavanjaApi } from './predavanja.api';
import { PREDAVANJA_SORT_POLJA, PredavanjaFilteri, PredavanjeListItem } from './predavanja.models';

/** Podrazumevano: tekuća školska godina, najnovija predavanja prvo (kao backend). */
export function podrazumevanaListaPredavanja(): ListQuery<PredavanjaFilteri> {
  return {
    filteri: { predmet: null, grupa: null, godina: tekucaSkolskaGodina(), status: null, q: null, od: null, do: null },
    sort: 'datum,desc',
    strana: 1,
    velicina: 25,
  };
}

export interface OpcijeListePredavanja {
  /** Ključ zapamćenih filtera (PreferencesStore); hubovi koriste svoj, da ne pregaze filtere glavne liste. */
  kljuc?: string;
  /** Filteri određeni rutom (hub predmeta ili grupe); vidi `withListQuery`. */
  zakljucano?: () => Partial<PredavanjaFilteri>;
}

/**
 * Lista predavanja (`predavanja/pretraga`) sa filterima, sortom i stranama u URL-u. Isti feature koriste glavna lista
 * i hubovi grupe i predmeta (Task 22, 24) sa zaključanim filterom:
 * `signalStore(withListaPredavanja({ kljuc: 'predavanja-grupa', zakljucano: () => ({ grupa: ... }) }))`.
 */
export function withListaPredavanja(opcije: OpcijeListePredavanja = {}) {
  return withListQuery<PredavanjeListItem, PredavanjaFilteri>({
    kljuc: opcije.kljuc ?? 'predavanja',
    filteri: {
      predmet: { tip: 'broj' },
      grupa: { tip: 'broj' },
      godina: { tip: 'broj' },
      status: { tip: 'tekst' },
      q: { tip: 'tekst' },
      od: { tip: 'datum' },
      do: { tip: 'datum' },
    },
    podrazumevano: podrazumevanaListaPredavanja(),
    sortPolja: PREDAVANJA_SORT_POLJA,
    // greška učitavanja se prikazuje u panelu liste, ne i kao snackbar
    loader: () => {
      const api = inject(PredavanjaApi);
      return q => api.pretraga(q, { tiho: true });
    },
    zakljucano: opcije.zakljucano,
  });
}

export const PredavanjaListaStore = signalStore(withListaPredavanja());
export type PredavanjaListaStore = InstanceType<typeof PredavanjaListaStore>;
