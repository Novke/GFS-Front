import { Route } from '@angular/router';

/**
 * Deca rute `predavanja/:id/tabla` (`app.routes.ts`, ProjectorLayout): tabla i prozor publike. Publika je projekcija (bez
 * trake novog izdanja). `:id` je na roditelju: `publika` ga ne nasleđuje (`paramsInheritanceStrategy: 'emptyOnly'`), pa ga
 * čita sa roditeljske rute.
 */
export const TABLA_RUTE: Route[] = [
  { path: '', title: 'Tabla', loadComponent: () => import('./pages/tabla-predavanja').then(x => x.TablaPredavanja) },
  {
    path: 'publika',
    title: 'Tabla (publika)',
    data: { projekcija: true },
    loadComponent: () => import('./pages/tabla-publika').then(x => x.TablaPublika),
  },
];
