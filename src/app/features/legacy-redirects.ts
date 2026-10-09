import { inject } from '@angular/core';
import { Params, RedirectFunction, Router, Routes } from '@angular/router';

import { putanjaSaId } from '../core/route-matchers';

/** Preusmerenje na novu putanju: `:ime` u šablonu se zamenjuje parametrom stare rute; ostali query parametri ostaju. */
function na(sablon: string, query: (p: Params) => Params = () => ({})): RedirectFunction {
  return ({ params, queryParams }) => {
    const segmenti = sablon
      .split('/')
      .filter(Boolean)
      .map(deo => (deo.startsWith(':') ? String(params[deo.slice(1)]) : deo));
    return inject(Router).createUrlTree(['/', ...segmenti], { queryParams: { ...queryParams, ...query(params) } });
  };
}

const grupaPredmet = (p: Params): Params => ({ grupa: p['grupaId'], predmet: p['predmetId'] });

/**
 * Stare rute (do kraja semestra, posle se brišu; spec, sekcija 2). Odštampani QR kodovi vode na `upis/:token`, koji
 * se ne menja i nije ovde. Nenumerički id ide dalje i završava na 404 nove rute.
 */
export const legacyRedirects: Routes = [
  { path: 'predavanje', pathMatch: 'full', redirectTo: na('/predavanja') },
  { path: 'predavanje/start', pathMatch: 'full', redirectTo: na('/predavanja/novo') },
  { path: 'predavanje/grupa/:grupaId/predmet/:predmetId', pathMatch: 'full', redirectTo: na('/predavanja', grupaPredmet) },
  { path: 'predavanje/live/:id', pathMatch: 'full', redirectTo: na('/predavanja/:id') },
  { path: 'predavanje/:id/pregled', pathMatch: 'full', redirectTo: na('/predavanja/:id') },
  { path: 'predavanje/:id', pathMatch: 'full', redirectTo: na('/predavanja/:id') },

  { path: 'domaci/new', pathMatch: 'full', redirectTo: na('/domaci/novo') },
  { path: 'domaci/grupa/:grupaId/predmet/:predmetId', pathMatch: 'full', redirectTo: na('/domaci', grupaPredmet) },
  { path: 'domaci/:id/evidentiranje', pathMatch: 'full', redirectTo: na('/domaci/:id') },
  { path: 'domaci/:id/pregled', pathMatch: 'full', redirectTo: na('/domaci/:id') },

  { path: 'test', pathMatch: 'full', redirectTo: na('/testovi') },
  { path: 'test/new', pathMatch: 'full', redirectTo: na('/testovi/novo') },
  { path: 'test/grupa/:grupaId/predmet/:predmetId', pathMatch: 'full', redirectTo: na('/testovi', grupaPredmet) },
  { path: 'test/:id/evidentiranje', pathMatch: 'full', redirectTo: na('/testovi/:id') },
  { path: 'test/:id/pregled', pathMatch: 'full', redirectTo: na('/testovi/:id') },
  { path: 'test/:id', pathMatch: 'full', redirectTo: na('/testovi/:id') },

  { path: 'student/:id', pathMatch: 'full', redirectTo: na('/studenti/:id') },
  { path: 'student/:studentId/predmet/:predmetId', pathMatch: 'full', redirectTo: na('/studenti/:studentId/predmeti/:predmetId') },

  // Sesija zna grupu tek posle učitavanja: komponenta učita i preusmeri (bez ljuske, samo poruka dok čeka).
  {
    matcher: putanjaSaId('onboarding/:id'),
    title: 'Otvaram sesiju',
    loadComponent: () => import('./onboarding/pages/onboarding-preusmerenje').then(m => m.OnboardingPreusmerenje),
  },
  {
    matcher: putanjaSaId('onboarding/:id/qr'),
    title: 'Otvaram sesiju',
    data: { qr: true },
    loadComponent: () => import('./onboarding/pages/onboarding-preusmerenje').then(m => m.OnboardingPreusmerenje),
  },
];
