import { Route } from '@angular/router';

import { mrvica as m } from '../../core/layout/mrvica';
import { putanjaSaId } from '../../core/route-matchers';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

/*
 * Raspored časova i termini (deca rute `raspored` u ljusci, lenje kroz `loadChildren`; spec najave odsustva, odeljak 7).
 * Ljuska ima `nastavnikGuard`, pa je sve ovde iza sesije nastavnika; ništa javno. Id u putanji mora biti broj.
 * `novi?kopija=<id>` je „Kopiraj u novi“; `termini?od=<datum>` je veza iz obaveštenja „Mnogo najava odsustva“.
 */
export const RASPORED_RUTE: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Raspored časova',
    loadComponent: () => import('./pages/rasporedi.page').then(x => x.RasporediPage),
  },
  {
    path: 'termini',
    title: 'Naredni termini',
    data: { mrvice: () => [m('Raspored časova', '/raspored'), m('Naredni termini')] },
    loadComponent: () => import('./pages/termini.page').then(x => x.TerminiPage),
  },
  {
    path: 'novi',
    title: 'Nov raspored',
    data: { mrvice: () => [m('Raspored časova', '/raspored'), m('Nov raspored')] },
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./pages/raspored-forma.page').then(x => x.RasporedFormaPage),
  },
  {
    matcher: putanjaSaId(':id'),
    title: 'Raspored',
    data: { mrvice: () => [m('Raspored časova', '/raspored'), m('Izmena')] },
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./pages/raspored-forma.page').then(x => x.RasporedFormaPage),
  },
];
