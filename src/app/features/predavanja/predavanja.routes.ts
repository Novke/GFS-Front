import { Route } from '@angular/router';

import { Mrvica } from '../../core/layout/breadcrumbs';

const m = (label: string, url?: string): Mrvica => (url ? { label, url } : { label });

/**
 * Rute predavanja koje su već na novim ekranima (deca rute `predavanja` u `app.routes.ts`): lista i "Novo".
 * Detalj `:id` je u `app.routes.ts`, posle ovih ruta: `novo` je ispred `:id` matchera, pa `/predavanja/novo` nikad ne ide na detalj.
 */
export const PREDAVANJA_RUTE: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/predavanja-lista').then(x => x.PredavanjaLista),
  },
  {
    path: 'novo',
    title: 'Novo predavanje',
    data: { mrvice: () => [m('Predavanja', '/predavanja'), m('Novo predavanje')] },
    loadComponent: () => import('./pages/novo-predavanje').then(x => x.NovoPredavanje),
  },
];
