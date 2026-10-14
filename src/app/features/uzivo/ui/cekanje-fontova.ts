/*
 * Čekanje i učitavanje fontova kroz `document.fonts` (izdvojeno iz `preducitavanje.ts`, faza 5): bez uvoza, da
 * `formula-ucitavanje` (pa i `app-tekst-formule` na javnoj ruti telefona) ne vuče statički `preducitavanje`, `teme` i
 * `platno-fontovi` (podaci platna, oko 6 kB koje telefon ne koristi). `preducitavanje` ga ponovo izvozi.
 */

/** Znakovi za `document.fonts.load`: latinica i latin-ext (`unicode-range` deli fajlove; č ć đ š ž su u latin-ext). */
const UZORAK = 'AaZz09 čćđšž ČĆĐŠŽ';
const REZOVI = ['400', '700'];

export interface SkupFontova { load(font: string, tekst?: string): Promise<unknown>; }

export function skupFontova(): SkupFontova | null {
  const fonts = (document as Document & { fonts?: SkupFontova }).fonts;
  return typeof fonts?.load === 'function' ? fonts : null;
}

/** Normalan i podebljan rez fonta (kurziv se učita sam pri prvom crtanju). */
export function ucitajRezove(skup: SkupFontova, font: string): Promise<unknown>[] {
  return REZOVI.map((rez) => skup.load(`${rez} 32px "${font}"`, UZORAK));
}

/**
 * Čeka da se fontovi učitaju, najviše `maxMs`. Nikad ne odbija: greška učitavanja ili pregledač bez `document.fonts`
 * znači da se prikaz crta odmah (sa rezervnim fontom ili kad font stigne).
 */
export function sacekajFontove(fontovi: Iterable<string>, maxMs = 3000): Promise<void> {
  const skup = skupFontova();
  if (!skup) {
    return Promise.resolve();
  }
  return new Promise<void>((razresi) => {
    const tajmer = setTimeout(razresi, maxMs);
    void Promise.allSettled([...new Set(fontovi)].flatMap((f) => ucitajRezove(skup, f))).then(() => {
      clearTimeout(tajmer);
      razresi();
    });
  });
}
