import { Injectable } from '@angular/core';
import type { MatDialog } from '@angular/material/dialog';
import type { Observable } from 'rxjs';
import type { IshodUvozaPdf, UvozPdfPodaci } from '../uvoz-pdf/uvoz-pdf.dialog';

/**
 * Otvara dijalog uvoza iz PDF-a (faza 5d). Dijalog i moduli uvoza su u lenjom chunk-u, a pdf.js i njegov radnik u još
 * jednom, koji dijalog učitava tek kad je fajl izabran: ovde je samo dinamički `import()` (i `import type`, koji se briše
 * pri prevođenju), pa editor i glavni bundle ne vuku ništa od uvoza. Odbijen `import()` je odbijen `Promise`; pozivalac
 * prikazuje poruku.
 */
@Injectable({ providedIn: 'root' })
export class UvozPdfOtvarac {
  async otvori(dialog: MatDialog, podaci: UvozPdfPodaci): Promise<Observable<IshodUvozaPdf>> {
    const { otvoriUvozPdf } = await import('../uvoz-pdf/uvoz-pdf.dialog');
    return otvoriUvozPdf(dialog, podaci);
  }
}
