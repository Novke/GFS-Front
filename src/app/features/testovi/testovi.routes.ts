import { Params, Route } from '@angular/router';

import { mrvica as m } from '../../core/layout/mrvica';
import { putanjaSaId } from '../../core/route-matchers';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

/**
 * Rute testova (deca rute `testovi` u `app.routes.ts`): lista, nov, detalj (unos poena; evidentiran test je pregled) i
 * statistika, plus šabloni online testova (`sabloni`, `sabloni/novo`, `sabloni/:id`). `novo` i `sabloni` su ispred `:id` matchera; `:id` mora biti broj (`putanjaSaId`), inače 404.
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
    path: 'sabloni',
    pathMatch: 'full',
    title: 'Šabloni testova',
    data: { mrvice: () => [m('Testovi', '/testovi'), m('Šabloni')] },
    loadComponent: () => import('./pages/sabloni-lista').then(x => x.SabloniLista),
  },
  {
    path: 'sabloni/novo',
    title: 'Nov šablon',
    data: { mrvice: () => [m('Testovi', '/testovi'), m('Šabloni', '/testovi/sabloni'), m('Nov šablon')] },
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./pages/sablon-editor').then(x => x.SablonEditor),
  },
  {
    matcher: putanjaSaId('sabloni/:id'),
    title: 'Šablon testa',
    data: { mrvice: () => [m('Testovi', '/testovi'), m('Šabloni', '/testovi/sabloni'), m('Šablon')] },
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./pages/sablon-editor').then(x => x.SablonEditor),
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
