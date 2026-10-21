// Provera LaTeX-a pre čuvanja (F16, odluka 5a i 20): granica znakova, zabranjene komande, strukturni trošak i sintaksa
// (`validateLatex` MathLive-a daje pozivalac). Uvozi je SAMO dijalog formule (lenji chunk), pa ni ovaj fajl ni
// `ui/formula-komande` (spisak i `trosakFormule`) nisu u chunk-u editora (recenzija F16, m4: tesan budžet editora).
import {
  MAX_CELIJA_FORMULE, MAX_DUBINA_FORMULE, MAX_KOLONA_FORMULE, MAX_KORENA_FORMULE, MAX_RASTEGLJIVIH_FORMULE, MAX_REDOVA_FORMULE,
  MAX_STRUKTURE_FORMULE, OPIS_ZABRANJENIH_KOMANDI, ZABRANJENE_KOMANDE, preTeskaFormula,
} from '../../ui/formula-komande';

/** Najviše znakova LaTeX-a (code point-i, kao server). */
export const MAX_LATEX = 5000;

/**
 * Isti spisak kao statički prikaz (`ui/formula-komande.ts`, odluka 5a): jedno mesto, pa dijalog ne može da sačuva formulu
 * koju bi projektor crtao kao izvor. Uvoz je bez `mathlive/ssr` (ne `ui/formula-markup`, koji bi ga uvukao u dijalog).
 */
export const ZABRANJENE_KOMANDE_FORMULE = ZABRANJENE_KOMANDE;

export const PORUKA_PRAZNA = 'Formula je prazna.';
export const PORUKA_PRETESKA = `Formula je previše složena (najviše ${MAX_DUBINA_FORMULE} nivoa ugnježdavanja, ` +
  `${MAX_RASTEGLJIVIH_FORMULE} korena, zagrada \\left i matrica jedno u drugom, ${MAX_KORENA_FORMULE} korena, ` +
  `${MAX_STRUKTURE_FORMULE} razlomaka, indeksa i sličnih komandi, ${MAX_REDOVA_FORMULE} redova, ${MAX_KOLONA_FORMULE} kolona ` +
  `u redu matrice i ${MAX_CELIJA_FORMULE} ćelija matrica).`;
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
