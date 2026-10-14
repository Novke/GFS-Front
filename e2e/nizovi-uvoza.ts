// Nizovi po kojima e2e prepoznaje JS kod uvoza PPTX-a u buildu (bez zavisnosti: koriste ga i specovi javnih ruta).

/**
 * Nizovi koji postoje samo u kodu uvoza: `fflate` (poruka greške zip-a) i `OZNAKA_UVOZA` dijaloga
 * (`src/app/features/uzivo/uvoz-pptx/uvoz-pptx.dialog.ts`; `lenji-uvoz.spec.ts` proverava da je ista). JS fajl koji ih
 * sadrži je kod uvoza; glavni bundle i javne rute ga ne smeju učitati.
 */
export const NIZ_FFLATE = 'invalid zip data';
export const NIZ_UVOZA = 'gfs-uvoz-pptx';

/** Nizovi uvoza koje tekst JS fajla sadrži. */
export const nizoviUvoza = (tekst: string): string[] => [NIZ_FFLATE, NIZ_UVOZA].filter(n => tekst.includes(n));
