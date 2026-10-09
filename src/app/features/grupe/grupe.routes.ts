import { Params, Route } from '@angular/router';

import { Mrvica } from '../../core/layout/breadcrumbs';
import { putanjaSaId } from '../../core/route-matchers';

const m = (label: string, url?: string): Mrvica => (url ? { label, url } : { label });

/** Tabovi detalja grupe (child rute); prvi je podrazumevani (`/grupe/:id` -> `pregled`). */
export const TABOVI_GRUPE = [
  { putanja: 'pregled', naslov: 'Pregled', title: 'Grupa' },
  { putanja: 'studenti', naslov: 'Studenti', title: 'Studenti grupe' },
  { putanja: 'prisustvo', naslov: 'Prisustvo', title: 'Prisustvo grupe' },
  { putanja: 'nastava', naslov: 'Nastava', title: 'Nastava grupe' },
  { putanja: 'onboarding', naslov: 'Onboarding', title: 'Onboarding grupe' },
] as const;

const komponentaTaba: Record<(typeof TABOVI_GRUPE)[number]['putanja'], Route['loadComponent']> = {
  pregled: () => import('./pages/grupa-pregled-tab').then(x => x.GrupaPregledTab),
  studenti: () => import('./pages/grupa-studenti-tab').then(x => x.GrupaStudentiTab),
  prisustvo: () => import('./pages/grupa-prisustvo-tab').then(x => x.GrupaPrisustvoTab),
  nastava: () => import('./pages/grupa-nastava-tab').then(x => x.GrupaNastavaTab),
  onboarding: () => import('./pages/grupa-onboarding-tab').then(x => x.GrupaOnboardingTab),
};

/**
 * Rute grupa (deca rute `grupe` u `app.routes.ts`, koja daje naslov i mrvice "Ljudi > Grupe"): lista, prijave jedne
 * onboarding sesije i detalj sa tabovima kao child rutama. Id-jevi moraju biti brojevi (`putanjaSaId`); nepoznat tab
 * (`/grupe/5/xyz`) ne odgovara nijednom detetu, pa ide na 404 (bez preusmeravanja, bez petlje). QR za projektor je u
 * `app.routes.ts` (ProjectorLayout, bez ljuske).
 */
export const GRUPE_RUTE: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/grupe-lista').then(x => x.GrupeLista),
  },
  {
    matcher: putanjaSaId(':id/onboarding/:sid'),
    title: 'Prijave',
    data: {
      mrvice: (p: Params) => [
        m('Grupe', '/grupe'),
        m('Grupa', `/grupe/${p['id']}`),
        m('Onboarding', `/grupe/${p['id']}/onboarding`),
        m('Prijave'),
      ],
    },
    loadComponent: () => import('../onboarding/pages/prijave').then(x => x.Prijave),
  },
  {
    matcher: putanjaSaId(':id'),
    title: 'Grupa',
    data: { mrvice: () => [m('Grupe', '/grupe'), m('Grupa')] },
    loadComponent: () => import('./pages/grupa-detalj').then(x => x.GrupaDetalj),
    children: [
      { path: '', pathMatch: 'full', redirectTo: TABOVI_GRUPE[0].putanja },
      ...TABOVI_GRUPE.map((t): Route => ({ path: t.putanja, title: t.title, loadComponent: komponentaTaba[t.putanja] })),
    ],
  },
];
