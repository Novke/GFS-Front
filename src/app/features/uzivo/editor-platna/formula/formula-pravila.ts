// Pravila formule u editoru (F16, odluka 20): primena unosa dijaloga ili panela na FORMULA sloj. Ide u editor (panel,
// traka, koren) i u dijalog. Provera LaTeX-a pre čuvanja je u `provera-formule.ts`, koju uvozi samo dijalog.
import type { FormulaSloj, Poravnanje } from '../../data-access/platno.models';

/** Ono što dijalog vraća i panel menja. */
export interface FormulaUnos { latex: string; boja: string; velicina: number; poravnanje: Poravnanje; }

/**
 * Unos na sloj; slika izvora se uvek briše (spec 11: "otvori i sačuva"; i boja, veličina i poravnanje, jer bi slika iz
 * PowerPointa inače pokazivala staro). Isti unos na sloju bez slike vraća isti objekat: nema praznog koraka ni `PUT`-a.
 */
export function primeniFormulu(s: FormulaSloj, u: FormulaUnos): FormulaSloj {
  if (s.slikaIzvora === null && s.latex === u.latex && s.boja === u.boja && s.velicina === u.velicina
    && s.poravnanje === u.poravnanje) return s;
  return { ...s, latex: u.latex, boja: u.boja, velicina: u.velicina, poravnanje: u.poravnanje, slikaIzvora: null };
}

/** Unos iz postojećeg sloja (početak dijaloga). */
export const unosFormule = (s: FormulaSloj): FormulaUnos =>
  ({ latex: s.latex, boja: s.boja, velicina: s.velicina, poravnanje: s.poravnanje });
