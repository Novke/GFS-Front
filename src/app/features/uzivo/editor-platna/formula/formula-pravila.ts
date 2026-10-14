// Pravila formule u editoru (F16, odluka 5a i 20): provera LaTeX-a pre čuvanja i primena unosa dijaloga ili panela na
// FORMULA sloj. Bez biblioteka: proveru sintakse (`validateLatex` MathLive-a) daje pozivalac, pa ovaj fajl ide i u editor
// (panel, traka) i u lenji chunk dijaloga bez da ijedan od njih vuče MathLive.
import type { FormulaSloj, Poravnanje } from '../../data-access/platno.models';
import {
  MAX_DUBINA_FORMULE, MAX_KORENA_FORMULE, MAX_RASTEGLJIVIH_FORMULE, MAX_REDOVA_FORMULE, MAX_STRUKTURE_FORMULE,
  OPIS_ZABRANJENIH_KOMANDI, ZABRANJENE_KOMANDE, preTeskaFormula,
} from '../../ui/formula-komande';

/** Najviše znakova LaTeX-a (code point-i, kao server). */
export const MAX_LATEX = 5000;

/** Ono što dijalog vraća i panel menja. */
export interface FormulaUnos { latex: string; boja: string; velicina: number; poravnanje: Poravnanje; }

/**
 * Isti spisak kao statički prikaz (`ui/formula-komande.ts`, odluka 5a): jedno mesto, pa dijalog ne može da sačuva formulu
 * koju bi projektor crtao kao izvor. Uvoz je bez `mathlive/ssr` (ne `ui/formula-markup`, koji bi ga uvukao u editor).
 */
export const ZABRANJENE_KOMANDE_FORMULE = ZABRANJENE_KOMANDE;

export const PORUKA_PRAZNA = 'Formula je prazna.';
export const PORUKA_PRETESKA = `Formula je previše složena (najviše ${MAX_DUBINA_FORMULE} nivoa ugnježdavanja, ` +
  `${MAX_RASTEGLJIVIH_FORMULE} korena, zagrada \\left i matrica jedno u drugom, ${MAX_KORENA_FORMULE} korena, ` +
  `${MAX_STRUKTURE_FORMULE} razlomaka, indeksa i sličnih komandi i ${MAX_REDOVA_FORMULE} redova).`;
export const PORUKA_ZABRANJENA = `Formula koristi komandu koja nije dozvoljena (${OPIS_ZABRANJENIH_KOMANDI}) ili zapis ^^.`;

/**
 * Greška formule ili null: prazna, preduga (granica servera), zabranjena komanda (provera se tada ni ne zove), pa
 * provera sintakse (`validateLatex`; izuzetak je greška, ne pad).
 */
export function greskaFormule(latex: string, provera: (l: string) => readonly unknown[]): string | null {
  if (!latex.trim()) return PORUKA_PRAZNA;
  if ([...latex].length > MAX_LATEX) return 'Formula može imati najviše 5000 znakova.';
  if (ZABRANJENE_KOMANDE_FORMULE.test(latex)) return PORUKA_ZABRANJENA;
  if (preTeskaFormula(latex)) return PORUKA_PRETESKA;
  try {
    if (provera(latex).length > 0) return 'Formula ima grešku u LaTeX-u.';
  } catch {
    return 'Formula ima grešku u LaTeX-u.';
  }
  return null;
}

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
