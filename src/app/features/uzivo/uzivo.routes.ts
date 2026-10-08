import { Routes } from '@angular/router';
import { AppRoutes } from '../../app.routes';
import type { PrezentacijaEditorPage } from './pages/prezentacija-editor.page';

// Ekrani narednih zadataka za sada vode na istu privremenu stranicu; svaki zadatak menja svoj loadComponent.
const uIzradi = () => import('./pages/u-izradi.page').then(m => m.UIzradiPage);

/**
 * Rute uživo (spec 6.2). Bez toolbara su `uzivo`, `uzivo/:kod` (javno, student) i `izvodjenja/:id/publika|konzola`
 * (projektor); pravila su u `bez-toolbara.ts`. Javne rute smeju da zovu samo `api/public/*` i `assets/*`.
 */
export const UZIVO_ROUTES: Routes = [
  {
    path: AppRoutes.prezentacije,
    loadComponent: () => import('./pages/prezentacije-lista.page').then(m => m.PrezentacijeListaPage),
  },
  {
    path: AppRoutes.prezentacija(':id'),
    loadComponent: () => import('./pages/prezentacija-editor.page').then(m => m.PrezentacijaEditorPage),
    canDeactivate: [(editor: PrezentacijaEditorPage) => editor.mozeDaNapusti()],
  },
  { path: AppRoutes.prezentacijaIzvodjenja(':id'), loadComponent: uIzradi, data: { ekran: 'Izvođenja prezentacije' } },
  { path: AppRoutes.izvodjenjePregled(':id'), loadComponent: uIzradi, data: { ekran: 'Pregled izvođenja' } },
  {
    path: AppRoutes.izvodjenjePublika(':id'),
    loadComponent: () => import('./pages/publika.page').then(m => m.PublikaPage),
  },
  {
    path: AppRoutes.izvodjenjeKonzola(':id'),
    loadComponent: () => import('./pages/konzola.page').then(m => m.KonzolaPage),
  },
  { path: AppRoutes.uzivo, loadComponent: uIzradi, data: { ekran: 'Unos koda' } },
  { path: AppRoutes.uzivoKod(':kod'), loadComponent: uIzradi, data: { ekran: 'Uživo' } },
];
