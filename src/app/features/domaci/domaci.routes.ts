import { Route } from '@angular/router';

import { Mrvica } from '../../core/layout/breadcrumbs';
import { putanjaSaId } from '../../core/route-matchers';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

const m = (label: string, url?: string): Mrvica => (url ? { label, url } : { label });

/**
 * Rute domaćih (deca rute `domaci` u `app.routes.ts`, koja daje naslov i mrvice "Nastava > Domaći"): lista, "Nov domaći"
 * i detalj. `novo` je ispred `:id` matchera, pa `/domaci/novo` nikad ne ide na detalj; detalj prima samo numerički id.
 * Stari pregled (`?prikaz=pregled`, `domaci/:id/pregled`) je isti ekran: pregledan domaći je u njemu samo za čitanje.
 */
export const DOMACI_RUTE: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/domaci-lista').then(x => x.DomaciLista),
  },
  {
    path: 'novo',
    title: 'Nov domaći',
    data: { mrvice: () => [m('Domaći', '/domaci'), m('Nov domaći')] },
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./pages/novi-domaci').then(x => x.NoviDomaci),
  },
  {
    matcher: putanjaSaId(':id'),
    title: 'Domaći',
    data: { mrvice: () => [m('Domaći', '/domaci'), m('Domaći')] },
    loadComponent: () => import('./pages/domaci-detalj').then(x => x.DomaciDetalj),
  },
];
