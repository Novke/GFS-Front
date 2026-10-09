import { Params, Route } from '@angular/router';

import { Mrvica } from '../../core/layout/breadcrumbs';
import { putanjaSaId } from '../../core/route-matchers';

const m = (label: string, url?: string): Mrvica => (url ? { label, url } : { label });

/**
 * Rute studenata (deca rute `studenti` u `app.routes.ts`, koja daje naslov i mrvice "Ljudi > Studenti"): lista, profil sa
 * tabovima kao child rutama i student na predmetu. Id u putanji mora biti broj (`putanjaSaId`), inače 404; `/studenti/:id`
 * ide na tab Pregled. Stari linkovi `student/:id` i `student/:s/predmet/:p` se preusmeravaju u `legacy-redirects.ts`.
 */
export const STUDENTI_RUTE: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/studenti-lista').then(x => x.StudentiLista),
  },
  {
    matcher: putanjaSaId(':id/predmeti/:pid'),
    title: 'Student na predmetu',
    data: { mrvice: (p: Params) => [m('Studenti', '/studenti'), m('Student', `/studenti/${p['id']}`), m('Predmet')] },
    loadComponent: () => import('./pages/student-predmet').then(x => x.StudentPredmet),
  },
  {
    matcher: putanjaSaId(':id'),
    title: 'Student',
    data: { mrvice: () => [m('Studenti', '/studenti'), m('Student')] },
    loadComponent: () => import('./pages/student-profil').then(x => x.StudentProfil),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'pregled' },
      {
        path: 'pregled',
        title: 'Pregled studenta',
        loadComponent: () => import('./pages/student-pregled-tab').then(x => x.StudentPregledTab),
      },
      {
        path: 'hronologija',
        title: 'Hronologija studenta',
        loadComponent: () => import('./pages/student-hronologija-tab').then(x => x.StudentHronologijaTab),
      },
      {
        path: 'beleske',
        title: 'Beleške o studentu',
        loadComponent: () => import('./pages/student-beleske-tab').then(x => x.StudentBeleskeTab),
      },
    ],
  },
];
