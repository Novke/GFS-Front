import { Route } from '@angular/router';

import { mrvica as m } from '../../core/layout/mrvica';
import { putanjaSaId } from '../../core/route-matchers';

/*
 * Rute banke zadataka (deca rute `banka` u ljusci; roditelj daje naslov "Banka zadataka" i mrvice "Nastava > Banka
 * zadataka"). Filteri stranice su query parametri (`?predmet&namena&grupa`). Id u putanji mora biti broj (`putanjaSaId`),
 * inače 404 bez poziva API-ja. Sve je iza basic-auth-a (ništa pod `/public`).
 */
export const BANKA_RUTE: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Banka zadataka',
    loadComponent: () => import('./pages/banka.page').then(x => x.BankaPage),
  },
  {
    matcher: putanjaSaId('grupe/:id'),
    title: 'Grupa zadataka',
    data: { mrvice: () => [m('Banka zadataka', '/banka'), m('Grupa zadataka')] },
    loadComponent: () => import('./pages/grupa-detalj.page').then(x => x.GrupaDetaljPage),
  },
  {
    path: 'varijante/nova',
    title: 'Nova varijanta',
    data: { mrvice: () => [m('Banka zadataka', '/banka'), m('Nova varijanta')] },
    loadComponent: () => import('./pages/varijanta-editor.page').then(x => x.VarijantaEditorPage),
  },
  {
    matcher: putanjaSaId('varijante/:id'),
    title: 'Varijanta',
    data: { mrvice: () => [m('Banka zadataka', '/banka'), m('Varijanta')] },
    loadComponent: () => import('./pages/varijanta-editor.page').then(x => x.VarijantaEditorPage),
  },
];
