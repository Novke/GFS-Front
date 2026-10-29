import { GrupaInfo, PredmetInfo } from '../../../core/api/reference.api';

/**
 * Raspored časova i termini (nastavnik, `api/rasporedi*`; spec najave odsustva, odeljci 3 i 6). Datumi `yyyy-MM-dd`,
 * vremena sa servera `HH:mm:ss` (šalje se `HH:mm`), `dan` je ISO dan u nedelji (1 = ponedeljak ... 7 = nedelja).
 */
export interface RasporedInfo {
  id: number;
  naziv: string;
  vaziOd: string;
  vaziDo: string;
  pragNajava: number;
  brojStavki: number;
}

export interface StavkaInfo {
  id: number;
  predmet: PredmetInfo;
  grupa: GrupaInfo;
  dan: number;
  pocetak: string;
  kraj: string;
}

export interface RasporedDetails {
  id: number;
  naziv: string;
  vaziOd: string;
  vaziDo: string;
  pragNajava: number;
  stavke: StavkaInfo[];
}

/** Stavka u zahtevu; `id` postojeće zadržava njene najave i otkazivanja dok se ne promene predmet ili grupa. */
export interface StavkaCmd {
  id: number | null;
  predmetId: number;
  grupaId: number;
  dan: number;
  pocetak: string;
  kraj: string;
}

export interface RasporedCmd {
  naziv: string;
  vaziOd: string;
  vaziDo: string;
  pragNajava: number;
  stavke: StavkaCmd[];
}

/** Ko je najavio odsustvo (samo nastavniku). */
export interface NajavaInfo {
  studentId: number;
  ime: string | null;
  prezime: string | null;
  indeks: string | null;
  godina: number | null;
  razlog: string | null;
  vreme: string;
}

export interface TerminInfo {
  stavkaId: number;
  rasporedId: number;
  datum: string;
  pocetak: string;
  kraj: string;
  predmet: PredmetInfo;
  grupa: GrupaInfo;
  otkazan: boolean;
  napomena: string | null;
  /** Termin je počeo (ili prošao): ne može se otkazati ni vratiti. */
  poceo: boolean;
  brojNajava: number;
  prag: number;
  najave: NajavaInfo[];
  /** Predavanje istog predmeta, grupe i datuma, ako postoji. */
  predavanjeId: number | null;
}

export interface TerminCmd {
  stavkaId: number;
  datum: string;
  napomena?: string | null;
}

export interface PromenaTerminaOdgovor {
  termin: TerminInfo;
  /** Koliko studenata je dobilo mejl (0 kad mejl nije podešen ili je otkazivanje samo izmenilo napomenu). */
  obavesteno: number;
}

export const MAX_NAZIV = 100;
export const MAX_DANA = 400;
export const MAX_STAVKI = 50;
export const MAX_NAPOMENA = 200;
export const PODRAZUMEVANI_PRAG = 5;
/** Koliko dana pokazuje stranica termina (isto kao podrazumevano na serveru). */
export const DANA_TERMINA = 28;
