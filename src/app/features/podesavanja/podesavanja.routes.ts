import { Route } from '@angular/router';

import { mrvica as m } from '../../core/layout/mrvica';

/*
 * Rute podešavanja (deca rute `podesavanja` u ljusci, lenje kroz `loadChildren`: početni paket nosi samo jednu liniju).
 * Ljuska ima `nastavnikGuard`, pa je sve ovde iza sesije nastavnika; ništa javno. Moodle (spec prijave 8.1) i obaveštenja
 * na telefonu (spec „Aplikacija i obaveštenja“ 6.6).
 */
export const PODESAVANJA_RUTE: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'moodle' },
  {
    path: 'moodle',
    title: 'Moodle',
    data: { mrvice: () => [m('Podešavanja'), m('Moodle')] },
    loadComponent: () => import('./pages/moodle-registracije.page').then(x => x.MoodleRegistracijePage),
  },
  {
    path: 'obavestenja',
    title: 'Obaveštenja na telefonu',
    data: { mrvice: () => [m('Podešavanja'), m('Obaveštenja na telefonu')] },
    loadComponent: () => import('./pages/obavestenja-telefona.page').then(x => x.ObavestenjaTelefonaPage),
  },
];
