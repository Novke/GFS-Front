import { AnketaDetails, SablonAnkete } from './ankete.models';

/** Šabloni i ankete za testove (izmišljeni podaci). */
export function sablon(id: number, izmene: Partial<SablonAnkete> = {}): SablonAnkete {
  return {
    id, folderId: null, pitanje: `Pitanje ${id}?`, opcije: ['Da', 'Ne'], viseOdgovora: false, publika: 'NA_CASU', trajanjeSekunde: null,
    rokSati: null, precica: false, precicaRb: null, ikonica: null, boja: null, kratakNaziv: null, pokreniOdmah: false, rb: 0,
    brojPokretanja: 0, poslednjePokretanje: null, ...izmene,
  };
}

export function anketa(id: number, izmene: Partial<AnketaDetails> = {}): AnketaDetails {
  return {
    id, sablonId: null, pitanje: 'Da li vam treba pauza?', opcije: ['Da, 10 min', 'Da, 15 min', 'Ne'], viseOdgovora: false, publika: 'NA_CASU',
    predavanjeId: 5, grupaId: 4, grupaNaziv: 'GD-2026', predmetNaziv: 'UPR', otvoreno: '2026-11-24T10:40:00', rok: null, rokMs: null,
    zatvoreno: null, otvorena: true, rezultatPrikazan: false, izvor: 'NASTAVNIK', glasovi: [0, 0, 0], brojGlasalo: 0, brojMogucih: 27,
    sadaMs: 0, ...izmene,
  };
}
