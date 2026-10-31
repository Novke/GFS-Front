import { Injectable } from '@angular/core';
import type { MatDialog } from '@angular/material/dialog';
import type { Observable } from 'rxjs';
import type { IshodUvoza, UvozPptxPodaci } from '../uvoz-pptx/uvoz-pptx.dialog';

/**
 * Otvara dijalog uvoza iz PowerPointa. Dijalog, moduli uvoza i `fflate` su u lenjom chunk-u: ovde je samo dinamički
 * `import()` (i `import type`, koji se briše pri prevođenju), pa editor i glavni bundle ne vuku ništa od uvoza. Odbijen
 * `import()` (npr. stari chunk posle novog izdanja) je odbijen `Promise`; pozivalac prikazuje poruku.
 */
@Injectable({ providedIn: 'root' })
export class UvozPptxOtvarac {
  /**
   * Učitava chunk uvoza bez otvaranja. "Nova prezentacija" -> "Iz PowerPointa" ga čeka **pre** `POST /prezentacije`: kad
   * chunk ne može da se učita (zastarela kartica), prezentacija se ne pravi, pa ne ostaje prazna. Ponovljen `import()` istog
   * modula ne preuzima ništa ponovo.
   */
  async pripremi(): Promise<void> {
    await import('../uvoz-pptx/uvoz-pptx.dialog');
  }

  async otvori(dialog: MatDialog, podaci: UvozPptxPodaci): Promise<Observable<IshodUvoza>> {
    const { otvoriUvozPptx } = await import('../uvoz-pptx/uvoz-pptx.dialog');
    return otvoriUvozPptx(dialog, podaci);
  }
}
