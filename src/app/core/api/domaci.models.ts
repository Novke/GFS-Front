import { brojStudenataTekst } from '../../shared/util/mnozina';
import { GrupaInfo, PredmetInfo } from './reference.api';
import { TipAktivnosti } from './predavanja.models';

/** Predavanje na kome je domaći zadat (`DomaciPredavanjeRef`): id i redni broj, za link i prikaz "Predavanje 7". */
export interface DomaciPredavanjeRef {
  id: number;
  /** Backend vraća broj; `null` se podnosi (prikaz `—`). */
  rb: number | null;
}

/**
 * Red liste domaćih; ogleda backend `dto/domaci/DomaciListItem`. `grupa` i `predavanje` su `null` za stare domaće bez
 * njih (tada je `brojStudenata` 0). `brojUradjenih` su studenti sa evidentiranim urađenim domaćim (oslobođeni se ne
 * računaju), `brojStudenata` su studenti koji su sada u grupi domaćeg.
 */
export interface DomaciListItem {
  id: number;
  naslov: string | null;
  datum: string | null;
  pregledan: boolean | null;
  predmet: PredmetInfo;
  grupa: GrupaInfo | null;
  predavanje: DomaciPredavanjeRef | null;
  brojUradjenih: number;
  brojStudenata: number;
}

/** Status liste: `za-pregled` -> `pregledan=false` (uključuje stare redove bez vrednosti), `pregledan` -> `true`. */
export type StatusDomaceg = 'za-pregled' | 'pregledan';

/** Filteri liste domaćih; ime filtera je ime query parametra u URL-u. `od` i `do` su `YYYY-MM-DD`. */
export interface DomaciFilteri extends Record<string, string | number | boolean | null> {
  predmet: number | null;
  grupa: number | null;
  godina: number | null;
  status: StatusDomaceg | null;
  q: string | null;
  od: string | null;
  do: string | null;
}

/** Polja sorta koja backend prihvata za `domaci/pretraga` (`DomaciService.SORT_POLJA`). */
export const DOMACI_SORT_POLJA = ['datum', 'naslov'];

/**
 * `POST domaci`: predmet i grupa su obavezni, predavanje je opciono (`null`/izostavljeno). Server postavlja datum na
 * današnji, a naslov i opis ne prima: oni idu naknadno kroz `PUT domaci/{id}` (`UpdateDomaciCmd`).
 */
export interface DodajDomaciCmd {
  predmetId: number;
  grupaId: number;
  predavanjeId?: number | null;
}

/** Odgovor `POST domaci` (`DomaciId`). */
export interface DomaciId {
  id: number;
}

/** `PUT domaci/{id}`: server preskače `null` polja, pa se prazan opis šalje kao `''`. */
export interface UpdateDomaciCmd {
  naslov?: string;
  text?: string;
  datum?: string | null;
}

/** `POST domaci/evidentiraj`: jedan red (student) tabele; `bodovi` 0-10 (server: `@Min(0) @Max(10)`). */
export interface CreateUradjenDomaciCmd {
  studentId: number;
  domaciId: number;
  bodovi: number;
  napomene: string;
  prepisivanje: boolean;
}

/** Red tabele evidentiranja (`DomaciStudentiInfo`): student grupe, aktivnost na predavanju i urađeni domaći. */
export interface DomaciStudentiInfo {
  studentId: number;
  domaciId: number;
  ime: string | null;
  prezime: string | null;
  indeks: string | null;
  godina: number | null;
  /** Aktivnost na predavanju domaćeg; `null` = odsutan ili domaći bez predavanja. */
  tip: TipAktivnosti | null;
  predavanjaNapomene: string | null;
  /** `null` dok domaći nije evidentiran za studenta. */
  uradjenDomaciId: number | null;
  bodovi: number | null;
  uradjenDomaciNapomene: string | null;
  prepisivanje: boolean | null;
  oslobodjen: boolean | null;
}

export interface DomaciGrupaInfo {
  id: number;
  naziv: string;
  godinaUpisa: number | null;
}

/** Predavanje domaćeg u detalju (`DomaciPredavanjeInfo`). */
export interface DomaciPredavanjeInfo {
  id: number;
  rb: number | null;
  tema: string | null;
  datum: string | null;
}

/** Ogleda backend `DomaciDetails`; `grupa` i `predavanje` mogu biti `null` (stari domaći), a tada nema ni studenata. */
export interface DomaciDetails {
  id: number;
  predmet: PredmetInfo | null;
  naslov: string | null;
  text: string | null;
  datum: string | null;
  pregledan: boolean | null;
  grupa: DomaciGrupaInfo | null;
  predavanje: DomaciPredavanjeInfo | null;
  studenti: DomaciStudentiInfo[];
}

/** Podaci domaćeg (sve osim redova studenata, koji imaju svoje stanje u store-u). */
export type DomaciPodaci = Omit<DomaciDetails, 'studenti'>;

/** Naslov za prikaz; domaći bez naslova (nov ili star) dobija opis po predavanju. */
export function naslovDomaceg(d: { naslov: string | null; predavanje?: { rb: number | null } | null }): string {
  const n = d.naslov?.trim();
  if (n) {
    return n;
  }
  const rb = d.predavanje?.rb;
  return rb !== null && rb !== undefined ? `Domaći sa predavanja ${rb}` : 'Domaći bez naslova';
}

/** `1 student`, `2 studenta`, `5 studenata` (isto kao `brojStudenataTekst`). */
export const brojStudenata = brojStudenataTekst;
