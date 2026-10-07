import { Params, Route, Routes } from '@angular/router';

import { Mrvica, MrviceFn } from './core/layout/breadcrumbs';
import { NotFound } from './core/layout/not-found';
import { ProjectorLayout } from './core/layout/projector-layout';
import { PublicLayout } from './core/layout/public-layout';
import { Shell } from './core/layout/shell';
import { neprazanParametar, putanjaSaId } from './core/route-matchers';
import { legacyRedirects } from './features/legacy-redirects';
import { domaciPregledan, imaGrupuIPredmet, predavanjeZavrseno, testPregledan } from './features/privremeno/privremeno';

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
    loadComponent: () => import('./home/home.component').then(x => x.HomeComponent),
  },

  // Predavanja (Task 18: lista i novo; Task 19: detalj i projektor)
  {
    path: 'predavanja',
    title: 'Predavanja',
    data: stalne(m('Nastava'), m('Predavanja')),
    children: [
      {
        path: '',
        pathMatch: 'full',
        canMatch: [imaGrupuIPredmet],
        loadComponent: () => import('./predavanje/predavanje-list/predavanje-list.component').then(x => x.PredavanjeListComponent),
      },
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./predavanje/predavanje-select/predavanje-select.component').then(x => x.PredavanjeSelectComponent),
      },
      {
        path: 'novo',
        title: 'Novo predavanje',
        data: stalne(m('Predavanja', '/predavanja'), m('Novo predavanje')),
        loadComponent: () =>
          import('./predavanje/start-predavanje/start-predavanje.component').then(x => x.StartPredavanjeComponent),
      },
      {
        matcher: putanjaSaId(':id'),
        title: 'Predavanje',
        data: stalne(m('Predavanja', '/predavanja'), m('Predavanje')),
        canMatch: [predavanjeZavrseno],
        loadComponent: () =>
          import('./predavanje/pregled-predavanja/pregled-predavanja.component').then(x => x.PregledPredavanjaComponent),
      },
      {
        matcher: putanjaSaId(':id'),
        title: 'Predavanje',
        data: stalne(m('Predavanja', '/predavanja'), m('Predavanje')),
        loadComponent: () => import('./predavanje/live-predavanje/live-predavanje.component').then(x => x.LivePredavanjeComponent),
      },
    ],
  },

  // Domaći (Task 20)
  {
    path: 'domaci',
    title: 'Domaći',
    data: stalne(m('Nastava'), m('Domaći')),
    children: [
      {
        path: '',
        pathMatch: 'full',
        canMatch: [imaGrupuIPredmet],
        loadComponent: () => import('./domaci/domaci-list/domaci-list.component').then(x => x.DomaciListComponent),
      },
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./domaci/domaci-select/domaci-select.component').then(x => x.DomaciSelectComponent),
      },
      {
        path: 'novo',
        title: 'Nov domaći',
        data: stalne(m('Domaći', '/domaci'), m('Nov domaći')),
        loadComponent: () => import('./domaci/nov-domaci/nov-domaci.component').then(x => x.NovDomaciComponent),
      },
      {
        matcher: putanjaSaId(':id'),
        title: 'Domaći',
        data: stalne(m('Domaći', '/domaci'), m('Domaći')),
        canMatch: [domaciPregledan],
        loadComponent: () => import('./domaci/pregled-domaceg/pregled-domaceg.component').then(x => x.PregledDomacegComponent),
      },
      {
        matcher: putanjaSaId(':id'),
        title: 'Domaći',
        data: stalne(m('Domaći', '/domaci'), m('Domaći')),
        loadComponent: () => import('./domaci/evidentiranje/evidentiranje.component').then(x => x.EvidentiranjeComponent),
      },
    ],
  },

  // Testovi (Task 21)
  {
    path: 'testovi',
    title: 'Testovi',
    data: stalne(m('Nastava'), m('Testovi')),
    children: [
      {
        path: '',
        pathMatch: 'full',
        canMatch: [imaGrupuIPredmet],
        loadComponent: () => import('./test/test-list/test-list.component').then(x => x.TestListComponent),
      },
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./test/test-select/test-select.component').then(x => x.TestSelectComponent),
      },
      {
        path: 'novo',
        title: 'Nov test',
        data: stalne(m('Testovi', '/testovi'), m('Nov test')),
        loadComponent: () => import('./test/nov-test/nov-test.component').then(x => x.NovTestComponent),
      },
      {
        matcher: putanjaSaId(':id/statistika'),
        title: 'Statistika testa',
        data: mrvice((p: Params) => [m('Testovi', '/testovi'), m('Test', `/testovi/${p['id']}`), m('Statistika')]),
        loadComponent: uskoro,
      },
      {
        matcher: putanjaSaId(':id'),
        title: 'Test',
        data: stalne(m('Testovi', '/testovi'), m('Test')),
        canMatch: [testPregledan],
        loadComponent: () => import('./test/test-pregled/test-pregled.component').then(x => x.TestPregledComponent),
      },
      {
        matcher: putanjaSaId(':id'),
        title: 'Test',
        data: stalne(m('Testovi', '/testovi'), m('Test')),
        loadComponent: () =>
          import('./test/test-evidentiranje/test-evidentiranje.component').then(x => x.TestEvidentiranjeComponent),
      },
    ],
  },

  // Ocene (Task 24)
  {
    path: 'ocene',
    title: 'Ocene',
    data: stalne(m('Nastava'), m('Ocene')),
    loadComponent: () => import('./ocenjivanje/ocenjivanje-select.component').then(x => x.OcenjivanjeSelectComponent),
  },

  // Grupe i onboarding (Task 22)
  {
    path: 'grupe',
    title: 'Grupe',
    data: stalne(m('Ljudi'), m('Grupe')),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./grupa/grupe/grupe.component').then(x => x.GrupeComponent),
      },
      {
        matcher: putanjaSaId(':id/onboarding/:sid'),
        title: 'Prijave',
        data: mrvice((p: Params) => [
          m('Grupe', '/grupe'),
          m('Grupa', `/grupe/${p['id']}`),
          m('Onboarding', `/grupe/${p['id']}/onboarding`),
          m('Prijave'),
        ]),
        loadComponent: () =>
          import('./onboarding/onboarding-prijave/onboarding-prijave.component').then(x => x.OnboardingPrijaveComponent),
      },
      {
        matcher: putanjaSaId(':id'),
        title: 'Grupa',
        data: stalne(m('Grupe', '/grupe'), m('Grupa')),
        loadComponent: () => import('./grupa/grupa-details/grupa-details.component').then(x => x.GrupaDetailsComponent),
        children: tabovi({
          pregled: 'Grupa',
          studenti: 'Studenti grupe',
          prisustvo: 'Prisustvo grupe',
          nastava: 'Nastava grupe',
          onboarding: 'Onboarding grupe',
        }),
      },
    ],
  },

  // Studenti (Task 23)
  {
    path: 'studenti',
    title: 'Studenti',
    data: stalne(m('Ljudi'), m('Studenti')),
    children: [
      { path: '', pathMatch: 'full', loadComponent: uskoro },
      {
        matcher: putanjaSaId(':id/predmeti/:pid'),
        title: 'Student na predmetu',
        data: mrvice((p: Params) => [m('Studenti', '/studenti'), m('Student', `/studenti/${p['id']}`), m('Predmet')]),
        loadComponent: () => import('./student/student-predmet/student-predmet.component').then(x => x.StudentPredmetComponent),
      },
      {
        matcher: putanjaSaId(':id'),
        title: 'Student',
        data: stalne(m('Studenti', '/studenti'), m('Student')),
        loadComponent: () => import('./student/student-details/student-details.component').then(x => x.StudentDetailsComponent),
      },
    ],
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
        loadComponent: () => import('./onboarding/javni-upis/javni-upis.component').then(x => x.JavniUpisComponent),
      },
      // Pogrešan link pod /upis ostaje u javnom layoutu: 404 u ljusci bi zvao zaključan API (dijalog za lozinku).
      { path: '**', title: 'Stranica nije pronađena', data: { javna: true }, component: NotFound },
    ],
  },

  // Projektor (bez ljuske, uvek svetao)
  {
    matcher: putanjaSaId('predavanja/:id/projektor'),
    component: ProjectorLayout,
    children: [{ path: '', title: 'Projektor', loadComponent: uskoro }],
  },
  {
    matcher: putanjaSaId('grupe/:id/onboarding/:sid/qr'),
    component: ProjectorLayout,
    children: [
      {
        path: '',
        title: 'QR za upis',
        loadComponent: () => import('./onboarding/onboarding-qr/onboarding-qr.component').then(x => x.OnboardingQrComponent),
      },
    ],
  },

  { path: '', component: Shell, children: nastavnickeRute },
];
