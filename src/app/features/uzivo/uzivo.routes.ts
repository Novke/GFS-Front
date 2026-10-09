import { Routes } from '@angular/router';
import { UzivoPutanje } from './uzivo-putanje';
import type { PrezentacijaEditorPage } from './pages/prezentacija-editor.page';

/**
 * Rute uživo (spec 6.2). Bez toolbara su `uzivo`, `uzivo/:kod` (javno, student) i `izvodjenja/:id/publika|konzola`
 * (projektor); pravila su u `bez-toolbara.ts`. Javne rute smeju da zovu samo `api/public/*` i `assets/*`.
 */
export const UZIVO_ROUTES: Routes = [
  {
    path: UzivoPutanje.prezentacije,
    loadComponent: () => import('./pages/prezentacije-lista.page').then(m => m.PrezentacijeListaPage),
  },
  {
    path: UzivoPutanje.prezentacija(':id'),
    loadComponent: () => import('./pages/prezentacija-editor.page').then(m => m.PrezentacijaEditorPage),
    canDeactivate: [(editor: PrezentacijaEditorPage) => editor.mozeDaNapusti()],
  },
  {
    path: UzivoPutanje.prezentacijaIzvodjenja(':id'),
    loadComponent: () => import('./pages/izvodjenja-lista.page').then(m => m.IzvodjenjaListaPage),
  },
  {
    path: UzivoPutanje.izvodjenjePregled(':id'),
    loadComponent: () => import('./pages/izvodjenje-pregled.page').then(m => m.IzvodjenjePregledPage),
  },
  {
    path: UzivoPutanje.izvodjenjePublika(':id'),
    loadComponent: () => import('./pages/publika.page').then(m => m.PublikaPage),
  },
  {
    path: UzivoPutanje.izvodjenjeKonzola(':id'),
    loadComponent: () => import('./pages/konzola.page').then(m => m.KonzolaPage),
  },
  // Javno (student): uvozi samo javno/ i čiste delove data-access/ i ui/, nikad nastavnički API ni pages/.
  { path: UzivoPutanje.uzivo, loadComponent: () => import('./javno/uzivo-kod.page').then(m => m.UzivoKodPage) },
  {
    path: UzivoPutanje.uzivoKod(':kod'),
    loadComponent: () => import('./javno/uzivo-student.page').then(m => m.UzivoStudentPage),
  },
];
