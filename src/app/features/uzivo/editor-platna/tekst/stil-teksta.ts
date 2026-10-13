// Stil teksta u uređivaču (F12: stanje izbora i uvlačenje liste; F13 dodaje funkcije nad celim slojem za panel teksta).
import type { Polozaj, Poravnanje } from '../../data-access/platno.models';

/** Stil izbora u uređivaču teksta (panel teksta, F13); null = mešano (izbor obuhvata delove ili pasuse različitih vrednosti). */
export interface StanjeSelekcije {
  font: string | null; velicina: number | null; boja: string | null;
  podebljano: boolean | null; kurziv: boolean | null; podvuceno: boolean | null; precrtano: boolean | null;
  polozaj: Polozaj | null; poravnanje: Poravnanje | null; lista: 'ZNAK' | 'BROJ' | 'BEZ' | null; nivo: number | null;
  proredProcenat: number | null; razmakPre: number | null; razmakPosle: number | null;
}

/** Najviši nivo liste (0-8, kao PowerPoint). */
export const MAX_NIVO = 8;

/**
 * Uvlačenje stavke liste (odluka 18): `levo = 18 + 36 * nivo`, `prviRed = -18` (PowerPointovo telo 16:9: `marL` 228 600
 * EMU = 18 pt; viseća oznaka stoji u `-prviRed`).
 */
export function uvlacenjeListe(nivo: number): { levo: number; prviRed: number } {
  return { levo: 18 + 36 * nivo, prviRed: -18 };
}
