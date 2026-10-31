import { Route } from '@angular/router';

/**
 * Deca rute `nalog` (u `PublicLayout`-u, `app.routes.ts`; student na telefonu, bez sesije nastavnika). I sam niz je lenj
 * (`loadChildren`), pa početni bundle nosi samo ulaz. Javni 404 za pogrešan link pod `/nalog` dodaje `app.routes.ts`
 * (`NotFound` je u `core/layout`, van allow-liste javnog feature-a).
 *
 * Prijavljen student (spec studentskog dela 12.1) je u ljusci tabova Početna · Čas · Predmeti · Ja (`NalogTabovi`, lenja);
 * strana prijave (`''`) i `moodle` su van nje. Pregled prezentacije je zaseban lenji chunk (projektorski renderer slajda).
 */
export const NALOG_RUTE: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Nalog',
    loadComponent: () => import('./pages/nalog.page').then(x => x.NalogPage),
  },
  {
    // posle ulaska iz Moodle-a (backend preusmerava): uparivanje, `?uloga=nastavnik`, `?greska=<kod>` (spec prijave 8.3)
    path: 'moodle',
    title: 'Moodle',
    loadComponent: () => import('./pages/moodle.page').then(x => x.MoodlePage),
  },
  {
    path: '',
    loadComponent: () => import('./pages/tabovi.page').then(x => x.NalogTabovi),
    children: [
      {
        // prvi tab posle prijave: pozdrav, WhatsApp grupa, naredni časovi
        path: 'pocetna',
        title: 'Početna',
        loadComponent: () => import('./pages/pocetna.page').then(x => x.PocetnaPage),
      },
      {
        // QR za čekiranje sa table ili projektora (studentski portal, faza 1): token se odmah briše iz adrese
        path: 'cas/:token',
        title: 'Čas',
        loadComponent: () => import('./pages/cas.page').then(x => x.CasPage),
      },
      {
        // tab Čas (samo čas uživo): posle ključa čekanja i posle kraja Uživo izvođenja (`?sa=cas`)
        path: 'cas',
        title: 'Čas',
        loadComponent: () => import('./pages/cas.page').then(x => x.CasPage),
      },
      {
        path: 'predmeti',
        title: 'Predmeti',
        loadComponent: () => import('./pages/predmeti.page').then(x => x.PredmetiPage),
      },
      {
        // `?k=materijali|istorija|ocena`
        path: 'predmet/:id',
        title: 'Predmet',
        loadComponent: () => import('./pages/predmet.page').then(x => x.PredmetPage),
      },
      {
        // `?nivo=1-3`
        path: 'predmet/:id/vezbanje/:tipId',
        title: 'Vežbanje',
        loadComponent: () => import('./pages/vezbanje.page').then(x => x.VezbanjePage),
      },
      {
        path: 'prezentacija/:id',
        title: 'Prezentacija',
        loadComponent: () => import('./pages/pregled-prezentacije.page').then(x => x.PregledPrezentacijePage),
      },
      {
        path: 'ja',
        title: 'Ja',
        loadComponent: () => import('./pages/ja.page').then(x => x.JaPage),
      },
    ],
  },
];
