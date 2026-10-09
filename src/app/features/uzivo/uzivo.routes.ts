import { Params, Route } from '@angular/router';

import { NotFound } from '../../core/layout/not-found';
import { mrvica as m } from '../../core/layout/mrvica';
import { neprazanParametar, putanjaSaId } from '../../core/route-matchers';
import type { PrezentacijaEditorPage } from './pages/prezentacija-editor.page';

/*
 * Rute uživo (spec uživo 6.2). Putanje su iste kao pre redizajna (QR kodovi i linkovi su možda već podeljeni), samo su
 * raspoređene po layoutima u `app.routes.ts`:
 * - ljuska: `prezentacije`, `prezentacije/:id`, `prezentacije/:id/izvodjenja` (deca rute `prezentacije`) i
 *   `izvodjenja/:id/pregled` (dete rute `izvodjenja`);
 * - projektor (bez ljuske, uvek svetao, cela strana): `izvodjenja/:id/publika` i `izvodjenja/:id/konzola`;
 * - javno (student na telefonu, bez basic-auth-a): `uzivo` i `uzivo/:kod` u javnom layoutu. Smeju da zovu samo
 *   `assets/*`, `api/public/uzivo/*`, `api/public/mediji/*` i `api/public/ws` (pravilo `gfs/javna-ruta-uvozi`).
 * Id u putanji mora biti broj (`putanjaSaId`), inače 404 bez poziva API-ja.
 */

/** Deca rute `prezentacije` (ljuska; roditelj daje naslov i mrvice "Nastava > Prezentacije"). */
export const PREZENTACIJE_RUTE: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/prezentacije-lista.page').then(x => x.PrezentacijeListaPage),
  },
  {
    matcher: putanjaSaId(':id/izvodjenja'),
    title: 'Izvođenja prezentacije',
    data: {
      mrvice: (p: Params) => [m('Prezentacije', '/prezentacije'), m('Prezentacija', `/prezentacije/${p['id']}`), m('Izvođenja')],
    },
    loadComponent: () => import('./pages/izvodjenja-lista.page').then(x => x.IzvodjenjaListaPage),
  },
  {
    matcher: putanjaSaId(':id'),
    title: 'Prezentacija',
    data: { mrvice: () => [m('Prezentacije', '/prezentacije'), m('Prezentacija')] },
    loadComponent: () => import('./pages/prezentacija-editor.page').then(x => x.PrezentacijaEditorPage),
    // Bez komponente (navigacija pre nego što je napravljena) nema šta da se sačuva.
    canDeactivate: [(editor: PrezentacijaEditorPage | null) => editor?.mozeDaNapusti() ?? true],
  },
];

/** Deca rute `izvodjenja` u ljusci (publika i konzola su u projektorskom layoutu, `app.routes.ts`). */
export const IZVODJENJA_RUTE: Route[] = [
  {
    matcher: putanjaSaId(':id/pregled'),
    title: 'Pregled izvođenja',
    data: { mrvice: () => [m('Prezentacije', '/prezentacije'), m('Pregled izvođenja')] },
    loadComponent: () => import('./pages/izvodjenje-pregled.page').then(x => x.IzvodjenjePregledPage),
  },
];

/**
 * Deca javne rute `uzivo` (roditelj: `PublicLayout` sa `celaStrana`). Uvoze samo `javno/` i dozvoljene čiste module
 * (`eslint-rules/javna-ruta-konfig.js`), nikad nastavnički API ni `pages/`. Pogrešan link ostaje u javnom layoutu: 404 u
 * ljusci bi zvao zaključan API (dijalog za lozinku na telefonu).
 */
export const UZIVO_JAVNE_RUTE: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Uživo',
    loadComponent: () => import('./javno/uzivo-kod.page').then(x => x.UzivoKodPage),
  },
  {
    matcher: neprazanParametar('kod'),
    title: 'Uživo',
    loadComponent: () => import('./javno/uzivo-student.page').then(x => x.UzivoStudentPage),
  },
  { path: '**', title: 'Stranica nije pronađena', data: { javna: true }, component: NotFound },
];
