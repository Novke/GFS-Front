import { inject } from '@angular/core';
import { signalStore } from '@ngrx/signals';

import { ListQuery } from '../../../shared/store/list-params';
import { withListQuery } from '../../../shared/store/list-query.feature';
import { tekucaSkolskaGodina } from '../../../shared/util/skolska-godina';
import { DomaciApi } from './domaci.api';
import { DOMACI_SORT_POLJA, DomaciFilteri, DomaciListItem } from './domaci.models';

/** Podrazumevano: tekuća školska godina, najnoviji domaći prvo (kao backend). */
export function podrazumevanaListaDomacih(): ListQuery<DomaciFilteri> {
  return {
    filteri: { predmet: null, grupa: null, godina: tekucaSkolskaGodina(), status: null, q: null, od: null, do: null },
    sort: 'datum,desc',
    strana: 1,
    velicina: 25,
  };
}

export interface OpcijeListeDomacih {
  /** Ključ zapamćenih filtera (PreferencesStore); hubovi koriste svoj, da ne pregaze filtere glavne liste. */
  kljuc?: string;
  /** Filteri određeni rutom (hub predmeta ili grupe); vidi `withListQuery`. */
  zakljucano?: () => Partial<DomaciFilteri>;
}

/**
 * Lista domaćih (`domaci/pretraga`) sa filterima, sortom i stranama u URL-u. Isti feature koriste glavna lista i
 * hubovi grupe i predmeta (Task 22, 24) sa zaključanim filterom, kao `withListaPredavanja`.
 */
export function withListaDomacih(opcije: OpcijeListeDomacih = {}) {
  return withListQuery<DomaciListItem, DomaciFilteri>({
    kljuc: opcije.kljuc ?? 'domaci',
    filteri: {
      predmet: { tip: 'broj' },
      grupa: { tip: 'broj' },
      godina: { tip: 'broj' },
      status: { tip: 'tekst' },
      q: { tip: 'tekst' },
      od: { tip: 'datum' },
      do: { tip: 'datum' },
    },
    podrazumevano: podrazumevanaListaDomacih(),
    sortPolja: DOMACI_SORT_POLJA,
    // greška učitavanja se prikazuje u panelu liste, ne i kao snackbar
    loader: () => {
      const api = inject(DomaciApi);
      return q => api.pretraga(q, { tiho: true });
    },
    zakljucano: opcije.zakljucano,
  });
}

export const DomaciListaStore = signalStore(withListaDomacih());
export type DomaciListaStore = InstanceType<typeof DomaciListaStore>;
