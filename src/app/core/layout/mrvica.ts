import type { Mrvica } from './breadcrumbs';

/** Jedna mrvica za `data.mrvice` ruta: `mrvica('Grupe', '/grupe')`; bez `url` je poslednja (tekuća) stranica. */
export function mrvica(label: string, url?: string): Mrvica {
  return url ? { label, url } : { label };
}
