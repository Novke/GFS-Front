// Zamenljive zavisnosti uvoza PDF-a (faza 5d): spec-ovi ih zamenjuju kroz `InjectionToken` (vi.mock relativnih modula
// ne radi u @angular/build, faza 4 F15).
import { InjectionToken } from '@angular/core';

import { platnoIzDokumenta, type PdfJs, type Platno2d } from './pdf-crtac';

/** pdf.js za dijalog uvoza; u testovima lažan (spec ne sme da uveze pdf-ucitavanje: `new Worker(new URL(...))`). */
export const UCITAJ_PDFJS = new InjectionToken<() => Promise<PdfJs>>('UCITAJ_PDFJS', {
  providedIn: 'root',
  factory: () => () => import('./pdf-ucitavanje').then((m) => m.ucitajPdfJs()),
});

/** Canvas za crtanje strane; jsdom nema `toBlob`, pa ga spec dijaloga zamenjuje (bez `vi.mock`, faza 4 F15). */
export const NAPRAVI_PLATNO_PDF = new InjectionToken<(w: number, h: number) => Platno2d>('NAPRAVI_PLATNO_PDF', {
  providedIn: 'root',
  factory: () => platnoIzDokumenta,
});
