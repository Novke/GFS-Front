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

/** Samo ceo `mathlive` (`<math-field>` i virtuelna tastatura), ne `mathlive/ssr` (0.111.1: 2 prema 0 pojavljivanja; 5a). */
export const NIZ_MATHLIVE_CEO = 'math-virtual-keyboard';
/** Samo studentska stranica (`javno/uzivo-student.page.ts`, ekran "tabla"; `lenji-formule.spec.ts` proverava izvor). */
export const NIZ_STUDENTA = 'Gledaj u tablu';
/**
 * Javna ruta ovo nikad ne učitava (5a): `ML__latex` sme samo kao `mathlive/ssr` (formula u tekstu pitanja ili opcije),
 * bez `NIZ_MATHLIVE_CEO`; kod editora platna, ProseMirror i dijalog formule nikad.
 */
export const NIZOVI_ZABRANJENI_JAVNO = [NIZ_EDITORA, NIZ_PROSEMIRROR, NIZ_FORMULE_EDITORA, NIZ_MATHLIVE_CEO] as const;

/** Nizovi iz `NIZOVI_ZABRANJENI_JAVNO` koje tekst JS fajla sadrži. */
export const zabranjeniJavno = (tekst: string): string[] => NIZOVI_ZABRANJENI_JAVNO.filter(n => tekst.includes(n));
