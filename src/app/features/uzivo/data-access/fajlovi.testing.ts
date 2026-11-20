import type { FajlPrezentacijeInfo } from '../../../shared/util/fajlovi';

/** Fajl prezentacije za specove (nastavnički spisak). */
export const fajlInfo = (izmene: Partial<FajlPrezentacijeInfo> = {}): FajlPrezentacijeInfo => ({
  id: 1, naziv: 'vezba.docx', vrsta: 'DOCX', velicina: 2048, prezentacijaId: 7, slajdId: null, slajdRb: null, rb: 1,
  kreirano: '2026-11-20T10:00:00', ...izmene,
});
