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
  /** Podsetnik studentima dan pre časa (`HH:mm:ss`), `null` kad je isključen; stariji backend ga ne šalje. */
  podsetnikVreme?: string | null;
  brojStavki: number;
}

export interface StavkaInfo {
  id: number;
  predmet: PredmetInfo;
  grupa: GrupaInfo;
  dan: number;
  pocetak: string;
  kraj: string;
  /** Otkazani termini stavke od danas (ISO datumi, rastuće); forma upozorava kad bi ih izmena ukinula. */
  otkazani?: string[];
}

export interface RasporedDetails {
  id: number;
  naziv: string;
  vaziOd: string;
  vaziDo: string;
  pragNajava: number;
  /** Podsetnik studentima dan pre časa (`HH:mm:ss`), `null` kad je isključen; stariji backend ga ne šalje. */
  podsetnikVreme?: string | null;
  stavke: StavkaInfo[];
  /** Koliko otkazanih termina od danas je izmena ukinula (samo odgovor na `PUT`; inače 0). */
  izgubljenaOtkazivanja?: number;
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
  /** Podsetnik dan pre časa (spec „Aplikacija i obaveštenja“ 6.1); `null` = pri upisu uključen, pri izmeni ne menja. */
  podsetnik?: boolean | null;
  /** `HH:mm`; `null` = pri upisu 18:00, pri izmeni ne menja. */
  podsetnikVreme?: string | null;
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
  /** „Obavesti studente (mejl i telefon)“ (server: izostavljeno = da). */
  posaljiMejl?: boolean;
}

export interface PromenaTerminaOdgovor {
  termin: TerminInfo;
  /** Koliko mejlova je stavljeno u red za slanje (0 bez promene, kad je slanje isključeno ili niko nema mejl). */
  obavesteno: number;
  /** Studenti sa mejlom koji poruku nisu dobili (pun red ili slanje nije podešeno); stariji server ga ne šalje. */
  neposlato?: number;
  /** Koliko push poruka je stavljeno u red (uređaji studenata); stariji server ga ne šalje. */
  pushPoslato?: number;
}

export const MAX_NAZIV = 100;
export const MAX_DANA = 400;
export const MAX_STAVKI = 50;
export const MAX_NAPOMENA = 200;
export const PODRAZUMEVANI_PRAG = 5;
/** Koliko dana pokazuje stranica termina (isto kao podrazumevano na serveru). */
export const DANA_TERMINA = 28;
