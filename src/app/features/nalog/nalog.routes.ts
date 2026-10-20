import { Route } from '@angular/router';

/**
 * Deca rute `nalog` (u `PublicLayout`-u, `app.routes.ts`; student na telefonu, bez sesije nastavnika). Stranica je lenja,
 * pa početni bundle nosi samo ovaj niz. Javni 404 za pogrešan link pod `/nalog` dodaje `app.routes.ts` (`NotFound` je u
 * `core/layout`, van allow-liste javnog feature-a).
 */
export const NALOG_RUTE: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Nalog',
    loadComponent: () => import('./pages/nalog.page').then(x => x.NalogPage),
  },
  {
    // posle ulaska iz Moodle-a (backend preusmerava): uparivanje, `?uloga=nastavnik`, `?greska=<kod>` (spec prijave 8.3)
    path: 'moodle',
    title: 'Moodle',
    loadComponent: () => import('./pages/moodle.page').then(x => x.MoodlePage),
  },
];
