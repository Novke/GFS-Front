import { Routes } from '@angular/router';
import { AppRoutes } from '../../app.routes';

// Ekrani narednih zadataka za sada vode na istu privremenu stranicu; svaki zadatak menja svoj loadComponent.
const uIzradi = () => import('./pages/u-izradi.page').then(m => m.UIzradiPage);

/**
 * Rute uživo (spec 6.2). Bez toolbara su `uzivo`, `uzivo/:kod` (javno, student) i `izvodjenja/:id/publika|konzola`
 * (projektor); pravila su u `bez-toolbara.ts`. Javne rute smeju da zovu samo `api/public/*` i `assets/*`.
 */
export const UZIVO_ROUTES: Routes = [
  { path: AppRoutes.prezentacije, loadComponent: uIzradi, data: { ekran: 'Prezentacije' } },
  { path: AppRoutes.prezentacija(':id'), loadComponent: uIzradi, data: { ekran: 'Editor prezentacije' } },
  { path: AppRoutes.prezentacijaIzvodjenja(':id'), loadComponent: uIzradi, data: { ekran: 'Izvođenja prezentacije' } },
  { path: AppRoutes.izvodjenjePregled(':id'), loadComponent: uIzradi, data: { ekran: 'Pregled izvođenja' } },
  { path: AppRoutes.izvodjenjePublika(':id'), loadComponent: uIzradi, data: { ekran: 'Prikaz za publiku' } },
  { path: AppRoutes.izvodjenjeKonzola(':id'), loadComponent: uIzradi, data: { ekran: 'Konzola' } },
  { path: AppRoutes.uzivo, loadComponent: uIzradi, data: { ekran: 'Unos koda' } },
  { path: AppRoutes.uzivoKod(':kod'), loadComponent: uIzradi, data: { ekran: 'Uživo' } },
];
