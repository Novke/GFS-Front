import { inject } from '@angular/core';
import { signalStore } from '@ngrx/signals';

import { StudentiApi, StudentListItem } from '../../../core/api/studenti.api';
import { ListQuery } from '../../../shared/store/list-params';
import { withListQuery } from '../../../shared/store/list-query.feature';
import { pretragaZaUpit, STUDENTI_SORT_POLJA, StudentiFilteri } from './studenti.models';

/** Podrazumevano: svi studenti, po prezimenu pa imenu (sort servera), 25 po strani. */
export function podrazumevanaListaStudenata(): ListQuery<StudentiFilteri> {
  return { filteri: { grupa: null, q: null, stariji: null }, sort: 'prezime,asc', strana: 1, velicina: 25 };
}

export interface OpcijeListeStudenata {
  /** Ključ zapamćenih filtera (PreferencesStore); hubovi koriste svoj, da ne pregaze filtere glavne liste. */
  kljuc?: string;
  /** Filteri određeni rutom (hub grupe zaključava `grupa`); vidi `withListQuery`. */
  zakljucano?: () => Partial<StudentiFilteri>;
}

/** Lista studenata (`studenti/pretraga`) sa filterima, sortom i stranama u URL-u. */
export function withListaStudenata(opcije: OpcijeListeStudenata = {}) {
  return withListQuery<StudentListItem, StudentiFilteri>({
    kljuc: opcije.kljuc ?? 'studenti',
    filteri: { grupa: { tip: 'broj' }, q: { tip: 'tekst' }, stariji: { tip: 'broj' } },
    podrazumevano: podrazumevanaListaStudenata(),
    sortPolja: STUDENTI_SORT_POLJA,
    // greška učitavanja se prikazuje u panelu liste, ne i kao snackbar
    loader: () => {
      const api = inject(StudentiApi);
      return q => api.pretraga(pretragaZaUpit(q), { tiho: true });
    },
    zakljucano: opcije.zakljucano,
  });
}

export const StudentiListaStore = signalStore(withListaStudenata());
export type StudentiListaStore = InstanceType<typeof StudentiListaStore>;
