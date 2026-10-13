import type { Pasus, Platno } from '../data-access/platno.models';

/**
 * Katalog fontova platna: isti spisak kao `PlatnoPP.FONTOVI` na serveru. Pakete (@fontsource, OFL 1.1) učitava
 * `src/styles/_fontovi-platna.scss`. `zamenjuje` su sistemski fontovi iste metrike (uvezeni PPTX ih imenuje).
 */
export interface FontPlatna {
  naziv: string; css: string; zamenjuje: readonly string[];
  /** Širina razmaka (U+0020) u em, iz `hmtx` fonta (uvoz: znak liste "razmak" koji ne staje u viseći deo). */
  razmak: number;
}

export const FONTOVI_PLATNA: readonly FontPlatna[] = [
  { naziv: 'Carlito', css: "'Carlito', 'Calibri', sans-serif", zamenjuje: ['Calibri'], razmak: 0.22607 },
  { naziv: 'Caladea', css: "'Caladea', 'Cambria', serif", zamenjuje: ['Cambria'], razmak: 0.22 },
  { naziv: 'Arimo', css: "'Arimo', 'Arial', 'Liberation Sans', sans-serif", zamenjuje: ['Arial', 'Liberation Sans', 'Helvetica'], razmak: 0.27783 },
  { naziv: 'Tinos', css: "'Tinos', 'Times New Roman', 'Liberation Serif', serif", zamenjuje: ['Times New Roman', 'Liberation Serif'], razmak: 0.25 },
  { naziv: 'Cousine', css: "'Cousine', 'Courier New', 'Liberation Mono', monospace", zamenjuje: ['Courier New', 'Liberation Mono'], razmak: 0.6001 },
  { naziv: 'IBM Plex Sans', css: "'IBM Plex Sans', 'Arial', sans-serif", zamenjuje: [], razmak: 0.236 },
  { naziv: 'IBM Plex Mono', css: "'IBM Plex Mono', 'Courier New', monospace", zamenjuje: [], razmak: 0.6 },
  { naziv: 'Atkinson Hyperlegible', css: "'Atkinson Hyperlegible', 'Arial', sans-serif", zamenjuje: [], razmak: 0.28 },
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
