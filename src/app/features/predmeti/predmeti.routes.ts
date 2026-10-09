import { Route } from '@angular/router';

import { mrvica as m } from '../../core/layout/mrvica';
import { putanjaSaId } from '../../core/route-matchers';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

/** Tabovi huba predmeta (child rute); prvi je podrazumevani (`/predmeti/:id` -> `pregled`). */
export const TABOVI_PREDMETA = [
  { putanja: 'pregled', naslov: 'Pregled', title: 'Predmet' },
  { putanja: 'predavanja', naslov: 'Predavanja', title: 'Predavanja predmeta' },
  { putanja: 'domaci', naslov: 'Domaći', title: 'Domaći predmeta' },
  { putanja: 'testovi', naslov: 'Testovi', title: 'Testovi predmeta' },
  { putanja: 'studenti', naslov: 'Studenti', title: 'Studenti predmeta' },
  { putanja: 'ocene', naslov: 'Ocene', title: 'Ocene predmeta' },
  { putanja: 'podesavanja', naslov: 'Podešavanja', title: 'Podešavanja predmeta' },
] as const;

type PutanjaTaba = (typeof TABOVI_PREDMETA)[number]['putanja'];

const komponentaTaba: Record<PutanjaTaba, Route['loadComponent']> = {
  pregled: () => import('./pages/predmet-pregled-tab').then(x => x.PredmetPregledTab),
  predavanja: () => import('./pages/predmet-lista-tab').then(x => x.PredmetPredavanjaTab),
  domaci: () => import('./pages/predmet-lista-tab').then(x => x.PredmetDomaciTab),
  testovi: () => import('./pages/predmet-lista-tab').then(x => x.PredmetTestoviTab),
  studenti: () => import('./pages/predmet-studenti-tab').then(x => x.PredmetStudentiTab),
  ocene: () => import('./pages/predmet-ocene-tab').then(x => x.PredmetOceneTab),
  podesavanja: () => import('./pages/predmet-podesavanja-tab').then(x => x.PredmetPodesavanjaTab),
};

/**
 * Rute predmeta (deca rute `predmeti` u `app.routes.ts`): lista i hub sa tabovima kao child rutama. Id mora biti broj
 * (`putanjaSaId`); nepoznat tab (`/predmeti/5/xyz`) ne odgovara nijednom detetu, pa ide na 404 (bez petlje). Školska
 * godina i grupa huba su query parametri (`godina`, `grupa`) koje tabovi nasleđuju. Podešavanja pitaju pre napuštanja
 * sa nesačuvanim koeficijentima.
 */
export const PREDMETI_RUTE: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/predmeti-lista').then(x => x.PredmetiLista),
  },
  {
    matcher: putanjaSaId(':id'),
    title: 'Predmet',
    data: { mrvice: () => [m('Predmeti', '/predmeti'), m('Predmet')] },
    loadComponent: () => import('./pages/predmet-hub').then(x => x.PredmetHub),
    children: [
      { path: '', pathMatch: 'full', redirectTo: TABOVI_PREDMETA[0].putanja },
      ...TABOVI_PREDMETA.map(
        (t): Route => ({
          path: t.putanja,
          title: t.title,
          loadComponent: komponentaTaba[t.putanja],
          ...(t.putanja === 'podesavanja' ? { canDeactivate: [unsavedChangesGuard] } : {}),
        }),
      ),
    ],
  },
];
