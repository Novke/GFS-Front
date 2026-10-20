import { Route } from '@angular/router';

import { mrvica as m } from '../../core/layout/mrvica';

/*
 * Rute podešavanja (deca rute `podesavanja` u ljusci, lenje kroz `loadChildren`: početni paket nosi samo jednu liniju).
 * Ljuska ima `nastavnikGuard`, pa je sve ovde iza sesije nastavnika; ništa javno. Za sada samo Moodle (spec prijave 8.1).
 */
export const PODESAVANJA_RUTE: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'moodle' },
  {
    path: 'moodle',
    title: 'Moodle',
    data: { mrvice: () => [m('Podešavanja'), m('Moodle')] },
    loadComponent: () => import('./pages/moodle-registracije.page').then(x => x.MoodleRegistracijePage),
  },
];
