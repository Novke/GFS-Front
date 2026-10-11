import type { Pasus, Platno } from '../data-access/platno.models';

/**
 * Katalog fontova platna: isti spisak kao `PlatnoPP.FONTOVI` na serveru. Pakete (@fontsource, OFL 1.1) učitava
 * `src/styles/_fontovi-platna.scss`. `zamenjuje` su sistemski fontovi iste metrike (uvezeni PPTX ih imenuje).
 */
export interface FontPlatna { naziv: string; css: string; zamenjuje: readonly string[]; }

export const FONTOVI_PLATNA: readonly FontPlatna[] = [
  { naziv: 'Carlito', css: "'Carlito', 'Calibri', sans-serif", zamenjuje: ['Calibri'] },
  { naziv: 'Caladea', css: "'Caladea', 'Cambria', serif", zamenjuje: ['Cambria'] },
  { naziv: 'Arimo', css: "'Arimo', 'Arial', 'Liberation Sans', sans-serif", zamenjuje: ['Arial', 'Liberation Sans', 'Helvetica'] },
  { naziv: 'Tinos', css: "'Tinos', 'Times New Roman', 'Liberation Serif', serif", zamenjuje: ['Times New Roman', 'Liberation Serif'] },
  { naziv: 'Cousine', css: "'Cousine', 'Courier New', 'Liberation Mono', monospace", zamenjuje: ['Courier New', 'Liberation Mono'] },
  { naziv: 'IBM Plex Sans', css: "'IBM Plex Sans', 'Arial', sans-serif", zamenjuje: [] },
  { naziv: 'IBM Plex Mono', css: "'IBM Plex Mono', 'Courier New', monospace", zamenjuje: [] },
  { naziv: 'Atkinson Hyperlegible', css: "'Atkinson Hyperlegible', 'Arial', sans-serif", zamenjuje: [] },
];

const PODRAZUMEVANI = FONTOVI_PLATNA[0];

/** CSS `font-family` za naziv iz dokumenta; nepoznat font se prikazuje kao Carlito. */
export function cssFonta(naziv: string): string {
  return (FONTOVI_PLATNA.find((f) => f.naziv === naziv) ?? PODRAZUMEVANI).css;
}

/** Svi `deo.font` u tekstu i ćelijama tabela (za unapred učitavanje fontova pre prikaza). */
export function fontoviPlatna(p: Platno): Set<string> {
  const fontovi = new Set<string>();
  const dodaj = (pasusi: readonly Pasus[]) => {
    for (const pasus of pasusi) for (const deo of pasus.delovi) fontovi.add(deo.font);
  };
  for (const sloj of p.slojevi) {
    if (sloj.tip === 'TEKST') dodaj(sloj.pasusi);
    else if (sloj.tip === 'TABELA') for (const red of sloj.celije) for (const c of red) dodaj(c.pasusi);
  }
  return fontovi;
}
