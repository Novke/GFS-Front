import { GrupaInfo, PredmetInfo, TipTestaInfo } from '../../../core/api/reference.api';

/** Varijanta (grupa) testa; ogleda backend enum `TestGrupa`. Test sa `brojGrupa = n` ima prvih `n`. */
export type TestGrupa = 'A' | 'B' | 'C' | 'D';
export const VARIJANTE: readonly TestGrupa[] = ['A', 'B', 'C', 'D'];

/**
 * Red liste testova; ogleda backend `dto/test/TestListItem`. `prosek` i `procenatProlaznosti` (0-100) su `null` kad
 * nijedno polaganje nema upisane poene; prolaz je serverska oznaka `polozio = true`.
 */
export interface TestListItem {
  id: number;
  datum: string | null;
  tipTesta: TipTestaInfo | null;
  maxPoena: number | null;
  pregledan: boolean | null;
  predmet: PredmetInfo | null;
  grupa: GrupaInfo | null;
  brojPolaganja: number;
  prosek: number | null;
  procenatProlaznosti: number | null;
}

/** Status liste: `za-evidentiranje` -> `pregledan=false`, `evidentiran` -> `pregledan=true`, `null` = svi. */
export type StatusTesta = 'za-evidentiranje' | 'evidentiran';

/** Filteri liste testova; ime filtera je ime query parametra u URL-u. `tip` je id tipa testa; `od` i `do` su `YYYY-MM-DD`. */
export interface TestoviFilteri extends Record<string, string | number | boolean | null> {
  predmet: number | null;
  grupa: number | null;
  godina: number | null;
  status: StatusTesta | null;
  tip: number | null;
  od: string | null;
  do: string | null;
}

/** Polja sorta koja backend prihvata za `test/pretraga` (`TestService.SORT_POLJA`). */
export const TESTOVI_SORT_POLJA = ['datum', 'maxPoena'];

/**
 * Student u polaganju; ogleda backend `dto/student/StudentInfo`. `godina` je tamo primitivni `int`, pa student bez
 * godine upisa stiže kao `0` (prikazuje se bez godine).
 */
export interface TestStudentInfo {
  id: number;
  ime: string | null;
  prezime: string | null;
  indeks: string | null;
  godina: number | null;
  email?: string | null;
  brojTelefona?: string | null;
}

/** Ogleda `TestPolaganjeInfo`. Tek dodat ispitanik nema ni varijantu ni poene (`null`). */
export interface TestPolaganjeInfo {
  id: number;
  student: TestStudentInfo;
  grupa: TestGrupa | null;
  ostvareniPoeni: number | null;
  prepisivao: boolean | null;
  polozio: boolean | null;
  napomene: string | null;
}

export interface TestStatistikaPoGrupiInfo {
  grupa: TestGrupa;
  brojPolaganja: number;
  prosecniPoeni: number;
  procenatProlaznosti: number;
}

/** Ogleda `TestStatistikaInfo` (računa se samo u `GET test/{id}`; prolaz je oznaka `polozio`). */
export interface TestStatistikaInfo {
  ukupnoPolaganja: number;
  prosecniPoeni: number;
  minPoeni: number;
  maxPoeni: number;
  standardnaDevijacija: number;
  brojPolozenih: number;
  brojPalih: number;
  procenatProlaznosti: number;
  statistikaPoGrupi: TestStatistikaPoGrupiInfo[];
}

/** Ogleda `TestDetails`. `statistika` šalje samo `GET test/{id}`; izmene (`PUT`, `PATCH`, `POST`) je vraćaju kao `null`. */
export interface TestDetails {
  id: number;
  tipTesta: TipTestaInfo | null;
  predmet: PredmetInfo | null;
  grupa: GrupaInfo | null;
  datum: string | null;
  maxPoena: number | null;
  pregledan: boolean | null;
  grupe: TestGrupa[] | null;
  polaganja: TestPolaganjeInfo[] | null;
  statistika: TestStatistikaInfo | null;
}

/** Ogleda `TestInfo` (odgovor `POST test`). */
export interface TestInfo {
  id: number;
  tipTesta: TipTestaInfo | null;
  predmet: PredmetInfo | null;
  grupa: GrupaInfo | null;
  datum: string | null;
  maxPoena: number | null;
  grupe: TestGrupa[] | null;
  pregledan: boolean | null;
  posecenost: number | null;
}

/**
 * `POST test`. Tip je postojeći (`tipTestaId`); nov tip se prvo pravi kroz `POST test/tip` (server za
 * `tipTestaId = null` ne stiže do `novTipTesta`). `brojGrupa` 1-4 daje varijante A..D, `maxPoena` 1-100.
 */
export interface CreateTestCmd {
  tipTestaId: number;
  predmetId: number;
  grupaId: number;
  datum: string;
  brojGrupa: number;
  maxPoena: number;
}

/** `PUT test/{id}`: sva tri polja su obavezna. */
export interface UpdateTestCmd {
  datum: string;
  maxPoena: number;
  tipTestaId: number;
}

/** `PATCH test/{id}/polaganje`: student mora već biti dodat (`POST test/{id}/polaganje`). */
export interface EvidentirajPolaganjeCmd {
  studentId: number;
  grupa: TestGrupa;
  ostvareniPoeni: number;
  prepisivao: boolean;
  napomene: string | null;
}

/** `POST test/tip`: naziv najmanje 2 znaka. */
export interface CreateTipTestaCmd {
  naziv: string;
  predmetId: number;
}
