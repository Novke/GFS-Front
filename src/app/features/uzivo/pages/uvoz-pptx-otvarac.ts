import { Injectable } from '@angular/core';
import type { MatDialog } from '@angular/material/dialog';
import type { Observable } from 'rxjs';
import type { PrezentacijaDetails } from '../data-access/uzivo.models';
import type { UvozPptxPodaci } from '../uvoz-pptx/uvoz-pptx.dialog';

/**
 * Otvara dijalog uvoza iz PowerPointa. Dijalog, moduli uvoza i `fflate` su u lenjom chunk-u: ovde je samo dinamički
 * `import()` (i `import type`, koji se briše pri prevođenju), pa editor i glavni bundle ne vuku ništa od uvoza. Odbijen
 * `import()` (npr. stari chunk posle novog izdanja) je odbijen `Promise`; pozivalac prikazuje poruku.
 */
@Injectable({ providedIn: 'root' })
export class UvozPptxOtvarac {
  async otvori(dialog: MatDialog, podaci: UvozPptxPodaci): Promise<Observable<PrezentacijaDetails | undefined>> {
    const { otvoriUvozPptx } = await import('../uvoz-pptx/uvoz-pptx.dialog');
    return otvoriUvozPptx(dialog, podaci);
  }
}
