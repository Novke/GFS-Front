// Jedini fajl koji uvozi pdfjs-dist; učitava se samo dinamički (`UCITAJ_PDFJS` u pdf-token.ts) i ne uvozi ga nijedan spec.
import { spremanRadnik, type PdfJs } from './pdf-crtac';

let obecanje: Promise<PdfJs> | null = null;

/**
 * Jednom po kartici: pdf.js (legacy build, odluka 15) i radnik kao Angular web worker (odluka 16; heširan `worker-*.js`,
 * ne `.mjs` iz assets, koji nginx kontejnera ne služi kao JavaScript). Radnik se deli između uvoza (`workerPort`);
 * `PDFDocumentLoadingTask.destroy()` ga ne gasi. Neuspeh (chunk, radnik) se ne pamti: sledeći klik pokušava ponovo.
 */
export function ucitajPdfJs(): Promise<PdfJs> {
  obecanje ??= (async () => {
    const radnik = spremanRadnik(new Worker(new URL('./pdf.worker', import.meta.url), { type: 'module' }));
    // Radnik se gasi i kad biblioteka ne stigne; njegova greška tada nema ko da pročita.
    radnik.catch(() => undefined);
    let m: typeof import('pdfjs-dist/legacy/build/pdf.mjs');
    try {
      m = await import('pdfjs-dist/legacy/build/pdf.mjs');
    } catch (e) {
      void radnik.then((r) => r.terminate(), () => undefined);
      throw e;
    }
    m.GlobalWorkerOptions.workerPort = await radnik;
    return m as unknown as PdfJs;
  })().catch((e: unknown) => {
    obecanje = null;
    throw e;
  });
  return obecanje;
}
