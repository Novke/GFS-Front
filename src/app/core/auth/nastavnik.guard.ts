import { inject } from '@angular/core';
import { CanMatchFn, Router, UrlTree } from '@angular/router';

import { nazadIzUrla } from '../../shared/util/nazad';
import { SesijaStore } from './sesija.store';

/** `/prijava`, uz `nazad` kad ima kuda nazad (početna nema). */
export function urlPrijave(router: Router, nazad: string | null): UrlTree {
  return router.createUrlTree(['/prijava'], nazad ? { queryParams: { nazad } } : {});
}

/**
 * `canMatch` nastavničkih ruta: ljuska i svaka nastavnička ruta u `ProjectorLayout`-u (projektor predavanja, QR upisa,
 * publika, konzola i daljinski uživo). Stavlja se **po ruti**, ne globalno: javne rute (`upis`, `uzivo`, `nalog`,
 * `prijava`, buduća `render/slajd`) ostaju bez njega. Bez sesije vodi na `/prijava?nazad=<tražena putanja>`; pravu zaštitu
 * daje server (401), ovo samo štedi učitavanje ekrana koji ne bi radio.
 */
export const nastavnikGuard: CanMatchFn = async (_ruta, segmenti) => {
  const sesija = inject(SesijaStore);
  const router = inject(Router);
  if (await sesija.proveri()) {
    return true;
  }
  const navigacija = router.currentNavigation();
  const url = navigacija ? router.serializeUrl(navigacija.extractedUrl) : `/${segmenti.map(s => s.path).join('/')}`;
  return urlPrijave(router, nazadIzUrla(url));
};
