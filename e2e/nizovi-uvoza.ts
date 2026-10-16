// Nizovi po kojima e2e prepoznaje JS kod uvoza (PPTX i PDF) u buildu (bez zavisnosti: koriste ga i specovi javnih ruta).

/**
 * Nizovi koji postoje samo u kodu uvoza: `fflate` (poruka greške zip-a) i `OZNAKA_UVOZA` dijaloga
 * (`src/app/features/uzivo/uvoz-pptx/uvoz-pptx.dialog.ts`; `lenji-uvoz.spec.ts` proverava da je ista). JS fajl koji ih
 * sadrži je kod uvoza; glavni bundle i javne rute ga ne smeju učitati.
 */
export const NIZ_FFLATE = 'invalid zip data';
export const NIZ_UVOZA = 'gfs-uvoz-pptx';

/** Nizovi uvoza koje tekst JS fajla sadrži. */
export const nizoviUvoza = (tekst: string): string[] => [NIZ_FFLATE, NIZ_UVOZA].filter(n => tekst.includes(n));

/**
 * Uvoz PDF-a (faza 5d, Ugovor 6): `OZNAKA_UVOZA_PDF` dijaloga (`uvoz-pdf/uvoz-pdf.dialog.ts`), niz koji ima samo
 * biblioteka pdf.js (`pdf.mjs`) i niz koji ima samo njen radnik (`pdf.worker.mjs`); `lenji-pdf.spec.ts` proverava da su
 * pravi. Glavni bundle, stranica editora i javne rute ne smeju da učitaju nijedan.
 */
export const NIZ_UVOZA_PDF = 'gfs-uvoz-pdf';
export const NIZ_PDFJS = 'Setting up fake worker';
export const NIZ_PDFJS_RADNIK = 'Invalid PDF structure';

/** Nizovi uvoza PDF-a koje tekst JS fajla sadrži. */
export const nizoviPdf = (tekst: string): string[] => [NIZ_UVOZA_PDF, NIZ_PDFJS, NIZ_PDFJS_RADNIK].filter(n => tekst.includes(n));
