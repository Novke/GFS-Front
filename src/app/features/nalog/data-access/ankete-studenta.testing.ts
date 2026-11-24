import { AnketaStudentu } from './ankete-studenta.models';

/** Anketa studenta za specove: otvorena, na času, bez roka i bez glasa; tri odgovora. */
export function anketaStudentu(id: number, izmene: Partial<AnketaStudentu> = {}): AnketaStudentu {
  return {
    id, pitanje: 'Da li vam treba pauza?', opcije: ['Da, 10 min', 'Da, 15 min', 'Ne'], viseOdgovora: false, publika: 'NA_CASU',
    rokMs: null, otvorena: true, mojGlas: null, rezultat: null, sadaMs: new Date(2026, 10, 24, 10, 40).getTime(), ...izmene,
  };
}
