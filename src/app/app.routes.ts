import { Route, Routes } from '@angular/router';

import { Mrvica, MrviceFn } from './core/layout/breadcrumbs';
import { NotFound } from './core/layout/not-found';
import { ProjectorLayout } from './core/layout/projector-layout';
import { PublicLayout } from './core/layout/public-layout';
import { Shell } from './core/layout/shell';
import { neprazanParametar, putanjaSaId } from './core/route-matchers';
import { DOMACI_RUTE } from './features/domaci/domaci.routes';
import { GRUPE_RUTE } from './features/grupe/grupe.routes';
import { legacyRedirects } from './features/legacy-redirects';
import { PREDAVANJA_RUTE } from './features/predavanja/predavanja.routes';
import { STUDENTI_RUTE } from './features/studenti/studenti.routes';
import { TESTOVI_RUTE } from './features/testovi/testovi.routes';

/*
 * Stablo ruta (spec, sekcija 2). Putanje su relativne na <base href>; filteri lista su query parametri.
 * Do Task 18-26 rute bez novog ekrana učitavaju stare komponente ili `Uskoro` (features/privremeno); svaki
 * ekran-zadatak zamenjuje svoj `loadComponent` (ili ceo blok feature-a sa `loadChildren`).
 * Svaka ruta ima `title` (TitleStrategy: "<naslov> · GFS") i `data.mrvice`; detalj sam postavlja svoju labelu
 * (`BreadcrumbService.postavi`). Id u putanji mora biti broj (`putanjaSaId`), inače 404.
 */

const m = (label: string, url?: string): Mrvica => (url ? { label, url } : { label });
const mrvice = (fn: MrviceFn): Route['data'] => ({ mrvice: fn });
const stalne = (...lista: Mrvica[]): Route['data'] => mrvice(() => lista);

const uskoro = () => import('./features/privremeno/privremeno').then(x => x.Uskoro);

/** Tabovi kao child rute bez komponente (do novih ekrana sa outletom za tabove). */
function tabovi(naslovi: Record<string, string>): Routes {
  const prvi = Object.keys(naslovi)[0];
  return [
    { path: '', pathMatch: 'full', redirectTo: prvi },
    ...Object.entries(naslovi).map(([path, title]): Route => ({ path, title, children: [] })),
  ];
}

const nastavnickeRute: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Početna',
    data: stalne(m('Početna')),
    loadComponent: () => import('./features/pocetna/pages/pocetna').then(x => x.Pocetna),
  },

  // Predavanja (Task 18: lista i novo; Task 19: detalj i projektor)
  {
    path: 'predavanja',
    title: 'Predavanja',
    data: stalne(m('Nastava'), m('Predavanja')),
    children: [
      ...PREDAVANJA_RUTE,
      {
        // dok nije završeno beleženje uživo, posle toga pregled (isti ekran)
        matcher: putanjaSaId(':id'),
        title: 'Predavanje',
        data: stalne(m('Predavanja', '/predavanja'), m('Predavanje')),
        loadComponent: () => import('./features/predavanja/pages/predavanje-detalj').then(x => x.PredavanjeDetalj),
      },
    ],
  },

  // Domaći (Task 20: lista, nov i detalj sa evidentiranjem)
  {
    path: 'domaci',
    title: 'Domaći',
    data: stalne(m('Nastava'), m('Domaći')),
    children: DOMACI_RUTE,
  },

  // Testovi (Task 21: lista, nov, detalj sa unosom poena, statistika)
  {
    path: 'testovi',
    title: 'Testovi',
    data: stalne(m('Nastava'), m('Testovi')),
    children: TESTOVI_RUTE,
  },

  // Ocene (Task 24)
  {
    path: 'ocene',
    title: 'Ocene',
    data: stalne(m('Nastava'), m('Ocene')),
    loadComponent: () => import('./ocenjivanje/ocenjivanje-select.component').then(x => x.OcenjivanjeSelectComponent),
  },

  // Grupe i onboarding (Task 22: lista, detalj sa tabovima, prijave; QR je ispod, u ProjectorLayout-u)
  {
    path: 'grupe',
    title: 'Grupe',
    data: stalne(m('Ljudi'), m('Grupe')),
    children: GRUPE_RUTE,
  },

  // Studenti (Task 23: lista, profil sa tabovima, student na predmetu)
  {
    path: 'studenti',
    title: 'Studenti',
    data: stalne(m('Ljudi'), m('Studenti')),
    children: STUDENTI_RUTE,
  },

  // Predmeti (Task 24)
  {
    path: 'predmeti',
    title: 'Predmeti',
    data: stalne(m('Predmeti'), m('Svi predmeti')),
    children: [
      { path: '', pathMatch: 'full', loadComponent: uskoro },
      {
        matcher: putanjaSaId(':id'),
        title: 'Predmet',
        data: stalne(m('Predmeti', '/predmeti'), m('Predmet')),
        loadComponent: uskoro,
        children: tabovi({
          pregled: 'Predmet',
          predavanja: 'Predavanja predmeta',
          domaci: 'Domaći predmeta',
          testovi: 'Testovi predmeta',
          studenti: 'Studenti predmeta',
          ocene: 'Ocene predmeta',
          podesavanja: 'Podešavanja predmeta',
        }),
      },
    ],
  },

  { path: '**', title: 'Stranica nije pronađena', data: stalne(m('Stranica nije pronađena')), component: NotFound },
];

export const routes: Routes = [
  ...legacyRedirects,

  // Javno (student na telefonu, bez basic-auth-a): samo assets/env.json i api/public/upis/*.
  // Layouti su roditelji sa nepraznom putanjom: prazan roditelj sa decom bi prihvatio i `/` (bez deteta).
  {
    path: 'upis',
    component: PublicLayout,
    children: [
      {
        matcher: neprazanParametar('token'),
        title: 'Prijava za grupu',
        loadComponent: () => import('./features/upis/pages/javni-upis').then(x => x.JavniUpis),
      },
      // Pogrešan link pod /upis ostaje u javnom layoutu: 404 u ljusci bi zvao zaključan API (dijalog za lozinku).
      { path: '**', title: 'Stranica nije pronađena', data: { javna: true }, component: NotFound },
    ],
  },

  // Projektor (bez ljuske, uvek svetao)
  {
    matcher: putanjaSaId('predavanja/:id/projektor'),
    component: ProjectorLayout,
    children: [
      {
        path: '',
        title: 'Projektor',
        loadComponent: () => import('./features/predavanja/pages/predavanje-projektor').then(x => x.PredavanjeProjektor),
      },
    ],
  },
  {
    matcher: putanjaSaId('grupe/:id/onboarding/:sid/qr'),
    component: ProjectorLayout,
    children: [
      {
        path: '',
        title: 'QR za upis',
        loadComponent: () => import('./features/onboarding/pages/onboarding-qr').then(x => x.OnboardingQr),
      },
    ],
  },

  { path: '', component: Shell, children: nastavnickeRute },
];
