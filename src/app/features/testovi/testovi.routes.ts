import { Params, Route } from '@angular/router';

import { Mrvica } from '../../core/layout/breadcrumbs';
import { putanjaSaId } from '../../core/route-matchers';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

const m = (label: string, url?: string): Mrvica => (url ? { label, url } : { label });

/**
 * Rute testova (deca rute `testovi` u `app.routes.ts`): lista, nov, detalj (unos poena; evidentiran test je pregled) i
 * statistika. `novo` je ispred `:id` matchera; `:id` mora biti broj (`putanjaSaId`), inače 404.
 */
export const TESTOVI_RUTE: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/testovi-lista').then(x => x.TestoviLista),
  },
  {
    path: 'novo',
    title: 'Nov test',
    data: { mrvice: () => [m('Testovi', '/testovi'), m('Nov test')] },
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./pages/novi-test').then(x => x.NoviTest),
  },
  {
    matcher: putanjaSaId(':id/statistika'),
    title: 'Statistika testa',
    data: { mrvice: (p: Params) => [m('Testovi', '/testovi'), m('Test', `/testovi/${p['id']}`), m('Statistika')] },
    loadComponent: () => import('./pages/test-statistika').then(x => x.TestStatistika),
  },
  {
    matcher: putanjaSaId(':id'),
    title: 'Test',
    data: { mrvice: () => [m('Testovi', '/testovi'), m('Test')] },
    loadComponent: () => import('./pages/test-detalj').then(x => x.TestDetalj),
  },
];
