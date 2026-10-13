// Nizovi po kojima e2e prepoznaje kod editora platna u buildu (bez zavisnosti: koriste ga i specovi javnih ruta).

/** `OZNAKA_EDITORA_PLATNA` (`src/app/features/uzivo/editor-platna/oznake.ts`; `lenji-editor.spec.ts` proverava da je ista). */
export const NIZ_EDITORA = 'gfs-editor-platna';
/** `prosemirror-view` (4b). */
export const NIZ_PROSEMIRROR = 'ProseMirror-hideselection';
/** `mathlive` i `mathlive/ssr` (4b). */
export const NIZ_MATHLIVE = 'ML__latex';
/** `OZNAKA_FORMULE_EDITORA` (dijalog formule, 4b). */
export const NIZ_FORMULE_EDITORA = 'gfs-formula-editor';
export const NIZOVI_EDITORA = [NIZ_EDITORA, NIZ_PROSEMIRROR, NIZ_MATHLIVE, NIZ_FORMULE_EDITORA] as const;

/** Nizovi editora koje tekst JS fajla sadrži. */
export const nizoviEditora = (tekst: string): string[] => NIZOVI_EDITORA.filter(n => tekst.includes(n));
