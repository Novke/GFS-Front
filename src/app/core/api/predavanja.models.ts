import { GrupaInfo, PredmetInfo } from './reference.api';

/**
 * Red liste predavanja; ogleda backend `dto/predavanje/PredavanjeListItem`. `grupa` je `null` za stara predavanja bez
 * grupe (tada su `brojStudenata` i `brojStarijihPrisutnih` 0). `brojPrisutnih` su svi različiti studenti sa bar jednom
 * aktivnošću, uključujući `brojStarijihPrisutnih` (oni koji nisu iz grupe predavanja: ponovci, premešteni, bez grupe).
 * `brojStudenata` je broj studenata koji su sada u grupi predavanja.
 */
export interface PredavanjeListItem {
  id: number;
  rb: number;
  datum: string | null;
  tema: string | null;
  zavrseno: boolean | null;
  predmet: PredmetInfo;
  grupa: GrupaInfo | null;
  brojPrisutnih: number;
  brojStarijihPrisutnih: number;
  brojStudenata: number;
}

/** Status liste: `u-toku` -> `zavrseno=false`, `zavrseno` -> `zavrseno=true`, `null` = svi. */
export type StatusPredavanja = 'u-toku' | 'zavrseno';

/** Filteri liste predavanja; ime filtera je ime query parametra u URL-u. `od` i `do` su `YYYY-MM-DD`. */
export interface PredavanjaFilteri extends Record<string, string | number | boolean | null> {
  predmet: number | null;
  grupa: number | null;
  godina: number | null;
  status: StatusPredavanja | null;
  q: string | null;
  od: string | null;
  do: string | null;
}

/** Polja sorta koja backend prihvata za `predavanja/pretraga` (`PredavanjeService.SORT_POLJA`). */
export const PREDAVANJA_SORT_POLJA = ['datum', 'rb', 'tema'];

/** `POST predavanja/start`; datum je danas, a redni broj dodeljuje server. */
export interface StartPredavanjeCmd {
  predmetId: number;
  grupaId: number;
}

/** `PUT predavanja/{id}`: šalju se samo polja koja se menjaju. */
export interface UpdatePredavanjeCmd {
  rb?: number | null;
  datum?: string | null;
  tema?: string | null;
  posecenost?: number | null;
}

export type TipAktivnosti = 'PRISUSTVO' | 'ZADATAK' | 'SA_ZVEZDICOM';

export interface PredavanjeStudentInfo {
  id: number;
  ime: string;
  prezime: string;
  indeks: string;
}

export interface PredavanjeAktivnostInfo {
  id: number;
  student: PredavanjeStudentInfo;
  tip: TipAktivnosti;
  napomene: string | null;
}

/** Ogleda backend `PredavanjeDetails`: predmet ima samo naziv, grupa je `null` za stara predavanja bez grupe. */
export interface PredavanjeDetails {
  id: number;
  rb: number;
  datum: string | null;
  tema: string | null;
  posecenost: number | null;
  grupa: { id: number; naziv: string; godinaUpisa: number | null } | null;
  predmet: { naziv: string } | null;
  aktivnosti: PredavanjeAktivnostInfo[];
  zavrseno: boolean | null;
}
