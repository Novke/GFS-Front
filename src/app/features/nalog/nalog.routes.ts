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
    // QR za čekiranje sa table ili projektora (studentski portal, faza 1): token se odmah briše iz adrese
    path: 'cas/:token',
    title: 'Čas',
    loadComponent: () => import('./pages/cas.page').then(x => x.CasPage),
  },
  {
    // praćenje časa: posle prijave (ključ čekanja), sa kartice "Na času si" i posle kraja Uživo izvođenja (`?sa=cas`)
    path: 'cas',
    title: 'Čas',
    loadComponent: () => import('./pages/cas.page').then(x => x.CasPage),
  },
  {
    // posle ulaska iz Moodle-a (backend preusmerava): uparivanje, `?uloga=nastavnik`, `?greska=<kod>` (spec prijave 8.3)
    path: 'moodle',
    title: 'Moodle',
    loadComponent: () => import('./pages/moodle.page').then(x => x.MoodlePage),
  },
];
