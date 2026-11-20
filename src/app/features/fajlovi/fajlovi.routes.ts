import { Route } from '@angular/router';

/**
 * Deca rute `f` (u `PublicLayout`-u, `app.routes.ts`; računar u učionici, bez sesije nastavnika). Niz je lenj
 * (`loadChildren`), pa početni bundle nosi samo ulaz. Javni 404 za pogrešan link pod `/f` dodaje `app.routes.ts`
 * (`NotFound` je u `core/layout`, van allow-liste javnog feature-a). Kod sa table (4 cifre) je u putanji (`/f/1234`) ili se
 * ukuca na `/f`; stranica sama proverava da li je kod 4 cifre (bez cifara se ni ne zove API).
 */
export const FAJLOVI_RUTE: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Fajlovi sa časa',
    loadComponent: () => import('./pages/fajlovi-casa').then(x => x.FajloviCasaPage),
  },
  {
    path: ':kod',
    title: 'Fajlovi sa časa',
    loadComponent: () => import('./pages/fajlovi-casa').then(x => x.FajloviCasaPage),
  },
];
