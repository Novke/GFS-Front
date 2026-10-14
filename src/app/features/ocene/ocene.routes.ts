import { Route } from '@angular/router';

/** `/ocene?predmet&grupa` (deca rute `ocene` u `app.routes.ts`, koja daje naslov i mrvice "Nastava > Ocene"). */
export const OCENE_RUTE: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/ocene').then(x => x.Ocene),
  },
];
